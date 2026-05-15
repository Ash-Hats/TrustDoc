/**
 * TrustDoc Application Constants
 * Centralized configuration and constants for consistency across the app
 */

// ============================================================================
// ROLES AND PERMISSIONS
// ============================================================================

export const ROLES = {
  USER: 'user',
  ISSUER: 'issuer',
  VERIFIER: 'verifier',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
};

export const ROLE_LABELS = {
  [ROLES.USER]: 'User',
  [ROLES.ISSUER]: 'Issuer',
  [ROLES.VERIFIER]: 'Verifier',
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.SUPER_ADMIN]: 'Super Administrator',
};

export const ROLE_HIERARCHY = {
  [ROLES.USER]: 1,
  [ROLES.ISSUER]: 2,
  [ROLES.VERIFIER]: 2,
  [ROLES.ADMIN]: 3,
  [ROLES.SUPER_ADMIN]: 4,
};

export const PERMISSIONS = {
  // Document operations
  UPLOAD_DOCUMENT: 'upload_document',
  VIEW_DOCUMENT: 'view_document',
  EDIT_DOCUMENT: 'edit_document',
  DELETE_DOCUMENT: 'delete_document',
  REVOKE_DOCUMENT: 'revoke_document',
  SHARE_DOCUMENT: 'share_document',

  // Verification
  VERIFY_DOCUMENT: 'verify_document',

  // Admin operations
  MANAGE_USERS: 'manage_users',
  MANAGE_ROLES: 'manage_roles',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  VIEW_ANALYTICS: 'view_analytics',
};

// Role to permissions mapping
export const ROLE_PERMISSIONS = {
  [ROLES.USER]: [
    PERMISSIONS.VIEW_DOCUMENT,
    PERMISSIONS.VERIFY_DOCUMENT,
  ],
  [ROLES.ISSUER]: [
    PERMISSIONS.UPLOAD_DOCUMENT,
    PERMISSIONS.VIEW_DOCUMENT,
    PERMISSIONS.EDIT_DOCUMENT,
    PERMISSIONS.DELETE_DOCUMENT,
    PERMISSIONS.REVOKE_DOCUMENT,
    PERMISSIONS.SHARE_DOCUMENT,
    PERMISSIONS.VERIFY_DOCUMENT,
  ],
  [ROLES.VERIFIER]: [
    PERMISSIONS.VERIFY_DOCUMENT,
    PERMISSIONS.VIEW_DOCUMENT,
  ],
  [ROLES.ADMIN]: [
    ...Object.values(PERMISSIONS),
  ],
  [ROLES.SUPER_ADMIN]: [
    ...Object.values(PERMISSIONS),
  ],
};

// ============================================================================
// DOCUMENT PRIVACY LEVELS
// ============================================================================

export const PRIVACY_LEVELS = {
  PRIVATE: 'private',
  SHARED: 'shared',
  PUBLIC: 'public',
};

export const PRIVACY_LABELS = {
  [PRIVACY_LEVELS.PRIVATE]: 'Private',
  [PRIVACY_LEVELS.SHARED]: 'Shared',
  [PRIVACY_LEVELS.PUBLIC]: 'Public',
};

export const PRIVACY_DESCRIPTIONS = {
  [PRIVACY_LEVELS.PRIVATE]: 'Only you can see this document',
  [PRIVACY_LEVELS.SHARED]: 'Shared with specific users',
  [PRIVACY_LEVELS.PUBLIC]: 'Anyone can view this document',
};

// ============================================================================
// WORKFLOW STATUSES
// ============================================================================

export const WORKFLOW_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVOKED: 'revoked',
};

export const WORKFLOW_STATUS_LABELS = {
  [WORKFLOW_STATUSES.DRAFT]: 'Draft',
  [WORKFLOW_STATUSES.PENDING]: 'Pending Review',
  [WORKFLOW_STATUSES.APPROVED]: 'Approved',
  [WORKFLOW_STATUSES.REJECTED]: 'Rejected',
  [WORKFLOW_STATUSES.REVOKED]: 'Revoked',
};

// ============================================================================
// VERIFICATION STATUSES
// ============================================================================

export const VERIFICATION_STATUSES = {
  VERIFIED: 'verified',
  TAMPERED: 'tampered',
  NOT_FOUND: 'not-found',
  REVOKED: 'revoked',
  ERROR: 'error',
};

export const VERIFICATION_STATUS_LABELS = {
  [VERIFICATION_STATUSES.VERIFIED]: 'Verified',
  [VERIFICATION_STATUSES.TAMPERED]: 'Tampered',
  [VERIFICATION_STATUSES.NOT_FOUND]: 'Not Found',
  [VERIFICATION_STATUSES.REVOKED]: 'Revoked',
  [VERIFICATION_STATUSES.ERROR]: 'Error',
};

// ============================================================================
// BLOCKCHAIN CONSTANTS
// ============================================================================

export const BLOCKCHAIN = {
  CHAIN_ID: 80002,
  CHAIN_NAME: 'Polygon Amoy',
  RPC_URL: import.meta.env.VITE_AMOY_RPC_URL,
  CONTRACT_ADDRESS: import.meta.env.VITE_CONTRACT_ADDRESS,
  EXPLORER_URL: 'https://amoy.polygonscan.com',
  EXPLORER_TX_PATH: '/tx',
  EXPLORER_ADDRESS_PATH: '/address',
};

export const GAS_CONFIG = {
  MIN_PRIORITY_FEE_GWEI: import.meta.env.VITE_MIN_PRIORITY_FEE_GWEI || 30,
};

// ============================================================================
// FILE CONSTRAINTS
// ============================================================================

export const FILE_CONSTRAINTS = {
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25 MB
  MAX_FILE_SIZE_MB: 25,
  ALLOWED_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

// ============================================================================
// TOAST CONFIG
// ============================================================================

export const TOAST_CONFIG = {
  POSITION: 'top-right',
  DURATION: 4000,
  SUCCESS_DURATION: 3000,
  ERROR_DURATION: 5000,
};

// ============================================================================
// VALIDATION CONSTRAINTS
// ============================================================================

export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_DISPLAY_NAME_LENGTH: 100,
  MAX_ORGANIZATION_NAME_LENGTH: 200,
  MAX_DOCUMENT_TITLE_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 5000,
  MAX_TAG_LENGTH: 50,
  MAX_TAGS_COUNT: 10,
};

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

export const TIMINGS = {
  DEBOUNCE_SEARCH_MS: 300,
  DEBOUNCE_FILTER_MS: 300,
  REALTIME_REFRESH_MS: 450,
  WALLET_SYNC_CHECK_MS: 5000,
  POLLING_INTERVAL_MS: 45000,
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  TOAST_DURATION_MS: 3000,
};

// ============================================================================
// ROUTES
// ============================================================================

export const ROUTES = {
  // Public
  HOME: '/',
  VERIFY: '/verify',
  AUTH_CALLBACK: '/auth/callback',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',

  // Protected
  DASHBOARD: '/dashboard',
  MY_DOCUMENTS: '/documents',
  DOCUMENT_INFO: '/documents/:id',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  ANALYTICS: '/analytics',

  // Admin
  ADMIN_LOGIN: '/admin/login',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_USERS: '/admin/users',
  ADMIN_AUDIT_LOGS: '/admin/audit-logs',
  ADMIN_APPROVAL_QUEUE: '/admin/approval-queue',

  // Super Admin
  SUPER_ADMIN_LOGIN: '/admin/super-admin/login',
  SUPER_ADMIN_DASHBOARD: '/admin/super-admin/dashboard',
  SUPER_ADMIN_ORGANIZATIONS: '/admin/super-admin/organizations',
};

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const API_ENDPOINTS = {
  // Auth
  SIGN_UP: '/auth/v1/signup',
  SIGN_IN: '/auth/v1/token',
  SIGN_OUT: '/auth/v1/logout',
  REFRESH_SESSION: '/auth/v1/refresh',

  // Documents
  LIST_DOCUMENTS: '/rest/v1/documents',
  GET_DOCUMENT: '/rest/v1/documents/:id',
  CREATE_DOCUMENT: '/rest/v1/documents',
  UPDATE_DOCUMENT: '/rest/v1/documents/:id',
  DELETE_DOCUMENT: '/rest/v1/documents/:id',

  // Backend API
  PINATA_UPLOAD: '/api/pinata-upload',
  DOCUMENT_CERTIFICATE: '/api/document-certificate',
  AUDIT_LOGS: '/api/audit-logs',
};

// ============================================================================
// DOCUMENT OPERATIONS
// ============================================================================

export const DOCUMENT_OPERATIONS = {
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  REVOKE: 'revoke',
  VERIFY: 'verify',
  SHARE: 'share',
  UPLOAD: 'upload',
  SIGN: 'sign',
};

// ============================================================================
// UI STATE DEFAULTS
// ============================================================================

export const DEFAULT_SETTINGS = {
  THEME: 'dark',
  NOTIFICATIONS_ENABLED: true,
  AUTO_CONNECT_WALLET: false,
  SECURITY_MODE: 'strict',
};

export const DEFAULT_WALLET_STATE = {
  ACCOUNT: '',
  CHAIN_ID: '',
  STATUS: 'disconnected',
  IS_CONNECTING: false,
  IS_SUPPORTED_NETWORK: false,
};

// ============================================================================
// ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  INVALID_HASH: 'INVALID_HASH',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NETWORK_ERROR: 'NETWORK_ERROR',
  WALLET_ERROR: 'WALLET_ERROR',
  RPC_ERROR: 'RPC_ERROR',
  INVALID_CHAIN: 'INVALID_CHAIN',
  INVALID_FILE: 'INVALID_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_REGISTERED: 'NOT_REGISTERED',
};

export default {
  ROLES,
  ROLE_LABELS,
  PERMISSIONS,
  PRIVACY_LEVELS,
  WORKFLOW_STATUSES,
  BLOCKCHAIN,
  FILE_CONSTRAINTS,
  VALIDATION,
  TIMINGS,
  ROUTES,
};
