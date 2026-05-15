/**
 * useRole Hook
 * Provides role-based access control functionality
 */

import { useAuth } from '../context/AuthContext';
import {
  hasRole,
  hasPermission,
  hasPermissions,
  getRolePermissions,
  getRoleFeatures,
  canEditDocument,
  canDeleteDocument,
  canRevokeDocument,
  canShareDocument,
  canManageUsers,
  canViewAuditLogs,
} from '../utils/rolePermissions';

/**
 * useRole Hook
 * Provides role and permission checking utilities
 * @returns {Object}
 */
export function useRole() {
  const { profile } = useAuth();
  const userRole = profile?.role || 'user';
  const userId = profile?.user_id;

  const check = {
    // Basic role checks
    isUser: () => hasRole(userRole, 'user'),
    isIssuer: () => hasRole(userRole, 'issuer'),
    isVerifier: () => hasRole(userRole, 'verifier'),
    isAdmin: () => hasRole(userRole, 'admin'),
    isSuperAdmin: () => hasRole(userRole, 'super_admin'),

    // Generic role check
    hasRole: (requiredRole) => hasRole(userRole, requiredRole),

    // Permission checks
    hasPermission: (permission) => hasPermission(userRole, permission),
    hasPermissions: (permissions, requireAll = true) =>
      hasPermissions(userRole, permissions, requireAll),

    // Document-level checks
    canEdit: (ownerId) => canEditDocument(userRole, ownerId, userId),
    canDelete: (ownerId) => canDeleteDocument(userRole, ownerId, userId),
    canRevoke: (ownerId) => canRevokeDocument(userRole, ownerId, userId),
    canShare: (ownerId) => canShareDocument(userRole, ownerId, userId),

    // Admin checks
    canManageUsers: () => canManageUsers(userRole),
    canViewAuditLogs: () => canViewAuditLogs(userRole),
  };

  const get = {
    // Get role info
    role: () => userRole,
    permissions: () => getRolePermissions(userRole),
    features: () => getRoleFeatures(userRole),
  };

  return {
    userRole,
    userId,
    check,
    get,
  };
}

export default useRole;
