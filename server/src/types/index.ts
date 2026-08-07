export type DocumentStatus = 'Completed' | 'Processing' | 'Failed'

export interface DocumentItem {
  id: string
  name: string
  date: string
  duration: string
  durationSec: number
  status: DocumentStatus
  audioUrl?: string
  createdAt: string
  userId?: string
}

export interface TranscriptEntry {
  ts: string
  seconds: number
  text: string
  speaker?: string
}

export interface AISummarySection {
  heading: string
  content: string[]
}

export interface AISummary {
  title: string
  sections: AISummarySection[]
  modelUsed: string
  createdAt: string
}

export interface FullDocument extends DocumentItem {
  transcripts: TranscriptEntry[]
  summary?: AISummary
}

export interface RateLimitResponse {
  remaining: number
  maxLimit: number
  resetTime: string
  ip: string
}
