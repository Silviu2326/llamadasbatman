# Plan de implementación: cerrar VozIA/Vendrava con Postiz + Mautic

*Plan de acción concreto, no otro documento de visión. Parte de lo que ya dice
[`PLATAFORMA_EXPLICACION_GENERAL.md`](./PLATAFORMA_EXPLICACION_GENERAL.md) (secciones 5 "Anuncios
en Meta" y 7 "Email marketing") y de la visión ya escrita en
[`FUSION_VOZIA_VENDRAVA_POSTIZ_MAUTIC.md`](./FUSION_VOZIA_VENDRAVA_POSTIZ_MAUTIC.md). No repite esos
documentos — los convierte en tareas con orden, archivos concretos y decisiones ya resueltas
(sección 2).*

---

## 0. Principio rector

**No se reconstruye lo que Postiz y Mautic ya hacen bien.** El calendario de redes sociales y el
motor de email marketing de `PLATAFORMA_EXPLICACION_GENERAL.md` (secciones 5 y 7) se cubren
desplegando esos dos proyectos tal cual, no escribiendo un scheduler de posts o un motor de
secuencias de email propio. VozIA/Vendrava aporta el CRM, los leads, el motor de voz y las
campañas de Meta — Postiz y Mautic aportan redes y email. Se conectan por API/webhook.

Lo único que se construye a medida es el **pegamento**: sincronización de contactos, disparo de
publicaciones desde el copy/imagen que VozIA ya genera, y que el comercial vea todo en una sola
ficha de lead.

## 1. Punto de partida real (verificado, no supuesto)

- El backend (`backend/src/`) no tiene ninguna referencia a Postiz ni Mautic todavía (`grep -i
  postiz|mautic` solo encuentra el documento de visión). Se arranca de cero en la integración.
- Ya existe el patrón exacto que hace falta reusar: `ingestLead()` en
  `backend/src/services/leadIngestion.service.ts` es el punto único de entrada para "un lead nuevo
  entra → se crea → se encola la llamada → se notifica a Meta". Mautic y Postiz se enganchan al
  mismo patrón (entrada y salida de eventos), no a uno nuevo.
- El generador de contenido con IA para anuncios ya existe (`assetGenerator.service.ts`, copy +
  imagen con `gpt-image-1`) — es el mismo contenido que puede alimentar un post orgánico en Postiz,
  no hay que generarlo dos veces.
- `Organization` ya es el tenant raíz de todo el schema (Prisma) — cualquier credencial de Postiz/
  Mautic por cliente cuelga de `Organization`, igual que `MetaAdAccount`.
- No hay `docker-compose` en el repo todavía. Postiz (Node + Redis + Temporal + Postgres) y Mautic
  (PHP + MySQL) necesitan su propia infraestructura — no corren "dentro" del backend actual.
- El roadmap de VozIA core (`ROADMAP_100_PORCIENTO.md`) está prácticamente cerrado pero **sin
  commitear y sin migraciones aplicadas** (`backend/prisma/migrations` no existe). Esto es
  bloqueante: no tiene sentido levantar Mautic/Postiz sobre una base que todavía no corrió
  `prisma migrate dev`. Es la tarea 0 real, aunque no sea parte de este documento.

## 2. Decisiones tomadas

Las cuatro preguntas que cambian el orden de las fases, ya resueltas — el resto del documento se
escribe asumiendo estas respuestas:

1. **Self-hosted, bajo la propia infraestructura de Vendrava.** Es la única opción consistente con
   la promesa repetida en `VENDRAVA_PEAK.md` ("datos en casa", "no es un SaaS cerrado"). Una cuenta
   gestionada de terceros contradice el propio pitch del producto. Subdominios
   `social.vendrava.com` / `email.vendrava.com` tal como propone
   `FUSION_VOZIA_VENDRAVA_POSTIZ_MAUTIC.md`.
2. **Una sola instancia compartida de cada uno, multi-tenant a nivel aplicación — no una instancia
   por cliente.** Levantar un MySQL+PHP (Mautic) y un Postgres+Redis+Temporal (Postiz) por cada
   cliente nuevo no escala operativamente (parchear, monitorear y respaldar N instancias). La
   frontera de tenant se resuelve dentro de la app, no con infraestructura duplicada:
   - **Postiz**: usa su propio concepto nativo de "workspace" — un workspace por `Organization`,
     una sola instalación. No hace falta decisión adicional, la herramienta ya lo resuelve.
   - **Mautic**: no tiene multi-tenant nativo con aislamiento fuerte, así que el aislamiento se
     hace con lo que ya tiene: un grupo de permisos (`Permission Group`) + una "Company"/tag por
     `Organization`, y todo sync desde el backend pasa siempre el identificador de organización.
     Es más trabajo de configuración que una instancia dedicada, pero evita multiplicar stacks. Si
     algún cliente exige aislamiento físico de datos por contrato, ese cliente puntual pasa a tener
     su propia instancia — la excepción, no la regla de partida.
3. **Regla de selección del piloto, no un nombre fijo de antemano**: el primer cliente de Mautic y
   el primer cliente de Postiz se eligen con este criterio, en este orden — (a) ya está en el plan
   que incluye el módulo (ver punto 4), (b) es un cliente activo y de bajo riesgo de soporte (no el
   más nuevo ni el más exigente), (c) su modelo de negocio encaja con el módulo (sección 7.1 de
   `PLATAFORMA_EXPLICACION_GENERAL.md`: negocios B2B/asesorías para email, negocios con marca activa
   en redes para Postiz). El nombre concreto lo define quien opera el negocio en el momento de
   ejecutar la Fase 2/3 — no hay datos de clientes reales en este repo para fijarlo hoy.
4. **Sí, entra solo en Plan Completo desde el día 1.** `VENDRAVA_PEAK.md` ya lo define así, y el
   campo `Organization.plan` ya existe y ya se lee en `dashboard.service.ts` — el gating es leer ese
   mismo campo, cero costo adicional de modelo. No tiene sentido construir las pantallas antes que
   el check: se implementa a la vez que cada pantalla nueva (Fase 2 y Fase 3), no se aplaza a la
   Fase 4.

## 3. Fase 1 — Infraestructura base (una sola vez)

- `docker-compose.yml` nuevo (no existe ninguno hoy) con dos stacks aparte del backend actual:
  - Mautic + MySQL.
  - Postiz + Postgres + Redis + Temporal.
- Variables de entorno nuevas en `backend/.env.example`: `MAUTIC_BASE_URL`, `MAUTIC_CLIENT_ID`,
  `MAUTIC_CLIENT_SECRET`, `POSTIZ_BASE_URL`, `POSTIZ_API_KEY` — mismo patrón que ya existe para
  Meta (`META_APP_ID`/`META_APP_SECRET` en `metaAccounts.controller.ts`).
- Nada de esto se conecta todavía a la UI. Es solo levantar los dos servicios y confirmar que
  responden a su propia API.

## 4. Fase 2 — Mautic (email marketing): primero por ser el de menor esfuerzo

Se prioriza sobre Postiz porque `PLATAFORMA_EXPLICACION_GENERAL.md` sección 7 ya describe el
comportamiento exacto que Mautic resuelve de fábrica (segmentación por estado, reactivación,
tracking de apertura/clic), y porque el punto de enganche (un contacto que entra/cambia de estado)
ya existe en el código: `ingestLead()` y las transiciones de `Lead.status`.

Tareas concretas:

1. **Modelo nuevo**: una sola instancia de Mautic para todos los clientes (decisión 2.2), así que
   no hace falta guardar URL/credenciales por `Organization` — solo `Organization.mauticCompanyId`
   (o `mauticSegmentId`) para saber a qué Company/segmento de esa instancia pertenece cada
   organización, más `Organization.mauticEnabled` para el gating de plan (punto 4). Las credenciales
   de la API (client id/secret) van en `backend/.env`, compartidas, igual que ya son compartidas
   `META_APP_ID`/`META_APP_SECRET`.
2. **Gating por plan**: check `Organization.plan === 'Completo' && Organization.mauticEnabled` antes
   de renderizar la pestaña "Email" y antes de aceptar el webhook — se agrega ahora, junto con esta
   pantalla, no se pospone.
3. **Sync de contacto (CRM → Mautic)**: en `ingestLead()` y en el cambio de `Lead.status`
   (`leads.service.ts`), hacer upsert del contacto en Mautic vía su API REST
   (`POST /api/contacts/new`, `PATCH /api/contacts/:id/edit`). Un solo punto de salida, igual que
   `sendLeadEvent()` ya hace con Meta Conversions API — se puede literalmente calcar ese archivo
   (`metaConversions.service.ts`) como plantilla para `mauticSync.service.ts`.
4. **Segmento = estado del embudo**: mapear cada `Lead.status` (Nuevo/Contactado/
   Interesado/Reunión agendada/Negociación) a un "segment" de Mautic, para que las campañas de
   email de Mautic (ya configuradas ahí, no en VozIA) disparen solas por segmento.
5. **Webhook de vuelta (Mautic → CRM)**: Mautic soporta webhooks nativos de
   `email.open` / `page.hit` (clic). Nuevo endpoint `POST /api/webhooks/mautic` (mismo patrón que
   `metaWebhooks.ts`) que actualiza la ficha del lead — esto es lo que la sección 7.3 de
   `PLATAFORMA_EXPLICACION_GENERAL.md` promete ("el comercial ve si abrió el email").
6. **UI**: una pestaña "Email" en `LeadDetailPage.jsx` (aperturas/clics, igual que ya existe la
   pestaña de llamadas) + en `Automatizaciones.jsx` la opción "enviar a segmento de Mautic" como
   una acción más, sin rediseñar el módulo de automatizaciones existente.
7. **Disparo manual**: botón "Enviar plantilla" en la ficha del lead que llama
   `POST /api/emails/campaigns/:id/send` de Mautic para un contacto puntual (sección 7.3, "también
   se puede disparar manualmente").

No se construye: editor de plantillas de email, motor de secuencias, ni lógica de segmentación
propia — eso ya lo tiene Mautic y sería reinventarlo.

## 5. Fase 3 — Postiz (redes sociales / marketing orgánico)

Se hace después de Mautic porque tiene más piezas móviles operativas (Temporal) y porque su punto
de enganche depende de contenido que hoy ya genera el módulo de anuncios.

1. **Conectar cuentas sociales**: pantalla nueva (`ConectarRedesPage.jsx`, mismo patrón que
   `MetaAccountPage.jsx` ya usado para Meta) que hace el OAuth de cada red vía la propia API de
   Postiz (Postiz ya resuelve el OAuth de Instagram/LinkedIn/X internamente, no hay que
   reimplementarlo). Cada `Organization` es un workspace de Postiz (decisión 2.2) — el workspace se
   crea la primera vez que la organización conecta una red.
2. **Gating por plan**: mismo check que en Mautic — `Organization.plan === 'Completo' &&
   Organization.postizEnabled` antes de mostrar "Conectar redes" — se agrega junto con esta
   pantalla, no en la Fase 4.
3. **Reusar generación de contenido**: cuando `assetGenerator.service.ts` genera copy + imagen para
   un anuncio de Meta, ofrecer el mismo par copy/imagen como borrador de post orgánico en Postiz
   (`POST /posts` de la API de Postiz) — un solo botón "programar también como post orgánico" en el
   wizard de campaña (`AdsWizardPage.jsx`), no un generador de contenido paralelo.
4. **Calendario embebido o vía API**: decidir si la pestaña "Redes" del CRM embebe el propio
   calendario de Postiz (iframe con SSO) o si se replica una vista simplificada consumiendo su API
   de `GET /posts`. Para el MVP, iframe es la opción de menor esfuerzo (rung 4 de la escalera:
   dependencia ya instalada resuelve el problema, no hay que construir un calendario de posts
   propio).
5. **Métricas**: `GET /analytics` de Postiz alimenta la sección de Insights/Dashboard (alcance,
   interacciones) que ya describe la sección 8.2 de `PLATAFORMA_EXPLICACION_GENERAL.md`.
6. **Webhook de interacción → bandeja de conversaciones**: si Postiz expone eventos de
   comentario/DM, enrutarlos al mismo lugar donde hoy llegarían leads (`ingestLead()` con
   `source: "social"`), en vez de crear una bandeja de conversaciones nueva y separada.

No se construye: scheduler de publicaciones, editor de calendario, ni conectores OAuth por red
social — eso ya lo resuelve Postiz.

## 6. Fase 4 — Unificación de experiencia (un solo panel, una sola marca)

Solo después de que Mautic y Postiz funcionen cada uno por separado:

- **SSO único**: un solo login de Vendrava que también autentica contra Mautic (API OAuth2 ya
  soporta client credentials) y contra Postiz (API key por organización) — el usuario nunca ve un
  segundo login.
- **ID maestro de contacto**: definir explícitamente qué campo es la clave de sincronización entre
  `Lead.id` (CRM), el contacto de Mautic y el contacto de Postiz (si aplica). Decidido: usar el
  mismo `Lead.id` como campo custom en Mautic (`crm_lead_id`) desde el primer sync, no intentar
  hacer matching por email/teléfono después — es la causa de bugs de duplicado más probable, ya
  señalada como riesgo en `FUSION_VOZIA_VENDRAVA_POSTIZ_MAUTIC.md`.
- **Gating por plan**: ya implementado desde la Fase 2/3 (decisión 2.4) — en la Fase 4 no hay nada
  nuevo que hacer en esto, solo verificar que ambos checks (`mauticEnabled`/`postizEnabled`) sigan
  atados a `Organization.plan` y no se hayan quedado huérfanos.

## 7. Orden priorizado (impacto / esfuerzo)

1. Cerrar y commitear `ROADMAP_100_PORCIENTO.md` (migraciones de Prisma aplicadas) — no depende de
   Postiz/Mautic pero es requisito para no levantar esto sobre una base inestable.
2. Fase 1 (infra) + Fase 2 (Mautic) — mayor impacto de negocio (nurturing, ya prometido en la
   sección 7 de la plataforma) con menor esfuerzo técnico (API REST simple, sin OAuth social).
3. Fase 3 (Postiz) — impacto real pero más esfuerzo operativo (Temporal, OAuth por red social).
4. Fase 4 (unificación) — solo tiene sentido una vez las dos piezas ya sincronizan datos de verdad;
   hacerlo antes sería pulir una experiencia sobre integraciones que todavía no existen.

## 8. Riesgos técnicos concretos (heredados de `FUSION_VOZIA_VENDRAVA_POSTIZ_MAUTIC.md`, con la
   mitigación específica de este plan)

| Riesgo | Mitigación en este plan |
|---|---|
| Mautic es PHP/MySQL, el resto Node/Prisma/Postgres | Se integra solo por API REST + webhooks, nunca se comparte base de datos ni ORM entre stacks. |
| Postiz usa Temporal (complejidad operativa) | Se despliega tal cual con su propio `docker-compose`, sin tocar su orquestación interna. |
| Instancia única de Mautic sin multi-tenant nativo — fuga de datos entre organizaciones | Permission Group + Company/tag por `Organization` desde el primer contacto sincronizado (decisión 2.2); cliente que exija aislamiento físico pasa a instancia propia como excepción. |
| Duplicado de contactos entre 3 sistemas | ID maestro (`Lead.id` como `crm_lead_id`) definido en Fase 4 desde el primer sync — no se posterga. |
| Activar todo a todos los clientes de golpe | Un cliente piloto por integración, elegido con la regla de la decisión 2.3, antes de generalizar. |
| Mostrar pestañas de un módulo no contratado | Gating por `Organization.plan` desde que se crea cada pantalla (Fase 2/3), no aplazado a la Fase 4. |

---

**Resumen en una línea:** desplegar Postiz y Mautic tal cual existen en GitHub, conectarlos al CRM
por API/webhook reusando el patrón que ya existe en `leadIngestion.service.ts` y
`metaConversions.service.ts`, y no construir de nuevo nada que esos dos proyectos ya resuelven.
