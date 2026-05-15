/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Check, RefreshCw, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getWorkflowDocuments, mutateWorkflowDocument } from "../services/backendApiService";
import { formatTimestamp } from "../utils/format";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";

export default function ApprovalQueue() {
  const { session, actor } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingDocs, setPendingDocs] = useState([]);
  const [reasonByDoc, setReasonByDoc] = useState({});

  const organizationId = actor?.profile?.organization_id || "";

  async function loadQueue() {
    if (!session?.accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const payload = await getWorkflowDocuments(session.accessToken, {
        mode: "pending_queue",
        organization_id: organizationId,
        limit: 100,
      });
      setPendingDocs(payload?.data || []);
    } catch (error) {
      toast.error(error?.message || "Failed to load approval queue.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, session?.accessToken]);

  async function runDecision(documentId, action) {
    if (isMutating || !session?.accessToken) {
      return;
    }

    const reason = (reasonByDoc[documentId] || "").trim();
    if ((action === "reject" || action === "revoke") && !reason) {
      toast.error("Reason is required.");
      return;
    }

    setIsMutating(true);
    try {
      await mutateWorkflowDocument(session.accessToken, {
        action,
        document_id: documentId,
        reason,
      });
      toast.success(`Document ${action}d successfully.`);
      await loadQueue();
    } catch (error) {
      toast.error(error?.message || `Failed to ${action} document.`);
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
              Document Approval Queue
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Review pending submissions, issue approvals, and attach authoritative signatures.
            </p>
          </div>
          <Button variant="secondary" onClick={loadQueue} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {!isLoading && !pendingDocs.length ? (
          <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            Queue is clear. No pending submissions found.
          </div>
        ) : null}

        {!isLoading && pendingDocs.length ? (
          <div className="space-y-3">
            {pendingDocs.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-100">{doc.doc_type || "General"}</p>
                    <p className="mt-1 text-xs text-gray-400">Submitted: {formatTimestamp(doc.submitted_at || doc.updated_at)}</p>
                    <p className="mt-2 break-all font-mono text-xs text-gray-500">{doc.hash}</p>
                  </div>
                  <span className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                    Pending
                  </span>
                </div>

                <label className="mt-3 block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-gray-400">Reason (required for reject/revoke)</span>
                  <textarea
                    value={reasonByDoc[doc.id] || ""}
                    onChange={(event) =>
                      setReasonByDoc((current) => ({
                        ...current,
                        [doc.id]: event.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="Optional note for approval, required for rejection."
                    className="w-full resize-none rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-300/70"
                  />
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => runDecision(doc.id, "approve")} disabled={isMutating}>
                    <Check size={14} />
                    Approve + Sign
                  </Button>
                  <Button variant="danger" onClick={() => runDecision(doc.id, "reject")} disabled={isMutating}>
                    <X size={14} />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
