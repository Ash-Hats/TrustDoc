import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { KeyRound, Mail, Wallet } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

function SetupHint({ setupGuide }) {
  return (
    <Card className="mx-auto w-full max-w-md space-y-4">
      <h2 className="text-xl font-semibold text-gray-100">Supabase Setup Required</h2>
      <p className="text-sm text-gray-400">
        Configure authentication before users can sign in.
      </p>
      <ul className="space-y-1 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-cyan-200">
        {setupGuide.requiredEnv.map((item) => (
          <li key={item} className="font-mono">
            {item}
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500">Callback URL: {setupGuide.callbackUrl}</p>
    </Card>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    signIn,
    signInWithGoogle,
    signInWithWallet,
    isSupabaseConfigured,
    setupGuide,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const nextPath = useMemo(() => searchParams.get("next") || "/dashboard", [searchParams]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      await signIn({ email, password });
      toast.success("Signed in successfully.");
      navigate(nextPath, { replace: true });
    } catch (error) {
      toast.error(error?.message || "Sign-in failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleWalletSignIn() {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      await signInWithWallet();
      toast.success("Wallet sign-in successful.");
      navigate(nextPath, { replace: true });
    } catch (error) {
      toast.error(error?.message || "Wallet sign-in failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleGoogleSignIn() {
    try {
      signInWithGoogle(nextPath);
    } catch (error) {
      toast.error(error?.message || "Google sign-in unavailable.");
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4">
        <SetupHint setupGuide={setupGuide} />
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4">
      <Card className="w-full max-w-md space-y-6">
        <div>
          <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
            Sign In
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Access your TrustDoc workspace, analytics, and user-scoped records.
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

          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-wide text-gray-400">Password</span>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5">
              <KeyRound size={15} className="text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
                placeholder="Enter password"
              />
            </div>
          </label>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Signing In..." : "Sign In"}
          </Button>
        </form>

        <div className="space-y-2">
          <Button
            variant="secondary"
            className="w-full"
            disabled={isLoading}
            onClick={handleGoogleSignIn}
          >
            Continue with Google
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={isLoading}
            onClick={handleWalletSignIn}
          >
            <Wallet size={15} />
            Sign In with Wallet
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <Link to={`/forgot-password?next=${encodeURIComponent(nextPath)}`} className="hover:text-cyan-200">
            Forgot password?
          </Link>
          <Link to={`/register?next=${encodeURIComponent(nextPath)}`} className="hover:text-cyan-200">
            Create account
          </Link>
        </div>
      </Card>
    </section>
  );
}
