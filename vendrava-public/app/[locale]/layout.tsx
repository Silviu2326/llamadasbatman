import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALES, isLocale, type Locale } from "@/types/locale";
import { spaceGrotesk, ibmPlexSans, ibmPlexMono } from "../fonts";
import "../globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { OrganizationSchema } from "@/components/seo/OrganizationSchema";
import { SoftwareApplicationSchema } from "@/components/seo/SoftwareApplicationSchema";
import { commonEs } from "@/content/locales/es/common";
import { commonEn } from "@/content/locales/en/common";
import { SITE_NAME, SITE_URL, GOOGLE_SITE_VERIFICATION, BING_SITE_VERIFICATION } from "@/lib/constants";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
    verification: {
      ...(GOOGLE_SITE_VERIFICATION ? { google: GOOGLE_SITE_VERIFICATION } : {}),
      ...(BING_SITE_VERIFICATION ? { other: { "msvalidate.01": BING_SITE_VERIFICATION } } : {}),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const common = locale === "es" ? commonEs : commonEn;

  return (
    <html lang={locale} className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body className="font-sans">
        <OrganizationSchema locale={locale} />
        <SoftwareApplicationSchema locale={locale} />
        <GradientBackground />
        <div className="relative z-[1] flex min-h-screen flex-col">
          <Header locale={locale} common={common} />
          <main className="flex-1">{children}</main>
          <Footer locale={locale} common={common} />
        </div>
      </body>
    </html>
  );
}
