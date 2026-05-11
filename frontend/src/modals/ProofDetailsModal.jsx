import { CheckCircle2, Copy, ExternalLink, ShieldAlert, X } from "lucide-react";
import Button from "../components/ui/Button";
import { formatTimestamp } from "../utils/format";
import { buildTxUrl } from "../utils/explorer";

export default function ProofDetailsModal({
  open,
  onClose,
  data,
  explorerBaseUrl,
  onCopy,
}) {
  if (!open || !data) {
    return null;
  }

  const {
    chainResult,
    metadata,
    confidenceScore,
    issuerMatches,
    timestampValid,
    signatureValid,
    signatureProvided,
  } = data;

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/65 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#1a1f2e]/95 p-6 shadow-elevated">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-gray-100">Verification Proof Timeline</h3>
            <p className="mt-1 text-sm text-gray-400">Complete trust timeline and proof details.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-wide text-cyan-200">Confidence Score</p>
          <p className="mt-2 text-3xl font-bold text-cyan-100">{confidenceScore}%</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Step
            title="Blockchain Record"
            value={chainResult?.exists ? "Found" : "Not Found"}
            valid={Boolean(chainResult?.exists)}
          />
          <Step
            title="Signature Validation"
            value={
              signatureProvided ? (signatureValid ? "Valid" : "Invalid") : "Not Provided"
            }
            status={signatureProvided ? (signatureValid ? "valid" : "invalid") : "neutral"}
          />
          <Step
            title="Issuer Validation"
            value={issuerMatches ? "Matched" : "Mismatch"}
            status={issuerMatches ? "valid" : "invalid"}
          />
          <Step
            title="Timestamp Validation"
            value={timestampValid ? "Valid" : "Suspicious"}
            status={timestampValid ? "valid" : "invalid"}
          />
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Timeline</p>
          <ol className="mt-3 space-y-3 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 size={15} className="mt-0.5 text-emerald-300" />
              Hash compared against SHA-256 input.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={15} className="mt-0.5 text-emerald-300" />
              On-chain proof checked on Polygon Amoy at {formatTimestamp(chainResult?.timestamp)}.
            </li>
            <li className="flex items-start gap-2">
              <ShieldAlert size={15} className="mt-0.5 text-violet-300" />
              Signature and issuer metadata cross-validated.
            </li>
          </ol>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onCopy(chainResult?.hash, "Hash")}>
            <Copy size={14} />
            Copy Hash
          </Button>
          {chainResult?.txHash ? (
            <a
              href={buildTxUrl(explorerBaseUrl, chainResult.txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-glow-violet transition hover:brightness-110"
            >
              Open Explorer
              <ExternalLink size={14} />
            </a>
          ) : null}
        </div>

        {metadata ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">Issuer Metadata</p>
            <p className="mt-2 text-sm text-gray-200">{metadata.issuedBy || "Unknown"}</p>
            <p className="mt-1 text-xs text-gray-400">{metadata.fileName || "No file name"}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Step({ title, value, status = "invalid" }) {
  const statusClass =
    status === "valid"
      ? "border-emerald-300/25 bg-emerald-500/10"
      : status === "neutral"
        ? "border-amber-300/25 bg-amber-500/10"
        : "border-rose-300/25 bg-rose-500/10";

  return (
    <div
      className={["rounded-xl border p-3", statusClass].join(" ")}
    >
      <p className="text-[11px] uppercase tracking-wide text-gray-300">{title}</p>
      <p className="mt-1 text-sm font-semibold text-gray-100">{value}</p>
    </div>
  );
}
