# Credenciales que faltan para que la plataforma funcione

Estado a 9 de agosto de 2026.

El código de la plataforma está construido y probado. Lo que no está es
**conectado**: `backend/.env` tiene hoy las credenciales del motor de voz
(Deepgram, ElevenLabs, Cerebras, Qwen Omni, Twilio a medias) y ninguna de las
demás. Sin ellas, cada módulo arranca, se dibuja y declara honestamente que no
tiene datos — que es lo que está diseñado para hacer, pero no es un producto
que se pueda usar con un cliente.

Este documento existe para que alguien que no ha escrito el código pueda ir a
conseguir cada credencial. Por cada una: qué es, qué desbloquea, dónde se pide,
qué cuesta y cuánto tarda.

**Cómo comprobar el estado en cualquier momento:** la plataforma tiene un
endpoint que lo dice por ti.

```
GET /integrations         → estado de cada proveedor
GET /integrations/ready   → apto/no apto para arrancar
```

Devuelve `not_configured`, `configured`, `healthy` o `degraded` por proveedor,
y nunca devuelve el valor de un secreto. Úsalo como lista de la compra.

---

## Resumen: qué desbloquea cada una

Ordenado por retorno sobre esfuerzo, no por importancia teórica.

| # | Credencial | Desbloquea | Dificultad | Coste |
|---|---|---|---|---|
| 1 | `CLAUDE_API_KEY` | Motor de contenido, detector de oportunidades, análisis SEO con IA | Trivial | Por uso |
| 2 | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` | Llamadas reales, y con ellas las transcripciones que alimentan todo lo demás | Trivial | Por minuto |
| 3 | `GOOGLE_PLACES_API_KEY` | Buscador de prospectos | Baja | Por consulta |
| 4 | `PSI_API_KEY` | Core Web Vitals en la auditoría SEO | Baja | Gratis |
| 5 | `APP_URL` / `FRONTEND_URL` | Enlaces correctos en emails, Stripe, chequeo de salud de landings | Trivial | Gratis |
| 6 | `GOOGLE_OAUTH_CLIENT_ID` + `_SECRET` | GA4, Search Console y Perfil de Empresa | **Alta** — revisión de Google | Gratis |
| 7 | `META_APP_ID` + `META_APP_SECRET` | Todo el módulo de Ads | **Alta** — App Review | Gratis (el gasto es el anuncio) |
| 8 | `METRICOOL_USER_TOKEN` + ids | Publicar en redes sociales | Media | Plan de pago |
| 9 | `MAUTIC_BASE_URL` + OAuth | Envío de emails | **Alta** — hay que montar el servidor | Hosting |
| 10 | `STRIPE_SECRET_KEY` | Cobrar suscripciones | Baja | Comisión por cobro |

---

## 1. `CLAUDE_API_KEY` — la más rentable de todas

**Qué es.** Una clave de la API de Anthropic. La plataforma la usa para todo lo
que piensa: redactar posts y artículos, criticarlos y reescribirlos, detectar
oportunidades en las transcripciones de llamadas, extraer la voz del dueño del
negocio y la parte con IA de la auditoría SEO.

**Qué muere hoy sin ella.** El motor de contenido completo (las seis piezas por
oportunidad), el Radar de oportunidades, `contentCritic`, `ownerVoice` y el
análisis SEO inteligente. Es una sola clave que desbloquea tres módulos.

**Dónde se pide.** [console.anthropic.com](https://console.anthropic.com) →
crear cuenta → *API Keys* → *Create Key*. Hay que añadir método de pago y
cargar saldo; no hay plan gratuito de API.

**Coste.** Pago por uso, por tokens consumidos. El propio roadmap ya avisa del
patrón de gasto: el análisis semanal es una pasada por organización, y generar
una campaña son 1 llamada de redacción + 5 de crítica lanzadas en paralelo.
Empieza con un tope de gasto bajo en la consola y súbelo cuando sepas el
consumo real.

**Tiempo.** 10 minutos.

```
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=            # ya configurado
CLAUDE_TIMEOUT_SECONDS=  # ya configurado
```

---

## 2. `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` — el bucle que hace única a la plataforma

**Qué es.** Las credenciales de la cuenta de Twilio, el proveedor de telefonía.
`TWILIO_FROM_NUMBER` ya está puesto en el `.env` — es decir, hay un número
comprado, pero faltan las credenciales para poder usarlo.

**Por qué importa más de lo que parece.** El motor de voz ya está entero:
Deepgram transcribe, Cerebras responde, ElevenLabs habla, y el motor propio en
RunPod está configurado. Lo único que falta para que el sistema llame de verdad
son estas dos líneas.

Y hay un efecto en cadena: **sin llamadas no hay transcripciones, y sin
transcripciones el Radar de oportunidades está vacío.** Es un riesgo ya
confirmado y documentado — la organización local tiene 108 llamadas y cero
transcripciones, así que el detector de oportunidades no tiene materia prima.
Conectar Twilio cierra el bucle completo: llamar → transcribir → detectar
oportunidad → redactar contenido → publicar → medir.

**Dónde se pide.** [console.twilio.com](https://console.twilio.com) → la
portada del panel muestra *Account SID* y *Auth Token* directamente. Si el
número ya está comprado, la cuenta ya existe y solo hay que entrar a copiarlos.

**Coste.** Por minuto de llamada y por número al mes. Es el coste variable
principal del producto.

**Tiempo.** 5 minutos si la cuenta ya existe.

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=      # ya configurado
TWILIO_WEBHOOK_BASE_URL= # apunta al PUBLIC_HOST, ya configurado
```

> **Para una agencia con varios clientes:** existe `TWILIO_ORG_CONFIG_JSON`, un
> mapa JSON de credenciales por organización, para que cada cliente llame desde
> su propio número y su propia cuenta. Lo mismo para Metricool
> (`METRICOOL_ORG_CONFIG_JSON`) y Mautic (`MAUTIC_ORG_CONFIG_JSON`). Es una
> solución provisional hasta que haya una tabla de credenciales con bóveda; los
> valores nunca se devuelven por las APIs de salud.

---

## 3. `GOOGLE_PLACES_API_KEY` — literalmente, conseguir clientes

**Qué es.** Una clave de la Places API de Google. Es lo que alimenta el buscador
de prospectos: buscar negocios por sector y zona, con su teléfono y su ficha.

**Por qué es relevante para ti.** Es la función que sirve para lo que
preguntaste: encontrar negocios a los que ofrecer los servicios de la agencia.
Hoy la pantalla existe y no busca nada.

**Dónde se pide.** [console.cloud.google.com](https://console.cloud.google.com)
→ crear proyecto → *APIs y servicios* → habilitar **Places API (New)** → 
*Credenciales* → *Crear credenciales* → *Clave de API*. Restringe la clave a esa
API y a la IP del servidor.

La plataforma llama a `https://places.googleapis.com/v1/places`, es decir, la
versión nueva de la API. Habilita **Places API (New)**, no la antigua.

**Coste.** Por consulta, con capa gratuita mensual. Requiere activar facturación
en el proyecto de Google Cloud aunque no llegues a pagar.

**Tiempo.** 20 minutos.

---

## 4. `PSI_API_KEY` — gratis, quince minutos

**Qué es.** Clave de la API de PageSpeed Insights, que devuelve los Core Web
Vitals de una URL. La auditoría SEO ya tiene el panel preparado para
enseñarlos.

**Dónde se pide.** El mismo proyecto de Google Cloud del punto anterior →
habilitar **PageSpeed Insights API** → crear clave de API. La plataforma llama a
`https://www.googleapis.com/pagespeedonline/v5/runPagespeed`.

**Coste.** Gratis dentro de cuotas generosas.

**Tiempo.** 15 minutos, aprovechando el proyecto ya creado.

---

## 5. `APP_URL` y `FRONTEND_URL` — no se piden a nadie, se escriben

**Qué son.** Las direcciones públicas de la aplicación. No hay que conseguirlas
en ningún sitio: son configuración que nadie ha rellenado.

**Qué rompen hoy:**

| Variable | Dónde se usa | Consecuencia de que falte |
|---|---|---|
| `APP_URL` | `securityConfig`, `billing.service`, `metaCampaignBuilder`, `metricoolSync` | En desarrollo cae a `http://localhost:5173`; **en producción se queda vacía**. Stripe no sabe a dónde devolver al usuario tras pagar. |
| `FRONTEND_URL` | `campaigns.controller`, `landingHealth.service`, `orchestration.adapters` | El chequeo de salud técnica de las landings **se salta y lo declara**. Enlaces de campaña sin dominio. |
| `PUBLIC_HOST` | webhooks de Twilio, medios generados, enlace de aprobación | Ya configurado. |

**Nota sobre el enlace de aprobación.** El roadmap dice que la URL de la sala de
aprobación se compone con `PUBLIC_APP_URL` o `PUBLIC_HOST`; el código
(`contentStudio.controller`) usa solo `PUBLIC_HOST`, que ya está puesto. No hay
nada que hacer aquí, pero conviene saberlo si alguien busca `PUBLIC_APP_URL` y
no la encuentra.

**Tiempo.** 2 minutos.

```
APP_URL=https://tu-dominio.com
FRONTEND_URL=https://tu-dominio.com
```

---

## 6. `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` — la puerta al orgánico

**Qué es.** Una aplicación OAuth de Google, para que cada cliente autorice a la
plataforma a leer *sus* datos. No es una clave de API: es un flujo en el que el
dueño del negocio da permiso.

**Qué desbloquea.** El módulo orgánico entero:

| API | Para qué | Scope |
|---|---|---|
| Analytics Data + Admin (v1beta) | Sesiones orgánicas por página y día | `analytics.readonly` |
| Search Console (v3) | Consultas, posiciones e impresiones | `webmasters.readonly` |
| Business Profile Performance (v1) | Vistas de ficha, llamadas, clics al sitio | `business.manage` |
| Business Information + Account Management (v1) | Datos de la ficha | `business.manage` |
| My Business **v4** | Reseñas sin responder | `business.manage` |

**Aquí está la dificultad.** Los tres scopes son **sensibles o restringidos**, y
Google exige verificación de la aplicación antes de que la puedan usar usuarios
que no sean tú: pantalla de consentimiento, política de privacidad publicada,
justificación de cada scope y, para los restringidos, a veces una auditoría de
seguridad. Puede llevar semanas.

Además, **My Business API v4 es de acceso restringido**: hay que solicitarlo
aparte y Google puede denegarlo. La plataforma ya contempla esa negativa — si
la rechazan, la sincronización de métricas no se rompe y declara
`reviews.status: 'unavailable'` con el motivo.

**Atajo mientras tanto.** En modo de prueba puedes añadir hasta 100 usuarios de
test sin verificación. Para la organización demo y para tus primeros clientes
es suficiente. La verificación solo hace falta para abrirlo al público.

**Dónde se pide.** Google Cloud Console → *APIs y servicios* → habilitar las
cinco APIs de la tabla → *Pantalla de consentimiento de OAuth* → *Credenciales*
→ *ID de cliente de OAuth* → tipo *Aplicación web* → añadir la URI de
redirección.

**Coste.** Gratis.

**Tiempo.** 1 hora de configuración; semanas si necesitas la verificación.

```
GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_BASE_URL=https://tu-dominio.com
ORGANIC_TOKEN_ENCRYPTION_KEY=   # ya configurado
```

---

## 7. `META_APP_ID` y `META_APP_SECRET` — Ads no existe sin esto

**Qué es.** Una aplicación de Meta for Developers. Igual que Google, es un flujo
OAuth: cada cliente conecta su cuenta publicitaria.

**Qué desbloquea.** El módulo de Ads completo. Hoy `metaAccounts.controller`
comprueba estas dos variables en la primera línea y corta si faltan.

**Permisos que pide la plataforma** (Graph API v23.0):

`ads_management` · `ads_read` · `business_management` · `leads_retrieval` ·
`pages_manage_ads` · `pages_manage_metadata` · `pages_read_engagement` ·
`pages_show_list`

**Aquí está la dificultad.** Casi todos son permisos avanzados que exigen **App
Review**: cuenta de desarrollador verificada, verificación del negocio,
grabación en vídeo del flujo completo, política de privacidad y explicación de
por qué necesitas cada permiso. `leads_retrieval` y `ads_management` son de los
más escrutados.

**Estado real del código.** El documento de Ads es explícito: *"Nada de esto ha
hablado nunca con Meta."* El guardarraíl `meta_credentials` bloquea siempre
porque no hay token. La llamada al Graph API, la relectura del estado remoto y
la compensación están escritas y con pruebas de bloqueo, pero no ejecutadas ni
una vez. Lo mismo para la Conversions API: consentimiento, hasheo y
deduplicación probados, ninguna señal enviada.

Esto significa que conectar Meta no es solo pegar dos claves: **es el primer
momento en que sabrás si Meta contesta lo que la plataforma espera.** Reserva
tiempo para depurar.

**Dónde se pide.** [developers.facebook.com](https://developers.facebook.com) →
*Mis aplicaciones* → crear app de tipo *Empresa* → *Configuración* → *Básica*
para el ID y el secreto → *Marketing API* y *Inicio de sesión de Facebook* como
productos.

**Coste.** La app es gratis; el gasto es la inversión publicitaria del cliente.

**Tiempo.** 1 hora de configuración; semanas de App Review.

```
META_APP_ID=...
META_APP_SECRET=...
META_OAUTH_REDIRECT_URI=https://tu-dominio.com/...
META_GRAPH_API_VERSION=v23.0
META_WEBHOOK_VERIFY_TOKEN=      # inventado por ti, tiene que coincidir en Meta
META_TOKEN_ENCRYPTION_KEY=      # ya configurado
```

---

## 8. `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID`

**Qué es.** Metricool es la herramienta de publicación en redes. La plataforma
no habla con Instagram ni LinkedIn directamente: crea borradores en Metricool y
desde ahí se publican. Llama a `https://app.metricool.com/api` con la cabecera
`X-Mc-Auth`.

**Qué desbloquea.** Publicar posts, carruseles y stories; subir imágenes;
generar imágenes con IA desde la pantalla de Conectar Redes.

**Dónde se pide.** Dentro de tu cuenta de Metricool, en la configuración de la
marca. El acceso a la API requiere plan de pago. `BLOG_ID` identifica la marca
concreta, así que si gestionas varios clientes cada uno tiene el suyo — para eso
está `METRICOOL_ORG_CONFIG_JSON`.

**Sin verificar.** El tipo `STORY` de Instagram sigue la nomenclatura del resto
del payload pero **no se ha comprobado contra la API real**. Es lo primero que
hay que probar al conectar.

**Coste.** Suscripción de Metricool con acceso a API.

**Tiempo.** 30 minutos si ya tienes cuenta con plan adecuado.

---

## 9. `MAUTIC_BASE_URL`, `MAUTIC_CLIENT_ID`, `MAUTIC_CLIENT_SECRET`, `MAUTIC_WEBHOOK_SECRET`

**Qué es.** Mautic es una herramienta de email marketing de código abierto. A
diferencia de las demás, **no es un servicio al que te suscribes: es software
que hay que instalar en un servidor.** Por eso `MAUTIC_BASE_URL` es una URL y no
una clave — apunta a tu propia instalación.

**Qué desbloquea.** El envío de emails y las plantillas que el motor de
contenido crea al aprobar una pieza.

**Qué hay que hacer.** Montar Mautic en un servidor con dominio y HTTPS, crear
dentro una credencial OAuth2 y copiar el ID y el secreto. La plataforma valida
que la URL sea pública y comprueba la salud pidiendo un token contra
`/oauth/v2/token`.

**Coste.** El software es gratuito; pagas el hosting.

**Tiempo.** Medio día si sabes montar un servidor. Es la credencial que más
trabajo cuesta y la que menos desbloquea de las que faltan — **déjala para el
final.**

---

## 10. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`

**Qué es.** Stripe cobra las suscripciones. La facturación autogestionada ya
está construida (commit `75cad29`).

**Cuándo hace falta.** Solo cuando vayas a cobrar a alguien dentro de la
plataforma. Si facturas a tus clientes de agencia por fuera —transferencia,
otra herramienta— esto no te bloquea nada.

**Dónde se pide.** [dashboard.stripe.com](https://dashboard.stripe.com) →
*Desarrolladores* → *Claves de API* para la clave secreta; *Webhooks* para el
secreto de firma; *Productos* para crear el precio y copiar su ID en
`STRIPE_PRICE_PRO`. Empieza en modo test (`sk_test_...`).

**Ojo:** `billing.service` compone la URL de retorno con `APP_URL`. Sin el punto
5, el cliente paga y no vuelve a ningún sitio.

**Coste.** Comisión por transacción.

**Tiempo.** 1 hora.

---

## Orden recomendado

**Esta semana** — coste bajo, retorno inmediato:

1. `CLAUDE_API_KEY`
2. `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`
3. `APP_URL` + `FRONTEND_URL`
4. Aplicar las 21 migraciones pendientes:
   ```powershell
   cd backend; npm run db:generate; npx prisma migrate deploy
   ```

Con eso la plataforma llama, transcribe, detecta oportunidades y redacta. Es un
producto demostrable de verdad, no una interfaz sobre datos sembrados.

**Después** — Google Cloud, en una sola sesión:

5. `GOOGLE_PLACES_API_KEY` y `PSI_API_KEY` (mismo proyecto, ambas fáciles)
6. `GOOGLE_OAUTH_CLIENT_ID` + `_SECRET` en modo prueba con usuarios de test

**Cuando haya un cliente que lo pida:**

7. `META_APP_ID` + `META_APP_SECRET` — empieza el App Review pronto, tarda
8. `METRICOOL_*`
9. `STRIPE_*`
10. `MAUTIC_*`

---

## Dos avisos

**Los secretos de relleno se rechazan.** `integrationRuntime.ts` mantiene una
lista de valores inseguros (`changeme`, `secret`, los textos de ejemplo del
`.env.example`) y marca la integración como degradada si los encuentra. No sirve
poner un valor cualquiera para que deje de quejarse.

**Conectar no es terminar.** Las tres integraciones grandes —Meta, Google,
Metricool— nunca se han ejecutado contra la plataforma real. Están escritas
contra la documentación y probadas contra una base de datos sembrada. El día que
pongas las claves empieza el trabajo de comprobar que la otra parte contesta lo
que esperamos, y ese trabajo no está hecho ni se puede estimar hasta empezarlo.
