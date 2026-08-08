// One boundary around the app: a component throw becomes a message with a
// reload path instead of a blank page.
import { Component } from 'react'
import type { ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty">
          Something broke in the viewer: {this.state.error.message}{' '}
          <button className="themeToggle" onClick={() => location.reload()}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}
