import {
  sendJson,
  sendText,
  setSecurityHeaders,
  setCorsHeaders,
  handleOptions,
  enforceTrustedOrigin,
} from "./_lib/http.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";
import { hasPermission, hasRole } from "./_lib/rbac.js";
import { restSelect } from "./_lib/supabase.js";
import { isUuid, sanitizeText } from "./_lib/validation.js";
import { requireActor, requestContext } from "./_lib/endpoint.js";
import { getEnv } from "./_lib/env.js";

function buildCertificateHtml({ certificate, document, organizationName }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>TrustDoc Certificate</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; background:#f4f7fb; margin:0; padding:32px; color:#13243d; }
    .card { max-width:860px; margin:0 auto; background:white; border:1px solid #d9e3f1; border-radius:16px; padding:28px; }
    .badge { display:inline-block; background:#0d8f56; color:white; padding:8px 14px; border-radius:999px; font-weight:700; letter-spacing:0.08em; }
    h1 { margin:14px 0 0; font-size:28px; }
    .muted { color:#4d6485; }
    .grid { margin-top:24px; display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .item { border:1px solid #e4edf8; border-radius:12px; padding:10px 12px; }
    .label { font-size:11px; text-transform:uppercase; color:#6280a6; letter-spacing:0.08em; }
    .value { margin-top:4px; word-break:break-all; font-size:14px; font-weight:600; color:#10213a; }
    .footer { margin-top:22px; font-size:12px; color:#557196; }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">VERIFIED</span>
    <h1>Digital Verification Certificate</h1>
    <p class="muted">Issued by ${organizationName}</p>
    <section class="grid">
      <div class="item"><div class="label">Document Hash</div><div class="value">${document.hash || ""}</div></div>
      <div class="item"><div class="label">Document Type</div><div class="value">${document.doc_type || "General"}</div></div>
      <div class="item"><div class="label">Approved By</div><div class="value">${certificate.adminName || ""}</div></div>
      <div class="item"><div class="label">Admin ID</div><div class="value">${certificate.adminId || ""}</div></div>
      <div class="item"><div class="label">Verified At</div><div class="value">${certificate.verifiedAt || ""}</div></div>
      <div class="item"><div class="label">Verification Hash</div><div class="value">${certificate.verificationHash || ""}</div></div>
      <div class="item"><div class="label">Blockchain Transaction</div><div class="value">${certificate.blockchainTransactionId || ""}</div></div>
      <div class="item"><div class="label">Certificate Version</div><div class="value">${certificate.certificateVersion || "trustdoc.certificate.v1"}</div></div>
    </section>
    <p class="footer">TrustDoc centralized authority certificate. Use browser print dialog to save as PDF.</p>
  </main>
</body>
</html>`;
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildCertificatePdf(certificate, organizationName) {
  const lines = [
    "TrustDoc - Digital Verification Certificate",
    `Badge: ${certificate.badge || "VERIFIED"}`,
    `Organization: ${organizationName || "Unknown Organization"}`,
    `Document ID: ${certificate.documentId || ""}`,
    `Document Hash: ${certificate.documentHash || ""}`,
    `Document Type: ${certificate.documentType || ""}`,
    `Admin: ${certificate.adminName || ""}`,
    `Admin ID: ${certificate.adminId || ""}`,
    `Verified At: ${certificate.verifiedAt || ""}`,
    `Verification Hash: ${certificate.verificationHash || ""}`,
    `Blockchain Tx: ${certificate.blockchainTransactionId || ""}`,
    `Verify URL: ${certificate.verifyUrl || ""}`,
  ];

  const content = [
    "BT",
    "/F1 11 Tf",
    "50 760 Td",
    ...lines.map((line, index) =>
      `${index === 0 ? "" : "T* " }(${escapePdfText(line)}) Tj`.trim()
    ),
    "ET",
  ].join("\n");

  const objectList = [];
  objectList.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objectList.push("2 0 obj<< /Type /Pages /Count 1 /Kids [3 0 R] >>endobj\n");
  objectList.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n"
  );
  objectList.push("4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");
  objectList.push(
    `5 0 obj<< /Length ${Buffer.byteLength(content, "utf8")} >>stream\n${content}\nendstream\nendobj\n`
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const obj of objectList) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objectList.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i <= objectList.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer<< /Size ${objectList.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export default async function handler(request, response) {
  if (handleOptions(request, response, ["GET", "OPTIONS"])) {
    return;
  }

  setCorsHeaders(request, response, ["GET", "OPTIONS"]);
  setSecurityHeaders(response);

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  if (!enforceTrustedOrigin(request)) {
    return sendJson(response, 403, { error: "Request origin not allowed." });
  }

  const context = requestContext(request);
  if (!enforceRateLimit(`certificate:${context.ipAddress}`, { windowMs: 60_000, max: 120 })) {
    return sendJson(response, 429, { error: "Rate limit exceeded." });
  }

  let actor;
  try {
    actor = await requireActor(request);
  } catch (error) {
    return sendJson(response, 401, { error: error?.message || "Unauthorized." });
  }

  const documentId = String(request.query?.document_id || "");
  if (!isUuid(documentId)) {
    return sendJson(response, 400, { error: "Valid document_id is required." });
  }

  const docRows = await restSelect("documents", {
    query: {
      select:
        "id,organization_id,user_id,subject_user_id,uploader_user_id,hash,doc_type,tx_hash,workflow_status,approved_signature_id",
      id: `eq.${documentId}`,
      limit: 1,
    },
    useServiceKey: true,
  });
  const document = docRows?.[0] || null;
  if (!document) {
    return sendJson(response, 404, { error: "Document not found." });
  }

  const canRead =
    hasRole(actor, "super_admin") ||
    (document.organization_id && actor.organizationIds.includes(document.organization_id)) ||
    String(document.user_id || "") === actor.user.id ||
    String(document.subject_user_id || "") === actor.user.id ||
    hasPermission(actor, "documents:download_verified", document.organization_id) ||
    hasPermission(actor, "documents:approve", document.organization_id);

  if (!canRead) {
    return sendJson(response, 403, { error: "Insufficient permissions to access certificate." });
  }

  if (document.workflow_status !== "approved") {
    return sendJson(response, 400, { error: "Certificate available only for approved documents." });
  }

  const signatureRows = await restSelect("signatures", {
    query: {
      select:
        "id,document_id,admin_user_id,admin_name,admin_identifier,verification_hash,blockchain_tx_hash,certificate_json,created_at",
      document_id: `eq.${documentId}`,
      order: "created_at.desc",
      limit: 1,
    },
    useServiceKey: true,
  });

  const signature = signatureRows?.[0] || null;
  if (!signature) {
    return sendJson(response, 404, { error: "Signature not found for approved document." });
  }

  const orgRows = await restSelect("organizations", {
    query: {
      select: "id,name,slug",
      id: `eq.${document.organization_id}`,
      limit: 1,
    },
    useServiceKey: true,
  });
  const organization = orgRows?.[0] || null;
  const certificate = {
    certificateVersion: "trustdoc.certificate.v1",
    badge: "VERIFIED",
    documentId: document.id,
    documentHash: document.hash,
    documentType: document.doc_type || "General",
    organization: organization?.name || "Unknown Organization",
    adminName: signature.admin_name || "",
    adminId: signature.admin_identifier || signature.admin_user_id || "",
    verifiedAt: signature.created_at,
    verificationHash: signature.verification_hash || "",
    blockchainTransactionId: signature.blockchain_tx_hash || document.tx_hash || "",
    verifyUrl: `${getEnv().appOrigin || ""}/document/${encodeURIComponent(document.hash || "")}`,
    ...(signature.certificate_json || {}),
  };

  const format = sanitizeText(request.query?.format || "json", { maxLength: 20 }).toLowerCase();
  if (format === "pdf") {
    const pdfBuffer = buildCertificatePdf(certificate, organization?.name || "Unknown Organization");
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", "attachment; filename=\"trustdoc-certificate.pdf\"");
    return response.status(200).send(pdfBuffer);
  }

  if (format === "html") {
    const html = buildCertificateHtml({
      certificate,
      document,
      organizationName: organization?.name || "Unknown Organization",
    });
    response.setHeader("Content-Disposition", "inline; filename=\"trustdoc-certificate.html\"");
    return sendText(response, 200, html, "text/html; charset=utf-8");
  }

  return sendJson(response, 200, {
    certificate,
    signature,
    document,
  });
}
