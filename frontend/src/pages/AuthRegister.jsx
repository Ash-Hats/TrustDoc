import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { KeyRound, Mail, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { sanitizeText } from "../utils/security";

export default function AuthRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp, isSupabaseConfigured } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const nextPath = useMemo(() => searchParams.get("next") || "/dashboard", [searchParams]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    const safeName = sanitizeText(fullName, { maxLength: 80 });
    if (password.length < 8) {
      toast.error("Use a password with at least 8 characters.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await signUp({
        email,
        password,
        displayName: safeName,
      });

      if (result.requiresEmailVerification) {
        toast.success("Check your inbox to verify email, then sign in.");
        navigate(`/login?next=${encodeURIComponent(nextPath)}`, { replace: true });
        return;
      }

      toast.success("Account created successfully.");
      navigate(nextPath, { replace: true });
    } catch (error) {
      toast.error(error?.message || "Account creation failed.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <h2 className="text-xl font-semibold text-gray-100">Authentication Not Configured</h2>
          <p className="mt-2 text-sm text-gray-400">
            Add Supabase environment variables before registering new users.
          </p>
          <div className="mt-4">
            <Link to="/login">
              <Button variant="secondary">Back to Login</Button>
            </Link>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4">
      <Card className="w-full max-w-md space-y-6">
        <div>
          <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
            Create Account
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Set up your account to isolate documents, history, and analytics by user.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-wide text-gray-400">Full Name</span>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5">
              <UserRound size={15} className="text-gray-400" />
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
                placeholder="Your name"
              />
            </div>
          </label>

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
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
                placeholder="Minimum 8 characters"
              />
            </div>
          </label>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Creating Account..." : "Create Account"}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400">
          Already have an account?{" "}
          <Link to={`/login?next=${encodeURIComponent(nextPath)}`} className="text-cyan-200 hover:text-cyan-100">
            Sign in
          </Link>
        </p>
      </Card>
    </section>
  );
}
