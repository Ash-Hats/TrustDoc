/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Download, RefreshCw, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getAuditLogs, getAuditLogsCsv } from "../services/backendApiService";
import { formatTimestamp } from "../utils/format";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";

function downloadTextAsFile(content, fileName, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function AuditLogs() {
  const { session, actor, hasRole } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const [status, setStatus] = useState("all");

  const organizationId = actor?.profile?.organization_id || "";
  const isSuperAdmin = hasRole("super_admin");

  async function loadLogs() {
    if (!session?.accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const payload = await getAuditLogs(session.accessToken, {
        organization_id: isSuperAdmin ? "" : organizationId,
        search: q.trim() || "",
        action: action === "all" ? "" : action,
        status: status === "all" ? "" : status,
        limit: 200,
      });
      setRows(payload?.data || []);
    } catch (error) {
      toast.error(error?.message || "Failed to load audit logs.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, isSuperAdmin, session?.accessToken]);

  const distinctActions = useMemo(
    () => Array.from(new Set(rows.map((item) => item.action).filter(Boolean))).sort(),
    [rows]
  );

  async function exportCsv() {
    if (!session?.accessToken) {
      return;
    }
    try {
      const csv = await getAuditLogsCsv(session.accessToken, {
        organization_id: isSuperAdmin ? "" : organizationId,
        search: q.trim() || "",
        action: action === "all" ? "" : action,
        status: status === "all" ? "" : status,
        limit: 1000,
      });
      downloadTextAsFile(csv, "trustdoc-audit-logs.csv", "text/csv;charset=utf-8");
      toast.success("Audit logs exported.");
    } catch (error) {
      toast.error(error?.message || "Export failed.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
              Audit Logs
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Immutable event trail for authentication, approvals, role changes, and document access.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadLogs} disabled={isLoading}>
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={14} />
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2">
            <Search size={14} className="text-gray-400" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search action/resource/metadata..."
              className="w-full bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
            />
          </label>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 outline-none"
          >
            <option value="all">All Actions</option>
            {distinctActions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 outline-none"
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
          <Button onClick={loadLogs}>Apply</Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}

        {!isLoading && !rows.length ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-400">
            No logs found with the selected filters.
          </div>
        ) : null}

        {!isLoading && rows.length ? (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-100">{row.action}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {row.resource_type}:{row.resource_id || "-"} | {row.role_key || "unknown-role"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{formatTimestamp(row.created_at)}</p>
                  </div>
                  <span
                    className={[
                      "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                      row.status === "success"
                        ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-200"
                        : "border-rose-300/30 bg-rose-500/10 text-rose-200",
                    ].join(" ")}
                  >
                    {row.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
