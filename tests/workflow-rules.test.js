import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKFLOW_ACTIONS,
  WORKFLOW_STATUSES,
  canEditPendingStatus,
  nextStatusForAction,
  normalizeWorkflowStatus,
  reasonRequired,
} from "../api/_lib/workflow-rules.js";

test("workflow constants expose expected enterprise statuses/actions", () => {
  assert.deepEqual(WORKFLOW_STATUSES, ["draft", "pending", "approved", "rejected", "revoked"]);
  assert.deepEqual(WORKFLOW_ACTIONS, ["create_draft", "edit_pending", "submit_pending", "approve", "reject", "revoke"]);
});

test("normalizeWorkflowStatus returns fallback for unknown status", () => {
  assert.equal(normalizeWorkflowStatus("pending"), "pending");
  assert.equal(normalizeWorkflowStatus("INVALID", "draft"), "draft");
});

test("nextStatusForAction maps approval decisions correctly", () => {
  assert.equal(nextStatusForAction("submit_pending"), "pending");
  assert.equal(nextStatusForAction("approve"), "approved");
  assert.equal(nextStatusForAction("reject"), "rejected");
  assert.equal(nextStatusForAction("revoke"), "revoked");
});

test("reason requirement applies to reject/revoke only", () => {
  assert.equal(reasonRequired("approve"), false);
  assert.equal(reasonRequired("reject"), true);
  assert.equal(reasonRequired("revoke"), true);
});

test("only draft/pending/rejected documents can be edited in pending workflow", () => {
  assert.equal(canEditPendingStatus("draft"), true);
  assert.equal(canEditPendingStatus("pending"), true);
  assert.equal(canEditPendingStatus("rejected"), true);
  assert.equal(canEditPendingStatus("approved"), false);
  assert.equal(canEditPendingStatus("revoked"), false);
});

