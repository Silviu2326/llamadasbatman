# 07 — Framework de microapps (Fase 2)

Implementa §5–§7 de la visión. La regla central (§12): **una microapp es una receta especializada sobre la plataforma común, no un producto aparte.** El registro actual publica 147 recetas: las 60 de la segunda expansión, las 66 aprobadas en la primera expansión, las 12 iniciales y 9 herramientas audiovisuales auxiliares.

---

## 1. El contrato (§5 de la visión, en código)

El molde ya existe: `orchestration.adapters.ts` describe acciones con `effects`, `compensation`, `retryPolicy`. El manifiesto de microapp lo extiende:

```ts
// backend/src/microapps/types.ts
export interface MicroappManifest {
  id: string;                    // "company-research-360"
  version: string;
  name: string;                  // "Investigador de empresa 360"
  promise: string;               // §5.1 — resultado concreto
  category: 'research' | 'sales' | 'content' | 'studio' | 'data' | 'success';

  inputSchema: ZodSchema;        // §5.2 — entradas requeridas y opcionales
  outputSchema: ZodSchema;       // §5.5 — salida estructurada, nunca solo texto

  capabilities: string[];        // §5.3 — qué puede consultar: ["llm.generate","web.search"]
  dataAccess: PermissionId[];    // permisos RBAC existentes que consume: ["leads.read", ...]
  effects: 'local' | 'external'; // ¿puede tocar el mundo exterior?
  approvalAction?: SensitiveAction; // §5.10 — si requiere aprobación (mass_contact...)

  estimateCost(input): Promise<{ cents: number }>;  // §5.8
  freshnessDays?: number;        // §5.9 — caducidad del resultado

  followUps: FollowUpAction[];   // §5.7 — guardar en CRM, crear campaña, lanzar flujo...

  run(ctx: MicroappCtx, input): Promise<MicroappResult>;
}

export interface MicroappResult {
  data: unknown;                 // validado contra outputSchema
  evidence: EvidenceItem[];      // §5.6 — { claim, sourceUrl|sourceRef, confidence, fetchedAt }
  assets?: string[];             // assetIds producidos
  suggestedActions?: FollowUpAction[];
}
```

`MicroappCtx` da acceso al router gobernado, encolado de Jobs hijos y logger. Las recetas **first-party** actuales también pueden usar adaptadores o consultas Prisma revisadas en código, siempre filtradas por `orgId` y declaradas en `dataAccess`; sus pruebas adversariales verifican ese aislamiento. Las recetas de Marketplace no heredan esa confianza: solo componen manifiestos/capabilities declarativos validados y nunca ejecutan imports o código arbitrario.

### Ejecución

Cada ejecución es un `Job(kind: "microapp.run", microappId)` — hereda cola, lease, coste, cancelación y el Centro de trabajos gratis. Resultado persistido:

```prisma
model MicroappRun {
  id         String   @id @default(cuid())
  orgId      String
  microappId String
  version    String
  jobId      String   @unique
  input      Json
  result     Json?    // MicroappResult
  dataAccessSnapshot Json?   // permisos declarados al ejecutar
  accessRolesSnapshot Json?  // roles que podían leerlos en aquel momento
  staleAt    DateTime? // ahora + freshnessDays (§5.9)
  // vínculos al negocio (§5.7):
  leadId     String?
  accountId  String?
  productionId String?
  createdById String?
  createdAt  DateTime @default(now())
  @@index([orgId, microappId, createdAt])
  @@index([leadId])
}
```

`staleAt` alimenta el aviso "este dossier tiene 45 días, ¿actualizar?" en la UI. Los snapshots evitan que relajar posteriormente un manifiesto vuelva visible un resultado histórico más sensible; snapshots parciales/corruptos fallan cerrados y solo las filas legacy con ambos campos `NULL` recurren al manifiesto actual.

---

## 2. Registro y API

- Registro compilado `backend/src/microapps/registry.ts` (mismo criterio que proveedores: código revisable en PR, no BD — hasta el marketplace).
- API genérica, **una sola** para todas:

```
GET  /api/microapps                     → catálogo filtrado por entitlements del plan
GET  /api/microapps/:id                 → manifiesto público (promesa, inputs, coste estimado)
POST /api/microapps/:id/estimate        → coste para un input concreto
POST /api/microapps/:id/run             → crea el Job; 402 si wallet insuficiente; 403 si falta permiso
GET  /api/microapps/runs?leadId=...     → historial vinculado a la entidad
GET  /api/microapps/:id/agentic-flow-template → wrapper Flow con consejo y quality gate
POST /api/microapps/:id/agentic-flow/install  → instala/actualiza el wrapper en la organización
```

`estimate` y `run` aceptan opcionalmente `agentic`. El modo por defecto sigue siendo una ejecución simple; el consejo requiere `allowExternalReview: true`, rondas 1–3, umbral 60–100 y tope adicional. El coste estimado muestra por separado microapp y consejo. En `strategy: council` el entregable se conserva. En `strategy: closed_loop`, un editor puede proponer el documento completo revisado: solo sustituye `data` cuando vuelve a pasar el `outputSchema`, produce un cambio real y no altera secretos ni hojas autoritativas (IDs, URLs, importes, costes, estados, proveedores, hashes, timecodes o fechas). Una revisión inválida, vacía o con pendientes conserva el original y fuerza `human_review`.

- Gating: `requireEntitlement` — añadir capability de plan `microapps` y, para las premium, lista por plan en `entitlements.ts` (patrón existente).
- El permiso `costs.request` existente (hoy obligatorio en endpoints que llaman LLM, `routes/content.ts`) se mantiene como guard de `run`.

## 3. Frontend

1. **Catálogo** `/microapps`: tarjetas por categoría con promesa, coste típico y "recientes/favoritos". El inicio por objetivos de §8.1 es un filtro por categoría encima de esto — no construir un home nuevo.
2. **Runner genérico**: una página que renderiza formulario desde `inputSchema` (JSON Schema → form), muestra progreso del Job (socket), y renderiza el resultado con un **componente de vista por categoría** (dossier, tabla, kit de piezas). Las microapps con UI especial (Studio) registran componente propio; el resto usa el genérico.
3. **Incrustación en entidades**: en la ficha de Lead/Account, pestaña "Investigación" que lista `MicroappRun` vinculados y botón de ejecutar las relevantes. Aquí está el valor diferencial (los datos del CRM alimentan la microapp y viceversa).
4. Registrar cada microapp como `moduleId` en `experienceConfig.js` para que los modos basic/advanced ya existentes filtren el catálogo (§8.2 resuelto gratis).

> **Anotación de revisión:** Zod valida datos, pero los paquetes actuales no resuelven automáticamente una UX de formulario completa. Añadir un `uiSchema` explícito —orden, widgets, ayudas, campos sensibles y carga de assets— o incorporar una conversión JSON Schema evaluada. El job padre `microapp.run` agrega progreso y coste de hijos, pero no debe crear un segundo cargo por el mismo uso de proveedor.

## 4. Ola 1 — las 12 primeras, con su coste real

Orden por (valor demo × reutilización de código existente):

| # | Microapp | Base existente | Trabajo nuevo |
|---|---|---|---|
| 1 | Investigador de empresa 360 (#5) | `prospectResearch` + `webSearch` + `digitalAudit` | Envolver en contrato + evidencias estructuradas |
| 2 | Preparador de llamada (#18) | `Lead` + `Call` + `conversationAi` | Composición + vista de una pantalla |
| 3 | Minero de voz del cliente (#31) | `contentOpportunity` (ya analiza conversaciones) | Exponer biblioteca de citas con procedencia |
| 4 | Un contenido, doce piezas (#34) | `contentStudio` (1→6 piezas) | Ampliar formatos, contrato, trazabilidad por pieza |
| 5 | Diagnóstico comercial de prospecto (#16) | `digitalAudit` completo | Solo contrato + follow-ups |
| 6 | Fábrica de anuncios (#38) | `adsWizard` + `assetGenerator` + `metaCampaignBuilder` | Multimodelo vía router |
| 7 | Investigador de invitados para podcast (#1) | `webSearch` + patrón dossier del #5 | Nuevo prompt-pipeline; primera microapp "nueva de verdad" |
| 8 | Asistente de elección de modelo (#68) | registro de proveedores (03) | UI de recomendación; casi solo lectura del registro |
| 9 | Benchmark de proveedores (#67) | `UsageRecord` + Jobs | Suite de tareas fijas + panel comparativo |
| 10 | Generador de conceptos cinematográficos (#46) | `deepseek-reasoner` + brief | v0 del Studio (06) |
| 11 | Storyboard + shot list (#49–50) | `image.generate` | v0 del Studio |
| 12 | Mejorador final con Magnific (#59) | adapter Magnific (03) | UI comparación antes/después |

Las #8 y #9 son las que convierten "plataforma abierta" en argumento de venta con datos propios (§7 de la visión).

## 5. Ola 2 — flujos

Las cadenas de §7 se publican como recetas `Flow` (05-FLUJOS) que componen microapps ya publicadas. No requieren código nuevo de microapps, solo grafos + pruebas.

## 6. Ola 3 — marketplace (solo esbozarlo, no construirlo)

Prerequisitos que decidir antes (no ahora): membership N:M usuario↔org, manifiestos en BD con firma, sandbox de ejecución (las microapps de terceros **no** ejecutan código propio en fase inicial: componen capabilities y prompts declarativos — "recetas", no plugins), revisión editorial, y reparto de ingresos sobre el ledger. El modelo `VerticalConnector` existente es el precedente de "extensión de terceros con secreto HMAC".

## 7. Criterios de salida

- [x] Contrato `MicroappManifest` + runner genérico + 12 microapps de ola 1 publicadas.
- [x] Toda microapp muestra coste estimado antes de ejecutar y evidencias en el resultado.
- [x] ≥3 microapps incrustadas en fichas de Lead/Account.
- [x] Uso semanal por org medible (métrica §11) desde el día 1 vía `MicroappRun`.

## 8. Expansión aprobada 66/66

La fuente de verdad del compromiso de producto es `backend/src/microapps/visionCatalog.ts`: contiene los números 1–66, sus nombres y el ID estable de ejecución. La prueba `microappsVisionCatalog.test.ts` exige números contiguos, IDs únicos, registro real, schemas estructurados, formulario completo, permisos conocidos y capabilities enrutables.

| Bloque | Números | Entregables principales |
|---|---:|---|
| Growth, ventas, llamadas y agentes | 1–29 | Dossiers, scores, planes de cuenta/campaña, propuestas, coaching, guiones, QA y follow-ups |
| Ads, landings, contenido y autoridad | 30–48 | Ángulos, variantes, UGC, landings, experimentos, atribución, estudios, newsletters y activos de venta |
| Studio, vídeo, proveedores y operaciones | 49–66 | Producción audiovisual, Jobs de vídeo, comparativas/costes, manifiestos, auditorías y cumplimiento |

No todas consumen un modelo: auditorías deterministas, consultas tenant-safe y simuladores usan datos reales o el registro de proveedores. Las que llaman a un proveedor pasan por el router; las asíncronas crean Jobs hijos y todas conservan procedencia en `evidence`.

## 9. Segunda expansión seleccionada 60/60

La fuente de verdad editorial es `backend/src/microapps/selected60Catalog.ts`. Mantiene el número 1–60, nombre, ID estable y colección de cada producto sin solaparse con las 66 anteriores.

| Colección | Números | Entregables principales |
|---|---:|---|
| Revenue & Agency | 1–20 | Cierre, MAP, churn/renovación, casos verificables, evaluación de modelos, margen, onboarding, demos, CRM, pipeline, ROI, POC, QBR y rentabilidad |
| Intelligence & Growth | 21–40 | Licitaciones, señales de mercado, lookalikes, secuencias, territorios, predicción explicable, presupuesto, ads, pricing, retargeting, claims y voz de marca |
| Media & AI Operations | 41–60 | SEO, webinar, campañas, podcast, vídeo-demo, subtítulos, derechos, limpieza/mapeo de datos, KB, webhooks, integraciones, credenciales, flows, drift y BYOK |

Los tres packs se cargan desde el registro común. `selected60Coverage.test.ts` cruza el catálogo editorial con los 60 contratos y exige: IDs/nombres exactos, Zod y formulario completo, permisos conocidos, capabilities enrutables, efectos seguros, fixtures válidos, coste conservador y metadatos API. También protege que el arranque conserve las 87 recetas anteriores y publique exactamente 147.

El frontend no descarga 147 formularios al entrar: `GET /api/microapps` devuelve una proyección ligera y `GET /api/microapps/:id` carga el schema completo al abrir la ficha. El catálogo permite filtrar por las tres colecciones, y el runner enlaza Jobs y resultados a Lead, Account o Production cuando el input aporta esa referencia.

## 10. Capa agentic común 147/147

- Perfil especializado derivado por dominio: research, sales, content, studio, data o success.
- Consejo de tres revisores independientes más presidente.
- Dos rondas por defecto, máximo tres, con el foco de la síntesis anterior alimentando la siguiente.
- Score calculado por los revisores; un crítico o bloqueo no puede ser rebajado por el presidente.
- Redacción de inputs sensibles, consentimiento explícito para revisión externa y presupuesto por llamada.
- Wrapper Flow instalable por microapp, sin llenar la navegación con 147 entradas hasta que el usuario las necesite.
- Quality gate y revisión humana con separación de funciones.
- El ejecutor del Flow vuelve a comprobar los permisos `dataAccess` de cada microapp; crear un Flow no permite saltarse RBAC.
- El circuito cerrado aplica revisiones reales y trazables (`beforeHash`/`afterHash`, cambios aplicados y pendientes); no es una segunda opinión decorativa.
- La redacción es recursiva: además de `uiSchema.sensitive`, reconoce claves de secretos anidadas (`password`, `token`, `apiKey`, `privateKey`, credenciales). Las coincidencias sensibles se restauran desde el resultado canónico, nunca desde el LLM.
- Las colecciones con ledger autoritativo no pueden borrar, insertar, reordenar ni reasociar filas durante la revisión.
- La puerta de calidad reconstruye scores, roles, rondas, bloqueos, revisiones y estado final; no confía en una traza agentic suministrada.
- `Idempotency-Key` vincula un reintento al mismo input, vínculos y configuración agentic. Reutilizarla con otra petición responde 409.
- El runner conserva la clave en fallos transitorios y expone historial, reutilización de entrada y exportación JSON.

## 11. Frontera con Flows y MCP

- El JSON Schema público conserva mínimos, máximos, formatos, enums, nullability y límites de arrays para que un cliente MCP pueda construir una llamada válida sin conocer Zod.
- Cada wrapper materializa tanto `llm.generate` del Consejo como todas las capabilities internas de la microapp. El Centro de conexiones puede explicar qué workflows rompe una desconexión.
- Publicar y ejecutar un Flow tenant vuelve a comprobar entitlement `microapps`, membresía activa y todos los permisos `dataAccess`. Los eventos reutilizan el creador de la versión como principal y fallan cerrados si fue revocado.
- `FlowRun` tiene idempotencia raíz persistida; el mismo evento no crea dos runs aunque dos workers compitan.
- La estimación de una microapp dentro de un Flow se calcula una vez, se valida y queda ligada por SHA-256 al input y configuración. El hold y el Job usan exactamente la misma cifra.
