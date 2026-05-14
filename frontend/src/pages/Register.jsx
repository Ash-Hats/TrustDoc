import { useMemo, useState } from "react";
import { ExternalLink, FileUp, Loader2, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { QRCodeSVG as QRCode } from "qrcode.react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { hashFile } from "../utils/hashFile";
import { normalizeHash, rawHash } from "../utils/hashUtils";
import { sanitizeText, sanitizeFileName, validateFileSelection } from "../utils/security";
import { uploadMetadataToPinata } from "../utils/pinata";
import { registerDocumentOnChain, verifyDocumentOnChain } from "../utils/contract";
import { signHash } from "../utils/sign";
import { buildTxUrl } from "../utils/explorer";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const DEFAULT_DOC_TYPE = "General";
const DEFAULT_ISSUER = "TrustDoc";

function stepText(step) {
  switch (step) {
    case "hashing":
      return "Hashing file with SHA-256...";
    case "checking":
      return "Checking if hash is already registered on-chain...";
    case "signing":
      return "Signing metadata proof with wallet...";
    case "uploading":
      return "Uploading metadata to IPFS...";
    case "submitting":
      return "Submitting registration transaction...";
    case "confirming":
      return "Waiting for on-chain confirmation...";
    case "done":
      return "Document registered successfully.";
    default:
      return "";
  }
}

export default function Register() {
  const { profile } = useAuth();
  const { wallet, settings, trackPendingTransaction, resolvePendingTransaction } = useAppContext();

  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState(DEFAULT_DOC_TYPE);
  const [issuedBy, setIssuedBy] = useState(profile?.organization_name || DEFAULT_ISSUER);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState("");
  const [hashPreview, setHashPreview] = useState("");
  const [txHash, setTxHash] = useState("");
  const [cid, setCid] = useState("");

  const statusMessage = useMemo(() => stepText(step), [step]);
  const verifyUrl = useMemo(() => {
    if (!hashPreview || typeof window === "undefined") {
      return "";
    }

    return `${window.location.origin}/verify?hash=0x${hashPreview}`;
  }, [hashPreview]);

  function resetFormState() {
    setStep("");
    setTxHash("");
    setCid("");
    setHashPreview("");
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);

    if (!selected) {
      return;
    }

    const selectionError = validateFileSelection(selected, { maxBytes: MAX_FILE_SIZE_BYTES });
    if (selectionError) {
      toast.error(selectionError);
      setFile(null);
      return;
    }

    resetFormState();
  }

  async function handleRegister(event) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (!file) {
      toast.error("Select a file before registration.");
      return;
    }

    const selectionError = validateFileSelection(file, { maxBytes: MAX_FILE_SIZE_BYTES });
    if (selectionError) {
      toast.error(selectionError);
      return;
    }

    if (!wallet?.account || wallet?.status !== "connected") {
      toast.error("Connect wallet on Polygon Amoy before registering.");
      return;
    }

    const preparedDocType = sanitizeText(docType || DEFAULT_DOC_TYPE, { maxLength: 40 }) || DEFAULT_DOC_TYPE;
    const preparedIssuer =
      sanitizeText(issuedBy || profile?.organization_name || DEFAULT_ISSUER, { maxLength: 120 }) ||
      DEFAULT_ISSUER;

    setIsSubmitting(true);
    resetFormState();

    try {
      setStep("hashing");
      const fileDigest = await hashFile(file);
      const fileHashHex = normalizeHash(fileDigest);
      const fileHashRaw = rawHash(fileHashHex);
      setHashPreview(fileHashRaw);

      setStep("checking");
      const preflight = await verifyDocumentOnChain(fileHashHex);
      if (preflight?.exists) {
        throw new Error("This document hash is already registered on-chain.");
      }

      setStep("signing");
      const { signature, signer } = await signHash(fileHashHex);

      const metadata = {
        schema: "trustdoc.metadata.v1",
        fileHash: fileHashRaw,
        signature,
        signer,
        docType: preparedDocType,
        issuedBy: preparedIssuer,
        fileName: sanitizeFileName(file.name),
        fileSize: Number(file.size || 0),
        fileType: sanitizeText(file.type || "", { maxLength: 120 }),
        registeredAt: new Date().toISOString(),
      };

      setStep("uploading");
      const uploaded = await uploadMetadataToPinata(metadata, `trustdoc-${Date.now()}-${metadata.fileName}.json`);
      setCid(uploaded.cid);

      setStep("submitting");
      const submission = await registerDocumentOnChain({
        hashHex: fileHashHex,
        cid: uploaded.cid,
        docType: preparedDocType,
        issuedBy: preparedIssuer,
        onGasRetry: () => {
          toast("Refreshing gas estimate and retrying transaction...");
        },
      });

      setTxHash(submission.txHash);
      trackPendingTransaction({
        txHash: submission.txHash,
        type: "register",
        meta: {
          hash: fileHashHex,
          docType: preparedDocType,
          issuer: preparedIssuer,
          cid: uploaded.cid,
          fileName: metadata.fileName,
        },
      });

      setStep("confirming");
      const receipt = await resolvePendingTransaction(submission.txHash, {
        successMessage: "Document registration confirmed on-chain.",
        waitForConfirmation: () => submission.waitForConfirmation({ timeoutMs: 240000 }),
      });

      setStep("done");
      toast.success("Document registered successfully.");
      if (receipt?.gasUsed) {
        toast(`Gas used: ${receipt.gasUsed.toString()}`);
      }
    } catch (error) {
      const message = error?.message || "Registration failed.";
      toast.error(message);
      resetFormState();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <Card>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-500/25 to-cyan-500/25 text-violet-100 shadow-glow-violet">
            <FileUp size={20} />
          </span>
          <div>
            <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Register Document
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Production-safe flow: deterministic SHA-256 hash, signed metadata, and one-step on-chain registration.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <form className="space-y-5" onSubmit={handleRegister}>
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.12em] text-gray-400">Document File</span>
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-violet-300/70"
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500">Max size: 25MB. Hashing uses raw binary bytes (SHA-256).</p>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.12em] text-gray-400">Document Type</span>
              <input
                type="text"
                value={docType}
                onChange={(event) => setDocType(event.target.value)}
                maxLength={40}
                className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-violet-300/70"
                disabled={isSubmitting}
                placeholder="General"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.12em] text-gray-400">Issued By</span>
              <input
                type="text"
                value={issuedBy}
                onChange={(event) => setIssuedBy(event.target.value)}
                maxLength={120}
                className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-violet-300/70"
                disabled={isSubmitting}
                placeholder="TrustDoc"
              />
            </label>
          </div>

          {statusMessage ? (
            <div className="flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {statusMessage}
            </div>
          ) : null}

          {hashPreview ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-gray-400">SHA-256 Hash</p>
              <p className="mt-2 break-all font-mono text-xs text-gray-200">{hashPreview}</p>
            </div>
          ) : null}

          {(txHash || cid) && !isSubmitting ? (
            <div className="space-y-2 rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              {cid ? (
                <p>
                  CID: <span className="font-mono">{cid}</span>
                </p>
              ) : null}
              {txHash ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    Tx: <span className="font-mono">{txHash}</span>
                  </span>
                  <a
                    href={buildTxUrl(settings.explorerBaseUrl, txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/35 bg-emerald-500/20 px-2 py-1 font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
                  >
                    Explorer
                    <ExternalLink size={12} />
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}

          {verifyUrl && !isSubmitting ? (
            <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-cyan-200">Public Verify Link</p>
              <p className="mt-2 break-all font-mono text-xs text-cyan-100">{verifyUrl}</p>
              <div className="mt-3 inline-flex rounded-xl border border-white/15 bg-white p-2">
                <QRCode value={verifyUrl} size={110} />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isSubmitting || !file}>
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              {isSubmitting ? "Processing..." : "Register Document"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => {
                setFile(null);
                resetFormState();
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
