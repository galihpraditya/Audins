import { useState, useRef, useEffect, useCallback } from "react"

import { useLanguage } from "../../context/LanguageContext"

import { useToast } from "../ui/ToastContext"

import Modal from "../ui/Modal"

import Alert from "../ui/Alert"

import {
  Microphone,
  Stop,
  Pause,
  Play,
  ArrowCounterClockwise,
  UploadSimple,
  DownloadSimple,
  X,
  Waveform,
  CheckCircle,
  DeviceMobile,
  Minus,
  CornersOut,
} from "@phosphor-icons/react"

interface LiveRecorderModalProps {
  onClose: () => void

  onUploadFile: (file: File, durationSec?: number) => void

  isMinimized?: boolean

  onMinimize?: () => void

  onExpand?: () => void

  canRecord?: boolean

  onShowLimitModal?: () => void
}

type RecordingState = "idle" | "recording" | "paused" | "preview"

export default function LiveRecorderModal({
  onClose,

  onUploadFile,

  isMinimized = false,

  onMinimize,

  onExpand,

  canRecord = true,

  onShowLimitModal,
}: LiveRecorderModalProps) {
  const { t } = useLanguage()

  const { showToast } = useToast()

  const [recordingState, setRecordingState] = useState<RecordingState>("idle")

  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)

  const [recordingName, setRecordingName] = useState("")

  const [isScreenAwake, setIsScreenAwake] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  const audioChunksRef = useRef<Blob[]>([])

  const streamRef = useRef<MediaStream | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)

  const analyserRef = useRef<AnalyserNode | null>(null)

  const animFrameRef = useRef<number | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const wakeLockRef = useRef<any>(null)

  // Clean up on unmount

  useEffect(() => {
    return () => {
      stopTracks()

      releaseWakeLock()

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

  const acquireWakeLock = async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request(
          "screen",
        )

        setIsScreenAwake(true)

        wakeLockRef.current.addEventListener("release", () => {
          setIsScreenAwake(false)
        })
      } catch (err) {
        console.warn("WakeLock request failed or unsupported:", err)
      }
    }
  }

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {})

      wakeLockRef.current = null

      setIsScreenAwake(false)
    }
  }

  // Draw real-time audio visualizer on canvas

  const startDrawLoop = useCallback(() => {
    if (!analyserRef.current) return

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)

    const analyser = analyserRef.current

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

      // Calculate number of bars to draw

      const barCount = 32

      const barWidth = Math.max(3, width / barCount - 3)

      const gap = 3

      for (let i = 0; i < barCount; i++) {
        // Mirror frequency or distribute evenly

        const dataIdx = Math.floor((i / barCount) * bufferLength)

        const value = dataArray[dataIdx] || 0

        // Calculate dynamic bar height

        const normalized = value / 255

        const minHeight = 4

        const barHeight = Math.max(minHeight, normalized * (height - 8))

        const x = i * (barWidth + gap) + 4

        const y = height / 2 - barHeight / 2

        // Gradient color: glowing coral-red to bright rose

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight)

        gradient.addColorStop(0, "rgba(244, 63, 94, 0.95)")

        gradient.addColorStop(0.5, "rgba(225, 29, 72, 0.9)")

        gradient.addColorStop(1, "rgba(251, 113, 133, 0.8)")

        ctx.fillStyle = gradient

        ctx.beginPath()

        ctx.roundRect(x, y, barWidth, barHeight, 3)

        ctx.fill()
      }
    }

    animFrameRef.current = requestAnimationFrame(draw)
  }, [])

  const startVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext

      const audioCtx = new AudioCtx()

      audioContextRef.current = audioCtx

      const source = audioCtx.createMediaStreamSource(stream)

      const analyser = audioCtx.createAnalyser()

      analyser.fftSize = 64

      analyser.smoothingTimeConstant = 0.8

      source.connect(analyser)

      analyserRef.current = analyser

      startDrawLoop()
    } catch (e) {
      console.warn("Visualizer failed to start", e)
    }
  }

  // Resume visualizer loop whenever user restores from minimized state

  useEffect(() => {
    if (
      !isMinimized &&
      analyserRef.current &&
      (recordingState === "recording" || recordingState === "paused")
    ) {
      const tId = setTimeout(() => {
        startDrawLoop()
      }, 60)

      return () => clearTimeout(tId)
    }
  }, [isMinimized, recordingState, startDrawLoop])

  // Start recording

  const handleStartRecording = async () => {
    if (!canRecord) {
      if (onShowLimitModal) onShowLimitModal()

      return
    }

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

      if (!mimeType || typeof MediaRecorder === "undefined") {
        stopTracks()

        console.error(
          "MediaRecorder: no supported audio container in this browser.",
        )

        setErrorMessage(t("recorder_unsupported"))

        setRecordingState("idle")

        return
      }

      let mediaRecorder: MediaRecorder

      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType })
      } catch (mimeErr) {
        console.warn(
          `MediaRecorder init failed with mimeType "${mimeType}", fallback to browser default`,
          mimeErr,
        )

        mediaRecorder = new MediaRecorder(stream)
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

        releaseWakeLock()

        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)

        if (isMinimized && onExpand) {
          onExpand()
        }
      }

      mediaRecorder.start(250)

      setRecordingState("recording")

      setElapsedSeconds(0)

      startVisualizer(stream)

      await acquireWakeLock()

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1)
      }, 1000)
    } catch (err: any) {
      stopTracks()

      releaseWakeLock()

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
    if (
      mediaRecorderRef.current &&
      (recordingState === "recording" || recordingState === "paused")
    ) {
      mediaRecorderRef.current.stop()

      releaseWakeLock()

      if (timerRef.current) clearInterval(timerRef.current)

      if (isMinimized && onExpand) {
        onExpand()
      }
    }
  }

  const handleDiscard = () => {
    stopTracks()

    releaseWakeLock()

    if (timerRef.current) clearInterval(timerRef.current)

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)

    if (audioUrl) URL.revokeObjectURL(audioUrl)

    setAudioUrl(null)

    setRecordedBlob(null)

    setElapsedSeconds(0)

    setRecordingState("idle")
  }

  const handleDownloadAudioOnly = () => {
    if (!recordedBlob) return

    const filename = recordingName.trim() || "live-recording"

    const ext = recordedBlob.type.includes("mp4")
      ? ".mp4"
      : recordedBlob.type.includes("ogg")
        ? ".ogg"
        : ".webm"

    const fullFilename = filename.endsWith(ext) ? filename : `${filename}${ext}`

    const tempUrl = URL.createObjectURL(recordedBlob)

    const link = document.createElement("a")

    link.href = tempUrl

    link.download = fullFilename

    document.body.appendChild(link)

    link.click()

    document.body.removeChild(link)

    setTimeout(() => URL.revokeObjectURL(tempUrl), 1000)

    showToast(t("toast_recording_downloaded"), "success")
  }

  const handleSubmit = () => {
    if (!recordedBlob) return

    if (!canRecord) {
      if (onShowLimitModal) onShowLimitModal()

      return
    }

    const filename = recordingName.trim() || "live-recording"

    const ext = recordedBlob.type.includes("mp4")
      ? ".mp4"
      : recordedBlob.type.includes("ogg")
        ? ".ogg"
        : ".webm"

    const fullFilename = filename.endsWith(ext) ? filename : `${filename}${ext}`

    const file = new File([recordedBlob], fullFilename, {
      type: recordedBlob.type,
    })

    if (audioUrl) URL.revokeObjectURL(audioUrl)

    setAudioUrl(null)

    onUploadFile(file, elapsedSeconds)

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

  // Minimized Floating Bar/Pill Mode (Ultra-minimalist, icon-only)

  if (isMinimized) {
    return (
      <aside
        role="region"
        aria-label={t("recorder_title")}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2.5 px-3 py-2 rounded-full bg-surface/90 backdrop-blur-md border border-border shadow-raised animate-slide-up select-none"
      >
        {/* Status Beacon & Elapsed Timer (Clicking expands modal) */}
        <button
          type="button"
          onClick={onExpand}
          className="flex items-center gap-2 px-1 text-left group cursor-pointer focus:outline-none"
          title={t("recorder_expand")}
          aria-label={t("recorder_expand")}
        >
          <span className="relative flex h-2.5 w-2.5">
            {recordingState === "recording" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                recordingState === "recording" ? "bg-danger" : "bg-warning"
              }`}
            />
          </span>
          <span className="text-xs sm:text-sm font-mono font-bold text-fg tracking-wider group-hover:text-primary transition-colors">
            {formatTime(elapsedSeconds)}
          </span>
        </button>

        {/* Subtle divider */}
        <span className="h-4 w-px bg-border" aria-hidden="true" />

        {/* Transport Controls (Clean icon-only circular buttons) */}
        <div className="flex items-center gap-1">
          {recordingState === "recording" ? (
            <button
              type="button"
              onClick={handlePause}
              aria-label={t("btn_pause")}
              title={t("btn_pause")}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-2 hover:bg-surface-3 active:scale-95 text-fg border border-border transition-colors cursor-pointer"
            >
              <Pause size={14} weight="bold" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleResume}
              aria-label={t("btn_resume")}
              title={t("btn_resume")}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-primary hover:bg-primary-hover active:scale-95 text-primary-contrast transition-colors cursor-pointer"
            >
              <Play size={14} weight="fill" />
            </button>
          )}

          <button
            type="button"
            onClick={handleStop}
            aria-label={t("btn_stop_preview")}
            title={t("btn_stop_preview")}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-danger hover:bg-danger/90 active:scale-95 text-danger-contrast transition-all cursor-pointer shadow-xs"
          >
            <Stop size={14} weight="fill" />
          </button>

          <button
            type="button"
            onClick={onExpand}
            aria-label={t("recorder_expand")}
            title={t("recorder_expand")}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-2 hover:bg-surface-3 active:scale-95 text-fg-secondary hover:text-fg border border-border transition-colors cursor-pointer"
          >
            <CornersOut size={14} weight="bold" />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="recorder-modal-title"
      dismissible={
        recordingState !== "recording" && recordingState !== "paused"
      }
      panelClassName="w-full max-w-lg rounded-2xl overflow-hidden bg-surface border border-border shadow-raised animate-scale-in flex flex-col relative"
    >
      {/* Modal Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
              recordingState === "recording"
                ? "bg-danger text-danger-contrast animate-pulse shadow-sm shadow-danger/40"
                : recordingState === "paused"
                  ? "bg-warning/20 text-warning"
                  : "bg-danger-dim text-danger"
            }`}
          >
            <Microphone size={22} weight="duotone" />
          </div>
          <div>
            <h2
              id="recorder-modal-title"
              className="text-base sm:text-lg font-bold font-display text-fg tracking-tight"
            >
              {t("recorder_title")}
            </h2>
            <p className="text-xs text-fg-tertiary">{t("recorder_desc")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(recordingState === "recording" || recordingState === "paused") &&
            onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                aria-label={t("recorder_minimize")}
                title={t("recorder_minimize")}
              >
                <Minus size={18} weight="bold" />
              </button>
            )}
          {recordingState !== "recording" && recordingState !== "paused" && (
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
              aria-label={t("btn_close")}
            >
              <X size={16} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {/* Modal Body */}
      <div className="p-5 sm:p-8 space-y-4 sm:space-y-6 flex-1">
        {/* Error Banner */}
        {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

        {/* Visualizer & Animated Stage Area */}
        <div className="relative flex flex-col items-center justify-center py-6 sm:py-7 px-3 sm:px-4 rounded-2xl bg-surface-2/70 border border-border overflow-hidden space-y-4 sm:space-y-5">
          {/* Animated Central Microphone Hub */}
          <div className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 my-1">
            {/* Sonar Radar Waves during active recording */}
            {recordingState === "recording" && (
              <>
                <span className="absolute w-20 h-20 rounded-full bg-danger/25 animate-sonar-1 pointer-events-none" />
                <span className="absolute w-20 h-20 rounded-full bg-danger/20 animate-sonar-2 pointer-events-none" />
                <span className="absolute w-20 h-20 rounded-full bg-danger/15 animate-sonar-3 pointer-events-none" />
              </>
            )}

            {/* Glowing Aura Ring */}
            <div
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${
                recordingState === "recording"
                  ? "bg-danger text-danger-contrast shadow-lg animate-recording-glow scale-105"
                  : recordingState === "paused"
                    ? "bg-warning text-warning-contrast animate-paused-glow"
                    : recordingState === "preview"
                      ? "bg-success text-success-contrast"
                      : "bg-surface-3 text-fg-secondary hover:text-danger hover:scale-105 border border-border"
              }`}
            >
              {recordingState === "recording" && (
                <Waveform size={36} weight="bold" className="animate-pulse" />
              )}
              {recordingState === "paused" && <Pause size={32} weight="fill" />}
              {recordingState === "preview" && (
                <CheckCircle size={36} weight="fill" />
              )}
              {recordingState === "idle" && (
                <Microphone size={34} weight="duotone" />
              )}
            </div>
          </div>

          {/* Live Timer with Sonar Beacon */}
          <div className="flex flex-col items-center gap-1.5 z-10">
            <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-surface/80 border border-border shadow-xs">
              <span className="relative flex h-2.5 w-2.5">
                {recordingState === "recording" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    recordingState === "recording"
                      ? "bg-danger"
                      : recordingState === "paused"
                        ? "bg-warning"
                        : recordingState === "preview"
                          ? "bg-success"
                          : "bg-fg-tertiary"
                  }`}
                />
              </span>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-fg tracking-wider">
                {formatTime(elapsedSeconds)}
              </span>
            </div>

            {/* Status Label */}
            <p className="text-xs font-mono text-fg-tertiary text-center pt-1">
              {recordingState === "idle" && t("recorder_idle_hint")}
              {recordingState === "recording" && t("recorder_recording")}
              {recordingState === "paused" && t("recorder_paused")}
              {recordingState === "preview" && t("recorder_finished")}
            </p>
          </div>

          {/* Audio Wave Visualizer Canvas */}
          {(recordingState === "recording" || recordingState === "paused") && (
            <div className="w-full h-12 sm:h-16 flex items-center justify-center overflow-hidden z-10 px-2">
              <canvas
                ref={canvasRef}
                width={360}
                height={60}
                className="w-full h-full max-w-[280px] sm:max-w-sm"
              />
            </div>
          )}

          {/* Preview Audio Player */}
          {recordingState === "preview" && audioUrl && (
            <div className="w-full pt-1 z-10 animate-fade-in">
              <audio
                src={audioUrl}
                controls
                className="w-full h-10 accent-primary rounded-xl"
              />
            </div>
          )}
        </div>

        {/* Preview Form: Name input */}
        {recordingState === "preview" && (
          <div className="space-y-2 animate-fade-in">
            <label
              htmlFor="recording-name"
              className="block text-xs font-mono font-semibold text-fg-secondary uppercase tracking-wider"
            >
              {t("recorder_name_label")}
            </label>
            <input
              id="recording-name"
              type="text"
              value={recordingName}
              onChange={(e) => setRecordingName(e.target.value)}
              placeholder={t("recorder_name_placeholder")}
              className="w-full px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm bg-surface-2 border border-border text-fg outline-none focus:border-primary transition-colors font-sans min-h-[42px]"
            />
          </div>
        )}

        {/* Recording Controls */}
        <div className="w-full pt-1 sm:pt-2">
          {recordingState === "idle" && (
            <button
              type="button"
              onClick={handleStartRecording}
              className="group w-full py-3 px-6 rounded-xl text-sm font-semibold text-danger-contrast bg-danger hover:bg-danger/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 min-h-[46px] shadow-sm hover:shadow-danger/20 cursor-pointer"
            >
              <Microphone
                size={18}
                weight="bold"
                className="group-hover:scale-110 transition-transform"
              />
              <span>{t("btn_start_record")}</span>
            </button>
          )}

          {recordingState === "recording" && (
            <div className="flex items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={handlePause}
                className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs font-semibold bg-surface-2 hover:bg-surface-3 active:scale-95 text-fg transition-all flex items-center gap-2 cursor-pointer border border-border min-h-[44px]"
              >
                <Pause size={16} weight="bold" />
                <span>{t("btn_pause")}</span>
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="flex-1 py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl text-xs sm:text-sm font-semibold text-danger-contrast bg-danger hover:bg-danger/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer min-h-[44px]"
              >
                <Stop size={18} weight="fill" />
                <span>{t("btn_stop_preview")}</span>
              </button>
            </div>
          )}

          {recordingState === "paused" && (
            <div className="flex items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={handleResume}
                className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover active:scale-95 text-primary-contrast transition-all flex items-center gap-2 cursor-pointer min-h-[44px]"
              >
                <Play size={16} weight="fill" />
                <span>{t("btn_resume")}</span>
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="flex-1 py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl text-xs sm:text-sm font-semibold text-danger-contrast bg-danger hover:bg-danger/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer min-h-[44px]"
              >
                <Stop size={18} weight="fill" />
                <span>{t("btn_stop_preview")}</span>
              </button>
            </div>
          )}

          {recordingState === "preview" && (
            <div className="flex flex-col gap-2.5 w-full animate-fade-in">
              {/* Primary Action Button */}
              <button
                type="button"
                onClick={handleSubmit}
                className="w-full py-3 px-6 rounded-xl text-xs sm:text-sm font-semibold text-primary-contrast bg-primary hover:bg-primary-hover active:scale-[0.99] transition-all flex items-center justify-center gap-2 min-h-[46px] shadow-sm cursor-pointer"
              >
                <UploadSimple size={18} weight="bold" />
                <span>{t("btn_submit_transcribe")}</span>
              </button>

              {/* Secondary Actions: 50/50 Balanced Grid */}
              <div className="grid grid-cols-2 gap-2.5 w-full">
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="group py-2.5 px-3 rounded-xl text-xs font-semibold bg-surface-2 hover:bg-surface-3 active:scale-95 text-fg-secondary hover:text-fg transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-border min-h-[42px]"
                  title={t("btn_rerecord")}
                >
                  <ArrowCounterClockwise
                    size={15}
                    weight="bold"
                    className="group-hover:-rotate-90 transition-transform duration-200 flex-shrink-0"
                  />
                  <span className="truncate">{t("btn_rerecord")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAudioOnly}
                  className="group py-2.5 px-3 rounded-xl text-xs font-semibold bg-surface-2 hover:bg-surface-3 active:scale-95 text-fg-secondary hover:text-fg transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-border min-h-[42px]"
                  title={t("btn_download_audio_only")}
                >
                  <DownloadSimple
                    size={15}
                    weight="bold"
                    className="text-primary group-hover:scale-110 transition-transform duration-200 flex-shrink-0"
                  />
                  <span className="truncate">
                    {t("btn_download_audio_only")}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
