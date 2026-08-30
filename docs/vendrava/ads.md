# Vendrava Ads — especificación de la página y del optimizador

Este documento es la instrucción de producto para construir y evolucionar la
página de Ads. La página no debe convertirse en otro panel de métricas de Meta
ni en un simple wizard que publica campañas.

> **Vendrava Ads no optimiza anuncios. Optimiza compradores.**

La tesis es el circuito cerrado:

```text
anuncio → landing → lead → llamada IA → lead cualificado → oportunidad → venta
       ↘ métricas de Meta          ↗ señal económica y aprendizaje de Vendrava
```

Meta sabe quién hizo clic o rellenó un formulario. Vendrava debe saber quién
habló, quién estaba cualificado y quién compró. Las métricas de Meta son una
señal rápida; la cualificación y la venta son la señal profunda que decide si
una campaña merece más presupuesto.

## 1. Alcance de esta especificación

La experiencia se reparte entre las pantallas que ya existen:

| Pantalla | Responsabilidad |
|---|---|
| `/ads` (`AdsPage`) | Centro de control: salud de los datos, embudo, diagnóstico, recomendación y resultados económicos. |
| `/captacion/nueva` (`AdsWizardPage`) | Crear el borrador de campaña y sus assets. No contiene el motor de optimización. |
| `/captacion/conectar` (`MetaAccountPage`) | Conectar Meta, validar permisos/activos, configurar límites y consentimiento. |
| `/campanas/:id` (`CampaignDetailPage`) | Detalle de una campaña, sus anuncios, atribución, decisiones y acciones. |

La página `/ads` es el entregable principal de este documento. El wizard y la
conexión se modifican solo cuando sea necesario para que el circuito de Ads
sea trazable de principio a fin.

## 2. Qué existe hoy y qué debe cambiar

`AdsPage` ya tiene una base válida que se conserva:

- carga `GET /api/ads/overview`;
- muestra conexión de Meta, campañas, gasto, CPL, CTR y leads;
- permite publicar, activar, pausar y sincronizar el estado remoto;
- muestra histórico de gasto/leads y una recomendación básica de CPL;
- enlaza con el wizard, la cuenta de Meta y el detalle de campaña.

La evolución requerida es convertir esa vista en un centro de decisiones de
Vendrava. En particular:

- el KPI principal deja de ser el CPL y pasa a ser el avance hacia comprador;
- el panel de recomendación explica una decisión con evidencia y confianza;
- se añaden cualificados, oportunidades, ventas, CPQL, CAC y ROAS real cuando
  existan datos suficientes;
- se separan señales rápidas de resultados de cohortes maduras;
- se muestra la calidad de los datos antes de pedir confianza en una acción;
- las acciones pasan por política, modo sombra, aprobación y auditoría;
- ningún dato desconocido se presenta como `0` ni como resultado negativo.

## 3. El MVP que hay que demostrar

Construir primero un único recorrido perfecto:

```text
Anuncio Meta → landing Vendrava → lead → llamada IA → cualificación → venta
```

La página debe poder explicar un caso como este:

> Meta considera ganadora la campaña A porque consigue leads a 12 €. Vendrava
> recomienda la B porque, aunque sus leads cuestan 19 €, genera cualificados a
> 38 €, tres ventas y un CAC de 126 €.

Si todavía no hay ventas o cohortes maduras, la pantalla debe decirlo con
claridad: “Aún no hay suficiente señal de ventas para comparar CAC. Estamos
observando cualificación y oportunidades”. No debe fabricar un ROAS ni
penalizar anuncios por cierres que todavía no podían haber ocurrido.

El MVP solo necesita tres diagnósticos accionables:

1. **Gasto sin leads cualificados.** Hay gasto y leads, pero la señal profunda
   no avanza o el porcentaje de cualificación es anormalmente bajo.
2. **Fatiga creativa.** La frecuencia sube, el CTR o la tasa de clic cae y la
   tendencia empeora frente a la propia línea base.
3. **Anuncio correcto, landing deficiente.** El anuncio obtiene clics y leads
   en proporción razonable, pero la landing convierte por debajo de su línea
   base o de campañas comparables.

Los tres diagnósticos empiezan en N1: Vendrava recomienda y explica; la persona
decide. La generación automática de nuevas variantes puede esperar.

## 4. Diseño de `/ads`

La página debe responder, en este orden, a cinco preguntas:

1. ¿Puedo confiar en los datos?
2. ¿Qué está pasando ahora?
3. ¿Qué campaña genera compradores, no solo leads?
4. ¿Qué recomienda Vendrava y por qué?
5. ¿Qué puedo aprobar, pausar o revisar?

### 4.1 Cabecera y estado de conexión

Conservar la cabecera actual con título `Ads`, botón `Actualizar` y botón
`Nueva campaña`. Debajo debe aparecer una banda de estado con:

- cuenta de Meta conectada y cuenta publicitaria seleccionada;
- estado de token y permisos reales;
- página, pixel y activos disponibles;
- última sincronización de Insights;
- última señal enviada a Conversions API;
- enlace `Gestionar cuenta` o `Conectar Meta`.

La conexión visual no equivale a una conexión válida. Si el token existe pero
no permite leer Insights, recibir leads o enviar CAPI, la banda debe mostrar
`Conectado con incidencias` y la acción concreta para resolverlo.

### 4.2 Banda de integridad de datos

Antes de los KPI debe existir un estado visible de calidad. Como mínimo:

| Comprobación | Estado que debe mostrar |
|---|---|
| Permisos y activos de Meta | válido / incompleto / revocado |
| Identificadores | campaña, ad set, anuncio, clic, lead, llamada y oportunidad enlazables |
| Frescura | fecha del último snapshot y retraso actual |
| Atribución | porcentaje de leads con campaña y anuncio identificables |
| Duplicados | eventos descartados y tasa de duplicación |
| Consentimiento | cobertura y retiradas pendientes |
| CAPI | preparado / enviando / con errores |
| Moneda y zona horaria | configuración usada para calcular resultados |

Estados recomendados:

- **Datos listos:** se pueden usar métricas y recomendaciones.
- **Datos parciales:** se muestran resultados, pero se limita la confianza y
  se explica qué falta.
- **Datos obsoletos:** se bloquean decisiones automáticas; se permite
  actualizar.
- **Datos no fiables:** se bloquean N2/N3 hasta reparar la integridad.

Un snapshot es una observación, no la verdad definitiva. Una venta puede
aparecer semanas después y debe actualizar la atribución de la cohorte sin
reescribir el histórico de lo que Vendrava sabía en cada momento.

### 4.3 Resumen superior

Mostrar cuatro tarjetas, siempre con período y frescura:

1. **Gasto** — gasto atribuido de Meta.
2. **Cualificados** — leads con resultado de llamada válido (definición exacta
   en la §4.4).
3. **CAC / CPQL** — elegir la métrica más profunda disponible; si no hay
   ventas maduras, mostrar CPQL o CPL con una explicación.
4. **Compradores / ROAS real** — ventas atribuidas y valor ganado, solo cuando
   la cobertura y la madurez sean suficientes.

El CTR, frecuencia, impresiones, clics y CPL siguen visibles, pero como
señales diagnósticas, no como objetivo de negocio. En la primera versión se
puede conservar `Campañas activas` como quinta métrica si el layout lo permite.

Regla de presentación: `null` significa “sin medición”; `0` significa que se
midió y el resultado fue cero. No son intercambiables.

### 4.4 Embudo económico

Añadir una tarjeta de embudo con esta secuencia:

```text
clic → lead → lead cualificado → oportunidad → venta
```

Cada paso muestra volumen, tasa al paso siguiente, cobertura de atribución y
período. La tarjeta debe indicar cuál es la **señal más profunda elegible**
para optimizar en ese momento.

#### Definición de cada paso

Sin esto, “resultado de llamada válido” lo interpreta cada servicio a su
manera. El vocabulario cerrado vive en `backend/src/lib/callOutcome.ts` y su
espejo `src/lib/callOutcome.js`; ambos ficheros cambian a la vez.

| Paso | Definición exacta | Origen |
|---|---|---|
| **Clic** | `AdInsightSnapshot.clicks` | Meta Insights |
| **Lead** | `Lead` con `campaignId` de la campaña | `Lead.campaignId` |
| **Contactado** | Lead con ≥1 `Call` cuyo resultado indique que hubo conversación con una persona | `isHumanConversation()` |
| **Lead cualificado** | Lead con ≥1 `Call` con `outcome ∈ {meeting_scheduled, callback_requested, interested}` | `isQualifyingOutcome()` |
| **Oportunidad** | Existe `Opportunity` para ese lead, **en cualquier etapa** | `Opportunity.leadId` |
| **Venta** | `Opportunity.stage = 'closed_won'` | `OpportunityStage` |
| **Valor** | `Opportunity.value` con `Opportunity.currency`; si es `null`, el ROAS es `null` | — |

Precisiones que evitan métricas falsas:

- **Se cuenta por lead, no por llamada.** Un lead con tres llamadas es *un*
  cualificado. Contar llamadas hunde artificialmente el CPQL en campañas con
  muchos reintentos.
- **`callback_requested` significa “transferido a una persona”**, no “llámame
  luego” (ver `voice/telephony/mediaStream.ts`, `requestTransfer`). El nombre
  es heredado y engañoso, pero la señal es fuerte: el lead pidió hablar con
  alguien del equipo.
- **El paso “contactado” es obligatorio para diagnosticar.** Una campaña cuyos
  leads solo alcanzan buzones de voz no tiene un problema de anuncio, tiene un
  problema de contactabilidad, y la recomendación debe decir eso.
- **La oportunidad incluye las perdidas.** Si el denominador solo contase las
  ganadas, la tasa oportunidad→venta sería siempre 100 %.
- **Una venta sin importe no es una venta de 0 €.** `Opportunity.value` nulo
  produce `null` en ROAS, coherente con la regla de la §4.3.

`VoiceCallEvaluation.overall` **no** se usa para cualificar. Sus dimensiones
(`turnTaking`, `voiceNaturalness`, `discovery`, `objectionHandling`,
`compliance`, `crmAccuracy`) miden lo bien que condujo la llamada el agente de
IA, no la intención de compra del lead: una llamada de 100/100 puede ser una
conversación impecable con alguien que no comprará jamás. Su uso correcto está
en el diagnóstico “gasto sin cualificados”, para separar un problema de
audiencia de un problema de agente.

`Lead.status = 'qualified'` tampoco sirve como señal: nada lo marca
automáticamente, solo una edición manual o una regla de automatización que el
cliente puede no haber configurado.

#### Elegibilidad de la señal

La elegibilidad no se decide solo con “20 leads al mes”. Se calcula con:

- volumen de eventos;
- porcentaje atribuible;
- madurez de la cohorte;
- estabilidad de la tasa de conversión;
- latencia media entre pasos;
- confianza estadística mínima definida por la política.

Si hay pocas ventas, Meta puede seguir optimizando a lead mientras Vendrava usa
cualificación y ventas para diagnosticar y recomendar. La UI debe mostrar
ambas cosas: `Meta optimiza a: Lead` y `Vendrava evalúa hasta: Venta`.

Meta puede limitar el aprendizaje de un conjunto cuando no alcanza el volumen
de eventos de optimización que necesita semanalmente. Esto debe tratarse como
una restricción de entrega, no como prueba de que una campaña es mala.

### 4.5 Rendimiento por campaña, ad set y anuncio

La tabla de campañas actual debe evolucionar para incluir, cuando existan:

| Columna | Propósito |
|---|---|
| Campaña / anuncio | Identidad y estado remoto de Meta. |
| Gasto | Coste del período y presupuesto consumido. |
| Clics / leads | Señal rápida y CPL. |
| Cualificados | Calidad real de los leads. |
| Oportunidades / ventas | Señal económica profunda. |
| CPQL / CAC / ROAS | Coste y valor en la cohorte madura. |
| Tendencia | Mejora, estable, empeora o datos obsoletos. |
| Acción | Sin acción, recomendación pendiente, en sombra, aprobada o ejecutada. |

Filtros mínimos: `Todas`, `Necesitan atención`, `En observación`, `Con ventas`,
`Modo sombra` y `Datos incompletos`.

La fila seleccionada abre el inspector lateral o el detalle de campaña y debe
mostrar:

- qué señal provocó la atención;
- período y cohortes utilizados;
- métricas observadas frente a la línea base;
- causa probable y causas descartadas;
- recomendación concreta;
- confianza y motivo de la confianza;
- nivel de autonomía permitido;
- botón de aprobar, rechazar, poner en sombra, ejecutar o parar;
- enlace a evidencias y al log de auditoría.

### 4.6 Panel “Qué recomienda Vendrava”

Sustituir la recomendación genérica de “proteger el CPL” por una tarjeta de
decisión con esta anatomía:

```text
┌──────────────────────────────────────────────────────────┐
│ PRIORIDAD: revisar gasto sin cualificados                │
│ La campaña B tiene 19 €/lead, pero 38 €/cualificado.    │
│ La campaña A tiene 12 €/lead y 74 €/cualificado.        │
│                                                          │
│ Evidencia: 42 leads · 11 llamadas evaluadas · 6 días    │
│ Cohorte: madura  |  Confianza: media                    │
│                                                          │
│ [Ver evidencia] [Aprobar recomendación] [Rechazar]      │
└──────────────────────────────────────────────────────────┘
```

La explicación debe contestar `qué`, `por qué`, `con qué datos`, `qué cambia`,
`qué riesgo tiene` y `cómo se detiene`. Nunca debe decir que una acción
“habría ahorrado” dinero como hecho observado.

### 4.7 Circuito rápido y circuito lento

La pantalla debe separar visualmente dos lecturas:

**Ahora — cada 3–6 horas**

- gasto anormal o por encima del límite;
- anuncio rechazado o cuenta sin sincronizar;
- tracking roto o caída de cobertura;
- CTR, frecuencia, CPM y fatiga;
- leads sin llamada o llamada fallida.

**Resultado — semanal o por cohortes maduras**

- cualificación;
- oportunidades y ventas;
- CPQL, CAC y ROAS real;
- latencia de cierre;
- reparto de presupuesto por rendimiento marginal.

El circuito rápido puede alertar y proteger gasto. El circuito lento es el que
decide si una campaña merece más o menos presupuesto por calidad económica.
Una campaña no se penaliza hoy porque sus compradores suelen tardar diez días
en cerrar.

### 4.8 Informe semanal narrado

En la parte inferior de `/ads`, mostrar un resumen en lenguaje de negocio:

- qué cambió;
- qué campaña produjo la señal más profunda;
- dónde se perdió el embudo;
- qué decisión tomó Vendrava o dejó pendiente;
- qué datos siguen inmaduros;
- qué probar la semana siguiente.

Debe existir desde la Fase 1, aunque todavía no haya autonomía. Es la forma de
demostrar valor antes de permitir que el sistema actúe.

## 5. Estados obligatorios de la página

La página debe tratar cada estado como una experiencia real, no como una tabla
vacía:

| Estado | Comportamiento |
|---|---|
| Cargando | Skeleton o estado de carga; nunca datos demo. |
| Plan sin Ads | Explicar la capacidad y mostrar cómo mejorar el plan. |
| Meta sin conectar | CTA `Conectar Meta`; explicar que no se pueden medir campañas. |
| Conectada sin campañas | CTA `Nueva campaña`; explicar el siguiente paso. |
| Campañas sin snapshots | Mostrar campañas, pero `Sin medición`; CTA `Sincronizar`. |
| Snapshots sin atribución | Mostrar Meta y una alerta de calidad; bloquear recomendaciones profundas. |
| Datos parciales | Mostrar la métrica disponible y la limitación de confianza. |
| Datos maduros | Activar comparación económica y recomendaciones N1. |
| Acción pendiente | Mostrar política, evidencia, expiración y aprobación. |
| Error o permiso revocado | Mensaje concreto y acción de reparación. |

El modo demo no debe inventar campañas ni conversiones. Si no hay datos reales,
la página lo dice.

## 6. Contrato de datos para la página

### 6.1 Respuesta de `GET /api/ads/overview`

Mantener los campos actuales para no romper la página (`campaigns`, `series`,
`summary`, `account`, `recommendation`) y ampliarlos con un contrato estable:

```json
{
  "account": {
    "connected": true,
    "status": "connected",
    "metaAdAccountId": "act_123",
    "permissions": { "insights": true, "leads": true, "capi": true },
    "lastValidatedAt": "2026-08-05T09:00:00Z"
  },
  "dataQuality": {
    "status": "partial",
    "lastSnapshotAt": "2026-08-05T08:00:00Z",
    "attributionCoveragePct": 82,
    "duplicateRatePct": 0,
    "consentStatus": "ready",
    "capiStatus": "sending",
    "issues": ["Hay ventas de los últimos 10 días todavía inmaduras"]
  },
  "summary": {
    "fast": { "spendCents": 12000, "clicks": 420, "leads": 10, "cplCents": 1200 },
    "mature": { "qualified": 3, "opportunities": 2, "sales": 1, "cacCents": 12600, "roas": 7.14 },
    "deepestEligibleSignal": "qualified_lead"
  },
  "funnel": [],
  "campaigns": [],
  "recommendation": null,
  "weeklyNarrative": null,
  "policy": { "autonomyLevel": "N1", "mode": "shadow", "killSwitch": "ready" }
}
```

Los importes siempre se transmiten en céntimos, con moneda y zona horaria
explícitas. Las métricas no disponibles deben ser `null`, nunca cero.

### 6.2 Rutas que debe consumir o añadir la UI

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/ads/overview` | Resumen de la página y estado de calidad. |
| GET | `/api/ads/campaigns/:id/insights` | Serie de snapshots y señales rápidas. |
| GET | `/api/ads/campaigns/:id/attribution` | Embudo por anuncio, lead, llamada, oportunidad y venta. |
| GET | `/api/ads/campaigns/:id/decisions` | Decisiones, evidencia, confianza y resultado posterior. |
| POST | `/api/ads/decisions/:id/approve` | Aprobar una recomendación N2. |
| POST | `/api/ads/decisions/:id/reject` | Rechazarla con motivo y feedback. |
| POST | `/api/ads/actions/:id/execute` | Ejecutar una acción aprobada con guardarraíles. |
| POST | `/api/ads/actions/:id/compensate` | Ejecutar la acción compensatoria disponible. |
| POST | `/api/ads/sync` | Solicitar una sincronización manual si la política lo permite. |
| POST | `/api/ads/campaigns/:id/publish` | Publicar el borrador en Meta. |
| POST | `/api/ads/campaigns/:id/activate` | Activar una campaña publicada. |
| POST | `/api/ads/campaigns/:id/pause` | Pausar una campaña o anuncio. |
| GET | `/api/ads/campaigns/:id/remote-status` | Comparar estado local y estado de Meta. |

Las rutas existentes de publicación, activación, pausa, sincronización y límite
de CPL se conservan, pero sus respuestas deben incluir `decisionId`, resultado
remoto, límites aplicados y entrada de auditoría cuando proceda.

## 7. Integridad, atribución y privacidad — Fase 0 obligatoria

Antes de ejecutar el cron o mostrar una recomendación profunda, validar:

1. permisos reales del token y activos conectados;
2. identificadores de cuenta, campaña, ad set, anuncio, clic, lead, llamada y
   oportunidad;
3. deduplicación por evento y reintento idempotente;
4. moneda, zona horaria y ventana de atribución;
5. consentimiento, base jurídica, versión de política y retirada;
6. porcentaje de leads y ventas atribuibles;
7. posibilidad de reprocesar conversiones tardías.

El hilo mínimo que debe conservarse es:

```text
Meta account → campaign → ad set → ad → click/session → lead
            → call → qualification → opportunity → sale
```

`Campaign`, `Lead`, `Call`, `Meeting`, `Opportunity` y `AcquisitionEvent` ya
forman gran parte de este hilo. No crear una cadena paralela que no pueda
abrirse desde la ficha de campaña.

Los emails, teléfonos y otros identificadores enviados a Meta se tratan como
datos seudonimizados: el hash reduce exposición, pero no los convierte en
anónimos. Registrar consentimiento y retirada, limitar el acceso por
organización y no enviar PII al LLM. El envío de señales debe usar únicamente
la vía actual **Conversions API for CRM / Conversions API**; no implementar la
antigua Offline Conversions API.

Referencias: [Meta Conversions API for CRM](https://www.facebook.com/business/help/571704773472628), [cambios en conversiones offline](https://www.facebook.com/business/help/1835755323554976), [Meta Learning Limited](https://www.facebook.com/business/help/269269737396981) y [AEPD sobre anonimización y seudonimización](https://www.aepd.es/prensa-y-comunicacion/blog/anonimizacion-y-seudonimizacion).

## 8. Señal de optimización: elegir la más profunda disponible

La cadena de señales es:

```text
clic → lead → lead cualificado → oportunidad → venta
```

El motor debe seleccionar automáticamente la señal más profunda que cumpla
los requisitos de volumen, cobertura y madurez. Debe guardar el motivo de la
selección en cada decisión.

Ejemplos:

- muchas ventas maduras: comparar CAC y ROAS real;
- pocas ventas, pero suficientes cualificados: comparar CPQL y tasa de
  cualificado a venta;
- pocos cualificados: usar CPL y diagnóstico de calidad;
- sin volumen fiable: solo alertas de integridad y N1, sin redistribución.

La señal devuelta a Meta puede ser `Lead`, `Schedule` o la señal de calidad
que la integración soporte. Vendrava debe conservar cualificación y venta para
diagnóstico aunque Meta no tenga suficiente volumen para optimizar directamente
a ellas.

## 9. Presupuesto desde margen y capacidad

El wizard y las recomendaciones deben pedir o inferir margen, no solo ticket.
Como aproximación inicial:

```text
CAC máximo = margen por venta × porcentaje admisible para adquisición
CPQL máximo = CAC máximo × tasa cualificado→venta
CPL máximo = CPQL máximo × tasa lead→cualificado
```

Las tasas se expresan como decimales. Si no hay suficientes datos propios,
mostrar el cálculo como objetivo provisional y pedir confirmación; no presentarlo
como una verdad histórica.

El límite efectivo también debe considerar:

- presupuesto diario y mensual de la cuenta;
- gasto máximo por campaña y por organización;
- capacidad de llamadas y seguimiento del negocio;
- disponibilidad del equipo para atender nuevos leads;
- rendimiento marginal: coste esperado del siguiente comprador al aumentar el
  presupuesto, no el menor CPQL histórico.

No recomendar aumentar gasto si el negocio no puede atender la demanda.

## 10. Motor de decisiones y autonomía

> **Hoy existen dos políticas de autonomía, no una.** `landings.md` dice que
> estos niveles se especifican aquí y «no se reinventan» allí, pero ads y
> landings se construyeron en paralelo y conviven
> `adPolicy.service.ts` sobre `AdOptimizationPolicy` (`autonomyLevel`,
> `mode: 'shadow'`, kill switch) y `landingAutonomy.service.ts` sobre
> `GovernancePolicy` con la clave `landing_autonomy` (`level`, `shadowMode`).
>
> Las dos arrancan en N1 con modo sombra, así que ninguna organización tiene
> autonomía sin concedérsela. Lo que falta: no hay una vista única de gobierno
> y **el kill switch de aquí no detiene la autonomía de landings**, que es lo
> contrario de lo que espera quien tira de un kill switch. Decisión pendiente
> en `landings.md` §13: una política por organización que ambas superficies
> consulten, o dos declaradas a propósito y visibles juntas.

### 10.1 Niveles

- **N1 — sugerir:** Vendrava calcula, explica y pide una decisión humana.
- **N2 — aprobar:** una persona aprueba una acción concreta y acotada con un
  clic; queda registrada la versión de la política.
- **N3 — canario automático:** solo para reglas demostradas, con presupuesto,
  frecuencia, cooldown, alcance y botón de parada.

La progresión obligatoria es:

```text
modo sombra → recomendaciones humanas → N2 limitado
             → canario automático → N3
```

La promoción exige un número mínimo de decisiones evaluadas y resultados
observados, no simplemente “una semana funcionando”. Si los datos son escasos,
la regla degrada a N1.

### 10.2 Modo sombra

El modo sombra ejecuta la regla sin tocar Meta y guarda:

- qué habría decidido la regla;
- datos y snapshot utilizados;
- versión de la política;
- acción hipotética y alcance;
- qué ocurrió realmente después;
- feedback humano;
- limitaciones de la comparación.

La UI puede decir:

> “La regla habría recomendado pausar el anuncio X tras 84 € de gasto.”

No debe decir “habría ahorrado 84 €”: no sabemos qué habría ocurrido después
de pausar el anuncio.

### 10.3 Guardarraíles y acciones compensables

Toda acción debe validar:

- gasto máximo diario y mensual;
- número máximo de cambios por día;
- mínimo de tiempo entre cambios;
- protección de ad sets en aprendizaje de Meta;
- presupuesto mínimo y máximo por campaña;
- alcance de la acción: anuncio, ad set o campaña;
- kill switch de la organización;
- permisos actuales y estado remoto;
- frescura y calidad de los datos.

Una acción no es simplemente “reversible”. Es **compensable**: se registra
qué se puede restaurar y qué no se puede recuperar, por ejemplo aprendizaje
perdido, impresiones no servidas u oportunidades no captadas.

Cada acción conserva intención, payload enviado, respuesta de Meta, reintentos,
resultado, compensación disponible y auditoría.

## 11. Modelos de dominio

Reutilizar `Campaign`, `MetaAdAccount`, `AdInsightSnapshot`, `Lead`,
`AcquisitionEvent`, `Call`, `VoiceCallEvaluation`, `Meeting`, `Opportunity`,
`Automation`, `AutomationRun`, `ScheduledTrigger`, `OutboxEvent` y `AuditLog`.

Crear entidades específicas de Ads, no esconder toda la lógica en
`Automation.actions`:

| Entidad | Debe conservar |
|---|---|
| `AdOptimizationPolicy` | objetivo, señal elegida, fórmulas, límites, autonomía, cooldown, versión y capacidad operativa. |
| `AdDecision` | diagnóstico, regla/version, datos usados, cohorte, confianza, explicación, recomendación, actor y estado. |
| `AdAction` | intención, alcance, payload, guardarraíles, modo sombra/aprobada/ejecutada y compensación posible. |
| `AdActionResult` | respuesta de Meta, timestamps, reintentos, error, resultado posterior y compensación. |
| `AdExperiment` | hipótesis, variante, asignación, aleatorización, métrica primaria, cohortes y conclusión. |
| `AdConversionSignal` | evento enviado, etapa, identificadores, consentimiento, `eventId`, estado CAPI y deduplicación. |
| `AttributionResult` | cadena de touchpoints, modelo, cobertura, valor, moneda, ventana y revisión tardía. |
| `AdDataQualityStatus` | permisos, frescura, cobertura, duplicados, consentimiento, moneda, zona horaria y bloqueos. |

`AutomationRun` orquesta el flujo, pero no sustituye estos registros. El flujo
debe quedar así:

```text
ingesta → validación → atribución → análisis → decisión
       → aprobación/guardarraíles → acción → resultado → auditoría
```

Todos los modelos deben estar aislados por `orgId`. Los identificadores de Meta
se guardan de forma explícita para que un evento tardío pueda reconciliarse sin
adivinar por nombre de campaña.

## 12. Dos formas de aprender: experimento y bandit

La distribución normal de Meta no es un A/B limpio: Meta entrega más
impresiones a lo que predice que funcionará y eso introduce sesgo.

Implementar dos modos, cuando haya volumen suficiente:

- **Experimento:** división aleatoria predefinida para estimar qué creatividad
  causa mejores resultados.
- **Bandit/torneo:** explotación y exploración; empezar aproximadamente con
  80–90 % para explotar y 10–20 % para explorar, ajustando el porcentaje según
  volumen e incertidumbre.

La pantalla debe indicar qué modo está activo. No llamar “A/B” a una campaña
que solo ha recibido distribución ordinaria de Meta.

## 13. Fases de implementación

### Fase 0 — Conectar y validar

- validar permisos, activos, token, pixel y página;
- definir contrato de identificadores, moneda, zona horaria y atribución;
- registrar consentimiento, retiradas y versión de política;
- deduplicar eventos con `eventId` determinista;
- medir cobertura de atribución y preparar reprocesamiento tardío;
- mostrar `AdDataQualityStatus` en `/ads`.

**Salida:** la pantalla puede afirmar qué datos tiene y qué datos faltan.

### Fase 1 — Observar

- sincronizar Insights cada 3–6 horas y mantener serie temporal;
- cerrar el embudo anuncio → landing → lead → llamada → pipeline;
- detectar problema de anuncio frente a problema de landing;
- implementar los tres diagnósticos del MVP sin ejecutar acciones;
- añadir el informe semanal narrado;
- mostrar el circuito rápido y el circuito lento.

**Salida:** valor visible sin autonomía: “esto está pasando y esta es la causa
probable”.

### Fase 2 — Devolver la señal

- enviar cualificación, cita y venta por la vía actual de Conversions API;
- guardar consentimiento, hash, `eventId`, estado de entrega y deduplicación;
- mostrar salud de CAPI y señal más profunda elegible;
- calcular CPL, CPQL y CAC objetivo desde margen y tasas reales.

**Salida:** Vendrava puede comparar el coste de un lead con el valor de un
comprador.

### Fase 3 — Recomendar

- crear `AdOptimizationPolicy`, `AdDecision` y `AdDataQualityStatus`;
- ejecutar reglas en modo sombra;
- mostrar evidencia, confianza, explicación y limitaciones;
- recoger aprobar/rechazar y motivo humano;
- crear acciones compensables y entradas de `AuditLog`.

**Salida:** N1 útil y medible; ninguna acción automática.

### Fase 4 — Actuar con aprobación

- habilitar N2 para pausa, límite de gasto o ajuste acotado;
- aplicar permisos, guardarraíles, cooldown y kill switch;
- exigir confirmación con alcance, impacto y compensación disponible;
- mostrar resultado remoto y sincronizar después de actuar.

**Salida:** una persona puede aprobar acciones seguras desde `/ads`.

### Fase 5 — Autonomía limitada

- promover solo reglas con suficientes decisiones y resultados observados;
- empezar con canarios y límites pequeños;
- degradar automáticamente a N1 ante datos obsoletos, baja cobertura o error;
- permitir `Parar autonomía` desde la página y desde la cuenta.

**Salida:** N3 limitado a reglas demostradas, nunca por defecto.

### Fase 6 — Experimentar y escalar

- experimentos aleatorizados y bandits;
- variantes de creatividad desde ángulos del Radar de Vendrava;
- reparto por rendimiento marginal;
- propuestas de contenido orgánico ganador para Ads;
- benchmarks agregados por sector cuando exista suficiente volumen.

Google, TikTok, generación automática masiva de creatividades y optimización
multi-plataforma quedan fuera hasta que el circuito de Meta tenga señal
económica fiable.

## 14. Mapa de implementación

### Frontend

- `src/pages/AdsPage.jsx`: composición de la página, estados, filtros,
  embudo, calidad de datos, recomendación, informe y acciones.
- `src/pages/AdsWizardPage.jsx`: crear campaña; recoger margen, tasas o
  confirmación de objetivos cuando falten.
- `src/pages/MetaAccountPage.jsx`: permisos, activos, límites, consentimiento,
  estado de CAPI y kill switch.
- `src/pages/CampaignDetailPage.jsx`: detalle de atribución, decisiones,
  experimentos y auditoría.
- `src/pages/ads.css` y `src/pages/ads-creative.css`: mantener el lenguaje
  visual actual; priorizar legibilidad, estados y jerarquía sobre adornos.

### Backend

- `adsOverview.service.ts`: devolver el contrato de la sección 6 y no
  confundir desconocido con cero.
- `metaInsights.service.ts`: snapshots por campaña, ad set y anuncio, con
  frescura y deduplicación.
- `metaConversions.service.ts`: CAPI actual, consentimiento, hashing,
  deduplicación y reintentos.
- `adAttribution.service.ts`: resolver el hilo de atribución y cohortes.
- `adDecision.service.ts`: elegir señal, diagnosticar y generar decisiones.
- `adAction.service.ts`: validar guardarraíles, ejecutar y compensar.
- `adDataQuality.service.ts`: ejecutar Fase 0 y bloquear decisiones inseguras.
- `adsOptimizer.service.ts`: circuitos rápido/lento y reglas de N1–N3.

Los jobs deben respetar el orden:

```text
ad-insights-sync → data-quality-check → attribution-reconcile
                 → ad-decision-run → approved-action-run
```

El job de decisión nunca debe ejecutar directamente una llamada a Meta sin
pasar por `AdAction`, guardarraíles y auditoría.

## 15. Criterios de aceptación

La primera versión de la página Ads está terminada cuando:

- el usuario ve si Meta, Insights, atribución y CAPI están realmente listos;
- puede seguir un lead desde anuncio hasta llamada, cualificación y venta;
- el embudo indica la señal más profunda elegible y por qué;
- los KPI distinguen métricas rápidas de cohortes maduras;
- la tabla permite localizar gasto sin cualificados, fatiga y landing deficiente;
- cada recomendación explica datos, regla, confianza, alcance, riesgo y acción;
- el modo sombra nunca afirma un ahorro contrafactual;
- las acciones N2 requieren aprobación y las N3 tienen canario, límites,
  cooldown y kill switch;
- cada decisión y acción queda auditada y se puede compensar cuando sea posible;
- las conversiones tardías actualizan el resultado sin borrar el histórico;
- con pocos eventos el sistema degrada a N1 y no castiga prematuramente una
  campaña;
- el informe semanal demuestra valor aunque todavía no se active autonomía;
- no se usa la antigua Offline Conversions API;
- no se muestran datos demo ni ceros que oculten una integración incompleta.

El orden de construcción es, por tanto:

```text
integridad → observación → señal de ventas → recomendación → aprobación
           → canario → autonomía limitada → experimentación y escala
```


## 16. Campaña global y activaciones (2026-08-29)

La página dejó de ser una colección de métricas de Meta y pasó a ser el
centro de ejecución publicitaria de una **campaña global**. Tres niveles que
no deben volver a mezclarse:

```text
Campaña global (Campaign: estrategia, oferta, presupuesto total, periodo, landing, meta)
  └─ Activación Ads (AdActivation: presencia en meta|google, estado, presupuesto asignado)
       ├─ Audiencias (AdAudience: reutilizables, con origen de datos y consentimiento)
       ├─ Creatividades (CreativeBrief → Creator Studio → AdCreative con aprobación)
       ├─ Anuncios publicados (metaAdId/adStatus + creatividad aprobada)
       └─ Medición y optimización (todo lo anterior de este documento)
```

Nomenclatura fija para no llamar «campaña» a todo: Campaña global ·
Activación Ads · Grupo de anuncios · Anuncio · Brief creativo · Creatividad ·
Experimento.

Decisiones de implementación:

- `Campaign` **es** la campaña global. Ya era el contenedor transversal
  (leads, llamadas, landing, piezas orgánicas); lo que se extrae es la
  ejecución de canal. Sus campos `metaCampaignId/metaAdSetId/metaAdId/adStatus`
  se conservan como almacenamiento del canal Meta y la activación `meta` se
  deriva de ellos cuando no existe fila `AdActivation` propia
  (`derivedFromLegacy: true`). No se creó una cadena paralela (§7).
- El presupuesto distingue global (`Campaign.budgetCents`), asignado por
  plataforma (`AdActivation.budgetCents`, con guardarraíl: la suma no puede
  superar el global), gasto real (snapshots) y disponible.
- El Creator Studio no compite con Ads: es la herramienta del átomo
  Creatividades. Entra con el contexto bloqueado del brief (campaña,
  audiencia, canal, CTA, destino, restricciones) y entrega la pieza como
  `AdCreative` en borrador, que pasa por revisión y aprobación antes de poder
  publicarse. `AdCreative.assetId` es referencia blanda a `Asset`, el mismo
  criterio que `Asset.campaignId`.
- La página `/captacion/atraer/ads` adopta el marco `gs-*` de Growth con seis
  vistas en `?tab=` (Resumen · Estructura · Creatividades · Experimentos ·
  Medición · Decisiones) y la campaña de trabajo en `?campaign=`. El estudio
  se abre con `?studio=1&brief=`, así que sobrevive al refresh y es enlazable.
- No debería trabajarse en Ads sin campaña global: el selector vive en la
  barra de contexto siempre visible; Estructura y Creatividades exigen
  selección, Resumen puede leer la organización entera.
- Rutas nuevas bajo `/api/ads`: `global-campaigns`, `plan?campaignId=`,
  `activations` (+`:id`), `audiences` (+`:id`, `:id/archive`), `briefs`
  (+`:id`, `:id/status`), `creatives` (+`:id`, `:id/submit|approve|reject`).
  Reutilizan `ads.read`/`ads.write` y el entitlement `ads`; ninguna crea filas
  de `Campaign`, así que la cuota de campañas del plan no se ve afectada.

Queda para una fase posterior: reparto automático de presupuesto entre
activaciones, grupos de anuncios como entidad propia, bandits multicanal y la
conexión real de Google Ads (la activación `google` existe como borrador
honesto, sin datos inventados).

## 17. Pendiente

Estado a 5 de agosto de 2026. Las seis fases están construidas y la página
`/ads` terminada, incluido su pase visual. Lo que sigue abierto:

### Bloqueante de verdad

**Nada de esto ha hablado nunca con Meta.** Todo está verificado contra una
base de datos local sembrada (`npm run db:seed:ads`). El guardarraíl
`meta_credentials` bloquea siempre porque no hay token real, así que el camino
de ejecución —la llamada al Graph API, la relectura del estado remoto, la
compensación— está escrito y con sus pruebas de bloqueo, pero **no ejecutado ni
una vez contra la plataforma**. Lo mismo para Conversions API: consentimiento,
hasheo y deduplicación probados, pero ninguna señal ha salido.

Hasta conectar una cuenta real no se sabe si Meta contesta lo que esperamos.
Es el primer paso antes de dar Ads por cerrado.

### Interfaz que falta, con los datos ya disponibles

Nada. Cerrado el 5 de agosto de 2026:

- `MetaAccountPage` muestra la banda de integridad y el freno de autonomía;
- `CampaignDetailPage` tiene la pestaña **Economía** con el embudo de la
  campaña, sus costes contra objetivo, el desglose por anuncio, el historial
  de decisiones y el registro de auditoría.

### Instrumentación

La **tasa de duplicados** ya se mide: `AdConversionSignal.duplicateAttempts`
cuenta los reintentos que llegan con un `eventId` ya visto, y la tasa se
calcula sobre el total de intentos, no sobre los aceptados. Sigue devolviendo
`null` mientras no haya ningún envío del que opinar.

### Requiere decisión de producto

- **"Causas descartadas"** en la tarjeta de decisión (§4.5). No es trabajo de
  pantalla: hoy cada regla comprueba su propia condición y calla sobre las
  demás. Hay que decidir qué hipótesis alternativas evalúa y descarta cada
  diagnóstico antes de poder mostrarlas.

### Depende de otro documento

Los tres últimos puntos de la Fase 6 necesitan el motor de contenido de
[`organico.md`](organico.md), que todavía no existe:

- variantes de creatividad desde los ángulos del Radar de Vendrava;
- propuestas de contenido orgánico ganador para Ads;
- benchmarks agregados por sector.
