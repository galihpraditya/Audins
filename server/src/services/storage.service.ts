import { FullDocument, TranscriptEntry } from "../types/index.js"

import fs from "node:fs"

import path from "node:path"

import { v4 as uuidv4 } from "uuid"

import { DB_FILE, UPLOADS_DIR } from "../config.js"

import {
  isSupabaseEnabled,
  getSupabaseAllDocuments,
  getSupabaseDocumentById,
  getSupabaseDocumentByShareId,
  getSupabaseStorageSums,
  getSupabaseAudioRefs,
  saveSupabaseDocument,
  deleteSupabaseDocument,
  deleteAudioFromSupabase,
  claimSupabaseGuestDocuments,
  upsertSupabaseDocumentsBatch,
  getSupabaseClient,
} from "./supabase.service.js"

import { isR2Enabled, deleteAudioFromR2 } from "./r2.service.js"
import {
  isLocalRegisteredUserId,
  getLocalUserIdByEmail,
  getUserEmailByLocalId,
} from "./auth.service.js"

// --- Local JSON Fallback DB ---

let documentsStore: Map<string, FullDocument> = new Map()

function loadDb() {
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
  dbWriteChain = dbWriteChain
    .then(async () => {
      const data = JSON.stringify(Array.from(documentsStore.values()), null, 2)
      const tmp = `${DB_FILE}.tmp`
      await fs.promises.writeFile(tmp, data, "utf8")
      try {
        await fs.promises.rename(tmp, DB_FILE)
      } catch (err: any) {
        if (err.code === "EPERM" || err.code === "EBUSY") {
          await fs.promises.copyFile(tmp, DB_FILE)
          await fs.promises.unlink(tmp).catch(() => {})
        } else {
          throw err
        }
      }
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
  userEmail?: string,
): Promise<FullDocument[]> {
  let supaDocs: FullDocument[] = []
  if (isSupabaseEnabled()) {
    const docs = await getSupabaseAllDocuments(userId)
    if (docs !== null) {
      supaDocs = docs
    }
  }

  if (!isSupabaseEnabled()) {
    const allLocalDocs = Array.from(documentsStore.values())
    if (userId) {
      return allLocalDocs.filter((d) => !d.userId || d.userId === userId)
    }
    return allLocalDocs
  }

  // Supabase is enabled: merge Supabase docs with matching local docs
  let localUserId: string | null = null
  if (userEmail) {
    localUserId = getLocalUserIdByEmail(userEmail)
  }

  const combinedMap = new Map<string, FullDocument>()

  for (const doc of supaDocs) {
    combinedMap.set(doc.id, doc)
    documentsStore.set(doc.id, doc)
  }

  const docsToUpsertToSupabase: FullDocument[] = []

  for (const doc of documentsStore.values()) {
    if (!combinedMap.has(doc.id)) {
      let isMatch = false
      if (!userId) {
        isMatch = true
      } else if (doc.userId === userId) {
        isMatch = true
      } else if (localUserId && doc.userId === localUserId) {
        // Automatically migrate local user doc to authenticated Supabase user ID
        doc.userId = userId
        scheduleDbWrite()
        docsToUpsertToSupabase.push(doc)
        isMatch = true
      }

      if (isMatch) {
        combinedMap.set(doc.id, doc)
      }
    }
  }

  if (docsToUpsertToSupabase.length > 0) {
    void upsertSupabaseDocumentsBatch(docsToUpsertToSupabase).catch(() => {})
  }

  return Array.from(combinedMap.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
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
    let url: URL
    try {
      url = new URL(audioUrl)
    } catch {
      return
    }

    const fileName = path.basename(url.pathname)
    if (!fileName) return

    if (audioUrl.includes("/uploads/")) {
      const localPath = path.join(UPLOADS_DIR, fileName)
      if (fs.existsSync(localPath)) await fs.promises.unlink(localPath)
    } else if (
      isR2Enabled() &&
      (url.hostname.includes("r2.cloudflarestorage.com") ||
        (process.env.R2_PUBLIC_URL && audioUrl.includes(process.env.R2_PUBLIC_URL)) ||
        url.hostname.includes(process.env.R2_BUCKET_NAME || ""))
    ) {
      await deleteAudioFromR2(fileName)
    } else if (
      isSupabaseEnabled() &&
      (url.hostname.includes("supabase.co") || audioUrl.includes("/storage/v1/"))
    ) {
      await deleteAudioFromSupabase(fileName)
    } else {
      // Fallback: attempt configured cloud providers
      if (isR2Enabled()) {
        await deleteAudioFromR2(fileName)
      } else if (isSupabaseEnabled()) {
        await deleteAudioFromSupabase(fileName)
      }
    }
  } catch (e) {
    console.error("Failed to delete audio blob:", e)
  }
}

/**
 * Checks whether any document (other than excludeDocId) still references the same audio file.
 * Uses lightweight metadata queries rather than downloading full document payloads.
 */
async function isAudioBlobStillReferenced(
  excludeDocId: string | null,
  audioUrl: string,
): Promise<boolean> {
  try {
    let fileName: string
    try {
      fileName = path.basename(new URL(audioUrl).pathname)
    } catch {
      return false
    }
    if (!fileName) return false

    if (isSupabaseEnabled()) {
      const refs = await getSupabaseAudioRefs()
      if (refs !== null) {
        return refs.some((r) => {
          if (excludeDocId && r.id === excludeDocId) return false
          if (!r.audioUrl || r.audioUrl === "Expired") return false
          try {
            return path.basename(new URL(r.audioUrl).pathname) === fileName
          } catch {
            return false
          }
        })
      }
    }

    // Local mode
    for (const other of documentsStore.values()) {
      if (excludeDocId && other.id === excludeDocId) continue
      if (!other.audioUrl || other.audioUrl === "Expired") continue
      try {
        if (path.basename(new URL(other.audioUrl).pathname) === fileName) {
          return true
        }
      } catch {}
    }
  } catch (err) {
    console.error("Error evaluating audio blob references:", err)
  }
  return false
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
      const stillReferenced = await isAudioBlobStillReferenced(id, doc.audioUrl)
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
      const stillReferenced = await isAudioBlobStillReferenced(id, doc.audioUrl)
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
        const stillReferenced = await isAudioBlobStillReferenced(doc.id, doc.audioUrl)
        if (!stillReferenced) {
          await deleteBlobForUrl(doc.audioUrl)
        }

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
 * Any "Processing" document found in the DB at boot has lost its in-memory worker.
 */
export async function failStaleProcessingDocuments(): Promise<number> {
  const docs = await getAllDocuments()
  let recovered = 0

  for (const doc of docs) {
    if (doc.status !== "Processing") continue

    doc.status = "Failed"
    doc.warnings = [
      ...(doc.warnings || []),
      "Processing was interrupted by a server restart. Please re-upload or re-run the summary.",
    ]

    await saveDocument(doc)
    recovered += 1
  }

  if (recovered > 0) {
    console.log(
      `Recovered ${recovered} stale Processing document(s) as Failed.`,
    )
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

export async function getDocumentByShareId(
  shareId: string,
): Promise<FullDocument | undefined> {
  if (isSupabaseEnabled()) {
    const doc = await getSupabaseDocumentByShareId(shareId)

    if (doc !== null) return doc

    return undefined
  }

  for (const doc of documentsStore.values()) {
    if (doc.shareSettings?.shareId === shareId) {
      return doc
    }
  }

  return undefined
}

export async function incrementShareViewCount(shareId: string): Promise<void> {
  try {
    const doc = await getDocumentByShareId(shareId)

    if (!doc || !doc.shareSettings) return

    doc.shareSettings.viewCount = (doc.shareSettings.viewCount || 0) + 1

    await saveDocument(doc)
  } catch (err) {
    console.error("Failed to increment share view count:", err)
  }
}

export async function saveDocument(doc: FullDocument): Promise<FullDocument> {
  documentsStore.set(doc.id, doc)
  scheduleDbWrite()

  if (isSupabaseEnabled()) {
    const saved = await saveSupabaseDocument(doc)
    if (saved !== null) return saved
  }

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
 * Claims documents previously created under an anonymous guest session ID
 * or local offline accounts, migrating their ownership to the newly authenticated user.
 */

export async function claimGuestDocuments(
  guestSessionId: string | undefined,
  newUserId: string,
  documentIds?: string[],
  userEmail?: string,
): Promise<number> {
  if (!newUserId) return 0

  let localUserId: string | null = null
  if (userEmail) {
    localUserId = getLocalUserIdByEmail(userEmail)
  }

  const additionalUserIds: string[] = []
  if (localUserId && localUserId !== newUserId) {
    additionalUserIds.push(localUserId)
  }

  const cleanGuestId =
    guestSessionId &&
    guestSessionId !== newUserId &&
    !guestSessionId.startsWith("usr-") &&
    !isLocalRegisteredUserId(guestSessionId) &&
    /^[A-Za-z0-9_-]{8,64}$/.test(guestSessionId)
      ? guestSessionId
      : undefined

  let totalCount = 0

  // 1. Supabase claim
  if (isSupabaseEnabled()) {
    try {
      const supabaseCount = await claimSupabaseGuestDocuments(
        cleanGuestId,
        newUserId,
        documentIds,
        additionalUserIds,
      )
      totalCount += supabaseCount
    } catch (err) {
      console.error("Supabase claim failed, checking local store:", err)
    }
  }

  // 2. Local documentsStore claim
  let localModified = false
  const docsToSync: FullDocument[] = []
  const requestedIds = new Set(documentIds || [])

  for (const doc of documentsStore.values()) {
    let shouldClaim = false

    if (cleanGuestId && doc.userId === cleanGuestId) {
      shouldClaim = true
    } else if (localUserId && doc.userId === localUserId) {
      shouldClaim = true
    } else if (requestedIds.has(doc.id)) {
      if (
        !doc.userId ||
        doc.userId === cleanGuestId ||
        doc.userId.startsWith("sess-") ||
        (localUserId && doc.userId === localUserId) ||
        doc.userId === "ca980a36-e0e6-414c-abe4-a5f6aeebf027" ||
        !doc.userId.includes("@")
      ) {
        shouldClaim = true
      }
    } else if (
      cleanGuestId &&
      doc.userId === "ca980a36-e0e6-414c-abe4-a5f6aeebf027"
    ) {
      // Historical guest session from previous runs on this machine
      shouldClaim = true
    }

    if (shouldClaim && doc.userId !== newUserId) {
      doc.userId = newUserId
      localModified = true
      docsToSync.push(doc)
      totalCount++
    }
  }

  if (localModified) {
    scheduleDbWrite()
  }

  if (isSupabaseEnabled() && docsToSync.length > 0) {
    void upsertSupabaseDocumentsBatch(docsToSync).catch((err) => {
      console.error("Failed to sync claimed docs to Supabase:", err)
    })
  }

  return totalCount
}

/**
 * Automatically synchronizes documents in local db.json with Supabase on startup,
 * linking any historical local user accounts (usr-...) to their matching Supabase user IDs.
 */
export async function syncLocalDbToSupabase(): Promise<void> {
  if (!isSupabaseEnabled()) return

  try {
    const supaDocs = await getSupabaseAllDocuments()
    if (!supaDocs) return

    const supaIds = new Set(supaDocs.map((d) => d.id))
    const missingDocs = Array.from(documentsStore.values()).filter(
      (d) => !supaIds.has(d.id),
    )

    if (missingDocs.length === 0) return

    console.log(
      `[Storage] Found ${missingDocs.length} local documents missing in Supabase. Synchronizing...`,
    )

    // Build email to Supabase userId map
    const emailToSupaUserId = new Map<string, string>()
    const client = getSupabaseClient()
    if (client) {
      try {
        const { data } = await client.auth.admin.listUsers()
        if (data?.users) {
          for (const u of data.users) {
            if (u.email) {
              emailToSupaUserId.set(u.email.toLowerCase(), u.id)
            }
          }
        }
      } catch (err) {
        console.warn(
          "[Storage] Could not list Supabase admin users for email mapping:",
          err,
        )
      }
    }

    let modifiedLocal = false
    for (const doc of missingDocs) {
      if (doc.userId && doc.userId.startsWith("usr-")) {
        const email = getUserEmailByLocalId(doc.userId)
        if (email && emailToSupaUserId.has(email.toLowerCase())) {
          doc.userId = emailToSupaUserId.get(email.toLowerCase())!
          modifiedLocal = true
        }
      }
    }

    if (modifiedLocal) {
      scheduleDbWrite()
    }

    const upserted = await upsertSupabaseDocumentsBatch(missingDocs)
    console.log(
      `[Storage] Successfully synchronized ${upserted} documents from db.json to Supabase.`,
    )
  } catch (error) {
    console.error("[Storage] Failed to sync db.json to Supabase:", error)
  }
}
