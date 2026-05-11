import { AlertTriangle, BadgeCheck, ExternalLink, ShieldAlert, Timer } from "lucide-react";
import { formatTimestamp } from "../utils/format";
import Button from "./ui/Button";
import { buildTxUrl } from "../utils/explorer";
import { normalizeHashOrEmpty } from "../utils/hashUtils";

const STATUS_CONFIG = {
  verified: {
    icon: BadgeCheck,
    title: "VERIFIED",
    description: "Document integrity and ownership proof are valid.",
    cardClass: "border-emerald-300/30 bg-emerald-500/10 shadow-glow-emerald",
    iconClass: "bg-emerald-400/20 text-emerald-200 animate-pulse-glow",
  },
  tampered: {
    icon: ShieldAlert,
    title: "TAMPERED",
    description: "Hash, issuer, or signature mismatch was detected.",
    cardClass: "border-rose-300/30 bg-rose-500/10 shadow-glow-rose animate-shake-soft",
    iconClass: "bg-rose-400/20 text-rose-200",
  },
  "not-found": {
    icon: AlertTriangle,
    title: "NOT FOUND",
    description: "No matching hash exists on-chain.",
    cardClass: "border-rose-300/30 bg-rose-500/10 shadow-glow-rose",
    iconClass: "bg-rose-400/20 text-rose-200",
  },
  revoked: {
    icon: Timer,
    title: "REVOKED",
    description: "Document exists but has been revoked by its owner.",
    cardClass: "border-amber-300/30 bg-amber-500/10 shadow-glow-amber",
    iconClass: "bg-amber-400/20 text-amber-200",
  },
};

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={["mt-1 text-sm text-gray-200", mono ? "break-all font-mono text-xs" : ""].join(" ")}>
        {value || "-"}
      </p>
    </div>
  );
}

export default function ResultCard({
  verdict = "not-found",
  result,
  hash,
  fileName,
  explorerBaseUrl,
  onOpenProof,
}) {
  const config = STATUS_CONFIG[verdict] || STATUS_CONFIG["not-found"];
  const Icon = config.icon;
  const { chainResult, metadata, details } = result;

  const normalizedMetadataHash = normalizeHashOrEmpty(metadata?.fileHash);
  const metadataHash = normalizedMetadataHash || "Unavailable";
  const comparedInputHash = hash ? (hash.startsWith("0x") ? hash : `0x${hash}`) : "Unavailable";
  const signatureStatus = details.signatureProvided
    ? details.signatureValid
      ? "Valid"
      : "Invalid"
    : "Not Provided";

  return (
    <section className={["rounded-2xl border p-5 shadow-sm transition sm:p-6", config.cardClass].join(" ")}>
      <div className="flex items-start gap-3">
        <span
          className={[
            "inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
            config.iconClass,
          ].join(" ")}
        >
          <Icon size={18} />
        </span>
        <div>
          <h3 className="text-lg font-bold tracking-tight text-gray-100">{config.title}</h3>
          <p className="mt-1 text-sm text-gray-300">{config.description}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <InfoRow label="Issuer" value={chainResult?.issuedBy || metadata?.issuedBy || "-"} />
        <InfoRow label="Signature Status" value={signatureStatus} />
        <InfoRow label="Wallet Address" value={chainResult?.owner || "-"} mono />
        <InfoRow label="Timestamp" value={formatTimestamp(chainResult?.timestamp)} />
        <InfoRow label="Input Hash" value={comparedInputHash} mono />
        <InfoRow label="Metadata Hash" value={metadataHash} mono />
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Hash Comparison</p>
        <p className="mt-1 text-sm text-gray-200">
          {details.hashMatches ? "Input hash matches metadata hash." : "Input hash differs from metadata hash."}
        </p>
      </div>

      {(fileName || hash) && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Verification Input</p>
          {fileName ? <p className="mt-1 text-sm text-gray-200">{fileName}</p> : null}
          {hash ? <p className="mt-2 break-all font-mono text-xs text-gray-300">{hash}</p> : null}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onOpenProof}>
          Detailed Proof
        </Button>
        {chainResult?.txHash ? (
          <a
            href={buildTxUrl(explorerBaseUrl, chainResult.txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-glow-violet transition hover:brightness-110"
          >
            View on Polygonscan
            <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
    </section>
  );
}
