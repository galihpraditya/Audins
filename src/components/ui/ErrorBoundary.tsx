import { Component, ErrorInfo, ReactNode } from "react"

import { WarningCircle, ArrowClockwise } from "@phosphor-icons/react"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error | null
  errorInfo?: ErrorInfo | null
}

/**
 * Global render-error boundary. Previously any uncaught render exception
 * (e.g. a bad regex in user search input) white-screened the whole SPA.
 */

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught UI error:", error, info.componentStack)
    this.setState({ error, errorInfo: info })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleResetStorage = () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex items-center justify-center bg-background p-6">
          <div className="max-w-xl w-full text-center glass-card rounded-2xl p-8 space-y-4">
            <div className="w-14 h-14 rounded-full bg-danger-dim flex items-center justify-center mx-auto text-danger">
              <WarningCircle size={28} weight="duotone" />
            </div>
            <h1 className="text-lg font-bold font-display text-fg">
              Something went wrong
            </h1>
            <p className="text-xs text-fg-secondary leading-relaxed">
              An unexpected error occurred while rendering the app. Your data is safe — reloading usually fixes this.
            </p>

            {this.state.error && (
              <div className="text-left bg-surface-2 p-3 rounded-lg border border-border text-xs font-mono overflow-auto max-h-48 text-danger">
                <p className="font-bold">{this.state.error.name}: {this.state.error.message}</p>
                {this.state.error.stack && (
                  <pre className="mt-2 text-[10px] text-fg-tertiary whitespace-pre-wrap">{this.state.error.stack}</pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-primary-contrast bg-primary hover:bg-primary-hover transition-all"
              >
                <ArrowClockwise size={14} weight="bold" />
                Reload Audins
              </button>
              <button
                onClick={this.handleResetStorage}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-fg-secondary hover:text-fg bg-surface-2 hover:bg-surface-3 transition-all"
                title="Clears local state and reloads"
              >
                Clear Storage & Reset
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

