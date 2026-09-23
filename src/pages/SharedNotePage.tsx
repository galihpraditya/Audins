import { useState, useEffect, useRef, lazy, Suspense, useMemo } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { PublicSharedDocument, TranscriptEntry } from "../types"
import {
  fetchPublicSharedDocumentApi,
  duplicateSharedDocumentApi,
} from "../services/api"
import { useLanguage } from "../context/LanguageContext"
import { useTheme } from "../context/ThemeContext"
import { useToast } from "../components/ui/ToastContext"
import {
  Play,
  Pause,
  SpeakerHigh,
  SpeakerSlash,
  Sparkle,
  Quotes,
  Copy,
  Printer,
  Moon,
  Sun,
  Globe,
  Lock,
  ArrowSquareOut,
  FolderPlus,
  MagnifyingGlass,
  ArrowClockwise,
  ShareNetwork,
  Check,
} from "@phosphor-icons/react"

const LazyReactMarkdown = lazy(() => import("react-markdown"))

const markdownComponents = {
  p: ({ node, ...props }: any) => (
    <p
      className="mb-3 last:mb-0 leading-relaxed print:mb-2.5 print:text-[13px] print:leading-relaxed print:text-slate-800"
      {...props}
    />
  ),
  ul: ({ node, ...props }: any) => (
    <ul
      className="space-y-2 mb-3 last:mb-0 list-none print:list-disc print:pl-5 print:space-y-1.5 print:mb-3 [&>li]:pl-5 [&>li]:relative [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-2 [&>li]:before:w-1.5 [&>li]:before:h-1.5 [&>li]:before:bg-primary [&>li]:before:rounded-full print:[&>li]:pl-0 print:[&>li]:before:hidden print:[&>li]:text-slate-800"
      {...props}
    />
  ),
  li: ({ node, ...props }: any) => (
    <li className="print:text-[13px] print:text-slate-800" {...props} />
  ),
  ol: ({ node, ...props }: any) => (
    <ol
      className="list-decimal pl-5 space-y-2 mb-3 last:mb-0 font-mono text-fg-secondary print:text-slate-800 print:space-y-1.5 print:mb-3 print:font-sans print:text-[13px]"
      {...props}
    />
  ),
  h3: ({ node, ...props }: any) => (
    <h3
      className="text-sm font-bold font-display text-fg mt-4 mb-2 print:text-[15px] print:font-bold print:text-slate-950 print:mt-4 print:mb-1.5"
      {...props}
    />
  ),
  h4: ({ node, ...props }: any) => (
    <h4
      className="text-xs font-bold text-fg mt-3 mb-1.5 print:text-sm print:font-semibold print:text-slate-900 print:mt-3 print:mb-1"
      {...props}
    />
  ),
  strong: ({ node, ...props }: any) => (
    <strong
      className="font-semibold text-fg print:font-bold print:text-slate-950"
      {...props}
    />
  ),
  code: ({ node, ...props }: any) => (
    <code
      className="bg-surface-3 text-fg-secondary px-1.5 py-0.5 rounded text-xs font-mono print:bg-slate-100 print:text-slate-900 print:border print:border-slate-300"
      {...props}
    />
  ),
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00"
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? "0" : ""}${s}`
}

export default function SharedNotePage() {
  const { shareId } = useParams<{ shareId: string }>()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const { showToast } = useToast()

  const [document, setDocument] = useState<PublicSharedDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"summary" | "transcript">(
    "summary",
  )
  const [transcriptSearch, setTranscriptSearch] = useState("")
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  // Audio Playback State
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    if (!shareId) return
    let isMounted = true
    setLoading(true)
    setError(null)

    fetchPublicSharedDocumentApi(shareId)
      .then((doc) => {
        if (!isMounted) return
        setDocument(doc)
        // If no summary available, default to transcript
        if (!doc.includeSummary && doc.includeTranscript) {
          setActiveTab("transcript")
        }
      })
      .catch((err) => {
        if (!isMounted) return
        console.error("Shared note error:", err)
        setError(err.message || "Note not available")
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [shareId])

  // Sync active audio playback
  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.error("Play failed:", e))
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration)
    }
  }

  const handleAudioEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setCurrentTime(val)
    if (audioRef.current) {
      audioRef.current.currentTime = val
    }
  }

  const handleJumpToTranscript = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds
      if (!isPlaying) {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {})
      }
    }
  }

  const handleRateChange = () => {
    const rates = [1, 1.25, 1.5, 2, 0.75]
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length]
    setPlaybackRate(next)
    if (audioRef.current) {
      audioRef.current.playbackRate = next
    }
  }

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      showToast(t("share_toast_link_copied"), "success")
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      showToast("Gagal menyalin tautan", "error")
    }
  }

  const handleCopySummary = async () => {
    if (!document?.summary) return
    const text = document.summary.sections
      .map(
        (s) => `### ${s.heading}\n${s.content.map((c) => `- ${c}`).join("\n")}`,
      )
      .join("\n\n")
    try {
      await navigator.clipboard.writeText(text)
      showToast(t("toast_summary_copied"), "success")
    } catch {
      showToast("Gagal menyalin teks", "error")
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDuplicateToWorkspace = async () => {
    if (!shareId) return
    setIsDuplicating(true)
    try {
      const doc = await duplicateSharedDocumentApi(shareId)
      showToast(t("share_public_saved_toast"), "success")
      navigate(`/workspace/${doc.id}`)
    } catch (err: any) {
      console.error("Duplicate error:", err)
      showToast(err.message || "Gagal menyimpan ke workspace", "error")
    } finally {
      setIsDuplicating(false)
    }
  }

  const filteredTranscripts = useMemo(() => {
    if (!document?.transcripts) return []
    if (!transcriptSearch.trim()) return document.transcripts
    const query = transcriptSearch.toLowerCase()
    return document.transcripts.filter((entry) =>
      entry.text.toLowerCase().includes(query),
    )
  }, [document?.transcripts, transcriptSearch])

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-fg-secondary">
          {t("loading_waveform")}
        </p>
      </div>
    )
  }

  // Error / Private Screen
  if (error || !document) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between p-6">
        <header className="flex items-center justify-between max-w-4xl mx-auto w-full">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-lg font-bold font-display tracking-tight text-fg">
              Audins
            </span>
          </Link>
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-border bg-surface-2 text-fg-secondary hover:text-fg transition-colors cursor-pointer"
          >
            {theme === "dark" ? (
              <Sun size={17} weight="bold" />
            ) : (
              <Moon size={17} weight="bold" />
            )}
          </button>
        </header>

        <div className="max-w-md mx-auto text-center space-y-4 my-auto">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-fg-tertiary">
            <Lock size={32} weight="duotone" />
          </div>
          <h2 className="text-xl font-bold font-display text-fg">
            {t("share_public_inactive_title")}
          </h2>
          <p className="text-xs sm:text-sm text-fg-secondary leading-relaxed">
            {t("share_public_inactive_desc")}
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-contrast text-xs font-semibold hover:bg-primary-hover transition-colors shadow-sm"
            >
              <span>{t("share_public_btn_home")}</span>
            </Link>
          </div>
        </div>

        <footer className="text-center text-xs text-fg-tertiary max-w-4xl mx-auto w-full">
          Audins AI &bull; {t("app_tagline")}
        </footer>
      </div>
    )
  }

  const effectiveDuration = audioDuration || document.durationSec || 0

  return (
    <div className="min-h-screen bg-background font-sans text-fg flex flex-col justify-between print:bg-white print:block">
      {/* Top Brand Nav */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-40 no-print">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-lg font-bold font-display tracking-tight text-fg">
                Audins
              </span>
            </Link>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface-2 border border-border text-fg-secondary flex items-center gap-1">
              <Globe size={11} weight="bold" />
              <span>{t("share_badge_public")}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-fg-secondary hover:text-fg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t("share_btn_copy_link")}
            >
              {linkCopied ? (
                <>
                  <Check size={14} weight="bold" className="text-success" />
                  <span className="hidden sm:inline text-success">
                    {t("share_link_copied")}
                  </span>
                </>
              ) : (
                <>
                  <ShareNetwork size={14} weight="bold" />
                  <span className="hidden sm:inline">
                    {t("share_btn_copy_link")}
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDuplicateToWorkspace}
              disabled={isDuplicating}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-contrast hover:bg-primary-hover text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-60"
            >
              <FolderPlus size={15} weight="bold" />
              <span>
                {isDuplicating
                  ? t("share_public_saving")
                  : t("share_public_save_to_workspace")}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg flex items-center justify-center border border-border bg-surface-2 text-fg-secondary hover:text-fg transition-colors cursor-pointer"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun size={15} weight="bold" />
              ) : (
                <Moon size={15} weight="bold" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6 printable-area print:max-w-none print:p-0 print:m-0">
        {/* Document Header */}
        <div className="space-y-2 border-b border-border pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display text-fg tracking-tight">
                {document.name}
              </h1>
              <div className="flex items-center gap-2.5 text-xs text-fg-tertiary mt-1 font-mono">
                <span>{document.date}</span>
                <span>&bull;</span>
                <span>{document.duration}</span>
                {document.viewCount !== undefined && (
                  <>
                    <span>&bull;</span>
                    <span>
                      {t("share_public_view_count", {
                        count: document.viewCount,
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 flex-wrap no-print">
              {document.includeSummary && (
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-fg-secondary hover:text-fg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Copy size={14} weight="duotone" />
                  <span>{t("btn_copy_summary")}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handlePrint}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-fg-secondary hover:text-fg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer size={14} weight="duotone" />
                <span>{t("btn_export_pdf")}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Audio Player (if included and available) */}
        {document.hasAudio && document.audioStreamUrl && (
          <div className="bg-surface-2 border border-border rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 no-print">
            <audio
              ref={audioRef}
              src={document.audioStreamUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleAudioEnded}
              preload="metadata"
            />

            {/* Scrubber & Timers */}
            <div className="space-y-1">
              <input
                type="range"
                min="0"
                max={effectiveDuration || 100}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                className="w-full accent-primary h-1.5 bg-surface-3 rounded-lg cursor-pointer"
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-fg-tertiary">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(effectiveDuration)}</span>
              </div>
            </div>

            {/* Player Controls */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-xl bg-primary text-primary-contrast flex items-center justify-center hover:bg-primary-hover transition-transform active:scale-95 cursor-pointer shadow-sm"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause size={18} weight="fill" />
                  ) : (
                    <Play size={18} weight="fill" className="translate-x-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleRateChange}
                  className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-3 text-xs font-mono font-semibold text-fg-secondary hover:text-fg transition-colors cursor-pointer"
                  title="Playback speed"
                >
                  {playbackRate}x
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-fg-secondary hover:text-fg hover:bg-surface-3 transition-colors cursor-pointer"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? (
                    <SpeakerSlash size={16} weight="bold" />
                  ) : (
                    <SpeakerHigh size={16} weight="bold" />
                  )}
                </button>
              </div>

              <span className="text-[11px] font-mono text-fg-tertiary hidden sm:inline">
                {document.name}
              </span>
            </div>
          </div>
        )}

        {/* Segmented View Tabs */}
        {document.includeSummary && document.includeTranscript && (
          <div className="flex items-center gap-1 border-b border-border pb-1 no-print">
            <button
              type="button"
              onClick={() => setActiveTab("summary")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "summary"
                  ? "bg-surface-2 text-fg border border-border shadow-xs"
                  : "text-fg-tertiary hover:text-fg"
              }`}
            >
              <Sparkle size={15} weight="duotone" />
              <span>{t("tab_summary")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("transcript")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "transcript"
                  ? "bg-surface-2 text-fg border border-border shadow-xs"
                  : "text-fg-tertiary hover:text-fg"
              }`}
            >
              <Quotes size={15} weight="duotone" />
              <span>{t("tab_transcripts")}</span>
            </button>
          </div>
        )}

        {/* Content Pane: Summary */}
        {document.includeSummary &&
          (activeTab === "summary" || !document.includeTranscript) && (
            <div className="space-y-6">
              {document.summary ? (
                <div className="space-y-6">
                  {document.summary.sections.map((section, idx) => (
                    <div key={idx} className="space-y-2">
                      <h3 className="text-sm font-bold font-display text-fg border-b border-border/60 pb-1.5 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        <span>{section.heading}</span>
                      </h3>
                      <div className="text-xs sm:text-sm text-fg-secondary leading-relaxed space-y-1.5 pl-3.5">
                        {section.content.map((point, pIdx) => (
                          <div key={pIdx} className="markdown-content">
                            <Suspense fallback={<p>{point}</p>}>
                              <LazyReactMarkdown
                                components={markdownComponents}
                              >
                                {point}
                              </LazyReactMarkdown>
                            </Suspense>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-fg-tertiary italic">
                  {t("toast_nothing_to_copy")}
                </p>
              )}
            </div>
          )}

        {/* Content Pane: Transcript */}
        {document.includeTranscript &&
          (activeTab === "transcript" || !document.includeSummary) && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative no-print">
                <MagnifyingGlass
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-tertiary"
                />
                <input
                  type="text"
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder={t("search_transcript")}
                  className="w-full bg-surface-2 border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-fg placeholder:text-fg-tertiary focus:outline-none focus:border-border-hover"
                />
              </div>

              {/* Transcript List */}
              <div className="space-y-3 pt-2">
                {filteredTranscripts.length > 0 ? (
                  filteredTranscripts.map(
                    (entry: TranscriptEntry, idx: number) => {
                      const isCurrent =
                        currentTime >= entry.seconds &&
                        currentTime < entry.seconds + 5

                      return (
                        <div
                          key={idx}
                          onClick={() => handleJumpToTranscript(entry.seconds)}
                          className={`group p-3 rounded-xl border transition-all cursor-pointer ${
                            isCurrent
                              ? "bg-primary-dim border-primary/40 shadow-xs"
                              : "bg-surface border-border hover:bg-surface-2 hover:border-border-hover"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-surface-3 text-fg-secondary">
                              {entry.ts}
                            </span>
                            {document.hasAudio && (
                              <span className="text-[10px] text-fg-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                <Play size={10} weight="fill" />
                                <span>{t("jump_hint")}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-fg leading-relaxed">
                            {entry.text}
                          </p>
                        </div>
                      )
                    },
                  )
                ) : (
                  <p className="text-xs text-fg-tertiary italic text-center py-8">
                    {t("no_transcript_matches")} "{transcriptSearch}"
                  </p>
                )}
              </div>
            </div>
          )}
      </main>

      {/* Footer Branding Banner */}
      <footer className="border-t border-border bg-surface-2/60 py-6 px-4 sm:px-6 text-center space-y-2 no-print mt-12">
        <p className="text-xs text-fg-secondary font-medium">
          {t("share_public_footer_cta")} &bull;{" "}
          <Link
            to="/"
            className="text-fg font-semibold hover:underline inline-flex items-center gap-1"
          >
            <span>{t("share_public_make_own")}</span>
            <ArrowSquareOut size={12} weight="bold" />
          </Link>
        </p>
        <p className="text-[11px] font-mono text-fg-tertiary">
          Audins &bull; AI Audio Intelligence & Transcript Studio
        </p>
      </footer>
    </div>
  )
}
