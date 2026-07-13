# Plan de implementación por fases

## Fase 0 — Preparación

Objetivo: dejar una base segura sin cambiar el comportamiento del producto.

- Inventariar rutas, componentes, APIs y modelos existentes.
- Crear el registro de módulos.
- Definir permisos y feature flags.
- Añadir `ModuleShell`, estados y patrón de tabla.
- Proteger migraciones y comprobar que no se versionen `.env` ni secretos.

Salida: el sidebar puede renderizar módulos desde configuración y la aplicación existente sigue funcionando.

## Fase 1 — Estructura comercial

- Unificar Leads, Contactos, Empresas y Oportunidades.
- Añadir ficha contextual y timeline.
- Migrar Pipeline y Reuniones al contexto de Ventas.
- Mantener aliases `/leads`, `/pipeline` y `/reuniones`.

Salida: una oportunidad permite consultar su contexto comercial completo.

## Fase 2 — Captación

Orden: Formularios, Audiencias, SEO, Google Business, Scraping, Eventos, Afiliados y Referidos.

Todos deben poder atribuir leads a una fuente y reutilizar audiencias.

Salida: se puede crear una fuente, recibir o importar leads y ver su atribución.

## Fase 3 — Conversación omnicanal

- Crear Inbox Unificado.
- Integrar primero el canal que tenga credenciales y webhooks disponibles.
- Añadir WhatsApp, Chat Web, SMS y después canales sociales.
- Incorporar plantillas, transcripciones, grabaciones y sentimiento como datos de una conversación.

Salida: un contacto tiene un timeline único aunque cambie de canal.

## Fase 4 — Nutrición

- Crear motor de secuencias basado en eventos y condiciones.
- Reutilizar Automatizaciones existentes cuando sea posible.
- Añadir scoring, audiencias dinámicas, contenidos y centro de preferencias.

Salida: un lead puede entrar, salir y cambiar de secuencia con trazabilidad.

## Fase 5 — Operaciones e IA

- Centralita, números, IVR, colas y horarios.
- Monitor de llamadas y calidad.
- Catálogo de agentes, prompts, modelos, voces y conocimiento.
- Simulador y evaluaciones antes de publicar cambios de un agente.

Salida: un agente tiene ciclo de vida borrador → probado → publicado → archivado.

## Fase 6 — Analítica y Sistema

- Dashboard Ejecutivo y métricas de atribución.
- Informes y exportaciones asíncronas.
- Usuarios, roles, equipos, API, webhooks, integraciones, logs y auditoría.

Salida: cada acción administrativa es auditable y los dashboards usan datos persistidos.

## Regla de entrega por fase

No comenzar la fase siguiente si la anterior solo tiene UI simulada. Cada fase debe incluir esquema, API, frontend, permisos, estados de error y pruebas.

## Dependencias entre fases

```text
Fase 0: plataforma base
   ├── Fase 1: CRM y contexto comercial
   │      ├── Fase 2: captación
   │      └── Fase 3: conversación
   │               └── Fase 4: nutrición
   ├── Fase 5: operaciones
   └── Fase 6: IA y analítica avanzada
```

La Fase 1 es la más importante porque Captación, Conversación y Nutrición deben apuntar a los mismos contactos, empresas y oportunidades.

## Fase 0 detallada — Plataforma base

### Entregables

- Registro único de módulos.
- Permisos declarativos y `usePermissions`.
- Feature flags por organización.
- `ModuleShell` y estados comunes.
- Cliente API con errores normalizados.
- `AuditLog` mínimo.
- Política de secretos y `.env.example`.

### Pruebas de salida

- Un módulo no habilitado no aparece.
- Un usuario sin permiso no puede abrir la ruta directa.
- Un error de API se visualiza de forma uniforme.
- Se puede recargar una ruta nueva sin pantalla en blanco.

## Fase 1 detallada — Contexto comercial

### Entregables

- Resolver duplicados de `Lead`, `Contact`, `Company` y `Opportunity`.
- Timeline compartido.
- Asignación a usuario/equipo.
- Vistas lista, kanban y ficha.
- Actividades y tareas.
- Importación básica con deduplicación.

### Decisión de salida

Debe ser posible convertir un lead en oportunidad sin copiar manualmente toda la información y sin perder campaña, fuente o actividad.

## Fase 2 detallada — Captación

### Orden interno

1. Formularios y respuestas.
2. Audiencias reutilizables.
3. Campañas y atribución.
4. Landings/Funnels.
5. SEO.
6. Google Business.
7. Scraping/Bases de datos.
8. Eventos/Afiliados/Referidos.

Se empieza por Formularios porque permite probar la entrada de datos y la conversión a lead sin depender de proveedores publicitarios.

## Fase 3 detallada — Conversación

### Orden interno

1. Modelo Conversation/Message.
2. Inbox interno y asignación.
3. Llamadas y grabaciones existentes.
4. Primer canal externo con webhook disponible.
5. Plantillas y respuestas guardadas.
6. Transcripción y sentimiento.
7. Segundo y siguientes canales.

Nunca crear seis adaptadores de canal copiando la misma lógica. Cada canal implementa una interfaz común.

## Fase 4 detallada — Nutrición

### Orden interno

1. Eventos y motor de ejecución.
2. Acciones internas.
3. Secuencias.
4. Email y newsletter.
5. Scoring.
6. Audiencias dinámicas.
7. Multicanal y push.

El motor debe incluir idempotencia, reintentos, pausa, cancelación y logs antes de añadir muchas acciones.

## Fase 5 detallada — Operaciones e IA

Operaciones y IA pueden avanzar en paralelo si comparten un contrato estable de llamadas, sesiones, agentes y grabaciones.

### Salida de Operaciones

- Monitor con datos reales o estado claramente desconectado.
- Configuración de número, IVR y cola.
- Auditoría de cambios críticos.
- Revisión de grabaciones por permiso.

### Salida de IA

- Versionado de agentes.
- Evaluación antes de publicación.
- Separación entre prompt, modelo, voz y conocimiento.
- Coste y uso visibles.
- Rollback a versión anterior.

## Fase 6 detallada — Analítica y Sistema

La analítica debe construirse sobre eventos y datos de negocio ya estabilizados. No crear dashboards copiando cifras manuales de cada página.

### Entregables

- Catálogo de métricas.
- Consultas versionadas.
- Widgets configurables.
- Jobs de exportación.
- Dashboard Ejecutivo.
- Roles, equipos e integraciones.
- Logs técnicos y auditoría separadas.

## Criterio de priorización

Puntuar cada módulo de 1 a 5:

```text
prioridad = (impacto en ingresos × frecuencia de uso × reutilización de datos)
            - (complejidad × dependencia externa × riesgo legal)
```

No es una fórmula financiera exacta; sirve para evitar priorizar por cantidad de nombres en el menú.
