import { Component, type ReactNode } from 'react';
import { COPY } from '../copy.ts';

interface State {
  readonly failed: boolean;
}

/** Shows a way out instead of a blank screen if rendering ever throws. */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="lobby">
        <p>{COPY.crashed}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          {COPY.reload}
        </button>
      </main>
    );
  }
}
