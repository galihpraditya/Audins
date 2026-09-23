import { createClient, SupabaseClient } from "@supabase/supabase-js"

import fs from "node:fs"

import { Readable } from "node:stream"

import { FullDocument } from "../types/index.js"

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

const hasSupabaseConfig = process.env.SUPABASE_URL && supabaseKey

let supabase: SupabaseClient | null = null

if (hasSupabaseConfig) {
  try {
    supabase = createClient(process.env.SUPABASE_URL!, supabaseKey!)

    console.log(
      `Supabase Client initialized successfully (${
        process.env.SUPABASE_SERVICE_ROLE_KEY
          ? "using Service Role Key"
          : "using Anon Key"
      }).`,
    )
  } catch (error) {
    console.error("Failed to initialize Supabase Client:", error)
  }
} else {
  console.log(
    "Supabase configuration missing. Falling back to local database/storage.",
  )
}

export function isSupabaseEnabled(): boolean {
  return !!supabase && !!hasSupabaseConfig
}

export function getSupabaseClient(): SupabaseClient | null {
  return supabase
}

// --- Storage API ---

export async function uploadAudioToSupabase(
  filePath: string,

  fileName: string,

  mimeType: string,
): Promise<string | null> {
  if (!supabase || !isSupabaseEnabled()) return null

  const bucketName = "audin-audio"

  // Stream the file instead of buffering up to 500MB fully in memory.

  try {
    const webStream = Readable.toWeb(
      fs.createReadStream(filePath),
    ) as unknown as ReadableStream<Uint8Array>

    const { error } = await supabase.storage

      .from(bucketName)

      .upload(fileName, webStream, { contentType: mimeType, upsert: true })

    if (error) throw error
  } catch (streamError) {
    console.warn(
      "Streaming upload to Supabase failed, retrying with buffered body:",

      streamError,
    )

    const stats = await fs.promises.stat(filePath)

    const maxBufferedBytes = 100 * 1024 * 1024

    if (stats.size > maxBufferedBytes) {
      throw new Error(
        `Supabase Storage streaming upload failed and file (${Math.round(
          stats.size / (1024 * 1024),
        )}MB) is too large for buffered fallback.`,
      )
    }

    const buffer = await fs.promises.readFile(filePath)

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, buffer, {
        contentType: mimeType,

        upsert: true,
      })

    if (error) {
      console.error("Error uploading file to Supabase storage:", error)

      throw new Error(
        `Supabase Storage upload failed: ${(error as Error).message}`,
      )
    }
  }

  const { data: urlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName)

  return urlData.publicUrl
}

export async function deleteAudioFromSupabase(
  fileName: string,
): Promise<boolean> {
  if (!supabase || !isSupabaseEnabled()) return false

  try {
    const { error } = await supabase.storage
      .from("audin-audio")
      .remove([fileName])

    if (error) throw error

    return true
  } catch (error) {
    console.error("Error deleting file from Supabase storage:", error)

    return false
  }
}

// --- Database API ---

export async function getSupabaseAllDocuments(
  userId?: string,
): Promise<FullDocument[] | null> {
  if (!supabase || !isSupabaseEnabled()) return null

  try {
    let query = supabase

      .from("documents")

      .select("content")

      .not("id", "like", "rate_limit_%")

    if (userId) {
      query = query.contains("content", { userId })
    }

    const { data, error } = await query

    if (error) throw error

    return (data || []).map((row: any) => row.content as FullDocument)
  } catch (error) {
    console.error("Failed to fetch all documents from Supabase:", error)

    return null
  }
}

/** Fetches only sizeBytes values instead of full transcript payloads. */

export async function getSupabaseStorageSums(
  userId?: string,
): Promise<number | null> {
  if (!supabase || !isSupabaseEnabled()) return null

  try {
    let query = supabase.from("documents").select("content->>sizeBytes")

    if (userId) {
      query = query.contains("content", { userId })
    }

    const { data, error } = await query

    if (error) throw error

    return (data || []).reduce((acc: number, row: any) => {
      const size = Number(row.sizeBytes)

      return acc + (Number.isFinite(size) && size > 0 ? size : 0)
    }, 0)
  } catch (error) {
    console.error("Failed to compute storage sums from Supabase:", error)

    return null
  }
}

/** Lightweight id+audioUrl listing used for blob refcounting before deletes. */

export async function getSupabaseAudioRefs(): Promise<Array<{
  id: string
  audioUrl?: string
}> | null> {
  if (!supabase || !isSupabaseEnabled()) return null

  try {
    const { data, error } = await supabase

      .from("documents")

      .select("id, content->>audioUrl")

      .not("id", "like", "rate_limit_%")

    if (error) throw error

    return (data || []).map((row: any) => ({
      id: row.id,

      audioUrl: row.audioUrl ?? undefined,
    }))
  } catch (error) {
    console.error("Failed to fetch audio refs from Supabase:", error)

    return null
  }
}

export async function getSupabaseDocumentById(
  id: string,
): Promise<FullDocument | null> {
  if (!supabase || !isSupabaseEnabled()) return null

  try {
    const { data, error } = await supabase

      .from("documents")

      .select("content")

      .eq("id", id)

      .single()

    if (error) {
      if (error.code === "PGRST116") return null // Not found

      throw error
    }

    return data ? data.content as FullDocument : null
  } catch (error) {
    console.error(`Failed to fetch document ${id} from Supabase:`, error)

    return null
  }
}

export async function getSupabaseDocumentByShareId(
  shareId: string,
): Promise<FullDocument | null> {
  if (!supabase || !isSupabaseEnabled()) return null

  try {
    const { data, error } = await supabase

      .from("documents")

      .select("content")

      .eq("content->shareSettings->>shareId", shareId)

      .single()

    if (error) {
      if (error.code === "PGRST116") return null // Not found

      throw error
    }

    return data ? data.content as FullDocument : null
  } catch (error) {
    console.error(
      `Failed to fetch document by shareId ${shareId} from Supabase:`,
      error,
    )

    return null
  }
}

export async function saveSupabaseDocument(
  doc: FullDocument,
): Promise<FullDocument | null> {
  if (!supabase || !isSupabaseEnabled()) return null

  try {
    const { error } = await supabase
      .from("documents")
      .upsert({ id: doc.id, content: doc })

    if (error) throw error

    return doc
  } catch (error) {
    console.error(`Failed to save document ${doc.id} to Supabase:`, error)

    return null
  }
}

export async function deleteSupabaseDocument(id: string): Promise<boolean> {
  if (!supabase || !isSupabaseEnabled()) return false

  try {
    const { error } = await supabase.from("documents").delete().eq("id", id)

    if (error) throw error

    return true
  } catch (error) {
    console.error(`Failed to delete document ${id} from Supabase:`, error)

    return false
  }
}

export async function claimSupabaseGuestDocuments(
  guestSessionId: string,

  newUserId: string,
): Promise<number> {
  if (!supabase || !isSupabaseEnabled()) return 0

  try {
    const { data, error } = await supabase

      .from("documents")

      .select("id, content")

      .contains("content", { userId: guestSessionId })

    if (error || !data) return 0

    let migrated = 0

    for (const row of data) {
      const doc = row.content as FullDocument

      doc.userId = newUserId

      const { error: upsertErr } = await supabase

        .from("documents")

        .upsert({ id: doc.id, content: doc })

      if (!upsertErr) migrated++
    }

    return migrated
  } catch (error) {
    console.error("Failed to claim guest documents in Supabase:", error)

    return 0
  }
}
