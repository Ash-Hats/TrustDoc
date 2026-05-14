import { Link } from "react-router-dom";

export default function PublicLayout({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0f1117]">
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />

      <main className="relative z-10 mx-auto w-full max-w-6xl p-4 sm:p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#1a1f2e]/75 p-4 shadow-glass backdrop-blur-xl">
          <div>
            <h1 className="bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
              TrustDoc Public Verification
            </h1>
            <p className="text-xs text-gray-400">No login or wallet needed for verification checks.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link
              to="/login"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 font-semibold text-gray-200 transition hover:bg-white/10"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-1.5 font-semibold text-cyan-200 transition hover:bg-cyan-500/15"
            >
              Create Account
            </Link>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
