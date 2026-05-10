import { Search } from "lucide-react";

export default function SearchInput({ value, onChange, placeholder = "Search...", className = "" }) {
  return (
    <label
      className={[
        "flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-gray-300",
        "focus-within:border-violet-300/60 focus-within:ring-2 focus-within:ring-violet-400/20",
        className,
      ].join(" ")}
    >
      <Search size={15} className="text-gray-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-gray-100 placeholder:text-gray-500 outline-none"
      />
    </label>
  );
}
