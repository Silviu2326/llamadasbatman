"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";

export type LeadCaptureField =
  | { type: "text" | "email" | "tel" | "url"; name: string; label: string; placeholder?: string; required?: boolean }
  | { type: "select"; name: string; label: string; placeholder?: string; options: { value: string; label: string }[]; required?: boolean }
  | { type: "textarea"; name: string; label: string; placeholder?: string; required?: boolean };

interface LeadCaptureFormProps {
  fields: LeadCaptureField[];
  submitLabel: string;
  successTitle: string;
  successText: string;
  note?: string;
  columns?: 1 | 2;
}

/**
 * Client-side form shell. There is no backend endpoint wired up yet, so
 * submission is simulated locally — swap handleSubmit's body for a real
 * fetch() to a form/CRM endpoint once one exists.
 */
export function LeadCaptureForm({ fields, submitLabel, successTitle, successText, note, columns = 2 }: LeadCaptureFormProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    window.setTimeout(() => setStatus("done"), 500);
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-cyan/30 bg-cyan/[0.06] p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-cyan/40 bg-cyan/10 text-2xl text-cyan">
          ✓
        </div>
        <h3 className="font-display text-xl font-bold text-white">{successTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{successText}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate={false}>
      <div className={columns === 2 ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "flex flex-col gap-4"}>
        {fields.map((field) => {
          if (field.type === "textarea") {
            return <Textarea key={field.name} name={field.name} label={field.label} placeholder={field.placeholder} required={field.required} className="sm:col-span-2" />;
          }
          if (field.type === "select") {
            return (
              <Select
                key={field.name}
                name={field.name}
                label={field.label}
                placeholder={field.placeholder}
                options={field.options}
                required={field.required}
              />
            );
          }
          return (
            <Input
              key={field.name}
              type={field.type}
              name={field.name}
              label={field.label}
              placeholder={field.placeholder}
              required={field.required}
            />
          );
        })}
      </div>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-5 w-full rounded-xl bg-gradient-to-br from-electric to-cyan px-6 py-3.5 text-sm font-semibold text-bg shadow-[0_10px_30px_rgba(59,130,246,0.35)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
      >
        {status === "submitting" ? "…" : submitLabel}
      </button>
      {note && <p className="mt-3 text-center text-xs text-faint">{note}</p>}
    </form>
  );
}
