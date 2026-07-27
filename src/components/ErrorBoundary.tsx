import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onError?: (message: string) => void;
};

type State = {
  error: string | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const message = error.message || String(error);
    this.props.onError?.(message);
    console.error('[ErrorBoundary]', message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty" role="alert">
          <h1>Slice</h1>
          <p>Interface error — try reloading the window (Cmd+R).</p>
          <p className="empty__note">
            <code>{this.state.error}</code>
          </p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
