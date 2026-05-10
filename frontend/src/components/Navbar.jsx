import { useState } from "react";
import { Bell, Menu, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import StatusBadge from "./ui/StatusBadge";
import WalletManagementModal from "../modals/WalletManagementModal";
import { shortAddress } from "../utils/format";

export default function Navbar({
  title,
  wallet,
  user,
  profile,
  onOpenMobileMenu,
  onToggleSidebar,
}) {
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const displayName =
    profile?.display_name || user?.user_metadata?.display_name || user?.email || "Workspace User";

  return (
    <>
      <header className="sticky top-0 z-20 mb-6 rounded-2xl border border-white/10 bg-[#1a1f2e]/75 p-3 shadow-glass backdrop-blur-xl sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-gray-200 transition hover:bg-white/10 md:hidden"
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>

            <button
              type="button"
              onClick={onToggleSidebar}
              className="hidden h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-gray-200 transition hover:bg-white/10 md:inline-flex"
              aria-label="Toggle sidebar"
            >
              <Menu size={18} />
            </button>

            <div className="min-w-0">
              <h1 className="truncate bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
                {title}
              </h1>
              <p className="truncate text-xs text-gray-400">
                {wallet.account
                  ? `Wallet: ${shortAddress(wallet.account)}`
                  : "No wallet connected"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="truncate text-sm font-semibold text-gray-100">{displayName}</p>
              <p className="truncate text-xs text-gray-400">{user?.email || "No email"}</p>
            </div>
            <StatusBadge
              type={
                wallet.status === "connected"
                  ? "connected"
                  : wallet.status === "wrong-network"
                    ? "wrong-network"
                    : "disconnected"
              }
              label={
                wallet.status === "connected"
                  ? "Connected"
                  : wallet.status === "wrong-network"
                    ? "Wrong Network"
                    : "Disconnected"
              }
            />
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-400/10 text-violet-300 transition hover:bg-violet-400/20"
              aria-label="Manage wallets"
              title="Manage wallets"
            >
              <Wallet size={16} />
            </button>
            <Link
              to="/settings"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-gray-200 transition hover:bg-white/10"
              aria-label="Open notifications"
            >
              <Bell size={16} />
            </Link>
            <Link
              to="/profile"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:bg-white/10 sm:text-sm"
            >
              Profile
            </Link>
          </div>
        </div>
      </header>

      <WalletManagementModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </>
  );
}
