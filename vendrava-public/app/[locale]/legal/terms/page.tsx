import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { LegalPageTemplate } from "@/components/templates/LegalPageTemplate";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "legal.terms",
    locale: "en",
    title: "Terms and conditions | Vendrava",
    description: "Terms of use for the Vendrava platform for sales teams.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <LegalPageTemplate locale="en" title="Terms and conditions" path="legal/terms" breadcrumbLabel="Terms" updatedLabel="2026">
      <section>
        <h2>Use of the service</h2>
        <p>
          Access to Vendrava is subject to these terms. By using the platform, the customer agrees to use it lawfully
          and in accordance with applicable regulations in its market, including those related to automated calls and
          data protection.
        </p>
      </section>
      <section>
        <h2>Accounts and teams</h2>
        <p>
          Each organization is responsible for managing its team&apos;s access and permissions within the platform, as well
          as the use its users make of AI agents and configured automations.
        </p>
      </section>
      <section>
        <h2>AI credits and plans</h2>
        <p>
          Use of AI features may be subject to credits or usage limits depending on the contracted plan. Specific
          details of each plan are agreed directly with the sales team.
        </p>
      </section>
      <section>
        <h2>Limitation of liability</h2>
        <p>
          Vendrava helps automate and accelerate commercial processes, but does not guarantee specific sales
          outcomes. Final control over business decisions remains with the customer&apos;s team.
        </p>
      </section>
    </LegalPageTemplate>
  );
}
