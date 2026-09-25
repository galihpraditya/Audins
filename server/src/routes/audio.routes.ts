import { Router, Request, Response } from "express"

import multer from "multer"

import path from "node:path"

import fs from "node:fs"

import { Readable } from "node:stream"

import { pipeline } from "node:stream/promises"

import { v4 as uuidv4 } from "uuid"

import {
  BASE_URL,
  MAX_FILE_BYTES,
  MAX_GLOBAL_STORAGE_BYTES,
  UPLOADS_DIR,
  signMediaToken,
} from "../config.js"

import { uploadAudioToR2, isR2Enabled } from "../services/r2.service.js"

import {
  uploadAudioToSupabase,
  isSupabaseEnabled,
} from "../services/supabase.service.js"

import {
  getAllDocuments,
  getDocumentById,
  getDocumentByShareId,
  incrementShareViewCount,
  saveDocument,
  deleteDocument,
  deleteDocumentAudio,
  renameDocument,
  duplicateDocument,
  calculateStorageUsed,
} from "../services/storage.service.js"

import { getLocalUserIdByEmail } from "../services/auth.service.js"

import {
  transcribeAudioWithGroq,
  summarizeTranscriptWithGroq,
} from "../services/groq.service.js"

import {
  checkPortfolioRateLimit,
  getRateLimitStatus,
  refundRateLimit,
} from "../middleware/rateLimit.middleware.js"

import {
  FullDocument,
  TranscriptEntry,
  PublicSharedDocument,
  AISummary,
} from "../types/index.js"

import {
  authenticate,
  AuthenticatedRequest,
} from "../middleware/auth.middleware.js"

const router = Router()

router.use(authenticate)

// Number of in-flight background AI pipelines. Used by the graceful shutdown

// handler to wait for jobs before exiting.

let activeBackgroundJobs = 0

export function getActiveBackgroundJobCount(): number {
  return activeBackgroundJobs
}

// Configure Multer audio upload storage

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()

    cb(null, `${Date.now()}-${uuidv4().substring(0, 8)}${ext}`)
  },
})

const upload = multer({
  storage,

  limits: { fileSize: MAX_FILE_BYTES },

  fileFilter: (req, file, cb) => {
    const allowedExtensions = /\.(mp3|wav|m4a|mp4|webm|flac|ogg|opus|aac)$/i

    const allowedMimeTypes = /^(audio\/|video\/mp4|video\/webm)/i

    const extMatch = allowedExtensions.test(path.extname(file.originalname))

    const mimeMatch = allowedMimeTypes.test(file.mimetype)

    if (extMatch && mimeMatch) {
      cb(null, true)
    } else {
      cb(
        new Error(
          "Unsupported file format. Please upload a valid audio or video container (MP3, WAV, M4A, MP4, WebM, FLAC, OGG, OPUS, AAC).",
        ),
      )
    }
  },
})

// Ensure the uploads dir exists before Multer writes to it.

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// GET /api/v1 - API Index & Documentation

router.get("/", (req: Request, res: Response) => {
  res.json({
    service: "Audins AI Audio Intelligence API v1",

    status: "online",

    endpoints: {
      health: "GET /health",

      documents: "GET /api/v1/documents",

      documentDetail: "GET /api/v1/documents/:id",

      uploadAudio: "POST /api/v1/audio/upload",

      rateLimitStatus: "GET /api/v1/settings/rate-limit",
    },
  })
})

// GET /api/v1/settings/rate-limit - Check remaining demo quota

router.get("/settings/rate-limit", async (req: Request, res: Response) => {
  const status = await getRateLimitStatus(req)

  res.json(status)
})

// Helper to extract string param or header safely

function getHeaderKey(
  header: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(header)) return header[0]

  return header
}

function getParamId(param: string | string[]): string {
  if (Array.isArray(param)) return param[0]

  return param
}

/**
 * Resolves the session user or responds 401 and returns null.
 */

function requireUser(req: Request, res: Response): string | null {
  const authReq = req as AuthenticatedRequest

  const userId = authReq.userId || getHeaderKey(req.headers["x-user-session"])

  if (!userId) {
    res
      .status(401)
      .json({ error: "Missing authentication or x-user-session header" })

    return null
  }

  return userId
}

/**
 * Fetches a document and enforces ownership. Responds 404 (without revealing
 * whether the id exists for another user) and returns null on any failure.
 */

async function requireOwnedDocument(
  req: Request,

  res: Response,
): Promise<FullDocument | null> {
  const userId = requireUser(req, res)

  if (!userId) return null

  const authReq = req as AuthenticatedRequest
  const userEmail = authReq.user?.email

  const docId = getParamId(req.params.id)

  let doc: FullDocument | undefined

  try {
    doc = await getDocumentById(docId)
  } catch (error) {
    console.error(`Failed to fetch document ${docId}:`, error)

    res.status(500).json({ error: "Failed to fetch document" })

    return null
  }

  let localUserId: string | null = null
  if (userEmail) {
    localUserId = getLocalUserIdByEmail(userEmail)
  }

  if (
    !doc ||
    (doc.userId &&
      doc.userId !== userId &&
      (!localUserId || doc.userId !== localUserId))
  ) {
    res.status(404).json({ error: "Document not found" })

    return null
  }

  // If document was owned by historical local user ID, auto-migrate to current authenticated ID
  if (
    doc.userId &&
    localUserId &&
    doc.userId === localUserId &&
    doc.userId !== userId
  ) {
    doc.userId = userId
    void saveDocument(doc).catch(() => {})
  }

  return doc
}

// GET /api/v1/documents - List documents owned by the session user

router.get("/documents", async (req: Request, res: Response) => {
  try {
    const userId = requireUser(req, res)

    if (!userId) return

    const authReq = req as AuthenticatedRequest
    const userEmail = authReq.user?.email

    const docs = await getAllDocuments(userId, userEmail)

    res.json(docs)
  } catch (error) {
    console.error("Failed to list documents:", error)

    res.status(500).json({ error: "Failed to fetch documents" })
  }
})

// GET /api/v1/documents/:id - Get single document details

router.get("/documents/:id", async (req: Request, res: Response) => {
  const doc = await requireOwnedDocument(req, res)

  if (!doc) return

  res.json(doc)
})

// POST /api/v1/audio/upload - Upload file and process with Groq AI

router.post(
  "/audio/upload",

  checkPortfolioRateLimit,

  (req: Request, res: Response, next: import("express").NextFunction) => {
    let hasRefunded = false

    const refundOnce = async () => {
      if (!hasRefunded) {
        hasRefunded = true

        await refundRateLimit(req)
      }
    }

    // 'close' without 'end' indicates an aborted request ('aborted' is deprecated).

    req.on("close", () => {
      if (!res.writableEnded) {
        console.log("Client aborted upload. Refunding rate limit.")

        void refundOnce()
      }
    })

    upload.single("file")(req, res, async (err) => {
      if (err) {
        await refundOnce()

        return res.status(400).json({ error: err.message })
      }

      next()
    })
  },

  async (req: Request, res: Response) => {
    // Generous but bounded socket timeout for long uploads/cloud copies.

    if (req.socket) req.socket.setTimeout(15 * 60 * 1000)

    try {
      const file = req.file

      const userId = requireUser(req, res)

      if (!userId) {
        if (file) await fs.promises.unlink(file.path).catch(() => {})

        return
      }

      const customApiKey = getHeaderKey(req.headers["x-groq-api-key"])

      if (!file) {
        await refundRateLimit(req)

        res.status(400).json({ error: "No audio file provided" })

        return
      }

      // Check global storage limit (5GB)

      const globalStorageUsed = await calculateStorageUsed()

      if (globalStorageUsed + file.size > MAX_GLOBAL_STORAGE_BYTES) {
        await refundRateLimit(req)

        await fs.promises.unlink(file.path).catch(() => {})

        res.status(507).json({
          error:
            "Global storage limit (5GB) reached. Mitigating storage abuse risks.",
        })

        return
      }

      // Check per-user storage limit (500MB)

      const storageUsed = await calculateStorageUsed(userId)

      if (storageUsed + file.size > MAX_FILE_BYTES) {
        await refundRateLimit(req)

        await fs.promises.unlink(file.path).catch(() => {})

        res.status(507).json({
          error: "Storage limit exceeded (500MB). Please delete some files.",
        })

        return
      }

      const docId = `doc-${uuidv4().substring(0, 8)}`

      const now = new Date()

      const durationStr = req.body.duration || "0m 0s"

      const durationSec = req.body.durationSec
        ? parseInt(req.body.durationSec, 10)
        : 0

      // Signed local media URL fallback. The token makes bare filename knowledge
      // useless; expiry matches the 7-day media retention window plus a grace day.
      const serverAudioUrl = buildSignedLocalUrl(
        path.basename(file.path),
        now.getTime() + 8 * 24 * 60 * 60 * 1000,
      )

      const newDoc: FullDocument = {
        id: docId,
        name: file.originalname,
        date: now.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        duration: durationStr,
        durationSec: durationSec,
        status: "Processing",
        createdAt: now.toISOString(),
        audioUrl: serverAudioUrl,
        transcripts: [],
        userId: userId,
        sizeBytes: file.size,
      }

      await saveDocument(newDoc)

      // Immediately return 202 Accepted to the frontend for background processing.
      // Cloud storage upload and AI transcription run asynchronously in the background.
      res.status(202).json(newDoc)

      // Background Processing Task (Cloud Storage + Whisper + Summary)
      activeBackgroundJobs += 1
      ;(async () => {
        let isCloudStored = false
        try {
          // Check if document was deleted immediately after upload
          const initialCheck = await getDocumentById(docId)
          if (!initialCheck) {
            console.log(`Document ${docId} was deleted before processing started. Aborting.`)
            await fs.promises.unlink(file.path).catch(() => {})
            return
          }

          // 1. Offload to Cloud Storage (R2 / Supabase) asynchronously
          let cloudUrl: string | null = null
          try {
            if (isR2Enabled()) {
              cloudUrl = await uploadAudioToR2(
                file.path,
                path.basename(file.path),
                file.mimetype,
              )
              if (cloudUrl) isCloudStored = true
            } else if (isSupabaseEnabled()) {
              cloudUrl = await uploadAudioToSupabase(
                file.path,
                path.basename(file.path),
                file.mimetype,
              )
              if (cloudUrl) isCloudStored = true
            }
          } catch (storageErr) {
            console.warn(
              "Background cloud upload failed, continuing with local audio file:",
              storageErr,
            )
          }

          if (cloudUrl) {
            const docWithCloud = await getDocumentById(docId)
            if (docWithCloud) {
              docWithCloud.audioUrl = cloudUrl
              await saveDocument(docWithCloud)
            } else {
              await fs.promises.unlink(file.path).catch(() => {})
              return
            }
          }

          // 2. Transcribe audio with Groq Whisper
          const result = await transcribeAudioWithGroq(file.path, customApiKey)

          const fullText = result.entries.map((t) => t.text).join(" ")

          // 3. Generate summary with Groq LLM
          let summary: AISummary | undefined
          if (fullText.trim()) {
            summary = await summarizeTranscriptWithGroq(
              fullText,
              file.originalname,
              customApiKey,
            )
          }

          // 4. Concurrency Guard: fetch latest document before saving to avoid
          // overwriting user modifications (such as rename, share settings) or
          // resurrecting a document deleted while processing.
          const latestDoc = await getDocumentById(docId)
          if (!latestDoc) {
            console.log(
              `Document ${docId} was deleted while AI was processing. Skipping save.`,
            )
            return
          }

          latestDoc.transcripts = result.entries
          if (summary) latestDoc.summary = summary
          latestDoc.status = "Completed"

          if (result.failedChunks > 0) {
            latestDoc.warnings = [
              `${result.failedChunks} of ${result.totalChunks} audio segments failed to transcribe; this transcript may be incomplete.`,
            ]
          } else {
            latestDoc.warnings = undefined
          }

          await saveDocument(latestDoc)
        } catch (error) {
          console.error(
            "Background AI processing failed for doc:",
            docId,
            error,
          )

          try {
            const latestDoc = await getDocumentById(docId)
            if (latestDoc) {
              latestDoc.status = "Failed"
              latestDoc.warnings = [
                ...(latestDoc.warnings || []),
                error instanceof Error ? error.message : "AI processing failed",
              ]
              await saveDocument(latestDoc)
            }
          } catch (saveErr) {
            console.error("Failed to mark document as Failed:", saveErr)
          }
        } finally {
          activeBackgroundJobs -= 1

          // Only cleanup local file if it was successfully offloaded to cloud storage
          if (isCloudStored) {
            await fs.promises.unlink(file.path).catch(() => {})
          }
        }
      })()
    } catch (error) {
      console.error("Upload processing error:", error)

      res.status(500).json({ error: "Failed to process audio" })
    }
  },
)

function buildSignedLocalUrl(fileName: string, expiresAtMs: number): string {
  const token = signMediaToken(fileName, expiresAtMs)

  return `${BASE_URL}/uploads/${fileName}?v=${expiresAtMs}&t=${token}`
}

// POST /api/v1/documents/:id/summarize - Re-summarize a document

router.post(
  "/documents/:id/summarize",

  checkPortfolioRateLimit,

  async (req: Request, res: Response) => {
    const doc = await requireOwnedDocument(req, res)

    if (!doc) return

    try {
      const customApiKey = getHeaderKey(req.headers["x-groq-api-key"])

      if (!doc.transcripts || doc.transcripts.length === 0) {
        res.status(400).json({ error: "No transcript available to summarize" })

        return
      }

      const fullText = doc.transcripts

        .map((t: TranscriptEntry) => t.text)

        .join(" ")

      const customPrompt = req.body?.customPrompt

      const summary = await summarizeTranscriptWithGroq(
        fullText,

        doc.name,

        customApiKey,

        undefined,

        customPrompt,
      )

      doc.summary = summary

      await saveDocument(doc)

      res.json(doc)
    } catch (error) {
      console.error("Summarize error:", error)

      res.status(500).json({ error: "Failed to summarize transcript" })
    }
  },
)

// PATCH /api/v1/documents/:id - Rename document

router.patch("/documents/:id", async (req: Request, res: Response) => {
  const doc = await requireOwnedDocument(req, res)

  if (!doc) return

  try {
    const { name } = req.body

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "New document name is required" })

      return
    }

    const updated = await renameDocument(doc.id, name.trim())

    if (!updated) {
      res.status(404).json({ error: "Document not found" })

      return
    }

    res.json(updated)
  } catch (error) {
    console.error("Rename error:", error)

    res.status(500).json({ error: "Failed to rename document" })
  }
})

// PATCH /api/v1/documents/:id/summary - Edit summary

router.patch("/documents/:id/summary", async (req: Request, res: Response) => {
  const doc = await requireOwnedDocument(req, res)

  if (!doc) return

  try {
    const { summary } = req.body

    if (!summary) {
      res.status(400).json({ error: "Summary data is required" })

      return
    }

    doc.summary = summary

    await saveDocument(doc)

    res.json(doc)
  } catch (error) {
    console.error("Summary update error:", error)

    res.status(500).json({ error: "Failed to update summary" })
  }
})

// POST /api/v1/documents/:id/duplicate - Duplicate document

router.post("/documents/:id/duplicate", async (req: Request, res: Response) => {
  const doc = await requireOwnedDocument(req, res)

  if (!doc) return

  try {
    const copy = await duplicateDocument(doc.id)

    if (!copy) {
      res.status(404).json({ error: "Document not found" })

      return
    }

    res.status(201).json(copy)
  } catch (error) {
    console.error("Duplicate error:", error)

    res.status(500).json({ error: "Failed to duplicate document" })
  }
})

// PUT /api/v1/documents/:id/share - Update share settings

router.put("/documents/:id/share", async (req: Request, res: Response) => {
  const doc = await requireOwnedDocument(req, res)

  if (!doc) return

  try {
    const {
      isPublic,

      includeAudio = true,

      includeTranscript = true,

      includeSummary = true,

      regenerateShareId = false,
    } = req.body

    let shareId = doc.shareSettings?.shareId

    if (!shareId || regenerateShareId) {
      shareId = `sh_${uuidv4().replace(/-/g, "").substring(0, 10)}`
    }

    doc.shareSettings = {
      isPublic: Boolean(isPublic),

      shareId,

      includeAudio: Boolean(includeAudio),

      includeTranscript: Boolean(includeTranscript),

      includeSummary: Boolean(includeSummary),

      createdAt: doc.shareSettings?.createdAt || new Date().toISOString(),

      updatedAt: new Date().toISOString(),

      viewCount: doc.shareSettings?.viewCount || 0,
    }

    await saveDocument(doc)

    res.json(doc)
  } catch (error) {
    console.error("Share settings error:", error)

    res.status(500).json({ error: "Failed to update share settings" })
  }
})

// GET /api/v1/shared/:shareId - Public endpoint to retrieve shared document

router.get("/shared/:shareId", async (req: Request, res: Response) => {
  try {
    const shareId = getParamId(req.params.shareId)

    const doc = await getDocumentByShareId(shareId)

    if (!doc || !doc.shareSettings || !doc.shareSettings.isPublic) {
      res
        .status(404)
        .json({
          error: "Shared document not found or sharing has been disabled",
        })

      return
    }

    // Increment views asynchronously

    void incrementShareViewCount(shareId)

    const hasAudio = Boolean(doc.audioUrl && doc.audioUrl !== "Expired")

    const canIncludeAudio = hasAudio && doc.shareSettings.includeAudio

    const publicDoc: PublicSharedDocument = {
      shareId: doc.shareSettings.shareId,

      name: doc.name,

      date: doc.date,

      duration: doc.duration,

      durationSec: doc.durationSec,

      hasAudio: canIncludeAudio,

      audioStreamUrl: canIncludeAudio
        ? `/api/v1/shared/${shareId}/audio`
        : undefined,

      includeAudio: doc.shareSettings.includeAudio,

      includeTranscript: doc.shareSettings.includeTranscript,

      includeSummary: doc.shareSettings.includeSummary,

      summary: doc.shareSettings.includeSummary ? doc.summary : undefined,

      transcripts: doc.shareSettings.includeTranscript
        ? doc.transcripts
        : undefined,

      createdAt: doc.createdAt,

      viewCount: (doc.shareSettings.viewCount || 0) + 1,
    }

    res.json(publicDoc)
  } catch (error) {
    console.error("Fetch shared doc error:", error)

    res.status(500).json({ error: "Failed to fetch shared document" })
  }
})

// GET /api/v1/shared/:shareId/audio - Public endpoint to stream shared audio with Range support

router.get("/shared/:shareId/audio", async (req: Request, res: Response) => {
  try {
    const shareId = getParamId(req.params.shareId)

    const doc = await getDocumentByShareId(shareId)

    if (
      !doc ||
      !doc.shareSettings ||
      !doc.shareSettings.isPublic ||
      !doc.shareSettings.includeAudio
    ) {
      res.status(404).json({ error: "Audio not accessible or not shared" })

      return
    }

    if (!doc.audioUrl || doc.audioUrl === "Expired") {
      res.status(404).json({ error: "Audio file is no longer available" })

      return
    }

    // Local file handling (supports HTTP 206 Partial Content automatically via res.sendFile)

    if (doc.audioUrl.includes("/uploads/")) {
      const localBasename = path.basename(doc.audioUrl.split("?")[0])

      const localFilePath = path.join(UPLOADS_DIR, localBasename)

      if (fs.existsSync(localFilePath)) {
        res.sendFile(localFilePath)

        return
      }
    }

    // Remote cloud storage proxy with Range support

    const rangeHeader = req.headers.range

    const fetchHeaders: HeadersInit = {}

    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader
    }

    const controller = new AbortController()

    const connectTimeout = setTimeout(() => controller.abort(), 30_000)

    let audioRes: globalThis.Response

    try {
      audioRes = await fetch(doc.audioUrl, {
        headers: fetchHeaders,

        signal: controller.signal,
      })
    } finally {
      clearTimeout(connectTimeout)
    }

    if (!audioRes.ok && audioRes.status !== 206) {
      res.redirect(doc.audioUrl)

      return
    }

    res.status(audioRes.status)

    const contentType = audioRes.headers.get("content-type") || "audio/mpeg"

    res.setHeader("Content-Type", contentType)

    const acceptRanges = audioRes.headers.get("accept-ranges")

    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges)

    const contentRange = audioRes.headers.get("content-range")

    if (contentRange) res.setHeader("Content-Range", contentRange)

    const contentLength = audioRes.headers.get("content-length")

    if (contentLength) res.setHeader("Content-Length", contentLength)

    if (audioRes.body) {
      const nodeStream = Readable.fromWeb(
        audioRes.body as import("node:stream/web").ReadableStream,
      )

      await pipeline(nodeStream, res)
    } else {
      res.end()
    }
  } catch (error) {
    console.error("Shared audio stream error:", error)

    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream shared audio" })
    } else {
      res.destroy()
    }
  }
})

// POST /api/v1/shared/:shareId/duplicate - Clone shared doc to user workspace

router.post(
  "/shared/:shareId/duplicate",
  async (req: Request, res: Response) => {
    const userId = requireUser(req, res)

    if (!userId) return

    try {
      const shareId = getParamId(req.params.shareId)

      const doc = await getDocumentByShareId(shareId)

      if (!doc || !doc.shareSettings || !doc.shareSettings.isPublic) {
        res.status(404).json({ error: "Shared document not found" })

        return
      }

      const newId = `doc-${uuidv4().substring(0, 8)}`

      const clonedDoc: FullDocument = {
        ...JSON.parse(JSON.stringify(doc)),

        id: newId,

        name: `${doc.name} (Shared Copy)`,

        userId: userId,

        createdAt: new Date().toISOString(),

        shareSettings: undefined,
      }

      if (!doc.shareSettings.includeSummary) clonedDoc.summary = undefined

      if (!doc.shareSettings.includeTranscript) clonedDoc.transcripts = []

      if (!doc.shareSettings.includeAudio) {
        clonedDoc.audioUrl = undefined

        clonedDoc.sizeBytes = 0
      }

      const saved = await saveDocument(clonedDoc)

      res.status(201).json(saved)
    } catch (error) {
      console.error("Shared duplicate error:", error)

      res.status(500).json({ error: "Failed to duplicate shared document" })
    }
  },
)

// DELETE /api/v1/documents/:id - Delete document

router.delete("/documents/:id", async (req: Request, res: Response) => {
  const doc = await requireOwnedDocument(req, res)

  if (!doc) return

  try {
    const success = await deleteDocument(doc.id)

    if (!success) {
      res.status(404).json({ error: "Document not found" })

      return
    }

    res.json({ success: true, id: doc.id })
  } catch (error) {
    console.error("Delete error:", error)

    res.status(500).json({ error: "Failed to delete document" })
  }
})

// DELETE /api/v1/documents/:id/audio - Delete audio file only to free storage

router.delete("/documents/:id/audio", async (req: Request, res: Response) => {
  const doc = await requireOwnedDocument(req, res)

  if (!doc) return

  try {
    if (!doc.audioUrl || doc.audioUrl === "Expired") {
      res
        .status(400)
        .json({ error: "Audio file already deleted or not available" })

      return
    }

    const updated = await deleteDocumentAudio(doc.id)

    if (!updated) {
      res.status(404).json({ error: "Document not found" })

      return
    }

    res.json(updated)
  } catch (error) {
    console.error("Delete audio error:", error)

    res.status(500).json({ error: "Failed to delete audio file" })
  }
})

// POST /api/v1/documents/:id/retranscribe - Re-transcribe audio with forced language

router.post(
  "/documents/:id/retranscribe",

  checkPortfolioRateLimit,

  async (req: Request, res: Response) => {
    const doc = await requireOwnedDocument(req, res)

    if (!doc) return

    if (!doc.audioUrl || doc.audioUrl === "Expired") {
      res.status(400).json({
        error:
          "Audio file is not available. Cannot re-transcribe because the audio has been deleted.",
      })

      return
    }

    const customApiKey = getHeaderKey(req.headers["x-groq-api-key"])

    const { language, prompt, regenerateSummary = true } = req.body || {}

    let workingFilePath = ""

    let isTempFile = false

    try {
      // 1. Locate local audio file or stream from cloud storage (R2/Supabase)

      if (doc.audioUrl.includes("/uploads/")) {
        const localBasename = path.basename(doc.audioUrl.split("?")[0])

        const localFilePath = path.join(UPLOADS_DIR, localBasename)

        if (fs.existsSync(localFilePath)) {
          workingFilePath = localFilePath
        }
      }

      if (!workingFilePath) {
        // Remote cloud file: fetch and write to temp local file for Whisper & FFmpeg

        const parsedUrl = new URL(doc.audioUrl)

        const ext = path.extname(parsedUrl.pathname) || ".mp3"

        workingFilePath = path.join(
          UPLOADS_DIR,

          `temp-retranscribe-${uuidv4()}${ext}`,
        )

        isTempFile = true

        const audioRes = await fetch(doc.audioUrl)

        if (!audioRes.ok || !audioRes.body) {
          throw new Error("Failed to fetch audio stream from cloud storage")
        }

        const fileStream = fs.createWriteStream(workingFilePath)

        await pipeline(
          Readable.fromWeb(
            audioRes.body as import("node:stream/web").ReadableStream,
          ),

          fileStream,
        )
      }

      // 2. Transcribe with Whisper using specified language and prompt

      const result = await transcribeAudioWithGroq(
        workingFilePath,

        customApiKey,

        language,

        prompt,
      )

      const latestDoc = await getDocumentById(doc.id)
      if (!latestDoc) {
        res.status(404).json({ error: "Document was deleted during re-transcription" })
        return
      }

      latestDoc.transcripts = result.entries
      if (result.failedChunks > 0) {
        latestDoc.warnings = [
          `${result.failedChunks} of ${result.totalChunks} audio segments failed to transcribe; this transcript may be incomplete.`,
        ]
      } else {
        latestDoc.warnings = undefined
      }

      // 3. Optionally regenerate summary with new transcript
      let summary: AISummary | undefined
      if (regenerateSummary) {
        const fullText = result.entries
          .map((t: TranscriptEntry) => t.text)
          .join(" ")

        if (fullText.trim()) {
          summary = await summarizeTranscriptWithGroq(
            fullText,
            doc.name,
            customApiKey,
          )
        }
      }

      if (summary) {
        latestDoc.summary = summary
      }

      await saveDocument(latestDoc)

      res.json(latestDoc)
    } catch (error: any) {
      console.error("Retranscribe error:", error)

      res
        .status(500)
        .json({ error: error?.message || "Failed to re-transcribe audio" })
    } finally {
      if (isTempFile && workingFilePath && fs.existsSync(workingFilePath)) {
        await fs.promises.unlink(workingFilePath).catch(() => {})
      }
    }
  },
)

// GET /api/v1/documents/:id/download - Authenticated download proxy with

// proper original filename and extension.

router.get("/documents/:id/download", async (req: Request, res: Response) => {
  const doc = await requireOwnedDocument(req, res)

  if (!doc) return

  try {
    if (!doc.audioUrl || doc.audioUrl === "Expired") {
      res.status(404).json({ error: "Document or audio file not found" })

      return
    }

    // Determine correct filename with proper extension

    let filename = doc.name.trim()

    const extRegex = /\.(mp3|wav|m4a|mp4|webm|flac|ogg|opus|aac)$/i

    if (!extRegex.test(filename)) {
      const urlExtMatch = doc.audioUrl.match(extRegex)

      const ext = urlExtMatch ? urlExtMatch[0] : ".mp3"

      filename = `${filename}${ext}`
    }

    const encodedFilename = encodeURIComponent(filename)

    res.setHeader(
      "Content-Disposition",

      `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
    )

    // If local upload file exists on disk, serve it directly.

    if (doc.audioUrl.includes("/uploads/")) {
      const localBasename = path.basename(doc.audioUrl.split("?")[0])

      const localFilePath = path.join(UPLOADS_DIR, localBasename)

      if (fs.existsSync(localFilePath)) {
        res.download(localFilePath, filename)

        return
      }
    }

    // Remote storage (R2 / Supabase) -> Proxy download stream.

    // Bound only the connection phase so large bodies can keep streaming.

    const controller = new AbortController()

    const connectTimeout = setTimeout(() => controller.abort(), 30_000)

    let audioRes: globalThis.Response

    try {
      audioRes = await fetch(doc.audioUrl, { signal: controller.signal })
    } finally {
      clearTimeout(connectTimeout)
    }

    if (!audioRes.ok || !audioRes.body) {
      // Fallback: Redirect directly to audioUrl if proxy fetch fails

      res.redirect(doc.audioUrl)

      return
    }

    const contentType =
      audioRes.headers.get("content-type") || "application/octet-stream"

    res.setHeader("Content-Type", contentType)

    // Readable.fromWeb + pipeline honors backpressure (no unbounded buffering).

    const nodeStream = Readable.fromWeb(
      audioRes.body as import("node:stream/web").ReadableStream,
    )

    nodeStream.on("error", (err) => {
      console.error("Download stream error:", err)

      if (!res.writableEnded) res.destroy(err)
    })

    await pipeline(nodeStream, res)
  } catch (error) {
    console.error("Download proxy error:", error)

    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download audio file" })
    } else {
      res.destroy()
    }
  }
})

export default router
