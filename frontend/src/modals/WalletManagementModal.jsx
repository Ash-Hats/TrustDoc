import { useCallback, useEffect, useState } from "react";
import { Wallet, X, Plus, Trash2, Check, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  getWalletSessions,
  removeWalletSession,
  createWalletSession,
  logAuditEvent,
} from "../services/supabaseService";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { shortAddress } from "../utils/format";
import {
  AMOY_CHAIN_ID_DEC,
  AMOY_CHAIN_NAME,
  isAmoyChain,
} from "../utils/contract";
import {
  getCurrentAddress,
  getCurrentChainId,
  getSigner,
} from "../services/walletManager";

function WalletManagementModal({ isOpen, onClose }) {
  const { user, session } = useAuth();
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const fetchWallets = useCallback(async () => {
    if (!session?.accessToken || !user?.id) return;

    try {
      const data = await getWalletSessions(session.accessToken, user.id);
      setWallets(data || []);
    } catch (error) {
      console.error("Failed to fetch wallets:", error);
    }
  }, [session, user]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const timer = setTimeout(() => {
      void fetchWallets();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchWallets, isOpen]);

  const handleConnectWallet = async () => {
    setConnecting(true);
    try {
      const walletAddress = (
        await getCurrentAddress({ requestIfMissing: true, forcePrompt: true })
      ).toLowerCase();
      if (!walletAddress) {
        throw new Error("No account selected");
      }

      // Check if already connected
      if (wallets.some((w) => w.wallet_address.toLowerCase() === walletAddress)) {
        toast.error("This wallet is already connected");
        setConnecting(false);
        return;
      }

      const activeChainId = await getCurrentChainId();
      if (!isAmoyChain(activeChainId)) {
        throw new Error(`Please switch wallet to ${AMOY_CHAIN_NAME} before connecting.`);
      }

      // Sign message for verification
      const signer = await getSigner({ requestIfMissing: false });

      const message = [
        "TrustDoc Wallet Connection",
        `Address: ${walletAddress}`,
        `Timestamp: ${new Date().toISOString()}`,
        "This action will not cost you any gas or tokens.",
      ].join("\n");

      const signature = await signer.signMessage(message);

      // Save wallet session
      if (session?.accessToken) {
        await createWalletSession(session.accessToken, user.id, {
          wallet_address: walletAddress,
          chain_id: AMOY_CHAIN_ID_DEC,
          signature,
          message,
        });

        await logAuditEvent(session.accessToken, user.id, {
          action: "wallet_connected",
          resource_type: "wallet",
          resource_id: walletAddress,
          status: "success",
        });

        toast.success("Wallet connected successfully!");
        await fetchWallets();
      }
    } catch (error) {
      console.error("Wallet connection error:", error);
      if (/metamask is not installed/i.test(error?.message || "") && typeof window !== "undefined") {
        window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      }
      if (error.code === -32602 || error.message?.includes("user rejected")) {
        toast.error("Connection cancelled by user");
      } else {
        toast.error(error.message || "Failed to connect wallet");
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectWallet = async (walletAddress) => {
    if (!session?.accessToken) return;

    setLoading(true);
    try {
      await removeWalletSession(session.accessToken, user.id, walletAddress);

      await logAuditEvent(session.accessToken, user.id, {
        action: "wallet_disconnected",
        resource_type: "wallet",
        resource_id: walletAddress,
        status: "success",
      });

      toast.success("Wallet disconnected");
      await fetchWallets();
    } catch (error) {
      console.error("Disconnect error:", error);
      toast.error("Failed to disconnect wallet");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 -m-6 mb-6 flex items-center justify-between border-b border-gray-700/50 bg-gradient-to-r from-gray-900/95 to-gray-800/95 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Wallet size={24} className="text-violet-400" />
            <h2 className="text-xl font-bold text-gray-100">Wallet Management</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg hover:bg-gray-700/50 p-2 transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Info Box */}
          <div className="rounded-lg border border-blue-400/30 bg-blue-400/5 p-4">
            <div className="flex gap-3">
              <AlertCircle size={16} className="mt-1 flex-shrink-0 text-blue-300" />
              <div className="text-sm text-blue-200">
                <p className="font-semibold mb-1">About Wallet Connections</p>
                <p>
                  Connect one or more wallets to register and verify documents on the blockchain.
                  Each wallet is independently verified through a signed message.
                </p>
              </div>
            </div>
          </div>

          {/* Connected Wallets */}
          <div>
            <h3 className="text-lg font-semibold text-gray-100 mb-4">
              Connected Wallets
              {wallets.length > 0 && (
                <span className="ml-2 text-sm text-gray-400">
                  ({wallets.length})
                </span>
              )}
            </h3>

            {wallets.length > 0 ? (
              <div className="space-y-3">
                {wallets.map((wallet) => (
                  <div
                    key={wallet.wallet_address}
                    className="flex items-center justify-between rounded-lg border border-gray-700/50 bg-gray-800/30 p-4 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Check size={16} className="text-emerald-400" />
                      <div className="flex-1">
                        <p className="font-mono text-sm text-gray-100">
                          {shortAddress(wallet.wallet_address)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Connected on{" "}
                          {new Date(wallet.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleDisconnectWallet(wallet.wallet_address)
                      }
                      disabled={loading}
                      className="rounded-lg bg-red-500/20 hover:bg-red-500/30 disabled:bg-gray-600/50 p-2 transition-colors"
                    >
                      <Trash2
                        size={16}
                        className="text-red-400 disabled:text-gray-400"
                      />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-700/50 border-dashed p-8 text-center">
                <Wallet size={32} className="mx-auto text-gray-600 mb-2" />
                <p className="text-gray-400">No wallets connected yet</p>
                <p className="text-xs text-gray-500 mt-1">
                  Connect your first wallet to get started
                </p>
              </div>
            )}
          </div>

          {/* Connect Button */}
          <div className="flex gap-3 pt-4 border-t border-gray-700/50">
            <Button
              onClick={handleConnectWallet}
              disabled={connecting || wallets.length >= 5}
              variant="primary"
              className="flex-1"
            >
              <Plus size={16} />
              <span>{connecting ? "Connecting..." : "Connect New Wallet"}</span>
            </Button>
            <Button
              onClick={onClose}
              variant="secondary"
              className="flex-1"
            >
              Done
            </Button>
          </div>

          {wallets.length >= 5 && (
            <p className="text-xs text-gray-400 text-center">
              Maximum 5 wallets per account
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default WalletManagementModal;
