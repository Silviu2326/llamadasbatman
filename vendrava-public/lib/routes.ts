import type { Locale } from "@/types/locale";

export interface RouteEntry {
  key: string;
  es: string;
  en: string;
}

/**
 * Central registry of translated routes. `es` and `en` are paths without a
 * leading slash and without the locale prefix ("" for home). Every page in
 * the site must be registered here so hreflang alternates, the sitemap and
 * the language switcher stay in sync.
 */
export const ROUTES: RouteEntry[] = [
  { key: "home", es: "", en: "" },

  // Products
  { key: "product.ai-crm", es: "crm-con-ia", en: "ai-crm" },
  { key: "product.ai-voice-agents", es: "agentes-ia-voz", en: "ai-voice-agents" },
  { key: "product.ai-calling", es: "llamadas-ia", en: "ai-calling" },
  { key: "product.sales-automation", es: "automatizacion-ventas", en: "sales-automation" },
  { key: "product.lead-management", es: "gestion-leads", en: "lead-management" },
  { key: "product.growth-marketing-crm", es: "crm-growth-marketing", en: "growth-marketing-crm" },
  { key: "product.email-marketing", es: "email-marketing", en: "email-marketing" },
  { key: "product.whatsapp-crm", es: "whatsapp-crm", en: "whatsapp-crm" },
  { key: "product.sales-proposals", es: "propuestas-comerciales", en: "sales-proposals" },
  { key: "product.sales-analytics", es: "analiticas-ventas", en: "sales-analytics" },
  { key: "product.prospect-finder", es: "buscador-de-prospectos", en: "prospect-finder" },
  { key: "product.landing-pages", es: "landings-de-captacion", en: "lead-capture-landings" },

  // Industries
  { key: "industries.index", es: "sectores", en: "industries" },
  { key: "industry.marketing-agencies", es: "sectores/agencias-marketing", en: "industries/marketing-agencies" },
  { key: "industry.real-estate", es: "sectores/inmobiliarias", en: "industries/real-estate" },
  { key: "industry.clinics", es: "sectores/clinicas", en: "industries/clinics" },
  { key: "industry.car-dealerships", es: "sectores/concesionarios", en: "industries/car-dealerships" },
  { key: "industry.saas", es: "sectores/saas", en: "industries/saas" },
  { key: "industry.education", es: "sectores/educacion", en: "industries/education" },
  { key: "industry.professional-services", es: "sectores/servicios-profesionales", en: "industries/professional-services" },
  { key: "industry.veterinary", es: "sectores/veterinarias", en: "industries/veterinary-clinics" },
  { key: "industry.pet-grooming", es: "sectores/peluquerias-caninas", en: "industries/pet-grooming" },
  { key: "industry.call-centers", es: "sectores/call-centers", en: "industries/call-centers" },
  { key: "industry.dental-clinics", es: "sectores/clinicas-dentales", en: "industries/dental-clinics" },
  { key: "industry.aesthetics", es: "sectores/estetica-belleza", en: "industries/beauty-aesthetics" },
  { key: "industry.home-services", es: "sectores/reformas-servicios-hogar", en: "industries/home-services" },
  { key: "industry.insurance", es: "sectores/seguros", en: "industries/insurance" },
  { key: "industry.gyms", es: "sectores/gimnasios", en: "industries/gyms" },
  { key: "industry.restaurants", es: "sectores/restaurantes", en: "industries/restaurants" },
  { key: "industry.law-firms", es: "sectores/despachos-abogados", en: "industries/law-firms" },
  { key: "industry.physiotherapy", es: "sectores/fisioterapia", en: "industries/physiotherapy" },

  // Comparisons
  { key: "comparisons.index", es: "comparativas", en: "comparisons" },
  { key: "comparison.hubspot", es: "comparativas/vendrava-vs-hubspot", en: "comparisons/vendrava-vs-hubspot" },
  { key: "comparison.salesforce", es: "comparativas/vendrava-vs-salesforce", en: "comparisons/vendrava-vs-salesforce" },
  { key: "comparison.pipedrive", es: "comparativas/vendrava-vs-pipedrive", en: "comparisons/vendrava-vs-pipedrive" },
  { key: "comparison.zoho", es: "comparativas/vendrava-vs-zoho", en: "comparisons/vendrava-vs-zoho" },
  { key: "comparison.close", es: "comparativas/vendrava-vs-close", en: "comparisons/vendrava-vs-close" },
  { key: "comparison.gohighlevel", es: "comparativas/vendrava-vs-gohighlevel", en: "comparisons/vendrava-vs-gohighlevel" },
  { key: "comparison.kommo", es: "comparativas/vendrava-vs-kommo", en: "comparisons/vendrava-vs-kommo" },
  { key: "comparison.retell", es: "comparativas/vendrava-vs-retell", en: "comparisons/vendrava-vs-retell" },
  { key: "comparison.respond-io", es: "comparativas/vendrava-vs-respond-io", en: "comparisons/vendrava-vs-respond-io" },

  // Resources
  { key: "resources.index", es: "recursos", en: "resources" },
  { key: "resources.blog", es: "recursos/blog", en: "resources/blog" },
  { key: "resources.guides", es: "recursos/guias", en: "resources/guides" },
  { key: "resources.case-studies", es: "recursos/casos-exito", en: "resources/case-studies" },
  { key: "resources.glossary", es: "recursos/glosario", en: "resources/glossary" },

  // Blog posts
  { key: "blog.what-is-ai-crm", es: "recursos/blog/que-es-un-crm-con-ia", en: "resources/blog/what-is-an-ai-crm" },
  { key: "blog.traditional-vs-ai-crm", es: "recursos/blog/crm-tradicional-vs-crm-con-ia", en: "resources/blog/traditional-crm-vs-ai-crm" },
  { key: "blog.what-are-ai-voice-agents", es: "recursos/blog/que-son-agentes-ia-de-voz", en: "resources/blog/what-are-ai-voice-agents" },
  { key: "blog.how-ai-calls-work", es: "recursos/blog/como-funcionan-las-llamadas-con-ia", en: "resources/blog/how-ai-calls-work" },
  { key: "blog.qualify-leads-by-phone-ai", es: "recursos/blog/calificar-leads-por-telefono-con-ia", en: "resources/blog/qualify-leads-by-phone-with-ai" },
  { key: "blog.what-is-sales-automation", es: "recursos/blog/que-es-la-automatizacion-de-ventas", en: "resources/blog/what-is-sales-automation" },
  { key: "blog.speed-to-lead", es: "recursos/blog/tiempo-de-respuesta-comercial-speed-to-lead", en: "resources/blog/speed-to-lead" },
  { key: "blog.ai-cold-calling", es: "recursos/blog/llamadas-en-frio-con-ia", en: "resources/blog/ai-cold-calling" },
  { key: "blog.what-is-whatsapp-crm", es: "recursos/blog/que-es-whatsapp-crm", en: "resources/blog/what-is-whatsapp-crm" },
  { key: "blog.automate-whatsapp-sales", es: "recursos/blog/como-automatizar-whatsapp-para-ventas", en: "resources/blog/automate-whatsapp-for-sales" },
  { key: "blog.whatsapp-api-vs-app", es: "recursos/blog/whatsapp-business-api-vs-app", en: "resources/blog/whatsapp-business-api-vs-app" },
  { key: "blog.what-is-growth-marketing-hub", es: "recursos/blog/que-es-un-growth-marketing-hub", en: "resources/blog/what-is-a-growth-marketing-hub" },
  { key: "blog.unite-crm-growth", es: "recursos/blog/como-unir-crm-y-growth-marketing", en: "resources/blog/unite-crm-and-growth-marketing" },
  { key: "blog.reactivate-cold-leads", es: "recursos/blog/como-recuperar-leads-frios", en: "resources/blog/how-to-reactivate-cold-leads" },
  { key: "blog.multichannel-automation", es: "recursos/blog/automatizacion-multicanal-ventas", en: "resources/blog/multichannel-sales-automation" },
  { key: "blog.voicebot-vs-ai-agent", es: "recursos/blog/voicebot-vs-agente-ia-de-ventas", en: "resources/blog/voicebot-vs-ai-sales-agent" },
  { key: "blog.setup-first-voice-agent", es: "recursos/blog/guia-primer-agente-de-voz-ia", en: "resources/blog/guide-first-ai-voice-agent" },
  { key: "blog.automate-followup-playbook", es: "recursos/blog/guia-automatizar-seguimiento-leads", en: "resources/blog/guide-automate-lead-follow-up" },
  { key: "blog.whatsapp-templates-playbook", es: "recursos/blog/guia-plantillas-whatsapp-ventas", en: "resources/blog/guide-whatsapp-templates-sales" },
  { key: "blog.ai-calling-compliance-playbook", es: "recursos/blog/guia-cumplimiento-llamadas-ia", en: "resources/blog/guide-ai-calling-compliance" },

  // Core commercial pages
  { key: "pricing", es: "precios", en: "pricing" },
  { key: "demo", es: "demo", en: "demo" },
  { key: "security", es: "seguridad", en: "security" },
  { key: "contact", es: "contacto", en: "contact" },

  // Legal
  { key: "legal.privacy", es: "legal/privacidad", en: "legal/privacy" },
  { key: "legal.terms", es: "legal/terminos", en: "legal/terms" },
  { key: "legal.cookies", es: "legal/cookies", en: "legal/cookies" },
];

const ROUTES_BY_KEY = new Map(ROUTES.map((r) => [r.key, r]));

export function getRoute(key: string): RouteEntry {
  const route = ROUTES_BY_KEY.get(key);
  if (!route) throw new Error(`Unknown route key: ${key}`);
  return route;
}

export function pathFor(key: string, locale: Locale): string {
  const route = getRoute(key);
  const path = route[locale];
  // Trailing slash to match the static export (<route>/index.html on Apache).
  return path ? `/${locale}/${path}/` : `/${locale}/`;
}

/**
 * Given the current pathname (including locale prefix), returns the
 * equivalent pathname in the target locale. Falls back to the target
 * locale's home page when no match is found.
 */
export function equivalentPath(currentPath: string, currentLocale: Locale, targetLocale: Locale): string {
  const prefix = `/${currentLocale}`;
  const rest = currentPath.startsWith(prefix) ? currentPath.slice(prefix.length) : currentPath;
  const normalized = rest.replace(/^\/+/, "").replace(/\/+$/, "");

  const match = ROUTES.find((r) => r[currentLocale] === normalized);
  if (!match) return `/${targetLocale}/`;
  const targetPath = match[targetLocale];
  return targetPath ? `/${targetLocale}/${targetPath}/` : `/${targetLocale}/`;
}

export function findRouteByLocalePath(locale: Locale, path: string): RouteEntry | undefined {
  const normalized = path.replace(/^\/+/, "");
  return ROUTES.find((r) => r[locale] === normalized);
}
