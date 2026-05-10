import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Card from "./ui/Card";

function AuthLoadingState() {
  return (
    <Card className="mx-auto mt-10 w-full max-w-xl">
      <h2 className="text-xl font-semibold text-gray-100">Restoring Session</h2>
      <p className="mt-2 text-sm text-gray-400">
        Verifying your account and loading your protected workspace.
      </p>
    </Card>
  );
}

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const { isAuthenticated, isAuthLoading, isSupabaseConfigured, profile } = useAuth();

  if (isAuthLoading) {
    return <AuthLoadingState />;
  }

  if (!isSupabaseConfigured) {
    return children;
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // Gate setup completion for dashboard and authenticated routes
  if (!profile?.setup_completed) {
    return <Navigate to="/setup/identity" replace />;
  }

  return children;
}
