# Vendrava

## Business Plan & Investor Brief

### AI Sales CRM y sistema operativo de revenue conversacional

**Every lead moves forward.**

| Control del documento | Detalle |
|---|---|
| Clasificación | Confidencial - conversaciones iniciales con inversores |
| Versión | v1.0 |
| Fecha | 5 de agosto de 2026 |
| Entidad vinculada públicamente | SprintMarkt, Valencia (España) |
| Etapa declarada | Prototipo funcional avanzado; pre-validación comercial y operativa |
| Uso recomendado | Enviar después del one-pager; base de conversación, no sustituto de due diligence, revisión legal o modelo financiero aprobado |

> **Principio de este documento:** separar evidencia, hipótesis y ambición. “Implementado en el repositorio” no significa “validado en producción”; una demo no equivale a tracción; un mercado grande no prueba que exista disposición de pago.

---

## 0. Lectura ejecutiva en 90 segundos

Vendrava no debe presentarse como un bot de voz ni como otro CRM horizontal. Debe presentarse como un **sistema operativo de revenue conversacional**: la capa que convierte cada señal comercial en una acción, coordina la conversación y devuelve el resultado al pipeline.

### Tesis central

- Los equipos ya tienen CRM, telefonía, WhatsApp, email, Ads y calendarios. El problema es que esas herramientas no comparten una decisión operativa: **qué debe pasar ahora con este lead**.
- Un CRM tradicional almacena actividad. Vendrava aspira a **ejecutar el siguiente paso**: captar o encontrar, llamar o responder, calificar, agendar, transferir, nutrir y aprender.
- La entrada debe ser estrecha: servicios con cita y ventas de ticket alto en España, donde velocidad, calificación y citas tienen valor económico medible.
- El activo defendible no será el modelo de voz base. Será la combinación de **datos de conversación + resultado**, playbooks por vertical, integraciones, memoria operativa, distribución y confianza.
- El producto tiene una base full-stack extensa, pero aún no existe evidencia documentada de clientes de pago, ARR, retención o unit economics. La prioridad es convertir ingeniería en una operación repetible.

| Elemento | Decisión estratégica recomendada |
|---|---|
| Categoría | AI Sales CRM / revenue conversational operating system |
| Promesa | Cada lead recibe la siguiente acción adecuada, con contexto y control humano |
| Primer flujo | Lead entrante -> contacto -> calificación -> cita/handoff -> resultado |
| Primeros ICP | Clínicas y servicios con agenda; concesionarios, inmobiliarias y servicios de ticket alto |
| Modelo | SaaS por cuenta + minutos incluidos + uso adicional + Enterprise/white-label |
| Distribución | Venta liderada por fundador + canal de agencias/consultoras + casos verticales |
| Foso | Outcome graph de conversaciones, playbooks, integraciones, gobernanza y coste de cambio |
| Estado | Prototipo funcional avanzado; staging, seguridad, integraciones y pilotos por cerrar |
| Ask propuesto | 600.000 euros pre-seed para 18 meses, sujeto a aprobación interna y due diligence |
| Hito de la ronda | Producto listo para cobrar + 5-10 design partners + primeras cohortes y margen medidos |

## 1. La oportunidad

La mayoría del software comercial se construyó como una colección de sistemas de registro. El marketing genera un lead; el CRM crea una ficha; telefonía y mensajería operan por separado; el vendedor reconstruye el contexto y decide qué hacer. Cada traspaso introduce tiempo, pérdida de información y tareas manuales.

La IA cambia la arquitectura posible. Una plataforma ya puede interpretar una señal, conversar, consultar conocimiento, ejecutar una acción, registrar el resultado y proponer el siguiente paso. Eso convierte el CRM de repositorio pasivo en **motor de ejecución**.

Vendrava tiene la oportunidad de ocupar esa capa para equipos que no quieren montar Salesforce + contact center + proveedor de voz + automatizador + agencia + integraciones a medida. Su apuesta es ofrecer un sistema accesible por cuenta, con implantación vertical y una operación diseñada para español y mercados europeos/latinoamericanos.

### Frase de posicionamiento

> Vendrava conecta la primera señal comercial con ingresos: capta, conversa, califica, agenda y mueve el pipeline desde un único sistema.

### Lo que Vendrava no debe ser

- Una API genérica de voz.
- Un marcador automático con una interfaz bonita.
- Un CRM horizontal que compite por número de funciones.
- Una agencia disfrazada de SaaS.
- Una promesa de “ventas autónomas” sin control ni evidencia.

## 2. Problema que resuelve

| Problema | Dolor operativo | Impacto de negocio | Señal que debe medir Vendrava |
|---|---|---|---|
| Respuesta tardía | El lead espera a que una persona revise otra bandeja. | Menor contacto, oportunidades frías, inversión desperdiciada. | Tiempo señal -> primer intento; p50/p95. |
| Canales fragmentados | Voz, WhatsApp, email, Ads y CRM guardan historiales distintos. | El equipo repite preguntas y pierde contexto. | Porcentaje de interacciones unificadas por lead. |
| Calificación inconsistente | Cada comercial pregunta, registra y prioriza de forma distinta. | Pipeline ruidoso y reuniones de baja calidad. | Campos completos, tasa de calificación y aceptación del handoff. |
| Seguimiento manual | Tareas, reintentos y recordatorios dependen de memoria humana. | Leads abandonados y ciclos largos. | Siguiente acción cumplida y tiempo entre toques. |
| CRM pasivo | El sistema describe el pasado, pero no ejecuta el presente. | Baja adopción y poca relación entre dato e ingreso. | Acciones ejecutadas/recomendadas y resultado atribuible. |
| Herramientas superpuestas | El cliente paga licencias, integraciones y consultoría separadas. | Coste total alto y operación frágil. | Tiempo de implantación, herramientas sustituidas y TCO. |
| Riesgo de IA sin control | Automatizar voz y mensajería sin avisos, consentimiento o trazabilidad. | Riesgo legal, reputacional y de bloqueo de canales. | Aviso, base legal, opt-out, horario, auditoría y handoff. |

El problema no es “hacer llamadas con IA”. Es que **ningún sistema se hace responsable del recorrido completo entre la señal y el resultado**.

## 3. Solución: el bucle operativo de Vendrava

Vendrava propone un ciclo cerrado:

```text
CAPTAR -> ENTENDER -> DECIDIR -> CONVERSAR -> AVANZAR -> MEDIR -> APRENDER
   ^                                                                  |
   +------------------------------------------------------------------+
```

1. **Captar:** formularios, campañas, llamadas, WhatsApp, importaciones o prospección B2B.
2. **Entender:** origen, contexto, intención, urgencia, consentimiento y valor potencial.
3. **Decidir:** acción, canal, momento, agente, coste y aprobación necesarios.
4. **Conversar:** voz, WhatsApp o email con conocimiento y playbook del cliente.
5. **Avanzar:** cita, tarea, propuesta, handoff, reintento o cierre de contacto.
6. **Medir:** tiempo de respuesta, contacto, calificación, citas, pipeline, ingreso y coste.
7. **Aprender:** detectar qué mensaje, secuencia y playbook funcionan por vertical.

### Capas del producto

| Capa | Función | Capacidades de Vendrava |
|---|---|---|
| Sistema de captación | Generar o recibir demanda. | Campañas, Ads, Prospect Finder, auditoría digital, landings, funnels, social y Organic Leads. |
| Sistema de conversación | Atender y activar al lead. | Llamadas, agentes IA, inbox, WhatsApp, email, test/laboratorio de voz y playbooks. |
| Sistema de registro | Mantener contexto comercial. | Leads, pipeline, reuniones, campañas, notas, actividad y conocimiento. |
| Sistema de decisión | Elegir el siguiente paso. | Orquestador, automatizaciones, Growth Hub y siguiente mejor acción. |
| Sistema de aprendizaje | Relacionar intervención y resultado. | Insights, experimentos, memoria operativa e inteligencia comercial. |
| Sistema de control | Limitar riesgo y coste. | Consentimiento, permisos, gobierno, auditoría, aprobaciones, scopes y guardas. |

## 4. Producto actual: evidencia frente a visión

La plataforma revisada contiene 25 entradas de sidebar agrupadas en Captación, Conversación, Nutrición, Growth, Ventas y Sistema, además del Dashboard. Esa amplitud demuestra capacidad de producto, pero también crea un riesgo de dispersión. La narrativa inversora debe centrarse en el bucle anterior y tratar los módulos como infraestructura que lo habilita.

### Estado comprobado por superficie

| Superficie | Estado en la documentación/código | Lectura inversora |
|---|---|---|
| Shell, login, rutas y permisos | Implementado. | Base multiusuario existente. |
| CRM, leads, pipeline, llamadas y reuniones | Implementado con endpoints propios. | Núcleo de sistema de registro disponible. |
| Campañas, Ads, funnels y landings | Implementado o parcial según módulo. | Diferenciación de captación, dependiente de proveedores. |
| Voz y agentes | Implementado con dependencias; Twilio/voz figura parcial en readiness. | Demostrable, aún no validado para escala de pago. |
| Email y secuencias | Implementado con Mautic y barreras de consentimiento. | Requiere instancia, migraciones, dominio y webhooks reales. |
| Organic/social | Implementado con Google/Metricool según módulo. | Activación condicionada por OAuth y cuentas publicables. |
| Orquestador y centro de acción | Persistencia, guardrails, worker/outbox y aprobaciones implementados. | Diferenciador arquitectónico si se simplifica la experiencia. |
| Inteligencia y gobierno | Siguiente acción, experimentos, memoria y políticas implementados. | Base para control enterprise; falta uso real. |
| Producción | Gate y arnés E2E preparados, no ejecutados en el entorno revisado. | Riesgo operativo prioritario. |

### Lo que se puede afirmar

- Existe una plataforma full-stack con dominio CRM, captación, conversación, automatización, crecimiento y gobierno.
- Existen integraciones y contratos de proveedor implementados en backend.
- La arquitectura incorpora autenticación, permisos, multi-tenancy, workers, outbox, consentimiento y observabilidad.
- El pricing y la web pública ya expresan una oferta por cuenta con voz incluida.

### Lo que todavía no se puede afirmar

- Que el producto está listo para clientes de pago.
- Que las integraciones externas funcionan de extremo a extremo en producción.
- Que la voz alcanza una calidad, latencia o margen concretos en cada dialecto.
- Que existen clientes, MRR, ARR, retención o mejora de conversión verificables.
- Que el foso de datos ya existe; hoy es una estrategia de acumulación.
- Que el sistema cumple automáticamente toda normativa en cada mercado.

### Deuda crítica antes de cobrar

La auditoría externa de 1 de agosto de 2026 identifica fallos críticos y altos de aislamiento, cumplimiento, integridad e idempotencia. Parte del scope en Leads parece haberse endurecido después, pero el patrón sigue presente en otras rutas revisadas y la persistencia de bajas de Mautic continúa tragando errores. La compañía debe usar esa auditoría como backlog de salida y demostrar su cierre con regresiones automáticas y staging.

Esto no invalida la tesis; define con precisión qué financia el primer tramo de la ronda.

## 5. Primer mercado: dos motions, no siete verticales

### Motion A - servicios con cita

**Ejemplos:** clínicas, veterinarias, centros estéticos, peluquerías, educación privada y servicios locales.

**Trabajo que se contrata:** atender entradas, recuperar llamadas perdidas, calificar motivo, ofrecer huecos, agendar, recordar y recuperar no-shows.

**Valor medible:** ocupación de agenda, tiempo de respuesta, citas agendadas, citas atendidas y horas administrativas evitadas.

**Ventaja:** volumen de conversaciones suficiente para aprender rápido.

**Riesgo:** ARPA menor, integraciones de agenda fragmentadas y sensibilidad de datos en salud.

### Motion B - ventas de ticket alto

**Ejemplos:** concesionarios, inmobiliarias, energía, educación de alto valor y servicios B2B.

**Trabajo que se contrata:** responder rápido, calificar presupuesto/intención, agendar visita o demo, hacer seguimiento y entregar contexto al comercial.

**Valor medible:** oportunidades aceptadas, test drives/visitas, pipeline influido y ventas atribuidas.

**Ventaja:** alto valor por oportunidad y mayor disposición de pago.

**Riesgo:** ciclos de venta más largos, menor volumen de datos y necesidad de integrarse con DMS/portales/CRM existentes.

### Criterio para elegir el wedge definitivo

No debe decidirse por preferencia interna. Debe elegirse el motion que alcance antes:

- activación en menos de 14 días;
- cinco cuentas operativas;
- retención superior al 85% a 90 días;
- valor económico observado superior a tres veces el precio;
- margen bruto superior al 70%;
- una referencia publicable.

## 6. Por qué ahora

### Adopción de IA

Eurostat informó que el 20% de las empresas de la UE con diez o más empleados utilizó IA en 2025, 6,5 puntos más que en 2024. La señal no prueba demanda específica para Vendrava, pero sí reduce el coste educativo de vender IA empresarial ([Eurostat](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251211-2)).

### Mercado pyme amplio y fragmentado

La UE tenía 33,2 millones de micro y pequeñas empresas en 2024, el 99% de las compañías de la economía empresarial. Servicios concentraba 21,2 millones de empresas. Es un universo grande, disperso y sensible a tiempo de implantación y coste total ([Eurostat](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251209-2)).

### Validación competitiva

- Salesforce lanzó Agentforce Contact Center para unificar voz, canales digitales, CRM y agentes, confirmando que voz + contexto + acción se está convirtiendo en plataforma ([Salesforce](https://www.salesforce.com/news/stories/agentforce-contact-center-announcement/the-worlds-first-end-to-end-agentic-contact-center-is-here_-delivering-the-first-agentic-solution-unifying-ai-voice-and-crm-3/)).
- HubSpot posiciona su Prospecting Agent como un compañero comercial que monitoriza señales, encuentra contactos y ejecuta outreach dentro del CRM ([HubSpot](https://www.hubspot.com/products/sales/ai-prospecting-agent)).
- HighLevel ya empaqueta CRM y Voice AI para agencias y pymes, validando la demanda por suites y el canal indirecto ([HighLevel](https://help.gohighlevel.com/support/solutions/articles/155000006652)).
- Vapi, Retell y ElevenLabs reducen el coste de construir agentes de voz. Eso comoditiza la capa básica, pero permite a Vendrava concentrarse en workflow, datos y distribución ([Vapi](https://vapi.mintlify.app/pricing), [Retell AI](https://docs.retellai.com/deploy/purchase-number), [ElevenLabs](https://help.elevenlabs.io/hc/en-us/articles/29298065878929-How-much-does-ElevenAgents-cost)).

### Regulación como barrera de calidad

Las reglas de transparencia del artículo 50 del Reglamento de IA se aplican desde el 2 de agosto de 2026 y exigen que las personas puedan reconocer cuándo interactúan con un sistema de IA. Para Vendrava, aviso, trazabilidad, consentimiento y handoff deben ser producto visible, no una nota al pie ([Comisión Europea](https://digital-strategy.ec.europa.eu/en/factpages/quick-facts-transparency-rules-ai-systems)).

## 7. Mercado: dimensionamiento de abajo arriba

No existe una categoría estadística “revenue conversational OS”. Por eso el modelo debe partir de cuentas objetivo y ARPA, no sumar mercados adyacentes de CRM, contact center y conversational AI.

### 7.1 Base observable en España

El DIRCE registra 3.310.824 empresas activas a 1 de enero de 2025. Aplicando un filtro de al menos tres empleados a los sectores iniciales, el universo observable es:

| Sector | Empresas con 3 o más empleados |
|---|---:|
| Comercio | 132.732 |
| Hostelería | 96.775 |
| Actividades inmobiliarias | 11.973 |
| Actividades profesionales, científicas y técnicas | 46.900 |
| Actividades administrativas y servicios auxiliares | 29.642 |
| Educación, sanidad y servicios sociales | 49.185 |
| Actividades artísticas, recreativas y entretenimiento | 21.054 |
| Otros servicios | 28.826 |
| **Total observable** | **417.087** |

Fuente: cálculo propio a partir de [INE, DIRCE 2025](https://ine.es/dyngs/Prensa/DIRCE2025.pdf), sumando los tramos de 3-5, 6-9, 10-19 y 20 o más empleados. No todas estas empresas tienen volumen de leads, encaje o disposición de pago.

### 7.2 Modelo TAM/SAM/SOM de trabajo

| Capa | Supuesto | Resultado orientativo |
|---|---|---:|
| Universo observable España | 417.087 cuentas seleccionadas por sector/tamaño | No es TAM vendible. |
| Techo a precio de Crecimiento | 417.087 x 299 euros/mes x 12 | 1.497 millones de euros/año. |
| SAM de hipótesis | 15% con suficiente volumen, valor por lead y madurez de compra | 62.563 cuentas. |
| SAM a precio de Crecimiento | 62.563 x 299 euros/mes x 12 | 224 millones de euros/año. |
| SOM a 36 meses | 1.000 cuentas con ARPA medio de 450 euros/mes | 5,4 millones de euros de ARR. |

**Advertencias:** el filtro del 15% es una hipótesis interna; no debe presentarse como estudio de mercado. El SOM de 1.000 cuentas exige distribución escalable y equivale al 1,6% del SAM hipotético. Los pilotos deben medir el porcentaje real de empresas con dolor, presupuesto y activación viable.

### 7.3 Expansión

La expansión lógica es:

1. España, con venta asistida y soporte cercano.
2. Portugal y mercados europeos seleccionados, después de validar idioma, telefonía y normativa.
3. México y otros mercados LATAM con densidad de pymes, adaptando dialecto, costes, numeración y cumplimiento.
4. Canal white-label para agencias y operadores con múltiples cuentas.

La UE cuenta con 33,2 millones de micro y pequeñas empresas; esa cifra valida amplitud, no una penetración realista.

## 8. Modelo de negocio

Vendrava publica un modelo por cuenta, sin coste por asiento, con una bolsa de voz y excedente por minuto. Es adecuado porque el comprador entiende un coste operativo total y la compañía conserva una palanca de expansión por uso.

### 8.1 Oferta pública actual

| Plan | Precio orientativo | Uso principal | Voz incluida aproximada |
|---|---:|---|---:|
| Arranque | Desde 99 euros/mes | CRM, pipeline, WhatsApp/email, agenda y demo | 500 min/mes |
| Crecimiento | Desde 299 euros/mes | Voz entrante/saliente, Guru, automatizaciones e integraciones | 2.000 min/mes |
| Multi-sucursal | Desde 599 euros/mes | Multi-sede, Growth Hub, campañas y analítica avanzada | 6.000 min/mes |
| Enterprise | A medida | Alto volumen, SLA, white-label, seguridad e integraciones | Según contrato |

Fuente interna: [pricing público](../../vendrava-public/content/locales/es/pricing.ts).

### 8.2 Ingresos por fase

| Fase | Ingreso | Motivo |
|---|---|---|
| Validación | Implantación opcional + SaaS mensual de design partner | Evitar pilotos eternamente gratuitos y medir disposición de pago. |
| Repetición | Plan Crecimiento/Multi-sucursal + excedente de uso | Combinar recurrencia y expansión por volumen. |
| Canal | Cuenta matriz de agencia + subcuentas + white-label | Reducir CAC y aprovechar distribución existente. |
| Enterprise | Contrato anual, SLA, seguridad e integración | Monetizar complejidad y soporte dedicados. |
| Futuro | Add-ons verticales, analítica avanzada y API | Capturar valor sin convertir el producto en servicios a medida. |

### 8.3 Principios de pricing

- Cobrar por cuenta y valor operativo, no solo por minuto.
- Mostrar el coste de voz y los límites con claridad.
- No incluir minutos por debajo del coste real para aparentar un precio bajo.
- Cobrar implantación cuando exista trabajo de integración o playbook específico.
- Descontar por contrato anual después de demostrar valor, no para compensar falta de producto.
- Mantener un plan de entrada, pero hacer que el flujo completo viva en Crecimiento.

### 8.4 Unit economics objetivo

```text
Margen bruto =
  (suscripción + excedentes + add-ons
   - telefonía - STT/TTS/LLM - infraestructura variable - soporte variable)
  / ingresos
```

| Métrica | Objetivo antes de escalar |
|---|---:|
| Margen bruto | > 70% |
| COGS de voz e IA | < 20% de ingresos de la cuenta |
| CAC payback | < 9 meses; < 12 meses en Enterprise |
| Retención de logo a 90 días | > 85% |
| Net revenue retention anual | > 110% cuando exista cohorte suficiente |
| Tiempo de activación | < 14 días en oferta estándar |
| Servicios/implantación | < 20% del ingreso anual tras la fase inicial |

## 9. Go-to-market

### 9.1 Mensaje de entrada

No vender “IA”. Vender un resultado operativo verificable:

- “Cada lead recibe respuesta y siguiente acción.”
- “Recupera llamadas y formularios que hoy se enfrían.”
- “Califica y agenda sin dejar al equipo sin control.”
- “Todo queda conectado al pipeline.”

### 9.2 Fase 0 - design partners (0-3 meses)

**Objetivo:** cinco cuentas operativas en dos motions.

- Seleccionar clientes con volumen suficiente y acceso al resultado final.
- Firmar un acuerdo de piloto con precio, alcance, métricas, consentimiento y permiso de caso de éxito.
- Implantar un único flujo por cuenta.
- Revisar semanalmente conversaciones fallidas y motivos de no agenda.
- No construir una integración sectorial sin al menos dos clientes que la necesiten.

### 9.3 Fase 1 - repetición inicial (3-9 meses)

**Objetivo:** 25-75 clientes de pago y una referencia por motion.

- Founder-led outbound sobre sectores y geografías concretos.
- Auditoría/prospecto como gancho para B2B cuando esté validado.
- Oferta empaquetada con onboarding, playbook, número, agenda y dashboard.
- Casos de éxito con antes/después: tiempo de respuesta, contacto, citas y coste.
- Canal SprintMarkt/agencias con comisión o wholesale simple.

### 9.4 Fase 2 - canal y expansión vertical (9-18 meses)

**Objetivo:** distribución que no dependa solo del fundador.

- Programa de partners con certificación y límites de soporte.
- Multi-sede y white-label para agencias/cadenas.
- Biblioteca versionada de playbooks por vertical.
- Integraciones estándar con calendarios, CRM y fuentes de lead más demandadas.
- Customer success basado en resultados, no en tickets.

### 9.5 Fase 3 - Europa/LATAM (18-36 meses)

- Elegir mercados por coste de adquisición, disponibilidad de telefonía, idioma y regulación.
- Validar dialecto y calidad con escucha humana.
- Desplegar perfiles de cumplimiento por geografía.
- Utilizar partners locales antes de abrir equipos propios.

## 10. Competencia y posicionamiento

La competencia no está fragmentada por falta de actores; está convergiendo. La respuesta no puede ser “nadie integra todo”.

| Categoría | Ejemplos | Fortaleza | Limitación/oportunidad para Vendrava |
|---|---|---|---|
| CRM con agentes | Salesforce Agentforce, HubSpot Breeze | Datos, distribución, ecosistema y confianza. | Complejidad/coste para pyme; foco global antes que profundidad operativa local. |
| Suite para agencias/pymes | HighLevel | Amplia cobertura, white-label y canal consolidado. | Competidor directo; Vendrava debe ganar por voz/revenue intelligence, experiencia y verticalización hispana. |
| Infraestructura de voz | Vapi, Retell AI, ElevenLabs | Velocidad de construcción, calidad y flexibilidad. | No resuelven por sí solas captación, pipeline, gobierno, atribución y GTM vertical. |
| Telefonía/contact center | Twilio, Aircall, Dialpad, Genesys | Infraestructura madura, routing y operación. | Vendrava puede ser la aplicación de revenue sobre esa capa, pero debe evitar dependencia excesiva. |
| Automatización/outbound | Apollo, Instantly, Make, Zapier | Distribución, secuencias e integraciones. | Fragmentan contexto y no son un sistema completo de conversación + resultado. |
| Agencia/servicio humano | Agencias, call centers, SDR externalizado | Implantación, criterio y relación. | Coste marginal y escalabilidad; también son canal y sustituto. |

### Posición defendible

Vendrava debe ocupar el cuadrante:

> **Más operativo que un CRM, más completo que una plataforma de voz y más escalable que una agencia.**

### Batallas que no conviene librar

- No competir por el CRM más configurable del mercado.
- No competir por la voz más barata sin controlar calidad y margen.
- No vender a gran enterprise antes de cerrar fiabilidad y seguridad.
- No construir un marketplace de integraciones antes de conocer las cinco críticas.
- No adoptar cada función que lance un incumbent; mantener el foco en flujo y resultado.

## 11. Foso defensivo

| Moat | Cómo se construye | Estado actual | Prueba exigida |
|---|---|---|---|
| Datos conversación -> resultado | Unir transcripción, intención, objeción, acción, cita y venta/no-show. | Arquitectura y campos parciales; corpus no demostrado. | Volumen etiquetado y cobertura del resultado final. |
| Playbooks verticales | Convertir patrones ganadores en guiones, criterios y acciones versionadas. | Playbooks y memoria operativa implementados. | Mejora experimental por variante. |
| Workflow embebido | Conectar fuentes, canales, agenda, pipeline y reporting. | Amplia superficie; integraciones por validar. | Activación rápida y bajo churn por reemplazo. |
| Confianza/compliance | Aviso de IA, consentimiento, opt-out, horarios, permisos y auditoría. | Controles existentes con hallazgos críticos pendientes. | Auditoría cerrada y evidencia por llamada. |
| Distribución | Canal SprintMarkt, agencias, consultoras y partners verticales. | Hipótesis razonable; no hay métricas de canal. | CAC, conversión y retención por partner. |
| Coste/calidad de voz | Routing de proveedores y posible stack propio. | Laboratorio y opciones técnicas; no producción. | Coste/minuto, latencia, calidad y fallback medidos. |

### Flywheel propuesto

```text
Más clientes verticales
        ↓
Más conversaciones con resultado real
        ↓
Mejores patrones de calificación y siguiente acción
        ↓
Playbooks que activan y convierten mejor
        ↓
Más valor, retención y referencias
        ↓
Más clientes verticales
```

El flywheel solo existe si Vendrava captura el resultado posterior a la llamada. Una transcripción sin cita atendida, no-show o venta es contexto, no moat.

## 12. Arquitectura y escalabilidad

### Stack actual

```text
React 19 + Vite
  -> experiencia CRM, captación, voz, growth, inteligencia y gobierno

Fastify + TypeScript
  -> API, autenticación, RBAC, lógica de negocio, webhooks y tiempo real

Prisma + PostgreSQL
  -> dominio multi-tenant, consentimientos, actividad, experimentos y auditoría

Redis + BullMQ + outbox/workers
  -> campañas, secuencias, importaciones, reintentos y acciones externas

Proveedores
  -> Twilio, STT/TTS/LLM, Meta, Google, Mautic, Metricool y otros
```

### Fortalezas técnicas

- Dominio amplio y separado por módulos.
- Modelo multi-tenant y permisos en servidor.
- Trabajo asíncrono con leases, outbox, retry y dead-letter en varias áreas.
- Consentimiento, auditoría y gobierno modelados como entidades, no solo copy.
- Laboratorio de voz y arquitectura multi-proveedor.
- Sitio público bilingüe y oferta comercial estructurada.

### Riesgos técnicos

- Superficie demasiado grande para el equipo y la etapa.
- Integraciones externas con idempotencia o activación incompletas.
- Hallazgos de aislamiento y cumplimiento que bloquean usuarios de pago.
- Migraciones y E2E de staging pendientes.
- Bundle frontend grande y estados demo/live aún inconsistentes.
- Calidad, latencia y COGS de voz no verificados en producción.

## 13. Roadmap de producto y empresa

| Periodo | Producto/operación | Mercado | Gate de salida |
|---|---|---|---|
| 0-30 días | Cerrar P0, migraciones reproducibles, configuración de staging y pruebas de aislamiento/compliance. | Seleccionar 5-10 design partners candidatos. | Gate técnico PASS y demo E2E repetible. |
| 31-90 días | Validar Meta/webhook/calendario/voz en entorno real de bajo riesgo; instrumentar COGS y resultados. | Activar cinco cuentas en dos motions. | Cero pérdidas silenciosas; primer valor medido. |
| 3-6 meses | Onboarding vertical, plantillas, QA de dialecto y panel de resultado. | Convertir pilotos en pago y publicar un caso por motion. | Retención 90d >85%; margen bruto positivo. |
| 6-12 meses | Integraciones prioritarias, multi-sede, partner console y experimentos de playbook. | 25-75 cuentas de pago; canal inicial. | CAC payback y activación dentro de objetivo. |
| 12-18 meses | Bucle de aprendizaje por vertical, routing de proveedor y compliance geográfico. | Escalar vertical ganador y probar segundo mercado. | Mejora experimental y 100+ cuentas en escenario base. |
| 18-36 meses | Plataforma de partners, API/add-ons y expansión internacional. | 1.000 cuentas en escenario base. | 5,4 millones de euros de ARR de salida en escenario base. |

### Prioridad que no debe romperse

```text
Seguridad y fiabilidad -> piloto real -> retención/margen -> repetición -> expansión
```

## 14. Métricas y gates

### North Star

**Resultados comerciales válidos generados por Vendrava por cuenta activa.**

Un resultado válido debe definirse por vertical: cita atendida, visita/test drive realizado, oportunidad aceptada o venta atribuida. “Llamada completada” no es suficiente.

### Métricas de producto

| Etapa | Métrica |
|---|---|
| Ingesta | Leads recibidos, duplicados, pérdidas, latencia señal -> disponibilidad. |
| Contacto | Tiempo al primer intento, tasa de contacto, reintentos y exclusiones. |
| Conversación | Latencia, interrupciones, transferencias, finalización y QA. |
| Calificación | Campos obtenidos, intención, aceptación humana y falsos positivos. |
| Resultado | Citas agendadas, atendidas, no-show, oportunidad y venta. |
| Retención | Uso semanal, cuentas activas, logo retention y NRR. |
| Economía | ARPA, COGS por canal, margen, CAC, payback y soporte por cuenta. |

### Gates operativos

- 100% de acciones externas trazables con idempotencia o reconciliación.
- 100% de bajas/opt-outs persistidos o reintentados; ningún fallo silencioso.
- 100% de llamadas IA con aviso y evidencia cuando aplique.
- Menos del 1% de leads perdidos por integración.
- Contacto p95 inferior a 60 segundos en flujos instantáneos permitidos.
- Disponibilidad y latencia definidas por SLA antes de Enterprise.

### Gates de negocio

- Cinco clientes activos antes de abrir un tercer vertical.
- Retención de logos a 90 días superior al 85% antes de escalar paid acquisition.
- Margen bruto superior al 70% antes de ampliar minutos incluidos.
- Al menos un caso con mejora estadísticamente interpretable del proceso anterior.
- Una referencia disponible por vertical antes de expansión geográfica.

## 15. Hipótesis financieras

Las cifras siguientes son un **modelo de trabajo**, no resultados ni forecast aprobado. Excluyen IVA, financiación, deuda y posibles servicios extraordinarios.

### 15.1 Escenario base de ARR de salida

| Año | Clientes de pago al cierre | ARPA mensual medio | ARR de salida | Hito dominante |
|---|---:|---:|---:|---|
| 1 | 75 | 350 euros | 315.000 euros | Validación y primer canal. |
| 2 | 350 | 400 euros | 1,68 millones de euros | Repetición en España. |
| 3 | 1.000 | 450 euros | 5,40 millones de euros | Vertical ganador + partners. |
| 5 | 4.000 | 500 euros | 24,0 millones de euros | Expansión Europa/LATAM y Enterprise. |

ARR de salida no equivale a ingreso reconocido durante el año. El ARPA aumenta por mezcla de planes, uso y multi-sede. Estas cifras exigen churn bajo, canal eficiente y capacidad operativa; deben reemplazarse por un modelo mensual una vez exista cohorte.

### 15.2 Sensibilidad a 36 meses

| Escenario | Clientes | ARPA/mes | ARR de salida |
|---|---:|---:|---:|
| Conservador | 500 | 350 euros | 2,10 millones de euros |
| Base | 1.000 | 450 euros | 5,40 millones de euros |
| Expansión | 1.500 | 500 euros | 9,00 millones de euros |

### 15.3 Variables que más afectan al modelo

1. Retención después de 90 días.
2. COGS real de voz por minuto y por resultado.
3. Tiempo y coste de implantación.
4. Conversión design partner -> cliente de pago.
5. Productividad de partners y comisión de canal.
6. Mezcla de planes y uso por cuenta.
7. Capacidad de cobrar por valor sin convertir cada cuenta en proyecto.

### 15.4 Modelo mensual mínimo para due diligence

Antes de una ronda formal debe existir una hoja con:

- altas, bajas y expansión por cohorte;
- MRR inicial, nuevo, expansión, contracción y churn;
- minutos incluidos/consumidos y COGS por proveedor;
- nómina, infraestructura, ventas, marketing, legal y G&A;
- cash burn, runway y escenario de recorte;
- CAC por canal y payback;
- ingresos de SaaS separados de implantación/servicios.

## 16. Ronda y uso de fondos

### Ask recomendado

**600.000 euros pre-seed para 18 meses.** Es una propuesta de referencia; debe confirmarse con cap table, salarios, contratación y caja actual antes de enviarse como cifra definitiva.

| Uso | % | Importe orientativo | Resultado esperado |
|---|---:|---:|---|
| Producto, fiabilidad e integraciones | 40% | 240.000 euros | Cerrar producción, onboarding y flujos prioritarios. |
| Go-to-market y customer success | 25% | 150.000 euros | Design partners, ventas, partners y casos de éxito. |
| Voz, datos e infraestructura | 15% | 90.000 euros | Calidad, observabilidad, routing y corpus de resultados. |
| Seguridad, legal y compliance | 10% | 60.000 euros | Cierre de auditoría, RGPD, AI Act, contratos y procesos. |
| Contingencia/runway | 10% | 60.000 euros | Variación de proveedores, ventas y contratación. |

### Hitos financiados

- Gate de producción aprobado y hallazgos críticos cerrados.
- Cinco a diez design partners operativos.
- Primeras cohortes de clientes de pago.
- Retención a 90 días y margen bruto medidos.
- Un playbook mejorado por evidencia real.
- Canal de partners con primeras cuentas activas.
- Decisión basada en datos sobre el vertical y geografía de expansión.

### Qué no debería financiar esta ronda

- Una expansión simultánea a muchos países.
- Un rediseño completo sin impacto en activación.
- Integraciones únicas para prospectos que no pagan.
- Un equipo enterprise antes de validar retención y seguridad.
- Entrenamiento de un modelo fundacional de voz propio.

## 17. Equipo y organización

La web pública identifica Vendrava como un producto de SprintMarkt con sede en Valencia. El repositorio no documenta nombres, dedicación, ownership, cap table ni experiencia del equipo fundador. Esa ausencia debe corregirse: en una pre-seed, el equipo es parte central de la decisión.

### Perfil mínimo de equipo para los siguientes 18 meses

| Función | Responsabilidad |
|---|---|
| CEO/fundador | ICP, ventas, capital, partners y foco. |
| Product/engineering lead | Arquitectura, entrega, seguridad y calidad. |
| Voice/AI engineer | Latencia, conversación, evaluación y COGS. |
| Full-stack/integrations | Canales, calendarios, webhooks y onboarding. |
| Customer success/revenue ops | Implantación, playbooks, resultados y retención. |
| GTM/partners | Canal de agencias y expansión vertical. |
| Legal/security fraccional | RGPD, AI Act, contratos, incidentes y auditoría. |

### Preguntas que el data room debe responder

- ¿Quién posee el código, la marca, el dominio y los datos?
- ¿Qué relación contractual existe entre SprintMarkt y Vendrava?
- ¿Quién trabaja a tiempo completo y con qué vesting?
- ¿Qué proveedores/modelos son críticos y qué licencias aplican?
- ¿Hay deuda, subvenciones, SAFE/convertibles o compromisos previos?
- ¿Qué experiencia tiene el equipo vendiendo SaaS B2B y operando telefonía/IA?

## 18. Riesgos y mitigaciones

| Riesgo | Descripción | Mitigación | Gate |
|---|---|---|---|
| Producto demasiado amplio | La plataforma intenta resolver captación, CRM, voz, marketing y growth a la vez. | Un flujo y dos motions; congelar módulos sin relación con activación. | Tiempo de activación <14 días. |
| Sin tracción verificable | No hay clientes/ARR/cohortes en la documentación. | Pilotos de pago con métricas y derecho de referencia. | Cinco cuentas + retención 90d. |
| Seguridad/aislamiento | Auditoría externa identifica hallazgos críticos y altos. | Backlog P0/P1, regresiones, staging aislado y revisión externa de cierre. | Cero P0 abiertos antes de cobrar. |
| Cumplimiento | Voz y mensajería implican aviso, consentimiento, opt-out y reglas locales. | Compliance por geografía, revisión legal, trazabilidad y handoff. | 100% de evidencia requerida. |
| Calidad de voz | Acento, latencia o comportamiento reducen confianza. | QA por dialecto, evaluación humana, fallback y límites de caso de uso. | Score de calidad y tasa de finalización. |
| Margen | Telefonía, STT/TTS/LLM y soporte erosionan el plan. | Medición por cuenta, overage, routing y guardarraíles de gasto. | Margen >70%. |
| Incumbentes | CRM y suites incorporan agentes y voz. | Verticalización, velocidad, canal local y workflow completo. | Win/loss documentado. |
| Comoditización de voz | Infraestructura cada vez más barata y accesible. | No vender voz aislada; capturar resultado, memoria e integración. | Retención y expansión por workflow. |
| Dependencia de proveedores | Twilio/Meta/Google/modelos cambian precio o política. | Abstracción, reconciliación, límites y proveedores alternativos. | Simulación de caída/fallback. |
| Servicios a medida | Cada cliente exige integración única. | Catálogo estándar, implantación cobrada y criterios de rechazo. | Servicios <20% del ingreso. |
| Reputación | Llamadas no deseadas o demasiado autónomas dañan la marca. | Consentimiento, listas de exclusión, horarios, disclosure y control humano. | Quejas/opt-out dentro de umbral. |

## 19. Due diligence: estado y carpeta necesaria

### Producto y técnica

- Arquitectura, inventario funcional y mapa de dependencias.
- Informe de cierre de P0/P1 con tests asociados.
- Resultado del gate de producción y E2E de staging.
- Diagrama de datos, subencargados y retención.
- Métricas de uptime, latencia, errores y COGS.
- Política de desarrollo seguro, incidentes y backups.

### Comercial

- Contratos de pilotos/clientes y MRR verificable.
- Pipeline con etapa, probabilidad y responsable.
- Cohortes de activación, uso y retención.
- Win/loss y entrevistas de cliente.
- Pricing realizado frente al publicado.
- Casos de éxito con metodología y permiso.

### Corporativo

- Cap table, estatutos, pacto y propiedad intelectual.
- Contratos del equipo y vesting.
- Relación Vendrava/SprintMarkt.
- Deuda, subvenciones, convertibles y litigios.
- Registro de marca y dominios.

### Legal/compliance

- Roles RGPD responsable/encargado y DPA.
- Registro de tratamientos, bases legales y conservación.
- Lista de subencargados y transferencias internacionales.
- Procedimiento de derechos, brechas y supresión.
- Evaluación del AI Act y guiones de transparencia.
- Política de grabación y consentimiento por geografía.

## 20. Guion breve de pitch

**Pregunta inicial:** ¿por qué un CRM puede decirte que acaba de entrar un lead, pero no hacerse responsable de que ese lead reciba la acción correcta?

**Problema:** marketing, voz, mensajería y ventas operan en sistemas distintos; la oportunidad se enfría entre ellos.

**Definición:** Vendrava es el sistema operativo de revenue conversacional que capta la señal, decide, conversa y mueve el pipeline con control humano.

**Entrada:** clínicas y servicios con agenda; concesionarios, inmobiliarias y ventas de ticket alto en España.

**Modelo:** SaaS por cuenta con minutos incluidos, expansión por uso, multi-sede y Enterprise.

**Foso:** conversación conectada a resultado, playbooks por vertical, workflow embebido y confianza.

**Estado:** prototipo funcional avanzado; la ronda convierte producto en producción, clientes y cohortes medibles.

**Ambición:** ser la capa que conecta la primera señal comercial con ingresos en el mercado hispanohablante.

## 21. Próximos pasos recomendados

| Prioridad | Acción | Resultado esperado |
|---:|---|---|
| 1 | Cerrar y probar todos los P0/P1 que bloquean pago. | Base segura para pilotos. |
| 2 | Aprobar narrativa, round size, cap table y presupuesto mensual. | Ask consistente. |
| 3 | Elegir dos motions y reclutar 5-10 design partners candidatos. | Evidencia de ICP. |
| 4 | Construir una demo repetible de un flujo, con estados demo claros. | Reuniones inversoras creíbles. |
| 5 | Instrumentar resultado final y COGS antes de escalar llamadas. | Unit economics y moat medibles. |
| 6 | Convertir pilotos a pago y publicar un caso por motion. | Prueba comercial. |
| 7 | Preparar data room corporativo, técnico, comercial y legal. | Due diligence sin improvisación. |
| 8 | Abrir ronda después de los primeros gates, no antes de definirlos. | Mejor señal y uso disciplinado del capital. |

## 22. Fuentes y metodología

### Evidencia interna revisada

- [Auditoría y documentación integral de la plataforma](../plataforma/00-indice-auditoria-plataforma.md)
- [Inventario funcional de páginas](../PLATAFORMA_ACTUAL_PAGINAS_Y_FUNCIONALIDADES.md)
- [Matriz de preparación para producción](../PRODUCTION_READINESS_MATRIX.md)
- [Evaluación técnica del software](../EVALUACION_TECNICA_SOFTWARE.md)
- [Auditoría externa del repositorio](../../AUDITORIA_EXTERNA_2026-08-01.md)
- [Roadmap público de producto](../../vendrava-public/docs/vendrava-roadmap-producto.md)
- [Pricing público en español](../../vendrava-public/content/locales/es/pricing.ts)
- [Contenido público principal](../../vendrava-public/content/locales/es/home.ts)

### Fuentes externas

- [INE - Directorio Central de Empresas, 1 de enero de 2025](https://ine.es/dyngs/Prensa/DIRCE2025.pdf)
- [Eurostat - 20% of EU enterprises use AI technologies, 2025](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251211-2)
- [Eurostat - 33.2 million micro and small enterprises in the EU business economy, 2024](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251209-2)
- [Comisión Europea - reglas de transparencia del artículo 50 del AI Act](https://digital-strategy.ec.europa.eu/en/factpages/quick-facts-transparency-rules-ai-systems)
- [Salesforce - Agentforce Contact Center](https://www.salesforce.com/news/stories/agentforce-contact-center-announcement/the-worlds-first-end-to-end-agentic-contact-center-is-here_-delivering-the-first-agentic-solution-unifying-ai-voice-and-crm-3/)
- [HubSpot - Breeze Prospecting Agent](https://www.hubspot.com/products/sales/ai-prospecting-agent)
- [HighLevel - AI product and Voice AI pricing](https://help.gohighlevel.com/support/solutions/articles/155000006652)
- [Vapi - pricing overview](https://vapi.mintlify.app/pricing)
- [Retell AI - phone deployment documentation](https://docs.retellai.com/deploy/purchase-number)
- [ElevenLabs - ElevenAgents pricing](https://help.elevenlabs.io/hc/en-us/articles/29298065878929-How-much-does-ElevenAgents-cost)

### Nota sobre las cifras

Los recuentos de empresas proceden de fuentes oficiales. El filtro del 15%, el ARPA, los clientes futuros, el ARR, los objetivos de margen y la ronda son hipótesis de planificación elaboradas para este brief. Deben validarse con investigación de clientes, cohortes, costes reales, cap table y presupuesto antes de presentarse como plan aprobado.
