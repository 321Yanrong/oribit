import React from 'react';
import { FaHome } from 'react-icons/fa';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    let detail: string
    if (error instanceof Error) {
      detail = `${error.name}: ${error.message}\n${error.stack ?? ''}`
    } else {
      try {
        detail = JSON.stringify(error, Object.getOwnPropertyNames(Object(error)))
      } catch {
        detail = String(error)
      }
    }
    console.error('[ErrorBoundary] error detail:', detail)
    console.error('[ErrorBoundary] component stack:', info.componentStack)
  }

  handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0b0f1c] flex items-center justify-center px-6">
          <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl">
            <div className="text-3xl mb-3">🌪️</div>
            <h1 className="text-white text-lg font-semibold">Oops，Orbit 星球遇到了一点小风暴</h1>
            <p className="text-white/50 text-sm mt-2">
              页面出现异常，已自动拦截。你可以返回首页继续使用。
            </p>
            <button
              onClick={this.handleGoHome}
              className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#00FFB3] to-[#00D9FF] text-black font-semibold"
            >
              <FaHome className="text-sm" /> 返回首页
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
