# Brief para auditoría externa del software (VozIA / llamadasrobin)

**Rol que debes asumir:** auditor técnico senior. Tu entregable es un informe de
**todos los problemas del software**: bugs, agujeros de seguridad, deuda técnica,
inconsistencias de datos, errores de arquitectura, cosas a medias y código muerto.

## Fuera de alcance (ignorar por completo)

- Todo lo de voz/TTS/STT: `tts-chatterbox/`, `tts-qwen/`, `voice-engine/`,
  `backend/src/voice/`, pipelines Deepgram/ElevenLabs, telefonía Twilio, prosodia,
  latencia de audio, calidad de las voces.
- Calidad del copy, marketing, precios, decisiones de negocio.
- Infraestructura de despliegue (staging, DNS, secretos de producción) salvo que
  el problema esté en el código del repo.

Todo lo demás — CRM, leads, pipeline, ads, integraciones, auth, datos, frontend —
sí entra.

## Stack real

**Frontend** (raíz del repo): React 19 + Vite 8 + React Router 7 + Tailwind 4.
JavaScript plano (`.jsx`), **sin TypeScript**, ~109 ficheros, ~25k líneas.
Entrada: `src/main.jsx` → `src/App.jsx`. Cliente HTTP: `src/lib/api.js`.

**Backend** (`backend/`): Fastify 4 + TypeScript + Prisma 5 (PostgreSQL) +
BullMQ/Redis + Socket.IO. ~244 ficheros `.ts`, ~36k líneas.
Entrada: `backend/src/index.ts` (registra ~40 plugins de rutas).
Worker: `backend/src/worker.ts`.

**Datos:** `backend/prisma/schema.prisma`, 2151 líneas, **74 modelos**, 22 migraciones.

**Otros:** `vendrava-public/` (web pública), `docker-compose.yml`, `scripts/`.

## Mapa de directorios que importa

```
src/pages/          páginas del CRM (las más grandes: OpportunityDetailPage 1123 l.,
                    AdsWizardPage 807, MeetingDetailPage 649)
src/components/     Pipeline.jsx 915 l., Configuracion.jsx 778, KnowledgeBase.jsx 736
src/modals/         modales de creación (New*Modal.jsx)
src/contexts/       estado global
src/i18n/           incluye legacyDomTranslation.js (718 l.) — traducción por DOM
backend/src/routes/       ~40 ficheros, uno por dominio
backend/src/controllers/  validación + orquestación
backend/src/services/     lógica de negocio (mauticSync 1219 l., pipeline 1048,
                          automations 828, orchestration 797)
backend/src/access-control/  entitlements, requireEntitlement
backend/src/middlewares/     authenticate.ts (JWT + sesión en BD + workspace scope)
backend/src/jobs/            trabajos BullMQ
backend/src/__tests__/       ~28 tests (node:test), varios son de voz → ignóralos
```

## Señales ya detectadas (puntos de partida, no la lista final)

1. **Sin CI.** No existe `.github/workflows/`. Nada corre tests ni build de forma
   automática. Ningún gate antes de mergear.
2. **Sin linter.** No hay config de ESLint ni Prettier en frontend ni backend.
3. **Frontend prácticamente sin tests**: 1 fichero de test para 109 de código.
   El backend tiene ~28, pero varios cubren voz (fuera de alcance) → la cobertura
   real del CRM es baja. Verifica qué dominios críticos (leads, pipeline, billing,
   access-control) están o no cubiertos.
4. **Frontend sin tipos.** Backend en TS, frontend en JS: los contratos de API no
   están verificados en ningún punto. Busca desajustes reales entre lo que devuelve
   el backend y lo que consume el frontend (ya hubo al menos un bug así:
   el API devolvía `{items}` y el frontend esperaba un array).
5. **Ficheros gigantes** en ambos lados (ver listas arriba). Evalúa acoplamiento,
   responsabilidades mezcladas y duplicación entre services.
6. **43 `console.log`** en código de producción; revisa si alguno filtra datos
   sensibles (tokens, PII, credenciales de integraciones).
7. **28 usos de `: any`** en el backend — mira si esconden agujeros de validación.
8. **Esquema Prisma de 74 modelos** con solo 22 migraciones. Revisa: índices que
   faltan, campos sin usar, relaciones sin `onDelete`, multi-tenancy (`orgId`)
   aplicada de forma inconsistente, riesgo de fuga de datos entre organizaciones.
9. **Multi-tenancy**: el aislamiento por organización se apoya en
   `workspaceAccess.service.ts` + `authenticate.ts`. **Audita ruta por ruta** si
   alguna consulta Prisma omite el filtro por `orgId`/workspace. Es el riesgo de
   seguridad número uno de este proyecto.
10. **Integraciones externas** (Meta Ads, Mautic, Metricool, Twilio, WhatsApp,
    Google): busca falta de reintentos, ausencia de idempotencia en webhooks,
    secretos de webhook sin verificar firma, rate limits no respetados, errores
    tragados en silencio.
11. **Trabajo a medias**: hay commits recientes que eliminan Postiz
    (`postiz.controller.ts`, `postizSync.service.ts`, rutas). Comprueba que no
    quedan referencias colgando, columnas huérfanas en el esquema ni entradas
    muertas en la UI.
12. **19 ficheros `.md` en la raíz** con auditorías y planes previos, muchos
    contradictorios o desactualizados. Úsalos como pistas, **no como verdad**:
    verifica siempre contra el código. Los más útiles como punto de partida:
    `ESTADO_DEL_SOFTWARE.md`, `BOTONES_NO_FUNCIONALES.md`,
    `AUDITORIA_PAGINAS_INCOMPLETAS.md`, `ROADMAP_100_PORCIENTO.md`.

## Qué quiero que revises específicamente

**Seguridad**
- Aislamiento multi-tenant en cada query de Prisma.
- AuthZ: ¿cada ruta tiene `authenticate` + el `requireEntitlement`/rol correcto?
  Busca rutas registradas sin protección.
- Almacenamiento de credenciales de terceros (`tokenCrypto.ts`,
  `organizationCredentials.service.ts`): cifrado, rotación, exposición vía API.
- Webhooks públicos (`metaWebhooks`, `mauticWebhooks`, `publicMedia`,
  `campaignShare`, `landing`): verificación de firma, replay, enumeración.
- Inyección, SSRF en llamadas salientes, subida de ficheros, presigned URLs de S3.
- Rate limiting: si se aplica de forma global o realmente donde hace falta (login,
  webhooks, endpoints caros).

**Corrección**
- Race conditions y falta de transacciones en operaciones multi-tabla.
- Jobs BullMQ: idempotencia, reintentos, qué pasa si el worker muere a mitad.
- Manejo de errores: `catch` vacíos, errores tragados, respuestas 200 con fallo.
- Zonas horarias, dinero/decimales, paginación, ordenación inestable.
- Estado del frontend: fetches sin cancelar, efectos que se disparan en bucle,
  claves de lista inestables, formularios sin validación.

**Arquitectura y mantenibilidad**
- Duplicación de lógica entre services.
- Límites confusos entre controller/service.
- Código muerto: rutas, componentes, campos de esquema y ficheros sin referencias.
- Acoplamiento del frontend a formas concretas de respuesta del backend.

**Producto (solo lo que sea defecto de software)**
- Botones, formularios y páginas que no hacen nada o fallan en silencio.
- Estados vacíos, de carga y de error que faltan.
- Flujos que empiezan y no terminan.

## Formato del informe

Un solo documento markdown:

1. **Resumen ejecutivo** — 10 líneas máximo: estado real del software y los 5
   riesgos que hay que arreglar antes de tener usuarios de pago.
2. **Hallazgos**, ordenados por severidad (P0 crítico → P3 menor). Cada hallazgo:
   - Título en una línea
   - Severidad y por qué esa severidad
   - `ruta/al/fichero.ts:línea` con el fragmento relevante
   - Cómo se rompe en la práctica (input concreto → resultado incorrecto)
   - Arreglo propuesto, lo más pequeño que funcione
3. **Tabla de código muerto / a borrar.**
4. **Qué NO está roto** — sé honesto, no infles la lista.

Reglas: cero hallazgos especulativos. Si no lo puedes anclar a código concreto,
no lo incluyas o márcalo explícitamente como "sin verificar". Prioriza por
impacto real, no por cantidad.
