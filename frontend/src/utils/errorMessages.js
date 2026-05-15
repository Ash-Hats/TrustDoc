/**
 * Standardized Error Messages
 * Centralized error messages for consistency across the app
 */

import { ERROR_CODES } from './constants.js';

const ERROR_MESSAGES = {
  // Authentication errors
  [ERROR_CODES.UNAUTHORIZED]: 'Please log in to continue',
  [ERROR_CODES.FORBIDDEN]: 'You do not have permission to perform this action',

  // Document errors
  [ERROR_CODES.INVALID_HASH]: 'Invalid document hash. Must be a 64-character hex string.',
  [ERROR_CODES.DOCUMENT_NOT_FOUND]: 'Document not found',
  [ERROR_CODES.NOT_REGISTERED]: 'This document is not registered on the blockchain',

  // File errors
  [ERROR_CODES.INVALID_FILE]: 'Invalid file type or format',
  [ERROR_CODES.FILE_TOO_LARGE]: 'File size exceeds 25 MB limit',

  // Network/Blockchain errors
  [ERROR_CODES.NETWORK_ERROR]: 'Network error. Please check your connection.',
  [ERROR_CODES.RPC_ERROR]: 'Blockchain RPC error. Please try again.',
  [ERROR_CODES.WALLET_ERROR]: 'Wallet error. Please try again.',
  [ERROR_CODES.INVALID_CHAIN]: 'Please switch MetaMask to Polygon Amoy (Chain ID 80002)',

  // Validation errors
  [ERROR_CODES.VALIDATION_ERROR]: 'Please check your input and try again',
};

/**
 * Get error message by code
 * @param {string} code - Error code
 * @param {string} fallback - Fallback message if code not found
 * @returns {string}
 */
export function getErrorMessage(code, fallback = 'An error occurred. Please try again.') {
  return ERROR_MESSAGES[code] || fallback;
}

/**
 * Parse error from exception
 * @param {Error|string} error - Error object or string
 * @param {string} fallback - Fallback message
 * @returns {string}
 */
export function parseError(error, fallback = 'An error occurred. Please try again.') {
  if (!error) return fallback;

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === 'object') {
    return (
      error.message ||
      error.msg ||
      error.error ||
      error.error_description ||
      fallback
    );
  }

  return fallback;
}

/**
 * Handle blockchain-specific errors
 * @param {Error} error - Error from blockchain call
 * @returns {string}
 */
export function parseBlockchainError(error) {
  const message = parseError(error);

  if (message.includes('80002')) {
    return 'Please switch MetaMask to Polygon Amoy (Chain ID 80002)';
  }

  if (message.includes('RPC') || message.includes('timeout')) {
    return 'Blockchain RPC error. Please try again.';
  }

  if (message.includes('user denied') || message.includes('User rejected')) {
    return 'Transaction rejected by user';
  }

  if (message.includes('insufficient funds')) {
    return 'Insufficient gas fees. Please top up your account.';
  }

  return message;
}

/**
 * Handle Supabase errors
 * @param {Error} error - Error from Supabase
 * @returns {string}
 */
export function parseSupabaseError(error) {
  const message = parseError(error);

  if (message.includes('JWT')) {
    return 'Session expired. Please log in again.';
  }

  if (message.includes('already exists')) {
    return 'This record already exists';
  }

  if (message.includes('not found')) {
    return 'Record not found';
  }

  if (message.includes('permission')) {
    return 'You do not have permission to perform this action';
  }

  return message;
}

/**
 * Handle IPFS/Pinata errors
 * @param {Error} error - Error from IPFS
 * @returns {string}
 */
export function parseIpfsError(error) {
  const message = parseError(error);

  if (message.includes('timeout')) {
    return 'IPFS upload timeout. Please try again.';
  }

  if (message.includes('401') || message.includes('unauthorized')) {
    return 'IPFS authentication error';
  }

  if (message.includes('413') || message.includes('too large')) {
    return 'File too large for IPFS upload';
  }

  return message;
}

/**
 * Format validation errors from API response
 * @param {Object} errors - Validation errors object
 * @returns {string}
 */
export function formatValidationErrors(errors) {
  if (!errors || typeof errors !== 'object') {
    return 'Validation error';
  }

  const messages = Object.entries(errors)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value);
    })
    .filter(Boolean);

  return messages.length > 0 ? messages.join('; ') : 'Validation error';
}

/**
 * User-friendly error messages for common scenarios
 */
export const USER_FRIENDLY_MESSAGES = {
  WALLET_NOT_CONNECTED: 'Please connect your wallet to continue',
  WALLET_NOT_SUPPORTED: 'Your wallet is not supported. Please use MetaMask.',
  DOCUMENT_HASH_MISMATCH: 'Document content may have changed. Hash does not match.',
  DOCUMENT_ALREADY_REGISTERED: 'This document is already registered on the blockchain',
  DOCUMENT_REVOKED: 'This document has been revoked and is no longer valid',
  INVALID_FILE_FORMAT: 'This file format is not supported',
  FILE_UPLOAD_FAILED: 'File upload failed. Please try again.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  NETWORK_UNREACHABLE: 'Network is unreachable. Please check your connection.',
  RPC_UNAVAILABLE: 'Blockchain RPC is unavailable. Please try again later.',
  INSUFFICIENT_GAS: 'Insufficient gas. Please top up your account.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  PERMISSION_DENIED: 'You do not have permission to perform this action',
  RESOURCE_NOT_FOUND: 'The requested resource was not found',
  INVALID_INPUT: 'One or more fields have invalid values',
  DUPLICATE_ENTRY: 'This entry already exists',
  OPERATION_TIMEOUT: 'Operation timed out. Please try again.',
  OPERATION_FAILED: 'Operation failed. Please try again.',
};

/**
 * Get user-friendly error message
 * @param {string} key - Message key
 * @param {string} fallback - Fallback message
 * @returns {string}
 */
export function getUserFriendlyMessage(key, fallback = 'An error occurred. Please try again.') {
  return USER_FRIENDLY_MESSAGES[key] || fallback;
}

/**
 * Log error for debugging
 * @param {string} context - Where error occurred
 * @param {Error} error - Error object
 * @param {Object} metadata - Additional metadata
 */
export function logError(context, error, metadata = {}) {
  if (import.meta.env.DEV) {
    console.group(`❌ Error in ${context}`);
    console.error('Error:', error);
    console.table(metadata);
    console.groupEnd();
  }

  // In production, could send to error tracking service
  if (import.meta.env.PROD) {
    // Example: Sentry.captureException(error, { tags: { context } });
  }
}

export default {
  ERROR_MESSAGES,
  USER_FRIENDLY_MESSAGES,
  getErrorMessage,
  parseError,
  parseBlockchainError,
  parseSupabaseError,
  parseIpfsError,
  formatValidationErrors,
  getUserFriendlyMessage,
  logError,
};
