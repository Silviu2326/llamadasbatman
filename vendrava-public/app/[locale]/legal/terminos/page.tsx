import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { LegalPageTemplate } from "@/components/templates/LegalPageTemplate";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "legal.terms",
    locale: "es",
    title: "Términos y condiciones | Vendrava",
    description: "Condiciones de uso de la plataforma Vendrava para equipos comerciales.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  return (
    <LegalPageTemplate locale="es" title="Términos y condiciones" path="legal/terminos" breadcrumbLabel="Términos" updatedLabel="2026">
      <section>
        <h2>Uso del servicio</h2>
        <p>
          El acceso a Vendrava está sujeto a estos términos. Al usar la plataforma, el cliente acepta utilizarla de
          forma lícita y conforme a la normativa aplicable en su mercado, incluyendo la relativa a llamadas
          automatizadas y protección de datos.
        </p>
      </section>
      <section>
        <h2>Cuentas y equipos</h2>
        <p>
          Cada organización es responsable de gestionar los accesos y permisos de su equipo dentro de la plataforma,
          así como del uso que sus usuarios hagan de los agentes IA y de las automatizaciones configuradas.
        </p>
      </section>
      <section>
        <h2>Créditos de IA y planes</h2>
        <p>
          El uso de funcionalidades de IA puede estar sujeto a créditos o límites de uso según el plan contratado. Los
          detalles específicos de cada plan se acuerdan directamente con el equipo comercial.
        </p>
      </section>
      <section>
        <h2>Limitación de responsabilidad</h2>
        <p>
          Vendrava ayuda a automatizar y acelerar procesos comerciales, pero no garantiza resultados de ventas
          específicos. El control final sobre las decisiones comerciales corresponde al equipo del cliente.
        </p>
      </section>
    </LegalPageTemplate>
  );
}
