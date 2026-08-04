# Guía de estado actual, testing y preparación del lanzamiento en inglés

**Plataforma:** VozIA / Vendrava  
**Fecha de revisión:** domingo, 26 de julio de 2026  
**Semana de testing:** lunes 27 a viernes 31 de julio de 2026  
**Objetivo:** decidir si la plataforma puede lanzarse en inglés durante agosto de 2026  
**Primera sesión prioritaria:** llamadas, lunes 27 de julio  
**Rama revisada:** `agent/actualizar-plataforma`  
**Commit base observado:** `ddd0eea`  

---

## 0. Actualización — 26/07/2026 (tarde)

Correcciones aplicadas en código tras la revisión de la mañana:

| Ítem del informe | Estado | Cómo se cerró |
|---|---|---|
| P0-EN-01 Cumplimiento de voz solo ES | **Corregido** | `compliance.ts` detecta opt-out y transferencia también en inglés; disclosure y pregunta de consentimiento localizados por idioma del agente; zona horaria por defecto configurable (`DEFAULT_CALL_TIMEZONE`). Test: `backend/src/__tests__/complianceEnglish.test.ts`. |
| P0-EN-02 Consentimiento/grabación | **Corregido (con política)** | Nueva `CALL_RECORDING_POLICY` (`always`/`consent`/`off`). Con `consent`, Twilio no graba desde el inicio: el agente pregunta, `recordingConsentPending/Consented` se actualizan y la grabación solo arranca tras un "sí". `canCall()` puede exigir `ContactConsent` de voz con `REQUIRE_VOICE_CONSENT=true`. La decisión legal por país sigue pendiente de revisión. |
| CALL-BLOCK-03 UI falso éxito | **Corregido** | El backend devuelve códigos estables (`lead_without_phone`, `lead_without_campaign`, `call_queue_unavailable`) y la UI solo muestra éxito con `queued=true`; los errores se traducen ES/EN. |
| CALL-BLOCK-04 Lead sin campaña | **Corregido** | `call-now` rechaza con 422 leads sin campaña o sin teléfono; el worker omite y traza el caso en vez de despachar con `campaignId` vacío. |
| Tests raíz 19/20 | **Corregido** | El conteo de migraciones ahora es dinámico; se retiraron dos aserciones que fijaban estado git transitorio. Tests raíz: 22/22 PASS. |
| prisma-audit: referencias documentales | **Corregido** | `BACKEND_PENDIENTE_PAGINAS.md` ya no referencia migraciones consolidadas en la baseline. Queda solo el WARN de baseline no idempotente (decisión operativa, sección 14). |
| P1-EN-05 sin regresión i18n | **Parcial** | Nuevo `scripts/i18n-parity.test.mjs`: paridad de claves ES/EN y traducciones no vacías en CI. La pasada visual por rutas sigue siendo manual. |
| P2-EN-06 título y placeholder | **Corregido** | `<title>` ahora es `VozIA`; el placeholder de email del login está localizado (`tu@empresa.com` / `you@company.com`). |

Nuevas variables documentadas en `MIGRACION-VOZ.md`: `DEFAULT_CALL_TIMEZONE`,
`DEFAULT_PHONE_COUNTRY_CODE`, `CALL_RECORDING_POLICY`, `REQUIRE_VOICE_CONSENT`.
Para la sesión del lunes en inglés se recomienda staging con
`CALL_RECORDING_POLICY=consent` y `REQUIRE_VOICE_CONSENT=true`.

Siguen abiertos (no corregibles desde código): backend público 502, secretos y
staging (CALL-BLOCK-01/02), benchmark real (CALL-BLOCK-05), dúplex como canario
(CALL-BLOCK-06), baseline no idempotente, y la limpieza completa de errores
backend mezclados (P1-EN-04, del que ya existe el patrón de códigos estables).

---

## 1. Dictamen ejecutivo

### Decisión actual: NO-GO para lanzamiento externo en inglés

La plataforma tiene una base funcional amplia: frontend React, API Fastify,
persistencia Prisma, RBAC, multi-tenant, colas, integraciones, CRM, automatización,
observabilidad y dos arquitecturas de voz. Los builds de frontend y backend pasan.

Sin embargo, **hoy no se puede certificar un lanzamiento comercial en inglés**.
Tampoco está preparada la sesión de llamadas de mañana sin completar primero el
entorno de staging y las conexiones de voz.

Los bloqueadores principales son:

1. El backend público configurado en `vercel.json` devolvió **HTTP 502** en
   `/health` durante esta revisión.
2. El gate de producción falla por configuración incompleta, secretos ausentes,
   entorno no productivo e integración Twilio parcial.
3. No existe una base aislada en `TEST_DATABASE_URL`; la suite de integración
   completa se bloquea de forma segura antes de empezar.
4. El arnés E2E de staging existe, pero no tiene las variables ni el workspace
   de staging necesarios para ejecutarse.
5. La interfaz tiene soporte ES/EN y paridad de claves, pero todavía depende de
   un traductor global del DOM para mucho texto heredado. No hay suite automática
   de regresión de idioma.
6. El backend solo localiza de forma explícita algunos errores de autenticación.
   Muchos errores de dominio siguen mezclando español e inglés.
7. El flujo de llamadas en inglés no tiene todavía cumplimiento equivalente al
   español: opt-out, transferencia, disclosure y texto de consentimiento están
   definidos únicamente en español.
8. Twilio inicia la grabación desde el comienzo de la llamada, mientras los
   campos de consentimiento de grabación no están conectados al flujo.
9. El botón **Nueva llamada** considera exitosa una respuesta HTTP 200 aunque la
   API devuelva `queued: false`.
10. Una llamada lanzada para un lead sin campaña puede entrar en cola, pero
    después sus callbacks exigen un contexto con campaña completo.

### Recomendación de calendario

- Mantener del **27 al 31 de julio como semana exclusivamente de testing**.
- No añadir funcionalidades ni mezclar correcciones con la primera pasada.
- Registrar los defectos y marcar como `BLOCKED` los módulos que no puedan
  probarse por infraestructura.
- Abrir en agosto una ventana corta de corrección y regresión.
- Fijar la fecha de lanzamiento solo cuando todos los gates de la sección 14
  estén en verde.

Un lanzamiento en agosto sigue siendo posible, pero **no debe asociarse todavía
a una fecha concreta**.

---

## 2. Qué se ha revisado

Esta guía se basa en el árbol de trabajo local actual, no solo en documentos
históricos.

Alcance revisado:

- 108 ficheros fuente frontend `.js`/`.jsx`.
- 46 declaraciones de ruta en `src/App.jsx`.
- 41 ficheros de rutas Fastify.
- 20 migraciones Prisma versionadas.
- 28 ficheros de tests backend.
- 4 suites operativas raíz.
- Motor de voz modular y gateway dúplex Moshi/Mimi.
- Configuración local documentada y configuración efectiva, comprobando solo
  presencia o ausencia de claves, nunca sus valores.
- Flujo visual de `/login` en escritorio y móvil.
- Selector ES/EN.
- Salud del backend público referenciado por el frontend.
- Flujo de llamada desde UI, cola, worker, Twilio, Media Stream, motor de voz y
  persistencia.

### Estado del árbol de trabajo

Durante la revisión existían cambios locales sin commit en 11 ficheros:

- `src/components/Agentes.jsx`
- `src/components/Automatizaciones.jsx`
- `src/components/Calls.jsx`
- `src/components/KnowledgeBase.jsx`
- `src/components/Leads.jsx`
- `src/components/Pipeline.jsx`
- `src/lib/leadMapping.js`
- `src/pages/AdsWizardPage.jsx`
- `src/pages/AgentDetailPage.jsx`
- `src/pages/FunnelsPage.jsx`
- `src/pages/LeadDetailPage.jsx`

Estos cambios pertenecen al estado actual y no se han sobrescrito. Para que los
resultados de la semana sean reproducibles, antes de empezar debe anotarse el
commit exacto y decidir si estos cambios forman parte del candidato de release.

---

## 3. Evidencia de compilación y pruebas

| Comprobación | Resultado | Lectura |
|---|---:|---|
| `npm run build` | PASS | Frontend Vite compila |
| `backend/npm run build` | PASS | Backend TypeScript compila |
| Tests operativos raíz | FAIL: 19/20 | Un test espera 15 migraciones; ahora existen 20 |
| `node scripts/ops-checks.mjs` | PASS | Scripts, schema y documentación operativa coherentes |
| `npm run ops:prisma-audit` | WARN | Baseline no idempotente y dos referencias documentales a migraciones ausentes |
| `npm run ops:production-gate` | FAIL | El entorno actual no cumple el contrato de producción |
| `backend/npm run test:offline` | PASS: 4/4 | Guard de DB, descubrimiento y selección de DB de test correctos |
| `backend/npm test` | BLOCKED | Falta `TEST_DATABASE_URL` aislada |
| Compilación Python de voz | PASS | `server.py`, `moshi_gateway.py`, smoke y test compilan |
| Contratos Moshi sin modelos/GPU | PASS: 5/5 | Protocolo, chunks, resampling y barge-in contractual |
| Validador de escenarios de voz | PASS: 3/3 | Los tres escenarios ES son estructuralmente válidos |
| E2E staging | BLOCKED | Faltan URL, token, DB, namespace y workspace de staging |
| Smoke visual `/login` desktop | PASS parcial | Renderiza, cambia ES/EN y no muestra errores de consola |
| Smoke visual `/login` móvil 390 px | PASS parcial | Sin overflow horizontal ni overlay de framework |
| Backend público `/health` | FAIL | HTTP 502 el 26/07/2026 |

### Observaciones de rendimiento del build

- La carga por ruta ya utiliza `React.lazy`, una mejora frente a auditorías
  anteriores.
- El chunk compartido principal queda en aproximadamente 501 kB minificado y
  Vite mantiene el aviso de chunk superior a 500 kB.
- Hay numerosos PNG entre aproximadamente 1,2 MB y 2 MB.
- Para lanzamiento deben revisarse peso total, caché, compresión, LCP y consumo
  móvil en una conexión real.

### Qué no demuestra un build correcto

Un build no confirma:

- que las migraciones estén aplicadas;
- que el backend público esté disponible;
- que los workers estén consumiendo colas;
- que Twilio pueda firmar callbacks y abrir Media Streams;
- que el motor de voz esté desplegado;
- que OAuth y proveedores externos tengan permisos;
- que el inglés sea completo en estados de error;
- que una llamada real se grabe, transcriba, evalúe y persista;
- que rollback, alertas y recuperación funcionen.

---

## 4. Estado de preparación para inglés

### 4.1 Aspectos positivos

- Los locales soportados son `es` y `en`.
- El diccionario declarativo contiene **672 claves hoja en español y 672 en
  inglés**, sin claves ausentes en ninguno de los dos idiomas.
- 80 de los 108 ficheros frontend usan `useI18n` o el traductor `t()`.
- El locale se envía al backend mediante `Accept-Language`.
- Fechas y números principales usan `Intl` con `es-ES` o `en-US`.
- El selector ES/EN funciona visualmente en la pantalla de acceso.
- El idioma del documento se actualiza a `es` o `en`.
- Login, navegación, dashboard, llamadas, modales principales, páginas legales,
  landings públicas y test de voz tienen mensajes declarativos en ambos idiomas.
- El contenido del cliente, transcripciones, nombres y empresas puede marcarse
  con `data-i18n-skip`, lo que evita traducir datos de negocio.

### 4.2 Riesgos actuales

#### P0-EN-01 — Cumplimiento de voz solo en español

`backend/src/voice/compliance.ts` contiene:

- frases de opt-out solo en español;
- frases de transferencia a humano solo en español;
- disclosure de asistente IA solo en español;
- pregunta de consentimiento de grabación solo en español;
- zona horaria predeterminada de México;
- código telefónico predeterminado `+52`.

Consecuencia: un prospecto que diga “do not call me” o “I want a human” puede no
activar la protección esperada.

#### P0-EN-02 — Consentimiento y grabación no cerrados

- `canCall()` comprueba formato, opt-out y horario.
- No exige por sí mismo un `ContactConsent` de voz válido.
- Twilio se configura con `record: true` desde la creación de la llamada.
- `recordingConsentPending` y `recordingConsented` existen en el contexto, pero
  no se usan en el flujo revisado.

Antes de llamar a terceros debe definirse y validar el criterio legal por país,
idioma, tipo de llamada y base jurídica. Esta guía no sustituye revisión legal.

#### P1-EN-03 — Traducción heredada mediante MutationObserver

75 de los 108 ficheros frontend contienen candidatos de texto español. Para
cubrir el legado existe `LegacyDomTranslation`, con 563 entradas de frases más
un mapa de palabras, observando mutaciones de todo `document.body`.

Riesgos:

- una frase nueva puede quedar en español;
- el texto dinámico puede traducirse de forma parcial;
- puede competir con React;
- no garantiza estados tardíos, tooltips o errores del servidor;
- el coste crece con interfaces dinámicas;
- no existe un test que recorra todas las rutas en EN.

Debe considerarse un puente temporal, no la base de un lanzamiento internacional.

#### P1-EN-04 — Errores backend en idiomas mezclados

El backend usa `Accept-Language` explícitamente en autenticación, pero muchos
controladores devuelven textos fijos como `Not found`, errores en español o
combinaciones de ambos. Varias páginas muestran directamente `body.error`.

La solución objetivo es:

1. códigos de error estables;
2. traducción en frontend;
3. mensajes backend localizados solo cuando sea necesario;
4. tests de error para ES y EN.

#### P1-EN-05 — Sin cobertura automática de localización

No hay Playwright/Cypress/Vitest/Jest configurado para el frontend principal.
Tampoco hay tests que:

- recorran todas las rutas en inglés;
- detecten texto español residual;
- comparen claves ES/EN en CI;
- prueben formatos de fecha, moneda y zona horaria;
- comprueben errores y vacíos en ambos idiomas;
- validen contenido de emails, SMS, WhatsApp o voz en inglés.

#### P2-EN-06 — Identidad de producto y metadatos

- El `<title>` actual es `proyectollamadas`.
- El HTML fuente parte de `lang="en"` aunque la aplicación decide después el
  locale real.
- La UI usa principalmente VozIA; parte de la documentación y el motor dúplex
  usan Vendrava.
- El placeholder de email `tu@empresa.com` permanece en español en modo EN.
- Las rutas internas están en español. Esto es técnicamente válido, pero debe
  decidirse si se aceptará de cara a clientes ingleses.

### 4.3 Veredicto de idioma

| Área | Estado |
|---|---|
| Diccionario ES/EN | Verde |
| Cambio visual de idioma | Verde parcial |
| Navegación y superficies principales | Amarillo |
| Estados dinámicos y errores | Rojo |
| Automatización de regresión i18n | Rojo |
| Voz inglesa | Rojo |
| Emails y mensajes externos en inglés | No certificado |
| Formatos regionales | Amarillo |
| Legal y consentimiento por mercado | Rojo |
| Branding y metadatos | Amarillo |

---

## 5. Estado de llamadas antes del lunes

### 5.1 Arquitectura disponible en código

El camino de una llamada saliente es:

```text
UI /llamadas
  → POST /api/leads/:id/call-now
  → cola BullMQ lead-call-dispatch
  → worker dedicado
  → Twilio Calls API
  → webhook firmado /api/voice/webhook/voice
  → TwiML <Connect><Stream>
  → WebSocket /media con capability HMAC corta
  → motor modular o gateway dúplex
  → transcripción, outcome, resumen y métricas
  → persistencia Call
  → reunión/tarea/outbox cuando corresponde
```

Controles positivos presentes:

- normalización E.164;
- horario permitido;
- lista de opt-out;
- validación de firma Twilio;
- contexto de organización/agente/campaña/lead;
- agente activo y dirección de llamada;
- token corto para el Media Stream;
- AMD;
- reintentos de `busy`, `no-answer`, `failed` y `canceled`;
- grabación y callback;
- barge-in;
- transferencia a humano;
- persistencia de llamada;
- creación idempotente de reunión;
- trazas, evaluación y métricas de voz.

### 5.2 Bloqueos comprobados

#### CALL-BLOCK-01 — Backend público no disponible

El endpoint configurado en `vercel.json`:

`https://llamadasspidermanback-production.up.railway.app/health`

devolvió HTTP 502. Mientras no responda 200, no debe iniciarse ninguna prueba
telefónica.

#### CALL-BLOCK-02 — Configuración local incompleta

En el entorno revisado:

- Twilio SID y token están vacíos;
- no hay webhook base de Twilio;
- no hay modo, URL ni token de motor de voz;
- no hay arquitectura de voz declarada;
- no hay URL/token de motor dúplex;
- no está habilitado el worker en este proceso.

Puede haber credenciales por organización en base de datos, pero no se pudieron
validar porque el entorno operativo no está disponible.

#### CALL-BLOCK-03 — UI confirma aunque no se encole

`POST /api/leads/:id/call-now` responde `{ ok: true, queued }`. La UI solo mira
el código HTTP; si `queued` es `false`, muestra igualmente “Llamada iniciada”.

Durante el testing:

- no usar el mensaje visual como evidencia;
- comprobar el job en cola y el SID de Twilio;
- registrar este defecto como P1 funcional.

#### CALL-BLOCK-04 — Lead sin campaña

El worker puede escoger un agente activo de fallback si el lead no tiene
campaña, pero envía `campaignId: ''`. Los webhooks de voz saliente validan un
contexto completo con campaña.

Para mañana, todos los leads de prueba deben:

- pertenecer a la organización de staging;
- tener teléfono E.164;
- estar asociados a una campaña;
- tener agente activo asignado a esa campaña;
- tener consentimiento de voz documentado.

#### CALL-BLOCK-05 — Sin benchmark real

No hay resultados reproducibles actuales para:

- latencia de primer audio;
- latencia de turno;
- WER/CER inglés;
- naturalidad;
- interrupciones;
- ruido PSTN;
- concurrencia;
- coste por llamada;
- transferencias;
- consentimiento;
- reconexión;
- pérdida del motor de voz.

#### CALL-BLOCK-06 — Dúplex no es todavía agente de negocio

El gateway Moshi/Mimi conserva el `systemPrompt`, pero el checkpoint base no lo
aplica como condicionamiento de negocio. Node mantiene la policy, pero la ruta
dúplex debe tratarse como canario de interacción, no como motor comercial
certificado.

### 5.3 Arquitectura recomendada para la prueba del lunes

Usar primero la arquitectura **modular remota**:

- `faster-whisper` para STT;
- LLM compatible con OpenAI;
- Piper o Qwen3-TTS con voz inglesa validada;
- Node como autoridad de compliance, tenant y CRM.

Probar Moshi/Mimi únicamente después, en una tanda separada, etiquetada como
experimental. No mezclar resultados de ambas arquitecturas.

---

## 6. Preparación obligatoria para el lunes 27

### 6.1 Entorno

- [ ] Crear o confirmar un staging aislado.
- [ ] Confirmar que el dominio contiene `staging`, `test`, `qa` o `sandbox`.
- [ ] Confirmar que la DB no coincide con producción.
- [ ] Aplicar las 20 migraciones en staging.
- [ ] Ejecutar `prisma migrate status`.
- [ ] Conseguir `/health`, `/health/live` y `/health/ready` en verde.
- [ ] Conseguir `/health/integrations/ready` en verde para Twilio y voz.
- [ ] Arrancar API y worker como procesos separados.
- [ ] Confirmar heartbeat del worker.
- [ ] Confirmar Redis y cola `lead-call-dispatch`.
- [ ] Confirmar URL pública HTTPS/WSS.
- [ ] Confirmar que Twilio puede alcanzar los callbacks.
- [ ] Confirmar motor de voz y healthcheck.
- [ ] Confirmar observabilidad y acceso a trazas.

### 6.2 Datos de prueba

- [ ] Organización exclusiva de QA.
- [ ] Usuario owner/admin de QA.
- [ ] Campaña `QA EN Calls 2026-07-27`.
- [ ] Agente activo con `language=en-US`.
- [ ] `callDirection=both` o `outbound`.
- [ ] Prompt completamente en inglés.
- [ ] Voz inglesa validada.
- [ ] Playbook inglés.
- [ ] Dos leads internos asociados a la campaña.
- [ ] Teléfonos E.164 controlados por el equipo.
- [ ] Consentimiento de voz y grabación documentado.
- [ ] Número humano de transferencia controlado.
- [ ] Calendario/reunión de prueba.
- [ ] Ningún contacto real de cliente.

### 6.3 Seguridad de la prueba

- [ ] Límite de gasto Twilio bajo.
- [ ] Límite de concurrencia en 1.
- [ ] Máximo 10 intentos durante la primera tanda.
- [ ] Sin importación masiva.
- [ ] Sin `--allow-private` en el gate público.
- [ ] Sin secretos pegados en capturas o tickets.
- [ ] Grabaciones restringidas al equipo de QA.
- [ ] Retención y borrado de evidencias acordados.
- [ ] Botón de parada y responsable operativo identificados.

### 6.4 Go/No-Go de las 09:00

No empezar llamadas si cualquiera de estos puntos falla:

- salud pública;
- readiness;
- worker heartbeat;
- cola;
- Twilio por organización;
- WSS;
- motor de voz;
- campaña/agente/lead válidos;
- consentimiento;
- trazas;
- límite de gasto.

---

## 7. Guion de testing de llamadas del lunes

### Orden recomendado

#### Fase A — Sin telefonía real

| ID | Prueba | Resultado esperado |
|---|---|---|
| CALL-00 | Health y readiness | Todos los checks obligatorios en verde |
| CALL-01 | Test de voz web en inglés | Micrófono, STT, respuesta, audio y cierre |
| CALL-02 | Barge-in web | La respuesta se cancela y el agente escucha |
| CALL-03 | Error de motor | Error visible, sin fallback propietario silencioso |
| CALL-04 | Trazas | Eventos con proveedor, modelo, idioma y latencias |

#### Fase B — Una llamada saliente controlada

| ID | Prueba | Resultado esperado |
|---|---|---|
| CALL-05 | `call-now` con lead válido | `queued=true`, job visible y SID Twilio |
| CALL-06 | Respuesta humana | Media Stream abierto y primer audio |
| CALL-07 | Conversación corta | Turnos completos y sin eco severo |
| CALL-08 | Interrupción | El usuario puede interrumpir al agente |
| CALL-09 | Cierre | Llamada termina y se persiste una sola vez |
| CALL-10 | Detalle | Audio, transcript, resumen y métricas visibles |

#### Fase C — Cumplimiento en inglés

| ID | Prueba | Resultado esperado |
|---|---|---|
| CALL-11 | “Do not call me again” | Fin inmediato y opt-out persistido |
| CALL-12 | Segundo intento al mismo número | Bloqueado por opt-out |
| CALL-13 | “I want to speak to a human” | Transferencia a número controlado |
| CALL-14 | Disclosure IA | Se reproduce en inglés |
| CALL-15 | Consentimiento de grabación | Se registra decisión antes de grabar/conservar |
| CALL-16 | Rechazo de grabación | No se conserva audio indebidamente |

**Nota:** CALL-11 a CALL-16 se esperan bloqueados o defectuosos con el código
actual. No deben probarse con terceros.

#### Fase D — Estados telefónicos y resiliencia

| ID | Prueba | Resultado esperado |
|---|---|---|
| CALL-17 | Busy | Callback válido y reintento controlado |
| CALL-18 | No answer | Reintento con backoff |
| CALL-19 | Failed/canceled | Sin falso positivo en UI |
| CALL-20 | Buzón/AMD | Clasificación y política correcta |
| CALL-21 | Callback duplicado | Sin llamada/reunión duplicada |
| CALL-22 | Caída del worker | Job permanece recuperable |
| CALL-23 | Caída del motor | Fallo visible y traza completa |
| CALL-24 | Reconexión/corte | Cierre coherente y datos parciales identificados |

#### Fase E — Resultado comercial

| ID | Prueba | Resultado esperado |
|---|---|---|
| CALL-25 | Interesado | Outcome correcto |
| CALL-26 | Reunión aceptada | Una reunión idempotente |
| CALL-27 | No interesado | Sin reunión ni seguimiento incorrecto |
| CALL-28 | Callback solicitado | Tarea/seguimiento correcto |
| CALL-29 | Evaluación | Judge, trace y métricas consultables |
| CALL-30 | Exportación | CSV coherente con la vista |

### Evidencia que debe guardarse por llamada

- ID del caso;
- hora y zona horaria;
- arquitectura;
- versión de motor/modelo/voz;
- agente, campaña y lead de QA;
- SID Twilio;
- ID interno de llamada;
- resultado;
- duración;
- latencia de primer audio;
- latencia por turno;
- número de interrupciones;
- transcript;
- grabación, solo si procede;
- resultado de consentimiento;
- opt-out/transferencia;
- reunión/tarea creada;
- trazas y errores;
- PASS, FAIL o BLOCKED;
- enlace al defecto.

### Métricas de aceptación propuestas

Estas metas deben aprobarse antes de empezar; todavía no existen como benchmark
oficial del producto:

- 10 llamadas internas consecutivas sin pérdida de contexto técnico.
- 0 duplicados de llamada, reunión o tarea.
- 100 % de opt-outs ingleses detectados en el corpus acordado.
- 100 % de transferencias explícitas detectadas.
- 0 grabaciones conservadas contra la política aprobada.
- 100 % de llamadas con traza correlacionable.
- P95 de primer audio y latencia de turno definido y cumplido.
- WER/CER inglés definido para audio PSTN y cumplido.
- 0 secretos o PII innecesaria en logs.

---

## 8. Plan de testing de la semana

### Regla de la semana

La semana es de **testing, clasificación y evidencia**, no de desarrollo de
funcionalidad.

Si aparece un defecto:

1. reproducir una vez;
2. guardar evidencia mínima;
3. clasificar;
4. crear ticket;
5. continuar con otro caso si es seguro;
6. marcar el resto como `BLOCKED` si el defecto impide avanzar.

No corregir y volver a probar dentro de la misma pasada. Las correcciones deben
entrar en una ventana separada de agosto y después pasar regresión.

### Lunes 27 — Llamadas y voz

Objetivo:

- certificar o bloquear telefonía, WebSocket, motor, compliance y persistencia.

Cobertura:

- test web de voz;
- llamada saliente;
- llamada entrante;
- AMD;
- reintentos;
- barge-in;
- transferencia;
- opt-out;
- grabación;
- transcript;
- outcome;
- reunión;
- trazas.

Salida:

- matriz CALL-00 a CALL-30;
- benchmark inicial;
- lista P0/P1;
- decisión sobre modular frente a dúplex.

### Martes 28 — Núcleo CRM y ventas

Módulos:

- Dashboard;
- Leads;
- detalle de lead;
- Pipeline;
- detalle de oportunidad;
- Reuniones;
- detalle de reunión;
- Inteligencia comercial;
- Insights.

Flujos:

- crear lead;
- buscar, filtrar y paginar;
- asignar propietario;
- consentimiento;
- crear oportunidad;
- mover etapa;
- crear/reprogramar/completar reunión;
- tareas y notas;
- atribución;
- estados vacío/error;
- permisos own/team/org;
- exportación;
- recorrido completo en inglés.

### Miércoles 29 — Captación

Módulos:

- Campañas;
- Ads;
- Meta;
- Recetas Ads;
- Prospect Finder;
- Landings;
- Funnel;
- Organic Leads;
- Redes sociales.

Flujos:

- campaña y detalle;
- OAuth en staging;
- draft/publicación pausada;
- presupuesto y aprobación;
- importación de prospectos;
- landing pública y formulario;
- UTMs y atribución;
- Search Console;
- Metricool;
- estados desconectado/vacío/error;
- contenido y errores en inglés.

No activar gasto real salvo cuenta sandbox y límite aprobado.

### Jueves 30 — Conversación, nutrición y conocimiento

Módulos:

- Inbox;
- WhatsApp;
- Email marketing;
- Automatizaciones;
- Growth Hub;
- Orquestador;
- Agentes;
- Playbooks;
- Knowledge Base.

Flujos:

- conversación multicanal;
- reply y ownership;
- consentimiento por canal;
- plantilla/email de prueba;
- bounce/unsubscribe/reply;
- automatización, lease, retry y stop;
- programa y secuencia;
- plan demo frente a live;
- edición persistente de agente;
- upload y artículo;
- uso de conocimiento en agente;
- inglés en estados asíncronos.

### Viernes 31 — Sistema, seguridad, inglés y Go/No-Go

Módulos:

- Login y sesión;
- Configuración;
- Billing/Stripe;
- Control de accesos;
- Gobierno empresarial;
- páginas legales;
- landing/campaña pública;
- 404;
- navegación completa;
- responsive;
- accesibilidad básica;
- observabilidad;
- rollback y recuperación.

Pasada transversal EN:

- todas las rutas;
- loading;
- empty;
- disconnected;
- error;
- validación;
- éxito;
- diálogo;
- tooltip;
- email;
- exportación;
- fecha;
- número;
- moneda;
- zona horaria;
- contenido público;
- permisos.

Salida:

- matriz final;
- defectos abiertos;
- riesgos aceptados;
- recomendación GO/NO-GO;
- ventana de corrección y regresión de agosto.

---

## 9. Matriz de módulos y prioridad

Leyenda:

- **Verde código:** implementación presente y build correcto; no implica E2E.
- **Amarillo:** requiere staging, proveedor o regresión completa.
- **Rojo:** existe bloqueo comprobado para certificar.

| Área | Estado | Prioridad de test | Riesgo principal |
|---|---|---:|---|
| Login/sesión | Amarillo | Alta | Recuperación, sesión real, error EN |
| Dashboard | Amarillo | Media | Estado live/demo y métricas |
| Orquestador | Amarillo | Alta | Aprobación, worker, rollback |
| Campañas | Amarillo | Alta | Persistencia y atribución |
| Ads/Meta | Amarillo | Alta | OAuth, scopes, gasto y callbacks |
| Recetas Ads | Verde código | Media | Permisos admin |
| Redes sociales | Amarillo | Alta | Metricool real |
| Prospect Finder | Amarillo | Alta | Google Places, coste e importación |
| Landings | Amarillo | Alta | Persistencia y formulario público |
| Funnels | Amarillo | Media | Tracking real |
| Organic Leads | Amarillo | Alta | OAuth y propiedad real |
| Inbox | Amarillo | Alta | Canal real, ownership y permisos |
| Llamadas | Rojo | Crítica | Backend 502, cola, compliance EN |
| Agentes | Amarillo | Crítica | Configuración, idioma y policy |
| Playbooks | Amarillo | Alta | Aplicación real en voz |
| Test de voz | Rojo | Crítica | Motor no configurado |
| Email marketing | Amarillo | Alta | Mautic, consentimiento y eventos |
| Automatizaciones | Amarillo | Alta | Worker, retries e idempotencia |
| Growth Hub | Amarillo | Media | Ejecución live |
| Leads | Verde código / Amarillo E2E | Crítica | Scope, consent y call-now |
| Pipeline | Verde código / Amarillo E2E | Alta | Etapas, tareas y atribución |
| Reuniones | Verde código / Amarillo E2E | Alta | Idempotencia y calendario |
| Inteligencia comercial | Amarillo | Media | Datos y permisos combinados |
| Insights | Amarillo | Media | Métricas reales |
| Knowledge Base | Amarillo | Alta | Upload, extracción y uso en agente |
| Configuración | Amarillo | Crítica | Integraciones y preferencias |
| Billing/Stripe | Amarillo | Alta | Checkout, webhook y entitlement |
| Gobierno | Amarillo | Alta | Separación de funciones |
| Access Control | Amarillo | Crítica | RBAC/scopes multi-tenant |
| Páginas públicas | Amarillo | Alta | API, legal, EN y spam |
| Observabilidad | Amarillo | Crítica | Endpoint público y alertas |
| Migraciones | Rojo | Crítica | Baseline/procedencia y staging |

---

## 10. Casos transversales obligatorios por módulo

Cada módulo debe probar:

### Funcional

- [ ] carga inicial;
- [ ] estado vacío;
- [ ] creación;
- [ ] edición;
- [ ] eliminación o desactivación;
- [ ] búsqueda;
- [ ] filtros;
- [ ] paginación;
- [ ] detalle;
- [ ] navegación de vuelta;
- [ ] exportación;
- [ ] reintento;
- [ ] actualización/reload.

### Datos

- [ ] datos reales identificados;
- [ ] demo explícita;
- [ ] cero cifras ficticias no rotuladas;
- [ ] persistencia tras reload;
- [ ] consistencia lista/detalle;
- [ ] zona horaria;
- [ ] moneda;
- [ ] duplicados;
- [ ] límites y paginación.

### Seguridad

- [ ] no autenticado;
- [ ] viewer;
- [ ] sales rep;
- [ ] manager;
- [ ] admin;
- [ ] owner;
- [ ] scope own;
- [ ] scope team;
- [ ] scope org;
- [ ] recurso de otra organización;
- [ ] campos internos inyectados;
- [ ] rate limit;
- [ ] CSRF/cookies donde aplique;
- [ ] logs sin secretos.

### Inglés

- [ ] título;
- [ ] navegación;
- [ ] botones;
- [ ] formulario;
- [ ] placeholder;
- [ ] validación;
- [ ] loading;
- [ ] empty;
- [ ] error;
- [ ] success;
- [ ] modal;
- [ ] tooltip/aria-label;
- [ ] exportación;
- [ ] fecha/número/moneda;
- [ ] email o mensaje externo;
- [ ] volver a ES sin recargar.

### Accesibilidad y responsive

- [ ] teclado;
- [ ] foco visible;
- [ ] Escape en diálogos;
- [ ] foco restaurado;
- [ ] labels;
- [ ] `aria-live`;
- [ ] contraste;
- [ ] 390 px;
- [ ] tablet;
- [ ] escritorio;
- [ ] zoom 200 %;
- [ ] sin overflow horizontal.

---

## 11. Clasificación de defectos

### P0 — Bloquea release

- acceso no autorizado o fuga cross-tenant;
- pérdida/corrupción de datos;
- contacto o gasto sin consentimiento/aprobación;
- grabación indebida;
- opt-out ignorado;
- backend/worker/DB no disponible;
- llamada o mensaje enviado a destinatario incorrecto;
- secreto expuesto;
- pago incorrecto;
- rollback imposible.

### P1 — Debe corregirse antes de release

- acción principal no funciona;
- falso mensaje de éxito;
- texto español visible en flujo inglés principal;
- error sin recuperación;
- duplicado;
- permiso importante desalineado;
- métrica engañosa;
- rendimiento que impide operar;
- accesibilidad que bloquea una tarea.

### P2 — Puede aceptarse de forma explícita

- inconsistencia visual;
- copy menor;
- detalle responsive no bloqueante;
- degradación moderada;
- funcionalidad secundaria incompleta y claramente rotulada.

### P3 — Backlog

- mejora estética;
- optimización menor;
- preferencia no bloqueante.

---

## 12. Plantilla de registro de resultados

Usar una fila por caso:

| Campo | Valor |
|---|---|
| ID | `CALL-05` |
| Fecha/hora | ISO 8601 + zona |
| Build/commit | hash exacto |
| Entorno | staging |
| Organización | ID QA |
| Rol | owner/admin/etc. |
| Locale | en |
| Navegador/dispositivo | versión y viewport |
| Precondición | datos/config |
| Pasos | numerados |
| Esperado | resultado observable |
| Obtenido | resultado real |
| Estado | PASS / FAIL / BLOCKED / NOT RUN |
| Severidad | P0/P1/P2/P3 |
| Evidencia | captura, trace, ID |
| Defecto | enlace |
| Notas | impacto y alcance |

Resumen diario:

| Día | Planificados | PASS | FAIL | BLOCKED | P0 | P1 |
|---|---:|---:|---:|---:|---:|---:|
| Lunes |  |  |  |  |  |  |
| Martes |  |  |  |  |  |  |
| Miércoles |  |  |  |  |  |  |
| Jueves |  |  |  |  |  |  |
| Viernes |  |  |  |  |  |  |

---

## 13. Gates técnicos que deben ejecutarse

### Local/CI

```powershell
npm.cmd run build
node --test scripts/*.test.mjs
node scripts/ops-checks.mjs
npm.cmd run ops:prisma-audit

Set-Location backend
npm.cmd run build
npm.cmd run test:offline
npm.cmd test
```

### Staging read-only

```powershell
node scripts/critical-flows-smoke.mjs --strict
node scripts/staging-e2e.mjs --preflight
```

### Staging mutante

Solo tras confirmar el destino, hash de DB, namespace y límites:

```powershell
node scripts/staging-e2e.mjs --run --confirm-mutations STAGING_ONLY --confirm-providers STAGING_PROVIDERS_ONLY
```

No copiar credenciales ni URL de producción en las variables E2E.

### Producción

```powershell
npm.cmd run ops:production-gate
```

No usar el gate para aplicar migraciones sin backup, ventana y confirmación
explícita.

---

## 14. Criterios de GO para lanzamiento en agosto

El lanzamiento en inglés solo obtiene GO si:

### Código y CI

- [ ] Frontend build PASS sin warning de presupuesto no aceptado.
- [ ] Backend build PASS.
- [ ] Tests raíz 100 % PASS.
- [ ] Tests offline 100 % PASS.
- [ ] Suite de integración 100 % PASS con DB aislada.
- [ ] Tests i18n automáticos añadidos y PASS.
- [ ] Cero P0.
- [ ] Cero P1.
- [ ] P2 aceptados por escrito.

### Datos y despliegue

- [ ] 20 migraciones aplicables desde cero.
- [ ] Procedencia de baseline resuelta.
- [ ] Staging representativo.
- [ ] Production gate PASS.
- [ ] Health/live/ready PASS.
- [ ] Workers con heartbeat.
- [ ] Backups y rollback probados.
- [ ] Alertas externas activas.

### Inglés

- [ ] 100 % de rutas revisadas en EN.
- [ ] Cero copy español del sistema en flujos EN.
- [ ] Errores de API mapeados a mensajes EN.
- [ ] Fechas, números, moneda y zona horaria correctos.
- [ ] Emails, mensajes y páginas públicas revisados.
- [ ] Branding y `<title>` definitivos.
- [ ] Legal y privacidad revisados para mercado objetivo.

### Llamadas

- [ ] Backend, worker, Twilio y motor estables.
- [ ] Corpus inglés.
- [ ] Opt-out inglés.
- [ ] Transferencia inglesa.
- [ ] Disclosure inglés.
- [ ] Consentimiento de llamada/grabación cerrado.
- [ ] Inbound y outbound.
- [ ] Busy/no-answer/failed.
- [ ] AMD.
- [ ] Barge-in.
- [ ] Reunión y tareas idempotentes.
- [ ] Trazas y métricas.
- [ ] Benchmark aprobado.
- [ ] Coste y concurrencia medidos.

### Seguridad y operación

- [ ] Cross-tenant y RBAC PASS.
- [ ] Webhooks firmados.
- [ ] Rate limits.
- [ ] Secret scanning.
- [ ] Sin secretos versionados.
- [ ] Plan de incidentes.
- [ ] Responsable on-call.
- [ ] Soporte en inglés.
- [ ] Runbook y rollback ensayados.

---

## 15. Resultado recomendado al cierre de esta revisión

### Para mañana

**No iniciar todavía una llamada real desde la plataforma.**

Primero:

1. recuperar el backend público o desplegar staging;
2. obtener readiness verde;
3. configurar Twilio, worker y motor;
4. preparar campaña, agente y leads internos;
5. comprobar cola y trazas;
6. ejecutar CALL-00 a CALL-04;
7. solo entonces pasar a telefonía.

### Para la semana

Proceder con el plan de testing, registrando como `BLOCKED` todo flujo que dependa
de un proveedor o entorno no disponible. El valor de la semana no es “hacer que
parezca que funciona”, sino obtener una matriz honesta y reproducible.

### Para agosto

Abrir una ventana de:

1. corrección de P0/P1;
2. regresión completa;
3. ensayo de rollback;
4. revisión legal/operativa;
5. Go/No-Go final.

La plataforma tiene suficiente amplitud para preparar un lanzamiento, pero el
estado actual debe describirse como **candidato avanzado no certificado**, no
como producción inglesa lista.

---

## 16. Documentos y código de referencia

- [`src/App.jsx`](../src/App.jsx)
- [`src/i18n/index.js`](../src/i18n/index.js)
- [`src/i18n/legacyDomTranslation.js`](../src/i18n/legacyDomTranslation.js)
- [`src/components/Calls.jsx`](../src/components/Calls.jsx)
- [`src/pages/VoiceTestPage.jsx`](../src/pages/VoiceTestPage.jsx)
- [`backend/src/jobs/leadCallDispatch.ts`](../backend/src/jobs/leadCallDispatch.ts)
- [`backend/src/routes/voice.ts`](../backend/src/routes/voice.ts)
- [`backend/src/voice/compliance.ts`](../backend/src/voice/compliance.ts)
- [`backend/src/voice/telephony/twilioClient.ts`](../backend/src/voice/telephony/twilioClient.ts)
- [`backend/src/voice/telephony/mediaStream.ts`](../backend/src/voice/telephony/mediaStream.ts)
- [`voice-engine/README.md`](../voice-engine/README.md)
- [`PRODUCCION_RUNBOOK.md`](PRODUCCION_RUNBOOK.md)
- [`PRODUCTION_READINESS_MATRIX.md`](PRODUCTION_READINESS_MATRIX.md)
- [`STAGING_E2E_HARNESS.md`](STAGING_E2E_HARNESS.md)
- [`CRITICAL_FLOWS_SMOKE_TEST.md`](CRITICAL_FLOWS_SMOKE_TEST.md)
- [`AUDITORIA_COMPLETA_SISTEMA_2026-07-25.md`](AUDITORIA_COMPLETA_SISTEMA_2026-07-25.md)

