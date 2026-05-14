import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fingerprint, Loader2, ScanSearch, UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";
import toast from "react-hot-toast";
import { hashFile } from "../utils/hashFile";
import { verifyDocumentOnChain } from "../utils/contract";
import { buildVerificationConfidence, fetchMetadata } from "../services/documentService";
import { normalizeHash, normalizeHashOrEmpty, rawHash } from "../utils/hashUtils";
import ResultCard from "./ResultCard";
import { useAppContext } from "../context/AppContext";
import ProofDetailsModal from "../modals/ProofDetailsModal";
import Card from "./ui/Card";

const TOAST_NAMESPACE = "trustdoc-verify";

function normalizeIssuerValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getToastForStatus(status) {
  if (status === "verified") {
    return {
      fn: toast.success,
      message: "Document verified successfully.",
    };
  }

  if (status === "revoked") {
    return {
      fn: toast.error,
      message: "Document exists but is revoked.",
    };
  }

  if (status === "tampered") {
    return {
      fn: toast.error,
      message: "Tamper risk detected.",
    };
  }

  return {
    fn: toast.error,
    message: "Document hash not found on-chain.",
  };
}

export default function DragDropVerify({ verifySignature, initialHash = "" }) {
  const { addVerificationRecord, settings } = useAppContext();
  const [fileName, setFileName] = useState("");
  const [hash, setHash] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [showProofModal, setShowProofModal] = useState(false);
  const [verdict, setVerdict] = useState("not-found");
  const qrVerificationGuardRef = useRef("");
  const activeRunIdRef = useRef(0);
  const lastVerificationRecordRef = useRef("");

  const normalizedInitialHash = initialHash.startsWith("0x") ? initialHash.slice(2) : initialHash;
  const initialHashInvalid = Boolean(initialHash) && !/^[0-9a-fA-F]{64}$/.test(normalizedInitialHash);

  const runVerification = useCallback(
    async (rawHashInput, sourceFileName = "", { expectedHashHex = "", source = "verify" } = {}) => {
      const runId = Date.now();
      activeRunIdRef.current = runId;

      setIsLoading(true);
      setError("");
      setResult(null);
      setMetadata(null);
      setFileName(sourceFileName);
      setVerdict("not-found");

      try {
        const normalizedInputHex = normalizeHash(rawHashInput);
        const normalizedInputRaw = rawHash(normalizedInputHex);
        const normalizedExpectedHashHex = expectedHashHex ? normalizeHash(expectedHashHex) : "";
        const expectedHashMismatch =
          Boolean(normalizedExpectedHashHex) && normalizedExpectedHashHex !== normalizedInputHex;

        setHash(normalizedInputRaw);

        const chainResult = await verifyDocumentOnChain(normalizedInputHex);
        const fetchedMetadata = chainResult?.gatewayUrl
          ? await fetchMetadata(chainResult.gatewayUrl).catch(() => null)
          : null;

        const metadataHashProvided = Boolean(String(fetchedMetadata?.fileHash || "").trim());
        const normalizedMetadataHashHex = normalizeHashOrEmpty(fetchedMetadata?.fileHash);
        const normalizedMetadataHashRaw = normalizedMetadataHashHex ? rawHash(normalizedMetadataHashHex) : "";
        const metadataHashMatches = metadataHashProvided
          ? normalizedMetadataHashRaw === normalizedInputRaw
          : true;
        const metadataHashMismatch = metadataHashProvided && !metadataHashMatches;

        const signatureProvided = Boolean(
          normalizedMetadataHashHex &&
            fetchedMetadata?.signature &&
            fetchedMetadata?.signer &&
            typeof verifySignature === "function"
        );
        const signatureValid = signatureProvided
          ? verifySignature(normalizedMetadataHashHex, fetchedMetadata.signature, fetchedMetadata.signer)
          : null;

        const normalizedMetadataIssuer = normalizeIssuerValue(fetchedMetadata?.issuedBy || "");
        const normalizedOnChainIssuer = normalizeIssuerValue(chainResult?.issuedBy || "");
        const issuerProvided = Boolean(normalizedMetadataIssuer);
        const onChainIssuerProvided = Boolean(normalizedOnChainIssuer);
        const issuerMatches =
          !issuerProvided || !onChainIssuerProvided
            ? true
            : normalizedMetadataIssuer === normalizedOnChainIssuer;
        const timestampValid =
          Number(chainResult?.timestamp || 0) > 0 &&
          Number(chainResult?.timestamp || 0) * 1000 <= Date.now() + 60000;

        const confidenceScore = buildVerificationConfidence({
          exists: chainResult.exists,
          revoked: chainResult.revoked,
          signatureValid: signatureProvided ? Boolean(signatureValid) : true,
          signatureProvided,
          issuerValid: issuerMatches,
          timestampValid,
        });

        let status = "not-found";
        if (!chainResult.exists) {
          status = "not-found";
        } else if (chainResult.revoked) {
          status = "revoked";
        } else if (expectedHashMismatch || metadataHashMismatch) {
          status = "tampered";
        } else {
          status = "verified";
        }

        const payload = {
          status,
          chainResult,
          metadata: fetchedMetadata,
          details: {
            signatureValid,
            signatureProvided,
            hashMatches: !expectedHashMismatch && metadataHashMatches,
            metadataHashMatches,
            metadataHashMismatch,
            expectedHashMismatch,
            issuerMatches,
            timestampValid,
            confidenceScore,
          },
        };

        if (activeRunIdRef.current !== runId) {
          return;
        }

        setMetadata(fetchedMetadata);
        setResult(payload);
        setVerdict(status);

        const hashForRecord = chainResult?.hash || normalizedInputHex;
        const recordKey = `${source}:${status}:${hashForRecord.toLowerCase()}`;
        if (lastVerificationRecordRef.current !== recordKey) {
          addVerificationRecord({
            source,
            status,
            hash: hashForRecord,
            issuer: chainResult?.issuedBy || fetchedMetadata?.issuedBy || "Unknown",
            txHash: chainResult?.txHash || "",
            confidenceScore,
          });
          lastVerificationRecordRef.current = recordKey;
        }

        const statusToast = getToastForStatus(status);
        const toastId = `${TOAST_NAMESPACE}:${status}:${hashForRecord.toLowerCase()}`;
        statusToast.fn(statusToast.message, { id: toastId });
      } catch (verifyError) {
        if (activeRunIdRef.current !== runId) {
          return;
        }

        const message = verifyError instanceof Error ? verifyError.message : "Verification failed.";
        setError(message);
        toast.error(message, { id: `${TOAST_NAMESPACE}:error:${String(rawHashInput || "").toLowerCase()}` });
      } finally {
        if (activeRunIdRef.current === runId) {
          setIsLoading(false);
        }
      }
    },
    [addVerificationRecord, verifySignature]
  );

  const onDrop = useCallback(
    async (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) {
        return;
      }

      try {
        const digest = await hashFile(file);
        const expectedHashHex =
          initialHash && !initialHashInvalid ? normalizeHash(normalizedInitialHash) : "";
        await runVerification(digest, file.name, {
          expectedHashHex,
          source: "verify",
        });
      } catch (verifyError) {
        const message = verifyError instanceof Error ? verifyError.message : "Verification failed.";
        setError(message);
        toast.error(message, { id: `${TOAST_NAMESPACE}:drop-error` });
      }
    },
    [initialHash, initialHashInvalid, normalizedInitialHash, runVerification]
  );

  useEffect(() => {
    if (!initialHash || initialHashInvalid) {
      qrVerificationGuardRef.current = "";
      return;
    }

    const qrKey = normalizedInitialHash.toLowerCase();
    if (qrVerificationGuardRef.current === qrKey) {
      return;
    }

    qrVerificationGuardRef.current = qrKey;
    void runVerification(normalizedInitialHash, "From QR Link", { source: "qr" });
  }, [initialHash, initialHashInvalid, normalizedInitialHash, runVerification]);

  useEffect(() => {
    return () => {
      activeRunIdRef.current = 0;
    };
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
  });

  const showResult = useMemo(() => Boolean(result), [result]);

  return (
    <section className="w-full space-y-5">
      <Card className="p-5 sm:p-6">
        <div
          {...getRootProps()}
          className={[
            "group cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300",
            "border-violet-300/40 bg-white/[0.04] hover:border-violet-300/70 hover:shadow-glow-violet",
            isDragActive ? "border-cyan-300/80 bg-cyan-500/10 shadow-glow-cyan" : "",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-500/25 to-indigo-500/25 text-violet-200 shadow-glow-violet transition group-hover:scale-105">
            {isDragActive ? <Fingerprint size={30} /> : <UploadCloud size={30} />}
          </div>
          <p className="text-xl font-semibold tracking-tight text-gray-100">
            {isDragActive ? "Drop file to verify now" : "Drag and drop document to verify"}
          </p>
          <p className="mt-2 text-sm text-gray-400">or click to browse local files</p>
        </div>

        {fileName || hash ? (
          <div className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-3">
            {fileName ? (
              <p className="text-sm text-cyan-100">
                <span className="font-semibold">File:</span> {fileName}
              </p>
            ) : null}
            {hash ? <p className="mt-2 break-all font-mono text-xs text-cyan-200/90">{hash}</p> : null}
          </div>
        ) : null}
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-xl border border-violet-300/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
          <Loader2 size={16} className="animate-spin" />
          Checking blockchain proof, signature, issuer metadata, and timeline...
        </div>
      ) : null}

      {initialHashInvalid ? (
        <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Invalid hash in URL. Expected 64 hexadecimal characters.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {showResult && result ? (
        <div className="space-y-3 transition duration-300">
          <ResultCard
            verdict={verdict}
            result={result}
            hash={hash}
            fileName={fileName}
            explorerBaseUrl={settings.explorerBaseUrl}
            onOpenProof={() => setShowProofModal(true)}
          />
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-300">
            <ScanSearch size={14} className="text-cyan-300" />
            Confidence: {result.details.confidenceScore}% | Issuer check:{" "}
            {result.details.issuerMatches ? "match" : "mismatch"}
          </div>
        </div>
      ) : null}

      <ProofDetailsModal
        open={showProofModal}
        onClose={() => setShowProofModal(false)}
        data={
          result
            ? {
                chainResult: result.chainResult,
                metadata,
                confidenceScore: result.details.confidenceScore,
                issuerMatches: result.details.issuerMatches,
                timestampValid: result.details.timestampValid,
                signatureValid: result.details.signatureValid,
                signatureProvided: result.details.signatureProvided,
              }
            : null
        }
        explorerBaseUrl={settings.explorerBaseUrl}
        onCopy={async (value, label) => {
          if (!value) {
            return;
          }

          try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied.`);
          } catch {
            toast.error(`Unable to copy ${label.toLowerCase()}.`);
          }
        }}
      />
    </section>
  );
}
