import { ethers } from "ethers";

export function verifySignature(hash, signature, expectedSigner) {
  try {
    const recoveredAddress = ethers.verifyMessage(
      ethers.getBytes("0x" + hash),
      signature
    );

    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}
