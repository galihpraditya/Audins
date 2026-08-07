import { createClient, SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { FullDocument } from '../types/index.js'

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

const hasSupabaseConfig = 
  process.env.SUPABASE_URL && 
  supabaseKey

let supabase: SupabaseClient | null = null

if (hasSupabaseConfig) {
  try {
    supabase = createClient(process.env.SUPABASE_URL!, supabaseKey!)
    console.log(`Supabase Client initialized successfully (${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'using Service Role Key' : 'using Anon Key'}).`)
  } catch (error) {
    console.error('Failed to initialize Supabase Client:', error)
  }
} else {
  console.log('Supabase configuration missing. Falling back to local database/storage.')
}

export function isSupabaseEnabled(): boolean {
  return !!supabase && !!hasSupabaseConfig
}

// --- Storage API ---

export async function uploadAudioToSupabase(filePath: string, fileName: string, mimeType: string): Promise<string | null> {
  if (!supabase || !isSupabaseEnabled()) {
    return null
  }

  try {
    const fileBuffer = fs.readFileSync(filePath)
    const bucketName = 'audin-audio'

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: mimeType,
        upsert: true
      })

    if (error) throw error

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName)

    return urlData.publicUrl
  } catch (error) {
    console.error('Error uploading file to Supabase storage:', error)
    throw new Error(`Supabase Storage upload failed: ${(error as Error).message}`)
  }
}

// --- Database API ---

export async function getSupabaseAllDocuments(): Promise<FullDocument[] | null> {
  if (!supabase || !isSupabaseEnabled()) return null
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('content')
    
    if (error) throw error
    return (data || []).map((row: any) => row.content as FullDocument)
  } catch (error) {
    console.error('Failed to fetch all documents from Supabase:', error)
    return null
  }
}

export async function getSupabaseDocumentById(id: string): Promise<FullDocument | null> {
  if (!supabase || !isSupabaseEnabled()) return null
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('content')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data ? (data.content as FullDocument) : null
  } catch (error) {
    console.error(`Failed to fetch document ${id} from Supabase:`, error)
    return null
  }
}

export async function saveSupabaseDocument(doc: FullDocument): Promise<FullDocument | null> {
  if (!supabase || !isSupabaseEnabled()) return null
  try {
    const { error } = await supabase
      .from('documents')
      .upsert({
        id: doc.id,
        content: doc
      })
    
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
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    return true
  } catch (error) {
    console.error(`Failed to delete document ${id} from Supabase:`, error)
    return false
  }
}
