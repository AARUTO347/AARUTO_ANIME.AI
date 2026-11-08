import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Last-resort guard: renders a recovery screen instead of a
 * white page when an unexpected render error escapes.
 */
export default class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black text-white p-8 text-center font-sans">
        <div className="w-20 h-20 chakra-gradient rounded-3xl flex items-center justify-center mb-6 rotate-45">
          <i className="fa-solid fa-triangle-exclamation text-3xl text-white -rotate-45" aria-hidden="true"></i>
        </div>
        <h1 className="text-2xl font-bungee mb-3">The Void Glitched</h1>
        <p className="text-sm text-gray-400 max-w-md mb-2">Something crashed while rendering this screen. Your archived records in IndexedDB are safe.</p>
        {this.state.message && (
          <pre className="text-[10px] text-red-400/80 bg-white/5 border border-white/10 rounded-xl p-3 max-w-lg overflow-auto mb-6">{this.state.message}</pre>
        )}
        <div className="flex gap-3">
          <button onClick={this.handleReset} className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10">Try Again</button>
          <button onClick={() => window.location.reload()} className="px-6 py-3 chakra-gradient rounded-xl text-xs font-black uppercase tracking-widest">Reload App</button>
        </div>
      </div>
    );
  }
}
