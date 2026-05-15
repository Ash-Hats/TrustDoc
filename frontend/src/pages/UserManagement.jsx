/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Shield, UserMinus, UserPlus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getUsers, updateUserManagement } from "../services/backendApiService";
import { formatTimestamp } from "../utils/format";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";

const ROLE_OPTIONS = [
  { key: "student_user", label: "Student/User" },
  { key: "staff_uploader", label: "Staff/Uploader" },
  { key: "verifier_auditor", label: "Verifier/Auditor" },
];

export default function UserManagement() {
  const { session, actor, hasRole } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [roleChoice, setRoleChoice] = useState({});

  const isSuperAdmin = hasRole("super_admin");
  const organizationId = actor?.profile?.organization_id || "";

  async function loadUsers() {
    if (!session?.accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const payload = await getUsers(session.accessToken, {
        organization_id: isSuperAdmin ? "all" : organizationId,
        limit: 200,
      });
      setRows(payload?.data || []);
    } catch (error) {
      toast.error(error?.message || "Failed to load users.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, isSuperAdmin, session?.accessToken]);

  async function runAction(payload, successMessage) {
    if (isSaving || !session?.accessToken) {
      return;
    }
    setIsSaving(true);
    try {
      await updateUserManagement(session.accessToken, payload);
      toast.success(successMessage);
      await loadUsers();
    } catch (error) {
      toast.error(error?.message || "User operation failed.");
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
              User Management
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Manage organization members, role assignments, and account suspension controls.
            </p>
          </div>
          <Button variant="secondary" onClick={loadUsers} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}

        {!isLoading && !rows.length ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-400">
            No users found for this scope.
          </div>
        ) : null}

        {!isLoading &&
          rows.map((row) => {
            const activeRoles = (row.user_roles || [])
              .map((entry) => entry?.roles?.name || entry?.roles?.role_key || "")
              .filter(Boolean);
            const selectedRole = roleChoice[row.user_id] || "staff_uploader";

            return (
              <div key={row.user_id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-100">{row.display_name || "Unnamed User"}</p>
                    <p className="mt-1 text-xs text-gray-400">{row.email}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Joined: {formatTimestamp(row.created_at)} | Status: {row.account_status}
                    </p>
                    <p className="mt-2 text-xs text-cyan-200">
                      Roles: {activeRoles.length ? activeRoles.join(", ") : "None"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      onClick={() =>
                        runAction(
                          { action: "suspend_user", user_id: row.user_id },
                          "User suspended."
                        )
                      }
                      disabled={isSaving || row.account_status === "suspended"}
                    >
                      <UserMinus size={14} />
                      Suspend
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        runAction(
                          { action: "activate_user", user_id: row.user_id },
                          "User activated."
                        )
                      }
                      disabled={isSaving || row.account_status === "active"}
                    >
                      <UserPlus size={14} />
                      Activate
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={selectedRole}
                    onChange={(event) =>
                      setRoleChoice((current) => ({
                        ...current,
                        [row.user_id]: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-xs text-gray-100 outline-none focus:border-violet-300/70"
                  >
                    {ROLE_OPTIONS.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      runAction(
                        {
                          action: "assign_role",
                          user_id: row.user_id,
                          role_key: selectedRole,
                          organization_id: row.organization_id || organizationId,
                        },
                        "Role assigned."
                      )
                    }
                    disabled={isSaving}
                  >
                    <Shield size={14} />
                    Assign Role
                  </Button>
                </div>
              </div>
            );
          })}
      </Card>
    </section>
  );
}
