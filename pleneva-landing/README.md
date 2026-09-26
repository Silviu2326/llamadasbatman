# Pleneva — landing

Landing pública de Pleneva (nueva marca de Vendrava). Next.js 15 (App Router),
TypeScript y CSS propio, sin Tailwind. Proyecto independiente: no comparte
dependencias con la raíz ni con `vendrava-public/`.

Marca, tono y colores: ver `../NUEVA_MARCA.md`.

## Uso

```sh
cd pleneva-landing
npm install
npm run dev     # http://localhost:3100
npm run build
```

## Formulario «Llámame tú»

`POST /api/demo-call` valida nombre, móvil, sector y consentimiento, y reenvía la
petición al servicio que realmente marca. Sin configurar, **no llama a nadie** y
responde 503.

| Variable | Uso |
|---|---|
| `PLENEVA_DEMO_WEBHOOK_URL` | Endpoint que programa la llamada de demo |
| `PLENEVA_DEMO_WEBHOOK_TOKEN` | Opcional, se envía como `Authorization: Bearer` |
| `NEXT_PUBLIC_SITE_URL` | URL canónica (por defecto `https://pleneva.com`) |

Pendiente de decidir antes de publicar: precios definitivos (ahora se usan los de
Vendrava) y el endpoint de demo en el backend.
