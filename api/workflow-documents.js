import { createHash } from "node:crypto";
import {
  sendJson,
  setSecurityHeaders,
  setCorsHeaders,
  handleOptions,
  parseJsonBody,
  enforceTrustedOrigin,
} from "./_lib/http.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";
import { hasPermission, hasRole } from "./_lib/rbac.js";
import { restInsert, restPatch, restSelect } from "./_lib/supabase.js";
import {
  isEthAddress,
  isUuid,
  normalizeStatus,
  requireValue,
  sanitizeText,
  toInt,
} from "./_lib/validation.js";
import { requireActor, requestContext } from "./_lib/endpoint.js";
import { writeAuditLog } from "./_lib/audit.js";
import {
  WORKFLOW_ACTIONS,
  WORKFLOW_STATUSES,
  canEditPendingStatus,
  nextStatusForAction,
  normalizeWorkflowStatus,
  reasonRequired,
} from "./_lib/workflow-rules.js";

function getVerificationHash(documentRow, actor, approvedAtIso) {
  return createHash("sha256")
    .update(
      [
        documentRow.hash || "",
        documentRow.cid || "",
        documentRow.tx_hash || "",
        documentRow.organization_id || "",
        actor.user.id || "",
        approvedAtIso || "",
      ].join("|")
    )
    .digest("hex");
}

async function fetchDocumentById(documentId) {
  const rows = await restSelect("documents", {
    query: {
      select:
        "id,organization_id,user_id,uploader_user_id,subject_user_id,hash,cid,doc_type,issued_by,tx_hash,gateway_url,workflow_status,rejection_reason,file_name,file_type,file_size,metadata,current_version,verification_hash,created_at,updated_at,submitted_at,reviewed_at,reviewed_by,approved_signature_id",
      id: `eq.${documentId}`,
      limit: 1,
    },
    useServiceKey: true,
  });
  return rows?.[0] || null;
}

async function fetchOrganizationLabel(organizationId) {
  if (!organizationId || !isUuid(organizationId)) {
    return "Unknown Organization";
  }
  const rows = await restSelect("organizations", {
    query: {
      select: "id,name,slug",
      id: `eq.${organizationId}`,
      limit: 1,
    },
    useServiceKey: true,
  });
  return rows?.[0]?.name || "Unknown Organization";
}

async function createNotificationsForReview(documentRow, actor) {
  const userRoleRows = await restSelect("user_roles", {
    query: {
      select: "user_id,organization_id,roles:role_id(role_key)",
      organization_id: `eq.${documentRow.organization_id}`,
      status: "eq.active",
    },
    useServiceKey: true,
  });

  const adminRecipients = userRoleRows
    .filter((row) => row?.roles?.role_key === "organization_admin")
    .map((row) => row.user_id)
    .filter(Boolean);

  if (!adminRecipients.length) {
    return;
  }

  await restInsert("notifications", {
    body: adminRecipients.map((recipientId) => ({
      recipient_user_id: recipientId,
      organization_id: documentRow.organization_id,
      type: "document_pending",
      title: "Document Pending Approval",
      message: `A document (${documentRow.hash}) requires review.`,
      metadata: {
        document_id: documentRow.id,
        hash: documentRow.hash,
        submitted_by: actor.user.id,
      },
    })),
    useServiceKey: true,
  });
}

async function createOutcomeNotifications(documentRow, actor, action, reason = "") {
  const recipientIds = Array.from(
    new Set(
      [documentRow.user_id, documentRow.subject_user_id, documentRow.uploader_user_id]
        .filter(Boolean)
        .map((value) => String(value))
    )
  );

  if (!recipientIds.length) {
    return;
  }

  const titleMap = {
    approve: "Document Approved",
    reject: "Document Rejected",
    revoke: "Document Revoked",
  };

  const messageMap = {
    approve: `Document ${documentRow.hash} has been approved and signed.`,
    reject: `Document ${documentRow.hash} was rejected. ${reason ? `Reason: ${reason}` : ""}`.trim(),
    revoke: `Document ${documentRow.hash} was revoked. ${reason ? `Reason: ${reason}` : ""}`.trim(),
  };

  await restInsert("notifications", {
    body: recipientIds.map((recipientId) => ({
      recipient_user_id: recipientId,
      organization_id: documentRow.organization_id,
      type: `document_${action}`,
      title: titleMap[action] || "Document Update",
      message: messageMap[action] || `Document ${documentRow.hash} updated.`,
      metadata: {
        document_id: documentRow.id,
        hash: documentRow.hash,
        action,
        reviewed_by: actor.user.id,
      },
    })),
    useServiceKey: true,
  });
}

function ensureDocumentScope(actor, documentRow) {
  const orgId = documentRow.organization_id || null;
  if (hasRole(actor, "super_admin")) {
    return true;
  }

  if (!orgId) {
    return false;
  }

  return actor.organizationIds.includes(orgId);
}

export default async function handler(request, response) {
  if (handleOptions(request, response, ["GET", "POST", "OPTIONS"])) {
    return;
  }

  setCorsHeaders(request, response, ["GET", "POST", "OPTIONS"]);
  setSecurityHeaders(response);

  if (!["GET", "POST"].includes(request.method || "")) {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  if (!enforceTrustedOrigin(request)) {
    return sendJson(response, 403, { error: "Request origin not allowed." });
  }

  const context = requestContext(request);
  if (!enforceRateLimit(`workflow:${context.ipAddress}`, { windowMs: 60_000, max: 120 })) {
    return sendJson(response, 429, { error: "Rate limit exceeded." });
  }

  let actor;
  try {
    actor = await requireActor(request);
  } catch (error) {
    return sendJson(response, 401, { error: error?.message || "Unauthorized." });
  }

  if (request.method === "GET") {
    const limit = toInt(request.query?.limit, 20, { min: 1, max: 200 });
    const page = toInt(request.query?.page, 1, { min: 1, max: 5000 });
    const offset = (page - 1) * limit;
    const status = normalizeStatus(request.query?.status, ["all", ...WORKFLOW_STATUSES], "all");
    const targetOrgId = isUuid(request.query?.organization_id)
      ? String(request.query.organization_id)
      : actor.profile?.organization_id || "";
    const mode = String(request.query?.mode || "").toLowerCase();

    const query = {
      select:
        "id,organization_id,user_id,uploader_user_id,subject_user_id,hash,cid,doc_type,issued_by,tx_hash,gateway_url,workflow_status,rejection_reason,file_name,file_type,file_size,metadata,current_version,verification_hash,created_at,updated_at,submitted_at,reviewed_at,reviewed_by,approved_signature_id",
      order: "updated_at.desc",
      limit,
      offset,
    };

    if (!hasRole(actor, "super_admin")) {
      if (!targetOrgId || !actor.organizationIds.includes(targetOrgId)) {
        return sendJson(response, 403, { error: "Insufficient organization scope." });
      }
      query.organization_id = `eq.${targetOrgId}`;
    } else if (targetOrgId) {
      query.organization_id = `eq.${targetOrgId}`;
    }

    if (status !== "all") {
      query.workflow_status = `eq.${status}`;
    }

    const canReadOrg =
      hasPermission(actor, "documents:view_status", targetOrgId || null) ||
      hasPermission(actor, "documents:approve", targetOrgId || null) ||
      hasPermission(actor, "verification:perform", targetOrgId || null) ||
      hasRole(actor, "super_admin");

    if (!canReadOrg || mode === "mine") {
      query.or = `user_id.eq.${actor.user.id},subject_user_id.eq.${actor.user.id},uploader_user_id.eq.${actor.user.id}`;
    }

    if (mode === "pending_queue") {
      if (!hasPermission(actor, "documents:approve", targetOrgId || null) && !hasRole(actor, "super_admin")) {
        return sendJson(response, 403, { error: "Pending queue requires approval permissions." });
      }
      query.workflow_status = "eq.pending";
    }

    const documents = await restSelect("documents", {
      query,
      useServiceKey: true,
    });

    const ids = documents.map((item) => item.id).filter(Boolean);
    let approvalsByDoc = {};
    let signaturesByDoc = {};
    let versionsByDoc = {};

    if (ids.length) {
      const idFilter = `in.(${ids.join(",")})`;
      const [approvals, signatures, versions] = await Promise.all([
        restSelect("approvals", {
          query: {
            select: "id,document_id,reviewer_user_id,decision,reason,metadata,created_at",
            document_id: idFilter,
            order: "created_at.desc",
          },
          useServiceKey: true,
        }),
        restSelect("signatures", {
          query: {
            select:
              "id,document_id,admin_user_id,admin_name,admin_identifier,verification_hash,blockchain_tx_hash,signature_payload,certificate_json,revoked,created_at",
            document_id: idFilter,
            order: "created_at.desc",
          },
          useServiceKey: true,
        }),
        restSelect("document_versions", {
          query: {
            select:
              "id,document_id,version_number,file_name,file_type,file_size,hash,cid,gateway_url,metadata,uploaded_by,created_at",
            document_id: idFilter,
            order: "version_number.desc",
          },
          useServiceKey: true,
        }),
      ]);

      approvalsByDoc = approvals.reduce((acc, row) => {
        const key = row.document_id;
        acc[key] = acc[key] || [];
        acc[key].push(row);
        return acc;
      }, {});

      signaturesByDoc = signatures.reduce((acc, row) => {
        const key = row.document_id;
        acc[key] = acc[key] || [];
        acc[key].push(row);
        return acc;
      }, {});

      versionsByDoc = versions.reduce((acc, row) => {
        const key = row.document_id;
        acc[key] = acc[key] || [];
        acc[key].push(row);
        return acc;
      }, {});
    }

    const data = documents.map((doc) => ({
      ...doc,
      approvals: approvalsByDoc[doc.id] || [],
      signatures: signaturesByDoc[doc.id] || [],
      versions: versionsByDoc[doc.id] || [],
    }));

    return sendJson(response, 200, { data, page, limit });
  }

  const body = await parseJsonBody(request);
  const action = String(body?.action || "").toLowerCase();

  try {
    if (action === "create_draft") {
      const organizationId = isUuid(body?.organization_id)
        ? String(body.organization_id)
        : actor.profile?.organization_id || "";

      if (!organizationId) {
        return sendJson(response, 400, { error: "organization_id is required." });
      }

      if (!hasPermission(actor, "documents:create", organizationId) && !hasRole(actor, "super_admin")) {
        return sendJson(response, 403, { error: "Insufficient permissions to upload documents." });
      }

      const subjectUserId = isUuid(body?.subject_user_id) ? String(body.subject_user_id) : actor.user.id;
      const hash = sanitizeText(body?.hash, { maxLength: 180 }).toLowerCase();
      const cid = sanitizeText(body?.cid, { maxLength: 220 });
      const docType = sanitizeText(body?.doc_type || "General", { maxLength: 80 }) || "General";
      const issuedBy = sanitizeText(body?.issued_by || actor.profile?.display_name || "Unknown", {
        maxLength: 160,
      });
      const workflowStatus = normalizeWorkflowStatus(body?.workflow_status, "draft");
      const fileName = sanitizeText(body?.file_name || "", { maxLength: 220 });
      const fileType = sanitizeText(body?.file_type || "", { maxLength: 120 });
      const fileSize = Math.max(0, Number(body?.file_size || 0));
      const walletAddress = sanitizeText(body?.wallet_address || "", { maxLength: 80 }).toLowerCase();

      if (walletAddress && !isEthAddress(walletAddress)) {
        return sendJson(response, 400, { error: "Invalid wallet_address format." });
      }

      const rows = await restInsert("documents", {
        body: [
          {
            organization_id: organizationId,
            user_id: subjectUserId,
            subject_user_id: subjectUserId,
            uploader_user_id: actor.user.id,
            wallet_address: walletAddress,
            hash,
            cid,
            doc_type: docType,
            issued_by: issuedBy,
            workflow_status: workflowStatus,
            file_name: fileName,
            file_type: fileType,
            file_size: fileSize,
            metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
            submitted_at: workflowStatus === "pending" ? new Date().toISOString() : null,
            timestamp: Number(body?.timestamp || 0),
            block_timestamp: Number(body?.block_timestamp || 0),
            tx_hash: sanitizeText(body?.tx_hash || "", { maxLength: 200 }),
            gateway_url: sanitizeText(body?.gateway_url || "", { maxLength: 300 }),
          },
        ],
        useServiceKey: true,
      });

      const created = rows?.[0] || null;
      if (created && created.workflow_status === "pending") {
        await createNotificationsForReview(created, actor).catch(() => null);
      }

      await writeAuditLog({
        actor,
        action: "document_created",
        resourceType: "document",
        resourceId: created?.id || "",
        status: "success",
        metadata: {
          workflow_status: created?.workflow_status,
          subject_user_id: subjectUserId,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        organizationId,
      }).catch(() => null);

      return sendJson(response, 201, { data: created });
    }

    if (action === "edit_pending" || action === "submit_pending") {
      const documentId = String(body?.document_id || "");
      if (!isUuid(documentId)) {
        return sendJson(response, 400, { error: "Valid document_id is required." });
      }

      const documentRow = await fetchDocumentById(documentId);
      if (!documentRow) {
        return sendJson(response, 404, { error: "Document not found." });
      }

      if (!ensureDocumentScope(actor, documentRow)) {
        return sendJson(response, 403, { error: "Insufficient organization scope." });
      }

      const canUpdatePending =
        hasRole(actor, "super_admin") ||
        hasPermission(actor, "documents:update_pending", documentRow.organization_id) ||
        String(documentRow.uploader_user_id || "") === actor.user.id;

      if (!canUpdatePending) {
        return sendJson(response, 403, { error: "You cannot edit this pending document." });
      }

      if (!canEditPendingStatus(documentRow.workflow_status || "draft")) {
        return sendJson(response, 400, { error: "Only draft/pending/rejected documents can be edited." });
      }

      const nextStatus =
        action === "submit_pending"
          ? "pending"
          : normalizeWorkflowStatus(body?.workflow_status, documentRow.workflow_status || "draft");

      const rows = await restPatch("documents", {
        body: {
          doc_type: sanitizeText(body?.doc_type || documentRow.doc_type || "General", { maxLength: 80 }),
          issued_by: sanitizeText(body?.issued_by || documentRow.issued_by || "Unknown", { maxLength: 160 }),
          hash: sanitizeText(body?.hash || documentRow.hash || "", { maxLength: 180 }).toLowerCase(),
          cid: sanitizeText(body?.cid || documentRow.cid || "", { maxLength: 220 }),
          gateway_url: sanitizeText(body?.gateway_url || documentRow.gateway_url || "", { maxLength: 300 }),
          file_name: sanitizeText(body?.file_name || documentRow.file_name || "", { maxLength: 220 }),
          file_type: sanitizeText(body?.file_type || documentRow.file_type || "", { maxLength: 120 }),
          file_size: Math.max(0, Number(body?.file_size || documentRow.file_size || 0)),
          metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : documentRow.metadata,
          workflow_status: nextStatus,
          rejection_reason: nextStatus === "pending" ? "" : documentRow.rejection_reason || "",
          submitted_at: nextStatus === "pending" ? new Date().toISOString() : documentRow.submitted_at,
          updated_at: new Date().toISOString(),
        },
        query: {
          id: `eq.${documentId}`,
        },
        useServiceKey: true,
      });

      const updated = rows?.[0] || null;
      if (updated?.workflow_status === "pending") {
        await createNotificationsForReview(updated, actor).catch(() => null);
      }

      await writeAuditLog({
        actor,
        action: action === "submit_pending" ? "document_submitted_for_review" : "document_pending_updated",
        resourceType: "document",
        resourceId: documentId,
        status: "success",
        metadata: { workflow_status: updated?.workflow_status },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        organizationId: documentRow.organization_id,
      }).catch(() => null);

      return sendJson(response, 200, { data: updated });
    }

    if (["approve", "reject", "revoke"].includes(action)) {
      const documentId = String(body?.document_id || "");
      if (!isUuid(documentId)) {
        return sendJson(response, 400, { error: "Valid document_id is required." });
      }

      const documentRow = await fetchDocumentById(documentId);
      if (!documentRow) {
        return sendJson(response, 404, { error: "Document not found." });
      }

      if (!ensureDocumentScope(actor, documentRow)) {
        return sendJson(response, 403, { error: "Insufficient organization scope." });
      }

      if (
        !hasPermission(actor, "documents:approve", documentRow.organization_id) &&
        !hasRole(actor, "super_admin")
      ) {
        return sendJson(response, 403, { error: "Approval permission required." });
      }

      if (action === "approve") {
        const canSign =
          hasPermission(actor, "documents:sign", documentRow.organization_id) ||
          hasRole(actor, "super_admin");
        if (!canSign) {
          return sendJson(response, 403, { error: "Signature permission required to approve." });
        }
      }

      const reason = sanitizeText(body?.reason || "", { maxLength: 300 });
      if (reasonRequired(action) && !reason) {
        return sendJson(response, 400, { error: "Rejection/revocation reason is required." });
      }

      const nextStatus = nextStatusForAction(action);
      const reviewedAt = new Date().toISOString();

      let signatureRow = null;
      if (action === "approve") {
        const organizationName = await fetchOrganizationLabel(documentRow.organization_id);
        const verificationHash = getVerificationHash(documentRow, actor, reviewedAt);
        const certificateJson = {
          certificateVersion: "trustdoc.certificate.v1",
          badge: "VERIFIED",
          documentId: documentRow.id,
          documentHash: documentRow.hash,
          documentType: documentRow.doc_type || "General",
          issuedBy: documentRow.issued_by || "Unknown",
          organization: organizationName,
          adminName: actor.profile?.display_name || actor.user.email || actor.user.id,
          adminId: actor.user.id,
          verifiedAt: reviewedAt,
          verificationHash,
          blockchainTransactionId: documentRow.tx_hash || "",
        };

        const insertedSignatures = await restInsert("signatures", {
          body: [
            {
              document_id: documentRow.id,
              organization_id: documentRow.organization_id,
              admin_user_id: actor.user.id,
              admin_name: actor.profile?.display_name || actor.user.email || actor.user.id,
              admin_identifier: actor.user.id,
              verification_hash: verificationHash,
              blockchain_tx_hash: documentRow.tx_hash || "",
              signature_payload: {
                algorithm: "SHA-256",
                actor_id: actor.user.id,
                signed_at: reviewedAt,
                source: "workflow-documents",
              },
              certificate_json: certificateJson,
            },
          ],
          useServiceKey: true,
        });

        signatureRow = insertedSignatures?.[0] || null;
      }

      await restInsert("approvals", {
        body: [
          {
            document_id: documentRow.id,
            organization_id: documentRow.organization_id,
            reviewer_user_id: actor.user.id,
            decision: nextStatus,
            reason: reason || "",
            metadata: {
              action,
              previous_status: documentRow.workflow_status,
            },
          },
        ],
        useServiceKey: true,
      });

      const updatedRows = await restPatch("documents", {
        body: {
          workflow_status: nextStatus,
          rejection_reason: action === "approve" ? "" : reason,
          reviewed_by: actor.user.id,
          reviewed_at: reviewedAt,
          approved_signature_id: signatureRow?.id || documentRow.approved_signature_id || null,
          updated_at: reviewedAt,
        },
        query: {
          id: `eq.${documentRow.id}`,
        },
        useServiceKey: true,
      });
      const updated = updatedRows?.[0] || null;

      await createOutcomeNotifications(documentRow, actor, action, reason).catch(() => null);

      await writeAuditLog({
        actor,
        action: `document_${action}`,
        resourceType: "document",
        resourceId: documentRow.id,
        status: "success",
        metadata: {
          previous_status: documentRow.workflow_status,
          next_status: nextStatus,
          reason,
          signature_id: signatureRow?.id || null,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        organizationId: documentRow.organization_id,
      }).catch(() => null);

      return sendJson(response, 200, {
        data: updated,
        signature: signatureRow,
      });
    }

    return sendJson(response, 400, {
      error:
        `Unsupported action. Allowed: ${WORKFLOW_ACTIONS.join(", ")}.`,
    });
  } catch (error) {
    await writeAuditLog({
      actor,
      action: "workflow_mutation_failed",
      resourceType: "document",
      resourceId: sanitizeText(body?.document_id || "", { maxLength: 120 }),
      status: "failed",
      metadata: { action },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      organizationId: actor.profile?.organization_id || null,
      errorMessage: error?.message || "Workflow mutation failed.",
    }).catch(() => null);

    return sendJson(response, 500, { error: error?.message || "Workflow mutation failed." });
  }
}
