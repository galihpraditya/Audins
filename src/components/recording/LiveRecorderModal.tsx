import { useState, useRef, useEffect } from "react"
import { useLanguage } from "../../context/LanguageContext"
import Modal from "../ui/Modal"
import Alert from "../ui/Alert"
import {
  Microphone,
  Stop,
  Pause,
  Play,
  ArrowCounterClockwise,
  UploadSimple,
  X,
  Clock,
} from "@phosphor-icons/react"

interface LiveRecorderModalProps {
  onClose: () => void
  onUploadFile: (file: File) => void
}

type RecordingState = "idle" | "recording" | "paused" | "preview"

export default function LiveRecorderModal({
  onClose,
  onUploadFile,
}: LiveRecorderModalProps) {
  const { t } = useLanguage()
  const [recordingState, setRecordingState] = useState<RecordingState>("idle")
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordingName, setRecordingName] = useState("")

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopTracks()
      if (timerRef.current) clearInterval(timerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  // Draw real-time audio visualizer on canvas
  const startVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const audioCtx = new AudioCtx()
      audioContextRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const draw = () => {
        if (!canvasRef.current || !analyserRef.current) return
        animFrameRef.current = requestAnimationFrame(draw)

        analyserRef.current.getByteFrequencyData(dataArray)
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const width = canvas.width
        const height = canvas.height
        const barWidth = (width / bufferLength) * 2.2
        let x = 0

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height * 0.9 + 4

          // Gradient color: deep teal â†’ bright teal (brand family)
          const gradient = ctx.createLinearGradient(0, height, 0, 0)
          gradient.addColorStop(0, "rgba(15, 118, 110, 0.85)")
          gradient.addColorStop(1, "rgba(45, 212, 191, 0.95)")

          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.roundRect(x, height - barHeight, Math.max(3, barWidth - 3), barHeight, 4)
          ctx.fill()

          x += barWidth + 2
        }
      }

      draw()
    } catch (e) {
      console.warn("Visualizer failed to start", e)
    }
  }

  // Start recording
  const handleStartRecording = async () => {
    setErrorMessage(null)
    audioChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : ""

      // No supported container (some Safari builds): constructing a
      // MediaRecorder with an unsupported type throws NotSupportedError and
      // would leak the live mic track — bail out before that happens.
      if (!mimeType || typeof MediaRecorder === "undefined") {
        stopTracks()
        console.error("MediaRecorder: no supported audio container in this browser.")
        setErrorMessage(t("recorder_unsupported"))
        setRecordingState("idle")
        return
      }

      let mediaRecorder: MediaRecorder
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType })
      } catch (recError) {
        // Belt-and-braces: any constructor failure must release the mic.
        stopTracks()
        throw recError
      }
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        setRecordedBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setRecordingState("preview")

        const now = new Date()
        const dateStr = now.toISOString().slice(0, 10)
        const timeStr = now.toTimeString().slice(0, 5).replace(":", "")
        setRecordingName(`Recording-${dateStr}-${timeStr}`)

        stopTracks()
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      }

      mediaRecorder.start(250)
      setRecordingState("recording")
      setElapsedSeconds(0)

      startVisualizer(stream)

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1)
      }, 1000)
    } catch (err: any) {
      // Always release the microphone on ANY failure so the OS recording
      // indicator clears and a retry cannot stack up leaked streams.
      stopTracks()
      console.error("Microphone access error:", err)
      setErrorMessage(t("recorder_mic_error"))
      setRecordingState("idle")
    }
  }

  const handlePause = () => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      mediaRecorderRef.current.pause()
      setRecordingState("paused")
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const handleResume = () => {
    if (mediaRecorderRef.current && recordingState === "paused") {
      mediaRecorderRef.current.resume()
      setRecordingState("recording")
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1)
      }, 1000)
    }
  }

  const handleStop = () => {
    if (mediaRecorderRef.current && (recordingState === "recording" || recordingState === "paused")) {
      mediaRecorderRef.current.stop()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const handleDiscard = () => {
    stopTracks()
    if (timerRef.current) clearInterval(timerRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setRecordedBlob(null)
    setElapsedSeconds(0)
    setRecordingState("idle")
  }

  const handleSubmit = () => {
    if (!recordedBlob) return
    const filename = recordingName.trim() || "live-recording"
    const ext = recordedBlob.type.includes("mp4")
      ? ".mp4"
      : recordedBlob.type.includes("ogg")
        ? ".ogg"
        : ".webm"

    const fullFilename = filename.endsWith(ext) ? filename : `${filename}${ext}`
    const file = new File([recordedBlob], fullFilename, { type: recordedBlob.type })
    // Ownership of the audio transfers to the uploaded File; release the
    // preview URL so the blob isn't kept alive by this modal.
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    onUploadFile(file)
    onClose()
  }

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="recorder-modal-title"
      dismissible={recordingState !== "recording"}
      panelClassName="w-full max-w-lg rounded-2xl overflow-hidden bg-surface border border-border shadow-raised animate-scale-in flex flex-col relative"
    >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-danger-dim text-danger">
              <Microphone size={22} weight="duotone" />
            </div>
            <div>
              <h2 id="recorder-modal-title" className="text-base sm:text-lg font-bold font-display text-fg tracking-tight">
                {t("recorder_title")}
              </h2>
              <p className="text-xs text-fg-tertiary">
                {t("recorder_desc")}
              </p>
            </div>
          </div>
          {recordingState !== "recording" && (
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors"
              aria-label={t("btn_close")}
            >
              <X size={16} weight="bold" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6 flex-1">
          {/* Error Banner */}
          {errorMessage && (
            <Alert variant="danger">{errorMessage}</Alert>
          )}

          {/* Visualizer & Timer Area */}
          <div className="flex flex-col items-center justify-center py-6 px-4 rounded-xl bg-surface-2/60 border border-border space-y-4">
            {/* Live Timer */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  recordingState === "recording"
                    ? "bg-danger animate-pulse"
                    : recordingState === "paused"
                      ? "bg-warning"
                      : "bg-fg-tertiary"
                }`}
              />
              <span className="text-3xl sm:text-4xl font-mono font-bold text-fg tracking-wider">
                {formatTime(elapsedSeconds)}
              </span>
            </div>

            {/* Status Label */}
            <p className="text-xs font-mono text-fg-tertiary">
              {recordingState === "idle" && t("recorder_idle_hint")}
              {recordingState === "recording" && t("recorder_recording")}
              {recordingState === "paused" && t("recorder_paused")}
              {recordingState === "preview" && t("recorder_finished")}
            </p>

            {/* Audio Wave Visualizer Canvas */}
            {(recordingState === "recording" || recordingState === "paused") && (
              <div className="w-full h-16 sm:h-20 flex items-center justify-center overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={380}
                  height={80}
                  className="w-full h-full max-w-sm"
                />
              </div>
            )}

            {/* Preview Audio Player */}
            {recordingState === "preview" && audioUrl && (
              <div className="w-full pt-2">
                <audio src={audioUrl} controls className="w-full h-10 accent-primary rounded-xl" />
              </div>
            )}
          </div>

          {/* Preview Form: Name input */}
          {recordingState === "preview" && (
            <div className="space-y-2 animate-fade-in">
              <label htmlFor="recording-name" className="block text-xs font-mono font-semibold text-fg-secondary uppercase tracking-wider">
                {t("recorder_name_label")}
              </label>
              <input
                id="recording-name"
                type="text"
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
                placeholder={t("recorder_name_placeholder")}
                className="w-full px-4 py-3 rounded-2xl text-xs sm:text-sm bg-surface-2 border border-border text-fg outline-none focus:border-primary transition-colors font-sans"
              />
            </div>
          )}

          {/* Recording Controls */}
          <div className="flex items-center justify-center gap-3 pt-2">
            {recordingState === "idle" && (
              <button
                onClick={handleStartRecording}
                className="w-full py-3.5 px-6 rounded-xl text-sm font-semibold text-danger-contrast bg-danger hover:bg-danger/90 transition-colors flex items-center justify-center gap-2 min-h-[46px]"
              >
                <Microphone size={18} weight="bold" />
                <span>{t("btn_start_record")}</span>
              </button>
            )}

            {recordingState === "recording" && (
              <>
                <button
                  onClick={handlePause}
                  className="px-5 py-3 rounded-xl text-xs font-semibold bg-surface-2 hover:bg-surface-3 text-fg transition-colors flex items-center gap-2"
                >
                  <Pause size={16} weight="bold" />
                  <span>{t("btn_pause")}</span>
                </button>
                <button
                  onClick={handleStop}
                  className="flex-1 py-3 px-6 rounded-xl text-sm font-semibold text-danger-contrast bg-danger hover:bg-danger/90 transition-colors flex items-center justify-center gap-2"
                >
                  <Stop size={18} weight="fill" />
                  <span>{t("btn_stop_preview")}</span>
                </button>
              </>
            )}

            {recordingState === "paused" && (
              <>
                <button
                  onClick={handleResume}
                  className="px-5 py-3 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-contrast transition-colors flex items-center gap-2"
                >
                  <Play size={16} weight="fill" />
                  <span>{t("btn_resume")}</span>
                </button>
                <button
                  onClick={handleStop}
                  className="flex-1 py-3 px-6 rounded-xl text-sm font-semibold text-danger-contrast bg-danger hover:bg-danger/90 transition-colors flex items-center justify-center gap-2"
                >
                  <Stop size={18} weight="fill" />
                  <span>{t("btn_stop_preview")}</span>
                </button>
              </>
            )}

            {recordingState === "preview" && (
              <>
                <button
                  onClick={handleDiscard}
                  className="px-4 py-3 rounded-xl text-xs font-semibold bg-surface-2 hover:bg-surface-3 text-fg-secondary hover:text-fg transition-colors flex items-center gap-1.5"
                >
                  <ArrowCounterClockwise size={16} weight="bold" />
                  <span>{t("btn_rerecord")}</span>
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 py-3 px-6 rounded-xl text-sm font-semibold text-primary-contrast bg-primary hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <UploadSimple size={18} weight="bold" />
                  <span>{t("btn_submit_transcribe")}</span>
                </button>
              </>
            )}
          </div>
        </div>
    </Modal>
  )
}
