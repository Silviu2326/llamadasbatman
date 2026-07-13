# Contratos de API

Este documento fija una convención común para que los módulos nuevos no creen APIs incompatibles entre sí.

## Base URL y versionado

Las rutas privadas actuales usan `/api`. Mantener ese prefijo y versionar solo cuando haya un cambio incompatible:

```text
/api/{resource}
/api/{resource}/{id}
/api/{resource}/{id}/{subresource}
/api/v2/{resource}      // solo para ruptura incompatible
```

No crear una ruta con nombres de UI como `/api/pantalla-seo`. Las rutas representan recursos o acciones de dominio.

## Autenticación

Todas las rutas privadas deben pasar por el middleware de autenticación existente. El contexto autenticado debe exponer, como mínimo:

```ts
type AuthContext = {
  userId: string
  organizationId: string
  roleIds: string[]
  teamIds: string[]
  scopes: string[]
}
```

El controlador no debe aceptar `organizationId` desde el body para decidir el tenant. Debe obtenerlo del contexto autenticado y validar cualquier acceso cruzado mediante permisos explícitos.

## Convención de respuestas

### Lista

```json
{
  "data": [
    {
      "id": "clx_123",
      "name": "Formulario Demo",
      "status": "active",
      "createdAt": "2026-07-12T10:00:00.000Z",
      "updatedAt": "2026-07-12T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 1,
    "hasNextPage": false
  }
}
```

### Detalle

```json
{
  "data": {
    "id": "clx_123",
    "name": "Formulario Demo",
    "relations": {},
    "permissions": {
      "canEdit": true,
      "canDelete": false
    }
  }
}
```

### Mutación

```json
{
  "data": {
    "id": "clx_123",
    "status": "published"
  },
  "meta": {
    "requestId": "req_123"
  }
}
```

El frontend no debe depender de campos que no estén en el contrato documentado.

## Errores

```json
{
  "error": {
    "code": "FORM_VALIDATION_ERROR",
    "message": "Hay campos que requieren atención",
    "details": [
      { "field": "name", "code": "REQUIRED", "message": "El nombre es obligatorio" }
    ],
    "requestId": "req_123"
  }
}
```

Usar códigos estables y mensajes legibles. El frontend puede traducir por código, pero debe mostrar un fallback si no conoce el código.

## Códigos HTTP

| Código | Uso |
| --- | --- |
| 200 | lectura o mutación correcta |
| 201 | creación correcta |
| 202 | job aceptado para procesamiento asíncrono |
| 204 | eliminación o acción sin cuerpo |
| 400 | petición inválida |
| 401 | no autenticado |
| 403 | autenticado sin permiso |
| 404 | recurso inexistente o no visible para el tenant |
| 409 | conflicto de estado o duplicado |
| 422 | validación de dominio |
| 429 | rate limit |
| 500 | error inesperado |
| 502/503 | proveedor externo no disponible |

No devolver `500` por errores de validación ni filtrar stack traces.

## Paginación, filtros y orden

Parámetros comunes:

```text
page=1
pageSize=25
q=texto
sort=-createdAt,name
status=active,paused
ownerId=user_123
from=2026-07-01T00:00:00Z
to=2026-07-12T23:59:59Z
```

Reglas:

- `pageSize` tiene máximo configurable, por ejemplo 100.
- El backend valida campos de orden permitidos.
- Los filtros por fechas se interpretan en UTC y la UI muestra la zona del workspace.
- Los listados no devuelven relaciones completas por defecto.
- Para búsquedas globales usar un endpoint de búsqueda con límites y scopes, no recorrer todos los módulos en el frontend.

## Acciones de dominio

Una acción que cambia estado debe tener endpoint explícito si no es un CRUD claro:

```text
POST /api/forms/:id/publish
POST /api/opportunities/:id/move-stage
POST /api/agents/:id/publish
POST /api/import-batches/:id/commit
POST /api/exports/:id/cancel
```

El backend valida la transición, permisos, precondiciones e idempotencia.

## Idempotencia y jobs

Las operaciones externas o masivas aceptan `Idempotency-Key`.

Para un job:

```text
POST /api/scraping/jobs       → 202 + job
GET  /api/scraping/jobs/:id
POST /api/scraping/jobs/:id/cancel
```

Estados recomendados: `queued`, `running`, `succeeded`, `failed`, `cancelled`, `partially_succeeded`.

El frontend debe poder recuperar el estado tras recargar la página.

## Eventos internos

Usar nombres `dominio.entidad.acción` en pasado:

```text
lead.created
lead.qualified
form.submitted
campaign.published
conversation.message.received
automation.run.failed
agent.version.published
invoice.payment.confirmed
```

Payload mínimo:

```json
{
  "eventId": "evt_123",
  "type": "form.submitted",
  "organizationId": "org_123",
  "occurredAt": "2026-07-12T10:00:00.000Z",
  "actor": { "type": "user", "id": "usr_123" },
  "data": { "formId": "frm_123", "submissionId": "sub_123" }
}
```

## Webhooks externos

Cada webhook debe:

1. Validar firma antes de procesar.
2. Guardar recepción con `providerEventId`.
3. Responder rápido y procesar en background si es pesado.
4. Ser idempotente.
5. Registrar éxito, fallo y reintento.
6. No exponer payloads sensibles en logs normales.

## Contratos frontend

En `src/lib/api.js` cada recurso debe tener funciones pequeñas y predecibles:

```js
export const formsApi = {
  list: params => api.get('/forms', { params }),
  get: id => api.get(`/forms/${id}`),
  create: payload => api.post('/forms', payload),
  update: (id, payload) => api.patch(`/forms/${id}`, payload),
  publish: id => api.post(`/forms/${id}/publish`),
  remove: id => api.delete(`/forms/${id}`),
}
```

No meter llamadas HTTP directamente en JSX. Los componentes llaman a hooks o servicios y gestionan `loading`, `error`, `data` y `mutating`.

## Checklist de endpoint

- [ ] Tiene esquema de entrada y salida.
- [ ] Tiene autenticación y autorización.
- [ ] Filtra por `organizationId`.
- [ ] Tiene límites y paginación si lista.
- [ ] Valida estados y transiciones.
- [ ] Define códigos de error.
- [ ] Es idempotente cuando corresponde.
- [ ] Registra auditoría si modifica datos críticos.
- [ ] Tiene prueba feliz, validación, permiso y tenant.
