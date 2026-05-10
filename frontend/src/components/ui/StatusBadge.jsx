const BADGE_STYLES = {
  connected: "border-emerald-300/35 bg-emerald-500/15 text-emerald-200",
  disconnected: "border-slate-300/25 bg-slate-500/10 text-slate-300",
  "wrong-network": "border-rose-300/35 bg-rose-500/15 text-rose-200",
  verified: "border-emerald-300/35 bg-emerald-500/15 text-emerald-200",
  revoked: "border-amber-300/35 bg-amber-500/15 text-amber-200",
  tampered: "border-rose-300/35 bg-rose-500/15 text-rose-200",
  pending: "border-cyan-300/35 bg-cyan-500/15 text-cyan-200",
  failed: "border-rose-300/35 bg-rose-500/15 text-rose-200",
};

export default function StatusBadge({ type = "pending", label }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        BADGE_STYLES[type] || BADGE_STYLES.pending,
      ].join(" ")}
    >
      {label || type}
    </span>
  );
}
