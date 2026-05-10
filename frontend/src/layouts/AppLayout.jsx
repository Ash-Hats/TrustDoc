import { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { ensureAmoyNetwork } from "../utils/contract";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import WrongNetworkModal from "../modals/WrongNetworkModal";

const TITLE_MAP = {
  "/dashboard": "Dashboard",
  "/register-document": "Register Document",
  "/verify": "Verify Document",
  "/my-documents": "My Documents",
  "/analytics": "Analytics",
  "/settings": "Settings",
  "/profile": "Profile",
  "/login": "Sign In",
  "/register": "Create Account",
  "/forgot-password": "Reset Password",
};

export default function AppLayout() {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const { user, profile } = useAuth();
  const {
    wallet,
    disconnectWallet,
    showWrongNetworkModal,
    setShowWrongNetworkModal,
  } = useAppContext();

  const pageTitle = useMemo(() => TITLE_MAP[location.pathname] || "TrustDoc", [location.pathname]);

  async function handleSwitchNetwork() {
    setIsSwitchingNetwork(true);

    try {
      const result = await ensureAmoyNetwork({ autoSwitch: true });

      if (result.isSupported) {
        setShowWrongNetworkModal(false);
      }
    } finally {
      setIsSwitchingNetwork(false);
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#0f1117]">
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-pink-500/10 blur-3xl" />

      <Sidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onToggleCollapse={() => setIsCollapsed((current) => !current)}
        onOpenMobileMenu={() => setIsMobileOpen(true)}
        onCloseMobileMenu={() => setIsMobileOpen(false)}
      />

      <div
        onClick={() => {
          if (isMobileOpen) {
            setIsMobileOpen(false);
          }
        }}
        className={[
          "relative z-10 flex min-h-screen flex-1 flex-col transition-all duration-300",
          isCollapsed ? "md:pl-24" : "md:pl-72",
        ].join(" ")}
      >
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Navbar
            title={pageTitle}
            wallet={wallet}
            user={user}
            profile={profile}
            onOpenMobileMenu={() => setIsMobileOpen(true)}
            onToggleSidebar={() => setIsCollapsed((current) => !current)}
          />
          <div className="animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </div>

      <WrongNetworkModal
        open={showWrongNetworkModal}
        isSwitching={isSwitchingNetwork}
        onClose={() => setShowWrongNetworkModal(false)}
        onSwitchNetwork={handleSwitchNetwork}
        onDisconnect={disconnectWallet}
      />
    </div>
  );
}
