/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Building2, Globe, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getAuditLogs, getOrganizations, getUsers } from "../services/backendApiService";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";

function Stat({ title, value, icon: Icon, tone = "cyan" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-200"
      : tone === "amber"
        ? "border-amber-300/30 bg-amber-500/10 text-amber-200"
        : "border-cyan-300/30 bg-cyan-500/10 text-cyan-200";

  return (
    <Card className="bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-100">{value}</p>
        </div>
        <span className={["inline-flex h-10 w-10 items-center justify-center rounded-xl border", toneClass].join(" ")}>
          <Icon size={18} />
        </span>
      </div>
    </Card>
  );
}

export default function SuperAdminDashboard() {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    organizations: 0,
    users: 0,
    logs: 0,
    suspendedOrgs: 0,
  });

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    let disposed = false;
    setIsLoading(true);
    void Promise.all([
      getOrganizations(session.accessToken, { limit: 300, page: 1 }),
      getUsers(session.accessToken, { organization_id: "all", limit: 300 }),
      getAuditLogs(session.accessToken, { limit: 200 }),
    ])
      .then(([orgPayload, usersPayload, logsPayload]) => {
        if (disposed) {
          return;
        }

        const organizations = orgPayload?.data || [];
        const suspendedOrgs = organizations.filter((item) => item.status === "suspended").length;
        setStats({
          organizations: organizations.length,
          users: (usersPayload?.data || []).length,
          logs: (logsPayload?.data || []).length,
          suspendedOrgs,
        });
      })
      .catch((error) => {
        if (!disposed) {
          toast.error(error?.message || "Failed to load super admin dashboard.");
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
  }, [session?.accessToken]);

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <Card>
        <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
          Super Admin Control Center
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Global governance of organizations, role approvals, and security telemetry across the platform.
        </p>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="Organizations" value={stats.organizations} icon={Building2} />
          <Stat title="Platform Users" value={stats.users} icon={Users} tone="emerald" />
          <Stat title="Audit Events" value={stats.logs} icon={ShieldCheck} />
          <Stat title="Suspended Orgs" value={stats.suspendedOrgs} icon={Globe} tone="amber" />
        </div>
      )}
    </section>
  );
}
