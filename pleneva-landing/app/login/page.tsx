import type { Metadata } from "next";
import { AuthScreen } from "../components/AuthScreen";

export const metadata: Metadata = {
  title: "Iniciar sesión | Pleneva",
  description: "Entra en tu espacio de Pleneva.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
