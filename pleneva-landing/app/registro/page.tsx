import type { Metadata } from "next";
import { AuthScreen } from "../components/AuthScreen";

export const metadata: Metadata = {
  title: "Crear cuenta | Pleneva",
  description: "Crea tu cuenta de Pleneva.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <AuthScreen mode="register" />;
}
