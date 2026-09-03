# Vendrava — Web corporativa

Sitio de marketing de **Vendrava** (AI Sales CRM de SprintMarkt): https://vendrava.com

Next.js 15 (App Router) + TypeScript estricto + Tailwind CSS v4, **export estático** (`output: "export"`) porque el hosting (SWHosting compartido, Apache/PHP) no tiene runtime de Node. Bilingüe ES/EN, ~284 páginas generadas.

## Requisitos

- Node 20+
- `npm install`

## Desarrollo

```bash
npm run dev        # http://localhost:3000 (la home redirige a /es/ o /en/)
```

## Build (export estático)

```bash
npx next build     # genera ./out con todo el sitio estático
```

## Arquitectura

| Ruta | Qué es |
|---|---|
| `app/[locale]/…/page.tsx` | Cada página es EXPLÍCITA (no hay `[slug]` dinámico). ES y EN comparten componente vía locale |
| `lib/routes.ts` | **Registro central de rutas** (`ROUTES`). Toda página nueva DEBE registrarse aquí — de esto salen sitemap, hreflang y el language switcher |
| `content/locales/{es,en}/` | Diccionarios de copy por idioma |
| `content/{industries,comparisons,blog,products}.ts` | Datos de las páginas plantilla |
| `components/templates/` | Plantillas de producto / sector / comparativa / blog |
| `components/marketing/` | Secciones de la home |
| `lib/icons.ts` | Resolución semántica de iconos (mapas explícitos + resolvedor bilingüe por keywords + overrides auditados) |
| `app/globals.css` | Design tokens (Tailwind v4 `@theme`): tema oscuro + zonas claras (`bg-light`, `text-ink`…) |
| `public/{blog,products,industries,comparisons}/cover-*.png` | Banners de marca generados por código |
| `scripts/optimize-photos.py` | Convierte fotos PNG → WebP optimizado a las medidas de cada hueco |
| `deploy/` | `.htaccess` (www→no-www 301, HSTS, cache) y `root-index.html` (redirect de idioma en raíz) |

## Reglas del proyecto

- **Español neutro** (mercado ES + LATAM): nunca "vosotros/vuestro", nunca "coger el teléfono" (usar "atender/contestar"), compliance sin atarlo solo a España.
- **Sin emojis** en contenido.
- TypeScript con `noUncheckedIndexedAccess`: indexar arrays/Records requiere guard (`?.` / `?? fallback`).
- Toda página nueva: crear `page.tsx` explícito ES + EN **y** registrar la ruta en `lib/routes.ts`.

## Deploy (SWHosting, SFTP)

El hosting es Apache compartido — se sube el contenido de `out/`:

```bash
npx next build
cp deploy/.htaccess out/.htaccess
cp deploy/root-index.html out/index.html
# subir out/ al web root (~/vendrava.com/web/) por SFTP (puerto 2200)
# preservar *.swhosting-default.bak en el servidor
```

Credenciales SFTP: se comparten por canal privado (no están en este repo).

## SEO

Canonical **sin www** (`https://vendrava.com`). `app/robots.ts` da la bienvenida a crawlers de IA; `public/llms.txt`; structured data en `lib/structured-data.ts`; sitemap automático desde `ROUTES`. Google Search Console verificado vía `public/googlea137e576d79ced17.html` (no borrar).
