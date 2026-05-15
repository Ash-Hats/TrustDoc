/**
 * EditDocumentModal Component
 * Allows editing of document metadata (title, description, tags, privacy level)
 * IMPORTANT: Hash and blockchain data cannot be edited
 */

import { useState, useEffect, useCallback } from 'react';
import { X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from './ui/Button';
import SearchInput from './ui/SearchInput';
import SelectField from './ui/SelectField';
import { useEditDocument } from '../hooks/useEditDocument';
import { VALIDATION, PRIVACY_LEVELS, PRIVACY_LABELS } from '../utils/constants';
import { parseError } from '../utils/errorMessages';

/**
 * EditDocumentModal Component
 */
export default function EditDocumentModal({ document, isOpen, onClose, onSuccess }) {
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    tags: [],
    privacyLevel: PRIVACY_LEVELS.PRIVATE,
  });

  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { editDocument, validate, canEdit } = useEditDocument();

  /**
   * Initialize form with document data
   */
  useEffect(() => {
    if (isOpen && document) {
      setFormData({
        title: document.title || '',
        description: document.description || '',
        tags: Array.isArray(document.tags) ? document.tags : [],
        privacyLevel: document.privacy_level || PRIVACY_LEVELS.PRIVATE,
      });
      setTagInput('');
      setErrors({});
    }
  }, [isOpen, document]);

  /**
   * Check if user can edit
   */
  if (isOpen && document && !canEdit(document.id)) {
    return null;
  }

  /**
   * Handle title change
   */
  const handleTitleChange = useCallback((e) => {
    const title = e.target.value;
    setFormData((prev) => ({ ...prev, title }));

    // Validate
    if (title.length > VALIDATION.MAX_DOCUMENT_TITLE_LENGTH) {
      setErrors((prev) => ({
        ...prev,
        title: `Title cannot exceed ${VALIDATION.MAX_DOCUMENT_TITLE_LENGTH} characters`,
      }));
    } else if (title.trim().length === 0 && title.length > 0) {
      setErrors((prev) => ({
        ...prev,
        title: 'Title cannot be only whitespace',
      }));
    } else {
      setErrors((prev) => {
        const { title: _, ...rest } = prev;
        return rest;
      });
    }
  }, []);

  /**
   * Handle description change
   */
  const handleDescriptionChange = useCallback((e) => {
    const description = e.target.value;
    setFormData((prev) => ({ ...prev, description }));

    if (description.length > VALIDATION.MAX_DESCRIPTION_LENGTH) {
      setErrors((prev) => ({
        ...prev,
        description: `Description cannot exceed ${VALIDATION.MAX_DESCRIPTION_LENGTH} characters`,
      }));
    } else {
      setErrors((prev) => {
        const { description: _, ...rest } = prev;
        return rest;
      });
    }
  }, []);

  /**
   * Add tag
   */
  const addTag = useCallback(() => {
    const tag = tagInput.trim();

    if (!tag) {
      return;
    }

    if (tag.length > VALIDATION.MAX_TAG_LENGTH) {
      toast.error(`Tag cannot exceed ${VALIDATION.MAX_TAG_LENGTH} characters`);
      return;
    }

    if (formData.tags.includes(tag)) {
      toast.error('This tag already exists');
      return;
    }

    if (formData.tags.length >= VALIDATION.MAX_TAGS_COUNT) {
      toast.error(`Cannot add more than ${VALIDATION.MAX_TAGS_COUNT} tags`);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      tags: [...prev.tags, tag],
    }));

    setTagInput('');
  }, [tagInput, formData.tags]);

  /**
   * Remove tag
   */
  const removeTag = useCallback((tagToRemove) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  }, []);

  /**
   * Handle privacy level change
   */
  const handlePrivacyChange = useCallback((e) => {
    setFormData((prev) => ({
      ...prev,
      privacyLevel: e.target.value,
    }));
  }, []);

  /**
   * Check if form is valid
   */
  const isFormValid = useCallback(() => {
    return (
      formData.title.trim().length > 0 &&
      Object.keys(errors).length === 0
    );
  }, [formData.title, errors]);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      if (!document) {
        toast.error('Document not found');
        return;
      }

      // Validate
      const validation = validate(formData);
      if (!validation.isValid) {
        setErrors(validation.errors);
        toast.error('Please fix the errors before saving');
        return;
      }

      if (!isFormValid()) {
        toast.error('Please fill in all required fields');
        return;
      }

      try {
        setIsSubmitting(true);

        // Prepare update data
        const updateData = {
          title: formData.title,
          description: formData.description,
          tags: formData.tags,
          privacyLevel: formData.privacyLevel,
        };

        // Call edit function
        const result = await editDocument(document.id, updateData, {
          changeReason: 'Updated metadata via modal',
          showToast: true,
        });

        if (result.success) {
          // Call success callback if provided
          if (onSuccess) {
            onSuccess(result.data);
          }

          // Close modal
          onClose();
        }
      } catch (err) {
        const errorMsg = parseError(err);
        toast.error(`Failed to update: ${errorMsg}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [document, formData, validate, isFormValid, editDocument, onSuccess, onClose]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a1f2e] to-[#0f1319] p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-100">Edit Document</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-white/10"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Warning */}
        <div className="mb-6 rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 flex gap-2">
          <AlertCircle size={16} className="mt-0.5 text-amber-200 flex-shrink-0" />
          <p className="text-sm text-amber-100">
            <strong>Note:</strong> Hash, transaction, and signature data cannot be edited. 
            These are immutable and secured on the blockchain.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Title
              <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={handleTitleChange}
              placeholder="Enter document title"
              maxLength={VALIDATION.MAX_DOCUMENT_TITLE_LENGTH}
              className={[
                'mt-1 w-full rounded-lg border bg-white/5 px-3 py-2 text-gray-100',
                'placeholder-gray-500 transition focus:outline-none focus:ring-2',
                errors.title
                  ? 'border-red-500/50 focus:ring-red-500'
                  : 'border-white/10 focus:ring-cyan-500',
              ].join(' ')}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-400">{errors.title}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {formData.title.length}/{VALIDATION.MAX_DOCUMENT_TITLE_LENGTH}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={handleDescriptionChange}
              placeholder="Enter document description"
              maxLength={VALIDATION.MAX_DESCRIPTION_LENGTH}
              rows={4}
              className={[
                'mt-1 w-full rounded-lg border bg-white/5 px-3 py-2 text-gray-100',
                'placeholder-gray-500 transition focus:outline-none focus:ring-2',
                errors.description
                  ? 'border-red-500/50 focus:ring-red-500'
                  : 'border-white/10 focus:ring-cyan-500',
              ].join(' ')}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-400">{errors.description}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {formData.description.length}/{VALIDATION.MAX_DESCRIPTION_LENGTH}
            </p>
          </div>

          {/* Privacy Level */}
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Privacy Level
            </label>
            <SelectField
              value={formData.privacyLevel}
              onChange={handlePrivacyChange}
              className="mt-1"
            >
              {Object.entries(PRIVACY_LEVELS).map(([key, value]) => (
                <option key={value} value={value}>
                  {PRIVACY_LABELS[value]}
                </option>
              ))}
            </SelectField>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Tags ({formData.tags.length}/{VALIDATION.MAX_TAGS_COUNT})
            </label>
            <div className="mt-2 flex gap-2">
              <SearchInput
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add a tag..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={addTag}
                disabled={!tagInput.trim()}
                variant="secondary"
              >
                Add
              </Button>
            </div>

            {/* Tag list */}
            {formData.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-200"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-cyan-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-8 flex gap-3 border-t border-white/10 pt-6">
            <Button
              type="button"
              onClick={onClose}
              variant="secondary"
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || !isFormValid()}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
