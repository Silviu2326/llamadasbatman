import type { ReactNode } from "react";

export function IconCard({
  icon,
  label,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-white/10 bg-bg/40 px-3.5 py-2.5 transition-transform duration-200 hover:translate-x-1 ${className}`}
    >
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-cyan/30 bg-cyan/10 text-sm text-cyan">
        {icon}
      </span>
      <span className="text-sm font-medium text-soft">{label}</span>
    </div>
  );
}
