import { Router, Request, Response } from "express"
import multer from "multer"
import path from "node:path"
import fs from "node:fs"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { v4 as uuidv4 } from "uuid"
import { BASE_URL, MAX_FILE_BYTES, MAX_GLOBAL_STORAGE_BYTES, UPLOADS_DIR, signMediaToken } from "../config.js"
import { uploadAudioToR2, isR2Enabled } from "../services/r2.service.js"
import {
  uploadAudioToSupabase,
  isSupabaseEnabled,
} from "../services/supabase.service.js"
import {
  getAllDocuments,
  getDocumentById,
  saveDocument,
  deleteDocument,
  deleteDocumentAudio,
  renameDocument,
  duplicateDocument,
  calculateStorageUsed,
} from "../services/storage.service.js"
import {
  transcribeAudioWithGroq,
  summarizeTranscriptWithGroq,
} from "../services/groq.service.js"
import {
  checkPortfolioRateLimit,
  getRateLimitStatus,
  refundRateLimit,
} from "../middleware/rateLimit.middleware.js"
import { FullDocument, TranscriptEntry } from "../types/index.js"
import { authenticate, AuthenticatedRequest } from "../middleware/auth.middleware.js"

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
    res.status(401).json({ error: "Missing authentication or x-user-session header" })
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

  const docId = getParamId(req.params.id)
  let doc: FullDocument | undefined
  try {
    doc = await getDocumentById(docId)
  } catch (error) {
    console.error(`Failed to fetch document ${docId}:`, error)
    res.status(500).json({ error: "Failed to fetch document" })
    return null
  }

  if (!doc || (doc.userId && doc.userId !== userId)) {
    res.status(404).json({ error: "Document not found" })
    return null
  }
  return doc
}

// GET /api/v1/documents - List documents owned by the session user
router.get("/documents", async (req: Request, res: Response) => {
  try {
    const userId = requireUser(req, res)
    if (!userId) return

    const docs = await getAllDocuments(userId)
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

      // Signed local media URL fallback (used only when no cloud storage is
      // configured). The token makes bare filename knowledge useless; expiry
      // matches the 7-day media retention window plus a grace day.
      let serverAudioUrl = buildSignedLocalUrl(
        path.basename(file.path),
        now.getTime() + 8 * 24 * 60 * 60 * 1000,
      )
      let isCloudStored = false

      // Cloudflare R2 Upload (Priority) -> Supabase Storage -> Local Fallback
      try {
        if (isR2Enabled()) {
          const r2Url = await uploadAudioToR2(
            file.path,
            path.basename(file.path),
            file.mimetype,
          )
          if (r2Url) {
            serverAudioUrl = r2Url
            isCloudStored = true
            // File is kept local for Groq Whisper in background task
          }
        } else if (isSupabaseEnabled()) {
          const supabaseUrl = await uploadAudioToSupabase(
            file.path,
            path.basename(file.path),
            file.mimetype,
          )
          if (supabaseUrl) {
            serverAudioUrl = supabaseUrl
            isCloudStored = true
            // File is kept local for Groq Whisper in background task
          }
        }
      } catch (storageErr) {
        console.error(
          "Failed to upload audio to cloud storage, falling back to local file serving:",
          storageErr,
        )
      }

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

      // Immediately return 202 Accepted to the frontend for background processing
      res.status(202).json(newDoc)

      // Background AI Processing Task
      activeBackgroundJobs += 1
      ;(async () => {
        try {
          // 1. Transcribe audio with Groq Whisper
          const result = await transcribeAudioWithGroq(file.path, customApiKey)

          if (result.failedChunks > 0) {
            newDoc.warnings = [
              `${result.failedChunks} of ${result.totalChunks} audio segments failed to transcribe; this transcript may be incomplete.`,
            ]
          }

          const fullText = result.entries.map((t) => t.text).join(" ")

          // 2. Generate summary with Groq LLM
          const summary = await summarizeTranscriptWithGroq(
            fullText,
            file.originalname,
            customApiKey,
          )

          // 3. Mark completed
          newDoc.transcripts = result.entries
          newDoc.summary = summary
          newDoc.status = "Completed"
          await saveDocument(newDoc)
        } catch (error) {
          console.error("Background AI processing failed for doc:", docId, error)
          newDoc.status = "Failed"
          await saveDocument(newDoc)
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
      res.status(400).json({ error: "Audio file already deleted or not available" })
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
        error: "Audio file is not available. Cannot re-transcribe because the audio has been deleted.",
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
          Readable.fromWeb(audioRes.body as import("node:stream/web").ReadableStream),
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

      doc.transcripts = result.entries
      if (result.failedChunks > 0) {
        doc.warnings = [
          `${result.failedChunks} of ${result.totalChunks} audio segments failed to transcribe; this transcript may be incomplete.`,
        ]
      } else {
        doc.warnings = undefined
      }

      // 3. Optionally regenerate summary with new transcript
      if (regenerateSummary) {
        const fullText = result.entries.map((t: TranscriptEntry) => t.text).join(" ")
        if (fullText.trim()) {
          const summary = await summarizeTranscriptWithGroq(
            fullText,
            doc.name,
            customApiKey,
          )
          doc.summary = summary
        }
      }

      await saveDocument(doc)
      res.json(doc)
    } catch (error: any) {
      console.error("Retranscribe error:", error)
      res.status(500).json({ error: error?.message || "Failed to re-transcribe audio" })
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
    const nodeStream = Readable.fromWeb(audioRes.body as import("node:stream/web").ReadableStream)
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
