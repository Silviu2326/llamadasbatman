import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, id, options, placeholder, className = "", ...rest }: SelectProps) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select
        id={inputId}
        defaultValue=""
        className={`rounded-lg border border-white/15 bg-bg/60 px-3.5 py-2.5 text-sm text-white outline-none transition-colors focus:border-electric ${className}`}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-navy text-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
