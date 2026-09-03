import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "./constants";
import { pathFor } from "./routes";
import type { Locale } from "@/types/locale";

interface BuildMetadataInput {
  routeKey: string;
  locale: Locale;
  title: string;
  description: string;
  noIndex?: boolean;
  ogType?: "website" | "article";
}

export function buildMetadata({ routeKey, locale, title, description, noIndex, ogType = "website" }: BuildMetadataInput): Metadata {
  const esUrl = `${SITE_URL}${pathFor(routeKey, "es")}`;
  const enUrl = `${SITE_URL}${pathFor(routeKey, "en")}`;
  const canonical = locale === "es" ? esUrl : enUrl;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        es: esUrl,
        en: enUrl,
        "x-default": enUrl,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: locale === "es" ? "es_ES" : "en_US",
      type: ogType,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}
