export type Screen = "dashboard" | "workspace"

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
}

export interface DocumentItem {
  id: number | string
  name: string
  date: string
  duration: string
  durationSec?: number
  status: DocumentStatus
  audioUrl?: string
  transcripts?: TranscriptEntry[]
  summary?: AISummary
  userId?: string
}
