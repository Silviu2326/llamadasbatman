# Pruebas y observabilidad

La plataforma tendrá muchos módulos y proveedores externos. La calidad no puede depender de probar manualmente una pantalla después de cada cambio.

## Pirámide de pruebas

### Unitarias

Para reglas puras:

- normalización de emails/teléfonos;
- deduplicación;
- cálculo de score;
- transiciones de estado;
- filtros y orden;
- atribución;
- permisos;
- validadores Zod.

### Integración backend

Probar servicio + Prisma o repositorio de prueba:

- tenant correcto;
- permisos;
- creación y actualización;
- conflictos y duplicados;
- transiciones inválidas;
- auditoría;
- jobs y reintentos.

### Contrato API

Comprobar que respuestas y errores cumplen el contrato documentado. Versionar fixtures cuando el contrato cambie.

### Componentes frontend

Probar:

- render con datos;
- loading;
- vacío;
- error;
- permiso insuficiente;
- formulario válido/inválido;
- navegación y filtros;
- optimistic update con rollback.

### E2E

Cubrir solo flujos críticos, no cada combinación visual:

1. login y organización;
2. crear lead desde formulario;
3. convertir lead en oportunidad;
4. mover oportunidad y crear actividad;
5. responder conversación;
6. crear y publicar una automatización;
7. crear/probar/publicar agente IA;
8. exportar un informe autorizado;
9. intentar acceder a datos de otra organización.

## Matriz de pruebas por módulo

| Tipo | Mínimo |
| --- | --- |
| Navegación | ruta canónica, alias, permiso y 404 |
| Datos | lista, detalle, crear, editar, borrar/archivar |
| Estado | cada transición válida e inválida |
| Seguridad | tenant cruzado, rol sin permiso, secreto oculto |
| UX | loading, vacío, error, responsive, teclado |
| Integración | proveedor desconectado, timeout, reintento, webhook duplicado |
| Auditoría | acción crítica produce log |

## Smoke test obligatorio

Después de cada módulo:

```text
1. abrir ruta directa;
2. recargar navegador;
3. crear registro;
4. cerrar y volver a abrir;
5. verificar persistencia;
6. cambiar permiso;
7. repetir acción y esperar 403;
8. revisar timeline/auditoría;
9. comprobar móvil;
10. comprobar build.
```

## Logging estructurado

Cada request debe poder rastrearse con:

```text
requestId
organizationId
userId
route
method
statusCode
durationMs
```

Un error de proveedor añade `provider`, `operation`, `externalRequestId` y `retryable` si están disponibles.

No loguear tokens, cuerpos completos de mensajes, grabaciones, prompts privados ni números completos de tarjeta.

## Métricas técnicas

### API

- latencia p50/p95/p99;
- porcentaje 4xx/5xx;
- rate limit;
- timeouts;
- errores por endpoint y proveedor.

### Jobs

- jobs en cola;
- tiempo de espera;
- duración;
- éxito/fallo/reintentos;
- edad del job más antiguo.

### Conversación

- mensajes entrantes/salientes;
- latencia de respuesta;
- fallos por canal;
- conversaciones sin asignar;
- SLA incumplido.

### IA

- latencia;
- tokens/coste;
- tasa de error;
- transferencias a humano;
- evaluación media;
- cambios de versión.

## Alertas

Alertar cuando:

- la tasa 5xx supere el umbral;
- un proveedor externo falle repetidamente;
- una cola crezca sin consumo;
- un webhook tenga duplicados o firmas inválidas;
- aumenten los mensajes fallidos;
- un agente tenga errores o transferencias anómalas;
- una exportación quede bloqueada;
- existan intentos de acceso cruzado.

## Observabilidad funcional

Además de logs técnicos, registrar eventos de producto:

```text
module_opened
record_created
record_updated
record_archived
filter_applied
export_requested
integration_connected
automation_run_started
automation_run_failed
agent_published
```

No usar analítica de producto para sustituir auditoría de seguridad. Son propósitos y retenciones diferentes.

## Diagnóstico desde UI

El usuario con permiso de soporte debe poder ver:

- estado de integración;
- última sincronización;
- último error resumido;
- requestId;
- historial de jobs;
- reintentar o desconectar según permiso.

No mostrar stack trace a usuarios finales.

## Definition of Done técnica

- [ ] Hay pruebas unitarias de reglas nuevas.
- [ ] Hay prueba de servicio con tenant y permisos.
- [ ] Hay smoke test del flujo principal.
- [ ] Hay logs con requestId.
- [ ] Hay métricas o al menos eventos del dominio.
- [ ] Hay estados de proveedor desconectado y timeout.
- [ ] Se ha comprobado la recuperación tras recargar.
- [ ] El build frontend y backend pasa.
