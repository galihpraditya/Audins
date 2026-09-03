export type DocumentStatus = "Completed" | "Processing" | "Failed"

export interface TranscriptEntry {
  ts: string
  seconds: number
  text: string
}

export interface AISummarySection {
  heading: string
  content: string[]
}

export interface AISummary {
  title: string
  sections: AISummarySection[]
  modelUsed?: string
  createdAt?: string
}

export interface DocumentItem {
  id: number | string
  name: string
  createdAt: string
  userId?: string
  sizeBytes?: number
  uploadProgress?: number
  date: string
  duration: string
  durationSec?: number
  status: DocumentStatus
  audioUrl?: string
  transcripts?: TranscriptEntry[]
  summary?: AISummary
  /** Non-fatal processing notes surfaced from the backend pipeline. */
  warnings?: string[]
}

export interface RateLimitResponse {
  remaining: number
  maxLimit: number
  resetTime: string
  ip: string
  storageUsed: number
  storageLimit: number
}

export type ApiKeyStatus = "idle" | "validating" | "valid" | "invalid"

export type QuotaSnapshot = {
  uploadCount: number
  maxUploads: number
  storageUsed: number
  storageLimit: number
  resetTime: string
}

export interface User {
  id: string
  email: string
  name?: string
  createdAt?: string
}

export interface AuthResponse {
  user: User
  token: string
  provider: "supabase" | "local"
  claimedCount?: number
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  name?: string
}

export type SyncStatus = "synced" | "syncing" | "offline" | "guest"

