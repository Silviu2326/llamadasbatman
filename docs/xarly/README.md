# Xarly — agencia de contenido: plan de ejecución

Xarly es el nombre de trabajo del motor "agencia de contenido" que sustituye
al generador actual de la página de Redes sociales (`ConectarRedesPage`).
Visión completa: [`../ideas-agencia-contenido.md`](../ideas-agencia-contenido.md).
Orden de construcción acordado: **11 + 13 + 23 + 27 → 8 → 16 → 19**
(extraer conocimiento real → producir → aprobar → demostrar ventas).

## Decisiones cerradas

| Decisión | Valor |
|---|---|
| Formatos del MVP | **Post, carrusel y guion de Reel.** Locución, stories y email quedan para la fase 2 de atomización. |
| Fuentes conectadas primero | **Llamadas (`Call.transcript`), CRM (`Lead`, `Opportunity`) e inbox (`Conversation`/`Message`).** Reseñas después. |
| Propuestas semanales | **5 por defecto** (mínimo 3, máximo 7). Si no hay 3 con evidencia suficiente, se muestran menos — nunca se rellena con genéricas (idea 26). |
| Métricas de éxito del MVP | 1) **Tiempo ahorrado** (min. estimados por pieza aprobada), 2) **% de propuestas aprobadas** (y % aprobadas sin editar), 3) **Leads atribuidos o asistidos** vía UTM por pieza. |
| Objetivo por campaña | Obligatorio al generar: leads / vender un servicio / reconocimiento / resolver objeción / recuperar clientes / lanzar oferta. |

## Privacidad y anonimización (no negociable)

- **Seudonimización antes del LLM.** Nombres, teléfonos, emails, DNI y
  direcciones se sustituyen por tokens (`[CLIENTE_1]`, `[TEL]`) en el texto
  que sale hacia el modelo. El mapeo no sale del backend.
- **Evidencias agregadas, no literales.** Las tarjetas muestran conteos y
  paráfrasis ("8 clientes preguntaron por el plazo"), nunca la transcripción
  cruda. La cita literal de un cliente solo se usa en una pieza si el
  contacto tiene consentimiento registrado (`ContactConsent`) y el usuario
  la aprueba expresamente en la sala de aprobación.
- **Ámbito por organización.** Todo el análisis se ejecuta filtrado por
  `orgId`; ninguna oportunidad referencia datos de otra organización.
- **Sin PII en contenido publicado.** El editor adversario (fase 2) incluye
  un chequeo específico: ninguna pieza sale con datos personales
  identificables.
- **Trazabilidad.** Cada oportunidad guarda los ids internos de sus fuentes
  (llamadas/mensajes) para auditar el origen sin duplicar el texto.

## La pantalla estrella

> **"Vendrava ha analizado 47 conversaciones y ha encontrado 7 oportunidades
> de contenido esta semana."**

Debajo, tarjetas de oportunidad con esta anatomía exacta:

```
┌─────────────────────────────────────────────────────┐
│ ⚠ Objeción detectada                                │
│ 8 clientes preguntaron cuánto tarda la instalación. │
│                                                     │
│ Oportunidad: carrusel "¿Cuánto tardamos realmente   │
│ en instalarlo?"                                     │
│ Objetivo:    eliminar una objeción antes de la      │
│              llamada                                │
│ Evidencias:  8 menciones en 12 llamadas  [ver]      │
│                                                     │
│                              [ Generar campaña ]    │
└─────────────────────────────────────────────────────┘
```

Detalle por documento:

- [`pantallas.md`](pantallas.md) — mapa de pantallas del MVP.
- [`semana.md`](semana.md) — qué se construye esta semana, día a día.
- [`roadmap.md`](roadmap.md) — fases técnicas completas hasta atribución.
- [`ads.md`](ads.md) — el mismo enfoque aplicado a la página de Ads:
  optimizador con señal de ventas (18 ideas, 4 fases).
- [`landings.md`](landings.md) — especificación de Landings y webs: el punto
  medio de todos los circuitos (telemetría, diagnósticos, A/B server-side).
- [`organico.md`](organico.md) — Captación orgánica como centro de mando del
  circuito orgánico: SEO, redes, prospección y landings como brazos
  ejecutores, con embudo unificado y coste por cualificado en tiempo.
