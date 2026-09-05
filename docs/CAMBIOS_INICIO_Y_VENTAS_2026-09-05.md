# Cambios en Inicio y Ventas

Fecha: 5 de septiembre de 2026

Repositorio: `Silviu2326/llamadasbatman`

Rama: `codex/actualizar-plataforma`

## Objetivo

Hacer que el usuario pueda entender qué ocurre en su negocio, decidir qué hacer y continuar el trabajo con un cliente sin perder su contexto al cambiar de página. Se han simplificado los textos y reducido los bloques que competían por la atención.

Este documento distingue las funciones implementadas de las comprobaciones que todavía requieren una sesión real. Subir el código a GitHub no acredita su despliegue en producción.

## 1. Inicio

Los cambios de Inicio se subieron en el commit `64023727b6b2577ca52d6c2bdb792af57f61fea6`.

### Organización

| Página | Para qué sirve |
| --- | --- |
| Resumen | Ver resultados recientes, objetivos del mes y asuntos que necesitan atención. |
| Plan y objetivos | Definir las metas, convertir recomendaciones en tareas y explorar estimaciones. |
| Análisis del negocio | Consultar los resultados del periodo y entender dónde mejoran o empeoran. |

### Resumen

- Pendientes priorizados y sin repeticiones, con enlaces a la pantalla donde resolverlos.
- Los primeros tres pendientes aparecen inicialmente; el resto se puede desplegar.
- Objetivos mensuales de ingresos y reuniones compartidos con Plan y objetivos.
- Actividad reciente basada en llamadas y reuniones registradas, con acceso a sus fichas.
- Primeros pasos para una organización que todavía no tiene actividad.
- Estados diferenciados para carga, errores, información parcial, listas recortadas y datos anteriores a una actualización fallida.
- Menos bloques y textos promocionales para facilitar la lectura diaria.

### Plan y objetivos

- Tres pestañas: **Objetivos**, **Plan de acción** y **Simulador**. Objetivos es la entrada inicial.
- Las metas se guardan para la organización y se utilizan también en Resumen.
- Las acciones sugeridas pueden convertirse en tareas asignadas al usuario actual, con fecha y acceso al calendario.
- El simulador permite ajustar presupuesto y tasas para explorar posibles resultados.
- Los cálculos se presentan como estimaciones y muestran si utilizan datos propios o supuestos de referencia.
- La diferencia entre ventas y coste de voz se identifica como tal; no se presenta como beneficio neto y se aclara que quedan otros gastos fuera.
- Las proyecciones avanzadas quedan desplegables.
- Cambiar los controles del simulador no provoca una petición al servidor por cada movimiento.
- Se cancelan peticiones obsoletas para evitar que una respuesta antigua sobrescriba una selección más reciente.

### Análisis del negocio

- Periodos de 7, 30 y 90 días, comparados con el periodo anterior de igual duración.
- Datos específicos para esta página, en lugar de reutilizar estadísticas generales que no correspondían al periodo elegido.
- Ventas atribuidas a su fecha real de cierre. Se advierte cuando faltan datos relevantes o existen importes en otras monedas fuera del total en euros.
- Evolución temporal con agrupación diaria, semanal o mensual según la vista.
- Comparación de campañas y agentes a partir de sus llamadas y reuniones vinculadas no canceladas, evitando contar varias veces una misma llamada.
- Avisos cuando una muestra es demasiado pequeña para extraer conclusiones sólidas.
- Distribución actual por etapa de las oportunidades creadas en el periodo, sin presentarla como un recorrido histórico del embudo.
- Motivos de pérdida por fecha de cierre, resultados de llamadas y sentimiento disponible.
- Consulta paginada de los registros que explican los resultados, con comprobación de organización, permisos y acceso al módulo correspondiente.
- Un fallo de carga no se representa como un resultado de cero ni se sustituye por datos de demostración.

## 2. Ventas

### Organización

| Página | Cambios principales |
| --- | --- |
| CRM | Contactos, empresas y oportunidades con acciones que conservan el contacto seleccionado. Incluye la pestaña Prioridades. |
| Calendario | Reuniones y tareas de la semana, con edición y finalización de tareas. |
| Llamadas | Búsqueda en el historial y conexión con contacto, agente, oportunidades y seguimientos. |
| Agentes IA | Se conserva la gestión ya implementada; se conecta su ficha desde el detalle de llamada. |
| Documentos y guiones | Nuevo nombre de Recursos IA, con pestañas Documentos y Guiones e información de sus asignaciones. |

### CRM

- Etiquetas más comprensibles: Contactos, Empresas y Oportunidades.
- **Llamar** abre una confirmación para la persona seleccionada. Abrirla no inicia la llamada.
- **Programar** permite crear una reunión con el contacto existente ya elegido, sin obligar a buscarlo otra vez ni crear un duplicado.
- En una empresa con varios contactos, se elige la persona con la que se quiere trabajar.
- Las llamadas utilizan el agente de la campaña del contacto. Si faltan teléfono, campaña o disponibilidad del servicio, se muestra el problema.
- **Programar seguimiento** crea una tarea vinculada al contacto y, cuando corresponde, a su oportunidad.
- El próximo paso procede de tareas abiertas reales. La ordenación utiliza su fecha, colocando primero las más antiguas y dejando al final las que no tienen fecha.
- Se consultan las páginas necesarias de cada origen de datos y se muestran 25 registros por página en la interfaz.
- Las búsquedas y la ordenación del CRM se aplican sobre la colección recibida completa, no únicamente sobre los primeros 50 registros de cada tipo.
- Si falla un origen, se identifica cuál y se advierte que la lista está incompleta. Una respuesta mal formada o una paginación incompleta no se trata como una colección vacía válida.
- Se cancelan las búsquedas anteriores cuando cambia el criterio.
- Las vistas predefinidas se llaman **Vistas de trabajo**. Se pueden guardar vistas propias con búsqueda, tipo, estado, responsable y ordenación, y eliminarlas después.
- Las vistas propias se guardan por usuario y organización en ese navegador; no se sincronizan entre dispositivos.
- Se ha retirado la indicación de un atajo de teclado que no correspondía al buscador del CRM.

### Calendario

- Las consultas se realizan para la semana seleccionada y recorren todas las páginas disponibles de reuniones y tareas.
- Se mantiene la posibilidad de alternar entre Semana y Agenda y de filtrar por tipo, estado o contacto.
- Las tareas se pueden editar y marcar como completadas desde su detalle lateral.
- Acceso a la ficha del contacto vinculado y al detalle de una reunión.
- El calendario contempla las 24 horas y coloca los eventos en intervalos de 15 minutos.
- Los eventos que coinciden se distribuyen en columnas dentro de su día.
- La vista semanal se desplaza hacia el primer evento disponible o hacia la mañana cuando no hay eventos.
- Se han eliminado textos explicativos que ocupaban espacio sin ofrecer una acción útil.
- El listado lateral se identifica como eventos de la semana, sin llamar futuros a eventos que ya han pasado.

### Llamadas y detalle de llamada

- La búsqueda por contacto, empresa, teléfono o correo se realiza en el servidor y abarca el historial, no solo la página visible.
- Los filtros Alta intención y De hoy también se aplican antes de paginar.
- La paginación utiliza el total del listado filtrado, en lugar del total histórico de las tarjetas de resumen.
- Se puede abrir el historial de un contacto mediante un enlace y quitar ese filtro desde la página.
- El selector para una nueva llamada consulta las páginas de contactos necesarias, superando el límite anterior de 50.
- El detalle permite abrir la ficha del contacto, consultar el agente, volver a llamar y programar una reunión.
- Se muestran las oportunidades vinculadas al contacto, con acceso a sus fichas.
- Se puede guardar un seguimiento general del contacto o vincularlo a una de sus oportunidades, con fecha y notas. La tarea queda disponible en el calendario.
- La confirmación de envío se describe como **llamada en cola**; no se equipara con una conversación ya iniciada o contestada.
- Se evita confirmar dos veces mientras una petición está en curso.

### Documentos y guiones

- Recursos IA pasa a llamarse **Documentos y guiones** en la navegación.
- Base de conocimiento y Playbooks se presentan como **Documentos** y **Guiones** en sus pestañas.
- Un apartado desplegable muestra los guiones asignados a campañas y los agentes correspondientes, con enlaces para consultar o modificar la configuración.
- Se explica que los documentos forman una biblioteca compartida de la organización.
- Se aclara el comportamiento actual de la voz: recibe extractos de hasta seis documentos activos con contenido, comenzando por los actualizados más recientemente. No todos los archivos se incorporan a cada llamada.
- Las asignaciones visibles no constituyen un registro de qué documentos se consultaron durante una llamada concreta.

### Prioridades

- La pestaña Inteligencia se renombra **Prioridades**.
- La primera sección es **A quién contactar**, con el motivo y la acción sugerida.
- **Pruebas comerciales** y **Mejoras pendientes** quedan en un bloque desplegable.
- La investigación del negocio se abre desde otro desplegable y solo carga su componente al abrirlo.
- Se han retirado el bloque introductorio promocional y expresiones como Orquestación o Memoria operativa de las secciones principales.
- Si falla la consulta de una sección, se informa de ello sin afirmar que no hay contactos, pruebas o mejoras pendientes.

## 3. Cambios de soporte

- Endpoints de Inicio para guardar objetivos y consultar el análisis y sus registros.
- Filtro de fechas de tareas ampliado para consultar el comienzo y el final de la semana, con validación de fechas y paginación.
- Filtros de contacto, búsqueda y alta intención en el listado de llamadas.
- Filtro de contacto en el listado de oportunidades, conservando las restricciones de organización y propietario aplicables.
- Componentes compartidos para preparar acciones con un contacto y crear o editar seguimientos.
- Mejora de accesibilidad del interruptor de formulario: se identifica como interruptor y comunica su estado.
- No se ha intervenido en las páginas de Más.

## 4. Comprobaciones realizadas

| Trabajo | Resultado | Alcance |
| --- | --- | --- |
| Inicio | 34 pruebas superadas en su entrega | 25 de utilidades/componentes y 9 de lógica o almacenamiento simulado. |
| Ventas | 14 pruebas superadas | 10 de utilidades y componentes; 4 de servicios y validación con almacenamiento simulado. |
| Compilación frontend | Correcta | El código de interfaz genera la aplicación. |
| Compilación backend | Correcta | El código del servidor supera la compilación de TypeScript. |
| Revisión del diff | Correcta | Sin errores detectados por `git diff --check`. |

Las pruebas de Ventas cubren la lectura de varias páginas, fallos de cargas posteriores, cancelación de peticiones, selección de próximos pasos, colocación de eventos coincidentes, contacto preseleccionado al crear reuniones, edición de tareas y restricciones de organización y propietario en las consultas comprobadas.

Para repetir las pruebas nuevas de Ventas:

```bash
# Desde la raíz del repositorio
node --test src/lib/salesWorkspace.test.mjs src/lib/salesRendering.test.mjs
npm run build

# Desde backend; las consultas de esta prueba están simuladas
NODE_ENV=test TEST_DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline node --import=tsx --test src/__tests__/salesCalendar.test.ts
npm run build
```

## 5. Validaciones pendientes

- Navegación e interacción visual en una sesión real, tanto en escritorio como en móvil. El navegador del entorno devolvió `ERR_BLOCKED_BY_CLIENT` al intentar abrir la aplicación local.
- Persistencia y lectura con una base de datos real para los recorridos nuevos. Las pruebas de almacenamiento citadas usan sustitutos controlados.
- Recorrido de telefonía real: preparar una llamada, comprobar que se procesa, revisar su resultado y guardar el seguimiento. No se han realizado llamadas reales durante estas comprobaciones.
- Confirmar el despliegue del frontend y del backend con los cambios de esta rama antes de validarlos en producción.

Por tanto, el estado de esta entrega es **implementado y comprobado mediante pruebas automatizadas y compilación**, con la validación visual y operativa pendiente.
