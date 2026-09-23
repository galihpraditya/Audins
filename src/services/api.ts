import {
  DocumentItem,
  DocumentShareSettings,
  PublicSharedDocument,
  AISummary,
  RateLimitResponse,
  User,
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  RetranscribeOptions,
} from "../types"

// In development default to the local Express backend; in production builds

// default to same-origin ("/api/v1") so a missing env var can never silently

// point deployed users at localhost.

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:3001/api/v1" : "/api/v1")

/** Error carrying the HTTP status so callers can react (e.g. 429 → modal). */

export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)

    this.name = "ApiError"

    this.status = status
  }
}

const SESSION_KEY = "audin_session_id"

const AUTH_TOKEN_KEY = "audin_auth_token"

const AUTH_USER_KEY = "audin_auth_user"

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
  } catch {
    /* non-fatal */
  }
}

export function removeAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {
    /* non-fatal */
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)

    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: User): void {
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  } catch {
    /* non-fatal */
  }
}

export function clearAuth(): void {
  removeAuthToken()

  try {
    localStorage.removeItem(AUTH_USER_KEY)
  } catch {
    /* non-fatal */
  }
}

/**
 * Fallback identity kept at module scope. When localStorage throws (private
 * browsing with storage disabled, hardened webviews), a fresh id per call
 * would make the backend treat every request as a different user — uploads
 * would vanish and polling would 404 forever.
 */

let ephemeralSessionId: string | null = null

function generateSessionId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID()
    }
  } catch {
    /* randomUUID requires a secure context; fall through */
  }

  return (
    "sess-" +
    Math.random().toString(36).substring(2, 15) +
    Date.now().toString(36)
  )
}

export function getSessionId(): string {
  try {
    let sessionId = localStorage.getItem(SESSION_KEY)

    if (!sessionId) {
      sessionId = generateSessionId()

      localStorage.setItem(SESSION_KEY, sessionId)
    }

    return sessionId
  } catch {
    if (!ephemeralSessionId) ephemeralSessionId = generateSessionId()

    return ephemeralSessionId
  }
}

export function authHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-User-Session": getSessionId(),

    ...extra,
  }

  const token = getAuthToken()

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  return headers
}

/**
 * Safely extracts an error message from a failed Response without assuming
 * the body is JSON (500 responses may be HTML/plain text).
 */

async function extractErrorMessage(
  res: Response,
  fallback: string,
): Promise<ApiError> {
  try {
    const data = await res.json()

    const message =
      data?.error || data?.message || `${fallback} (HTTP ${res.status})`

    return new ApiError(String(message), res.status)
  } catch {
    return new ApiError(`${fallback} (HTTP ${res.status})`, res.status)
  }
}

export async function fetchDocumentsFromApi(): Promise<DocumentItem[]> {
  const res = await fetch(`${API_BASE_URL}/documents`, {
    headers: authHeaders(),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Failed to load documents")

  return (await res.json()) as DocumentItem[]
}

export async function fetchRateLimitApi(): Promise<RateLimitResponse> {
  const res = await fetch(`${API_BASE_URL}/settings/rate-limit`, {
    headers: authHeaders(),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Failed to load quota info")

  return (await res.json()) as RateLimitResponse
}

export function uploadAudioToApi(
  file: File,

  userApiKey?: string,

  duration?: string,

  durationSec?: number,

  onProgress?: (progress: number) => void,

  signal?: AbortSignal,
): Promise<DocumentItem> {
  return new Promise<DocumentItem>((resolve, reject) => {
    const formData = new FormData()

    formData.append("file", file)

    if (duration) formData.append("duration", duration)

    if (durationSec !== undefined)
      formData.append("durationSec", durationSec.toString())

    const xhr = new XMLHttpRequest()

    xhr.open("POST", `${API_BASE_URL}/audio/upload`)

    xhr.setRequestHeader("X-User-Session", getSessionId())

    const token = getAuthToken()

    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    }

    if (userApiKey) {
      xhr.setRequestHeader("X-Groq-API-Key", userApiKey)
    }

    if (signal) {
      if (signal.aborted) {
        xhr.abort()

        reject(new Error("Upload cancelled"))

        return
      }

      signal.addEventListener("abort", () => {
        xhr.abort()

        reject(new Error("Upload cancelled"))
      })
    }

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded * 100) / e.total)

          onProgress(percent)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as DocumentItem)
        } catch {
          reject(new Error("Invalid response from backend"))
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText)

          reject(
            new ApiError(
              err.error || err.message || "Upload failed",
              xhr.status,
            ),
          )
        } catch {
          reject(
            new ApiError(`Upload failed with status ${xhr.status}`, xhr.status),
          )
        }
      }
    }

    xhr.onerror = () => {
      reject(new Error("Network error occurred during upload"))
    }

    xhr.onabort = () => {
      reject(new Error("Upload cancelled"))
    }

    xhr.send(formData)
  })
}

/**
 * Polls a document's processing status.
 * Returns null for transient failures (network hiccups) — callers decide
 * when to give up based on attempt caps.
 */

export async function pollDocumentStatusApi(
  id: string | number,
): Promise<DocumentItem | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
      headers: authHeaders(),
    })

    if (!res.ok) return null

    return (await res.json()) as DocumentItem
  } catch {
    return null
  }
}

export async function reSummarizeApi(
  id: string | number,

  userApiKey?: string,

  customPrompt?: string,
): Promise<DocumentItem> {
  const headers = authHeaders({
    "Content-Type": "application/json",
  })

  if (userApiKey) {
    headers["X-Groq-API-Key"] = userApiKey
  }

  const res = await fetch(`${API_BASE_URL}/documents/${id}/summarize`, {
    method: "POST",

    headers,

    body: JSON.stringify({ customPrompt }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Summarize failed")

  return (await res.json()) as DocumentItem
}

export async function deleteDocumentApi(id: string | number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
    method: "DELETE",

    headers: authHeaders(),
  })

  if (!res.ok && res.status !== 404) {
    throw await extractErrorMessage(res, "Failed to delete document")
  }
}

export async function deleteAudioOnlyApi(
  id: string | number,
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}/audio`, {
    method: "DELETE",

    headers: authHeaders(),
  })

  if (!res.ok)
    throw await extractErrorMessage(res, "Failed to delete audio file")

  return (await res.json()) as DocumentItem
}

export async function retranscribeDocumentApi(
  id: string | number,

  options: RetranscribeOptions,

  userApiKey?: string,
): Promise<DocumentItem> {
  const headers = authHeaders({
    "Content-Type": "application/json",
  })

  if (userApiKey) {
    headers["X-Groq-API-Key"] = userApiKey
  }

  const res = await fetch(`${API_BASE_URL}/documents/${id}/retranscribe`, {
    method: "POST",

    headers,

    body: JSON.stringify(options),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Re-transcribe failed")

  return (await res.json()) as DocumentItem
}

export async function renameDocumentApi(
  id: string | number,

  newName: string,
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
    method: "PATCH",

    headers: authHeaders({ "Content-Type": "application/json" }),

    body: JSON.stringify({ name: newName }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Failed to rename document")

  return (await res.json()) as DocumentItem
}

export async function duplicateDocumentApi(
  id: string | number,
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}/duplicate`, {
    method: "POST",

    headers: authHeaders(),
  })

  if (!res.ok)
    throw await extractErrorMessage(res, "Failed to duplicate document")

  return (await res.json()) as DocumentItem
}

export async function updateDocumentSummaryApi(
  id: string | number,

  summary: AISummary,
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}/summary`, {
    method: "PATCH",

    headers: authHeaders({ "Content-Type": "application/json" }),

    body: JSON.stringify({ summary }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Failed to update summary")

  return (await res.json()) as DocumentItem
}

export async function updateDocumentShareSettingsApi(
  id: string | number,

  settings: {
    isPublic: boolean

    includeAudio?: boolean

    includeTranscript?: boolean

    includeSummary?: boolean

    regenerateShareId?: boolean
  },
): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE_URL}/documents/${id}/share`, {
    method: "PUT",

    headers: authHeaders({ "Content-Type": "application/json" }),

    body: JSON.stringify(settings),
  })

  if (!res.ok)
    throw await extractErrorMessage(res, "Failed to update share settings")

  return (await res.json()) as DocumentItem
}

export async function fetchPublicSharedDocumentApi(
  shareId: string,
): Promise<PublicSharedDocument> {
  const res = await fetch(
    `${API_BASE_URL}/shared/${encodeURIComponent(shareId)}`,
  )

  if (!res.ok)
    throw await extractErrorMessage(res, "Failed to load shared document")

  return (await res.json()) as PublicSharedDocument
}

export async function duplicateSharedDocumentApi(
  shareId: string,
): Promise<DocumentItem> {
  const res = await fetch(
    `${API_BASE_URL}/shared/${encodeURIComponent(shareId)}/duplicate`,
    {
      method: "POST",

      headers: authHeaders(),
    },
  )

  if (!res.ok)
    throw await extractErrorMessage(res, "Failed to duplicate shared document")

  return (await res.json()) as DocumentItem
}

// --- Auth Endpoints ---

export async function loginApi(
  creds: LoginCredentials,

  guestSessionId?: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({ ...creds, guestSessionId }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Login failed")

  return (await res.json()) as AuthResponse
}

export async function registerApi(
  creds: RegisterCredentials,

  guestSessionId?: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({ ...creds, guestSessionId }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Registration failed")

  return (await res.json()) as AuthResponse
}

export async function fetchCurrentUserApi(): Promise<User | null> {
  const token = getAuthToken()

  if (!token) return null

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: authHeaders(),
    })

    if (!res.ok) {
      if (res.status === 401) {
        clearAuth()
      }

      return null
    }

    const data = await res.json()

    return data.user as User
  } catch {
    return null
  }
}

export async function claimGuestSessionApi(
  guestSessionId: string,
): Promise<{ success: boolean claimedCount: number }> {
  const res = await fetch(`${API_BASE_URL}/auth/claim-session`, {
    method: "POST",

    headers: authHeaders({ "Content-Type": "application/json" }),

    body: JSON.stringify({ guestSessionId }),
  })

  if (!res.ok)
    throw await extractErrorMessage(res, "Failed to claim guest session")

  return await res.json()
}
