import React from 'react'

// Catches render errors anywhere below it so a single component fault shows a
// readable message instead of blanking the whole window. (Note: it can't catch
// out-of-memory crashes, which take down the renderer process itself.)
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface it for the dev console / future crash reporting.
    console.error('GitVista hit a render error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash">
          <div className="crash-card">
            <div className="crash-title">Something went wrong displaying this view</div>
            <p className="crash-body">
              GitVista caught an error and stopped this screen from going blank. Your repository is untouched. Try
              reloading; if it keeps happening, the details below help track it down.
            </p>
            {import.meta.env.DEV && (
              <pre className="crash-detail">{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
            )}
            <div className="crash-actions">
              <button className="primary-btn" onClick={() => window.location.reload()}>
                Reload
              </button>
              <button className="ghost-btn" onClick={() => this.setState({ error: null })}>
                Try to dismiss
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
