import type { Metadata, Viewport } from "next";
import "./globals.css";

const VERCEL_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  (VERCEL_URL ? `https://${VERCEL_URL}` : "https://pleneva.com");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Pleneva — Cada conversación tiene un siguiente paso",
  description:
    "Pleneva busca oportunidades, atiende conversaciones y deja claro quién quiere hablar contigo. Del primer contacto al siguiente paso, todo en un solo lugar.",
  openGraph: {
    title: "Pleneva — Un cliente pregunta. Tú estás trabajando. Otro responde.",
    description:
      "Capta oportunidades, atiende conversaciones y sigue cada paso desde un mismo lugar.",
    url: SITE_URL,
    siteName: "Pleneva",
    locale: "es_ES",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#002553",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
