import { ethers } from "ethers";
import { rawHash } from "./hashUtils";

export function verifySignature(hash, signature, expectedSigner) {
  try {
    if (!expectedSigner || !ethers.isAddress(expectedSigner)) {
      return false;
    }

    const normalizedHash = rawHash(hash);
    const recoveredAddress = ethers.verifyMessage(
      ethers.getBytes(`0x${normalizedHash}`),
      signature
    );

    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}
