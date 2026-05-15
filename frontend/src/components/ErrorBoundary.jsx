/**
 * ErrorBoundary Component
 * Catches and handles component errors gracefully
 */

import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './ui/Button';
import { logError } from '../utils/errorMessages';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Update state
    this.setState((prevState) => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Log error
    logError('ErrorBoundary', error, {
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
    });

    // Report to error tracking service in production
    if (import.meta.env.PROD) {
      // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    const { hasError, error, errorCount } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback({ error, resetError: this.resetError });
      }

      // Too many errors - show critical error
      if (errorCount > 3) {
        return (
          <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-rose-950/20 to-transparent px-4">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20">
                <AlertTriangle className="text-rose-400" size={24} />
              </div>
              <h2 className="text-xl font-bold text-gray-100">Critical Error</h2>
              <p className="mt-2 text-sm text-gray-300">
                The application has encountered multiple critical errors and needs to be restarted.
              </p>
              <Button
                className="mt-6"
                onClick={() => window.location.reload()}
              >
                Reload Application
              </Button>
            </div>
          </div>
        );
      }

      // Standard error display
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-amber-950/20 to-transparent px-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-amber-500/10 p-6 shadow-lg backdrop-blur-sm">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
              <AlertTriangle className="text-amber-200" size={20} />
            </div>

            <h2 className="text-lg font-bold text-gray-100">
              Something Went Wrong
            </h2>

            <p className="mt-2 text-sm text-gray-300">
              {error?.message || 'An unexpected error occurred'}
            </p>

            {import.meta.env.DEV && error?.stack && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-300">
                  Error Details
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-black/30 p-2 text-xs text-gray-400">
                  {error.stack}
                </pre>
              </details>
            )}

            <div className="mt-6 flex gap-2">
              <Button variant="secondary" onClick={this.resetError} className="flex-1">
                Try Again
              </Button>
              <Button
                onClick={() => (window.location.href = '/')}
                className="flex-1"
              >
                <RefreshCw size={16} className="mr-1" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
