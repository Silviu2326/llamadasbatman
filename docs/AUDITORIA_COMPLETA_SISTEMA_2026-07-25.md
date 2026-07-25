# Auditoría completa del sistema VozIA

Fecha: 25 de julio de 2026  
Alcance: frontend, backend, persistencia, agentes de voz, integraciones, seguridad, pruebas y despliegue.  
Tipo: revisión estática y verificaciones locales reproducibles. No sustituye un pentest ni una prueba sobre staging con PostgreSQL, Redis, Twilio y GPU reales.

## Dictamen ejecutivo

El sistema tiene una base funcional amplia y varios controles importantes ya incorporados, pero **no está listo para producción externa ni para declarar soporte de llamadas Open Source en español**.

Los bloqueadores principales son:

1. **backend/.env está versionado** y contiene configuración poblada con apariencia de secretos reales. Deben revocarse y rotarse todas las credenciales afectadas.
2. **El historial de migraciones no es reproducible**: Git solo contiene la migración baseline, mientras que las migraciones posteriores están fuera del estado versionado. Además, el modelo SensitiveApprovalRequest no tiene una tabla creada por ninguna migración detectada.
3. **La creación de agentes permite sobrescribir orgId** enviado por el cliente. Es un riesgo de aislamiento multi-tenant.
4. Hay dos plugins registrando **GET /health/ready** con el mismo prefijo /health. Debe corregirse y validarse el arranque real de Fastify.
5. La ruta dúplex Moshi sigue siendo un canario en inglés: usa en/en-US, conserva el prompt de negocio para trazabilidad, pero no lo aplica al comportamiento del modelo base.

En términos de madurez aproximada:

| Área | Estado | Evaluación |
|---|---|---|
| Frontend público | Funcional | Smoke local correcto, pero bundle inicial grande y traducción DOM frágil |
| API y RBAC | Parcialmente sólido | Buenas defensas en varias rutas, pero existe un fallo crítico de tenant en agentes |
| Persistencia | Bloqueada para release | Migraciones no reproducibles y auditoría Prisma con hallazgos |
| Llamadas modulares | Prototipo avanzado | Puede funcionar con modelos locales, pero la configuración española no está cerrada |
| Llamadas dúplex | Canario experimental | Moshi/Mimi local, inglés y prompt de negocio aún no condicionado |
| Despliegue | No reproducible de extremo a extremo | Backend, workers, motor de voz y modelos no están encapsulados en una entrega única |
| Pruebas | Insuficientes para certificar release | Build correcto; suite de integración bloqueada y offline con expectativa obsoleta |

## Correcciones aplicadas en esta iteración

- Se retiró `backend/.env` del índice Git y se añadieron reglas de `.gitignore`; las credenciales deben rotarse porque el historial puede seguir conteniéndolas.
- La API de agentes valida bodies con Zod estricto y el servicio ya no hace spread de datos controlados por el cliente sobre `orgId`.
- La carga de configuración de voz exige `orgId` y la simulación lo propaga; se evita buscar agentes solo por id.
- Se eliminó la colisión de `GET /health/ready`; el readiness global queda en observabilidad y el health específico de integraciones pasa a `/health/integrations/ready`.
- Se añadió la migración de `SensitiveApprovalRequest`, aunque el historial completo todavía debe incorporarse a Git y validarse contra PostgreSQL.
- Los gateways de voz usan `es-ES` como default, aceptan idioma por sesión y reportan el idioma real del transcript dúplex.
- Compose ya no usa `changeme` como fallback para contraseñas o JWT de Mautic/Postiz.
- Las páginas React se cargan mediante code-splitting; el bundle inicial baja aproximadamente de 1,89 MB a 504 kB de JavaScript, aunque el chunk de gráficos sigue superando 500 kB.
- El runner offline espera ahora los 28 tests actuales y los 5 tests del gateway Moshi pasan.

Siguen bloqueados la rotación efectiva de secretos, el commit del historial completo de migraciones, la prueba de arranque contra un entorno real y la validación de llamadas con GPU/telefonía.

## Arquitectura auditada

- Frontend React/Vite en src/, con rutas de autenticación, dashboard, agentes, conversaciones, campañas, integraciones y páginas públicas.
- Backend Fastify/TypeScript en backend/src/.
- PostgreSQL mediante Prisma en backend/prisma/.
- Redis/BullMQ para jobs y workers.
- Motor de voz Python en voice-engine/, con ruta modular STT/LLM/TTS y ruta dúplex basada en Moshi/Mimi.
- Telefonía y mensajería mediante Twilio y Meta.
- Integraciones de CRM/marketing con Mautic, Postiz y otros conectores.
- Frontend desplegable mediante Vercel y backend actualmente acoplado a una URL de Railway en vercel.json.

## Verificaciones ejecutadas

| Verificación | Resultado | Lectura |
|---|---|---|
| npm.cmd run build en raíz | PASS | El frontend compila |
| npm.cmd run db:generate | PASS | Prisma Client se genera |
| npm.cmd run build en backend | PASS | TypeScript compila |
| npm.cmd run ops:production-gate | FAIL | El entorno actual no cumple el gate de producción |
| npm.cmd run ops:prisma-audit | FAIL | Falta tabla de SensitiveApprovalRequest; migraciones sucias/no reproducibles |
| npm.cmd test en backend | BLOQUEADO | Falta TEST_DATABASE_URL aislada |
| npm.cmd run test:offline | FAIL | Detecta 28 tests y espera 27 |
| python voice-engine/test_moshi_gateway.py | PASS | 5 pruebas del gateway Moshi pasan |
| python voice-engine/smoke_duplex.py --help | NO EJECUTABLE | Intenta conectar con el gateway y recibe conexión rechazada |
| Smoke frontend local | PASS | Login, ES, términos y 404; sin errores de consola en el recorrido |
| Bundle Vite | WARNING | JS aproximado 1,89 MB y CSS 642 kB sin gzip; supera el umbral de chunks de 500 kB |

## Hallazgos críticos P0

### P0-01 — Secretos y configuración sensible versionados

**Evidencia inicial:** git ls-files devolvía backend/.env. El archivo contenía una DATABASE_URL poblada y varios valores de claves/API con longitudes no vacías. También aparecían secretos ausentes, vacíos o demasiado cortos para las validaciones actuales.

**Estado actual:** backend/.env ya no está en el índice y queda excluido por .gitignore, pero el fichero local se conserva para no romper el entorno de desarrollo. La rotación y la limpieza del historial siguen siendo obligatorias.

**Riesgo:** cualquier persona con acceso al repositorio, una copia, un artefacto de CI o un historial Git puede obtener acceso a la base de datos, proveedores de voz, integraciones o servicios externos. Aunque algunos valores fueran de desarrollo, no debe asumirse que son inocuos.

**Acción inmediata:**

- Revocar y regenerar todas las claves presentes o potencialmente expuestas.
- Eliminar backend/.env del historial Git, no solo del working tree.
- Mantener únicamente .env.example con placeholders no funcionales.
- Cargar secretos desde el proveedor de despliegue o un secret manager.
- Añadir un secret scanner al pre-commit y CI.
- Invalidar sesiones, tokens OAuth y credenciales de proveedores relacionados.

### P0-02 — Migraciones de base de datos no reproducibles

**Evidencia:** Git solo versiona backend/prisma/migrations/20260714000000_baseline/migration.sql y migration_lock.toml. La auditoría Prisma detecta migraciones posteriores fuera de un estado limpio y documenta que el modelo SensitiveApprovalRequest no tiene tabla creada por las migraciones disponibles.

**Riesgo:** un clon limpio no puede reconstruir la base de datos actual. El despliegue puede arrancar contra un esquema incompleto, fallar en runtime o generar divergencia entre entornos. Es especialmente peligroso para datos de aprobaciones, integraciones y aislamiento organizativo.

**Acción recomendada:**

- Restaurar un historial completo, ordenado y versionado de migraciones.
- No modificar una migración baseline ya aplicada; crear una migración correctiva nueva.
- Crear o corregir la migración de SensitiveApprovalRequest.
- Ejecutar prisma migrate status y prisma migrate deploy sobre una base de staging vacía y otra copia representativa.
- Prohibir prisma db push como mecanismo de release.
- Hacer que CI falle ante migraciones sin seguimiento, modificadas o no aplicables desde cero.

### P0-03 — Bypass de aislamiento multi-tenant al crear agentes

**Evidencia:** backend/src/controllers/agents.controller.ts:28 pasa request.body directamente al servicio. backend/src/routes/agents.ts no define un esquema JSON estricto. backend/src/services/agents.service.ts:20-22 crea el agente usando data: { orgId, ...data }; un orgId incluido en el body sobrescribe el valor confiable.

**Riesgo:** un usuario autorizado para crear agentes podría intentar asociar el agente a otra organización o inyectar campos no previstos. Es un fallo de seguridad de datos, no solo de validación.

**Corrección:**

- Añadir schema Zod/Fastify estricto para create y update.
- Mapear explícitamente solo campos permitidos.
- No hacer spread de datos controlados por el cliente después de orgId.
- Rechazar id, orgId, createdAt, updatedAt y campos internos.
- Añadir una prueba HTTP cross-tenant que confirme que el orgId del body se ignora o se rechaza.

**Estado actual:** el servicio ya mapea explícitamente los campos permitidos y el controlador rechaza campos inesperados. Falta ejecutar la prueba HTTP contra una base de test aislada.

## Hallazgos importantes P1

### P1-01 — Posible conflicto de rutas que puede impedir el arranque

backend/src/index.ts:201-203 registra integrationHealthRoutes y observabilityRoutes, ambos con prefijo /health. Ambos plugins definen GET /ready en backend/src/routes/integrationHealth.ts:7 y backend/src/routes/observability.ts:37. El resultado esperado es una duplicación de GET /health/ready durante el registro de Fastify.

La colisión estática ya se ha corregido: integration health usa `/health/integrations/ready` y observabilidad conserva `/health/ready`. Falta confirmar el arranque completo con un entorno sanitizado.

**Solución:** conservar un único readiness canónico o renombrar uno, por ejemplo /health/integrations/ready, y añadir un test de construcción del servidor que falle ante rutas duplicadas.

### P1-02 — La ruta Open Source no está preparada para español de producción

La ruta modular admite configuración, pero sus valores por defecto son anglocéntricos:

- remoteVoiceEngine.ts:149-150 usa en-US para dúplex y VOICE_CALL_LANGUAGE/accent para modular.
- voice-engine/server.py:95 usa en-US como idioma STT por defecto.
- voice-engine/server.py:166-168 usa TTS English, speaker Ryan e instrucción de voz profesional en inglés.
- voice-engine/moshi_gateway.py:87 transcribe con language="en".
- El idioma de la UI del agente no controla de forma fiable el idioma por llamada cuando las variables globales tienen prioridad.

**Impacto:** no se puede garantizar reconocimiento de español de España, pronunciación, prosodia, nombres propios, números, interrupciones ni calidad de voz sin configuración explícita por agente y medición con audio real.

**Trabajo necesario:** definir es-ES como configuración de agente y no solo como variable global; elegir STT/TTS Open Source españoles; parametrizar voz, idioma y estilo por sesión; crear un corpus de evaluación con ruido telefónico, turnos cortos, mmm, silencios, solapamiento e interrupciones.

### P1-03 — Moshi/Mimi dúplex conserva el prompt, pero no lo aplica al modelo base

voice-engine/moshi_gateway.py:300-320 guarda system_prompt y devuelve metadatos indicando future-moshi-call-en-checkpoint. El comentario del propio código indica que el prompt se conserva para trazabilidad y futuros checkpoints. La sesión anuncia en-US aunque el agente pueda enviar otro idioma.

**Resultado actual:** la arquitectura tiene un buen plano de control Node → gateway, pero no equivale todavía a un agente de negocio especializado. El modelo dúplex base no recibe una política de ventas, soporte, transferencia, herramientas o cumplimiento como comportamiento aprendido.

**Solución:** mantener un controlador de políticas externo para reglas duras y entrenar/alinear un checkpoint especializado —o envolver el modelo con un policy/LLM planner— para que el contenido de negocio y la interrupción sean consistentes. No anunciar “agente especializado” hasta superar pruebas de tarea y seguridad.

### P1-04 — Tipos de agente y dirección de llamada son principalmente metadatos

La entidad y la UI ya contemplan tipos y direcciones (sales, support, reception, qualification, both, inbound, outbound). También existe una defensa para impedir llamadas salientes cuando la dirección no lo permite.

Sin embargo, agentType no selecciona todavía un conjunto de herramientas, playbooks, política de transferencia, límites de campaña o memoria diferenciada en el motor de voz. La especialización es, por ahora, identidad/configuración más routing.

**Evolución necesaria:** convertir cada tipo en una política tipada con skills, tools, prompt, objetivos, eventos permitidos, transferencias, horario, consentimiento y métricas específicas.

### P1-05 — Despliegue extremo a extremo no reproducible

docker-compose.yml levanta servicios auxiliares de Mautic/Postiz, sus bases de datos y Redis, pero no encapsula de forma completa el backend VozIA, los workers ni voice-engine. El motor de voz depende de Python, modelos locales, GPU/CPU, servidores de inferencia y voces instaladas fuera de una entrega única.

**Riesgo:** el entorno local no representa el entorno de llamadas y una incidencia de modelo, driver, sample rate o proveedor es difícil de reproducir.

**Solución:** crear perfiles Compose o imágenes separadas para API, worker, voice gateway y servidor de modelos; fijar versiones, hashes, modelos, licencias, variables obligatorias, healthchecks y límites de recursos; documentar un despliegue limpio desde cero.

### P1-06 — Gate de producción actualmente incumplido

ops:production-gate falla porque el entorno no está marcado como production, faltan URLs públicas y varios secretos, hay endpoints locales/privados para Redis/Postiz/Mautic, existen integraciones parciales y JWT_SECRET no cumple longitud.

Esto es correcto como comportamiento del gate: el problema es que no existe todavía un perfil de staging/producción completo y verificable. No debe saltarse el gate para probar llamadas reales.

## Hallazgos P2 y deuda técnica

### P2-01 — Body JSON global de 15 MB

backend/src/index.ts define un límite global de 15 MB para soportar ficheros base64. Amplía el coste de memoria de todas las rutas y el riesgo de abuso.

Migrar uploads a multipart o almacenamiento directo, limitar por endpoint, validar MIME/tamaño y aplicar análisis de contenido.

### P2-02 — Consultas sin paginación en caminos de crecimiento

backend/src/services/mauticSync.service.ts:1166 carga todos los leads de una organización con customFields para calcular métricas en memoria. También existen listados de agentes sin límite explícito.

Introducir paginación, agregaciones SQL, ventanas temporales y límites máximos. Añadir pruebas con organizaciones grandes.

### P2-03 — Bundle inicial demasiado grande

El build genera aproximadamente 1,89 MB de JavaScript y 642 kB de CSS sin gzip, y Vite advierte chunks mayores de 500 kB. src/App.jsx importa las páginas de forma eager y no usa React.lazy para separar rutas.

Aplicar code splitting por ruta, revisar librerías pesadas, comprimir assets y establecer budgets de bundle en CI.

### P2-04 — Traducción basada en MutationObserver global

src/App.jsx:52-58 monta LegacyDomTranslation globalmente. src/i18n/legacyDomTranslation.js:689 observa mutaciones de todo document.body y reemplaza texto por tablas de frases/palabras.

Puede consumir recursos, traducir texto generado por usuarios, romper contenido dinámico y competir con React. Migrar a claves i18n declarativas en componentes y retirar progresivamente el traductor DOM.

### P2-05 — Credenciales por defecto peligrosas en Compose

docker-compose.yml:12-57 usa changeme como fallback para contraseñas de Mautic/Postiz y un JWT de Postiz.

Un despliegue sin variables produce credenciales conocidas. Debe fallar si faltan secretos, nunca aplicar defaults funcionales y separar claramente desarrollo de staging/producción.

### P2-06 — Acoplamiento de despliegue frontend-backend

vercel.json:6-7 contiene directamente la URL de Railway del backend. Esto dificulta cambiar de entorno, provoca drift entre preview/production y puede enviar un frontend de preview a producción.

Usar variables de entorno por entorno y comprobar que las URLs públicas, CORS y cookies pertenecen al mismo despliegue.

### P2-07 — Defensa de organización incompleta en carga de agente

backend/src/voice/agentConfig.ts:40 busca por id sin incluir orgId. Los llamadores actuales realizan comprobaciones en varios caminos, pero la función debería exigir y aplicar el tenant como defensa en profundidad.

### P2-08 — Limpieza de tests incompleta

La auditoría Prisma detecta que cleanupOrgs no elimina varios modelos organizativos nuevos, entre ellos credenciales de integraciones, webhooks y entidades orgánicas. Esto puede contaminar pruebas, producir falsos positivos y bloquear el borrado de fixtures.

### P2-09 — No existe todavía benchmark de llamadas comparable

El smoke de Moshi pasa, pero no se ejecutó una llamada dúplex real porque no había gateway escuchando. No hay medición reproducible de:

- latencia de primer audio y latencia de respuesta;
- tiempo de solapamiento/interrupción;
- WER/CER en español e inglés con audio telefónico;
- naturalidad, inteligibilidad y consistencia de voz;
- tasa de silencios incorrectos, mmm, backchannels y turnos perdidos;
- coste de GPU/CPU por llamada y concurrencia;
- transferencias, DTMF, grabación y reconexión Twilio.

## Controles positivos observados

- Socket.IO autentica mediante JWT y deriva la sala de organización del principal.
- La autenticación usa access token corto en memoria y refresh token HttpOnly rotado.
- Se exige un secreto JWT fuerte en el arranque.
- Hay allowlist CORS explícita y límites globales de rate limit.
- El streaming de voz usa capacidades HMAC cortas y valida recursos.
- WhatsApp/Twilio y webhooks Meta tienen validación de firma e idempotencia en los caminos revisados.
- Las rutas sensibles aplican permisos y entitlements en varias áreas.
- El seed ya no crea automáticamente un usuario demo en producción.
- Las rutas públicas del frontend y el cambio ES/EN funcionan en smoke local; la ruta 404 tiene fallback.

## Orden recomendado de remediación

### Fase 0 — Contención, 1 día

1. Revocar y rotar secretos.
2. Retirar backend/.env del historial y activar secret scanning.
3. Congelar despliegues y llamadas reales hasta validar migraciones.
4. Corregir la ruta duplicada /health/ready.
5. Corregir la creación de agentes y añadir test cross-tenant.

### Fase 1 — Reproducibilidad, 2–4 días

1. Reconstruir el historial de Prisma en una rama limpia.
2. Crear la migración de SensitiveApprovalRequest.
3. Ejecutar migraciones desde cero en staging.
4. Provisionar TEST_DATABASE_URL, Redis de pruebas y CI reproducible.
5. Corregir la expectativa del runner offline de 27 a 28 o ajustar el descubrimiento de tests.

### Fase 2 — Voz española y dos modos, 1–2 semanas

1. Definir contrato de sesión común para modular y dúplex.
2. Hacer idioma, voz, sample rate y política configurables por agente.
3. Seleccionar y fijar STT/TTS Open Source para español de España.
4. Separar claramente agentType de la metadata y convertirlo en policy/skills/tools.
5. Implementar el Interaction Loop: VAD, turn-taking, barge-in, backchannels, recuperación y transferencia.
6. Evaluar modular y Moshi con el mismo corpus, teléfono real y métricas.

### Fase 3 — Operación, 1 semana

1. Empaquetar API, workers, gateway y modelos con versiones fijadas.
2. Añadir observabilidad de llamadas: trace, latencias, errores por etapa, audio quality y coste.
3. Aplicar paginación y límites de recursos.
4. Implementar code splitting y sustituir la traducción DOM.
5. Ejecutar pruebas de carga y pruebas de recuperación de Redis, proveedor de voz y telefonía.

## Criterios mínimos antes de producción

- git clone limpio + migración desde cero exitosa.
- Cero secretos en Git y rotación documentada.
- Test cross-tenant de agentes pasando.
- Arranque Fastify sin rutas duplicadas.
- npm test, offline tests y smoke de gateway pasando en CI.
- Llamada modular en español con WER, latencia y MOS objetivo definidos.
- Llamada dúplex en español solo si el checkpoint/policy aplica realmente el comportamiento de negocio.
- Prueba de llamada entrante y saliente por cada tipo de agente.
- Transferencia, consentimiento, grabación, DTMF y desconexión verificados.
- Alertas y dashboards para latencia, errores, saturación y coste.

## Conclusión

La plataforma está en una fase de **prototipo funcional avanzado**, con una UI usable, una API extensa y una base razonable de autenticación, permisos e integraciones. Los riesgos actuales no son cosméticos: afectan a secretos, aislamiento de organizaciones, migraciones y capacidad de arrancar/reproducir el sistema.

La decisión recomendada es corregir primero P0/P1 y después comparar modular frente a Moshi con una batería de llamadas reales. Para español, la ruta modular parece el camino más controlable a corto plazo; Moshi aporta el potencial dúplex, pero todavía requiere alineamiento/policy y una implementación específica para idioma y negocio antes de considerarse producción.
