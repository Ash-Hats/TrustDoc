import { useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileUp,
  Loader2,
  QrCode,
} from "lucide-react";
import toast from "react-hot-toast";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { hashFile } from "../utils/hashFile";
import { uploadMetadataToPinata } from "../utils/pinata";
import { registerDocumentOnChain } from "../utils/contract";
import { signHash } from "../utils/sign";
import { sanitizeText, validateFileSelection } from "../utils/security";
import { useAppContext } from "../context/AppContext";
import { buildTxUrl } from "../utils/explorer";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DOC_TYPE_OPTIONS = ["General", "Certificate", "Invoice", "Academic", "Identity"];
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "doc", "docx", "txt", "json"];

const STATUS_PROGRESS = {
  Idle: 0,
  "Processing file...": 18,
  "Generating secure hash...": 32,
  "Signing document with wallet...": 50,
  "Preparing blockchain transaction...": 72,
  "Waiting for on-chain confirmation...": 88,
  "Document registered successfully.": 100,
  Failed: 100,
};

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-gray-300">
      <p className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={mono ? "break-all font-mono" : ""}>{value || "-"}</p>
    </div>
  );
}

export default function Register() {
  const {
    trackPendingTransaction,
    resolvePendingTransaction,
    addVerificationRecord,
    updateDocumentAccess,
    settings,
  } = useAppContext();
  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState("General");
  const [issuedBy, setIssuedBy] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState("private");
  const [sharedWallets, setSharedWallets] = useState("");
  const [status, setStatus] = useState("Idle");
  const [docHash, setDocHash] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  const fileSizeLabel = useMemo(() => {
    if (!file) {
      return "";
    }

    return `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  }, [file]);

  const progressValue = STATUS_PROGRESS[status] ?? 0;

  function setSelectedFile(selected) {
    setResult(null);
    setError("");
    setDocHash("");

    const validationError = validateFileSelection(selected, {
      maxBytes: MAX_FILE_BYTES,
      allowedExtensions: ALLOWED_EXTENSIONS,
    });

    if (validationError) {
      setFile(null);
      if (selected) {
        setError(validationError);
      }
      return;
    }

    setFile(selected);
  }

  const onDrop = (acceptedFiles) => {
    const selected = acceptedFiles?.[0];
    setSelectedFile(selected ?? null);
  };

  const onDropRejected = () => {
    setFile(null);
    setError("File rejected. Ensure one allowed file up to 10MB.");
    toast.error("Only one supported file up to 10MB is allowed.");
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    disabled: isSubmitting,
    maxFiles: 1,
    multiple: false,
    maxSize: MAX_FILE_BYTES,
  });

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const fileError = validateFileSelection(file, {
      maxBytes: MAX_FILE_BYTES,
      allowedExtensions: ALLOWED_EXTENSIONS,
    });

    if (fileError) {
      setError(fileError);
      toast.error(fileError);
      return;
    }

    if (
      privacyLevel === "shared" &&
      !sharedWallets
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean).length
    ) {
      const message = "Add at least one wallet address for shared privacy mode.";
      setError(message);
      toast.error(message);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setResult(null);
    setDocHash("");

    const progressToastId = toast.loading("Processing file...");

    try {
      setStatus("Processing file...");

      setStatus("Generating secure hash...");
      const hash = await hashFile(file);

      setStatus("Signing document with wallet...");
      const { signature, signer } = await signHash(hash);

      setStatus("Preparing blockchain transaction...");
      const metadata = {
        fileName: sanitizeText(file.name, { maxLength: 220 }),
        fileHash: hash,
        signature,
        signer,
        docType,
        issuedBy: sanitizeText(issuedBy, { maxLength: 120 }) || "Unknown",
        privacyLevel,
        sharedWithWallets: sharedWallets
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
        registeredAt: new Date().toISOString(),
      };

      const { cid, gatewayUrl } = await uploadMetadataToPinata(metadata, `${file.name}.metadata.json`);

      setShowWalletModal(true);
      await new Promise((resolve) => setTimeout(resolve, 450));
      toast.loading("Awaiting wallet confirmation...", { id: progressToastId });

      const txResult = await registerDocumentOnChain({
        hashHex: hash,
        cid,
        docType,
        issuedBy,
        onGasRetry: () => {
          setStatus("Preparing blockchain transaction...");
          toast.loading("Network busy, retrying gas strategy...", { id: progressToastId });
        },
      });

      setShowWalletModal(false);
      setStatus("Waiting for on-chain confirmation...");
      toast.loading("Waiting for on-chain confirmation...", { id: progressToastId });

      trackPendingTransaction({
        txHash: txResult.txHash,
        type: "register",
        meta: {
          hash,
          issuer: issuedBy || "Unknown",
          docType,
        },
      });

      const receipt = await resolvePendingTransaction(txResult.txHash, {
        successMessage: "Document registered on-chain.",
      });

      setDocHash(`0x${hash}`);
      setStatus("Document registered successfully.");
      const registrationResult = {
        hashHex: hash,
        cid,
        gatewayUrl,
        signature,
        signer,
        txHash: txResult.txHash,
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed ? receipt.gasUsed.toString() : null,
      };
      setResult(registrationResult);

      addVerificationRecord({
        source: "register",
        status: "verified",
        hash: `0x${hash}`,
        issuer: issuedBy || "Unknown",
        txHash: txResult.txHash,
      });

      await updateDocumentAccess({
        hash: `0x${hash}`,
        privacyLevel,
        sharedWithWallets: sharedWallets,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      }).catch(() => null);

      toast.success("Document registered on-chain.", { id: progressToastId });
    } catch (registerError) {
      const message = registerError instanceof Error ? registerError.message : "Document registration failed.";
      setError(message);
      setStatus("Failed");
      toast.error(message, { id: progressToastId });
    } finally {
      setShowWalletModal(false);
      setIsSubmitting(false);
    }
  }

  async function handleCopyHash() {
    if (!docHash) {
      return;
    }

    try {
      await navigator.clipboard.writeText(docHash);
      toast.success("Hash copied to clipboard.");
    } catch {
      toast.error("Failed to copy hash.");
    }
  }

  async function handleCopyTx() {
    if (!result?.txHash) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.txHash);
      toast.success("Transaction hash copied.");
    } catch {
      toast.error("Failed to copy transaction hash.");
    }
  }

  const verifyUrl =
    typeof window !== "undefined" && docHash
      ? `${window.location.origin}/verify?hash=${docHash}`
      : "";

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="mb-6 animate-fade-in-up">
        <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          Register Document
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
          Upload a supported document and anchor a tamper-proof fingerprint to Polygon Amoy.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
        <Card className="animate-fade-in-up p-6 sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div
              {...getRootProps()}
              className={[
                "group cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300",
                "border-violet-300/40 bg-white/[0.04] hover:border-violet-300/70 hover:bg-violet-500/10",
                isDragActive ? "border-cyan-300/80 bg-cyan-500/10 shadow-glow-cyan" : "",
                isSubmitting ? "cursor-not-allowed opacity-70" : "",
              ].join(" ")}
            >
              <input {...getInputProps()} />
              <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-indigo-500/25 text-violet-200 shadow-glow-violet transition group-hover:scale-105">
                <FileUp size={24} />
              </div>
              <p className="text-base font-semibold text-gray-100">
                {isDragActive ? "Drop file to attach" : "Drag and drop your file"}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Allowed: {ALLOWED_EXTENSIONS.join(", ")} (max 10MB)
              </p>
            </div>

            {file ? (
              <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-3">
                <p className="text-sm font-medium text-cyan-100">{file.name}</p>
                <p className="mt-1 text-xs text-cyan-200/80">{fileSizeLabel}</p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-300">Document Type</span>
                <select
                  value={docType}
                  onChange={(event) => setDocType(event.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 outline-none transition focus:border-violet-300/70 focus:ring-2 focus:ring-violet-400/20"
                >
                  {DOC_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option} className="bg-[#141824] text-gray-100">
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-300">Issued By</span>
                <input
                  type="text"
                  value={issuedBy}
                  onChange={(event) => setIssuedBy(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="Authority / Organization"
                  className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 outline-none transition focus:border-violet-300/70 focus:ring-2 focus:ring-violet-400/20"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-300">Privacy Level</span>
                <select
                  value={privacyLevel}
                  onChange={(event) => setPrivacyLevel(event.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 outline-none transition focus:border-violet-300/70 focus:ring-2 focus:ring-violet-400/20"
                >
                  <option value="private" className="bg-[#141824] text-gray-100">
                    Private
                  </option>
                  <option value="shared" className="bg-[#141824] text-gray-100">
                    Shared
                  </option>
                  <option value="public" className="bg-[#141824] text-gray-100">
                    Public
                  </option>
                </select>
              </label>
            </div>

            {privacyLevel === "shared" ? (
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-300">
                  Shared Wallets (comma separated)
                </span>
                <input
                  type="text"
                  value={sharedWallets}
                  onChange={(event) => setSharedWallets(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="0xabc..., 0xdef..."
                  className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 outline-none transition focus:border-violet-300/70 focus:ring-2 focus:ring-violet-400/20"
                />
              </label>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Progress</span>
                <span>{progressValue}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting || !file} className="min-w-[220px] py-3">
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                "Register Document"
              )}
            </Button>

            <div className="rounded-xl border border-violet-300/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
              <span className="font-semibold">Status:</span> {status}
            </div>

            {error ? (
              <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="animate-fade-in-up">
            <h3 className="text-lg font-semibold text-gray-100">Registration Result</h3>
            <p className="mt-2 text-sm text-gray-400">Hash and proof links appear here after confirmation.</p>

            {docHash ? (
              <div className="mt-4 animate-pulse-glow rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 text-emerald-200">
                  <CheckCircle2 size={16} />
                  <p className="text-xs font-semibold uppercase tracking-wide">Registered Hash</p>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-emerald-100">{docHash}</p>
                <div className="mt-3 grid gap-2">
                  <Button variant="secondary" className="text-xs" onClick={handleCopyHash}>
                    <Copy size={13} />
                    Copy Hash
                  </Button>
                  <a
                    href={verifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-105"
                  >
                    Open Verify Link
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-400">
                Complete registration to generate a verify link and QR.
              </div>
            )}
          </Card>

          {docHash ? (
            <Card className="animate-fade-in-up text-center">
              <h4 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-300">
                <QrCode size={15} />
                QR Verify
              </h4>
              <div className="mt-4 inline-flex rounded-xl border border-white/10 bg-white p-3">
                <QRCode value={verifyUrl} size={164} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {result ? (
        <Card className="mt-6 animate-fade-in-up border-emerald-300/25 bg-emerald-500/10 shadow-glow-emerald">
          <h3 className="text-xl font-semibold text-emerald-100">Registered Successfully</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DetailRow label="SHA-256" value={result.hashHex} mono />
            <DetailRow label="Signature" value={result.signature} mono />
            <DetailRow label="Signer" value={result.signer} mono />
            <DetailRow label="CID" value={result.cid} mono />
            <DetailRow label="Gateway URL" value={result.gatewayUrl} mono />
            <DetailRow label="Tx Hash" value={result.txHash} mono />
            <DetailRow label="Block Number" value={result.blockNumber ?? "-"} />
            <DetailRow label="Gas Used" value={result.gasUsed ?? "-"} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" className="text-xs" onClick={handleCopyTx}>
              <Copy size={13} />
              Copy Tx Hash
            </Button>
            <a
              href={buildTxUrl(settings.explorerBaseUrl, result.txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-2 text-xs font-semibold text-white shadow-glow-violet transition hover:brightness-110"
            >
              Open on Polygonscan
              <ExternalLink size={13} />
            </a>
          </div>
        </Card>
      ) : null}

      {showWalletModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md border-violet-300/25 bg-[#1a1f2e]/95">
            <h4 className="text-xl font-semibold text-gray-100">Secure Confirmation Required</h4>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Confirm once in your wallet to complete registration.
            </p>
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-violet-300/25 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
              <Loader2 size={15} className="animate-spin" />
              Opening MetaMask...
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
