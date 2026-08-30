# Vendrava

## Foso competitivo sin patentes

| Control del documento | Detalle |
|---|---|
| Clasificación | Confidencial - uso interno y conversaciones con inversores |
| Versión | v1.0 |
| Fecha | 8 de agosto de 2026 |
| Alcance | Qué defiende realmente a Vendrava si no hay patente, qué no defiende nada y cómo se demuestra |
| Relación | Desarrolla la sección 11 del [Business Plan](./Vendrava_Business_Plan_Investor_Brief_v1.md); no la sustituye |

> **Premisa:** el software de este tipo no es patentable de forma útil. Una patente sobre "llamar con IA y actualizar el CRM" sería cara, lenta, estrecha de reivindicaciones y trivial de rodear. El foso tiene que venir de posición, datos, margen y coste de cambio, no de propiedad industrial.

> **Cómo debe leerse este documento:** Vendrava **tiene hoy la arquitectura necesaria para construir el foso, no el foso construido**. El corpus etiquetado con resultado está en cero, el coste/minuto de producción no está demostrado y la auditoría de seguridad tiene críticos abiertos. Los próximos 90 días (sección 6) están diseñados para convertir cada uno de esos cuatro planos en una cifra verificable. Afirmar más que eso hoy sería insostenible en una due diligence.

## 1. Lo que NO es foso

Conviene decirlo antes que nada porque es donde se gasta el presupuesto por error.

| Activo | Por qué no defiende |
|---|---|
| Superficie funcional (CRM + campañas + agenda + Ads + landings...) | Cualquier competidor con financiación replica una pantalla en semanas. Más módulos ≠ más foso; a menudo es más superficie que mantener. |
| El stack de voz en sí | Silero VAD, Smart Turn, faster-whisper, vLLM, Qwen3-TTS y Chatterbox son públicos. Cualquiera puede montar el mismo pipeline. |
| Latencia ~700 ms | Es una tabla de acceso al mercado, no una ventaja. En 12-18 meses será el estándar y lo darán las APIs de terceros. |
| "IA en español" | Los modelos base ya hablan español. La localización de idioma no es defensa; la del *proceso comercial* sí puede serlo. |
| Precio | El precio más bajo lo iguala quien tenga más caja. |
| Ser primeros | No lo somos. La categoría ya está validada por Salesforce, HubSpot, HighLevel, Vapi y Retell. |

**Regla:** si un competidor con 5 M€ lo copia en un trimestre, no es foso. Es requisito.

## 2. Los cuatro fosos reales, por orden de valor

### 2.1 Grafo de resultado conversación → dinero  *(el único con retornos crecientes)*

Vapi y Retell ven la llamada pero no el pipeline. HubSpot y Salesforce ven el pipeline pero no el audio. Vendrava está a ambos lados de la misma cuenta, y eso permite cerrar un bucle que ninguno de los dos puede cerrar solo:

```text
audio y transcripción → intención y objeción → acción tomada
   → cita agendada → cita atendida / no-show → venta / pérdida
        └────────── vuelve al playbook como evidencia ──────────┘
```

El activo no es la transcripción: es la **etiqueta de resultado final** pegada a la conversación que la produjo. Eso no se compra, no se scrapea y no se transfiere con el cliente: se acumula con el tiempo de operación.

- **Estado:** arquitectura y campos existen; corpus etiquetado ≈ 0.
- **Se erosiona si:** el resultado posterior a la llamada no se captura. Una transcripción sin desenlace es coste de almacenamiento, no foso.
- **Prueba exigida:** % de llamadas con desenlace final registrado, y una mejora de conversión medida por experimento A/B entre dos versiones de playbook.

### 2.2 Margen por stack propio  *(foso de economía, no de producto)*

El motor autoalojado no es diferenciación de cara al cliente; es diferencia de **coste marginal por minuto**. Quien revende Vapi/ElevenLabs no puede incluir minutos generosos en un plan de 99-299 €/mes sin comerse el margen bruto. Vendrava sí puede, si el coste real está medido.

- **Estado:** stack propio funcionando en laboratorio y camino por defecto en código; sin coste/minuto de producción verificado.
- **Se erosiona si:** el precio de las APIs cae más rápido que nuestro coste de operación e ingeniería. Es un foso con caducidad — vale mientras el delta de coste pague el equipo que lo mantiene.
- **Prueba exigida:** €/minuto totalmente cargado (GPU + fallback + guardia) frente al precio de lista del proveedor equivalente, sostenido tres meses.

### 2.3 Cumplimiento ejecutable en el camino crítico  *(ventana temporal, 12-24 meses)*

Desde el 2 de agosto de 2026 el artículo 50 del Reglamento de IA obliga a transparencia. La ventaja no es "cumplimos": la ventaja es que en Vendrava el control vive **dentro del bucle de audio**, no en un PDF de política.

En el código esto ya existe como `turn.proposed → turn.directive`: antes de que el sidecar arranque LLM o TTS, Node resuelve opt-out, transferencia a humano, verificación de evidencia y la decisión de negocio, con timeout acotado y acción de fallo explícita (`clarify` / `transfer` / `stop`).

Retrofitear una puerta de política síncrona en un pipeline ya optimizado a 700 ms es caro y lento para un competidor: obliga a rediseñar la ruta de latencia. Ese es el foso, no el aviso legal.

- **Estado:** implementado con auditoría de seguridad con hallazgos críticos aún abiertos.
- **Se erosiona si:** los incumbents lo empaquetan (lo harán) o la regulación se relaja. Aprovechable ahora, no defendible a cinco años.
- **Prueba exigida:** expediente por llamada (consentimiento, aviso de IA, opt-out, horario, quién decidió qué) exportable para una inspección, y auditoría cerrada.

### 2.4 Coste de cambio operativo  *(aburrido, barato y el que más paga en pyme)*

Cuando Vendrava tiene la agenda conectada, el pipeline, el histórico de llamadas y las automatizaciones de la clínica o el concesionario, cambiar de herramienta cuesta semanas de operación parada. Este es el foso que sostiene la retención mientras 2.1 madura.

- **Palancas concretas:** agenda y calendarios, número de teléfono e histórico, integración con el sistema vertical del cliente, usuarios formados, informes que ya usa la dirección.
- **Prueba exigida:** retención de logos ≥ 85% a 90 días y tiempo de activación por debajo de dos semanas.

## 3. Lo que está a medio camino

| Candidato | Veredicto |
|---|---|
| Playbooks verticales | Solo es foso si nace de 2.1. Escrito a mano, es contenido copiable con un buen prompt. |
| Distribución (SprintMarkt, agencias) | Es ventaja de salida, no foso — hasta que sea contractual, con exclusividad por vertical o territorio y economía de partner medida. |
| Voz de actor y voice packs versionados | Diferenciación de marca, imitable en meses. Se vuelve relevante combinada con 2.2 (coste) y con derechos de imagen/voz contractualizados. |
| Corpus de audio en español telefónico | Foso solo si está etiquetado con resultado y con base legal limpia para usarlo. Sin consentimiento explotable, es pasivo, no activo. |

## 4. La tesis defendible

Ningún foso individual aguanta un ataque frontal. La combinación sí, porque exige que el atacante gane a la vez en cuatro planos distintos:

> Vendrava está **a ambos lados de la llamada y del pipeline** (posición que ni los vendors de voz ni los CRM tienen), **con coste marginal propio** (margen que los revendedores no pueden igualar), **con el control regulatorio dentro del bucle de audio** (ingeniería que no se retrofitea barato) y **en posición de acumular resultado real por vertical** (dato que no se compra).

Quien quiera desplazarnos en clínicas o concesionarios españoles tiene que construir las cuatro.

**Distinción que sostiene la tesis:** hoy tenemos la **arquitectura** de los cuatro planos; tres de ellos aún no tienen prueba cuantitativa. La afirmación defendible es de posición y de plan de verificación, no de foso ya operativo. La sección 6 dice cómo se demuestra y la 7 con qué cifras se falsa.

## 5. Amenazas concretas y respuesta

| Amenaza | Qué nos quita | Respuesta |
|---|---|---|
| HubSpot / Salesforce añaden agentes de voz | Distribución y cuenta enterprise | No competir en configurabilidad. Profundidad operativa por vertical y precio pyme. |
| Vapi / Retell / ElevenLabs bajan el precio | El foso 2.2 (margen) | Mantener routing multi-proveedor: si su precio baja bajo nuestro coste, los usamos y conservamos 2.1 y 2.4. |
| HighLevel y su canal de agencias | Nuestro canal | Multi-sede, white-label y economía de partner mejor que la suya en el vertical elegido. |
| Un competidor español clona el producto | Superficie funcional | Es exactamente lo que 2.1 y 2.4 defienden y lo que la superficie no defiende. Cerrar verticales, no pantallas. |
| Los modelos base absorben la capa de aplicación | Todo, si el producto es solo un wrapper | Ser el sistema de registro y de ejecución, no el envoltorio del modelo. |

## 6. Cómo se convierte esto en foso en 90 días

Ordenado por relación valor/esfuerzo. Nada de esto requiere producto nuevo.

1. **Instrumentar el desenlace.** Cada llamada debe terminar con cita atendida, no-show, venta o pérdida, registrada y consultable. Sin esto, el foso 2.1 no empieza a acumularse — y es lo único que crece con el tiempo.
2. **Medir el coste/minuto real** del stack propio con carga real, incluido el fallback. Convierte 2.2 de afirmación a línea de un P&L.
3. **Cerrar los críticos de auditoría** y producir el expediente por llamada exportable. Convierte 2.3 de intención a argumento de venta.
4. **Un experimento de playbook** con dos variantes y resultado medido. Es la primera prueba de que el bucle de aprendizaje existe.
5. **Contractualizar el canal:** un partner con exclusividad vertical y economía medida. Convierte distribución en algo que un competidor no puede duplicar por decreto.

## 7. Métrica falsable del foso

Un foso que no se mide es una diapositiva. Estas cinco cifras, revisadas trimestralmente, dicen si existe:

| Indicador | Qué demuestra | Umbral inicial |
|---|---|---|
| % de conversaciones con desenlace final etiquetado | Que 2.1 acumula | > 70% |
| Delta de conversión entre playbook v(n) y v(n-1) | Que el aprendizaje se convierte en dinero | > 0 con significancia |
| €/minuto propio vs. precio de lista del proveedor equivalente | Que 2.2 es real | ≤ 50% |
| Retención de logos a 90 días | Que 2.4 sostiene | ver escala abajo |
| Tiempo de reemplazo declarado por un cliente que se plantea irse | Coste de cambio observado | > 3 semanas |

### Escala de retención

El 85% es el suelo por debajo del cual la tesis no se sostiene, **no la aspiración**. Perder un 15% de logos por trimestre sería un negocio que se rellena por captación, no por producto.

| Nivel | Retención de logos a 90 días | Lectura |
|---|---:|---|
| Mínimo de validación | **85%** | Umbral de aprendizaje con design partners; por debajo, el problema es de producto o de encaje, no de onboarding. |
| Objetivo operativo | **90-95%** | Nivel esperado una vez el flujo lead → contacto → cita → resultado está en producción. |
| Objetivo estabilizado | **> 95%, con retención neta de ingresos > 100%** | Onboarding maduro y expansión dentro de la cuenta (sedes, canales, minutos). Es el nivel al que se defiende una seed. |

Si a los 12 meses el delta de conversión por playbook sigue siendo cero, Vendrava es una buena aplicación sin foso: la estrategia debe reorientarse entonces a 2.4 y a distribución contractual, no a más módulos.

<div class="page-break"></div>

## 8. Cómo crece el foso con cada cliente

Los cuatro planos no crecen en paralelo por casualidad: se alimentan mediante dos bucles distintos que comparten la misma entrada, el cliente nuevo. Uno acumula **evidencia**; el otro acumula **margen**.

### Bucle 1 — datos y resultado

```text
   más clientes en el mismo vertical
                ↓
        más conversaciones
                ↓
  más conversaciones CON desenlace registrado
                ↓
   mejores playbooks (patrón medido, no opinión)
                ↓
            más conversión
                ↓
        más ROI demostrable para el cliente
                ↓
             más retención
                ↓
  más datos etiquetados por unidad de tiempo ──┐
                                               │
   └───────────────────────────────────────────┘
```

Este bucle tiene **retornos crecientes**: cada vuelta mejora el activo que hace ganar la siguiente. También tiene un punto único de fallo — si el desenlace no se registra, el bucle se abre en el tercer paso y todo lo demás se detiene. Por eso el hito 1 de la sección 6 es el primero de la lista.

### Bucle 2 — economía de la voz

```text
   más clientes
        ↓
   más minutos sobre la misma infraestructura
        ↓
   menor coste por minuto (GPU amortizada, mejor routing)
        ↓
   mejor margen bruto
        ↓
   más minutos incluidos por el mismo precio
        ↓
   mejor relación precio/valor frente al revendedor
        ↓
   más clientes ────────────────────────────┐
                                            │
   └────────────────────────────────────────┘
```

Este bucle es de **escala**, no de aprendizaje: se acelera con volumen y es el que permite sostener precios de 99-599 €/mes con minutos incluidos donde un competidor que revende API tiene que elegir entre margen y competitividad.

### Dónde se cruzan

| Conexión | Efecto |
|---|---|
| El bucle 2 baja el precio de entrada | Entran más clientes, que es la entrada del bucle 1 |
| El bucle 1 sube la conversión demostrada | Sube la disposición a pagar y con ella el margen del bucle 2 |
| Ambos suben la retención | Alargan la vida del cliente, que es el tiempo durante el cual ambos bucles giran |

**Cuándo se rompe cada uno:** el bucle 1 se rompe si no se captura el desenlace o si el vertical se dispersa (los patrones dejan de ser comparables). El bucle 2 se rompe si el precio de las APIs de terceros cae por debajo de nuestro coste totalmente cargado — escenario en el que conservamos el bucle 1 y usamos al proveedor barato, que es exactamente por qué el routing multi-proveedor no se elimina.

## 9. Qué no decir a un inversor

- "Tenemos un foso de datos" — hoy hay una estrategia de acumulación, no un corpus.
- "Nuestra tecnología de voz es propietaria" — el stack es abierto; lo nuestro es la integración, el coste y la puerta de política.
- "Vamos a patentarlo" — sin reivindicaciones defendibles es gasto y señal de inmadurez.
- "Somos los únicos" — la formulación defendible es: *"no hemos identificado un competidor relevante que combine actualmente los cuatro planos con esta arquitectura"*. Acota la afirmación a lo que se ha analizado y sobrevive a la pregunta "¿habéis mirado a todos?".
- "El foso ya está construido" — está la arquitectura; la prueba llega con las cifras de la sección 7.

### Base documental

[Business Plan §11](./Vendrava_Business_Plan_Investor_Brief_v1.md) · [One Pager](./Vendrava_Investor_One_Pager_v1.md) · [Ronda y valoración v2](./Vendrava_Ronda_y_Valoracion_Con_3_Pruebas_v2.md) · [Sistema de llamadas](../sistema-llamadas.md) · [Arquitectura objetivo de llamadas](../../llamadas/01-arquitectura-objetivo.md) · [Matriz de producción](../PRODUCTION_READINESS_MATRIX.md)
