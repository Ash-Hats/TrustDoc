import axios from "axios";

const PINATA_UPLOAD_ENDPOINT = import.meta.env.VITE_PINATA_UPLOAD_ENDPOINT?.trim();
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY?.trim();
const DEV_API_ORIGIN = import.meta.env.VITE_DEV_API_ORIGIN?.trim() || "http://127.0.0.1:3000";
// Development-only emergency fallback. Production should use server relay (`/api/pinata-upload`).
const DEV_PINATA_JWT = import.meta.env.DEV ? import.meta.env.VITE_PINATA_JWT?.trim() : "";
const PINATA_JSON_UPLOAD_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function isRelativeEndpoint(value) {
  return value.startsWith("/");
}

function maybeBuildDevFallbackEndpoint(value) {
  if (!import.meta.env.DEV || !isRelativeEndpoint(value) || !value.startsWith("/api/")) {
    return "";
  }

  return `${DEV_API_ORIGIN.replace(/\/+$/, "")}${value}`;
}

function createUploadError(error, endpoint) {
  const status = error?.response?.status;
  const message =
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    "Pinata upload failed.";

  if (status === 404 || status === 405) {
    return new Error(
      `${message} (HTTP ${status}). Ensure the upload API is reachable at ${endpoint}. For local dev, run Vercel API runtime on ${DEV_API_ORIGIN}.`
    );
  }

  return new Error(message);
}

function getAuthAccessToken() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const raw = window.localStorage.getItem("trustdoc.auth.session.v1");
    if (!raw) {
      return "";
    }
    const parsed = JSON.parse(raw);
    return String(parsed?.accessToken || "").trim();
  } catch {
    return "";
  }
}

async function postUpload(endpoint, payload, accessToken = "") {
  return axios.post(endpoint, payload, {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    timeout: 30_000,
  });
}

async function uploadDirectToPinata(metadata, name) {
  if (!DEV_PINATA_JWT) {
    throw new Error("No development Pinata JWT found for direct upload fallback.");
  }

  const response = await axios.post(
    PINATA_JSON_UPLOAD_URL,
    {
      pinataMetadata: { name },
      pinataContent: metadata,
    },
    {
      headers: {
        Authorization: `Bearer ${DEV_PINATA_JWT}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    }
  );

  return (
    response?.data?.IpfsHash ||
    response?.data?.cid ||
    response?.data?.ipfsHash ||
    response?.data?.hash ||
    null
  );
}

function validatePinataConfig() {
  if (!PINATA_UPLOAD_ENDPOINT) {
    throw new Error("Missing VITE_PINATA_UPLOAD_ENDPOINT in frontend/.env");
  }

  if (/\s/.test(PINATA_UPLOAD_ENDPOINT)) {
    throw new Error("VITE_PINATA_UPLOAD_ENDPOINT must not contain spaces");
  }

  if (PINATA_GATEWAY && /\s/.test(PINATA_GATEWAY)) {
    throw new Error("VITE_PINATA_GATEWAY must not contain spaces");
  }
}

export function buildGatewayUrl(cid) {
  if (!PINATA_GATEWAY) {
    throw new Error("Missing VITE_PINATA_GATEWAY in frontend/.env");
  }

  return `${PINATA_GATEWAY.replace(/\/+$/, "")}/ipfs/${cid}`;
}

export async function uploadMetadataToPinata(metadata, name = "trustdoc-metadata.json") {
  validatePinataConfig();

  const payload = { metadata, name };
  const accessToken = getAuthAccessToken();
  const fallbackEndpoint = maybeBuildDevFallbackEndpoint(PINATA_UPLOAD_ENDPOINT);
  let response;

  try {
    response = await postUpload(PINATA_UPLOAD_ENDPOINT, payload, accessToken);
  } catch (error) {
    const status = error?.response?.status;
    const shouldRetryWithDevFallback =
      Boolean(fallbackEndpoint) &&
      fallbackEndpoint !== PINATA_UPLOAD_ENDPOINT &&
      (status === 404 || status === 405 || !status);
    const canTryDirectDevFallback = import.meta.env.DEV && DEV_PINATA_JWT && Number(status) >= 500;

    if (shouldRetryWithDevFallback) {
      try {
        response = await postUpload(fallbackEndpoint, payload, accessToken);
      } catch (retryError) {
        if (import.meta.env.DEV && DEV_PINATA_JWT) {
          const cid = await uploadDirectToPinata(metadata, name);
          if (!cid) {
            throw createUploadError(retryError, fallbackEndpoint);
          }

          return {
            cid,
            gatewayUrl: PINATA_GATEWAY ? buildGatewayUrl(cid) : null,
          };
        }

        throw createUploadError(retryError, fallbackEndpoint);
      }
    } else if (canTryDirectDevFallback) {
      const cid = await uploadDirectToPinata(metadata, name);
      if (!cid) {
        throw createUploadError(error, PINATA_UPLOAD_ENDPOINT);
      }

      return {
        cid,
        gatewayUrl: PINATA_GATEWAY ? buildGatewayUrl(cid) : null,
      };
    } else {
      throw createUploadError(error, PINATA_UPLOAD_ENDPOINT);
    }
  }

  const cid =
    response?.data?.cid ||
    response?.data?.IpfsHash ||
    response?.data?.ipfsHash ||
    response?.data?.hash ||
    null;

  if (!cid) {
    throw new Error("Upload endpoint response did not include CID/IpfsHash");
  }

  return {
    cid,
    gatewayUrl: response?.data?.gatewayUrl || (PINATA_GATEWAY ? buildGatewayUrl(cid) : null),
  };
}

export async function uploadToIPFS(metadata) {
  const { cid } = await uploadMetadataToPinata(metadata);
  return cid;
}
