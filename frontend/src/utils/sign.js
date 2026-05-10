import { getConnectedWallet, requestWalletRpc } from "./contract";

export async function signHash(hash) {
  const normalizedHash = String(hash || "").replace(/^0x/, "");

  if (!/^[0-9a-fA-F]{64}$/.test(normalizedHash)) {
    throw new Error("Document hash must be a valid 64-character SHA-256 hex string.");
  }

  const account = await getConnectedWallet({ requestIfMissing: true });
  if (!account) {
    throw new Error("No wallet account available.");
  }

  const signature = await requestWalletRpc("personal_sign", [
    `0x${normalizedHash}`,
    account,
  ]);

  return {
    signature,
    signer: account.toLowerCase(),
  };
}
