export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail ?? data),
    );
  return data;
}
export const num = (n: number | null | undefined, d = 0) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("es-ES", { maximumFractionDigits: d }).format(n);
export const money = (n: number | null | undefined, currency = "EUR") =>
  n == null
    ? "—"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);
export const states: Record<string, string> = {
  queued: "En cola",
  running: "En proceso",
  completed: "Completada",
  failed: "Error",
  interrupted: "Interrumpida",
  cancelled: "Cancelada",
  fail: "Fallo",
  warning: "Revisar",
  unknown: "Desconocido",
  observed: "Observación",
  pass: "Correcto",
  not_applicable: "No aplica",
};
export async function readFile(accept: string) {
  return new Promise<string>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      if (input.files?.[0]) resolve(await input.files[0].text());
    };
    input.click();
  });
}
