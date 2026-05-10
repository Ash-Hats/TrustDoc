import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const { sendResetPasswordEmail, isSupabaseConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const nextPath = useMemo(() => searchParams.get("next") || "/dashboard", [searchParams]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      await sendResetPasswordEmail(email);
      setIsSent(true);
      toast.success("Password reset email sent.");
    } catch (error) {
      toast.error(error?.message || "Could not send reset email.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4">
      <Card className="w-full max-w-md space-y-6">
        <div>
          <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
            Reset Password
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            {isSupabaseConfigured
              ? "Enter your email and we will send password recovery instructions."
              : "Supabase must be configured before password reset can be used."}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-wide text-gray-400">Email</span>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5">
              <Mail size={15} className="text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
                placeholder="you@company.com"
              />
            </div>
          </label>

          <Button type="submit" className="w-full" disabled={isLoading || !isSupabaseConfigured}>
            {isLoading ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>

        {isSent ? (
          <div className="rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            Recovery email sent. Open your inbox to continue.
          </div>
        ) : null}

        <p className="text-center text-xs text-gray-400">
          Back to{" "}
          <Link to={`/login?next=${encodeURIComponent(nextPath)}`} className="text-cyan-200 hover:text-cyan-100">
            Sign in
          </Link>
        </p>
      </Card>
    </section>
  );
}
