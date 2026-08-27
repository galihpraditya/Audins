import { Component, ErrorInfo, ReactNode } from "react"
import { WarningCircle, ArrowClockwise } from "@phosphor-icons/react"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Global render-error boundary. Previously any uncaught render exception
 * (e.g. a bad regex in user search input) white-screened the whole SPA.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught UI error:", error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center glass-card rounded-2xl p-8 space-y-4">
            <div className="w-14 h-14 rounded-full bg-danger-dim flex items-center justify-center mx-auto text-danger">
              <WarningCircle size={28} weight="duotone" />
            </div>
            <h1 className="text-lg font-bold font-display text-fg">
              Something went wrong
            </h1>
            <p className="text-xs text-fg-secondary leading-relaxed">
              An unexpected error occurred while rendering the app. Your data is
              safe â€” reloading usually fixes this.
            </p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-primary-contrast bg-primary hover:bg-primary-hover transition-all"
            >
              <ArrowClockwise size={14} weight="bold" />
              Reload Audins
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
