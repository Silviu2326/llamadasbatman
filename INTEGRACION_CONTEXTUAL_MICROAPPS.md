# Integración contextual de las microapps en Vendrava

## Decisión de producto

Las microapps no deben sentirse como 147 aplicaciones independientes ni como 147 prompts preparados. Deben ser **capacidades configurables que aparecen dentro del módulo donde el usuario ya está trabajando**.

La microapp aporta la receta especializada. El módulo aporta contexto, entidades, permisos y experiencia. El resultado vuelve al objeto nativo: llamada, lead, cuenta, oportunidad, campaña, producción, activo o workflow.

```text
Módulo de trabajo → contexto autorizado → microapp configurada
→ ejecución presupuestada → resultado nativo → siguiente acción / workflow
```

Ejemplo: `call-prep` debe vivir dentro de `/llamadas` y `/leads`, no exigir que el usuario copie datos en un formulario genérico. La plataforma aporta automáticamente el lead, historial, notas y objetivo; la microapp aporta la configuración y genera el brief dentro de la ficha.

## Alcance revisado

El registro actual reúne 147 microapps:

- 21 capacidades base de plataforma;
- 66 microapps de la expansión editorial original;
- 60 microapps de Revenue, Growth, Media y AI Operations.

La página `/microapps` debe conservarse como catálogo, descubrimiento, configuración y ejecución avanzada. La operación diaria debe ocurrir en las superficies de producto.

## Reglas de integración

### El usuario entra por el trabajo

Las acciones deben usar lenguaje de resultado: **Preparar llamada**, **Auditar landing**, **Planificar cierre**, **Crear propuesta**, **Revisar derechos**. «Abrir microapp» queda como acción secundaria del catálogo.

### El contexto se precarga

Cada microapp contextual debe declarar:

| Metadato | Función |
|---|---|
| `primarySurface` | Módulo donde vive la acción principal |
| `secondarySurfaces` | Otras puertas de entrada |
| `contextBindings` | Entidades que se precargan |
| `configuration` | Opciones que el usuario puede cambiar |
| `resultProjection` | Cómo se pinta el resultado en el módulo |
| `followUpActions` | Tareas, reuniones, emails, cambios o aprobaciones |
| `automationHooks` | Eventos o Flows que pueden consumir el resultado |

La microapp nunca debe saltarse RBAC. Si el usuario no puede leer una parte del contexto, se omite o redacta y el resultado declara la limitación.

### El resultado es nativo

- `brief` → panel fijado en llamada o lead;
- `score` → señal explicable en Leads/Pipeline;
- `proposal` → borrador de la oportunidad;
- `sequence` → pasos editables de seguimiento;
- `asset` → activo versionado en Biblioteca/Studio;
- `evidence` → fuentes junto a cada afirmación;
- `action` → tarea, reunión, email, aprobación o cambio de etapa;
- `job` → estado en Centro de trabajos sin bloquear la ficha.

### Configuración por niveles

1. Organización: políticas, claims, tono, proveedores, límites y cumplimiento.
2. Equipo/playbook: proceso y formato compartido.
3. Usuario: preferencias de presentación.
4. Ejecución: objetivo, entidad y ajustes puntuales.

El usuario debe editar campos de producto («Objetivo de llamada», «Canales», «Presupuesto máximo»), no prompts largos.

### Toda ejecución debe ser trazable

Mostrar entidad de origen, datos usados, versión y configuración, coste estimado/final, evidencias, frescura, aprobaciones, acciones derivadas y enlace al Job/historial.

## Mapa de superficies

| Superficie actual | Papel de las microapps |
|---|---|
| Dashboard / Centro de acciones | Recomendar la siguiente capacidad según alertas y objetivos |
| Orquestador | Encadenar capacidades en objetivos y Flows |
| Campañas | Convertir objetivo en mensajes, activos, UTMs y medición |
| Ads | Investigar ángulos, revisar políticas, variar y optimizar antes de publicar |
| Social | Adaptar piezas y preparar borradores por canal |
| Prospectos | Investigar, detectar intención, puntuar y convertir a lead |
| Landings / Funnels | Auditar conversión, formularios, mensaje y atribución |
| SEO / Organic | Crear clusters, detectar solapamiento y refrescar contenido |
| Inbox | Resumir, clasificar, sugerir respuesta y crear tarea |
| Llamadas | Preparar, analizar, cumplir y hacer follow-up |
| Agentes IA / Cabina de voz | Diseñar, probar, revisar y publicar agentes |
| Leads / Cuentas | Construir dossiers, señales, mapas y planes |
| Pipeline | Desbloquear, negociar, cerrar y prever |
| Reuniones | Preparar agenda, simulación, preguntas y follow-up |
| Inteligencia comercial | Explicar forecast, margen, churn y expansión |
| Growth Hub / Email | Coordinar campañas, contenido, distribución y nutrición |
| Automatizaciones | Auditar, evaluar y reparar Flows |
| Studio | Crear y controlar producción audiovisual |
| Activos | Mejorar, localizar, empaquetar y revisar derechos |
| Knowledge Base | Convertir fuentes, claims y experiencia en conocimiento |
| Jobs / Conexiones / Configuración | Costes, proveedores, credenciales e integraciones |
| Gobierno / Marketplace / Capacidades | Aprobaciones, instalación y versionado; no operación diaria |

## Matriz completa de integración

Formato de cada línea: **microapp** — `superficie principal` · `superficie secundaria` — integración propuesta.

## A. Capacidades base de plataforma

- **Investigador de empresa 360** — `Prospectos, Leads, Cuentas` · `Orquestador` — dossier, señales, responsables y oportunidades; CTA para crear lead y preparar llamada.
- **Preparador de llamada** — `Llamadas, Lead` · `Reuniones, Inbox` — brief contextual con apertura, preguntas, objeciones y siguiente paso.
- **Diagnóstico comercial de prospecto** — `Prospectos` · `Leads, Landings` — diagnóstico de presencia digital desde la URL y CTA comercial.
- **Investigador de invitados para podcast** — `Studio, Contenido` · `Reuniones, Social` — dossier verificable, fuentes y preguntas de entrevista.
- **Minero de voz del cliente** — `Llamadas, Inbox, Insights` · `Knowledge Base, Campañas` — lenguaje real para oferta, campañas, playbooks y agentes.
- **Un contenido, doce piezas** — `Contenido, Campañas` · `Llamadas, Social, Email` — una llamada/artículo/caso convertido en borradores nativos por canal.
- **Asistente de elección de modelo** — `Capacidades, Jobs` · `Studio, Agentes, Configuración` — proveedor, calidad, coste y modo BYOK/gestionado.
- **Generador de conceptos cinematográficos** — `Studio` · `Campañas, Social` — tres direcciones creativas con riesgo y coste antes de producir.
- **Fábrica de anuncios** — `Ads, Campañas` · `Landings, Studio` — ángulos, copy y creatividad como borrador revisable.
- **Benchmark de proveedores** — `Conexiones, Jobs` · `Configuración, Model Picker` — disponibilidad, tier y coste sin cambiar routing.
- **Storyboard + shot list** — `Studio` · `Activos, Campañas` — concepto aprobado convertido en planos, duración, audio y frames.
- **Mejorador final con Magnific** — `Activos, Studio` · `Jobs` — versión derivada con original, coste y genealogía conservados.
- **Guardián de personajes** — `Studio` · `Activos` — revisión de continuidad contra la biblia de personajes.
- **Guardián de producto** — `Studio, Activos` · `Ads, Landings` — control de logo, envase, color, geometría y copy.
- **Director de cámara virtual** — `Studio` · `Storyboard` — cámara, luz y prompts técnicos por plano.
- **Generador de b-roll contextual** — `Studio` · `Campañas, Social` — apoyos por guion y Jobs hijos de vídeo trazables.
- **Presentador autorizado** — `Studio` · `Agentes, Gobierno` — presentador consentido, voz y borrador visual.
- **Doblaje y localización visual** — `Studio` · `Social, Email, Activos` — adaptación por mercado con glosario, subtítulos y narración.
- **Banda sonora y efectos** — `Studio` · `Activos, Gobierno` — música, ambientes, efectos y control de licencias por escena.
- **Trailers y cutdowns** — `Studio` · `Social, Ads` — EDLs, títulos, copies y miniaturas por canal.
- **Inspector audiovisual** — `Studio, Jobs` · `Activos, Gobierno` — QC por timecode y bloqueo de exportación hasta resolver incidencias.

## B. Prospectos, Leads y Cuentas

- **Radar de señales de compra** — `Prospectos, Leads` · `Dashboard, Orquestador` — señales públicas recientes y siguiente acción.
- **Planificador de cuenta ABM** — `Cuentas` · `Campañas, Leads` — plan de 30 días, personas, mensajes y criterios de avance.
- **Analizador de llamadas perdidas** — `Llamadas` · `Insights, Agentes` — patrones de pérdida y guiones correctivos.
- **Analizador competitivo visual** — `Prospectos, Cuentas` · `Campañas, Ads` — mensajes, territorios visuales y diferenciación.
- **Mapa de decisores** — `Cuentas, Oportunidades` · `Reuniones, Pipeline` — roles de compra y estrategia por participante.
- **Detector de eventos desencadenantes** — `Prospectos` · `Dashboard, Orquestador` — eventos públicos convertidos en razones para contactar.
- **Scoring explicable de prospectos** — `Leads, Prospectos` · `Pipeline, Inteligencia` — score de fit, intención, urgencia y accesibilidad.
- **Investigador de objeciones del sector** — `Leads, Knowledge Base` · `Playbooks, Agentes` — biblioteca sectorial con evidencia y respuesta.
- **Generador de preguntas de descubrimiento** — `Leads, Reuniones` · `Llamadas, Playbooks` — preguntas adaptadas sin repetir hechos conocidos.
- **Detector de cuentas parecidas a los mejores clientes** — `Prospectos` · `Cuentas, Campañas` — candidatos explicables a partir de clientes ganadores.
- **Planificador de territorio comercial** — `Prospectos, Leads` · `Pipeline, Equipos` — asignación de cuentas y esfuerzo por región/capacidad.
- **Detector de cambio tecnológico** — `Cuentas, Prospectos` · `Inteligencia comercial` — adopciones, migraciones y evaluaciones como señales.
- **Investigador de reseñas del mercado** — `Prospectos, Growth` · `Voice of Customer, Campañas` — dolores y necesidades no cubiertas.
- **Radar de financiación y adquisiciones** — `Prospectos, Cuentas` · `Dashboard, Orquestador` — rondas y M&A como señales recientes.
- **Radar de concursos y licitaciones** — `Prospectos, Growth` · `Orquestador` — oportunidades públicas y decisión bid/no-bid.
- **Detector de competidor en una oportunidad** — `Pipeline` · `Cuentas, Playbooks` — competidores y battlecard contextual.

## C. Llamadas, Inbox, Reuniones y Agentes IA

- **Simulador de reunión comercial** — `Reuniones` · `Agentes, Playbooks` — objeciones y rúbrica de preparación.
- **Coach de vendedor** — `Llamadas, Insights` · `Agentes, Playbooks` — coaching por vendedor basado en fragmentos y resultados.
- **Diseñador de agente de voz** — `Agentes IA` · `Playbooks, Cabina de voz` — especificación, ramas, herramientas y guardrails.
- **Inspector de cumplimiento de llamadas** — `Llamadas` · `Agentes, Gobierno` — consentimiento, divulgación, opt-out y claims por timecode.
- **Optimizador de apertura de llamada** — `Llamadas, Agentes` · `Playbooks, Insights` — variantes de apertura por segmento y resultado.
- **Laboratorio de objeciones** — `Agentes, Cabina de voz` · `Playbooks, Llamadas` — escenarios adversos para probar cobertura.
- **Analizador de emoción y fricción** — `Llamadas` · `Insights, Coaching` — línea temporal de interés, confusión y tensión observable.
- **Creador de follow-up posllamada** — `Llamadas` · `Inbox, Email, Leads` — resumen, mensaje, tareas y actualización CRM.
- **QA automático de agentes** — `Agentes IA, Cabina de voz` · `Gobierno` — regresión, seguridad y decisión de publicación.
- **Recomendador de siguiente microapp** — `Centro de capacidades contextual` · `Todos los módulos` — siguiente capacidad según resultado, objetivo y permisos.

## D. Pipeline, oportunidades y clientes

- **Plan de cierre de oportunidad** — `Pipeline / oportunidad` · `Reuniones, Tareas` — responsables, bloqueos y criterios de salida.
- **Mutual Action Plan** — `Pipeline` · `Reuniones, Cuentas` — hitos, fechas, responsables y dependencias compartidas.
- **Detector de riesgo de churn** — `Cuentas, Inteligencia comercial` · `Llamadas, Reuniones` — riesgo y acciones de retención.
- **Preparador de renovación** — `Cuentas, Reuniones` · `Pipeline` — uso, resultados, riesgos, preguntas y propuesta.
- **Generador de caso de éxito verificable** — `Cuentas, Activos` · `Campañas, Social` — caso basado en resultados y permisos reales.
- **Auditor de experiencia completa** — `Cuentas, Leads` · `Inbox, Pipeline` — cortes del recorrido de captación a entrega.
- **Generador de demo personalizada** — `Reuniones, Oportunidades` · `Studio, Cuentas` — demo adaptada a cuenta y etapa.
- **Inspector de CRM incompleto** — `Leads, Cuentas, Pipeline` · `Dashboard` — huecos de datos que bloquean seguimiento y forecast.
- **Coach de pipeline** — `Pipeline` · `Inteligencia comercial, Dashboard` — riesgo, cobertura y aging convertidos en plan semanal.
- **Generador de business case** — `Oportunidad` · `Reuniones, Propuesta` — justificación económica trazable.
- **Calculadora ROI personalizada** — `Oportunidad` · `Propuesta, Reuniones` — escenarios de retorno con supuestos visibles.
- **Diseñador de prueba de concepto** — `Oportunidad` · `Jobs, Studio, Reuniones` — alcance, éxito, datos, responsables y coste.
- **Preparador de QBR** — `Cuentas, Reuniones` · `Inteligencia comercial` — outcomes, uso, actividad y roadmap.
- **Centro de aprobación para clientes** — `Clientes white-label, Activos` · `Studio, Gobierno` — entregables versionados sin publicación automática.
- **Generador de informe mensual para cliente** — `Clientes white-label` · `Cuentas, Inteligencia` — CRM, uso, resultados, evidencias y experimentos.
- **Calculadora de rentabilidad de cliente** — `Clientes white-label, Configuración` · `Inteligencia` — margen, precio, carga y capacidad.
- **Detector de oportunidades de expansión** — `Cuentas` · `Pipeline, Reuniones` — upsell, cross-sell y renovación priorizados.
- **Rescatador de oportunidades estancadas** — `Pipeline` · `Inbox, Reuniones` — bloqueo y secuencia de reactivación.
- **Preparador de negociación** — `Oportunidad` · `Reuniones, Playbooks` — BATNA, límites, concesiones y trampas.
- **Mapa político de la cuenta** — `Cuentas, Oportunidades` · `Reuniones, Pipeline` — aliados, neutrales, bloqueadores y poder.
- **Generador de propuesta comercial** — `Oportunidad` · `Activos, Reuniones` — alcance, inversión, ROI y próximos pasos.
- **Plan de expansión para champions** — `Cuentas` · `Pipeline, Reuniones` — narrativa y materiales para vender internamente.
- **Detector de single-threading** — `Oportunidad` · `Cuentas, Pipeline` — dependencia de un único contacto y expansión de relaciones.
- **Predictor explicable de fecha de cierre** — `Pipeline` · `Inteligencia comercial` — rango de cierre e hitos que lo sostienen.

## E. Campañas, Ads, Social y Funnels

- **Constructor de oferta irresistible** — `Campañas, Landings` · `Ads, Pipeline` — paquetes, garantías, pruebas y objeciones.
- **Generador de campaña completa** — `Campañas` · `Ads, Landings, Email, Social` — campaña de anuncio a conversión con UTMs.
- **Minería de ángulos publicitarios** — `Ads` · `Campañas, Voice of Customer` — ángulos, hooks, pruebas y experimentos.
- **Predicción de políticas publicitarias** — `Ads / borrador` · `Gobierno, Campañas` — preflight y reescritura conservadora.
- **Generador de variantes controladas** — `Ads` · `Experimentos, Insights` — una dimensión por variante con hipótesis auditable.
- **Traductor de anuncio a landing** — `Ads, Landings` · `Campañas, Funnels` — continuidad de mensaje, formulario, FAQ y tracking.
- **Detector de promesas débiles** — `Ads, Landings` · `Knowledge Base` — precisión de copy basada en pruebas.
- **Generador de UGC** — `Campañas, Social` · `Studio, Ads` — concepto, hooks, guion, b-roll y checklist.
- **Adaptador multicanal de campañas** — `Campañas` · `Social, Email, Ads` — adaptación nativa por canal.
- **Analizador de biblioteca publicitaria** — `Ads` · `Inteligencia competitiva` — promesa, emoción, formato, saturación y huecos.
- **Optimizador de formularios** — `Landings` · `Funnels, Campañas` — decisión campo a campo y experimento.
- **Generador de test A/B con hipótesis** — `Ads, Landings, Funnels` · `Insights` — cambio único, guardrails, muestra y decisión.
- **Reparador de atribución** — `Campañas, Funnels` · `Landings, Insights` — URLs, eventos, enlaces y plan de instrumentación.
- **Optimizador de presupuesto multicanal** — `Campañas, Ads` · `Inteligencia` — inversión, escenarios y límites de riesgo.
- **Auditor de estructura publicitaria** — `Ads` · `Conexiones, Campañas` — redundancias, tracking y desalineación sin modificar cuenta.
- **Matriz oferta × audiencia × ángulo** — `Campañas, Ads` · `Social, Landings` — combinaciones convertidas en hipótesis.
- **Biblioteca de hooks con memoria** — `Ads, Social` · `Content Studio` — desgaste, memoria y hooks nuevos.
- **Inspector de social proof** — `Campañas, Landings` · `Knowledge Base, Gobierno` — verificación de testimonios, métricas, logos y premios.
- **Optimizador de página de precios** — `Landings` · `Campañas, Pipeline` — planes, anclaje, FAQ y experimentos.
- **Diseñador de lead magnet** — `Landings, Captación` · `Content Studio, Email` — activo, landing, entrega y promoción.
- **Planificador de retargeting** — `Ads, Campañas` · `Funnels` — ventanas, exclusiones, mensajes y frecuencia.

## F. Contenido, Email y Organic/SEO

- **Generador de informe de autoridad** — `SEO / Organic` · `Knowledge Base, Campañas` — credibilidad, brechas de prueba y plan de autoridad.
- **Constructor de estudio original** — `Organic, Contenido` · `Campañas, Social` — metodología, hallazgos, gráficos y limitaciones.
- **Detector de contenido genérico** — `Content Studio, Knowledge Base` · `SEO, Email` — frases intercambiables y reescrituras específicas.
- **Motor de opinión ejecutiva** — `Contenido, Social` · `Knowledge Base, Campañas` — tesis y piezas a partir de respuestas reales.
- **Creador de newsletter personalizada** — `Email Marketing` · `Social, Knowledge Base` — actualidad buscada, fuentes e interpretación editorial.
- **Actualizador de contenido antiguo** — `Organic / SEO` · `Knowledge Base, Landings` — hechos obsoletos, enlaces y nueva versión con diff.
- **Planificador editorial por oportunidad comercial** — `Growth Hub, Contenido` · `Pipeline, Campañas` — calendario por pipeline, objeciones y campañas.
- **Generador de activos de venta** — `Cuentas, Pipeline` · `Knowledge Base, Activos` — battlecards, one-pagers, casos, calculadoras y FAQs.
- **Generador de clusters SEO** — `SEO / Organic` · `Landings, Content Studio` — arquitectura, intención, páginas y enlaces internos.
- **Auditor de solapamiento SEO** — `SEO / Organic` · `Landings, Insights` — canibalización y recomendación de fusionar/diferenciar/enlazar.
- **Generador de webinar completo** — `Campañas, Email` · `Reuniones, Social, Studio` — landing, agenda, guion, emails, anuncios y reutilización.
- **Transformador de informe en campaña** — `Campañas, Content Studio` · `Social, Email, Landings` — informe convertido en narrativa y activos.
- **Productor de podcast completo** — `Content Studio` · `Studio, Social, Email` — investigación, escaleta, guion, promoción y follow-up.
- **Buscador de momentos publicables** — `Llamadas, Contenido` · `Social, Email` — clips por timecode con hook, contexto y riesgos.
- **Biblioteca de claims y evidencias** — `Knowledge Base` · `Ads, Landings, Gobierno` — fuente, vigencia, propietario y usos autorizados.
- **Compilador de voz de marca** — `Knowledge Base / Información de empresa` · `Email, Social, Agentes` — reglas y tests de consistencia.

## G. Studio, Activos y publicación audiovisual

- **Director creativo virtual** — `Studio` · `Campañas, Ads` — brief y restricciones convertidos en dirección creativa.
- **Casting sintético con consentimiento** — `Studio` · `Gobierno, Activos` — reparto sintético con bloqueo de identidades no autorizadas.
- **Inspector de continuidad** — `Studio` · `Activos, Jobs` — tomas comparadas con la biblia de producción.
- **Inspector de vídeo publicitario** — `Studio, Ads` · `Gobierno, Campañas` — estructura, marca, CTA, claims y especificaciones.
- **Generador de b-roll** — `Studio` · `Social, Ads` — apoyos informativos y clips encolados.
- **Generador de tráileres y cortes** — `Studio` · `Social, Ads` — EDLs, hooks y copies por canal.
- **Localizador audiovisual** — `Studio` · `Social, Email, Activos` — guion, subtítulos y controles lingüísticos por mercado.
- **Adaptador inteligente de formatos** — `Studio` · `Social, Ads` — reencuadre, copy seguro y EDL con zonas protegidas.
- **Generador de vídeo de producto** — `Studio` · `Ads, Landings, Activos` — vídeo referenciado con revisión de claims.
- **Generador de vídeo-demo con interfaz** — `Studio` · `Landings, Cuentas` — recorrido real convertido en escenas y Jobs trazables.
- **Inspector de subtítulos** — `Activos, Studio` · `Social, Exportación` — SRT, velocidad, solapes, términos sensibles y safe area.
- **Creador de paquete de entrega** — `Activos` · `Clientes white-label, Studio` — nombres, manifiesto, checksums, licencias y README.
- **Inspector de derechos audiovisuales** — `Activos, Gobierno` · `Studio, Ads, Social` — grants, territorios, paid media, canales y vencimientos.

## H. Datos, proveedores, costes e infraestructura

- **Laboratorio de prompts y modelos** — `Agentes, Capacidades` · `Knowledge Base, Jobs` — comparación controlada antes de fijar configuración.
- **Auditor de margen por cliente** — `Inteligencia comercial` · `Clientes white-label, Configuración` — ledger, costes, fee y margen real.
- **Médico de CSV y Excel** — `Importación de Leads/Prospectos` · `Cuentas, Datos` — limpieza, normalización y archivo corregido.
- **Deduplicador explicable** — `Leads, Cuentas, Importación` · `Data Ops` — maestros reversibles y explicación de coincidencias.
- **Mapeador de schemas** — `Conexiones, Importación` · `API/Webhooks` — campos, transformaciones, pérdidas e incompatibilidades.
- **Constructor de base de conocimiento** — `Knowledge Base` · `Agentes, Playbooks` — fuentes versionadas a artículos, FAQ y borradores.
- **Auditor de webhooks** — `Conexiones, API/Webhooks` · `Jobs, Gobierno` — firmas, dead letters, reintentos y latencia.
- **Probador de integraciones** — `Conexiones` · `Developer Portal, Gobierno` — pruebas no destructivas y límites comprobados.
- **Monitor de credenciales** — `Conexiones, Configuración` · `Jobs, Gobierno` — expiración, revocación, slots ausentes y uso.
- **Evaluador de workflows con casos sintéticos** — `Automatizaciones` · `Jobs, Orquestador` — dry-run, pasos, errores y regresiones.
- **Detector de drift de prompts** — `Agentes, Jobs` · `Capacidades, Gobierno` — calidad, formato, seguridad, coste y latencia entre versiones.
- **Comparador BYOK vs gestionado para clientes** — `Conexiones, Configuración` · `Clientes white-label, Costes` — precio, operaciones, privacidad, control y soporte.
- **Comparador ciego de proveedores** — `Conexiones, Jobs` · `Model Picker, Costes` — calidad, latencia y coste sin sesgo de proveedor.
- **Auditor de gasto de IA** — `Jobs, Inteligencia comercial` · `Configuración, Conexiones` — consumo, precio, BYOK y anomalías.
- **Optimizador de stack** — `Conexiones` · `Jobs, Configuración` — alternativas routables cuantificadas sin ejecutarlas.
- **Monitor de cambios de proveedores** — `Conexiones` · `Gobierno, Jobs` — cambios de términos, modelos y límites.
- **Generador de microapps** — `Centro de capacidades, Marketplace` · `Developer Portal, Gobierno` — manifiestos declarativos validados, nunca código ejecutable.
- **Auditor de flujos** — `Automatizaciones` · `Orquestador, Conexiones` — conectividad, ciclos, capabilities y proveedores del grafo.
- **Simulador de costes** — `Jobs, Configuración` · `Orquestador, Model Picker` — volumen, coste, contingencia y alternativas.
- **Detector de automatizaciones rotas** — `Automatizaciones` · `Jobs, Dashboard` — flows sin ejecuciones, con fallos o referencias ausentes.
- **Pack de cumplimiento para clientes** — `Gobierno, Clientes white-label` · `Knowledge Base, Auditoría` — dossier de controles y evidencias internas.

## Índice de IDs estables que completan el mapa

Las líneas anteriores usan nombres de producto para facilitar la lectura. Este índice conserva los IDs contractuales de las microapps que no necesitan aparecer como rutas propias:

### Base, investigación y Studio

`prospect-diagnosis`, `podcast-guest-research`, `model-picker`, `ad-factory`, `provider-benchmark`, `magnific-enhancer`, `character-continuity-guardian`, `product-continuity-guardian`, `virtual-camera-director`, `contextual-broll-generator`, `authorized-presenter`, `visual-localization-dubbing`, `soundtrack-sfx-designer`, `trailers-cutdowns`.

### Ventas, llamadas y cuentas

`creative-fatigue-doctor`, `abm-account-planner`, `missed-call-analyzer`, `irresistible-offer-builder`, `sales-meeting-simulator`, `visual-competitive-analyzer`, `won-customer-growth-engine`, `decision-maker-map`, `trigger-event-detector`, `negotiation-prep`, `account-political-map`, `expansion-opportunity-detector`, `stalled-deal-rescuer`, `sector-objection-researcher`, `seller-coach`, `discovery-question-generator`, `deal-competitor-detector`, `call-compliance-inspector`, `call-opening-optimizer`, `call-emotion-friction-analyzer`.

### Ads, contenido y operaciones creativas

`ad-angle-miner`, `ad-to-landing-translator`, `weak-promise-detector`, `ugc-campaign-builder`, `multichannel-campaign-adapter`, `ad-library-analyzer`, `ab-test-hypothesis-designer`, `authority-report`, `original-study-builder`, `generic-content-detector`, `executive-opinion-engine`, `personalized-newsletter-builder`, `content-refresh-auditor`, `sales-asset-generator`, `virtual-creative-director`, `consented-synthetic-casting`, `video-ad-inspector`, `studio-broll-generator`, `product-video-generator`, `blind-provider-comparator`, `provider-change-monitor`, `declarative-microapp-generator`.

### Revenue y clientes

`verifiable-case-study`, `client-onboarding-copilot`, `end-to-end-experience-auditor`, `personalized-demo-builder`, `crm-completeness-inspector`, `business-case-builder`, `poc-designer`, `qbr-prep`, `client-approval-center`, `next-microapp-recommender`, `monthly-client-report`.

### Intelligence & Growth

`tender-opportunity-radar`, `technology-change-detector`, `market-review-researcher`, `funding-ma-radar`, `best-customer-lookalikes`, `sales-territory-planner`, `single-threading-detector`, `explainable-close-date-predictor`, `champion-expansion-plan`, `multichannel-budget-optimizer`, `ad-account-structure-auditor`, `offer-audience-angle-matrix`, `hook-memory-library`, `social-proof-inspector`, `pricing-page-optimizer`, `lead-magnet-designer`, `retargeting-planner`, `claims-evidence-library`, `brand-voice-compiler`.

### Media & AI Operations

`webinar-campaign-builder`, `report-to-campaign`, `podcast-producer`, `publishable-moment-finder`, `interface-demo-video`, `subtitle-inspector`, `delivery-package-builder`, `audiovisual-rights-inspector`, `csv-excel-doctor`, `explainable-record-deduplicator`, `schema-mapper`, `knowledge-base-builder`, `byok-managed-comparator`.

## Primeras integraciones recomendadas

### Ola 1: llamadas y leads

1. `company-research-360` desde Prospectos, Leads y Cuentas.
2. `call-prep` dentro de la ficha de llamada y lead.
3. `post-call-followup-generator` al cerrar una llamada.
4. `voice-of-customer` desde llamadas e Inbox.
5. `explainable-prospect-scoring` en Leads.
6. `buying-signal-radar` en Prospect Finder y Cuentas.
7. `hyperpersonalized-sequence` desde una selección de leads.

### Ola 2: pipeline y cliente

1. `opportunity-close-plan` en el detalle de oportunidad.
2. `mutual-action-plan` en oportunidad y reuniones.
3. `pipeline-coach` en Pipeline e Inteligencia comercial.
4. `commercial-proposal-generator` y `roi-calculator` en oportunidad.
5. `churn-risk-detector` y `renewal-prep` en Cuentas.
6. `client-profitability-calculator` e `client-margin-auditor` en clientes white-label.

### Ola 3: captación y contenido

1. `landing-autopsy` y `form-friction-optimizer` en Landings.
2. `full-campaign-generator` en Campañas.
3. `ad-policy-risk-review` y `controlled-ad-variants` en Ads.
4. `attribution-repairer` en Campañas y Funnels.
5. `content-multiplier` y `commercial-editorial-planner` en Growth Hub.
6. `seo-cluster-builder` y `seo-overlap-auditor` en SEO/Organic.

### Ola 4: agentes y Studio

1. `voice-agent-designer` en Agentes IA.
2. `objection-lab` y `voice-agent-qa` en Cabina de voz.
3. `cinema-concepts` y `storyboard-shotlist` en Studio.
4. `production-continuity-inspector` y `audiovisual-qc-inspector` en la mesa de producción.
5. `intelligent-format-adapter`, `audiovisual-localizer` y `trailer-cutdown-generator` antes de publicar.

### Ola 5: sistema y operaciones

1. `ai-spend-auditor`, `ai-stack-optimizer` y `ai-cost-simulator` en Jobs/Configuración.
2. `credential-health-monitor`, `integration-tester` y `webhook-auditor` en Conexiones.
3. `flow-auditor`, `workflow-synthetic-evaluator` y `broken-automation-detector` en Automatizaciones.
4. `prompt-drift-detector` y `prompt-model-lab` en Agentes y Gobierno.
5. `client-compliance-pack` en Gobierno y Clientes white-label.

## Patrón de UX recomendado

Para una microapp sin efectos externos:

```text
[Preparar llamada]
  → panel lateral: objetivo, estilo y límites
  → contexto precargado: lead + llamadas + notas
  → [Estimar] → coste, permisos y frescura
  → [Generar brief]
  → resultado fijado en la llamada
  → [Programar llamada] [Crear tarea] [Preparar follow-up]
```

Para una microapp asíncrona:

```text
[Generar vídeo-demo]
  → configuración contextual
  → presupuesto y aprobación
  → Job no bloqueante
  → resultado en Activos/Studio
  → QC, aprobación y publicación
```

## Cambios recomendados en el contrato

El manifiesto necesita una capa explícita de integración contextual:

```ts
type MicroappPlacement = {
  primarySurface: string
  secondarySurfaces?: string[]
  trigger: 'manual' | 'after_create' | 'after_update' | 'after_call' | 'scheduled' | 'recommended'
  contextBindings: Array<'lead' | 'account' | 'call' | 'conversation' | 'meeting' | 'opportunity' | 'campaign' | 'landing' | 'asset' | 'production' | 'flow' | 'client'>
  resultProjection: string
  configurationScope: Array<'organization' | 'team' | 'user' | 'run'>
  automationEvents?: string[]
}
```

La UI debe separar:

- **Configurar:** guardar defaults de la receta.
- **Ejecutar:** usarla sobre una entidad concreta.
- **Automatizar:** instalarla dentro de un Flow o trigger.

## Qué debe desaparecer de la experiencia principal

- Formularios que vuelven a pedir datos existentes en CRM.
- Tarjetas que solo muestran una promesa genérica.
- Resultados JSON sin proyección en una entidad.
- Ejecuciones sin coste, permisos, efectos o frescura visibles.
- Usar favoritos del catálogo como sustituto de acciones de producto.
- Mezclar catálogo, marketplace y operación diaria en la misma navegación.

## Métricas de éxito

Medir la integración por el resultado en el módulo, no por aperturas de `/microapps`:

- porcentaje de ejecuciones iniciadas desde una superficie contextual;
- tiempo desde apertura de entidad hasta resultado útil;
- resultados que generan una acción posterior;
- llamadas preparadas que terminan en siguiente paso registrado;
- oportunidades que pasan de riesgo a actividad concreta;
- reducción de datos duplicados introducidos por el usuario;
- coste estimado frente a coste real;
- porcentaje de outputs con evidencia y frescura visible;
- aprobaciones, rechazos y derivaciones a revisión humana;
- resultado comercial por microapp y Flow.

## Conclusión

Vendrava no debe vender 147 pequeñas herramientas. Debe ofrecer una plataforma en la que cada módulo tenga capacidades inteligentes nativas, gobernadas y configurables.

La microapp aporta especialización. El CRM aporta contexto. El módulo aporta experiencia. El Flow aporta repetición. El agente aporta selección dentro de límites autorizados.

La página de microapps continúa siendo útil como **centro de capacidades**. La experiencia que el usuario recuerda debe ocurrir en la llamada, el lead, la oportunidad, la campaña, la producción o el cliente que está intentando hacer avanzar.
