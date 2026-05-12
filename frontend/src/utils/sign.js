import { ethers } from "ethers";
import { getConnectedWallet, requestWalletRpc } from "./contract";
import { getSigner } from "../services/walletManager";

export async function signHash(hash) {
  const normalizedHash = String(hash || "").replace(/^0x/, "");

  if (!/^[0-9a-fA-F]{64}$/.test(normalizedHash)) {
    throw new Error("Document hash must be a valid 64-character SHA-256 hex string.");
  }

  const account = await getConnectedWallet({ requestIfMissing: true });
  if (!account) {
    throw new Error("No wallet account available.");
  }

  const hashHex = `0x${normalizedHash}`;
  const signature = await (async () => {
    try {
      const signer = await getSigner({ requestIfMissing: true });
      return await signer.signMessage(ethers.getBytes(hashHex));
    } catch (signerError) {
      return requestWalletRpc("personal_sign", [hashHex, account]).catch(() => {
        throw signerError;
      });
    }
  })();

  return {
    signature,
    signer: account.toLowerCase(),
  };
}
