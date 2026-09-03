export const SITE_NAME = "Vendrava";

// Canonical host is non-www (a www -> non-www 301 lives in deploy/.htaccess).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://vendrava.com";

export const BRAND_COLOR = "#3B82F6";

export const SOCIAL_LINKS = {
  linkedin: "https://www.linkedin.com/company/vendrava",
  x: "https://x.com/vendrava",
};

export const LOCALE_COOKIE_NAME = "vendrava_locale";

// SEO / brand descriptions reused by structured data and metadata.
export const SITE_DESCRIPTION_ES =
  "Vendrava es un CRM con IA que contesta, califica y agenda tus leads por voz y WhatsApp — inbound y outbound, incluidas llamadas en frío — con control humano. Un asesor comercial IA entrenado en el nicho de cada negocio.";
export const SITE_DESCRIPTION_EN =
  "Vendrava is an AI Sales CRM that answers, qualifies and books your leads over voice and WhatsApp — inbound and outbound, including cold calling — with human control. An AI sales advisor trained on each business's niche.";

// Search Console / Bing Webmaster verification. Paste the code from the
// provider (or set the env var) and redeploy to verify site ownership.
export const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || "";
export const BING_SITE_VERIFICATION = process.env.NEXT_PUBLIC_BING_VERIFICATION || "";
