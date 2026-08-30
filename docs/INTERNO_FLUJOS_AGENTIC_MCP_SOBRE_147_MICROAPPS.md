# Vendrava como sistema operativo para agentes

## Flujos agentic y MCP construidos sobre las 147 microapps actuales

> Documento interno de producto y arquitectura.  
> Alcance: propuestas de composición usando exclusivamente microapps y capacidades que ya existen en Vendrava. No implica que todos los flujos descritos estén ya publicados.

---

## 1. La idea importante

Vendrava no debería presentar 147 microapps como 147 pequeñas aplicaciones aisladas. Debe tratarlas como **habilidades atómicas, tipadas, presupuestables y auditables** que pueden utilizar tres actores:

1. una persona desde la interfaz;
2. un Flow determinista de Vendrava;
3. un agente externo o interno que las descubre y ejecuta mediante MCP.

La microapp es la unidad de capacidad. El Flow es la unidad de operación repetible. El agente es quien interpreta un objetivo, elige un playbook y decide el siguiente paso dentro de unos límites. MCP es la superficie estándar a través de la que ese agente descubre y usa Vendrava.

La propuesta de valor no es, por tanto, «tenemos 147 prompts». Es:

> **Vendrava convierte 147 habilidades especializadas en un sistema operativo gobernado para agentes: con contexto empresarial, costes, permisos, evidencias, aprobaciones, activos, proveedores y resultados.**

Este documento propone **mejorar los cinco Flows actuales y añadir 50 playbooks nuevos** compuestos exclusivamente con las microapps existentes.

Esto sí es dar poder. Un agente genérico puede redactar; un agente conectado a Vendrava puede investigar una cuenta, preparar una reunión, evaluar evidencias, crear una campaña, pedir aprobación, generar los activos, publicar y medir el resultado sin saltarse las reglas de la organización.

---

## 2. Qué existe hoy y qué sería nuevo

### Ya existe en el producto

- Registro único de **147 microapps**.
- Contratos de entrada y salida validados.
- Formularios derivados de `uiSchema`.
- Permisos de datos declarados por microapp.
- Declaración de efectos locales o externos.
- Estimación de coste antes de ejecutar.
- Evidencias, activos y acciones sugeridas en el resultado.
- Ejecución mediante Jobs y seguimiento de estado.
- Enlace de ejecuciones con lead, cuenta o producción.
- Routing entre proveedores, BYOK o gestionado, calidad y límite de gasto.
- Motor de Flows versionado con triggers manuales y por evento; el contrato del grafo también admite trigger programado, aunque no se ha localizado todavía el despachador cron que lo ejecute.
- Nodos de microapp, capability, acción, aprobación, condición, mapa y espera.
- Dry-run, presupuesto máximo, checkpoints, reanudación, cancelación e idempotencia.
- Separación de funciones en aprobaciones sensibles.
- Cinco recetas de sistema.

### No debe darse por construido todavía

No se ha encontrado en el producto un servidor MCP de Vendrava que publique estas operaciones a clientes externos. MCP es la siguiente capa de exposición, no un sustituto de las API existentes ni una integración que debamos afirmar como terminada.

Tampoco existen todavía todos los workflows propuestos en este documento. Hoy hay 147 microapps y cinco recetas de sistema; el resto es el catálogo recomendado de Flows a construir sobre ellas.

### La distinción que debemos mantener

| Pieza | Qué hace | Quién decide |
|---|---|---|
| Microapp | Resuelve una tarea especializada y devuelve datos estructurados | Persona, Flow o agente |
| Capability | Ejecuta una capacidad normalizada en un proveedor | Router de Vendrava según política |
| Flow | Encadena pasos conocidos con controles explícitos | Diseñador del playbook |
| Agente | Elige, adapta o replanifica el playbook según el objetivo | Modelo bajo una política autorizada |
| MCP | Permite descubrir e invocar el sistema desde un cliente compatible | No concede autoridad por sí mismo |

MCP transporta intención y resultados. **La autoridad continúa en Vendrava**: organización, membresía, RBAC, entitlement, consentimiento, presupuesto y aprobaciones.

---

## 3. No exponer 147 tools simultáneas

Publicar una tool MCP por cada microapp parece atractivo, pero provocaría cuatro problemas:

- consumiría contexto del agente solo para describir herramientas;
- empeoraría la selección entre capacidades parecidas;
- haría frágil el contrato cada vez que se añada una microapp;
- convertiría al cliente MCP en responsable de permisos, costes y compatibilidad.

La mejor superficie es pequeña y estable, con descubrimiento dinámico.

### Superficie MCP propuesta

| Tool MCP conceptual | Función |
|---|---|
| `vendrava.context.get` | Obtiene contexto autorizado de una entidad: lead, cuenta, oportunidad, campaña, producción o activo |
| `vendrava.microapps.search` | Busca habilidades por objetivo, categoría, entidad, permisos, coste y efecto |
| `vendrava.microapps.get` | Devuelve el manifiesto, schemas, evidencias esperadas y requisitos de una microapp |
| `vendrava.microapps.estimate` | Cotiza una ejecución con el stack y modo elegidos |
| `vendrava.microapps.run` | Ejecuta una microapp con clave idempotente y enlaces de entidad |
| `vendrava.jobs.get` | Consulta estado, progreso, decisión de routing, coste y resultado |
| `vendrava.flows.search` | Busca playbooks por objetivo, trigger, entidad y nivel de autonomía |
| `vendrava.flows.plan` | Instancia un Flow con variables, presupuesto y política, sin ejecutarlo |
| `vendrava.flows.dry_run` | Valida dependencias y devuelve desglose de coste, permisos y gates |
| `vendrava.flows.run` | Inicia una versión inmutable del Flow |
| `vendrava.flows.get_run` | Devuelve timeline, pasos, evidencias, gasto y bloqueos |
| `vendrava.flows.cancel` | Solicita cancelación segura del run |
| `vendrava.approvals.list` | Lista decisiones humanas pendientes para el usuario autorizado |
| `vendrava.approvals.decide` | Aprueba o rechaza sin permitir autoaprobación |
| `vendrava.assets.get` | Recupera un activo autorizado y su genealogía |
| `vendrava.assets.publish` | Publica una copia inmutable después de los guards aplicables |
| `vendrava.outcomes.get` | Recupera métricas y resultados atribuibles al trabajo ejecutado |

### Recursos MCP útiles

Además de tools, Vendrava podría ofrecer recursos legibles y cacheables:

- catálogo de microapps instaladas;
- catálogo de Flows publicados;
- diccionario de capabilities y proveedores disponibles;
- políticas de autonomía de la organización;
- esquema de entidades accesibles;
- guía de voz de marca aprobada;
- biblioteca de claims y evidencias;
- estado de conexiones sin exponer secretos;
- historial y evidencias de un run.

El agente no necesita conocer el catálogo entero. Primero busca por intención; después recibe entre tres y ocho candidatos compatibles y elige con información de coste, frescura, permisos y efecto.

---

## 4. Bucle operativo de un agente

Un agente de Vendrava debería trabajar con este ciclo:

1. **Entender el objetivo.** Por ejemplo: «prepara la reunión con esta cuenta».
2. **Resolver la entidad.** Identificar cuenta, lead, oportunidad o producción dentro de la organización.
3. **Descubrir el playbook.** Buscar un Flow publicado antes de improvisar una cadena.
4. **Comprobar requisitos.** Datos, permisos, conexiones, consentimiento, frescura y evidencias.
5. **Hacer dry-run.** Obtener coste máximo, proveedores probables, pasos externos y aprobaciones.
6. **Ejecutar pasos locales.** Investigación, análisis y borradores pueden avanzar dentro de la política.
7. **Inspeccionar resultados.** Validar schemas, confianza, fuentes, huecos y anomalías.
8. **Replanificar si hace falta.** Reintentar con otro proveedor, pedir un dato o escoger una rama permitida.
9. **Detenerse en el gate humano.** Gasto, publicación, contacto, consentimiento o cambio sensible.
10. **Ejecutar el efecto autorizado.** Siempre con idempotencia y trazabilidad.
11. **Medir el outcome.** Guardar coste, resultado comercial y aprendizaje para la siguiente decisión.

El agente puede decidir **qué camino autorizado tomar**, pero no debe inventar nuevas clases de acción ni ampliar sus propios permisos.

---

## 5. Niveles de autonomía

Cada Flow debe declarar su nivel máximo, no dejarlo a la interpretación del agente.

| Nivel | Nombre | Puede hacer |
|---|---|---|
| A0 | Recomendar | Analizar y proponer un plan; no crea ni modifica nada |
| A1 | Preparar | Ejecutar microapps locales, generar informes, borradores, activos privados y tareas reversibles |
| A2 | Actuar con aprobación | Preparar todo y ejecutar efectos externos solo tras aprobación humana específica |
| A3 | Automático acotado | Ejecutar efectos previamente autorizados dentro de presupuesto, frecuencia, audiencia y ventana definidos |

Recomendación: empezar con A1 como valor por defecto. Usar A2 para campañas, emails, publicaciones, llamadas o activos públicos. Reservar A3 para tareas repetitivas y reversibles, como monitores, informes o enriquecimientos con límites muy claros.

---

## 6. Mejoras a los cinco Flows actuales

### 6.1 Oportunidad ganada → caso, anuncio y atribución

### Estado actual

`content-multiplier` → aprobación de gasto → generación de imágenes → upscale → publicación del activo → borrador de landing → aprobación de campaña → Meta pausada → activación → espera de siete días → informe de atribución.

### Mejora propuesta

1. `verifiable-case-study` crea el caso solo con resultados, citas y claims aportados.
2. `claims-evidence-library` clasifica lo utilizable, restringido, caducado o no verificado.
3. Condición: si falta evidencia crítica, crear tarea y detener la rama pública.
4. `client-approval-center` prepara el paquete de aprobación del cliente.
5. Aprobación de contenido y derechos.
6. `content-multiplier` crea las piezas por canal.
7. `social-proof-inspector` revisa fuerza, procedencia y permisos de la prueba social.
8. `offer-audience-angle-matrix` decide qué mensaje corresponde a qué audiencia.
9. `controlled-ad-variants` genera variantes controladas.
10. `ad-policy-risk-review` revisa riesgo antes de crear anuncios.
11. Generación visual, comparador de proveedores y upscale de la ganadora.
12. `ad-to-landing-translator` mantiene continuidad entre anuncio y landing.
13. Segunda aprobación: presupuesto, destino, audiencia y publicación.
14. Publicación pausada, activación y monitorización.
15. `attribution-repairer` comprueba tracking antes de evaluar rendimiento.
16. `monthly-client-report` incorpora resultados, gasto y siguientes acciones.

**Ganancia:** convierte una automatización creativa en un sistema verificable de crecimiento.  
**Autonomía:** A2.  
**Gates:** evidencia/derechos y activación con gasto.

### 6.2 Dossier antes de la reunión

### Estado actual

`company-research-360` → `call-prep` → creación de tarea.

### Mejora propuesta

1. `company-research-360` crea la base factual.
2. `buying-signal-radar` y `trigger-event-detector` detectan señales recientes.
3. `technology-change-detector`, `funding-ma-radar` y `tender-opportunity-radar` se ejecutan solo cuando son relevantes.
4. `decision-maker-map` identifica decisores e incógnitas.
5. `account-political-map` plantea relaciones e influencia sin fingir certezas.
6. `deal-competitor-detector` reúne alternativas presentes en la oportunidad.
7. `discovery-question-generator` prepara preguntas por hipótesis.
8. `call-prep` sintetiza el dossier final.
9. `sales-meeting-simulator` permite ensayar la conversación.
10. `negotiation-prep` se añade únicamente si la oportunidad está en negociación.

**Ganancia:** el dossier deja de ser un resumen y se convierte en preparación de decisión.  
**Autonomía:** A1.  
**Gate:** ninguno para investigar; aprobación si después se contacta al prospecto.

### 6.3 Anuncio con imagen mejorada

### Estado actual

Generación de borrador → aprobación de gasto → upscale → aviso.

### Mejora propuesta

1. `offer-audience-angle-matrix` estructura oferta, audiencia y ángulo.
2. `ad-angle-miner` propone conceptos respaldados por inputs.
3. `hook-memory-library` recupera patrones aprobados y evita repetir fatiga.
4. `controlled-ad-variants` define qué variable cambia en cada pieza.
5. `ad-policy-risk-review` bloquea o suaviza claims de riesgo.
6. Generar imágenes con dos rutas de proveedor cuando el presupuesto lo permita.
7. `blind-provider-comparator` evalúa resultados sin sesgo de marca.
8. Aprobación de la pieza ganadora y del gasto premium.
9. `magnific-enhancer` o `image.upscale` produce el máster.
10. `ad-to-landing-translator` genera la especificación de continuidad.
11. `intelligent-format-adapter` crea formatos por canal.
12. `delivery-package-builder` empaqueta activos y manifiesto.

**Ganancia:** optimiza el sistema creativo, no solo los píxeles.  
**Autonomía:** A1 mientras los activos sean privados; A2 al publicar.

### 6.4 Investigación y diagnóstico

### Estado actual

`company-research-360` → `prospect-diagnosis` → tarea de seguimiento.

### Mejora propuesta

1. `company-research-360` y `market-review-researcher` reúnen contexto.
2. `buying-signal-radar` y `trigger-event-detector` buscan señales accionables.
3. `prospect-diagnosis` plantea problemas e hipótesis.
4. `explainable-prospect-scoring` calcula prioridad con razones visibles.
5. Condición por score y evidencia:
   - alta: `abm-account-planner`;
   - media: `hyperpersonalized-sequence` en borrador;
   - baja: tarea de nutrición o espera programada.
6. `best-customer-lookalikes` ayuda a encontrar cuentas parecidas después de validar el perfil.

**Ganancia:** pasa de producir un informe a decidir el siguiente tratamiento comercial.  
**Autonomía:** A1; A2 para activar una secuencia.

### 6.5 De concepto a storyboard

### Estado actual

`cinema-concepts` → aprobación de gasto → generación en mapa de un fotograma por escena → aviso.

### Mejora propuesta

1. `virtual-creative-director` elige y convierte el concepto en reglas de dirección.
2. `consented-synthetic-casting` valida casting y consentimiento.
3. `character-continuity-guardian` y `product-continuity-guardian` crean las biblias.
4. `storyboard-shotlist` estructura escenas y planos.
5. `virtual-camera-director` define cámara y movimiento.
6. Aprobación de concepto, referencias y coste.
7. Map de generación de storyboard.
8. `studio-broll-generator` o `contextual-broll-generator` completa cobertura.
9. Generación de tomas de vídeo.
10. `production-continuity-inspector` revisa consistencia.
11. `trailers-cutdowns` o `trailer-cutdown-generator` crea versiones.
12. `visual-localization-dubbing` o `audiovisual-localizer` adapta mercados.
13. `subtitle-inspector`, `audiovisual-qc-inspector` y `audiovisual-rights-inspector` validan entrega.
14. `delivery-package-builder` produce el paquete final.

**Ganancia:** convierte el storyboard en una línea de producción audiovisual gobernada.  
**Autonomía:** A2 por coste, personas identificables, derechos y publicación.

---

## 7. Nuevos Flows comerciales y de revenue

Los siguientes flujos reutilizan solo microapps actuales. Los nombres son propuestas de producto.

| Flow | Trigger | Cadena principal | Genera | Autonomía y gate |
|---|---|---|---|---|
| **Señal → cuenta priorizada** | Diario o nueva cuenta | `buying-signal-radar` → `trigger-event-detector` → `technology-change-detector` → `explainable-prospect-scoring` | Score explicado, señales, caducidad y siguiente acción | A3 para analizar; A1 para crear tarea |
| **Territorio inteligente** | Mensual | `best-customer-lookalikes` → `sales-territory-planner` → `explainable-prospect-scoring` | Segmentos, asignación propuesta y cobertura | A1; cambios de ownership requieren aprobación |
| **Ataque ABM a una cuenta** | Cuenta priorizada | `company-research-360` → `decision-maker-map` → `account-political-map` → `abm-account-planner` → `hyperpersonalized-sequence` | Plan ABM, mapa de personas y secuencia en borrador | A2 antes de contactar |
| **Preparación de reunión** | Reunión próxima | `company-research-360` → `call-prep` → `discovery-question-generator` → `sales-meeting-simulator` | Dossier, preguntas, riesgos y ensayo | A1 |
| **Demo personalizada** | Reunión de solución | `personalized-demo-builder` → `business-case-builder` → `sales-meeting-simulator` | Guion de demo, datos sintéticos y respuestas probables | A1 |
| **Diagnóstico de single-threading** | Oportunidad activa | `single-threading-detector` → `decision-maker-map` → `account-political-map` → `champion-expansion-plan` | Riesgo relacional y plan multihilo | A1 |
| **Rescate de deal estancado** | Sin actividad o etapa vencida | `stalled-deal-rescuer` → `deal-competitor-detector` → `sector-objection-researcher` → `negotiation-prep` | Diagnóstico, opciones y tarea de rescate | A1; contacto A2 |
| **Plan de cierre** | Entrada en proposal/negotiation | `opportunity-close-plan` → `mutual-action-plan` → `explainable-close-date-predictor` → `negotiation-prep` | Close plan, MAP, riesgos y fecha explicada | A1; compartir MAP A2 |
| **Propuesta defendible** | Solicitud de propuesta | `commercial-proposal-generator` → `business-case-builder` → `roi-calculator` → `claims-evidence-library` | Propuesta, business case, ROI y claims revisados | A1; envío A2 |
| **POC controlada** | Objeción técnica | `poc-designer` → `mutual-action-plan` → `client-approval-center` | Alcance, criterios de éxito, responsables y aprobación | A2 |
| **Copiloto posllamada** | Llamada terminada | `call-emotion-friction-analyzer` → `call-compliance-inspector` → `post-call-followup-generator` → `seller-coach` | Riesgos, coaching, email y tareas propuestas | A1; envío A2 |
| **Mejora del playbook de llamadas** | Lote semanal de llamadas | `missed-call-analyzer` → `call-opening-optimizer` → `objection-lab` → `seller-coach` | Patrones, nuevas aperturas y ejercicios | A1; cambiar playbook requiere aprobación |
| **Ciclo de vida del agente de voz** | Nuevo caso de uso o versión | `voice-agent-designer` → `objection-lab` → `voice-agent-qa` → `call-compliance-inspector` | Configuración, suite de pruebas y dictamen | A2 antes de `agent.activate` |
| **Expansión de cuenta** | Señal positiva o QBR | `expansion-opportunity-detector` → `champion-expansion-plan` → `business-case-builder` | Oportunidad explicada y plan de expansión | A1; crear/mover oportunidad A2 |
| **Renovación protegida** | 120/90/60 días antes | `churn-risk-detector` → `renewal-prep` → `qbr-prep` → `mutual-action-plan` | Riesgo, valor probado, plan de renovación y tareas | A1; propuesta/envío A2 |

---

## 8. Nuevos Flows de crecimiento, Ads y landings

| Flow | Trigger | Cadena principal | Genera | Autonomía y gate |
|---|---|---|---|---|
| **Fábrica de campaña completa** | Brief aprobado | `offer-audience-angle-matrix` → `ad-angle-miner` → `full-campaign-generator` → `controlled-ad-variants` → `ad-policy-risk-review` → `ad-to-landing-translator` | Campaña, variantes, landing y plan de medición | A2 antes de publicación/gasto |
| **Recuperación de fatiga creativa** | Métricas por debajo del umbral | `creative-fatigue-doctor` → `hook-memory-library` → `controlled-ad-variants` → `blind-provider-comparator` | Diagnóstico y reemplazos controlados | A2 para sustituir creatividades |
| **Doctor de conversión de landing** | Caída de conversión | `landing-autopsy` → `weak-promise-detector` → `form-friction-optimizer` → `social-proof-inspector` → `ab-test-hypothesis-designer` | Backlog CRO priorizado y test medible | A1; publicar variante A2 |
| **Pricing y oferta** | Revisión trimestral | `irresistible-offer-builder` → `pricing-page-optimizer` → `social-proof-inspector` → `ab-test-hypothesis-designer` | Arquitectura de oferta, pricing page y experimentos | A1; cambios comerciales A2 |
| **Retargeting gobernado** | Audiencias disponibles | `retargeting-planner` → `multichannel-campaign-adapter` → `ad-policy-risk-review` → `multichannel-budget-optimizer` | Segmentos, exclusiones, secuencia y presupuesto | A2 |
| **Auditoría integral de Ads** | Semanal | `ad-account-structure-auditor` → `creative-fatigue-doctor` → `video-ad-inspector` → `attribution-repairer` → `ai-spend-auditor` | Informe de estructura, creatividad, tracking y gasto | A0/A1 |
| **UGC a producción** | Nuevo ángulo aprobado | `ugc-campaign-builder` → `consented-synthetic-casting` → `virtual-creative-director` → `product-video-generator` → `video-ad-inspector` | Guion, casting, vídeo y revisión | A2 por consentimiento y gasto |
| **Lead magnet a demanda** | Objetivo de captación | `lead-magnet-designer` → `brand-voice-compiler` → `ad-to-landing-translator` → `webinar-campaign-builder` o `full-campaign-generator` | Activo, landing, campaña y secuencia | A2 al publicar o enviar |
| **Reparación de atribución** | Discrepancia detectada | `attribution-repairer` → `end-to-end-experience-auditor` → `monthly-client-report` | Mapa de eventos, huecos, plan de reparación y lectura corregida | A1; tocar integraciones A2 |

---

## 9. Nuevos Flows de contenido, autoridad y medios

| Flow | Trigger | Cadena principal | Genera | Autonomía y gate |
|---|---|---|---|---|
| **Informe → campaña** | Informe o estudio terminado | `report-to-campaign` → `claims-evidence-library` → `content-multiplier` → `multichannel-campaign-adapter` | Narrativa, piezas, activos comerciales y calendario | A2 para publicar |
| **Motor de autoridad** | Trimestral | `original-study-builder` → `authority-report` → `executive-opinion-engine` → `sales-asset-generator` | Estudio, informe, POV ejecutivo y enablement | A1; claims/publicación A2 |
| **Fábrica de podcast** | Invitado confirmado | `podcast-guest-research` → `podcast-producer` → `publishable-moment-finder` → `content-multiplier` → `subtitle-inspector` | Dossier, escaleta, clips, posts, newsletter y SRT | A2 por derechos/publicación |
| **Webinar a pipeline** | Tema aprobado | `webinar-campaign-builder` → `lead-magnet-designer` → `full-campaign-generator` → `publishable-moment-finder` → `sales-asset-generator` | Landing, promoción, follow-up, clips y activos de venta | A2 |
| **SEO programático gobernado** | Mensual | `seo-cluster-builder` → `seo-overlap-auditor` → `commercial-editorial-planner` → `generic-content-detector` → `content-refresh-auditor` | Clusters sin canibalización, briefs y backlog | A1; publicación A2 |
| **Newsletter personalizada** | Semanal | `voice-of-customer` → `executive-opinion-engine` → `personalized-newsletter-builder` → `brand-voice-compiler` | Ediciones por segmento con voz consistente | A2 para envío |
| **Reciclaje de contenido antiguo** | Caducidad o caída SEO | `content-refresh-auditor` → `generic-content-detector` → `claims-evidence-library` → `content-multiplier` | Plan de actualización y nuevas piezas | A1; publicación A2 |

---

## 10. Nuevos Flows de Studio audiovisual

| Flow | Trigger | Cadena principal | Genera | Autonomía y gate |
|---|---|---|---|---|
| **Vídeo de producto end-to-end** | Brief aprobado | `product-video-generator` → `virtual-creative-director` → `storyboard-shotlist` → `product-continuity-guardian` → `virtual-camera-director` → generación de vídeo → `audiovisual-qc-inspector` | Producción, tomas, máster y QC | A2 por coste y publicación |
| **Presentador autorizado multicanal** | Campaña con portavoz | `authorized-presenter` → `consented-synthetic-casting` → `character-continuity-guardian` → `intelligent-format-adapter` | Kit de presentador, reglas, piezas y formatos | A2 por identidad y consentimiento |
| **Localización audiovisual** | Máster aprobado | `audiovisual-localizer` → `visual-localization-dubbing` → `subtitle-inspector` → `audiovisual-rights-inspector` | Doblajes, subtítulos, versiones y matriz de derechos | A2 |
| **Máster → distribución** | Export terminado | `trailer-cutdown-generator` → `intelligent-format-adapter` → `audiovisual-qc-inspector` → `delivery-package-builder` | Tráilers, cortes, QC y paquete verificable | A1; publicación A2 |
| **Control de continuidad** | Cada lote de tomas | `character-continuity-guardian` → `product-continuity-guardian` → `production-continuity-inspector` → `contextual-broll-generator` | Informe de desviaciones y lista de reshoots/b-roll | A1 |

---

## 11. Nuevos Flows de agencia y Customer Success

| Flow | Trigger | Cadena principal | Genera | Autonomía y gate |
|---|---|---|---|---|
| **Onboarding de cliente** | Contrato ganado | `client-onboarding-copilot` → `integration-tester` → `credential-health-monitor` → `mutual-action-plan` | Proyecto de onboarding, owners, accesos, riesgos y go-live | A1; conectar/activar A2 |
| **Informe mensual de cliente** | Mensual | `monthly-client-report` → `client-margin-auditor` → `client-profitability-calculator` → `next-microapp-recommender` | Resultados, margen, recomendaciones y agenda | A1; compartir A2 |
| **QBR basada en evidencia** | Trimestral | `qbr-prep` → `verifiable-case-study` → `expansion-opportunity-detector` → `champion-expansion-plan` | Deck lógico, valor probado y plan siguiente | A1 |
| **Guardia de rentabilidad** | Semanal/mensual | `client-margin-auditor` → `ai-spend-auditor` → `ai-stack-optimizer` → `client-profitability-calculator` | Alertas de margen y escenarios de corrección | A3 para alertar; cambios A2 |
| **Centro de aprobación de cliente** | Activo listo | `client-compliance-pack` → `claims-evidence-library` → `audiovisual-rights-inspector` → `client-approval-center` | Paquete, evidencias, versiones y decisión auditable | A2 |
| **Salud y renovación** | Score o fecha | `churn-risk-detector` → `monthly-client-report` → `renewal-prep` → `qbr-prep` | Riesgos, recuperación y narrativa de renovación | A1 |

---

## 12. Nuevos Flows de datos, integraciones y AI Ops

| Flow | Trigger | Cadena principal | Genera | Autonomía y gate |
|---|---|---|---|---|
| **Migración de datos segura** | CSV/Excel recibido | `csv-excel-doctor` → `explainable-record-deduplicator` → `schema-mapper` → dry-run de importación | Archivo limpio, merges explicados y mapping | A1; importación real A2 |
| **Base de conocimiento gobernada** | Nuevas fuentes | `csv-excel-doctor` → `explainable-record-deduplicator` → `knowledge-base-builder` | Borradores de conocimiento, procedencia y conflictos | A1; publicar conocimiento A2 |
| **Salud de integraciones** | Cada hora/diario | `credential-health-monitor` → `integration-tester` → `webhook-auditor` → `broken-automation-detector` | Alertas accionables con causa y alcance | A3 para observar/avisar |
| **Regresión de prompts y modelos** | Nueva versión | `prompt-model-lab` → `prompt-drift-detector` → `provider-benchmark` → `blind-provider-comparator` | Evaluación, regresiones, coste, latencia y recomendación | A1; cambio de producción A2 |
| **Optimizador de stack** | Mensual o subida de coste | `ai-spend-auditor` → `byok-managed-comparator` → `ai-stack-optimizer` → `ai-cost-simulator` | Escenarios por proveedor/modo y ahorro esperado | A1; cambiar routing A2 |
| **Calidad de workflows** | Publicación o despliegue | `flow-auditor` → `workflow-synthetic-evaluator` → `broken-automation-detector` | Errores estáticos, casos sintéticos y regresiones | A3 en CI/monitorización |
| **Monitor de proveedores** | Diario | `provider-change-monitor` → `integration-tester` → `ai-cost-simulator` | Cambios, impacto, alternativas y plan de migración | A3 para vigilar; migración A2 |
| **Creación asistida de microapp** | Hueco de capacidad aprobado | `next-microapp-recommender` → `declarative-microapp-generator` → `workflow-synthetic-evaluator` → `flow-auditor` | Manifiesto declarativo, tests conceptuales y revisión | A1; marketplace/publicación A2 |

---

## 13. Los diez Flows P0

No conviene construir cincuenta Flows a la vez. Los diez siguientes cubren el mayor valor transversal y demuestran el sistema agentic:

1. **Preparación de reunión** — valor inmediato para ventas, bajo riesgo y contexto claro.
2. **Plan de cierre** — une pipeline, análisis y colaboración comprador-vendedor.
3. **Copiloto posllamada** — convierte conversaciones en coaching y acciones.
4. **Fábrica de campaña completa** — demuestra composición de contenido, Ads, landing y aprobación.
5. **Onboarding de cliente** — enlaza ventas, operaciones, conexiones y Customer Success.
6. **Informe mensual de cliente** — demuestra outcomes, margen y recomendaciones recurrentes.
7. **Vídeo de producto end-to-end** — materializa el diferencial del Studio y el routing multimodelo.
8. **Salud de integraciones** — hace fiable la plataforma que consumen los agentes.
9. **Optimizador de stack** — convierte la neutralidad de proveedor en ahorro visible.
10. **Migración de datos segura** — abre la puerta de entrada a clientes con datos imperfectos.

### Orden recomendado

| Ola | Flows | Razón |
|---|---|---|
| P0.1 | Preparación de reunión, Copiloto posllamada, Salud de integraciones | Bajo riesgo y resultado rápido |
| P0.2 | Plan de cierre, Onboarding, Informe mensual | Conectan entidades y operaciones reales |
| P0.3 | Fábrica de campaña, Vídeo de producto | Añaden gasto, activos y aprobaciones complejas |
| P0.4 | Optimizador de stack, Migración de datos | Consolidación operativa y valor financiero |

---

## 14. Agentes especializados sobre el mismo sistema

No hace falta crear un agente distinto por microapp. Bastan agentes por dominio con políticas, objetivos y herramientas acotadas.

### Revenue Agent

- Puede leer cuentas, leads, reuniones y pipeline según scope.
- Usa investigación, preparación, scoring, close plans, propuestas y seguimiento.
- Puede crear borradores y tareas.
- No puede contactar, mover etapa ni activar agentes sin la autorización correspondiente.

### Growth Agent

- Puede analizar Ads, landings, ofertas, atribución y creatividad.
- Prepara campañas, variantes y experimentos.
- No activa gasto ni publicación externa sin gate.
- Debe usar biblioteca de claims y revisión de políticas.

### Content Agent

- Convierte investigación, llamadas e informes en planes y piezas.
- Aplica voz de marca, detección de contenido genérico y evidencias.
- Produce borradores; la publicación sigue la política de canal.

### Studio Producer Agent

- Coordina concepto, storyboard, tomas, continuidad, localización y QC.
- Elige proveedores dentro del presupuesto.
- No usa una identidad ni publica un máster sin consentimiento y derechos válidos.

### Customer Success Agent

- Ejecuta onboarding, salud, QBR, renovación, reporting y expansión.
- Puede preparar tareas y planes.
- No cambia contratos ni compromisos comerciales por sí mismo.

### AI Ops Agent

- Supervisa costes, credenciales, webhooks, providers, prompts y Flows.
- Puede ejecutar pruebas y enviar alertas automáticamente.
- Los cambios de routing, credenciales o versiones de producción requieren aprobación.

El mismo cliente MCP podría cambiar de agente manteniendo las mismas primitivas. Lo que cambia es la **política de herramientas, entidades, presupuesto y efectos**, no el backend.

---

## 15. Contexto y memoria que necesitan los agentes

Un workflow agentic no debe depender únicamente del historial del chat. Necesita capas de contexto explícitas:

### Contexto de ejecución

- objetivo actual;
- entidad principal y entidades relacionadas;
- inputs confirmados;
- presupuesto y fecha límite;
- nivel de autonomía;
- versión del Flow;
- pasos completados y resultados.

### Memoria empresarial

- voz de marca aprobada;
- claims permitidos y sus evidencias;
- ICP y segmentos;
- playbooks comerciales;
- restricciones del cliente;
- preferencias de proveedores;
- conexiones disponibles.

### Ledger de evidencia

Cada afirmación relevante debe conservar:

- fuente o referencia interna;
- fecha de obtención;
- confianza;
- microapp y versión que la produjo;
- inputs de los que deriva;
- caducidad;
- usos autorizados.

### Regla esencial

El agente no debería escribir silenciosamente sus conclusiones en el registro canónico del CRM. Primero produce una propuesta estructurada; una acción autorizada realiza el cambio y el audit log conserva quién, qué y por qué.

---

## 16. Contrato recomendado para cada Flow agentic

Además del grafo actual, cada Flow debería describirse con metadatos de producto y de agente:

```yaml
id: meeting-preparation
version: 1
goal: Preparar una reunión comercial con evidencia reciente
compatibleEntities: [account, lead, opportunity, meeting]
triggers: [manual, meeting.upcoming]
autonomy: A1
requiredPermissions:
  - accounts.read
  - pipeline.read
requiredCapabilities:
  - web.search
maxBudgetPolicy: organization_default
freshnessPolicy:
  companyResearchDays: 7
humanGates: []
successOutput:
  schema: MeetingBrief
outcomes:
  - meeting_held
  - next_step_created
  - opportunity_advanced
```

Campos que merece la pena añadir al catálogo de Flows:

- intención y resultados esperados;
- entidades compatibles;
- triggers admitidos;
- prerequisites y conexiones necesarias;
- permisos de lectura y escritura;
- efectos locales y externos;
- nivel máximo de autonomía;
- política de presupuesto;
- checkpoints y gates humanos;
- estrategia de reintento y compensación;
- schema del resultado final;
- métricas de outcome;
- tiempo y coste históricos;
- casos de evaluación antes de publicar.

Esto permite que un agente elija un Flow por compatibilidad real y no solo por similitud semántica del nombre.

---

## 17. Planificación: libertad con límites

Hay tres modos de composición posibles:

### Modo 1 — Playbook fijo

El agente rellena variables y ejecuta un Flow publicado sin cambiar el grafo. Es el modo más seguro y el recomendado para P0.

### Modo 2 — Playbook con ramas

El Flow contiene condiciones previamente autorizadas. El agente aporta evidencia o decide entre ramas válidas: por ejemplo, negociación frente a discovery, o generar una variante adicional si el QC falla.

### Modo 3 — Plan generado y validado

El agente propone una secuencia usando microapps instaladas. Vendrava valida:

- que los IDs y schemas existan;
- que todas las referencias sean resolubles;
- que no haya ciclos o saltos inválidos;
- que los permisos estén disponibles;
- que las conexiones funcionen;
- que el coste no supere el límite;
- que los efectos sensibles tengan gates;
- que el plan pase casos sintéticos.

Solo entonces se publica una versión inmutable y se ejecuta. Este modo debe llegar después de que los playbooks fijos generen suficiente historial.

---

## 18. Mejoras necesarias en el motor de Flows

El motor actual ya ofrece una base sólida: versionado inmutable, Jobs, triggers, condiciones, esperas, fan-out acotado, dry-run, presupuesto, aprobaciones, reanudación e idempotencia. Para ejecutar cómodamente todos los playbooks anteriores y permitir planificación agentic segura, conviene ampliarlo con estas primitivas.

| Mejora | Por qué hace falta | Prioridad |
|---|---|---|
| **Nodo `subflow`** | Reutilizar bloques como «revisar claims», «preparar publicación» o «hacer QC» sin copiar veinte nodos | P0 |
| **Fan-out de microapps** | El `map` actual está limitado a plantillas de capability o acción; necesitamos ejecutar una microapp por cuenta, segmento, escena o idioma | P0 |
| **Joins explícitos** | Reunir ramas paralelas y esperar a que todas, una o un quorum terminen antes de sintetizar | P0 |
| **Bindings tipados entre outputs e inputs** | Validar en publicación que la salida real de una microapp satisface la entrada de la siguiente, con transformaciones declarativas | P0 |
| **Nodo `request_input`** | Pausar para pedir un dato, archivo o decisión que falta sin convertirlo en aprobación ni fallar el run | P0 |
| **Aprobación con preview** | Mostrar exactamente payload, activos, audiencia, coste y efecto que se aprobarán; impedir que cambien después | P0 |
| **Política de fallback por nodo** | Declarar cuándo cambiar proveedor, reducir calidad, omitir una rama o bloquearse | P1 |
| **Reintentos declarativos** | Máximo, backoff, errores reintentables y conducta ante outcome externo incierto | P1 |
| **Nodo de evaluación** | Puntuar una salida con rúbrica y decidir si pasa, se rehace o va a revisión humana | P1 |
| **Plan/replan acotado** | Permitir al agente escoger únicamente entre microapps, ramas y presupuestos autorizados | P1 |
| **Correlación de eventos** | Reanudar una espera solo con el evento correspondiente a la misma entidad y run | P1 |
| **Compensación de Flow** | Definir saga/rollback por paso y distinguir efectos reversibles de revisión manual | P1 |
| **Variables y secretos separados** | Los grafos referencian conexiones por alias; nunca copian tokens o secretos en variables/resultados | P0 |
| **Outcome schema y SLA** | Saber cuándo un Flow terminó técnicamente y cuándo consiguió el resultado empresarial | P1 |
| **Límites de agente** | Máximo de pasos, replans, coste, tiempo, llamadas externas y profundidad de subflows | P0 |

### Qué no debe añadirse

- JavaScript arbitrario dentro del grafo.
- Prompts capaces de generar acciones no incluidas en el catálogo.
- Bucles sin límite o auto-recursión.
- Herramientas que acepten `orgId`, rol o permisos enviados por el propio modelo.
- Reintentos automáticos de efectos externos cuyo resultado remoto sea incierto.
- Cambios silenciosos sobre CRM, campañas, credenciales o routing de producción.

### Estrategia de compatibilidad

Las mejoras deben ampliar el grafo declarativo existente. Los cinco Flows actuales y sus versiones publicadas deben continuar ejecutándose sin migraciones destructivas. Un Flow nuevo puede declarar la versión mínima del runner que necesita; el publicador rechaza dependencias que el despliegue no soporte.

---

## 19. Seguridad y gobierno

### Permisos

- Toda llamada MCP debe mapearse a una identidad y organización reales.
- El scope `own`, `team` u `org` se resuelve en servidor.
- Una tool visible no implica que el usuario tenga acceso a cualquier entidad.
- El agente nunca recibe secretos BYOK; solo estados y capacidades disponibles.

### Presupuesto

- Cotización previa obligatoria para ejecuciones con coste.
- Presupuesto máximo por run.
- Límites por agente, proveedor, capability, día y organización.
- Pausa para aprobación cuando la estimación excede el presupuesto restante.
- Conciliación con coste real y alerta por desviación.

### Efectos externos

- Borradores locales pueden automatizarse.
- Email, SMS, llamadas, Ads, social y publicación pública requieren la política específica.
- Nunca debe deducirse aprobación de una frase ambigua en el chat.
- La aprobación debe referenciar run, nodo, versión, coste y payload exactos.
- Quien inicia una operación sensible no se autoaprueba.

### Consentimiento y derechos

- Voz o identidad reconocible exige ConsentGrant válido y tenant-safe.
- Claims, testimonios y casos de éxito deben conservar procedencia y autorización.
- Publicar un activo debe crear una copia inmutable y mantener genealogía.
- Localización o adaptación no amplía automáticamente derechos territoriales o de canal.

### Fallos e idempotencia

- Cada invocación del agente necesita una clave idempotente.
- Un resultado externo incierto se pone en cuarentena; no se reintenta a ciegas.
- El agente puede seleccionar una alternativa solo si la política lo permite.
- Las compensaciones deben ser explícitas; «deshacer» no siempre equivale a borrar.

---

## 20. Observabilidad y evaluación

Para confiar en estos agentes, cada run debe responder:

- qué objetivo recibió;
- qué Flow y versión eligió;
- qué microapps ejecutó;
- por qué eligió cada rama o proveedor;
- qué datos leyó;
- qué evidencias utilizó;
- qué coste estimó y cuál fue el real;
- dónde esperó aprobación;
- qué efectos externos produjo;
- qué reintentos o compensaciones ocurrieron;
- qué outcome empresarial se observó.

### Métricas de plataforma

- tasa de éxito por Flow y versión;
- porcentaje de runs que requieren intervención;
- tiempo hasta resultado;
- coste estimado frente a real;
- ahorro por routing;
- pasos fallidos por proveedor;
- aprobaciones aceptadas, rechazadas y caducadas;
- completitud de evidencia;
- frescura de fuentes;
- tasa de acciones sugeridas que se ejecutan;
- resultado comercial por Flow.

### Evals antes de publicar un Flow

- inputs completos, incompletos y adversos;
- permisos insuficientes;
- proveedor no disponible;
- coste por encima del límite;
- output inválido de una microapp;
- evidencia contradictoria;
- repetición idempotente;
- evento duplicado;
- aprobación rechazada;
- efecto externo con outcome incierto;
- aislamiento entre organizaciones.

`flow-auditor`, `workflow-synthetic-evaluator`, `broken-automation-detector`, `prompt-drift-detector` e `integration-tester` ya forman una base natural para automatizar esta evaluación.

---

## 21. Roadmap recomendado

### Fase 1 — Convertir catálogo en capacidad descubrible

- Añadir metadatos agentic a microapps y Flows.
- Implementar búsqueda por intención, entidad, efecto, coste y permisos.
- Publicar una superficie MCP compacta sobre las API autorizadas.
- Incluir dry-run y cotización como paso estándar.
- No exponer las 147 microapps como tools simultáneas.

### Fase 2 — Publicar los Flows P0 como playbooks fijos

- Construir los diez P0 por olas.
- Añadir schemas de resultado y outcomes.
- Probar cada uno con casos sintéticos.
- Instrumentar trazas, coste y aprobación.

### Fase 3 — Agentes por dominio

- Revenue, Growth, Content, Studio, Success y AI Ops.
- Cada agente con allowlist de Flows y límites propios.
- Selección automática de playbook y ramas autorizadas.
- Memoria empresarial basada en fuentes y evidencia.

### Fase 4 — Composición validada

- Permitir que el agente proponga nuevos grafos declarativos.
- Validarlos con el motor actual y evaluaciones sintéticas.
- Revisión humana antes de publicarlos.
- Aprender de coste, éxito y outcomes históricos.

### Fase 5 — Marketplace de playbooks agentic

- Packs por industria o función.
- Dependencias, versiones, checksum, permisos y precio visibles.
- Sin código arbitrario: manifiestos declarativos y componentes instalados.
- Métricas de calidad, coste y resultados por versión.

---

## 22. Decisión de producto

No debemos intentar vender «147 workflows» si en realidad son 147 microapps y cinco Flows publicados. La formulación potente y honesta es:

> **Vendrava ya dispone de 147 habilidades especializadas y de un motor gobernado capaz de convertirlas en workflows. La siguiente fase es publicar los playbooks de mayor valor y abrirlos a agentes mediante MCP.**

El activo diferencial no es el número de herramientas. Es que todas comparten:

- contratos estructurados;
- contexto de CRM y negocio;
- permisos multi-organización;
- routing entre proveedores;
- BYOK y modo gestionado;
- presupuesto y conciliación de costes;
- evidencias y caducidad;
- activos y genealogía;
- consentimiento;
- aprobaciones humanas;
- Jobs reanudables;
- medición de outcomes.

Un agente con acceso a una API normal puede llamar funciones. Un agente con Vendrava puede ejecutar una operación empresarial completa sin perder control, trazabilidad ni margen.

Ese es el producto: **no una colección de microapps, sino una capa de poder operativo para humanos y agentes.**
