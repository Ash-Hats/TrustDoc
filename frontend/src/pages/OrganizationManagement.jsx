/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  createOrganization,
  getOrganizations,
  updateOrganization,
} from "../services/backendApiService";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";

const STATUS_OPTIONS = ["active", "pending", "suspended", "archived"];

export default function OrganizationManagement() {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    email_domain: "",
    logo_url: "",
  });

  async function loadOrganizations() {
    if (!session?.accessToken) {
      return;
    }
    setIsLoading(true);
    try {
      const payload = await getOrganizations(session.accessToken, {
        limit: 300,
        page: 1,
      });
      setRows(payload?.data || []);
    } catch (error) {
      toast.error(error?.message || "Failed to load organizations.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  async function handleCreate() {
    if (isSaving || !session?.accessToken) {
      return;
    }

    if (!form.name.trim()) {
      toast.error("Organization name is required.");
      return;
    }

    setIsSaving(true);
    try {
      await createOrganization(session.accessToken, form);
      toast.success("Organization created.");
      setForm({
        name: "",
        slug: "",
        email_domain: "",
        logo_url: "",
      });
      await loadOrganizations();
    } catch (error) {
      toast.error(error?.message || "Failed to create organization.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(organizationId, status) {
    if (!session?.accessToken || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      await updateOrganization(session.accessToken, {
        organization_id: organizationId,
        status,
      });
      toast.success("Organization updated.");
      await loadOrganizations();
    } catch (error) {
      toast.error(error?.message || "Failed to update organization.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
              Organization Management
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Create and govern colleges/universities with centralized lifecycle controls.
            </p>
          </div>
          <Button variant="secondary" onClick={loadOrganizations} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-100">Create Organization</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Organization name"
            className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-300/70"
          />
          <input
            value={form.slug}
            onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
            placeholder="organization-slug"
            className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-300/70"
          />
          <input
            value={form.email_domain}
            onChange={(event) => setForm((current) => ({ ...current, email_domain: event.target.value }))}
            placeholder="college.edu"
            className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-300/70"
          />
          <input
            value={form.logo_url}
            onChange={(event) => setForm((current) => ({ ...current, logo_url: event.target.value }))}
            placeholder="https://..."
            className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-300/70"
          />
        </div>
        <Button onClick={handleCreate} disabled={isSaving}>
          <Plus size={14} />
          Create Organization
        </Button>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-100">Organizations</h3>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}

        {!isLoading && !rows.length ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-400">
            No organizations found.
          </div>
        ) : null}

        {!isLoading &&
          rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-100">{row.name}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {row.slug} {row.email_domain ? `| ${row.email_domain}` : ""}
                  </p>
                </div>
                <select
                  value={row.status}
                  onChange={(event) => handleStatusChange(row.id, event.target.value)}
                  className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-xs text-gray-100 outline-none focus:border-violet-300/70"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
      </Card>
    </section>
  );
}
