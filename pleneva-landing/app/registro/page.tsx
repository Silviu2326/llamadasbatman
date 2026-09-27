import type { Metadata } from "next";
import { AuthScreen } from "../components/AuthScreen";

export const metadata: Metadata = {
  title: "Crear cuenta | Pleneva",
  description: "Crea tu cuenta de Pleneva.",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const selected = (await searchParams).plan;
  const plan = selected && ["pro", "completo"].includes(selected) ? selected : undefined;
  return <AuthScreen mode="register" plan={plan} />;
}
