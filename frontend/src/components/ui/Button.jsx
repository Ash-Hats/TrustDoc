const VARIANT_STYLES = {
  primary:
    "bg-[linear-gradient(90deg,var(--accent-start),var(--accent-end))] text-white shadow-glow-violet hover:brightness-110",
  secondary: "border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10",
  cyan: "bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-glow-cyan hover:brightness-110",
  danger: "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-glow-rose hover:brightness-110",
  ghost: "text-gray-300 hover:bg-white/10",
};

export default function Button({
  children,
  variant = "primary",
  type = "button",
  disabled = false,
  className = "",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300",
        "hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100",
        VARIANT_STYLES[variant] || VARIANT_STYLES.primary,
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
