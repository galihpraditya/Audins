import { registerPlugin, Capacitor } from "@capacitor/core"

export interface NativeRecordingResult {
  value: boolean
  base64: string
  mimeType: string
  durationMs: number
  fileName: string
  sizeBytes: number
}

export interface NativeRecordingStatus {
  status: "idle" | "recording" | "paused"
  filePath?: string
}

export interface BackgroundAudioRecorderPlugin {
  canRecord(): Promise<{ value: boolean }>
  hasPermission(): Promise<{ value: boolean }>
  requestPermission(): Promise<{ value: boolean }>
  startRecording(): Promise<{ value: boolean; filePath: string }>
  pauseRecording(): Promise<{ value: boolean }>
  resumeRecording(): Promise<{ value: boolean }>
  stopRecording(): Promise<NativeRecordingResult>
  getStatus(): Promise<NativeRecordingStatus>
}

export const BackgroundAudioRecorder = registerPlugin<BackgroundAudioRecorderPlugin>(
  "BackgroundAudioRecorder",
)

export function isNativeMobile(): boolean {
  return Capacitor.isNativePlatform()
}

export function base64ToFile(
  base64Data: string,
  fileName: string,
  mimeType: string,
): File {
  const byteCharacters = atob(base64Data)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: mimeType })
  return new File([blob], fileName, { type: mimeType })
}
