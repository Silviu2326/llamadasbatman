export function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-bg/40 px-4 py-4 text-center">
      <div className="font-display text-xl font-bold text-cyan md:text-2xl">{value}</div>
      <div className="mt-1 text-xs text-faint">{label}</div>
    </div>
  );
}
