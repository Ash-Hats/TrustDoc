export const WORKFLOW_STATUSES = ["draft", "pending", "approved", "rejected", "revoked"];
export const WORKFLOW_ACTIONS = ["create_draft", "edit_pending", "submit_pending", "approve", "reject", "revoke"];

export function normalizeWorkflowStatus(value, fallback = "draft") {
  const normalized = String(value || fallback).toLowerCase();
  if (WORKFLOW_STATUSES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

export function nextStatusForAction(action) {
  const normalized = String(action || "").toLowerCase();
  if (normalized === "submit_pending") {
    return "pending";
  }
  if (normalized === "approve") {
    return "approved";
  }
  if (normalized === "reject") {
    return "rejected";
  }
  if (normalized === "revoke") {
    return "revoked";
  }
  return "draft";
}

export function reasonRequired(action) {
  const normalized = String(action || "").toLowerCase();
  return normalized === "reject" || normalized === "revoke";
}

export function canEditPendingStatus(currentStatus) {
  return ["draft", "pending", "rejected"].includes(normalizeWorkflowStatus(currentStatus, "draft"));
}

