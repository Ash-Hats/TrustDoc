import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  PlugZap,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import SelectField from "../components/ui/SelectField";
import ConfirmModal from "../modals/ConfirmModal";
import { shortAddress } from "../utils/format";
import { sanitizeText } from "../utils/security";
import {
  AMOY_CHAIN_ID_HEX,
  AMOY_CHAIN_NAME,
  explainNetworkSwitchFailure,
  getManualNetworkSwitchUrl,
} from "../utils/contract";

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition",
        checked ? "bg-violet-500" : "bg-slate-600",
      ].join(" ")}
      aria-pressed={checked}
    >
      <span
        className={[
          "inline-block h-4 w-4 transform rounded-full bg-white transition",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

function SettingRow({ icon: Icon, title, description, control }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-gray-200">
          <Icon size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-100">{title}</p>
          <p className="mt-1 text-xs text-gray-400">{description}</p>
        </div>
      </div>
      <div>{control}</div>
    </div>
  );
}

export default function Settings() {
  const {
    settings,
    updateSettings,
    wallet,
    walletSessions,
    walletVerification,
    syncState,
    connectWallet,
    disconnectWallet,
    ensureSupportedNetwork,
    refreshWalletSessions,
  } = useAppContext();
  const {
    user,
    profile,
    session,
    linkWallet,
    updateAuthProfile,
    logout,
    deleteAccount,
  } = useAuth();

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [isSyncingWallet, setIsSyncingWallet] = useState(false);
  const [networkHint, setNetworkHint] = useState("");
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const resolvedDisplayName = displayName || profile?.display_name || "";

  const sessionExpiryLabel = session?.expiresAt
    ? new Date(session.expiresAt).toLocaleString()
    : "Unknown";

  async function handleWalletPermissions() {
    if (!window?.ethereum?.request) {
      toast.error("MetaMask not found.");
      return;
    }

    setIsRequestingPermissions(true);

    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      toast.success("Wallet permissions updated.");
    } catch (error) {
      const message = error?.message || "Failed to request wallet permissions.";
      toast.error(message);
    } finally {
      setIsRequestingPermissions(false);
    }
  }

  async function handleSwitchNetwork() {
    setIsSwitchingNetwork(true);
    setNetworkHint("");
    try {
      const result = await ensureSupportedNetwork();
      if (!result?.isSupported) {
        throw new Error("Wallet is not on Polygon Amoy.");
      }
      toast.success("Network switched to Polygon Amoy.");
      await refreshWalletSessions().catch(() => null);
    } catch (error) {
      const message = explainNetworkSwitchFailure(error);
      setNetworkHint(message);
      toast.error(message);
    } finally {
      setIsSwitchingNetwork(false);
    }
  }

  async function handleManualNetworkSwitch() {
    const helpUrl = getManualNetworkSwitchUrl();

    if (!window?.ethereum?.request) {
      window.open(helpUrl, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: AMOY_CHAIN_ID_HEX }],
      });
      setNetworkHint("");
      toast.success(`${AMOY_CHAIN_NAME} selected in wallet.`);
      await refreshWalletSessions().catch(() => null);
      return;
    } catch (error) {
      const message = explainNetworkSwitchFailure(error);
      setNetworkHint(message);
    }

    window.open(helpUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopyWallet() {
    if (!wallet.account) {
      return;
    }

    try {
      await navigator.clipboard.writeText(wallet.account);
      toast.success("Wallet address copied.");
    } catch {
      toast.error("Failed to copy wallet.");
    }
  }

  async function handleConnectAndLinkWallet() {
    if (isSyncingWallet) {
      return;
    }

    setIsSyncingWallet(true);
    try {
      const account =
        wallet.account ||
        (await connectWallet({ requestIfMissing: true, autoSwitch: true }));

      if (!account) {
        throw new Error("No wallet connected.");
      }

      await linkWallet(account);
      await refreshWalletSessions().catch(() => null);
      toast.success("Wallet linked to your account.");
    } catch (error) {
      toast.error(error?.message || "Wallet link failed.");
    } finally {
      setIsSyncingWallet(false);
    }
  }

  async function handleSaveProfile() {
    if (isSavingProfile) {
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateAuthProfile({
        displayName: sanitizeText(resolvedDisplayName, { maxLength: 80 }),
      });
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(error?.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <Card>
        <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
          Settings
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Full account center for identity, wallet management, security controls, and session lifecycle.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-100">Account Management</h3>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-gray-400">Display Name</label>
            <input
              type="text"
              value={resolvedDisplayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-100 outline-none transition focus:border-violet-300/70 focus:ring-2 focus:ring-violet-400/20"
              placeholder="Your display name"
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-300">
            <p>
              <span className="text-gray-400">Email:</span> {user?.email || "-"}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-gray-500">
              User ID: {user?.id || "-"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmLogout(true)}>
              <LogOut size={14} />
              Logout
            </Button>
            <Button variant="danger" onClick={() => setConfirmDeleteAccount(true)}>
              <Trash2 size={14} />
              Delete Account Data
            </Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-100">Wallet Management</h3>

          <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-4">
            <p className="text-xs uppercase tracking-wide text-cyan-200">Connected Wallet</p>
            <p className="mt-2 font-mono text-xs text-cyan-100">
              {wallet.account || "No wallet connected"}
            </p>
            <p className="mt-1 text-xs text-cyan-200/80">
              Linked profile wallet: {profile?.wallet_address ? shortAddress(profile.wallet_address) : "None"}
            </p>
            <p className="mt-1 text-xs text-cyan-200/80">
              Verification status: {walletVerification.label}
            </p>
            <p className="mt-2 text-xs text-cyan-100/85">{walletVerification.details}</p>
            <p className="mt-2 text-xs text-cyan-200/80">
              Verified wallet sessions: {walletSessions.length}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="secondary"
              onClick={() => connectWallet({ requestIfMissing: true, autoSwitch: true })}
              disabled={wallet.isConnecting}
            >
              <Wallet size={14} />
              {wallet.isConnecting ? "Connecting..." : wallet.account ? "Change Wallet" : "Connect Wallet"}
            </Button>
            <Button variant="secondary" onClick={handleCopyWallet} disabled={!wallet.account}>
              <Copy size={14} />
              Copy Address
            </Button>
            <Button variant="secondary" onClick={handleConnectAndLinkWallet} disabled={isSyncingWallet}>
              <Link2 size={14} />
              {isSyncingWallet ? "Syncing..." : "Link Wallet"}
            </Button>
            <Button variant="secondary" onClick={handleSwitchNetwork} disabled={isSwitchingNetwork}>
              <ShieldCheck size={14} />
              {isSwitchingNetwork ? "Switching..." : "Switch Network"}
            </Button>
            <Button variant="secondary" onClick={handleManualNetworkSwitch}>
              <ExternalLink size={14} />
              Manual Network Switch
            </Button>
            <Button variant="secondary" onClick={handleWalletPermissions} disabled={isRequestingPermissions}>
              <KeyRound size={14} />
              {isRequestingPermissions ? "Requesting..." : "Wallet Permissions"}
            </Button>
            <Button variant="danger" onClick={() => setConfirmDisconnect(true)} disabled={!wallet.account}>
              Disconnect Wallet
            </Button>
          </div>

          {networkHint ? (
            <div className="rounded-xl border border-amber-300/35 bg-amber-500/10 p-3 text-xs text-amber-100">
              <p className="inline-flex items-center gap-1 font-semibold">
                <AlertTriangle size={13} />
                Network Switch Guidance
              </p>
              <p className="mt-1">{networkHint}</p>
              <p className="mt-1">
                If MetaMask cannot switch automatically, use manual switch and choose{" "}
                <span className="font-semibold">{AMOY_CHAIN_NAME}</span> ({AMOY_CHAIN_ID_HEX}).
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-100">Preferences</h3>
          <SettingRow
            icon={Bell}
            title="Notifications"
            description="Enable toast feedback for actions."
            control={
              <Toggle
                checked={settings.notifications}
                onChange={(value) => updateSettings({ notifications: value })}
              />
            }
          />
          <SettingRow
            icon={PlugZap}
            title="Auto Connect"
            description="Reconnect wallet when opening app."
            control={
              <Toggle
                checked={settings.autoConnect}
                onChange={(value) => updateSettings({ autoConnect: value })}
              />
            }
          />
        </Card>

        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-100">Security + Session</h3>
          <SettingRow
            icon={ShieldCheck}
            title="Security Mode"
            description="Choose strictness for verification checks."
            control={
              <SelectField
                value={settings.securityMode}
                onChange={(value) => updateSettings({ securityMode: value })}
                options={[
                  { value: "strict", label: "Strict" },
                  { value: "balanced", label: "Balanced" },
                  { value: "relaxed", label: "Relaxed" },
                ]}
              />
            }
          />
          <SettingRow
            icon={Link2}
            title="Explorer Preference"
            description="Blockchain explorer used in links."
            control={
              <SelectField
                value={settings.explorerBaseUrl}
                onChange={(value) => updateSettings({ explorerBaseUrl: value })}
                options={[
                  { value: "https://amoy.polygonscan.com", label: "Polygonscan Amoy" },
                  { value: "https://www.oklink.com/amoy", label: "OKLink Amoy" },
                ]}
              />
            }
          />

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-300">
            <p className="text-xs uppercase tracking-wide text-gray-400">Session Info</p>
            <p className="mt-2">
              Wallet status: <span className="text-gray-100">{wallet.status}</span>
            </p>
            <p className="mt-1">
              Realtime sync: <span className="text-gray-100">{syncState.realtimeStatus}</span>
            </p>
            <p className="mt-1">
              Last sync:{" "}
              <span className="text-gray-100">
                {syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt).toLocaleString() : "Not synced yet"}
              </span>
            </p>
            <p className="mt-1">
              Sync health:{" "}
              <span className="text-gray-100">
                {syncState.isStale ? "Stale (refresh suggested)" : "Healthy"}
              </span>
            </p>
            <p className="mt-1">
              Session expires: <span className="text-gray-100">{sessionExpiryLabel}</span>
            </p>
            <p className="mt-1 break-all font-mono text-xs text-gray-500">
              Access token present: {session?.accessToken ? "Yes" : "No"}
            </p>
            {syncState.realtimeError ? (
              <p className="mt-2 text-xs text-amber-200">{syncState.realtimeError}</p>
            ) : null}
          </div>
        </Card>
      </div>

      <ConfirmModal
        open={confirmDisconnect}
        title="Disconnect Wallet Session?"
        description="This will clear wallet connection from this browser session."
        confirmLabel="Disconnect"
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          disconnectWallet();
          setConfirmDisconnect(false);
        }}
      />

      <ConfirmModal
        open={confirmLogout}
        title="Logout from TrustDoc?"
        description="You will be returned to the login page and protected modules will lock."
        confirmLabel="Logout"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          void logout();
          setConfirmLogout(false);
        }}
      />

      <ConfirmModal
        open={confirmDeleteAccount}
        title="Delete Account Data?"
        description="This removes your profile, metadata, activity logs, and verification history from database records."
        confirmLabel="Delete Data"
        onCancel={() => setConfirmDeleteAccount(false)}
        onConfirm={() => {
          void deleteAccount()
            .then(() => {
              toast.success("Account data deleted.");
            })
            .catch((error) => {
              toast.error(error?.message || "Failed to delete account data.");
            });
          setConfirmDeleteAccount(false);
        }}
      />
    </section>
  );
}
