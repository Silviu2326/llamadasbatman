# Auditoría: páginas por debajo del nivel del Dashboard

*Revisión de código real (no impresión visual) de las 4 páginas señaladas: Recetas de
anuncios, Nueva campaña, Automatizaciones y Redes sociales. Comparadas contra el nivel de
Dashboard, Leads y Campañas, que sí tienen búsqueda funcional, tablas completas y stats reales.*

---

## Cómo se hizo la comparación

Dashboard (`src/components/Dashboard.jsx`) es el techo de referencia: date range picker
real, dropdown de comparación de período, export a CSV, grid de widgets arrastrable/
editable, KPIs con sparkline y % de cambio real. Leads y Campañas también tienen barra de
búsqueda **funcional** (`value={search} onChange={...}`, verificado por grep). Las 4
páginas de abajo se quedan cortas contra esa vara, cada una por razones distintas — algunas
por alcance deliberado (MVP recién construido), otras por controles decorativos que no
hacen nada.

---

## 1. Recetas de anuncios — `src/pages/AdPlaybooksAdminPage.jsx`

**Qué tiene:** lista expandible de tarjetas, formulario crear/editar, activar/desactivar.

**Qué falta:**
- **Sin fila de KPIs.** Todas las demás páginas de listado (Dashboard, Automatizaciones,
  Leads) abren con tarjetas de stats; esta no tiene ninguna — ni "recetas totales", ni
  "activas vs inactivas", ni "en uso".
- **Sin tabla, solo tarjetas apiladas.** No hay columnas (Vertical | Estado | Usada en N
  campañas | Última edición) — para más de 5-6 rubros esto se vuelve una lista larga sin
  forma de escanear.
- **Cero dato de uso real, y es fácil de agregar:** `AdPlaybook` en el schema de Prisma ya
  tiene la relación `campaigns Campaign[]` (`backend/prisma/schema.prisma:267`), pero
  `listAdPlaybooks()` (`backend/src/services/adPlaybook.service.ts:7-9`) hace un
  `findMany` liso, sin `_count: { select: { campaigns: true } }`. Agregar ese `_count` es
  una línea de backend y desbloquea mostrar "Usada en 4 campañas" en cada tarjeta — ahora
  mismo esa información existe en la base pero no se expone.
- **Sin botón de borrar**, solo desactivar (puede ser intencional para no romper campañas
  que ya la usan, pero no está explicado en la UI — el usuario no sabe por qué no puede
  borrar).
- **Sin búsqueda/filtro por vertical.**

## 2. Nueva campaña (wizard) — `src/pages/AdsWizardPage.jsx`

**Qué tiene:** formulario de 3 campos (vertical, objetivo, presupuesto) y submit.

**Qué falta:**
- **Sin aviso previo de si hay cuenta de Meta conectada.** El wizard deja completar y
  enviar el formulario igual; recién en el mensaje de error post-submit dice "conectá una
  cuenta de Meta" (`AdsWizardPage.jsx:45`). Debería mostrar el estado de conexión *antes*,
  como una tarjeta arriba del form (mismo patrón que ya existe en `MetaAccountPage.jsx`).
- **Sin preview de lo que se va a generar.** El usuario no ve oferta/copy/imagen hasta
  después de crear la campaña y navegar a su detalle — no hay ningún feedback intermedio.
- **Sin ningún dato de contexto:** no muestra campañas ya creadas, gasto total del mes,
  ni cuántas campañas siguen en borrador — el wizard vive aislado del resto de Campañas.
- **Sin estimación de alcance/costo** antes de publicar, pese a que el propio
  `PLATAFORMA_EXPLICACION_GENERAL.md` (sección 5) promete que "el dueño del negocio ve
  resultados de negocio" — hoy no hay ninguna estimación, ni siquiera aproximada.

## 3. Automatizaciones — `src/components/Automatizaciones.jsx`

Esta es la que más aparenta estar completa (tiene KPIs, tabla, filtros, paginación) pero
varios controles son decorativos:

- **Buscador no filtra nada.** `placeholder="Buscar automatizaciones..."` en la línea 160-163
  no tiene `value` ni `onChange` — comparado con el mismo patrón en `Leads.jsx:648` y
  `Campaigns.jsx:838`, que sí están cableados. Tal cual está, es un input muerto.
- **Botón "Filtros" (línea 166) no tiene `onClick`.** No abre nada.
- **Botón "Ordenar por: Más recientes" (línea 206) no tiene `onClick`.** El orden real no
  es interactivo, siempre es el que devuelve la API.
- **Botón "···" (more) por fila (línea 314) solo hace `stopPropagation`.** No abre ningún
  menú — no hay forma de duplicar, archivar o exportar una automatización individual.
- **Tab de filtro "Borradores" está roto por diseño:** `filter === 'Borradores' return false`
  (línea 136) — siempre vacío, porque el modelo real `Automation` no tiene concepto de
  borrador (solo `isActive` booleano). El usuario puede clickear esa pestaña y siempre ve
  "sin automatizaciones", sin ninguna explicación de por qué.
- **Columnas "Conversiones" e "Ingresos" de la tabla están permanentemente vacías (`—`).**
  No es un bug de datos — es honesto (`src/lib/automationMapping.js:40-41` pone `'—'` a
  propósito en vez de inventar un número), pero el problema de fondo es que **no existe
  ningún modelo que vincule una automatización con las conversiones/ingresos que generó**.
  Mostrar dos columnas que jamás van a tener valor es peor que no mostrarlas.
- **Mismatch de etiqueta en 2 KPIs:** "Conversiones generadas" (KPI #3) en realidad muestra
  `stats.meetingsScheduled` (reuniones agendadas *de toda la org*, no atribuidas a
  automatizaciones) e "Ingresos atribuidos" (KPI #4) muestra `stats.closedWonValue` (pipeline
  ganado de toda la org). Son datos reales, pero la etiqueta promete algo que el número no
  mide — el usuario puede pensar que esas automatizaciones generaron esas reuniones/ingresos
  cuando en realidad es una cifra global sin relación causal demostrada.
- **KPI "Ahorro de tiempo" no tiene ningún respaldo en el modelo de datos** (queda en
  `'—' / 'Sin datos'` siempre) — no hay forma de calcularlo hoy; debería sacarse en vez de
  dejarse como promesa vacía permanente.

## 4. Redes sociales — `src/pages/ConectarRedesPage.jsx`

Esta es la más nueva (recién construida) y la más deliberadamente mínima — el plan de
implementación eligió el MVP de menor esfuerzo (conectar + iframe embebido). Comparada
contra `MetaAccountPage.jsx` (su equivalente más cercano), le faltan piezas que **ya
existen en el backend pero no están conectadas al frontend:**

- **`GET /api/metricool/analytics` ya existe** (`backend/src/controllers/metricool.controller.ts`,
  función `analytics`) **pero la página nunca lo llama.** `MetaAccountPage.jsx` sí muestra
  tarjetas de datos de la cuenta (Ad Account ID, página, estado, fecha de conexión) — acá no
  hay ninguna tarjeta de stats (posts programados, alcance, interacciones), y el dato para
  llenarlas ya está armado del lado del servidor.
- **Sin lista de integraciones conectadas visible fuera del iframe.** El backend ya trae
  `listIntegrations()` (usado internamente en el endpoint de status) pero el frontend no
  la muestra como texto/chips fuera del iframe — si el iframe tarda en cargar o falla, el
  usuario no tiene ninguna otra pista de qué redes están conectadas.
- **Sin manejo de error específico si Metricool no está configurado.** El mensaje genérico "No
  se pudo conectar" no distingue "no configurado en este entorno" de "error real" — sería
  el mismo tipo de mejora que ya tiene `MetaAccountPage.jsx` con sus mensajes diferenciados.

---

## Punch list priorizada (impacto / esfuerzo)

1. **Automatizaciones — cablear buscador, filtros y ordenar, o sacarlos.** Son controles
   visibles y esperables; que no hagan nada es lo que más "se nota" como incompleto.
   Esfuerzo bajo (ya existe el patrón en Leads/Campañas para calcar).
2. **Automatizaciones — arreglar o eliminar el tab "Borradores"** y aclarar/eliminar las
   columnas "Conversiones"/"Ingresos" y el KPI "Ahorro de tiempo" que nunca se llenan.
3. **Recetas de anuncios — agregar `_count.campaigns` al listado** (una línea de backend)
   y mostrarlo como "usada en N campañas" — dato real que ya existe en la relación.
4. **Redes sociales — conectar `GET /api/metricool/analytics`** a tarjetas de stats, mismo
   patrón visual que `MetaAccountPage.jsx`.
5. **Nueva campaña (wizard) — mostrar el estado de conexión de Meta arriba del formulario**
   antes de dejar enviar, no después del error.
6. Menor prioridad: preview de oferta/copy/imagen en el wizard antes de crear la campaña,
   KPIs de contexto en Recetas de anuncios y en el wizard.

Este documento es solo la revisión — no se tocó código. Decime cuáles de estos puntos
querés que implemente y en qué orden.
