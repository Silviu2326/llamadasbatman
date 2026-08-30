# 01 — Análisis de viabilidad

Contraste entre la visión de `PLATAFORMA_ABIERTA_STUDIO_CINE_Y_MICROAPPS.md` y el estado real del código a 18 de agosto de 2026.

---

## 1. Metodología

Se ha mapeado el repositorio completo: `backend/prisma/schema.prisma` (~115 modelos, 3.660 líneas, 50 migraciones), los ~109 servicios de `backend/src/services/`, los 17 jobs de `backend/src/worker.ts`, el sistema de access-control (`backend/src/access-control/`) y las rutas del frontend (`src/App.jsx`, `src/components/Sidebar.jsx`). Cada afirmación de este documento tiene respaldo en un archivo concreto.

---

## 2. Veredicto por área de la visión

| Área de la visión (sección del doc) | Estado actual | Viabilidad | Esfuerzo |
|---|---|---|---|
| §2.1 Tres modos de consumo (gestionado / BYOK / enterprise) | BYOK existe para 5 proveedores; gestionado no tiene ledger | **Alta** | Medio |
| §2.2 Catálogo de capacidades (no de marcas) | No existe; la elección de proveedor está hardcodeada | **Alta** (es metadata + UI) | Medio |
| §2.3 Objetos comunes que sobreviven a proveedores | Parcial: Lead/Campaign/Opportunity sí; Asset/Brief/Escena no | **Alta** | Medio-alto |
| §2.4 Registro de capacidades por conector | No existe | **Alta** | Medio |
| §2.5 Router inteligente | Solo existe 1 router real (locuciones: Chatterbox→ElevenLabs) | **Media-alta** | Alto |
| §2.6 Constructor de flujos | 3 motores separados (Automation, Orchestration, Autonomías) — hay que unificar, no crear | **Alta** | Alto |
| §2.7 Biblioteca universal de activos | **Laguna crítica** — disco local sin BD | **Alta pero urgente** | Medio |
| §3 Familias de proveedores | LLM: DeepSeek+Cerebras+OpenAI(imagen). Voz: Cartesia/MiniMax/ElevenLabs/Chatterbox. Tel: solo Twilio. Ads: solo Meta. Imagen: solo gpt-image-1. Vídeo: **nada** | Por familia (ver §4) | Variable |
| §4 Studio de Cine | Existe guion+locución (`reel_script`, `voiceover`); no hay imagen en movimiento | **Media** — v1 viable sin generar vídeo | Muy alto |
| §5 Contrato de microapp | El catálogo declarativo de `orchestration.adapters.ts` es el 70 % del contrato | **Alta** | Medio |
| §6 Catálogo de 80 microapps | ~15 ya existen de facto como servicios (ver §5 abajo) | N/A — son recetas | Incremental |
| §8 UX (inicio por objetivos, modo sencillo/pro) | Ya hay `ExperienceContext` (basic/recommended/advanced) y registro de widgets | **Alta** | Bajo-medio |
| §9 Seguridad y derechos | RBAC 90 permisos, aprobaciones, consentimiento de contacto (`ContactConsent`); falta consentimiento de imagen/voz y procedencia de activos | **Alta** | Medio |
| §10 Modelo comercial (créditos) | **Laguna crítica** — no hay Wallet/UsageRecord/Invoice | **Alta** | Medio-alto |

---

## 3. Los cimientos que ya están construidos

### 3.1 Multi-tenancy y gobierno (listo)
- `Organization` como tenant con ~100 relaciones; `orgId` en casi todos los modelos; `lib/dataScope.ts`.
- RBAC: 10 roles, ~90 permisos con scopes `own|team|org` (`access-control/catalog.ts`).
- Entitlements: 4 planes × 14 capabilities × 6 límites de entidad (`access-control/entitlements.ts`), con el detalle defensivo del `WeakSet` de snapshots.
- Aprobación de acciones sensibles con separación de funciones (`access-control/approvalPolicy.ts`, modelo `SensitiveApprovalRequest`).

### 3.2 BYOK (patrón correcto, alcance corto)
`OrganizationIntegrationCredential` (schema.prisma:385) + `organizationCredentials.service.ts`:
- AES-256-GCM con formato versionado `v1.<iv>.<tag>.<ct>`; el secreto nunca sale por API.
- `slot` permite N cuentas del mismo proveedor por org.
- Ciclo de vida completo: `markUsed`, `markRefresh`, `markError` (con redacción), `revoke`.
- Fallbacks globales explícitos por flag (`TWILIO_ALLOW_GLOBAL_FALLBACK`).

**Limitación:** lista blanca cerrada de 5 proveedores (`metricool, mautic, twilio, telegram, google`) y 3 esquemas de cifrado paralelos (Meta y Google orgánico van aparte). Ver 02-FUNDAMENTOS §4.

### 3.3 Motores de ejecución (hay que unificar, no inventar)
- **Outbox transaccional** con leases, heartbeat y recuperación de workers muertos (`jobs/outboxDispatcher.ts`).
- **Automation** con versionado inmutable, idempotencia por paso, y la regla de que las acciones con efecto externo no se reintentan (quedan `blocked` para revisión humana).
- **Orchestration** con 5 fases, presupuesto (`limits.budgetCents`), ciclo proposal→approval→execution y catálogo declarativo de acciones. **Este catálogo es el germen del contrato de microapp.**

### 3.4 Cadena de contenido (la primera "microapp" ya existe)
`contentOpportunity → contentStudio → ownerVoice → contentSpecificity → contentCritic → contentApproval → Metricool` es exactamente el patrón "flujo multi-paso con aprobación humana y publicación externa" que la visión generaliza.

---

## 4. Viabilidad por familia de proveedores

| Familia | Hoy | Primer paso realista |
|---|---|---|
| LLM | DeepSeek (todo el producto), Cerebras (streaming en llamada), OpenAI (solo imagen) | Envolver `lib/deepseek.ts` en el registro de capacidades; añadir Anthropic/OpenAI-chat como segunda opción BYOK |
| Imagen | gpt-image-1 (1024², base64) + carruseles SVG por código | Añadir 1 proveedor más (Flux vía fal/Replicate o Magnific) detrás de la capability `image.generate` |
| Mejora de imagen | Nada | Magnific API como candidata a primera integración de media; validar API, autenticación, webhooks y términos para SaaS. Un MCP disponible en una sesión de desarrollo no forma parte del backend desplegado |
| Vídeo | **Nada** | Runway API como primera superficie (asíncrona, multimodelo); no construir timeline propio en v1 |
| Voz TTS/STT | Cartesia, MiniMax, ElevenLabs, Chatterbox local | Ya hay 4 — solo falta exponerlos como capabilities enrutables en lugar de pipeline fijo |
| Telefonía | Twilio (Voice, Media Streams, WhatsApp, AMD) | No urge un segundo proveedor; declarar la capability y aplazar Telnyx |
| Publicidad | Meta completo (OAuth PKCE, insights, conversions, lead webhook) | Google Ads es el hueco mayor; no bloquea la plataforma abierta |
| Publicación social | Metricool (IG/FB/LinkedIn/X/YouTube/TikTok) | Mantener; declarar como capability `social.publish` |
| Email | Mautic (self-hosted) + Resend | Mantener |
| Búsqueda/research | Brave Search + Google Places | Declarar capability `web.search`; segundo proveedor opcional |
| Datos B2B | Nada estructurado (research propio con LLM) | Fase 2+ |

**Nota sobre Higgsfield:** la vía MCP/CLI usa la cuenta del usuario final; para un SaaS multiusuario requiere validación contractual escrita (como dice la propia visión). No planificar ingresos sobre ella en fase 1.

---

## 5. Microapps que ya existen de facto

De las 80 propuestas del catálogo, estas ya tienen servicio backend equivalente (total o parcial):

| # visión | Microapp | Servicio existente |
|---:|---|---|
| 5 | Investigador de empresa 360 | `prospectResearch.service.ts` + `webSearch.service.ts` + `digitalAudit.service.ts` |
| 16 | Diagnóstico comercial de prospecto | `digitalAudit.service.ts` (auditoría pública `/audita/:slug`) |
| 20 | Mapa de objeciones | parcial en `revenueIntelligence.service.ts` |
| 23 | Siguiente mejor acción | modelo `NextBestAction` + `actionCenter.service.ts` |
| 31 | Minero de voz del cliente | `contentOpportunity.service.ts` (analiza conversaciones) |
| 32 | Clon de voz escrita del dueño | `ownerVoice.service.ts` |
| 34 | Un contenido, doce piezas | `contentStudio.service.ts` (1 oportunidad → 6 piezas) |
| 36 | Fábrica de carruseles | `brandCarousel.service.ts` (SVG 1080² con brand kit) |
| 38 | Fábrica de anuncios | `adsWizard.service.ts` + `metaCampaignBuilder.service.ts` + `assetGenerator.service.ts` |
| 43 | Crítico de landing | `landingDiagnostics.service.ts` + `landingHealth.service.ts` |
| 44 | Guardia de consistencia de marca | parcial en `contentCritic.service.ts` + `brandKit.service.ts` |
| 61 | Médico de CSV | `ImportJob` + `importJobRunner.ts` (parcial) |
| 65 | Minero de llamadas | `Call.transcript` + `VoiceCallEvaluation` + `conversationAi.service.ts` |
| 72 | Generador de informe ejecutivo | `dashboard.service.ts` + `landingReport.service.ts` (parcial) |
| 74 | Traductor de procesos a playbooks | `playbooks.service.ts` (parcial) |

Conclusión: **la ola 1 de la visión no es "construir 12 microapps", es "reempaquetar ~8 servicios existentes bajo el contrato común y construir ~4 nuevas".** Eso cambia radicalmente el coste.

---

## 6. Riesgos técnicos principales

1. **La biblioteca de activos es bloqueante hoy, incluso sin plataforma abierta.** `generatedMedia.service.ts` guarda en disco local sin fila en BD y sirve por URL pública. Con 2 réplicas en Railway se pierde media. Arreglo en 02-FUNDAMENTOS §2.
2. **Consumo gestionado sin ledger = margen a ciegas.** Vender créditos sin `UsageRecord` por proveedor es asumir riesgo financiero sin visibilidad. No lanzar consumo gestionado antes del ledger (02-FUNDAMENTOS §3).
3. **Deuda de cifrado triple.** `tokenCrypto.ts`, `organicTokenCrypto.ts` y `organizationCredentialsCrypto.ts` con 3 claves de entorno distintas. Unificar antes de multiplicar proveedores.
4. **`User.orgId` es 1:1.** El plan Agency multi-workspace se resuelve con `workspaceGrants` en el JWT. Para marketplace y equipos por proyecto hará falta membership N:M — no urgente, pero decidirlo antes del marketplace (fase 3).
5. **Vídeo asíncrono de minutos** no encaja en el ciclo request/response actual; necesita el Centro de trabajos (§8.4 de la visión) sobre el patrón outbox existente. Viable, pero es la pieza nueva más grande.
6. **Frontend sin TypeScript ni React Query.** No bloquea, pero el Centro de trabajos y el Studio de Cine sufrirán sin una capa de datos con polling/invalidation; considerar introducir React Query solo en los módulos nuevos.

---

## 7. Decisiones previas (respuesta a las 10 preguntas del doc de visión, §13)

1. **¿Gestionado, BYOK o ambos?** → Empezar **BYOK-first** (la infraestructura ya existe); consumo gestionado solo tras el ledger. El doc de visión advierte que solo-BYOK frena a clientes no técnicos: cierto, pero el riesgo financiero de gestionado-sin-ledger es peor.
2. **¿Qué datos salen a qué proveedores?** → `GovernancePolicy` (ya existe el modelo) se amplía con lista de proveedores permitidos por org. Ver 08-SEGURIDAD §3.
3. **¿Contrato universal de trabajo y activo?** → Modelos `Job` y `Asset` de 02-FUNDAMENTOS.
4. **¿Qué acciones externas requieren aprobación?** → Ya está decidido en `approvalPolicy.ts` (spend, campaign_publish, organic_publish, social_publish, mass_contact); se añade `media_generate_premium` (renders caros).
5. **¿Registro de derechos/consentimientos?** → Nuevo modelo `ConsentGrant` (08-SEGURIDAD §2), hermano de `ContactConsent` que ya existe.
6. **¿Primer flujo completo demo?** → «llamada ganada → caso de éxito → anuncio con imagen mejorada → publicación → atribución». Reutiliza el 80 % de lo existente y solo exige la integración de Magnific.
7. **¿Dos proveedores por capacidad?** → Solo donde ya hay dos (TTS, imagen tras añadir Magnific/Flux). No duplicar telefonía ni ads en fase 1.
8. **¿Microapps propias/plantillas/marketplace?** → Olas 1–2 todas propias; marketplace es fase 3 y requiere membership N:M + sandbox.
9. **¿Cómo se muestra el coste antes de ejecutar?** → `estimateCost()` obligatorio en el descriptor de capability (03-PROVEEDORES §3) + tope duro por job.
10. **¿Métrica compartida?** → La north star de la visión: *resultados de negocio completados por organización y semana mediante flujos*, materializada como tabla `OutcomeEvent` (09-MODELO §5).
