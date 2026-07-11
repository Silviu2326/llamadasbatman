# Captación de leads — Plan de cierre al 100%

*Reconciliación de la sección 2 (Captación de leads) de `ROADMAP_100_PORCIENTO.md` contra el código real, leída el 2026-07-05. Mismo formato que `META_ADS_CIERRE_100.md`: qué hay, qué falta, contrato exacto y archivo precedente a copiar. Es un plan — todavía no se tocó código.*

---

## 0. Resumen ejecutivo

Al leer el código para planificar esto apareció un hallazgo que no estaba en el roadmap: **`LeadDetailPage.jsx` crashea al renderizar un lead real**, no solo muestra datos mock (ver sección 1). Es el hallazgo más urgente de este documento porque hoy mismo puede estar rota la página más usada del CRM (la ficha de un lead).

El resto confirma lo que ya decía el roadmap, con contrato exacto:

| Punto del roadmap | Estado real | Esfuerzo |
|---|---|---|
| **(nuevo, no estaba en el roadmap)** Ficha de lead crashea con datos reales | Bug confirmado, sección 1 | Bajo |
| Auto-llamada inconsistente entre fuentes | Confirmado — 3 de 4 vías de creación de leads no llaman | Bajo |
| DNC en memoria | Confirmado — `Set` en RAM, `// ponytail:` ya marca la deuda | Bajo |
| Ficha de lead con datos reales | Confirmado y detallado campo por campo | Medio-alto |
| Histórico de auditorías | Confirmado — un solo JSON, se pisa | Medio |
| Auditoría en bloque | Confirmado — no existe endpoint | Medio |
| Ingesta externa (form propio / Google Ads) | Sin acción — nadie pidió una fuente concreta todavía (YAGNI) | — |

---

## 1. Bug crítico: `LeadDetailPage.jsx` crashea con un lead real

`src/pages/LeadDetailPage.jsx:206-222` arma el estado `lead` así:

```js
apiFetch(`/api/leads/${id}/timeline`).then(r => r.ok ? r.json() : null).then(data => {
  if (data?.lead) {
    const l = data.lead
    setLead({ ...l, estado: ..., score: 0, pains: [], emails: [], calls: ..., meetings: ..., opportunities: ... })
  }
  ...
```

`data.lead` es el registro Prisma real (`id, name, phone, email, company, status, source, tags, customFields, createdAt`, ver `leads.service.ts#getLeadTimeline`). Nunca trae `painPoints`, `closePct`, `closeLevel`, `potValue`, `bg`, `initials`, `act`, `role`, `city`, `value`, `sl`. El estado inicializa `pains: []` (no `painPoints`) — nombre distinto, así que ni siquiera ese default cubre el campo real.

Línea 367: `{lead.painPoints.length > 0 && (`. Sin optional chaining ni default. Con un lead real, `lead.painPoints` es `undefined` → `undefined.length` → **TypeError en render**. El resto de los campos fantasma (`bg`, `initials`, `closePct`, `act`) no crashean (se renderizan como `undefined` o `NaN`, silenciosamente mal) pero este sí.

**Fix mínimo (desbloquea la página ya):** valores por defecto reales en vez de placeholders inventados, y sacar los campos que no existen:

```js
setLead({
  ...l,
  estado: ...,
  painPoints: [],          // hasta que exista un origen real (ver sección 4)
  score: 0,
  calls: data.calls || [], meetings: data.meetings || [], opportunities: data.opportunities || [],
})
```

Esto por sí solo saca el crash. El resto de sección 4 es la limpieza de fondo (quitar lo random, mostrar datos reales donde ya existen).

---

## 2. Auto-llamada inconsistente entre fuentes de creación de leads

`enqueueLeadCall` (`leadIngestion.service.ts`) solo se dispara desde:
- `ingestLead()` — usado por el webhook de Meta y la landing pública.
- `POST /api/leads/:id/call-now` — botón manual en `Leads.jsx:212`.

**No** se dispara desde:
- `leads.controller.ts#create` (`POST /api/leads`, modal `NewLeadModal.jsx`) → llama `leadsService.createLead` directo.
- `leads.controller.ts#importCsv` (`POST /api/leads/import`) → `leadsService.importLeads` hace `createMany`, sin loop de `enqueueLeadCall`. Además: **no hay ninguna pantalla que llame a este endpoint** — el botón "Exportar CSV" existe en `Leads.jsx`, pero no hay botón de importar. `src/lib/csv.js` solo tiene `downloadCsv`, no `parseCsv`.
- `prospects.controller.ts#importProspects` → llama `createLead` de `leads.service.ts` directo, no `ingestLead`.

**Decisión de diseño** (el roadmap lo dejaba abierto): no todo alta manual debería llamar automáticamente — cargar 200 leads de un CSV viejo no debería disparar 200 llamadas simultáneas sin que el usuario lo decida. Propuesta:

- `POST /api/leads` (alta manual): agregar un checkbox "Llamar ahora" en `NewLeadModal.jsx` → si está marcado, el frontend simplemente llama a `POST /api/leads/:id/call-now` después de crear (reusa el endpoint que ya existe, cero backend nuevo).
- `POST /api/leads/import` (CSV): agregar un toggle "Llamar automáticamente a los importados" en la futura UI de import → si está activo, el controller hace `for (const lead of created) await enqueueLeadCall(orgId, lead.id)` tras el `createMany` (hay que cambiar `importLeads` para que devuelva los ids creados, hoy `createMany` no los devuelve — o usar `Promise.all` de `create` individuales en vez de `createMany` si el volumen lo permite).
- `POST /api/prospects/import` (Prospect Finder): ya tiene el patrón `enrich`/`autoAudit` como flags opcionales — sumar `autoCall?: boolean` con el mismo criterio, llamando `enqueueLeadCall` en el loop existente (`prospects.controller.ts:53-87`) donde ya se crea cada lead.

Nada de esto pisa `ingestLead()` (que sigue siendo el único punto de entrada para fuentes automáticas externas tipo Meta).

---

## 3. Persistir la lista de "no llamar" (DNC)

`backend/src/voice/compliance.ts:29-41`:
```ts
// ponytail: Redis opt-out list skipped — use a simple in-memory set; add Prisma/Redis when needed
const _optouts = new Set<string>()
```
Se llena desde `registerOptout()`, invocado en un solo lugar: `mediaStream.ts:98` cuando `detectOptout()` encuentra una frase de baja en la transcripción en vivo. Se pierde por completo al reiniciar el proceso — con BullMQ + worker separado (`worker.ts`) y `--watch` en dev, esto pasa seguido.

**Plan:**
1. Modelo Prisma nuevo:
   ```prisma
   model OptOut {
     id        String   @id @default(cuid())
     orgId     String
     phone     String
     reason    String   @default("manual")
     createdAt DateTime @default(now())

     org Organization @relation(fields: [orgId], references: [id])
     @@unique([orgId, phone])
   }
   ```
   (agregar el `OptOut[]` a `Organization` igual que el resto de relaciones).
2. `compliance.ts`: `canCall`/`registerOptout` pasan a recibir `orgId` (hoy `canCall(phone)` no lo tiene — hay que revisar los 2 call sites, `leadCallDispatch.ts:52` y `routes/voice.ts:66`, ambos ya tienen `orgId` en scope) y reemplazar el `Set` por `prisma.optOut.findUnique`/`upsert`.
3. Sin pantalla nueva imprescindible: alcanza con que quede persistido; una lista "No llamar" en Configuración es un extra, no bloqueante.

---

## 4. Ficha de lead con datos reales — qué es real, qué es mock, qué hacer

`LeadDetailPage.jsx` ya trae del backend (vía `/api/leads/:id/timeline` y `/api/leads/:id/audit`): `lead` (Prisma), `calls`, `meetings`, `opportunities`, y la auditoría digital completa (`DigitalAuditCard`, que **ya es 100% real**, no tocar).

Lo que sigue siendo inventado, campo por campo:

| Campo en UI | Hoy | Dato real disponible | Acción |
|---|---|---|---|
| Score (badge header, ring "Probabilidad de cierre", desglose) | `score: 0` fijo, ring/desglose calculan sobre ese 0 | No hay campo `score` en `Lead`. No existe un modelo de scoring todavía | Fuera de alcance de este documento — necesitaría su propio diseño (¿qué señales alimentan el score?). Dejar el bloque oculto (`{lead.score != null && (...)}`) en vez de mostrar un 0 fijo, hasta que se decida construirlo |
| "Recomendación IA" / "Próximos pasos sugeridos" | Texto estático hardcodeado, igual para todos los leads | Nada | Igual que el score: ocultar o dejar como placeholder explícito ("aún no disponible"), no fingir que es personalizado |
| Pain points | `lead.painPoints` (undefined, ver sección 1) | `customFields.digitalAudit.opportunities` ya tiene una lista real de oportunidades/pain points por lead | Mapear `lead.customFields?.digitalAudit?.opportunities` a la sección de pain points en vez de un campo que no existe — no hay que inventar nada nuevo, el dato ya está en la auditoría |
| Email / Teléfono / LinkedIn (tab Información) | Generados: email fake por concatenación, teléfono con `Math.random()` en cada render, LinkedIn inventado | `lead.email` y `lead.phone` **ya vienen reales** en el mismo objeto `lead` (se ignoran) | Usar `lead.email`/`lead.phone` tal cual; si no hay valor, mostrar "—" en vez de inventar uno. LinkedIn: no hay campo — mostrar "—" o quitar la fila |
| Actividad (tab Actividad) | `ACT_TIMELINE` hardcodeado, 4 eventos fijos siempre iguales | `lead.calls`, `lead.meetings` ya se traen y no se usan en este tab | Reemplazar `ACT_TIMELINE.map` por un merge ordenado por fecha de `calls` (outcome, duración, fecha) + `meetings` (título, fecha) — mismo patrón que ya arma `CampaignDetailPage.jsx` para su lista de conversaciones |
| Notas (tab Notas) | `tabNotes` en estado de React, no persiste, se pierde al recargar | No existe modelo ni endpoint | Requiere lo mínimo nuevo de esta lista: modelo `LeadNote` (`id, orgId, leadId, authorId, text, createdAt`) + `POST/GET /api/leads/:id/notes`. Es la única pieza que no puede resolverse con datos que ya existen |
| Archivos (tab Archivos) | `files` en estado de React, `input type=file` no sube a ningún lado | No existe | Mismo caso que notas — requiere modelo + storage (ya hay S3 configurado para otra cosa, `S3_BUCKET`/`@aws-sdk/client-s3` en `package.json`, reusar esas credenciales). Mayor esfuerzo de esta lista entera; queda para después de notas |
| Valor potencial / probabilidad de cierre | Inventado (`potValue`, `closePct`, `closeLevel`) | `Opportunity.value`/`.probability` ya existen en el modelo Prisma y se traen (`lead.opportunities`) | Si el lead tiene una `Opportunity` asociada, mostrar su `value`/`probability` real; si no tiene ninguna, ocultar el bloque en vez de mostrar un número inventado |

**Prioridad dentro de esta sección** (de más barato/alto impacto a más caro): (1) el fix del crash, (2) usar `lead.email`/`lead.phone` reales, (3) pain points desde la auditoría ya existente, (4) actividad desde `calls`/`meetings` ya existentes, (5) ocultar score/recomendación IA en vez de fingirlos, (6) opportunity real si existe, (7) notas (requiere modelo nuevo), (8) archivos (requiere modelo + storage, lo más caro).

---

## 5. Histórico de auditorías

`leads.service.ts#auditLead` (línea 130-133) escribe `customFields.digitalAudit` pisando el valor anterior en cada corrida. Hoy no se puede comparar "antes vs. después" ni ver evolución.

**Plan:** modelo nuevo, no tocar `customFields`:
```prisma
model LeadAudit {
  id         String   @id @default(cuid())
  orgId      String
  leadId     String
  result     Json
  createdAt  DateTime @default(now())

  org  Organization @relation(fields: [orgId], references: [id])
  lead Lead         @relation(fields: [leadId], references: [id])
}
```
`auditLead()` pasa a hacer `prisma.leadAudit.create({ data: { orgId, leadId: id, result } })` **además** de seguir actualizando `customFields.digitalAudit` (ese campo sigue siendo "la última auditoría" para no romper `getLeadAudit`/`DigitalAuditCard`, que ya funcionan). Nuevo endpoint `GET /api/leads/:id/audit-history` → `prisma.leadAudit.findMany({ where: { orgId, leadId }, orderBy: { createdAt: 'desc' } })`. Frontend: no es bloqueante, se puede agregar un pequeño listado/gráfico de evolución en `DigitalAuditCard` después.

## 6. Auditoría en bloque para una campaña completa

Hoy solo existe auditar de a un lead (`POST /api/leads/:id/audit`) o auto-auditar uno por uno al importar desde Prospect Finder (`autoAudit` flag). No hay forma de decir "auditá los 200 leads que ya tiene esta campaña".

**Plan:** `POST /api/campaigns/:id/audit-bulk` → itera `prisma.lead.findMany({ where: { orgId, campaignId }, ... })` y llama `auditLead()` por cada uno que tenga `customFields.website`. Como cada auditoría hace un `fetch` a un sitio externo (`digitalAudit.service.ts#fetchHtml`), no se puede disparar todo en paralelo sin control — usar el mismo patrón de límite de concurrencia que ya existe en `leadCallDispatch.ts` (`concurrency: 10` en el `Worker` de BullMQ) o, más simple sin infra nueva, un `for...of` secuencial con un tope de N leads por corrida (ej. 50) devuelto en la respuesta (`{ audited, skipped, remaining }`) para que el frontend pueda re-llamar si hay más. Sin UI obligatoria en la primera vuelta — un botón "Auditar toda la campaña" en el tab de Audiencia de `CampaignDetailPage.jsx` es el lugar natural cuando se construya.

## 7. Ingesta externa (formulario propio / Google Ads) — sin acción por ahora

`ingestLead()` ya es genérico y listo para reusar (es exactamente el patrón que usó la landing pública de Meta Ads). No hay ninguna fuente concreta pedida todavía — construir un endpoint para "un formulario propio" o "Google Ads" sin un caso real de uso es especular. Cuando haya una fuente concreta, el trabajo es chico: una ruta pública + parseo del payload de esa fuente + `ingestLead(orgId, {...})`, mismo patrón que `landing.controller.ts`.

---

## Orden de construcción sugerido

1. **Fix del crash de `LeadDetailPage.jsx`** (sección 1) — un `git blame`-nivel de urgente, la página puede estar rota hoy mismo para leads reales.
2. **DNC persistente** (sección 3) — riesgo legal/normativo, esfuerzo bajo, aislado.
3. **Limpieza de la ficha de lead con datos que ya existen** (sección 4, puntos 2-6: email/teléfono real, pain points desde auditoría, actividad desde calls/meetings, ocultar score falso, opportunity real) — todo dato ya disponible en el backend, es solo frontend.
4. **Auto-llamada consistente** (sección 2) — decisión de producto + checkbox/toggle en 3 lugares, bajo esfuerzo cada uno.
5. **Notas de lead** (sección 4, punto 7) — el único pedazo de la ficha que necesita modelo nuevo antes de dejar de ser mock.
6. **Histórico de auditorías** (sección 5).
7. **Auditoría en bloque** (sección 6).
8. **Archivos de lead** (sección 4, punto 8) — el más caro de la ficha, requiere storage.
9. Ingesta externa (sección 7) — solo cuando haya una fuente concreta pedida.
