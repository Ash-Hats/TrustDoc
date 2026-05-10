import { verifyDocumentOnChain } from "../utils/contract";
import { sanitizeText } from "../utils/security";

export function normalizeDocument(doc) {
  return {
    ...doc,
    docType: sanitizeText(doc?.docType || "General", { maxLength: 40 }) || "General",
    issuedBy: sanitizeText(doc?.issuedBy || "Unknown", { maxLength: 120 }) || "Unknown",
    revoked: Boolean(doc?.revoked),
    timestamp: Number(doc?.timestamp || 0),
    blockTimestamp: Number(doc?.blockTimestamp || 0),
  };
}

export async function fetchMetadata(gatewayUrl) {
  if (!gatewayUrl) {
    return null;
  }

  const response = await fetch(gatewayUrl, { method: "GET" });

  if (!response.ok) {
    throw new Error("Unable to fetch metadata from IPFS.");
  }

  const data = await response.json();

  return {
    ...data,
    docType: sanitizeText(data?.docType || "General", { maxLength: 40 }) || "General",
    issuedBy: sanitizeText(data?.issuedBy || "Unknown", { maxLength: 120 }) || "Unknown",
    fileName: sanitizeText(data?.fileName || "", { maxLength: 220 }),
  };
}

export async function verifyDocumentWithMetadata(hashHex) {
  const chainResult = await verifyDocumentOnChain(hashHex);
  const metadata = await fetchMetadata(chainResult?.gatewayUrl).catch(() => null);

  return {
    chainResult: normalizeDocument(chainResult),
    metadata,
  };
}

export function buildVerificationConfidence({ exists, revoked, signatureValid, issuerValid, timestampValid }) {
  if (!exists) {
    return 0;
  }

  const score =
    (exists ? 40 : 0) +
    (!revoked ? 20 : 0) +
    (signatureValid ? 20 : 0) +
    (issuerValid ? 10 : 0) +
    (timestampValid ? 10 : 0);

  return Math.max(0, Math.min(100, score));
}

export function downloadJsonFile(content, fileName) {
  const json = JSON.stringify(content, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
