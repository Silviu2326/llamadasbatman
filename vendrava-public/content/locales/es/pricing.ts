export interface PricingPlan {
  name: string;
  price: string;
  description: string;
  cta: string;
  recommended?: boolean;
  features: string[];
}

export const pricingEs: { tag: string; title: string; sub: string; note: string; plans: PricingPlan[] } = {
  tag: "Precios",
  title: "Precios claros, por cuenta y sin sorpresas",
  sub: "Planes por cuenta (no por asiento) con créditos de voz IA incluidos. El uso de voz por encima se factura de forma transparente por minuto, sin recargos ocultos.",
  note: "Los precios son orientativos: el plan final se adapta a tu volumen de leads, llamadas y sedes. Cada plan incluye una bolsa de minutos de voz IA; el excedente se factura por minuto de forma transparente y sin coste por usuario adicional. Habla con ventas para una propuesta a medida.",
  plans: [
    {
      name: "Arranque",
      price: "Desde 99 €/mes",
      description: "Para empezar a contestar y agendar leads por voz y WhatsApp.",
      cta: "Solicitar demo",
      features: ["CRM de leads y pipeline", "WhatsApp + email", "1 número de teléfono", "~500 min de voz IA/mes incluidos", "Recordatorios y agenda", "Demo del agente IA"],
    },
    {
      name: "Crecimiento",
      price: "Desde 299 €/mes",
      description: "Para activar la voz IA entrante y saliente y automatizar el seguimiento.",
      cta: "Solicitar demo",
      recommended: true,
      features: ["Todo lo de Arranque", "Agentes IA de voz (entrantes y salientes)", "Guru Supervisor completo", "~2.000 min de voz IA/mes incluidos", "Automatizaciones y flujos", "Propuestas comerciales", "Integraciones de agenda y fuentes de lead"],
    },
    {
      name: "Multi-sucursal",
      price: "Desde 599 €/mes",
      description: "Para cadenas y grupos con varias sedes o equipos.",
      cta: "Hablar con ventas",
      features: ["Todo lo de Crecimiento", "Multi-sede y roles por usuario", "~6.000 min de voz IA/mes incluidos", "Growth Marketing Hub", "Campañas avanzadas", "Analítica de conversión avanzada"],
    },
    {
      name: "Enterprise",
      price: "Hablar con ventas",
      description: "Para alto volumen, white-label y necesidades a medida.",
      cta: "Hablar con ventas",
      features: ["Todo lo de Multi-sucursal", "White-label", "SLA dedicado", "Seguridad y compliance avanzados", "Integraciones a medida", "Alto volumen de llamadas"],
    },
  ],
};
