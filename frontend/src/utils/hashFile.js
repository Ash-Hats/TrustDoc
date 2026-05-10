/*
Changes:
- Ensured hashFile() returns raw 64-character hex strings without a 0x prefix.
- Centralized prefix handling in normalizeHash() to avoid duplicate prefix bugs.
*/

export async function hashFile(file) {
  const arrayBuffer = await file.arrayBuffer();

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    arrayBuffer
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));

  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}