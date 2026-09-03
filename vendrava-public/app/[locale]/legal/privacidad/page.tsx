import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { LegalPageTemplate } from "@/components/templates/LegalPageTemplate";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "legal.privacy",
    locale: "es",
    title: "Política de privacidad | Vendrava",
    description: "Cómo Vendrava trata los datos personales y comerciales de sus usuarios y clientes.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  return (
    <LegalPageTemplate locale="es" title="Política de privacidad" path="legal/privacidad" breadcrumbLabel="Privacidad" updatedLabel="2026">
      <section>
        <h2>Responsable del tratamiento</h2>
        <p>
          Vendrava es un producto operado por SprintMarkt, agencia digital con sede en Valencia (España). Para cualquier
          cuestión relacionada con el tratamiento de datos puedes contactar con el responsable a través de la página de
          contacto.
        </p>
      </section>
      <section>
        <h2>Qué datos tratamos</h2>
        <p>
          Vendrava trata datos de contacto (nombre, email, teléfono, empresa) que los usuarios facilitan al solicitar
          una demo, contactarnos o usar la plataforma, así como datos generados por el uso del producto, como el
          historial de leads, llamadas y conversaciones gestionadas por el CRM.
        </p>
      </section>
      <section>
        <h2>Con qué finalidad</h2>
        <p>
          Usamos estos datos para prestar el servicio, responder solicitudes comerciales, mejorar el producto y
          cumplir con obligaciones legales aplicables en cada mercado.
        </p>
      </section>
      <section>
        <h2>Con quién se comparte</h2>
        <p>
          Los datos pueden compartirse con proveedores tecnológicos necesarios para operar la plataforma (por ejemplo,
          infraestructura de llamadas o mensajería), siempre bajo acuerdos de confidencialidad.
        </p>
      </section>
      <section>
        <h2>Derechos del usuario</h2>
        <p>
          Los usuarios pueden solicitar acceso, rectificación o eliminación de sus datos personales escribiendo a
          nuestro equipo a través de la página de contacto.
        </p>
      </section>
    </LegalPageTemplate>
  );
}
