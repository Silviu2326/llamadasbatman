# Auditoría y documentación integral de la plataforma

**Fecha de revisión:** 22 de julio de 2026  
**Ámbito:** aplicación React/Vite, API Fastify, Prisma, sidebar, permisos, seguridad e integraciones.

## Cómo leer esta documentación

La documentación está separada por superficie para mantener evidencia trazable. Cada documento enlaza el código fuente revisado y distingue entre implementado, parcial, pendiente o bloqueado por configuración externa.

### Documentos

0. [Guía funcional por página](./00-guia-funcional-por-pagina.md) — qué problema resuelve cada pantalla, quién la usa, qué entra y qué resultado produce.
1. [Navegación y sidebar](./01-navegacion-sidebar.md) — grupos, entradas, rutas, filtros de permisos y diferencias entre menú y router.
2. [Secciones frontend](./02-secciones-frontend.md) — mapa ruta → componente, flujos, estados de UI, CRUD y cobertura funcional.
3. [Backend y API](./03-backend-api.md) — registro de rutas, endpoints por dominio, modelos, validación, jobs, webhooks y errores conocidos.
4. [Permisos, seguridad e integraciones](./04-permisos-seguridad-integraciones.md) — roles, scopes, tenant isolation, OAuth, secretos, proveedores y riesgos.

### Fichas funcionales ampliadas

Estas fichas son la referencia página por página para onboarding, soporte, QA y revisión de dependencias:

- [Captación y Organic Leads](./detalle/01-captacion.md)
- [Conversación, Nutrición y Growth](./detalle/02-conversacion-nutricion-growth.md)
- [Ventas y Sistema](./detalle/03-ventas-sistema.md)
- [Rutas auxiliares y flujos](./detalle/04-rutas-auxiliares-y-flujos.md)
- [Evolución orquestada y centro de acción](./05-evolucion-orquestada-y-centro-de-accion.md) — propuesta de producto, experiencia adaptativa, Dashboard de acción, agente coordinador, flujos E2E y roadmap.

## Estado de la evolucion implementada

La experiencia adaptativa y el centro de accion ya tienen una primera implementacion en el repositorio:

- `ExperienceProvider`, onboarding, preferencias persistentes y selector basico/avanzado gobiernan la entrada del usuario.
- `/orquestador` convierte objetivos comerciales en planes explicables por fases, con dependencias, aprobaciones y guardas.
- `ActionCenter` conecta señales del Dashboard con CTAs y con `GET/PATCH /api/dashboard/actions` cuando hay datos reales.
- Las acciones externas siguen protegidas como propuestas o demo de bajo riesgo hasta completar credenciales, workers, webhooks, permisos de plan y persistencia propia.

## Resumen ejecutivo

La plataforma se organiza en seis grupos de sidebar más el Dashboard fijo:

| Grupo | Secciones principales |
|---|---|
| Captación | Campañas, Ads, Redes sociales, Prospect Finder, Landings & webs, Funnels, Organic Leads |
| Conversación | Inbox, Llamadas, Agentes IA, Playbooks, Test de Voz |
| Nutrición | Email marketing, Automatizaciones |
| Growth | Growth Hub |
| Ventas | Leads, Pipeline, Reuniones, Inteligencia comercial |
| Sistema | Insights, Knowledge Base, Configuración, Gobierno empresarial, Control de accesos, Recetas Ads |

La sidebar contiene 25 entradas agrupadas y el Dashboard como entrada fija. El router también contempla páginas públicas, páginas de detalle, rutas de conexión y superficies administrativas que no aparecen necesariamente como una entrada directa del menú.

## Estado global por superficie

| Superficie | Estado | Evidencia / nota |
|---|---|---|
| Shell, login y protección de rutas | Implementado | `src/App.jsx`, `ProtectedRoute`, `AuthContext` |
| Sidebar y filtrado por permisos | Implementado | `src/components/Sidebar.jsx`, `src/lib/navigationPermissions.js` |
| CRM de leads, pipeline, llamadas y reuniones | Implementado con endpoints propios | Ver documento frontend y backend |
| Captación, Ads, campañas, funnels y landings | Implementado/parcial según módulo | Algunas capacidades dependen de Meta, costes o configuración externa |
| Conversación, agentes y voz | Implementado con dependencias de proveedor | Twilio/voz requieren secretos, límites y servicios activos |
| Growth e inteligencia comercial | Implementado/parcial | Métricas y acciones dependen de datos reales y workers |
| Sistema, gobierno y control de accesos | Implementado | Requiere permisos explícitos en servidor |
| Organic Leads | Fase 2 implementada | OAuth Google, discovery y Search Console documentados en `docs/ORGANIC_LEADS_FASE2.md` |
| Integraciones externas | Contratos implementados; activación por entorno | Requieren credenciales, callbacks, migraciones y pruebas reales |

## Arquitectura de acceso

La UI filtra entradas para evitar enlaces que el usuario no puede leer, pero el backend sigue siendo la autoridad. Las decisiones relevantes se toman con:

- identidad autenticada;
- `orgId` del JWT/sesión;
- permiso explícito;
- scope `own`, `team` u `org`;
- estado del recurso, consentimiento, coste o integración cuando aplique.

No se debe interpretar que una entrada visible equivale a permiso de escritura. Las mutaciones y acciones externas tienen permisos separados y validación backend.

## Dependencias operativas pendientes

1. Ejecutar migraciones Prisma en staging antes de probar integraciones nuevas.
2. Configurar secretos y callbacks de Meta, Google, Metricool, Postiz, Mautic y Twilio según el módulo.
3. Ejecutar pruebas de integración con una `TEST_DATABASE_URL` aislada.
4. Resolver los errores TypeScript preexistentes del build global del backend.
5. Revisar los módulos marcados como parciales en el documento frontend antes de declararlos listos para producción.

## Fuentes de verdad

- Navegación: [src/components/Sidebar.jsx](../../src/components/Sidebar.jsx), [src/App.jsx](../../src/App.jsx).
- Permisos de navegación: [src/lib/navigationPermissions.js](../../src/lib/navigationPermissions.js).
- Permisos backend: [backend/src/access-control/catalog.ts](../../backend/src/access-control/catalog.ts).
- Rutas API: [backend/src/routes](../../backend/src/routes).
- Modelo de datos: [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma).
- Documentación de Organic: [ORGANIC_LEADS_IMPLEMENTACION.md](../ORGANIC_LEADS_IMPLEMENTACION.md), [ORGANIC_LEADS_FASE2.md](../ORGANIC_LEADS_FASE2.md).

Este índice describe el estado comprobado del código actual; no convierte automáticamente una capacidad dependiente de proveedor o credenciales en una capacidad operativa.
