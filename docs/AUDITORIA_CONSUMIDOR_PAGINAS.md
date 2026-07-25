# Auditoría de experiencia de consumidor

**Fecha:** 15 de julio de 2026  
**Alcance:** revisión de las 37 rutas registradas en `src/App.jsx`, lectura de los estados y acciones de sus componentes y prueba visual/interactiva de inicio de sesión. No se ha modificado código de producto como parte de esta auditoría.

## Resumen ejecutivo

La aplicación tiene una base visual sólida y varias superficies recientes (captación, funnels, inbox y Growth Hub) manejan correctamente los estados de carga, vacío y error. Sin embargo, aún no es consistente como producto de cara a un cliente: hay textos con codificación incorrecta, páginas que mezclan datos reales con demostraciones no etiquetadas, acciones que parecen guardar pero no persisten y no existe una ruta de página no encontrada.

La prioridad inmediata es restaurar la confianza del usuario: corregir los textos dañados y separar con claridad lo demostrativo de lo operativo antes de ampliar funcionalidades.

### Severidad

| Nivel | Significado | Hallazgos |
| --- | --- | --- |
| P0 — crítico | Daña directamente la comprensión del producto o puede bloquear su uso confiable. | 1 |
| P1 — alto | Presenta datos o resultados engañosos, o deja una navegación principal sin salida. | 4 |
| P2 — medio | Reduce conversión, accesibilidad, colaboración o claridad. | 5 |

## Cobertura de páginas

Todas las rutas se revisaron a nivel de implementación y flujo previsto. La prueba visual directa se realizó sobre `/login`; la landing pública se comprobó en estado de error, ya que no había un backend activo en el entorno de auditoría. Por tanto, no se infiere de ello un fallo de producción de la landing.

| Área | Rutas revisadas | Lectura desde la experiencia de usuario |
| --- | --- | --- |
| Acceso y contenido público | `/login`, `/l/:slug`, `/campanas/compartir/:token` | Inicio de sesión bien presentado; falta recuperación autónoma y páginas legales. La landing contempla consentimiento y errores, pero su publicación real requiere prueba con API disponible. |
| Operación diaria | `/dashboard`, `/campanas`, `/landings`, `/llamadas`, `/leads`, `/agentes`, `/pipeline`, `/reuniones`, `/playbooks`, `/insights`, `/automatizaciones`, `/knowledge-base`, `/configuracion` | Hay buena densidad de producto. El problema principal es que Agentes, barra lateral y parte de las vistas de detalle enseñan valores fijos como si fueran operativos. |
| Detalle | `/agentes/:id`, `/leads/:id`, `/campanas/:id`, `/llamadas/:id`, `/reuniones/:id`, `/automatizaciones/:id`, `/knowledge-base/articulos/:id`, `/playbooks/:id`, `/pipeline/:id` | Los detalles son visualmente ricos, pero Campañas, Playbooks y Oportunidades contienen ejemplos estáticos o acciones no persistentes que deben rotularse o conectarse a datos reales. |
| Voz y captación | `/voz/test`, `/prospectos`, `/captacion/conectar`, `/redes-sociales`, `/email-marketing`, `/captacion/nueva`, `/ads`, `/admin/ad-playbooks` | La oferta de captación es amplia; cada conexión externa necesita comunicar con precisión si está conectada, pendiente o simulada. |
| Conversión y retención | `/funnels`, `/conversacion/inbox`, `/growth` | Son las superficies más maduras en manejo de carga, vacío, error y reintento. Growth Hub mantiene las acciones de crear, editar, pausar y activar conectadas al flujo real. |
| Navegación base | `/` | Redirige correctamente a `/dashboard`, pero no existe una ruta comodín para URL inválidas u obsoletas. |

## Hallazgos priorizados

### P0 — Texto español ilegible por codificación dañada

**Impacto para la persona usuaria:** aparecen textos como `ConfiguraciÃ³n`, `MÃ©ndez`, `Casos de Ã©xito` o `aquÃ­`. Esto transmite falta de control, dificulta comprender acciones y es especialmente grave en una herramienta de ventas que debe inspirar confianza.

**Superficies afectadas:** navegación, agentes, base de conocimiento y las fichas de agente, reunión, oportunidad y playbook.

**Evidencia:** `src/components/KnowledgeBase.jsx`, `src/pages/AgentDetailPage.jsx`, `src/pages/MeetingDetailPage.jsx`, `src/pages/OpportunityDetailPage.jsx` y `src/pages/PlaybookDetailPage.jsx` contienen secuencias `Ã` en el código fuente.

**Corrección recomendada:** normalizar todos los ficheros a UTF-8 sin BOM según el estándar del repositorio, añadir una comprobación de CI que rechace secuencias de mojibake y hacer una pasada visual de las rutas afectadas en escritorio y móvil.

### P1 — Agentes muestra una operación aparente, no una operación persistente

**Impacto para la persona usuaria:** la pantalla de Agentes incluye agentes, métricas, actividad y configuraciones demo. Algunas ediciones actualizan solamente el estado del navegador y confirman que se han guardado; interruptores y selectores no tienen una acción persistente. Una persona podría creer que ha modificado una automatización de ventas cuando no ha ocurrido nada.

**Evidencia:** `src/components/Agentes.jsx` declara `DEMO_AGENTS`, combina datos API con valores demostrativos y actualiza varios cambios mediante `setAgents(...)` sin solicitud API. Las métricas de cabecera y la actividad también son fijas.

**Corrección recomendada:**

- Conectar edición, reglas, canales e idioma a una API transaccional y devolver el valor guardado.
- Mostrar un estado de guardado por campo y errores recuperables.
- Mientras no exista backend, bloquear esas acciones o señalarlas de forma persistente como demostración; nunca confirmar un guardado ficticio.
- Calcular métricas y actividad desde datos del espacio de trabajo.

### P1 — Indicadores inventados en navegación y detalles

**Impacto para la persona usuaria:** la barra lateral afirma que todos los sistemas están operativos y muestra una cuota exacta (`1.248 / 2.000`); los detalles de campaña, oportunidad y playbook añaden segmentos, cronologías, KPIs o automatizaciones de ejemplo. Al no indicar que son muestras, se confunden con el estado de negocio real.

**Evidencia:** valores fijos en `src/components/Sidebar.jsx`; comentarios y constantes de ejemplo en `src/pages/CampaignDetailPage.jsx`; cronología fija en `src/pages/OpportunityDetailPage.jsx`; estructura y KPIs de ejemplo en `src/pages/PlaybookDetailPage.jsx`.

**Corrección recomendada:** establecer un único patrón de producto:

- Datos reales: fuente, última actualización y estados de error visibles.
- Datos de ejemplo: banda permanente de "Datos de demostración", sin posibilidad de confundirlos con datos del cliente.
- Datos no disponibles: estado vacío explicativo con una acción útil, nunca cifras plausibles inventadas.

### P1 — Una URL inválida no tiene página de recuperación

**Impacto para la persona usuaria:** un enlace antiguo, un marcador o una URL mal escrita no tienen una ruta `*` que explique el problema y permita volver a una sección segura. En una aplicación con muchos enlaces de detalle, esto se convierte en una pantalla sin contenido útil.

**Evidencia:** `src/App.jsx` registra rutas públicas y protegidas, pero no una ruta comodín.

**Corrección recomendada:** crear una página 404 accesible con enlace a Inicio, búsqueda o navegación principal; registrar también el intento de URL inválida para detectar enlaces rotos.

### P1 — La confianza se degrada por acciones de apariencia funcional

**Impacto para la persona usuaria:** existen varias acciones con aspecto de producto terminado que muestran un aviso, cambian el estado local o no realizan ninguna operación. Este patrón aparece, entre otros, al exportar, clonar un agente y en secciones de campañas de ejemplo.

**Evidencia:** `src/components/ui/ExportDropdown.jsx` muestra un aviso de "próximamente"; en Agentes hay configuraciones inertes; `CampaignDetailPage.jsx` declara partes no persistentes.

**Corrección recomendada:** antes de publicarlas, sustituir los controles incompletos por uno de estos estados explícitos: "Próximamente" no interactivo, "Solicitar acceso", o funcionalidad completamente integrada. Añadir telemetría de pulsaciones en las CTAs bloqueadas para priorizar el roadmap.

### P2 — Recuperación de contraseña y páginas legales incompletas

**Impacto para la persona usuaria:** "¿La olvidaste?" indica que contacte con administración, sin iniciar recuperación; Términos y Privacidad son controles sin destino. Esto crea fricción de acceso y un problema de credibilidad/legal para un producto B2B.

**Evidencia:** `src/pages/LoginPage.jsx` cambia una nota de texto para recuperación y los botones legales no navegan a ninguna página.

**Corrección recomendada:** habilitar recuperación por correo o SSO con confirmación genérica, límites antiabuso y soporte de cuenta; publicar las URLs de privacidad y términos antes de adquirir usuarios externos.

### P2 — Landings compartidas entre usuarios sólo en el navegador

**Impacto para la persona usuaria:** las webs externas añadidas desde Landings se guardan en `localStorage`. Otro navegador, otra persona del equipo o una sesión limpia no verá el mismo inventario, lo que causa pérdida aparente de trabajo y mala colaboración.

**Evidencia:** funciones `readExternalWebs` y `writeExternalWebs` en `src/pages/LandingsPage.jsx`.

**Corrección recomendada:** persistir el recurso asociado al tenant/usuario en backend y mantener `localStorage` únicamente como borrador recuperable. Mostrar quién creó o modificó cada landing y cuándo.

### P2 — Formularios y modales con barreras de accesibilidad

**Impacto para la persona usuaria:** lectores de pantalla y teclado tienen dificultades para saber qué etiqueta corresponde a cada entrada y para permanecer dentro de un diálogo. Esto afecta conversiones y cumplimiento de accesibilidad.

**Evidencia:** `src/components/forms/FormInput.jsx` no vincula de forma estable `label` e `input`; `src/components/ui/FormModal.jsx` no declara semántica de diálogo, foco inicial/trampa de foco/restauración ni etiqueta del cierre.

**Corrección recomendada:** asignar `id`/`htmlFor`, mensajes de error asociados mediante `aria-describedby`, `role="dialog"`, `aria-modal="true"`, foco gestionado y cierre con Escape. Añadir pruebas con teclado y lector de pantalla.

### P2 — Menú móvil y mensajes de éxito poco accesibles

**Impacto para la persona usuaria:** el botón de navegación móvil no expone nombre ni estado expandido y varios éxitos o copias no dan una confirmación clara y accesible. Por ejemplo, compartir un artículo no confirma el resultado y el guardado de Agentes puede confirmar algo que no se ha persistido.

**Evidencia:** `src/components/ProtectedRoute.jsx`, `src/pages/ArticleDetailPage.jsx` y `src/components/Agentes.jsx`.

**Corrección recomendada:** nombrar el botón con `aria-label`, informar `aria-expanded`, controlar foco al abrir/cerrar; usar notificaciones `aria-live` que diferencien éxito, error y operación pendiente.

## Aspectos que ya aportan buena experiencia

- El inicio de sesión tiene una jerarquía visual clara y no se detectó desbordamiento horizontal en la prueba móvil de 390 px.
- Landing pública contempla consentimiento y estado de error/reintento.
- Leads, Landings, Funnels, Inbox y Growth Hub ya presentan de forma consistente estados de carga, vacío, error y reintento.
- Insights identifica visualmente cuando recurre a datos demostrativos, un patrón que conviene extender al resto de las páginas.

## Plan de corrección centrado en cliente

1. **Semana 1:** resolver toda la codificación dañada, añadir 404 y retirar o etiquetar cualquier dato/acción demo que parezca real.
2. **Semanas 2–3:** conectar la persistencia de Agentes y Landings, con confirmación de servidor, errores y actualización de métricas.
3. **Semanas 3–4:** recuperación de contraseña, páginas legales, accesibilidad de formularios/modal/navegación y mensajes de acción.
4. **Antes de nuevas funcionalidades:** definir una guía de estados de datos (real, demo, vacío, error, pendiente) y una prueba de aceptación por ruta para evitar que una pantalla de ejemplo pase por producción.

## Límites de la auditoría

No se validaron con credenciales reales los flujos de proveedores externos, publicación de landings, envíos de email, llamadas, cobros ni permisos de administrador. Requieren una ronda posterior en un entorno de staging con cuentas de prueba y datos aislados.
