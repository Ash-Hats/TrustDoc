/*
Changes:
- Normalized file hash with shared utility to avoid duplicate 0x prefixes.
- Ensured registerDocument() always receives a valid 0x-prefixed bytes32 hash.
- Preserved raw hash storage for metadata while using normalized hash on-chain.
*/

import { useState } from "react";
import { hashFile } from "../utils/hashFile";
import { normalizeHash } from "../utils/hashUtils";
import { uploadToIPFS } from "../utils/pinata";
import { getSignerContract } from "../utils/contract";

export default function Register() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const handleSubmit = async () => {
    if (!file) return alert("Upload file first");

    try {
      setStatus("Hashing file...");
      const rawHash = await hashFile(file);
      const bytes32Hash = normalizeHash(rawHash);

      setStatus("Uploading metadata to IPFS...");
      const metadata = {
        fileName: file.name,
        fileHash: rawHash,
        registeredAt: new Date().toISOString(),
      };

      const cid = await uploadToIPFS(metadata);

      setStatus("Sending transaction...");
      const contract = await getSignerContract();

      const tx = await contract.registerDocument(
        bytes32Hash,
        cid,
        "general",
        "TrustDoc"
      );

      await tx.wait();

      setStatus("✅ Document Registered!");
    } catch (err) {
      console.error(err);
      setStatus("❌ Error occurred");
    }
  };

  return (
    <div style={{ padding: "40px" }}>
      <h1>Register Document</h1>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <br /><br />

      <button onClick={handleSubmit}>
        Register
      </button>

      <p>{status}</p>
    </div>
  );
}