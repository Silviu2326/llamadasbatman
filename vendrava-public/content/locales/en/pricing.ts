import type { PricingPlan } from "../es/pricing";

export const pricingEn: { tag: string; title: string; sub: string; note: string; plans: PricingPlan[] } = {
  tag: "Pricing",
  title: "Clear pricing, per account, no surprises",
  sub: "Plans priced per account (not per seat) with AI voice credits included. Voice usage beyond your bundle is billed transparently per minute, with no hidden fees.",
  note: "Prices are indicative: the final plan adapts to your volume of leads, calls and locations. Every plan includes a bundle of AI voice minutes; overage is billed transparently per minute, with no per-user add-on cost. Talk to sales for a tailored proposal.",
  plans: [
    {
      name: "Starter",
      price: "From €99/mo",
      description: "To start answering and booking leads over voice and WhatsApp.",
      cta: "Book a demo",
      features: ["Leads CRM and pipeline", "WhatsApp + email", "1 phone number", "~500 AI voice min/mo included", "Reminders and scheduling", "AI agent demo"],
    },
    {
      name: "Growth",
      price: "From €299/mo",
      description: "To activate inbound and outbound AI voice and automate follow-up.",
      cta: "Book a demo",
      recommended: true,
      features: ["Everything in Starter", "AI voice agents (inbound and outbound)", "Full Guru Supervisor", "~2,000 AI voice min/mo included", "Automations and flows", "Sales proposals", "Scheduling and lead-source integrations"],
    },
    {
      name: "Multi-location",
      price: "From €599/mo",
      description: "For chains and groups with multiple locations or teams.",
      cta: "Talk to sales",
      features: ["Everything in Growth", "Multi-location and user roles", "~6,000 AI voice min/mo included", "Growth Marketing Hub", "Advanced campaigns", "Advanced conversion analytics"],
    },
    {
      name: "Enterprise",
      price: "Talk to sales",
      description: "For high volume, white-label and custom needs.",
      cta: "Talk to sales",
      features: ["Everything in Multi-location", "White-label", "Dedicated SLA", "Advanced security and compliance", "Custom integrations", "High call volume"],
    },
  ],
};
