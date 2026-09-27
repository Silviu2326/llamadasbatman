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

## Acceso y registro

`/login` y `/registro` usan los endpoints reales del backend
(`/api/auth/login`, `/api/auth/register` y `/api/auth/forgot-password`).
La landing no guarda contraseñas ni tokens: reenvía la petición desde el servidor
y entrega al navegador únicamente la cookie HttpOnly de sesión. El panel recupera
el token de acceso a través de `/api/auth/refresh`.

En local, backend en `127.0.0.1:3001` y panel en `127.0.0.1:5173` funcionan
sin variables extra. Usa el mismo nombre de host para landing y panel; los puertos
no separan cookies. En producción configura:

| Variable | Uso |
|---|---|
| `PLENEVA_AUTH_API_URL` | URL HTTPS del backend de Vendrava/Pleneva; solo en el servidor |
| `NEXT_PUBLIC_PLATFORM_URL` | URL HTTPS del panel al que entra el usuario tras autenticarse |
| `PLENEVA_AUTH_COOKIE_DOMAIN` | Dominio común cuando landing y panel usan subdominios distintos, por ejemplo `pleneva.com` |

Si el panel vive en un dominio completamente distinto, la cookie no puede
compartirse: sitúa el acceso en ese mismo dominio o implementa un traspaso de
sesión específico antes de habilitar el formulario público. Sin la URL del
backend y del panel, el acceso en producción responde 503, sin crear una cuenta
que después no pueda abrirse.
