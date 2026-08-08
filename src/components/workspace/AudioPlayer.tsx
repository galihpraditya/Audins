import { useState, useRef, useEffect } from "react"

interface AudioPlayerProps {
  audioUrl?: string
  currentTime: number
  setCurrentTime: (time: number) => void
  durationSeconds?: number
  onDownload?: () => void
}

export default function AudioPlayer({
  audioUrl,
  currentTime,
  setCurrentTime,
  durationSeconds: initialDurationSec = 0,
  onDownload,
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState<number>(initialDurationSec)
  const [isDragging, setIsDragging] = useState(false)
  const [scrubTime, setScrubTime] = useState<number>(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const scrubberRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialDurationSec > 0) {
      setDuration(initialDurationSec)
    }
  }, [initialDurationSec])

  // Sync external currentTime prop changes to the actual audio element
  // Only trigger if the difference is more than 1.5 seconds and we aren't dragging
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
    if (audioRef.current && audioUrl) {
      if (playing) {
        audioRef.current.play().catch((err) => {
          console.warn("Audio play prevented:", err)
          setPlaying(false)
        })
      } else {
        audioRef.current.pause()
      }
    }
  }, [playing, audioUrl])

  const handleLoadedMetadata = () => {
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0 || !scrubberRef.current) return
    setIsDragging(true)
    scrubberRef.current.setPointerCapture(e.pointerId)
    updateScrubTime(e.clientX)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !scrubberRef.current) return
    updateScrubTime(e.clientX)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !scrubberRef.current) return
    setIsDragging(false)
    scrubberRef.current.releasePointerCapture(e.pointerId)
    updateScrubTime(e.clientX, true)
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
    return `${remM}:${s.toString().padStart(2, "0")}`
  }

  const displayTime = isDragging ? scrubTime : currentTime

  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (displayTime / duration) * 100))
      : 0

  return (
    <div className="flex-shrink-0 p-4 sm:p-5 border-b border-border bg-surface">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlaying(false)}
          controlsList="nodownload"
        />
      )}

      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <p className="text-xs font-mono font-medium uppercase tracking-widest text-fg-tertiary">
          Audio Player {audioUrl ? "• Ready" : "• No File Selected"}
        </p>
      </div>

      {/* Waveform visualizer */}
      <div className="flex items-end gap-0.5 h-8 sm:h-10 mb-3 sm:mb-4 overflow-hidden rounded-lg px-1 bg-surface-2 border border-border">
        {Array.from({ length: 60 }).map((_, i) => {
          const heights = [
            20, 45, 65, 38, 80, 55, 30, 70, 42, 90, 35, 62, 48, 75, 28, 58, 82,
            40, 67, 22, 50, 88, 33, 72, 44, 95, 36, 60, 25, 78,
          ]
          const h = heights[i % heights.length]
          const played = (i / 60) * 100 < progressPercent
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-all duration-150 ${
                played ? "bg-primary opacity-90" : "bg-muted opacity-30"
              }`}
              style={{ height: `${h}%` }}
            />
          )
        })}
      </div>

      {/* Scrubber bar */}
      <div
        ref={scrubberRef}
        className="relative mb-2 cursor-pointer group touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Audio scrubber"
        tabIndex={0}
      >
        <div className="h-1.5 rounded-full overflow-hidden bg-surface-2 border border-border-subtle">
          <div
            className="h-full rounded-full transition-all duration-75"
            style={{
              width: `${progressPercent}%`,
              background: "linear-gradient(90deg, #6366f1, #7c3aed)",
            }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-indigo-400 bg-background transition-transform group-hover:scale-125 shadow-md"
          style={{ left: `calc(${progressPercent}% - 7px)` }}
        />
      </div>

      <div className="flex justify-between items-center text-xs font-mono mb-3 text-fg-tertiary">
        <span>{formatTime(displayTime)}</span>
        <div className="flex items-center gap-2">
          {onDownload && (
            <button
              onClick={onDownload}
              className="p-1 hover:text-fg hover:bg-surface-2 rounded transition-colors"
              title="Download Audio"
              aria-label="Download Audio"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
            </button>
          )}
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Rewind 10s */}
        <button
          className="p-1.5 rounded-lg text-fg-tertiary hover:text-fg-secondary hover:bg-surface-2 transition-colors disabled:opacity-40"
          disabled={!audioUrl}
          onClick={() => {
            const t = Math.max(0, currentTime - 10)
            setCurrentTime(t)
            if (audioRef.current) audioRef.current.currentTime = t
          }}
          aria-label="Skip backward 10 seconds"
          title="Rewind 10s"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          disabled={!audioUrl}
          onClick={() => setPlaying(!playing)}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 shadow-lg hover:scale-105 disabled:opacity-50 text-white"
          style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)" }}
          aria-label={playing ? "Pause audio" : "Play audio"}
        >
          {playing ? (
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5 ml-0.5"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>

        {/* Forward 10s */}
        <button
          className="p-1.5 rounded-lg text-fg-tertiary hover:text-fg-secondary hover:bg-surface-2 transition-colors disabled:opacity-40"
          disabled={!audioUrl}
          onClick={() => {
            const t = Math.min(duration, currentTime + 10)
            setCurrentTime(t)
            if (audioRef.current) audioRef.current.currentTime = t
          }}
          aria-label="Skip forward 10 seconds"
          title="Forward 10s"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798l-5.445-3.63z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
