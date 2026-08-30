# 10 — Roadmap por olas

Secuencia completa con dependencias y criterios de salida. Los tamaños son relativos (S < M < L < XL) y por pieza, pensados para un equipo pequeño que además mantiene el producto actual — por eso cada fase produce valor vendible por sí misma.

> **Anotación de revisión — arranque hoy:** antes de ejecutar toda la Fase 0, construir una tajada v0 detrás de feature flag: `llm.generate` con DeepSeek + un segundo LLM BYOK, decisión visible y la microapp Investigador de empresa 360. Esta prueba valida el contrato abierto sin media ni consumo gestionado. No autoriza saltarse Assets/Jobs/Ledger antes de abrir imagen, vídeo o créditos. Ver [11-REVISION-Y-ARRANQUE-HOY.md](11-REVISION-Y-ARRANQUE-HOY.md).

```
FASE 0  Fundamentos ──────────────► FASE 1  Proveedores + Router ──► FASE 2  Flujos + Microapps ola 1
        (Asset, Job, Ledger,                (registro, BYOK ampliado,          (contrato, runner, 12 apps,
         cifrado único)                      Magnific, decisiones visibles)     recetas de flujo)
                                                                    └─────────► FASE 2b Studio de Cine v0–v2
                                                                    └─────────► FASE 3  Marketplace + enterprise
```

---

## Fase 0 — Fundamentos

| Pieza | Tamaño | Depende de | Doc |
|---|---|---|---|
| Storage S3/R2 para media generada + URLs prefirmadas | M | — | 02 §2.1 |
| Modelo `Asset`/`AssetVersion` + doble escritura en generadores actuales | M | storage | 02 §2 |
| Modelo `Job` + `jobDispatcher` (patrón outbox) + socket `job:update` | M | — | 02 §1 |
| `UsageRecord` + `recordUsage()` en todos los clientes de proveedor | M | — | 02 §3 |
| Unificación de cifrado con rotación (`v2.<keyId>`) | S | — | 02 §4 |
| Higiene: `.env` fuera del árbol + rotación de claves; WAVs fuera | S | — | 08 §5.6 |
| Dashboard interno de margen por org/proveedor | S | UsageRecord | 02 §3 |

**Salida:** ver checklist 02 §5. Valor inmediato aunque el resto no se haga: media segura y escalable + visibilidad de costes.

## Fase 1 — Plataforma de proveedores

| Pieza | Tamaño | Depende de | Doc |
|---|---|---|---|
| Taxonomía de capabilities + contratos zod | S | — | 03 §1 |
| Registro + descriptores de los 8 proveedores existentes | M | — | 03 §2–3 |
| BYOK generalizado (lista desde registro, `testConnection`, catálogo API) | M | registro | 03 §4 |
| **Integración Magnific** (upscale/relight, webhook, AssetVersion) | M | Job, Asset | 03 §5 |
| LLM alternativo BYOK (Anthropic u OpenAI chat) | S | registro | 03 §5 |
| Router `route()` + decisiones en `Job._routing` + tests de contrato | L | registro, UsageRecord | 04 |
| Migrar router de locuciones al registro | S | router | 03 §7 |
| Centro de conexiones (frontend) | M | catálogo API | 03 §6 |
| `GovernancePolicy` ampliada (proveedores/regiones/datos) | S | router | 08 §3 |

**Salida:** checklist 03 §7 + 04 §7. Vendible: "conecta tus propias claves" + Magnific como capacidad nueva visible.

## Fase 2 — Microapps y flujos

| Pieza | Tamaño | Depende de | Doc |
|---|---|---|---|
| Contrato `MicroappManifest` + `MicroappRun` + API + runner genérico frontend | L | Job, router | 07 §1–3 |
| Microapps ola 1: 8 reempaquetadas | M (total) | contrato | 07 §4 |
| Microapps ola 1: 4 nuevas (podcast, elección de modelo, benchmark, conceptos cine) | M–L (total) | contrato | 07 §4 |
| `ConsentGrant` + guards en router y publicación | M | Asset | 08 §2 |
| Modelos `Flow/FlowVersion/FlowRun` + `flowRunner` | L | Job, microapps | 05 §2–4 |
| 5 recetas de sistema + flujo demo completo | M | flowRunner | 05 §3 |
| Simulador dry-run | S | estimaciones | 05 §5 |
| Centro de trabajos (frontend, cola común §8.4 visión) | M | Job | 02 §1 |
| Catálogo `/microapps` + incrustación en Lead/Account | M | runner | 07 §3 |
| `Wallet` + créditos gestionados + Stripe topup | L | UsageRecord | 09 §2 |
| `OutcomeEvent` + tablero de métricas | M | outbox | 09 §5 |

**Salida:** checklists 05 §6 y 07 §7. Vendible: catálogo de microapps, recetas, créditos.

## Fase 2b — Studio de Cine (paralelizable con fase 2 tras el contrato de microapp)

| Pieza | Tamaño | Depende de | Doc |
|---|---|---|---|
| Modelos `Production/Concept/Bible/Scene/Shot/Take` | M | Asset, Job | 06 §2 |
| v0 preproducción (brief→conceptos→guion→storyboard→shot list) | L | microapps #46–50 | 06 §3 |
| Integración Runway (`video.generate` asíncrono) | M | Job, registro | 03 §5 |
| v1 mesa de tomas + presupuesto duro | L | Runway | 06 §4 |
| v2 post ligera (ffmpeg en worker, subtítulos, upscale, QC) | L | v1, Magnific | 06 §5 |
| Sala de revisión con comentario por timecode | M | ContentApprovalLink | 06 §6 |

**Salida:** checklist 06 §7. Cada v es demo-able y vendible por separado.

## Fase 3 — Marketplace y enterprise (solo cuando fase 2 tenga tracción)

- Membership N:M usuario↔organización (migración grande de auth — decidir antes de abrir marketplace).
- Manifiestos de microapp en BD, firmados; microapps de terceros como recetas declarativas (sin código arbitrario).
- Revisión editorial + entornos de prueba + revenue share sobre el ledger.
- Retención/borrado configurables, canal de disputas y retirada.
- Catálogos por vertical (sobre `verticalModules.ts` existente).

---

## Reglas de gestión del roadmap

1. **Nada de la fase N+1 empieza si bloquea un criterio de salida de la fase N.** Excepción: Studio v0, que solo depende del contrato de microapp.
2. **Cada integración nueva de proveedor exige**: descriptor completo con `tosReviewedAt`, `estimateCost` real, test de contrato, y entrada en `UsageRecord` desde el primer día.
3. **Revisión mensual del registro**: precios y condiciones de proveedores cambian (§12 de la visión); la revisión es un PR con diff visible.
4. **No construir por adelantado**: editor visual de flujos, timeline de vídeo, KMS por tenant, segundo proveedor de telefonía y marketplace tienen todos su disparador explícito de demanda en estos documentos. Hasta que no se dispare, no existen.
