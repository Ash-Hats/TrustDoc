import axios from "axios";

const PINATA_UPLOAD_ENDPOINT = import.meta.env.VITE_PINATA_UPLOAD_ENDPOINT?.trim();
const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY?.trim();

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
