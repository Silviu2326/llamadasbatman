import type { Locale } from "@/types/locale";
import { LeadCaptureForm, type LeadCaptureField } from "./LeadCaptureForm";

const COPY = {
  es: {
    name: "Nombre",
    email: "Email",
    company: "Empresa",
    message: "Mensaje",
    messagePh: "¿En qué podemos ayudarte?",
    submit: "Enviar mensaje",
    successTitle: "Mensaje enviado",
    successText: "Gracias por escribirnos. Te responderemos lo antes posible.",
  },
  en: {
    name: "Name",
    email: "Email",
    company: "Company",
    message: "Message",
    messagePh: "How can we help?",
    submit: "Send message",
    successTitle: "Message sent",
    successText: "Thanks for reaching out. We will get back to you as soon as possible.",
  },
};

export function ContactForm({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const fields: LeadCaptureField[] = [
    { type: "text", name: "name", label: copy.name, required: true },
    { type: "email", name: "email", label: copy.email, required: true },
    { type: "text", name: "company", label: copy.company },
    { type: "textarea", name: "message", label: copy.message, placeholder: copy.messagePh, required: true },
  ];

  return (
    <LeadCaptureForm fields={fields} submitLabel={copy.submit} successTitle={copy.successTitle} successText={copy.successText} />
  );
}
