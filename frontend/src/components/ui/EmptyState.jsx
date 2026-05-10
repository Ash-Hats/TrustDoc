export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 text-center">
      <h3 className="text-base font-semibold text-gray-200">{title}</h3>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
