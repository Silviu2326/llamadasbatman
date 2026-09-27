export const SITE_NAME = "Pleneva";

// Canonical host is non-www (a www -> non-www 301 lives in deploy/.htaccess).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://vendrava.com";

export const BRAND_COLOR = "#F25F1C";

export const SOCIAL_LINKS = {
  linkedin: "https://www.linkedin.com/company/vendrava",
  x: "https://x.com/vendrava",
};

export const LOCALE_COOKIE_NAME = "vendrava_locale";

// SEO / brand descriptions reused by structured data and metadata.
export const SITE_DESCRIPTION_ES =
  "Pleneva te ayuda a encontrar clientes, contactar oportunidades y hacer seguimiento desde un CRM con IA diseñado para tu negocio.";
export const SITE_DESCRIPTION_EN =
  "Pleneva helps you find customers, reach opportunities and follow up from an AI-powered CRM designed for your business.";

// Search Console / Bing Webmaster verification. Paste the code from the
// provider (or set the env var) and redeploy to verify site ownership.
export const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || "";
export const BING_SITE_VERIFICATION = process.env.NEXT_PUBLIC_BING_VERIFICATION || "";
