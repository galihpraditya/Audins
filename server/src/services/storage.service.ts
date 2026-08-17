import {
  FullDocument,
  DocumentItem,
  TranscriptEntry,
  AISummary,
} from "../types/index.js"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  isSupabaseEnabled,
  getSupabaseAllDocuments,
  getSupabaseDocumentById,
  saveSupabaseDocument,
  deleteSupabaseDocument,
  deleteAudioFromSupabase,
} from "./supabase.service.js"
import { isR2Enabled, deleteAudioFromR2 } from "./r2.service.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DB_FILE = path.join(__dirname, "../../../db.json")

// --- Local JSON Fallback DB ---
let documentsStore: Map<string, FullDocument> = new Map()

const INITIAL_DOCS: FullDocument[] = [
  {
    id: "doc-1",
    name: "Q3 Earnings Call — Full Recording.mp3",
    date: "Jul 28, 2026",
    duration: "1h 02m",
    durationSec: 3738,
    status: "Completed",
    createdAt: new Date("2026-07-28").toISOString(),
    transcripts: [
      {
        ts: "0:00:12",
        seconds: 12,
        text: "Good morning everyone, thanks for joining the Q3 earnings call. We have a strong quarter to report today.",
      },
      {
        ts: "0:00:31",
        seconds: 31,
        text: "Revenue came in at $42.7 million, representing 34% year-over-year growth, exceeding our guidance of $40 million.",
      },
      {
        ts: "0:01:04",
        seconds: 64,
        text: "Gross margins expanded by 210 basis points to 68.4%, driven primarily by infrastructure cost optimizations.",
      },
      {
        ts: "0:01:38",
        seconds: 98,
        text: "Our enterprise customer count grew to 312, up from 241 in Q2. Average contract value increased 18% to $136k annually.",
      },
      {
        ts: "0:02:11",
        seconds: 131,
        text: "Net revenue retention stands at 127%, reflecting strong expansion within existing accounts.",
      },
      {
        ts: "0:02:44",
        seconds: 164,
        text: "Looking at regional performance — North America contributed 61% of total revenue, EMEA 24%, and APAC 15%.",
      },
      {
        ts: "0:03:19",
        seconds: 199,
        text: "We closed 3 landmark deals this quarter including a $4.2M TCV contract with a Fortune 100 financial services firm.",
      },
      {
        ts: "0:03:52",
        seconds: 232,
        text: "R&D investment increased to 22% of revenue as we accelerate our AI roadmap and platform capabilities.",
      },
      {
        ts: "0:04:28",
        seconds: 268,
        text: "Headcount grew from 487 to 531 employees, with a focus on engineering and customer success roles.",
      },
      {
        ts: "0:05:01",
        seconds: 301,
        text: "For Q4, we are guiding to revenue of $46–48 million and expect to exit the year with positive operating cash flow.",
      },
      {
        ts: "0:05:34",
        seconds: 334,
        text: "I'll now turn it over to Sarah for a deeper dive on our product milestones and what's coming in Q4.",
      },
      {
        ts: "0:05:58",
        seconds: 358,
        text: "Thanks, Michael. This quarter we shipped 14 major product updates including our new AI-powered analytics suite.",
      },
    ],
    summary: {
      title: "Q3 2026 Earnings Call",
      sections: [
        {
          heading: "Key Highlights & Insights",
          content: [
            "Revenue of $42.7M, 34% YoY growth — exceeded $40M guidance",
            "Gross margin expanded 210 bps to 68.4% through infrastructure optimization",
            "Net Revenue Retention at 127%, reflecting strong account expansion",
            "Positive operating cash flow expected by end of fiscal year",
          ],
        },
        {
          heading: "Metrics & Key Updates",
          content: [
            "312 enterprise customers (+71 from Q2)",
            "Average Contract Value up 18% to $136K annually",
            "Landmark $4.2M TCV deal closed with Fortune 100 financial services firm",
            "North America 61% · EMEA 24% · APAC 15% revenue split",
          ],
        },
        {
          heading: "Guidance & Action Items",
          content: [
            "Management is guiding to Q4 revenue of $46–48 million, representing continued sequential growth.",
          ],
        },
      ],
      modelUsed: "openai/gpt-oss-120b",
      createdAt: new Date("2026-07-28").toISOString(),
    },
  },
  {
    id: "doc-2",
    name: "Product Roadmap Review.wav",
    date: "Jul 25, 2026",
    duration: "44m 18s",
    durationSec: 2658,
    status: "Completed",
    createdAt: new Date("2026-07-25").toISOString(),
    transcripts: [
      {
        ts: "0:00:05",
        seconds: 5,
        text: "Welcome team. Today we review the H2 product roadmap priorities and feature allocations.",
      },
    ],
  },
  {
    id: "doc-3",
    name: "Customer Interview — Acme Corp.m4a",
    date: "Jul 22, 2026",
    duration: "28m 07s",
    durationSec: 1687,
    status: "Completed",
    createdAt: new Date("2026-07-22").toISOString(),
    transcripts: [],
  },
]

function loadDb() {
  if (isSupabaseEnabled()) return // Skip local DB if Supabase is configured
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"))
      documentsStore = new Map(data.map((doc: FullDocument) => [doc.id, doc]))
      return
    } catch (error) {
      console.error("Failed to read db.json, using seed", error)
    }
  }

  documentsStore = new Map()
  INITIAL_DOCS.forEach((doc) => documentsStore.set(doc.id, doc))
  saveDb()
}

function saveDb() {
  if (isSupabaseEnabled()) return
  try {
    const data = Array.from(documentsStore.values())
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8")
  } catch (error) {
    console.error("Failed to write to db.json", error)
  }
}

// Initial Load for Local DB
loadDb()

// --- Exported Async CRUD API ---

export async function getAllDocuments(
  userId?: string,
): Promise<FullDocument[]> {
  if (isSupabaseEnabled()) {
    const docs = await getSupabaseAllDocuments(userId)
    if (docs !== null) {
      // Sort by createdAt descending
      return docs.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
  }

  const allLocalDocs = Array.from(documentsStore.values())
  if (userId) {
    return allLocalDocs.filter((d) => d.userId === userId)
  }
  return allLocalDocs
}

export async function calculateStorageUsed(userId?: string): Promise<number> {
  const docs = await getAllDocuments(userId)
  return docs.reduce((acc, doc) => acc + (doc.sizeBytes || 0), 0)
}

export async function cleanupExpiredAudio(userId?: string): Promise<void> {
  const docs = await getAllDocuments(userId)
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  const now = Date.now()

  for (const doc of docs) {
    if (!doc.audioUrl || doc.audioUrl === "Expired") continue
    const docAge = now - new Date(doc.createdAt).getTime()
    
    if (docAge > SEVEN_DAYS) {
      console.log(`Auto-deleting expired audio for doc: ${doc.id}`)
      try {
        const url = new URL(doc.audioUrl)
        const fileName = path.basename(url.pathname)

        if (isR2Enabled()) {
          await deleteAudioFromR2(fileName)
        } else if (isSupabaseEnabled()) {
          await deleteAudioFromSupabase(fileName)
        } else if (doc.audioUrl.includes("localhost")) {
          // Local fallback deletion
          const localPath = path.join(__dirname, "../../../uploads", fileName)
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath)
        }

        // Mark as expired and remove size payload
        doc.audioUrl = "Expired"
        doc.sizeBytes = 0
        await saveDocument(doc)
      } catch (err) {
        console.error("Failed to delete expired audio:", err)
      }
    }
  }
}

export async function getDocumentById(
  id: string,
): Promise<FullDocument | undefined> {
  if (isSupabaseEnabled()) {
    const doc = await getSupabaseDocumentById(id)
    if (doc !== null) return doc
  }
  return documentsStore.get(id)
}

export async function saveDocument(doc: FullDocument): Promise<FullDocument> {
  if (isSupabaseEnabled()) {
    const saved = await saveSupabaseDocument(doc)
    if (saved !== null) return saved
  }

  documentsStore.set(doc.id, doc)
  saveDb()
  return doc
}

export async function deleteDocument(id: string): Promise<boolean> {
  const doc = await getDocumentById(id)
  if (doc && doc.audioUrl && doc.audioUrl !== "Expired") {
    try {
      const url = new URL(doc.audioUrl)
      const fileName = path.basename(url.pathname)
      if (isR2Enabled()) {
        await deleteAudioFromR2(fileName)
      } else if (isSupabaseEnabled()) {
        await deleteAudioFromSupabase(fileName)
      } else if (doc.audioUrl.includes("localhost")) {
        const localPath = path.join(__dirname, "../../../uploads", fileName)
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath)
      }
    } catch (e) {
      console.error("Failed to delete cloud audio on doc delete:", e)
    }
  }

  if (isSupabaseEnabled()) {
    return await deleteSupabaseDocument(id)
  }

  const result = documentsStore.delete(id)
  if (result) saveDb()
  return result
}

export async function renameDocument(
  id: string,
  newName: string,
): Promise<FullDocument | null> {
  const doc = await getDocumentById(id)
  if (!doc) return null
  doc.name = newName
  return await saveDocument(doc)
}

export async function duplicateDocument(
  id: string,
): Promise<FullDocument | null> {
  const doc = await getDocumentById(id)
  if (!doc) return null

  const newId = `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const newDoc: FullDocument = {
    ...JSON.parse(JSON.stringify(doc)),
    id: newId,
    name: `${doc.name} (Copy)`,
    createdAt: new Date().toISOString(),
  }

  return await saveDocument(newDoc)
}
