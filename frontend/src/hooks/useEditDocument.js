/**
 * useEditDocument Hook
 * Handles document editing logic and validation
 */

import { useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import {
  updateDocument,
  getDocumentVersions,
  addActivityLog,
} from '../services/supabaseService';
import { VALIDATION, TIMINGS } from '../utils/constants';
import { parseError } from '../utils/errorMessages';

/**
 * Validate document edit data
 * @param {Object} data - Data to validate
 * @returns {Object} - Validation result { isValid, errors }
 */
function validateDocumentEdit(data) {
  const errors = {};

  if (data.title !== undefined) {
    if (typeof data.title !== 'string') {
      errors.title = 'Title must be a string';
    } else if (data.title.trim().length === 0) {
      errors.title = 'Title cannot be empty';
    } else if (data.title.length > VALIDATION.MAX_DOCUMENT_TITLE_LENGTH) {
      errors.title = `Title cannot exceed ${VALIDATION.MAX_DOCUMENT_TITLE_LENGTH} characters`;
    }
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      errors.description = 'Description must be a string';
    } else if (data.description.length > VALIDATION.MAX_DESCRIPTION_LENGTH) {
      errors.description = `Description cannot exceed ${VALIDATION.MAX_DESCRIPTION_LENGTH} characters`;
    }
  }

  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) {
      errors.tags = 'Tags must be an array';
    } else {
      if (data.tags.length > VALIDATION.MAX_TAGS_COUNT) {
        errors.tags = `Cannot have more than ${VALIDATION.MAX_TAGS_COUNT} tags`;
      }

      for (const tag of data.tags) {
        if (typeof tag !== 'string') {
          errors.tags = 'Each tag must be a string';
          break;
        }
        if (tag.length > VALIDATION.MAX_TAG_LENGTH) {
          errors.tags = `Each tag cannot exceed ${VALIDATION.MAX_TAG_LENGTH} characters`;
          break;
        }
      }
    }
  }

  if (data.privacyLevel !== undefined) {
    const validLevels = ['private', 'shared', 'public'];
    if (!validLevels.includes(data.privacyLevel)) {
      errors.privacyLevel = 'Invalid privacy level';
    }
  }

  // CRITICAL: Ensure hash cannot be modified
  if (data.hash !== undefined) {
    errors.hash = 'Hash cannot be edited. Hash is immutable.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * useEditDocument Hook
 * Manages document editing state and operations
 */
export function useEditDocument() {
  const { profile } = useAuth();
  const { documents, refreshDocuments } = useAppContext();

  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [versions, setVersions] = useState(null);
  const debounceTimerRef = useRef(null);

  /**
   * Get document versions
   */
  const fetchVersions = useCallback(
    async (documentId) => {
      try {
        setIsLoading(true);
        const versionHistory = await getDocumentVersions(documentId);
        setVersions(versionHistory);
        return versionHistory;
      } catch (err) {
        const errorMsg = parseError(err);
        setError(errorMsg);
        toast.error(`Failed to load versions: ${errorMsg}`);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Validate edit data
   */
  const validate = useCallback((data) => {
    const result = validateDocumentEdit(data);
    if (!result.isValid) {
      setError(Object.values(result.errors).join('; '));
    }
    return result;
  }, []);

  /**
   * Edit document metadata
   * WARNING: Hash and blockchain data CANNOT be edited
   */
  const editDocument = useCallback(
    async (documentId, editData, options = {}) => {
      const { 
        skipValidation = false,
        changeReason = '',
        showToast = true,
      } = options;

      // Clear previous error
      setError(null);

      // Validate input
      if (!skipValidation) {
        const validation = validateDocumentEdit(editData);
        if (!validation.isValid) {
          const errorMsg = Object.values(validation.errors).join('; ');
          setError(errorMsg);
          if (showToast) {
            toast.error(errorMsg);
          }
          return { success: false, error: errorMsg };
        }
      }

      // Ensure user owns document
      const doc = documents?.find((d) => d.id === documentId);
      if (!doc || doc.user_id !== profile?.user_id) {
        const errorMsg = 'You do not have permission to edit this document';
        setError(errorMsg);
        if (showToast) {
          toast.error(errorMsg);
        }
        return { success: false, error: errorMsg };
      }

      // CRITICAL: Hash must never change
      if (editData.hash || editData.txHash || editData.signature) {
        const errorMsg = 'Hash, transaction, and signature data cannot be modified';
        setError(errorMsg);
        if (showToast) {
          toast.error(errorMsg);
        }
        return { success: false, error: errorMsg };
      }

      try {
        setIsLoading(true);

        if (showToast) {
          toast.loading('Saving changes...', { id: 'edit-doc' });
        }

        // Build update payload - ONLY non-hash fields
        const updatePayload = {};
        if (editData.title !== undefined) updatePayload.title = editData.title;
        if (editData.description !== undefined)
          updatePayload.description = editData.description;
        if (editData.tags !== undefined) updatePayload.tags = editData.tags;
        if (editData.privacyLevel !== undefined)
          updatePayload.privacyLevel = editData.privacyLevel;

        // Update document
        const result = await updateDocument(documentId, updatePayload);

        // Log activity
        try {
          await addActivityLog({
            type: 'document_updated',
            title: 'Document Updated',
            description: `Updated "${doc.title || 'Untitled'}" - ${changeReason || 'Metadata updated'}`,
            meta: {
              documentId,
              documentHash: doc.hash,
              changedFields: Object.keys(updatePayload),
              changeReason,
            },
          });
        } catch (logError) {
          console.warn('Failed to log activity:', logError);
        }

        if (showToast) {
          toast.success('Document updated successfully', { id: 'edit-doc' });
        }

        // Refresh documents list
        if (refreshDocuments) {
          // Debounce refresh to avoid too many requests
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            refreshDocuments().catch(console.error);
          }, TIMINGS.DEBOUNCE_FILTER_MS);
        }

        return { success: true, data: result };
      } catch (err) {
        const errorMsg = parseError(err);
        setError(errorMsg);
        if (showToast) {
          toast.error(`Failed to update: ${errorMsg}`);
        }
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [documents, profile?.user_id, refreshDocuments]
  );

  /**
   * Check if document can be edited by current user
   */
  const canEdit = useCallback(
    (documentId) => {
      const doc = documents?.find((d) => d.id === documentId);
      if (!doc) return false;
      return doc.user_id === profile?.user_id;
    },
    [documents, profile?.user_id]
  );

  /**
   * Get document edit history
   */
  const getHistory = useCallback(
    async (documentId) => {
      return fetchVersions(documentId);
    },
    [fetchVersions]
  );

  return {
    isEditing,
    setIsEditing,
    isLoading,
    error,
    versions,
    editDocument,
    validate,
    fetchVersions,
    canEdit,
    getHistory,
  };
}

export default useEditDocument;
