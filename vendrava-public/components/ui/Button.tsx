import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "gold";
type ButtonSize = "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-electric to-cyan text-bg shadow-[0_10px_34px_rgba(59,130,246,0.35)] hover:-translate-y-0.5",
  secondary:
    "border border-white/20 text-soft hover:text-white hover:border-white/40 hover:bg-white/5",
  ghost: "text-soft hover:text-white",
  gold: "bg-gradient-to-br from-gold to-[#f0d98a] text-bg shadow-[0_12px_30px_rgba(201,168,76,0.3)] hover:-translate-y-0.5",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "px-5 py-3 text-sm",
  lg: "px-7 py-4 text-base",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  href?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({ href, variant = "primary", size = "md", className, children, ...rest }: ButtonProps) {
  const classNames = [
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={classNames}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classNames} {...rest}>
      {children}
    </button>
  );
}
