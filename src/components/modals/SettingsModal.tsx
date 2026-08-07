import { useState } from 'react'

interface SettingsModalProps {
  onClose: () => void
  userApiKey: string
  onSaveApiKey: (key: string) => void
  selectedModel: string
  onSaveModel: (model: string) => void
  uploadCount: number
  maxUploads?: number
}

type TabType = 'api' | 'transcription' | 'portfolio'

export default function SettingsModal({
  onClose,
  userApiKey,
  onSaveApiKey,
  selectedModel,
  onSaveModel,
  uploadCount,
  maxUploads = 5,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('api')
  const [apiKeyInput, setApiKeyInput] = useState(userApiKey)
  const [modelInput, setModelInput] = useState(selectedModel)
  const [language, setLanguage] = useState('auto')
  const [autoScroll, setAutoScroll] = useState(true)
  const [speakerDiarization, setSpeakerDiarization] = useState(true)
  const [saveMessage, setSaveMessage] = useState('')

  const handleSave = () => {
    onSaveApiKey(apiKeyInput.trim())
    onSaveModel(modelInput)
    setSaveMessage('Settings saved successfully!')
    setTimeout(() => setSaveMessage(''), 2500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl overflow-hidden bg-surface border border-border shadow-2xl animate-scale-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary-dim border border-indigo-500/20 text-primary-hover">
              {/* Gear / Cog Icon */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-base font-semibold font-display text-fg">
                Preferences & Settings
              </h2>
              <p className="text-xs text-fg-tertiary">Configure API keys, AI models, and portfolio options</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-fg-tertiary hover:text-fg hover:bg-surface-2 transition-colors"
            aria-label="Close settings"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border bg-surface-2 px-4 gap-1">
          {[
            { id: 'api', label: 'API & AI Model' },
            { id: 'transcription', label: 'Transcription' },
            { id: 'portfolio', label: 'Portfolio Info' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-primary-hover font-semibold'
                  : 'border-transparent text-fg-tertiary hover:text-fg-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {activeTab === 'api' && (
            <div className="space-y-5">
              {/* Portfolio Demo Status Banner */}
              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <div className="flex items-start gap-3">
                  <span className="text-lg">💡</span>
                  <div>
                    <h4 className="text-xs font-semibold font-mono uppercase text-indigo-300 mb-1">
                      Portfolio Demo Mode Active
                    </h4>
                    <p className="text-xs text-fg-secondary leading-relaxed">
                      Visitors can try this app using the shared demo Groq API quota (
                      <span className="font-mono text-indigo-300 font-semibold">
                        {Math.max(0, maxUploads - uploadCount)} / {maxUploads} uploads left today
                      </span>
                      ). If the limit is reached, enter your custom Groq API Key below to bypass the limit.
                    </p>
                  </div>
                </div>
              </div>

              {/* API Key Form */}
              <div>
                <label className="block text-xs font-mono font-medium mb-1.5 text-fg-secondary">
                  CUSTOM GROQ API KEY
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="gsk_..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono bg-surface-2 border border-border text-fg outline-none focus:border-indigo-500 transition-all"
                />
                <p className="text-xs text-fg-tertiary mt-1.5">
                  Stored securely in your browser's <code className="text-indigo-400">localStorage</code>. Never sent to third-party servers.
                </p>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-xs font-mono font-medium mb-1.5 text-fg-secondary">
                  AI INTELLIGENCE MODEL
                </label>
                <select
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono bg-surface-2 border border-border text-fg outline-none focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Recommended)</option>
                  <option value="whisper-large-v3">Whisper Large v3 (Audio Transcription)</option>
                  <option value="mixtral-8x7b-32768">Mixtral 8x7b 32k (Fast Analysis)</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'transcription' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-mono font-medium mb-1.5 text-fg-secondary">
                  DEFAULT AUDIO LANGUAGE
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono bg-surface-2 border border-border text-fg outline-none focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="auto">🌐 Auto-Detect Language</option>
                  <option value="id">🇮🇩 Indonesian (Bahasa Indonesia)</option>
                  <option value="en">🇺🇸 English</option>
                  <option value="es">🇪🇸 Spanish</option>
                </select>
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-2 border border-border">
                  <div>
                    <p className="text-sm font-medium text-fg">Speaker Diarization</p>
                    <p className="text-xs text-fg-tertiary">Distinguish and label different speakers automatically</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={speakerDiarization}
                    onChange={(e) => setSpeakerDiarization(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-2 border border-border">
                  <div>
                    <p className="text-sm font-medium text-fg">Auto-Scroll Transcript</p>
                    <p className="text-xs text-fg-tertiary">Keep transcript line in view as audio plays</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'portfolio' && (
            <div className="space-y-4 text-xs text-fg-secondary leading-relaxed">
              <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
                <p className="font-semibold text-fg text-sm font-display">Audin — Audio Intelligence Platform</p>
                <p>Version 1.0.0 (Portfolio Showcase Edition)</p>
                <p className="text-fg-tertiary">
                  Designed & built as an interactive showcase of modern Web UI/UX, React 19 architecture, Tailwind CSS v4 styling, and AI audio intelligence.
                </p>
              </div>

              <div className="space-y-2">
                <p className="font-mono text-fg font-medium">STACK SPECIFICATIONS:</p>
                <ul className="list-disc pl-5 space-y-1 text-fg-tertiary">
                  <li>Frontend: React 19, TypeScript 5.7, Vite 8</li>
                  <li>Styling: Tailwind CSS v4 (@tailwindcss/vite)</li>
                  <li>AI Backend Engine: Groq LPU AI Inference API</li>
                </ul>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs border-t border-border">
                <span className="text-fg-tertiary">Developed for Portfolio Demo</span>
                <a
                  href="https://github.com/galihpraditya"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-mono"
                >
                  GitHub Repository →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface">
          <span className="text-xs text-emerald-400 font-medium">{saveMessage}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-border text-fg-secondary hover:text-fg hover:bg-surface-2 transition-all"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-medium shadow-md transition-all text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
