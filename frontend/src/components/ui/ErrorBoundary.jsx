import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Unexpected UI failure.",
    };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught:", error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="m-6 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-6 text-rose-100 shadow-glow-rose">
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="mt-2 text-sm text-rose-200/90">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Reload App
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
