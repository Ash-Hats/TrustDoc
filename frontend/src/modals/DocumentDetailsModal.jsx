import { Copy, ExternalLink, X } from "lucide-react";
import Button from "../components/ui/Button";
import { downloadJsonFile } from "../services/documentService";
import { formatTimestamp } from "../utils/format";
import { buildTxUrl } from "../utils/explorer";

export default function DocumentDetailsModal({
  document,
  metadata,
  isMetadataLoading,
  explorerBaseUrl,
  onClose,
  onCopy,
}) {
  if (!document) {
    return null;
  }

  function handleDownloadMetadata() {
    const payload = {
      document,
      metadata,
    };
    const base = document.hash?.replace("0x", "").slice(0, 10) || "document";
    downloadJsonFile(payload, `trustdoc-${base}-metadata.json`);
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/65 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#1a1f2e]/95 p-6 shadow-elevated">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-gray-100">Document Proof Details</h3>
            <p className="mt-1 text-sm text-gray-400">Blockchain and IPFS metadata summary.</p>
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Detail label="Type" value={document.docType} />
          <Detail label="Issuer" value={document.issuedBy || "Unknown"} />
          <Detail label="Owner" value={document.owner} mono className="sm:col-span-2" />
          <Detail label="Hash" value={document.hash} mono className="sm:col-span-2" />
          <Detail label="Timestamp" value={formatTimestamp(document.timestamp)} />
          <Detail label="Status" value={document.revoked ? "Revoked" : "Verified"} />
          <Detail label="Transaction" value={document.txHash || "-"} mono className="sm:col-span-2" />
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Metadata</p>
          {isMetadataLoading ? (
            <p className="mt-2 text-sm text-gray-300">Loading metadata...</p>
          ) : metadata ? (
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[#0f1117]/80 p-3 text-xs text-gray-300">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          ) : (
            <p className="mt-2 text-sm text-gray-400">Metadata unavailable.</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onCopy(document.hash, "Hash")}>
            <Copy size={14} />
            Copy Hash
          </Button>
          {document.txHash ? (
            <Button
              variant="secondary"
              onClick={() => onCopy(document.txHash, "Transaction hash")}
            >
              <Copy size={14} />
              Copy Tx
            </Button>
          ) : null}
          {document.txHash ? (
              <a
              href={buildTxUrl(explorerBaseUrl, document.txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-glow-violet transition hover:brightness-110"
            >
              Open Explorer
              <ExternalLink size={14} />
            </a>
          ) : null}
          <Button variant="cyan" onClick={handleDownloadMetadata}>
            Download Metadata
          </Button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false, className = "" }) {
  return (
    <div className={["rounded-xl border border-white/10 bg-white/[0.04] p-3", className].join(" ")}>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={["mt-1 text-sm text-gray-200", mono ? "break-all font-mono text-xs" : ""].join(" ")}>
        {value || "-"}
      </p>
    </div>
  );
}
