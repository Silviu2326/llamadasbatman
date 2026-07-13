# Permisos, seguridad y multi-tenant

La amplitud de la plataforma aumenta el riesgo de que un usuario vea datos que no corresponden a su organización o ejecute acciones críticas sin control. Esta guía debe aplicarse antes de habilitar módulos nuevos.

## Modelo de aislamiento

La organización es el límite principal de datos.

```text
Organization
├── Users
├── Teams
├── Integrations
├── Contacts / Companies / Leads
├── Campaigns / Conversations / Opportunities
└── Reports / AuditLogs / Billing
```

Toda consulta de negocio debe incluir el tenant derivado del contexto autenticado. No aceptar filtros de organización desde el cliente como mecanismo de aislamiento.

## Roles base

Los roles son plantillas iniciales; las cuentas podrán crear roles personalizados más adelante.

| Rol | Alcance |
| --- | --- |
| Owner | todo el workspace, facturación y borrado irreversible |
| Admin | configuración y usuarios, sin necesariamente facturación |
| Manager | equipo propio, objetivos, calidad y reporting |
| Sales | leads, empresas, oportunidades, actividades y conversaciones asignadas |
| Marketing | captación, nutrición, audiencias y contenidos |
| Operator | inbox, llamadas y operaciones asignadas |
| AI Manager | agentes, conocimiento, evaluaciones y publicación |
| Analyst | lectura y exportación autorizada |
| Viewer | lectura limitada |

## Permisos

Los permisos tienen formato `recurso.acción`:

```text
leads.read
leads.create
leads.update
leads.delete
leads.import
leads.export
leads.assign
opportunities.move_stage
opportunities.mark_won
conversations.reply
conversations.assign
recordings.read
recordings.download
agents.publish
agents.manage_secrets
reports.export
settings.manage_integrations
billing.manage
audit.read
```

No usar solo `isAdmin` para resolver permisos. Puede mantenerse como compatibilidad, pero el código nuevo usa permisos explícitos.

## Alcance de datos

Además del permiso, una persona puede tener alcance:

- `organization`: todos los datos de la organización.
- `team`: datos de equipos asignados.
- `owned`: registros propios.
- `assigned`: registros asignados explícitamente.
- `none`: solo acciones sin datos de negocio.

El backend combina permiso y alcance. Ejemplo: `leads.read + team` no permite leer leads de otros equipos.

## Frontend y backend

El frontend debe ocultar acciones no autorizadas para mejorar UX, pero el backend debe rechazarlas siempre.

```jsx
{can('opportunities.move_stage') && (
  <MoveStageButton />
)}
```

El endpoint debe volver a comprobar `can('opportunities.move_stage')` con el usuario autenticado.

## Datos especialmente sensibles

Clasificar como sensibles:

- secretos de proveedores;
- grabaciones y transcripciones;
- teléfonos y emails;
- datos de facturación y cobros;
- prompts privados y conocimiento interno;
- logs que contengan payloads de proveedores;
- notas internas y evaluaciones de empleados.

Aplicar:

- cifrado en reposo donde corresponda;
- URLs firmadas y caducidad para archivos;
- redacción de PII en logs;
- permisos separados para visualizar y descargar;
- retención configurable;
- auditoría de lectura de datos de alto riesgo.

## Secretos e integraciones

- Nunca guardar secretos en `src/`.
- No versionar `.env` ni archivos con credenciales.
- Guardar credenciales en backend, cifradas y con rotación.
- Mostrar al frontend solo estado de conexión, scopes y últimos cuatro caracteres si es necesario.
- No devolver tokens completos en respuestas API.
- Registrar cuándo se conectó, desconectó, rotó o falló una integración.

## Webhooks y proveedores

Cada proveedor debe tener:

```text
provider
accountId
externalId
signatureAlgorithm
lastReceivedAt
lastSucceededAt
lastFailedAt
retryCount
```

Nunca confiar solo en una URL secreta. Validar firma, timestamp/replay window y `providerEventId`.

## Auditoría

Crear `AuditLog` para:

- login/logout y cambios de sesión relevantes;
- cambios de permisos, equipos y propietarios;
- creación, publicación, pausa y borrado;
- exportación o descarga de datos sensibles;
- conexión o desconexión de integraciones;
- publicación de agentes IA;
- modificaciones de facturación;
- accesos administrativos.

Formato mínimo:

```text
id
organizationId
actorId
action
resourceType
resourceId
beforeSnapshotHash
afterSnapshotHash
ipAddress
userAgent
createdAt
```

No guardar snapshots completos si incluyen secretos o PII innecesaria.

## Retención y borrado

Cada dominio debe declarar:

- retención por defecto;
- si el borrado es lógico o físico;
- dependencias que deben anonimizarse;
- exportación previa requerida;
- quién puede solicitarlo;
- cómo se audita.

Una conversación borrada no debe dejar una grabación descargable por una URL antigua.

## Rate limits

Definir límites por organización, usuario, IP y proveedor para:

- login;
- formularios públicos;
- scraping;
- envíos de email/SMS/WhatsApp;
- generación de contenido IA;
- exportaciones;
- endpoints de búsqueda.

Devolver `429` con información de reintento sin revelar reglas internas sensibles.

## Checklist de seguridad antes de activar un módulo

- [ ] Datos ligados a organización.
- [ ] Permisos de lectura y escritura.
- [ ] Alcance por equipo/propietario si aplica.
- [ ] Validación de entrada.
- [ ] Rate limit.
- [ ] Auditoría.
- [ ] Redacción de logs.
- [ ] Política de retención.
- [ ] Prueba de acceso cruzado entre organizaciones.
- [ ] Revisión de secretos y variables de entorno.
