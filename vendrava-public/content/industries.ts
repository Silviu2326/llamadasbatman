import type { IndustryEntry } from "@/types/content";

export const INDUSTRIES: IndustryEntry[] = [
  // ---------------------------------------------------------------------
  // 1. Marketing agencies
  // ---------------------------------------------------------------------
  {
    id: "marketing-agencies",
    slugEs: "sectores/agencias-marketing",
    slugEn: "industries/marketing-agencies",
    es: {
      metaTitle: "CRM con IA para agencias de marketing | Vendrava",
      metaDescription:
        "Vendrava ayuda a agencias de marketing a responder y calificar leads de clientes al instante, priorizar oportunidades y centralizar el seguimiento comercial en un solo lugar.",
      navLabel: "Agencias de marketing",
      heroKicker: "Sector · Agencias de marketing",
      h1: "CRM con IA para agencias de marketing",
      heroSub:
        "Responde y califica leads de clientes al instante con IA, para que tu equipo comercial dedique tiempo solo a las oportunidades con mayor potencial.",
      painTitle: "El reto en agencias de marketing",
      pains: [
        {
          title: "Leads de campañas sin respuesta rápida",
          text: "Las campañas propias y las de clientes generan leads constantemente, pero sin respuesta inmediata muchos se enfrían o los capta la competencia.",
        },
        {
          title: "Falta de criterio para priorizar",
          text: "No todos los leads valen lo mismo: presupuesto, tipo de proyecto y urgencia varían mucho, y calificarlos a mano consume horas del equipo.",
        },
        {
          title: "Reporting disperso entre cuentas",
          text: "Con varios clientes y canales activos a la vez, es difícil tener una vista única de qué leads entraron, cómo se gestionaron y qué resultado tuvieron.",
        },
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText:
        "Vendrava centraliza los leads que llegan por formulario, WhatsApp o campañas, y usa agentes de IA por voz y mensaje para calificar el tipo de proyecto, el presupuesto estimado y la urgencia antes de pasarlo a un comercial. Así el equipo humano se enfoca en cerrar, no en filtrar, y cada cuenta gestionada mantiene su propio embudo y reporting.",
      flow: ["Lead", "IA", "Informe", "Handoff"],
      useCases: [
        "Calificación automática de leads entrantes de campañas propias y de clientes",
        "Enrutamiento de oportunidades al account manager correcto según cuenta o servicio",
        "Seguimiento automatizado por email y WhatsApp a leads que no responden a la primera",
        "Informes de rendimiento de leads por cliente para reuniones de reporting",
      ],
      automations: [
        "Llamada o mensaje de calificación inicial en cuanto entra un lead",
        "Creación automática de oportunidad y asignación por cuenta o servicio",
        "Recordatorios y reenganche a leads que quedaron sin respuesta",
        "Envío de propuesta o agenda de reunión cuando el lead califica",
      ],
      kpis: [
        { value: "3.1×", label: "respuesta más rápida a leads de clientes" },
        { value: "+35%", label: "oportunidades calificadas por mes" },
        { value: "24/7", label: "cobertura de leads entrantes" },
      ],
      faq: [
        {
          q: "¿Vendrava sirve para gestionar leads de varios clientes a la vez?",
          a: "Sí. Vendrava permite organizar leads, embudos y automatizaciones por cuenta o cliente, manteniendo el reporting separado dentro de un mismo CRM.",
        },
        {
          q: "¿La IA reemplaza al equipo de la agencia?",
          a: "No. Vendrava ayuda a calificar y dar seguimiento inicial a los leads, pero las decisiones estratégicas, la creatividad y el cierre siguen en manos del equipo humano.",
        },
        {
          q: "¿Puede integrarse con las herramientas que ya usamos para campañas?",
          a: "Vendrava está diseñado para centralizar leads que llegan desde formularios web, landing pages, WhatsApp y otros canales habituales de captación en agencias.",
        },
        {
          q: "¿Cómo se prioriza qué leads atender primero?",
          a: "El sistema califica automáticamente cada lead según los criterios que definas (presupuesto, tipo de proyecto, urgencia) y ordena la lista para que el equipo comercial vea primero lo más relevante.",
        },
        {
          q: "¿Sirve para agencias pequeñas o solo para agencias grandes?",
          a: "Vendrava está pensado para escalar: agencias pequeñas pueden empezar con lo esencial y añadir más automatizaciones y cuentas a medida que crecen.",
        },
      ],
      ctaTitle: "Responde a los leads de tus clientes antes que nadie",
      ctaSub:
        "Prueba Vendrava y descubre cómo centralizar la calificación y el seguimiento comercial de todas tus cuentas.",
    },
    en: {
      metaTitle: "AI CRM for marketing agencies | Vendrava",
      metaDescription:
        "Vendrava helps marketing agencies respond to and qualify client leads instantly, prioritize opportunities, and centralize sales follow-up in one place.",
      navLabel: "Marketing agencies",
      heroKicker: "Industry · Marketing agencies",
      h1: "AI CRM for marketing agencies",
      heroSub:
        "Respond to and qualify client leads instantly with AI, so your sales team spends time only on the opportunities with the most potential.",
      painTitle: "The marketing agency challenge",
      pains: [
        {
          title: "Campaign leads without a fast response",
          text: "In-house and client campaigns generate leads constantly, but without an immediate response many go cold or get picked up by a competitor.",
        },
        {
          title: "No consistent way to prioritize",
          text: "Not every lead is worth the same: budget, project type, and urgency vary widely, and qualifying them manually eats up the team's hours.",
        },
        {
          title: "Reporting scattered across accounts",
          text: "With several clients and channels running at once, it's hard to get a single view of which leads came in, how they were handled, and what happened next.",
        },
      ],
      howTitle: "How Vendrava helps",
      howText:
        "Vendrava centralizes leads coming from forms, WhatsApp, or campaigns, and uses voice and messaging AI agents to qualify project type, estimated budget, and urgency before handing them to a rep. That lets the human team focus on closing instead of filtering, while each managed account keeps its own pipeline and reporting.",
      flow: ["Lead", "AI", "Report", "Handoff"],
      useCases: [
        "Automatic qualification of inbound leads from in-house and client campaigns",
        "Routing opportunities to the right account manager by account or service line",
        "Automated email and WhatsApp follow-up for leads that don't respond right away",
        "Lead performance reports per client for reporting meetings",
      ],
      automations: [
        "Initial qualification call or message as soon as a lead comes in",
        "Automatic opportunity creation and assignment by account or service",
        "Reminders and re-engagement for leads that went unanswered",
        "Proposal delivery or meeting scheduling once a lead qualifies",
      ],
      kpis: [
        { value: "3.1×", label: "faster response to client leads" },
        { value: "+35%", label: "more qualified opportunities per month" },
        { value: "24/7", label: "inbound lead coverage" },
      ],
      faq: [
        {
          q: "Can Vendrava manage leads for multiple clients at once?",
          a: "Yes. Vendrava lets you organize leads, pipelines, and automations by account or client, keeping reporting separate within a single CRM.",
        },
        {
          q: "Does the AI replace the agency's team?",
          a: "No. Vendrava helps qualify and follow up with leads early on, but strategy, creative work, and closing stay in the hands of the human team.",
        },
        {
          q: "Can it integrate with the tools we already use for campaigns?",
          a: "Vendrava is designed to centralize leads arriving from web forms, landing pages, WhatsApp, and other common acquisition channels used by agencies.",
        },
        {
          q: "How does it decide which leads to prioritize?",
          a: "The system automatically scores each lead against the criteria you define (budget, project type, urgency) and ranks the list so the sales team sees what matters most first.",
        },
        {
          q: "Is this only for large agencies, or does it work for small ones too?",
          a: "Vendrava is built to scale: smaller agencies can start with the essentials and add more automations and accounts as they grow.",
        },
      ],
      ctaTitle: "Respond to your clients' leads before anyone else does",
      ctaSub:
        "Try Vendrava and see how to centralize qualification and follow-up across all your accounts.",
    },
  },

  // ---------------------------------------------------------------------
  // 2. Real estate
  // ---------------------------------------------------------------------
  {
    id: "real-estate",
    slugEs: "sectores/inmobiliarias",
    slugEn: "industries/real-estate",
    es: {
      metaTitle: "CRM con IA para inmobiliarias | Vendrava",
      metaDescription:
        "Vendrava ayuda a inmobiliarias a contactar, calificar y agendar visitas con IA mientras el lead sigue caliente, reduciendo tiempos de respuesta y visitas perdidas.",
      navLabel: "Inmobiliarias",
      heroKicker: "Sector · Inmobiliarias",
      h1: "CRM con IA para inmobiliarias",
      heroSub:
        "En inmobiliaria, la velocidad lo es todo. Vendrava contacta, califica y agenda visitas mientras el lead sigue caliente.",
      painTitle: "El reto en inmobiliaria",
      pains: [
        {
          title: "Leads que no responden",
          text: "Los portales generan muchos leads, pero la mayoría no contesta si tardas.",
        },
        {
          title: "Equipos saturados",
          text: "Los comerciales no pueden llamar a todos los interesados a tiempo.",
        },
        {
          title: "Visitas perdidas",
          text: "Sin seguimiento, las visitas se caen y el lead compra en otro lado.",
        },
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText:
        "Cuando un lead pide información sobre una propiedad, Vendrava lo registra y activa un agente de IA que llama o escribe en minutos, no en horas. El agente califica presupuesto, zona, urgencia y tipo de propiedad, y agenda la visita o traspasa la conversación a un agente humano con un resumen listo para actuar.",
      flow: ["Lead del portal", "Llamada IA", "Calificación", "Agendar visita"],
      useCases: [
        "Respuesta inmediata a leads de portales inmobiliarios y campañas propias",
        "Calificación de presupuesto, zona de interés, urgencia y tipo de propiedad",
        "Agendado automático de visitas presenciales o virtuales",
        "Reenganche de leads antiguos que quedaron sin cerrar",
      ],
      automations: [
        "Llamada o mensaje de IA en cuanto entra un lead del portal",
        "Calificación automática y traspaso al agente con resumen de la conversación",
        "Recordatorios de visita por WhatsApp y email para reducir ausencias",
        "Seguimiento automático a leads fríos con nuevas propiedades similares",
      ],
      kpis: [
        { value: "3.4×", label: "respuesta más rápida" },
        { value: "+38%", label: "más visitas agendadas" },
        { value: "24/7", label: "cobertura de leads" },
      ],
      faq: [
        {
          q: "¿Vendrava puede llamar a leads de portales como Idealista o Fotocasa?",
          a: "Vendrava centraliza los leads que llegan desde portales inmobiliarios y activa un agente de IA para contactarlos de forma casi inmediata, antes de que se enfríen.",
        },
        {
          q: "¿La IA reemplaza a los agentes inmobiliarios?",
          a: "No. La IA se encarga del primer contacto y la calificación; el cierre, la negociación y la relación con el cliente siguen dependiendo del agente humano.",
        },
        {
          q: "¿Cómo se agendan las visitas?",
          a: "Una vez calificado el lead, Vendrava puede proponer horarios disponibles y confirmar la visita directamente, o traspasar la conversación a un agente para que la cierre.",
        },
        {
          q: "¿Qué pasa con los leads que no contestan a la primera?",
          a: "Vendrava automatiza el reenganche con mensajes de seguimiento espaciados en el tiempo, para recuperar interesados que no respondieron de inmediato.",
        },
        {
          q: "¿Sirve para inmobiliarias con varias oficinas o carteras grandes?",
          a: "Sí, Vendrava permite organizar leads y propiedades por oficina, zona o agente, manteniendo el seguimiento centralizado.",
        },
      ],
      ctaTitle: "No dejes que un lead caliente se enfríe",
      ctaSub:
        "Prueba Vendrava y agenda más visitas contactando a tus leads en minutos, no en horas.",
    },
    en: {
      metaTitle: "AI CRM for real estate teams | Vendrava",
      metaDescription:
        "Vendrava helps real estate teams contact, qualify, and book visits with AI while the lead is still warm, cutting response times and missed showings.",
      navLabel: "Real estate",
      heroKicker: "Industry · Real estate",
      h1: "AI CRM for real estate teams",
      heroSub:
        "In real estate, speed is everything. Vendrava contacts, qualifies and books visits while the lead is still warm.",
      painTitle: "The real estate challenge",
      pains: [
        {
          title: "Leads that go unanswered",
          text: "Portals generate plenty of leads, but most won't respond if you're slow to follow up.",
        },
        {
          title: "Overloaded teams",
          text: "Agents can't call every interested buyer or renter in time.",
        },
        {
          title: "Missed visits",
          text: "Without follow-up, visits fall through and the lead buys elsewhere.",
        },
      ],
      howTitle: "How Vendrava helps",
      howText:
        "When a lead asks about a property, Vendrava logs it and triggers an AI agent that calls or messages within minutes, not hours. The agent qualifies budget, area, urgency, and property type, then books the visit or hands the conversation to a human agent with a ready-to-act summary.",
      flow: ["Portal lead", "AI call", "Qualification", "Book visit"],
      useCases: [
        "Immediate response to leads from real estate portals and in-house campaigns",
        "Qualification of budget, area of interest, urgency, and property type",
        "Automatic scheduling of in-person or virtual visits",
        "Re-engagement of older leads that never closed",
      ],
      automations: [
        "AI call or message as soon as a portal lead comes in",
        "Automatic qualification and handoff to the agent with a conversation summary",
        "Visit reminders via WhatsApp and email to reduce no-shows",
        "Automatic follow-up to cold leads with similar new listings",
      ],
      kpis: [
        { value: "3.4×", label: "faster response" },
        { value: "+38%", label: "more visits booked" },
        { value: "24/7", label: "lead coverage" },
      ],
      faq: [
        {
          q: "Can Vendrava call leads from portals like Zillow or Rightmove?",
          a: "Vendrava centralizes leads coming from real estate portals and triggers an AI agent to contact them almost immediately, before they go cold.",
        },
        {
          q: "Does the AI replace real estate agents?",
          a: "No. The AI handles first contact and qualification; closing, negotiation, and the client relationship remain with the human agent.",
        },
        {
          q: "How are visits scheduled?",
          a: "Once a lead is qualified, Vendrava can propose available time slots and confirm the visit directly, or hand the conversation to an agent to close it.",
        },
        {
          q: "What happens with leads that don't respond right away?",
          a: "Vendrava automates re-engagement with follow-up messages spaced over time, to recover interested leads who didn't reply immediately.",
        },
        {
          q: "Does it work for agencies with multiple offices or large listing portfolios?",
          a: "Yes, Vendrava lets you organize leads and listings by office, area, or agent while keeping follow-up centralized.",
        },
      ],
      ctaTitle: "Don't let a warm lead go cold",
      ctaSub:
        "Try Vendrava and book more visits by reaching your leads in minutes, not hours.",
    },
  },

  // ---------------------------------------------------------------------
  // 3. Clinics
  // ---------------------------------------------------------------------
  {
    id: "clinics",
    slugEs: "sectores/clinicas",
    slugEn: "industries/clinics",
    es: {
      metaTitle: "CRM con IA para clínicas | Vendrava",
      metaDescription:
        "Vendrava ayuda a clínicas y centros de salud a reducir llamadas perdidas y agendar consultas más rápido con IA, dejando siempre el criterio clínico en manos del equipo humano.",
      navLabel: "Clínicas",
      heroKicker: "Sector · Clínicas",
      h1: "CRM con IA para clínicas",
      heroSub:
        "Reduce llamadas perdidas y agenda consultas más rápido. Vendrava se encarga de la recepción y el seguimiento administrativo, no de decisiones clínicas.",
      painTitle: "El reto en clínicas",
      pains: [
        {
          title: "Llamadas perdidas en horas punta",
          text: "La recepción no da abasto para atender todas las llamadas, y muchos pacientes potenciales cuelgan sin agendar cita.",
        },
        {
          title: "Agenda descoordinada",
          text: "Coordinar citas, cambios y cancelaciones a mano genera huecos vacíos y errores en la agenda de los profesionales.",
        },
        {
          title: "Seguimiento de consultas informativas",
          text: "Muchas personas preguntan por tratamientos o precios y no vuelven a contactar si no reciben una respuesta rápida y clara.",
        },
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText:
        "Vendrava atiende llamadas y mensajes entrantes con un agente de IA que identifica el motivo de contacto, ofrece información general y ayuda a agendar la cita con el profesional adecuado. El equipo administrativo y clínico mantiene el control total sobre la agenda y las decisiones médicas; Vendrava solo agiliza la parte operativa de captación y agendado.",
      flow: ["Llamada", "IA", "Motivo", "Cita"],
      useCases: [
        "Atención de llamadas y mensajes fuera de horario o en horas punta",
        "Calificación del motivo de contacto antes de agendar la cita",
        "Recordatorios automáticos de citas para reducir ausencias",
        "Seguimiento a consultas informativas sobre tratamientos o precios",
      ],
      automations: [
        "Respuesta automática a llamadas y mensajes entrantes con IA",
        "Agendado y reprogramación de citas según disponibilidad",
        "Recordatorios de cita por WhatsApp, SMS o email",
        "Reenganche a pacientes potenciales que preguntaron y no agendaron",
      ],
      kpis: [
        { value: "2.8×", label: "menos llamadas perdidas" },
        { value: "+30%", label: "más citas agendadas" },
        { value: "24/7", label: "atención de consultas entrantes" },
      ],
      faq: [
        {
          q: "¿La IA de Vendrava da diagnósticos o recomendaciones médicas?",
          a: "No. Vendrava se limita a la gestión administrativa de contactos y citas; cualquier valoración clínica o diagnóstico depende siempre del personal médico.",
        },
        {
          q: "¿Puede Vendrava reemplazar a la recepción de la clínica?",
          a: "No está pensado para sustituir al personal, sino para apoyarlo: absorbe el volumen de llamadas y mensajes repetitivos para que el equipo se enfoque en los pacientes presentes y en tareas que requieren criterio humano.",
        },
        {
          q: "¿Cómo se gestionan los datos de los pacientes?",
          a: "Vendrava centraliza la información de contacto y el historial de comunicación necesario para la gestión comercial y de citas, dentro de un sistema pensado para el manejo responsable de datos.",
        },
        {
          q: "¿Sirve para clínicas con varias especialidades?",
          a: "Sí, permite dirigir cada consulta al profesional o especialidad correspondiente según el motivo de contacto que identifique la IA.",
        },
        {
          q: "¿Qué pasa si el paciente necesita hablar con una persona?",
          a: "En cualquier momento la conversación puede traspasarse a un miembro del equipo humano, especialmente ante dudas clínicas o casos que requieran atención personalizada.",
        },
      ],
      ctaTitle: "Menos llamadas perdidas, más consultas agendadas",
      ctaSub:
        "Prueba Vendrava y descubre cómo agilizar la recepción y el agendado de tu clínica sin perder el control del criterio clínico.",
    },
    en: {
      metaTitle: "AI CRM for clinics | Vendrava",
      metaDescription:
        "Vendrava helps clinics and health centers cut missed calls and book appointments faster with AI, while clinical judgment always stays with the human team.",
      navLabel: "Clinics",
      heroKicker: "Industry · Clinics",
      h1: "AI CRM for clinics",
      heroSub:
        "Cut missed calls and book appointments faster. Vendrava handles front-desk and follow-up admin work, not clinical decisions.",
      painTitle: "The clinic challenge",
      pains: [
        {
          title: "Missed calls during peak hours",
          text: "Front-desk staff can't keep up with every call, and many prospective patients hang up without booking an appointment.",
        },
        {
          title: "Uncoordinated scheduling",
          text: "Manually coordinating appointments, changes, and cancellations creates gaps and errors in providers' schedules.",
        },
        {
          title: "Unfollowed informational inquiries",
          text: "Many people ask about treatments or pricing and never reach back out if they don't get a quick, clear answer.",
        },
      ],
      howTitle: "How Vendrava helps",
      howText:
        "Vendrava handles inbound calls and messages with an AI agent that identifies the reason for contact, shares general information, and helps book the appointment with the right provider. The administrative and clinical team keeps full control over the schedule and medical decisions; Vendrava only speeds up the operational side of intake and booking.",
      flow: ["Call", "AI", "Reason", "Appointment"],
      useCases: [
        "Handling calls and messages after hours or during peak times",
        "Qualifying the reason for contact before booking the appointment",
        "Automatic appointment reminders to reduce no-shows",
        "Follow-up on informational inquiries about treatments or pricing",
      ],
      automations: [
        "Automatic AI response to inbound calls and messages",
        "Scheduling and rescheduling appointments based on availability",
        "Appointment reminders via WhatsApp, SMS, or email",
        "Re-engagement of prospective patients who asked but never booked",
      ],
      kpis: [
        { value: "2.8×", label: "fewer missed calls" },
        { value: "+30%", label: "more appointments booked" },
        { value: "24/7", label: "coverage for inbound inquiries" },
      ],
      faq: [
        {
          q: "Does Vendrava's AI give diagnoses or medical advice?",
          a: "No. Vendrava is limited to administrative contact and appointment management; any clinical assessment or diagnosis always depends on medical staff.",
        },
        {
          q: "Can Vendrava replace the clinic's front desk?",
          a: "It isn't meant to replace staff, but to support them: it absorbs the volume of repetitive calls and messages so the team can focus on patients on-site and tasks that require human judgment.",
        },
        {
          q: "How is patient data handled?",
          a: "Vendrava centralizes the contact information and communication history needed for scheduling and follow-up, within a system built for responsible data handling.",
        },
        {
          q: "Does it work for clinics with multiple specialties?",
          a: "Yes, it can route each inquiry to the right provider or specialty based on the reason for contact identified by the AI.",
        },
        {
          q: "What happens if a patient needs to speak with a person?",
          a: "The conversation can be handed off to a human team member at any point, especially for clinical questions or cases that need personalized attention.",
        },
      ],
      ctaTitle: "Fewer missed calls, more appointments booked",
      ctaSub:
        "Try Vendrava and see how to streamline your clinic's front desk and scheduling without losing control of clinical judgment.",
    },
  },

  // ---------------------------------------------------------------------
  // 4. Car dealerships
  // ---------------------------------------------------------------------
  {
    id: "car-dealerships",
    slugEs: "sectores/concesionarios",
    slugEn: "industries/car-dealerships",
    es: {
      metaTitle: "CRM con IA para concesionarios | Vendrava",
      metaDescription:
        "Vendrava ayuda a concesionarios a filtrar compradores reales y agendar pruebas de manejo con IA, calificando presupuesto, financiación y plazo de compra antes de pasar el lead al equipo comercial.",
      navLabel: "Concesionarios",
      heroKicker: "Sector · Concesionarios",
      h1: "CRM con IA para concesionarios",
      heroSub:
        "Filtra compradores reales y agenda pruebas de manejo. Vendrava califica cada lead antes de que tu equipo invierta tiempo en él.",
      painTitle: "El reto en concesionarios",
      pains: [
        {
          title: "Muchos leads, pocos compradores reales",
          text: "Los portales de coches y las campañas generan muchas consultas, pero una parte importante solo compara precios sin intención real de compra a corto plazo.",
        },
        {
          title: "Financiación y trámites que ralentizan el cierre",
          text: "Aclarar financiación, vehículo de entrega y forma de pago a mano alarga el proceso y hace perder oportunidades frente a otros concesionarios.",
        },
        {
          title: "Pruebas de manejo sin confirmar",
          text: "Sin un recordatorio y seguimiento adecuado, muchas pruebas de manejo agendadas terminan en ausencias.",
        },
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText:
        "Cuando un lead pregunta por un modelo, Vendrava detecta el interés y activa un agente de IA que califica presupuesto, interés en financiación, vehículo actual y plazo de compra. Con esa información agenda una llamada o visita con el comercial, o envía seguimiento por email y WhatsApp para mantener el interés vivo hasta la prueba de manejo.",
      flow: ["Lead", "Llamada IA", "Financiación", "Test drive"],
      useCases: [
        "Calificación de leads de portales de coches y campañas propias",
        "Identificación de interés en financiación y vehículo de entrega",
        "Agendado y confirmación de pruebas de manejo",
        "Seguimiento a leads que comparan precios antes de decidir",
      ],
      automations: [
        "Llamada o mensaje de IA al recibir una consulta sobre un modelo",
        "Calificación de presupuesto, financiación y plazo de compra",
        "Recordatorios automáticos de la prueba de manejo agendada",
        "Seguimiento por email y WhatsApp a leads indecisos",
      ],
      kpis: [
        { value: "3×", label: "más leads calificados como compradores reales" },
        { value: "+27%", label: "más pruebas de manejo confirmadas" },
        { value: "24/7", label: "respuesta a consultas sobre vehículos" },
      ],
      faq: [
        {
          q: "¿Vendrava puede calificar el interés en financiación de cada lead?",
          a: "Sí, el agente de IA pregunta por la forma de pago prevista y el interés en financiación como parte de la calificación inicial, y traslada esa información al comercial.",
        },
        {
          q: "¿La IA reemplaza al vendedor del concesionario?",
          a: "No. La IA se encarga del primer contacto y la calificación; la negociación, la prueba de manejo y el cierre los realiza el equipo comercial.",
        },
        {
          q: "¿Cómo se evita perder pruebas de manejo agendadas?",
          a: "Vendrava envía recordatorios automáticos antes de la cita y puede reprogramar fácilmente si el cliente necesita cambiar el horario.",
        },
        {
          q: "¿Sirve para concesionarios con varias marcas o sedes?",
          a: "Sí, los leads y las automatizaciones pueden organizarse por marca, modelo o sede, manteniendo el seguimiento centralizado.",
        },
        {
          q: "¿Qué pasa con los leads que solo están comparando precios?",
          a: "Vendrava los identifica dentro del proceso de calificación y activa un seguimiento más espaciado, sin ocupar el tiempo del equipo comercial hasta que muestren intención real de compra.",
        },
      ],
      ctaTitle: "Convierte más consultas en pruebas de manejo",
      ctaSub:
        "Prueba Vendrava y descubre cómo calificar compradores reales antes de que tu equipo comercial invierta tiempo en ellos.",
    },
    en: {
      metaTitle: "AI CRM for car dealerships | Vendrava",
      metaDescription:
        "Vendrava helps car dealerships filter real buyers and book test drives with AI, qualifying budget, financing, and purchase timeline before handing the lead to sales.",
      navLabel: "Car dealerships",
      heroKicker: "Industry · Car dealerships",
      h1: "AI CRM for car dealerships",
      heroSub:
        "Filter real buyers and book test drives. Vendrava qualifies every lead before your team invests time in it.",
      painTitle: "The car dealership challenge",
      pains: [
        {
          title: "Lots of leads, few real buyers",
          text: "Car portals and campaigns generate plenty of inquiries, but a large share are just comparing prices with no real short-term intent to buy.",
        },
        {
          title: "Financing and paperwork slow down closing",
          text: "Manually sorting out financing, trade-ins, and payment method lengthens the process and loses deals to other dealerships.",
        },
        {
          title: "Unconfirmed test drives",
          text: "Without proper reminders and follow-up, many scheduled test drives end up as no-shows.",
        },
      ],
      howTitle: "How Vendrava helps",
      howText:
        "When a lead asks about a model, Vendrava detects the interest and triggers an AI agent that qualifies budget, interest in financing, current vehicle, and purchase timeline. With that information it books a call or visit with the sales rep, or sends email and WhatsApp follow-up to keep interest alive until the test drive.",
      flow: ["Lead", "AI call", "Financing", "Test drive"],
      useCases: [
        "Qualifying leads from car portals and in-house campaigns",
        "Identifying interest in financing and trade-in vehicles",
        "Scheduling and confirming test drives",
        "Following up with leads comparing prices before deciding",
      ],
      automations: [
        "AI call or message when an inquiry comes in about a model",
        "Qualification of budget, financing, and purchase timeline",
        "Automatic reminders for the scheduled test drive",
        "Email and WhatsApp follow-up for undecided leads",
      ],
      kpis: [
        { value: "3×", label: "more leads qualified as real buyers" },
        { value: "+27%", label: "more test drives confirmed" },
        { value: "24/7", label: "response to vehicle inquiries" },
      ],
      faq: [
        {
          q: "Can Vendrava qualify each lead's interest in financing?",
          a: "Yes, the AI agent asks about the expected payment method and interest in financing as part of the initial qualification, and passes that information to the sales rep.",
        },
        {
          q: "Does the AI replace the dealership's salesperson?",
          a: "No. The AI handles first contact and qualification; negotiation, the test drive, and closing are handled by the sales team.",
        },
        {
          q: "How does it prevent losing scheduled test drives?",
          a: "Vendrava sends automatic reminders before the appointment and can easily reschedule if the customer needs to change the time.",
        },
        {
          q: "Does it work for dealerships with multiple brands or locations?",
          a: "Yes, leads and automations can be organized by brand, model, or location, while follow-up stays centralized.",
        },
        {
          q: "What about leads who are just comparing prices?",
          a: "Vendrava identifies them during qualification and triggers a more spaced-out follow-up, without taking up the sales team's time until they show real buying intent.",
        },
      ],
      ctaTitle: "Turn more inquiries into test drives",
      ctaSub:
        "Try Vendrava and see how to qualify real buyers before your sales team spends time on them.",
    },
  },

  // ---------------------------------------------------------------------
  // 5. SaaS
  // ---------------------------------------------------------------------
  {
    id: "saas",
    slugEs: "sectores/saas",
    slugEn: "industries/saas",
    es: {
      metaTitle: "CRM con IA para empresas SaaS | Vendrava",
      metaDescription:
        "Vendrava ayuda a empresas SaaS a calificar trials y activar upgrades con seguimiento automatizado, conectando product-led growth con un proceso comercial claro.",
      navLabel: "SaaS",
      heroKicker: "Sector · Empresas SaaS",
      h1: "CRM con IA para empresas SaaS",
      heroSub:
        "Califica trials y activa upgrades con seguimiento. Vendrava ayuda a convertir señales de producto en conversaciones comerciales en el momento adecuado.",
      painTitle: "El reto en empresas SaaS",
      pains: [
        {
          title: "Trials que no se convierten",
          text: "Muchos usuarios empiezan un trial pero no llegan a activar el producto, y sin seguimiento el equipo comercial no sabe a quién priorizar.",
        },
        {
          title: "Señales de producto desconectadas de ventas",
          text: "El uso del producto indica interés real, pero esa información suele quedarse en analítica y no llega a tiempo al equipo comercial.",
        },
        {
          title: "Upsells y renovaciones reactivos",
          text: "Sin alertas automáticas, las oportunidades de upgrade o expansión se detectan tarde, cuando el cliente ya perdió interés o está evaluando alternativas.",
        },
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText:
        "Vendrava conecta las señales de actividad del trial (registro, uso de funciones clave, límites alcanzados) con agentes de IA que califican la intención de compra y activan seguimiento por email, WhatsApp o llamada. Esto permite priorizar cuentas con alto potencial de conversión o upgrade sin que el equipo comercial tenga que revisar manualmente cada cuenta.",
      flow: ["Trial", "IA", "Demo", "Upgrade"],
      useCases: [
        "Calificación automática de leads de trial según actividad de producto",
        "Activación de seguimiento comercial cuando se alcanza un límite del plan",
        "Agendado de demos para cuentas con señales de alto interés",
        "Detección de oportunidades de upsell y renovación",
      ],
      automations: [
        "Mensaje o llamada de calificación al iniciar el trial",
        "Alertas automáticas cuando una cuenta alcanza límites de uso",
        "Seguimiento a trials inactivos para reactivar el interés",
        "Notificación al equipo comercial ante señales de intención de upgrade",
      ],
      kpis: [
        { value: "2.5×", label: "más trials calificados como oportunidad" },
        { value: "+22%", label: "más upgrades activados" },
        { value: "24/7", label: "monitoreo de señales de producto" },
      ],
      faq: [
        {
          q: "¿Cómo sabe Vendrava qué trials tienen más potencial?",
          a: "Vendrava usa las señales de actividad que definas (uso de funciones clave, límites alcanzados, frecuencia de acceso) para calificar automáticamente cada cuenta y priorizar el seguimiento.",
        },
        {
          q: "¿Esto reemplaza a nuestro equipo de customer success?",
          a: "No. Vendrava ayuda a identificar y calificar oportunidades de conversión o upgrade, pero el acompañamiento estratégico del cliente sigue siendo responsabilidad del equipo humano.",
        },
        {
          q: "¿Puede integrarse con nuestro producto para leer señales de uso?",
          a: "Vendrava está diseñado para centralizar señales de actividad y comportamiento que alimenten la calificación y el seguimiento comercial dentro del CRM.",
        },
        {
          q: "¿Sirve para modelos product-led growth y sales-led growth?",
          a: "Sí, se adapta a ambos: en PLG prioriza señales de producto para activar ventas en el momento oportuno, y en sales-led refuerza la calificación y el seguimiento tradicional.",
        },
        {
          q: "¿Cómo ayuda con renovaciones y upsells?",
          a: "Vendrava puede generar alertas automáticas cuando detecta señales de expansión o riesgo de cancelación, para que el equipo actúe antes de que sea tarde.",
        },
      ],
      ctaTitle: "Convierte señales de producto en ingresos",
      ctaSub:
        "Prueba Vendrava y descubre cómo priorizar trials y cuentas con mayor potencial de conversión o upgrade.",
    },
    en: {
      metaTitle: "AI CRM for SaaS companies | Vendrava",
      metaDescription:
        "Vendrava helps SaaS companies qualify trials and drive upgrades with automated follow-up, connecting product-led growth signals to a clear sales process.",
      navLabel: "SaaS",
      heroKicker: "Industry · SaaS companies",
      h1: "AI CRM for SaaS companies",
      heroSub:
        "Qualify trials and drive upgrades with follow-up. Vendrava helps turn product signals into sales conversations at the right moment.",
      painTitle: "The SaaS challenge",
      pains: [
        {
          title: "Trials that don't convert",
          text: "Many users start a trial but never activate the product, and without follow-up the sales team doesn't know who to prioritize.",
        },
        {
          title: "Product signals disconnected from sales",
          text: "Product usage indicates real interest, but that information usually stays in analytics and never reaches the sales team in time.",
        },
        {
          title: "Reactive upsells and renewals",
          text: "Without automatic alerts, upgrade or expansion opportunities get spotted late, once the customer has lost interest or is already evaluating alternatives.",
        },
      ],
      howTitle: "How Vendrava helps",
      howText:
        "Vendrava connects trial activity signals (signup, key feature usage, limits reached) with AI agents that qualify buying intent and trigger follow-up by email, WhatsApp, or call. This makes it possible to prioritize accounts with high conversion or upgrade potential without the sales team manually reviewing every account.",
      flow: ["Trial", "AI", "Demo", "Upgrade"],
      useCases: [
        "Automatic qualification of trial leads based on product activity",
        "Triggering sales follow-up when a plan limit is reached",
        "Booking demos for accounts showing high-interest signals",
        "Detecting upsell and renewal opportunities",
      ],
      automations: [
        "Qualification message or call when the trial starts",
        "Automatic alerts when an account hits usage limits",
        "Follow-up on inactive trials to re-spark interest",
        "Notifying the sales team on upgrade-intent signals",
      ],
      kpis: [
        { value: "2.5×", label: "more trials qualified as opportunities" },
        { value: "+22%", label: "more upgrades activated" },
        { value: "24/7", label: "product signal monitoring" },
      ],
      faq: [
        {
          q: "How does Vendrava know which trials have the most potential?",
          a: "Vendrava uses the activity signals you define (key feature usage, limits reached, access frequency) to automatically qualify each account and prioritize follow-up.",
        },
        {
          q: "Does this replace our customer success team?",
          a: "No. Vendrava helps identify and qualify conversion or upgrade opportunities, but strategic customer guidance remains the responsibility of the human team.",
        },
        {
          q: "Can it integrate with our product to read usage signals?",
          a: "Vendrava is designed to centralize activity and behavior signals that feed qualification and sales follow-up within the CRM.",
        },
        {
          q: "Does it work for both product-led and sales-led growth models?",
          a: "Yes, it adapts to both: in PLG it prioritizes product signals to trigger sales at the right moment, and in sales-led it reinforces traditional qualification and follow-up.",
        },
        {
          q: "How does it help with renewals and upsells?",
          a: "Vendrava can generate automatic alerts when it detects expansion signals or churn risk, so the team can act before it's too late.",
        },
      ],
      ctaTitle: "Turn product signals into revenue",
      ctaSub:
        "Try Vendrava and see how to prioritize trials and accounts with the highest conversion or upgrade potential.",
    },
  },

  // ---------------------------------------------------------------------
  // 6. Education
  // ---------------------------------------------------------------------
  {
    id: "education",
    slugEs: "sectores/educacion",
    slugEn: "industries/education",
    es: {
      metaTitle: "CRM con IA para educación y formación | Vendrava",
      metaDescription:
        "Vendrava ayuda a centros educativos y de formación a responder consultas de matrícula al instante, calificar el interés real y agendar llamadas de admisión con IA.",
      navLabel: "Educación",
      heroKicker: "Sector · Educación y formación",
      h1: "CRM con IA para educación y formación",
      heroSub:
        "Responde a cada consulta sobre programas o cursos al instante. Vendrava califica interés, presupuesto y plazos, y agenda la llamada de admisión.",
      painTitle: "El reto en educación y formación",
      pains: [
        {
          title: "Consultas de matrícula sin respuesta rápida",
          text: "Los interesados en un programa o curso preguntan por varias opciones a la vez, y si la respuesta tarda, eligen otro centro.",
        },
        {
          title: "Equipos de admisiones saturados en campañas",
          text: "En periodos de matrícula el volumen de consultas se dispara y el equipo no llega a calificar y dar seguimiento a todos a tiempo.",
        },
        {
          title: "Abandono entre la consulta y la inscripción",
          text: "Muchos interesados piden información pero no llegan a inscribirse porque nadie retoma la conversación en el momento adecuado.",
        },
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText:
        "Cuando alguien pregunta por un programa o curso, Vendrava activa un agente de IA por voz o WhatsApp que califica el interés, el presupuesto disponible y los plazos de inicio. Con esa información agenda una llamada con el equipo de admisiones o envía la información solicitada, manteniendo el seguimiento automático hasta la inscripción.",
      flow: ["Consulta", "IA", "Calificación", "Llamada de admisión"],
      useCases: [
        "Respuesta inmediata a consultas sobre programas, cursos o becas",
        "Calificación de interés, presupuesto y plazo de inicio",
        "Agendado de llamadas o entrevistas con el equipo de admisiones",
        "Seguimiento automático a interesados que no completaron la inscripción",
      ],
      automations: [
        "Mensaje o llamada de IA al recibir una consulta sobre un programa",
        "Envío automático de información de cursos, precios y fechas",
        "Recordatorios de plazos de inscripción y documentación pendiente",
        "Reenganche a leads que mostraron interés pero no se inscribieron",
      ],
      kpis: [
        { value: "2.9×", label: "respuesta más rápida a consultas" },
        { value: "+31%", label: "más llamadas de admisión agendadas" },
        { value: "24/7", label: "cobertura en periodos de matrícula" },
      ],
      faq: [
        {
          q: "¿Vendrava puede gestionar picos de consultas en periodo de matrícula?",
          a: "Sí, la IA está diseñada para escalar y responder a un alto volumen de consultas sin perder tiempos de respuesta, incluso en campañas de admisión.",
        },
        {
          q: "¿La IA sustituye al equipo de orientación o admisiones?",
          a: "No. Vendrava se encarga de la primera respuesta y la calificación; la orientación académica y la decisión final de admisión dependen del equipo humano.",
        },
        {
          q: "¿Cómo se prioriza a los interesados con mayor intención real?",
          a: "El sistema califica automáticamente cada consulta según interés, presupuesto y plazo de inicio, para que el equipo de admisiones dedique tiempo primero a los casos más avanzados.",
        },
        {
          q: "¿Sirve para centros con varios programas o sedes?",
          a: "Sí, permite organizar las consultas por programa, curso o sede, manteniendo el seguimiento centralizado en un mismo CRM.",
        },
        {
          q: "¿Qué pasa con los interesados que piden información pero no se inscriben?",
          a: "Vendrava automatiza el seguimiento con recordatorios y mensajes espaciados en el tiempo, para recuperar interesados que no completaron la inscripción a la primera.",
        },
      ],
      ctaTitle: "Convierte más consultas en matrículas",
      ctaSub:
        "Prueba Vendrava y descubre cómo responder y calificar cada consulta educativa sin saturar a tu equipo de admisiones.",
    },
    en: {
      metaTitle: "AI CRM for education and training teams | Vendrava",
      metaDescription:
        "Vendrava helps schools and training providers respond to enrollment inquiries instantly, qualify real interest, and book admissions calls with AI.",
      navLabel: "Education",
      heroKicker: "Industry · Education and training",
      h1: "AI CRM for education and training teams",
      heroSub:
        "Respond to every inquiry about programs or courses instantly. Vendrava qualifies interest, budget, and timing, and books the admissions call.",
      painTitle: "The education and training challenge",
      pains: [
        {
          title: "Enrollment inquiries without a fast response",
          text: "Prospective students compare several options at once, and if the response is slow, they choose another school.",
        },
        {
          title: "Admissions teams overwhelmed during campaigns",
          text: "During enrollment periods, inquiry volume spikes and the team can't qualify and follow up with everyone in time.",
        },
        {
          title: "Drop-off between inquiry and enrollment",
          text: "Many prospects ask for information but never enroll because no one follows up at the right moment.",
        },
      ],
      howTitle: "How Vendrava helps",
      howText:
        "When someone asks about a program or course, Vendrava triggers a voice or WhatsApp AI agent that qualifies interest, available budget, and start timing. With that information it books a call with the admissions team or sends the requested information, keeping automatic follow-up going until enrollment.",
      flow: ["Inquiry", "AI", "Qualification", "Admissions call"],
      useCases: [
        "Immediate response to inquiries about programs, courses, or scholarships",
        "Qualifying interest, budget, and start timing",
        "Scheduling calls or interviews with the admissions team",
        "Automatic follow-up with prospects who didn't complete enrollment",
      ],
      automations: [
        "AI message or call when an inquiry about a program comes in",
        "Automatic delivery of course information, pricing, and dates",
        "Reminders for enrollment deadlines and pending documentation",
        "Re-engagement of leads who showed interest but didn't enroll",
      ],
      kpis: [
        { value: "2.9×", label: "faster response to inquiries" },
        { value: "+31%", label: "more admissions calls booked" },
        { value: "24/7", label: "coverage during enrollment periods" },
      ],
      faq: [
        {
          q: "Can Vendrava handle inquiry spikes during enrollment periods?",
          a: "Yes, the AI is designed to scale and respond to high inquiry volumes without losing response speed, even during admissions campaigns.",
        },
        {
          q: "Does the AI replace the guidance or admissions team?",
          a: "No. Vendrava handles the first response and qualification; academic guidance and the final admissions decision remain with the human team.",
        },
        {
          q: "How does it prioritize prospects with the highest real intent?",
          a: "The system automatically scores each inquiry based on interest, budget, and start timing, so the admissions team spends time first on the most advanced cases.",
        },
        {
          q: "Does it work for schools with multiple programs or campuses?",
          a: "Yes, it lets you organize inquiries by program, course, or campus, keeping follow-up centralized in one CRM.",
        },
        {
          q: "What happens with prospects who ask for information but don't enroll?",
          a: "Vendrava automates follow-up with reminders and messages spaced over time, to recover prospects who didn't complete enrollment on the first try.",
        },
      ],
      ctaTitle: "Turn more inquiries into enrollments",
      ctaSub:
        "Try Vendrava and see how to respond to and qualify every education inquiry without overwhelming your admissions team.",
    },
  },

  // ---------------------------------------------------------------------
  // 7. Professional services
  // ---------------------------------------------------------------------
  {
    id: "professional-services",
    slugEs: "sectores/servicios-profesionales",
    slugEn: "industries/professional-services",
    es: {
      metaTitle: "CRM con IA para servicios profesionales | Vendrava",
      metaDescription:
        "Vendrava ayuda a despachos y firmas de servicios profesionales a priorizar clientes de alto valor automáticamente y acelerar el paso de consulta a propuesta.",
      navLabel: "Servicios profesionales",
      heroKicker: "Sector · Servicios profesionales",
      h1: "CRM con IA para servicios profesionales",
      heroSub:
        "Prioriza clientes de alto valor automáticamente. Vendrava califica cada consulta y acelera el camino hacia la propuesta.",
      painTitle: "El reto en servicios profesionales",
      pains: [
        {
          title: "Consultas de valor muy desigual",
          text: "Despachos y consultoras reciben solicitudes muy variadas en tamaño y complejidad, y sin un criterio claro es difícil saber cuáles atender primero.",
        },
        {
          title: "Tiempo de los profesionales mal aprovechado",
          text: "Socios y consultores dedican tiempo valioso a calificar manualmente consultas que podrían filtrarse antes de llegar a ellos.",
        },
        {
          title: "Propuestas que tardan en salir",
          text: "Entre la primera consulta y el envío de la propuesta pasa demasiado tiempo, y el cliente potencial se decide por otra firma.",
        },
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText:
        "Vendrava califica automáticamente cada consulta entrante según el tipo de servicio, el volumen o complejidad estimada y la urgencia, y asigna una puntuación (score) que ayuda a priorizar qué clientes atender primero. A partir de esa calificación, puede generar automáticamente una propuesta inicial o agendar una reunión con el profesional adecuado.",
      flow: ["Lead", "Score", "Propuesta"],
      useCases: [
        "Calificación automática de consultas por tipo de servicio y complejidad",
        "Priorización de clientes de alto valor según score de calificación",
        "Generación de propuestas iniciales o agendado de reuniones",
        "Seguimiento a consultas que no avanzaron a la primera",
      ],
      automations: [
        "Calificación automática de cada consulta entrante con score de prioridad",
        "Asignación de la consulta al socio o consultor adecuado",
        "Envío de propuesta inicial o agendado de reunión según el score",
        "Recordatorios de seguimiento a consultas pendientes de respuesta",
      ],
      kpis: [
        { value: "2.7×", label: "más rápido de consulta a propuesta" },
        { value: "+29%", label: "más reuniones con clientes de alto valor" },
        { value: "24/7", label: "calificación de consultas entrantes" },
      ],
      faq: [
        {
          q: "¿Cómo decide Vendrava qué clientes son de alto valor?",
          a: "Vendrava asigna un score a cada consulta según los criterios que definas (tipo de servicio, volumen estimado, urgencia), y prioriza automáticamente las de mayor potencial.",
        },
        {
          q: "¿La IA sustituye el criterio profesional en la relación con el cliente?",
          a: "No. Vendrava ayuda a calificar y priorizar consultas entrantes, pero el asesoramiento, la propuesta de valor y la relación con el cliente dependen del profesional o socio responsable.",
        },
        {
          q: "¿Sirve para despachos con varias áreas de práctica o especialidades?",
          a: "Sí, las consultas pueden calificarse y dirigirse automáticamente al área o especialista correspondiente.",
        },
        {
          q: "¿Cómo se acelera el envío de la propuesta inicial?",
          a: "Con la información calificada de cada consulta, Vendrava puede generar una propuesta inicial o agendar directamente una reunión con el profesional indicado, reduciendo los tiempos muertos.",
        },
        {
          q: "¿Qué pasa con las consultas de menor prioridad?",
          a: "Siguen dentro del sistema con seguimiento automatizado más espaciado, para no perder oportunidades que puedan ganar relevancia más adelante.",
        },
      ],
      ctaTitle: "Prioriza a tus clientes de mayor valor de forma automática",
      ctaSub:
        "Prueba Vendrava y descubre cómo calificar y acelerar el paso de consulta a propuesta en tu firma.",
    },
    en: {
      metaTitle: "AI CRM for professional services | Vendrava",
      metaDescription:
        "Vendrava helps professional services firms prioritize high-value clients automatically and speed up the path from inquiry to proposal.",
      navLabel: "Professional services",
      heroKicker: "Industry · Professional services",
      h1: "AI CRM for professional services",
      heroSub:
        "Prioritize high-value clients automatically. Vendrava qualifies every inquiry and speeds up the path to a proposal.",
      painTitle: "The professional services challenge",
      pains: [
        {
          title: "Inquiries of very uneven value",
          text: "Firms and consultancies receive requests that vary widely in size and complexity, and without a clear framework it's hard to know which to handle first.",
        },
        {
          title: "Professionals' time poorly spent",
          text: "Partners and consultants spend valuable time manually qualifying inquiries that could be filtered before ever reaching them.",
        },
        {
          title: "Proposals that take too long to go out",
          text: "Too much time passes between the first inquiry and sending the proposal, and the prospective client decides on another firm.",
        },
      ],
      howTitle: "How Vendrava helps",
      howText:
        "Vendrava automatically qualifies each inbound inquiry based on service type, estimated volume or complexity, and urgency, assigning a score that helps prioritize which clients to handle first. Based on that score, it can automatically generate an initial proposal or schedule a meeting with the right professional.",
      flow: ["Lead", "Score", "Proposal"],
      useCases: [
        "Automatic qualification of inquiries by service type and complexity",
        "Prioritizing high-value clients based on a qualification score",
        "Generating initial proposals or scheduling meetings",
        "Following up on inquiries that stalled early on",
      ],
      automations: [
        "Automatic qualification of each inbound inquiry with a priority score",
        "Assigning the inquiry to the right partner or consultant",
        "Sending an initial proposal or scheduling a meeting based on the score",
        "Follow-up reminders for inquiries awaiting a response",
      ],
      kpis: [
        { value: "2.7×", label: "faster from inquiry to proposal" },
        { value: "+29%", label: "more meetings with high-value clients" },
        { value: "24/7", label: "qualification of inbound inquiries" },
      ],
      faq: [
        {
          q: "How does Vendrava decide which clients are high-value?",
          a: "Vendrava assigns a score to each inquiry based on the criteria you define (service type, estimated volume, urgency), and automatically prioritizes the ones with the highest potential.",
        },
        {
          q: "Does the AI replace professional judgment in the client relationship?",
          a: "No. Vendrava helps qualify and prioritize inbound inquiries, but advisory work, the value proposition, and the client relationship remain with the responsible professional or partner.",
        },
        {
          q: "Does it work for firms with multiple practice areas or specialties?",
          a: "Yes, inquiries can be automatically qualified and routed to the corresponding area or specialist.",
        },
        {
          q: "How does it speed up sending the initial proposal?",
          a: "Using the qualified information from each inquiry, Vendrava can generate an initial proposal or directly schedule a meeting with the right professional, cutting down dead time.",
        },
        {
          q: "What happens with lower-priority inquiries?",
          a: "They stay in the system with more spaced-out automated follow-up, so opportunities that may become relevant later aren't lost.",
        },
      ],
      ctaTitle: "Prioritize your highest-value clients automatically",
      ctaSub:
        "Try Vendrava and see how to qualify and speed up the path from inquiry to proposal at your firm.",
    },
  },

  // ---------------------------------------------------------------------
  // 8. Veterinary clinics (Motion A)
  // ---------------------------------------------------------------------
  {
    id: "veterinary",
    slugEs: "sectores/veterinarias",
    slugEn: "industries/veterinary-clinics",
    es: {
      metaTitle: "IA para clínicas veterinarias | Vendrava",
      metaDescription: "Vendrava contesta llamadas y WhatsApp de tu clínica veterinaria fuera de horario y en horas punta, identifica el motivo, agenda o reprograma citas y recupera no-shows. La gestión es administrativa; el criterio clínico siempre es de tu equipo.",
      navLabel: "Veterinarias",
      heroKicker: "Sector · Veterinarias",
      h1: "IA para clínicas veterinarias",
      heroSub: "En una veterinaria, una llamada perdida es un paciente perdido. Vendrava contesta por voz y WhatsApp cuando tu equipo no puede, identifica el motivo y agenda la cita, sin dar nunca consejo clínico.",
      painTitle: "El reto en clínicas veterinarias",
      pains: [
        {
          title: "Llamadas perdidas fuera de horario y en horas punta",
          text: "Entre consultas, quirófano y peluquería, el teléfono suena cuando nadie puede atenderlo. Muchos dueños no dejan mensaje: llaman a la siguiente clínica y ese paciente ya no vuelve."
        },
        {
          title: "Agenda con huecos y solapes",
          text: "Reprogramar cambios y cancelaciones a mano genera huecos vacíos y citas solapadas entre veterinarios, peluquería y pruebas, y complica encajar las urgencias del día."
        },
        {
          title: "No-shows y revisiones que no se retoman",
          text: "Vacunas de recuerdo, revisiones y postoperatorios se olvidan sin recordatorios, y las citas perdidas rara vez se recuperan porque nadie tiene tiempo de volver a llamar."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Vendrava atiende las llamadas y mensajes que tu equipo no puede atender con un agente de IA que identifica el motivo (urgencia, vacuna, revisión, peluquería, cirugía), agenda o reprograma la cita según la disponibilidad real y recupera no-shows. La IA solo hace gestión administrativa: nunca da diagnóstico ni consejo veterinario, y ante cualquier caso urgente o dudoso avisa y traspasa a una persona de tu equipo. Al inicio de cada contacto se indica que se habla con un asistente de IA, con consentimiento y trato de datos conforme a la normativa de protección de datos aplicable, y tu equipo mantiene el control clínico en todo momento.",
      flow: ["Llamada", "IA", "Motivo", "Cita"],
      useCases: [
        "Atención de llamadas y WhatsApp fuera de horario, en horas punta o cuando la recepción está ocupada",
        "Identificación del motivo (urgencia, vacuna, revisión, peluquería, cirugía) antes de agendar",
        "Agendado y reprogramación de citas con recordatorios para reducir no-shows",
        "Recuperación de citas perdidas y avisos de vacunas de recuerdo y revisiones pendientes"
      ],
      automations: [
        "Respuesta automática por voz y WhatsApp a cada llamada o mensaje entrante, con aviso de que se habla con una IA",
        "Detección del motivo y traspaso inmediato a una persona ante posibles urgencias",
        "Recordatorios de cita por WhatsApp, SMS o email antes de la visita",
        "Reenganche de no-shows y avisos de recordatorios de vacunas y revisiones periódicas"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "menos llamadas perdidas fuera de horario"
        },
        {
          value: "+30%",
          label: "más citas y no-shows recuperados"
        },
        {
          value: "24/7",
          label: "atención de llamadas y WhatsApp"
        }
      ],
      faq: [
        {
          q: "¿La IA de Vendrava da diagnósticos o consejo veterinario?",
          a: "No. Vendrava se limita a la gestión administrativa: contestar, identificar el motivo, agendar y reprogramar citas. Cualquier valoración clínica o consejo sobre un animal depende siempre de tu equipo veterinario."
        },
        {
          q: "¿Qué pasa si la llamada es una urgencia?",
          a: "El agente identifica las señales de posible urgencia según las pautas que definas, avisa y traspasa la conversación a una persona de tu equipo lo antes posible, sin intentar valorar la gravedad por su cuenta."
        },
        {
          q: "¿Sabe la persona que está hablando con una IA?",
          a: "Sí. Al inicio del contacto se indica de forma clara que se habla con un asistente de IA de la clínica, se pide el consentimiento necesario y los datos se tratan conforme al RGPD. La transparencia es parte del planteamiento, no una nota al pie."
        },
        {
          q: "¿Vendrava sustituye a la recepción de la clínica?",
          a: "No. Está pensado para apoyar a tu equipo: absorbe las llamadas y mensajes que no se pueden atender, sobre todo fuera de horario y en horas punta, para que la recepción se centre en los pacientes presentes y en lo que requiere criterio humano."
        },
        {
          q: "¿Puede gestionar citas de peluquería, vacunas y cirugía a la vez?",
          a: "Sí. Identifica el motivo de cada contacto y agenda con el veterinario, servicio o franja correspondiente según tu disponibilidad real, manteniendo el seguimiento y los recordatorios centralizados."
        }
      ],
      ctaTitle: "Que ninguna llamada perdida te cueste un paciente",
      ctaSub: "Prueba Vendrava y descubre cómo contestar, agendar y recuperar citas en tu clínica veterinaria sin perder el control del criterio clínico."
    },
    en: {
      metaTitle: "AI for veterinary clinics | Vendrava",
      metaDescription: "Vendrava answers your veterinary clinic's calls and WhatsApp after hours and during peak times, identifies the reason, books or reschedules appointments, and recovers no-shows. The work is administrative; clinical judgment always stays with your team.",
      navLabel: "Veterinary clinics",
      heroKicker: "Industry · Veterinary clinics",
      h1: "AI for veterinary clinics",
      heroSub: "In a veterinary clinic, a missed call is a lost patient. Vendrava answers by voice and WhatsApp when your team can't, identifies the reason, and books the appointment, without ever giving clinical advice.",
      painTitle: "The veterinary clinic challenge",
      pains: [
        {
          title: "Missed calls after hours and during peak times",
          text: "Between consults, surgery, and grooming, the phone rings when no one can pick it up. Many owners don't leave a message: they call the next clinic, and that patient never comes back."
        },
        {
          title: "Gaps and overlaps in the schedule",
          text: "Manually handling changes and cancellations creates empty gaps and overlapping appointments across vets, grooming, and tests, and makes it hard to fit in the day's urgent cases."
        },
        {
          title: "No-shows and follow-ups that never get picked back up",
          text: "Booster vaccines, check-ups, and post-op visits get forgotten without reminders, and missed appointments are rarely recovered because no one has time to call back."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "Vendrava handles the calls and messages your team can't pick up with an AI agent that identifies the reason (urgent, vaccine, check-up, grooming, surgery), books or reschedules based on real availability, and recovers no-shows. The AI only does administrative work: it never gives a diagnosis or veterinary advice, and for any urgent or unclear case it flags and hands off to a person on your team. At the start of every contact it states that the caller is speaking with an AI assistant, with consent and data handling in line with GDPR, and your team keeps clinical control at all times.",
      flow: ["Call", "AI", "Reason", "Appointment"],
      useCases: [
        "Handling calls and WhatsApp after hours, during peak times, or when the front desk is busy",
        "Identifying the reason (urgent, vaccine, check-up, grooming, surgery) before booking",
        "Booking and rescheduling appointments with reminders to reduce no-shows",
        "Recovering missed appointments and prompting booster vaccines and due check-ups"
      ],
      automations: [
        "Automatic voice and WhatsApp response to every inbound call or message, with an AI-disclosure notice",
        "Reason detection and immediate handoff to a person for possible urgent cases",
        "Appointment reminders via WhatsApp, SMS, or email before the visit",
        "Re-engagement of no-shows and reminders for recurring vaccines and check-ups"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "fewer missed calls after hours"
        },
        {
          value: "+30%",
          label: "more appointments and no-shows recovered"
        },
        {
          value: "24/7",
          label: "call and WhatsApp coverage"
        }
      ],
      faq: [
        {
          q: "Does Vendrava's AI give diagnoses or veterinary advice?",
          a: "No. Vendrava is limited to administrative work: answering, identifying the reason, and booking or rescheduling appointments. Any clinical assessment or advice about an animal always depends on your veterinary team."
        },
        {
          q: "What happens if the call is an emergency?",
          a: "The agent identifies possible urgent signals based on the guidelines you set, flags them, and hands the conversation to a person on your team as soon as possible, without trying to assess severity on its own."
        },
        {
          q: "Does the caller know they're talking to an AI?",
          a: "Yes. At the start of the contact it clearly states that the caller is speaking with the clinic's AI assistant, asks for the necessary consent, and handles data in line with GDPR. Transparency is part of the approach, not a footnote."
        },
        {
          q: "Does Vendrava replace the clinic's front desk?",
          a: "No. It's built to support your team: it absorbs the calls and messages that can't be picked up, especially after hours and during peak times, so the front desk can focus on patients on-site and on what needs human judgment."
        },
        {
          q: "Can it handle grooming, vaccine, and surgery bookings at once?",
          a: "Yes. It identifies the reason for each contact and books with the right vet, service, or time slot based on your real availability, keeping follow-up and reminders centralized."
        }
      ],
      ctaTitle: "Don't let a missed call cost you a patient",
      ctaSub: "Try Vendrava and see how to answer, book, and recover appointments at your veterinary clinic without losing control of clinical judgment."
    }
  },

  // ---------------------------------------------------------------------
  // 9. Pet grooming (Motion A)
  // ---------------------------------------------------------------------
  {
    id: "pet-grooming",
    slugEs: "sectores/peluquerias-caninas",
    slugEn: "industries/pet-grooming",
    es: {
      metaTitle: "IA de voz y WhatsApp para peluquerías caninas | Vendrava",
      metaDescription: "Vendrava contesta las llamadas y los WhatsApp de tu peluquería canina mientras bañas o cortas, agenda por tamaño, raza y servicio, y envía recordatorios para reducir ausencias. Tu equipo, con IA de apoyo.",
      navLabel: "Peluquerías caninas",
      heroKicker: "Sector · Peluquerías caninas",
      h1: "IA de voz y WhatsApp para peluquerías caninas y de mascotas",
      heroSub: "Cuando estás bañando o cortando, no puedes atender el teléfono. Vendrava contesta llamadas y WhatsApp, agenda por tamaño, raza y servicio, y recuerda las citas para que no pierdas clientes por no responder a tiempo.",
      painTitle: "El reto en peluquerías caninas",
      pains: [
        {
          title: "Llamadas perdidas mientras atiendes a un perro",
          text: "Con las manos ocupadas bañando o cortando no puedes contestar, y muchos clientes que llaman para pedir cita no vuelven a intentarlo: reservan en la peluquería de al lado."
        },
        {
          title: "Ausencias y citas que se caen",
          text: "En un negocio de cita, cada hueco vacío es dinero perdido. Sin un recordatorio claro, bastantes clientes se olvidan de la cita o no avisan de que no vienen."
        },
        {
          title: "Clientes recurrentes que se pierden el ritmo",
          text: "Un perro necesita corte cada pocas semanas, pero si nadie le recuerda que le toca, el cliente lo va aplazando y termina espaciando o abandonando las visitas."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Cuando entra una llamada o un WhatsApp y tú estás ocupado, Vendrava responde con un agente de IA que pregunta por el tipo de mascota, tamaño, raza y servicio, y propone hueco en tu agenda. Antes de la cita envía recordatorios para reducir ausencias, y reactiva a los clientes recurrentes con un aviso de que le toca corte. La IA avisa siempre de que se habla con un asistente automático y tú mantienes el control: puedes intervenir, confirmar o reprogramar cualquier cita cuando salgas del baño.",
      flow: ["Llamada", "IA", "Servicio", "Cita"],
      useCases: [
        "Contestar llamadas y WhatsApp cuando estás bañando o cortando y no puedes atender",
        "Agendar citas según tamaño, raza y tipo de servicio para calcular la duración correcta",
        "Enviar recordatorios de cita para reducir ausencias y huecos vacíos",
        "Reactivar a clientes recurrentes con el aviso de que a su mascota le toca corte",
        "Atender consultas y peticiones fuera del horario de la peluquería"
      ],
      automations: [
        "Respuesta automática por voz y WhatsApp cuando no puedes atender el teléfono",
        "Agendado por tamaño, raza y servicio con la duración estimada de cada cita",
        "Recordatorios de cita por WhatsApp con opción de confirmar o reprogramar",
        "Aviso de \"le toca corte\" a clientes recurrentes según la frecuencia de su mascota"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "menos llamadas perdidas en horas de trabajo"
        },
        {
          value: "+30%",
          label: "menos ausencias con recordatorios"
        },
        {
          value: "24/7",
          label: "respuesta a llamadas y WhatsApp"
        }
      ],
      faq: [
        {
          q: "¿Vendrava contesta el WhatsApp de la peluquería mientras estoy cortando?",
          a: "Sí. Cuando no puedes atender, el agente de IA responde por WhatsApp y por voz, pregunta por la mascota y el servicio, y propone cita en tu agenda. Cuando sales del baño ves todo lo gestionado y puedes ajustar lo que haga falta."
        },
        {
          q: "¿La IA sustituye a la persona que lleva la peluquería?",
          a: "No. Vendrava es un apoyo para no perder llamadas ni citas cuando tienes las manos ocupadas. Tú y tu equipo mantienen el control: la atención al animal, el trato con el cliente y la decisión final sobre la agenda siguen siendo suyos."
        },
        {
          q: "¿Cómo agenda las citas si cada perro necesita un tiempo distinto?",
          a: "El agente pregunta por el tamaño, la raza y el servicio (baño, corte, deslanado) para estimar la duración y reservar el hueco adecuado, evitando que se te junten dos perros grandes a la vez o que queden ratos muertos."
        },
        {
          q: "¿El cliente sabe que está hablando con una IA?",
          a: "Sí. El asistente avisa desde el principio de que es un sistema automático de la peluquería. Es transparente con el cliente y funciona dentro de un marco pensado para el tratamiento responsable de datos conforme al RGPD."
        },
        {
          q: "¿Puede recordar a los clientes que a su perro le toca corte?",
          a: "Sí. Según la frecuencia habitual de cada mascota, Vendrava puede enviar un aviso de que le toca corte y ofrecer directamente cita, para recuperar clientes recurrentes que van espaciando las visitas."
        }
      ],
      ctaTitle: "Que ninguna llamada perdida te cueste un cliente",
      ctaSub: "Prueba Vendrava y deja que conteste, agende y recuerde las citas de tu peluquería mientras tú te dedicas a las mascotas."
    },
    en: {
      metaTitle: "Voice and WhatsApp AI for pet grooming salons | Vendrava",
      metaDescription: "Vendrava answers your grooming salon's calls and WhatsApp while you're bathing or clipping, books by size, breed, and service, and sends reminders to cut no-shows. Your team, with AI support.",
      navLabel: "Pet grooming",
      heroKicker: "Industry · Pet grooming",
      h1: "Voice and WhatsApp AI for pet grooming and mascot salons",
      heroSub: "When you're bathing or clipping, you can't pick up the phone. Vendrava answers calls and WhatsApp, books by size, breed, and service, and reminds clients of their appointments so you don't lose them by responding too late.",
      painTitle: "The pet grooming challenge",
      pains: [
        {
          title: "Missed calls while you're with a dog",
          text: "With your hands busy bathing or clipping you can't answer, and many clients calling to book never try again: they book with the salon next door."
        },
        {
          title: "No-shows and appointments that fall through",
          text: "In an appointment business, every empty slot is lost money. Without a clear reminder, plenty of clients forget their appointment or don't call to cancel."
        },
        {
          title: "Recurring clients who lose the rhythm",
          text: "A dog needs a groom every few weeks, but if no one reminds the owner it's due, they keep putting it off and end up spacing out or dropping their visits."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "When a call or WhatsApp comes in and you're busy, Vendrava answers with an AI agent that asks about the pet type, size, breed, and service, and offers a slot in your calendar. Before the appointment it sends reminders to cut no-shows, and it re-engages recurring clients with a heads-up that their pet is due for a groom. The AI always states that it's an automated assistant, and you stay in control: you can step in, confirm, or reschedule any appointment when you're out of the bath.",
      flow: ["Call", "AI", "Service", "Booking"],
      useCases: [
        "Answering calls and WhatsApp when you're bathing or clipping and can't pick up",
        "Booking appointments by size, breed, and service type to estimate the right duration",
        "Sending appointment reminders to cut no-shows and empty slots",
        "Re-engaging recurring clients with a heads-up that their pet is due for a groom",
        "Handling inquiries and requests outside the salon's opening hours"
      ],
      automations: [
        "Automatic voice and WhatsApp response when you can't answer the phone",
        "Booking by size, breed, and service with the estimated duration of each appointment",
        "Appointment reminders via WhatsApp with the option to confirm or reschedule",
        "\"Due for a groom\" heads-up to recurring clients based on their pet's frequency"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "fewer missed calls during working hours"
        },
        {
          value: "+30%",
          label: "fewer no-shows with reminders"
        },
        {
          value: "24/7",
          label: "response to calls and WhatsApp"
        }
      ],
      faq: [
        {
          q: "Does Vendrava answer the salon's WhatsApp while I'm clipping?",
          a: "Yes. When you can't respond, the AI agent replies over WhatsApp and voice, asks about the pet and the service, and offers an appointment in your calendar. When you're out of the bath you see everything it handled and can adjust whatever you need."
        },
        {
          q: "Does the AI replace the person running the salon?",
          a: "No. Vendrava is a support so you don't miss calls or appointments when your hands are busy. You and your team stay in control: caring for the animal, the client relationship, and the final call on the schedule remain yours."
        },
        {
          q: "How does it book appointments if each dog needs a different amount of time?",
          a: "The agent asks about size, breed, and service (bath, groom, de-shedding) to estimate the duration and reserve the right slot, avoiding two large dogs at once or gaps of dead time."
        },
        {
          q: "Does the client know they're talking to an AI?",
          a: "Yes. The assistant states from the start that it's an automated system from the salon. It's transparent with the client and works within a framework built for responsible, GDPR-compliant data handling."
        },
        {
          q: "Can it remind clients their dog is due for a groom?",
          a: "Yes. Based on each pet's usual frequency, Vendrava can send a heads-up that a groom is due and offer an appointment directly, to win back recurring clients who are drifting apart on their visits."
        }
      ],
      ctaTitle: "Don't let a missed call cost you a client",
      ctaSub: "Try Vendrava and let it answer, book, and remind your salon's appointments while you focus on the pets."
    }
  },

  // ---------------------------------------------------------------------
  // 10. Call centers & outbound / cold calling (Motion C)
  // ---------------------------------------------------------------------
  {
    id: "call-centers",
    slugEs: "sectores/call-centers",
    slugEn: "industries/call-centers",
    es: {
      metaTitle: "IA de voz para call centers y llamadas en frío | Vendrava",
      metaDescription:
        "Vendrava suma agentes de voz IA a tu call center para ejecutar campañas de llamadas en frío y salientes a gran volumen, calificar y pasar solo los leads interesados a tus agentes, con consentimiento, horarios y control humano.",
      navLabel: "Call centers",
      heroKicker: "Sector · Call centers y telemarketing",
      h1: "IA de voz para call centers y llamadas en frío",
      heroSub:
        "Vendrava ejecuta campañas de llamadas salientes y en frío a gran volumen con agentes de voz IA: contactan, califican y pasan solo los leads interesados a tus agentes humanos, con consentimiento y horarios configurables.",
      painTitle: "El reto en call centers y equipos de outbound",
      pains: [
        {
          title: "Marcar en frío consume horas y quema agentes",
          text: "La mayoría de las llamadas no contestan o no cualifican; tus agentes gastan el día marcando en lugar de hablar con interesados reales.",
        },
        {
          title: "Escalar volumen sin disparar costes",
          text: "Añadir campañas, turnos o mercados obliga a contratar y formar más agentes, con la rotación y el coste que eso supone.",
        },
        {
          title: "Cumplimiento y calidad desiguales",
          text: "Consentimiento, horarios permitidos, listas de exclusión y guiones consistentes son difíciles de garantizar cuando el volumen crece.",
        },
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText:
        "Vendrava suma agentes de voz IA a tu operación de outbound: cargan tus listas, marcan a gran volumen, hacen las preguntas de calificación de tu guion y, cuando detectan interés, transfieren la llamada a un agente humano o agendan la cita. Cada campaña se configura respetando el consentimiento, los horarios permitidos y las listas de exclusión de cada mercado, y todo queda registrado en el CRM. Tus agentes dejan de marcar en frío y se centran en cerrar.",
      flow: ["Lista", "Llamada IA", "Calificación", "Handoff / cita"],
      useCases: [
        "Campañas de llamadas en frío y salientes a gran volumen",
        "Precalificación por voz antes de pasar el lead a un agente humano",
        "Recuperación y reactivación de bases de datos frías",
        "Encuestas, confirmaciones y recordatorios automatizados",
        "Desbordamiento (overflow) de campañas en picos de volumen",
      ],
      automations: [
        "Marcado automático de listas con guion de calificación por campaña",
        "Transferencia en caliente al agente humano cuando hay interés",
        "Respeto de horarios permitidos, consentimiento y listas de exclusión",
        "Registro de cada llamada, resultado y resumen en el CRM",
      ],
      kpis: [
        { value: "3×", label: "más contactos cualificados por hora de agente" },
        { value: "24/7", label: "capacidad de marcado sin ampliar plantilla" },
        { value: "ES/EN", label: "campañas bilingües por mercado" },
      ],
      faq: [
        {
          q: "¿Vendrava reemplaza a mis agentes?",
          a: "No. La IA hace el marcado en frío y la precalificación a volumen; tus agentes reciben solo los leads interesados para cerrar. El trato humano y el cierre siguen siendo suyos.",
        },
        {
          q: "¿Cómo se cumple la normativa en llamadas en frío?",
          a: "Cada campaña se configura respetando el consentimiento, los horarios permitidos, las listas de exclusión (los registros de no-llamar o de exclusión publicitaria de cada país) y el aviso de que se habla con una IA, según la normativa de cada mercado. La configuración responsable forma parte del producto.",
        },
        {
          q: "¿Puede transferir la llamada a un agente humano en vivo?",
          a: "Sí. Cuando detecta interés o el contacto lo pide, puede hacer una transferencia en caliente a un agente disponible o agendar una cita.",
        },
        {
          q: "¿Sirve para campañas en varios idiomas o mercados?",
          a: "Sí. Los agentes de voz pueden operar en español e inglés, con guiones y calificación distintos por campaña, mercado o producto.",
        },
        {
          q: "¿Qué pasa con los contactos que no cualifican?",
          a: "Quedan registrados con su resultado en el CRM y pueden entrar en un flujo de seguimiento más espaciado por WhatsApp o email, sin ocupar tiempo de agente.",
        },
      ],
      ctaTitle: "Multiplica tu capacidad de llamadas sin ampliar la plantilla",
      ctaSub:
        "Prueba Vendrava y descubre cómo automatizar el marcado en frío y la precalificación para que tus agentes hablen solo con interesados.",
    },
    en: {
      metaTitle: "AI voice for call centers and cold calling | Vendrava",
      metaDescription:
        "Vendrava adds AI voice agents to your call center to run cold and outbound calling campaigns at scale, qualify, and pass only interested leads to your agents, with consent, calling hours and human control.",
      navLabel: "Call centers",
      heroKicker: "Industry · Call centers and telemarketing",
      h1: "AI voice for call centers and cold calling",
      heroSub:
        "Vendrava runs outbound and cold calling campaigns at scale with AI voice agents: they contact, qualify, and pass only interested leads to your human agents, with configurable consent and calling hours.",
      painTitle: "The call center and outbound challenge",
      pains: [
        {
          title: "Cold dialing eats hours and burns out agents",
          text: "Most calls go unanswered or do not qualify; your agents spend the day dialing instead of talking to real prospects.",
        },
        {
          title: "Scaling volume without exploding costs",
          text: "Adding campaigns, shifts or markets means hiring and training more agents, with the turnover and cost that come with it.",
        },
        {
          title: "Uneven compliance and quality",
          text: "Consent, permitted calling hours, exclusion lists and consistent scripts are hard to guarantee as volume grows.",
        },
      ],
      howTitle: "How Vendrava helps",
      howText:
        "Vendrava adds AI voice agents to your outbound operation: they load your lists, dial at scale, ask your script qualification questions and, when they detect interest, transfer the call to a human agent or book the appointment. Every campaign is configured to respect consent, permitted calling hours and each market exclusion lists, and everything is logged in the CRM. Your agents stop cold dialing and focus on closing.",
      flow: ["List", "AI call", "Qualification", "Handoff / booking"],
      useCases: [
        "Cold and outbound calling campaigns at high volume",
        "Voice pre-qualification before passing the lead to a human agent",
        "Recovery and reactivation of cold databases",
        "Automated surveys, confirmations and reminders",
        "Campaign overflow during volume spikes",
      ],
      automations: [
        "Automatic list dialing with a per-campaign qualification script",
        "Warm transfer to a human agent when there is interest",
        "Respecting permitted calling hours, consent and exclusion lists",
        "Logging every call, outcome and summary in the CRM",
      ],
      kpis: [
        { value: "3×", label: "more qualified contacts per agent hour" },
        { value: "24/7", label: "dialing capacity without growing headcount" },
        { value: "ES/EN", label: "bilingual campaigns per market" },
      ],
      faq: [
        {
          q: "Does Vendrava replace my agents?",
          a: "No. The AI handles cold dialing and pre-qualification at volume; your agents receive only interested leads to close. The human relationship and the close stay with them.",
        },
        {
          q: "How is compliance handled on cold calls?",
          a: "Every campaign is configured to respect consent, permitted calling hours, exclusion lists (such as do-not-call registries) and AI disclosure, per each market regulations. Responsible configuration is part of the product.",
        },
        {
          q: "Can it transfer the call to a live human agent?",
          a: "Yes. When it detects interest or the contact asks, it can make a warm transfer to an available agent or book an appointment.",
        },
        {
          q: "Does it work for campaigns in multiple languages or markets?",
          a: "Yes. The voice agents can operate in Spanish and English, with different scripts and qualification per campaign, market or product.",
        },
        {
          q: "What happens with contacts that do not qualify?",
          a: "They are logged with their outcome in the CRM and can enter a more spaced-out follow-up flow via WhatsApp or email, without taking up agent time.",
        },
      ],
      ctaTitle: "Multiply your calling capacity without growing headcount",
      ctaSub:
        "Try Vendrava and see how to automate cold dialing and pre-qualification so your agents only talk to interested prospects.",
    },
  },

  // ---------------------------------------------------------------------
  // 11. Dental clinics
  // ---------------------------------------------------------------------
  {
    id: "dental-clinics",
    slugEs: "sectores/clinicas-dentales",
    slugEn: "industries/dental-clinics",
    es: {
      metaTitle: "CRM con IA para clínicas dentales | Vendrava",
      metaDescription: "Vendrava ayuda a clínicas dentales a no perder pacientes por llamadas sin atender: contesta, califica el motivo y agenda citas por voz y WhatsApp, con recordatorios y recuperación de no-shows, siempre bajo control del equipo humano.",
      navLabel: "Clínicas dentales",
      heroKicker: "Sector · Clínicas dentales",
      h1: "CRM con IA para clínicas dentales",
      heroSub: "En una clínica dental, una llamada sin atender suele ser un paciente perdido. Vendrava contesta, identifica el motivo y agenda la cita por voz y WhatsApp; el diagnóstico siempre queda en manos del equipo clínico.",
      painTitle: "El reto en clínicas dentales",
      pains: [
        {
          title: "Llamada sin atender, paciente perdido",
          text: "Con la agenda llena y el equipo atendiendo en boca, muchas llamadas quedan sin contestar. Quien busca dentista suele llamar a la siguiente clínica en lugar de esperar, y esa cita nunca llega."
        },
        {
          title: "Tratamientos de alto valor que no se cierran",
          text: "Implantes, ortodoncia o estética generan consultas de presupuesto y financiación que requieren seguimiento constante. Sin nadie que retome la conversación a tiempo, el paciente lo pospone o se va a otra clínica."
        },
        {
          title: "No-shows y huecos en la agenda",
          text: "Las ausencias y las cancelaciones de última hora dejan huecos difíciles de rellenar, sillón parado y agenda descuadrada. Recuperar y reagendar a mano consume tiempo que la recepción no siempre tiene."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Vendrava se comporta como un asesor de recepción entrenado en tu clínica: aprende tus tratamientos, tus preguntas de calificación y tus respuestas habituales sobre presupuesto y financiación. Contesta llamadas y mensajes de WhatsApp, identifica el motivo (urgencia, primera visita, revisión, presupuesto de implantes u ortodoncia), agenda la cita con el profesional adecuado y envía recordatorios para reducir ausencias. Solo hace gestión administrativa: nunca da diagnóstico ni indicación clínica, y cualquier caso puede pasar al equipo humano en cualquier momento. Los datos de salud se tratan como un valor a proteger, con aviso de uso de IA, consentimiento y control humano según la normativa de protección de datos aplicable.",
      flow: ["Llamada", "Motivo", "Agenda", "Recordatorio"],
      useCases: [
        "Atención de llamadas y WhatsApp fuera de horario, en festivos o cuando la recepción está ocupada",
        "Calificación del motivo de contacto (urgencia, primera visita, revisión, presupuesto) antes de agendar",
        "Información administrativa y seguimiento de presupuestos de implantes, ortodoncia y financiación",
        "Recordatorios de cita y recuperación de no-shows para reagendar y rellenar huecos de agenda",
        "Reactivación de pacientes inactivos para revisiones y tratamientos pendientes"
      ],
      automations: [
        "Respuesta automática a llamadas y mensajes entrantes con calificación del motivo",
        "Agendado y reprogramación de citas según disponibilidad de cada profesional o gabinete",
        "Recordatorios de cita por WhatsApp, SMS o email para reducir ausencias",
        "Recuperación automática de no-shows y seguimiento de presupuestos sin cerrar"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "menos llamadas sin atender"
        },
        {
          value: "+30%",
          label: "más citas agendadas"
        },
        {
          value: "24/7",
          label: "atención de pacientes entrantes"
        }
      ],
      faq: [
        {
          q: "¿La IA de Vendrava da diagnósticos o recomendaciones dentales?",
          a: "No. Vendrava solo hace gestión administrativa: contesta, identifica el motivo de contacto y agenda la cita. Cualquier valoración, diagnóstico o indicación clínica depende siempre del profesional dental."
        },
        {
          q: "¿Puede gestionar presupuestos de implantes u ortodoncia?",
          a: "Sí, en la parte administrativa. Vendrava recoge el interés, responde dudas frecuentes sobre precios y opciones de financiación con la información que tú definas, y da seguimiento hasta que el paciente decide, dejando la explicación clínica y el plan de tratamiento al equipo."
        },
        {
          q: "¿Cómo ayuda con los no-shows y los huecos de agenda?",
          a: "Envía recordatorios automáticos antes de cada cita y, si alguien no acude o cancela, retoma el contacto para reagendar y rellenar el hueco cuanto antes, reduciendo el sillón parado."
        },
        {
          q: "¿Cómo se protegen los datos de salud de los pacientes?",
          a: "El tratamiento responsable de los datos es parte del servicio: aviso de que se usa IA, registro del consentimiento y control humano sobre las conversaciones, dentro de un sistema alineado con la normativa de protección de datos aplicable en cada país."
        },
        {
          q: "¿Qué pasa si el paciente prefiere hablar con una persona?",
          a: "La conversación puede pasar al equipo de la clínica en cualquier momento, especialmente ante urgencias, dudas clínicas o casos que requieran atención personalizada. El equipo humano mantiene siempre el control."
        }
      ],
      ctaTitle: "Que ninguna llamada perdida te cueste un paciente",
      ctaSub: "Prueba Vendrava y descubre cómo atender, calificar y agendar cada contacto de tu clínica dental sin dejar de lado el criterio clínico ni la protección de datos."
    },
    en: {
      metaTitle: "AI CRM for dental clinics | Vendrava",
      metaDescription: "Vendrava helps dental clinics stop losing patients to unanswered calls: it answers, qualifies the reason, and books appointments by voice and WhatsApp, with reminders and no-show recovery, always under human control.",
      navLabel: "Dental clinics",
      heroKicker: "Industry · Dental clinics",
      h1: "AI CRM for dental clinics",
      heroSub: "In a dental clinic, an unanswered call usually means a lost patient. Vendrava answers, identifies the reason, and books the appointment by voice and WhatsApp; the diagnosis always stays with the clinical team.",
      painTitle: "The dental clinic challenge",
      pains: [
        {
          title: "An unanswered call is a lost patient",
          text: "With a full schedule and the team working chairside, many calls go unanswered. Someone looking for a dentist usually calls the next clinic instead of waiting, and that appointment never happens."
        },
        {
          title: "High-value treatments that don't close",
          text: "Implants, orthodontics, and cosmetic work spark budget and financing questions that need constant follow-up. Without anyone to pick the conversation back up in time, the patient delays or goes to another clinic."
        },
        {
          title: "No-shows and gaps in the schedule",
          text: "No-shows and last-minute cancellations leave gaps that are hard to fill, an idle chair, and a broken schedule. Recovering and rebooking by hand takes time the front desk doesn't always have."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "Vendrava behaves like a front-desk advisor trained in your clinic: it learns your treatments, your qualifying questions, and your usual answers about budget and financing. It answers calls and WhatsApp messages, identifies the reason (emergency, first visit, checkup, implant or orthodontics estimate), books the appointment with the right provider, and sends reminders to cut no-shows. It only handles administrative work: it never gives a diagnosis or clinical advice, and any case can be handed to the human team at any point. Health data is treated as something to protect, with an AI-use notice, consent, and human control in line with the applicable data protection regulations.",
      flow: ["Call", "Reason", "Schedule", "Reminder"],
      useCases: [
        "Handling calls and WhatsApp after hours, on holidays, or when the front desk is busy",
        "Qualifying the reason for contact (emergency, first visit, checkup, estimate) before booking",
        "Administrative info and follow-up on implant, orthodontics, and financing estimates",
        "Appointment reminders and no-show recovery to rebook and fill schedule gaps",
        "Reactivating inactive patients for checkups and pending treatments"
      ],
      automations: [
        "Automatic response to inbound calls and messages with reason-for-contact qualification",
        "Scheduling and rescheduling appointments based on each provider's or operatory's availability",
        "Appointment reminders via WhatsApp, SMS, or email to reduce no-shows",
        "Automatic no-show recovery and follow-up on open estimates"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "fewer unanswered calls"
        },
        {
          value: "+30%",
          label: "more appointments booked"
        },
        {
          value: "24/7",
          label: "coverage for inbound patients"
        }
      ],
      faq: [
        {
          q: "Does Vendrava's AI give dental diagnoses or advice?",
          a: "No. Vendrava only handles administrative work: it answers, identifies the reason for contact, and books the appointment. Any assessment, diagnosis, or clinical guidance always depends on the dental professional."
        },
        {
          q: "Can it handle implant or orthodontics estimates?",
          a: "Yes, on the administrative side. Vendrava captures interest, answers common questions about pricing and financing options using the information you define, and follows up until the patient decides, leaving the clinical explanation and treatment plan to the team."
        },
        {
          q: "How does it help with no-shows and schedule gaps?",
          a: "It sends automatic reminders before each appointment and, if someone misses or cancels, it reaches back out to rebook and fill the gap as soon as possible, reducing chair downtime."
        },
        {
          q: "How is patients' health data protected?",
          a: "Responsible data handling is part of the service: notice that AI is being used, a record of consent, and human control over conversations, within a system aligned with the data protection regulations applicable in each country."
        },
        {
          q: "What if the patient prefers to speak with a person?",
          a: "The conversation can be handed to the clinic's team at any point, especially for emergencies, clinical questions, or cases that need personalized attention. The human team always stays in control."
        }
      ],
      ctaTitle: "Don't let a missed call cost you a patient",
      ctaSub: "Try Vendrava and see how to answer, qualify, and book every contact for your dental clinic without setting aside clinical judgment or data protection."
    }
  },

  // ---------------------------------------------------------------------
  // 12. Beauty & aesthetics
  // ---------------------------------------------------------------------
  {
    id: "aesthetics",
    slugEs: "sectores/estetica-belleza",
    slugEn: "industries/beauty-aesthetics",
    es: {
      metaTitle: "CRM con IA para estética y belleza | Vendrava",
      metaDescription: "Vendrava ayuda a clínicas de estética y centros de belleza a atender consultas por WhatsApp y voz, agendar tratamientos y recuperar no-shows con IA, sin dar nunca consejo médico-estético.",
      navLabel: "Estética y belleza",
      heroKicker: "Sector · Estética y belleza",
      h1: "CRM con IA para estética y belleza",
      heroSub: "Atiende cada consulta al instante, agenda tratamientos y recupera citas perdidas. Vendrava se ocupa de la recepción y el seguimiento; el criterio del profesional siempre queda en tu equipo.",
      painTitle: "El reto en estética y belleza",
      pains: [
        {
          title: "No-shows que vacían la agenda",
          text: "Los tratamientos se reservan con antelación y muchas citas se caen sin aviso, dejando huecos que no siempre da tiempo a rellenar y que cuestan ingresos directos."
        },
        {
          title: "Consultas de servicios y precios sin respuesta rápida",
          text: "Gran parte del contacto llega por WhatsApp preguntando por tratamientos, promociones y precios; si nadie responde pronto, la clienta reserva en otro centro."
        },
        {
          title: "Recepción saturada y clientas que no vuelven",
          text: "Entre atender a quien está en cabina y contestar el teléfono y los mensajes, se escapan reservas recurrentes y no se reactiva a clientas que hace tiempo que no vuelven."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Vendrava atiende las consultas entrantes por WhatsApp y voz con un agente de IA entrenado en tu catálogo de servicios: informa de tratamientos, promociones y precios de forma general, resuelve dudas frecuentes y agenda o reprograma la cita según tu disponibilidad. Además recupera no-shows y reactiva clientas inactivas con mensajes de seguimiento. La IA nunca da consejo médico ni estético personalizado: toda valoración de tratamiento queda en manos del profesional, y tu equipo mantiene el control de la agenda.",
      flow: ["Consulta", "IA", "Agenda", "Recordatorio"],
      useCases: [
        "Respuesta inmediata por WhatsApp y voz a consultas de tratamientos, promociones y precios",
        "Agendado y reprogramación de citas recurrentes según la disponibilidad del centro",
        "Recordatorios de cita para reducir no-shows y recuperar huecos que se caen",
        "Reactivación de clientas inactivas y difusión de promociones a la base existente",
        "Traspaso a una persona del equipo cuando la consulta requiere valoración profesional"
      ],
      automations: [
        "Respuesta automática a mensajes y llamadas entrantes con información general de servicios y precios",
        "Recordatorios de cita por WhatsApp y SMS antes del tratamiento para reducir ausencias",
        "Reenganche automático de no-shows para reagendar el hueco perdido",
        "Campañas de seguimiento a clientas recurrentes con promociones y recordatorios de repetición"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "más rápido en responder consultas"
        },
        {
          value: "+30%",
          label: "menos citas perdidas por no-show"
        },
        {
          value: "24/7",
          label: "atención de consultas por WhatsApp y voz"
        }
      ],
      faq: [
        {
          q: "¿La IA de Vendrava da consejo médico o estético?",
          a: "No. Vendrava informa de servicios, promociones y precios de forma general y gestiona la agenda, pero nunca recomienda tratamientos ni emite valoraciones estéticas o médicas. Cualquier indicación sobre un tratamiento depende siempre del profesional del centro."
        },
        {
          q: "¿Cómo ayuda Vendrava a reducir los no-shows?",
          a: "Envía recordatorios automáticos por WhatsApp y SMS antes de cada cita y, si alguien no acude, activa un seguimiento para reagendar cuanto antes y aprovechar el hueco que ha quedado libre."
        },
        {
          q: "¿Puede atender las consultas que llegan por WhatsApp?",
          a: "Sí. WhatsApp es el canal principal en estética, y Vendrava responde de forma casi inmediata a las preguntas frecuentes sobre tratamientos y precios, agenda la cita y traspasa a tu equipo cuando hace falta atención personalizada."
        },
        {
          q: "¿Sirve para fidelizar y hacer que las clientas vuelvan?",
          a: "Sí. Vendrava mantiene el seguimiento de clientas recurrentes con recordatorios de repetición del tratamiento y difusión de promociones, y reactiva a quienes hace tiempo que no reservan."
        },
        {
          q: "¿Cómo se tratan los datos de las clientas?",
          a: "Vendrava centraliza los datos de contacto y el historial de comunicación necesarios para gestionar citas y seguimiento, dentro de un sistema pensado para el manejo responsable de datos y conforme a la normativa de protección de datos aplicable."
        }
      ],
      ctaTitle: "Menos citas perdidas, agenda siempre llena",
      ctaSub: "Prueba Vendrava y descubre cómo atender cada consulta, agendar tratamientos y recuperar no-shows sin recargar a tu recepción."
    },
    en: {
      metaTitle: "AI CRM for beauty and aesthetics | Vendrava",
      metaDescription: "Vendrava helps aesthetic clinics and beauty centers handle WhatsApp and voice inquiries, book treatments, and recover no-shows with AI, without ever giving medical or aesthetic advice.",
      navLabel: "Beauty & aesthetics",
      heroKicker: "Industry · Beauty & aesthetics",
      h1: "AI CRM for beauty and aesthetics",
      heroSub: "Answer every inquiry instantly, book treatments, and recover missed appointments. Vendrava handles the front desk and follow-up; professional judgment always stays with your team.",
      painTitle: "The beauty and aesthetics challenge",
      pains: [
        {
          title: "No-shows that empty the schedule",
          text: "Treatments are booked in advance and many appointments fall through with no warning, leaving gaps that are hard to fill and cost direct revenue."
        },
        {
          title: "Service and pricing inquiries without a fast response",
          text: "Most contact comes in over WhatsApp asking about treatments, promotions, and prices; if no one replies quickly, the client books somewhere else."
        },
        {
          title: "Overloaded front desk and clients who don't return",
          text: "Between caring for clients in the room and answering the phone and messages, recurring bookings slip away and lapsed clients never get reactivated."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "Vendrava handles inbound WhatsApp and voice inquiries with an AI agent trained on your service catalog: it shares general information about treatments, promotions, and prices, answers common questions, and books or reschedules the appointment based on your availability. It also recovers no-shows and reactivates lapsed clients with follow-up messages. The AI never gives medical or personalized aesthetic advice: any treatment assessment stays with the professional, and your team keeps control of the schedule.",
      flow: ["Inquiry", "AI", "Booking", "Reminder"],
      useCases: [
        "Immediate WhatsApp and voice response to inquiries about treatments, promotions, and prices",
        "Booking and rescheduling of recurring appointments based on the center's availability",
        "Appointment reminders to reduce no-shows and recover gaps that fall through",
        "Reactivation of lapsed clients and promotion outreach to the existing base",
        "Handoff to a team member when an inquiry requires professional assessment"
      ],
      automations: [
        "Automatic response to inbound messages and calls with general service and pricing information",
        "Appointment reminders via WhatsApp and SMS before the treatment to reduce no-shows",
        "Automatic re-engagement of no-shows to rebook the lost slot",
        "Follow-up campaigns to recurring clients with promotions and repeat-treatment reminders"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "faster response to inquiries"
        },
        {
          value: "+30%",
          label: "fewer appointments lost to no-shows"
        },
        {
          value: "24/7",
          label: "coverage for WhatsApp and voice inquiries"
        }
      ],
      faq: [
        {
          q: "Does Vendrava's AI give medical or aesthetic advice?",
          a: "No. Vendrava shares general information about services, promotions, and prices and manages the schedule, but it never recommends treatments or issues aesthetic or medical assessments. Any guidance on a treatment always depends on the center's professional."
        },
        {
          q: "How does Vendrava help reduce no-shows?",
          a: "It sends automatic reminders via WhatsApp and SMS before each appointment and, if someone doesn't show, it triggers follow-up to rebook as soon as possible and make use of the freed-up slot."
        },
        {
          q: "Can it handle inquiries that come in over WhatsApp?",
          a: "Yes. WhatsApp is the primary channel in aesthetics, and Vendrava responds almost immediately to common questions about treatments and prices, books the appointment, and hands off to your team when personalized attention is needed."
        },
        {
          q: "Does it help with loyalty and getting clients to return?",
          a: "Yes. Vendrava keeps recurring clients engaged with repeat-treatment reminders and promotion outreach, and reactivates clients who haven't booked in a while."
        },
        {
          q: "How is client data handled?",
          a: "Vendrava centralizes the contact information and communication history needed to manage appointments and follow-up, within a system built for responsible data handling and compliant with applicable data protection regulations."
        }
      ],
      ctaTitle: "Fewer missed appointments, a schedule that stays full",
      ctaSub: "Try Vendrava and see how to answer every inquiry, book treatments, and recover no-shows without overloading your front desk."
    }
  },

  // ---------------------------------------------------------------------
  // 13. Home services / reformas
  // ---------------------------------------------------------------------
  {
    id: "home-services",
    slugEs: "sectores/reformas-servicios-hogar",
    slugEn: "industries/home-services",
    es: {
      metaTitle: "CRM con IA para reformas y servicios del hogar | Vendrava",
      metaDescription: "Vendrava contesta y precalifica solicitudes de presupuesto y urgencias de reformas, fontanería, electricidad y climatización por voz y WhatsApp, y transfiere al técnico cuando hay interés real.",
      navLabel: "Reformas y hogar",
      heroKicker: "Sector · Reformas y servicios del hogar",
      h1: "CRM con IA para reformas y servicios del hogar",
      heroSub: "En servicios del hogar gana quien contesta primero. Vendrava atiende cada solicitud de presupuesto y cada urgencia al instante, la precalifica y la transfiere a un técnico cuando hay interés real.",
      painTitle: "El reto en reformas y servicios del hogar",
      pains: [
        {
          title: "El primero en contestar se lleva el trabajo",
          text: "Quien pide un presupuesto de reforma o tiene una avería suele contactar a varias empresas a la vez. Si no contestas en minutos, el cliente ya contrató a otro."
        },
        {
          title: "Equipos en obra que no pueden atender el teléfono",
          text: "Técnicos y comerciales están en visitas o con las manos ocupadas, así que muchas llamadas y mensajes se quedan sin responder justo cuando entra el trabajo."
        },
        {
          title: "Presupuestos que se pierden sin seguimiento",
          text: "Se envía el presupuesto y no se retoma la conversación. Sin seguimiento, trabajos de ticket alto se enfrían y acaban en manos de la competencia."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Cuando entra una solicitud de presupuesto o una urgencia, Vendrava activa un agente de IA que contesta por voz o WhatsApp en minutos, no en horas. Aprende el guion de tu negocio y actúa como un asesor del sector: precalifica el tipo de trabajo, la urgencia, el presupuesto estimado y la ubicación, y agenda la visita técnica o transfiere a un técnico o comercial cuando detecta interés real. También hace outbound: retoma presupuestos enviados y reactiva contactos antiguos. El equipo humano mantiene siempre el control, y la IA avisa de que es un asistente y pide consentimiento cuando corresponde.",
      flow: ["Solicitud", "IA precalifica", "Visita técnica", "Handoff"],
      useCases: [
        "Respuesta inmediata a solicitudes de presupuesto y avisos de urgencia por voz y WhatsApp",
        "Precalificación de tipo de trabajo, urgencia, presupuesto estimado y ubicación",
        "Agendado de visitas técnicas y confirmación con recordatorios para reducir ausencias",
        "Reactivación por outbound de presupuestos enviados y contactos antiguos sin cerrar",
        "Transferencia a un técnico o comercial en cuanto hay interés real de contratar"
      ],
      automations: [
        "Llamada o mensaje de IA en cuanto entra una solicitud de presupuesto o una urgencia",
        "Precalificación del trabajo y transferencia al técnico con un resumen listo para actuar",
        "Recordatorios de visita técnica por WhatsApp y email para evitar desplazamientos en vano",
        "Seguimiento automático a presupuestos enviados que aún no tienen respuesta"
      ],
      kpis: [
        {
          value: "3.2×",
          label: "respuesta más rápida a solicitudes de presupuesto"
        },
        {
          value: "+34%",
          label: "más visitas técnicas agendadas"
        },
        {
          value: "24/7",
          label: "cobertura de urgencias y solicitudes entrantes"
        }
      ],
      faq: [
        {
          q: "¿Vendrava sirve para reformas, fontanería, electricidad y climatización a la vez?",
          a: "Sí. Vendrava se entrena con el guion y los criterios de cada tipo de servicio, así que precalifica igual de bien una reforma integral, una avería de fontanería o una instalación de climatización, y dirige cada solicitud al técnico o especialidad correspondiente."
        },
        {
          q: "¿Cómo gestiona las urgencias frente a los presupuestos que pueden esperar?",
          a: "Durante la precalificación, la IA detecta si se trata de una urgencia (una fuga, un corte eléctrico) o de un presupuesto planificado, y prioriza en consecuencia: transfiere de inmediato lo urgente y agenda una visita técnica para el resto."
        },
        {
          q: "¿La IA reemplaza a los técnicos o comerciales?",
          a: "No. La IA se encarga del primer contacto, la precalificación y el agendado; la visita, el presupuesto en firme y el cierre siguen siendo del equipo humano, que mantiene el control en todo momento."
        },
        {
          q: "¿También hace llamadas y seguimiento en frío (outbound)?",
          a: "Sí. Además de contestar lo que entra, Vendrava puede retomar presupuestos enviados, reactivar contactos antiguos y hacer campañas de llamadas a volumen, siempre avisando de que es un asistente de IA y respetando el consentimiento y los registros de no-llamar de cada país."
        },
        {
          q: "¿Sirve para empresas con varios técnicos, zonas o sedes?",
          a: "Sí. Los avisos y presupuestos pueden organizarse por zona, tipo de trabajo o técnico, manteniendo el seguimiento centralizado en un mismo CRM para que ninguna solicitud se quede sin atender."
        }
      ],
      ctaTitle: "Que ninguna solicitud de presupuesto se quede sin contestar",
      ctaSub: "Prueba Vendrava y agenda más visitas técnicas atendiendo cada presupuesto y cada urgencia en minutos, no en horas."
    },
    en: {
      metaTitle: "AI CRM for home services and remodeling | Vendrava",
      metaDescription: "Vendrava answers and pre-qualifies quote requests and urgent jobs for remodeling, plumbing, electrical, and HVAC by voice and WhatsApp, then hands off to a technician when there's real interest.",
      navLabel: "Home services",
      heroKicker: "Industry · Home services and remodeling",
      h1: "AI CRM for home services and remodeling",
      heroSub: "In home services, whoever answers first wins the job. Vendrava responds to every quote request and urgent call instantly, pre-qualifies it, and hands it to a technician when there's real interest.",
      painTitle: "The home services challenge",
      pains: [
        {
          title: "The first to answer wins the job",
          text: "Anyone requesting a remodeling quote or facing a breakdown usually contacts several companies at once. If you don't respond within minutes, the customer has already hired someone else."
        },
        {
          title: "Field teams that can't pick up the phone",
          text: "Technicians and reps are on visits or have their hands full, so many calls and messages go unanswered right when the work is coming in."
        },
        {
          title: "Quotes lost without follow-up",
          text: "A quote gets sent and the conversation is never picked back up. Without follow-up, high-ticket jobs go cold and end up with a competitor."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "When a quote request or an urgent job comes in, Vendrava triggers an AI agent that answers by voice or WhatsApp within minutes, not hours. It learns your business's script and acts like an advisor for your trade: it pre-qualifies the type of work, the urgency, the estimated budget, and the location, then books the site visit or hands off to a technician or rep the moment it detects real interest. It also runs outbound: it revives sent quotes and reactivates older contacts. The human team is always in control, and the AI discloses that it's an assistant and asks for consent where required.",
      flow: ["Request", "AI pre-qualifies", "Site visit", "Handoff"],
      useCases: [
        "Immediate response to quote requests and urgent job calls by voice and WhatsApp",
        "Pre-qualification of work type, urgency, estimated budget, and location",
        "Scheduling site visits and confirming them with reminders to cut no-shows",
        "Outbound reactivation of sent quotes and older contacts that never closed",
        "Handoff to a technician or rep as soon as there's real intent to hire"
      ],
      automations: [
        "AI call or message as soon as a quote request or urgent job comes in",
        "Work pre-qualification and handoff to the technician with a ready-to-act summary",
        "Site visit reminders via WhatsApp and email to avoid wasted trips",
        "Automatic follow-up on sent quotes that haven't been answered yet"
      ],
      kpis: [
        {
          value: "3.2×",
          label: "faster response to quote requests"
        },
        {
          value: "+34%",
          label: "more site visits booked"
        },
        {
          value: "24/7",
          label: "coverage for urgent jobs and inbound requests"
        }
      ],
      faq: [
        {
          q: "Does Vendrava work for remodeling, plumbing, electrical, and HVAC at once?",
          a: "Yes. Vendrava is trained on the script and criteria for each type of service, so it pre-qualifies a full remodel, a plumbing breakdown, or an HVAC install equally well, and routes each request to the right technician or specialty."
        },
        {
          q: "How does it handle urgent jobs versus quotes that can wait?",
          a: "During pre-qualification, the AI detects whether it's an emergency (a leak, a power outage) or a planned quote, and prioritizes accordingly: it transfers urgent cases immediately and books a site visit for the rest."
        },
        {
          q: "Does the AI replace technicians or reps?",
          a: "No. The AI handles first contact, pre-qualification, and scheduling; the visit, the firm quote, and closing stay with the human team, which remains in control at all times."
        },
        {
          q: "Does it also make cold calls and follow-up (outbound)?",
          a: "Yes. Beyond answering what comes in, Vendrava can revive sent quotes, reactivate older contacts, and run calling campaigns at volume, always disclosing that it's an AI assistant and respecting consent and each country's do-not-call registries."
        },
        {
          q: "Does it work for companies with multiple technicians, areas, or locations?",
          a: "Yes. Jobs and quotes can be organized by area, type of work, or technician, keeping follow-up centralized in one CRM so no request goes unanswered."
        }
      ],
      ctaTitle: "Never leave a quote request unanswered",
      ctaSub: "Try Vendrava and book more site visits by handling every quote and every urgent call in minutes, not hours."
    }
  },

  // ---------------------------------------------------------------------
  // 14. Insurance
  // ---------------------------------------------------------------------
  {
    id: "insurance",
    slugEs: "sectores/seguros",
    slugEn: "industries/insurance",
    es: {
      metaTitle: "CRM con IA para correedurías y agentes de seguros | Vendrava",
      metaDescription: "Vendrava ayuda a correedurías y agentes de seguros a contestar solicitudes de cotización, renovaciones y avisos por voz y WhatsApp, precalificar el ramo y agendar con el agente humano, sin dar asesoramiento vinculante ni cerrar pólizas por su cuenta.",
      navLabel: "Seguros",
      heroKicker: "Sector · Correedurías y agentes de seguros",
      h1: "CRM con IA para correedurías y agentes de seguros",
      heroSub: "Que ninguna solicitud de cotización o aviso de renovación se quede sin contestar. Vendrava atiende, precalifica el ramo y agenda con tu agente humano, que mantiene siempre el control.",
      painTitle: "El reto en correedurías y seguros",
      pains: [
        {
          title: "Solicitudes de cotización que se enfrían",
          text: "Auto, hogar, salud, vida o comercio: llegan consultas por varios ramos a la vez, y si nadie contesta rápido el interesado pide presupuesto a otra correeduría."
        },
        {
          title: "Renovaciones y avisos sin seguimiento a tiempo",
          text: "Coordinar a mano los vencimientos, avisos y recordatorios de renovación deja pólizas sin retener y clientes que se van a la competencia por no recibir una llamada a tiempo."
        },
        {
          title: "Presupuestos y venta cruzada que quedan olvidados",
          text: "Muchos presupuestos enviados no se retoman, y el potencial de venta cruzada entre ramos se pierde porque nadie hace el seguimiento en el momento adecuado."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Vendrava atiende por voz y WhatsApp las solicitudes entrantes y también hace llamadas en frío para renovaciones y nuevas pólizas, comportándose como un asesor comercial entrenado en tu correeduría: aprende tus ramos, las preguntas de calificación y las objeciones habituales del sector. Precalifica el tipo de seguro, el perfil y la urgencia, y agenda la conversación con tu agente humano. La IA nunca da asesoramiento financiero vinculante ni cierra pólizas por su cuenta: informa, recoge el consentimiento y avisa de que es una asistente de IA, dejando la recomendación y la firma en manos del profesional.",
      flow: ["Solicitud", "IA precalifica", "Agenda", "Agente humano"],
      useCases: [
        "Atención y precalificación de solicitudes de cotización por ramo (auto, hogar, salud, vida, comercio)",
        "Avisos y seguimiento automatizado de renovaciones y vencimientos de póliza",
        "Reenganche de presupuestos enviados que quedaron sin respuesta",
        "Detección de oportunidades de venta cruzada entre ramos para el agente humano",
        "Llamadas en frío a volumen para renovaciones y captación de nuevas pólizas"
      ],
      automations: [
        "Llamada o mensaje de precalificación en cuanto entra una solicitud de cotización",
        "Recordatorios y avisos de renovación por voz, WhatsApp y email antes del vencimiento",
        "Seguimiento a presupuestos enviados que no obtuvieron respuesta",
        "Agendado de la llamada con el agente humano con el aviso de IA y el consentimiento registrados"
      ],
      kpis: [
        {
          value: "3.2×",
          label: "respuesta más rápida a solicitudes de cotización"
        },
        {
          value: "+33%",
          label: "más renovaciones retenidas con seguimiento a tiempo"
        },
        {
          value: "24/7",
          label: "atención de solicitudes y avisos entrantes"
        }
      ],
      faq: [
        {
          q: "¿La IA de Vendrava da asesoramiento sobre qué póliza contratar?",
          a: "No. Vendrava informa de forma general, precalifica la solicitud y agenda con tu agente humano, pero nunca da asesoramiento financiero vinculante ni cierra pólizas por su cuenta. La recomendación y la firma son siempre del profesional."
        },
        {
          q: "¿Vendrava suena como un bot genérico o como alguien de mi correeduría?",
          a: "Se comporta como un asesor comercial entrenado en tu negocio: aprende tus ramos, tus preguntas de calificación y las objeciones habituales del sector, para que la conversación se sienta propia y no como un bot genérico."
        },
        {
          q: "¿Puede hacer llamadas en frío para renovaciones y nuevas pólizas?",
          a: "Sí. Vendrava combina inbound y outbound, incluidas llamadas en frío a volumen para renovaciones y captación, respetando los registros de no-llamar de cada país y las preferencias de contacto del cliente."
        },
        {
          q: "¿Cómo se gestiona el consentimiento y la normativa de protección de datos?",
          a: "El aviso de que es una asistente de IA, el consentimiento y el control humano son parte del proceso, no una nota legal. Vendrava registra estos pasos dentro de un sistema pensado para cumplir la normativa de protección de datos aplicable en cada mercado."
        },
        {
          q: "¿Sirve para correedurías que trabajan con varios ramos y aseguradoras?",
          a: "Sí. Las solicitudes se precalifican y se dirigen al agente o ramo correspondiente, manteniendo el seguimiento de cotizaciones, renovaciones y venta cruzada centralizado en un mismo CRM."
        }
      ],
      ctaTitle: "Que ninguna cotización ni renovación se quede sin contestar",
      ctaSub: "Prueba Vendrava y descubre cómo precalificar solicitudes, retener renovaciones y agendar con tu equipo, manteniendo el control humano y el consentimiento en cada paso."
    },
    en: {
      metaTitle: "AI CRM for insurance brokers and agents | Vendrava",
      metaDescription: "Vendrava helps insurance brokers and agents answer quote requests, renewals, and notices by voice and WhatsApp, pre-qualify the line of business, and book with the human agent, without giving binding advice or closing policies on its own.",
      navLabel: "Insurance",
      heroKicker: "Industry · Insurance brokers and agents",
      h1: "AI CRM for insurance brokers and agents",
      heroSub: "So no quote request or renewal notice goes unanswered. Vendrava answers, pre-qualifies the line of business, and books with your human agent, who always stays in control.",
      painTitle: "The insurance and brokerage challenge",
      pains: [
        {
          title: "Quote requests that go cold",
          text: "Auto, home, health, life, or commercial: requests come in across several lines at once, and if no one responds fast the prospect asks another broker for a quote."
        },
        {
          title: "Renewals and notices without timely follow-up",
          text: "Manually tracking expirations, notices, and renewal reminders leaves policies unretained and clients leaving for a competitor over a call that never came in time."
        },
        {
          title: "Quotes and cross-sell left forgotten",
          text: "Many sent quotes never get picked back up, and cross-sell potential across lines is lost because no one follows up at the right moment."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "Vendrava answers inbound requests by voice and WhatsApp and also runs cold calls for renewals and new policies, behaving like a sales advisor trained in your brokerage: it learns your lines of business, your qualifying questions, and the sector's common objections. It pre-qualifies the insurance type, profile, and urgency, then books the conversation with your human agent. The AI never gives binding financial advice or closes policies on its own: it informs, captures consent, and discloses that it's an AI assistant, leaving the recommendation and the signature with the professional.",
      flow: ["Request", "AI pre-qualifies", "Book", "Human agent"],
      useCases: [
        "Answering and pre-qualifying quote requests by line (auto, home, health, life, commercial)",
        "Automated notices and follow-up for renewals and policy expirations",
        "Re-engagement of sent quotes that went unanswered",
        "Surfacing cross-sell opportunities across lines for the human agent",
        "High-volume cold calling for renewals and new policy acquisition"
      ],
      automations: [
        "Pre-qualification call or message as soon as a quote request comes in",
        "Renewal reminders and notices by voice, WhatsApp, and email before expiration",
        "Follow-up on sent quotes that received no response",
        "Booking the call with the human agent, with the AI disclosure and consent on record"
      ],
      kpis: [
        {
          value: "3.2×",
          label: "faster response to quote requests"
        },
        {
          value: "+33%",
          label: "more renewals retained with timely follow-up"
        },
        {
          value: "24/7",
          label: "coverage for inbound requests and notices"
        }
      ],
      faq: [
        {
          q: "Does Vendrava's AI advise on which policy to buy?",
          a: "No. Vendrava shares general information, pre-qualifies the request, and books with your human agent, but it never gives binding financial advice or closes policies on its own. The recommendation and the signature always belong to the professional."
        },
        {
          q: "Does it sound like a generic bot or like someone from my brokerage?",
          a: "It behaves like a sales advisor trained in your business: it learns your lines, your qualifying questions, and the sector's common objections, so the conversation feels like your own rather than a generic bot."
        },
        {
          q: "Can it make cold calls for renewals and new policies?",
          a: "Yes. Vendrava combines inbound and outbound, including high-volume cold calls for renewals and acquisition, respecting each country's do-not-call registries and the client's contact preferences."
        },
        {
          q: "How are consent and data protection handled?",
          a: "Disclosing that it's an AI assistant, capturing consent, and keeping humans in control are part of the process, not a legal footnote. Vendrava records these steps within a system built to meet the data protection rules that apply in each market."
        },
        {
          q: "Does it work for brokerages handling multiple lines and carriers?",
          a: "Yes. Requests are pre-qualified and routed to the right agent or line, while quote, renewal, and cross-sell follow-up stays centralized in one CRM."
        }
      ],
      ctaTitle: "So no quote or renewal goes unanswered",
      ctaSub: "Try Vendrava and see how to pre-qualify requests, retain renewals, and book with your team, keeping human control and consent at every step."
    }
  },

  // ---------------------------------------------------------------------
  // gyms
  // ---------------------------------------------------------------------
  {
    id: "gyms",
    slugEs: "sectores/gimnasios",
    slugEn: "industries/gyms",
    es: {
      metaTitle: "CRM con IA para gimnasios y centros fitness | Vendrava",
      metaDescription: "Vendrava ayuda a gimnasios y centros fitness a responder leads de campañas al instante, agendar clases de prueba, recuperar bajas y reactivar inactivos por WhatsApp y voz, con control humano.",
      navLabel: "Gimnasios",
      heroKicker: "Sector · Gimnasios y centros fitness",
      h1: "CRM con IA para gimnasios y centros fitness",
      heroSub: "Responde al instante a los leads de tus campañas, agenda clases de prueba por WhatsApp y voz, y reactiva a socios inactivos, para que tu equipo dedique el tiempo a atender la sala y no a perseguir mensajes.",
      painTitle: "El reto en gimnasios y centros fitness",
      pains: [
        {
          title: "Leads de campañas que se enfrían en minutos",
          text: "La promoción de enero, la oferta de verano o el anuncio en redes generan una avalancha de mensajes, pero en recepción no siempre hay alguien libre para contestar. Quien no recibe respuesta rápida termina apuntándose en el gimnasio de al lado."
        },
        {
          title: "Clases de prueba y visitas que no se concretan",
          text: "Muchos interesados piden información pero nunca llegan a agendar su primera visita o clase de prueba. Sin un seguimiento constante, ese interés inicial se pierde antes de que pisen las instalaciones."
        },
        {
          title: "Bajas e inactivos sin recuperación",
          text: "Los socios que dejan de venir o cancelan la cuota rara vez reciben un contacto a tiempo. Reactivar a quien ya conoce tu centro suele ser más rentable que captar a alguien nuevo, pero hacerlo a mano es inviable con la operación diaria."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Vendrava centraliza los leads que llegan por formularios, anuncios, WhatsApp y llamadas, y usa agentes de IA por voz y mensaje para contestar al momento, resolver dudas de horarios y planes, y agendar la clase de prueba o la visita directamente en el calendario de tu centro. También activa recordatorios antes de la cita y campañas de reactivación para socios inactivos o que se dieron de baja, mientras tu equipo mantiene el control de cada conversación e interviene cuando hace falta. Los mensajes y llamadas se configuran respetando el consentimiento del contacto, la normativa de protección de datos aplicable y los registros de no-llamar de cada país.",
      flow: ["Lead", "IA", "Clase de prueba", "Alta"],
      useCases: [
        "Respuesta inmediata por WhatsApp y voz a leads de campañas de captación de socios",
        "Agendado automático de clase de prueba o visita a las instalaciones",
        "Recordatorios previos a la clase de prueba para reducir las ausencias",
        "Campañas de reactivación para socios inactivos que llevan semanas sin asistir",
        "Recuperación de bajas con una oferta o llamada de seguimiento a tiempo"
      ],
      automations: [
        "Mensaje o llamada de bienvenida en cuanto entra un lead de campaña",
        "Agendado de clase de prueba o visita con confirmación y recordatorio automáticos",
        "Detección de socios inactivos y secuencia de reenganche por WhatsApp",
        "Contacto de recuperación cuando se registra una baja o una cuota vencida"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "más rápido en responder a leads de campañas"
        },
        {
          value: "+30%",
          label: "clases de prueba agendadas"
        },
        {
          value: "24/7",
          label: "atención a interesados y socios"
        }
      ],
      faq: [
        {
          q: "¿Vendrava se integra con WhatsApp, el canal que más usan mis socios?",
          a: "Sí. Vendrava está diseñado para atender y dar seguimiento por WhatsApp además de voz, email y llamada, que es donde la mayoría de gimnasios concentra la conversación con leads y socios. Cada interacción queda registrada en la ficha del contacto."
        },
        {
          q: "¿Puede agendar clases de prueba directamente en nuestro calendario?",
          a: "Sí. El agente puede proponer horarios disponibles, confirmar la clase de prueba o la visita y enviar un recordatorio antes de la cita, sincronizado con el calendario que ya usa tu equipo, para reducir las ausencias."
        },
        {
          q: "¿Cómo ayuda a recuperar bajas y reactivar socios inactivos?",
          a: "Vendrava puede detectar socios que llevan tiempo sin asistir o que cancelaron su cuota y activar una secuencia de contacto por WhatsApp, llamada o email con un mensaje de reenganche u oferta, para que ninguna baja quede sin un intento de recuperación."
        },
        {
          q: "¿La IA sustituye al personal de recepción?",
          a: "No. Vendrava se encarga del primer contacto, el agendado y los recordatorios repetitivos, para que tu equipo dedique su tiempo a atender la sala y a los socios presentes. Las conversaciones que requieren criterio humano se transfieren a una persona en cualquier momento."
        },
        {
          q: "¿Cumple con la normativa al contactar a leads y antiguos socios?",
          a: "Los mensajes y llamadas se configuran respetando el consentimiento del contacto, la normativa de protección de datos aplicable en cada mercado y los registros de no-llamar de cada país. Puedes ajustar horarios de contacto, frecuencia y canales según donde opere tu centro."
        }
      ],
      ctaTitle: "Llena tus clases de prueba y recupera a tus socios",
      ctaSub: "Prueba Vendrava y descubre cómo responder a cada lead al instante, agendar visitas y reactivar inactivos sin sobrecargar a tu equipo."
    },
    en: {
      metaTitle: "AI CRM for gyms and fitness centers | Vendrava",
      metaDescription: "Vendrava helps gyms and fitness centers respond to campaign leads instantly, book trial classes, win back cancellations, and re-engage inactive members over WhatsApp and voice, with human control.",
      navLabel: "Gyms & fitness",
      heroKicker: "Industry · Gyms & fitness centers",
      h1: "AI CRM for gyms and fitness centers",
      heroSub: "Respond to campaign leads instantly, book trial classes over WhatsApp and voice, and re-engage inactive members, so your team spends time on the floor instead of chasing messages.",
      painTitle: "The gym and fitness center challenge",
      pains: [
        {
          title: "Campaign leads that go cold in minutes",
          text: "The January promo, the summer offer, or a social ad drives a flood of messages, but the front desk isn't always free to reply. Anyone who doesn't get a fast answer ends up signing up at the gym next door."
        },
        {
          title: "Trial classes and visits that never happen",
          text: "Plenty of prospects ask for information but never actually book their first visit or trial class. Without steady follow-up, that early interest fades before they ever walk through the door."
        },
        {
          title: "Cancellations and inactive members left alone",
          text: "Members who stop showing up or cancel their membership rarely get a timely contact. Winning back someone who already knows your center is usually cheaper than acquiring a stranger, but doing it by hand is impossible alongside daily operations."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "Vendrava centralizes leads arriving through forms, ads, WhatsApp, and calls, and uses voice and messaging AI agents to reply instantly, answer questions about schedules and plans, and book the trial class or visit straight into your center's calendar. It also triggers reminders before the appointment and re-engagement campaigns for inactive members or those who canceled, while your team keeps control of every conversation and steps in when needed. Messages and calls are configured in line with contact consent, the applicable data protection regulations, and each country's do-not-call registries.",
      flow: ["Lead", "AI", "Trial class", "Sign-up"],
      useCases: [
        "Instant WhatsApp and voice response to leads from member-acquisition campaigns",
        "Automatic booking of trial classes or facility visits",
        "Pre-class reminders to reduce no-shows",
        "Re-engagement campaigns for inactive members who haven't attended in weeks",
        "Win-back outreach for cancellations with a timely offer or follow-up call"
      ],
      automations: [
        "Welcome message or call the moment a campaign lead comes in",
        "Trial class or visit booking with automatic confirmation and reminder",
        "Inactive-member detection and a WhatsApp re-engagement sequence",
        "Win-back outreach when a cancellation or lapsed payment is logged"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "faster response to campaign leads"
        },
        {
          value: "+30%",
          label: "more trial classes booked"
        },
        {
          value: "24/7",
          label: "coverage for prospects and members"
        }
      ],
      faq: [
        {
          q: "Does Vendrava work with WhatsApp, the channel our members use most?",
          a: "Yes. Vendrava is built to handle and follow up over WhatsApp in addition to voice, email, and calls, which is where most gyms concentrate their conversations with leads and members. Every interaction is logged on the contact's record."
        },
        {
          q: "Can it book trial classes directly into our calendar?",
          a: "Yes. The agent can offer available time slots, confirm the trial class or visit, and send a reminder before the appointment, synced with the calendar your team already uses, to cut down on no-shows."
        },
        {
          q: "How does it help win back cancellations and re-engage inactive members?",
          a: "Vendrava can detect members who haven't attended in a while or who canceled their membership and trigger a contact sequence over WhatsApp, call, or email with a re-engagement message or offer, so no cancellation goes without a win-back attempt."
        },
        {
          q: "Does the AI replace our front-desk staff?",
          a: "No. Vendrava handles first contact, booking, and repetitive reminders so your team can focus on the floor and the members already there. Conversations that need human judgment are handed off to a person at any time."
        },
        {
          q: "Does it stay compliant when contacting leads and former members?",
          a: "Messages and calls are configured in line with contact consent, the data protection regulations applicable in each market, and each country's do-not-call registries. You can adjust contact hours, frequency, and channels based on where your center operates."
        }
      ],
      ctaTitle: "Fill your trial classes and win your members back",
      ctaSub: "Try Vendrava and see how to respond to every lead instantly, book visits, and re-engage inactive members without overloading your team."
    }
  },

  // ---------------------------------------------------------------------
  // restaurants
  // ---------------------------------------------------------------------
  {
    id: "restaurants",
    slugEs: "sectores/restaurantes",
    slugEn: "industries/restaurants",
    es: {
      metaTitle: "CRM con IA para restaurantes y hostelería | Vendrava",
      metaDescription: "Vendrava contesta llamadas y WhatsApp de reservas cuando el equipo está en sala, gestiona grupos y eventos, y reduce no-shows con recordatorios y confirmaciones. La IA no sustituye la atención en sala.",
      navLabel: "Restaurantes",
      heroKicker: "Sector · Restaurantes y hostelería",
      h1: "CRM con IA para restaurantes y hostelería",
      heroSub: "Cuando el equipo está en sala, nadie descuelga el teléfono. Vendrava contesta llamadas y WhatsApp de reservas, gestiona grupos y eventos, y reduce no-shows con recordatorios y confirmaciones, sin quitar sitio a la atención presencial.",
      painTitle: "El reto en restaurantes y hostelería",
      pains: [
        {
          title: "Reservas que se pierden en horas de servicio",
          text: "En pleno servicio el equipo está atendiendo mesas, no el teléfono ni el WhatsApp. Muchas llamadas quedan sin contestar y esas reservas se van a otro sitio."
        },
        {
          title: "Grupos y eventos que consumen tiempo",
          text: "Comidas de empresa, celebraciones y menús cerrados requieren varias idas y vueltas para cuadrar personas, fecha, alergias y presupuesto, justo cuando menos margen hay para responder rápido."
        },
        {
          title: "No-shows que dejan mesas vacías",
          text: "Una reserva confirmada que no aparece bloquea una mesa que podría haberse ocupado. Sin recordatorios ni confirmación previa, los no-shows se comen el aforo y el margen de la noche."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Cuando entra una llamada o un mensaje de WhatsApp y el equipo está en sala, Vendrava lo contesta con un agente de IA que toma la reserva, resuelve dudas de horario, menú o disponibilidad, y anota los datos clave: número de personas, fecha, franja y peticiones especiales. Para grupos y eventos recopila la información necesaria y traspasa la conversación a una persona con todo resumido. Antes del día reservado envía recordatorios y pide confirmación para reducir no-shows. La IA se ocupa de contestar y coordinar; la experiencia en sala y el trato con el comensal siguen siendo del equipo.",
      flow: ["Llamada o WhatsApp", "IA contesta", "Reserva", "Confirmación"],
      useCases: [
        "Atención de llamadas y WhatsApp de reservas cuando el equipo está en sala o fuera de horario",
        "Gestión de reservas: número de personas, fecha, franja, alergias y peticiones especiales",
        "Recopilación de datos de grupos y eventos y traspaso a una persona con la información resumida",
        "Recordatorios y confirmaciones previas para reducir no-shows",
        "Respuesta a dudas frecuentes de horarios, ubicación, carta o menús cerrados"
      ],
      automations: [
        "Respuesta automática por voz o WhatsApp a solicitudes de reserva entrantes",
        "Registro de la reserva con personas, fecha, franja y peticiones especiales",
        "Recordatorio y confirmación por WhatsApp antes de la fecha para reducir ausencias",
        "Traspaso a una persona de las solicitudes de grupos y eventos con el detalle recopilado"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "menos reservas perdidas por llamadas sin contestar"
        },
        {
          value: "+30%",
          label: "menos no-shows con recordatorios y confirmación"
        },
        {
          value: "24/7",
          label: "atención de reservas por voz y WhatsApp"
        }
      ],
      faq: [
        {
          q: "¿Vendrava sustituye la atención en sala?",
          a: "No. Vendrava contesta llamadas y WhatsApp y gestiona reservas cuando el equipo está ocupado atendiendo mesas o fuera de horario. La experiencia en sala y el trato con el comensal siguen siendo del equipo humano."
        },
        {
          q: "¿Cómo ayuda a reducir los no-shows?",
          a: "Vendrava envía recordatorios antes de la fecha reservada y pide confirmación al comensal. Si la reserva ya no interesa, esa mesa puede liberarse a tiempo para otra persona, en lugar de quedar vacía."
        },
        {
          q: "¿Puede gestionar reservas de grupos y eventos?",
          a: "Sí. Para grupos, celebraciones o menús cerrados, la IA recopila los datos necesarios (personas, fecha, alergias, tipo de menú, presupuesto orientativo) y traspasa la conversación a una persona del equipo con todo resumido para cerrar los detalles."
        },
        {
          q: "¿Qué pasa si el comensal prefiere hablar con una persona?",
          a: "La conversación puede pasar a un miembro del equipo en cualquier momento. La IA está para descargar de llamadas repetitivas y contestar cuando nadie puede, no para bloquear el contacto humano."
        },
        {
          q: "¿Sirve para un solo local o para varios restaurantes?",
          a: "Sirve para ambos. Las reservas, los mensajes y las automatizaciones pueden organizarse por local, manteniendo un seguimiento centralizado para cadenas o grupos con varias sedes."
        }
      ],
      ctaTitle: "Que ninguna reserva se pierda por tener el teléfono ocupado",
      ctaSub: "Prueba Vendrava y contesta cada llamada y WhatsApp de reservas, gestiona grupos y reduce no-shows, mientras tu equipo se centra en la sala."
    },
    en: {
      metaTitle: "AI CRM for restaurants and hospitality | Vendrava",
      metaDescription: "Vendrava answers reservation calls and WhatsApp messages when your team is on the floor, handles groups and events, and reduces no-shows with reminders and confirmations. The AI doesn't replace in-person service.",
      navLabel: "Restaurants",
      heroKicker: "Industry · Restaurants and hospitality",
      h1: "AI CRM for restaurants and hospitality",
      heroSub: "When the team is on the floor, no one picks up the phone. Vendrava answers reservation calls and WhatsApp messages, handles groups and events, and reduces no-shows with reminders and confirmations, without taking anything away from in-person service.",
      painTitle: "The restaurant and hospitality challenge",
      pains: [
        {
          title: "Reservations lost during service",
          text: "In the middle of service, the team is looking after tables, not the phone or WhatsApp. Many calls go unanswered, and those reservations end up somewhere else."
        },
        {
          title: "Groups and events that eat up time",
          text: "Company lunches, celebrations, and set menus take several back-and-forths to nail down party size, date, allergies, and budget, right when there's the least room to reply quickly."
        },
        {
          title: "No-shows that leave tables empty",
          text: "A confirmed reservation that never shows up blocks a table that could have been filled. Without reminders or prior confirmation, no-shows eat into your capacity and the night's margin."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "When a call or WhatsApp message comes in and the team is on the floor, Vendrava answers with an AI agent that takes the reservation, handles questions about hours, menu, or availability, and records the key details: party size, date, time slot, and special requests. For groups and events it gathers the information needed and hands the conversation to a person with everything summarized. Before the reserved day it sends reminders and asks for confirmation to reduce no-shows. The AI handles answering and coordinating; the in-person experience and guest care stay with the team.",
      flow: ["Call or WhatsApp", "AI answers", "Reservation", "Confirmation"],
      useCases: [
        "Answering reservation calls and WhatsApp messages when the team is on the floor or after hours",
        "Managing reservations: party size, date, time slot, allergies, and special requests",
        "Collecting group and event details and handing them to a person with the information summarized",
        "Reminders and prior confirmations to reduce no-shows",
        "Answering common questions about hours, location, menu, or set menus"
      ],
      automations: [
        "Automatic voice or WhatsApp response to incoming reservation requests",
        "Logging the reservation with party size, date, time slot, and special requests",
        "Reminder and confirmation via WhatsApp before the date to reduce no-shows",
        "Handing group and event requests to a person with the collected detail"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "fewer reservations lost to unanswered calls"
        },
        {
          value: "+30%",
          label: "fewer no-shows with reminders and confirmation"
        },
        {
          value: "24/7",
          label: "reservation coverage by voice and WhatsApp"
        }
      ],
      faq: [
        {
          q: "Does Vendrava replace in-person service?",
          a: "No. Vendrava answers calls and WhatsApp and manages reservations when the team is busy looking after tables or after hours. The in-person experience and guest care stay with the human team."
        },
        {
          q: "How does it help reduce no-shows?",
          a: "Vendrava sends reminders before the reserved date and asks the guest to confirm. If the reservation is no longer needed, that table can be freed up in time for someone else instead of sitting empty."
        },
        {
          q: "Can it handle group and event reservations?",
          a: "Yes. For groups, celebrations, or set menus, the AI collects the details needed (party size, date, allergies, menu type, rough budget) and hands the conversation to a team member with everything summarized to finalize the details."
        },
        {
          q: "What if the guest prefers to speak with a person?",
          a: "The conversation can move to a team member at any point. The AI is there to take repetitive calls off the team and answer when no one can, not to block human contact."
        },
        {
          q: "Does it work for a single venue or for multiple restaurants?",
          a: "It works for both. Reservations, messages, and automations can be organized by venue, keeping follow-up centralized for chains or groups with several locations."
        }
      ],
      ctaTitle: "Don't lose a reservation to a busy phone line",
      ctaSub: "Try Vendrava and answer every reservation call and WhatsApp, handle groups, and cut no-shows while your team focuses on the floor."
    }
  },

  // ---------------------------------------------------------------------
  // law-firms
  // ---------------------------------------------------------------------
  {
    id: "law-firms",
    slugEs: "sectores/despachos-abogados",
    slugEn: "industries/law-firms",
    es: {
      metaTitle: "CRM con IA para despachos de abogados | Vendrava",
      metaDescription: "Vendrava ayuda a despachos de abogados a calificar consultas por área y urgencia, agendar la primera consulta y filtrar casos no encajables, siempre con gestión administrativa y sin asesoramiento legal.",
      navLabel: "Despachos de abogados",
      heroKicker: "Sector · Despachos de abogados",
      h1: "CRM con IA para despachos de abogados",
      heroSub: "Califica cada consulta por área y urgencia, agenda la primera cita y filtra los casos que no encajan. Vendrava se encarga de la gestión administrativa; el criterio jurídico siempre queda en manos del abogado.",
      painTitle: "El reto en despachos de abogados",
      pains: [
        {
          title: "Consultas muy variadas y difíciles de clasificar",
          text: "Llegan asuntos de áreas y urgencias muy distintas por teléfono, formulario y WhatsApp, y clasificar cada uno a mano consume tiempo que el despacho podría dedicar a los casos que ya tiene abiertos."
        },
        {
          title: "Primeras consultas que no se agendan a tiempo",
          text: "Si nadie responde con rapidez, el potencial cliente contacta con otro despacho; en asuntos con plazos ajustados, esa demora significa perder el caso directamente."
        },
        {
          title: "Tiempo perdido en casos que no encajan",
          text: "Parte de las consultas quedan fuera del área de práctica del despacho o no son viables, pero se detectan tarde, después de invertir tiempo del equipo en ellas."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Cuando entra una consulta, Vendrava activa un agente de IA por voz o WhatsApp que identifica el área jurídica, la urgencia y el tipo de asunto, recoge los datos básicos de contacto y ayuda a agendar la primera consulta con el abogado adecuado. La IA se limita a la gestión administrativa y a orientar sobre el funcionamiento del despacho: nunca ofrece asesoramiento legal ni valora el fondo del caso, algo que siempre corresponde al profesional. La información se trata con confidencialidad y conforme a la normativa de protección de datos aplicable en cada país.",
      flow: ["Consulta", "IA", "Calificación", "Primera consulta"],
      useCases: [
        "Calificación de cada consulta por área jurídica, urgencia y tipo de asunto",
        "Agendado de la primera consulta con el abogado o área correspondiente",
        "Filtrado de casos que quedan fuera del área de práctica o no son viables",
        "Seguimiento de presupuestos enviados que aún no han recibido respuesta",
        "Reenganche de consultas antiguas que quedaron sin agendar"
      ],
      automations: [
        "Respuesta y calificación inicial en cuanto entra una consulta por voz o mensaje",
        "Enrutamiento del asunto al área o abogado adecuado según lo identificado por la IA",
        "Recordatorios automáticos de la primera consulta para reducir ausencias",
        "Seguimiento de presupuestos con recordatorios espaciados hasta obtener respuesta"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "respuesta más rápida a consultas entrantes"
        },
        {
          value: "+30%",
          label: "más primeras consultas agendadas"
        },
        {
          value: "24/7",
          label: "atención de consultas entrantes"
        }
      ],
      faq: [
        {
          q: "¿La IA de Vendrava da asesoramiento legal a los clientes?",
          a: "No. Vendrava se limita a la gestión administrativa: identifica el área y la urgencia, recoge datos de contacto y ayuda a agendar la cita. Cualquier valoración jurídica o consejo sobre el caso corresponde siempre al abogado."
        },
        {
          q: "¿Cómo se protege la confidencialidad y los datos de los clientes?",
          a: "La información de contacto y de las consultas se trata como material confidencial, dentro de un sistema pensado para el manejo responsable de datos y conforme a la normativa de protección de datos aplicable en cada país."
        },
        {
          q: "¿Puede Vendrava filtrar los casos que no encajan con el despacho?",
          a: "Sí. Según los criterios que definas (áreas de práctica, tipo de asunto, viabilidad básica), la IA identifica las consultas que quedan fuera del alcance del despacho y las separa antes de ocupar el tiempo del equipo."
        },
        {
          q: "¿Sirve para despachos con varias áreas de práctica o sedes?",
          a: "Sí, las consultas y el seguimiento pueden organizarse por área jurídica, abogado o sede, dirigiendo cada asunto al profesional correspondiente y manteniendo todo centralizado en un mismo CRM."
        },
        {
          q: "¿Cómo ayuda con el seguimiento de presupuestos?",
          a: "Vendrava automatiza recordatorios espaciados en el tiempo para los presupuestos enviados que aún no tienen respuesta, de modo que ningún potencial cliente quede sin seguimiento por olvido."
        }
      ],
      ctaTitle: "Agenda más primeras consultas sin perder el control del caso",
      ctaSub: "Prueba Vendrava y descubre cómo calificar y agendar consultas con IA, dejando siempre el criterio jurídico en manos de tus abogados."
    },
    en: {
      metaTitle: "AI CRM for law firms | Vendrava",
      metaDescription: "Vendrava helps law firms qualify inquiries by practice area and urgency, book the first consultation, and filter out cases that don't fit, always as administrative support and never legal advice.",
      navLabel: "Law firms",
      heroKicker: "Industry · Law firms",
      h1: "AI CRM for law firms",
      heroSub: "Qualify every inquiry by practice area and urgency, book the first consultation, and filter out cases that don't fit. Vendrava handles the administrative work; legal judgment always stays with the attorney.",
      painTitle: "The law firm challenge",
      pains: [
        {
          title: "Inquiries that are varied and hard to classify",
          text: "Matters arrive across very different practice areas and urgency levels by phone, form, and WhatsApp, and sorting each one by hand takes time the firm could spend on its open cases."
        },
        {
          title: "First consultations not booked in time",
          text: "If no one responds quickly, the prospective client contacts another firm; in matters with tight deadlines, that delay means losing the case outright."
        },
        {
          title: "Time lost on cases that don't fit",
          text: "Some inquiries fall outside the firm's practice areas or aren't viable, but that gets spotted late, after the team has already invested time in them."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "When an inquiry comes in, Vendrava triggers a voice or WhatsApp AI agent that identifies the practice area, urgency, and type of matter, collects basic contact details, and helps book the first consultation with the right attorney. The AI is limited to administrative work and explaining how the firm operates: it never provides legal advice or assesses the merits of a case, which always remains with the professional. Information is handled confidentially and in line with the data protection rules applicable in each country.",
      flow: ["Inquiry", "AI", "Qualification", "First consultation"],
      useCases: [
        "Qualifying each inquiry by practice area, urgency, and type of matter",
        "Booking the first consultation with the right attorney or practice area",
        "Filtering out cases that fall outside the firm's practice areas or aren't viable",
        "Following up on sent quotes that haven't received a reply yet",
        "Re-engaging older inquiries that were never booked"
      ],
      automations: [
        "Response and initial qualification as soon as an inquiry comes in by voice or message",
        "Routing the matter to the right practice area or attorney based on what the AI identifies",
        "Automatic reminders for the first consultation to reduce no-shows",
        "Quote follow-up with spaced reminders until a reply is received"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "faster response to inbound inquiries"
        },
        {
          value: "+30%",
          label: "more first consultations booked"
        },
        {
          value: "24/7",
          label: "coverage for inbound inquiries"
        }
      ],
      faq: [
        {
          q: "Does Vendrava's AI give clients legal advice?",
          a: "No. Vendrava is limited to administrative work: it identifies the area and urgency, collects contact details, and helps book the appointment. Any legal assessment or advice about the case always rests with the attorney."
        },
        {
          q: "How is client confidentiality and data protected?",
          a: "Contact and inquiry information is treated as confidential material, within a system built for responsible data handling and in line with the data protection rules applicable in each country."
        },
        {
          q: "Can Vendrava filter out cases that don't fit the firm?",
          a: "Yes. Based on the criteria you define (practice areas, type of matter, basic viability), the AI identifies inquiries that fall outside the firm's scope and sets them aside before they take up the team's time."
        },
        {
          q: "Does it work for firms with multiple practice areas or offices?",
          a: "Yes, inquiries and follow-up can be organized by practice area, attorney, or office, routing each matter to the right professional while keeping everything centralized in one CRM."
        },
        {
          q: "How does it help with quote follow-up?",
          a: "Vendrava automates spaced-out reminders for sent quotes that haven't had a reply, so no prospective client falls through the cracks because a follow-up was forgotten."
        }
      ],
      ctaTitle: "Book more first consultations without losing control of the case",
      ctaSub: "Try Vendrava and see how to qualify and book inquiries with AI, keeping legal judgment firmly in your attorneys' hands."
    }
  },

  // ---------------------------------------------------------------------
  // physiotherapy
  // ---------------------------------------------------------------------
  {
    id: "physiotherapy",
    slugEs: "sectores/fisioterapia",
    slugEn: "industries/physiotherapy",
    es: {
      metaTitle: "CRM con IA para clínicas de fisioterapia y podología | Vendrava",
      metaDescription: "Vendrava ayuda a clínicas de fisioterapia y podología a contestar y agendar citas cuando el equipo está tratando: recordatorios, recuperación de no-shows y seguimiento de bonos de sesiones por voz y WhatsApp, siempre bajo control humano y sin diagnóstico clínico.",
      navLabel: "Fisioterapia",
      heroKicker: "Sector · Fisioterapia y podología",
      h1: "CRM con IA para clínicas de fisioterapia y podología",
      heroSub: "Cuando tus fisioterapeutas y podólogos están tratando, el teléfono no puede quedarse sin respuesta. Vendrava contesta, agenda la cita por voz y WhatsApp y da seguimiento a los bonos de sesiones; la valoración clínica siempre queda en tu equipo.",
      painTitle: "El reto en fisioterapia y podología",
      pains: [
        {
          title: "Nadie contesta mientras el equipo trata",
          text: "En camilla o en gabinete, con las manos ocupadas, el terapeuta no puede atender el teléfono ni WhatsApp. Quien busca cita para un dolor de espalda o una revisión del pie llama al siguiente centro en lugar de esperar, y esa cita nunca entra."
        },
        {
          title: "No-shows y huecos que no se rellenan",
          text: "Las ausencias y las cancelaciones de última hora dejan la camilla parada y la agenda descuadrada. Sin recordatorios ni nadie que retome el contacto para reagendar, cada hueco es una sesión perdida difícil de recuperar."
        },
        {
          title: "Bonos de sesiones que se quedan a medias",
          text: "Muchos pacientes compran bonos de varias sesiones y dejan de venir antes de completarlos. Sin un seguimiento que les recuerde las sesiones pendientes y les proponga fecha, el tratamiento queda incompleto y el bono sin cerrar."
        }
      ],
      howTitle: "Cómo ayuda Vendrava",
      howText: "Vendrava se comporta como un recepcionista entrenado en tu clínica: aprende tus servicios de fisioterapia y podología, tus preguntas de calificación y tus respuestas habituales sobre horarios, primera visita y bonos. Contesta llamadas y WhatsApp mientras el equipo está tratando, identifica el motivo (primera visita, seguimiento, revisión del pie, sesión de bono), agenda o reprograma la cita con el profesional adecuado y envía recordatorios para reducir ausencias. También da seguimiento a los bonos de sesiones, recordando las sesiones pendientes y proponiendo fecha para completarlas. Solo hace gestión administrativa: nunca da diagnóstico ni indicación clínica, y cualquier caso puede pasar al equipo humano en cualquier momento. Los datos de salud se tratan como un valor a proteger, con aviso de uso de IA, consentimiento y control humano según la normativa de protección de datos aplicable en cada país.",
      flow: ["Llamada", "Motivo", "Agenda", "Recordatorio"],
      useCases: [
        "Atención de llamadas y WhatsApp mientras el equipo está tratando, fuera de horario o cuando la recepción está ocupada",
        "Calificación del motivo de contacto (primera visita, seguimiento, revisión podológica, sesión de bono) antes de agendar",
        "Agendado y reprogramación de citas según la disponibilidad de cada fisioterapeuta o podólogo",
        "Recordatorios de cita y recuperación de no-shows para reagendar y rellenar huecos de agenda",
        "Seguimiento de bonos de sesiones: recordar sesiones pendientes y proponer fecha para completarlas"
      ],
      automations: [
        "Respuesta automática a llamadas y mensajes entrantes con calificación del motivo",
        "Agendado y reprogramación de citas según la disponibilidad de cada profesional o box de tratamiento",
        "Recordatorios de cita por WhatsApp, SMS o email para reducir ausencias",
        "Seguimiento de bonos de sesiones y recuperación automática de no-shows para reagendar"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "menos llamadas sin atender mientras se trata"
        },
        {
          value: "+30%",
          label: "más citas y sesiones de bono agendadas"
        },
        {
          value: "24/7",
          label: "atención de pacientes entrantes"
        }
      ],
      faq: [
        {
          q: "¿La IA de Vendrava da diagnósticos o indicaciones de tratamiento?",
          a: "No. Vendrava solo hace gestión administrativa: contesta, identifica el motivo de contacto y agenda la cita. Cualquier valoración, diagnóstico o pauta de tratamiento depende siempre del fisioterapeuta o podólogo."
        },
        {
          q: "¿Cómo contesta si mis terapeutas están tratando y no pueden atender el teléfono?",
          a: "Vendrava atiende las llamadas y los WhatsApp que entran mientras el equipo trabaja en camilla o en gabinete, identifica el motivo y agenda la cita según la disponibilidad de cada profesional. Así ninguna consulta se queda sin respuesta aunque nadie pueda atender el teléfono en ese momento."
        },
        {
          q: "¿Puede hacer seguimiento de los bonos de sesiones?",
          a: "Sí, en la parte administrativa. Vendrava recuerda al paciente las sesiones que le quedan por usar, le propone fecha para las siguientes y da seguimiento hasta completar el bono, dejando cualquier decisión clínica sobre el tratamiento en manos del equipo."
        },
        {
          q: "¿Cómo se protegen los datos de salud de los pacientes?",
          a: "El tratamiento responsable de los datos es parte del servicio: aviso de que se usa IA, registro del consentimiento y control humano sobre las conversaciones, dentro de un sistema alineado con la normativa de protección de datos aplicable en cada país."
        },
        {
          q: "¿Qué pasa si el paciente prefiere hablar con una persona?",
          a: "La conversación puede pasar al equipo de la clínica en cualquier momento, especialmente ante dudas clínicas, dolor agudo o casos que requieran atención personalizada. El equipo humano mantiene siempre el control."
        }
      ],
      ctaTitle: "Que ninguna llamada perdida deje una camilla parada",
      ctaSub: "Prueba Vendrava y descubre cómo contestar, agendar y dar seguimiento a citas y bonos de tu clínica de fisioterapia y podología sin dejar de lado el criterio clínico ni la protección de datos."
    },
    en: {
      metaTitle: "AI CRM for physiotherapy and podiatry clinics | Vendrava",
      metaDescription: "Vendrava helps physiotherapy and podiatry clinics answer and book appointments while the team is treating: reminders, no-show recovery, and session-package tracking by voice and WhatsApp, always under human control and never giving clinical advice.",
      navLabel: "Physiotherapy",
      heroKicker: "Industry · Physiotherapy and podiatry",
      h1: "AI CRM for physiotherapy and podiatry clinics",
      heroSub: "When your physiotherapists and podiatrists are treating, the phone can't go unanswered. Vendrava answers, books the appointment by voice and WhatsApp, and follows up on session packages; clinical judgment always stays with your team.",
      painTitle: "The physiotherapy and podiatry challenge",
      pains: [
        {
          title: "No one answers while the team is treating",
          text: "On the table or in the treatment room with their hands full, the therapist can't pick up the phone or WhatsApp. Someone looking for an appointment for back pain or a foot checkup calls the next clinic instead of waiting, and that appointment never comes in."
        },
        {
          title: "No-shows and gaps that go unfilled",
          text: "No-shows and last-minute cancellations leave the table idle and the schedule broken. Without reminders or anyone reaching back out to rebook, every gap is a lost session that's hard to recover."
        },
        {
          title: "Session packages left half-finished",
          text: "Many patients buy multi-session packages and stop coming before completing them. Without follow-up to remind them of remaining sessions and offer a date, the treatment stays incomplete and the package unclosed."
        }
      ],
      howTitle: "How Vendrava helps",
      howText: "Vendrava behaves like a receptionist trained in your clinic: it learns your physiotherapy and podiatry services, your qualifying questions, and your usual answers about hours, first visits, and packages. It answers calls and WhatsApp while the team is treating, identifies the reason (first visit, follow-up, foot checkup, package session), books or reschedules the appointment with the right provider, and sends reminders to cut no-shows. It also follows up on session packages, reminding patients of remaining sessions and offering a date to complete them. It only handles administrative work: it never gives a diagnosis or clinical advice, and any case can be handed to the human team at any point. Health data is treated as something to protect, with an AI-use notice, consent, and human control in line with the data protection regulations applicable in each country.",
      flow: ["Call", "Reason", "Schedule", "Reminder"],
      useCases: [
        "Handling calls and WhatsApp while the team is treating, after hours, or when the front desk is busy",
        "Qualifying the reason for contact (first visit, follow-up, podiatry checkup, package session) before booking",
        "Scheduling and rescheduling appointments based on each physiotherapist's or podiatrist's availability",
        "Appointment reminders and no-show recovery to rebook and fill schedule gaps",
        "Session-package tracking: reminding patients of remaining sessions and offering a date to complete them"
      ],
      automations: [
        "Automatic response to inbound calls and messages with reason-for-contact qualification",
        "Scheduling and rescheduling appointments based on each provider's or treatment room's availability",
        "Appointment reminders via WhatsApp, SMS, or email to reduce no-shows",
        "Session-package follow-up and automatic no-show recovery to rebook"
      ],
      kpis: [
        {
          value: "2.8×",
          label: "fewer unanswered calls while treating"
        },
        {
          value: "+30%",
          label: "more appointments and package sessions booked"
        },
        {
          value: "24/7",
          label: "coverage for inbound patients"
        }
      ],
      faq: [
        {
          q: "Does Vendrava's AI give diagnoses or treatment advice?",
          a: "No. Vendrava only handles administrative work: it answers, identifies the reason for contact, and books the appointment. Any assessment, diagnosis, or treatment guidance always depends on the physiotherapist or podiatrist."
        },
        {
          q: "How does it answer if my therapists are treating and can't pick up the phone?",
          a: "Vendrava handles the calls and WhatsApp messages that come in while the team is working on the table or in the treatment room, identifies the reason, and books the appointment based on each provider's availability. That way no inquiry goes unanswered even when no one can pick up the phone at that moment."
        },
        {
          q: "Can it follow up on session packages?",
          a: "Yes, on the administrative side. Vendrava reminds the patient of the sessions they have left, offers a date for the next ones, and follows up until the package is complete, leaving any clinical decision about the treatment to the team."
        },
        {
          q: "How is patients' health data protected?",
          a: "Responsible data handling is part of the service: notice that AI is being used, a record of consent, and human control over conversations, within a system aligned with the data protection regulations applicable in each country."
        },
        {
          q: "What if the patient prefers to speak with a person?",
          a: "The conversation can be handed to the clinic's team at any point, especially for clinical questions, acute pain, or cases that need personalized attention. The human team always stays in control."
        }
      ],
      ctaTitle: "Don't let a missed call leave a table idle",
      ctaSub: "Try Vendrava and see how to answer, book, and follow up on appointments and session packages for your physiotherapy and podiatry clinic without setting aside clinical judgment or data protection."
    }
  },
];
