import { NextResponse } from "next/server";

type DemoRequest = { name?: unknown; phone?: unknown; sector?: unknown; consent?: unknown };

const PHONE_RE = /^\+?[0-9 ]{9,16}$/;

/**
 * Recibe la petición de "Llámame tú" y la reenvía al backend que realmente marca
 * (PLENEVA_DEMO_WEBHOOK_URL). Sin esa variable no se llama a nadie: responde 503.
 */
export async function POST(request: Request) {
  let body: DemoRequest;
  try {
    body = (await request.json()) as DemoRequest;
  } catch {
    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const sector = typeof body.sector === "string" ? body.sector.trim().slice(0, 80) : "";

  if (!name || !sector || !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "Revisa el nombre, el móvil y el sector." }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: "Sin tu permiso no te llamamos." }, { status: 400 });
  }

  const webhook = process.env.PLENEVA_DEMO_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json(
      { error: "La demo por teléfono todavía no está activada. Escríbenos y te llamamos nosotros." },
      { status: 503 },
    );
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.PLENEVA_DEMO_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${process.env.PLENEVA_DEMO_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      name,
      phone: phone.replace(/\s+/g, ""),
      sector,
      consent: { granted: true, at: new Date().toISOString(), source: "pleneva-landing" },
    }),
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json({ error: "No hemos podido programar la llamada. Prueba otra vez." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
