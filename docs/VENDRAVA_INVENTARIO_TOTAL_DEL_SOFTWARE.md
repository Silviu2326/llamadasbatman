# Vendrava — inventario total del software

**Fecha de corte:** 19 de agosto de 2026  
**Estado:** release candidate técnico; no equivale todavía a producción abierta  
**Objetivo:** explicar, en un único documento, qué contiene realmente el repositorio, cómo se relacionan sus partes, qué valor genera y cuáles son sus puntos fuertes y límites actuales.

---

## 1. Resumen ejecutivo

Vendrava ya no es únicamente un CRM con llamadas ni un generador de campañas. Es una plataforma operativa que une:

- captación pagada y orgánica;
- CRM, conversaciones, reuniones y pipeline;
- agentes de voz y automatización;
- contenido, landings, Ads, email y redes sociales;
- Studio audiovisual;
- 147 microapps especializadas;
- elección y routing entre proveedores de IA;
- Jobs, activos, costes, Wallet y trazabilidad;
- Flows con aprobaciones humanas;
- Marketplace de recetas declarativas;
- operación de agencia, white-label y API para desarrolladores;
- seguridad multiempresa, permisos, consentimiento y auditoría.

La idea central del producto es ésta:

> Una empresa define un resultado, Vendrava combina datos, herramientas, proveedores y aprobaciones para producirlo, conserva la procedencia de lo generado y permite medir su coste y su resultado comercial.

### Cifras verificadas del repositorio

| Superficie | Estado actual |
|---|---:|
| Microapps registradas | **147** |
| Microapps por categoría | 11 research, 39 sales, 33 content, 31 data, 25 studio, 8 success |
| Proveedores catalogados | **12** |
| Capabilities normalizadas | **14** |
| Recetas Flow de sistema | **5** |
| Declaraciones de ruta frontend | **67**: 13 públicas, 53 protegidas y fallback |
| Accesos de primer nivel que compiten por la sidebar | **38** |
| Grupos de rutas backend | **64** |
| Modelos Prisma | **139** |
| Roles de producto | **10**, más 2 roles legacy |
| Permisos RBAC | **85** |
| Suite backend | **523/523 pruebas verdes** |
| Build frontend | Vite correcto, 721 módulos |

---

## 2. Qué problema resuelve

Las empresas suelen operar marketing, ventas, contenido, vídeo, voz, proveedores de IA y reporting en aplicaciones separadas. Eso genera cinco problemas:

1. Los datos se copian de una herramienta a otra.
2. No queda claro qué modelo o proveedor produjo cada resultado.
3. El coste de IA se mezcla con suscripciones y trabajo humano.
4. Las acciones externas se ejecutan sin una cadena clara de aprobación.
5. Marketing produce actividad, pero cuesta relacionarla con reuniones, oportunidades e ingresos.

Vendrava intenta convertir ese conjunto de herramientas en un sistema común:

```text
Objetivo comercial
  → datos y contexto de la organización
  → microapp, Flow o módulo operativo
  → router de capacidades y proveedor
  → Job + presupuesto + trazabilidad
  → activo, informe, acción o publicación
  → atribución, resultado y aprendizaje
```

---

## 3. Las capas del producto

### 3.1 Capa de negocio

Contiene campañas, leads, cuentas, conversaciones, llamadas, reuniones, oportunidades, tareas, productos, ingresos, costes y actividad comercial.

### 3.2 Capa de ejecución

Contiene automatizaciones, Flows, microapps, Jobs, acciones, esperas, condiciones, mapas, aprobaciones, reintentos y conciliación.

### 3.3 Capa de inteligencia

Contiene modelos LLM, búsqueda web, generación y mejora de imagen, vídeo, voz, análisis determinista, recomendaciones y routing de proveedores.

### 3.4 Capa de activos

Contiene archivos, versiones, relaciones de genealogía, permisos, publicación inmutable, fuentes, consentimientos y entregables audiovisuales.

### 3.5 Capa económica

Contiene estimaciones, UsageRecord, Wallet, reservas, settlement, BYOK, coste gestionado, margen, tarifas y revenue share del Marketplace.

### 3.6 Capa de gobierno

Contiene organizaciones, membresías, roles, scopes, aprobaciones sensibles, consentimiento, auditoría, API keys, webhooks y separación de funciones.

---

## 4. Dirección y coordinación

### Dashboard — `/dashboard`

Centro diario de la organización:

- KPIs de captación, llamadas, reuniones, pipeline e ingresos;
- actividad reciente;
- prioridades y siguientes acciones;
- accesos a entidades que requieren atención;
- cambio de experiencia según perfil, negocio, objetivo y plan.

### Objetivos / Orquestador — `/orquestador`

Convierte un objetivo en un plan coordinado:

- objetivo, plazo, presupuesto y resultado esperado;
- acciones locales y externas;
- dependencias, coste, aprobación e idempotencia;
- ejecución, pausa, rechazo, reversión y seguimiento;
- relación con campañas, landings, leads, secuencias, agentes y tareas.

### Plan de crecimiento — `/plan`

Ayuda a decidir qué hacer y cuánto podría producir:

- lectura del embudo actual;
- proyección de capacidad y presupuesto;
- detección de etapa débil;
- escenarios y advertencias cuando el gasto no se sostiene;
- recomendaciones basadas en datos disponibles, sin inventar ingresos.

### Centro de acciones

Superficie transversal integrada con Dashboard y orquestación:

- acciones pendientes, responsables y prioridad;
- historial de cambios;
- referencias al objeto de negocio;
- estados operativos y trazabilidad.

---

## 5. Captación y marketing

### Campañas — `/campanas` y `/campanas/:id`

- creación y gestión de iniciativas;
- objetivo, presupuesto, estado y activos;
- relación con landing, publicaciones, formularios y leads;
- página pública compartible por token;
- atribución y actividad.

### Ads — `/ads`, `/captacion/nueva`, `/captacion/conectar`

- conexión OAuth con Meta;
- campañas, conjuntos, anuncios e insights;
- Ads Wizard con objetivo, audiencia, creatividad, copy, presupuesto y landing;
- borradores y propuestas antes de publicar;
- publicación pausada y activación separada;
- señales de conversión, experimentos y políticas de optimización;
- autonomía graduada, freno de emergencia y guardas de contenido sensible.

### Recetas Ads — `/admin/ad-playbooks`

- biblioteca global de patrones;
- creación y edición de recetas;
- estructura de audiencias, copies y objetivos;
- revisión y permisos administrativos.

### Redes sociales — `/redes-sociales`

- conexiones y perfiles mediante Metricool;
- borradores y publicaciones programadas;
- texto, imagen, vídeo, enlaces y CTA;
- relación con campaña, landing y UTM;
- métricas y atribución.

### Prospect Finder — `/prospectos`

- búsqueda por sector, ubicación, tamaño y perfil;
- enriquecimiento público;
- importación a CRM;
- creación de cuentas, leads, segmentos y secuencias;
- preparación de contacto posterior.

### Landings y webs — `/landings` y `/l/:slug`

- creación, versión, preview y publicación;
- contenido, propuesta, formularios y CTA;
- slugs y páginas públicas;
- campañas y UTMs;
- eventos, rollups, snapshots, variantes y decisiones de autonomía;
- relación de visita con lead, reunión y oportunidad.

### SEO — `/seo`, `/audita/:slug`, `/seo-informe/:token`

- auditoría técnica y comercial;
- informes públicos por token;
- proyectos, palabras clave y rankings;
- oportunidades, checklist y score;
- detección de canibalización;
- refresh y seguimiento de informes.

### Captación orgánica — `/organic`

- proyectos orgánicos;
- conexión con Search Console y Google Business Profile;
- consultas, páginas, clics, impresiones, CTR y posición;
- oportunidades comerciales orgánicas;
- activos, reglas, acciones y recomendaciones;
- tráfico diario y snapshots por canal;
- visibilidad local y señales de sistemas de IA;
- autonomía por niveles con shadow mode, cooldown y límites.

### Funnels — `/funnels`

- recorrido desde visita hasta ingreso;
- volumen y conversión por etapa;
- conexión con campaña, landing, lead, reunión y oportunidad;
- lectura de puntos de fuga.

---

## 6. CRM, ventas y revenue

### Leads — `/leads` y `/leads/:id`

- alta, importación, búsqueda, filtros y asignación;
- estado, origen, responsable, campaña y prioridad;
- notas, archivos, auditoría y consentimiento;
- historial de llamadas, mensajes, emails y reuniones;
- vínculo con Account y oportunidades;
- pestaña de investigación con MicroappRun vinculados;
- lanzamiento contextual de microapps.

### Accounts

Entidad empresarial transversal aunque no tenga una entrada propia en la sidebar:

- dominio, industria, tamaño, lifecycle y owner;
- leads, oportunidades, reuniones y actividad;
- contexto compartido para research, margen, QBR y expansión;
- aislamiento por organización.

### Pipeline — `/pipeline` y `/pipeline/:id`

- tablero de oportunidades por etapa;
- valor, probabilidad, forecast y fecha esperada;
- historial de etapa;
- contactos y roles de compra;
- productos y line items;
- tareas y siguiente paso;
- ganar, perder, reabrir y atribuir.

### Reuniones — `/reuniones` y `/reuniones/:id`

- lista y calendario;
- creación, confirmación, reprogramación, cancelación y cierre;
- participantes, acuerdos, resultado y próximos pasos;
- relación con lead, cuenta, llamada, campaña y oportunidad.

### Inteligencia comercial — `/inteligencia-comercial`

- ingresos atribuidos;
- costes por lead, reunión y oportunidad;
- conversión entre etapas;
- forecast y oportunidades estancadas;
- comparación por canal, campaña y equipo;
- memoria operativa y experimentos de revenue.

### Tareas y actividad

- tareas con prioridad, estado, vencimiento y responsable;
- SalesActivity para llamadas, mensajes, emails, notas, archivos y cambios;
- relación con leads, cuentas y oportunidades;
- automatización e idempotencia.

---

## 7. Conversaciones, llamadas y agentes

### Bandeja de entrada — `/conversacion/inbox`

- conversaciones por contacto, canal y estado;
- mensajes, plantillas e intentos de entrega;
- asignación y seguimiento;
- relación con lead, campaña y oportunidad;
- WhatsApp y otros canales conectados.

### Llamadas — `/llamadas` y `/llamadas/:id`

- llamadas entrantes y salientes;
- búsqueda, filtros, estados y resultados;
- transcripción, resumen, sentimiento y señales;
- tareas posteriores;
- evaluación y trazas de voz;
- relación con lead, reunión y oportunidad.

### Agentes IA — `/agentes` y `/agentes/:id`

- agentes de ventas, recepción, cualificación, agenda, soporte, recobro y filtro;
- dirección entrante o saliente;
- voz, tono, comportamiento y reglas;
- knowledge base y playbooks;
- cualificación, transferencia y acciones posteriores;
- activación, actividad y resultados.

### Playbooks — `/playbooks` y `/playbooks/:id`

- pasos, preguntas, respuestas y criterios;
- asignación a agentes y procesos;
- versiones, publicación y aprobación;
- catálogo global administrable.

### Cabina de voz — `/voz/cabina`

Pipeline actual:

```text
PCM16 16 kHz
  → Cartesia Ink-2 para STT y turnos
  → Cerebras gpt-oss-120b para respuesta en streaming
  → MiniMax Speech 2.8 para TTS
  → PCM16 24 kHz / telefonía
```

Incluye:

- barge-in semántico;
- especulación al final de turno;
- SpeechChunker para reducir latencia percibida;
- emoción derivada de señal y timestamps;
- “guru” estratégico fuera del camino crítico;
- disclosure, consentimiento, opt-out y transferencia;
- timeline, métricas P50/P95, salud de audio y demo local.

Límite actual: el pipeline operativo documentado está restringido a inglés y todavía requiere prueba integrada con los tres proveedores reales.

---

## 8. Nutrición, contenido y crecimiento

### Email marketing — `/email-marketing`

- campañas, plantillas, audiencias y programación;
- envíos, aperturas, clics, respuestas, rebotes y bajas;
- Mautic y Resend;
- consentimiento, supresión y preferencias;
- variantes y atribución de revenue.

### Automatizaciones — `/automatizaciones` y `/automatizaciones/:id`

- triggers de negocio;
- condiciones, esperas, ramas y acciones;
- snapshots versionados;
- ejecuciones y pasos;
- outbox, leases e idempotencia;
- email, tareas, CRM, pipeline, llamadas y otros módulos.

### Growth Hub — `/growth`

- programas de crecimiento;
- objetivo, audiencia, presupuesto y duración;
- activos y acciones coordinadas;
- aprobaciones y activación;
- campañas, emails, landings, redes y seguimiento.

### Motor de contenido

- ContentOpportunity a partir de conversaciones y datos;
- ContentPiece por canal y formato;
- especificidad y rechazo de texto genérico;
- crítico adversario y comprobación de claims;
- PII y procedencia;
- aprobación pública por token;
- publicación y atribución por pieza;
- oportunidades, cadencia y reutilización.

### Knowledge Base — `/knowledge-base` y `/knowledge-base/articulos/:id`

- artículos, categorías, favoritos y búsqueda;
- PDF, DOC, DOCX, TXT, Markdown, CSV y JSON;
- procesamiento y conversión en contenido consultable;
- fuentes para agentes, microapps y playbooks;
- edición, eliminación y relaciones.

---

## 9. Plataforma abierta de IA

### Centro de conexiones — `/conexiones`

- catálogo derivado del registro real de proveedores;
- credenciales BYOK por organización y slot;
- estados connected, revoked, needs_reauth y error;
- test no destructivo cuando el proveedor lo soporta;
- cifrado, redacción y rotación de credenciales;
- impacto de una desconexión sobre Flows y automatizaciones.

### Router de capacidades

Decide proveedor según:

- capability solicitada;
- credencial disponible;
- BYOK o gestionado;
- calidad draft, standard o premium;
- coste máximo;
- latencia y límites;
- exclusiones y circuit breaker;
- preferencia explícita.

La decisión y las alternativas quedan persistidas y visibles.

### Centro de trabajos — `/trabajos`

- Jobs pendientes, en ejecución, esperando proveedor, completados o fallidos;
- cancelación solicitada y cancelación remota;
- reintentos seguros;
- leases y polling;
- costes estimados y reales;
- decisiones de routing;
- relación padre/hijo para microapps y media.

### Biblioteca de activos — `/activos`

- imágenes, audio, vídeo y documentos;
- acceso privado, publicación e URL pública inmutable;
- versiones;
- relaciones N:M y genealogía;
- deduplicación;
- inputs, outputs, proveedor, job y procedencia;
- consentimiento heredado y restricciones.

### Usage, Wallet y costes

- UsageRecord idempotente;
- coste proveedor y precio cliente separados;
- Decimal de alta precisión;
- Wallet y transacciones;
- holds con caducidad;
- reserva, settlement, release y top-up;
- Stripe Checkout y webhook;
- comparación BYOK frente a gestionado;
- métricas de margen y ahorro del router.

---

## 10. Los 12 proveedores registrados

| Proveedor | Modalidad | Capacidades | Enrutamiento común |
|---|---|---|---|
| DeepSeek | Gestionado | `llm.generate` | Sí |
| OpenAI Responses API | BYOK | `llm.generate` | Sí |
| OpenAI Imágenes | Gestionado | `image.generate` | Sí |
| Chatterbox | Gestionado | `audio.tts` | Sí |
| ElevenLabs | Gestionado | `audio.tts` | Sí |
| Brave Search | Gestionado | `web.search` | Sí |
| Magnific | Gestionado y BYOK | `image.upscale` | Sí |
| Runway | Gestionado y BYOK | `video.generate`, `video.upscale` | Sí |
| Twilio | Gestionado y BYOK | llamadas y SMS | Conector legacy catalogado |
| Resend | Gestionado | email transaccional | Conector legacy catalogado |
| Metricool | Gestionado y BYOK | publicación y métricas sociales | Conector legacy catalogado |
| Meta | Gestionado | publicación e insights Ads | Conector legacy catalogado |

Las 14 capabilities normalizadas son: `llm.generate`, `web.search`, `image.generate`, `image.upscale`, `video.generate`, `video.upscale`, `audio.tts`, `call.outbound`, `messaging.sms`, `email.transactional`, `social.publish`, `social.metrics`, `ads.publish` y `ads.insights`.

---

## 11. Microapps — 147 recetas ejecutables

Una microapp declara:

- ID y versión;
- promesa y categoría;
- input y output Zod;
- formulario de UI;
- permisos de datos;
- capabilities de proveedor;
- efecto local o externo;
- coste estimado;
- caducidad;
- handler;
- evidencias y siguientes acciones.

Cada ejecución crea un Job y un MicroappRun. Los resultados pueden vincularse a Lead, Account o Production.

### 11.1 Las 21 recetas iniciales y auxiliares

1. Investigador de empresa 360.
2. Preparador de llamada.
3. Diagnóstico comercial de prospecto.
4. Investigador de invitados para podcast.
5. Minero de voz del cliente.
6. Un contenido, doce piezas.
7. Asistente de elección de modelo.
8. Generador de conceptos cinematográficos.
9. Fábrica de anuncios.
10. Benchmark de proveedores.
11. Storyboard + shot list.
12. Mejorador final con Magnific.
13. Guardián de personajes.
14. Guardián de producto.
15. Director de cámara virtual.
16. Generador de b-roll contextual.
17. Presentador autorizado.
18. Doblaje y localización visual.
19. Banda sonora y efectos.
20. Trailers y cutdowns.
21. Inspector audiovisual.

### 11.2 Primera expansión — 66

#### Ventas, research y llamadas — 1–29

1. Radar de señales de compra.
2. Autopsia de landing.
3. Doctor de fatiga creativa.
4. Planificador de cuenta ABM.
5. Analizador de llamadas perdidas.
6. Constructor de oferta irresistible.
7. Generador de campaña completa.
8. Simulador de reunión comercial.
9. Analizador competitivo visual.
10. Convertidor de cliente ganado en crecimiento.
11. Mapa de decisores.
12. Detector de eventos desencadenantes.
13. Scoring explicable de prospectos.
14. Preparador de negociación.
15. Mapa político de la cuenta.
16. Generador de propuesta comercial.
17. Detector de oportunidades de expansión.
18. Rescatador de oportunidades estancadas.
19. Investigador de objeciones del sector.
20. Coach de vendedor.
21. Generador de preguntas de descubrimiento.
22. Detector de competidor en una oportunidad.
23. Diseñador de agente de voz.
24. Inspector de cumplimiento de llamadas.
25. Optimizador de apertura de llamada.
26. Laboratorio de objeciones.
27. Analizador de emoción y fricción.
28. Creador de follow-up posllamada.
29. QA automático de agentes.

#### Ads, contenido y autoridad — 30–48

30. Minería de ángulos publicitarios.
31. Predicción de políticas publicitarias.
32. Generador de variantes controladas.
33. Traductor de anuncio a landing.
34. Detector de promesas débiles.
35. Generador de UGC.
36. Adaptador multicanal de campañas.
37. Analizador de biblioteca publicitaria.
38. Optimizador de formularios.
39. Generador de test A/B con hipótesis.
40. Reparador de atribución.
41. Generador de informe de autoridad.
42. Constructor de estudio original.
43. Detector de contenido genérico.
44. Motor de opinión ejecutiva.
45. Creador de newsletter personalizada.
46. Actualizador de contenido antiguo.
47. Planificador editorial por oportunidad comercial.
48. Generador de activos de venta.

#### Studio y operaciones de IA — 49–66

49. Director creativo virtual.
50. Casting sintético con consentimiento.
51. Inspector de continuidad.
52. Inspector de vídeo publicitario.
53. Generador de b-roll.
54. Adaptador inteligente de formatos.
55. Generador de tráileres y cortes.
56. Localizador audiovisual.
57. Generador de vídeo de producto.
58. Comparador ciego de proveedores.
59. Auditor de gasto de IA.
60. Optimizador de stack.
61. Monitor de cambios de proveedores.
62. Generador de microapps declarativas.
63. Auditor de flujos.
64. Simulador de costes.
65. Detector de automatizaciones rotas.
66. Pack de cumplimiento para clientes.

### 11.3 Segunda expansión — 60

#### Revenue & Agency — 1–20

1. Plan de cierre de oportunidad.
2. Mutual Action Plan.
3. Detector de riesgo de churn.
4. Preparador de renovación.
5. Generador de caso de éxito verificable.
6. Laboratorio de prompts y modelos.
7. Auditor de margen por cliente.
8. Copiloto de onboarding de clientes.
9. Auditor de experiencia completa.
10. Generador de demo personalizada.
11. Inspector de CRM incompleto.
12. Coach de pipeline.
13. Generador de business case.
14. Calculadora ROI personalizada.
15. Diseñador de prueba de concepto.
16. Preparador de QBR.
17. Centro de aprobación para clientes.
18. Recomendador de siguiente microapp.
19. Generador de informe mensual para cliente.
20. Calculadora de rentabilidad de cliente.

#### Intelligence & Growth — 21–40

21. Radar de concursos y licitaciones.
22. Detector de cambio tecnológico.
23. Investigador de reseñas del mercado.
24. Radar de financiación y adquisiciones.
25. Detector de cuentas parecidas a los mejores clientes.
26. Generador de secuencias hiperpersonalizadas.
27. Planificador de territorio comercial.
28. Detector de single-threading.
29. Predictor explicable de fecha de cierre.
30. Plan de expansión para champions.
31. Optimizador de presupuesto multicanal.
32. Auditor de estructura publicitaria.
33. Matriz oferta × audiencia × ángulo.
34. Biblioteca de hooks con memoria.
35. Inspector de social proof.
36. Optimizador de página de precios.
37. Diseñador de lead magnet.
38. Planificador de retargeting.
39. Biblioteca de claims y evidencias.
40. Compilador de voz de marca.

#### Media & AI Operations — 41–60

41. Generador de clusters SEO.
42. Auditor de solapamiento SEO.
43. Generador de webinar completo.
44. Transformador de informe en campaña.
45. Productor de podcast completo.
46. Buscador de momentos publicables.
47. Generador de vídeo-demo con interfaz.
48. Inspector de subtítulos.
49. Creador de paquete de entrega.
50. Inspector de derechos audiovisuales.
51. Médico de CSV y Excel.
52. Deduplicador explicable.
53. Mapeador de schemas.
54. Constructor de base de conocimiento.
55. Auditor de webhooks.
56. Probador de integraciones.
57. Monitor de credenciales.
58. Evaluador de workflows con casos sintéticos.
59. Detector de drift de prompts.
60. Comparador BYOK vs gestionado para clientes.

---

## 12. Flows y automatización avanzada

El motor Flow soporta:

- versiones publicadas;
- variables y triggers;
- microapps;
- capabilities;
- acciones;
- condiciones;
- waits;
- map/fan-out;
- aprobaciones;
- dependencias y validación de grafo;
- dry-run;
- checkpoints e idempotencia.

### Cinco recetas de sistema

1. **Oportunidad ganada → caso, anuncio y atribución.** Caso de éxito, aprobación de gasto, imagen, upscale, landing, segunda aprobación, Meta pausada, activación, espera de siete días e informe.
2. **Dossier antes de la reunión.** Investigación, preparación de llamada y tarea.
3. **Anuncio con imagen mejorada.** Generación, aprobación, upscale y aviso.
4. **Investigación y diagnóstico.** Dossier, diagnóstico comercial y tarea.
5. **De concepto a storyboard.** Conceptos, aprobación y fotogramas en fan-out.

---

## 13. Studio de Cine

### Studio v0

- brief;
- objetivo, audiencia, canal y duración;
- presupuesto;
- conceptos y aprobación;
- biblia de producción;
- consentimiento para personas reales;
- guion, escenas, planos y shot list;
- storyboard;
- exportación Markdown y PDF.

### Studio v1

- Runway para generación y upscale;
- mesa de tomas;
- variantes por plano;
- estimación y techo máximo;
- sincronización de proveedor;
- selección única de toma;
- Jobs remotos y polling.

### Studio v2

- montaje FFmpeg reproducible;
- audio y subtítulos opcionales;
- QC con ffprobe;
- master como Asset;
- publicación hacia Metricool;
- UTMs estables.

### Sala de revisión

- enlace público revocable;
- token guardado únicamente como hash;
- expiración;
- master público inmutable;
- comentarios por timecode;
- resolución, reapertura y ocultación;
- rate limit y cabeceras de privacidad.

No existe todavía un editor manual de timeline: el montaje actual es un Job reproducible.

---

## 14. Marketplace

### Comprador

- catálogo y filtros;
- ficha, versiones, precio y checksum;
- permisos y dependencias;
- instalación, reactivación, desactivación y desinstalación;
- ejecución como Job.

### Seller Studio

- crear listing;
- crear versiones;
- validar manifiesto;
- enviar a revisión;
- panel editorial restringido.

### Seguridad y economía

- manifiestos declarativos, no código arbitrario;
- validación de DAG, schemas, permisos y capabilities;
- firma y checksum;
- entitlements;
- Wallet previa;
- checkpoints;
- ledger de Marketplace;
- fee de plataforma, revenue share y overage.

---

## 15. Agencia, white-label y desarrolladores

### Clientes white-label — `/agencia/clientes`

- clientes de agencia;
- configuración de marca;
- dominio y personalización;
- límites y uso;
- formación y activos;
- separación entre workspace primario y clientes.

### Información de empresa — `/informacion-empresa`

- datos corporativos;
- identidad, oferta, precios y límites;
- fuente autoritativa para agentes y generación;
- normalización sin mezclar settings ajenos.

### Portal de desarrolladores — `/desarrolladores`

- API keys con prefijo y hash;
- webhooks HMAC;
- catálogo de topics;
- subscriptions;
- documentación y pruebas;
- aislamiento por organización.

### Telegram y conectores

- rutas de integración específicas;
- eventos verticales;
- webhooks e inbox durable;
- anti-SSRF y redacción de errores.

---

## 16. Usuarios, organizaciones y permisos

### Insights — `/insights`

- métricas agregadas de actividad y conversión;
- evolución por periodo;
- relación entre llamadas, reuniones, campañas y pipeline;
- gráficos y navegación hacia los módulos operativos.

### Configuración — `/configuracion`

- perfil personal, contraseña e idioma;
- datos y preferencias de organización;
- zona horaria, moneda y formatos;
- plan, facturación, uso y métricas de plataforma;
- accesos hacia conexiones y administración.

### Gobierno empresarial — `/gobierno-empresarial`

- políticas y decisiones reguladas;
- memoria operativa propuesta y aprobada;
- solicitudes sensibles;
- revisión por roles autorizados;
- trazabilidad de quién propone y quién decide.

### Control de accesos — `/access-control`

- usuarios, roles y membresías;
- solicitudes de acceso;
- elevación, aprobación y rechazo;
- protección contra autoelevación;
- alcance efectivo por organización.

### Experiencia, idioma y tema

- modos básico, recomendado y avanzado;
- recomendación de módulos por perfil, tipo de negocio, objetivo y plan;
- planes starter, pro, agency y enterprise;
- interfaz ES/EN;
- tema claro, oscuro o automático;
- navegación responsive con drawer móvil.

### Multi-organización

- OrganizationMembership N:M;
- organización activa por sesión;
- rol efectivo por membership;
- selector de organización;
- protección del último owner;
- grants de agencia.

### Roles

Roles de producto:

- owner;
- admin;
- revenue_ops;
- sales_manager;
- sales_rep;
- marketing_growth;
- analyst;
- compliance;
- finance_controller;
- guest.

Compatibilidad legacy: agent y viewer.

### RBAC

- 85 permisos;
- scopes own, team y org;
- denegación por defecto;
- permisos separados para lectura, escritura, publicación y aprobación;
- guards backend;
- navegación filtrada para UX;
- roles desconocidos sin acceso.

### Gobierno y aprobación

- solicitudes de acceso;
- elevación de rol;
- experimentos de pago;
- cambios de playbook;
- aprobaciones sensibles;
- prohibición de autoaprobación;
- separación entre solicitar gasto y aprobarlo;
- AuditLog.

---

## 17. Consentimiento, cumplimiento y seguridad

- ConsentGrant por organización y scope;
- revocación y expiración;
- canales, propósitos y exclusiones;
- genealogía de consentimiento a través de Assets;
- guards para voz identificada y publicación;
- opt-out y preferencias de contacto;
- masking/tokenización de PII antes de modelos;
- comprobación de PII superviviente;
- cifrado AES-GCM y keyring con rotación;
- credenciales nunca reexpuestas;
- URLs HTTPS en producción;
- límites de descarga, MIME y magic bytes;
- webhooks con firma, timestamp, hash y deduplicación;
- tokens públicos almacenados como hash;
- rate limiting;
- aislamiento `orgId` en datos y relaciones sensibles.

---

## 18. Observabilidad y operación

- health checks;
- readiness de integraciones;
- logs y códigos seguros;
- eventos outbox;
- Jobs atascados y estados remotos;
- lifecycle de webhooks;
- métricas de voz;
- costes y uso por proveedor;
- margen por modalidad;
- ahorro de routing;
- porcentaje de Flows con varias capabilities;
- uso semanal de microapps;
- production gate;
- runbooks de despliegue y staging.

---

## 19. Superficies públicas

- login, registro y recuperación de contraseña;
- landings públicas;
- blog por landing;
- auditoría SEO pública;
- informe SEO por token;
- campaña compartida;
- aprobación pública de contenido;
- sala pública de revisión Studio;
- privacidad y términos;
- media pública controlada;
- baja de email.

---

## 20. Los puntos fuertes reales

### 20.1 Une producción y resultado comercial

Una imagen o vídeo no queda aislado: puede nacer de una oportunidad, convertirse en Asset, entrar en campaña, llevar UTM y terminar vinculado a atribución.

### 20.2 Es multi-proveedor de verdad

La capability es el contrato y el proveedor es intercambiable. La organización puede usar BYOK o consumo gestionado, fijar proveedor o dejar que el router decida.

### 20.3 Transparencia económica

Coste proveedor, precio cliente, Wallet, holds y UsageRecord están separados. Esto permite vender plataforma y consumo sin perder el control del margen.

### 20.4 Trazabilidad

Jobs, activos, evidencias, genealogía, versiones, Usage y decisiones del router hacen visible de dónde sale cada resultado.

### 20.5 Seguridad y aprobaciones como parte del producto

Consentimiento, roles, scopes, separación de funciones y aprobaciones no son un añadido decorativo: están conectados al runtime.

### 20.6 147 microapps sobre una infraestructura común

No son 147 aplicaciones independientes. Comparten registro, API, formulario, Jobs, costes, evidencias, permisos y frontend. Añadir una nueva no exige duplicar toda la plataforma.

### 20.7 Studio conectado al negocio

El Studio no termina en un archivo descargado: conserva consentimiento, versiones, revisión, master, publicación y atribución.

### 20.8 Herramientas para agencia

White-label, organizaciones, clientes, margen, aprobaciones, informes mensuales y Marketplace convierten Vendrava en una base operativa para revender servicios.

### 20.9 Arquitectura defensiva

Idempotencia, leases, polling, cuarentena de resultados inciertos, webhooks durables y conciliación reducen duplicados y cobros incorrectos.

### 20.10 Plataforma extensible

Registro de providers, microapps declarativas, Flows, Marketplace, API keys y webhooks ofrecen varios puntos de expansión sin permitir código arbitrario de terceros.

---

## 21. Lo que todavía no debe venderse como terminado

1. Las migraciones abiertas deben aplicarse primero en staging con backup.
2. Falta smoke transaccional concurrente sobre PostgreSQL real.
3. Storage S3/R2 debe configurarse y probarse con URLs privadas y públicas.
4. Runway, Magnific, Stripe, Meta y publicación social necesitan pruebas con cuentas sandbox o reales.
5. Falta QA autenticada de todas las rutas con varios roles y organizaciones.
6. El worker FFmpeg debe desplegarse con límites de CPU, RAM, disco y tiempo.
7. El pipeline de voz requiere prueba integrada con los proveedores y actualmente está limitado a inglés.
8. Studio no incluye editor visual de timeline.
9. El production gate debe quedar verde en el entorno final.
10. La navegación actual ya no escala: 38 accesos principales y 147 microapps no caben conceptualmente en una sidebar tradicional.

---

## 22. Veredicto

Vendrava contiene ya los componentes de un **sistema operativo comercial y creativo multi-proveedor**. Su mayor fortaleza no es una función individual, sino la conexión entre CRM, ejecución, IA, activos, costes, aprobación y atribución.

El siguiente problema principal no es añadir más módulos. Es hacer que toda esta capacidad sea descubrible y operable sin que el usuario tenga que entender la arquitectura interna. Ese problema se desarrolla en el documento interno de navegación y visualización.
