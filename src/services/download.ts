import { DocumentItem } from "../types"
import { API_BASE_URL, authHeaders, ApiError } from "./api"

export function resolveAudioFilename(doc: DocumentItem): string {
  const filename = doc.name.trim()
  const extRegex = /\.(mp3|wav|m4a|mp4|webm|flac|ogg|opus|aac)$/i
  if (extRegex.test(filename)) return filename

  const urlExtMatch = doc.audioUrl?.match(extRegex)
  const ext = urlExtMatch ? urlExtMatch[0] : ".mp3"
  return `${filename}${ext}`
}

/** Downloads a document's source audio through the authenticated proxy. */
export async function downloadAudioFile(doc: DocumentItem): Promise<void> {
  if (!doc.audioUrl || doc.audioUrl === "Expired") {
    throw new ApiError("Audio file not found", 404)
  }

  const res = await fetch(`${API_BASE_URL}/documents/${doc.id}/download`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new ApiError("Download failed", res.status)

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  try {
    anchor.href = url
    anchor.download = resolveAudioFilename(doc)
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
