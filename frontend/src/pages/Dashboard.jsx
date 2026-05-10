import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAppContext } from "../context/AppContext";
import { fetchMetadata } from "../services/documentService";
import { formatRelativeTime, formatTimestamp } from "../utils/format";
import { buildTxUrl } from "../utils/explorer";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  applyDocumentFilters,
  enrichDocuments,
  paginateDocuments,
  summarizeDocuments,
} from "../utils/documentFilters";
import { useDocumentFilters } from "../hooks/useDocumentFilters";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import SelectField from "../components/ui/SelectField";
import Pagination from "../components/ui/Pagination";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import StatusBadge from "../components/ui/StatusBadge";
import DocumentDetailsModal from "../modals/DocumentDetailsModal";

const PAGE_SIZE = 8;

function AnimatedCounter({ value }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    const to = value;
    if (from === to) {
      return;
    }

    const durationMs = 420;
    const startAt = performance.now();

    let frameId = 0;
    const animate = (now) => {
      const progress = Math.min(1, (now - startAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (to - from) * eased);
      setDisplayValue(next);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        previous.current = to;
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return <>{displayValue.toLocaleString()}</>;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  glow,
  active = false,
  isLoading = false,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group text-left",
        "rounded-2xl border border-white/10 bg-[#1a1f2e]/75 p-5 shadow-glass backdrop-blur-md",
        "transition-all duration-300 hover:-translate-y-1",
        active ? "border-violet-300/45 shadow-glow-violet" : glow,
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-gray-400">{title}</p>
          <p className="mt-3 text-2xl font-bold text-gray-100">
            {isLoading ? <span className="animate-pulse text-gray-500">...</span> : <AnimatedCounter value={value} />}
          </p>
          <p className="mt-2 text-xs text-gray-400">{subtitle}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-gray-100 transition group-hover:scale-105">
          <Icon size={19} />
        </span>
      </div>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    documents,
    isDocumentsLoading,
    lastSyncedAt,
    syncState,
    pendingTransactions,
    verificationHistory,
    settings,
    refreshDocuments,
  } = useAppContext();
  const { filters, updateFilters, setPage, buildQueryString } = useDocumentFilters();

  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedMetadata, setSelectedMetadata] = useState(null);
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [activeCardNavigation, setActiveCardNavigation] = useState("");
  const metadataRequestId = useRef(0);
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

  const stats = useMemo(() => summarizeDocuments(enrichedDocuments), [enrichedDocuments]);

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

  async function handleOpenDetails(document) {
    setSelectedDocument(document);
    setSelectedMetadata(null);
    setIsMetadataLoading(Boolean(document?.gatewayUrl));

    if (!document?.gatewayUrl) {
      return;
    }

    const requestId = Date.now();
    metadataRequestId.current = requestId;

    try {
      const metadata = await fetchMetadata(document.gatewayUrl);

      if (metadataRequestId.current === requestId) {
        setSelectedMetadata(metadata);
      }
    } catch {
      if (metadataRequestId.current === requestId) {
        setSelectedMetadata(null);
      }
    } finally {
      if (metadataRequestId.current === requestId) {
        setIsMetadataLoading(false);
      }
    }
  }

  function goToDocumentsWithStatus(status) {
    setActiveCardNavigation(status || "all");
    const queryString = buildQueryString({
      status: status || "all",
      page: 1,
    });

    navigate(`/my-documents${queryString}`);
  }

  useEffect(() => {
    if (!activeCardNavigation) {
      return undefined;
    }

    const timer = setTimeout(() => setActiveCardNavigation(""), 650);
    return () => clearTimeout(timer);
  }, [activeCardNavigation]);

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
              TrustDoc Dashboard
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Live blockchain insights, verification metrics, and user-scoped document records.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge
              type={
                syncState.realtimeStatus === "connected"
                  ? "connected"
                  : syncState.realtimeStatus === "error"
                    ? "wrong-network"
                    : "pending"
              }
              label={`Realtime: ${syncState.realtimeStatus}`}
            />
            <StatusBadge
              type="pending"
              label={
                lastSyncedAt
                  ? `Synced ${formatRelativeTime(Math.floor(lastSyncedAt / 1000))}`
                  : "Not Synced"
              }
            />
            <Button variant="cyan" onClick={() => refreshDocuments()} disabled={isDocumentsLoading}>
              <RefreshCw size={14} className={isDocumentsLoading ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Documents"
          value={stats.total}
          subtitle="Click to view all records"
          icon={FileText}
          glow="hover:shadow-glow-violet"
          active={filters.status === "all"}
          isLoading={isDocumentsLoading}
          onClick={() => goToDocumentsWithStatus("all")}
        />
        <StatCard
          title="Verified"
          value={stats.verified}
          subtitle="Integrity passed"
          icon={CheckCircle2}
          glow="hover:shadow-glow-emerald"
          active={filters.status === "verified"}
          isLoading={isDocumentsLoading || activeCardNavigation === "verified"}
          onClick={() => goToDocumentsWithStatus("verified")}
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          subtitle="Awaiting confirmation"
          icon={Timer}
          glow="hover:shadow-glow-cyan"
          active={filters.status === "pending"}
          isLoading={isDocumentsLoading || activeCardNavigation === "pending"}
          onClick={() => goToDocumentsWithStatus("pending")}
        />
        <StatCard
          title="Tampered"
          value={stats.tampered}
          subtitle="Fraud or revoked signals"
          icon={ShieldAlert}
          glow="hover:shadow-glow-rose"
          active={filters.status === "tampered"}
          isLoading={isDocumentsLoading || activeCardNavigation === "tampered"}
          onClick={() => goToDocumentsWithStatus("tampered")}
        />
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={filters.q}
            onChange={(value) => updateFilters({ q: value })}
            placeholder="Search by hash, issuer, wallet, type..."
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
            className="min-w-[145px]"
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
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : null}

        {!isDocumentsLoading && !filteredDocuments.length ? (
          <EmptyState
            title="No documents found"
            description="Try adjusting filters or register a document to populate this table."
          />
        ) : null}

        {filteredDocuments.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm text-gray-300">
                <thead className="bg-white/5 text-xs uppercase tracking-[0.12em] text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Issuer</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Hash</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paging.items.map((doc) => (
                    <tr key={doc.hash} className="border-t border-white/10 transition hover:bg-white/[0.04]">
                      <td className="px-4 py-3">{doc.docType}</td>
                      <td className="px-4 py-3">{doc.issuedBy || "Unknown"}</td>
                      <td className="px-4 py-3">
                        <p className="max-w-[170px] truncate font-mono text-xs text-gray-400">{doc.owner || "-"}</p>
                      </td>
                      <td className="px-4 py-3">{formatTimestamp(doc.timestamp)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          type={
                            doc.derivedStatus === "tampered"
                              ? "tampered"
                              : doc.derivedStatus === "pending"
                                ? "pending"
                                : "verified"
                          }
                          label={
                            doc.derivedStatus === "tampered"
                              ? "Tampered"
                              : doc.derivedStatus === "pending"
                                ? "Pending"
                                : "Verified"
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-[220px] truncate font-mono text-xs text-gray-400">{doc.hash}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            variant="secondary"
                            className="px-2.5 py-1.5 text-xs"
                            onClick={() => handleCopy(doc.hash, "Hash")}
                          >
                            <Copy size={13} />
                            Copy
                          </Button>
                          {doc.txHash ? (
                            <a
                              href={buildTxUrl(settings.explorerBaseUrl, doc.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
                            >
                              Explorer
                              <ExternalLink size={13} />
                            </a>
                          ) : null}
                          <Button className="px-2.5 py-1.5 text-xs" onClick={() => handleOpenDetails(doc)}>
                            View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 lg:hidden">
              {paging.items.map((doc) => (
                <Card key={doc.hash} className="bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-100">{doc.docType}</p>
                      <p className="text-xs text-gray-400">{doc.issuedBy || "Unknown"}</p>
                    </div>
                    <StatusBadge
                      type={
                        doc.derivedStatus === "tampered"
                          ? "tampered"
                          : doc.derivedStatus === "pending"
                            ? "pending"
                            : "verified"
                      }
                      label={
                        doc.derivedStatus === "tampered"
                          ? "Tampered"
                          : doc.derivedStatus === "pending"
                            ? "Pending"
                            : "Verified"
                      }
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-400">{formatTimestamp(doc.timestamp)}</p>
                  <p className="mt-2 break-all font-mono text-xs text-gray-500">{doc.hash}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={() => handleCopy(doc.hash, "Hash")}
                    >
                      Copy
                    </Button>
                    <Button className="px-3 py-2 text-xs" onClick={() => handleOpenDetails(doc)}>
                      View
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

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
    </section>
  );
}
