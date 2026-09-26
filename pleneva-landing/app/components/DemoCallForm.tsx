"use client";

import { useState } from "react";

const SECTORS = [
  "Clínica o consulta",
  "Veterinaria",
  "Estética y belleza",
  "Gimnasio",
  "Concesionario o taller",
  "Seguros",
  "Servicios profesionales",
  "Otro",
];

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "ok" } | { kind: "error"; message: string };

export function DemoCallForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/demo-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          phone: form.get("phone"),
          sector: form.get("sector"),
          consent: form.get("consent") === "on",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus({ kind: "error", message: data.error || "No hemos podido registrar la llamada. Prueba otra vez." });
        return;
      }
      setStatus({ kind: "ok" });
    } catch {
      setStatus({ kind: "error", message: "Sin conexión. Prueba otra vez en un momento." });
    }
  }

  if (status.kind === "ok") {
    return (
      <div className="demo-done" role="status">
        <strong>Hecho.</strong> Ten el móvil a mano. Te va a llamar nuestro agente, y así oyes exactamente lo que
        oirán tus clientes. Si no te convence, cuelga. Es lo que harían ellos.
      </div>
    );
  }

  return (
    <form className="demo-form" onSubmit={onSubmit}>
      <label>
        <span>Tu nombre</span>
        <input name="name" required autoComplete="given-name" maxLength={80} placeholder="Marta" />
      </label>
      <label>
        <span>Tu móvil</span>
        <input
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          pattern="^\+?[0-9 ]{9,16}$"
          placeholder="+34 600 000 000"
        />
      </label>
      <label className="full">
        <span>Tu negocio</span>
        <select name="sector" required defaultValue="">
          <option value="" disabled>
            Elige tu sector
          </option>
          {SECTORS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="consent full">
        <input name="consent" type="checkbox" required />
        <span>
          Acepto que Pleneva me llame a este número para la demostración. La llamada la hace un agente de IA y se
          graba. Una sola llamada, sin campañas.
        </span>
      </label>
      <button className="btn btn-primary full" type="submit" disabled={status.kind === "sending"}>
        {status.kind === "sending" ? "Un segundo…" : "Llámame tú"}
      </button>
      {status.kind === "error" && (
        <p className="demo-error full" role="alert">
          {status.message}
        </p>
      )}
    </form>
  );
}
