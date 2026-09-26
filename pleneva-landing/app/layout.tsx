import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://pleneva.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Pleneva — Te traemos clientes",
  description:
    "Pleneva encuentra a quién venderle, le llama en el primer minuto, le convence y te deja la cita en la agenda. Anuncios, llamadas, WhatsApp y seguimiento en un solo sitio.",
  openGraph: {
    title: "Pleneva — Te traemos clientes. Tú solo tienes que atenderlos.",
    description:
      "Encontramos a tus clientes, les llamamos en el primer minuto y te los dejamos en la agenda.",
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
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
