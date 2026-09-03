import type { ReactNode } from "react";
import { Card } from "./Card";

const ACCENTS: Record<string, string> = {
  cyan: "border-cyan/30 bg-cyan/10 text-cyan",
  electric: "border-electric/30 bg-electric/10 text-electric",
  violet: "border-violet/30 bg-violet/10 text-violet",
  gold: "border-gold/40 bg-gold/10 text-gold",
  emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
};

export function FeatureCard({
  icon,
  title,
  text,
  eyebrow,
  accent = "cyan",
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  eyebrow?: string;
  accent?: "cyan" | "electric" | "violet" | "gold" | "emerald";
}) {
  return (
    <Card>
      {icon && (
        <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl border ${ACCENTS[accent] ?? ACCENTS.cyan}`}>
          {icon}
        </div>
      )}
      {eyebrow && <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-cyan">{eyebrow}</div>}
      <h3 className="mb-2 text-base font-semibold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
    </Card>
  );
}
