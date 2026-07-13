# Modelo de objetos compartidos

## Objetos núcleo

| Objeto | Responsabilidad | Relaciones mínimas |
| --- | --- | --- |
| Organization | Tenant y facturación | usuarios, equipos, integraciones |
| User | Persona con acceso | roles, equipos, actividades |
| Contact | Persona de negocio | empresa, leads, conversaciones, oportunidades |
| Company | Cuenta/empresa | contactos, leads, oportunidades, clientes |
| Lead | Entrada captada pendiente de cualificar | contacto, fuente, campaña, actividades |
| Opportunity | Proceso comercial con valor | empresa, contactos, pipeline, actividades, documentos |
| Customer | Estado comercial ganado | empresa, oportunidades, facturas, cobros |
| Conversation | Hilo multicanal | contacto, canal, mensajes, grabaciones, sentimiento |
| Activity | Tarea, nota, llamada, reunión o evento | usuario, contacto, empresa, oportunidad |
| Campaign | Iniciativa de captación/nutrición | canal, audiencia, assets, leads, atribución |
| Audience | Segmento reutilizable | contactos, reglas, campañas, remarketing |
| Form | Punto de captación | campos, respuestas, campaña, lead |
| Automation | Flujo de disparadores y acciones | eventos, segmentos, plantillas, logs |
| Agent | Configuración de agente IA | voz, modelo, conocimiento, evaluaciones |
| KnowledgeSource | Fuente de conocimiento | agente, documentos, embeddings, permisos |
| Report | Definición de consulta/visualización | filtros, métricas, exportaciones |
| Integration | Conexión con proveedor externo | credenciales cifradas, webhooks, logs |

## Relaciones obligatorias

- Toda entidad de negocio lleva `organizationId`.
- Toda acción relevante genera una entrada de `Activity` o `AuditLog`.
- `Lead`, `Contact`, `Company` y `Opportunity` deben compartir un timeline.
- Toda conversación debe identificar `channel`, `provider`, `externalId` y `status`.
- Toda campaña debe guardar origen y parámetros de atribución.
- Los secretos de integraciones se almacenan cifrados en backend.

## Fichas contextuales

### Ficha de contacto/empresa

Tabs: Resumen, Actividad, Conversaciones, Leads, Oportunidades, Campañas, Documentos, Automatizaciones e Historial.

### Ficha de oportunidad

Tabs: Resumen, Pipeline, Actividad, Conversaciones, Presupuesto, Contrato, Cobros, Productos, Archivos, Automatizaciones e Historial.

### Ficha de agente IA

Tabs: Configuración, Voz, Modelo, Conocimiento, Memorias, Simulador, Evaluaciones, Transcripciones y Uso.

## Cambios de backend

Antes de crear tablas nuevas, buscar modelos equivalentes en `backend/prisma/schema.prisma`. Reutilizar `Lead`, `Campaign`, `Call`, `Meeting`, `Automation`, `Knowledge` y `User` cuando cubran el caso.

Para cada nuevo dominio:

1. Añadir modelos Prisma con `organizationId`, timestamps e índices.
2. Crear servicio con validación Zod.
3. Crear controlador delgado.
4. Crear rutas Fastify protegidas.
5. Registrar la ruta en `backend/src/index.ts`.
6. Añadir auditoría y permisos.
7. Crear contrato de API y conectar `src/lib/api.js`.

No añadir modelos solo para representar una pestaña visual. Un modelo nuevo debe tener ciclo de vida, permisos y persistencia real.

## Campos comunes

Todos los objetos persistentes de negocio deben evaluar estos campos:

```text
id
organizationId
createdAt
updatedAt
createdById
updatedById
deletedAt       // si se necesita borrado lógico
status
metadata        // solo datos no críticos y versionados
```

No usar `metadata` para esconder columnas que necesitan filtros, índices, permisos o reporting. Esas propiedades deben ser campos tipados.

## Estados y transiciones

Cada objeto debe declarar estados válidos y quién puede cambiarlos.

### Lead

```text
new → contacted → qualified → converted
new/contacted/qualified → disqualified
any non-terminal → archived
```

### Opportunity

```text
open → won
open → lost
open → paused
paused → open
won/lost → reopened     // solo permiso de supervisor/admin
```

### Automation

```text
draft → testing → active
active → paused
paused → active
active/paused → archived
```

### Agent IA

```text
draft → testing → published
published → paused
paused → published
published/paused → archived
```

El backend debe rechazar transiciones inválidas. El frontend solo mejora la experiencia; no es la autoridad.

## Timeline común

Crear un timeline normalizado que pueda recibir:

- llamada iniciada, contestada, transferida o finalizada;
- mensaje enviado o recibido;
- email enviado, abierto o rebotado;
- reunión creada, celebrada o cancelada;
- cambio de etapa de oportunidad;
- nota o tarea;
- cambio de propietario;
- ejecución de automatización;
- modificación administrativa.

Cada evento debe incluir `type`, `occurredAt`, `actor`, `source`, `entity`, `summary` y una referencia opcional al objeto origen.

## Deduplificación

Las entradas externas deben usar una clave idempotente compuesta por proveedor, cuenta y `externalId`.

Para importar leads:

1. Normalizar email, teléfono, dominio y nombre.
2. Buscar coincidencia dentro de la organización.
3. Crear, actualizar o poner en revisión según la política.
4. Guardar el resultado de importación por fila.
5. Nunca mezclar datos de dos organizaciones.
