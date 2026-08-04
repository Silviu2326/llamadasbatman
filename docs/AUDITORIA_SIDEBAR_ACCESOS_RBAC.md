# Auditoría de Sidebar, secciones, accesos y configuración

**Fecha:** 22 de julio de 2026  
**Ámbito:** aplicación React, API Fastify, RBAC, multi-tenant, integraciones y coherencia funcional  
**Tipo:** auditoría estática de código y trazabilidad de navegación  
**Resultado:** no se modificó la lógica de la aplicación durante esta auditoría

## Estado de remediación posterior

Después de la auditoría se implementaron correcciones en cuatro frentes:

- Sidebar dinámica con filtrado deny-by-default y accesibilidad de secciones.
- Gobierno empresarial y Access Control protegidos por permisos reales.
- Guards explícitos de Access Control y scopes propios en módulos que ya soportan ownership.
- Validación organizativa en Voz y comprobación de revocación de sesiones.

El build frontend pasa. Los tests RBAC y de autorización focalizados pasan con `NODE_ENV=test`. El build completo del backend continúa bloqueado por errores TypeScript previos en servicios y tests fuera de estos ámbitos; se detallan al cierre de la implementación.

## 1. Resumen ejecutivo

La navegación principal está técnicamente conectada: las 23 entradas visibles de la Sidebar tienen una ruta React válida y las APIs principales están registradas en el backend.

El problema principal no está en la existencia de las rutas, sino en la unión entre navegación y autorización:

1. La Sidebar es estática y se muestra completa a cualquier usuario autenticado.
2. \`ProtectedRoute\` valida sesión, pero no permisos.
3. El backend sí aplica RBAC, por lo que muchos usuarios ven módulos que después devuelven \`403\`.
4. Los alcances \`own\`, \`team\` y \`org\` definidos en el catálogo no están reflejados de forma consistente en las rutas.
5. Gobierno empresarial tiene una política distinta en frontend y backend.
6. La interfaz de Access Control y su API existen, pero la página no está registrada en la aplicación.
7. Hay riesgos que requieren revisión prioritaria en los endpoints internos de voz y en la revocación de sesiones.

### Veredicto

**La plataforma está conectada funcionalmente, pero no está alineada en accesos, experiencia por rol ni defensa multi-tenant.** Antes de considerar cerrado el sistema de permisos deben corregirse la matriz de navegación, los scopes, Gobierno empresarial y los endpoints internos de voz.

## 2. Evidencias principales

| Área | Archivo |
|---|---|
| Definición de Sidebar | [\`src/components/Sidebar.jsx\`](../src/components/Sidebar.jsx) |
| Rutas frontend | [\`src/App.jsx\`](../src/App.jsx) |
| Protección de sesión | [\`src/components/ProtectedRoute.jsx\`](../src/components/ProtectedRoute.jsx) |
| Protección administrativa | [\`src/components/AdminRoute.jsx\`](../src/components/AdminRoute.jsx) |
| Registro de APIs | [\`backend/src/index.ts\`](../backend/src/index.ts) |
| Catálogo de roles/permisos | [\`backend/src/access-control/catalog.ts\`](../backend/src/access-control/catalog.ts) |
| Evaluación de permisos y scopes | [\`backend/src/access-control/permissions.ts\`](../backend/src/access-control/permissions.ts) |
| Middleware de autenticación | [\`backend/src/middlewares/authenticate.ts\`](../backend/src/middlewares/authenticate.ts) |
| Access Control backend | [\`backend/src/routes/accessControl.ts\`](../backend/src/routes/accessControl.ts) |
| Access Control frontend | [\`src/pages/AccessControlPage.jsx\`](../src/pages/AccessControlPage.jsx) |
| Gobierno frontend | [\`src/pages/EnterpriseGovernancePage.jsx\`](../src/pages/EnterpriseGovernancePage.jsx) |
| Gobierno backend | [\`backend/src/routes/revenueIntelligence.ts\`](../backend/src/routes/revenueIntelligence.ts) |
| Voz interna | [\`backend/src/routes/voice.ts\`](../backend/src/routes/voice.ts) |

## 3. Inventario de la Sidebar

La Sidebar contiene Dashboard y seis grupos funcionales.

### Dashboard

| Etiqueta | Ruta |
|---|---|
| Dashboard | \`/dashboard\` |

### Captación

| Etiqueta | Ruta | API principal | Estado |
|---|---|---|---|
| Campañas | \`/campanas\` | \`/api/campaigns\` | Conectada |
| Ads | \`/ads\` | \`/api/ads\`, Meta Accounts, Ad Playbooks | Conectada |
| Redes sociales | \`/redes-sociales\` | \`/api/metricool\` | Conectada; parte de la gestión abre Metricool externamente |
| Prospect Finder | \`/prospectos\` | \`/api/prospects\`, campañas | Conectada; requiere permisos de coste |
| Landings & webs | \`/landings\` | campañas, funnels | Conectada a campañas |
| Funnels | \`/funnels\` | \`/api/funnels\` | Conectada; no hay listado independiente completo |

### Conversación

| Etiqueta | Ruta | API principal | Estado |
|---|---|---|---|
| Inbox | \`/conversacion/inbox\` | \`/api/conversations\` | Conectada |
| Llamadas | \`/llamadas\` | \`/api/calls\` | Conectada |
| Agentes IA | \`/agentes\` | \`/api/agents\` | Conectada; algunas funciones avanzadas no tienen API propia |
| Playbooks | \`/playbooks\` | \`/api/playbooks\` | Conectada |
| Test de Voz | \`/voz/test\` | WebSocket \`/voice-sim/live\` | Funcional por WebSocket; sin permiso RBAC específico |

### Nutrición

| Etiqueta | Ruta | API principal | Estado |
|---|---|---|---|
| Email marketing | \`/email-marketing\` | marketing campaigns, Mautic | Parcial; reutiliza permisos de campañas |
| Automatizaciones | \`/automatizaciones\` | \`/api/automations\` | Conectada |

### Growth

| Etiqueta | Ruta | API principal | Estado |
|---|---|---|---|
| Growth Hub | \`/growth\` | \`/api/growth-programs\` | Conectada |

### Ventas

| Etiqueta | Ruta | API principal | Estado |
|---|---|---|---|
| Leads | \`/leads\` | leads, accounts | Conectada |
| Pipeline | \`/pipeline\` | pipeline, tasks | Conectada |
| Reuniones | \`/reuniones\` | \`/api/meetings\` | Conectada |
| Inteligencia comercial | \`/inteligencia-comercial\` | \`/api/revenue-intelligence\` | Parcial; combina varios dominios de permiso |

### Sistema

| Etiqueta | Ruta | API principal | Estado |
|---|---|---|---|
| Insights | \`/insights\` | \`/api/dashboard/stats\` | Parcial; no tiene API propia y usa fallback demo |
| Knowledge Base | \`/knowledge-base\` | \`/api/knowledge\` | Conectada |
| Configuración | \`/configuracion\` | settings, agents | Parcial; varias pestañas no están conectadas |
| Gobierno empresarial | \`/gobierno-empresarial\` | governance de revenue intelligence | Conflicto de permisos |

## 4. Rutas internas y páginas huérfanas

Rutas válidas sin entrada directa en Sidebar:

- \`/captacion/conectar\`: conexión de Meta desde Ads.
- \`/captacion/nueva\`: wizard de Ads desde Ads.
- \`/admin/ad-playbooks\`: administración global de Ad Playbooks, accesible por URL directa.
- Rutas de detalle de agentes, leads, campañas, llamadas, reuniones, automatizaciones, artículos, playbooks y pipeline.

### Access Control huérfano

\`AccessControlPage.jsx\` consume \`/api/access-control\`, pero no está importada ni registrada en \`App.jsx\`. La gestión de miembros, roles y solicitudes no tiene acceso normal desde la aplicación.

## 5. Protección actual

### Frontend

- \`ProtectedRoute\` exige token, pero no permiso.
- \`Sidebar\` no filtra por rol ni permiso.
- \`AdminRoute\` usa una lista fija: \`owner\` y \`admin\`.
- No se distingue entre módulo no permitido, solo lectura, integración no configurada, función no contratada o error técnico.
- Gobierno empresarial redirige silenciosamente al Dashboard cuando falla el rol.

### Backend

La mayoría de rutas usa \`authenticate\` y \`requirePermission\`. El catálogo incluye permisos de Dashboard, leads, cuentas, llamadas, conversaciones, campañas, Ads, social, funnels, agentes, playbooks, automatizaciones, conocimiento, reuniones, pipeline, tareas, growth, experimentos, memoria, gobierno, integraciones, organización, usuarios, roles, auditoría, costes y control de acceso.

La protección backend es más completa que la navegación frontend, pero no siempre respeta los alcances de recurso definidos.

## 6. Roles y permisos

| Rol | Intención |
|---|---|
| \`owner\` | Control total |
| \`admin\` | Administración operativa y organizativa, con límites definidos por catálogo |
| \`revenue_ops\` | Operaciones de ingresos, campañas, ventas y growth |
| \`sales_manager\` | Gestión comercial de equipo |
| \`sales_rep\` | Operación comercial propia |
| \`marketing_growth\` | Marketing, Ads, social, funnels, automatizaciones y growth |
| \`analyst\` | Consulta analítica |
| \`compliance\` | Gobierno, auditoría y cumplimiento |
| \`finance_controller\` | Costes, aprobación financiera y reporting |
| \`guest\` | Acceso mínimo |
| \`agent\` | Rol legacy amplio |
| \`viewer\` | Rol legacy de solo lectura |

### Matriz de lectura efectiva

| Sección | Permiso mínimo | Problema |
|---|---|---|
| Dashboard | \`dashboard.read\` | \`guest\` puede fallar porque la ruta exige alcance \`org\` |
| Campañas | \`campaigns.read\` | Se muestra a roles comerciales sin permiso |
| Ads | \`ads.read\` | \`admin\` puede leer, pero no necesariamente escribir o solicitar gasto |
| Social / Metricool | \`social.read\` | Sidebar no filtra |
| Prospect Finder | \`leads.write\` + \`costs.request\` | Se muestra a usuarios sin permiso de operación pagada |
| Inbox | \`conversations.read\` | Scopes propios/equipo no se aplican bien |
| Llamadas | \`calls.read\` | Las rutas exigen alcance organizativo |
| Agentes IA | \`agents.read\` | Hay acciones visuales sin API completa |
| Playbooks | \`playbooks.read\` | Ad Playbooks globales no tienen acceso visible |
| Email marketing | \`campaigns.read\` | No existe permiso específico de email |
| Automatizaciones | \`automations.read\` | Se muestra a roles sin permiso |
| Growth | \`growth.read\` | La capacidad operativa es menor que la visibilidad |
| Leads | \`leads.read\` | Sales roles afectados por scopes |
| Pipeline | \`pipeline.read\` | \`own/team\` no está conectado a las rutas |
| Reuniones | \`meetings.read\` | Se muestra sin filtrado |
| Inteligencia comercial | Múltiples permisos | La página puede presentar errores parciales |
| Knowledge Base | \`knowledge.read\` | Se muestra a roles sin acceso |
| Configuración | settings propios y permisos de organización | Muchas pestañas no están conectadas |
| Gobierno | \`governance.read\` | Backend y \`AdminRoute\` no coinciden |

## 7. Hallazgos prioritarios

### P0/P1: autorización y multi-tenant

1. **Sidebar y RBAC desalineados.** Todos ven todo y descubren el bloqueo al ejecutar.
2. **Scopes \`own/team/org\` inutilizados.** Las rutas exigen \`org\` aunque el catálogo conceda alcance propio o de equipo.
3. **Gobierno empresarial inconsistente.** Frontend permite \`admin\`; backend concede gobierno a \`compliance\`.
4. **Endpoints internos de voz.** \`/config/:agentId\` no comprueba organización y devuelve el prompt del agente; \`/outbound\` recibe referencias organizativas que deben validarse.
5. **Revocación no inmediata.** El access token puede seguir válido después de una bajada de privilegios.

### P2: defensa en profundidad

- Varias operaciones de \`/api/access-control\` no tienen \`requirePermission\` explícito en la ruta, aunque el servicio vuelve a validar.
- El catálogo completo de permisos está disponible para cualquier usuario autenticado.
- Gobierno usa un fallback permisivo si el backend no envía \`canManagePolicies: false\`; debe denegar por defecto.
- El WebSocket de voz no tiene un permiso RBAC de módulo claramente definido.

## 8. Hallazgos funcionales y UX

- Access Control no es accesible desde la UI.
- Ad Playbooks globales no tienen enlace visible.
- Configuración muestra pestañas que repiten contenido o no están implementadas.
- Dashboard muestra datos mock si falla la API.
- El selector de fechas no siempre modifica la consulta real.
- Insights contiene botones que solo muestran avisos.
- Algunas capacidades avanzadas de Agentes IA son únicamente visuales.
- Knowledge Base cierra “Enviar solicitud” sin persistir una solicitud real.
- Redes sociales usa Metricool, pero parte de la gestión ocurre fuera.
- Hay texto con codificación UTF-8 dañada.
- Faltan imágenes específicas para Ads, Growth, Inteligencia comercial y Gobierno.
- Las secciones colapsables necesitan \`aria-expanded\` y \`aria-controls\`.
- Algunos enlaces internos usan \`<a href>\` y fuerzan recarga.
- La pestaña de Configuración no queda reflejada en la URL.

## 9. Legacy y endpoints sin consumidor visible

Revisar, documentar como compatibilidad o retirar después de confirmar consumidores externos:

- \`/api/email/overview\`.
- Métricas de campañas de email.
- Operaciones avanzadas de Mautic.
- \`/api/calls/live\`.
- \`/api/automations/health\`.
- Operaciones directas de tareas sin consumidor visible.

## 10. Plan de corrección

### Prioridad 0 — Seguridad

1. Validar organización y relaciones en endpoints internos de voz.
2. Definir política oficial de Gobierno y aplicarla igual en frontend/backend.
3. Corregir scopes \`own/team/org\`.
4. Invalidar inmediatamente access tokens tras cambios de rol.

### Prioridad 1 — Navegación

1. Crear un registro de navegación con permiso mínimo, permisos de escritura, scope e integración requerida.
2. Filtrar Sidebar usando permisos efectivos del backend.
3. Mostrar pantalla \`403\` explicativa.
4. Registrar Access Control en Sistema o Configuración.
5. Enlazar Ad Playbooks para roles autorizados.

### Prioridad 2 — Producto

1. Separar permisos de Email marketing si el negocio lo necesita.
2. Completar o marcar como “Próximamente” las pestañas de Configuración.
3. Eliminar o etiquetar siempre los fallbacks demo.
4. Conectar filtros y rangos de fechas a las APIs reales.
5. Decidir el destino de endpoints legacy.

### Prioridad 3 — Calidad

1. Corregir UTF-8.
2. Mejorar accesibilidad de Sidebar y foco móvil.
3. Sustituir enlaces internos HTML por navegación React.
4. Completar o normalizar imágenes de Sidebar.

## 11. Arquitectura objetivo de navegación

Cada entrada debería declarar:

~~~text
Sección
  -> ruta frontend
  -> permiso de lectura
  -> permisos de escritura/publicación
  -> alcance own/team/org
  -> integración requerida
  -> estado activo/bloqueado/no configurado
~~~

El frontend debe consumir permisos y scopes efectivos desde la sesión o un endpoint \`/me\`. No debe duplicar la lógica de autorización del backend.

## 12. Criterios de aceptación

- Ningún usuario ve una sección sin permiso de lectura.
- Gobierno empresarial es accesible exactamente para los roles aprobados.
- \`sales_rep\` funciona con recursos propios.
- \`sales_manager\` funciona con recursos de equipo.
- \`guest\` puede abrir Dashboard sin error de scope.
- Access Control tiene ruta visible y protegida.
- Voz valida organización y relaciones de entidades.
- Los cambios de rol invalidan sesiones anteriores.
- Las acciones de escritura muestran su permiso real.
- Dashboard e Insights no muestran demo sin etiqueta.
- Cada combinación sección/rol relevante tiene prueba automatizada.
- Los endpoints legacy tienen consumidor o decisión documentada.

## 13. Conclusión

La plataforma tiene una base sólida de módulos, rutas y protección backend. La deuda principal está en la unión entre producto, frontend y autorización: la navegación no refleja el catálogo RBAC, los scopes no están conectados al modelo de recursos y existen módulos administrativos aislados.

La corrección debe comenzar por seguridad y autorización, continuar con Sidebar dinámica y terminar con las funciones visuales incompletas y el contenido legacy.
