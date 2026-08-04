# Inventario de limpieza

Auditoría del 2026-08-03 sobre la rama `agent/actualizar-plataforma`.
**Nada de lo listado aquí se ha borrado.** Es un inventario para decidir.

Cada entrada lleva la evidencia con la que se comprobó. Lo marcado como
**BORRAR** se verificó que no lo referencia nadie; lo marcado como **DECIDIR**
necesita contexto que no está en el código.

---

## 0. Lo que hay que hacer antes de limpiar nada

| # | Qué | Por qué |
|---|---|---|
| 1 | Commitear `backend/prisma/migrations/20260727120000_replace_postiz_with_metricool/` | Está sin trackear. `schema.prisma:126` declara `metricoolEnabled`, pero la migración baseline crea `postizEnabled`. **Un despliegue limpio desde Git arranca con el cliente Prisma pidiendo una columna que no existe.** |
| 2 | Commitear `AUDITORIA_EXTERNA_2026-08-01.md` | Sin trackear, y es el documento más reciente y más útil del repo: dos P0 de seguridad (escalada `own→org` entre tenants, unsubscribe que responde 200 sin persistir). |
| 3 | Commitear el árbol de trabajo (~100 archivos modificados) | Sin esto, cualquier borrado es irreversible: no hay punto al que volver. |

---

## 1. Código muerto — borrado seguro

Comprobado con grep sobre todo `src/` + `index.html`: la única aparición de
cada uno es su propio `export default`.

| Ruta | Líneas | Nota |
|---|---|---|
| `src/components/ExperienceSwitcher.jsx` | 60 | No borrar nada de `lib/experienceConfig.js`: `EXPERIENCE_MODE_OPTIONS` lo sigue usando `OnboardingModal.jsx`. |
| `src/components/ui/ActionModal.jsx` | 94 | `FormModal.jsx` y `ConfirmDialog.jsx` sí se usan. |
| `src/components/ui/FilterDropdown.jsx` | 98 | |
| `backend/_tmp_test_optimizer.ts` | — | **Está trackeado en git.** Script manual con datos `FAKE`/`seed-org` que escribe y borra en la BD real. Cero referencias. El prefijo `_tmp_` lo dice todo. |

Los tres del frontend entraron en el mismo commit (`c4f3cad`, 2026-07-25) y
nunca se cablearon.

Además:
- `package.json` declara `wavesurfer.js` (^7.12.8) y no se importa en ningún sitio.
- `src/pages/GrowthHubPage.jsx:32-33` importa `./growth-hub-assets.css` **dos veces**.

**No es basura, aunque lo parezca:**
- `src/pages/OrganicLeadsPage.jsx` — no aparece en ningún `import` porque se carga vía `import.meta.glob` en `src/lib/organicPage.js:3`.
- Los seis CSS "de una línea" (`access-control`, `ads-creative`, `enterprise-governance`, `funnels`, `growth-hub`, `revenue-intelligence`) no están vacíos: están **minificados**, son 13-18 KB de reglas reales y cada uno tiene su importador.
- Backend: los 51 `services/*.ts` y los 9 `jobs/*.ts` están todos referenciados (`worker.ts:28-36` arranca los jobs). Cero huérfanos.
- La retirada de Postiz está limpia: solo quedan menciones en las dos migraciones SQL, que es donde deben estar.

---

## 1b. CSS muerto (encontrado en la revisión de contraste, 2026-08-03)

| Ruta | Qué |
|---|---|
| `src/components/calls.css` ~155-197 | Bloque `.calls-live-strip` / `.calls-live-signal*` / `.calls-live-strip-action`: **cero consumidores en JSX**. Además lee `var(--signal)`, que **no define nadie**, así que `color: var(--signal)` y los `color-mix()` que lo usan son inválidos en tiempo de cálculo. |
| `src/components/calls.css` | `.calls-toast` — huérfano. |
| `src/components/campaigns.css` | `.campaign-conversation-cta` — huérfano, y su `:hover { border-color }` es doblemente muerto porque la regla base no declara borde. |
| `src/components/agents.css:239` | Segunda definición de `.agent-activity-list`, con selectores `> div` / `p` / `strong` / `small`. El JSX (`Agentes.jsx:332`) renderiza `<li>`, así que la buena es la de la línea 252 y esta no aplica a nada. Está dentro de una línea minificada junto a reglas vivas, por eso no la toqué. |

Dos incoherencias de diseño, no basura, pero candidatas a consolidar:

- **El botón primario existe en cuatro variantes**: `.agent-button.primary` e `.insights-button.primary` son planos con `--accent-deep`; `.campaign-button.primary`, `.calls-button.primary` y `.automation-button.primary` llevan gradiente `--accent-deep`→`--violet-deep`. La paleta ya está unificada (todos pasan contraste); el estilo no.
- **`--surface-hover` sobre `--surface-2` da 1.05:1 en tema claro.** Cualquier `:hover` que *solo* cambie el fondo entre esos dos tokens es casi invisible. Los casos actuales cambian además borde y color de texto, así que funcionan, pero es un punto frágil del sistema de tokens.

## 2. Binarios y experimentos — ~1,6 GB recuperables

Ninguno está cubierto por `.gitignore`: **no hay patrones `*.wav`, `*.ogg`, `*.zip` ni `banco_*`**, así que un `git add -A` intentaría trackearlos.

| Ruta | Tamaño |
|---|---|
| `.venv-qwen3-tts/` | 1,5 G |
| `backend/banco_chatterbox/` | 34 M |
| `backend/banco_voz_roger/` | 18 M |
| `backend/banco_qwen/` | 8,8 M |
| `backend/ab_qwen_vs_chatterbox/` | 4,6 M |
| `backend/banco_qwen_17b/` | 620 K |
| `backend/audioscarlos/` | 48 K |
| `backend/*.wav` (15), `backend/*.ogg` (9), `backend/clon_voz_19.48.35_expresivo.zip` | ~21 M |

Son salidas de los A/B de TTS de finales de julio, ya resumidas en
`backend/COMPARATIVA_VOCES_CHATTERBOX.md`.

**Y esto ya, pase lo que pase:** añadir a `.gitignore` → `.venv*/`, `tts-qwen/.venv/`,
`voice-engine/.ruff_cache/`, `*.wav`, `*.ogg`, `backend/banco_*/`.

Las carpetas de voz suman **~17,8 GB** de disco (`tts-chatterbox/` 5,5 G,
`tts-qwen/` 5,4 G, `voice-engine/` 5,4 G), de los que `tts-qwen/` está
íntegramente fuera del ignore.

---

## 3. Documentación — 23 `.md` en la raíz para un proyecto

Este es el "montón de archivos reescritos": no son reescrituras, son **informes
históricos de trabajo ya hecho que nunca se archivaron**. Cada tanda de trabajo
dejó su propio `.md` en la raíz, y varios se contradicen entre sí.

### Archivar en `docs/historico/`

Describen trabajo terminado. Su valor es la historia, no la referencia.

| Archivo | Por qué |
|---|---|
| `BOTONES_NO_FUNCIONALES.md` (1204 l.) | Plan de corrección de botones ya arreglados (commits `9dc3f5d`, `3dca8de`). |
| `INTEGRACION-FRONTEND-BACKEND.md` (489 l.) | **Factualmente falso hoy**: dice "el frontend usa datos mock, solo el login está conectado". |
| `MIGRACION-VOZ.md` (1091 l.) | Plan de portar el motor de voz Python→TS. Ya ejecutado: `backend/src/voice/` existe. |
| `BACKEND_SPEC.md` (310 l.) | Superado por `docs/plataforma/03-backend-api.md`. |
| `AUDITORIA_PAGINAS_INCOMPLETAS.md` (131 l.) | Solapa con `docs/AUDITORIA_CONSUMIDOR_PAGINAS.md` y `docs/REVISION_FRONTEND_BACKEND_2026-07-31.md`. |
| `DIFERENCIAS_WEB_PUBLICA_Y_CRM.md` (123 l.) | Auditoría puntual del 2026-07-13. |
| `COMPARATIVA_VENDRAVA.md` (48 l.) | Comparativa del 2026-07-05 contra la web del competidor. |
| `BRIEF_ANALISIS_EXTERNO.md` | El encargo que generó `AUDITORIA_EXTERNA_2026-08-01.md`; archivar junto a ella. |
| `META_ADS_CIERRE_100.md` (164 l.) | `ROADMAP_100_PORCIENTO.md` lo declara obsoleto explícitamente. |
| `META_ADS_TECHNICAL_SPEC.md` (220 l.) | Contiene afirmaciones ya falsas ("BullMQ no está corriendo, `campaignDispatch.ts` es código muerto" — ese archivo ya no existe y `worker.ts` arranca los 9 jobs). |
| `LEAD_GEN_AUDITORIA_SEO.md` + `..._IMPLEMENTACION.md` + `LEAD_GEN_CIERRE_100.md` (367 l.) | Análisis previo + registro de lo construido + plan de cierre del 2026-07-05. El servicio que documentan (`digitalAudit.service.ts`) sí existe. |
| `docs/AUDITORIA_COMPLETA_SISTEMA_2026-07-25.md`, `docs/AUDITORIA_TECNICA_DESARROLLADOR.md`, `docs/EVALUACION_TECNICA_SOFTWARE.md`, `docs/AUDITORIA_CONSUMIDOR_PAGINAS.md` | Cuatro auditorías del mismo sistema, del 15 y 25 de julio, todas superadas por la del 2026-08-01. |
| `docs/PLAN_TEST_RUNPOD_8H.md` | Plan fechado el 2026-07-27; la fecha ya pasó. |
| `docs/arquitectura-plataforma/` (14 archivos, ~2.600 l.) | Incluye `06-instrucciones-para-agente-ejecutor.md` y `13-prompt-operativo-deepseek.md`: son **prompts para otro modelo de IA**, no documentación de producto. |
| `docs/auditoria-nutricion-ventas/` (6 archivos, ~1.900 l.) | Incluye `IMPLEMENTACION-PROGRESO.md`, que por definición es un registro histórico. |

Son ~6.000 líneas de markdown fuera del camino sin perder nada: siguen en git.

### Conservar

`META_ADS_API.md` + `META_ADS_AUTOMATION.md` (referencia viva de la API de Meta
y de los principios de producto; idealmente fusionados en `docs/meta-ads.md`),
`PLATAFORMA_EXPLICACION_GENERAL.md` (el doc más citado del repo),
`AUDITORIA_EXTERNA_2026-08-01.md`, `docs/PRODUCCION_RUNBOOK.md`,
`docs/PRODUCTION_READINESS_MATRIX.md`, `docs/STAGING_E2E_HARNESS.md`,
`docs/CRITICAL_FLOWS_SMOKE_TEST.md`, `docs/METRICOOL_ORGANIC_POSTS.md`,
`docs/ads-backend.md`, `docs/PRISMA_INTEGRATION_AUDIT.md`,
`docs/STT_Y_EMOCION_ESTADO_Y_OPCIONES.md`, `voice-engine/README.md`,
`backend/GEMMA4_PROVIDERS.md` — todos referencian scripts o endpoints que
existen hoy.

### El problema de fondo de `docs/`

**~12.000 líneas describiendo el mismo inventario de páginas en tres jerarquías
distintas**, que nadie puede mantener sincronizadas:

- `docs/SISTEMA_COMPLETO_VOZIA_2026-07-25.md` — 5.879 líneas, 200 KB, el archivo más grande del repo
- `docs/PLATAFORMA_ACTUAL_PAGINAS_Y_FUNCIONALIDADES.md` — 629 líneas
- `docs/plataforma/**` — ~5.900 líneas entre `00-guia-funcional-por-pagina.md`, `02-secciones-frontend.md` y `detalle/01..04`

Y otro tanto con la voz: 11 documentos, ~4.700 líneas, con
`VOICE_SYSTEMS_COMPARATIVA_LLAMADAS_ES.md` y `_EN.md` siendo **el mismo
documento en dos idiomas**, y cuatro más solapando sobre modular-vs-duplex.

---

## 4. Duplicados en el frontend

### Dos exportadores de CSV

| Archivo | Firma | Consumidores |
|---|---|---|
| `src/utils/csvExport.js` | `downloadCSV(filename, rows)` — rows como array de arrays, cita todo siempre | `ui/ExportDropdown.jsx:5` |
| `src/lib/csv.js` | `downloadCsv(filename, rows)` — rows como array de objetos, deriva cabeceras, escapa condicionalmente, hace `revokeObjectURL` | `Leads.jsx:13`, `ProspectFinderPage.jsx:11` |

Mismo propósito, y los nombres se diferencian **solo por mayúsculas**
(`downloadCSV` vs `downloadCsv`). El de `lib/csv.js` es estrictamente mejor →
migrar `ExportDropdown.jsx` y borrar `utils/csvExport.js`.

### Formateo de fecha y moneda reimplementado 13 veces

Existen `src/utils/dateHelpers.js` y `formatLocaleDate` en `src/i18n/index.js`,
pero además hay helpers locales en: `Leads.jsx:46`, `AdsWizardPage.jsx:129`,
`LeadDetailPage.jsx:72` y `:78`, `AdsPage.jsx:36`, `CampaignDetailPage.jsx:127`,
`AccessControlPage.jsx:147`, `RevenueIntelligencePage.jsx:100`,
`AutomacionDetailPage.jsx:38`, `ConectarRedesPage.jsx:35`,
`dashboard/ActionCenter.jsx:161`, `FunnelsPage.jsx:46`, `LandingsPage.jsx:83`.

No son equivalentes: `formatCurrency` de `Leads.jsx`, el de `LeadDetailPage.jsx`
y `formatEuro` de `CampaignDetailPage.jsx` muestran el dinero de tres formas
distintas al mismo usuario. → consolidar en `src/lib/format.js`.

---

## 5. `vendrava-public/` es un submódulo roto

```
git ls-files -s vendrava-public
→ 160000 1a15855437615bc6e16338516816c26f797a2117 0   vendrava-public
ls .gitmodules → No such file or directory
```

Modo `160000` = gitlink, pero **no hay `.gitmodules`**. Un `git clone` fresco
crea `vendrava-public/` vacío y `git submodule update` falla por falta de URL:
el commit `1a15855` solo existe en el `.git` anidado local. Crítico para
reproducibilidad.

**Lo que sí está bien:** ningún build está commiteado. `dist/`, `backend/dist/`,
`node_modules/` y `vendrava-public/{out,.next}/` están todos correctamente
ignorados.

---

## 6. Decisiones que necesitan contexto

| Ruta | Pregunta |
|---|---|
| `vendrava-public/` | ¿Submódulo con URL declarada, repo separado, o `git rm --cached` e inlinear? |
| `tts-qwen/` (5,4 G), `.venv-qwen3-tts/` (1,5 G) | ¿Solo `.gitignore`, o el experimento Qwen se retira entero? |
| `voice-engine/{ambience,kyutai_stt,test_ambience,test_kyutai_stt}.py`, `runpod_bootstrap.sh` | Código fuente sin trackear desde hace días. ¿Commit o descarte? |
| `backend/src/routes/publicMedia.ts`, `services/generatedMedia.service.ts`, `voice/analysis/`, `voice/stt/localKyutai.ts`, `voice/tts/{chatterboxTts,mirroringPolicy}.ts` + 4 tests | Igual: código nuevo sin trackear. ¿Commit o descarte? |
| `src/components/ui/DateRangePicker.jsx` (109 l.) | Nadie lo importa, pero `AUDITORIA_PAGINAS_INCOMPLETAS.md` lo describe como funcionalidad del Dashboard. ¿Se perdió el cableado (bug) o se abandonó (basura)? |
| `VENDRAVA_PEAK.md` (453 l.), `FUSION_VOZIA_VENDRAVA.md` (501 l.) | El primero empieza con "lee esto como si todo ya estuviera construido". ¿Material de venta vivo o ficción archivable? |
| `ESTADO_DEL_SOFTWARE.md` vs `PLATAFORMA_EXPLICACION_GENERAL.md` | ~90 % de solapamiento. ¿Fusionar? |
| `docs/SISTEMA_COMPLETO_VOZIA_*` vs `docs/PLATAFORMA_ACTUAL_*` vs `docs/plataforma/**` | ¿Cuál es la fuente de verdad de las otras dos? |
| `docs/VOICE_SYSTEMS_COMPARATIVA_LLAMADAS_ES.md` / `_EN.md` | ¿Se mantienen los dos idiomas? |
| `docs/plataforma/06-*.md` | Falta el archivo (la serie salta de 05 a 07) y el índice no lo menciona. ¿Se perdió o nunca existió? |
| `ROADMAP_100_PORCIENTO.md` | ¿Queda algo abierto o ya está al 100 % y se archiva? |
| `backend/blind_ab.py`, `backend/compara_qwen_vs_chatterbox.py`, `scripts/voice-{arch,version}.ps1` | Herramientas de experimento sin trackear. ¿A `scripts/voz/` o fuera? |
| `backend/COMPARATIVA_VOCES_CHATTERBOX.md`, `backend/LATENCIA_POD_KYUTAI_CHATTERBOX.md` | Notas de experimento en `backend/`. ¿A `docs/voz/`? |
| 34 CSS con formato mezclado (6 minificados, 28 expandidos) | ¿Pasar todo por Prettier? |
