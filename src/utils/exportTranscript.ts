import { TranscriptEntry } from "../types"

/**
 * Strips common audio/video extensions and removes filesystem-unsafe characters.
 */
export function sanitizeFilename(filename: string): string {
  const cleanName = filename
    .replace(/\.(mp3|wav|m4a|mp4|webm|flac|ogg|opus|aac)$/i, "")
    .trim()
  return cleanName.replace(/[/\\?%*:|"<>]/g, "_") || "transcript"
}

/**
 * Generates continuous plain text transcript (ideal for Word, Google Docs, LLM prompts).
 */
export function generatePlainText(entries: TranscriptEntry[]): string {
  if (!entries || entries.length === 0) return ""
  return entries
    .map((e) => e.text.trim())
    .filter(Boolean)
    .join(" ")
}

/**
 * Generates structured transcript with timestamps and document header.
 */
export function generateTimestampedText(
  entries: TranscriptEntry[],
  docName?: string,
  docDate?: string,
): string {
  if (!entries || entries.length === 0) return ""

  const headerLines: string[] = []
  if (docName) {
    headerLines.push(`Audins Transcript: ${docName}`)
  }
  if (docDate) {
    headerLines.push(`Date: ${docDate}`)
  }
  if (headerLines.length > 0) {
    headerLines.push("----------------------------------------", "")
  }

  const bodyLines = entries.map((entry) => `[${entry.ts}] ${entry.text.trim()}`)
  return [...headerLines, ...bodyLines].join("\n")
}

/**
 * Converts seconds (e.g. 75.3) to SRT timestamp format: HH:MM:SS,mmm
 */
export function formatSecondsToSrtTime(totalSeconds: number): string {
  const clampedSecs = Math.max(0, totalSeconds)
  const hours = Math.floor(clampedSecs / 3600)
  const minutes = Math.floor((clampedSecs % 3600) / 60)
  const seconds = Math.floor(clampedSecs % 60)
  const milliseconds = Math.floor(
    (clampedSecs - Math.floor(clampedSecs)) * 1000,
  )

  const pad = (n: number, z = 2) => String(n).padStart(z, "0")
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`
}

/**
 * Generates standard SubRip (.srt) subtitle format.
 */
export function generateSrt(entries: TranscriptEntry[]): string {
  if (!entries || entries.length === 0) return ""

  const blocks: string[] = []

  for (let i = 0; i < entries.length; i++) {
    const current = entries[i]
    const next = entries[i + 1]

    const startSeconds = current.seconds
    // If next segment exists, use its start as end; otherwise default to start + estimated duration based on text length
    let endSeconds = next
      ? next.seconds
      : startSeconds + Math.max(3, current.text.split(" ").length * 0.4)
    if (endSeconds <= startSeconds) {
      endSeconds = startSeconds + 2.5
    }

    const startTimeFormatted = formatSecondsToSrtTime(startSeconds)
    const endTimeFormatted = formatSecondsToSrtTime(endSeconds)

    blocks.push(
      `${i + 1}\n${startTimeFormatted} --> ${endTimeFormatted}\n${current.text.trim()}`,
    )
  }

  return blocks.join("\n\n")
}

export type TranscriptExportFormat = "plain" | "timestamps" | "srt"

/**
 * Triggers a browser file download using client-side Blob generation.
 */
export function downloadTranscriptFile(
  entries: TranscriptEntry[],
  docName: string,
  format: TranscriptExportFormat,
  docDate?: string,
): void {
  if (!entries || entries.length === 0) {
    throw new Error("No transcript content to export")
  }

  const baseName = sanitizeFilename(docName)
  let content = ""
  let filename = ""

  switch (format) {
    case "plain":
      content = generatePlainText(entries)
      filename = `${baseName}_transcript.txt`
      break
    case "timestamps":
      content = generateTimestampedText(entries, docName, docDate)
      filename = `${baseName}_timestamps.txt`
      break
    case "srt":
      content = generateSrt(entries)
      filename = `${baseName}.srt`
      break
  }

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  try {
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/**
 * Copies transcript text directly to clipboard.
 */
export async function copyTranscriptToClipboard(
  entries: TranscriptEntry[],
  includeTimestamps = false,
  docName?: string,
  docDate?: string,
): Promise<void> {
  if (!entries || entries.length === 0) {
    throw new Error("No transcript content to copy")
  }

  const text = includeTimestamps
    ? generateTimestampedText(entries, docName, docDate)
    : generatePlainText(entries)

  await navigator.clipboard.writeText(text)
}
