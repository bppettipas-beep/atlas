import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The last line of defence, wrapped around the whole application.
 *
 * Without one of these, a single thrown error anywhere in the tree unmounts
 * everything and leaves a blank white page with no way back except a manual
 * reload. That is how a one-line mistake in a marketing page managed to look
 * like the entire product had fallen over.
 *
 * Deliberately dependency-free: no hooks, no context, no design-system
 * imports. Whatever just failed, this has to be able to render.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Atlas hit an unrecoverable render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6">
        <div className="w-full max-w-[30rem] border border-edge bg-sheet p-8">
          <p className="text-edge text-ink-3">Something broke</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">
            This screen stopped responding.
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
            Your work is safe — this is a display problem, not a lost save. Try again, and if it
            keeps happening the details are in the browser console.
          </p>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="border border-ink bg-ink px-3 py-1.5 text-[13px] font-medium text-sheet transition-opacity hover:opacity-90"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="border border-edge px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-paper"
            >
              Reload Atlas
            </button>
          </div>

          <p className="mt-5 border-t border-rule pt-4 font-mono text-[11px] leading-relaxed text-ink-3">
            {error.message}
          </p>
        </div>
      </div>
    );
  }
}
