import { SITE_NAME, SITE_URL, SOCIAL_LINKS, SITE_DESCRIPTION_ES, SITE_DESCRIPTION_EN } from "./constants";
import type { Locale } from "@/types/locale";
import type { FaqItem } from "@/types/content";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: "Vendrava AI Sales CRM",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    image: `${SITE_URL}/og.png`,
    description: SITE_DESCRIPTION_EN,
    slogan: "The AI Sales CRM that answers, qualifies and books your leads.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Valencia",
      addressCountry: "ES",
    },
    parentOrganization: {
      "@type": "Organization",
      name: "SprintMarkt",
      url: "https://sprintmarkt.com",
    },
    sameAs: [SOCIAL_LINKS.linkedin, SOCIAL_LINKS.x, "https://sprintmarkt.com"],
  };
}

export function websiteSchema(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${SITE_URL}/${locale}/`,
    inLanguage: locale,
    description: locale === "es" ? SITE_DESCRIPTION_ES : SITE_DESCRIPTION_EN,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

export function softwareApplicationSchema(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/${locale}/`,
    publisher: {
      "@type": "Organization",
      name: "SprintMarkt",
      url: "https://sprintmarkt.com",
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "EUR",
      price: "0",
      description:
        locale === "es"
          ? "Demo gratuita con créditos de IA incluidos. Planes de pago disponibles hablando con ventas."
          : "Free demo with included AI credits. Paid plans available by talking to sales.",
    },
  };
}

export function faqPageSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export interface BreadcrumbLink {
  name: string;
  path: string;
}

export function breadcrumbListSchema(locale: Locale, items: BreadcrumbLink[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}/${locale}/${item.path ? `${item.path}/` : ""}`,
    })),
  };
}

export function articleSchema({
  locale,
  headline,
  description,
  path,
  datePublished,
}: {
  locale: Locale;
  headline: string;
  description: string;
  path: string;
  datePublished: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    url: `${SITE_URL}/${locale}/${path}/`,
    mainEntityOfPage: `${SITE_URL}/${locale}/${path}/`,
    inLanguage: locale,
    datePublished,
    dateModified: datePublished,
    image: `${SITE_URL}/og.png`,
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
      },
    },
  };
}

export function collectionPageSchema({
  locale,
  name,
  description,
  path,
}: {
  locale: Locale;
  name: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: `${SITE_URL}/${locale}/${path ? `${path}/` : ""}`,
  };
}
