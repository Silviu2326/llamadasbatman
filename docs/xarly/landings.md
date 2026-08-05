# Xarly Landings — especificación de la página y del optimizador

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

### 3.2 Sesión y visitante

- **Visitante**: identificador anónimo generado en la primera visita
  (cookie de origen propio); sin cookie se genera uno nuevo — un borrado de
  cookies cuenta como visitante nuevo y se asume esa imprecisión.
- **Sesión**: empieza en la primera vista; expira a los 30 minutos de
  inactividad. Una recarga dentro de la sesión no es una visita nueva.
- **Asignación de variante**: por visitante, persistente mientras exista la
  cookie y el experimento siga activo.
- **Exclusiones**: bots (user-agent + heurística), previsualizadores de
  redes sociales y mensajería, y tráfico interno (IPs/usuarios de la propia
  organización marcados).

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
  cuando se evalúa la versión principal;
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
> abandonaron en él. Xarly recomienda hacerlo opcional. Impacto estimado:
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
5. ¿Qué recomienda Xarly y por qué?

### 5.1 Atención requerida (arriba, antes del listado)

Tres o cuatro tarjetas máximo. El usuario no revisa veinte filas para
descubrir qué pasa; Xarly le dice dónde actuar primero:

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
  (servicios compartidos con Xarly orgánico).
- Una **variante** siempre nace con justificación escrita ("el ángulo
  'rapidez' gana en ads; esta variante lo lleva al hero"), nunca como cambio
  cosmético sin hipótesis.
- Prueba social solo desde clientes ganados con `ContactConsent` y
  aprobación expresa en la sala de aprobación.

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

Para diagnosticar, Xarly compara además:

```text
ángulo etiquetado del anuncio · promesa principal del anuncio ·
texto del hero de la landing · oferta · CTA · segmento objetivo
```

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

### Fase 1 — Medir

- Contratos §3 (identidad/versión, sesión/visitante, tres capas, línea base)
  — bloqueantes.
- Telemetría §7 + embudo económico reutilizando la tubería
  UTM/`AcquisitionEvent` de Xarly.
- Migrar webs externas al backend con los tres estados de medición.
- Banda de integridad y reglas `null` ≠ `0` en la página.

### Fase 2 — Diagnosticar

- Línea base por landing/canal y los tres diagnósticos N1 del MVP, con
  impacto estimado, confianza y prioridad económica.
- "Atención requerida" + ranking económico + detalle con mapa de caída.
- Conexión con `ads.md`: el diagnóstico "anuncio correcto, landing
  deficiente" abre esta página con el contexto cargado.

### Fase 3 — Variar y experimentar

- Generación de variantes con justificación (servicios de Xarly:
  oportunidades, voz del dueño, especificidad).
- A/B server-side (§9) con promoción N1/N2 y estados de ciclo de vida.
- FAQ viva y prueba social automática con consentimiento.

### Fase 4 — Autonomía

- N3 con modo sombra, guardarraíles §10 y `AuditLog`.
- Informe por landing en euros: "X cualificados, CAC Y, mejor variante Z".

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
