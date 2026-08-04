// ─────────────────────────────────────────────────────────────────────────────
// ErrorBoundary — React error boundary with retry and logout options
// ─────────────────────────────────────────────────────────────────────────────
// Catches unhandled React render errors and displays a fallback UI:
//   - Error message and stack trace display
//   - "Retry" button (re-renders the component tree)
//   - "Logout" button (clears auth and redirects to login)
//   - Retry counter (limits auto-retry attempts to prevent infinite loops)
//
// Wraps the entire app in App.jsx to prevent white-screen crashes.
// ─────────────────────────────────────────────────────────────────────────────

import React, { Component } from 'react';
import * as Sentry from '@sentry/react';
import { AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { authService } from '../../services/authService';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Report to Sentry with component stack context
    Sentry.captureException(error, {
      contexts: { componentStack: errorInfo?.componentStack },
    });

    // Log critical error with context
    console.error('[ErrorBoundary] Caught error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    // First two retries: just re-render children (no logout)
    // Third+ retry: reload the page (still no logout)
    const { retryCount } = this.state;
    if (retryCount < 2) {
      this.setState({ hasError: false, retryCount: retryCount + 1 });
    } else {
      window.location.reload();
    }
  };

  handleLogout = () => {
    authService.logout();
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-xl font-black text-gray-900">Something went wrong</h2>
            </div>
            <p className="text-gray-600 mb-6">
              An unexpected error occurred. Please try again or contact support if the problem persists.
            </p>
            <button
              onClick={this.handleRetry}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#E53935] text-white rounded-xl font-black uppercase hover:bg-[#B71C1C] transition-colors mb-3"
            >
              <RefreshCw size={18} />
              {this.state.retryCount < 2 ? 'Retry' : 'Reload Page'}
            </button>
            <button
              onClick={this.handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold uppercase hover:bg-gray-200 transition-colors"
            >
              <LogOut size={18} />
              Logout & Restart
            </button>
            {this.props.showDetails && this.state.error && (
              <details className="mt-4 p-4 bg-gray-100 rounded-lg">
                <summary className="text-xs font-bold text-gray-700 cursor-pointer">
                  Error Details
                </summary>
                <pre className="mt-2 text-xs text-gray-600 overflow-auto">
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
