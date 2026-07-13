# Auditoría de Ventas

## 1. Alcance

La sección Ventas del sidebar incluye:

- Leads: `/leads` y `/leads/:id`;
- Pipeline: `/pipeline` y `/pipeline/:id`;
- Reuniones: `/reuniones` y `/reuniones/:id`.

La especificación objetivo pide lista, segmentos, ficha y timeline para leads/contactos/empresas/clientes; y kanban, lista, forecast y ficha para oportunidades. Una oportunidad debe tener, como mínimo, valor, moneda, etapa, probabilidad, fecha de cierre, propietario, empresa, contactos, fuente y motivo de pérdida.

Referencia: [Especificación funcional de Ventas](../arquitectura-plataforma/07-especificacion-de-modulos.md#4-ventas).

## 2. Modelo actual

```text
Organization
   ├─ Lead
   │   ├─ Call
   │   ├─ Meeting
   │   ├─ Opportunity
   │   ├─ LeadNote
   │   ├─ LeadFile
   │   ├─ LeadAudit
   │   ├─ Conversation / Message
   │   └─ ContactConsent
   └─ User (assignee de Meeting/Opportunity)
```

Limitaciones estructurales:

- `company` es un string dentro de `Lead`; no existe entidad Empresa/Cuenta.
- No existe Contacto separado ni múltiples contactos por oportunidad.
- No existe Tarea/Actividad comercial unificada.
- `Lead` solo tiene cinco estados; la UI muestra hasta ocho etapas conceptuales.
- `Opportunity` no tiene `updatedAt`, `stageEnteredAt`, historial de etapa, fuente ni motivo de pérdida.
- `Meeting` no tiene proveedor externo, evento de calendario, invitados, recordatorios ni historial.

Esquema: [Lead, Meeting y Opportunity](../../backend/prisma/schema.prisma#L209).

## 3. Capacidades reales actuales

### 3.1 Leads

Backend:

- alta y actualización;
- listado paginado por campaña/estado;
- importación CSV;
- llamada inmediata;
- timeline de llamadas, reuniones y oportunidades;
- auditoría digital e histórico;
- notas;
- archivos privados en S3;
- envío puntual por Mautic.

Rutas: [backend/src/routes/leads.ts](../../backend/src/routes/leads.ts).

Frontend:

- tabla y kanban visual;
- búsqueda/filtros locales sobre la página cargada;
- selección y actualización masiva de estado;
- exportación CSV de la vista local;
- ficha con resumen, inteligencia, notas, archivos y email;
- agendado de reunión desde la ficha.

### 3.2 Pipeline

Backend:

- alta, lectura y actualización de oportunidad;
- agrupación por etapa;
- agregados básicos;
- predicción ponderada por probabilidad y fecha esperada;
- recomendaciones deterministas por antigüedad.

Rutas: [backend/src/routes/pipeline.ts](../../backend/src/routes/pipeline.ts).

Frontend:

- kanban de lectura;
- KPIs calculados con las oportunidades recibidas;
- ficha editable para etapa, valor, moneda, probabilidad, fecha, notas y asignación;
- panel de forecast y textos de insight.

### 3.3 Reuniones

Backend:

- listado por propietario, estado y rango de fecha;
- alta, detalle y actualización;
- notificación de conversión a Meta al crear.

Rutas: [backend/src/routes/meetings.ts](../../backend/src/routes/meetings.ts).

Frontend:

- listado y tabs de fecha/estado;
- detalle, notas y cancelación;
- enlace para unirse si existe `meetingUrl`;
- exportación CSV;
- alta manual.

## 4. Hallazgos transversales

### VE-01 · P0 · Relaciones sin validación de ownership

Al crear una oportunidad o reunión se aceptan `leadId`, `assignedTo` y, en reuniones, `callId`, sin comprobar que pertenezcan al mismo `orgId`. La FK garantiza que el registro exista, pero no que sea de la misma organización.

Evidencia:

- [pipeline.service.ts, líneas 38-63](../../backend/src/services/pipeline.service.ts#L38)
- [meetings.service.ts, líneas 39-63](../../backend/src/services/meetings.service.ts#L39)

Notas y archivos también se crean con `orgId` y un `leadId` recibido sin comprobar primero ownership en [leads.service.ts, líneas 210-229](../../backend/src/services/leads.service.ts#L210).

**Impacto:** relaciones cross-tenant, corrupción lógica y posible exposición indirecta si se conoce un ID ajeno.

**Corrección:** resolver todas las referencias mediante `findFirst({ id, orgId })` dentro de la misma transacción; añadir constraints compuestas donde Prisma/Postgres lo permitan y pruebas negativas multi-tenant.

### VE-02 · P0 · Datos simulados o decorativos presentados como verdad

Ejemplos:

- El score de lead es una constante derivada del estado: 40/55/75/20/90 en [leadMapping.js, líneas 5-12](../../src/lib/leadMapping.js#L5).
- La pantalla muestra 23 leads hot u 8 acciones cuando el conteo real es cero en [Leads.jsx, líneas 86-96](../../src/components/Leads.jsx#L86).
- Muestra “3 reuniones” aunque no existan datos.
- Pipeline enseña el rango fijo `12 may 2024 - 18 may 2024` en [Pipeline.jsx, líneas 394-409](../../src/components/Pipeline.jsx#L394).
- La ficha de reunión marca “Recordatorio enviado” como verdadero sin modelo ni evento que lo respalde en [MeetingDetailPage.jsx, líneas 297-312](../../src/pages/MeetingDetailPage.jsx#L297).
- Las series de KPIs de pipeline y reuniones son arrays decorativos.

**Impacto:** el comercial prioriza y reporta basándose en información inexistente.

**Corrección:** regla de producto: ningún número o estado operativo puede usar fallback positivo. Usar cero, vacío, “sin datos” o “no configurado”, y mostrar procedencia/última actualización.

### VE-03 · P1 · Mutaciones sin validación de entrada consistente

Leads, Pipeline, Meetings y Automatizaciones no usan el helper Zod ya disponible. Se pueden enviar fechas inválidas, probabilidades fuera de rango, valores negativos, enums inválidos, strings enormes o campos inesperados.

Los endpoints `PUT` suelen responder `{ ok: true }` aunque `updateMany` haya actualizado cero registros.

**Corrección:** schemas estrictos por endpoint, límites, normalización, validación de moneda/teléfono/email/fecha y respuesta 404 cuando `count === 0`.

### VE-04 · P1 · RBAC prácticamente ausente

Las rutas de Ventas solo requieren autenticación. Un viewer puede crear o modificar leads, oportunidades y reuniones. Tampoco hay políticas por propietario/equipo.

**Corrección:** permisos `sales.read`, `lead.write`, `opportunity.write`, `meeting.write`, `sales.export`, `sales.admin`; filtros por equipo/propietario cuando aplique.

### VE-05 · P1 · Falta actividad y tareas como fuente de verdad

La “próxima acción” vive, cuando existe, dentro de `customFields`; no hay entidad Task. No existe actividad unificada para cambios de estado, emails, notas, archivos, reuniones y movimientos de pipeline.

Aunque existe `NextBestAction`, solo se usa en Conversaciones y se crea como recomendación inicial estática. No alimenta la lista/ficha de Leads ni ofrece aceptar/ejecutar/completar desde Ventas.

**Corrección:** introducir `SalesActivity` y `Task`, y vincular/adaptar `NextBestAction` para convertir una recomendación aceptada en una tarea o ejecución trazable.

### VE-06 · P1 · Fechas e índices insuficientes

`Lead`, `Opportunity` y `Meeting` no tienen `updatedAt`. Tampoco hay índices compuestos adecuados por `orgId + status/stage + fecha`. La UI intenta mostrar `lead.updatedAt`, que nunca llega, en [leadMapping.js, líneas 25-29](../../src/lib/leadMapping.js#L25).

**Corrección:** añadir timestamps, índices y campos de cambio de etapa antes de escalar datos o automatizaciones temporales.

## 5. Auditoría de Leads

### 5.1 Estado real

El módulo es útil como directorio básico y ficha de contexto, pero todavía no constituye una cola comercial priorizada. Su score, etapas y siguientes acciones no tienen un modelo consistente.

### LE-01 · P1 · Alta manual/importada evita la orquestación común

`createLead()` escribe el registro, pero no llama a `syncContact()`, no crea conversación, no registra consentimiento y no emite `lead.created`. `importLeads()` repite el mismo patrón fila a fila.

Solo `ingestLead()` ejecuta Meta, Mautic y Conversaciones en [leadIngestion.service.ts, líneas 24-53](../../backend/src/services/leadIngestion.service.ts#L24).

**Impacto:** una automatización de bienvenida puede funcionar para Meta/landing y no para un lead creado en la UI o importado.

**Corrección:** una única entrada de dominio idempotente o transacción + outbox para todas las fuentes.

### LE-02 · P1 · Etapas de frontend y backend no representan el mismo proceso

Backend: `new`, `contacted`, `qualified`, `unqualified`, `converted`.

Frontend: Nuevo, Contactado, Interesado, En seguimiento, Reunión agendada, Negociación, Ganado y Perdido.

“Reunión agendada” y “Negociación” se guardan como `qualified`; tras recargar, vuelven a mostrarse como “Interesado”. La actualización masiva “En seguimiento” también se guarda como `qualified`.

**Corrección:** separar `lifecycleStatus` del lead de `Opportunity.stage`. Una reunión no debe ser un status de lead; debe derivarse de una Meeting. Negociación debe vivir en la oportunidad.

### LE-03 · P1 · Score no es un score

El score depende únicamente del estado. No incorpora datos firmográficos, interacción, auditoría, respuesta, recencia ni señales negativas. La UI lo llama “Score proporcionado por la API”, aunque se calcula en el navegador.

**Corrección:** servicio de scoring versionado y explicable con `ScoreSnapshot` y contribuciones. Hasta entonces, ocultar “Hot” y probabilidad de cierre o etiquetarlos como heurística de estado.

### LE-04 · P1 · Filtros, búsqueda y exportación solo cubren la página cargada

El backend pagina 24 registros; la UI busca, filtra, ordena, selecciona y exporta solo esos 24. Las fuentes disponibles también se extraen de esa página.

**Impacto:** resultados incompletos con apariencia de búsqueda global.

**Corrección:** query server-side con `search`, `status`, `scoreMin`, `source`, `owner`, tags, auditoría, próxima acción, `sort`, cursor/página; export asíncrono del conjunto completo filtrado.

### LE-05 · P1 · Filtro “Sin próxima acción” defectuoso

El filtro exige que `lead.nextAction === 'Sin próxima acción'`, pero un lead sin dato recibe `undefined`. Por eso los leads realmente sin acción pueden no aparecer.

**Corrección:** modelo `Task` y filtro server-side `nextTaskId is null`; como parche, tratar `null/undefined` como sin acción.

### LE-06 · P1 · Importación CSV no es robusta

Problemas:

- sin límite de filas/tamaño;
- sin mapeo de columnas;
- sin preview ni validación por fila;
- sin deduplicación por email/teléfono;
- inserción secuencial;
- si falla una fila puede quedar una importación parcial sin informe;
- campaña y leads no se crean en una transacción;
- `autoCall` encola uno a uno en la petición HTTP.

**Corrección:** `ImportJob` asíncrono, preview, mapping, normalización, dedupe, reporte de errores y acciones posteriores por outbox.

### LE-07 · P1 · Crear oportunidad o reunión crea antes un lead duplicado

Los modales globales de Nueva Oportunidad y Nueva Reunión siempre crean un lead nuevo. No permiten buscar uno existente. Si el segundo POST falla, queda un lead huérfano.

Evidencia:

- [NewOportunidadModal.jsx](../../src/modals/NewOportunidadModal.jsx)
- [NewReunionModal.jsx](../../src/modals/NewReunionModal.jsx)

**Corrección:** selector “usar lead existente / crear nuevo” y endpoint transaccional de creación compuesta.

### LE-08 · P1 · Archivos sin controles suficientes

La API recibe base64 en JSON, sin límite explícito, allowlist MIME, antivirus o sanitización de nombre. `mimeType` no se persiste. La UI busca `file.size`, pero el backend devuelve `sizeBytes`.

**Corrección:** upload firmado directo a S3, límites, MIME real, hash, antivirus, estado de procesamiento y autorización de descarga.

### LE-09 · P1 · Envío manual de email poco seguro y poco usable

El usuario escribe un ID de Mautic. No hay selector, preview, variables, consentimiento visible ni registro uniforme en timeline.

**Corrección:** reutilizar el catálogo autorizado de plantillas y el servicio central de entrega/consentimiento.

### LE-10 · P2 · Timeline incompleto

El backend devuelve llamadas, reuniones y oportunidades, pero la UI principal construye la actividad solo con llamadas y reuniones. No incluye notas, archivos, emails, mensajes, cambios de estado o etapa.

**Corrección:** `SalesActivity` paginada y ordenada por `occurredAt`, con enlaces al objeto origen.

## 6. Auditoría de Pipeline y Oportunidades

### 6.1 Estado real

Existe un CRUD básico y una vista agrupada por etapa. La ficha permite editar campos principales. El kanban, sin embargo, es de lectura: no tiene drag and drop ni cambio rápido de etapa.

### OP-01 · P1 · Kanban no gestionable

Las tarjetas solo navegan al detalle. Los controles de fecha, filtros y menú superior no tienen handler; la fecha es fija de 2024.

**Corrección:** DnD accesible con mutación optimista reversible, filtros reales, vista lista y configuración de etapas.

### OP-02 · P1 · No hay historial de etapa

`Opportunity` solo guarda `createdAt`. Las alertas de “propuesta > 3 días” y oportunidades estancadas comparan `createdAt`, no el momento en que entraron en la etapa, en [pipeline.service.ts, líneas 118-140](../../backend/src/services/pipeline.service.ts#L118).

**Impacto:** una oportunidad antigua movida hoy a Propuesta se marca inmediatamente como estancada.

**Corrección:** `OpportunityStageHistory` y `stageEnteredAt`, escritos en transacción con el cambio de etapa.

### OP-03 · P1 · Faltan campos comerciales mínimos

No hay:

- empresa normalizada;
- múltiples contactos/roles de compra;
- fuente/atribución propia de oportunidad;
- motivo de pérdida;
- competidor;
- productos/líneas;
- siguiente paso;
- fecha real de cierre;
- probabilidad calculada o categoría de forecast;
- historial de propietario.

### OP-04 · P1 · Forecast débil e inconsistente

La predicción multiplica valor por probabilidad manual. El total incluye todas las oportunidades abiertas, aunque su fecha de cierre esté fuera de 30 días; el gráfico solo ubica las que tienen fecha en cinco ventanas semanales. No hay moneda normalizada, snapshot, commit/best case ni comparación con objetivo.

**Corrección:** forecast por periodo, moneda base, categoría, fecha, historial y snapshot; distinguir pipeline, weighted pipeline y forecast commit.

### OP-05 · P1 · Totales de pipeline incluyen cierres

El frontend suma todas las etapas para “Valor total del pipeline”, incluidas Ganado y Perdido. El donut excluye Perdido, pero incluye Ganado como pipeline activo.

**Corrección:** definiciones explícitas:

- pipeline abierto: etapas no cerradas;
- ganado del periodo;
- perdido del periodo;
- cartera histórica total, si se necesita aparte.

### OP-06 · P1 · “Insights IA” no son IA ni están suficientemente fundamentados

Los textos son cálculos deterministas. “Enviar recordatorio puede aumentar 32%” es una afirmación fija sin fuente ni datos de la organización.

**Corrección:** llamarlos Insights/Reglas, mostrar fórmula y muestra. Usar IA solo si existe modelo, evidencia, confianza y explicación.

### OP-07 · P1 · Cerrar ganada/perdida no aplica invariantes

Mover a `closed_won` no actualiza el lifecycle del lead, fecha real, valor final ni actividad; mover a `closed_lost` no exige motivo. Tampoco hay control para reabrir.

**Corrección:** comandos específicos `mark-won`, `mark-lost`, `reopen` con validación, permisos, historial y eventos.

### OP-08 · P2 · Ficha de oportunidad representa Perdido como Lead

El mapeo visual convierte `closed_lost` a `lead`, por lo que la barra de progreso muestra una oportunidad perdida como si estuviera al inicio en [OpportunityDetailPage.jsx, líneas 76-91](../../src/pages/OpportunityDetailPage.jsx#L76).

**Corrección:** estado de cierre separado de la progresión o nodo Perdido explícito.

### OP-09 · P2 · Asignación por ID libre

La edición muestra `assignedTo` como input de texto, no selector de usuarios autorizados. Puede introducirse un ID inválido o ajeno.

**Corrección:** selector de miembros/equipos de la organización y validación backend.

## 7. Auditoría de Reuniones

### 7.1 Estado real

El módulo persiste reuniones y permite notas/cancelación. No es todavía un sistema de calendarización: carece de sincronización, invitados, recordatorios, disponibilidad y reprogramación real.

### RE-01 · P1 · Reprogramar no reprograma

En el listado, “Reprogramar” abre el modal de nueva reunión y pierde la reunión seleccionada. En la ficha, el botón simplemente vuelve al listado.

**Corrección:** formulario precargado y `PUT /api/meetings/:id/reschedule`, con actualización del evento externo, notificación a asistentes e historial.

### RE-02 · P1 · Sin integración de calendario

No hay Google Calendar/Microsoft 365, OAuth, free/busy, evento externo, invitados, ICS, videollamada automática o webhook de cambios.

**Corrección:** `CalendarConnection` y `MeetingExternalEvent`; creación idempotente, reconciliación y soporte inicial para un proveedor antes de ampliar.

### RE-03 · P1 · Sin recordatorios reales

La visión promete email/WhatsApp, pero no hay scheduler ni registro de recordatorio. El checklist muestra dos pasos como hechos por defecto.

**Corrección:** reglas T-24 h/T-2 h configurables, consentimiento por canal, entrega trazada y cancelación automática al reprogramar/cancelar.

### RE-04 · P1 · Búsqueda, filtros y paginación inertes

El input de búsqueda no tiene estado ni handler. Los botones de filtro y paginación no cambian datos; el selector de page size no se usa. La API devuelve todas las reuniones.

**Corrección:** query server-side con search, estado, propietario, fecha, campaña y cursor/página.

### RE-05 · P1 · Sin evento de automatización de reunión

Crear una reunión manda una conversión a Meta, pero no emite `meeting.created` ni programa `meeting.scheduled.24h`. Por eso los flujos de recordatorio nunca arrancan.

**Corrección:** outbox transaccional en create/reschedule/status change.

### RE-06 · P1 · Resultado e historial insuficientes

Solo hay status y notas. Falta:

- outcome;
- asistentes reales;
- no-show detectado/confirmado;
- acuerdos;
- próximos pasos;
- transcripción/grabación si aplica;
- relación con oportunidad;
- historial de cambios.

La pestaña Historial es un texto vacío.

### RE-07 · P1 · Fecha/hora depende del navegador

La UI usa timezone local del navegador y suma días con `86.400.000` ms, lo que falla en cambios DST. No usa `Organization.timezone`.

**Corrección:** almacenar UTC, conservar timezone IANA del evento, calcular ventanas en backend y mostrar timezone explícita.

### RE-08 · P2 · Plataforma inferida de forma incorrecta

Si la URL no contiene `zoom`, la UI la marca como Google Meet; Teams u otro proveedor se etiquetan mal.

**Corrección:** guardar `provider` explícito o detectar dominios conocidos con fallback “Enlace externo”.

### RE-09 · P2 · Métricas sin periodo

KPIs de agendadas, completadas, asistencia y canceladas usan todo el histórico cargado. “Duración promedio” usa la duración planificada, no la duración real.

**Corrección:** periodo, duración real, cohortes y definición de asistencia.

## 8. Funcionalidades a crear

### 8.1 Fundamentos de datos

1. **Empresa/Cuenta**
   - nombre, dominio, sector, tamaño, ubicación, owner, lifecycle y dedupe;
   - múltiples contactos y oportunidades.

2. **Contacto**
   - identidad, cargo, canales, preferencias y consentimiento;
   - relación con empresa;
   - el concepto Lead pasa a ser lifecycle/estado de calificación, no una ficha duplicada.

3. **Actividad comercial**
   - llamada, mensaje, email, nota, archivo, tarea, reunión y cambio de etapa;
   - timeline único y auditable.

4. **Tarea/Siguiente acción**
   - tipo, vencimiento, propietario, prioridad, estado, recordatorio y objeto relacionado;
   - integración con `NextBestAction`.

5. **Historial de oportunidad**
   - etapa, propietario, valor, probabilidad, fecha y motivo;
   - actor, origen y timestamps.

### 8.2 Leads operables

- búsqueda y filtros globales;
- deduplicación y merge;
- importación asíncrona con informe;
- ownership/equipos;
- score explicable con historial;
- tareas y SLA de primera respuesta;
- bulk actions server-side;
- timeline completo;
- consentimiento visible y editable según permisos;
- conversión transaccional a oportunidad sin duplicar ficha.

### 8.3 Pipeline operable

- kanban con DnD;
- vista lista y filtros;
- etapas configurables con probabilidad por defecto;
- requisitos por transición;
- cerrar ganada/perdida y reabrir;
- motivo de pérdida;
- productos/líneas y valor;
- contactos y roles de compra;
- actividad, tarea y siguiente paso;
- forecast por periodo/categoría/owner;
- pipeline aging real.

### 8.4 Reuniones operables

- seleccionar lead existente;
- disponibilidad y conflictos;
- integración de calendario;
- invitados y videollamada;
- recordatorios trazados;
- reprogramación/cancelación sincronizada;
- preparación con contexto real;
- outcome, no-show, acuerdos y siguiente acción;
- actualización de oportunidad y automatizaciones.

## 9. Flujos de aceptación

### Flujo A · Lead a primera acción

1. Lead entra por cualquier fuente, incluida alta manual/CSV.
2. Se deduplica y persiste.
3. Se crea actividad de captura y consentimiento.
4. Se emite `lead.created` por outbox.
5. Se sincroniza Mautic y se crea conversación.
6. Se calcula score explicado.
7. Se crea tarea/siguiente acción con owner y SLA.
8. La lista lo encuentra mediante búsqueda global y filtros.

### Flujo B · Oportunidad a cierre

1. Se crea desde un lead/contacto existente.
2. El kanban permite moverla con requisitos y rollback si falla.
3. Cada transición crea historial y evento.
4. Las alertas usan `stageEnteredAt`.
5. Cerrar perdida exige motivo; cerrar ganada registra fecha/valor final.
6. Forecast y dashboard reflejan el cambio en el periodo correcto.

### Flujo C · Reunión conectada

1. Se selecciona lead, owner, duración y timezone.
2. Se comprueba disponibilidad.
3. Se crea evento externo, invitados y enlace.
4. Se emite `meeting.created` y se programan recordatorios.
5. Reprogramar actualiza el mismo evento y cancela recordatorios anteriores.
6. Completar/no-show exige outcome y siguiente acción.
7. Timeline, oportunidad y métricas se actualizan.

## 10. Criterios de terminado de Ventas MVP

- no existen relaciones cross-tenant posibles por API;
- viewer no puede mutar y agent solo actúa dentro de su alcance;
- todas las altas de lead usan la misma orquestación idempotente;
- no hay números, fechas o checklists simulados;
- score y prioridad muestran fórmula/motivo o se ocultan;
- búsqueda, filtros, sort, bulk y export son globales y server-side;
- el pipeline mueve etapas y registra historial;
- alertas de aging usan entrada real en etapa;
- ganar/perder aplica invariantes y eventos;
- reuniones se reprograman de verdad y sincronizan un calendario;
- recordatorios tienen estado de entrega y consentimiento;
- toda ficha usa una actividad/timeline común;
- existen pruebas multi-tenant, permisos, transición de etapa, importación y calendario.
