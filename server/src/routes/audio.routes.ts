import { Router, Request, Response } from "express"
import multer from "multer"
import path from "node:path"
import fs from "node:fs"
import { v4 as uuidv4 } from "uuid"
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

const router = Router()

// Configure Multer audio upload storage
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}-${uuidv4().substring(0, 8)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB auto-chunking limit
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

// GET /api/v1/documents - List all audio documents
router.get("/documents", async (req: Request, res: Response) => {
  try {
    const userId = getHeaderKey(req.headers["x-user-session"])
    const docs = await getAllDocuments(userId)
    res.json(docs)
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch documents" })
  }
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

// GET /api/v1/documents/:id - Get single document details
router.get("/documents/:id", async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const doc = await getDocumentById(docId)
    if (!doc) {
      res.status(404).json({ error: "Document not found" })
      return
    }
    res.json(doc)
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch document" })
  }
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
    
    req.on("aborted", async () => {
      console.log("Client aborted upload. Refunding rate limit.")
      await refundOnce()
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
    // Prevent socket timeout during long upload and chunking
    if (req.socket) req.socket.setTimeout(0)

    try {
      const file = req.file
      const userId = getHeaderKey(req.headers["x-user-session"])
      const customApiKey = getHeaderKey(req.headers["x-groq-api-key"])

      if (!file) {
        await refundRateLimit(req)
        res.status(400).json({ error: "No audio file provided" })
        return
      }

      // Check global storage limit (5GB)
      const globalStorageUsed = await calculateStorageUsed()
      if (globalStorageUsed + file.size > 5 * 1024 * 1024 * 1024) {
        await refundRateLimit(req)
        fs.unlinkSync(file.path)
        res.status(403).json({
          error: "Global storage limit (5GB) reached. Mitigating storage abuse risks.",
        })
        return
      }

      // Check 500MB storage limit
      const storageUsed = await calculateStorageUsed(userId)
      if (storageUsed + file.size > 500 * 1024 * 1024) {
        await refundRateLimit(req)
        fs.unlinkSync(file.path)
        res.status(403).json({
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

      // Default local file serving URL
      let serverAudioUrl = `http://localhost:3001/uploads/${path.basename(file.path)}`

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
      ;(async () => {
        try {
          // 1. Transcribe audio with Groq Whisper
          const transcripts = await transcribeAudioWithGroq(file.path, customApiKey)
          const fullText = transcripts.map((t) => t.text).join(" ")

          // 2. Generate summary with Groq Llama
          const summary = await summarizeTranscriptWithGroq(
            fullText,
            file.originalname,
            customApiKey,
          )

          // 3. Mark completed
          newDoc.transcripts = transcripts
          newDoc.summary = summary
          newDoc.status = "Completed"
          await saveDocument(newDoc)
        } catch (error) {
          console.error("Background AI processing failed for doc:", docId, error)
          newDoc.status = "Failed"
          await saveDocument(newDoc)
        } finally {
          // Cleanup local file after AI processing finishes
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path)
          }
        }
      })()
    } catch (error) {
      console.error("Upload processing error:", error)
      res
        .status(500)
        .json({ error: (error as Error).message || "Failed to process audio" })
    }
  },
)

// POST /api/v1/documents/:id/summarize - Re-summarize a document
router.post(
  "/documents/:id/summarize",
  checkPortfolioRateLimit,
  async (req: Request, res: Response) => {
    try {
      const docId = getParamId(req.params.id)
      const doc = await getDocumentById(docId)
      if (!doc) {
        res.status(404).json({ error: "Document not found" })
        return
      }

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
      res
        .status(500)
        .json({ error: (error as Error).message || "Failed to summarize" })
    }
  },
)

// PATCH /api/v1/documents/:id - Rename document
router.patch("/documents/:id", async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const { name } = req.body
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "New document name is required" })
      return
    }

    const updated = await renameDocument(docId, name.trim())
    if (!updated) {
      res.status(404).json({ error: "Document not found" })
      return
    }

    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: "Failed to rename document" })
  }
})

// PATCH /api/v1/documents/:id/summary - Edit summary
router.patch("/documents/:id/summary", async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const { summary } = req.body
    if (!summary) {
      res.status(400).json({ error: "Summary data is required" })
      return
    }

    const doc = await getDocumentById(docId)
    if (!doc) {
      res.status(404).json({ error: "Document not found" })
      return
    }

    doc.summary = summary
    await saveDocument(doc)

    res.json(doc)
  } catch (error) {
    res.status(500).json({ error: "Failed to update summary" })
  }
})

// POST /api/v1/documents/:id/duplicate - Duplicate document
router.post("/documents/:id/duplicate", async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const copy = await duplicateDocument(docId)
    if (!copy) {
      res.status(404).json({ error: "Document not found" })
      return
    }
    res.status(201).json(copy)
  } catch (error) {
    res.status(500).json({ error: "Failed to duplicate document" })
  }
})

// DELETE /api/v1/documents/:id - Delete document
router.delete("/documents/:id", async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const success = await deleteDocument(docId)
    if (!success) {
      res.status(404).json({ error: "Document not found" })
      return
    }
    res.json({ success: true, id: docId })
  } catch (error) {
    res.status(500).json({ error: "Failed to delete document" })
  }
})

// GET /api/v1/documents/:id/download - Secure download proxy with proper original filename and extension
router.get("/documents/:id/download", async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const doc = await getDocumentById(docId)

    if (!doc || !doc.audioUrl) {
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

    // If local upload file path
    if (doc.audioUrl.includes("/uploads/")) {
      const localBasename = path.basename(doc.audioUrl)
      const localFilePath = path.join(process.cwd(), "uploads", localBasename)
      if (fs.existsSync(localFilePath)) {
        res.download(localFilePath, filename)
        return
      }
    }

    // Remote storage (R2 / Supabase) -> Proxy download stream
    const audioRes = await fetch(doc.audioUrl)
    if (!audioRes.ok) {
      // Fallback: Redirect directly to audioUrl if proxy fetch fails
      res.redirect(doc.audioUrl)
      return
    }

    const contentType =
      audioRes.headers.get("content-type") || "application/octet-stream"
    res.setHeader("Content-Type", contentType)

    if (audioRes.body) {
      const reader = audioRes.body.getReader()
      const streamData = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(Buffer.from(value))
        }
        res.end()
      }
      await streamData()
    } else {
      res.redirect(doc.audioUrl)
    }
  } catch (error) {
    console.error("Download proxy error:", error)
    res.status(500).json({ error: "Failed to download audio file" })
  }
})

export default router
