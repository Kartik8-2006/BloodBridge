import { Component, type ReactNode } from 'react';

/** Last line of defence: a crash in one page shows a calm message and a reload button instead of a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('Unhandled UI error', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-extrabold text-ink-900">Something went wrong</h1>
        <p className="mt-3 text-ink-600">We hit an unexpected problem. Your data is safe. Reloading usually fixes it.</p>
        <button onClick={() => window.location.reload()} className="mt-6 cursor-pointer rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">Reload page</button>
      </div>
    );
  }
}
