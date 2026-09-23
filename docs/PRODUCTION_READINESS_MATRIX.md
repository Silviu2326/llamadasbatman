# Matriz de preparación para producción

Última revisión: 22/07/2026.

Este documento separa lo que está implementado en el repositorio de lo que solo puede quedar validado después de conectar un entorno de staging con credenciales y datos aislados. “Compila” no equivale a “integración confirmada”.

| Área | Estado en código | Evidencia | Para salida real |
|---|---|---|---|
| Centro de acción persistente | Implementado | `ActionItem`, historial, ownership, idempotencia y API `/api/dashboard/actions` | Aplicar migración y probar concurrencia en staging |
| Orquestador | Implementado con guardrails | Plan persistente, aprobación, worker, outbox, retries, rollback y adapters | Configurar activos concretos y ejecutar un plan real de bajo importe |
| Llamada → reunión | Endurecido | Reintento repara outbox, mensaje, reunión y automatización; meeting determinista | Probar webhook duplicado y caída entre cada commit en staging |
| Ads Meta | Implementado en backend | OAuth PKCE, token cifrado, Graph timeout, preflight, publish paused/activate | OAuth real, scopes aprobados, página/cuenta publicitaria y evento de conversión |
| Google / Search Console | Implementado en backend | OAuth PKCE, refresh cifrado y estados `needs_reauth` | Callback público, proyecto Google y propiedad verificada |
| Posts orgánicos | Implementado con Metricool | Configuración por organización, timeout, SSRF, UTM y borrador | Credenciales reales, perfiles publicables y prueba de borrador |
| Email (Resend) | Implementado con barrera de consentimiento | Borradores locales, campañas, colas con leases, credenciales por organización y webhooks firmados | Aplicar migraciones, verificar dominio y ejecutar una prueba aislada de envío y recepción |
| Secuencias de ventas | Implementado en esta ronda | Enrolamiento idempotente, pasos email/task/meeting, worker, backoff, lease y parada por reply/baja | Aplicar migración, consentimiento real y prueba con dominio de envío controlado |
| Twilio / voz | Parcial | Persistencia de llamadas y reconciliación de meeting; no se completó esta ronda el aislamiento de credenciales | Validar firma, webhook público, número, grabación y consentimiento |
| Demo vs live | Parcialmente homogeneizado | Dashboard, Ads, Organic Leads y Prospect Finder distinguen estados explícitos | Homogeneizar Email, Agents, Knowledge Base, Pipeline y Reuniones |
| E2E comercial | Arnés staging implementado, no ejecutado aquí | `scripts/staging-e2e.mjs`, preflight, cuatro flujos, rollback y evidencia sanitizada | Ejecutar preflight PASS y después las cuatro corridas contra staging aislado |
| Migraciones | Preparadas, no aplicadas | Migraciones Prisma versionadas y gate de producción | Backup, `prisma migrate deploy` contra URL confirmada y verificación post-migración |
| Observabilidad | Implementada con gate operativo | readiness, colas, métricas, correlación, heartbeat, outbox, dead-letter y tokens separados de lectura/mutación | Alertas externas, dashboards y prueba de recuperación |

## Contrato operativo de configuración

`node scripts/ops-checks.mjs` debe devolver `PASS` antes del gate. Comprueba
que `.env.example` documenta `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`,
`OBSERVABILITY_TOKEN`, `OBSERVABILITY_MUTATION_TOKEN`, `WORKER_HEARTBEAT_KEY` y
`STAGING_E2E_DATABASE_TARGET_HASH` sin contener secretos.

`production-gate.mjs` no acepta bloques parciales: una integración ausente por
completo puede quedar como `WARN` si no es obligatoria; cualquier bloque con
alguna variable presente y otra ausente queda en `FAIL`. El arnés E2E mantiene
dry-run por defecto; `--preflight` solo habilita lecturas y `--run` exige las
dos confirmaciones de mutación y el hash del destino de base.

## Secuencias de ventas

El runtime usa `GrowthProgram(type = sales_sequence)` y persiste una matrícula por combinación programa + lead. Los pasos permitidos son:

- `email`: requiere `templateExternalId`, consentimiento y una entrega `EmailDelivery` idempotente.
- `task`: crea una tarea CRM deduplicada por `sourceId`.
- `meeting`: crea una reunión con identificador determinista.

Endpoints añadidos bajo `/api/growth-programs`:

- `POST /:id/enroll`
- `GET /:id/enrollments`
- `POST /:id/pause`
- `POST /:id/resume`
- `POST /:id/stop`

El worker solo procesa matrículas activas. Una respuesta, baja o rebote detiene los pasos pendientes del lead. Una entrega cuyo resultado externo es incierto queda bloqueada para revisión y no se reenvía automáticamente.

## Bloqueos que no se deben ocultar

1. No hay credenciales reales disponibles en este entorno y no se han simulado como conectadas.
2. Las migraciones nuevas no se han aplicado a Neon ni a producción.
3. La base de pruebas aislada (`TEST_DATABASE_URL`) sigue siendo obligatoria para la suite de integración.
4. La prueba visual dentro del navegador embebido no pudo acceder de forma fiable al servidor local; por tanto no se declara QA visual aprobada.
5. El bundle frontend mantiene un aviso de tamaño superior a 500 KB.

## Orden de cierre

1. Provisionar staging aislado y ejecutar migraciones versionadas.
2. Configurar URLs públicas, secretos y callbacks; comprobar `/health/ready`.
3. Ejecutar el smoke read-only y después cuatro suites mutantes con límites bajos.
4. Probar duplicados, leases caducadas, respuestas, bajas, rollback y eventos de proveedor.
5. Homogeneizar estados live/demo del resto de páginas y corregir el bundle antes del despliegue.

