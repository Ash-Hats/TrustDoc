export default function SelectField({ value, onChange, options, className = "" }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={[
        "rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-gray-100 outline-none transition",
        "focus:border-violet-300/60 focus:ring-2 focus:ring-violet-400/20",
        className,
      ].join(" ")}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-[#141824] text-gray-100">
          {option.label}
        </option>
      ))}
    </select>
  );
}
