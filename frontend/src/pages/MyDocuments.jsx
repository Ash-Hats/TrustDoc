import { useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  Globe,
  Grid3X3,
  List,
  Lock,
  QrCode,
  ScanSearch,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { useAppContext } from "../context/AppContext";
import { downloadJsonFile, fetchMetadata } from "../services/documentService";
import { formatTimestamp } from "../utils/format";
import { buildTxUrl } from "../utils/explorer";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  applyDocumentFilters,
  enrichDocuments,
  paginateDocuments,
} from "../utils/documentFilters";
import { useDocumentFilters } from "../hooks/useDocumentFilters";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import SelectField from "../components/ui/SelectField";
import Pagination from "../components/ui/Pagination";
import EmptyState from "../components/ui/EmptyState";
import StatusBadge from "../components/ui/StatusBadge";
import Skeleton from "../components/ui/Skeleton";
import DocumentDetailsModal from "../modals/DocumentDetailsModal";

const PAGE_SIZE = 8;

function statusBadgeProps(document) {
  if (document.derivedStatus === "pending") {
    return { type: "pending", label: "Pending" };
  }
  if (document.derivedStatus === "tampered") {
    return { type: "tampered", label: "Tampered" };
  }
  return { type: "verified", label: "Verified" };
}

function getPrivacyMeta(level) {
  const normalized = String(level || "private").toLowerCase();

  if (normalized === "public") {
    return {
      label: "Public",
      icon: Globe,
      className: "border-emerald-300/30 bg-emerald-500/10 text-emerald-200",
    };
  }

  if (normalized === "shared") {
    return {
      label: "Shared",
      icon: Users,
      className: "border-cyan-300/30 bg-cyan-500/10 text-cyan-200",
    };
  }

  return {
    label: "Private",
    icon: Lock,
    className: "border-violet-300/30 bg-violet-500/10 text-violet-200",
  };
}

export default function MyDocuments() {
  const {
    documents,
    pendingTransactions,
    verificationHistory,
    settings,
    isDocumentsLoading,
    updateDocumentAccess,
  } =
    useAppContext();
  const { filters, updateFilters, setPage } = useDocumentFilters();

  const [viewMode, setViewMode] = useState("grid");
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedMetadata, setSelectedMetadata] = useState(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [qrDocument, setQrDocument] = useState(null);
  const [accessEditor, setAccessEditor] = useState(null);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const requestRef = useRef(0);
  const debouncedQuery = useDebouncedValue(filters.q, 250);

  const enrichedDocuments = useMemo(
    () => enrichDocuments(documents, pendingTransactions, verificationHistory),
    [documents, pendingTransactions, verificationHistory]
  );

  const issuers = useMemo(() => {
    const source = enrichedDocuments.map((item) => item.issuedBy || "Unknown");
    return Array.from(new Set(source)).sort((left, right) => left.localeCompare(right));
  }, [enrichedDocuments]);

  const wallets = useMemo(() => {
    const source = enrichedDocuments.map((item) => item.owner || "").filter(Boolean);
    return Array.from(new Set(source)).sort((left, right) => left.localeCompare(right));
  }, [enrichedDocuments]);

  const docTypes = useMemo(() => {
    const source = enrichedDocuments.map((item) => item.docType || "General");
    return Array.from(new Set(source)).sort((left, right) => left.localeCompare(right));
  }, [enrichedDocuments]);

  const filteredDocuments = useMemo(
    () =>
      applyDocumentFilters(enrichedDocuments, {
        ...filters,
        q: debouncedQuery,
      }),
    [debouncedQuery, enrichedDocuments, filters]
  );

  const paging = useMemo(
    () => paginateDocuments(filteredDocuments, filters.page, PAGE_SIZE),
    [filteredDocuments, filters.page]
  );

  async function handleCopy(value, label) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  }

  async function handlePreview(document) {
    setSelectedDocument(document);
    setSelectedMetadata(null);
    setIsMetadataLoading(Boolean(document?.gatewayUrl));

    if (!document?.gatewayUrl) {
      return;
    }

    requestRef.current += 1;
    const requestId = requestRef.current;

    try {
      const metadata = await fetchMetadata(document.gatewayUrl);
      if (requestRef.current === requestId) {
        setSelectedMetadata(metadata);
      }
    } catch {
      if (requestRef.current === requestId) {
        setSelectedMetadata(null);
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsMetadataLoading(false);
      }
    }
  }

  function handleDownloadMetadata(document) {
    const payload = {
      ...document,
      exportedAt: new Date().toISOString(),
    };

    downloadJsonFile(payload, `trustdoc-${document.hash.slice(2, 12)}-metadata.json`);
  }

  function handleExportProof(document) {
    const proof = {
      type: "trustdoc-verification-proof",
      exportedAt: new Date().toISOString(),
      document,
      verifyLink:
        typeof window !== "undefined"
          ? `${window.location.origin}/verify?hash=${document.hash}`
          : "",
    };

    downloadJsonFile(proof, `trustdoc-${document.hash.slice(2, 12)}-proof.json`);
  }

  function handleOpenAccessEditor(document) {
    setAccessEditor({
      hash: document.hash,
      privacyLevel: document.privacyLevel || "private",
      sharedWallets: (document.sharedWithWallets || []).join(", "),
      fileName: document.fileName || "",
      fileSize: Number(document.fileSize || 0),
      fileType: document.fileType || "",
    });
  }

  async function handleSaveAccess() {
    if (!accessEditor || isSavingAccess) {
      return;
    }

    setIsSavingAccess(true);
    try {
      await updateDocumentAccess({
        hash: accessEditor.hash,
        privacyLevel: accessEditor.privacyLevel,
        sharedWithWallets: accessEditor.sharedWallets,
        fileName: accessEditor.fileName,
        fileSize: accessEditor.fileSize,
        fileType: accessEditor.fileType,
      });
      toast.success("Document privacy updated.");
      setAccessEditor(null);
    } catch (error) {
      toast.error(error?.message || "Failed to update document privacy.");
    } finally {
      setIsSavingAccess(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
              My Documents
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              User-isolated records with realtime filtering, proof exports, and direct verification actions.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-white/15 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={[
                "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                viewMode === "grid" ? "bg-violet-500/25 text-violet-200" : "text-gray-300",
              ].join(" ")}
            >
              <Grid3X3 size={14} />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={[
                "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                viewMode === "list" ? "bg-violet-500/25 text-violet-200" : "text-gray-300",
              ].join(" ")}
            >
              <List size={14} />
              List
            </button>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={filters.q}
            onChange={(value) => updateFilters({ q: value })}
            placeholder="Search by hash, issuer, wallet or type..."
            className="min-w-[220px] flex-1"
          />
          <SelectField
            value={filters.status}
            onChange={(value) => updateFilters({ status: value })}
            options={[
              { value: "all", label: "All Status" },
              { value: "verified", label: "Verified" },
              { value: "pending", label: "Pending Tx" },
              { value: "tampered", label: "Tampered/Fraud" },
              { value: "revoked", label: "Revoked" },
            ]}
            className="min-w-[140px]"
          />
          <SelectField
            value={filters.issuer}
            onChange={(value) => updateFilters({ issuer: value })}
            options={[
              { value: "all", label: "All Issuers" },
              ...issuers.map((issuer) => ({ value: issuer.toLowerCase(), label: issuer })),
            ]}
            className="min-w-[145px]"
          />
          <SelectField
            value={filters.wallet}
            onChange={(value) => updateFilters({ wallet: value })}
            options={[
              { value: "all", label: "All Wallets" },
              ...wallets.map((walletAddress) => ({ value: walletAddress.toLowerCase(), label: walletAddress })),
            ]}
            className="min-w-[145px]"
          />
          <SelectField
            value={filters.type}
            onChange={(value) => updateFilters({ type: value })}
            options={[
              { value: "all", label: "All Types" },
              ...docTypes.map((docType) => ({ value: docType.toLowerCase(), label: docType })),
            ]}
            className="min-w-[135px]"
          />
          <SelectField
            value={filters.sort}
            onChange={(value) => updateFilters({ sort: value }, { resetPage: false })}
            options={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "type_asc", label: "Type A-Z" },
              { value: "type_desc", label: "Type Z-A" },
              { value: "issuer_asc", label: "Issuer A-Z" },
              { value: "issuer_desc", label: "Issuer Z-A" },
            ]}
            className="min-w-[130px]"
          />
        </div>

        {isDocumentsLoading && !enrichedDocuments.length ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {!isDocumentsLoading && !filteredDocuments.length ? (
          <EmptyState
            title="No documents available"
            description="Adjust filters or register a document to build your proof records."
          />
        ) : null}

        {filteredDocuments.length ? (
          <>
            {viewMode === "grid" ? (
              <div className="grid gap-4 md:grid-cols-2">
                {paging.items.map((doc) => {
                  const status = statusBadgeProps(doc);
                  const privacyMeta = getPrivacyMeta(doc.privacyLevel);
                  const PrivacyIcon = privacyMeta.icon;
                  return (
                    <Card key={doc.hash} className="bg-white/[0.04]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-gray-100">{doc.docType}</h3>
                          <p className="mt-1 text-xs text-gray-400">{doc.issuedBy || "Unknown issuer"}</p>
                        </div>
                        <StatusBadge type={status.type} label={status.label} />
                      </div>
                      <div
                        className={[
                          "mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                          privacyMeta.className,
                        ].join(" ")}
                      >
                        <PrivacyIcon size={11} />
                        {privacyMeta.label}
                      </div>
                      <p className="mt-3 text-xs text-gray-400">{formatTimestamp(doc.timestamp)}</p>
                      <p className="mt-2 break-all font-mono text-xs text-gray-500">{doc.hash}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => handlePreview(doc)}>
                          <ScanSearch size={13} />
                          Preview
                        </Button>
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => handleCopy(doc.hash, "Hash")}>
                          <Copy size={13} />
                          Copy
                        </Button>
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setQrDocument(doc)}>
                          <QrCode size={13} />
                          QR
                        </Button>
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => handleOpenAccessEditor(doc)}>
                          Access
                        </Button>
                        <Link to={`/verify?hash=${doc.hash}`}>
                          <Button variant="secondary" className="px-3 py-2 text-xs">
                            <ShieldCheck size={13} />
                            Verify
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {paging.items.map((doc) => {
                  const status = statusBadgeProps(doc);
                  const privacyMeta = getPrivacyMeta(doc.privacyLevel);
                  const PrivacyIcon = privacyMeta.icon;
                  return (
                    <div
                      key={doc.hash}
                      className="rounded-xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.06]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-100">{doc.docType}</p>
                          <p className="text-xs text-gray-400">{doc.issuedBy || "Unknown issuer"}</p>
                          <div
                            className={[
                              "mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                              privacyMeta.className,
                            ].join(" ")}
                          >
                            <PrivacyIcon size={11} />
                            {privacyMeta.label}
                          </div>
                        </div>
                        <StatusBadge type={status.type} label={status.label} />
                      </div>
                      <p className="mt-2 text-xs text-gray-400">{formatTimestamp(doc.timestamp)}</p>
                      <p className="mt-2 break-all font-mono text-xs text-gray-500">{doc.hash}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => handlePreview(doc)}>
                          Preview
                        </Button>
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => handleCopy(doc.hash, "Hash")}>
                          Copy
                        </Button>
                        {doc.txHash ? (
                          <a
                            href={buildTxUrl(settings.explorerBaseUrl, doc.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
                          >
                            Explorer
                            <ExternalLink size={13} />
                          </a>
                        ) : null}
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => handleDownloadMetadata(doc)}>
                          <Download size={13} />
                          Metadata
                        </Button>
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => handleOpenAccessEditor(doc)}>
                          Access
                        </Button>
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => handleExportProof(doc)}>
                          Export Proof
                        </Button>
                        <Link to={`/verify?hash=${doc.hash}`}>
                          <Button variant="secondary" className="px-3 py-2 text-xs">
                            Verify
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Pagination page={paging.safePage} totalPages={paging.totalPages} onChange={setPage} />
          </>
        ) : null}
      </Card>

      <DocumentDetailsModal
        document={selectedDocument}
        metadata={selectedMetadata}
        isMetadataLoading={isMetadataLoading}
        explorerBaseUrl={settings.explorerBaseUrl}
        onClose={() => {
          setSelectedDocument(null);
          setSelectedMetadata(null);
          setIsMetadataLoading(false);
        }}
        onCopy={handleCopy}
      />

      {accessEditor ? (
        <div className="fixed inset-0 z-[66] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg space-y-4">
            <h3 className="text-lg font-semibold text-gray-100">Document Access Control</h3>
            <p className="text-xs text-gray-400">
              Set privacy level and optional shared wallets for this document hash.
            </p>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-gray-400">Privacy Level</span>
              <select
                value={accessEditor.privacyLevel}
                onChange={(event) =>
                  setAccessEditor((current) =>
                    current
                      ? {
                          ...current,
                          privacyLevel: event.target.value,
                        }
                      : current
                  )
                }
                className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-300/70"
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
                <option value="public">Public</option>
              </select>
            </label>

            {accessEditor.privacyLevel === "shared" ? (
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-gray-400">
                  Shared Wallets (comma separated)
                </span>
                <textarea
                  value={accessEditor.sharedWallets}
                  onChange={(event) =>
                    setAccessEditor((current) =>
                      current
                        ? {
                            ...current,
                            sharedWallets: event.target.value,
                          }
                        : current
                    )
                  }
                  rows={3}
                  placeholder="0xabc..., 0xdef..."
                  className="w-full resize-none rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-xs text-gray-100 outline-none focus:border-violet-300/70"
                />
              </label>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setAccessEditor(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveAccess} disabled={isSavingAccess}>
                {isSavingAccess ? "Saving..." : "Save Access"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {qrDocument ? (
        <div className="fixed inset-0 z-[64] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm text-center">
            <h3 className="text-lg font-semibold text-gray-100">Document Verify QR</h3>
            <p className="mt-1 text-xs text-gray-400">Share this QR for instant verification.</p>
            <div className="mt-4 inline-flex rounded-xl border border-white/10 bg-white p-3">
              <QRCode value={`${window.location.origin}/verify?hash=${qrDocument.hash}`} size={180} />
            </div>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => setQrDocument(null)}>
                Close
              </Button>
              <Button
                onClick={() =>
                  handleCopy(`${window.location.origin}/verify?hash=${qrDocument.hash}`, "Verify link")
                }
              >
                Copy Link
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
