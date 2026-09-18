import { useState, useEffect, Suspense, lazy } from "react"
import { DocumentItem, AISummary } from "../../types"
import { useToast } from "../ui/ToastContext"
import Alert from "../ui/Alert"
import { useLanguage } from "../../context/LanguageContext"
import {
  Copy,
  Printer,
  Sparkle,
  PencilSimple,
  Check,
  Brain,
  X,
  WarningCircle,
} from "@phosphor-icons/react"

// ~50KB gzipped of unified/micromark deps lives behind this boundary — only
// fetched when a completed summary actually needs rendering.
const LazyReactMarkdown = lazy(() => import("react-markdown"))

// Module-level constant so React doesn't remount the markdown tree each render.
const markdownComponents = {
  p: ({ node, ...props }: any) => (
    <p className="mb-3 last:mb-0 leading-relaxed print:mb-2.5 print:text-[13px] print:leading-relaxed print:text-slate-800" {...props} />
  ),
  ul: ({ node, ...props }: any) => (
    <ul
      className="space-y-2 mb-3 last:mb-0 list-none print:list-disc print:pl-5 print:space-y-1.5 print:mb-3 [&>li]:pl-5 [&>li]:relative [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-2 [&>li]:before:w-1.5 [&>li]:before:h-1.5 [&>li]:before:bg-primary [&>li]:before:rounded-full print:[&>li]:pl-0 print:[&>li]:before:hidden print:[&>li]:text-slate-800"
      {...props}
    />
  ),
  li: ({ node, ...props }: any) => <li className="print:text-[13px] print:text-slate-800" {...props} />,
  ol: ({ node, ...props }: any) => (
    <ol
      className="list-decimal pl-5 space-y-2 mb-3 last:mb-0 font-mono text-fg-secondary print:text-slate-800 print:space-y-1.5 print:mb-3 print:font-sans print:text-[13px]"
      {...props}
    />
  ),
  h3: ({ node, ...props }: any) => (
    <h3 className="text-sm font-bold font-display text-fg mt-4 mb-2 print:text-[15px] print:font-bold print:text-slate-950 print:mt-4 print:mb-1.5" {...props} />
  ),
  h4: ({ node, ...props }: any) => (
    <h4 className="text-xs font-bold text-fg mt-3 mb-1.5 print:text-sm print:font-semibold print:text-slate-900 print:mt-3 print:mb-1" {...props} />
  ),
  strong: ({ node, ...props }: any) => (
    <strong className="font-semibold text-fg print:font-bold print:text-slate-950" {...props} />
  ),
  code: ({ node, ...props }: any) => (
    <code
      className="bg-surface-3 text-fg-secondary px-1.5 py-0.5 rounded text-xs font-mono print:bg-slate-100 print:text-slate-900 print:border print:border-slate-300"
      {...props}
    />
  ),
}

function MarkdownBlock({ children }: { children: string }) {
  return (
    <Suspense fallback={<p className="text-xs sm:text-sm text-fg-secondary whitespace-pre-wrap">{children}</p>}>
      <LazyReactMarkdown components={markdownComponents}>{children}</LazyReactMarkdown>
    </Suspense>
  )
}

interface SummaryEditorProps {
  document: DocumentItem
  onUpdateSummary?: (id: number | string, summary: AISummary) => void
  onReSummarize?: (id: string | number, customPrompt?: string) => void
  onCancelUpload?: (id: number | string) => void
}

export default function SummaryEditor({
  document,
  onUpdateSummary,
  onReSummarize,
  onCancelUpload,
}: SummaryEditorProps) {
  const { t } = useLanguage()
  const { showToast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [editableSummary, setEditableSummary] = useState<AISummary | undefined>(
    document.summary,
  )
  const [showReSummarizeModal, setShowReSummarizeModal] = useState(false)
  const [customPrompt, setCustomPrompt] = useState("")
  const [copiedSectionIndex, setCopiedSectionIndex] = useState<number | null>(null)

  useEffect(() => {
    setEditableSummary(document.summary)
    setIsEditing(false)
  }, [document.id, document.summary])

  const getPdfTitle = () => {
    const cleanDocName = (document?.name || "Document").replace(/\.[^/.]+$/, "")
    return `${cleanDocName}_Summary_Audins`
  }

  useEffect(() => {
    const handleBeforePrint = () => {
      window.document.title = getPdfTitle()
    }
    window.addEventListener("beforeprint", handleBeforePrint)
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint)
    }
  }, [document?.name])

  const [editMarkdown, setEditMarkdown] = useState("")

  const summaryToMarkdown = (summary: AISummary) => {
    let text = `# ${summary.title}\n\n`
    summary.sections.forEach((s) => {
      text += `## ${s.heading}\n`
      text += s.content.join("\n") + "\n\n"
    })
    return text.trim()
  }

  const markdownToSummary = (
    markdown: string,
    baseSummary: AISummary,
  ): AISummary => {
    const lines = markdown.split("\n")
    let title = baseSummary.title
    const sections: { heading: string; content: string[] }[] = []
    let currentSection: { heading: string; content: string[] } | null = null

    for (const line of lines) {
      if (line.startsWith("# ")) {
        title = line.replace("# ", "").trim()
      } else if (line.startsWith("## ")) {
        if (currentSection) {
          sections.push(currentSection)
        }
        currentSection = {
          heading: line.replace("## ", "").trim(),
          content: [],
        }
      } else {
        const trimmed = line.trim()
        if (currentSection) {
          currentSection.content.push(trimmed)
        } else if (trimmed && !currentSection) {
          currentSection = { heading: "Overview", content: [trimmed] }
        }
      }
    }

    if (currentSection) {
      sections.push(currentSection)
    }

    return {
      ...baseSummary,
      title,
      sections,
    }
  }

  const handleToggleEdit = () => {
    if (isEditing) {
      if (onUpdateSummary && editableSummary) {
        const parsed = markdownToSummary(editMarkdown, editableSummary)
        setEditableSummary(parsed)
        onUpdateSummary(document.id, parsed)
        showToast(t("toast_summary_saved"), "success")
      }
    } else {
      if (editableSummary) {
        setEditMarkdown(summaryToMarkdown(editableSummary))
      }
    }
    setIsEditing(!isEditing)
  }

  const handleCopyAll = () => {
    if (!editableSummary) {
      showToast(t("toast_nothing_to_copy"), "error")
      return
    }
    let text = `# ${editableSummary.title}\n\n`
    editableSummary.sections.forEach((s) => {
      text += `## ${s.heading}\n`
      text += s.content.join("\n") + "\n\n"
    })
    navigator.clipboard.writeText(text.trim())
    showToast(t("btn_copy_all"), "success")
  }

  const handleCopySection = (heading: string, content: string[], idx: number) => {
    const text = `## ${heading}\n${content.join("\n")}`
    navigator.clipboard.writeText(text)
    setCopiedSectionIndex(idx)
    showToast(t("btn_copy_section"), "success")
    setTimeout(() => setCopiedSectionIndex(null), 2000)
  }

  const handleExportPDF = () => {
    if (isProcessing) {
      showToast(t("status_processing_title"), "info")
      return
    }
    if (!editableSummary || !editableSummary.sections || editableSummary.sections.length === 0) {
      showToast(t("toast_nothing_to_copy"), "error")
      return
    }
    try {
      const originalTitle = window.document.title
      window.document.title = getPdfTitle()
      window.print()
      setTimeout(() => {
        window.document.title = originalTitle
      }, 1000)
    } catch (err) {
      console.error("Export PDF error:", err)
      window.print()
    }
  }

  const handleConfirmReSummarize = () => {
    if (onReSummarize) {
      onReSummarize(document.id, customPrompt)
      setCustomPrompt("")
      setShowReSummarizeModal(false)
    }
  }

  const promptPresets = [
    t("preset_indonesian"),
    t("preset_action_items"),
    t("preset_study_notes"),
    t("preset_executive"),
  ]

  const isProcessing = document.status === "Processing"

  return (
    <div className="flex-1 overflow-y-auto bg-background printable-area print:bg-white print:p-0 print:m-0 print:overflow-visible print:w-full">
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-5 sm:py-8 space-y-5 sm:space-y-6 print:max-w-none print:p-0 print:m-0 print:w-full print:space-y-4 print:bg-white">
        {/* Top Studio Toolbar */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 pb-3 sm:pb-4 border-b border-border no-print">
          {/* Action Buttons Left */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
            <button
              type="button"
              onClick={handleCopyAll}
              className="text-xs px-2.5 sm:px-3.5 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-fg-secondary hover:text-fg font-medium border border-border transition-all flex items-center gap-1.5 cursor-pointer min-h-[34px]"
              title={t("btn_copy_summary")}
              aria-label={t("btn_copy_summary")}
            >
              <Copy size={15} weight="duotone" />
              <span className="hidden xs:inline">{t("btn_copy_summary")}</span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isProcessing}
              className={`text-xs px-2.5 sm:px-3.5 py-2 rounded-lg font-medium border transition-all flex items-center gap-1.5 cursor-pointer min-h-[34px] ${
                isProcessing
                  ? "opacity-40 cursor-not-allowed bg-surface-2 text-fg-tertiary border-border"
                  : "bg-surface-2 hover:bg-surface-3 text-fg-secondary hover:text-fg border-border"
              }`}
              title={t("btn_export_pdf")}
            >
              <Printer size={15} weight="duotone" />
              <span className="hidden xs:inline">{t("btn_export_pdf")}</span>
            </button>

            {onReSummarize && (
              <div className="relative inline-block">
                <button
                  onClick={() => setShowReSummarizeModal(!showReSummarizeModal)}
                  disabled={isProcessing}
                  className={`text-xs px-2.5 sm:px-3.5 py-2 rounded-lg font-medium border transition-all flex items-center gap-1.5 min-h-[34px] cursor-pointer ${
                    showReSummarizeModal
                      ? "bg-primary-dim text-primary-hover border-primary/40"
                      : "bg-surface-2 hover:bg-surface-3 text-fg-secondary hover:text-fg border-border"
                  } ${isProcessing ? "opacity-40 cursor-not-allowed" : ""}`}
                  title={t("btn_re_summarize")}
                >
                  <Sparkle size={15} weight="duotone" className="text-fg-tertiary" />
                  <span className="hidden sm:inline">{t("btn_re_summarize")}</span>
                </button>

                {/* Re-Summarize Popup Panel */}
                {showReSummarizeModal && (
                  <div className="fixed inset-x-3 top-24 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full mt-2 w-auto sm:w-96 max-w-sm sm:max-w-none bg-surface border border-border rounded-xl shadow-raised z-50 p-4 sm:p-5 animate-scale-in">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center text-fg-tertiary">
                          <Brain size={16} weight="duotone" />
                        </div>
                        <h4 className="text-sm font-bold font-display text-fg">
                          {t("re_summarize_title")}
                        </h4>
                      </div>
                      <button
                        onClick={() => setShowReSummarizeModal(false)}
                        className="text-fg-tertiary hover:text-fg p-1 rounded-lg"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <p className="text-xs text-fg-secondary mb-3 leading-relaxed">
                      {t("re_summarize_desc")}
                    </p>

                    {/* Quick Presets */}
                    <div className="space-y-1 mb-3">
                      {promptPresets.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setCustomPrompt(preset)}
                          className="w-full text-left p-2 rounded-xl text-[11px] font-sans bg-surface-2 hover:bg-surface-3 text-fg-secondary hover:text-fg border border-border transition-colors truncate"
                        >
                          → {preset}
                        </button>
                      ))}
                    </div>

                    <textarea
                      autoFocus
                      className="w-full bg-surface-2 border border-border rounded-xl p-3 text-xs text-fg placeholder:text-fg-tertiary focus:outline-none focus:border-primary resize-none h-20 mb-4 font-sans"
                      placeholder={t("re_summarize_placeholder")}
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        className="px-3.5 py-1.5 text-xs font-medium text-fg-secondary hover:text-fg bg-surface-2 rounded-xl transition-colors min-h-[34px]"
                        onClick={() => setShowReSummarizeModal(false)}
                      >
                        {t("btn_cancel")}
                      </button>
                      <button
                        className="px-4 py-1.5 text-xs font-semibold text-primary-contrast bg-primary hover:bg-primary-hover rounded-xl transition-opacity min-h-[34px]"
                        onClick={handleConfirmReSummarize}
                      >
                        {t("btn_run_analysis")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Edit Button Right */}
          <button
            onClick={handleToggleEdit}
            className={`text-xs px-3 sm:px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-1.5 sm:gap-2 flex-shrink-0 min-h-[34px] cursor-pointer ${
              isEditing
                ? "bg-success hover:opacity-90 text-success-contrast"
                : "bg-primary hover:bg-primary-hover text-primary-contrast"
            }`}
          >
            {isEditing ? (
              <>
                <Check size={16} weight="bold" />
                <span>{t("btn_save_changes")}</span>
              </>
            ) : (
              <>
                <PencilSimple size={16} weight="duotone" />
                <span>{t("btn_edit_summary")}</span>
              </>
            )}
          </button>
        </div>

        {/* Paper / Report Content Area */}
        <article className="relative">
          {isEditing ? (
            <div className="space-y-4">
              <div className="text-xs text-fg-secondary bg-surface-2 p-3.5 rounded-2xl border border-border flex items-center gap-2">
                <Sparkle size={16} weight="duotone" className="text-fg-tertiary flex-shrink-0" />
                <span>{t("markdown_hint")}</span>
              </div>
              <textarea
                value={editMarkdown}
                onChange={(e) => setEditMarkdown(e.target.value)}
                className="w-full min-h-[300px] sm:min-h-[500px] p-4 sm:p-6 bg-surface-2/90 border border-primary/40 rounded-2xl text-xs sm:text-sm text-fg leading-relaxed focus:outline-none focus:border-primary resize-y font-sans"
                placeholder="# Summary Title&#10;&#10;## Section 1&#10;Your structured notes..."
              />
            </div>
          ) : (
            <div className="print-container space-y-8 print:space-y-4 print:bg-white print:w-full">
              {/* Executive Print Header */}
              <div className="print-header hidden print:flex flex-col gap-3 pb-4 border-b-2 border-slate-900 mb-6 print-break-inside-avoid print:bg-white">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center text-white print-logo-box flex-shrink-0">
                      <svg
                        viewBox="0 0 32 32"
                        className="w-5 h-5 text-white"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M16 4v24M10.5 8v16M5 12v8M21.5 8v16M27 12v8"
                          stroke="currentColor"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold font-display text-slate-950 tracking-tight leading-none">
                        Audins
                      </h2>
                      <span className="text-[10px] font-mono tracking-widest text-slate-600 uppercase font-semibold block mt-1">
                        Executive Summary Report
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs font-mono text-slate-600 space-y-0.5">
                    <div>
                      <span className="font-semibold text-slate-900">Document: </span>
                      <span className="text-slate-800">{document.name}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Date: </span>
                      <span className="text-slate-800">{document.date}</span>
                    </div>
                    {document.duration && (
                      <div>
                        <span className="font-semibold text-slate-900">Duration: </span>
                        <span className="text-slate-800">{document.duration}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Header Title Section */}
              <div className="space-y-2 pb-2 print:space-y-0 print:pb-0 print:bg-white">
                <p className="text-xs font-mono text-fg-tertiary no-print">{document.date}</p>
                <h1 className="text-2xl sm:text-3xl font-bold font-display text-fg tracking-tight leading-tight print:text-2xl print:text-slate-950 print:font-extrabold print:pb-2.5 print:mb-6 print:border-b-2 print:border-slate-900">
                  {editableSummary?.title || t("summary_fallback_title")}
                </h1>
              </div>

              {/* Partial transcription warning (backend pipeline notes) */}
              {!isProcessing && document.status !== "Failed" && document.warnings && document.warnings.length > 0 && (
                <div className="no-print" role="status">
                  <Alert variant="warning" title={t("partial_transcript_warning", { warning: "" }).trim().replace(/\.$/, "")}>
                    <ul className="list-disc pl-4 space-y-1">
                      {document.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </Alert>
                </div>
              )}

              {/* Status or Content */}
              {document.status === "Processing" ? (
                <div className="p-10 rounded-xl bg-surface-2/60 border border-border text-center space-y-4 no-print flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-surface-2 border border-border flex items-center justify-center text-primary">
                    <Brain size={26} weight="duotone" className="animate-spin" style={{ animationDuration: '4s' }} />
                  </div>

                  {document.uploadProgress !== undefined && document.uploadProgress < 100 ? (
                    <div className="w-full max-w-sm mx-auto space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-mono text-fg-secondary" role="status">
                          {t("ingest_audio", { progress: String(document.uploadProgress) })}
                        </p>
                        {onCancelUpload && (
                          <button
                            onClick={() => onCancelUpload(document.id)}
                            className="px-2.5 py-1.5 text-xs text-danger hover:opacity-80 transition-opacity min-h-[32px]"
                          >
                            {t("btn_cancel")}
                          </button>
                        )}
                      </div>
                      <div
                        className="h-1.5 bg-surface-3 rounded-full overflow-hidden w-full"
                        role="progressbar"
                        aria-valuenow={document.uploadProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${document.uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-fg" role="status">
                        {t("status_processing_title")}
                      </p>
                      <p className="text-xs text-fg-tertiary">
                        {t("status_processing_desc")}
                      </p>
                    </div>
                  )}
                </div>
              ) : document.status === "Failed" ? (
                <div className="p-8 rounded-xl bg-danger-dim border-l-[3px] border-danger border-y border-r border-y-border border-r-border text-center space-y-2 no-print" role="alert">
                  <p className="text-sm font-bold text-danger">{t("status_failed_title")}</p>
                  <p className="text-xs text-danger/80">
                    {t("status_failed_desc")}
                  </p>
                </div>
              ) : (
                /* Continuous document — Notion-like flowing sections */
                <div className="divide-y divide-border-subtle print:divide-y-0 print:space-y-6 print:bg-white">
                  {editableSummary?.sections && editableSummary.sections.length > 0 ? (
                    editableSummary.sections.map((section, idx) => (
                      <section
                        key={idx}
                        className="py-7 first:pt-0 last:pb-0 space-y-3 relative group print:py-0 print:space-y-2 print:border-none print-break-inside-avoid print:bg-white"
                      >
                        {/* Section Header */}
                        <div className="flex items-center gap-3">
                          <h2 className="text-sm font-bold font-display text-fg tracking-tight leading-snug print:text-base print:font-bold print:text-slate-950 print:tracking-tight print:border-b print:border-slate-200 print:pb-1.5 print:w-full print:mt-2">
                            {section.heading}
                          </h2>

                          <button
                            onClick={() => handleCopySection(section.heading, section.content, idx)}
                            className="ml-auto opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-md text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors text-xs flex items-center justify-center min-h-[30px] min-w-[30px] no-print flex-shrink-0 cursor-pointer"
                            title={t("btn_copy_section")}
                            aria-label={t("btn_copy_section")}
                          >
                            {copiedSectionIndex === idx ? (
                              <Check size={14} className="text-success" weight="bold" />
                            ) : (
                              <Copy size={14} weight="duotone" />
                            )}
                          </button>
                        </div>

                        {/* Markdown Content */}
                        <div className="text-sm text-fg-secondary leading-7 print:text-[13.5px] print:leading-relaxed print:text-slate-800 print:pt-1">
                          <MarkdownBlock>
                            {section.content.join("\n")}
                          </MarkdownBlock>
                        </div>
                      </section>
                    ))
                  ) : (
                    <div className="py-12 text-center no-print">
                      <p className="text-xs text-fg-tertiary">
                        {t("summary_empty_sections")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
