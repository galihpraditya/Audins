import { DocumentItem, AISummary } from "../types"

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api/v1"
const HEALTH_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "/health")

function getSessionId(): string {
  let sessionId = localStorage.getItem("audin_session_id")
  if (!sessionId) {
    sessionId = crypto.randomUUID
      ? crypto.randomUUID()
      : "sess-" + Math.random().toString(36).substring(2, 15)
    localStorage.setItem("audin_session_id", sessionId)
  }
  return sessionId
}

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
    const res = await fetch(`${API_BASE_URL}/documents`, {
      headers: {
        "X-User-Session": getSessionId(),
      },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchRateLimitApi(): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/settings/rate-limit`, {
      headers: {
        "X-User-Session": getSessionId(),
      },
    })
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
  durationSec?: number,
): Promise<any | null> {
  try {
    const formData = new FormData()
    formData.append("file", file)
    if (duration) formData.append("duration", duration)
    if (durationSec !== undefined)
      formData.append("durationSec", durationSec.toString())

    const headers: Record<string, string> = {
      "X-User-Session": getSessionId(),
    }
    if (userApiKey) {
      headers["X-Groq-API-Key"] = userApiKey
    }

    const res = await fetch(`${API_BASE_URL}/audio/upload`, {
      method: "POST",
      headers,
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || err.message || "Upload failed")
    }

    return await res.json()
  } catch (error) {
    console.error("Backend API call failed:", error)
    throw error
  }
}

export async function reSummarizeApi(
  id: string | number,
  userApiKey?: string,
  customPrompt?: string,
): Promise<DocumentItem> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-User-Session": getSessionId(),
  }
  if (userApiKey) {
    headers["X-Groq-API-Key"] = userApiKey
  }

  const res = await fetch(`${API_BASE_URL}/documents/${id}/summarize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ customPrompt }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || err.message || "Summarize failed")
  }

  return await res.json()
}

export async function deleteDocumentApi(id: string | number): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
    method: "DELETE",
    headers: { "X-User-Session": getSessionId() },
  })
  return res.ok
}

export async function renameDocumentApi(
  id: string | number,
  newName: string,
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-User-Session": getSessionId(),
    },
    body: JSON.stringify({ name: newName }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || "Failed to rename document")
  }

  return await res.json()
}

export async function duplicateDocumentApi(
  id: string | number,
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}/duplicate`, {
    method: "POST",
    headers: { "X-User-Session": getSessionId() },
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || "Failed to duplicate document")
  }

  return await res.json()
}

export async function updateDocumentSummaryApi(
  id: string | number,
  summary: AISummary,
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}/summary`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-User-Session": getSessionId(),
    },
    body: JSON.stringify({ summary }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || "Failed to update summary")
  }

  return await res.json()
}
