# Evolución de Vendrava: experiencia guiada, centro de acción y orquestación

**Fecha:** 22 de julio de 2026  
**Propósito:** convertir la plataforma completa en una experiencia clara y orientada a resultados, sin eliminar los módulos ya desarrollados.

## 0. Estado de implementación (22/07/2026)

La primera iteración funcional de esta evolución ya está integrada en el repositorio:

- La experiencia adaptativa se monta en la aplicación mediante `ExperienceProvider`, onboarding persistente, selector de modo básico/avanzado y filtrado de navegación por perfil y módulos recomendados.
- El Dashboard incorpora un centro de acción con señales de leads, pipeline, Ads, Organic Leads, prospectos, llamadas y automatizaciones. Las acciones reales se consultan en `GET /api/dashboard/actions` y su estado se actualiza con `PATCH /api/dashboard/actions/:id`.
- La capa superior está disponible en `/orquestador`. Convierte un objetivo en un plan por fases, dependencias, riesgos, aprobaciones y métricas; `POST /api/orchestration/plan` devuelve una propuesta explicable con `proposal_only` y no ejecuta proveedores externos.
- La ejecución de demostración está limitada a pasos reversibles de bajo riesgo. Ads, publicaciones, emails, llamadas, cambios de presupuesto y otras mutaciones externas permanecen detrás de aprobación e integración real.

La persistencia propia del centro de acción (`ActionItem` + `ActionItemHistory`), los permisos y cuotas por plan, el aislamiento de workspace, el outbox con leases/reintentos/compensación y el worker dedicado ya están implementados. Las integraciones separan `not_configured`, `configured`, `healthy` y `degraded`; no se finge una conexión por tener variables de entorno. El frontend live usa la sesión API, claves de idempotencia y polling del plan; el modo demo solo se activa explícitamente.

El catálogo actual de adaptadores incluye borradores de landing, Ads pausados/activos, publicaciones sociales, email, activación de agentes, seguimientos, movimientos de pipeline, enriquecimiento de prospectos y borradores de secuencias comerciales. Las reejecuciones de aprobación y ejecución se bloquean cuando el plan ya está en cola o ejecutándose; las compensaciones comprueban marcadores de propiedad y estado actual para no sobrescribir cambios manuales.

Pendientes operativos antes de producción comercial: aplicar las migraciones en una base PostgreSQL de staging, levantar Redis y workers, configurar credenciales/callbacks HTTPS/webhooks reales y ejecutar los cuatro recorridos E2E con proveedores conectados. El borrador de secuencia todavía no matricula por sí solo una audiencia ni detiene una secuencia ante respuesta/baja: esa parte requiere el worker de secuencias y sus fixtures de staging. El build local y los tests contractuales no sustituyen esas pruebas de infraestructura. Para la comprobación read-only está disponible [`scripts/critical-flows-smoke.mjs`](../../scripts/critical-flows-smoke.mjs); no crea datos ni sustituye el E2E mutante.

## 1. Resumen ejecutivo

Vendrava ya cubre una parte amplia del ciclo de adquisición y venta: Ads, Organic Leads, Prospect Finder, redes sociales, email marketing, agentes IA, automatizaciones, CRM, pipeline, reuniones, inteligencia comercial y atribución.

La siguiente evolución no consiste en añadir más páginas. Consiste en orquestar las existentes para que el usuario perciba una secuencia sencilla:

```text
Objetivo → plan generado → acciones ejecutadas → leads obtenidos → reuniones → ventas atribuidas
```

La plataforma completa debe permanecer disponible para usuarios avanzados, administradores y agencias. La experiencia inicial, sin embargo, debe adaptarse al tipo de usuario mediante onboarding, navegación simplificada, módulos recomendados, permisos por plan, modo básico/avanzado y paneles por rol.

La propuesta central es que Vendrava evolucione de un conjunto de módulos operativos a un sistema de dirección comercial: detecta qué está ocurriendo, recomienda qué hacer y, con autorización, ejecuta acciones coordinadas en los módulos adecuados.

## 2. Decisiones de producto

### 2.1 Módulos que deben mantenerse visibles como capacidades nucleares

Estos módulos forman la columna vertebral del producto y deben seguir existiendo aunque la navegación se adapte:

| Capacidad | Papel en el resultado |
|---|---|
| Ads | Captar demanda de pago y medir coste por oportunidad y venta |
| Organic Leads | Detectar demanda orgánica y convertir búsquedas en activos comerciales |
| Prospect Finder | Crear mercado potencial cuando todavía no hay suficiente demanda entrante |
| Redes sociales | Distribuir contenido y mantener presencia de marca |
| Email marketing | Nutrir contactos que aún no están preparados para comprar |
| Agentes IA | Contactar, cualificar y responder a escala |
| Pipeline | Gestionar oportunidades y previsión de ingresos |
| Reuniones | Convertir interés en conversaciones comerciales coordinadas |
| Inteligencia comercial | Priorizar decisiones y próximas acciones |
| Automatizaciones | Hacer que el sistema ejecute seguimientos repetibles |

### 2.2 Lo que debe cambiar

No se debe enseñar toda la complejidad al primer acceso. La interfaz debe decidir qué mostrar en función de:

- tipo de negocio;
- objetivo principal;
- rol del usuario;
- plan contratado;
- nivel de madurez digital;
- integraciones conectadas;
- modo básico o avanzado;
- módulos recomendados para el caso concreto.

Esto es una capa de experiencia y gobierno, no una eliminación de funcionalidad.

## 3. Modelo de experiencia adaptativa

### 3.1 Onboarding según tipo de negocio

El onboarding debe producir una configuración inicial útil, no limitarse a recoger datos de perfil.

| Tipo de negocio | Objetivo inicial habitual | Módulos recomendados | Primer resultado esperado |
|---|---|---|---|
| Clínica o negocio local | Conseguir solicitudes y citas en una zona | Organic Leads, Ads, Landing, Inbox, Reuniones | Primera oportunidad local con siguiente acción |
| Servicios B2B | Generar reuniones con empresas objetivo | Prospect Finder, Email, Agentes, Pipeline | Lista priorizada y secuencia de contacto |
| Ecommerce | Aumentar ventas y recuperar demanda | Ads, Redes, Email, Automatizaciones, Insights | Campaña activa con atribución de conversión |
| Agencia | Operar varias cuentas y demostrar rendimiento | Ads, Organic, Redes, Pipeline, Inteligencia comercial | Workspace de cliente con acciones y reporting |
| Profesional independiente | Conseguir y organizar oportunidades | Landing, Organic, Inbox, Pipeline, Automatizaciones | Flujo básico de captación y seguimiento |

### 3.2 Preguntas mínimas del onboarding

1. ¿Qué vendes y a quién?
2. ¿En qué ubicación o mercado operas?
3. ¿Cuál es tu objetivo para los próximos 30, 60 o 90 días?
4. ¿Qué valor tiene para ti un cliente nuevo?
5. ¿Qué canales ya utilizas?
6. ¿Qué activos tienes disponibles: web, landing, pixel, CRM, lista de contactos, cuentas publicitarias?
7. ¿Qué puede ejecutar Vendrava automáticamente y qué debe aprobar una persona?

El resultado debe ser un perfil operativo que configure recomendaciones, permisos, widgets del Dashboard y orden de activación de módulos.

### 3.3 Navegación por niveles

#### Modo básico

Muestra únicamente el camino necesario para el objetivo seleccionado. Incluye:

- Dashboard de acciones;
- Leads;
- Pipeline;
- Reuniones;
- el canal de captación recomendado;
- automatizaciones esenciales;
- configuración de integraciones pendientes.

#### Modo avanzado

Expone la plataforma completa, incluyendo configuración granular de Ads, agentes, playbooks, recetas, gobierno, insights, conocimiento e integraciones.

El cambio de modo debe ser reversible y no debe perder configuraciones. Al activar el modo avanzado, la plataforma puede mostrar una explicación breve de cada grupo antes de abrirlo.

### 3.4 Módulos recomendados

Cada módulo debe tener un estado visible:

- **Recomendado:** resuelve una necesidad directa del objetivo.
- **Listo para activar:** tiene sus dependencias configuradas.
- **Pendiente de conexión:** necesita credenciales, permisos o datos.
- **En observación:** está activo, pero aún no tiene volumen suficiente.
- **No prioritario:** existe, pero no es necesario para el objetivo actual.

La recomendación debe incluir siempre motivo, impacto esperado, esfuerzo, dependencia y acción siguiente. Nunca debe presentarse como una obligación técnica sin contexto de negocio.

## 4. Paneles por perfil

La misma plataforma puede tener paneles diferentes sin duplicar la lógica de negocio.

| Perfil | Pregunta principal | Elementos prioritarios |
|---|---|---|
| Comercial | ¿A quién debo contactar y qué oportunidad debo mover? | Leads nuevos, tareas vencidas, oportunidades estancadas, reuniones, próxima acción |
| Administrador | ¿Está funcionando el sistema y hay riesgos? | Integraciones, errores, permisos, consumo, automatizaciones fallidas, auditoría |
| Agencia | ¿Qué cliente necesita atención y qué resultado puedo demostrar? | Salud por cuenta, coste, leads, reuniones, ingresos atribuidos, alertas y reporting |
| Dirección | ¿Qué resultado está generando la inversión? | Pipeline, ingresos, CAC, conversión por canal, previsión y decisiones recomendadas |
| Operador de marketing | ¿Qué canal y activo debo optimizar? | Campañas, búsquedas, anuncios, contenidos, landings, entregabilidad y experimentos |

El panel debe construirse con widgets configurables sobre una misma capa de datos, permisos y eventos. No conviene crear dashboards aislados que calculen métricas distintas.

## 5. Dashboard como centro de acción

### 5.1 Cambio de enfoque

El Dashboard no debe limitarse a resumir actividad pasada. Debe responder:

1. ¿Qué ha cambiado?
2. ¿Qué riesgo o oportunidad requiere atención?
3. ¿Qué acción concreta se recomienda?
4. ¿Quién debe ejecutarla?
5. ¿Qué resultado se espera y cómo se medirá?

### 5.2 Tipos de acciones que debe detectar

- `lead_without_contact`: lead nuevo sin primer contacto;
- `stalled_opportunity`: oportunidad sin avance durante el umbral configurado;
- `campaign_efficiency`: campaña con gasto, reunión o venta que requiere decisión;
- `organic_opportunity`: búsqueda con intención comercial sin landing o contenido adecuado;
- `prospect_match`: prospectos que coinciden con el cliente ideal;
- `agent_availability`: llamadas perdidas por disponibilidad o configuración;
- `automation_error`: automatización fallida o pausada;
- `integration_expiring`: token, webhook o conexión próxima a caducar;
- `pipeline_risk`: previsión en riesgo por falta de actividad;
- `attribution_gap`: ingreso o conversión sin fuente trazable.

### 5.3 Contrato de una acción

Cada tarjeta del Dashboard debe contener:

| Campo | Contenido |
|---|---|
| Título | La situación expresada en lenguaje de negocio |
| Evidencia | Datos y periodo que justifican la recomendación |
| Prioridad | Urgente, alta, media o baja |
| Impacto | Leads, reuniones, ingresos, coste o riesgo afectado |
| Responsable | Persona, equipo o agente asignado |
| Acción principal | CTA concreta: contactar, corregir, crear, revisar o aprobar |
| Acción secundaria | Ver detalle, posponer, descartar o cambiar responsable |
| Dependencias | Integración, permiso, presupuesto o información faltante |
| Estado | Nueva, aceptada, en curso, completada, descartada o bloqueada |
| Resultado | Métrica que permitirá saber si funcionó |

### 5.4 Ejemplos de acciones

| Señal | Mensaje | CTA |
|---|---|---|
| 12 leads sin contactar | “Tienes 12 leads nuevos sin contactar desde ayer.” | Abrir cola priorizada |
| 4 oportunidades estancadas | “Hay 4 oportunidades sin actividad durante 7 días.” | Crear tareas de seguimiento |
| Campaña eficiente | “Esta campaña ha gastado 180 € y generado una reunión.” | Ver atribución y recomendar presupuesto |
| Oportunidad orgánica | “Hay una búsqueda comercial sin landing adecuada.” | Generar landing para revisión |
| Prospectos coincidentes | “6 prospectos coinciden con tu cliente ideal.” | Revisar e importar |
| Problema del agente | “El agente perdió 3 llamadas por falta de disponibilidad.” | Corregir horario y reintentar |
| Automatización fallida | “Hay 2 automatizaciones con errores.” | Diagnosticar ejecuciones |

### 5.5 Orden de prioridad

La prioridad no debe depender solo del recuento de eventos. Debe combinar:

```text
Prioridad = impacto económico × urgencia × probabilidad de conversión × confianza de los datos
```

La fórmula puede comenzar como regla explicable y evolucionar después hacia modelos aprendidos. El usuario debe poder ver por qué una acción aparece arriba.

## 6. Capa superior de orquestación

### 6.1 Propuesta

Encima de los módulos debe existir una capa de dirección capaz de recibir un objetivo comercial, convertirlo en un plan, pedir aprobaciones, ejecutar acciones mediante los módulos existentes y medir el resultado.

Ejemplo de objetivo:

> “Quiero conseguir 20 pacientes de implantes en Valencia durante los próximos 60 días.”

### 6.2 Flujo de ejecución

```text
Objetivo del usuario
        ↓
Diagnóstico de datos, activos y restricciones
        ↓
Plan propuesto con fases, coste, responsables y métricas
        ↓
Aprobaciones humanas para acciones sensibles
        ↓
Adaptadores de Ads, Organic, Prospects, Redes, Email, IA y CRM
        ↓
Eventos, resultados, atribución y alertas
        ↓
Recomendaciones de optimización
        ↺ aprendizaje y nuevo ciclo de planificación
```

### 6.3 Componentes funcionales

| Componente | Responsabilidad |
|---|---|
| Director | Entender el objetivo, restricciones y contexto del negocio |
| Diagnóstico | Comprobar datos, activos, integraciones y puntos de partida |
| Planificador | Proponer fases, acciones, presupuesto, dependencias y métricas |
| Adaptadores de módulo | Traducir una acción de alto nivel a operaciones de cada módulo |
| Motor de aprobaciones | Bloquear gasto, publicaciones o contactos sensibles hasta autorización |
| Orquestador | Ejecutar pasos en orden, reintentar y gestionar bloqueos |
| Bus de eventos | Comunicar leads, cambios de etapa, respuestas, reuniones y errores |
| Atribución | Relacionar coste, contacto, reunión, oportunidad, venta e ingreso |
| Observabilidad | Registrar quién hizo qué, cuándo, con qué resultado y con qué error |
| Memoria | Guardar decisiones, preferencias, resultados y reglas aprobadas |

### 6.4 Límites de autonomía

El agente superior puede recomendar automáticamente, pero debe pedir aprobación antes de:

- gastar presupuesto nuevo o aumentarlo por encima del límite;
- publicar anuncios o contenido que no haya sido revisado;
- enviar una secuencia a una audiencia no validada;
- modificar precios, ofertas, políticas o mensajes sensibles;
- borrar datos o cambiar permisos;
- alterar la configuración de un agente que atiende llamadas reales.

Las acciones de bajo riesgo —crear borradores, ordenar tareas, resumir resultados, detectar errores o sugerir una landing— pueden ejecutarse en modo asistido.

## 7. Ejemplo de plan coordinado

Para el objetivo de 20 pacientes de implantes en Valencia durante 60 días, el Director podría proponer:

### Fase 1: diagnóstico

- revisar datos históricos de Leads, Pipeline y Reuniones;
- analizar búsquedas de Organic Leads y cobertura local;
- comprobar cuenta Ads, pixel, eventos y límites de presupuesto;
- verificar disponibilidad del agente y calendario de reuniones;
- identificar landings, playbooks y conocimiento existentes.

### Fase 2: preparación de activos

- seleccionar búsquedas con intención comercial;
- proponer una landing de implantes en Valencia;
- preparar campaña Ads y variaciones de anuncios;
- crear publicaciones educativas para redes;
- ajustar playbook y Knowledge Base del agente;
- preparar automatización de respuesta y recordatorio.

### Fase 3: activación

- publicar solo después de las aprobaciones configuradas;
- activar captación y formularios;
- crear cola de leads con prioridad por intención y valor;
- asignar agente, comercial y horarios;
- activar seguimiento de email y reuniones.

### Fase 4: monitorización

- controlar coste por lead, contacto y reunión;
- detectar oportunidades estancadas;
- revisar llamadas perdidas, objeciones y disponibilidad;
- comparar Organic, Ads y prospecting;
- sugerir redistribución de presupuesto o cambios de mensaje.

### Fase 5: atribución y aprendizaje

- registrar reuniones y oportunidades generadas;
- conectar cierres e ingresos con la fuente;
- calcular coste por paciente y retorno;
- guardar qué mensajes, audiencias y activos funcionaron;
- generar el siguiente plan con las decisiones aprendidas.

## 8. Flujos de extremo a extremo que deben validarse

La existencia de una ruta no demuestra que el flujo completo esté operativo. Cada flujo debe probarse con datos reales o de staging, permisos correctos, credenciales, workers, webhooks y fallos controlados.

### 8.1 Flujo Ads

```text
Anuncio → landing → formulario → lead → contacto → reunión → oportunidad → venta → atribución del ingreso
```

Pruebas mínimas:

- evento de conversión recibido una sola vez;
- lead creado con fuente, campaña y anuncio;
- contacto asignado y seguimiento disparado;
- reunión vinculada al lead y a la oportunidad;
- cierre e ingreso reflejados en atribución;
- presupuesto, permisos y errores visibles para el administrador.

### 8.2 Flujo orgánico

```text
Search Console → oportunidad → contenido o landing → tráfico → lead → reunión → venta
```

Pruebas mínimas:

- OAuth y selección de propiedad correctos;
- búsqueda real con intención comercial;
- recomendación de activo basada en datos;
- landing o contenido asociado a la oportunidad;
- conversión vinculada a la consulta o activo cuando exista evidencia;
- diferenciación clara entre dato real, estimación y recomendación.

### 8.3 Flujo de prospección

```text
Prospect Finder → importación → enriquecimiento → secuencia → respuesta → reunión → pipeline
```

Pruebas mínimas:

- deduplicación por organización, dominio y contacto;
- consentimiento y reglas de contacto verificadas;
- enriquecimiento con fuente y fecha;
- secuencia pausada ante respuesta, baja o error;
- reunión y oportunidad vinculadas al prospecto original;
- trazabilidad de coste y proveedor externo.

### 8.4 Flujo IA

```text
Knowledge Base → playbook → agente → llamada → resumen → tarea → seguimiento → cierre
```

Pruebas mínimas:

- el agente usa solo conocimiento publicado y vigente;
- el playbook determina preguntas, criterios y salida;
- la llamada queda registrada con estado y proveedor;
- resumen y tareas se generan sin duplicados;
- el seguimiento respeta consentimiento y horario;
- el cierre actualiza Pipeline, Reuniones e Insights.

### 8.5 Matriz de dependencias críticas

| Dependencia | Flujos afectados | Evidencia necesaria |
|---|---|---|
| Credenciales OAuth | Ads, Organic, Redes, Email | Conexión válida, scopes y renovación |
| Migraciones Prisma | Todos los módulos con persistencia | Migración aplicada en entorno de prueba |
| Workers/colas | Automatizaciones, email, IA, sincronizaciones | Ejecución, reintento y dead-letter comprobados |
| Webhooks | Ads, formularios, llamadas y proveedores | Firma validada, idempotencia y respuesta 2xx |
| Permisos | Todos | Denegación backend y visibilidad coherente en UI |
| Atribución | Ads, Organic, prospecting y ventas | Cadena completa hasta ingreso |
| Datos reales | Dashboard, Insights e Inteligencia | Métricas reproducibles y periodo definido |

## 9. Estado actual y criterio de realidad

La plataforma debe comunicarse con tres estados distintos:

| Estado | Significado |
|---|---|
| Implementado en código | Existe ruta, UI o contrato API comprobado |
| Operativo con configuración | Funciona cuando están activas credenciales, migraciones, workers y permisos |
| Validado de extremo a extremo | Se probó el recorrido completo con resultado y atribución verificables |

No se debe presentar como “listo” un módulo que solo tiene la pantalla o el contrato de integración. La documentación debe marcar explícitamente qué falta para pasar de implementado a operativo y de operativo a validado.

## 10. Roadmap recomendado

### Fase 0: instrumentación y verdad operativa

- inventariar eventos de cada flujo;
- etiquetar dependencias por entorno;
- definir datos mínimos y estados de error;
- crear pruebas de integración aisladas;
- completar la matriz de permisos y proveedores.

### Fase 1: Dashboard de acción

- crear el modelo `ActionItem` o equivalente;
- generar acciones a partir de señales existentes;
- incluir evidencia, prioridad, responsable y CTA;
- permitir aceptar, completar, posponer y descartar;
- registrar impacto y resultado.

### Fase 2: experiencia adaptativa

- onboarding por tipo de negocio;
- perfiles de objetivo;
- navegación básica/avanzada;
- módulos recomendados y dependencias;
- paneles por rol;
- permisos por plan sin duplicar lógica backend.

### Fase 3: orquestación asistida

- recibir objetivos en lenguaje natural;
- generar diagnóstico y plan editable;
- ejecutar borradores y tareas de bajo riesgo;
- pedir aprobación para gasto, publicación y contacto masivo;
- mostrar el plan como una secuencia observable.

### Fase 4: optimización coordinada

- conectar resultados de campañas, contenido, agentes y pipeline;
- recomendar cambios de presupuesto, mensajes, horarios y asignaciones;
- calcular valor esperado y retorno real;
- aprender de decisiones aprobadas y resultados cerrados.

## 11. Empaquetado comercial y permisos

Los planes deben limitar capacidad y autonomía, no romper la coherencia de la plataforma.

| Nivel | Experiencia | Capacidades |
|---|---|---|
| Básico | Guiada | Dashboard de acción, un objetivo, módulos recomendados y tareas asistidas |
| Growth | Multicanal | Ads, Organic, Redes, Email, automatizaciones y recomendaciones coordinadas |
| Pro | Comercial | Agentes IA, Prospect Finder, Pipeline avanzado, reuniones e inteligencia |
| Agencia/Enterprise | Multiworkspace y gobierno | Varias cuentas, roles, aprobaciones, auditoría, límites y reporting |

El backend debe comprobar plan, organización, rol, scope y acción. Ocultar un botón no es una medida de seguridad suficiente.

## 12. Métricas de éxito

### Producto y experiencia

- tiempo desde el primer acceso hasta el primer plan generado;
- porcentaje de usuarios que completan onboarding;
- porcentaje que activa al menos un módulo recomendado;
- acciones del Dashboard aceptadas y completadas;
- usuarios que necesitan pasar a modo avanzado;
- tiempo para encontrar la siguiente acción.

### Resultado comercial

- leads generados por canal;
- porcentaje de leads contactados en plazo;
- reuniones generadas y celebradas;
- oportunidades que avanzan de etapa;
- ingresos atribuidos;
- coste por lead, reunión, oportunidad y venta;
- porcentaje de oportunidades estancadas;
- porcentaje de automatizaciones y llamadas con error.

### Calidad de la orquestación

- planes aprobados sin edición;
- acciones bloqueadas por dependencias detectadas correctamente;
- tasa de ejecuciones duplicadas o fallidas;
- porcentaje de recomendaciones con evidencia suficiente;
- tiempo desde señal hasta recomendación;
- decisiones humanas que mejoran el resultado del siguiente ciclo.

## 13. Riesgos y controles

| Riesgo | Control recomendado |
|---|---|
| Sobrecarga de interfaz | Modo básico, onboarding y módulos recomendados |
| Automatizar acciones erróneas | Aprobaciones, límites, simulación y rollback |
| Métricas inconsistentes | Capa común de eventos, periodos y definiciones |
| Atribución incompleta | Identificadores persistentes desde captación hasta ingreso |
| Dependencia de proveedores | Health checks, expiración visible y fallbacks controlados |
| Agente con conocimiento obsoleto | Publicación/versionado de Knowledge Base y fecha de vigencia |
| Gasto no autorizado | Presupuestos, roles, doble aprobación y registro de auditoría |
| Confundir demo con producción | Etiquetas explícitas de estado operativo y evidencia |
| Usuarios sin contexto | Explicación del porqué, impacto, fuente y siguiente paso |

## 14. Definición de terminado

La evolución puede considerarse lista para validación comercial cuando:

- cada perfil entra en un onboarding coherente con su objetivo;
- el Dashboard muestra acciones priorizadas y no solo métricas;
- cada acción tiene evidencia, responsable, CTA y resultado medible;
- el usuario puede trabajar en modo básico y abrir el modo avanzado cuando lo necesita;
- el agente coordinador genera planes editables y respeta aprobaciones;
- Ads, Organic, prospecting, IA, CRM y automatizaciones están conectados por eventos;
- los cuatro flujos de extremo a extremo se prueban en staging;
- ingresos y ventas se pueden atribuir con un nivel de confianza explícito;
- los fallos de credenciales, workers, webhooks y permisos son visibles;
- existen al menos uno o varios negocios reales usando el sistema durante un periodo medible.

## 15. Conclusión estratégica

La decisión correcta no es reducir Vendrava quitando capacidades. Es colocar una capa de claridad y dirección encima de lo que ya existe.

La promesa no debe ser “tenemos muchos módulos”, sino:

> Define un objetivo comercial y Vendrava te muestra el plan, coordina las acciones, avisa de los bloqueos y conecta el trabajo con los leads, las reuniones y las ventas.

La prioridad inmediata es comprobar los flujos completos y construir el Dashboard de acción. Después, la experiencia adaptativa y la orquestación asistida pueden convertir la amplitud funcional actual en una ventaja comercial defendible para agencias, negocios locales y equipos comerciales.

## Documentación relacionada

- [Guía funcional por página](./00-guia-funcional-por-pagina.md)
- [Auditoría y documentación integral](./00-indice-auditoria-plataforma.md)
- [Secciones frontend](./02-secciones-frontend.md)
- [Backend y API](./03-backend-api.md)
- [Permisos, seguridad e integraciones](./04-permisos-seguridad-integraciones.md)
