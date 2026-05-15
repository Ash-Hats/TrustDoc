/**
 * RoleGuard Component
 * Restricts access based on user role
 */

import { Navigate } from 'react-router-dom';
import { useRole } from '../hooks/useRole';
import { ROUTES } from '../utils/constants';

export function RoleGuard({
  children,
  requiredRole = null,
  requiredPermission = null,
  requiredPermissions = null,
  requireAll = true,
  fallback = null,
}) {
  const { check } = useRole();

  let hasAccess = true;

  if (requiredRole) {
    hasAccess = check.hasRole(requiredRole);
  } else if (requiredPermission) {
    hasAccess = check.hasPermission(requiredPermission);
  } else if (requiredPermissions) {
    hasAccess = check.hasPermissions(requiredPermissions, requireAll);
  }

  if (!hasAccess) {
    // Return fallback component if provided
    if (fallback) {
      return fallback;
    }

    // Redirect to dashboard
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return children;
}

/**
 * AdminGuard Component
 * Restricts access to admin users
 */
export function AdminGuard({ children, fallback = null }) {
  return (
    <RoleGuard requiredRole="admin" fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

/**
 * IssuerGuard Component
 * Restricts access to issuer and admin users
 */
export function IssuerGuard({ children, fallback = null }) {
  return (
    <RoleGuard requiredRole="issuer" fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

/**
 * VerifierGuard Component
 * Restricts access to verifier and admin users
 */
export function VerifierGuard({ children, fallback = null }) {
  return (
    <RoleGuard requiredRole="verifier" fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

export default RoleGuard;
