import { useState, useRef, useEffect, PointerEvent, MouseEvent } from "react"
import { useLanguage } from "../../context/LanguageContext"
import { useToast } from "../ui/ToastContext"
import { extractWaveformPeaks } from "../../utils/audioWaveform"
import {
  Play,
  Pause,
  ArrowCounterClockwise,
  ArrowClockwise,
  DownloadSimple,
  SpeakerHigh,
  SpeakerSimpleX,
  Gauge,
  Waveform,
  Spinner,
  WarningCircle,
} from "@phosphor-icons/react"

interface AudioPlayerProps {
  audioUrl?: string
  currentTime: number
  setCurrentTime: (time: number) => void
  durationSeconds?: number
  onDownload?: () => void
  /**
   * Controlled play state. When provided (by Workspace), a second compact
   * instance elsewhere in the tree can drive the SAME playback without
   * mounting a second <audio> element.
   */
  isPlaying?: boolean
  onPlayingChange?: (playing: boolean) => void
  /** Renders a single-row transport with NO <audio> element. */
  compact?: boolean
}

export default function AudioPlayer({
  audioUrl,
  currentTime,
  setCurrentTime,
  durationSeconds: initialDurationSec = 0,
  onDownload,
  isPlaying: controlledPlaying,
  onPlayingChange,
  compact = false,
}: AudioPlayerProps) {
  const { t } = useLanguage()
  const { showToast } = useToast()
  const [internalPlaying, setInternalPlaying] = useState(false)
  const playing = controlledPlaying ?? internalPlaying
  const [audioError, setAudioError] = useState<string | null>(null)

  const isAudioMissingOrExpired = !audioUrl || audioUrl === "Expired"

  const setPlaying = (value: boolean) => {
    if (value && (isAudioMissingOrExpired || audioError)) {
      showToast(t("toast_audio_not_found"), "error")
      return
    }
    if (onPlayingChange) onPlayingChange(value)
    else setInternalPlaying(value)
  }
  const togglePlay = () => {
    if (isAudioMissingOrExpired || audioError) {
      showToast(t("toast_audio_not_found"), "error")
      return
    }
    setPlaying(!playing)
  }
  const [duration, setDuration] = useState<number>(initialDurationSec)
  const [isDragging, setIsDragging] = useState(false)
  const [scrubTime, setScrubTime] = useState<number>(0)
  const [playbackRate, setPlaybackRate] = useState<number>(1)
  const [volume, setVolume] = useState<number>(1)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverPos, setHoverPos] = useState<number>(0)
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([])
  const [waveformLoading, setWaveformLoading] = useState<boolean>(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const scrubberRef = useRef<HTMLDivElement>(null)

  // Reset audio error on audioUrl change
  useEffect(() => {
    if (audioUrl && audioUrl !== "Expired") {
      setAudioError(null)
    }
  }, [audioUrl])

  // Extract real audio waveform using Web Audio API
  useEffect(() => {
    let isCancelled = false
    if (!audioUrl || audioUrl === "Expired") {
      setWaveformPeaks([])
      setWaveformLoading(false)
      return
    }

    setWaveformLoading(true)
    extractWaveformPeaks(audioUrl, 64)
      .then((peaks) => {
        if (!isCancelled) {
          setWaveformPeaks(peaks)
          setWaveformLoading(false)
        }
      })
      .catch((err) => {
        console.warn("Waveform extraction error:", err)
        if (!isCancelled) {
          setWaveformLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [audioUrl])

  useEffect(() => {
    if (initialDurationSec > 0) {
      setDuration(initialDurationSec)
    }
  }, [initialDurationSec])

  // Sync external currentTime prop changes to the actual audio element
  useEffect(() => {
    if (
      audioRef.current &&
      !isDragging &&
      Math.abs(audioRef.current.currentTime - currentTime) > 1.5
    ) {
      audioRef.current.currentTime = currentTime
    }
  }, [currentTime, isDragging])

  // Play / Pause effect
  useEffect(() => {
    if (audioRef.current && audioUrl && !isAudioMissingOrExpired) {
      if (playing) {
        audioRef.current.play().catch((err) => {
          console.warn("Audio play prevented:", err)
          setPlaying(false)
          setAudioError(t("audio_not_found_desc"))
          showToast(t("toast_audio_not_found"), "error")
        })
      } else {
        audioRef.current.pause()
      }
    }
  }, [playing, audioUrl, isAudioMissingOrExpired])

  // Playback rate sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  // Volume & Mute sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  const handleLoadedMetadata = () => {
    setAudioError(null)
    if (
      audioRef.current &&
      audioRef.current.duration &&
      audioRef.current.duration !== Infinity
    ) {
      setDuration(Math.floor(audioRef.current.duration))
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current && !isDragging) {
      setCurrentTime(Math.floor(audioRef.current.currentTime))
    }
  }

  const updateScrubTime = (clientX: number, commit = false) => {
    if (!scrubberRef.current || !duration) return
    const rect = scrubberRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const ratio = x / rect.width
    const targetTime = Math.floor(ratio * duration)
    setScrubTime(targetTime)

    if (commit) {
      setCurrentTime(targetTime)
      if (audioRef.current) {
        audioRef.current.currentTime = targetTime
      }
    }
  }

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0 || !scrubberRef.current) return
    setIsDragging(true)
    scrubberRef.current.setPointerCapture(e.pointerId)
    updateScrubTime(e.clientX)
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !scrubberRef.current) return
    updateScrubTime(e.clientX)
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !scrubberRef.current) return
    setIsDragging(false)
    scrubberRef.current.releasePointerCapture(e.pointerId)
    updateScrubTime(e.clientX, true)
  }

  const handleScrubberHover = (e: MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || !duration) return
    const rect = scrubberRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const ratio = x / rect.width
    setHoverTime(Math.floor(ratio * duration))
    setHoverPos(x)
  }

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "00:00"
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    const h = Math.floor(m / 60)
    const remM = m % 60
    if (h > 0) {
      return `${h}:${remM.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    }
    return `${remM.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  const displayTime = isDragging ? scrubTime : currentTime
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0

  const speedOptions = [0.75, 1, 1.25, 1.5, 2]

  // Compact single-row transport (mobile summary tab). Shares playback state
  // with the full instance via controlled isPlaying; owns NO audio element.
  if (compact) {
    return (
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border bg-surface flex items-center gap-3 select-none">
        <button
          disabled={!audioUrl || isAudioMissingOrExpired || !!audioError}
          onClick={togglePlay}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors text-primary-contrast bg-primary hover:bg-primary-hover disabled:opacity-40 cursor-pointer"
          aria-label={playing ? "Pause audio" : "Play audio"}
        >
          {playing ? (
            <Pause size={15} weight="fill" />
          ) : (
            <Play size={15} weight="fill" className="ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between text-[10px] font-mono text-fg-tertiary mb-1">
            <span className="font-semibold text-fg-secondary">{formatTime(displayTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden bg-surface-3 cursor-pointer"
            onClick={(e) => {
              if (!duration) return
              const rect = e.currentTarget.getBoundingClientRect()
              const target = Math.floor(((e.clientX - rect.left) / rect.width) * duration)
              setCurrentTime(target)
              if (audioRef.current) audioRef.current.currentTime = target
            }}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {onDownload && (
          <button
            onClick={onDownload}
            className="p-2 text-fg-tertiary hover:text-fg hover:bg-surface-2 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
            title={t("a11y_download_audio")}
            aria-label={t("a11y_download_audio")}
          >
            <DownloadSimple size={14} weight="duotone" />
          </button>
        )}
      </div>
    )
  }

  const handleAudioError = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    console.warn("Audio element playback error:", e)
    setPlaying(false)
    setAudioError(t("audio_not_found_desc"))
    showToast(t("toast_audio_not_found"), "error")
  }

  return (
    <div className="flex-shrink-0 p-4 sm:p-5 border-b border-border bg-surface relative select-none">
      {audioUrl && !compact && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlaying(false)}
          onError={handleAudioError}
        />
      )}

      {/* Header bar: Status & Playback Rate selector */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full flex items-center justify-center ${audioError || isAudioMissingOrExpired ? "bg-danger" : "bg-primary"}`}>
            {playing && <span className="w-1.5 h-1.5 rounded-full bg-primary-contrast animate-ping" />}
          </div>
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-secondary flex items-center gap-1.5">
            <Waveform size={14} weight="duotone" className={audioError || isAudioMissingOrExpired ? "text-danger" : "text-primary"} />
            {audioUrl && !isAudioMissingOrExpired ? t("audio_player") : t("no_audio")}
          </span>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-lg" role="group" aria-label="Playback speed">
          <Gauge size={13} className="text-fg-tertiary ml-1" />
          {speedOptions.map((spd) => (
            <button
              key={spd}
              onClick={() => setPlaybackRate(spd)}
              aria-pressed={playbackRate === spd}
              className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                playbackRate === spd
                  ? "bg-primary text-primary-contrast shadow-sm"
                  : "text-fg-tertiary hover:text-fg"
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* Audio Error Alert Banner */}
      {(audioError || isAudioMissingOrExpired) && (
        <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-danger-dim border border-danger/25 text-danger flex items-center gap-2.5 text-xs animate-scale-in">
          <WarningCircle size={17} weight="fill" className="flex-shrink-0" />
          <span className="font-medium">
            {audioError || t("audio_not_found_desc")}
          </span>
        </div>
      )}

      {/* Authentic Waveform Visualization */}
      <div
        className="flex items-end gap-[2px] sm:gap-1 h-12 sm:h-14 mb-3.5 px-3 py-2 rounded-xl bg-surface-2 border border-border overflow-hidden relative cursor-pointer group hover:border-border-hover transition-colors"
        onClick={(e) => {
          if (!duration) return
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          const target = Math.floor(ratio * duration)
          setCurrentTime(target)
          if (audioRef.current) audioRef.current.currentTime = target
        }}
      >
        {waveformLoading && waveformPeaks.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center gap-2 text-xs font-mono text-fg-tertiary">
            <Spinner size={14} className="animate-spin text-primary" />
            <span>Memproses gelombang suara...</span>
          </div>
        ) : (
          (waveformPeaks.length > 0 ? waveformPeaks : Array(64).fill(25)).map((peakHeight, i, arr) => {
            const barProgress = (i / arr.length) * 100
            const isPlayed = barProgress <= progressPercent

            return (
              <div
                key={i}
                className={`flex-1 rounded-full transition-colors duration-100 ${
                  isPlayed
                    ? "bg-primary group-hover:opacity-90"
                    : "bg-surface-3 group-hover:bg-muted"
                }`}
                style={{
                  height: `${peakHeight}%`,
                }}
              />
            )
          })
        )}
      </div>

      {/* Interactive Scrubber Bar with Hover Tooltip */}
      <div
        ref={scrubberRef}
        className="relative mb-2.5 cursor-pointer group touch-none py-1"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseMove={handleScrubberHover}
        onMouseLeave={() => setHoverTime(null)}
        role="slider"
        aria-valuenow={displayTime}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.floor(duration))}
        aria-valuetext={`${formatTime(displayTime)} / ${formatTime(duration)}`}
        aria-label={t("a11y_scrubber")}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!duration || !audioUrl) return
          let target: number | null = null
          if (e.key === "ArrowRight") target = Math.min(duration, currentTime + 5)
          else if (e.key === "ArrowLeft") target = Math.max(0, currentTime - 5)
          else if (e.key === "Home") target = 0
          else if (e.key === "End") target = duration
          if (target !== null) {
            e.preventDefault()
            setCurrentTime(Math.floor(target))
            if (audioRef.current) audioRef.current.currentTime = target
          }
        }}
      >
        {/* Hover Time Tooltip */}
        {hoverTime !== null && (
          <div
            className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-surface-3 border border-border text-[10px] font-mono text-fg shadow-raised pointer-events-none z-30"
            style={{ left: `${hoverPos}px` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}

        <div className="h-1.5 rounded-full overflow-hidden bg-surface-2 border border-border">
          <div
            className="h-full rounded-full transition-all duration-75 bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-surface border-2 border-primary shadow-card transition-transform group-hover:scale-110"
          style={{ left: `calc(${progressPercent}% - 7px)` }}
        />
      </div>

      {/* Time Display & Volume row */}
      <div className="flex justify-between items-center text-xs font-mono text-fg-tertiary mb-3">
        <span className="font-semibold text-fg-secondary">{formatTime(displayTime)}</span>

        <div className="flex items-center gap-3">
          {/* Mute/Volume control */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 text-fg-tertiary hover:text-fg transition-colors"
              title={isMuted ? t("a11y_unmute") : t("a11y_mute")}
              aria-label={isMuted ? t("a11y_unmute") : t("a11y_mute")}
            >
              {isMuted || volume === 0 ? (
                <SpeakerSimpleX size={15} weight="duotone" className="text-danger" />
              ) : (
                <SpeakerHigh size={15} weight="duotone" />
              )}
            </button>
            <label htmlFor="volume-slider" className="sr-only">{t("a11y_volume")}</label>
            <input
              id="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value))
                if (isMuted) setIsMuted(false)
              }}
              className="w-14 h-1 bg-surface-2 accent-primary rounded-lg cursor-pointer"
              title={t("a11y_volume")}
            />
          </div>

          {onDownload && (
            <button
              onClick={onDownload}
              className="p-2 text-fg-tertiary hover:text-fg hover:bg-surface-2 rounded-lg transition-all"
              title={t("a11y_download_audio")}
              aria-label={t("a11y_download_audio")}
            >
              <DownloadSimple size={15} weight="duotone" />
            </button>
          )}

          <span className="text-fg-tertiary">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main Playback Control Bar */}
      <div className="flex items-center justify-center gap-4 pt-1">
        {/* Skip -10s */}
        <button
          disabled={!audioUrl}
          onClick={() => {
            const t = Math.max(0, currentTime - 10)
            setCurrentTime(t)
            if (audioRef.current) audioRef.current.currentTime = t
          }}
          className="p-2.5 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-40"
          aria-label={t("a11y_skip_backward")}
          title={t("a11y_skip_backward")}
        >
          <ArrowCounterClockwise size={18} weight="bold" />
        </button>

        {/* Play / Pause */}
        <button
          disabled={!audioUrl}
          onClick={togglePlay}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-150 disabled:opacity-40 text-primary-contrast bg-primary hover:bg-primary-hover active:bg-primary cursor-pointer"
          aria-label={playing ? "Pause audio" : "Play audio"}
        >
          {playing ? (
            <Pause size={20} weight="fill" />
          ) : (
            <Play size={20} weight="fill" className="ml-0.5" />
          )}
        </button>

        {/* Skip +10s */}
        <button
          disabled={!audioUrl}
          onClick={() => {
            const t = Math.min(duration, currentTime + 10)
            setCurrentTime(t)
            if (audioRef.current) audioRef.current.currentTime = t
          }}
          className="p-2.5 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-40"
          aria-label={t("a11y_skip_forward")}
          title={t("a11y_skip_forward")}
        >
          <ArrowClockwise size={18} weight="bold" />
        </button>
      </div>
    </div>
  )
}
