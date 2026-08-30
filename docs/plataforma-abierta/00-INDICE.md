# Plataforma abierta de Vendrava — Plan de implementación

**Fecha:** 18 de agosto de 2026
**Base:** `PLATAFORMA_ABIERTA_STUDIO_CINE_Y_MICROAPPS.md` (visión) contrastado con el código real del repositorio.
**Veredicto corto:** viable por fases. Aproximadamente el 40 % de la infraestructura necesaria ya existe y está bien construida; el 60 % restante se apoya sobre patrones que el código ya practica. Lo que NO es viable es construirlo todo a la vez: hay 4 prerequisitos técnicos que bloquean casi todo lo demás.

> **Actualización 19/08/2026:** este índice conserva la foto inicial usada para planificar. Las fases 0–3, Studio v1/v2, Marketplace, la expansión de 66 microapps y una segunda selección de 60 ya se implementaron como release candidate técnico. El registro expone 147 microapps en total. Consultar [ESTADO-IMPLEMENTACION.md](ESTADO-IMPLEMENTACION.md) para el estado verificado, pruebas y bloqueantes operativos actuales.

---

## Cómo leer esta carpeta

| Archivo | Contenido | ¿Cuándo leerlo? |
|---|---|---|
| [ESTADO-IMPLEMENTACION.md](ESTADO-IMPLEMENTACION.md) | Estado real del código, validación y gate de producción | **Leer para desplegar o revisar avance** |
| [11-REVISION-Y-ARRANQUE-HOY.md](11-REVISION-Y-ARRANQUE-HOY.md) | Revisión crítica, correcciones y primera tajada vertical para empezar hoy | **Leer antes de implementar** |
| [01-VIABILIDAD.md](01-VIABILIDAD.md) | Análisis de viabilidad: qué existe, qué falta, riesgos y veredicto por área | Primero, para decidir |
| [02-FUNDAMENTOS.md](02-FUNDAMENTOS.md) | Los 4 prerequisitos: biblioteca de activos, ledger de consumo, unificación de cifrado, storage S3/R2 | Fase 0 — bloquea todo lo demás |
| [03-PROVEEDORES.md](03-PROVEEDORES.md) | Registro de capacidades, conectores y BYOK generalizado | Fase 1 |
| [04-ROUTER.md](04-ROUTER.md) | Router inteligente de proveedores | Fase 1–2 |
| [05-FLUJOS.md](05-FLUJOS.md) | Constructor de flujos: unificar los 3 motores existentes en recetas | Fase 2 |
| [06-STUDIO-DE-CINE.md](06-STUDIO-DE-CINE.md) | Studio de Cine: modelos, pantallas y pipeline de producción | Fase 2–3 |
| [07-MICROAPPS.md](07-MICROAPPS.md) | Contrato de microapp, framework de ejecución y las 12 primeras | Fase 2–3 |
| [08-SEGURIDAD-Y-DERECHOS.md](08-SEGURIDAD-Y-DERECHOS.md) | Consentimientos, derechos de activos, políticas por organización | Transversal |
| [09-MODELO-COMERCIAL-Y-METRICAS.md](09-MODELO-COMERCIAL-Y-METRICAS.md) | Créditos, BYOK vs gestionado, márgenes y métricas de éxito | Antes de la fase 2 |
| [10-ROADMAP.md](10-ROADMAP.md) | Secuencia completa por olas, dependencias y criterios de salida | Para planificar |

---

## Resumen ejecutivo

### Lo que ya existe y sirve directamente

- **Multi-tenant sólido**: `orgId` en ~115 modelos Prisma, aislamiento verificado por tests (`backend/src/__tests__/multiTenant.test.ts`).
- **BYOK real**: `OrganizationIntegrationCredential` con AES-256-GCM, slots múltiples por proveedor, ciclo de vida completo (connected/revoked/needs_reauth/error) y redacción de errores. Solo cubre 5 proveedores, pero el patrón es el correcto.
- **Motor de acciones declarativo**: `orchestration.adapters.ts` ya describe cada acción con `effects: local|external`, `compensation` y `retryPolicy` — exactamente la forma que necesita el contrato de microapp.
- **Aprobaciones con separación de funciones**: `SensitiveApprovalRequest` + `approvalPolicy.ts` (no autoaprobación).
- **Jobs robustos**: outbox transaccional con leases sobre Postgres + BullMQ opcional con degradación elegante.
- **Cadena de contenido completa**: oportunidad → generación → especificidad → crítico adversario → aprobación → publicación (Metricool). Es un flujo multi-paso real funcionando en producción.
- **Plataforma para desarrolladores**: API keys `vk_*`, webhooks firmados HMAC, anti-SSRF, portal `/desarrolladores`.

### Las 4 lagunas que bloquean la visión

1. **No hay biblioteca de activos**: la media generada vive en un directorio plano en disco local, sin fila en BD, sin `orgId`, servida por URL pública sin auth. Se rompe con 2 réplicas.
2. **No hay ledger de costes/consumo**: las cuotas se derivan de `COUNT`/`SUM` sobre llamadas y emails; no existe unidad de consumo, ni atribución por proveedor, ni créditos.
3. **No hay abstracción de proveedores**: el pipeline de voz está cableado a Cartesia→Cerebras→MiniMax con `throw` si falta una clave; los comentarios del código lo justifican como decisión deliberada (que ahora hay que revertir con criterio).
4. **No hay nada de vídeo**: cero código de generación, render, timeline o almacenamiento de vídeo.

### Ruta recomendada

```
Fase 0 (fundamentos)  →  Fase 1 (proveedores + router)  →  Fase 2 (flujos + microapps ola 1)
                                                        →  Fase 2b (Studio de Cine v1)
                                                        →  Fase 3 (marketplace, ola 3)
```

La regla de oro del documento de visión se mantiene: **las microapps se construyen como recetas sobre una plataforma común, no como productos aislados.** El contrato común ya permite mantener las dos expansiones (66 + 60) y las recetas anteriores sin duplicar runtime, cobro, permisos ni interfaz.

---

## Anotación de revisión: cómo empezar hoy

Antes de convertir los snippets de esta carpeta en migraciones o código, leer [11-REVISION-Y-ARRANQUE-HOY.md](11-REVISION-Y-ARRANQUE-HOY.md). La revisión mantiene el roadmap, pero corrige precisión monetaria, reservas de Wallet, genealogía de assets, estados de jobs remotos, URLs públicas, el evento del flujo demo y varios supuestos de integración.

La primera tajada recomendada es `llm.generate` con DeepSeek + un segundo LLM BYOK, ejecutando **Investigador de empresa 360** detrás de feature flag. Assets, vídeo y consumo gestionado conservan sus prerequisitos de Fase 0.
