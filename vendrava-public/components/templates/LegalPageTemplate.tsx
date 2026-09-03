import type { ReactNode } from "react";
import type { Locale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

const COPY = {
  es: {
    home: "Inicio",
    notice:
      "Este contenido es una versión inicial orientativa y está pendiente de revisión por un profesional legal antes de su uso definitivo.",
    updated: "Última actualización",
  },
  en: {
    home: "Home",
    notice: "This content is an initial, informational draft and is pending review by a legal professional before final use.",
    updated: "Last updated",
  },
};

export function LegalPageTemplate({
  locale,
  title,
  path,
  breadcrumbLabel,
  updatedLabel,
  children,
}: {
  locale: Locale;
  title: string;
  path: string;
  breadcrumbLabel: string;
  updatedLabel: string;
  children: ReactNode;
}) {
  const copy = COPY[locale];

  return (
    <Container size="sm" className="py-16 md:py-24">
      <Breadcrumbs locale={locale} items={[{ name: copy.home, path: "" }, { name: breadcrumbLabel, path }]} />
      <h1 className="mt-5 font-display text-[clamp(28px,3.4vw,42px)] font-bold leading-[1.1] tracking-tight text-white">
        {title}
      </h1>
      <p className="mt-2 font-mono text-xs text-faint">
        {copy.updated}: {updatedLabel}
      </p>

      <div className="mt-6 rounded-xl border border-gold/25 bg-gold/[0.05] p-4 text-sm leading-relaxed text-soft">
        {copy.notice}
      </div>

      <div className="prose-legal mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-muted [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_p]:mt-2">
        {children}
      </div>
    </Container>
  );
}
