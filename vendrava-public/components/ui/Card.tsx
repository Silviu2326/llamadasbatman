import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6 ${
        hover ? "transition-all duration-300 hover:-translate-y-1 hover:border-electric/35" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
