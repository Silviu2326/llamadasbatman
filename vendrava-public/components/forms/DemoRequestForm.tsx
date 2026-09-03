import type { Locale } from "@/types/locale";
import { LeadCaptureForm, type LeadCaptureField } from "./LeadCaptureForm";

const NEEDS = {
  es: [
    { value: "calls", label: "Quiero automatizar llamadas" },
    { value: "leads", label: "Quiero mejorar gestión de leads" },
    { value: "followup", label: "Quiero automatizar seguimiento" },
    { value: "growth", label: "Quiero CRM + Growth Marketing" },
    { value: "whatsapp-email", label: "Quiero WhatsApp / email automation" },
    { value: "general", label: "Quiero una demo general" },
  ],
  en: [
    { value: "calls", label: "I want to automate calls" },
    { value: "leads", label: "I want to improve lead management" },
    { value: "followup", label: "I want to automate follow-up" },
    { value: "growth", label: "I want CRM + Growth Marketing" },
    { value: "whatsapp-email", label: "I want WhatsApp / email automation" },
    { value: "general", label: "I want a general demo" },
  ],
};

const COPY = {
  es: {
    name: "Nombre",
    email: "Email corporativo",
    phone: "Teléfono",
    company: "Empresa",
    country: "País",
    website: "Sitio web",
    volume: "Volumen aproximado de leads mensuales",
    need: "Principal necesidad",
    message: "Mensaje",
    messagePh: "Cuéntanos brevemente tu caso",
    submit: "Solicitar demo de Vendrava",
    note: "Sin compromiso inicial. Créditos de IA incluidos en la demo.",
    successTitle: "Solicitud recibida",
    successText: "Gracias por tu interés en Vendrava. Nuestro equipo revisará tu solicitud y se pondrá en contacto contigo en breve.",
  },
  en: {
    name: "Name",
    email: "Business email",
    phone: "Phone",
    company: "Company",
    country: "Country",
    website: "Website",
    volume: "Approximate monthly lead volume",
    need: "Main need",
    message: "Message",
    messagePh: "Tell us briefly about your case",
    submit: "Book a Vendrava demo",
    note: "No initial commitment. AI credits included in the demo.",
    successTitle: "Request received",
    successText: "Thanks for your interest in Vendrava. Our team will review your request and get back to you shortly.",
  },
};

export function DemoRequestForm({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const fields: LeadCaptureField[] = [
    { type: "text", name: "name", label: copy.name, required: true },
    { type: "email", name: "email", label: copy.email, required: true },
    { type: "tel", name: "phone", label: copy.phone },
    { type: "text", name: "company", label: copy.company, required: true },
    { type: "text", name: "country", label: copy.country },
    { type: "url", name: "website", label: copy.website },
    { type: "text", name: "volume", label: copy.volume },
    { type: "select", name: "need", label: copy.need, options: NEEDS[locale], required: true },
    { type: "textarea", name: "message", label: copy.message, placeholder: copy.messagePh },
  ];

  return (
    <LeadCaptureForm
      fields={fields}
      submitLabel={copy.submit}
      note={copy.note}
      successTitle={copy.successTitle}
      successText={copy.successText}
    />
  );
}
