import React from 'react';
import { AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      const { appName } = this.props;
      return (
        <main className="max-w-7xl mx-auto px-2.5 sm:px-5 pt-3 sm:pt-4">
          <div className="rounded-2xl sm:rounded-3xl p-6 border border-rose-300 dark:border-rose-900/60 bg-surface-card text-text-primary shadow-xs space-y-3">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 font-extrabold text-base">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Could not load {appName || 'module'}</span>
            </div>
            <p className="text-xs text-text-muted">
              If Howard was recently rebuilt or updated, reloading the page fetches the latest module bundle.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer transition active:scale-[0.98]"
              >
                Reload Howard
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-surface-subtle text-text-primary hover:bg-surface-hover text-xs font-bold cursor-pointer transition active:scale-[0.98]"
              >
                Try Again
              </button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
