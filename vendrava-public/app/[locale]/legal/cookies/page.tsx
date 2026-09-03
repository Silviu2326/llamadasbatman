import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/types/locale";
import { LegalPageTemplate } from "@/components/templates/LegalPageTemplate";
import { buildMetadata } from "@/lib/metadata";

const COPY = {
  es: {
    title: "Política de cookies",
    breadcrumb: "Cookies",
    intro:
      "Vendrava utiliza una cookie técnica para recordar tu idioma preferido (español o inglés) y, en su caso, cookies analíticas para entender el uso del sitio.",
    sections: [
      {
        h: "Cookies técnicas",
        p: "Guardan tu preferencia de idioma para que no tengas que seleccionarlo en cada visita. Son necesarias para el funcionamiento básico del sitio.",
      },
      {
        h: "Cookies analíticas",
        p: "Si se activan, ayudan a entender qué páginas se visitan más y cómo mejorar el contenido y la navegación del sitio.",
      },
      {
        h: "Cómo gestionar las cookies",
        p: "Puedes eliminar o bloquear las cookies desde la configuración de tu navegador; ten en cuenta que esto puede afectar a la preferencia de idioma guardada.",
      },
    ],
  },
  en: {
    title: "Cookie policy",
    breadcrumb: "Cookies",
    intro:
      "Vendrava uses a technical cookie to remember your preferred language (Spanish or English) and, where enabled, analytics cookies to understand site usage.",
    sections: [
      {
        h: "Technical cookies",
        p: "Store your language preference so you do not have to select it on every visit. They are necessary for the site's basic operation.",
      },
      {
        h: "Analytics cookies",
        p: "When enabled, they help us understand which pages are visited most and how to improve site content and navigation.",
      },
      {
        h: "Managing cookies",
        p: "You can delete or block cookies from your browser settings; note that this may affect your saved language preference.",
      },
    ],
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const meta =
    locale === "es"
      ? { title: "Política de cookies | Vendrava", description: "Cómo Vendrava utiliza cookies técnicas y analíticas." }
      : { title: "Cookie policy | Vendrava", description: "How Vendrava uses technical and analytics cookies." };
  return buildMetadata({ routeKey: "legal.cookies", locale, ...meta });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const copy = COPY[locale];

  return (
    <LegalPageTemplate locale={locale} title={copy.title} path="legal/cookies" breadcrumbLabel={copy.breadcrumb} updatedLabel="2026">
      <p>{copy.intro}</p>
      {copy.sections.map((section) => (
        <section key={section.h}>
          <h2>{section.h}</h2>
          <p>{section.p}</p>
        </section>
      ))}
    </LegalPageTemplate>
  );
}
