import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Input({ label, id, className = "", ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        id={inputId}
        className={`rounded-lg border border-white/15 bg-bg/60 px-3.5 py-2.5 text-sm text-white outline-none transition-colors focus:border-electric ${className}`}
        {...rest}
      />
    </label>
  );
}
