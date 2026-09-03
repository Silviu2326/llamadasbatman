import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { pathFor } from "@/lib/routes";

const COPY = {
  es: {
    title: "Esta página no existe",
    text: "La página que buscas puede haberse movido o no está disponible todavía en este idioma.",
    cta: "Volver a Vendrava",
  },
  en: {
    title: "This page does not exist",
    text: "The page you are looking for may have moved or is not available in this language yet.",
    cta: "Back to Vendrava",
  },
};

export default function NotFound() {
  // Locale-aware layout renders this inside app/[locale], but not-found has no
  // access to route params, so we keep the copy bilingual-neutral and safe.
  const copy = COPY.en;

  return (
    <Container size="sm" className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <span className="font-mono text-sm uppercase tracking-widest text-cyan">404</span>
      <h1 className="mt-4 font-display text-3xl font-bold text-white md:text-4xl">{copy.title}</h1>
      <p className="mt-4 max-w-md text-muted">{copy.text}</p>
      <div className="mt-8 flex gap-3">
        <Link href={pathFor("home", "es")} className="rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-soft">
          {COPY.es.cta}
        </Link>
        <Link
          href={pathFor("home", "en")}
          className="rounded-xl bg-gradient-to-br from-electric to-cyan px-6 py-3 text-sm font-semibold text-bg"
        >
          {copy.cta}
        </Link>
      </div>
    </Container>
  );
}
