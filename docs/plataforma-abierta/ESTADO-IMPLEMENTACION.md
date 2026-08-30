# Estado de implementación

**Última actualización:** 19 de agosto de 2026.

## Ronda 1 — Fase 0 Fundamentos ✅ integrada y verificada

- Migración `backend/prisma/migrations/20260818120000_open_platform_foundations` (generada con `prisma migrate diff` offline; **pendiente de aplicar** con `prisma migrate deploy` en el entorno que corresponda).
- Modelos: `Job`, `Asset`, `AssetVersion`, `UsageRecord` (Decimal subcéntimo), `Wallet`, `WalletHold` (reservas atómicas `FOR UPDATE`, idempotencia por uniques), `WalletTransaction`.
- `src/lib/usage.ts` (ledger que nunca lanza), `src/services/wallet.service.ts`, keyring de cifrado `v2.<keyId>` retrocompatible en las 3 libs de cifrado, `src/services/jobs.service.ts` + `src/jobs/jobDispatcher.ts` (patrón outbox con lease), `src/services/assets.service.ts` + `src/lib/storage.ts` (S3/R2 con fallback local dev), doble escritura de Asset en generación de imagen y locuciones, instrumentación de consumo en DeepSeek/Resend/Twilio-voz.
- Rutas montadas: `/api/jobs`, `/api/assets`. Permisos nuevos: `jobs.read`, `jobs.manage`.
- Verificación: `tsc` limpio; tests offline wallet/crypto (12) + jobs (3) en verde.

## Ronda 2 — Fase 1 Proveedores + Router ✅ integrada y verificada

- `src/providers/`: types, registry, contratos zod de capabilities (`llm.generate`, `image.generate`, `image.upscale`, `audio.tts`, `video.generate`, `web.search`), router determinista con breaker y decisión persistida en `Job.input._routing`, resolución de credenciales BYOK→global, `runCapability` (reserva de wallet tras `WALLET_ENFORCEMENT=on`), ejecutores genéricos por capability.
- Adapters auto-registrados: deepseek, openai-image, voz (Chatterbox/ElevenLabs), brave, **Magnific** (asíncrono: submit + webhook `/api/webhooks/providers/magnific` con token fail-closed + firma opcional + polling de respaldo cada 5 min en el worker; supuestos de API aislados en `magnificClient.ts`).
- BYOK generalizado: lista de proveedores derivada del registro, `getDecryptedOrganizationCredential`, `GET /api/integration-credentials/catalog`, `POST /:provider/test`.
- Las credenciales legacy o cifradas con una clave anterior se recifran de forma perezosa mediante compare-and-swap al leerlas.
- El catálogo calcula qué Flows fijados, Flows reenrutables y automatizaciones se verían afectados antes de desconectar un proveedor.
- Runway implementa cancelación remota idempotente; el Job y su hold solo se cierran tras confirmación real del proveedor.
- Frontend: `/trabajos` (Centro de trabajos con decisión del router visible, cancelar/reintentar) y `/activos` (biblioteca con genealogía y procedencia), cableados en sidebar/permisos/experiencias.
- Verificación: `tsc` limpio; router 7/7 tests de contrato en verde; build de Vite en verde.

## Ronda 3 — Microapps, flujos y Studio v0 ✅ integrada y verificada

- Contrato `MicroappManifest`, runtime genérico, estimación previa, `MicroappRun`, API y frontend de catálogo/ejecución.
- 12 microapps iniciales: investigación de empresa/persona, preparación de llamada y podcast, diagnóstico comercial, voz del cliente, multiplicador de contenido, elección/benchmark de proveedor, fábrica de anuncios, conceptos de cine, storyboard/shot list y mejora Magnific.
- Motor `Flow/FlowVersion/FlowRun`, 5 recetas, dry-run y validación de ciclos, saltos, esperas, mapas, dependencias y ramas ambiguas.
- Demo real `opportunity.won → caso → creatividad → landing → anuncio → atribución`, con dos aprobaciones humanas, acciones idempotentes y espera programada.
- Consentimientos con guard para voz identificada, publicación y derivados; `OutcomeEvent` idempotente.
- Studio v0 completo: brief, presupuesto, conceptos, aprobación, biblia, guion, escenas, shot list, storyboard y exportación MD/PDF.
- Frontend lazy para `/trabajos`, `/activos`, `/microapps`, `/conexiones` y `/studio`.
- Tres microapps contextuales incrustadas en la ficha de Lead.
- Métricas de margen, coste por proveedor/modo, ahorro de routing, uso semanal de microapps y porcentaje de Flows con dos o más capacidades, visibles en Configuración.

Migración: `backend/prisma/migrations/20260818130000_open_platform_flows_microapps_studio`.

## Ronda 4 — Studio v1/v2 ✅ integrada y verificada

- Runway `video.generate` y `video.upscale`, BYOK/gestionado, polling y webhook opcional firmado.
- Mesa de tomas: generación de 1–4 variantes por plano, presupuesto máximo, sincronización, selección única y upscale.
- Postproducción FFmpeg: montaje, audio/subtítulos opcionales, normalización, límites, `ffprobe` QC y master como Asset.
- Estimaciones diferenciadas v0/v1/v2 y confirmación explícita antes de operaciones de coste.
- Frontend para crear/editar/archivar producciones, trabajar tomas y exportar.
- Prueba real FFmpeg: master vertical H.264 720×1280 de 1,066 s.
- Publicación Studio→Metricool de un master público inmutable, con campaña/landing y `utmContent` estable por producción y activo.
- Sala pública de revisión: enlace revocable con token almacenado solo como hash, caducidad, comentarios por timecode, resolución/reapertura/ocultación, rate-limit y página pública fuera de autenticación.

No se incluye un editor de timeline: la postproducción actual se ejecuta como Job reproducible en el worker.

Migración de la sala: `backend/prisma/migrations/20260819010000_studio_review_room`.

## Ronda 5 — Marketplace, cobro y multi-organización ✅ integrada y verificada

- Listings, versiones, manifiestos declarativos firmados, checksum, revisión editorial, publicación, instalación y entitlements.
- Validación de DAG, IDs, schemas, permisos y dependencias antes de publicar/instalar/ejecutar.
- Runtime con checkpoints, sin código arbitrario y sin reintento automático de una receta cobrada.
- Reserva Wallet previa, settlement idempotente ligado a `MicroappRun`, revenue share, fee de plataforma y conciliación de overage.
- Seller Studio y panel editorial en frontend.
- Membership N:M usuario↔organización, organización activa por sesión, rol efectivo por membership, selector y protección del último owner.
- Inbox durable de webhooks con firma, timestamp, hash y deduplicación antes de efectos.

Migración: `backend/prisma/migrations/20260818220000_marketplace_memberships_webhook_hardening`.

## Ronda 6 — Expansión de 66 microapps ✅ integrada y verificada

- Las **66 ideas aprobadas** están implementadas y tienen un mapa editorial estable en `backend/src/microapps/visionCatalog.ts`. El registro completo expone **87 microapps** al sumar la ola inicial y recetas audiovisuales auxiliares.
- 1–29: señales de compra, CRO, ABM, campañas, cuentas, negociación, propuestas, expansión, coaching, discovery, agentes de voz, cumplimiento y QA.
- 30–48: ángulos/variantes/UGC, anuncio→landing, políticas, formularios, A/B, atribución, autoridad, estudio original, newsletter, actualización y sales enablement.
- 49–66: dirección creativa, casting con consentimiento real, continuidad/QC, b-roll y vídeo asíncrono, formatos/localización/tráilers, comparación y gasto de proveedores, optimización del stack, monitor de cambios, generador declarativo, auditoría de flujos/costes/automatizaciones y dossier de cumplimiento.
- Cada entrada comprometida tiene ID único, Zod de entrada y salida propio, `uiSchema`, estimación, permisos, capabilities, caducidad, handler, evidencia y follow-ups. El test global impide publicar tarjetas vacías, permisos desconocidos o capabilities sin proveedor enrutable.
- El casting comprueba `ConsentGrant` vigente y tenant-safe; vídeo y b-roll crean Jobs hijos; el generador de microapps solo produce manifiestos declarativos validados con checksum, nunca código arbitrario.
- El runner genérico interpreta listas y objetos desde el JSON Schema público, admite listas simples por líneas, precarga defaults y detiene JSON inválido antes de estimar o ejecutar.
- La Biblioteca de activos usa permisos propios `assets.read`/`assets.manage`, independientes de redes sociales.
- Verificación de expansión y regresión relacionada: **69/69 pruebas verdes**; TypeScript y build Vite correctos.

## Ronda 7 — Segunda expansión de 60 microapps ✅ integrada y verificada

- Catálogo editorial nuevo `selected60Catalog.ts`: 60 números contiguos, IDs y nombres estables, cero solapamientos con la expansión anterior.
- 1–20 Revenue & Agency: cierre y Mutual Action Plan, churn/renovación, casos verificables, laboratorio de modelos, margen real por ledger, onboarding, auditoría de experiencia, demos, CRM/pipeline, business case, ROI, POC, QBR, aprobación local, recomendación e informes/rentabilidad.
- 21–40 Intelligence & Growth: licitaciones, cambios tecnológicos, reseñas, financiación/M&A, lookalikes, secuencias, territorios, single-threading, cierre explicable, champions, presupuesto multicanal, estructura Ads, matrices, hooks, social proof, pricing, lead magnets, retargeting, claims y voz de marca.
- 41–60 Media & AI Ops: clusters/canibalización SEO, webinar/campañas/podcast, momentos publicables, vídeo-demo con Jobs hijos, SRT, entrega/derechos, CSV, deduplicación, schemas, base de conocimiento, webhooks, pruebas no destructivas de integración, credenciales, evaluación dry-run, drift y BYOK vs gestionado.
- Todas usan el runtime común, coste previo, Jobs, evidencias y permisos. Las consultas internas filtran por `orgId`; las recetas públicas usan `web.search`; vídeo crea Jobs hijos; las utilidades deterministas cuestan cero.
- La estimación sin contexto de tenant ignora un binding BYOK a cero cuando existe alternativa gestionada: reserva de forma conservadora y concilia a la baja si la ejecución usa BYOK.
- API de catálogo ligera con número/colección; detalle completo bajo demanda. Frontend con filtros por pack, búsqueda diferida y runner que conserva vínculos a Lead, Account y Production.
- Auditoría global: **60/60 registradas, 147 totales**, nombres/IDs/formularios/permisos/capabilities/costes verificados y 87 anteriores preservadas.
- No añade migraciones ni ejecuta publicaciones externas. Las pruebas de proveedor son no destructivas y solo se ofrecen cuando el descriptor soporta `testConnection`.

## Verificación integrada

## Ronda 8 — Workflows agentic y consejo de agentes ✅ implementado

- Las 147 microapps exponen un perfil agentic y un wrapper Flow único e instalable bajo demanda.
- El consejo combina un especialista del dominio, auditor de evidencia, controlador de riesgo y presidente neutral.
- Circuito cerrado de hasta tres rondas, dos por defecto; la ronda siguiente recibe desacuerdos y foco de la anterior.
- Score determinista, bloqueo por findings críticos, umbral configurable y derivación humana fail-closed.
- Consentimiento explícito para revisión LLM, redacción de campos sensibles y tope adicional de gasto.
- En circuito cerrado, un editor estructurado puede aplicar una mejora real al resultado. Solo se adopta si pasa de nuevo el schema, conserva secretos y campos autoritativos y deja cero cambios pendientes; si no, se conserva el original y se fuerza revisión humana.
- Los resultados completos de microapps ya son encadenables por rutas dentro de Flows.
- Instalación idempotente mediante `GET .../agentic-flow-template` y `POST .../agentic-flow/install`.
- RBAC se revalida al instalar y ejecutar: el Flow no elude `dataAccess`; `agentic_accept` exige separación entre solicitante y aprobador.
- El runner frontend permite activar consejo, configurar rondas/umbral/presupuesto, ver desglose de coste, instalar el workflow y consultar la deliberación.

## Ronda 9 — Potencia y auditoría adversarial 147/147 ✅ implementado

- Tres pasadas cruzadas sobre los 147 handlers: contrato/UX, casos adversariales y ejecución real con `outputSchema` + envelope.
- Todas las familias quedaron con guardas propias de negocio: grounding literal, cronología, porcentajes, cobertura, rights/licencias, tenant isolation, consentimiento, provider pinning y presupuesto.
- Consejo cerrado real con editor, hashes de antes/después, redacción recursiva, protección de ledgers y quality gate reconstruible.
- Idempotencia estricta en microapps y raíz de Flow; una clave reutilizada con otro payload falla con 409.
- Los Flows tenant ya no pueden ejecutar microapps como “sistema”: publicación, ejecución manual y eventos revalidan entitlement, membresía y permisos.
- Dependencias de los Flows incluyen las capabilities internas de sus microapps, no solo los nodos capability explícitos.
- `prospect-diagnosis` revalida cada redirección y DNS, limita redirects, MIME y bytes; una web pública no puede redirigir el auditor a loopback, metadata cloud o red privada.
- Runner con historial reciente, apertura directa, reutilización de input, exportación JSON, trazas de revisión y reintentos idempotentes.
- Nuevas migraciones: `20260819190000_flow_run_root_idempotency` y `20260819200000_microapp_run_access_snapshots`.

- `prisma validate` y `prisma generate`: correctos.
- Backend `tsc --noEmit` y emisión a directorio temporal: correctos.
- Validación raíz anterior: 139/139 pruebas focalizadas de fundamentos, Jobs, Wallet, providers, router, microapps, flujos, consentimiento, Marketplace, memberships, Studio, sala de revisión, dependencias y cifrado.
- Expansión de microapps y regresión relacionada: 69/69, incluida la cobertura editorial exacta 66/66.
- Segunda expansión: cobertura editorial exacta 60/60; suite backend completa **643/643** y `tsc --noEmit` correctos tras la auditoría R9.
- Build Vite: correcto, 727 módulos.
- Zombies mode: 14/14.
- Traducción legacy: 4/4.
- Auditoría Prisma estática: sin errores; conserva advertencias operativas porque las migraciones están sin commit/aplicar y la baseline histórica no es idempotente.
- QA de navegador sin autenticación: login ES/EN, redirección protegida, cero errores propios y 390 px sin overflow.
- El build backend sobre `backend/dist` puede fallar por ACL `EPERM` del entorno; `tsc --noEmit` y el emit temporal confirman que no es un error TypeScript.

## Bloqueantes operativos antes de producción

1. Hacer backup y reconciliar primero en staging las **11/55 carpetas de migración que la auditoría local detecta modificadas o aún no incluidas en un release limpio**. No se han aplicado desde esta sesión; las dos últimas son `20260819190000_flow_run_root_idempotency` y `20260819200000_microapp_run_access_snapshots`. La baseline histórica no es idempotente: no ejecutar el lote a ciegas sobre una base existente.
2. Ejecutar smokes concurrentes en PostgreSQL real: Wallet, idempotencia de webhooks, selección de toma, cambio de organización y aislamiento multitenant.
3. Configurar S3/R2 y verificar descarga privada/prefirmada y copia pública estable.
4. Configurar solo los proveedores que se ofrezcan y revisar tarifas, regiones, límites y términos.
5. Crear usuario/organización de prueba y completar QA autenticada de todas las rutas nuevas.
6. Rotar cualquier clave que haya vivido en el historial de Git. No borrar la configuración local sin sustitutos.
7. Probar Runway, Magnific, Stripe y publicación social con cuentas sandbox/reales de prueba.
8. Ejecutar FFmpeg/ffprobe en un worker aislado con límites de CPU, RAM, disco y tiempo.
9. Activar alertas de margen negativo, Jobs atascados, webhooks inválidos, overage, holds expirados y publicación fallida.

El gate local de producción falla correctamente con la configuración actual de desarrollo (`NODE_ENV`, URLs públicas, Redis, observabilidad y proveedores incompletos). No debe abrirse producción hasta que `npm run ops:production-gate` quede verde en el entorno de despliegue.

Configuración relevante: `S3_*`, `ASSET_PUBLIC_BASE_URL`, `WALLET_ENFORCEMENT`, `WALLET_HOLD_TTL_HOURS`, Stripe, `BRAVE_SEARCH_RATE_VERSION`, `MAGNIFIC_WEBHOOK_SIGNING_SECRET`, `RUNWAYML_API_SECRET`, `RUNWAY_GATEWAY_WEBHOOK_SECRET`, `STUDIO_FFMPEG_PATH`, `STUDIO_FFPROBE_PATH`, `MARKETPLACE_MANIFEST_SIGNING_KEY` y `MARKETPLACE_EDITOR_EMAILS`. Usar `backend/.env.example` solo como inventario de nombres.

## Decisión de apertura

El repositorio está en estado de **release candidate técnico**. Puede abrirse hoy en staging o beta cerrada después de aplicar migraciones y configurar storage. Cobrar consumo gestionado o permitir publicación externa en producción requiere además los smokes financieros, webhooks reales, QA autenticada y rotación de credenciales anteriores.
