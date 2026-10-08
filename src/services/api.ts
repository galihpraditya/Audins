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

const AUTH_REFRESH_TOKEN_KEY = "audin_refresh_token"

const AUTH_USER_KEY = "audin_auth_user"

const AUTH_REMEMBER_ME_KEY = "audin_remember_me"

export function isRememberMe(): boolean {
  try {
    return localStorage.getItem(AUTH_REMEMBER_ME_KEY) !== "false"
  } catch {
    return true
  }
}

export function getAuthToken(): string | null {
  try {
    return (
      localStorage.getItem(AUTH_TOKEN_KEY) ||
      sessionStorage.getItem(AUTH_TOKEN_KEY)
    )
  } catch {
    return null
  }
}

export function getRefreshToken(): string | null {
  try {
    return (
      localStorage.getItem(AUTH_REFRESH_TOKEN_KEY) ||
      sessionStorage.getItem(AUTH_REFRESH_TOKEN_KEY)
    )
  } catch {
    return null
  }
}

export function setAuthToken(token: string, rememberMe = true): void {
  try {
    localStorage.setItem(AUTH_REMEMBER_ME_KEY, rememberMe ? "true" : "false")
    if (rememberMe) {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
      sessionStorage.removeItem(AUTH_TOKEN_KEY)
    } else {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    /* non-fatal */
  }
}

export function setRefreshToken(
  refreshToken: string | undefined,
  rememberMe = true,
): void {
  try {
    if (!refreshToken) {
      localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY)
      sessionStorage.removeItem(AUTH_REFRESH_TOKEN_KEY)
      return
    }
    if (rememberMe) {
      localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken)
      sessionStorage.removeItem(AUTH_REFRESH_TOKEN_KEY)
    } else {
      sessionStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken)
      localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY)
    }
  } catch {
    /* non-fatal */
  }
}

export function removeAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY)
    sessionStorage.removeItem(AUTH_REFRESH_TOKEN_KEY)
  } catch {
    /* non-fatal */
  }
}

export function getStoredUser(): User | null {
  try {
    const raw =
      localStorage.getItem(AUTH_USER_KEY) ||
      sessionStorage.getItem(AUTH_USER_KEY)

    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: User, rememberMe = true): void {
  try {
    const serialized = JSON.stringify(user)
    if (rememberMe) {
      localStorage.setItem(AUTH_USER_KEY, serialized)
      sessionStorage.removeItem(AUTH_USER_KEY)
    } else {
      sessionStorage.setItem(AUTH_USER_KEY, serialized)
      localStorage.removeItem(AUTH_USER_KEY)
    }
  } catch {
    /* non-fatal */
  }
}

export function clearAuth(): void {
  removeAuthToken()

  try {
    localStorage.removeItem(AUTH_USER_KEY)
    sessionStorage.removeItem(AUTH_USER_KEY)
    localStorage.removeItem(AUTH_REMEMBER_ME_KEY)
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

export function rotateSessionId(): string {
  const newId = generateSessionId()
  try {
    localStorage.setItem(SESSION_KEY, newId)
  } catch {
    /* non-fatal */
  }
  ephemeralSessionId = newId
  return newId
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

export async function refreshTokenApi(
  refreshToken: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Failed to refresh session")

  const data = (await res.json()) as AuthResponse
  const remember = isRememberMe()
  setAuthToken(data.token, remember)
  if (data.refreshToken) {
    setRefreshToken(data.refreshToken, remember)
  }
  setStoredUser(data.user, remember)

  return data
}

let refreshPromise: Promise<string | null> | null = null

export async function refreshAccessTokenSingleFlight(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  const rt = getRefreshToken()
  if (!rt) return null

  refreshPromise = (async () => {
    try {
      const data = await refreshTokenApi(rt)
      return data.token
    } catch {
      clearAuth()
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

const DOCS_CACHE_PREFIX = "audin_cached_docs_"

function isNotDemoDoc(d: DocumentItem): boolean {
  return d.id !== "doc-1" && d.id !== "doc-2" && d.id !== "doc-3"
}

export function getCachedDocuments(userKey?: string): DocumentItem[] {
  try {
    const key = `${DOCS_CACHE_PREFIX}${userKey || getSessionId()}`
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isNotDemoDoc)
  } catch {
    return []
  }
}

export function setCachedDocuments(
  docs: DocumentItem[],
  userKey?: string,
): void {
  try {
    const key = `${DOCS_CACHE_PREFIX}${userKey || getSessionId()}`
    // Filter demo docs and cache up to 100 most recent documents
    const safeDocs = docs.filter(isNotDemoDoc).slice(0, 100)
    localStorage.setItem(key, JSON.stringify(safeDocs))
  } catch {
    /* non-fatal if storage quota exceeded */
  }
}

const COLD_START_STATUSES = new Set([502, 503, 504])

export interface ColdStartFetchOptions extends RequestInit {
  maxRetries?: number
  initialDelayMs?: number
  onColdStartDetected?: () => void
}

/**
 * Universal fetch wrapper that injects standard auth/session headers and
 * transparently refreshes expired access tokens upon receiving HTTP 401.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = authHeaders(
    (options.headers as Record<string, string>) || {},
  )

  let res = await fetch(url, {
    ...options,
    headers,
  })

  // If 401 Unauthorized occurs and we had a stored token, auto-refresh once and replay request
  if (res.status === 401 && getAuthToken()) {
    const newToken = await refreshAccessTokenSingleFlight()
    if (newToken) {
      const retryHeaders = authHeaders(
        (options.headers as Record<string, string>) || {},
      )
      res = await fetch(url, {
        ...options,
        headers: retryHeaders,
      })
    }
  }

  return res
}

/**
 * Enhanced fetch wrapper with auto-retry specifically tuned for Render Free Tier cold starts.
 * When Render is asleep, requests often hang or return 502/503/504 until the container is ready.
 */
export async function fetchWithColdStartRetry(
  url: string,
  options: ColdStartFetchOptions = {},
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 2500,
    onColdStartDetected,
    ...fetchOptions
  } = options

  let slowTimer: ReturnType<typeof setTimeout> | null = null
  if (onColdStartDetected) {
    slowTimer = setTimeout(() => {
      onColdStartDetected()
    }, 3500)
  }

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetchWithAuth(url, fetchOptions)
        // If not a gateway cold start error (or last attempt), return response
        if (!COLD_START_STATUSES.has(res.status) || attempt === maxRetries) {
          return res
        }
        if (onColdStartDetected) onColdStartDetected()
      } catch (err: any) {
        if (attempt === maxRetries) throw err
        if (onColdStartDetected) onColdStartDetected()
      }

      // Backoff before next attempt (e.g. 2.5s, 3.75s, 5.6s)
      const delay = initialDelayMs * Math.pow(1.5, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    return await fetchWithAuth(url, fetchOptions)
  } finally {
    if (slowTimer) clearTimeout(slowTimer)
  }
}

export async function fetchDocumentsFromApi(
  onColdStart?: () => void,
): Promise<DocumentItem[]> {
  const res = await fetchWithColdStartRetry(`${API_BASE_URL}/documents`, {
    maxRetries: 3,
    initialDelayMs: 2500,
    onColdStartDetected: onColdStart,
  })

  if (!res.ok) throw await extractErrorMessage(res, "Failed to load documents")

  return (await res.json()) as DocumentItem[]
}

export async function fetchRateLimitApi(): Promise<RateLimitResponse> {
  const res = await fetchWithAuth(`${API_BASE_URL}/settings/rate-limit`)

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
    const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}`)

    if (!res.ok) return null

    return (await res.json()) as DocumentItem
  } catch {
    return null
  }
}

/**
 * Fetches single document details by ID.
 * Returns null if the document does not exist (404).
 * Throws ApiError on network or server errors.
 */
export async function fetchDocumentByIdApi(
  id: string | number,
): Promise<DocumentItem | null> {
  const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}`)

  if (res.status === 404) return null
  if (!res.ok) throw await extractErrorMessage(res, "Failed to load document")

  return (await res.json()) as DocumentItem
}

export async function reSummarizeApi(
  id: string | number,
  userApiKey?: string,
  customPrompt?: string,
): Promise<DocumentItem> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (userApiKey) {
    headers["X-Groq-API-Key"] = userApiKey
  }

  const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}/summarize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ customPrompt }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Summarize failed")

  return (await res.json()) as DocumentItem
}

export async function deleteDocumentApi(id: string | number): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}`, {
    method: "DELETE",
  })

  if (!res.ok) {
    throw await extractErrorMessage(res, "Failed to delete document")
  }
}

export async function deleteAudioOnlyApi(
  id: string | number,
): Promise<DocumentItem> {
  const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}/audio`, {
    method: "DELETE",
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (userApiKey) {
    headers["X-Groq-API-Key"] = userApiKey
  }

  const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}/retranscribe`, {
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
  const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Failed to rename document")

  return (await res.json()) as DocumentItem
}

export async function duplicateDocumentApi(
  id: string | number,
): Promise<DocumentItem> {
  const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}/duplicate`, {
    method: "POST",
  })

  if (!res.ok)
    throw await extractErrorMessage(res, "Failed to duplicate document")

  return (await res.json()) as DocumentItem
}

export async function updateDocumentSummaryApi(
  id: string | number,
  summary: AISummary,
): Promise<DocumentItem> {
  const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}/summary`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetchWithAuth(`${API_BASE_URL}/documents/${id}/share`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetchWithAuth(
    `${API_BASE_URL}/shared/${encodeURIComponent(shareId)}/duplicate`,
    {
      method: "POST",
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
  documentIds?: string[],
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",

    headers: authHeaders({ "Content-Type": "application/json" }),

    body: JSON.stringify({
      ...creds,
      guestSessionId: guestSessionId ?? null,
      documentIds: documentIds && documentIds.length > 0 ? documentIds : undefined,
    }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Login failed")

  return (await res.json()) as AuthResponse
}

export async function registerApi(
  creds: RegisterCredentials,
  guestSessionId?: string,
  documentIds?: string[],
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",

    headers: authHeaders({ "Content-Type": "application/json" }),

    body: JSON.stringify({
      ...creds,
      guestSessionId: guestSessionId ?? null,
      documentIds: documentIds && documentIds.length > 0 ? documentIds : undefined,
    }),
  })

  if (!res.ok) throw await extractErrorMessage(res, "Registration failed")

  return (await res.json()) as AuthResponse
}

export async function fetchCurrentUserApi(): Promise<User | null> {
  const token = getAuthToken()

  if (!token) return null

  try {
    const res = await fetchWithAuth(`${API_BASE_URL}/auth/me`)

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
  documentIds?: string[],
  claimAllUnowned?: boolean,
): Promise<{ success: boolean; claimedCount: number }> {
  const res = await fetchWithAuth(`${API_BASE_URL}/auth/claim-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guestSessionId,
      documentIds: documentIds && documentIds.length > 0 ? documentIds : undefined,
      claimAllUnowned,
    }),
  })

  if (!res.ok)
    throw await extractErrorMessage(res, "Failed to claim guest session")

  return await res.json()
}

export async function claimOrphanedDocumentsApi(): Promise<{
  success: boolean
  claimedCount: number
}> {
  const res = await fetchWithAuth(`${API_BASE_URL}/auth/claim-orphans`, {
    method: "POST",
  })

  if (!res.ok)
    throw await extractErrorMessage(res, "Failed to claim orphaned documents")

  return await res.json()
}
