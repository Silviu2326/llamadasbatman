import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { buildMetadata } from "@/lib/metadata";

const ITEMS = [
  { icon: "◎", title: "AI disclosure on the call", text: "The agent can identify itself as an AI assistant at the start of the conversation, per each market's regulations, including the EU AI Act." },
  { icon: "✓", title: "Consent and calling hours", text: "Configure consent, permitted calling hours and exclusions per market before reaching a lead." },
  { icon: "⇄", title: "Human control", text: "AI proposes and accelerates; your team approves, edits or takes the conversation at any time." },
  { icon: "▤", title: "Traceability", text: "Every call, summary and AI action can be logged and connected to the relevant lead." },
  { icon: "⬢", title: "User permissions", text: "Define what each team member can see and do based on their role in the organization." },
  { icon: "◉", title: "Data handling (GDPR)", text: "Commercial data is managed within an architecture focused on control and traceability, designed with GDPR in mind." },
  { icon: "⬡", title: "Per-team configuration", text: "Each team adjusts permissions, flows and automation levels according to its internal policies." },
  { icon: "◇", title: "Integration security", text: "Connections with channels like email and WhatsApp are designed with B2B security best practices in mind." },
];

const FAQ = [
  {
    q: "Does the customer know they are talking to an AI?",
    a: "Yes. Vendrava's agent can state at the start of the conversation that it is an AI assistant, in line with each market's transparency requirements, such as the EU AI Act.",
  },
  {
    q: "Who controls what the AI does?",
    a: "Your team. The AI is designed to propose actions and accelerate commercial processes, but human control remains a core part of the system: your team approves, edits or takes the conversation whenever needed.",
  },
  {
    q: "Is Vendrava GDPR compliant?",
    a: "Vendrava is designed with an architecture focused on control, traceability and responsible handling of commercial data. Each organization should review the specific legal requirements of its market with its legal team.",
  },
  {
    q: "Does Vendrava record calls?",
    a: "Calls and conversations handled by Vendrava can be logged and connected to the CRM to keep traceability, depending on each team's configuration and applicable regulations.",
  },
  {
    q: "Can I configure different permissions per team?",
    a: "Yes, permissions and access levels can be defined by role and by team within the organization.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "security",
    locale: "en",
    title: "Security, compliance and human control | Vendrava",
    description:
      "Vendrava reaches out with transparency: AI disclosure on the call, consent, human control and traceability connected to the CRM, with a GDPR-oriented approach.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <>
      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs locale="en" items={[{ name: "Home", path: "" }, { name: "Security", path: "security" }]} />
        <div className="mt-5">
          <Badge>Security &amp; compliance</Badge>
        </div>
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
          Commercial AI with transparency, consent and human control
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
          Vendrava is designed so AI reaches out and answers with transparency: disclosure that it is an AI, consent,
          human control and traceability connected to the CRM.
        </p>
      </Container>

      <Container size="xl" className="py-10 md:py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-5">
              <span className="text-xl text-cyan">{item.icon}</span>
              <div className="mb-1.5 mt-3 text-base font-semibold text-white">{item.title}</div>
              <div className="text-[13px] leading-relaxed text-muted">{item.text}</div>
            </div>
          ))}
        </div>
      </Container>

      <Container size="md" className="pb-10">
        <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-6 text-sm leading-relaxed text-soft">
          Automated calls should be configured in line with applicable regulations, consent, permitted calling hours,
          transparency requirements (such as the EU AI Act&rsquo;s AI-disclosure duty) and each market&rsquo;s privacy policies.
        </div>
      </Container>

      <FAQSection tag="FAQ" title="Frequently asked questions" items={FAQ} />

      <FinalCTASection
        locale="en"
        title="Don't let an opportunity slip away because nobody replied in time"
        sub="Try Vendrava with 100,000 AI credits included."
        primary="Book a demo"
        secondary="Talk to sales"
      />
    </>
  );
}
