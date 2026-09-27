"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { Logo } from "./Logo";
import { platformUrl } from "../lib/platform";

type Mode = "login" | "register";
type AuthResult = { error?: string; checkoutUrl?: string; user?: { isPlatformAdmin?: boolean } };

export function AuthScreen({ mode, plan }: { mode: Mode; plan?: string }) {
  const isRegister = mode === "register";
  const paidCheckoutEnabled = process.env.NEXT_PUBLIC_PAID_CHECKOUT_ENABLED === "true";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const panel = platformUrl();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!panel) {
      setError("El acceso no está disponible ahora. Inténtalo más tarde.");
      return;
    }

    const destination = new URL(panel);
    if (process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_PLATFORM_URL) {
      destination.hostname = window.location.hostname;
    }

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (isRegister && password !== String(form.get("confirmPassword") || "")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (isRegister && password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres.");
      return;
    }

    const payload = isRegister
      ? {
          name: String(form.get("name") || "").trim(),
          orgName: String(form.get("orgName") || "").trim(),
          email: String(form.get("email") || "").trim(),
          password,
          ...(plan && paidCheckoutEnabled ? { plan } : {}),
        }
      : { email: String(form.get("email") || "").trim(), password };

    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as AuthResult;
      if (!response.ok) throw new Error(data.error || "No hemos podido abrir tu sesión.");
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
      } else {
        window.location.assign(new URL(data.user?.isPlatformAdmin ? "/backoffice" : "/dashboard", destination).toString());
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No hemos podido abrir tu sesión.");
      setBusy(false);
    }
  }

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: String(form.get("recoveryEmail") || "").trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as AuthResult;
      if (!response.ok) throw new Error(data.error || "No se pudo solicitar la recuperación.");
      setRecoverySent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo solicitar la recuperación.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-editorial">
        <div className="auth-editorial-inner">
          <Link href="/" className="auth-logo-link" aria-label="Pleneva, volver al inicio"><Logo inverted /></Link>
          <div className="auth-editorial-copy">
            <span className="auth-eyebrow">PLENEVA / TU NEGOCIO EN MOVIMIENTO</span>
            <h2>La siguiente conversación empieza aquí<span>.</span></h2>
            <p>Una oportunidad puede llegar en cualquier momento. Ten a tu equipo, tus agentes y cada siguiente paso en el mismo lugar.</p>
            <div className="auth-editorial-rule" aria-hidden="true" />
          </div>
          <figure className="auth-editorial-photo">
            <Image
              src="/images/owner-on-call.png"
              alt="Una persona atiende una llamada mientras revisa su trabajo"
              width={1536}
              height={1024}
              sizes="(max-width: 900px) 100vw, 45vw"
            />
          </figure>
          <span className="auth-editorial-foot">Personas primero. Tecnología que sigue el ritmo.</span>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-panel-top">
          <Link href="/" className="auth-mobile-logo" aria-label="Pleneva, volver al inicio"><Logo /></Link>
          <Link href="/" className="auth-back">← Volver a Pleneva</Link>
        </div>
        <div className="auth-form-wrap">
          <p className="auth-step">{isRegister ? "01 / CREA TU ESPACIO" : "01 / ENTRA EN TU ESPACIO"}</p>
          {isRegister && plan && <p className="auth-selected-plan">{paidCheckoutEnabled ? `Plan seleccionado: ${plan === "pro" ? "Arranque" : "Crecimiento"}. Pagarás en Stripe tras crear la cuenta.` : "La contratación de este plan aún no está abierta. Puedes crear una cuenta gratuita."}</p>}
          <h1>{isRegister ? "Empieza con una cuenta." : "Bienvenido de nuevo."}</h1>
          <p className="auth-intro">
            {isRegister
              ? "Tu negocio, tus conversaciones y tus próximas oportunidades empiezan aquí."
              : "Tus conversaciones y próximos pasos te están esperando."}
          </p>

          {recovering && !isRegister ? (
            <form className="auth-form" onSubmit={recover}>
              <p className="auth-recovery-copy">Escribe el correo de tu cuenta. Si existe, recibirás las instrucciones para recuperar el acceso.</p>
              <label htmlFor="recoveryEmail">Correo electrónico</label>
              <input id="recoveryEmail" name="recoveryEmail" type="email" autoComplete="email" required placeholder="tu@empresa.com" />
              {recoverySent && <p className="auth-success" role="status">Revisa tu correo. Si existe una cuenta con esa dirección, te hemos enviado las instrucciones.</p>}
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar instrucciones"} <span aria-hidden="true">↗</span></button>
              <button className="auth-text-button" type="button" onClick={() => { setRecovering(false); setRecoverySent(false); setError(""); }}>Volver a iniciar sesión</button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              {isRegister && (
                <>
                  <label htmlFor="name">Tu nombre</label>
                  <input id="name" name="name" type="text" autoComplete="name" minLength={2} maxLength={120} required placeholder="Cómo te llamas" />
                  <label htmlFor="orgName">Nombre de tu negocio</label>
                  <input id="orgName" name="orgName" type="text" autoComplete="organization" minLength={2} maxLength={160} required placeholder="Tu negocio" />
                </>
              )}
              <label htmlFor="email">Correo electrónico</label>
              <input id="email" name="email" type="email" autoComplete="email" maxLength={320} required placeholder="tu@empresa.com" />
              <div className="auth-label-row">
                <label htmlFor="password">Contraseña</label>
                {!isRegister && <button className="auth-text-button" type="button" onClick={() => { setRecovering(true); setError(""); }}>¿La has olvidado?</button>}
              </div>
              <div className="auth-password">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  minLength={isRegister ? 10 : undefined}
                  maxLength={1024}
                  required
                  placeholder={isRegister ? "Al menos 10 caracteres" : "Tu contraseña"}
                />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {isRegister && (
                <>
                  <label htmlFor="confirmPassword">Repite la contraseña</label>
                  <input id="confirmPassword" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={1024} required placeholder="La misma contraseña" />
                </>
              )}
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
                {busy ? (isRegister ? "Creando cuenta…" : "Entrando…") : (isRegister ? "Crear mi cuenta" : "Entrar en Pleneva")}
                <span aria-hidden="true">↗</span>
              </button>
            </form>
          )}

          <p className="auth-switch">
            {isRegister ? "¿Ya tienes cuenta? " : "¿Aún no tienes cuenta? "}
            <Link href={isRegister ? "/login" : "/registro"}>{isRegister ? "Inicia sesión" : "Crea una cuenta"}</Link>
          </p>
          {isRegister && panel && (
            <p className="auth-terms">
              Al crear tu cuenta aceptas los <a href={new URL("/terminos", panel).toString()}>Términos</a> y la
              <a href={new URL("/privacidad", panel).toString()}> Política de Privacidad</a>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
