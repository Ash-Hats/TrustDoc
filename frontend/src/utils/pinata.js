import axios from "axios";

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT?.trim();
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY?.trim();
const PINATA_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function validatePinataConfig() {
  if (!PINATA_JWT) {
    throw new Error("Missing VITE_PINATA_JWT in frontend/.env");
  }

  if (!PINATA_GATEWAY) {
    throw new Error("Missing VITE_PINATA_GATEWAY in frontend/.env");
  }

  if (/\s/.test(PINATA_JWT) || /\s/.test(PINATA_GATEWAY)) {
    throw new Error("Pinata environment values must not contain spaces");
  }
}

export function buildGatewayUrl(cid) {
  validatePinataConfig();
  return `${PINATA_GATEWAY.replace(/\/+$/, "")}/ipfs/${cid}`;
}

export async function uploadMetadataToPinata(metadata, name = "trustdoc-metadata.json") {
  validatePinataConfig();

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