import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, Link2, Save, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { shortAddress } from "../utils/format";
import { sanitizeText } from "../utils/security";

export default function Profile() {
  const {
    user,
    profile,
    updateAuthProfile,
    linkWallet,
    unlinkWallet,
  } = useAuth();
  const { wallet, connectWallet } = useAppContext();
  const [displayName, setDisplayName] = useState(() => profile?.display_name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isWalletSyncing, setIsWalletSyncing] = useState(false);

  const linkedWallet = useMemo(
    () => profile?.wallet_address || wallet.account || "",
    [profile?.wallet_address, wallet.account]
  );
  const resolvedDisplayName = displayName || profile?.display_name || "";

  async function handleSaveProfile() {
    if (isSaving) {
      return;
    }

    const safeName = sanitizeText(resolvedDisplayName, { maxLength: 80 });
    setIsSaving(true);
    try {
      await updateAuthProfile({ displayName: safeName });
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(error?.message || "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLinkCurrentWallet() {
    if (isWalletSyncing) {
      return;
    }

    setIsWalletSyncing(true);
    try {
      const account =
        wallet.account ||
        (await connectWallet({
          requestIfMissing: true,
          autoSwitch: true,
        }));

      if (!account) {
        throw new Error("No wallet connected.");
      }

      await linkWallet(account);
      toast.success("Wallet linked to account.");
    } catch (error) {
      toast.error(error?.message || "Failed to link wallet.");
    } finally {
      setIsWalletSyncing(false);
    }
  }

  async function handleUnlinkWallet() {
    if (isWalletSyncing) {
      return;
    }

    setIsWalletSyncing(true);
    try {
      await unlinkWallet();
      toast.success("Wallet unlinked.");
    } catch (error) {
      toast.error(error?.message || "Failed to unlink wallet.");
    } finally {
      setIsWalletSyncing(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <Card>
        <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
          Profile
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Manage identity, linked wallet, and account-level verification settings.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-100">Account Details</h3>

          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-wide text-gray-400">Display Name</span>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5">
              <UserRound size={15} className="text-gray-400" />
              <input
                value={resolvedDisplayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
                placeholder="Your display name"
              />
            </div>
          </label>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-gray-300">
            <p>
              <span className="text-gray-400">Email:</span> {user?.email || "-"}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-gray-500">
              User ID: {user?.id || "-"}
            </p>
          </div>

          <Button onClick={handleSaveProfile} disabled={isSaving}>
            <Save size={14} />
            {isSaving ? "Saving..." : "Save Profile"}
          </Button>
        </Card>

        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-100">Wallet Link</h3>

          <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-3 text-sm text-cyan-100">
            {linkedWallet ? (
              <>
                <p className="font-medium">Linked wallet</p>
                <p className="mt-1 font-mono text-xs">{linkedWallet}</p>
              </>
            ) : (
              <p>No wallet linked to this account yet.</p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={handleLinkCurrentWallet} disabled={isWalletSyncing}>
              <Link2 size={14} />
              {isWalletSyncing ? "Linking..." : "Link Current Wallet"}
            </Button>
            <Button variant="danger" onClick={handleUnlinkWallet} disabled={isWalletSyncing || !linkedWallet}>
              Unlink Wallet
            </Button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-gray-400">
            <p className="inline-flex items-center gap-1 text-emerald-200">
              <ShieldCheck size={14} />
              Linked wallets scope document ownership in your account center.
            </p>
            <p className="mt-2">
              Current wallet: {wallet.account ? shortAddress(wallet.account) : "Disconnected"}
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => connectWallet({ requestIfMissing: true, autoSwitch: false })}
          >
            <Wallet size={14} />
            Connect / Switch Wallet
          </Button>
        </Card>
      </div>

      <Card className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-100">Trust Signals</h3>
        <p className="text-sm text-gray-400">
          Document proofs generated in this workspace are bound to both account identity and wallet ownership.
        </p>
        <p className="inline-flex items-center gap-1 text-sm text-emerald-200">
          <Check size={14} />
          Multi-user isolation active for metadata, history, and activity streams.
        </p>
      </Card>
    </section>
  );
}
