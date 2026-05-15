/**
 * Role and Permission Utilities
 * Provides functions for checking permissions and role-based access
 */

import {
  ROLES,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  PERMISSIONS,
} from './constants.js';

/**
 * Check if user has a specific role
 * @param {string} userRole - User's current role
 * @param {string} requiredRole - Required role to check
 * @returns {boolean}
 */
export function hasRole(userRole, requiredRole) {
  if (!userRole || !requiredRole) return false;
  
  const userHierarchy = ROLE_HIERARCHY[userRole];
  const requiredHierarchy = ROLE_HIERARCHY[requiredRole];
  
  if (!userHierarchy || !requiredHierarchy) return false;
  
  return userHierarchy >= requiredHierarchy;
}

/**
 * Check if user has a specific permission
 * @param {string} userRole - User's current role
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
export function hasPermission(userRole, permission) {
  if (!userRole) return false;
  
  const rolePermissions = ROLE_PERMISSIONS[userRole];
  if (!rolePermissions) return false;
  
  return rolePermissions.includes(permission);
}

/**
 * Check if user can perform multiple permissions
 * @param {string} userRole - User's current role
 * @param {string[]} permissions - Array of permissions to check
 * @param {boolean} requireAll - If true, all permissions required; if false, any permission required
 * @returns {boolean}
 */
export function hasPermissions(userRole, permissions, requireAll = true) {
  if (!userRole || !Array.isArray(permissions)) return false;
  
  const rolePermissions = ROLE_PERMISSIONS[userRole];
  if (!rolePermissions) return false;
  
  if (requireAll) {
    return permissions.every(p => rolePermissions.includes(p));
  }
  
  return permissions.some(p => rolePermissions.includes(p));
}

/**
 * Get all permissions for a role
 * @param {string} userRole - User's current role
 * @returns {string[]}
 */
export function getRolePermissions(userRole) {
  return ROLE_PERMISSIONS[userRole] || [];
}

/**
 * Check if user can access a route based on role
 * @param {string} userRole - User's current role
 * @param {string} requiredRole - Minimum required role
 * @returns {boolean}
 */
export function canAccessRoute(userRole, requiredRole) {
  if (!requiredRole) return true; // Public route
  return hasRole(userRole, requiredRole);
}

/**
 * Check if user can edit a document
 * @param {string} userRole - User's current role
 * @param {string} ownerId - User ID of document owner
 * @param {string} currentUserId - Current user's ID
 * @returns {boolean}
 */
export function canEditDocument(userRole, ownerId, currentUserId) {
  // Owner can always edit their own documents
  if (ownerId === currentUserId) {
    return hasPermission(userRole, PERMISSIONS.EDIT_DOCUMENT);
  }
  
  // Only admins can edit other users' documents
  return hasRole(userRole, ROLES.ADMIN);
}

/**
 * Check if user can delete a document
 * @param {string} userRole - User's current role
 * @param {string} ownerId - User ID of document owner
 * @param {string} currentUserId - Current user's ID
 * @returns {boolean}
 */
export function canDeleteDocument(userRole, ownerId, currentUserId) {
  // Owner can delete their own documents
  if (ownerId === currentUserId) {
    return hasPermission(userRole, PERMISSIONS.DELETE_DOCUMENT);
  }
  
  // Only admins can delete other users' documents
  return hasRole(userRole, ROLES.ADMIN);
}

/**
 * Check if user can revoke a document
 * @param {string} userRole - User's current role
 * @param {string} ownerId - User ID of document owner
 * @param {string} currentUserId - Current user's ID
 * @returns {boolean}
 */
export function canRevokeDocument(userRole, ownerId, currentUserId) {
  // Owner can revoke their own documents
  if (ownerId === currentUserId) {
    return hasPermission(userRole, PERMISSIONS.REVOKE_DOCUMENT);
  }
  
  // Only admins can revoke other users' documents
  return hasRole(userRole, ROLES.ADMIN);
}

/**
 * Check if user can share a document
 * @param {string} userRole - User's current role
 * @param {string} ownerId - User ID of document owner
 * @param {string} currentUserId - Current user's ID
 * @returns {boolean}
 */
export function canShareDocument(userRole, ownerId, currentUserId) {
  // Owner can share their own documents
  if (ownerId === currentUserId) {
    return hasPermission(userRole, PERMISSIONS.SHARE_DOCUMENT);
  }
  
  // Only admins can share other users' documents
  return hasRole(userRole, ROLES.ADMIN);
}

/**
 * Check if user can manage users
 * @param {string} userRole - User's current role
 * @returns {boolean}
 */
export function canManageUsers(userRole) {
  return hasRole(userRole, ROLES.ADMIN);
}

/**
 * Check if user can view audit logs
 * @param {string} userRole - User's current role
 * @returns {boolean}
 */
export function canViewAuditLogs(userRole) {
  return hasRole(userRole, ROLES.ADMIN);
}

/**
 * Get role-specific routes/features
 * @param {string} userRole - User's current role
 * @returns {Object} - Routes and features available for the role
 */
export function getRoleFeatures(userRole) {
  const baseFeatures = {
    canViewProfile: true,
    canViewDocuments: true,
    canVerifyDocuments: true,
  };

  switch (userRole) {
    case ROLES.ISSUER:
      return {
        ...baseFeatures,
        canUploadDocuments: true,
        canEditDocuments: true,
        canDeleteDocuments: true,
        canRevokeDocuments: true,
        canShareDocuments: true,
      };

    case ROLES.VERIFIER:
      return {
        ...baseFeatures,
        canVerifyDocuments: true,
        canViewAuditLogs: false,
      };

    case ROLES.ADMIN:
      return {
        ...baseFeatures,
        canUploadDocuments: true,
        canEditDocuments: true,
        canDeleteDocuments: true,
        canRevokeDocuments: true,
        canShareDocuments: true,
        canManageUsers: true,
        canViewAuditLogs: true,
        canAccessAdminDashboard: true,
      };

    case ROLES.SUPER_ADMIN:
      return {
        ...baseFeatures,
        canUploadDocuments: true,
        canEditDocuments: true,
        canDeleteDocuments: true,
        canRevokeDocuments: true,
        canShareDocuments: true,
        canManageUsers: true,
        canViewAuditLogs: true,
        canAccessAdminDashboard: true,
        canAccessSuperAdminDashboard: true,
        canManageOrganizations: true,
        canManageRoles: true,
      };

    case ROLES.USER:
    default:
      return baseFeatures;
  }
}

/**
 * Check if role is enterprise role
 * @param {string} role - Role to check
 * @returns {boolean}
 */
export function isEnterpriseRole(role) {
  return [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(role);
}

/**
 * Get available roles for promotion (for admins)
 * @param {string} currentUserRole - Current user's role
 * @returns {string[]} - Array of roles that can be assigned
 */
export function getPromotableRoles(currentUserRole) {
  if (currentUserRole === ROLES.SUPER_ADMIN) {
    return [ROLES.USER, ROLES.ISSUER, ROLES.VERIFIER, ROLES.ADMIN];
  }

  if (currentUserRole === ROLES.ADMIN) {
    return [ROLES.USER, ROLES.ISSUER, ROLES.VERIFIER];
  }

  return [];
}

/**
 * Validate role value
 * @param {string} role - Role to validate
 * @returns {boolean}
 */
export function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

export default {
  hasRole,
  hasPermission,
  hasPermissions,
  getRolePermissions,
  canAccessRoute,
  canEditDocument,
  canDeleteDocument,
  canRevokeDocument,
  canShareDocument,
  canManageUsers,
  canViewAuditLogs,
  getRoleFeatures,
  isEnterpriseRole,
  getPromotableRoles,
  isValidRole,
};
