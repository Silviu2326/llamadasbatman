import type { CommonContent } from "@/types/content";

export const commonEs: CommonContent = {
  nav: {
    product: {
      title: "Producto",
      items: [
        { label: "CRM con IA", routeKey: "product.ai-crm" },
        { label: "Agentes IA de voz", routeKey: "product.ai-voice-agents" },
        { label: "Llamadas IA", routeKey: "product.ai-calling" },
        { label: "Automatización de ventas", routeKey: "product.sales-automation" },
        { label: "Gestión de leads", routeKey: "product.lead-management" },
        { label: "Prospect Finder", routeKey: "product.prospect-finder" },
        { label: "Funnels de ventas", routeKey: "product.landing-pages" },
        { label: "WhatsApp CRM", routeKey: "product.whatsapp-crm" },
        { label: "Email marketing", routeKey: "product.email-marketing" },
        { label: "Propuestas comerciales", routeKey: "product.sales-proposals" },
        { label: "Analíticas de ventas", routeKey: "product.sales-analytics" },
      ],
    },
    solutions: "Soluciones",
    industries: "Sectores",
    resources: "Recursos",
    pricing: "Precios",
    security: "Seguridad",
  },
  cta: {
    primary: "Empezar demo gratis",
    secondary: "Ver cómo funciona",
    talkToSales: "Hablar con ventas",
    exploreAgents: "Explorar agentes IA",
    discover: "Descubrir Vendrava",
    start: "Empezar con Vendrava",
  },
  footer: {
    tagline: "El CRM con IA que contesta, califica y agenda tus leads por voz y WhatsApp, con tu equipo al control.",
    rights: "Todos los derechos reservados.",
    built: "Software de ventas por conversación",
    languageLabel: "Idioma",
    columns: {
      product: {
        title: "Producto",
        items: [
          { label: "Agentes IA de voz", routeKey: "product.ai-voice-agents" },
          { label: "Gestión de leads", routeKey: "product.lead-management" },
          { label: "Automatización de ventas", routeKey: "product.sales-automation" },
          { label: "CRM y Growth Marketing", routeKey: "product.growth-marketing-crm" },
          { label: "Analíticas de ventas", routeKey: "product.sales-analytics" },
        ],
      },
      industries: {
        title: "Sectores",
        items: [
          { label: "Clínicas", routeKey: "industry.clinics" },
          { label: "Veterinarias", routeKey: "industry.veterinary" },
          { label: "Peluquerías caninas", routeKey: "industry.pet-grooming" },
          { label: "Concesionarios", routeKey: "industry.car-dealerships" },
          { label: "Inmobiliarias", routeKey: "industry.real-estate" },
          { label: "Call centers", routeKey: "industry.call-centers" },
          { label: "Ver todos los sectores", routeKey: "industries.index" },
        ],
      },
      resources: {
        title: "Recursos",
        items: [
          { label: "Blog", routeKey: "resources.blog" },
          { label: "Guías", routeKey: "resources.guides" },
          { label: "Casos de éxito", routeKey: "resources.case-studies" },
          { label: "Glosario", routeKey: "resources.glossary" },
        ],
      },
      company: {
        title: "Empresa",
        items: [
          { label: "Precios", routeKey: "pricing" },
          { label: "Comparativas", routeKey: "comparisons.index" },
          { label: "Seguridad", routeKey: "security" },
          { label: "Demo gratis", routeKey: "demo" },
          { label: "Contacto", routeKey: "contact" },
        ],
      },
      legal: {
        title: "Legal",
        items: [
          { label: "Privacidad", routeKey: "legal.privacy" },
          { label: "Términos", routeKey: "legal.terms" },
          { label: "Cookies", routeKey: "legal.cookies" },
        ],
      },
    },
  },
  breadcrumbHome: "Inicio",
  langSwitcher: { es: "ES", en: "EN" },
};
