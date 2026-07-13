# Patrones UX y estados de pantalla

El objetivo es que todos los módulos se comporten igual. Un usuario debe aprender el patrón una vez y reutilizarlo en SEO, Formularios, Inbox, Oportunidades o Integraciones.

## Anatomy de un módulo

```text
AppShell
├── Sidebar de áreas
├── Topbar: búsqueda, crear, notificaciones, usuario
└── ModuleShell
    ├── Breadcrumb
    ├── ModuleHeader
    ├── ModuleTabs
    ├── FilterBar / SavedViews
    ├── MainView
    └── Drawers / Modals / Toasts
```

## ModuleHeader

Debe contener:

- nombre y descripción;
- estado o conexión si aplica;
- acción primaria;
- acciones secundarias;
- menú de más acciones;
- indicador de guardado/sin guardar en editores.

No colocar diez botones en el encabezado. Las acciones destructivas o infrecuentes van en un menú.

## Estados obligatorios

### Carga inicial

Usar skeletons que respeten la forma del contenido. No mostrar una tabla vacía antes de saber si está cargando.

### Vacío sin configuración

Explicar qué falta y ofrecer el siguiente paso:

```text
Todavía no hay una integración conectada.
[Conectar Google Business]
```

### Vacío sin resultados

Diferenciar “no hay datos” de “los filtros no encuentran datos”. Ofrecer limpiar filtros sin borrar la configuración.

### Error recuperable

Mostrar el mensaje, requestId si es útil para soporte y botón `Reintentar`.

### Error de permiso

Explicar que el usuario no tiene acceso y no mostrar acciones deshabilitadas sin contexto.

### Desconectado

Permitir ver el histórico, bloquear únicamente acciones que requieran conexión y mostrar `Conectar`.

### Guardado

Mostrar `Guardando`, `Guardado`, `Cambios sin guardar` y `Error al guardar`. No usar un toast como único indicador para formularios largos.

## Listas y tablas

Todas las listas deben incluir:

- búsqueda con debounce cuando sea remota;
- filtros por estado, propietario, fecha y etiquetas si aplica;
- orden explícito;
- paginación o infinite scroll con criterio claro;
- selección múltiple solo si hay acciones masivas reales;
- columnas configurables solo cuando la tabla lo necesite;
- exportación autorizada;
- estado vacío y error;
- navegación a ficha o drawer.

La fila no debe tener cinco acciones compitiendo. Dejar una acción primaria y un menú contextual.

## Filtros y vistas guardadas

Un filtro tiene:

```text
field
operator
value
label
```

Las vistas guardadas pertenecen a una organización o usuario y guardan versión del esquema de filtros. Si un campo deja de existir, la vista debe marcarse como incompatible y permitir repararla.

## Formularios

Reglas:

- validar en cliente para feedback rápido;
- validar siempre en backend;
- mantener valores si falla la petición;
- indicar campos obligatorios;
- no limpiar el formulario por un error;
- confirmar abandono si hay cambios sin guardar;
- soportar teclado y focus visible;
- asociar `label` e `input` correctamente;
- mostrar errores junto al campo y un resumen accesible.

## Drawers

Usar drawer para consultar o editar rápidamente un registro sin perder la lista.

Debe:

- bloquear el foco dentro del drawer;
- tener botón cerrar y escape;
- permitir abrir la ficha completa;
- conservar la URL o estado de lista si se cierra;
- evitar formularios demasiado largos;
- mostrar skeleton propio.

## Confirmaciones

Pedir confirmación para borrar, publicar, pausar campañas, enviar masivamente, descargar grabaciones, cambiar permisos o publicar un agente IA.

La confirmación debe explicar impacto y usar un verbo explícito:

```text
Publicar versión 4 del agente
Esta versión quedará disponible para llamadas nuevas.
[Cancelar] [Publicar versión]
```

## Toasts y notificaciones

Un toast sirve para confirmar una acción rápida, no para sustituir el estado persistente.

- Éxito: desaparece automáticamente.
- Error: permanece más tiempo y permite reintentar si es posible.
- Acción peligrosa: no ocultar el único feedback automáticamente.
- No apilar más de tres mensajes.

## Tiempo real

Inbox, Centralita, Monitor, jobs y ejecuciones pueden usar WebSocket/SSE.

El cliente debe tratar los eventos como parches idempotentes:

```text
eventId ya visto → ignorar
evento fuera de orden → reconciliar o volver a pedir recurso
desconexión → mostrar estado y reintentar con backoff
```

No asumir que la conexión en tiempo real es la fuente única; debe existir una lectura inicial REST.

## Accesibilidad

- Navegación completa por teclado.
- Focus visible.
- Dialogs con nombre, cierre y focus trap.
- Botones de icono con `aria-label`.
- No usar color como única indicación de estado.
- Contraste suficiente.
- Tablas con encabezados reales.
- Mensajes de error anunciables.
- Respeto de `prefers-reduced-motion`.

## Responsive

### Desktop

Sidebar visible, tablas amplias, panel de contexto a la derecha.

### Tablet

Sidebar colapsable, filtros en segunda fila, drawers más anchos.

### Móvil

Navegación en drawer, acciones primarias visibles, tablas convertidas en cards o scroll horizontal controlado, filtros en bottom sheet y editor por secciones.

No ocultar información crítica solo por ser móvil. Cambiar su presentación.

## Patrones específicos

### Inbox

Lista con estados no leídos, hilo con composer y contexto lateral. La respuesta debe mostrar estado de envío y fallo del proveedor.

### Kanban

Arrastre optimista solo si existe rollback claro. Al mover una oportunidad, mostrar error y devolverla a la etapa anterior si el servidor rechaza.

### Editor visual

Guardar borrador, autoguardado opcional, historial de versiones, preview y publicación separada.

### Dashboard

Cada widget debe tener loading independiente, rango temporal, fuente y estado sin datos. Un widget fallido no debe romper todo el dashboard.

## Checklist visual por pantalla

- [ ] Título y propósito claros.
- [ ] Acción primaria única.
- [ ] Carga, vacío, error y permiso.
- [ ] Responsive.
- [ ] Teclado y aria.
- [ ] Persistencia real de acciones.
- [ ] Feedback de guardado.
- [ ] Enlace a detalle/contexto.
- [ ] Sin números falsos presentados como datos reales.
