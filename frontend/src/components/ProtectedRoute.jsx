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

export default function ProtectedRoute({
  children,
  requiredPortal = "user",
  requiredRoles = [],
  requiredPermissions = [],
  requireSetup = true,
}) {
  const location = useLocation();
  const {
    isAuthenticated,
    isAuthLoading,
    isRoleLoading,
    isSupabaseConfigured,
    profile,
    canAccessPortal,
    hasRole,
    hasPermission,
  } = useAuth();

  if (isAuthLoading || isRoleLoading) {
    return <AuthLoadingState />;
  }

  if (!isSupabaseConfigured) {
    return children;
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    const loginBase =
      requiredPortal === "superadmin"
        ? "/superadmin/login"
        : requiredPortal === "admin"
          ? "/admin/login"
          : "/login";
    return <Navigate to={`${loginBase}?next=${next}`} replace />;
  }

  if (!canAccessPortal(requiredPortal)) {
    if (requiredPortal === "superadmin") {
      return <Navigate to="/superadmin/login" replace />;
    }
    if (requiredPortal === "admin") {
      return <Navigate to="/admin/login" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  if (requiredRoles.length && !requiredRoles.some((roleKey) => hasRole(roleKey))) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requiredPermissions.length && !requiredPermissions.every((permission) => hasPermission(permission))) {
    return <Navigate to="/dashboard" replace />;
  }

  // Gate setup completion for dashboard and authenticated routes
  if (requireSetup && !profile?.setup_completed) {
    return <Navigate to="/setup/identity" replace />;
  }

  return children;
}
