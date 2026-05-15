/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  getNotifications,
  getUsers,
  getWorkflowDocuments,
} from "../services/backendApiService";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";

function MetricCard({ title, value, hint, icon: Icon, tone = "cyan" }) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300/30 bg-amber-500/10 text-amber-200"
      : tone === "emerald"
        ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-200"
        : "border-cyan-300/30 bg-cyan-500/10 text-cyan-200";

  return (
    <Card className="bg-white/[0.04]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-100">{value}</p>
          <p className="mt-1 text-xs text-gray-400">{hint}</p>
        </div>
        <span className={["inline-flex h-10 w-10 items-center justify-center rounded-xl border", toneClass].join(" ")}>
          <Icon size={18} />
        </span>
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const { session, actor } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState({
    pending: 0,
    totalUsers: 0,
    unread: 0,
  });
  const [pendingItems, setPendingItems] = useState([]);

  const organizationId = actor?.profile?.organization_id || "";

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    let disposed = false;
    setIsLoading(true);

    void Promise.all([
      getWorkflowDocuments(session.accessToken, {
        mode: "pending_queue",
        organization_id: organizationId,
        limit: 6,
      }),
      getUsers(session.accessToken, {
        organization_id: organizationId,
        limit: 1,
        page: 1,
      }),
      getNotifications(session.accessToken, {
        unread_only: true,
        limit: 1,
      }),
    ])
      .then(([docsPayload, usersPayload, notificationsPayload]) => {
        if (disposed) {
          return;
        }

        setPendingItems(docsPayload?.data || []);
        setSummary({
          pending: (docsPayload?.data || []).length,
          totalUsers: (usersPayload?.data || []).length,
          unread: Number(notificationsPayload?.unreadCount || 0),
        });
      })
      .catch((error) => {
        if (!disposed) {
          toast.error(error?.message || "Failed to load admin dashboard.");
        }
      })
      .finally(() => {
        if (!disposed) {
          setIsLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [organizationId, session?.accessToken]);

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <Card>
        <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
          Organization Admin Dashboard
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Centralized approval queue, user controls, and compliance visibility for your organization.
        </p>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard title="Pending Reviews" value={summary.pending} hint="Documents awaiting decision" icon={ClipboardCheck} />
          <MetricCard title="Users in Scope" value={summary.totalUsers} hint="Managed organization users" icon={Users} tone="emerald" />
          <MetricCard title="Unread Alerts" value={summary.unread} hint="Notifications requiring attention" icon={AlertTriangle} tone="amber" />
        </div>
      )}

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-100">Pending Approval Queue</h3>
          <Link to="/admin/approvals">
            <Button variant="secondary">Open Full Queue</Button>
          </Link>
        </div>

        {!pendingItems.length ? (
          <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              No pending documents right now.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-sm font-semibold text-gray-100">{item.doc_type || "General"}</p>
                <p className="mt-1 break-all font-mono text-xs text-gray-400">{item.hash}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
