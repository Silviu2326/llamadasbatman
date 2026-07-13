# Backlog priorizado y roadmap

## 1. Criterio de prioridad

| Prioridad | Regla |
| --- | --- |
| P0 | Riesgo de aislamiento, cumplimiento, duplicación de acciones o datos falsos que impide operar con clientes reales. |
| P1 | Necesario para un MVP comercial fiable y medible. |
| P2 | Mejora de productividad, crecimiento u optimización una vez estable el núcleo. |
| P3 | Capacidad avanzada o expansión de producto. |

Tamaños relativos:

- **S:** cambio localizado.
- **M:** varias capas o una migración moderada.
- **L:** flujo completo con modelo, backend, frontend y pruebas.
- **XL:** iniciativa que debe dividirse en entregas.

Las estimaciones no son fechas contractuales; sirven para secuenciar dependencias.

## 2. Backlog P0: seguridad y verdad operativa

| ID | Área | Funcionalidad/corrección | Tamaño | Dependencias | Terminado cuando |
| --- | --- | --- | --- | --- | --- |
| P0-01 | Multi-tenant | Validar ownership de `leadId`, `assignedTo`, `callId`, plantilla, segmento y campaña en toda mutación. | M | Ninguna | Las pruebas negativas no pueden crear ni leer relaciones de otra organización. |
| P0-02 | API | Añadir Zod estricto y respuestas 404/409 correctas a Leads, Pipeline, Meetings y Automations. | M | P0-01 | Inputs inválidos no llegan a Prisma/proveedores y `updateMany.count=0` no responde éxito. |
| P0-03 | RBAC | Aplicar permisos a Nutrición y Ventas. | M | Matriz de roles | Viewer es read-only; publicar, borrar y reintentar requieren permisos explícitos. |
| P0-04 | Email | Filtrar y vincular plantillas/segmentos/campañas Mautic por `orgId`. | L | P0-01 | Ningún ID externo se lista o usa sin binding/ownership. |
| P0-05 | Email | Centralizar consentimiento, preferencias y supresión antes de todo envío. | L | P0-01 | Baja, hard bounce o ausencia de consentimiento bloquean manual, automatización y campaña. |
| P0-06 | Email | Procesar `unsubscribe`, `bounce` y complaint como estado de cumplimiento, no engagement. | M | P0-05 | Webhook actualiza supresión/consentimiento y la UI representa correctamente cada evento. |
| P0-07 | Automatizaciones | Implementar idempotencia por paso/efecto externo. | L | Modelo `AutomationStepRun` | Una caída entre proveedor y DB no duplica email, WhatsApp o llamada. |
| P0-08 | Automatizaciones | Crear scheduler para los cuatro triggers temporales ya expuestos. | L | Outbox, timezone | Cada trigger visible produce un evento determinista y probado. |
| P0-09 | UI | Eliminar todos los fallbacks positivos y datos fijos de Leads, Pipeline y Reuniones. | S | Ninguna | Cero/vacío/error nunca se convierten en 23 leads, 3 reuniones, fecha 2024 o recordatorio enviado. |
| P0-10 | Operación | Desplegar worker explícito y health de outbox/colas/scheduler. | M | Infra despliegue | Si el worker se detiene hay health rojo y alerta; `BACKGROUND_WORKERS_ENABLED` está documentado. |
| P0-11 | Mautic | Fijar versión y pruebas de contrato/E2E sandbox. | L | Entorno Mautic | Crear, listar, probar, publicar/pausar y recibir webhook pasan contra la versión desplegada. |
| P0-12 | Auditoría | Audit log de mutaciones sensibles. | M | Usuario/RBAC | Queda actor, acción, entidad, before/after, fecha y request/correlation ID. |

## 3. Backlog P1: MVP operable

### 3.1 Fundamentos compartidos

| ID | Funcionalidad | Tamaño | Dependencias | Resultado |
| --- | --- | --- | --- | --- |
| FND-01 | Añadir `updatedAt`, índices por organización/estado/fecha y timestamps de lifecycle. | M | Migración | Listas y jobs temporales escalan y usan fechas reales. |
| FND-02 | Crear `SalesActivity` como timeline unificado. | L | FND-01 | Llamadas, mensajes, emails, reuniones, notas, archivos y cambios aparecen cronológicamente. |
| FND-03 | Crear `Task` con owner, vencimiento, prioridad, estado, recordatorio y relaciones. | L | FND-02 | “Próxima acción” deja de vivir en JSON. |
| FND-04 | Integrar `NextBestAction` con aceptar, descartar, ejecutar y convertir a Task. | M | FND-03 | Recomendaciones son operables y medibles. |
| FND-05 | Crear servicio único idempotente de ingestión de leads para todas las fuentes. | L | Outbox | Manual, CSV, Meta, landing y API producen los mismos efectos de dominio. |
| FND-06 | Normalizar errores, correlation ID y observabilidad por proveedor/job. | M | P0-10 | Cada fallo se puede rastrear de request a outbox, run y entrega. |

### 3.2 Email Marketing

| ID | Funcionalidad | Tamaño | Dependencias | Resultado |
| --- | --- | --- | --- | --- |
| EM-101 | Modelo local de binding/sync de contacto Mautic. | M | P0-04 | Se conoce external ID, estado, último sync/error y se puede reintentar. |
| EM-102 | `EmailDelivery` + `EmailEvent` normalizados e idempotentes. | L | P0-05, FND-02 | Toda entrega y evento tiene historial consultable. |
| EM-103 | Cliente Mautic tipado con timeout, retry seguro y reconciliación. | M | P0-11 | Fallos externos son controlados y observables. |
| EM-104 | Selector autorizado de plantillas con preview y variables. | M | P0-04 | Nadie escribe IDs externos manualmente. |
| EM-105 | Wizard de campaña: objetivo, audiencia, plantilla, remitente, calendario y checklist. | XL | EM-102/104 | Una campaña creada desde CRM es ejecutable y validada. |
| EM-106 | Audiencias dinámicas con preview y exclusiones. | L | Score/Task/consentimiento | El usuario entiende quién entra y por qué. |
| EM-107 | Publicar/pausar con reconciliación de estado remoto. | M | EM-103/105 | La UI refleja estado confirmado, no optimista. |
| EM-108 | Métricas correctas por campaña, variante y periodo. | L | EM-102 | Entregados, únicos, CTR/CTOR, rebotes, bajas y conversiones usan denominadores correctos. |
| EM-109 | Historial de email en ficha de lead/conversación. | M | EM-102, FND-02 | El comercial ve mensaje, estado e interacción. |
| EM-110 | Centro de preferencias por canal/categoría. | L | P0-05 | El contacto puede gestionar preferencias granulares y auditablemente. |

### 3.3 Automatizaciones

| ID | Funcionalidad | Tamaño | Dependencias | Resultado |
| --- | --- | --- | --- | --- |
| AU-101 | Añadir `description`, estado draft y validación de completitud. | M | Migración | No se activan flujos vacíos y la descripción persiste. |
| AU-102 | `AutomationVersion` inmutable y publicación/rollback. | L | AU-101 | Cada run identifica la definición exacta. |
| AU-103 | `AutomationStepRun` con estados y resultado estructurado. | L | P0-07, AU-102 | Éxito, omitido, bloqueado y fallo se distinguen por paso. |
| AU-104 | API/UI de historial, filtros, detalle y reintento. | L | AU-103 | Operaciones puede diagnosticar sin consultar la DB. |
| AU-105 | Condiciones AND/OR y ramas if/else. | L | AU-102 | El flujo decide con datos reales. |
| AU-106 | Esperas, ventanas horarias y cancelación/reprogramación. | L | P0-08, AU-103 | Secuencias temporales fiables. |
| AU-107 | Productores de eventos de lead, oportunidad, reunión, email, tarea y consentimiento. | L | FND-02/03 | Nutrición reacciona al ciclo comercial completo. |
| AU-108 | Acciones CRM: tarea, owner, tag, campo, oportunidad y notificación. | L | FND-03 | Se cubren las acciones iniciales de la especificación. |
| AU-109 | Dead-letter, máximo de reintentos y replay con RBAC. | M | AU-103, P0-10 | Fallos permanentes no ciclan indefinidamente. |
| AU-110 | Simulador/dry-run y plantillas reales prefijadas. | L | AU-102/105 | El usuario valida alcance y payload antes de publicar. |
| AU-111 | Simplificar Redis + outbox con una fuente de verdad. | M | P0-10 | Un evento tiene un recorrido operativo único y observable. |

### 3.4 Leads

| ID | Funcionalidad | Tamaño | Dependencias | Resultado |
| --- | --- | --- | --- | --- |
| LE-101 | Búsqueda, filtros, sort y paginación server-side. | L | FND-01 | Resultados globales, no solo los 24 cargados. |
| LE-102 | Bulk update/export asíncrono del conjunto filtrado. | M | LE-101 | Acciones masivas completas y con reporte. |
| LE-103 | ImportJob CSV con preview, mapeo, dedupe y errores por fila. | L | FND-05 | Importación reanudable, idempotente y auditable. |
| LE-104 | Deduplicación y merge por email/teléfono/dominio/external ID. | L | Empresa/Contacto | No se multiplican fichas por fuentes o modales. |
| LE-105 | Score explicable y versionado. | L | FND-02, EM-102 | Score combina firmografía, comportamiento, interacción y señales negativas. |
| LE-106 | Owner/equipo y SLA de primera respuesta. | M | FND-03, RBAC | Cada lead tiene responsable y vencimiento medible. |
| LE-107 | Timeline único y pestaña de consentimiento. | M | FND-02, P0-05 | Contexto completo y cumplimiento visible. |
| LE-108 | Upload firmado S3, límites, MIME, hash y antivirus. | L | Infra S3 | Archivos seguros y metadatos correctos. |
| LE-109 | Selector de plantilla y envío registrado. | M | EM-104/102 | Email manual seguro y trazable. |

### 3.5 Pipeline

| ID | Funcionalidad | Tamaño | Dependencias | Resultado |
| --- | --- | --- | --- | --- |
| OP-101 | `OpportunityStageHistory` + `stageEnteredAt`. | L | FND-01/02 | Aging y automatizaciones usan entrada real en etapa. |
| OP-102 | Kanban DnD con rollback y accesibilidad. | L | OP-101 | Mover tarjeta actualiza backend/historial. |
| OP-103 | Vista lista, búsqueda y filtros por owner/etapa/fecha/fuente. | M | FND-01 | Gestión de cartera completa. |
| OP-104 | Comandos ganar/perder/reabrir con motivo y permisos. | M | OP-101, RBAC | Cierres aplican invariantes y eventos. |
| OP-105 | Próximo paso/tarea obligatoria en etapas configurables. | M | FND-03 | Ninguna oportunidad queda sin seguimiento. |
| OP-106 | Configuración de etapas, probabilidad por defecto y requisitos. | L | OP-101 | Pipeline adaptable sin perder consistencia. |
| OP-107 | Forecast por periodo, owner, categoría y moneda base. | L | OP-101 | Commit, best case y weighted son explicables. |
| OP-108 | Contactos, roles de compra, fuente y atribución. | L | Empresa/Contacto | La oportunidad refleja el proceso de compra real. |
| OP-109 | Productos/líneas y valor final. | L | Catálogo | Valor se compone de líneas, no solo un número libre. |

### 3.6 Reuniones

| ID | Funcionalidad | Tamaño | Dependencias | Resultado |
| --- | --- | --- | --- | --- |
| RE-101 | Seleccionar lead existente y alta compuesta transaccional. | M | FND-05 | No se crean duplicados u huérfanos. |
| RE-102 | Reprogramación real con historial. | M | FND-02 | Se edita la misma reunión y se registra el cambio. |
| RE-103 | Búsqueda, filtros y paginación server-side. | M | FND-01 | Controles visibles funcionan globalmente. |
| RE-104 | Integración Google Calendar o Microsoft 365, uno primero. | XL | OAuth/integraciones | Crear/editar/cancelar sincroniza evento, invitados y enlace. |
| RE-105 | Free/busy, timezone y detección de conflictos. | L | RE-104 | No se agenda en huecos ocupados o ambiguos. |
| RE-106 | Recordatorios T-24/T-2 configurables y trazados. | L | P0-08, EM-102, consentimiento | Envíos se programan, cancelan y registran. |
| RE-107 | Outcome, no-show, acuerdos y siguiente acción. | M | FND-03 | Completar una reunión actualiza el proceso comercial. |
| RE-108 | Preparación contextual real. | M | FND-02, Knowledge | Agenda/checklist proceden de datos, no constantes. |

## 4. Backlog P2/P3: crecimiento

| ID | Prioridad | Área | Funcionalidad | Tamaño |
| --- | --- | --- | --- | --- |
| GR-01 | P2 | Email | A/B testing de asunto/contenido con objetivo y ganador. | L |
| GR-02 | P2 | Email | Control de frecuencia y fatiga por contacto/categoría. | M |
| GR-03 | P2 | Email | Atribución directa/asistida a reunión, oportunidad e ingreso. | L |
| GR-04 | P2 | Automatizaciones | Webhook entrante/saliente firmado y acciones HTTP con allowlist. | L |
| GR-05 | P2 | Automatizaciones | Biblioteca de plantillas por vertical y marketplace interno. | M |
| GR-06 | P2 | Leads | Segmentos guardados y vistas compartidas por equipo. | M |
| GR-07 | P2 | Leads | Enriquecimiento de empresa/contacto y dedupe asistido. | L |
| GR-08 | P2 | Pipeline | Objetivos/cuotas y cobertura de pipeline. | L |
| GR-09 | P2 | Pipeline | Riesgo de deal y recomendación de acción con evidencia. | L |
| GR-10 | P2 | Reuniones | Round-robin y páginas de reserva. | XL |
| GR-11 | P2 | Reuniones | Transcripción, resumen, compromisos y coaching. | XL |
| GR-12 | P3 | Ventas | Presupuestos, contratos y firma dentro de oportunidad. | XL |
| GR-13 | P3 | Ventas | Catálogo, líneas, impuestos y cobros según proveedor decidido. | XL |
| GR-14 | P3 | Analítica | Cohortes, velocidad de pipeline y forecasting avanzado. | XL |

## 5. Orden recomendado de implementación

### Fase 0 · Blindar y decir la verdad

Objetivo: poder usar el sistema sin riesgo cross-tenant ni señales falsas.

Incluye:

- P0-01 a P0-12;
- retirar valores decorativos;
- pruebas multi-tenant/RBAC;
- contrato Mautic;
- worker health.

Salida: el producto puede mostrar menos información, pero toda es confiable.

### Fase 1 · Hacer ejecutable el seguimiento

Objetivo: que cada lead tenga un responsable, próxima acción y eventos fiables.

Incluye:

- FND-01 a FND-06;
- FND-05 para unificar ingestión;
- LE-101/102/103/106/107;
- AU-101/102/103/104/107/108/109;
- OP-101/102/104/105;
- RE-101/102/103/107.

Salida: lead → tarea → oportunidad → reunión → siguiente acción, con historial.

### Fase 2 · Nutrición medible

Objetivo: activar campañas y secuencias sin perder control de consentimiento ni trazabilidad.

Incluye:

- EM-101 a EM-110;
- AU-105/106/110/111;
- RE-106;
- LE-105/109.

Salida: audiencia → campaña/automatización → entrega → interacción → acción comercial.

### Fase 3 · Calendario y forecast

Objetivo: completar la operación diaria y gestión del equipo.

Incluye:

- RE-104/105/108;
- OP-103/106/107/108;
- Empresa/Contacto;
- métricas de SLA y velocidad.

### Fase 4 · Optimización

Objetivo: experimentación, atribución avanzada y productividad.

Incluye backlog P2/P3 según ventas reales y feedback de usuarios.

## 6. Tres primeras iteraciones recomendadas

### Iteración 1 · Riesgo cero

- ownership compuesto y tests multi-tenant;
- Zod y respuestas correctas;
- RBAC;
- consentimiento/supresión de email;
- eliminar datos falsos;
- health del worker.

### Iteración 2 · Eventos y actividad

- servicio único de ingestión;
- `SalesActivity` y `Task` mínimos;
- `AutomationVersion`/`StepRun` mínimos;
- scheduler temporal;
- productores de oportunidad/reunión/email;
- historial de automatización.

### Iteración 3 · Flujo comercial

- búsqueda server-side de leads;
- pipeline DnD + stage history;
- comandos ganar/perder;
- reprogramación real;
- selector de lead existente;
- recordatorios trazados.

Después de estas tres iteraciones conviene abordar el wizard completo de Email Marketing. Construirlo antes dejaría campañas visualmente completas sobre consentimiento, eventos y métricas todavía incompletos.

## 7. Definición de terminado común

Una funcionalidad de este backlog no está terminada solo porque exista una pantalla. Debe incluir:

1. migración y rollback de datos;
2. validación estricta;
3. comprobación multi-tenant;
4. RBAC;
5. eventos/outbox si cambia estado de dominio;
6. audit log para mutaciones sensibles;
7. estados de loading, vacío, error y retry;
8. métricas/logs/correlation ID;
9. pruebas unitarias e integración;
10. E2E del flujo principal;
11. documentación de configuración y operación;
12. ninguna cifra o afirmación no respaldada por datos.
