# Obtención de leads + auditoría SEO en VozIA

Análisis de cómo llevar a este proyecto (Fastify + Prisma/Postgres + BullMQ + React)
lo que ya funciona en `sprintmarkt-crm` (FastAPI + ScrapMarkt), adaptado a nuestro stack.
Objetivo: la IA de VozIA no solo llama leads que ya tienes, sino que también los
encuentra y los prioriza antes de marcar.

## Qué hay ya en VozIA (reutilizable)

- `Lead` (Prisma): `name, phone, email, company, status, source, tags, customFields(Json)`.
  `source` es `String?` libre — no hace falta migración para añadir `"scraping"` o `"seo_audit"`.
- `leads.service.ts` / `leads.controller.ts` / `routes/leads.ts`: list, create, **importCsv**, timeline.
- `backend/src/jobs/`: patrón BullMQ ya establecido (`automationRunner.ts`, `campaignDispatch.ts`) —
  worker con `try/catch` que se desactiva solo si Redis no está disponible. Mismo patrón para lo nuevo.
- `Campaign.totalLeads` se incrementa en `createLead`/`importLeads` — cualquier alta nueva de leads
  debe seguir esa misma convención para no desincronizar contadores.

## Qué aporta sprintmarkt-crm

1. **ScrapMarkt** — scraper externo (sector + ciudad → lista de negocios). Nosotros NO necesitamos
   montar un servicio Python aparte: es prospección B2B genérica, se puede resolver con
   **Google Places API (Text Search)** directamente desde Node, que es lo que ScrapMarkt usa como
   fallback igualmente. Un scraper propio es una capa que no necesitamos hoy (YAGNI).
2. **`digital_audit.py`** — motor heurístico (sin Lighthouse): un `fetch` + regex sobre el HTML
   público de la web del lead → title/meta/viewport/schema.org/analytics/redes sociales/tecnología
   (booking, ecommerce, chat, DIY builder) → score 0-100 + lista de "oportunidades" con pitch de venta.
   Esto es puro TypeScript portable: no depende de nada Python-específico.

## Diseño propuesto (mínimo)

### 1. Prospección (`prospecting.service.ts`)

```
POST /prospects/search   { sector, city, country? }  → llama Google Places Text Search
                                                         devuelve candidatos SIN guardarlos
POST /prospects/import   { orgId, campaignId?, items[] } → reusa createLead/importLeads existente,
                                                             source = "prospecting"
```

- Un solo archivo de servicio con un `fetch` a Places API. Sin worker/cola: Text Search responde
  en ~1-2s, no necesita BullMQ. Si en el futuro se pagina a cientos de resultados, ahí sí un job.
- Env nuevas: `GOOGLE_PLACES_API_KEY`. Nada más.

### 2. Auditoría SEO/digital (`digitalAudit.service.ts`)

Puerto directo de `digital_audit.py` a TS (misma lógica, mismos regex, mismo score). Es la pieza
con más valor y ya está resuelta y probada en el otro repo — no rediseñar, traducir.

```
POST /leads/:id/audit     → fetch de lead.website (o lead.customFields.website),
                             calcula score + oportunidades, guarda en lead.customFields.digitalAudit
GET  /leads/:id/audit     → devuelve el último audit guardado (o null)
```

- Sin tabla nueva: `customFields: Json?` en `Lead` ya admite guardar el resultado del audit tal cual
  (`{ score, opportunities, seo, socials, tech, auditedAt }`). Añadir una tabla dedicada sería
  especular con necesidades de reporting que hoy no existen.
- Es sync (un `fetch` + regex, <10s) igual que en Python — no necesita cola. Si el volumen crece
  (auditar campañas enteras de golpe), ahí sí un worker `auditRunner.ts` calcado del patrón existente.

### 3. Frontend

- Botón "Buscar leads" en la vista de Leads/Campañas → modal con sector+ciudad → tabla de resultados
  de `/prospects/search` con checkboxes → "Importar seleccionados" llama `/prospects/import`.
- En `LeadDetailPage.jsx`: card "Auditoría digital" con score + lista de oportunidades, botón
  "Auditar ahora" si `website` existe y no hay audit previo.
- No hace falta página nueva dedicada — se integra en las páginas de Leads que ya existen.

## Lo que se descarta (y por qué)

- **Servicio ScrapMarkt en Python aparte**: duplicaría infraestructura (otro runtime, otro deploy)
  para resolver algo que Places API cubre sin proceso adicional.
- **Lighthouse / auditoría real de performance**: mucho más pesado (headless Chrome), el heurístico
  actual ya genera el pitch comercial que se necesita. Se añade si algún día se vende auditoría
  técnica como producto en sí.
- **Tabla `Audit` dedicada**: sin caso de uso de histórico/comparativa hoy — `customFields` basta.

## Orden de implementación sugerido

1. `digitalAudit.service.ts` + rutas `/leads/:id/audit` (mayor valor, cero dependencias externas
   nuevas más allá de `fetch` nativo).
2. `prospecting.service.ts` + rutas `/prospects/*` (requiere alta de `GOOGLE_PLACES_API_KEY`).
3. Frontend: card de auditoría en `LeadDetailPage`, luego modal de búsqueda de prospectos.

Cada pieza es independiente y desplegable por separado — no hace falta esperar a tener las tres
para dar valor.
