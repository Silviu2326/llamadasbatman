# Criterios de aceptación

## Arquitectura

- [ ] El sidebar tiene solo áreas de primer nivel y puede colapsarlas.
- [ ] Los módulos se describen en un registro único.
- [ ] Un módulo nuevo no requiere duplicar shell, filtros, tabla y estados.
- [ ] Los aliases antiguos siguen funcionando durante la migración.
- [ ] Los módulos desactivados no aparecen ni pueden abrirse por URL.

## Experiencia

- [ ] Toda lista tiene carga, vacío, error, paginación y búsqueda cuando aplique.
- [ ] Toda ficha tiene encabezado, acciones, tabs, timeline y permisos.
- [ ] Crear y editar usan el mismo formulario base.
- [ ] Las acciones destructivas piden confirmación.
- [ ] Las acciones persistentes muestran éxito o error real del servidor.
- [ ] Los botones de solo icono tienen `aria-label` o `title` útil.
- [ ] La experiencia funciona en móvil sin tablas imposibles de usar.

## Datos y backend

- [ ] Los modelos tienen `organizationId`, timestamps e índices adecuados.
- [ ] Las rutas validan entrada con Zod.
- [ ] Los controladores no contienen lógica de negocio compleja.
- [ ] Los servicios comprueban tenant y permisos.
- [ ] Las integraciones usan secretos cifrados y webhooks verificables.
- [ ] Las operaciones masivas son idempotentes o tienen control de duplicados.
- [ ] Los exports grandes se procesan en background.

## Calidad

- [ ] `npm run build` frontend pasa.
- [ ] `npm run build` backend pasa.
- [ ] Las migraciones Prisma se generan y aplican en entorno de prueba.
- [ ] Se prueban rutas principales y permisos.
- [ ] No hay secretos en Git.
- [ ] No se rompe ninguna ruta existente.
- [ ] Se documentan las decisiones y los endpoints nuevos.

## Definición de terminado para un módulo

Un módulo no se considera terminado por tener una pantalla. Debe tener:

1. Registro en navegación.
2. Feature flag y permisos.
3. Lista o dashboard inicial.
4. Ficha o drawer contextual si tiene entidad.
5. Modelo y migración, o justificación de reutilización.
6. API validada.
7. Estados de carga, vacío y error.
8. Auditoría de acciones críticas.
9. Pruebas mínimas.
10. Documentación de uso.

## Criterios específicos por área

### Captación

- [ ] Todo lead nuevo conserva fuente, canal y campaña cuando se conocen.
- [ ] Formularios públicos validan y limitan abuso.
- [ ] Importaciones muestran filas creadas, actualizadas, duplicadas y fallidas.
- [ ] Los datos SEO/ADS no se presentan como sincronizados si no hay proveedor conectado.
- [ ] Las audiencias pueden reutilizarse en más de una campaña.

### Conversación

- [ ] Cada mensaje tiene dirección, canal, proveedor y estado de entrega.
- [ ] Un hilo puede asignarse, cerrarse y reabrirse.
- [ ] Un fallo de proveedor no borra ni duplica mensajes.
- [ ] Grabaciones y transcripciones tienen permisos independientes.
- [ ] La bandeja funciona tras reconectar WebSocket o refrescar REST.

### Nutrición

- [ ] Las ejecuciones tienen identificador y log de pasos.
- [ ] Un reintento no duplica envíos ni tareas.
- [ ] Un contacto puede salir de una secuencia.
- [ ] Las preferencias de canal se respetan antes de enviar.
- [ ] El usuario puede entender por qué cambió el score.

### Ventas

- [ ] Lead, contacto, empresa y oportunidad comparten contexto.
- [ ] Mover una oportunidad genera actividad e historial.
- [ ] Presupuestos, contratos y cobros no aparecen como confirmados sin respuesta real.
- [ ] El forecast indica definición, fecha de corte y probabilidad.
- [ ] La comisión se calcula desde eventos auditados.

### Operaciones

- [ ] Números, IVR, colas y horarios tienen estados claros.
- [ ] El monitor diferencia conectado, degradado y desconectado.
- [ ] Las grabaciones no se exponen sin autorización.
- [ ] Una sesión en directo no impide consultar histórico.

### IA

- [ ] Cada agente tiene versión y estado.
- [ ] Publicar exige pruebas mínimas.
- [ ] Cambiar prompt/modelo/voz queda registrado.
- [ ] Las evaluaciones identifican versión y dataset.
- [ ] Se muestran coste, uso y errores.

### Analítica

- [ ] Cada métrica tiene definición y fuente.
- [ ] No hay widgets con números ficticios sin etiqueta.
- [ ] Los filtros de dashboard son consistentes.
- [ ] Exportaciones grandes son jobs cancelables.
- [ ] Los permisos se aplican también al export.

### Sistema

- [ ] Los permisos se prueban en backend.
- [ ] La conexión de integración no muestra secretos.
- [ ] Los webhooks registran recepción y resultado.
- [ ] Logs técnicos y auditoría no se mezclan.
- [ ] Suscripción y límites se reflejan en las acciones habilitadas.

## Rendimiento mínimo

- [ ] La lista inicial no carga relaciones innecesarias.
- [ ] Las búsquedas remotas tienen debounce y cancelación.
- [ ] Las tablas grandes tienen paginación o virtualización.
- [ ] Los dashboards cargan widgets de forma independiente.
- [ ] Los jobs pesados no bloquean una request HTTP.
- [ ] Las imágenes y grabaciones usan URLs protegidas y carga diferida.

## Criterios de rollout

- [ ] El módulo se puede activar por organización.
- [ ] Existe una forma de apagarlo sin despliegue urgente.
- [ ] Hay métrica de error y uso.
- [ ] Existe plan de migración de datos.
- [ ] Existe plan de rollback.
- [ ] El soporte sabe identificar el requestId y estado de integración.
