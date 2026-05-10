import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { completeOAuthFromHash } = useAuth();

  useEffect(() => {
    let active = true;

    async function finishAuth() {
      const nextPath = searchParams.get("next") || "/dashboard";
      try {
        await completeOAuthFromHash(window.location.hash);
        if (!active) {
          return;
        }
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        toast.success("Signed in successfully.");
        navigate(nextPath, { replace: true });
      } catch (error) {
        if (!active) {
          return;
        }
        toast.error(error?.message || "OAuth sign-in failed.");
        navigate("/login", { replace: true });
      }
    }

    void finishAuth();

    return () => {
      active = false;
    };
  }, [completeOAuthFromHash, navigate, searchParams]);

  return (
    <section className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <h2 className="text-xl font-semibold text-gray-100">Completing Secure Sign-In</h2>
        <p className="mt-2 text-sm text-gray-400">
          Verifying provider response and restoring your session.
        </p>
      </Card>
    </section>
  );
}
