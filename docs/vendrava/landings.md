# Vendrava Landings — especificación de la página y del optimizador

Instrucción de producto para la página de Landings y webs. La página no debe
ser un catálogo de enlaces con dos KPI: es el punto medio de todos los
circuitos de Vendrava — ads, orgánico, SEO y email aterrizan aquí.

> **La landing no se juzga por su conversión bruta. Se juzga por los
> compradores que produce.**

```text
tráfico (ads / orgánico / SEO / email) → landing → lead → llamada IA →
lead cualificado → oportunidad → venta
                     ↘ telemetría de landing   ↗ señal económica
```

El valor inicial no está en competir con Webflow, Framer o Unbounce. Está en
cerrar el circuito económico y explicar por qué una landing vende o no vende.

Comparte con `ads.md` la señal profunda, las reglas de presentación
(`null` ≠ `0`, cohortes maduras, cobertura de atribución) y los niveles de
autonomía N1/N2/N3 con modo sombra. Lo que se especifica una vez ahí no se
reinventa aquí.

---

## 0. Estado (lo construido y lo que queda)

**Las cuatro fases del §11 están construidas y el MVP del §4 se demuestra
entero**: landing nativa → tráfico con UTM → telemetría → formulario → lead →
llamada con resultado → venta atribuida → diagnóstico → variante justificada →
experimento server-side.

El resto del documento se conserva tal cual porque los comentarios del código
citan sus secciones (`§3.4`, `§7.2`, `§10`…): vaciarlas dejaría el código sin
su porqué. Lo que sigue es el inventario de lo que **no** está hecho.

### Bloqueado por trabajo que no es de landings

| Qué | Necesita |
|---|---|
| FAQ viva (§5.4) | `ContentOpportunity`: las preguntas reales minadas de llamadas e inbox — el Radar de `semana.md`. |
| Voz del dueño (§5.4) | `ownerVoice.service.ts`, día 3 de `semana.md`. Hoy el contexto de marca sale de `KnowledgeBase`. |
| Ángulo etiquetado del anuncio (§6) | Separar el texto del anuncio del hero: hoy comparten `adAssets.adCopy`. |

### Aplazado por decisión de producto

| Qué | Consecuencia mientras siga así |
|---|---|
| Cookie de visitante y ePrivacy (§3.2) | El A/B mide **sesiones**, no visitantes: quien vuelve mañana puede caer en la otra variante. |
| Webs externas (§8) | Siguen en `localStorage`. "Medición completa" es un producto aparte: tag JS, clave por organización, CORS y consentimiento en web ajena. |

### La lógica está; falta el flujo

| Qué | Estado real |
|---|---|
| Consentimiento de testimonio (§5.4) | La puerta bloquea correctamente, pero nadie puede *pedir* el permiso: ningún cliente ganado llega a ser elegible. |
| Superficie editable de la landing | **N3 no tiene hoy ninguna palanca real.** El formulario solo exige nombre, teléfono y consentimiento —los tres esenciales, intocables—, y el CTA, la FAQ y el orden de bloques son constantes de `PublicLandingPage`, no datos. Los guardarraíles, el modo sombra, la reversión y la auditoría funcionan y están probados; falta superficie que tocar. Cuando la haya, el único punto a modificar es `changeFromDiagnosis`. |

### Desviaciones frente a este documento

Detalle completo en §13. Por tamaño real: **una de fondo** (la métrica de
decisión del A/B decide por leads, no por cualificados — justo lo contrario de
la tesis del documento), **una funcionalidad sin empezar** (creación desde
oportunidad, §5.4), **una máquina de estados a medias** (§5.5) y seis detalles
menores.

### Configuración

`FRONTEND_URL` en el worker, o el chequeo de salud técnica (§7.3) se salta y lo
declara.

### Orden sugerido si se retoma

1. Métrica profunda del A/B — contenida, y arregla la incoherencia de fondo.
2. Flujo de consentimiento de testimonio — pequeño, y desbloquea código que
   hoy no se ejecuta nunca.
3. Estados de ciclo de vida (§5.5) — barato, y hoy no gobiernan nada pese a que
   el documento dice que gobiernan "Atención requerida" y lo que puede tocar N3.

Si en algún momento se retoma el Radar, los tres bloqueos de la primera tabla
caen solos.

---

## 1. Alcance

| Pantalla | Responsabilidad |
|---|---|
| `/landings` (`LandingsPage`) | Centro de control: atención requerida, ranking económico, diagnósticos, variantes y aprobaciones. |
| `/l/:slug` (`PublicLandingPage`) | La landing pública: render, telemetría y captura de lead. |
| `/campanas/:id` | La atribución por campaña enlaza a la landing correspondiente. |

## 2. Qué existe hoy y qué debe cambiar

Existe y se conserva:

- landings como parte de `Campaign` (`landingSlug`, `adAssets`);
- `PublicLandingPage` + `landing.controller` (`getLanding`,
  `recordLandingView`, `submitLead`);
- listado con búsqueda, filtros, KPIs de vistas/conversión y modal de
  creación/edición;
- entrada de tráfico registrada en `AcquisitionEvent`.

Debe cambiar:

- **Las webs externas viven en `localStorage`** — no llegan al backend, se
  pierden al cambiar de navegador y no se miden. Se migran al backend con
  tres estados de medición honestos (§8).
- La conversión bruta (vistas → leads) deja de ser el KPI principal; el
  avance hacia comprador manda, con las mismas tarjetas y reglas que `/ads`.
- No hay telemetría dentro de la landing: no se sabe dónde se pierde la
  gente. Sin eso, cualquier "optimización" es adivinar.
- Un dato desconocido nunca se presenta como `0` ni como fracaso.

## 3. Contratos técnicos

Los diagnósticos solo son creíbles si los datos que los sustentan tienen
contratos exactos. Estos cuatro contratos son bloqueantes de la fase 1.

### 3.1 Identidad de landing y versión

La telemetría no depende del `landingSlug`: un slug puede cambiar,
reutilizarse o apuntar a contenido diferente, y mezclaría en una misma línea
base datos de dos páginas distintas. La landing puede seguir viviendo dentro
de `Campaign`, pero cada versión publicada recibe un identificador inmutable.

Todo evento de telemetría registra como mínimo:

```text
organizationId
campaignId
landingKey          (identidad estable de la landing)
landingVersionId    (inmutable por publicación; cambia al modificar contenido)
experimentId        (si aplica)
variantId           (si aplica)
visitorId           (anónimo)
sessionId
timestamp
utm / atribución de origen
```

Modificar el hero crea una versión nueva; la línea base y los experimentos
comparan versiones, nunca "el slug a lo largo del tiempo".

> **`experimentId` y `variantId` no son opcionales en la práctica.** Si el
> ingestor no los sella, el agregado suma en la misma fila un formulario con
> campo email y otro sin él, y la línea base se contamina con su propio
> experimento: la landing acaba compitiendo contra su variante y puede emitir
> un «degradada» que en realidad describe el experimento. El servidor los
> resuelve a partir de la asignación de la sesión; el navegador no los envía.

### 3.2 Sesión y visitante

> **Decisión pendiente (§13): la identidad persistente de visitante exige
> cookie de origen propio, y eso es ePrivacy — banner o base legal declarada
> en `/l/:slug`.** Hasta resolverlo, la medición es **por sesión**:
> `visitorId` se registra como `null` y ni las cohortes de visitante ni la
> asignación estable de variante entre visitas están disponibles. El contrato
> se escribe entero desde el principio para que activar la cookie sea rellenar
> un campo, no migrar datos.

- **Visitante**: identificador anónimo generado en la primera visita
  (cookie de origen propio); sin cookie se genera uno nuevo — un borrado de
  cookies cuenta como visitante nuevo y se asume esa imprecisión.
- **Sesión**: empieza en la primera vista; expira a los 30 minutos de
  inactividad. Una recarga dentro de la sesión no es una visita nueva.
- **Asignación de variante**: por visitante, persistente mientras exista la
  cookie y el experimento siga activo.
- **Exclusiones**: bots (user-agent + heurística), previsualizadores de
  redes sociales y mensajería, y tráfico interno (IPs/usuarios de la propia
  organización marcados). *Lo interno todavía no se excluye (§13).*
- **Atribución de la sesión**: se sella en el primer evento y el resto la
  hereda, dispositivo incluido. El agregado se reparte por origen y por
  dispositivo, así que una sesión que cambiara de origen a mitad —entrar
  directo y volver con UTM en la misma pestaña— se contaría dos veces.
  Consecuencia deliberada: `LandingEvent` es **primer contacto** y
  `AcquisitionEvent` es último contacto (su upsert sobrescribe el origen), de
  modo que en ese caso raro las dos tablas discrepan. Se prefiere primer
  contacto aquí porque reescribir eventos ya guardados sería reescribir el
  histórico, y porque de una sesión de landing interesa de dónde llegó, no por
  dónde volvió a entrar.

### 3.3 Tres capas de datos

```text
LandingEvent            → telemetría anónima bruta de comportamiento
        ↓
LandingDailyRollup      → agregado por día × landing × versión × variante × origen
        ↓
LandingPerformanceSnapshot → embudo económico calculado para la interfaz
```

El snapshot contiene: visitas, leads, cualificados, oportunidades, ventas,
ingresos atribuidos, cobertura de atribución, estado de madurez, línea base
aplicable y confianza. La página lee snapshots; nunca reconstruye el embudo
desde eventos brutos en cada carga.

### 3.4 Línea base

"Degradada frente a línea base" tiene reglas explícitas:

- ventana habitual: últimos 28 días **maduros**; comparación con los
  últimos 7 o 14 días;
- se excluyen días con errores técnicos y períodos con experimentos activos
  cuando se evalúa la versión principal. **La regla implementada es: la línea
  base, los diagnósticos y el mapa de caída usan solo tráfico con
  `variantId` vacío** — el que está fuera de todo experimento. Si durante el
  período todo el tráfico estuvo en experimento, no hay veredicto y se dice
  con esas palabras, en lugar de devolver «0 sesiones»;
- mínimo de sesiones antes de emitir diagnóstico (sin volumen → "sin datos
  suficientes", no un veredicto);
- ajuste por mezcla de tráfico: si el origen cambia mucho (p. ej. empieza a
  entrar tráfico frío de Meta), el diagnóstico usa la línea base **por
  canal**, no la global. Bajar del 4% al 2% por un cambio de mezcla no es
  una landing estropeada.

Líneas base disponibles: global de landing, por canal, por campaña, por
dispositivo y por variante. No se muestran todas; el diagnóstico usa la
adecuada y declara cuál usó.

## 4. El MVP que hay que demostrar

Una única demostración completa, con el alcance mínimo exacto:

1. Una landing nativa.
2. Una fuente de tráfico con UTM.
3. Telemetría completa (§7).
4. Un formulario de varios campos.
5. Lead conectado a llamada IA.
6. Resultado de cualificación.
7. Una venta atribuida.
8. Un diagnóstico de abandono de formulario.
9. Una variante propuesta con justificación.
10. Un experimento server-side sencillo.

La página debe poder explicar un caso como este:

> La landing "instalacion-rapida" convierte al 2,1% (por debajo de su línea
> base del 3,4%). El 68% de quienes llegaron al campo "presupuesto estimado"
> abandonaron en él. Vendrava recomienda hacerlo opcional. Impacto estimado:
> 6–11 leads/mes (≈ 2–4 oportunidades según tu tasa de cualificación).
> Confianza: media (214 sesiones en 14 días).

El patrón siempre es: **detectar → explicar → demostrar → recomendar →
permitir actuar.**

Los tres diagnósticos accionables del MVP (todos N1 — recomendar y explicar):

1. **Tráfico sin leads.** Visitas llegan pero no se convierten; el
   diagnóstico localiza el cuello: nadie pasa del hero (scroll), nadie abre
   el formulario (CTA) o la página es lenta (salud técnica).
2. **Abandono de formulario por campo,** medido con exposición real (§7.2).
3. **Posible desalineación de mensaje** (message mismatch, §6). Siempre
   "posible": la señal sugiere, no demuestra causalidad.

## 5. Diseño de `/landings`

La página responde, en orden:

1. ¿Puedo confiar en los datos? (banda de integridad: telemetría activa,
   cobertura UTM, frescura — mismos estados que `ads.md` §4.2)
2. ¿Dónde debo actuar primero?
3. ¿Qué landing produce compradores, no solo leads?
4. ¿Dónde se pierde la gente en cada una?
5. ¿Qué recomienda Vendrava y por qué?

### 5.1 Atención requerida (arriba, antes del listado)

Tres o cuatro tarjetas máximo. El usuario no revisa veinte filas para
descubrir qué pasa; Vendrava le dice dónde actuar primero:

```text
1 landing perdiendo cualificados
2 formularios con abandono anómalo
1 experimento listo para decidir
3 landings sin telemetría fiable
```

Las recomendaciones se ordenan por prioridad económica:

```text
prioridad = impacto estimado × confianza ÷ esfuerzo
```

Cada diagnóstico lleva: impacto estimado (rango, en leads/oportunidades/€),
confianza, esfuerzo, riesgo y urgencia. Un rango amplio ("6–11 leads/mes")
es más útil que "mejorará la conversión".

### 5.2 Ranking económico

El listado se conserva (búsqueda, filtros, grid/lista) pero la vista
principal es el ranking que demuestra que más leads ≠ mejor landing:

| Landing | Visitas | Leads | Cualificados | Ventas | Ingresos | Confianza |
|---|---:|---:|---:|---:|---:|---|
| Instalación rápida | 1.240 | 31 | 14 | 5 | 18.400 € | Alta |
| Presupuesto solar | 2.810 | 102 | 9 | 1 | 4.200 € | Media |

Cada fila: mini-embudo con período y frescura, y estado de diagnóstico
(bien / degradada frente a línea base / sin datos suficientes). Conversión
bruta, vistas y CTR quedan como señales diagnósticas.

### 5.3 Detalle de landing

- **Embudo económico** completo con cobertura de atribución por paso.
- **Mapa de caída**: scroll medio, clics en CTA, abandono por campo con
  exposición real.
- **Origen del tráfico**: qué campañas/posts/anuncios envían visitas y con
  qué ángulo (para la desalineación de mensaje).
- **Diagnóstico activo** con evidencia, impacto estimado y confianza:
  problema → evidencia → recomendación → acción (`Crear variante`,
  `Aplicar cambio`, `Descartar`).
- **Variantes y experimentos**: historial con resultado y decisión.

### 5.4 Creación y variantes

- La creación nueva parte de una **oportunidad o campaña**: ángulo, objeción
  a resolver, objetivo — y genera la landing con bloques (hero, prueba
  social, FAQ viva, CTA) usando voz del dueño + especificidad verificada
  (servicios compartidos con Vendrava orgánico).
- Una **variante** siempre nace con justificación escrita ("el ángulo
  'rapidez' gana en ads; esta variante lo lleva al hero"), nunca como cambio
  cosmético sin hipótesis.
- Prueba social solo desde clientes ganados con `ContactConsent` y
  aprobación expresa en la sala de aprobación.

> **El consentimiento de contacto no sirve para publicar.** Los
> `ContactConsent` que ya existen tienen `purpose = 'contact'`: la persona
> autorizó que la llamaran, no que su nombre aparezca en una página pública.
> Publicar prueba social exige un consentimiento propio con
> `purpose = 'testimonial'` **más** aprobación humana; hasta que existan los
> dos, el cliente ganado aparece como candidato con «falta permiso», nunca como
> material publicable.

### 5.5 Estados de ciclo de vida

Landings:

```text
Borrador → En revisión → Aprobada → Publicada → (En experimento) →
Ganadora / Pausada → Archivada
```

Variantes:

```text
Generada → Pendiente de aprobación → Activa →
Ganadora / Perdedora / Sin conclusión / Descartada
```

Imprescindible cuando una organización acumule decenas de campañas; los
estados gobiernan qué aparece en "Atención requerida" y qué puede tocar N3.

## 6. Desalineación de mensaje (evidencia requerida)

CTR alto en origen + rebote alto en destino es una señal, no una prueba:
también puede ser carga lenta, mala visualización móvil, segmentación
incorrecta, clics accidentales, oferta poco creíble o formulario agresivo.

Para diagnosticar, Vendrava compara además:

```text
ángulo etiquetado del anuncio · promesa principal del anuncio ·
texto del hero de la landing · oferta · CTA · segmento objetivo
```

> **Límite actual del modelo de datos.** El ángulo etiquetado no existe todavía
> como dato, y `adAssets.adCopy` alimenta a la vez el texto del anuncio
> (`metaCampaignBuilder.service.ts` lo envía como `message`) y la descripción
> del hero: compararlos daría siempre solapamiento total y un «todo alineado»
> falso. Mientras el anuncio y la landing no tengan textos propios, la
> comparación se hace contra el **título de la landing**, que sí se escribe
> aparte; cuando ni siquiera eso existe, que la landing no tenga promesa propia
> *es* el hallazgo. Etiquetar el ángulo del anuncio es lo que desbloquea el
> diagnóstico completo (§13).

Y el diagnóstico se expresa con prudencia:

> Posible desalineación de mensaje. El anuncio enfatiza "instalación en 24
> horas", mientras que el hero habla principalmente de precio. El 74% del
> tráfico abandona antes del primer scroll. Confianza media.

Antes de culpar al mensaje, el diagnóstico descarta las causas técnicas
(velocidad, móvil) con los datos de salud técnica.

## 7. Telemetría (backend)

### 7.1 Eventos

```text
view (existe) · scroll_50 · scroll_90 · cta_click ·
form_start · form_step_view · form_step_complete ·
form_field_blur (campo + relleno o no) · form_validation_error ·
form_error · form_submit
```

Sin PII: los eventos registran comportamiento, nunca el contenido escrito en
los campos — solo si se rellenaron. El lead se vincula únicamente al
enviarse el formulario (flujo actual de `submitLead`).

### 7.2 Exposición real por campo

Contar "abandonos después del campo X" engaña: un campo al final siempre
parece bueno porque poca gente llega. Por campo se mide:

```text
llegaron al campo → interactuaron → completaron → error de validación →
abandonaron después · tiempo medio en el campo
```

El diagnóstico de abandono usa tasas sobre expuestos, no sobre el total.

### 7.3 Salud técnica

Chequeo programado de velocidad y render móvil por landing (cron sencillo).
Sus resultados alimentan el diagnóstico "tráfico sin leads" y descartan
causas técnicas antes de diagnosticar mensaje.

## 8. Webs externas: tres estados de medición

> **Aplazado — fuera de la fase 1.** Las webs externas siguen en
> `localStorage` hasta que las landings nativas midan de verdad. El estado
> *Medición completa* además no es una migración: es un producto aparte (tag
> JS, clave por organización, endpoint con CORS y consentimiento en web
> ajena). Lo que sigue queda como especificación acordada, no como trabajo en
> curso.

Nunca mezclar en un mismo ranking webs con medición distinta:

| Estado | Qué significa | Qué se muestra |
|---|---|---|
| **Medición completa** | Script/SDK de Vendrava instalado | Embudo completo, comparable con landings nativas |
| **Medición parcial** | Solo clics de salida desde Vendrava, UTMs o conversiones importadas | Lo medido, con la cobertura declarada |
| **Solo enlace** | Enlace guardado sin telemetría | Ficha informativa, sin métricas ni ranking |

Migración desde `localStorage` al backend en fase 1.

## 9. Experimentos A/B (aquí sí)

A diferencia del orgánico (aplazado 18/28 en la visión), en landings el A/B
es estadísticamente honesto: mismo tráfico, asignación aleatoria
server-side. Reglas:

- Infraestructura existente: `RevenueExperiment`, `RevenueExperimentVariant`,
  `RevenueExperimentAssignment`.
- Asignación en el server al servir `/l/:slug`, persistente por visitante
  (contrato §3.2); el experimento referencia `landingVersionId`, no slugs.
  **Hoy la unidad de asignación es la sesión, no el visitante**, porque la
  cookie sigue pendiente (§13): quien vuelve mañana puede caer en la otra
  variante. El experimento sigue siendo válido —mide sesiones— y así lo declara
  en su resultado, pero al resolver §13 la unidad debe pasar a visitante.
- La métrica de decisión es la más profunda elegible (misma elegibilidad
  que `ads.md` §4.4): cualificados si hay volumen, leads si no.
- Umbral estadístico explícito antes de declarar ganadora; si no se alcanza
  en el plazo, el experimento termina en **"sin conclusión"** — un resultado
  válido que se comunica como tal, nunca una ganadora con 17 visitas.
- Promoción de la ganadora: N1 propone, N2 un clic, N3 automática con
  registro en `AuditLog`. Modo sombra disponible antes de activar N3.

## 10. Autonomía: guardarraíles propios de landings

N1 (recomendar) y N2 (aprobar con un clic) aplican a todo. N3 (automático)
distingue qué puede tocar:

> **Hay dos políticas de autonomía, no una.** Este documento dice que los
> niveles N1/N2/N3 y el modo sombra se especifican en `ads.md` y «no se
> reinventan aquí», pero ads y landings se construyeron en paralelo y hoy
> conviven dos implementaciones del mismo concepto:
> `adPolicy.service.ts` sobre el modelo `AdOptimizationPolicy`
> (`autonomyLevel`, `mode: 'shadow'`, kill switch) y
> `landingAutonomy.service.ts` sobre `GovernancePolicy` con la clave
> `landing_autonomy` (`level`, `shadowMode`).
>
> **Coinciden en lo que más importa: las dos arrancan en N1 con modo sombra**,
> así que ninguna organización tiene autonomía que no le hayan concedido. Lo
> que falta es una sola vista de gobierno: hoy una organización puede estar en
> N3 para ads y N1 para landings sin que ningún sitio lo muestre junto, y el
> kill switch de ads no detiene la autonomía de landings. Unificarlas es una
> decisión de producto pendiente (§13), no un arreglo mecánico.

> **N3 está construido pero inerte.** Ninguno de los cinco cambios de la lista
> de abajo tiene hoy dónde aplicarse: el formulario solo exige campos
> esenciales, y CTA, FAQ y orden de bloques son constantes de
> `PublicLandingPage`, no datos. Por eso `changeFromDiagnosis` no propone nada
> y el registro de sombra está vacío a propósito — un registro lleno de
> decisiones que no habrían cambiado nada sería justo la falsa precisión que
> este documento existe para evitar. Los guardarraíles, el modo sombra, la
> reversión automática y la auditoría funcionan y están probados; cuando haya
> superficie editable, el único punto a tocar es `changeFromDiagnosis`.

**Modificable automáticamente (N3):**

- orden de bloques;
- texto de CTA previamente aprobado;
- obligatoriedad de campos no esenciales;
- variante de hero ya aprobada;
- FAQ basada en información verificada.

**Siempre requiere aprobación humana:**

- precios, promociones y garantías;
- testimonios y nombres/fotografías de clientes;
- afirmaciones legales o sanitarias;
- condiciones contractuales;
- eliminación o modificación de consentimientos;
- cambios de segmentación.

**Límites operativos de N3:**

```text
máximo un cambio activo por landing a la vez
período mínimo de observación tras cada cambio
rollback automático si cae una métrica de seguridad
nunca cambiar una landing durante una campaña crítica sin permiso
```

## 11. Fases

> Las cuatro están construidas (§0). Se conservan porque describen el orden en
> que hay que hacer las cosas, que sigue siendo válido para cualquier
> superficie que repita este patrón.

### Fase 1 — Medir

- Contratos §3 (identidad/versión, sesión/visitante, tres capas, línea base)
  — bloqueantes. Incluye `LandingVersion` como tabla propia (§12).
- Telemetría §7 + embudo económico reutilizando la tubería
  UTM/`AcquisitionEvent` de Vendrava.
- Banda de integridad y reglas `null` ≠ `0` en la página; eliminar
  `adAssets.visits` como fuente de visitas (doble verdad frente a
  `AcquisitionEvent`, hoy leída en `funnels.service.ts`).
- Fuera de fase 1: webs externas (§8) e identidad persistente de
  visitante (§13).

### Fase 2 — Diagnosticar

- Línea base por landing/canal y los tres diagnósticos N1 del MVP, con
  impacto estimado, confianza y prioridad económica.
- "Atención requerida" + ranking económico + detalle con mapa de caída.
- Salud técnica programada (§7.3) — no por el informe de velocidad, sino
  porque sin ella el diagnóstico de mensaje no puede descartar causas
  técnicas.
- Conexión con `ads.md`: el diagnóstico "anuncio correcto, landing
  deficiente" abre esta página con el contexto cargado
  (`/landings?landing=<landingKey>`).

### Fase 3 — Variar y experimentar

- Generación de variantes con justificación. **La variante nace de un
  diagnóstico de la fase 2**, no de un botón «genera algo»: sin hipótesis, el
  experimento no enseña nada gane o pierda. Con LLM configurado la redacta
  Claude sobre la evidencia del diagnóstico; sin él se genera igual de forma
  determinista a partir de esa misma evidencia.
- A/B server-side (§9) con promoción N1/N2 y estados de ciclo de vida.
- Prueba social con consentimiento propio (§5.4).
- **Pendiente por dependencias que no existen:** la *voz del dueño*
  (`ownerVoice.service.ts`, día 3 de `semana.md`) y la *FAQ viva*, que necesita
  las preguntas reales minadas de llamadas e inbox (`ContentOpportunity`).
  Mientras tanto, el contexto de marca sale de `KnowledgeBase`.

### Fase 4 — Autonomía

- N3 con modo sombra, guardarraíles §10 y `AuditLog`.
- Informe por landing en euros: "X cualificados, CAC Y, mejor variante Z".

Decisiones de implementación que conviene no perder:

- **La autonomía se concede, nunca se hereda.** Por defecto toda organización
  está en N1 con modo sombra: el job diario escribe lo que *haría* y no toca
  ninguna landing. Subir a N3 y apagar la sombra son dos actos explícitos y
  distintos, ambos bajo permiso de gobierno.
- **La lista negra gana sobre la blanca, y el contenido se inspecciona
  además del tipo.** Un `cta_text` —tipo permitido— que dice «desde 9 €» o
  «te devolvemos el dinero» se bloquea igual: la etiqueta del cambio no
  acredita que su contenido sea inocente.
- **La línea base de seguridad se congela al aplicar.** Compararse después
  contra una línea base recalculada escondería justo la caída que la
  reversión automática existe para detectar.
- El informe no calcula CAC sobre gasto incompleto: devuelve `null` y explica
  el hueco con palabras.

## 12. Riesgos conocidos

- **Volumen**: muchas landings de pyme tienen < 300 visitas/mes; los
  experimentos deben degradarse a "sin conclusión" honesto, y los
  diagnósticos a "sin datos suficientes".
- **Telemetría y privacidad**: los eventos son anónimos por diseño; revisar
  que ningún evento capture contenido de campos, solo si se rellenaron.
- **Contaminación de datos**: sin los contratos §3 (bots, sesiones,
  versiones), los diagnósticos parecerán precisos partiendo de datos sucios
  — peor que no tener diagnósticos.
- **Doble fuente de verdad**: la landing vive dentro de `Campaign`; si las
  variantes se multiplican, evaluar extraer un modelo `Landing` propio —
  pero no antes de la fase 3 (no crear el modelo antes de necesitarlo).
  **Excepción acordada:** `LandingVersion` sí se crea en la fase 1. Una
  versión inmutable no puede vivir en el `Json` mutable de
  `Campaign.adAssets`: sin inmutabilidad, la línea base de §3.4 compara
  contenidos que ya cambiaron y deja de ser creíble. La landing sigue dentro
  de `Campaign`; solo salen fuera sus versiones publicadas.
- **`AcquisitionEvent` no vale para la telemetría de §7.** Su índice
  `@@unique([campaignId, type, sessionId])` admite un evento por tipo y
  sesión — correcto para deduplicar vistas y leads, incompatible con doce
  `form_field_blur` de la misma sesión. `LandingEvent` es tabla nueva y el
  modelo de atribución no se toca.

## 13. Decisiones pendientes

| Decisión | Estado | Qué desbloquea |
|---|---|---|
| **Cookie de visitante y ePrivacy** — banner en `/l/:slug`, cookie técnica declarada, o medición solo por sesión | Pendiente (§3.2) | Visitante recurrente, cohortes por visitante y asignación A/B estable entre visitas. Sin ella el A/B de §9 se degrada a por-sesión. |
| **Webs externas y SDK** (§8) | Aplazado | Ranking comparable entre landings nativas y webs propias. |
| **FAQ viva** (§5.4) | Bloqueado | Necesita las preguntas reales minadas de llamadas e inbox: el `ContentOpportunity` del Radar, que no está construido. |
| **Voz del dueño** (§5.4) | Bloqueado | `ownerVoice.service.ts` (día 3 de `semana.md`) no existe. La generación de variantes usa `KnowledgeBase` como contexto de marca; sustituir esa fuente es cambiar una función. |
| **Consentimiento de testimonio** (§5.4) | Falta el flujo | Publicar prueba social exige `ContactConsent` con `purpose = 'testimonial'`. Hoy nadie lo pide, así que ningún cliente ganado es elegible — correcto, pero significa que la prueba social no publicará nada hasta que exista ese flujo. |
| **Superficie editable para N3** (§10) | Bloqueado | Ninguno de los cinco cambios permitidos tiene hoy dónde aplicarse, así que `changeFromDiagnosis` no propone nada y el registro de sombra está vacío a propósito. Detalle y motivo en §0 y §10. |

### Desviaciones detectadas en la revisión final

Ordenadas por lo que costaría que siguieran así. Ninguna corrompe datos —las
dos que sí lo hacían se corrigieron: sellar los eventos con su experimento y
excluir de la línea base el tráfico en experimento.

| Desviación | Dice el md | Está | Por qué se dejó |
|---|---|---|---|
| **Métrica de decisión del A/B** (§9) | La más profunda elegible: cualificados si hay volumen, leads si no | Siempre `lead` | Es la desviación de fondo: el A/B optimiza a leads, no a compradores, que es la tesis del documento. No corrompe nada mientras tanto. |
| **Creación desde oportunidad** (§5.4) | Parte de una oportunidad o campaña y genera bloques con voz del dueño | Modal antiguo | Funcionalidad entera sin empezar; depende además de la voz del dueño, bloqueada. |
| **Estados de ciclo de vida** (§5.5) | Ocho estados de landing | Solo 3 alcanzables (`experimenting`, `winner`, `published`) | `draft`/`in_review`/`approved`/`paused`/`archived` no los escribe nadie: el estado existe pero la máquina está a medias. |
| **Promoción N3 de la ganadora** (§9) | N1 propone, N2 un clic, N3 automática | Solo N1/N2 | Deliberado: promocionar sola una ganadora es la acción más arriesgada del sistema. |
| **Tráfico interno** (§3.2) | Excluir IPs/usuarios de la propia organización | Solo bots y previsualizadores | Sesgo pequeño en pymes, pero real cuando el equipo revisa su propia landing. |
| **Tarjetas de atención** (§5.1) | Incluyen "1 experimento listo para decidir" | Solo diagnósticos | Lo de "landings sin telemetría" ya lo cubre la banda de integridad. |
| **Fila del ranking** (§5.2) | Mini-embudo, frescura y estado de diagnóstico por fila | Tabla sin esas tres | Cosmética informativa. |
| **Cobertura por paso** (§5.3) | Cobertura de atribución paso a paso | Global del snapshot | Cosmética informativa. |
| **Enlace desde `/ads`** (§11 fase 2) | El diagnóstico "landing deficiente" abre esta página con contexto | Solo el extremo receptor (`/landings?landing=…`) | Falta añadir el enlace en `AdsPage`; el destino ya funciona. |
| **Umbral estadístico del A/B** (§9) | Por definir en fase 3 | `experimentResults` hoy solo devuelve tasas; declarar ganadora exige test de dos proporciones y tamaño mínimo. |
| **Ángulo etiquetado del anuncio** (§6) | Pendiente | El diagnóstico completo de desalineación. Hoy el anuncio y el hero comparten el campo `adAssets.adCopy`; hasta separarlos, la comparación usa el título de la landing. |
| **Unificar la política de autonomía con `ads.md`** (§10) | Pendiente de decisión | Existen dos: `AdOptimizationPolicy` (ads) y `GovernancePolicy/landing_autonomy` (landings). Ambas por defecto en N1 + sombra, así que no hay riesgo abierto, pero el kill switch de ads no detiene landings y no hay una vista única de gobierno. Decidir si el nivel es por organización (una política que ambas consultan) o por superficie (dos, pero declarado y visible junto). |
| **`FRONTEND_URL` en el worker** (§7.3) | Configuración | El chequeo de salud técnica necesita la dirección pública para poder pedir la landing. Sin ella el job se salta el chequeo y lo declara. |
