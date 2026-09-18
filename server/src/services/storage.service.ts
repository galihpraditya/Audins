import {
  FullDocument,
  TranscriptEntry,
} from "../types/index.js"
import fs from "node:fs"
import path from "node:path"
import { v4 as uuidv4 } from "uuid"
import { DB_FILE, UPLOADS_DIR } from "../config.js"
import {
  isSupabaseEnabled,
  getSupabaseAllDocuments,
  getSupabaseDocumentById,
  getSupabaseStorageSums,
  getSupabaseAudioRefs,
  saveSupabaseDocument,
  deleteSupabaseDocument,
  deleteAudioFromSupabase,
  claimSupabaseGuestDocuments,
} from "./supabase.service.js"
import { isR2Enabled, deleteAudioFromR2 } from "./r2.service.js"

// --- Local JSON Fallback DB ---
let documentsStore: Map<string, FullDocument> = new Map()

function loadDb() {
  if (isSupabaseEnabled()) return // Skip local DB if Supabase is configured
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"))
      documentsStore = new Map(data.map((doc: FullDocument) => [doc.id, doc]))
      return
    } catch (error) {
      console.error("Failed to read db.json, starting empty", error)
    }
  }
  documentsStore = new Map()
}

/**
 * Serialized, atomic db.json writes.
 * - Writes go through a promise chain so concurrent saves never interleave.
 * - Content lands in a temp file first, then is renamed into place, so a
 *   crash can never leave a half-written (corrupt) database behind.
 */
let dbWriteChain: Promise<void> = Promise.resolve()

function scheduleDbWrite(): void {
  if (isSupabaseEnabled()) return
  dbWriteChain = dbWriteChain
    .then(async () => {
      const data = JSON.stringify(Array.from(documentsStore.values()), null, 2)
      const tmp = `${DB_FILE}.tmp`
      await fs.promises.writeFile(tmp, data, "utf8")
      await fs.promises.rename(tmp, DB_FILE)
    })
    .catch((error) => {
      console.error("Failed to persist db.json", error)
    })
}

/** Resolves once every pending db.json write has settled. */
export function flushDbWrites(): Promise<void> {
  return dbWriteChain
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
      return docs.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
  }

  const allLocalDocs = Array.from(documentsStore.values())
  if (userId) {
    return allLocalDocs.filter((d) => !d.userId || d.userId === userId)
  }
  return allLocalDocs
}

export async function calculateStorageUsed(userId?: string): Promise<number> {
  if (isSupabaseEnabled()) {
    const sums = await getSupabaseStorageSums(userId)
    if (sums !== null) return sums
  }
  const docs = await getAllDocuments(userId)
  return docs.reduce((acc, doc) => acc + (doc.sizeBytes || 0), 0)
}

async function deleteBlobForUrl(audioUrl: string): Promise<void> {
  try {
    const url = new URL(audioUrl)
    const fileName = path.basename(url.pathname)

    if (isR2Enabled()) {
      await deleteAudioFromR2(fileName)
    } else if (isSupabaseEnabled()) {
      await deleteAudioFromSupabase(fileName)
    } else if (audioUrl.includes("/uploads/")) {
      const localPath = path.join(UPLOADS_DIR, fileName)
      if (fs.existsSync(localPath)) await fs.promises.unlink(localPath)
    }
  } catch (e) {
    console.error("Failed to delete audio blob:", e)
  }
}

/**
 * Deletes a document row. The underlying audio blob is only removed when no
 * other document references the same file (duplicates share the blob URL).
 */
export async function deleteDocument(id: string): Promise<boolean> {
  const doc = await getDocumentById(id)
  let deleted = false

  if (isSupabaseEnabled()) {
    deleted = await deleteSupabaseDocument(id)
  } else {
    deleted = documentsStore.delete(id)
    if (deleted) scheduleDbWrite()
  }

  if (!deleted || !doc) return deleted

  if (doc.audioUrl && doc.audioUrl !== "Expired") {
    try {
      const url = new URL(doc.audioUrl)
      const fileName = path.basename(url.pathname)

      // Refcount check across remaining docs before removing shared blobs.
      const allDocs = await getAllDocuments()
      const stillReferenced = allDocs.some(
        (other) =>
          other.audioUrl &&
          other.audioUrl !== "Expired" &&
          path.basename(new URL(other.audioUrl).pathname) === fileName,
      )

      if (!stillReferenced) {
        await deleteBlobForUrl(doc.audioUrl)
      }
    } catch (e) {
      console.error("Failed to evaluate blob refs on doc delete:", e)
    }
  }

  return true
}

/**
 * Deletes only the audio blob for a document to free storage quota while
 * preserving transcripts, AI summary, and metadata.
 */
export async function deleteDocumentAudio(
  id: string,
): Promise<FullDocument | null> {
  const doc = await getDocumentById(id)
  if (!doc) return null

  if (doc.audioUrl && doc.audioUrl !== "Expired") {
    try {
      const url = new URL(doc.audioUrl)
      const fileName = path.basename(url.pathname)

      // Refcount check: ensure no other document shares this audio blob (e.g. duplicates)
      const allDocs = await getAllDocuments()
      const stillReferenced = allDocs.some(
        (other) =>
          other.id !== id &&
          other.audioUrl &&
          other.audioUrl !== "Expired" &&
          path.basename(new URL(other.audioUrl).pathname) === fileName,
      )

      if (!stillReferenced) {
        await deleteBlobForUrl(doc.audioUrl)
      }
    } catch (e) {
      console.error("Failed to evaluate blob refs on audio delete:", e)
    }
  }

  doc.audioUrl = undefined
  doc.sizeBytes = 0
  return await saveDocument(doc)
}

export async function cleanupExpiredAudio(): Promise<void> {
  const docs = await getAllDocuments()
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  const now = Date.now()

  for (const doc of docs) {
    if (!doc.audioUrl || doc.audioUrl === "Expired") continue
    const docAge = now - new Date(doc.createdAt).getTime()

    if (docAge > SEVEN_DAYS) {
      console.log(`Auto-deleting expired audio for doc: ${doc.id}`)
      try {
        await deleteBlobForUrl(doc.audioUrl)

        doc.audioUrl = "Expired"
        doc.sizeBytes = 0
        await saveDocument(doc)
      } catch (err) {
        console.error("Failed to delete expired audio:", err)
      }
    }
  }
}

/**
 * Boot/recovery sweeper: background jobs are fire-and-forget in-process, so a
 * crash or redeploy leaves documents stuck in "Processing".
 *
 * A document is a casualty when it is "Processing" but cannot belong to a live
 * job of THIS process:
 *  - created before this boot (minus a small clock-skew grace), OR
 *  - older than maxAgeMs (covers long-running jobs from previous boots).
 */
const PROCESS_START = Date.now()

export async function failStaleProcessingDocuments(
  maxAgeMs = 2 * 60 * 60 * 1000,
): Promise<number> {
  const docs = await getAllDocuments()
  const now = Date.now()
  // Grace window absorbs minor clock skew between app servers and the DB.
  const BOOT_GRACE_MS = 30_000
  let recovered = 0

  for (const doc of docs) {
    if (doc.status !== "Processing") continue
    const createdAtMs = new Date(doc.createdAt).getTime()
    const age = now - createdAtMs
    const predatesThisBoot = createdAtMs < PROCESS_START - BOOT_GRACE_MS
    if (!predatesThisBoot && age <= maxAgeMs) continue

    doc.status = "Failed"
    doc.warnings = [
      ...(doc.warnings || []),
      "Processing was interrupted by a server restart. Please re-upload or re-run the summary.",
    ]
    await saveDocument(doc)
    recovered += 1
  }

  if (recovered > 0) {
    console.log(`Recovered ${recovered} stale Processing document(s) as Failed.`)
  }
  return recovered
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
  scheduleDbWrite()
  return doc
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

/**
 * Duplicates metadata + transcripts but shares the original audio blob URL.
 * Safe because deleteDocument refcounts blob references before removal.
 */
export async function duplicateDocument(
  id: string,
): Promise<FullDocument | null> {
  const doc = await getDocumentById(id)
  if (!doc) return null

  const newId = `doc-${uuidv4().substring(0, 8)}`
  const newDoc: FullDocument = {
    ...JSON.parse(JSON.stringify(doc)),
    id: newId,
    name: `${doc.name} (Copy)`,
    createdAt: new Date().toISOString(),
  }

  return await saveDocument(newDoc)
}

/**
 * Claims documents previously created under an anonymous guest session ID,
 * migrating their ownership to the newly authenticated user.
 */
export async function claimGuestDocuments(
  guestSessionId: string,
  newUserId: string,
): Promise<number> {
  if (!guestSessionId || !newUserId || guestSessionId === newUserId) return 0

  if (isSupabaseEnabled()) {
    return await claimSupabaseGuestDocuments(guestSessionId, newUserId)
  }

  let count = 0
  for (const doc of documentsStore.values()) {
    if (doc.userId === guestSessionId) {
      doc.userId = newUserId
      count++
    }
  }

  if (count > 0) {
    scheduleDbWrite()
  }

  return count
}

