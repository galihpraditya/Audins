import { DocumentItem, AISummary } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1'
const HEALTH_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '/health')

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL)
    return res.ok
  } catch {
    return false
  }
}

export async function fetchDocumentsFromApi(): Promise<DocumentItem[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/documents`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function uploadAudioToApi(
  file: File,
  userApiKey?: string,
  duration?: string,
  durationSec?: number
): Promise<any | null> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    if (duration) formData.append('duration', duration)
    if (durationSec !== undefined) formData.append('durationSec', durationSec.toString())

    const headers: Record<string, string> = {}
    if (userApiKey) {
      headers['X-Groq-API-Key'] = userApiKey
    }

    const res = await fetch(`${API_BASE_URL}/audio/upload`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || err.message || 'Upload failed')
    }

    return await res.json()
  } catch (error) {
    console.error('Backend API call failed:', error)
    throw error
  }
}

export async function reSummarizeApi(id: string | number, userApiKey?: string, customPrompt?: string): Promise<DocumentItem> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (userApiKey) {
    headers['X-Groq-API-Key'] = userApiKey
  }

  const res = await fetch(`${API_BASE_URL}/documents/${id}/summarize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ customPrompt })
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || err.message || 'Summarize failed')
  }

  return await res.json()
}

export async function deleteDocumentApi(id: string | number): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
    method: 'DELETE',
  })
  return res.ok
}

export async function renameDocumentApi(id: string | number, newName: string): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to rename document')
  }

  return await res.json()
}

export async function duplicateDocumentApi(id: string | number): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}/duplicate`, {
    method: 'POST',
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to duplicate document')
  }

  return await res.json()
}

export async function updateDocumentSummaryApi(id: string | number, summary: AISummary): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}/summary`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to update summary')
  }

  return await res.json()
}
