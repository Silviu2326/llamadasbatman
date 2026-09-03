import type { ReactNode } from "react";

const COLOR_CLASSES = {
  cyan: "text-cyan border-cyan/30 bg-cyan/[0.06]",
  violet: "text-[#a78bfa] border-violet/30 bg-violet/[0.06]",
  gold: "text-gold border-gold/30 bg-gold/[0.06]",
  danger: "text-danger border-danger/30 bg-danger/[0.06]",
  neutral: "text-muted border-white/20 bg-transparent",
};

export function Badge({
  children,
  color = "cyan",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  color?: keyof typeof COLOR_CLASSES;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest ${COLOR_CLASSES[color]} ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 animate-blink rounded-full bg-current" />}
      {children}
    </span>
  );
}
