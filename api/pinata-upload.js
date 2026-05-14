const PINATA_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const MAX_METADATA_BYTES = 200_000;
const MAX_NAME_LENGTH = 140;

const rateBuckets = globalThis.__trustdocPinataRateBuckets || new Map();
globalThis.__trustdocPinataRateBuckets = rateBuckets;

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

function getHeaderValue(input) {
  if (Array.isArray(input)) {
    return String(input[0] || "");
  }

  return String(input || "");
}

function getClientIp(request) {
  const forwardedFor = getHeaderValue(request.headers["x-forwarded-for"]);
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = getHeaderValue(request.headers["x-real-ip"]);
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function sanitizeName(value) {
  return String(value || "trustdoc-metadata.json")
    .replace(/[^\w.\-]/g, "_")
    .slice(0, MAX_NAME_LENGTH);
}

function validateAndNormalizeBody(rawBody) {
  const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  const metadata = body?.metadata;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Request body must include a metadata object.");
  }

  const name = sanitizeName(body?.name);
  const serializedMetadata = JSON.stringify(metadata);

  if (!serializedMetadata || serializedMetadata === "{}") {
    throw new Error("Metadata cannot be empty.");
  }

  if (serializedMetadata.length > MAX_METADATA_BYTES) {
    throw new Error("Metadata payload is too large.");
  }

  return {
    metadata,
    name,
  };
}

function enforceRateLimit(clientIp) {
  const now = Date.now();
  const bucket = rateBuckets.get(clientIp);

  if (!bucket || now - bucket.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(clientIp, { startedAt: now, count: 1 });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  bucket.count += 1;
  return true;
}

function buildGatewayUrl(cid) {
  const gateway = String(process.env.PINATA_GATEWAY || "").trim();
  if (!gateway || !cid) {
    return "";
  }

  return `${gateway.replace(/\/+$/, "")}/ipfs/${cid}`;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  const jwt = String(process.env.PINATA_JWT || "").trim();
  if (!jwt) {
    return sendJson(response, 500, { error: "Server is missing PINATA_JWT configuration." });
  }

  const clientIp = getClientIp(request);
  if (!enforceRateLimit(clientIp)) {
    return sendJson(response, 429, { error: "Rate limit exceeded. Please retry shortly." });
  }

  let normalizedBody;
  try {
    normalizedBody = validateAndNormalizeBody(request.body);
  } catch (error) {
    return sendJson(response, 400, { error: error?.message || "Invalid request body." });
  }

  try {
    const upstreamResponse = await fetch(PINATA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataMetadata: { name: normalizedBody.name },
        pinataContent: normalizedBody.metadata,
      }),
    });

    const rawText = await upstreamResponse.text();
    let upstreamData = {};

    if (rawText) {
      try {
        upstreamData = JSON.parse(rawText);
      } catch {
        upstreamData = { message: rawText.slice(0, 500) };
      }
    }

    if (!upstreamResponse.ok) {
      return sendJson(response, 502, {
        error: upstreamData?.error?.reason || upstreamData?.message || "Pinata upload failed.",
      });
    }

    const cid =
      upstreamData?.IpfsHash ||
      upstreamData?.cid ||
      upstreamData?.ipfsHash ||
      upstreamData?.hash ||
      "";

    if (!cid) {
      return sendJson(response, 502, { error: "Pinata response did not include CID." });
    }

    return sendJson(response, 200, {
      cid,
      IpfsHash: cid,
      gatewayUrl: buildGatewayUrl(cid),
    });
  } catch (error) {
    return sendJson(response, 500, {
      error: error?.message || "Unexpected upload relay failure.",
    });
  }
}
