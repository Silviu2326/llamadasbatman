"use client";

import { useState, type FormEvent } from "react";
import type { Locale } from "@/types/locale";

const COPY = {
  es: { placeholder: "tu@empresa.com", cta: "Suscribirme", done: "¡Gracias por suscribirte!" },
  en: { placeholder: "you@company.com", cta: "Subscribe", done: "Thanks for subscribing!" },
};

export function NewsletterForm({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const [done, setDone] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(true);
  }

  if (done) {
    return <p className="text-sm font-medium text-cyan">{copy.done}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 sm:flex-row">
      <label className="sr-only" htmlFor="newsletter-email">
        Email
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder={copy.placeholder}
        className="flex-1 rounded-lg border border-white/15 bg-bg/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-electric"
      />
      <button
        type="submit"
        className="rounded-lg bg-gradient-to-br from-electric to-cyan px-5 py-2.5 text-sm font-semibold text-bg"
      >
        {copy.cta}
      </button>
    </form>
  );
}
