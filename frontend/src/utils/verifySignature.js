import { ethers } from "ethers";
import { rawHash } from "./hashUtils";

export function verifySignature(hash, signature, expectedSigner) {
  try {
    if (!expectedSigner || !ethers.isAddress(expectedSigner)) {
      return false;
    }

    const normalizedHash = rawHash(hash);
    const candidates = [
      ethers.getBytes(`0x${normalizedHash}`),
      `0x${normalizedHash}`,
      normalizedHash,
    ];

    const recoveredAddresses = candidates
      .map((candidate) => {
        try {
          return ethers.verifyMessage(candidate, signature);
        } catch {
          return "";
        }
      })
      .filter(Boolean);

    return recoveredAddresses.some(
      (address) => address.toLowerCase() === expectedSigner.toLowerCase()
    );
  } catch {
    return false;
  }
}
