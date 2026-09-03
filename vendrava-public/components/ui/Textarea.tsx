import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function Textarea({ label, id, className = "", rows = 4, ...rest }: TextareaProps) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <textarea
        id={inputId}
        rows={rows}
        className={`resize-y rounded-lg border border-white/15 bg-bg/60 px-3.5 py-2.5 text-sm text-white outline-none transition-colors focus:border-electric ${className}`}
        {...rest}
      />
    </label>
  );
}
