import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import { uploadAudioToSupabase } from '../services/supabase.service.js'
import {
  getAllDocuments,
  getDocumentById,
  saveDocument,
  deleteDocument,
  renameDocument,
  duplicateDocument,
} from '../services/storage.service.js'
import { transcribeAudioWithGroq, summarizeTranscriptWithGroq } from '../services/groq.service.js'
import { checkPortfolioRateLimit, getRateLimitStatus } from '../middleware/rateLimit.middleware.js'
import { FullDocument, TranscriptEntry } from '../types/index.js'

const router = Router()

// Configure Multer audio upload storage
const storage = multer.diskStorage({
  destination: 'uploads/',
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
      cb(new Error('Unsupported file format. Please upload a valid audio or video container (MP3, WAV, M4A, MP4, WebM, FLAC, OGG, OPUS, AAC).'))
    }
  },
})

// GET /api/v1 - API Index & Documentation
router.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Audin AI Audio Intelligence API v1',
    status: 'online',
    endpoints: {
      health: 'GET /health',
      documents: 'GET /api/v1/documents',
      documentDetail: 'GET /api/v1/documents/:id',
      uploadAudio: 'POST /api/v1/audio/upload',
      rateLimitStatus: 'GET /api/v1/settings/rate-limit',
    },
  })
})

// GET /api/v1/settings/rate-limit - Check remaining demo quota
router.get('/settings/rate-limit', (req: Request, res: Response) => {
  const status = getRateLimitStatus(req)
  res.json(status)
})

// GET /api/v1/documents - List all audio documents
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const docs = await getAllDocuments()
    res.json(docs)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' })
  }
})

// Helper to extract string param or header safely
function getHeaderKey(header: string | string[] | undefined): string | undefined {
  if (Array.isArray(header)) return header[0]
  return header
}

function getParamId(param: string | string[]): string {
  if (Array.isArray(param)) return param[0]
  return param
}

// GET /api/v1/documents/:id - Get single document details
router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const doc = await getDocumentById(docId)
    if (!doc) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json(doc)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch document' })
  }
})

// POST /api/v1/audio/upload - Upload file and process with Groq AI
router.post('/audio/upload', checkPortfolioRateLimit, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file
    const customApiKey = getHeaderKey(req.headers['x-groq-api-key'])

    if (!file) {
      res.status(400).json({ error: 'No audio file provided' })
      return
    }

    const docId = `doc-${uuidv4().substring(0, 8)}`
    const now = new Date()

    // 1. Transcribe audio with Groq Whisper
    const transcripts = await transcribeAudioWithGroq(file.path, customApiKey)

    // Combined transcript text for AI summary
    const fullText = transcripts.map((t) => t.text).join(' ')

    // 2. Generate summary with Groq Llama
    const summary = await summarizeTranscriptWithGroq(fullText, file.originalname, customApiKey)

    const durationStr = req.body.duration || '0m 0s'
    const durationSec = req.body.durationSec ? parseInt(req.body.durationSec, 10) : 0

    // Default local file serving URL
    let serverAudioUrl = `http://localhost:3001/uploads/${path.basename(file.path)}`

    // Supabase Storage Upload & local cleanup
    try {
      const supabaseUrl = await uploadAudioToSupabase(file.path, path.basename(file.path), file.mimetype)
      if (supabaseUrl) {
        serverAudioUrl = supabaseUrl
        // Safe to delete local file from Render container since it's now securely on Supabase Storage
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path)
          console.log(`Successfully uploaded to Supabase Storage and deleted local file: ${file.path}`)
        }
      }
    } catch (sbErr) {
      console.error('Failed to upload audio to Supabase Storage, falling back to local file serving:', sbErr)
    }

    const newDoc: FullDocument = {
      id: docId,
      name: file.originalname,
      date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      duration: durationStr,
      durationSec: durationSec,
      status: 'Completed',
      createdAt: now.toISOString(),
      audioUrl: serverAudioUrl,
      transcripts,
      summary,
    }

    await saveDocument(newDoc)

    res.status(201).json(newDoc)
  } catch (error) {
    console.error('Upload processing error:', error)
    res.status(500).json({ error: (error as Error).message || 'Failed to process audio' })
  }
})

// POST /api/v1/documents/:id/summarize - Re-summarize a document
router.post('/documents/:id/summarize', checkPortfolioRateLimit, async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const doc = await getDocumentById(docId)
    if (!doc) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    const customApiKey = getHeaderKey(req.headers['x-groq-api-key'])
    if (!doc.transcripts || doc.transcripts.length === 0) {
      res.status(400).json({ error: 'No transcript available to summarize' })
      return
    }

    const fullText = doc.transcripts.map((t: TranscriptEntry) => t.text).join(' ')
    const customPrompt = req.body?.customPrompt
    const summary = await summarizeTranscriptWithGroq(fullText, doc.name, customApiKey, undefined, customPrompt)

    doc.summary = summary
    await saveDocument(doc)

    res.json(doc)
  } catch (error) {
    console.error('Summarize error:', error)
    res.status(500).json({ error: (error as Error).message || 'Failed to summarize' })
  }
})

// PATCH /api/v1/documents/:id - Rename document
router.patch('/documents/:id', async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const { name } = req.body
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'New document name is required' })
      return
    }

    const updated = await renameDocument(docId, name.trim())
    if (!updated) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: 'Failed to rename document' })
  }
})

// PATCH /api/v1/documents/:id/summary - Edit summary
router.patch('/documents/:id/summary', async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const { summary } = req.body
    if (!summary) {
      res.status(400).json({ error: 'Summary data is required' })
      return
    }

    const doc = await getDocumentById(docId)
    if (!doc) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    doc.summary = summary
    await saveDocument(doc)

    res.json(doc)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update summary' })
  }
})

// POST /api/v1/documents/:id/duplicate - Duplicate document
router.post('/documents/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const copy = await duplicateDocument(docId)
    if (!copy) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.status(201).json(copy)
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate document' })
  }
})

// DELETE /api/v1/documents/:id - Delete document
router.delete('/documents/:id', async (req: Request, res: Response) => {
  try {
    const docId = getParamId(req.params.id)
    const success = await deleteDocument(docId)
    if (!success) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json({ success: true, id: docId })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' })
  }
})

export default router
