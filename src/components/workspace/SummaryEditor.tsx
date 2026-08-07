import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { DocumentItem, AISummary } from '../../types'
import { useToast } from '../ui/ToastContext'

interface SummaryEditorProps {
  document: DocumentItem
  onUpdateSummary?: (id: number | string, summary: any) => void
  onReSummarize?: (id: string | number, customPrompt?: string) => void
}

export default function SummaryEditor({ document, onUpdateSummary, onReSummarize }: SummaryEditorProps) {
  const { showToast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [editableSummary, setEditableSummary] = useState<AISummary | undefined>(document.summary)
  const [showReSummarizeModal, setShowReSummarizeModal] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  useEffect(() => {
    setEditableSummary(document.summary)
    setIsEditing(false)
  }, [document.id, document.summary])

  const [editMarkdown, setEditMarkdown] = useState('')

  const summaryToMarkdown = (summary: AISummary) => {
    let text = `# ${summary.title}\n\n`
    summary.sections.forEach(s => {
      text += `## ${s.heading}\n`
      text += s.content.join('\n') + '\n\n'
    })
    return text.trim()
  }

  const markdownToSummary = (markdown: string, baseSummary: AISummary): AISummary => {
    const lines = markdown.split('\n')
    let title = baseSummary.title
    const sections: { heading: string; content: string[] }[] = []
    
    let currentSection: { heading: string; content: string[] } | null = null

    for (const line of lines) {
      if (line.startsWith('# ')) {
        title = line.replace('# ', '').trim()
      } else if (line.startsWith('## ')) {
        if (currentSection) {
          sections.push(currentSection)
        }
        currentSection = { heading: line.replace('## ', '').trim(), content: [] }
      } else {
        const trimmed = line.trim()
        if (currentSection) {
          // Push exactly what user wrote, including empty lines for markdown spacing
          currentSection.content.push(trimmed)
        } else if (trimmed && !currentSection) {
          // If they typed text before any heading, create a default section
          currentSection = { heading: 'Overview', content: [trimmed] }
        }
      }
    }
    
    if (currentSection) {
      sections.push(currentSection)
    }

    return {
      ...baseSummary,
      title,
      sections
    }
  }

  const handleToggleEdit = () => {
    if (isEditing) {
      // Save changes
      if (onUpdateSummary && editableSummary) {
        const parsed = markdownToSummary(editMarkdown, editableSummary)
        setEditableSummary(parsed)
        onUpdateSummary(document.id, parsed)
        showToast('Summary updated successfully', 'success')
      }
    } else {
      // Enter edit mode
      if (editableSummary) {
        setEditMarkdown(summaryToMarkdown(editableSummary))
      }
    }
    setIsEditing(!isEditing)
  }

  const handleCopy = () => {
    if (!editableSummary) {
      showToast('Nothing to copy', 'error')
      return
    }
    let text = `# ${editableSummary.title}\n\n`
    editableSummary.sections.forEach(s => {
      text += `## ${s.heading}\n`
      text += s.content.join('\n') + '\n\n'
    })
    navigator.clipboard.writeText(text.trim())
    showToast('Summary copied to clipboard', 'success')
  }

  const handleExportPDF = () => {
    window.print()
  }

  const handleConfirmReSummarize = () => {
    if (onReSummarize) {
      onReSummarize(document.id, customPrompt)
      setCustomPrompt('')
      setShowReSummarizeModal(false)
    }
  }

  const isProcessing = document.status === 'Processing'

  return (
    <div className="flex-1 overflow-y-auto bg-background printable-area">
      <div className="max-w-2xl mx-auto px-5 sm:px-10 py-6 sm:py-8">
        {/* Editor Toolbar */}
        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border no-print relative flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1.5 rounded bg-surface hover:bg-surface-2 text-fg-secondary hover:text-fg font-medium border border-border transition-colors flex items-center gap-1.5"
              title="Copy summary to clipboard"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
              Copy
            </button>
            
            <button
              onClick={handleExportPDF}
              className="text-xs px-3 py-1.5 rounded bg-surface hover:bg-surface-2 text-fg-secondary hover:text-fg font-medium border border-border transition-colors flex items-center gap-1.5"
              title="Export summary as PDF or print"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export PDF
            </button>

            {onReSummarize && (
              <div className="relative inline-block">
                <button
                  onClick={() => setShowReSummarizeModal(!showReSummarizeModal)}
                  disabled={isProcessing}
                  className={`text-xs px-3 py-1.5 rounded font-medium border transition-colors flex items-center gap-1.5 ${
                    showReSummarizeModal 
                      ? 'bg-indigo-500/20 text-primary-hover border-indigo-500/40' 
                      : 'bg-surface hover:bg-surface-2 text-fg-secondary hover:text-fg border-border'
                  } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Ask AI to summarize again with custom guidelines"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10a9.5 9.5 0 11-19 0 9.5 9.5 0 0119 0zM10 6v8m-4-4h8" />
                  </svg>
                  Re-summarize AI
                </button>

                {showReSummarizeModal && (
                  <div className="absolute left-0 mt-2 w-72 bg-surface border border-border rounded-xl shadow-xl z-50 p-4 animate-scale-in">
                    <h3 className="text-sm font-semibold text-fg mb-1">Custom AI Guidelines</h3>
                    <p className="text-xs text-fg-tertiary mb-3">Focus on specific topics or change language.</p>
                    <textarea
                      autoFocus
                      className="w-full bg-surface-2 border border-border rounded-lg p-2 text-xs text-fg focus:outline-none focus:border-primary resize-none h-20 mb-3"
                      placeholder="e.g. Focus only on engineering timeline... or Write in Indonesian..."
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        className="px-3 py-1.5 text-xs font-medium text-fg-secondary hover:text-fg bg-surface hover:bg-surface-2 rounded-lg border border-border transition-colors"
                        onClick={() => setShowReSummarizeModal(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm transition-colors"
                        onClick={handleConfirmReSummarize}
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden sm:block flex-grow" />
          
          <button
            onClick={handleToggleEdit}
            className={`text-xs px-4 py-2 rounded-lg font-medium shadow-sm transition-all flex items-center gap-2 ${
              isEditing 
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                : 'bg-primary hover:bg-primary-hover text-white'
            }`}
          >
            {isEditing ? (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                Save Edits
              </>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                Edit Summary
              </>
            )}
          </button>
        </div>

        {/* Paper / Editor Area */}
        <article className="relative">
          {isEditing ? (
            <div className="mb-10">
              <div className="mb-4 text-xs text-fg-tertiary bg-surface-2 p-3 rounded-lg border border-border">
                <p className="font-semibold mb-1">Markdown Editor Enabled</p>
                <p>Use <code className="bg-background px-1 py-0.5 rounded">#</code> for Title and <code className="bg-background px-1 py-0.5 rounded">##</code> for Section Headings. Use regular text for content.</p>
              </div>
              <textarea
                value={editMarkdown}
                onChange={(e) => setEditMarkdown(e.target.value)}
                className="w-full min-h-[500px] p-4 sm:p-6 bg-surface-2 border border-indigo-500/30 rounded-xl text-sm text-fg leading-relaxed focus:outline-none focus:border-primary resize-y font-sans shadow-inner"
                placeholder="# Summary Title&#10;&#10;## Section 1&#10;Your content goes here..."
              />
            </div>
          ) : (
            <>
              <div className="hidden print:block mb-8 pb-4 border-b-2 border-black/10">
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-xl font-bold font-display text-black">Audin AI Workspace</h2>
                    <p className="text-sm text-gray-600 mt-1">Executive Summary Report</p>
                  </div>
                  <div className="text-right text-sm text-gray-600">
                    <p><span className="font-semibold">Document:</span> {document.name}</p>
                    <p><span className="font-semibold">Date:</span> {document.date}</p>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-display font-semibold text-fg tracking-tight">
                  {editableSummary?.title || 'Executive Summary'}
                </h1>
              </div>

              <div className="mb-10 text-sm border-b border-border-subtle pb-6 flex items-center justify-between flex-wrap gap-4 no-print">
                <p className="text-fg-secondary">
                  Executive Summary · Generated by Audin AI ({editableSummary?.modelUsed || 'Groq Llama 3.3 70B'}) · {document.date}
                </p>
              </div>

              {document.status === 'Processing' ? (
                <div className="p-8 rounded-2xl bg-surface border border-border text-center space-y-3 no-print">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm font-medium text-fg">AI is analyzing the transcript...</p>
                  <p className="text-xs text-fg-tertiary">Generating transcript with Whisper Large v3 and executive summary with Llama 3.3 70B.</p>
                </div>
              ) : document.status === 'Failed' ? (
                <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-2 no-print">
                  <p className="text-sm font-medium text-red-500">Processing failed</p>
                  <p className="text-xs text-red-500/70">There was an error generating the transcript or summary.</p>
                </div>
              ) : (
                <>
                  {editableSummary?.sections && editableSummary.sections.length > 0 ? (
                    <div className="space-y-10 mb-10">
                      {editableSummary.sections.map((section, idx) => (
                        <section key={idx}>
                          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider mb-3 text-fg-tertiary">
                            {section.heading}
                          </h2>
                          <div className="text-sm text-fg-secondary leading-relaxed">
                            <ReactMarkdown
                              components={{
                                p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                                ul: ({node, ...props}) => <ul className="space-y-2 list-none mb-3 last:mb-0" {...props} />,
                                li: ({node, ...props}) => <li className="pl-4 relative before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:bg-indigo-500/50 before:rounded-full" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-2 mb-3 last:mb-0" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-sm font-semibold text-fg mt-4 mb-2" {...props} />,
                                h4: ({node, ...props}) => <h4 className="text-xs font-semibold text-fg mt-3 mb-2" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-semibold text-fg" {...props} />,
                              }}
                            >
                              {section.content.join('\n')}
                            </ReactMarkdown>
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center no-print">
                      <p className="text-sm text-fg-tertiary">No summary sections available. You may need to re-summarize.</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="pt-4 border-t border-border no-print">
            <p className="text-xs text-fg-tertiary">
              File duration: {document.duration}.{' '}
              <button
                className="underline underline-offset-2 text-primary hover:text-primary-hover transition-colors"
                onClick={() => showToast('Transcript synchronized with raw transcript panel.', 'info')}
              >
                Review raw transcript →
              </button>
            </p>
          </div>

          <div className="hidden print:block mt-12 pt-4 border-t border-black/10 text-center text-xs text-gray-500">
            Generated by Audin AI ({editableSummary?.modelUsed || 'Groq Llama 3.3 70B'})
          </div>
        </article>
      </div>
    </div>
  )
}
