export default function Card({ children, className = "" }) {
  return (
    <article
      className={[
        "rounded-2xl border border-white/10 bg-[#1a1f2e]/75 p-5 shadow-glass backdrop-blur-md",
        className,
      ].join(" ")}
    >
      {children}
    </article>
  );
}
