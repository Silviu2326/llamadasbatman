# Captación: guía funcional detallada

## Cómo leer este documento

Este documento describe las ocho páginas que forman el grupo **Captación** de la plataforma. Está escrito para una persona que conoce el negocio y los objetivos del producto, pero todavía no ha recorrido la aplicación.

La navegación visible se define en `src/components/Sidebar.jsx` y las rutas protegidas se registran en `src/App.jsx`. El grupo contiene:

| Página | Ruta principal | Problema que resuelve |
|---|---|---|
| Dashboard | `/dashboard` | Saber qué está ocurriendo en el conjunto del sistema comercial. |
| Campañas | `/campanas` | Organizar iniciativas de captación y llevarlas hasta una conversación o reunión. |
| Ads | `/ads` | Medir y operar campañas de Meta Ads con datos de snapshots. |
| Redes sociales | `/redes-sociales` | Planificar contenido orgánico con Metricool y conectarlo con campañas y landings. |
| Prospect Finder | `/prospectos` | Encontrar negocios potenciales por sector y zona e importarlos al CRM. |
| Landings & webs | `/landings` | Crear y controlar los destinos donde el tráfico se convierte en lead. |
| Funnels | `/funnels` | Medir las transiciones entre visita, lead, contacto y reunión. |
| Organic Leads | `/organic` | Detectar y activar demanda orgánica procedente de búsqueda y presencia digital. |

### Niveles de evidencia

- **Comprobado en código**: comportamiento visible en los componentes, rutas, controladores, servicios o modelos revisados.
- **Comprobado, condicionado**: existe el flujo de integración, pero su resultado depende de una cuenta, API, variable de entorno, plan contratado o datos reales.
- **Pendiente / no implementado en esta superficie**: la interfaz deja el espacio preparado o muestra un estado honesto, pero no existe todavía el flujo completo.

La autorización de la interfaz sólo oculta o muestra enlaces. La autorización real se ejecuta en el backend mediante JWT, permisos y scope `org`. Por tanto, que un enlace aparezca en la sidebar no sustituye la comprobación del endpoint.

## Recorrido recomendado de Captación

La propia interfaz utiliza `CaptureJourney` para contar una secuencia de cuatro momentos:

1. **Planificar**: Campañas y objetivos.
2. **Atraer**: Ads, Redes sociales y Prospect Finder.
3. **Convertir**: Landings y formularios.
4. **Cerrar**: Funnels, llamadas y reuniones.

El recorrido no es una única transacción técnica. Es una relación funcional entre `Campaign`, `Lead`, `AcquisitionEvent`, snapshots de Ads, landings públicas y datos de CRM. Algunas páginas ya comparten estos datos; otras presentan el punto de entrada para una integración externa.

---

## 1. Dashboard

### Propósito y problema que resuelve

El Dashboard es la pantalla de entrada operativa. Responde a la pregunta: **“¿Cómo está funcionando hoy el sistema comercial?”**. Reúne volumen de llamadas, leads, reuniones, conversión, pipeline, ingresos atribuidos y ROI en una misma vista.

Su utilidad no es gestionar una campaña concreta, sino detectar rápidamente si hay actividad, si el embudo está avanzando y dónde merece la pena profundizar.

### Usuarios

- Dirección comercial o de revenue que necesita una lectura transversal.
- Revenue Operations, para revisar el rendimiento agregado.
- Analistas, para exportar métricas y comparar periodos.
- Usuarios con permiso `dashboard.read`.

### Ruta y precondiciones

- Ruta protegida: `/dashboard`.
- La raíz `/` redirige a `/dashboard`.
- El enlace se muestra si `canNavigateTo(user, '/dashboard')` encuentra `dashboard.read`.
- El endpoint también exige autenticación y `dashboard.read` con scope `org`.
- No requiere una integración externa concreta para renderizar la pantalla, pero los resultados dependen de que existan datos de llamadas, leads, reuniones, campañas, oportunidades y snapshots.

### Estructura visual

1. Cabecera de bienvenida con el estado operativo del equipo.
2. Selector de rango de fechas.
3. Selector de comparación: sin comparación, semana anterior, mes anterior o año anterior.
4. Exportación CSV de los KPI visibles.
5. Botón de modo edición.
6. Fila de KPI:
   - llamadas realizadas;
   - leads contactados;
   - reuniones agendadas;
   - tasa de conversión;
   - pipeline generado;
   - ingresos atribuidos;
   - ROI del sistema.
7. Fila de widgets configurable mediante `react-grid-layout`.
8. Widgets de rendimiento, ingresos, embudo, agentes, sentimiento y actividad, según la configuración activa.

### Datos de entrada

**Controles de usuario comprobados:**

- fechas inicial y final del selector;
- periodo comparativo;
- orden de los KPI;
- widgets activos/inactivos;
- posiciones y tamaño de widgets.

**Datos recibidos del backend:**

`GET /api/dashboard/stats` devuelve totales, series de siete días, embudo de leads, llamadas por campaña, pipeline por día, ranking de agentes, sentimiento, plan de la organización y estados de conexión de Resend/Metricool.

El servicio calcula los datos a partir de `Call`, `Lead`, `Meeting`, `Campaign`, `Opportunity`, `AdInsightSnapshot`, `Agent` y `Organization`.

### Acciones principales

- Cambiar el rango visual.
- Elegir comparación.
- Exportar los KPI a CSV.
- Entrar en modo edición.
- Reordenar KPI.
- Añadir, quitar, mover y redimensionar widgets.
- Restablecer el layout desde el panel de edición.
- Profundizar en las páginas operativas enlazadas por cada widget.

### Resultado

El usuario obtiene una lectura agregada del estado comercial y puede pasar de una señal global a una página especializada: campañas, leads, pipeline, llamadas o reuniones.

### Estados loading, empty y error

- **Loading comprobado:** existe el estado `loading` mientras se consulta el endpoint.
- **Carga/error comprobada:** si la petición falla, la interfaz muestra “API desconectada” y conserva KPIs vacíos. `MOCK_STATS` y `MOCK_KPI` solo se usan cuando `VITE_DATA_MODE=demo|preview` o `VITE_ALLOW_DEMO_DATA=true`, con indicador “Datos demo activos”.
- **Empty:** no hay un estado vacío específico que diferencie una organización sin datos de una organización con datos reales en cero.
- **Error:** en modo live el error permanece visible y no se sustituye por datos demo; en modo demo explícito se permite explorar la interfaz con el indicador persistente.

### Permisos

- Frontend: `dashboard.read` para mostrar el enlace.
- Backend: `dashboard.read`, scope `org`, en `/api/dashboard/stats` y `/api/dashboard/activity`.
- El servicio calcula siempre por el `orgId` del JWT.

### APIs, modelos y dependencias

**APIs usadas por la página:**

- `GET /api/dashboard/stats`.
- El componente importa `apiFetch`; la ruta de actividad existe en backend, aunque la carga principal revisada usa `stats`.

**Modelos/servicios comprobados:**

- `dashboard.controller.ts`.
- `dashboard.service.ts`.
- `Campaign`, `Lead`, `Call`, `Meeting`, `Opportunity`, `AdInsightSnapshot`, `Agent`, `Organization`.

**Dependencias de UI:**

- `react-grid-layout` para la composición editable.
- Componentes de KPI, gráficas y widgets del directorio `src/components/dashboard`.
- `DateRangePicker`, `ExportDropdown` y `useDashboardLayout`.

### Navegación relacionada

- Desde el Dashboard se debe poder continuar hacia Campañas para actuar sobre una iniciativa.
- Pipeline y Leads explican el valor y el estado de las oportunidades.
- Llamadas y Reuniones explican la actividad que alimenta la conversión.
- Ads añade gasto y snapshots a la lectura global.

### Riesgos y pendientes

- El selector de fechas y el selector de comparación se mantienen en estado local y no se envían al endpoint en el código revisado; por tanto, la lectura visible no queda filtrada por esas selecciones.
- El fallback demo puede confundirse con datos reales si no se conserva el indicador de demo.
- No hay un estado vacío diferenciado para una organización nueva.
- El ROI sólo es real cuando existen gasto de `AdInsightSnapshot` e ingresos de oportunidades ganadas.
- La ruta `/api/dashboard/activity` existe, pero no forma parte del flujo principal observado.

### Checklist de aceptación

- [ ] Un usuario con `dashboard.read` ve `/dashboard`.
- [ ] Un usuario sin `dashboard.read` no ve el enlace y el endpoint devuelve autorización denegada.
- [ ] Los KPI reales coinciden con los agregados del backend.
- [ ] Un fallo de API se identifica claramente como demo o error.
- [ ] Las fechas modifican realmente la consulta o se elimina la expectativa de filtrado.
- [ ] Exportar produce un CSV con los valores actualmente visibles.
- [ ] El layout personalizado persiste y puede restablecerse.
- [ ] La organización sin datos no recibe cifras ficticias sin una etiqueta inequívoca.

---

## 2. Campañas

### Propósito y problema que resuelve

Campañas es el workspace central de planificación de captación. Resuelve el problema de tener iniciativas dispersas sin un objetivo, presupuesto, estado o vínculo claro con leads y reuniones.

Una campaña es también la frontera de atribución: los leads, llamadas, reuniones, landings, eventos de adquisición y objetos remotos de Meta pueden quedar asociados a su `campaignId`.

### Usuarios

- Marketing y Growth, para crear y activar iniciativas.
- Revenue Operations, para controlar estados y atribución.
- Equipo comercial, para consultar el contexto de una campaña.
- Analistas, para revisar mezcla de canales y conversión.

### Ruta y precondiciones

- Listado: `/campanas`.
- Detalle: `/campanas/:id`.
- Compartición pública: `/campanas/compartir/:token`.
- La sidebar exige `campaigns.read` para el listado.
- Crear, editar, iniciar, pausar, duplicar o compartir requiere permisos de escritura/publicación según la acción.
- La campaña puede existir sin landing, Ads, redes sociales o Prospect Finder; esas conexiones se añaden después.

### Estructura visual

1. Cabecera orientada a resultado: lanzar campañas, convertir interés y llevarlo a reunión.
2. Acciones de “Ver funnel” y “Nueva campaña”.
3. Resumen lateral con embudo de conversión y mezcla de canales.
4. Pestañas por estado: todas, borradores, activas, pausadas y finalizadas.
5. Buscador con debounce de 350 ms.
6. Lista paginada de campañas.
7. Cada fila muestra nombre, tipo detectado, estado, leads, contactados, reuniones, presupuesto/actividad y acciones rápidas.
8. Modal de creación.

### Datos de entrada

El modal de creación solicita:

- nombre obligatorio;
- objetivo opcional;
- presupuesto estimado en euros, convertido a `budgetCents`.

El backend acepta además agente, playbook, fechas, objetivo principal, `settings`, `landingSlug` y `adAssets` para otros flujos.

El listado recibe filtros de página, límite, estado y búsqueda a través de `GET /api/campaigns`.

### Acciones principales

- Crear campaña como borrador.
- Filtrar por estado.
- Buscar por texto.
- Activar una campaña.
- Pausar una campaña.
- Abrir `/campanas/:id`.
- Ir a Funnels.

En el detalle de campaña se añaden:

- edición de nombre, objetivo, goal y presupuesto;
- pestaña Resumen;
- gestión de Meta Ads;
- configuración de scoring, alertas, contenido orgánico y frecuencia;
- duplicación;
- creación de enlace público;
- exportación de informe;
- lectura de actividad;
- actualización de landing.

### Resultado

La campaña queda persistida como workspace reutilizable. Puede recibir leads, eventos de adquisición, llamadas, reuniones, assets, snapshots publicitarios y publicaciones sociales atribuidas.

### Estados loading, empty y error

- **Loading:** el listado muestra “Cargando campañas…” y el detalle tiene una pantalla de carga.
- **Empty:** sin coincidencias muestra “No hemos encontrado campañas”; sin campañas permite crear la primera.
- **Error:** el listado muestra reintento; el detalle distingue campaña no encontrada de fallo de conexión.
- **Detalle Meta:** carga por separado y puede mostrar que los objetos remotos aún están pendientes.
- **Contenido:** la pestaña de contenido declara explícitamente que la asociación de piezas todavía no está disponible.

### Permisos

- Listado/detalle/stats/actividad: `campaigns.read`, scope `org`.
- Crear/editar/landing/duplicar/compartir: `campaigns.write`, scope `org`.
- Iniciar/pausar publicación: `campaigns.publish`, scope `org`.
- El backend filtra siempre por `orgId` del JWT.

### APIs, modelos y dependencias

**APIs del listado:**

- `GET /api/campaigns`.
- `POST /api/campaigns`.
- `POST /api/campaigns/:id/start`.
- `POST /api/campaigns/:id/pause`.

**APIs del detalle:**

- `GET /api/campaigns/:id`.
- `PUT /api/campaigns/:id`.
- `PUT /api/campaigns/:id/landing`.
- `GET /api/campaigns/:id/stats`.
- `GET /api/campaigns/:id/activity`.
- `POST /api/campaigns/:id/audit-bulk`.
- `POST /api/campaigns/:id/duplicate`.
- `POST /api/campaigns/:id/share-link`.
- `GET/POST /api/ads/campaigns/:id/...` para Meta Ads.

**Modelos comprobados:**

- `Campaign` como entidad principal.
- `Lead`, `Call`, `Meeting`, `AcquisitionEvent` y `Opportunity` como datos relacionados.
- `AdInsightSnapshot` para medición publicitaria.
- `AdPlaybook` y `Playbook` para plantillas o operación.
- `OrganicOpportunity` como relación opcional con demanda orgánica.

### Navegación relacionada

- Ads usa campañas para publicar y medir.
- Redes sociales exige una campaña y una landing publicada antes de crear un borrador.
- Landings crea o actualiza el destino de la campaña.
- Prospect Finder importa negocios a una campaña outbound.
- Funnels agrega visitas, leads, contactos y reuniones por campaña.
- El detalle de campaña conecta con Meta, contenido, Organic y la vista pública.

### Riesgos y pendientes

- El tipo de campaña se infiere desde `settings`, playbooks o IDs de Meta; no es un campo de dominio único.
- La mezcla de canales se calcula sobre la página de estadísticas local, no necesariamente sobre todas las campañas si el límite configurado no cubre el universo.
- El contenido de campaña está preparado visualmente pero declara no estar conectado.
- Iniciar/pausar desde el listado cambia el estado de campaña; publicar en Meta es otra operación y depende de la cuenta Meta y sus permisos.
- El enlace público debe mantener sólo campos seguros; no debe exponer configuración interna ni datos sensibles.

### Checklist de aceptación

- [ ] Crear una campaña sólo requiere nombre y genera un borrador válido.
- [ ] La campaña queda aislada por organización.
- [ ] La búsqueda, filtro y paginación no mezclan resultados.
- [ ] Activar y pausar actualiza la campaña y comunica el fallo.
- [ ] Una campaña sin landing se identifica como pendiente para Social/Funnels.
- [ ] El detalle permite distinguir datos CRM de estado remoto Meta.
- [ ] Duplicar no duplica leads, eventos ni secretos.
- [ ] El enlace público sólo expone el resumen permitido.

---

## 3. Ads

### Propósito y problema que resuelve

Ads es la vista de operación de publicidad de pago. Resuelve la falta de relación entre gasto, leads, CPL, CTR, estado de campaña y acción de optimización.

La página no pretende ser un gestor publicitario genérico: trabaja sobre campañas del CRM que tienen señales de Ads —`adStatus`, `adPlaybookId` o `metaCampaignId`— y sobre snapshots guardados en la plataforma.

### Usuarios

- Marketing y Growth, para crear, publicar y ajustar anuncios.
- Revenue Operations, para vigilar CPL y conexión con campaña.
- Dirección, para revisar gasto y leads medidos.
- Analistas, para leer la serie histórica.

### Ruta y precondiciones

- Operación: `/ads`.
- Laboratorio de creación: `/captacion/nueva`.
- Cuenta Meta: `/captacion/conectar`.
- `/ads` requiere `ads.read`.
- Publicar, activar o usar operaciones de proveedor requiere `ads.write` y `costs.request`.
- Pausar y ajustar límites requiere `ads.write`.
- Para ver métricas reales debe existir una cuenta Meta conectada y snapshots sincronizados.

### Estructura visual

1. Cabecera con actualización y nueva campaña.
2. Journey de Captación en fase “Atraer”.
3. Banda de estado de Meta: conectado o sin conectar.
4. KPI de campañas activas, gasto actual, CPL y CTR.
5. Lista de campañas con filtros de todas, activas y pausadas.
6. Rail de inteligencia:
   - optimización automática;
   - campaña seleccionada;
   - acción de publicar, activar, pausar o sincronizar.
7. Gráfica de gasto y leads a partir de snapshots diarios.
8. Selector de dirección creativa con tres visuales conceptuales.

### Datos de entrada

En `/ads`, la selección de campaña y el filtro son estados locales.

En `/captacion/nueva`, el usuario puede introducir:

- vertical;
- objetivo;
- presupuesto mensual;
- audiencia;
- variante creativa;
- recomendaciones de estrategia.

El laboratorio guarda un borrador local y consulta también `GET /api/ads/draft`. El servidor acepta strategy, presupuesto y variante creativa.

En `/captacion/conectar`, la configuración de Meta incluye:

- inicio OAuth;
- tope diario en euros, persistido como céntimos;
- Pixel ID.

### Acciones principales

- Actualizar el overview.
- Filtrar campañas.
- Seleccionar una campaña.
- Aplicar el límite de CPL recomendado.
- Publicar borrador en Meta.
- Activar o pausar en Meta.
- Sincronizar estado remoto.
- Abrir el detalle de campaña.
- Crear una nueva campaña desde el laboratorio.
- Conectar o desconectar la cuenta Meta.
- Guardar el tope diario y Pixel ID.

### Resultado

El resultado esperado es una campaña que puede pasar de borrador a objeto remoto Meta, recibir snapshots y permitir una acción de control basada en CPL.

La recomendación visible no inventa una optimización: el backend elige la campaña cuyo último CPL es mayor y propone un límite basado en ese snapshot.

### Estados loading, empty y error

- **Loading:** “Cargando operación de Ads…”.
- **Empty sin cuenta:** invita a conectar Meta.
- **Empty con cuenta:** invita a crear una campaña desde el laboratorio.
- **Empty de snapshots:** muestra “Sin medición” para gasto/CPL/CTR y no dibuja una serie ficticia.
- **Error overview:** ofrece reintentar.
- **Error de acción Meta:** muestra aviso de que Meta no pudo completar la operación.
- **Cuenta no conectada:** `/captacion/conectar` muestra CTA de OAuth.
- **Cuenta conectada:** muestra IDs, estado, fecha, límite y Pixel ID.

### Permisos

- Lectura: `ads.read`, scope `org`.
- Estrategia/wizard/publicación/activación: `ads.write` + `costs.request`.
- Pausa y max-CPL: `ads.write`.
- Meta account: sus rutas tienen permisos de cuentas/integraciones y validación del tenant.

### APIs, modelos y dependencias

**APIs `/ads`:**

- `GET /api/ads/overview`.
- `GET /api/ads/draft`.
- `PUT /api/ads/draft`.
- `POST /api/ads/strategy`.
- `POST /api/ads/wizard`.
- `GET /api/ads/campaigns/:id/status`.
- `GET /api/ads/campaigns/:id/insights`.
- `GET /api/ads/campaigns/:id/remote-status`.
- `PUT /api/ads/campaigns/:id/max-cpl`.
- `POST /api/ads/campaigns/:id/publish`.
- `POST /api/ads/campaigns/:id/activate`.
- `POST /api/ads/campaigns/:id/pause`.

**APIs de cuenta Meta:**

- `GET /api/meta/accounts`.
- `GET /api/meta/accounts/oauth/start-url`.
- `PUT /api/meta/accounts/:id/budget-cap`.
- `PUT /api/meta/accounts/:id/pixel-id`.
- `DELETE /api/meta/accounts/:id`.

**Modelos comprobados:**

- `Campaign`.
- `MetaAdAccount`.
- `AdWizardDraft`.
- `AdInsightSnapshot`.
- `AdPlaybook`.

**Dependencias externas:**

- Meta Marketing API y OAuth para objetos remotos.
- `META_*`/secretos de Meta configurados en backend.
- Servicio de IA para estrategia si está disponible; existe un fallback determinista en `adsStrategy.service.ts`.
- Jobs de snapshots e insights para que aparezcan datos históricos.

### Navegación relacionada

- Campañas es la entidad CRM que Ads opera.
- `/captacion/nueva` crea el brief que alimenta la campaña.
- `/captacion/conectar` resuelve la cuenta Meta.
- Landings define el destino de conversión.
- Funnels mide el recorrido posterior.
- Campaña detalle contiene el panel de Meta Ads y sus IDs remotos.

### Riesgos y pendientes

- Sin credenciales Meta no existe publicación real.
- Sin snapshots, los KPI no representan una ventana de rendimiento aunque la campaña exista.
- La dirección creativa visual es una guía de producto; no equivale a un asset publicitario remoto.
- Hay que comprobar que jobs y webhooks de Meta actualicen snapshots y estados de forma idempotente.
- El laboratorio contiene presets y una estrategia determinista; en producción el fallo del servicio no genera proyecciones locales. Los presets y el fallback de estrategia solo se habilitan en modo demo explícito, y cualquier estimación debe distinguirse siempre de una previsión validada por Meta.
- El tope diario sólo es seguro si la operación de pausa automática está conectada al job que lo evalúa.

### Checklist de aceptación

- [ ] Una cuenta no conectada nunca se presenta como activa.
- [ ] Gasto, CPL y CTR muestran “Sin medición” cuando no hay snapshot.
- [ ] Publicar requiere permiso y cuenta Meta válida.
- [ ] La acción de publicar/activar/pausar actualiza estado local y remoto o muestra el motivo.
- [ ] El max-CPL recomendado se calcula a partir de datos reales.
- [ ] El presupuesto diario se guarda en céntimos sin pérdida de precisión.
- [ ] El Pixel ID queda asociado a la cuenta correcta.
- [ ] Un fallo de IA no bloquea el laboratorio, pero el fallback se identifica.

---

## 4. Redes sociales

### Propósito y problema que resuelve

Redes sociales resuelve la operación de posts orgánicos sin duplicar dentro de VozIA todo el calendario editorial de un proveedor especializado. La plataforma aporta contexto de campaña, generación de contenido, atribución y enlace a la landing; Metricool gestiona la planificación/publicación de los canales.

El objetivo funcional es pasar de “quiero publicar algo” a “tengo un borrador por canal, conectado a una campaña y a un destino medible”.

### Usuarios

- Marketing y Growth.
- Content managers.
- Revenue Operations, para asegurar atribución.
- Usuarios de una organización con la función social habilitada.

### Ruta y precondiciones

- Ruta: `/redes-sociales`.
- La sidebar exige `social.read`.
- El backend además comprueba que la organización tenga plan `completo` y `metricoolEnabled`.
- Para crear posts se necesita `social.write`.
- Conectar Metricool requiere `integrations.manage`.
- La operación de generar plan de contenido requiere `social.write` y `costs.request`.
- Para crear un borrador es obligatorio seleccionar una campaña con `landingSlug`.

### Estructura visual

1. Cabecera y journey en fase “Atraer”.
2. Bloque de conexión con Metricool.
3. Lista de perfiles/canales conectados cuando el proveedor los devuelve.
4. Embed del planificador si existe URL embebida; en caso contrario, enlace externo.
5. Panel de métricas reportadas por Metricool.
6. Copiloto de contenido:
   - campaña de destino;
   - CTA;
   - brief;
   - tono;
   - fecha de inicio;
   - canales de salida.
7. Resultado del plan con posts por plataforma y acción “Crear borrador”.

### Datos de entrada

**Conexión y estado:** los datos proceden de `/api/metricool` y de la configuración del proveedor.

**Plan de contenido:**

- `prompt` de 3 a 4.000 caracteres;
- canales seleccionados, entre Instagram, LinkedIn, Facebook, TikTok, YouTube y X;
- tono cercano, experto, inspirador o directo;
- fecha de inicio opcional.

**Borrador:**

- texto;
- plataforma;
- campaña;
- CTA;
- fecha sugerida.

### Acciones principales

- Consultar estado de Metricool.
- Conectar Metricool.
- Abrir el planificador embebido o externo.
- Consultar analytics.
- Seleccionar campaña.
- Generar plan con IA.
- Descartar plan.
- Crear borrador por canal.
- Volver a Landings si la campaña no tiene destino.

### Resultado

Un post queda creado en Metricool con la campaña y la landing de destino. El backend genera URL con atribución y UTMs por canal mediante `metricoolSync.service.ts`; además marca el canal `organic_social` en la configuración de la campaña.

### Estados loading, empty y error

- **Loading inicial:** “Cargando redes sociales…”.
- **Gated:** si el plan o `metricoolEnabled` no permiten la funcionalidad, aparece una pantalla de plan completo.
- **Sin conectar:** invita a configurar Metricool.
- **Conectado sin perfiles:** el backend puede responder conectado sólo cuando encuentra perfiles; si no hay perfiles, permanece sin conexión.
- **Sin analytics:** la página explica que aparecerán cuando Metricool reporte actividad.
- **IA no disponible:** el resultado puede marcar `generatedBy: 'fallback'` y mostrarse como borrador automático.
- **Sin campaña:** el botón de crear borrador está bloqueado.
- **Campaña sin landing:** muestra warning y enlace a Landings.
- **Error de conexión/generación/post:** se muestra toast y no se fabrican métricas.

### Permisos

- Estado: `integrations.read` y validación de plan.
- Conectar: `integrations.manage` y configuración válida del proveedor.
- Analytics: `social.read`.
- Crear posts: `social.write`.
- Generación IA: `social.write` + `costs.request`.
- La organización debe tener `metricoolEnabled` y plan `completo` según el backend comprobado.

### APIs, modelos y dependencias

**APIs Metricool:**

- `GET /api/metricool`.
- `POST /api/metricool/connect`.
- `GET /api/metricool/analytics`.
- `POST /api/metricool/posts`.
- `POST /api/metricool/ai/generate`.

**APIs relacionadas:**

- `GET /api/campaigns?page=1&limit=100` para seleccionar campaña.
- `GET /api/landings` no existe como endpoint propio en la superficie revisada; Landings lee campañas y Funnels.

**Modelos comprobados:**

- `Campaign` y su `settings` para atribución/canales.
- `AcquisitionEvent` para la medición posterior.
- `Organization` para plan y `metricoolEnabled`.

**Dependencias externas:**

- Metricool: `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID`.
- URL pública de frontend/backend para generar enlaces atribuidos.
- Proveedor de IA, si está configurado; si no, fallback determinista.

### Navegación relacionada

- Campañas: seleccionar el workspace de atribución.
- Landings: crear el destino obligatorio.
- Ads: distinguir demanda pagada de orgánica.
- Organic Leads: recibir o preparar demanda de búsqueda, aunque la publicación social se opera aquí.
- Funnel: verificar si los posts llevan a visitas, leads y reuniones.

### Riesgos y pendientes

- “Conectar Metricool” no es un OAuth por red social: el backend depende de token, user ID y blog ID configurados.
- El embed puede no estar disponible; el flujo alternativo es un enlace externo.
- Un borrador se crea en el proveedor, pero la plataforma debe comprobar que la respuesta y el estado remoto se sincronizan correctamente.
- El código no implementa aquí un calendario editorial propio; la fuente de verdad de planificación es Metricool.
- `APP_URL`/`FRONTEND_URL` públicos son necesarios para que las UTMs y links sean utilizables.
- La IA genera planes y recomendaciones, no publicación automática sin revisión.

### Checklist de aceptación

- [ ] Una organización no elegible ve el motivo de bloqueo.
- [ ] Metricool no se muestra conectado si no devuelve perfiles válidos.
- [ ] El plan generado indica si procede de IA o fallback.
- [ ] No se puede crear post sin campaña.
- [ ] No se puede crear post sin landing publicada.
- [ ] Cada post conserva plataforma, CTA, fecha sugerida y campaña.
- [ ] El link generado contiene atribución por canal.
- [ ] Analytics vacío no se reemplaza por cifras de demostración.

---

## 5. Prospect Finder

### Propósito y problema que resuelve

Prospect Finder convierte una búsqueda comercial amplia —sector + ciudad— en una lista accionable de negocios. Resuelve el trabajo manual de localizar empresas, revisar señales básicas, seleccionar las mejores e importarlas al CRM con una campaña de destino.

Es un flujo outbound y no debe confundirse con Organic Leads: aquí se buscan negocios desde una consulta de prospección; no se atribuye una búsqueda de un usuario final en Google.

### Usuarios

- SDR/BDR y equipos de prospección.
- Ventas outbound.
- Revenue Operations.
- Marketing Growth cuando construye listas de cuentas.

### Ruta y precondiciones

- Ruta: `/prospectos`.
- La sidebar exige `leads.write` y `costs.request`, porque buscar/importar consulta proveedores y puede generar costes.
- El backend también exige autenticación.
- Para importar debe existir una campaña perteneciente a la misma organización.
- Para enriquecer se necesita que el prospecto tenga web y que el servicio de auditoría pueda ejecutarse.
- Para llamadas automáticas se necesita que el sistema de llamadas esté disponible.

### Estructura visual

1. Cabecera de inteligencia comercial.
2. Indicador de motor listo y número de resultados.
3. Journey en fase “Atraer”.
4. Formulario de búsqueda:
   - sector;
   - ciudad/zona;
   - botón de búsqueda.
5. Feedback de error o resultado vacío.
6. Tabla de resultados con score de oportunidad, negocio, reputación, contacto y acciones.
7. Filtros:
   - orden por score u otras señales;
   - rating mínimo;
   - reseñas mínimas;
   - sin web;
   - con teléfono.
8. Exportación CSV.
9. Flujo de importación:
   - selección múltiple;
   - campaña obligatoria;
   - crear nueva campaña outbound;
   - auditar al importar;
   - activar llamada;
   - importar seleccionados.

### Datos de entrada

**Búsqueda:** `sector`, `city` y opcionalmente `country` en backend.

**Resultado externo:**

- `placeId`;
- nombre;
- dirección;
- teléfono;
- web;
- rating;
- número de reseñas;
- URL de Google Maps;
- número de fotos;
- `quickScore`.

El `quickScore` es una estimación barata basada sólo en datos de Places: sube si falta la web, falta rating/reseñas o la reputación es baja. No es una auditoría completa del negocio.

**Importación:** campaña, sector, ciudad, `enrich`, `autoAudit`, `autoCall` e items seleccionados.

### Acciones principales

- Buscar por sector y ciudad.
- Ordenar y filtrar resultados.
- Seleccionar uno, varios o todos los resultados visibles.
- Exportar la lista visible a CSV.
- Crear una campaña outbound y seleccionarla automáticamente.
- Auditar la web al importar.
- Encolar llamada al importar.
- Importar prospectos al CRM.

### Resultado

La importación crea `Lead` con fuente `prospecting`, empresa, teléfono y `customFields` con señales del negocio. También crea o actualiza un `AcquisitionEvent` de tipo `prospect_import`, vinculado a la campaña y al lead.

La operación es incremental: se omiten negocios cuyo `placeId` o teléfono ya existe en la organización. El resultado comunica cuántos se importaron y cuántos se omitieron.

### Estados loading, empty y error

- **Carga de campañas:** el selector muestra “Cargando campañas…”.
- **Búsqueda:** botón en estado “Buscando…”.
- **Sin resultados:** mensaje de búsqueda completada y recomendación de ampliar zona.
- **Filtros sin resultados:** se conserva la búsqueda original y se explica que hay que ajustar filtros.
- **Importación:** botón en “Importando…” y bloqueo de repetición.
- **Error de proveedor:** backend responde 503 si falta `GOOGLE_PLACES_API_KEY` o Places falla.
- **Error de campaña:** no se permite importar sin campaña o si la campaña no pertenece al tenant.
- **Duplicados:** se informa el número omitido, sin crear duplicados.
- **Exportación:** depende del navegador y de la utilidad local `downloadCsv`.

### Permisos

- `leads.write` + `costs.request`, scope `org`, para buscar e importar.
- La interfaz no tiene un permiso de lectura separado para Prospect Finder.
- La campaña destino se valida por `campaignId` + `orgId` en backend.
- Los leads y eventos creados quedan aislados por `orgId`.

### APIs, modelos y dependencias

**APIs:**

- `POST /api/prospects/search`.
- `POST /api/prospects/import`.
- `GET /api/campaigns?page=1&limit=100`.
- `POST /api/campaigns` para crear outbound.

**Servicios:**

- `prospecting.service.ts` llama a Google Places Text Search.
- `leads.service.ts` crea leads y evita duplicados.
- `digitalAudit.service.ts` puede enriquecer/auditar la web.
- `leadIngestion.service.ts` encola llamadas.

**Modelos:**

- `Campaign`.
- `Lead`.
- `AcquisitionEvent`.
- Auditorías de lead y tareas/llamadas relacionadas según los servicios llamados.

**Dependencias externas:**

- `GOOGLE_PLACES_API_KEY`.
- Google Places API v1 y su field mask.
- Acceso a la web del prospecto para enriquecimiento.
- Sistema de llamadas si `autoCall` está marcado.

### Navegación relacionada

- Campañas: destino obligatorio de la importación.
- Leads: revisar los leads creados.
- Pipeline: avanzar oportunidades generadas.
- Landings/Funnels: construir una ruta de captación para el outbound.
- Digital Audit/Insights: profundizar en la calidad del prospecto.

### Riesgos y pendientes

- La búsqueda consume un proveedor externo y puede tener coste o límites de cuota.
- `quickScore` no sustituye una auditoría de negocio y puede priorizar falsos positivos.
- La importación ejecuta operaciones potencialmente costosas en serie cuando se enriquece.
- `autoAudit` y `autoCall` deben mostrar claramente que pueden iniciar trabajo adicional.
- La deduplicación por teléfono necesita una normalización coherente entre países.
- No se debe presentar el resultado de Places como intención de compra del negocio: son señales de prospección.

### Checklist de aceptación

- [ ] Sin API key se muestra un error comprensible y no una tabla inventada.
- [ ] La búsqueda exige sector y ciudad.
- [ ] El score se identifica como rápido/preliminar.
- [ ] La importación exige campaña de la misma organización.
- [ ] Los duplicados no crean leads repetidos.
- [ ] Cada lead importado conserva la atribución de campaña.
- [ ] Auditar y activar llamada son opciones explícitas.
- [ ] El CSV refleja sólo los resultados visibles y filtrados.

---

## 6. Landings & webs

### Propósito y problema que resuelve

Landings & webs es la superficie de conversión. Resuelve la fragmentación entre una campaña que genera tráfico y el destino donde una persona deja sus datos.

Permite crear landings vinculadas a campañas, editar su oferta y contenido comercial, copiar el enlace público, ver leads y visitas cuando existen eventos, y registrar webs externas aunque todavía no se midan dentro del sistema.

### Usuarios

- Marketing y Growth, para crear destinos de campaña.
- Copy/design, para editar oferta, lead magnet y copy.
- Revenue Operations, para verificar tracking y conversión.
- Ventas, para abrir la experiencia pública y revisar leads.

### Ruta y precondiciones

- Gestión: `/landings`.
- Experiencia pública: `/l/:slug`.
- La sidebar muestra Landings si el usuario tiene `campaigns.read`.
- La gestión usa campañas; crear/editar requiere `campaigns.write`.
- Una landing publicada depende de una campaña activa con `landingSlug`.
- Una web externa puede registrarse localmente sin tener métricas conectadas.

### Estructura visual

1. Cabecera con “Importar URL” y “Nueva landing”.
2. Journey en fase “Convertir”.
3. Alert de sincronización si no se pudieron cargar campañas.
4. Landing destacada con estado, URL, copy, leads y acciones.
5. KPI:
   - landings activas;
   - visitas medidas;
   - leads de campaña;
   - conversión medida.
6. Tabs: todas, publicadas, borradores, sin landing y webs externas.
7. Toolbar de búsqueda, plantilla, orden y vista lista/cuadrícula.
8. Lista o grid de propiedades.
9. Rail de rendimiento.
10. Menú contextual: copiar, editar, cambiar estado y eliminar —la eliminación aún pide confirmación desde configuración—.
11. Modal para crear, editar o importar una URL.

### Datos de entrada

Para una landing propia:

- nombre/campaña;
- oferta;
- lead magnet;
- copy de anuncio/landing;
- plantilla;
- slug.

Para una web externa:

- nombre;
- URL;
- información descriptiva local.

La página normaliza campañas desde `GET /api/campaigns?limit=100` y combina visitas procedentes de `GET /api/funnels/overview`.

### Acciones principales

- Crear landing como borrador.
- Editar slug, plantilla y assets de campaña.
- Importar URL externa.
- Abrir la URL pública.
- Copiar enlace.
- Filtrar por estado/plantilla.
- Ordenar por nombre, leads o conversión.
- Cambiar estado entre publicada/pausada usando el estado de campaña.
- Ir a Campañas cuando aún no existe ninguna.

### Resultado

Una landing propia se guarda en `Campaign.landingSlug` y `Campaign.adAssets`. Cuando la campaña está activa, `/l/:slug` devuelve la oferta y los assets seguros, registra visitas y puede crear leads con consentimiento.

La landing pública registra:

- `landing_view` en `AcquisitionEvent`;
- `landing_lead` en `AcquisitionEvent`;
- `Lead` con campaña, fuente y atribución;
- evidencia de consentimiento;
- deduplicación por teléfono/campaña.

### Estados loading, empty y error

- **Loading:** conecta campañas, webs y métricas.
- **Error de carga:** no sustituye los datos por demo; muestra una alerta y reintento.
- **Sin propiedades:** invita a crear una landing o ir a Campañas.
- **Sin landing:** la campaña aparece como “Sin landing”.
- **Sin tracking:** visitas y conversión aparecen como no disponibles, no como cero inventado.
- **Web externa:** leads, visitas y conversión se muestran como no conectados.
- **URL pública inexistente:** el usuario debe añadir slug antes de copiar/abrir.
- **Landing pública 404:** ocurre si el slug no existe o la campaña no está activa.
- **Formulario público inválido:** nombre, teléfono, email válido y consentimiento son obligatorios.
- **Honeypot:** una petición con el campo web oculto responde de forma indistinguible pero no crea lead.

### Permisos

- Lectura: `campaigns.read`, scope `org`.
- Escritura: `campaigns.write`, scope `org`.
- Las rutas públicas no usan JWT, pero sólo exponen una landing activa por slug.
- La organización se resuelve desde la campaña encontrada; no se acepta `orgId` desde el navegador.

### APIs, modelos y dependencias

**Gestión privada:**

- `GET /api/campaigns?limit=100`.
- `GET /api/funnels/overview`.
- `POST /api/campaigns`.
- `PUT /api/campaigns/:id/landing`.
- `PUT /api/campaigns/:id` para cambiar estado.

**Experiencia pública:**

- `GET /api/landing/:slug`.
- `POST /api/landing/:slug/view`.
- `POST /api/landing/:slug/lead`.

**Modelos:**

- `Campaign` como configuración y vínculo público.
- `AcquisitionEvent` para visitas y conversiones.
- `Lead` y `ContactConsent` para formularios.
- `Call`/automatizaciones pueden activarse a través de servicios de ingesta.

**Dependencias:**

- `localStorage` para webs externas (`vozia.external-webs.v1`); esos registros son locales al navegador, no una entidad backend.
- URLs públicas y navegador para abrir/copy.
- Captura de UTMs, referrer, session ID y datos de atribución.

### Navegación relacionada

- Campañas es la fuente de verdad de las landings propias.
- Funnels usa `landingSlug` y eventos `landing_view`.
- Redes sociales bloquea la creación de posts si la campaña no tiene landing.
- Ads publica hacia una campaña/landing.
- La landing pública crea leads que aparecen en Leads, Pipeline, llamadas y reuniones.

### Riesgos y pendientes

- Las webs externas se guardan en `localStorage`, así que no están disponibles para otros usuarios/dispositivos.
- La edición de una landing usa `adAssets` JSON: requiere disciplina de contrato para evitar campos inconsistentes.
- Cambiar el estado de una campaña afecta a la disponibilidad pública del slug.
- La conversión sólo se calcula si hay visitas medidas; no debe dividirse por cero ni imputarse por defecto.
- La protección anti-spam usa rate limits, honeypot y deduplicación, pero requiere pruebas reales frente a abuso.
- El consentimiento se registra, pero cada canal de contacto debe seguir sus requisitos legales y operativos.

### Checklist de aceptación

- [ ] Crear una landing genera campaña/slug válidos.
- [ ] Una landing sin campaña no aparece como publicada.
- [ ] Una URL pública sólo sirve una campaña activa.
- [ ] Visita y lead quedan atribuidos a la campaña correcta.
- [ ] El formulario exige consentimiento y valida datos.
- [ ] Los duplicados por teléfono/campaña no disparan una segunda cadena comercial.
- [ ] Web externa queda etiquetada como no medida.
- [ ] Si falla la API, la UI no muestra métricas demo.

---

## 7. Funnels

### Propósito y problema que resuelve

Funnels responde a la pregunta: **“¿En qué transición se pierde la demanda?”**. Convierte los contadores de campaña y eventos de landing en un recorrido comprensible: visitas, leads, contactados y reuniones.

Su problema principal es evitar que una cifra final de leads o reuniones se interprete sin conocer el volumen que hubo en la etapa anterior.

### Usuarios

- Growth y Marketing, para optimizar la captación.
- Revenue Operations, para detectar cuellos de botella.
- Ventas, para saber si el problema está antes o después del contacto.
- Dirección, para comparar recorridos.

### Ruta y precondiciones

- Ruta: `/funnels`.
- Puede conservar la selección en query string: `/funnels?selected=<id>`.
- Lectura: `funnels.read`.
- Creación: `funnels.write`.
- Un funnel se implementa sobre `Campaign`; al crearlo genera un `landingSlug` y assets mínimos.
- Para medir visitas debe existir una landing pública activa que envíe eventos.

### Estructura visual

1. Cabecera con enlace a Landings y botón de nuevo funnel.
2. Journey en fase “Cerrar”.
3. Recomendación prioritaria calculada por el backend.
4. KPI:
   - funnels activos;
   - visitas medidas;
   - leads captados;
   - reuniones.
5. Filtros de todos, activos, borradores y sin tracking.
6. Tabla de recorridos con estado, visitas, leads, reuniones y conversión.
7. Inspector del funnel seleccionado:
   - recorrido de visita a reunión si tiene landing;
   - recorrido de prospecto a reunión si es outbound;
   - tasas entre etapas.
8. Historia visual de tres fases: atracción, conversación y siguiente paso.
9. Panel de calidad de medición.
10. Nota metodológica que explica que no se estiman tasas si falta el denominador.

### Datos de entrada

Para crear:

- nombre mínimo de tres caracteres;
- objetivo opcional.

Para overview, el backend combina:

- campañas;
- `landingSlug`;
- `Campaign.totalLeads`;
- `Campaign.contacted`;
- `Campaign.meetingsScheduled`;
- eventos `AcquisitionEvent` de tipo `landing_view`;
- visitas legacy en `adAssets.visits` cuando existen.

### Acciones principales

- Crear funnel.
- Seleccionar un funnel.
- Filtrar por estado o tracking pendiente.
- Conservar selección en URL.
- Abrir landing pública.
- Ir a Landings.
- Ir al detalle de campaña.
- Seguir la recomendación calculada.

### Resultado

El usuario obtiene tasas explícitas:

- visita → lead;
- lead → contacto;
- contacto → reunión;
- visita → reunión;
- lead → reunión.

La recomendación identifica uno de dos problemas comprobados:

- hay una landing con resultados pero sin visitas medidas;
- existe un cuello de botella con la menor tasa disponible.

### Estados loading, empty y error

- **Loading:** “Cargando el recorrido de tus funnels…”.
- **Empty:** invita a crear el primer funnel y explica que se generará una landing genérica editable.
- **Filtro vacío:** “No hay funnels en este filtro”.
- **Sin selección:** inspector pide seleccionar un funnel.
- **Sin tracking:** visitas y tasas que dependen de visitas aparecen vacías; no se convierten en cero.
- **Error:** pantalla con reintento.
- **Landing no disponible:** el inspector puede no abrir un destino válido si la campaña no está activa.

### Permisos

- Lectura: `funnels.read`, scope `org`.
- Creación: `funnels.write`, scope `org`.
- La lectura se limita al `orgId` autenticado.

### APIs, modelos y dependencias

**APIs:**

- `GET /api/funnels/overview`.
- `POST /api/funnels`.
- `GET /api/campaigns/:id` desde el detalle enlazado.
- `GET /api/landing/:slug` al abrir la experiencia pública.

**Modelos/servicios:**

- `funnels.service.ts`.
- `Campaign`.
- `AcquisitionEvent`.
- `Lead`, `Meeting` y contadores de campaña.

### Navegación relacionada

- Landings resuelve tracking y contenido del destino.
- Campañas mantiene el workspace y los contadores.
- Prospect Finder crea funnels outbound de manera indirecta al crear campaña.
- Ads y Social aportan demanda a la campaña.
- Pipeline, Leads, llamadas y reuniones representan las etapas posteriores.

### Riesgos y pendientes

- Las visitas antiguas pueden proceder de `adAssets.visits`, mientras las nuevas proceden de eventos; hay que evitar doble conteo.
- Un funnel es una campaña con convención funcional, no un modelo Prisma independiente.
- Si el tracking de visitas falla, la tasa de visita a lead no es evaluable aunque haya leads.
- La recomendación no es una optimización automática; es una prioridad de revisión.
- La ruta pública y el estado de campaña deben mantenerse coherentes.

### Checklist de aceptación

- [ ] Crear funnel genera campaña con slug único.
- [ ] Las visitas proceden de eventos reales o de fallback legacy identificado.
- [ ] Las tasas no se calculan sin denominador válido.
- [ ] Sin tracking se muestra como pendiente, no como cero.
- [ ] La recomendación identifica el cuello de botella con datos reales.
- [ ] La selección se puede compartir mediante query string.
- [ ] El funnel enlaza a campaña y landing correctas.

---

## 8. Organic Leads

### Propósito y problema que resuelve

Organic Leads es la superficie para convertir demanda orgánica en acciones comerciales. Su propósito es responder a cuatro preguntas:

1. ¿Qué búsquedas o señales indican demanda?
2. ¿Dónde está el negocio visible o ausente?
3. ¿Qué activo conviene crear o mejorar?
4. ¿Qué lead puede atribuirse a una fuente orgánica?

La página evita presentar “herramientas SEO” como un fin aislado. El cuarto pilar es **captación orgánica orientada a leads**, conectada con campañas, activos, oportunidades e integraciones de Google.

### Usuarios

- Marketing Growth y SEO operativo.
- Revenue Operations.
- Dirección que necesita visibilidad de demanda orgánica.
- Analistas con lectura de oportunidades.
- Usuarios con permisos de gestión de integraciones para conectar Google.

### Ruta y precondiciones

- Ruta: `/organic`.
- El módulo se carga mediante `src/lib/organicPage.js` y `import.meta.glob`.
- Lectura: `organic.read`.
- Gestión de proyecto/activos/acciones: `organic.manage`.
- Estado de integraciones: `organic.integrations.read`.
- OAuth, selección de propiedad, desconexión y sincronización: `organic.integrations.manage`.
- El backend crea un único `OrganicProject` por organización.
- Para ver el dashboard listo debe existir proyecto; sin proyecto se muestra setup.
- Para datos de Google se necesitan credenciales OAuth, APIs habilitadas, redirect URL y clave de cifrado de tokens.

### Estructura visual

1. Cabecera de Organic Leads.
2. Selector de proyecto y periodo.
3. Acciones de conectar web y crear campaña/activo orgánico.
4. Navegación interna:
   - Resumen;
   - Oportunidades;
   - Visibilidad local;
   - Visibilidad IA;
   - Contenido;
   - Competidores;
   - Leads orgánicos.
5. Banner de oportunidad orgánica.
6. KPI:
   - clientes potenciales encontrados;
   - leads orgánicos;
   - valor estimado;
   - oportunidades sin aprovechar.
7. Panel de integraciones:
   - Search Console;
   - GA4;
   - Google Business Profile.
8. Tabla de oportunidades con búsqueda, demanda, competencia, valor por lead y acción.
9. Panel de acciones recomendadas.
10. Paneles de presencia local, visibilidad en IA, activos y leads.
11. Banda de `Competitor Gap`.
12. Modal para crear proyecto, conectar web o preparar un activo.

### Datos de entrada

**Proyecto:**

- nombre;
- web;
- ciudad/zona;
- contexto comercial.

El frontend transforma la ubicación en `locations[]` y el contexto en `config.notes`.

**Activos:**

- título;
- tipo, por defecto `service_page`;
- oportunidad asociada opcional;
- notas en `content`;
- URL objetivo opcional.

**Integraciones Google:**

- proveedor;
- propiedad/recurso externo seleccionado;
- rango de fechas y límite de filas para Search Console.

### Acciones principales

- Crear proyecto Organic.
- Conectar o actualizar web.
- Iniciar OAuth Google.
- Consultar estado de integración.
- Descubrir propiedades, cuentas o ubicaciones.
- Seleccionar recurso externo.
- Desconectar y revocar integración.
- Sincronizar Search Console.
- Crear borrador de activo comercial.
- Preparar acciones a partir de oportunidades.
- Cambiar periodo y proyecto.
- Navegar a las secciones internas.

### Resultado

**Proyecto:** se crea `OrganicProject` con configuración del negocio y tres filas iniciales de integración.

**Oportunidades:** `OrganicOpportunity` guarda título, query, ubicación, estado, score, valor estimado, fuente y enlaces opcionales a lead/campaña.

**Activos:** `OrganicAsset` guarda borradores de páginas, guías, landings u otros contenidos con su oportunidad y URL objetivo.

**Acciones:** `OrganicAction` conserva tipo, título, descripción, prioridad, estado y fecha límite.

**Integraciones:** los tokens se almacenan cifrados; la aplicación guarda scopes, expiración, discovery, propiedad seleccionada y estado de sincronización. No se muestran secretos en la UI.

**Search Console:** la sincronización real crea o actualiza oportunidades a partir de queries recibidas del proveedor y sus impresiones/clicks/posición, según el servicio de integración.

### Estados loading, empty y error

- **Loading:** prepara el mapa de oportunidades.
- **Setup sin proyecto:** invita a configurar Organic Leads.
- **Proyecto sin datos:** los KPI sin fuente muestran `—` o cero según el agregado real; los paneles vacíos explican qué conexión o evento falta.
- **Integración no conectada:** estado explícito, con CTA de OAuth.
- **Propiedad pendiente:** discovery devuelve recursos, pero no hay propiedad seleccionada.
- **Sincronización:** el estado de proveedor muestra actividad y último sync cuando el backend lo devuelve.
- **Error overview:** muestra reintento y mantiene el formulario de configuración.
- **Error OAuth:** el callback redirige a `/captacion/conectar` con estado de error.
- **Error de permisos:** el backend puede devolver 403 aunque el enlace se haya mostrado por fallback de rol.
- **Sin oportunidades:** no se inventan búsquedas, scores ni valor estimado.

### Permisos

- `organic.read` para overview, proyecto y entrada de navegación.
- `organic.manage` para crear/editar proyecto, crear activos y acciones.
- `organic.integrations.read` para estados y discovery.
- `organic.integrations.manage` para OAuth, recursos, desconexión y sincronización.
- Todas las rutas privadas usan JWT, `orgId` y scope `org`.
- El callback OAuth no lleva JWT; la protección procede de un `state` opaco, de un solo uso, hashado y asociado a organización/proyecto/proveedor.

### APIs, modelos y dependencias

**Overview y proyecto:**

- `GET /api/organic/overview`.
- `GET /api/organic/project`.
- `POST /api/organic/project`.
- `PATCH /api/organic/project`.

**Activos y acciones:**

- `POST /api/organic/assets`.
- `POST /api/organic/opportunities/:opportunityId/actions`.

**Integraciones:**

- `GET /api/organic/integrations`.
- `GET /api/organic/integrations/:provider/status`.
- `GET /api/organic/integrations/:provider/oauth/start-url`.
- `GET /api/organic/integrations/:provider/oauth/start`.
- `GET /api/organic/integrations/:provider/oauth/callback`.
- `POST /api/organic/integrations/:provider/discover`.
- `PUT /api/organic/integrations/:provider/resource`.
- `DELETE /api/organic/integrations/:provider`.
- `POST /api/organic/integrations/search_console/sync`.

**Modelos comprobados:**

- `OrganicProject`.
- `OrganicOpportunity`.
- `OrganicAsset`.
- `OrganicAction`.
- `OrganicIntegration`.
- `OrganicOAuthState`.
- `Lead`, `Campaign` y `AcquisitionEvent` para atribución comercial.

**Seguridad y dependencias externas:**

- AES-256-GCM en `organicTokenCrypto.ts`.
- `ORGANIC_TOKEN_ENCRYPTION_KEY` independiente del secreto Meta.
- `GOOGLE_OAUTH_CLIENT_ID`.
- `GOOGLE_OAUTH_CLIENT_SECRET`.
- `GOOGLE_OAUTH_REDIRECT_BASE_URL`.
- APIs de Search Console, GA4 y Google Business Profile.
- Google OAuth server-side con access/refresh token y PKCE.

### Navegación relacionada

- Landings y Funnels convierten la demanda orgánica en destinos y etapas medibles.
- Campañas puede recibir una oportunidad o asset orgánico.
- Leads muestra los contactos atribuidos.
- Redes sociales puede reutilizar activos, pero su publicación se opera en Metricool.
- Google Ads/Meta Ads son canales pagados y no deben mezclarse con el KPI de organic leads.
- `/captacion/conectar` es la pantalla existente para la cuenta Meta; Organic usa sus propios endpoints Google y vuelve allí desde el callback por compatibilidad de navegación.

### Riesgos y pendientes

- La pantalla ya presenta secciones de visibilidad local, IA y competidores, pero el backend comprobado no expone todavía un dataset completo para todas ellas; deben permanecer vacías o en estado pendiente, nunca con cifras de diseño.
- GA4 y Google Business Profile tienen discovery implementado, pero la extracción de métricas de negocio todavía depende de una fase posterior.
- Search Console necesita seleccionar una propiedad antes de sincronizar.
- Las credenciales Google, APIs habilitadas, redirect URLs y clave de cifrado son requisitos de entorno, no configuración que el frontend pueda resolver.
- El callback redirige a `/captacion/conectar`, por lo que conviene definir una pantalla de retorno específica para Organic.
- Sólo existe un proyecto Organic por organización; si se necesitan varios negocios/locales habrá que cambiar la restricción `orgId @unique`.
- El botón “Crear campaña orgánica” en la UI actual crea un asset/draft según el flujo del componente; no debe confundirse con `Campaign` publicable hasta que exista una integración de dominio explícita.
- El score y el valor sólo son reales si proceden de una oportunidad sincronizada o de una entrada manual validada.

### Checklist de aceptación

- [ ] Sin proyecto se muestra setup, no un dashboard con datos inventados.
- [ ] Crear proyecto sólo se permite una vez por organización o comunica el conflicto.
- [ ] Los KPI distinguen cero real de dato no disponible.
- [ ] OAuth usa state de un solo uso y PKCE.
- [ ] Access/refresh tokens nunca aparecen en respuestas ni logs.
- [ ] El usuario puede descubrir y seleccionar una propiedad real.
- [ ] Search Console sólo sincroniza tras seleccionar recurso y con fechas válidas.
- [ ] Las oportunidades quedan aisladas por organización.
- [ ] Un activo creado queda en estado draft y asociado a la oportunidad correcta.
- [ ] GA4, GBP, IA local y Competitor Gap no muestran métricas si todavía no hay fuente real.

---

## Matriz final de dependencias entre páginas

| Origen | Destino | Qué se comparte |
|---|---|---|
| Dashboard | Campañas/Leads/Pipeline/Llamadas/Reuniones | Señales agregadas y profundización operativa. |
| Campañas | Ads | `campaignId`, presupuesto, assets, estado y IDs Meta. |
| Campañas | Redes sociales | Campaña y `landingSlug` para posts atribuidos. |
| Campañas | Landings | `landingSlug` y `adAssets`. |
| Campañas | Funnels | contadores, estado, landing y eventos de visita. |
| Prospect Finder | Campañas/Leads | campaña outbound, leads y `prospect_import`. |
| Landings | Funnels | `landing_view`, visitas y tasas. |
| Landings | Leads | formulario, consentimiento y `landing_lead`. |
| Redes sociales | Landings/Funnels | URL con UTMs y posts vinculados a campaña. |
| Organic Leads | Campañas/Assets/Leads | oportunidades orgánicas, assets, acciones y atribución. |
| Ads | Dashboard/Campañas | gasto, snapshots, CPL, CTR y ROI agregado. |

## Conclusión operativa

Captación ya tiene una arquitectura coherente de **planificar → atraer → convertir → medir/cerrar**, pero las páginas no tienen el mismo nivel de madurez:

- Campañas, Landings, Funnels y Prospect Finder tienen flujos CRUD/operativos claros y datos de backend.
- Ads tiene operación real condicionada a Meta y snapshots.
- Redes sociales tiene flujo real condicionado a Metricool, plan y configuración de proveedor.
- Organic Leads tiene el proyecto, activos, oportunidades, OAuth y Search Console preparados; varias tarjetas analíticas dependen aún de nuevas fuentes.
- Dashboard combina datos reales, pero conserva fallback demo y no aplica todavía al backend los filtros de fecha/comparación visibles.

La distinción importante para producto y soporte es ésta: **una página puede estar implementada visualmente y tener endpoints preparados sin que la capacidad esté operativa hasta configurar credenciales, permisos, jobs, webhooks y datos reales del proveedor**.

