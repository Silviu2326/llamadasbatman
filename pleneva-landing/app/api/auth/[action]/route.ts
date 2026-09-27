import { NextResponse } from "next/server";
import { platformUrl } from "../../../lib/platform";

type Context = { params: Promise<{ action: string }> };

const actions = new Set(["login", "register", "forgot-password"]);

function sameDomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export async function POST(request: Request, context: Context) {
  const { action } = await context.params;
  if (!actions.has(action)) {
    return NextResponse.json({ error: "Ruta no disponible." }, { status: 404 });
  }

  const origin = request.headers.get("origin");
  const publicHost = request.headers.get("host");
  const publicProtocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(request.url).protocol.replace(":", "");
  if (origin && (!publicHost || origin !== `${publicProtocol}://${publicHost}`)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const apiBase =
    process.env.PLENEVA_AUTH_API_URL?.trim().replace(/\/$/, "") ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3001" : "");
  const panelBase = platformUrl();
  if (!apiBase || !panelBase) {
    return NextResponse.json(
      { error: "El acceso no está disponible ahora. Inténtalo más tarde." },
      { status: 503 },
    );
  }

  let apiUrl: URL;
  let panelUrl: URL;
  try {
    apiUrl = new URL(apiBase);
    panelUrl = new URL(panelBase);
  } catch {
    return NextResponse.json({ error: "El acceso no está disponible ahora." }, { status: 503 });
  }
  if (process.env.NODE_ENV === "production" && (apiUrl.protocol !== "https:" || panelUrl.protocol !== "https:")) {
    return NextResponse.json({ error: "El acceso no está disponible ahora." }, { status: 503 });
  }

  const siteHost = publicHost?.split(":")[0] || new URL(request.url).hostname;
  const cookieDomain = process.env.PLENEVA_AUTH_COOKIE_DOMAIN?.trim().replace(/^\./, "").toLowerCase();
  const domainInvalid = cookieDomain && (
    !/^[a-z0-9.-]+$/.test(cookieDomain) ||
    !sameDomain(siteHost, cookieDomain) ||
    !sameDomain(panelUrl.hostname, cookieDomain)
  );
  const domainRequired = process.env.NODE_ENV === "production" && panelUrl.hostname !== siteHost && !cookieDomain;
  if (domainInvalid || domainRequired) {
    return NextResponse.json(
      { error: "El acceso no está disponible ahora. Inténtalo más tarde." },
      { status: 503 },
    );
  }

  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 415 });
  }
  const body = await request.text();
  if (body.length > 8192) {
    return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(new URL(`/api/auth/${action}`, apiUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept-language": "es",
        "cache-control": "no-store",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return NextResponse.json(
      { error: "No podemos conectar con el servicio de acceso. Inténtalo en un momento." },
      { status: 503 },
    );
  }

  const data = await upstream.json().catch(() => ({})) as {
    error?: string;
    user?: { name?: string; isPlatformAdmin?: boolean };
  };
  if (!upstream.ok) {
    return NextResponse.json(
      { error: typeof data.error === "string" ? data.error : "No se pudo completar el acceso." },
      { status: upstream.status },
    );
  }
  if (action === "forgot-password") {
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }

  const cookie = upstream.headers.get("set-cookie");
  if (!cookie) {
    return NextResponse.json({ error: "No se pudo abrir la sesión. Inténtalo otra vez." }, { status: 502 });
  }

  const response = NextResponse.json(
    { ok: true, user: { name: data.user?.name ?? "", isPlatformAdmin: Boolean(data.user?.isPlatformAdmin) } },
    { status: upstream.status, headers: { "cache-control": "no-store" } },
  );
  response.headers.append(
    "set-cookie",
    cookieDomain ? `${cookie}; Domain=${cookieDomain}` : cookie,
  );
  return response;
}
