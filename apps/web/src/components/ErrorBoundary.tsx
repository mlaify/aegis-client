import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Aegis] Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto mt-16 max-w-xl space-y-4 p-8">
          <h2 className="text-lg font-semibold text-aegis-danger">Something went wrong</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            An unexpected error occurred. You can try refreshing the page; your local
            identity and vault data are stored in IndexedDB and will not be lost.
          </p>
          <pre className="overflow-x-auto rounded-md bg-slate-100 p-3 text-xs dark:bg-slate-800">
            {this.state.error.message}
          </pre>
          <button
            className="aegis-button-primary"
            onClick={() => this.setState({ error: null })}
          >
            Dismiss and retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
