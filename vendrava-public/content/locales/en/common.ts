import type { CommonContent } from "@/types/content";

export const commonEn: CommonContent = {
  nav: {
    product: {
      title: "Product",
      items: [
        { label: "AI CRM", routeKey: "product.ai-crm" },
        { label: "AI Voice Agents", routeKey: "product.ai-voice-agents" },
        { label: "AI Calling", routeKey: "product.ai-calling" },
        { label: "Sales Automation", routeKey: "product.sales-automation" },
        { label: "Lead Management", routeKey: "product.lead-management" },
        { label: "Prospect Finder", routeKey: "product.prospect-finder" },
        { label: "Sales Funnels", routeKey: "product.landing-pages" },
        { label: "WhatsApp CRM", routeKey: "product.whatsapp-crm" },
        { label: "Email Marketing", routeKey: "product.email-marketing" },
        { label: "Sales Proposals", routeKey: "product.sales-proposals" },
        { label: "Sales Analytics", routeKey: "product.sales-analytics" },
      ],
    },
    solutions: "Solutions",
    industries: "Industries",
    resources: "Resources",
    pricing: "Pricing",
    security: "Security",
  },
  cta: {
    primary: "Start free demo",
    secondary: "See how it works",
    talkToSales: "Talk to sales",
    exploreAgents: "Explore AI agents",
    discover: "Discover Vendrava",
    start: "Start with Vendrava",
  },
  footer: {
    tagline: "The AI CRM that answers, qualifies and books your leads over voice and WhatsApp, with your team in control.",
    rights: "All rights reserved.",
    built: "Conversational sales software",
    languageLabel: "Language",
    columns: {
      product: {
        title: "Product",
        items: [
          { label: "AI Voice Agents", routeKey: "product.ai-voice-agents" },
          { label: "Lead Management", routeKey: "product.lead-management" },
          { label: "Sales Automation", routeKey: "product.sales-automation" },
          { label: "Growth Marketing CRM", routeKey: "product.growth-marketing-crm" },
          { label: "Sales Analytics", routeKey: "product.sales-analytics" },
        ],
      },
      industries: {
        title: "Industries",
        items: [
          { label: "Clinics", routeKey: "industry.clinics" },
          { label: "Veterinary clinics", routeKey: "industry.veterinary" },
          { label: "Pet grooming", routeKey: "industry.pet-grooming" },
          { label: "Car dealerships", routeKey: "industry.car-dealerships" },
          { label: "Real estate", routeKey: "industry.real-estate" },
          { label: "Call centers", routeKey: "industry.call-centers" },
          { label: "All industries", routeKey: "industries.index" },
        ],
      },
      resources: {
        title: "Resources",
        items: [
          { label: "Blog", routeKey: "resources.blog" },
          { label: "Guides", routeKey: "resources.guides" },
          { label: "Case studies", routeKey: "resources.case-studies" },
          { label: "Glossary", routeKey: "resources.glossary" },
        ],
      },
      company: {
        title: "Company",
        items: [
          { label: "Pricing", routeKey: "pricing" },
          { label: "Comparisons", routeKey: "comparisons.index" },
          { label: "Security", routeKey: "security" },
          { label: "Free demo", routeKey: "demo" },
          { label: "Contact", routeKey: "contact" },
        ],
      },
      legal: {
        title: "Legal",
        items: [
          { label: "Privacy", routeKey: "legal.privacy" },
          { label: "Terms", routeKey: "legal.terms" },
          { label: "Cookies", routeKey: "legal.cookies" },
        ],
      },
    },
  },
  breadcrumbHome: "Home",
  langSwitcher: { es: "ES", en: "EN" },
};
