# Vendrava Orgánico — especificación de la página y del centro de mando

Instrucción de producto para la página de Captación orgánica (`/organic`). La
página no debe ser otro panel de "visibilidad SEO" con puntuaciones sin
consecuencia: es el **centro de mando del circuito orgánico completo** —
Landings y webs, Buscador de prospectos, Redes sociales y SEO son sus cuatro
brazos ejecutores.

> **Vendrava Orgánico no optimiza visibilidad. Optimiza compradores que llegan
> sin pagar por ellos.**

La tesis es el mismo circuito cerrado de `ads.md`, con tráfico no pagado:

```text
presencia (SEO / GBP / redes / prospección) → visita → landing → lead
        → llamada IA → lead cualificado → oportunidad → venta
   ↘ señales de canal (posiciones, posts, reseñas)   ↗ señal económica
```

Google sabe qué posición ocupas y Metricool cuántos likes tuviste. Vendrava
debe saber qué keyword, qué post, qué ficha de Google y qué prospección
produjeron leads que hablaron, cualificaron y compraron. Las métricas de canal
son la señal rápida; la cualificación y la venta son la señal profunda que
decide dónde invertir el tiempo (aquí el presupuesto es **horas de trabajo y
piezas de contenido**, no euros de puja).

Comparte con `ads.md` y `landings.md` las reglas transversales: `null` ≠ `0`,
cohortes maduras, cobertura de atribución, señal más profunda elegible
(`ads.md` §8), niveles de autonomía N1/N2/N3 con modo sombra y guardarraíles
(`ads.md` §10). Lo especificado una vez allí no se reinventa aquí.

## 1. Alcance de esta especificación

La experiencia se reparte entre pantallas que ya existen:

| Pantalla | Responsabilidad |
|---|---|
| `/organic` (`OrganicLeadsPage`) | **Centro de mando**: onboarding adaptativo, salud de los datos, embudo orgánico unificado, ranking económico por canal, diagnósticos, recomendaciones y resultados. |
| `/seo` (`SeoPage`) | Brazo ejecutor de búsqueda: auditar, arreglar, redactar, publicar. |
| `/redes-sociales` (`ConectarRedesPage`) | Brazo ejecutor social: conectar Metricool, generar y programar contenido. |
| `/prospectos` (`ProspectFinderPage`) | Brazo ejecutor outbound: buscar negocios, importar y activar llamadas. |
| `/landings` (`LandingsPage`) | El punto medio de todos los circuitos; especificado en `landings.md`. |

El reparto de responsabilidades es estricto:

- **`/organic` decide y prioriza.** Nunca duplica la operativa de los brazos:
  no audita URLs, no programa posts, no busca prospectos. Muestra la foto
  económica completa y enruta cada recomendación al brazo correcto **con el
  contexto cargado** (misma mecánica que `landings.md` fase 2: el diagnóstico
  abre la página destino con el caso preparado).
- **Los brazos ejecutan y devuelven señal.** Cada acción ejecutada en un brazo
  (artículo publicado, post programado, prospecto importado, arreglo aplicado)
  queda registrada de forma que `/organic` pueda medir su efecto aguas abajo.

## 2. Qué existe hoy y qué debe cambiar

### 2.1 `/organic` — la página propia

Existe y se conserva:

- OAuth Google server-side (Search Console, GA4, GBP) con PKCE, state de un
  solo uso y tokens cifrados; discovery y selección de propiedad
  (`organicGoogleIntegration.service.ts`, fase 2 ya entregada);
- sincronización real de queries de Search Console a `OrganicOpportunity`;
- navegación interna (Resumen, Oportunidades, Local, IA, Contenido,
  Competidores, Leads) y panel de integraciones con estados;
- modelos `OrganicProject`, `OrganicOpportunity`, `OrganicAsset`,
  `OrganicAction`, `OrganicIntegration` aislados por `orgId`.

Debe cambiar (defectos reales observados, no propuestas):

- **La página promete datos que el backend no entrega.** La UI espera
  `potentialCustomers`, `missedOpportunities`, `demand`, `local`, `ai`,
  `competitorGap` y `opportunity.score`; el overview devuelve otro contrato y
  esos paneles se renderizan vacíos para siempre. Prohibido: cada panel
  muestra datos reales o declara honestamente qué integración/fase le falta.
- **El selector de período es decorativo**: `getOrganicOverview(orgId)` ignora
  `projectId` y `period`. El período debe filtrar de verdad.
- **El callback OAuth redirige a `/captacion/conectar`** (que es
  `MetaAccountPage`, la cuenta de Meta). Debe volver a `/organic`.
- GA4 y GBP quedaron en discovery: se conectan pero no se ingieren. Sin su
  ingesta no hay visitas orgánicas reales ni señal local.
- No existe la vista de centro de mando: la página habla de "oportunidades
  SEO" pero no ve redes, prospección ni landings.
- **No hay onboarding**: el proyecto se crea con una URL y nada más. Vendrava no
  sabe qué vende el negocio, a quién, ni qué acontecimientos le importan. El
  onboarding adaptativo (§4) es la puerta de entrada que falta.

### 2.2 Los brazos — qué aporta y qué le falta a cada uno

| Brazo | Ya aporta | Le falta para el circuito |
|---|---|---|
| SEO (`/seo`) | `SeoReport`/`SeoProject`/`SeoKeywordRank`, re-auditoría semanal, artículos en `KnowledgeBase`, imán de leads (`source: 'seo_audit'`), lee Search Console vía `OrganicIntegration`. | El informe vive en `localStorage` del navegador; ninguna acción SEO registra su efecto esperado ni puede medirse después. |
| Redes (`/redes-sociales`) | Metricool conectado, copiloto de contenido, borradores con UTMs por canal (`utm_medium=organic_social`), exige campaña con `landingSlug`. | **Nada se persiste**: no hay modelo de post propio, la analítica es un volcado genérico de `Object.entries()`. Sin registro local de qué se publicó y cuándo, no hay atribución post → lead posible. |
| Prospectos (`/prospectos`) | Google Places + `quickScore`, import con dedupe (`placeId`), `AcquisitionEvent` `prospect_import`, auditoría y llamada automática opcionales. | El circuito se corta tras importar: nadie mide qué porcentaje de prospectos importados llegó a llamada, cualificación o venta por sector/ciudad/score. |
| Landings (`/landings`) | Telemetría y embudo económico especificados en `landings.md`. | Distinguir el tráfico orgánico por canal de origen en sus snapshots. |

La regla de presentación global se mantiene: un dato desconocido nunca se
presenta como `0` ni como fracaso.

## 3. El MVP que hay que demostrar

Construir primero un único recorrido perfecto por canal, con el mismo patrón
de `landings.md`: **detectar → explicar → demostrar → recomendar → permitir
actuar.**

```text
keyword/post/ficha/prospección → visita o contacto → lead → llamada IA
                               → cualificación → venta
```

La página debe poder explicar un caso como este:

> El canal de búsqueda trajo 34 leads este trimestre; 11 cualificaron y 4
> compraron. La keyword "instalación placas solares Valencia" produjo 3 de
> esas ventas y está en posición 7: subir a top 3 es la acción orgánica con
> más valor esperado este mes. Las redes trajeron 21 leads, pero solo 1
> cualificó — el tráfico social llega frío a una landing pensada para
> búsqueda.

Si todavía no hay ventas o cohortes maduras, decirlo: "Aún no hay señal de
ventas suficiente para comparar canales. Estamos observando leads y
cualificación". No fabricar un "valor estimado" en euros sin base.

Los tres diagnósticos accionables del MVP (todos N1 — recomendar y explicar):

1. **Canal que trae leads que no cualifican.** Volumen razonable de leads de
   un canal, pero cualificación anormalmente baja frente a los demás canales
   o frente a su propia línea base. Causa probable localizada: mensaje,
   landing de destino o intención del tráfico.
2. **Demanda detectada sin pieza que la capture.** Search Console muestra
   impresiones crecientes en queries donde no hay artículo, landing ni ficha
   optimizada — o la caza de Vendrava (llamadas/CRM/inbox, `README.md`) detecta
   una objeción repetida sin contenido que la responda. Enruta a `/seo`
   (artículo), `/redes-sociales` (post) o `/landings` (landing) según la
   intención.
3. **Esfuerzo sin retorno.** Piezas publicadas o prospecciones ejecutadas en
   un canal que, con cohortes maduras, no produce cualificados: recomendar
   reasignar las horas al canal con mejor coste por cualificado en tiempo.

## 4. Onboarding adaptativo y paquetes verticales

No hay un formulario distinto para cada sector ni uno gigante con cien
preguntas. El onboarding es **adaptativo**: empieza siendo universal, Vendrava
investiga el negocio y, cuando identifica el sector, carga automáticamente un
módulo especializado.

```text
Datos básicos del negocio
        ↓
Vendrava analiza web, redes, productos y herramientas conectadas
        ↓
Detecta sector, modelo de negocio y acontecimientos importantes
        ↓
El usuario confirma o corrige
        ↓
Se carga el formulario especializado
        ↓
Vendrava crea el calendario, las fuentes y las automatizaciones
```

El resultado no es solo la configuración de `/organic`: el perfil que produce
(sector, modelo, fuentes, acontecimientos, tono) alimenta a todo Vendrava —
orgánico, ads, landings y la caza de oportunidades. Se hace una vez.

Así no se crea una plataforma "para pádel". Se crea una plataforma universal
que **se convierte en una herramienta para pádel cuando entra PadelTop, en
una herramienta inmobiliaria cuando entra una agencia y en una herramienta
deportiva cuando entra un club.**

### 4.1 Pantalla 1 — Cuéntame sobre tu negocio

Un formulario muy sencillo:

```text
Nombre del negocio
Página web
País y ciudades donde opera
¿Qué vende?
¿Quiénes son sus clientes?
Redes sociales utilizadas
Objetivo principal
```

Objetivos seleccionables: ganar visibilidad · conseguir leads · vender ·
informar a clientes · crear comunidad · cubrir acontecimientos · atraer
tráfico a la web.

Y un campo abierto:

> Describe tu negocio como se lo explicarías a un nuevo empleado.

### 4.2 Pantalla 2 — Vendrava investiga el negocio

Con la web introducida, Vendrava analiza: textos de la página, productos y
servicios, publicaciones anteriores, tipo de clientes, ubicación, calendario,
herramientas utilizadas, temas frecuentes, formatos publicados, tono y
competidores. Y devuelve:

> **Hemos detectado que PadelTop es una plataforma para clubes y
> competiciones de pádel.** El contenido depende principalmente de partidos,
> resultados, clasificaciones y jugadores. Confianza: 94%.

Botones:

```text
Correcto  ·  Corregir sector  ·  Añadir otro tipo de actividad
```

Una empresa puede pertenecer a varios sectores y no debe quedar atrapada en
una sola categoría. PadelTop puede ser a la vez:

```text
Software SaaS + Deporte + Gestión de clubes
```

### 4.3 Pantalla 3 — Personalización automática por sector

En cuanto confirma el sector, desaparecen las preguntas genéricas y aparecen
las específicas del módulo vertical. Dos ejemplos completos:

**Para PadelTop (deporte):**

*Competiciones:*

```text
¿Qué competiciones quieres cubrir?
¿Qué clubes participan?
¿Hay divisiones o categorías?
¿Dónde se encuentra el calendario?
¿Quién confirma los resultados?
```

*Datos deportivos:*

```text
¿Dónde se guardan los partidos?
¿Existe una API?
¿Disponemos de resultados en directo?
¿Hay clasificación automática?
¿Podemos utilizar nombres y fotografías de jugadores?
```

*Contenido deseado (casillas configurables):*

```text
☑ Anunciar próximos partidos      ☑ Crear jugador de la jornada
☑ Publicar alineaciones           ☑ Crear resumen semanal
☑ Publicar resultado final        ☑ Generar estadísticas
☑ Actualizar clasificación        ☑ Publicar aniversarios y récords
```

*Momentos de publicación:*

```text
7 días antes · 24 horas antes · 1 hora antes · durante el partido ·
al terminar · día siguiente · resumen semanal
```

*Canales:* Instagram · Facebook · TikTok · X · LinkedIn · WhatsApp · Email · Web.

**Para una inmobiliaria**, aparecen preguntas completamente diferentes:

*Zona y mercado:*

```text
Municipios donde trabaja · Tipo de vivienda · Venta, alquiler o ambos ·
Perfil de comprador · Perfil de propietario · Rango de precios
```

*Fuentes internas:*

```text
CRM inmobiliario · Portal de inmuebles · Nuevas captaciones ·
Cambios de precio · Reservas · Ventas · Visitas · Preguntas de clientes
```

*Fuentes externas:*

```text
BOE · Diario oficial autonómico · Ayuntamiento · INE · Banco de España ·
Datos hipotecarios · Noticias del sector
```

*Acontecimientos que quiere convertir en contenido:*

```text
☑ Nueva vivienda        ☑ Cambio hipotecario     ☑ Evolución de precios
☑ Bajada de precio      ☑ Nueva ayuda            ☑ Pregunta frecuente
☑ Vivienda reservada    ☑ Cambio fiscal          ☑ Cambio urbanístico local
☑ Vivienda vendida
```

La interfaz se transforma según el sector, pero el motor interno es el mismo.

### 4.4 El núcleo universal

Aunque el formulario cambie, todo se traduce internamente a cinco elementos
comunes:

```text
Fuente → Acontecimiento → Regla → Pieza de contenido → Resultado
```

Ejemplo de pádel:

```text
Fuente:         API de PadelTop
Acontecimiento: partido finalizado
Regla:          crear resultado si está confirmado
Contenido:      story + post + carrusel
Resultado:      alcance, registros, clubes interesados y ventas
```

Ejemplo inmobiliario:

```text
Fuente:         BOE
Acontecimiento: nueva ayuda de vivienda publicada
Regla:          solo generar contenido si afecta a Valencia
Contenido:      carrusel + vídeo + email + landing
Resultado:      leads, citas y operaciones
```

Esto permite que el sistema sea universal sin perder especialización. El
mapeo a modelos está en §10: las fuentes son integraciones/conectores, los
acontecimientos generan `OrganicOpportunity`, las reglas son automatizaciones
con aprobación configurada, las piezas son `OrganicAsset` y el resultado es
el embudo económico de siempre.

### 4.5 Los paquetes verticales

Vendrava tiene una biblioteca interna de módulos:

```text
Deporte · Inmobiliaria · Restauración · Clínicas · Gimnasios · Academias ·
Ecommerce · Automoción · Seguros · Legal · Hostelería · Software
```

Cada módulo es **datos, no código**: tipos de acontecimientos, fuentes
recomendadas, calendario habitual, vocabulario, ideas de contenido, formatos,
métricas importantes, riesgos, reglas de aprobación y automatizaciones
habituales.

El módulo de deporte conoce los conceptos:

```text
temporada · jornada · partido · clasificación · jugador · resultado ·
racha · convocatoria
```

El inmobiliario conoce:

```text
captación · reserva · venta · hipoteca · precio por metro cuadrado ·
licencia · ayuda · impuesto
```

### 4.6 La pantalla del onboarding

Tres columnas:

**Izquierda — pasos:**

```text
1. Negocio
2. Sector detectado
3. Fuentes
4. Acontecimientos
5. Contenido
6. Aprobación
7. Activación
```

**Centro — formulario dinámico.** Las preguntas cambian según lo que Vendrava
va descubriendo:

> Hemos detectado partidos y clasificaciones en tu sistema. ¿Quieres que
> Vendrava genere contenido cuando ocurra alguno de estos eventos?

**Derecha — vista previa viva.** Mientras el usuario configura, ve lo que
Vendrava hará:

```text
Partido programado
→ Previa 24 horas antes
→ Story una hora antes
→ Resultado al terminar
→ Carrusel al día siguiente
```

Y una publicación real de ejemplo generada con sus datos.

### 4.7 Formulario basado en conversación

Además del formulario tradicional, un asistente conversacional (con voz,
usando el stack STT/TTS propio):

> — ¿Cómo funciona PadelTop?
>
> — Tenemos ligas de clubes. Los resultados se cargan al terminar y queremos
> publicar el marcador y la clasificación.

Vendrava convierte esa explicación en configuración:

```text
Fuente detectada: base de datos de partidos
Evento:           partido finalizado
Acciones:         publicar resultado y clasificación
Aprobación:       pendiente de configurar
```

El usuario solo confirma. Mucho más potente que obligarle a entender términos
técnicos como webhook, trigger o endpoint.

### 4.8 Detección progresiva

Vendrava no pretende conocer todo desde el primer día. El sistema se especializa
con el uso:

> Hemos observado que publicas resultados los domingos. ¿Quieres que creemos
> automáticamente un resumen semanal cada lunes?

> En tus últimas 12 llamadas inmobiliarias aparece repetidamente la pregunta
> sobre hipotecas. ¿Quieres activar una serie semanal de contenido
> hipotecario?

Estas propuestas entran por el mismo panel de recomendaciones (§5.5) con su
evidencia, nunca como configuración silenciosa.

### 4.9 Niveles de personalización

| Nivel | Qué es | Fase (§11) |
|---|---|---|
| **1. Plantilla sectorial** | "Soy una inmobiliaria de Valencia" → configuración inicial del módulo vertical, para empezar rápido. | Fase 1 |
| **2. Conectores reales** | CRM, calendario, partidos, inventario o agenda conectados; el contenido usa datos propios. | Fases 1–2 |
| **3. Comportamiento aprendido** | Vendrava descubre qué acontecimientos importan, qué publicaciones funcionan, qué temas producen leads, cuándo publicar y qué formatos generan ventas. | Fase 3 |
| **4. Automatización** | El sistema ejecuta flujos autorizados sin intervención. | Fase 4 |

### 4.10 Ejemplo completo: PadelTop

Durante el onboarding:

```text
Vendrava detecta:
  Sector principal: deporte        Subsector: pádel
  Modelo: software para clubes
  Datos disponibles: partidos, resultados y clasificaciones
  Frecuencia: diaria
```

Después pregunta:

```text
¿Qué eventos quieres cubrir?
☑ Partido programado    ☑ Clasificación actualizada
☑ Partido iniciado      ☑ Nueva pareja líder
☑ Partido finalizado    ☑ Final de jornada
```

Después:

```text
¿Qué debe hacer Vendrava?
Partido programado        → crear previa
Partido finalizado        → crear marcador
Clasificación actualizada → crear carrusel
Fin de jornada            → crear resumen semanal
```

Después:

```text
¿Cuándo requiere aprobación?
Previa              → automática
Resultado           → automática si está confirmado
Resumen             → aprobación
Contenido sensible  → aprobación obligatoria
```

Pantalla final:

> **Tu sistema de contenido está preparado.** Vendrava vigilará 6 tipos de
> acontecimientos, generará 4 formatos y solicitará aprobación únicamente en
> 2 situaciones.

La clave, en una línea:

```text
formulario universal + detección automática del sector + módulo vertical
especializado + conectores con datos reales + aprendizaje progresivo
```

Guardarraíles del onboarding: la "aprobación automática" configurada aquí
nunca excede la frontera de autonomía de §9 — el contenido público nuevo pasa
por la sala de aprobación hasta que el nivel N2/N3 se gane con uso; y el uso
de nombres y fotografías de personas (jugadores, clientes) exige la casilla
de consentimiento correspondiente, con las mismas reglas de `ContactConsent`.

## 5. Diseño de `/organic`

La página responde, en este orden, a cinco preguntas:

1. ¿Puedo confiar en los datos? (¿qué canales están midiendo de verdad?)
2. ¿Qué está pasando ahora en cada canal?
3. ¿Qué canal produce compradores, no solo tráfico o leads?
4. ¿Qué recomienda Vendrava, por qué y en qué brazo se ejecuta?
5. ¿Qué puedo aprobar, delegar o descartar?

### 5.1 Cabecera y banda de integridad

Conservar cabecera con título, selector de período (que funcione) y botón
`Actualizar`. Debajo, la banda de integridad — el equivalente orgánico de
`ads.md` §4.2 — con una fila por fuente:

| Fuente | Estado que debe mostrar |
|---|---|
| Search Console | conectada / propiedad elegida / última sync / filas ingeridas |
| GA4 | conectada / propiedad elegida / **ingesta pendiente de fase** |
| Google Business Profile | conectada / ubicación elegida / **ingesta pendiente de fase** |
| Metricool | configurado / marca elegida / perfiles conectados |
| Telemetría de landings | activa / cobertura UTM del tráfico orgánico |
| Prospección | API de Places configurada / última importación |
| Conectores verticales (§4) | conectado / sin datos / error, por cada fuente configurada en el onboarding |

Estados agregados idénticos a Ads: **datos listos / parciales / obsoletos /
no fiables**, con la acción concreta para reparar cada uno. Una integración
conectada cuyo dato no se ingiere todavía se declara como "conectada, sin
ingesta" — nunca como panel vacío ni como cero.

### 5.2 Resumen superior

Cuatro tarjetas, siempre con período y frescura:

1. **Leads orgánicos** — leads del período cuyo `AcquisitionEvent` es de
   canal orgánico (búsqueda, social, GBP, prospección, referencia directa).
2. **Cualificados** — de esos leads, los que tienen resultado de llamada
   válido. Misma definición exacta que `ads.md` §4.4: el embudo no puede
   contar distinto según el canal que trajo el lead.
3. **Ventas / valor ganado** — ventas atribuidas a canal orgánico con cohorte
   madura; si no las hay, mostrar oportunidades abiertas con explicación.
4. **Coste por cualificado en tiempo** — horas estimadas invertidas (piezas
   producidas × tiempo por pieza + prospección) ÷ cualificados. Es la métrica
   que sustituye al CAC publicitario: el gasto del orgánico es tiempo. Se
   presenta como estimación declarada, no como contabilidad exacta.

Posiciones medias, impresiones, seguidores, alcance e interacciones siguen
visibles en cada canal, pero como señales diagnósticas, nunca como objetivo.

### 5.3 Embudo orgánico unificado

La tarjeta central del centro de mando:

```text
presencia → visita → lead → lead cualificado → oportunidad → venta
```

Cada paso muestra volumen, tasa al siguiente, cobertura de atribución y
período, **desglosable por canal** (búsqueda / redes / GBP / prospección).
"Presencia" se define por canal: impresiones de Search Console, alcance de
posts, vistas de ficha GBP, prospectos contactables encontrados.

La tarjeta indica la señal más profunda elegible por canal con los mismos
requisitos de `ads.md` §4.4 (volumen, cobertura, madurez, estabilidad,
latencia). El orgánico tiene latencias más largas que Ads — un artículo tarda
semanas en posicionar — y las cohortes deben respetarlo: una pieza no se
declara fracaso a los siete días de publicarse.

### 5.4 Ranking económico por canal y por pieza

La tabla que demuestra que más tráfico ≠ mejor canal:

| Columna | Propósito |
|---|---|
| Canal / pieza | Búsqueda, redes, GBP, prospección; expandible a keyword, post, artículo, ficha o lote de prospección. |
| Presencia | Impresiones, alcance o prospectos según canal. |
| Visitas / leads | Señal rápida del canal. |
| Cualificados | Calidad real de los leads del canal. |
| Oportunidades / ventas | Señal económica profunda. |
| Horas invertidas | Esfuerzo estimado del período. |
| Tendencia | Mejora, estable, empeora o datos obsoletos, contra su línea base. |
| Acción | Sin acción, recomendación pendiente, delegada a un brazo, ejecutada. |

Filtros mínimos: `Todos`, `Necesitan atención`, `En observación`,
`Con ventas`, `Datos incompletos`.

La fila expandida muestra lo mismo que exige `ads.md` §4.5: señal que provocó
la atención, período y cohortes, métricas contra línea base, causa probable y
descartadas, recomendación, confianza y enlace a evidencias. Las líneas base
siguen las reglas de `landings.md` §3.4 (ventana madura, mínimo de volumen,
ajuste por mezcla) aplicadas por canal.

### 5.5 Panel "Qué recomienda Vendrava"

Misma anatomía de tarjeta de decisión que `ads.md` §4.6, con el destino de
ejecución explícito:

```text
┌────────────────────────────────────────────────────────────┐
│ PRIORIDAD: demanda sin pieza que la capture                │
│ 1.900 impresiones/mes en "cuánto cuesta aerotermia" sin    │
│ ningún contenido tuyo. Intención comercial. Posición       │
│ media de la competencia directa: 4.                        │
│                                                            │
│ Recomendación: artículo + landing con calculadora.         │
│ Impacto estimado: 15–25 visitas/mes → 2–4 leads/mes.       │
│ Evidencia: 90 días de Search Console  |  Confianza: media  │
│                                                            │
│ [Ver evidencia] [Crear en SEO →] [Descartar]               │
└────────────────────────────────────────────────────────────┘
```

Las recomendaciones se ordenan por prioridad económica
(`impacto estimado × confianza ÷ esfuerzo`, como `landings.md` §5.1) y el
botón de acción **abre el brazo correspondiente con el contexto cargado**:
`/seo` con la keyword y el brief, `/redes-sociales` con el ángulo y la
campaña, `/prospectos` con sector y ciudad, `/landings` con la oportunidad.
Nunca un botón que "ya lo hace todo" desde el centro de mando.

Este panel es la desembocadura común de tres corrientes: las señales de
canal (Search Console, Metricool, GBP), la caza de Vendrava sobre
llamadas/CRM/inbox (`README.md`) y los **acontecimientos de los conectores
verticales** (§4.4: partido finalizado, nueva vivienda, ayuda publicada…).
Todas entran en la misma cola priorizada con su evidencia.

### 5.6 Circuito rápido y circuito lento

**Ahora — diario:**

- integración caída, token caducado, sync fallida;
- caída brusca de posiciones o de impresiones en keywords con ventas;
- reseña nueva en GBP sin responder;
- lead orgánico sin llamada o con llamada fallida;
- pieza programada que no llegó a publicarse;
- acontecimiento vertical detectado con regla activa (un partido terminó, un
  inmueble se reservó) pendiente de generar su pieza.

**Resultado — semanal o por cohortes maduras:**

- cualificación y ventas por canal y por pieza;
- coste por cualificado en tiempo;
- efecto medible de acciones ejecutadas (arreglo SEO, artículo, lote de
  prospección) sobre su métrica objetivo;
- reparto recomendado de horas entre canales.

El circuito rápido protege el sistema (integraciones, leads sin atender) y da
la inmediatez que piden los acontecimientos verticales. El circuito lento
decide dónde invertir el tiempo. Las latencias orgánicas se respetan: nada se
evalúa antes de su ventana de maduración declarada.

### 5.7 Informe semanal narrado

En la parte inferior, el mismo informe de negocio que `ads.md` §4.8, en
lenguaje humano: qué cambió, qué canal produjo la señal más profunda, dónde
se perdió el embudo, qué recomendó Vendrava y qué se hizo, qué datos siguen
inmaduros, qué probar la semana siguiente. Existe desde la fase 1 — es la
demostración de valor antes de cualquier autonomía. Comparte formato y motor
con el informe de Ads: dos plumas, una redacción.

## 6. Estados obligatorios de la página

| Estado | Comportamiento |
|---|---|
| Cargando | Skeleton; nunca datos demo. |
| Plan sin Organic | Explicar la capacidad y cómo mejorar el plan. |
| Sin proyecto | **Onboarding adaptativo (§4)** como experiencia de entrada, no un CTA con un campo de URL. |
| Onboarding incompleto | Retomar en el paso donde se quedó; lo ya confirmado no se vuelve a preguntar. |
| Proyecto sin integraciones | Banda de integridad como protagonista; explicar qué desbloquea cada conexión. |
| Integración conectada sin ingesta | "Conectada, sin datos aún" + qué fase la activa; nunca panel vacío mudo. |
| Datos parciales | Mostrar lo medido con su cobertura declarada. |
| Datos maduros | Ranking económico y recomendaciones N1 activos. |
| Error o token revocado | Mensaje concreto y acción de reparación (reconectar, reelegir propiedad). |

El modo demo no inventa keywords, posts ni ventas.

## 7. Contrato de datos para la página

### 7.1 Respuesta de `GET /api/organic/overview`

Se sustituye el contrato actual (que la UI ya no puede leer) por uno estable.
Regla dura: **la UI solo pinta lo que este contrato declara**; se acabaron los
paneles que esperan campos que nadie envía.

```json
{
  "project": { "id": "…", "url": "…", "period": "90d" },
  "profile": {
    "sectors": ["deporte/padel", "software"],
    "onboarding": { "status": "complete", "level": 2 }
  },
  "dataQuality": {
    "status": "partial",
    "sources": {
      "search_console": { "status": "ready", "lastSyncAt": "…", "rows": 1840 },
      "ga4": { "status": "connected_no_ingest" },
      "google_business_profile": { "status": "connected_no_ingest" },
      "metricool": { "status": "ready", "profiles": ["instagram", "linkedin"] },
      "landing_telemetry": { "status": "ready", "utmCoveragePct": 78 },
      "prospecting": { "status": "ready", "lastImportAt": "…" },
      "vertical_connectors": [
        { "key": "padeltop_api", "status": "ready", "lastEventAt": "…" }
      ]
    },
    "issues": ["GA4 conectado pero sin ingesta: las visitas orgánicas son parciales"]
  },
  "summary": {
    "fast": { "organicLeads": 55, "visits": 2140, "presence": null },
    "mature": { "qualified": 12, "opportunities": 7, "sales": 4, "hoursInvested": 22, "hoursPerQualified": 1.8 },
    "deepestEligibleSignal": "qualified_lead"
  },
  "funnel": [],
  "channels": [],
  "recommendations": [],
  "weeklyNarrative": null,
  "policy": { "autonomyLevel": "N1", "mode": "shadow" }
}
```

`period` y `projectId` filtran de verdad. Métricas no disponibles son `null`.
Importes en céntimos con moneda explícita cuando existan ventas.

### 7.2 Rutas que debe consumir o añadir la UI

Se conservan todas las rutas de integraciones de la fase 2. Se añaden:

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/organic/overview` | Contrato §7.1 (reescrito). |
| GET | `/api/organic/onboarding` | Estado y paso actual del onboarding. |
| POST | `/api/organic/onboarding/investigate` | Pantalla 2: análisis de web/redes → sectores con confianza. |
| PUT | `/api/organic/onboarding` | Guardar respuestas del paso (incl. correcciones de sector). |
| POST | `/api/organic/onboarding/complete` | Activar: crea fuentes, reglas y calendario del núcleo universal. |
| GET | `/api/organic/channels/:channel` | Detalle de canal: piezas, embudo, línea base. |
| GET | `/api/organic/recommendations` | Recomendaciones priorizadas con evidencia. |
| POST | `/api/organic/recommendations/:id/dispatch` | Delegar en un brazo: crea el borrador/contexto y devuelve la URL destino. |
| POST | `/api/organic/recommendations/:id/dismiss` | Descartar con motivo (alimenta el aprendizaje). |
| GET | `/api/organic/report/weekly` | Informe narrado. |
| POST | `/api/organic/integrations/ga4/sync` | Ingesta GA4 (fase 2 de este doc). |
| POST | `/api/organic/integrations/google_business_profile/sync` | Ingesta GBP (fase 2). |
| GET | `/api/organic/autonomy` | Sala de autonomía: nivel, modo sombra, freno compartido, catálogo de §9 con su nivel efectivo y decisiones recientes. |
| PUT | `/api/organic/autonomy` | Conceder nivel, salir del modo sombra y ajustar cooldown y techo diario. |
| POST | `/api/organic/autonomy/run` | Pasada manual: propone, decide y —solo en N3 en vivo— ejecuta. |
| POST | `/api/organic/autonomy/decisions/:id/approve` | Aprobación con un clic (N2). Reevalúa guardarraíles y ejecuta. |
| POST | `/api/organic/autonomy/decisions/:id/reject` | Rechazo con motivo. |
| POST | `/api/organic/autonomy/kinds/:kind/promote` | Subir de nivel un tipo de acción que se lo ha ganado. |
| POST | `/api/organic/autonomy/kinds/:kind/demote` | Bajarlo a N1 a mano. |

El callback OAuth corrige su redirección a `/organic`.

### 7.3 Contratos con los brazos

Cada brazo registra sus acciones de forma medible; sin esto el centro de
mando no puede cerrar ningún circuito:

- **SEO**: el informe sale de `localStorage` y se lee de `SeoReport` (ya se
  persiste en backend; la página debe dejar de depender de la copia local).
  Cada arreglo aplicado y artículo publicado crea una `OrganicAction` con
  métrica objetivo y ventana de maduración.
- **Redes**: cada borrador creado en Metricool se registra localmente
  (canal, fecha, campaña, UTMs, oportunidad de origen). Sin registro local de
  posts no hay atribución post → lead. Es el mínimo persistente; la
  analítica de detalle sigue viviendo en Metricool.
- **Prospección**: cada importación ya crea `AcquisitionEvent`; se añade el
  agregado por lote (sector, ciudad, importados, con llamada, cualificados)
  que alimenta el ranking del canal outbound.
- **Landings**: los snapshots de `landings.md` §3.3 se consumen filtrados por
  origen orgánico; no se recalcula nada aquí.

## 8. Atribución y privacidad

El hilo mínimo por canal, todo sobre infraestructura existente:

```text
búsqueda:    query (Search Console) → landing/artículo → AcquisitionEvent(utm) → Lead → Call → Opportunity
redes:       post registrado → landing (utm_medium=organic_social) → AcquisitionEvent → Lead → …
GBP:         ficha → llamada/visita web → AcquisitionEvent → Lead → …
prospección: AcquisitionEvent(prospect_import, placeId) → Lead → Call → …
vertical:    acontecimiento (conector) → pieza publicada → landing (utm) → AcquisitionEvent → Lead → …
```

`AcquisitionEvent` sigue siendo el hub único de atribución; no crear una
cadena paralela. La cobertura de atribución por canal se muestra siempre:
el tráfico orgánico directo o sin UTM se declara como "origen orgánico no
identificado", nunca se reparte entre canales por estimación silenciosa.

Privacidad — las mismas reglas no negociables del `README.md`:
seudonimización antes del LLM, evidencias agregadas y no literales,
aislamiento por `orgId`, sin PII en contenido publicado, trazabilidad por ids
internos. Añadidos propios del orgánico:

- los datos de Search Console, GA4 y GBP son de la organización que conectó
  la cuenta y no alimentan comparativas entre organizaciones sin agregación y
  volumen suficientes;
- los nombres y fotografías de personas provenientes de conectores verticales
  (jugadores, clientes, pacientes) solo se publican si el onboarding declaró
  el permiso correspondiente, y el contenido sensible del vertical (p. ej.
  salud, legal) hereda "aprobación obligatoria" del módulo (§4.5).

## 9. Autonomía: qué puede tocar el orgánico

N1 (recomendar) y N2 (aprobar con un clic) aplican a todo, con el motor de
`ads.md` §10. Para N3, el orgánico tiene una frontera propia:

**Delegable a N3 (con modo sombra previo):**

- reprogramar la fecha/hora de un post ya aprobado;
- re-sincronizaciones y re-auditorías programadas;
- refresco de un artículo existente sin cambiar sus afirmaciones;
- respuesta a reseñas con plantilla previamente aprobada;
- piezas de **formato previamente aprobado sobre datos confirmados de un
  conector vertical** (marcador de un partido confirmado, ficha de una
  vivienda publicada) cuando la regla del onboarding lo autorizó y el formato
  acumula el historial de aprobaciones que exige el nivel;
- **redactar y publicar un artículo del plan de contenidos vigente**
  (`write_article`), con el filtro de contenido sensible aplicado al texto
  resultante: si el artículo acaba mencionando precios, garantías,
  afirmaciones legales o prueba social, queda redactado y **sin publicar**
  hasta que lo lea una persona.

  > Excepción añadida el 09/08/2026 por decisión expresa del negocio. Rompe a
  > propósito la regla de abajo, que exigía sala de aprobación para todo
  > contenido público nuevo. El riesgo que se asume es explícito: texto escrito
  > por un modelo publicado en la web del cliente sin lectura humana previa. El
  > filtro de contenido sensible acota los daños, no los elimina — no detecta
  > una afirmación simplemente falsa sobre el negocio.

**Siempre requiere aprobación humana:**

- publicar contenido nuevo de formato no aprobado (posts y landings) — salvo
  la excepción de `write_article` de arriba, el contenido público pasa por la
  sala de aprobación;
- cualquier pieza con cita de cliente (exige `ContactConsent`) o con nombres
  y fotografías sin permiso declarado;
- importar prospectos o activar llamadas salientes;
- precios, promesas, afirmaciones legales o sanitarias;
- todo lo que el módulo vertical marque como contenido sensible.

## 10. Modelos de dominio

Reutilizar `OrganicProject`, `OrganicOpportunity`, `OrganicAsset`,
`OrganicAction`, `OrganicIntegration`, `AcquisitionEvent`, `Lead`, `Call`,
`Opportunity`, `SeoReport`, `SeoProject`, `SeoKeywordRank`, `KnowledgeBase`,
`Campaign` y `AuditLog`.

El núcleo universal del onboarding (§4.4) se mapea así — sin motor paralelo:

```text
Fuente          → OrganicIntegration (Google/Metricool) o conector vertical
Acontecimiento  → OrganicOpportunity (sourceKind: vertical_event, query, …)
Regla           → Automation/ScheduledTrigger con política de aprobación
Pieza           → OrganicAsset (+ SocialPostRecord si es post)
Resultado       → AcquisitionEvent → Lead → Call → Opportunity (embudo §5.3)
```

Cambios mínimos, en orden de necesidad:

| Entidad | Cambio |
|---|---|
| `OrganicProject` | Guardar el perfil del onboarding: sectores (múltiples), modelo de negocio, objetivo, respuestas del módulo, nivel de personalización alcanzado. |
| `OrganicOpportunity` | Generalizar: hoy solo nace de queries de Search Console. Añadir `channel` y `sourceKind` (query, post_angle, gbp, prospecting, vendrava_hunt, **vertical_event**) para que sea la oportunidad única del circuito. |
| `OrganicAction` | Convertirla en el registro medible: brazo destino, pieza resultante, métrica objetivo, ventana de maduración, resultado observado. |
| `SocialPostRecord` (nuevo, mínimo) | Post creado vía Vendrava: canal, fecha, campaña, UTMs, oportunidad de origen, id externo de Metricool. Sin él no hay atribución social. |
| `OrganicChannelSnapshot` (nuevo) | Agregado por período × canal: presencia, visitas, leads, cualificados, ventas, horas estimadas. La página lee snapshots, no recalcula en cada carga (mismo patrón que `landings.md` §3.3). |
| `OrganicTrafficDaily` (nuevo, fase 1) | Un día por fila de lo que entregan GA4 y el Perfil de Empresa: sesiones y sesiones con interacción por página y canal, vistas de ficha, llamadas y clics al sitio. El snapshot se reconstruye entero cada hora, así que el dato diario es lo que permite recalcular cualquier ventana sin volver a pedírselo a Google. |
| `VerticalModule` (biblioteca, no tabla por cliente) | Definición declarativa de cada paquete vertical (§4.5): acontecimientos, fuentes, preguntas, vocabulario, reglas de aprobación. Son datos versionados (JSON/seed), no código ni esquema nuevo por sector. |
| `VerticalConnector` (nuevo) | Instancia de fuente vertical de una organización: tipo (API, feed, manual), credenciales cifradas, último evento, estado. Emite acontecimientos que crean `OrganicOpportunity`. |

No crear un motor de decisiones paralelo: las recomendaciones orgánicas usan
las mismas entidades de decisión/acción que se definan para Ads
(`AdDecision`/`AdAction` generalizadas o equivalentes), con `channel` de
origen. Una sola auditoría, un solo kill switch.

## 11. Fases de implementación

### Fase 0 — Honestidad y reparación

- reescribir el contrato de `overview` (§7.1) y la página para pintar solo lo
  declarado; eliminar los paneles que fingen;
- hacer funcionar `period`/`projectId`;
- corregir la redirección del callback OAuth a `/organic`;
- banda de integridad con sus fuentes y estados reales;
- SEO deja de depender de `localStorage` y lee `SeoReport` del backend.

**Salida:** la pantalla afirma qué datos tiene y cuáles no, sin fingir.

### Fase 1 — Onboarding y medición del circuito

- **Onboarding adaptativo, pantallas 1–3** (§4.1–§4.3): formulario
  universal, investigación del negocio con confirmación de sectores
  múltiples, y los **dos primeros módulos verticales** como prueba del
  patrón (elegir dos sectores con clientes reales; el resto de la biblioteca
  crece como datos, §4.5). Nivel 1 de personalización completo.
- núcleo universal persistido (§10): perfil en `OrganicProject`, reglas como
  automatizaciones con política de aprobación;
- vista previa viva y pantalla final "Tu sistema de contenido está
  preparado";
- ingesta GA4 (sesiones orgánicas por landing/página) y GBP (vistas,
  llamadas, reseñas);
- registro local de posts (`SocialPostRecord`) al crear borradores;
- agregado de lotes de prospección;
- `OrganicChannelSnapshot` y el embudo unificado §5.3 sobre
  `AcquisitionEvent` + snapshots de landings;
- informe semanal narrado, versión observacional.

**Salida:** un negocio entra sin saber nada de marketing y sale con fuentes,
acontecimientos y calendario configurados; el embudo presencia → venta por
canal mide con cobertura declarada.

### Fase 2 — Diagnosticar, priorizar y conectar datos reales

- líneas base por canal y los tres diagnósticos N1 del MVP (§3);
- ranking económico por canal y pieza con horas invertidas;
- panel de recomendaciones con prioridad económica y `dispatch` a los brazos
  con contexto cargado;
- integración con la caza de Vendrava y con los acontecimientos verticales: las
  tres corrientes en la misma cola priorizada (§5.5);
- **conectores reales del nivel 2** (§4.9): primer `VerticalConnector` con
  API/feed del cliente (p. ej. partidos de PadelTop) emitiendo
  acontecimientos que generan piezas con datos propios;
- **formulario conversacional** (§4.7) sobre el stack STT/TTS propio.

**Salida:** N1 útil: "esto está pasando, esta es la causa probable, esto es
lo que más valor tiene y aquí se ejecuta" — y el contenido ya usa datos
reales del negocio.

### Fase 3 — Cerrar el bucle y aprender

- toda acción despachada crea su `OrganicAction` medible con ventana de
  maduración;
- evaluación automática al madurar: efecto observado vs. esperado, visible en
  el informe semanal;
- aprender de los descartes (motivo) para reordenar futuras recomendaciones;
- **detección progresiva** (§4.8) y nivel 3 de personalización: propuestas de
  nuevas reglas y series a partir del comportamiento observado (publicaciones
  que funcionan, temas que producen leads, horarios), siempre por el panel de
  recomendaciones.

**Salida:** Vendrava puede demostrar qué recomendaciones funcionaron, con
cohortes, no con anécdotas — y se especializa con el uso.

### Fase 4 — Autonomía limitada

- N2 para despachos acotados; N3 solo para la lista de §9 con modo sombra,
  cooldown y kill switch compartido — incluye las piezas de formato aprobado
  sobre datos confirmados de conectores verticales (nivel 4 del onboarding);
- degradación automática a N1 ante datos obsoletos o cobertura baja.

**Salida:** el centro de mando actúa solo en lo mecánico y en lo
explícitamente autorizado; el contenido público nuevo sigue pasando por
personas.

## 12. Mapa de implementación

### Frontend

- `src/pages/OrganicLeadsPage.jsx`: reescritura de composición — banda de
  integridad, embudo unificado, ranking, recomendaciones, informe; eliminar
  paneles sin fuente de datos.
- `OrganicOnboarding` (nuevo, dentro de la página): las tres columnas de
  §4.6 (pasos, formulario dinámico, vista previa viva); los módulos
  verticales llegan como datos del backend, el componente no conoce sectores.
- `src/lib/organic/organicApi.js`: nuevo contrato §7.1 + rutas de onboarding;
  el normalizador deja de inventar campos.
- `src/pages/SeoPage.jsx`: lee el informe de `SeoReport` (`GET
  /api/seo/reports/latest`) y permite volver a uno del historial
  (`/api/seo/reports/:id`); aceptar contexto de despacho (keyword/brief
  precargado).
- `src/pages/LeadDetailPage.jsx`: chip con el origen orgánico concreto del lead,
  al lado del de campaña de Ads.
- `src/pages/ConectarRedesPage.jsx`: aceptar contexto de despacho (ángulo,
  campaña); registrar el post al crear el borrador.
- `src/pages/ProspectFinderPage.jsx`: aceptar contexto (sector/ciudad).

### Backend

- `organic.service.ts`: contrato §7.1, filtros reales de período/proyecto,
  snapshots de canal.
- `organicOnboarding.service.ts` (nuevo): investigación del negocio
  (pantalla 2), biblioteca de módulos verticales (datos versionados),
  traducción de respuestas al núcleo universal (fuentes, oportunidades,
  reglas con aprobación).
- `verticalConnector.service.ts` (nuevo, fase 2): alta de conectores,
  ingesta de acontecimientos, emisión de `OrganicOpportunity`
  (`sourceKind: vertical_event`).
- `organicGoogleIntegration.service.ts`: OAuth, discovery y sincronización de
  Search Console; corregir redirección del callback.
- `organicGoogleIngest.service.ts` (nuevo, fase 1): ingesta de GA4 (sesiones
  orgánicas por página y día, con el tráfico de pago descartado en el mapeo) y
  del Perfil de Empresa (vistas de ficha, llamadas, clics al sitio y reseñas sin
  responder como `OrganicOpportunity`).
- `organicLeadOrigin.service.ts` (nuevo): de dónde vino un lead en concreto,
  derivado de `AcquisitionEvent`. Lo consume la ficha de lead.
- `organicRecommendation.service.ts` (nuevo): diagnósticos, prioridad
  económica, dispatch y evaluación de maduración.
- `organicAutonomy.service.ts` (nuevo, fase 4): catálogo cerrado de §9 con su
  ejecutor, guardarraíles, modo sombra, aprobación con un clic y pasada
  automática. El freno de emergencia lo **lee** de `AdOptimizationPolicy`; la
  degradación automática vive en `adRuleAutonomy.service.ts`, extendido para
  distinguir reglas orgánicas de reglas de Ads.
- `metricoolSync.service.ts`: persistir `SocialPostRecord` en
  `createDraftPost`.
- `prospecting.service.ts`: agregado por lote de importación.
- Jobs, respetando el orden y las latencias:

```text
integrations-sync (SC/GA4/GBP/Metricool) + vertical-events-poll
    → channel-snapshot-build → organic-diagnosis-run
    → recommendation-refresh → action-maturity-check
    → autonomy-guardrails-enforce → organic-autonomy-pass
```

La degradación va **antes** que la pasada de autonomía: al revés, la pasada
actuaría con el nivel de ayer sobre los datos de hoy.

## 13. Criterios de aceptación

La primera versión del centro de mando está terminada cuando:

- un negocio nuevo completa el onboarding adaptativo: formulario universal →
  sector detectado con confianza y corregible (múltiples sectores) → módulo
  vertical cargado → vista previa viva → pantalla final con el resumen de
  acontecimientos, formatos y aprobaciones configurados;
- las respuestas del onboarding quedan traducidas al núcleo universal
  (fuente → acontecimiento → regla → pieza → resultado) y son visibles y
  editables después;
- ningún panel de `/organic` se renderiza vacío por un campo que el backend
  no envía: todo lo visible tiene fuente de datos o estado honesto;
- el selector de período cambia realmente los datos;
- el usuario ve qué fuentes miden de verdad y qué desbloquea cada conexión;
- puede seguir un lead desde keyword, post, ficha, prospección o
  acontecimiento vertical hasta llamada, cualificación y venta;
- el embudo unificado muestra la señal más profunda elegible por canal;
- el ranking distingue el canal que trae tráfico del canal que trae
  compradores, con horas invertidas al lado;
- cada recomendación explica datos, causa, confianza, impacto estimado y se
  ejecuta en su brazo con el contexto cargado, nunca desde el centro de mando;
- las acciones despachadas se evalúan al madurar y el resultado aparece en el
  informe semanal;
- las latencias orgánicas se respetan: ninguna pieza se penaliza antes de su
  ventana de maduración;
- el contenido público nuevo requiere siempre aprobación humana; la
  aprobación automática solo existe donde el onboarding la autorizó y dentro
  de la frontera de §9;
- no se muestran datos demo ni ceros que oculten una integración incompleta.

El orden de construcción es, por tanto:

```text
honestidad → onboarding adaptativo → medición por canal → embudo unificado
    → diagnóstico y prioridad → despacho con contexto → conectores reales
    → bucle de resultados → aprendizaje progresivo → autonomía limitada
```

## 14. Estado y pendiente

Estado a 6 de agosto de 2026. Las fases 0 y 1 están cerradas; la 4 entregada
salvo dos tipos de acción sin ejecución. Esta sección existe para poder retomar
el trabajo sin el contexto de la conversación en que se construyó.

### Lo que ya funciona

| Fase | Estado | Qué quedó construido |
|---|---|---|
| 0 — Honestidad | **Completa** | Contrato §7.1 reescrito, `period`/`projectId` filtran de verdad, callback OAuth corregido a `/organic`, banda de integridad con sus fuentes reales, normalizador sin inventar campos, paneles ficticios retirados, y `/seo` leyendo `SeoReport` del backend en vez de `localStorage` |
| 1 — Onboarding y medición | **Completa** | Onboarding adaptativo completo (pantallas 1–3, núcleo universal, vista previa viva, pantalla final), cuatro módulos verticales, `OrganicChannelSnapshot`, embudo unificado, informe semanal narrado, **ingesta de GA4 y del Perfil de Empresa** con presencia y visitas reales |
| 2 — Diagnosticar y priorizar | Parcial | Los tres diagnósticos del MVP, ranking por canal y por pieza con horas, cola priorizada con las tres corrientes, despacho con contexto, infraestructura de `VerticalConnector` |
| 3 — Cerrar el bucle | Parcial | `OrganicAction` medible con ventana de maduración por brazo, evaluación automática al madurar, aprendizaje de los descartes con ventana de silencio por asunto |
| 4 — Autonomía limitada | Parcial | Sala de autonomía completa: catálogo cerrado de §9, ocho guardarraíles, modo sombra, N2 con aprobación de un clic, N3 automático, kill switch compartido con Ads, degradación automática y promoción por tipo de acción. Cuatro de los seis tipos de §9 tienen ejecución real |

Decisiones tomadas que conviene respetar:

- **Los módulos verticales son datos**, en `backend/src/data/verticalModules.ts`.
  Ni el servicio ni la pantalla conocen ningún sector. Añadir uno es escribir un
  objeto. Los cuatro actuales son gimnasio, clínicas, deporte e inmobiliaria;
  los dos primeros se eligieron porque son los que el producto ya persigue
  (`prisma/seed.ts` siembra el `AdPlaybook` de gimnasio y el wizard de Ads
  ofrece clínicas).
- **No hay motor de decisiones paralelo** (§10). El orgánico reutiliza
  `AdDecision` con `channel`, `dispatchArm`, `dispatchContext`,
  `estimatedHours` y `priorityScore`. Una sola auditoría, un solo kill switch.
- **El registro de posts no se duplicó.** El documento pedía un
  `SocialPostRecord`; se reutiliza `ContentPiece` del motor de contenido, que ya
  tiene canal, campaña, `utmContent` y `externalDraftId`. El ranking por pieza
  se apoya en `ContentPiece.utmContent` ↔ `AcquisitionEvent.content`.
- **El tráfico pagado se excluye del embudo orgánico.** Un lead que tuvo
  cualquier toque pagado no cuenta como orgánico aunque después llegara por
  búsqueda: atribuírselo sería quitárselo a Ads.
- **Minutos por formato acordados** (`backend/src/data/effortEstimates.ts`):
  post 20 · carrusel 45 · story 10 · artículo 120 · landing 180 · guion de Reel
  40 · lote de prospección de 50 → 30 · arreglo SEO 25. Es una estimación
  declarada, no contabilidad.
- **El kill switch es uno solo y es el de Ads.** La autonomía orgánica *lee*
  `AdOptimizationPolicy.killSwitchEnabled`; no existe un segundo botón de parada.
  Con el freno echado no se ejecuta nada, no se sube de nivel, no se sale de
  sombra y las reglas por encima de N1 se degradan en la siguiente pasada. El
  aviso de `ads.md` §10 sobre las dos políticas que conviven sigue vigente para
  landings, que mantiene la suya.
- **La autonomía tampoco tiene motor propio.** Una acción autónoma es una
  `AdDecision` con `diagnosis: autonomy:<kind>` y su `AdAction`, igual que en
  Ads. El nivel por tipo vive en `AdRuleAutonomy` con la clave
  `organic_autonomy_<kind>`, así que la promoción se gana con el mismo historial
  y la degradación usa el mismo mecanismo. Se añadió el estado `blocked` a
  `AdDecision` y `AdAction` acepta los tipos orgánicos.
- **Las decisiones de autonomía no entran en la cola de recomendaciones.** Una
  re-sincronización no se "despacha a un brazo" ni se prioriza por impacto
  económico: tiene su propia sala. `listOrganicRecommendations` las excluye por
  el prefijo del diagnóstico, y el contador diario de cambios de Ads dejó de
  contar acciones orgánicas.
- **La reparación no se degrada por la avería que repara.** Re-sincronizar y
  re-auditar están marcadas como `repairsData`: se libran del guardarraíl de
  datos obsoletos y de la degradación por la misma razón. Degradar la
  re-sincronización cuando los datos están viejos garantiza que sigan viejos
  hasta que alguien lo note a mano, que es justo lo que la fase 4 venía a
  evitar. Siguen bloqueadas si la integridad es `unreliable` o si hay freno.
- **La lista de contenido sensible es única**
  (`backend/src/lib/sensitiveContent.ts`). §9 y `landings.md` §10 trazan la misma
  frontera y dos copias se separan en cuanto alguien arregla una;
  `landingAutonomy.service.ts` la reexporta para no romper a quien la importaba
  de allí.
- **El refresco de artículo se verifica después de hacerlo.** §9 lo delega "sin
  cambiar sus afirmaciones" y el modelo puede incumplirlo, así que se comparan
  las afirmaciones sensibles de antes y después: si aparece alguna nueva se
  restaura el texto anterior y la acción queda como fallida. Es la única lectura
  comprobable de esa condición.
- **Una pieza de conector no inventa una línea.** `renderConfirmedEventPiece`
  solo reordena los campos escalares que llegaron del conector, y la pieza nace
  como borrador: N3 genera, publicar sigue siendo de una persona. Además exige
  tres condiciones a la vez —regla en `auto`, acontecimiento no sensible y
  formato con tres aprobaciones humanas acumuladas—; falla una y vuelve a la
  sala de aprobación.
- **Lo ingerido de Google se guarda por día, no por período**
  (`OrganicTrafficDaily`). El snapshot de canal se reconstruye entero cada hora:
  si las visitas vivieran solo allí, cada reconstrucción las borraría hasta la
  siguiente sincronización — el mismo agujero que ya obligó a aplicar las horas
  en un paso aparte. Con el diario, cualquier ventana se recalcula sumando y sin
  volver a pedirle nada a Google, y `buildChannelSnapshots` las lee **dentro**
  de la reconstrucción para que no exista el orden frágil.
- **El tráfico de pago se descarta al ingerir, no después.** GA4 mezcla en la
  misma propiedad las sesiones de anuncios y las orgánicas: la lista blanca de
  `channelFromGa4Group` decide, y una agrupación nueva de Google entra como
  `unattributed`, nunca como orgánica por descuido.
- **Directo y referencia no se reparten.** Van a `unattributed`, igual que los
  leads sin UTM (§8).
- **Una reseña sin responder es un acontecimiento**, así que entra como
  `OrganicOpportunity` del canal `gbp` y no como una pantalla nueva. Nunca se
  guarda el texto literal de la reseña: es contenido de una persona
  identificable y las evidencias van agregadas (§8).
- **El origen orgánico del lead se resuelve, no se guarda.**
  `organicLeadOrigin.service.ts` lo deriva de `AcquisitionEvent`, que sigue
  siendo el hub único: un toque pagado gana siempre, y lo que no se puede
  nombrar se declara "origen orgánico no identificado" con el motivo.

### Lo que se construyó en la fase 4

La sala vive en `/organic` (`src/components/organic/OrganicAutonomy.jsx`) y
enseña, en este orden: el nivel concedido y si sigue en sombra, el estado del
freno compartido, los guardarraíles vigentes con su lectura de hoy, el catálogo
entero de §9 con el nivel efectivo de cada tipo y qué le falta para subir, y las
decisiones recientes con **todos** los guardarraíles evaluados, no solo el que
bloqueó.

Los ocho guardarraíles que evalúa cada acción, en orden:

```text
kind_allowed → kill_switch → data_quality → attribution_coverage
    → max_actions_per_day → cooldown → content_not_sensitive
    → executor_available
```

Qué ejecuta de verdad cada tipo de §9 hoy:

| Tipo | Estado |
|---|---|
| `resync_source` | Ejecuta: re-sincroniza 30 días de la fuente que toque — Search Console, Analytics o el Perfil de Empresa —, una propuesta por fuente. Necesita una cuenta de Google real conectada, así que fallará con error declarado hasta que la haya |
| `reaudit_seo` | Ejecuta: repite la auditoría técnica con `skipAi` y la guarda. Un LLM aquí convertiría una comprobación en contenido nuevo |
| `refresh_article` | Ejecuta con verificación posterior y reversión si introduce afirmaciones |
| `vertical_event_piece` | Ejecuta: crea el `OrganicAsset` en borrador con los datos confirmados |
| `reschedule_post` | **Sin ejecución.** `metricoolSync.service.ts` solo sabe crear borradores y `ContentPiece` no guarda fecha de programación: falta la llamada de actualización de Metricool |
| `reply_review` | **Sin ejecución.** Las reseñas sin responder ya se leen y entran como oportunidades; publicar la respuesta exige escribir en la API v4 restringida de Google y un catálogo de plantillas aprobadas que no existe |

Los dos sin ejecución aparecen igualmente en la sala, marcados y con el motivo:
un hueco silencioso se lee como "esto ya funciona".

### Lo que se construyó después, cerrando las fases 0 y 1

- **`/seo` dejó de depender de `localStorage`.** El informe se persistía en
  `SeoReport` desde el primer día y nadie lo leía: el mismo negocio veía cosas
  distintas en dos ordenadores y el trabajo se perdía al limpiar el navegador.
  Se añadieron `GET /api/seo/reports/latest` y `GET /api/seo/reports/:id`, y la
  pantalla arranca con el último informe guardado y deja volver a uno anterior.
- **La ficha de lead dice de dónde vino, en concreto.** Keyword, pieza, ficha,
  lote de prospección o acontecimiento vertical, resuelto desde
  `AcquisitionEvent`. Un toque pagado gana siempre.
- **GA4 y el Perfil de Empresa se ingieren.** Sesiones orgánicas por página y
  día, vistas de ficha, llamadas y clics al sitio, y las reseñas sin responder
  como oportunidades. "Presencia" y "Visitas" del embudo dejaron de ser `null`
  por falta de código y pasaron a ser `null` solo mientras no haya datos.

De propina, tres defectos reales que aparecieron por el camino y quedaron
arreglados: `OrganicLeadsPage.jsx` usaba `apiFetch` sin importarlo, así que la
primera llamada lanzaba un `ReferenceError` y **toda la pantalla caía al estado
de error** en cuanto había proyecto; y la banda de integridad seguía diciendo
que los conectores verticales "llegan en la fase 2" mucho después de que la
fase 2 los construyera — ahora enseña una fila por conector con su estado real.
Y el botón "Sincronizar" de GA4 y del Perfil de Empresa llamaba a `discover`,
que solo vuelve a listar propiedades: parecía una sincronización y no traía ni
un dato.

### Lo que falta

**De las fases 0 y 1**

- Nada. Las dos están cerradas.
- La ingesta de GA4 y del Perfil de Empresa **está escrita y probada en todo lo
  que no exige a Google**, pero no se ha ejecutado ni una vez contra la
  plataforma: hace falta una cuenta real conectada. Lo que se probó: el mapeo de
  agrupaciones de canal, el plegado de las series temporales de Google, la
  agregación por canal y por página, la supervivencia del dato al reconstruir el
  snapshot y los caminos de rechazo (sin conectar, sin recurso elegido, con
  error registrado). Lo que queda por comprobar contra Google es la forma exacta
  de sus respuestas.
- **Las reseñas del Perfil de Empresa dependen de la API v4 restringida.** Se
  leen si Google concede el acceso; si lo rechaza, la sincronización de métricas
  no se rompe y se declara `reviews.status: 'unavailable'` con el motivo.

**De la fase 2**

- **Ningún acontecimiento vertical real ha entrado.** La infraestructura está
  construida y probada en sus caminos de rechazo (firma inválida, evento sin
  regla, reintento duplicado), pero hasta que un cliente apunte su sistema al
  webhook no hay datos propios. Endpoint:
  `POST /api/organic/connectors/:id/events` con la firma HMAC-SHA256 del cuerpo
  en la cabecera `X-Vendrava-Signature`.
- **Formulario conversacional por voz** (§4.7), aplazado por acuerdo. Configurar
  el onboarding hablando, sobre el stack STT/TTS propio.

**De la fase 3**

- **Detección progresiva** (§4.8) y nivel 3 de personalización: que Vendrava
  proponga reglas nuevas al observar el comportamiento — *"publicas resultados
  los domingos, ¿creamos un resumen semanal cada lunes?"*. Necesita histórico
  real de publicaciones para tener algo que observar, así que depende de que el
  motor de contenido lleve tiempo produciendo.

**De la fase 4**

- **Reprogramar un post y responder reseñas**, los dos tipos de §9 sin ejecución.
  El primero necesita una llamada de actualización de borradores en Metricool
  —hoy solo se sabe crearlos— y una fecha de programación que `ContentPiece` no
  guarda; el segundo, la ingesta de la ficha de Google de la fase 1.
- **Ninguna organización ha salido de N1 todavía.** El estado por defecto es N1
  con sombra y así se queda hasta que alguien conceda el nivel a mano: es lo que
  el documento pide, pero significa que el camino N3-en-vivo solo se ha
  ejercitado en pruebas, no en producción.
- **La promoción real está por estrenar.** Los umbrales heredados de `ads.md`
  §10.1 (5 observaciones, 3 aprobadas, tasa de rechazo ≤34 %) no los ha cruzado
  ninguna acción orgánica todavía porque no hay historial.
- **Publicar una pieza sigue sin camino auditado.** N3 genera el `OrganicAsset`
  de un acontecimiento confirmado, pero no lo publica: no existe una ruta de
  publicación con registro y compensación, y §9 no permite improvisarla.

### Criterios de aceptación

Los quince criterios de la §13 están cubiertos por código. Dos siguen
dependiendo de datos que solo llegan con cuentas reales conectadas:

- *"puede seguir un lead desde keyword, post, ficha, prospección o
  acontecimiento vertical hasta llamada, cualificación y venta"* — la ficha de
  lead resuelve el origen concreto desde `AcquisitionEvent`
  (`organicLeadOrigin.service.ts`). Nombra la keyword cuando viaja el
  `utm_term`, la pieza cuando viaja su UTM propio, el sector y la ciudad del
  lote de prospección y el acontecimiento vertical por su oportunidad. Cuando no
  puede nombrarlo lo dice y explica qué falta.
- *"el embudo unificado muestra la señal más profunda elegible por canal"* —
  se cumple, y "presencia" y "visitas" ya tienen fuente: consultas de Search
  Console y vistas de ficha para la presencia, sesiones de GA4 para las visitas.
  Seguirán diciendo *sin medición* hasta la primera sincronización real, que es
  lo correcto.

### Notas prácticas

- La suite de backend corre con `node scripts/run-tests.mjs` sobre la base
  `vozia_test`. **Quien cambie el esquema debe hacer `prisma db push` contra esa
  base**, o los tests fallan con errores de columna inexistente que no tienen
  nada que ver con el cambio.
- Hay datos de desarrollo sembrados: `npm run db:seed:ads` crea el circuito de
  Ads; el tráfico orgánico de prueba (61 leads en cuatro canales) se creó a mano
  con ids prefijados `vendrava-org-`.
- El motor de contenido (`ContentOpportunity`, `ContentPiece`,
  `contentStudio.service.ts`) lo construye otra línea de trabajo. El orgánico lo
  **lee**, no lo reimplementa. Antes de tocarlo, coordinarse. La fase 4 lo lee
  en un sitio más: cuántas piezas de un formato ha aprobado una persona, que es
  lo que convierte "formato previamente aprobado" de §9 en un número.
- La sala de autonomía tiene su job diario en
  `backend/src/jobs/organicAutonomyPass.ts`, registrado en `worker.ts`. Con
  `BACKGROUND_WORKERS_ENABLED` apagado no corre; el botón "Revisar ahora" de la
  pantalla hace exactamente lo mismo a mano.
