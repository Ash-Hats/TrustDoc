import {
  BarChart3,
  CheckCircle,
  FilePlus,
  FolderOpen,
  Home,
  Menu,
  UserRound,
  Settings,
  X,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/register-document", label: "Register", icon: FilePlus },
  { to: "/verify", label: "Verify", icon: CheckCircle },
  { to: "/my-documents", label: "My Documents", icon: FolderOpen },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar({
  isCollapsed,
  isMobileOpen,
  onToggleCollapse,
  onOpenMobileMenu,
  onCloseMobileMenu,
}) {
  return (
    <>
      {isMobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={onCloseMobileMenu}
          className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/10 bg-[#141824]/85 shadow-glass backdrop-blur-xl transition-all duration-300",
          isCollapsed ? "md:w-24" : "md:w-72",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 md:px-5">
          <div
            className={[
              "flex items-center gap-3 transition-all duration-300",
              isCollapsed ? "md:justify-center md:gap-0" : "",
            ].join(" ")}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-bold text-white shadow-glow-violet">
              TD
            </span>
            <div
              className={[
                "overflow-hidden transition-all duration-300",
                isCollapsed ? "md:max-w-0 md:opacity-0" : "md:max-w-[200px] md:opacity-100",
              ].join(" ")}
            >
              <p className="whitespace-nowrap text-sm font-semibold text-gray-100">TrustDoc</p>
              <p className="whitespace-nowrap text-xs text-gray-400">Web3 Verification SaaS</p>
            </div>
          </div>

          <button
            type="button"
            onClick={isMobileOpen ? onCloseMobileMenu : onOpenMobileMenu}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-gray-300 transition hover:bg-white/10 md:hidden"
            aria-label={isMobileOpen ? "Close sidebar" : "Open sidebar"}
          >
            {isMobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobileMenu}
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-300",
                    isCollapsed ? "md:justify-center md:gap-0" : "",
                    isActive
                      ? "bg-gradient-to-r from-violet-500/25 to-indigo-500/25 text-gray-100 shadow-glow-violet"
                      : "text-gray-400 hover:bg-white/10 hover:text-gray-200",
                  ].join(" ")
                }
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-violet-300 transition-all duration-300 group-hover:bg-white/10">
                  <Icon size={16} />
                </span>
                <span
                  className={[
                    "whitespace-nowrap transition-all duration-300",
                    isCollapsed ? "md:max-w-0 md:opacity-0" : "md:max-w-[180px] md:opacity-100",
                  ].join(" ")}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={[
              "hidden w-full items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-gray-300 transition hover:bg-white/10 md:flex",
              isCollapsed ? "justify-center" : "",
            ].join(" ")}
          >
            <Menu size={17} />
            <span
              className={[
                "whitespace-nowrap transition-all duration-300",
                isCollapsed ? "max-w-0 opacity-0" : "max-w-[160px] opacity-100",
              ].join(" ")}
            >
              {isCollapsed ? "Expand" : "Collapse"}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
