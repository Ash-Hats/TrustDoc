import axios from "axios";

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT?.trim();
const PINATA_UPLOAD_ENDPOINT = import.meta.env.VITE_PINATA_UPLOAD_ENDPOINT?.trim();
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY?.trim();
const PINATA_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
let hasLoggedLegacyJwtWarning = false;

function validatePinataConfig() {
  if (!PINATA_GATEWAY) {
    throw new Error("Missing VITE_PINATA_GATEWAY in frontend/.env");
  }

  if (/\s/.test(PINATA_GATEWAY)) {
    throw new Error("Pinata environment values must not contain spaces");
  }

  if (PINATA_UPLOAD_ENDPOINT) {
    if (/\s/.test(PINATA_UPLOAD_ENDPOINT)) {
      throw new Error("VITE_PINATA_UPLOAD_ENDPOINT must not contain spaces");
    }
    return;
  }

  if (!PINATA_JWT) {
    throw new Error(
      "Missing VITE_PINATA_UPLOAD_ENDPOINT (recommended) or VITE_PINATA_JWT (legacy) in frontend/.env"
    );
  }

  if (/\s/.test(PINATA_JWT)) {
    throw new Error("Pinata JWT must not contain spaces");
  }

  if (!hasLoggedLegacyJwtWarning) {
    console.warn(
      "[trustdoc:pinata] Using VITE_PINATA_JWT in frontend is not recommended for production. " +
        "Use VITE_PINATA_UPLOAD_ENDPOINT with a backend upload relay instead."
    );
    hasLoggedLegacyJwtWarning = true;
  }
}

export function buildGatewayUrl(cid) {
  validatePinataConfig();
  return `${PINATA_GATEWAY.replace(/\/+$/, "")}/ipfs/${cid}`;
}

export async function uploadMetadataToPinata(metadata, name = "trustdoc-metadata.json") {
  validatePinataConfig();

  if (PINATA_UPLOAD_ENDPOINT) {
    const response = await axios.post(
      PINATA_UPLOAD_ENDPOINT,
      {
        metadata,
        name,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const cid = response?.data?.cid || response?.data?.IpfsHash || response?.data?.ipfsHash || null;

    if (!cid) {
      throw new Error("Upload endpoint response did not include CID/IpfsHash");
    }

    return {
      cid,
      gatewayUrl: response?.data?.gatewayUrl || buildGatewayUrl(cid),
    };
  }

  const response = await axios.post(
    PINATA_URL,
    {
      pinataMetadata: { name },
      pinataContent: metadata,
    },
    {
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        "Content-Type": "application/json",
      },
    }
  );

  const cid = response?.data?.IpfsHash;

  if (!cid) {
    throw new Error("Pinata response did not include IpfsHash");
  }

  return {
    cid,
    gatewayUrl: buildGatewayUrl(cid),
  };
}

export async function uploadToIPFS(metadata) {
  const { cid } = await uploadMetadataToPinata(metadata);
  return cid;
}
