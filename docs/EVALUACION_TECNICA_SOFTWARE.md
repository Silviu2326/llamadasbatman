# Evaluación técnica del software

**Producto:** VozIA  
**Fecha:** 15 de julio de 2026  
**Perspectiva:** arquitectura, seguridad, fiabilidad y operabilidad del estado actual del repositorio.

## Resumen ejecutivo

La aplicación está construida como una plataforma web full-stack moderna y razonablemente bien separada: React/Vite en cliente, Fastify/TypeScript en API, Prisma como capa de persistencia y Redis/BullMQ para trabajo asíncrono. El dominio cubre CRM, campañas, automatizaciones, voz, captación, analítica y crecimiento.

La arquitectura es adecuada para un SaaS B2B multi-tenant, y las últimas correcciones refuerzan sus puntos más sensibles: sesiones, WebSockets, permisos, consentimiento, automatizaciones externas y workers. La principal condición para considerarla preparada para operar es completar la verificación en una base aislada y desplegar sus migraciones y secretos de producción.

## Arquitectura actual

```text
React 19 + Vite
  ├─ Rutas públicas, autenticadas y administrativas
  ├─ Workspaces: captación, ventas, conversación, nutrición, growth e inteligencia comercial
  ├─ Contexto de autenticación y cliente API
  └─ Componentes y páginas de dominio

Fastify + TypeScript
  ├─ API REST por módulo de negocio
  ├─ Orquestación comercial, experimentos, memoria y gobierno empresarial
  ├─ JWT/cookies de sesión, RBAC y tenant context
  ├─ WebSockets de voz y Socket.IO de eventos
  ├─ Integraciones: Twilio, Deepgram, ElevenLabs, Meta, Mautic y Metricool
  └─ Workers de automatización, importación, campañas y outbox

Prisma + PostgreSQL
  ├─ Datos multi-tenant, auditoría, consentimientos, sesiones y experimentación
  ├─ Migraciones versionadas
  └─ Leases para trabajos recuperables

Redis + BullMQ
  └─ Colas, dispatch y procesos de fondo
```

## Cliente web

### Estructura y navegación

El cliente utiliza React 19, Vite 8 y React Router. `src/App.jsx` registra rutas públicas, protegidas y administrativas, además de una ruta 404 y páginas legales. El producto se divide de forma natural entre:

- Operación comercial: dashboard, leads, llamadas, pipeline, reuniones y campañas.
- Configuración y conocimiento: agentes, playbooks, automatizaciones, knowledge base y ajustes.
- Adquisición: prospectos, cuentas Meta, Ads, social, landing pages y funnels.
- Retención y crecimiento: email marketing, inbox, insights y Growth Hub.
- Inteligencia comercial: siguientes acciones explicables, experimentos con atribución y propuestas de memoria con revisión humana.
- Gobierno empresarial: políticas de consentimiento, costes y aprobaciones, accesibles sólo a administradores.

Esta separación facilita que un módulo evolucione sin exigir a la persona usuaria conocer toda la plataforma.

### Estado de experiencia y accesibilidad

Las primitivas compartidas se han reforzado con las prácticas mínimas de accesibilidad:

- `FormInput` relaciona etiquetas, entradas, pistas y errores mediante IDs y atributos ARIA.
- `FormModal` declara un diálogo modal, administra foco, cierra con Escape y restaura el foco de origen.
- El menú móvil anuncia su estado expandido y devuelve el foco al cerrar.
- Login incorpora una vía guiada de recuperación por soporte y enlaces de términos/privacidad.
- La navegación desconocida llega a una 404 con una salida clara.

Las vistas de Agentes y de campaña ya usan API cuando el dato existe y muestran estados explícitos en varias superficies que aún no tienen fuente de datos. Conviene extender el mismo patrón de transparencia a todo detalle histórico que siga pendiente de una API específica.

### Rendimiento y mantenibilidad

El build actual es correcto, pero el bundle de entrada es grande: aproximadamente **1,57 MB de JavaScript minimizado** y **531 kB de CSS**. La causa principal es que las rutas se importan de forma directa y varias páginas de dominio concentran mucha lógica y estilos inline.

La siguiente mejora técnica recomendable es lazy loading por ruta y dividir páginas extensas en secciones y hooks de dominio. No es un bloqueo funcional, pero mejoraría el tiempo de carga inicial y el coste de mantener la interfaz.

### Inteligencia comercial y gobierno empresarial

`RevenueIntelligencePage` consume una API única para la cola de siguiente mejor acción, experimentos y propuestas de memoria. No rellena paneles con datos ficticios: cada área tiene estados de carga, error y vacío. Las acciones se pueden recalcular, marcar como ejecutadas o descartar; los experimentos se crean como borrador antes de iniciarse; y la revisión de memoria deja explícito que la aprobación humana es obligatoria.

`EnterpriseGovernancePage` está protegida por `AdminRoute` y edita políticas por clave a través de la API. El cliente valida el JSON para reducir errores de configuración, pero el servidor conserva la autoridad real mediante RBAC y auditoría. La ruta se separa de la operación comercial para que un usuario sin rol administrador no pueda ni navegar a esa superficie ni invocar su mutación.

## Backend y dominio

### API y capas

La API está organizada por rutas, controladores y servicios. Esto permite separar validación HTTP, autorización, reglas de negocio y acceso a Prisma. Los módulos cubren cuentas, leads, campañas, voz, reuniones, automatizaciones, conocimiento, anuncios, crecimiento y proveedores externos.

El modelo es multi-tenant: las operaciones relevantes llevan contexto de organización y las rutas mutables se han endurecido con autorización de servidor. El cliente no es la fuente de la autorización; las decisiones de rol se aplican en Fastify.

### Orquestación, experimentación, memoria y gobierno

El módulo `revenueIntelligence` se registra bajo `/api/revenue-intelligence` y exige autenticación en todas sus rutas. Se apoya en cuatro límites de dominio:

- **Siguiente mejor acción:** amplía el registro existente de recomendaciones con confianza, mensaje y momento recomendado. El cálculo usa estado del lead, señales de contacto y consentimiento; nunca ejecuta un canal externo. Todas las consultas y cambios se filtran por `orgId`.
- **Experimentos comerciales:** `RevenueExperiment`, variantes y asignaciones separan definición, reparto estable de audiencia y conversión atribuida. La asignación es idempotente por experimento y sujeto; las conversiones pueden registrar tipo, valor e importe atribuido. La política de coste impide iniciar pruebas que superen el límite configurado o requieran aprobación administrativa.
- **Memoria operativa:** `OperationalMemoryProposal` almacena evidencia y el cambio semántico propuesto, no HTML ni una modificación automática sobre playbooks. Sólo un administrador puede aprobar, rechazar o marcar aplicada una propuesta; cada decisión guarda revisor, fecha y auditoría.
- **Gobierno empresarial:** `GovernancePolicy` mantiene las claves `consent`, `cost` y `approvals` por organización. Sus mutaciones y la vista de gobierno son exclusivas de administrador y se escriben en `AuditLog`.

El servicio expone también endpoints de asignación de variante y registro de conversión, de forma que landing, voz, secuencias o audiencias puedan integrarse sin que la atribución quede en cálculos del navegador.

### Autenticación y sesiones

La autenticación se ha reforzado de esta manera:

- El arranque exige un `JWT_SECRET` fuerte; no hay secreto por defecto.
- Los tokens de acceso son de corta duración.
- La renovación usa cookie `HttpOnly` con sesión persistida, rotación y revocación.
- El token de acceso deja de persistirse en `localStorage`.
- CORS opera sobre una allowlist explícita, no sobre reflexión abierta de orígenes.
- Meta OAuth usa estado opaco, TTL, uso único y PKCE.

Esto reduce de forma significativa el impacto de un XSS, un token robado o un replay de OAuth.

### Permisos y efectos costosos

Las mutaciones de alto impacto —campañas, agentes, Meta, Metricool, WhatsApp, Ads, prospectos e importaciones— pasan por controles de rol en backend. Este punto es esencial porque evita que un usuario de sólo lectura genere costes o altere operaciones invocando la API directamente.

Las automatizaciones Mautic validan que la plantilla o segmento usado esté asociado a la organización correspondiente antes de disparar un efecto externo.

### Evolución recomendada de roles y permisos

Hoy el modelo de datos define tres perfiles globales: `admin`, `agent` y `viewer`. Es suficiente para un equipo pequeño, pero `agent` agrupa demasiadas facultades: puede editar datos compartidos y disparar efectos de distintos módulos. La evolución recomendable es conservar un núcleo RBAC y añadir permisos por acción, alcance de dato y condición de riesgo.

| Rol propuesto | Objetivo | Capacidades principales | Límites deliberados |
| --- | --- | --- | --- |
| Propietario de organización | Responsabilidad máxima y recuperación | Facturación, propiedad, administradores y acceso de emergencia | No debe usarse para la operación cotidiana. |
| Administrador de espacio | Configurar la organización | Usuarios, integraciones, agentes, políticas y auditoría | No aprueba por sí mismo su propia elevación o cambios financieros críticos. |
| Operaciones de revenue | Diseñar el sistema comercial | Playbooks, automatizaciones, campañas, experimentos y seguimiento | Sin usuarios, secretos, facturación ni políticas de consentimiento. |
| Responsable de ventas | Dirigir equipo y pipeline | Visión de equipo, asignación, forecast, aprobación de propuestas comerciales | Sin integraciones ni cambios de gobierno. |
| Comercial | Trabajar su cartera | Leads y oportunidades asignadas, llamadas, reuniones, tareas y recomendaciones | Sin exportaciones masivas, campañas globales ni cambios de configuración. |
| Marketing / growth | Generar y nutrir demanda | Landings, audiencias, activos, secuencias y experimentos en borrador | No inicia gasto por encima de umbral ni accede a conversaciones sensibles fuera de su campaña. |
| Analista | Medir sin operar | Insights, atribución y exportación agregada | Sólo lectura; datos personales y exportaciones sensibles requieren permiso adicional. |
| Revisor de cumplimiento | Proteger consentimiento y uso de datos | Consentimientos, auditoría, solicitudes de privacidad y revisión de políticas | No puede ejecutar campañas, llamadas ni cambiar integraciones. |
| Control financiero | Controlar presupuesto | Límites de coste, aprobaciones de pruebas pagadas, lectura de gasto | No edita audiencias, mensajes ni resultados comerciales. |
| Invitado / visor | Colaborar de forma limitada | Lectura explícitamente concedida de dashboards o una cuenta | Sin mutaciones ni descarga de datos sensibles. |

Los permisos deberían nombrarse por capacidad, no por pantalla: `lead.read:assigned`, `opportunity.update:team`, `campaign.publish`, `automation.execute`, `experiment.start`, `experiment.approve_budget`, `memory.review`, `consent.manage`, `audit.read`, `data.export:sensitive`, `integration.manage` y `user.manage`. Cada decisión se evalúa en servidor con tres dimensiones: organización, alcance del objeto (propio, equipo o todo el espacio) y condiciones contextuales como consentimiento vigente, canal permitido, presupuesto y doble aprobación.

Hay tres separaciones de funciones que conviene imponer desde el primer ciclo empresarial: quien crea una prueba pagada no la aprueba; quien propone una mejora de playbook no la aprueba; y quien administra usuarios no puede elevar ni aprobar su propia elevación. RBAC admite jerarquías y separación estática o dinámica de funciones; la guía de OWASP refuerza que el acceso debe denegarse por defecto, otorgarse con mínimo privilegio y comprobarse en el servidor en cada petición. [NIST RBAC](https://csrc.nist.gov/Projects/role-based-access-control/faqs), [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

La implementación debe hacerse por fases: primero, una matriz de permisos centralizada detrás de `requirePermission()` manteniendo los tres roles actuales como plantillas; después, tablas `Role`, `Permission`, `RolePermission` y asignaciones por organización/alcance para permitir roles compuestos y personalizados. Las nuevas asignaciones, exportaciones sensibles, elevaciones y aprobaciones deben generar `AuditLog` inmutable. Para datos personales, el revisor de cumplimiento debe poder demostrar la base y el historial de tratamiento, en línea con las responsabilidades organizativas que exige el RGPD. [Comisión Europea: obligaciones de responsable y encargado](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/controllerprocessor/can-someone-else-process-data-my-organisations-behalf_en)

## Tiempo real y voz

La superficie de voz es una de las partes técnicamente más sensibles y queda protegida con varias capas:

- Socket.IO autentica el handshake y deriva la sala de organización del contexto validado.
- No es posible unirse arbitrariamente a una organización distinta mediante un parámetro del cliente.
- Los streams de media usan una capability HMAC efímera asociada al contexto de llamada.
- El simulador de voz exige JWT por subprotocolo WebSocket, comprueba pertenencia de agente y limita concurrencia, ritmo y duración.
- Los identificadores de organización y agente no se aceptan como fuente de verdad desde el socket.

Este diseño protege tanto la privacidad de transcripciones como el coste asociado a proveedores de STT/TTS.

## Ingreso público, consentimiento e integraciones

Las landings públicas son tratadas como una superficie de riesgo. El flujo incorpora validación, honeypot, límites por IP/slug/teléfono, deduplicación y evidencia de consentimiento. La finalidad es impedir que un formulario público sea usado para disparar mensajes o llamadas no solicitadas.

Las integraciones externas se han planteado con controles adecuados:

- Webhooks de proveedores con validación de firma cuando el proveedor la soporta.
- Acciones de Mautic limitadas por binding de organización.
- State OAuth protegido contra replay.
- Secretos de voz y OAuth separados del secreto de sesión.

## Trabajo asíncrono y fiabilidad

El backend utiliza un patrón de outbox, workers y colas. Para reducir duplicados y bloqueos tras una caída, los trabajos de outbox, importación y entrega de email incorporan:

- Claim condicional y atómico.
- `workerId`, `lockedAt` y `leaseExpiresAt` persistidos.
- Heartbeats de lease y recuperación de leases vencidas.
- Backoff y estados de error/dlq.
- Protección frente a reenvío ambiguo a proveedores sin idempotencia documentada.

Hay una migración específica para estos campos (`20260715030000_add_worker_leases`). Este patrón es una buena base para despliegues con más de un worker.

## Datos y migraciones

El repositorio usa Prisma con seis hitos de migración:

| Migración | Finalidad |
| --- | --- |
| `20260714000000_baseline` | Modelo inicial. |
| `20260715000000_add_growth_programs` | Programas de Growth Hub. |
| `20260715010000_add_growth_automation_journey` | Journey de automatización de growth. |
| `20260715020000_harden_auth_and_public_ingress` | Sesiones, OAuth y protección de ingreso público. |
| `20260715030000_add_worker_leases` | Leases y recuperación de workers. |
| `20260715100000_add_revenue_intelligence` | Enriquecimiento de recomendaciones, experimentos, asignaciones, memoria operativa y políticas empresariales. |

Para producción, estas migraciones deben desplegarse con `prisma migrate deploy`; no se recomienda sustituir ese proceso por `db push`.

## Pruebas y verificación realizada

Se han comprobado en el estado actual del repositorio:

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd run build` (frontend) | Correcto; bundle principal aproximado de 1,61 MB minimizado. |
| `npm.cmd run build` (backend) | Correcto. |
| `npx prisma validate` | Correcto. |
| `npx prisma generate` | Correcto. |
| `authorizationRoutes.test.ts` | 2/2 pruebas correctas. |
| `git diff --check` | Sin errores de whitespace. |
| Detección de mojibake en `src` | Sin coincidencias detectables. |

El conjunto completo de pruebas de integración no se ha ejecutado porque el entorno no contiene `TEST_DATABASE_URL`; el propio script las bloquea para evitar que se apunten por error a una base no aislada. La validación visual mediante navegador integrado tampoco pudo completarse porque su política de red bloqueó el servidor local, aunque el servidor respondió correctamente desde el entorno de trabajo y el build pasó.

## Riesgos y prioridades técnicas restantes

No son bloqueantes de arquitectura, pero conviene tratarlos como mejoras del siguiente ciclo:

1. **Base de pruebas efímera en CI:** levantar PostgreSQL aislado, aplicar migraciones y ejecutar las pruebas de multitenancy, consentimiento, automatizaciones, workers y del nuevo módulo comercial en cada PR.
2. **Pruebas end-to-end de UI:** validar login, recuperación, modal, navegación móvil, rutas 404, aprobaciones de memoria y mutaciones de gobierno contra staging.
3. **Medición estadística de experimentos:** añadir umbrales mínimos de muestra, significación o intervalo de confianza antes de declarar una variante ganadora; la atribución ya está persistida, pero la decisión estadística debe hacerse explícita.
4. **División de bundle:** lazy loading por ruta, extracción de componentes pesados y presupuesto de rendimiento en CI.
5. **Observabilidad:** centralizar errores HTTP con `requestId`, logs estructurados, métricas de workers, recomendaciones, asignaciones y alertas de coste de proveedores de voz.
6. **Revisión legal:** completar términos y privacidad con la entidad responsable, jurisdicción, plazos de conservación, subencargados y mecanismo formal de ejercicio de derechos antes de uso externo amplio.

## Requisitos de despliegue

Antes de desplegar, el entorno debe aportar como mínimo:

- `JWT_SECRET` con 32 o más caracteres y sin valor de ejemplo.
- `OAUTH_STATE_SECRET`, distinto de `JWT_SECRET`.
- `VOICE_STREAM_SECRET` para capabilities de media; hay compatibilidad temporal con el secreto de Twilio, pero un secreto separado es preferible.
- URL de PostgreSQL y Redis operativas.
- Ejecución de `prisma migrate deploy`.
- Una `TEST_DATABASE_URL` independiente para pruebas automatizadas.

## Conclusión

Técnicamente, VozIA tiene una base apropiada para un producto SaaS de revenue conversacional: el dominio está bien segmentado, las integraciones se tratan con el nivel de control que requieren y las zonas de mayor riesgo —identidad, tenant isolation, voz, consentimiento, experimentación y procesos de fondo— disponen ahora de defensas explícitas.

La siguiente frontera de madurez es operativa: automatizar pruebas con infraestructura efímera, observar mejor los procesos distribuidos, formalizar la decisión estadística de experimentos y reducir el coste de carga inicial del cliente.
