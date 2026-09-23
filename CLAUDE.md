# Contexto del proyecto para Claude Code

## Voz Isa asignada: 19 de septiembre de 2026

El usuario confirmó tener autorización de Isa para clonar su voz y utilizarla en
las llamadas, y autorizó expresamente enviar la grabación a Fish Audio. Se creó
la voz privada `0c5e92a183904da4a59812c8437e0ac2` mediante el flujo de subida de
la plataforma (job `cmu8gaizc000128zgh3nom1xv`, consentimiento registrado).
El agente `cmt8j5dmy0007dk872quuuwys` utiliza esta voz en `voiceId` y
`settings.voiceSelection` con nombre Isa. Su nombre sigue siendo Carlos y su
estado sigue en borrador. Se verificó la configuración de voz y se generó una
muestra en `integrations/zadarma/isa-preview.local.mp3`; no se hizo otra llamada.
Esta selección sustituye a la voz de catálogo de la microprueba anterior.

## Microprueba real completada: 19 de septiembre de 2026, 13:25 UTC

La llamada propia se conectó y quedó grabada (16 segundos de WAV, Call
`cmu8f7o4a0001kmx3ve4buejw`). Solo consta el saludo del agente, sin respuesta del
usuario transcrita: no afirmar conversación bidireccional validada ni publicar
automáticamente por la puntuación heurística. Se corrigió el formato SIP para
conservar `+34`, y el usuario autorizó la ACL mínima de acceso a grabaciones.
La clave SSH y la excepción temporal de la microprueba están retiradas.
Detalles: `integrations/zadarma/deploy/MICROTEST-20260919.md`.
Esto sustituye cualquier indicación histórica de que todavía no se hizo una llamada.

## Actualización de despliegue: 19 de septiembre de 2026

La actualización de llamadas de prueba YA está desplegada en Hetzner. Prisma 5.22.0
se regeneró en el VPS y se verificaron consultas de `VoiceTestNumber` y `Call.isTest`
como usuario `vendrava`. Pasarela y call-worker están activos y habilitados; ambos
SIP siguen registrados. No se tocaron Asterisk, nginx ni Sprintmarkt. La clave SSH
temporal se retiró al terminar. No se hicieron llamadas ni se registraron consentimientos.
Detalles y copia de seguridad: `integrations/zadarma/deploy/STATUS-20260919.md`.
Esta actualización sustituye cualquier indicación histórica de despliegue o Prisma pendientes.

## Qué estamos construyendo

Este repositorio contiene Vendrava/VozIA: un CRM comercial con agentes de voz IA,
automatizaciones de ventas, generación y auditoría de leads, WhatsApp y paneles de
insights. El objetivo operativo inmediato es poder trabajar con hasta 150
conversaciones telefónicas por semana, inicialmente unas 50 al día, usando un agente
que llama por Zadarma, conversa con voz natural, graba la llamada completa y guarda
transcripción, resultado y seguimiento en el CRM.

El producto tiene dos aplicaciones que deben mantenerse separadas:

- **Frontend:** React + Vite en la raíz del repositorio. Puerto local `5173`.
- **Backend:** Node.js + Fastify + Prisma en `backend/`. Puerto local `3001`.

El CRM FastAPI de Sprintmarkt que vive en el VPS es otro producto y no debe sustituirse
ni reiniciarse al modificar Vendrava.

## Cómo levantar el entorno local

Desde la raíz:

```powershell
npm run dev
```

En otra terminal:

```powershell
cd backend
npm run dev
```

Para validaciones normales:

```powershell
# raíz
npm run build

# backend
cd backend
npm run build
npm run test:offline
```

El backend usa `.env` local, Prisma y PostgreSQL. Nunca imprimir ni copiar valores de
`.env`, tokens, contraseñas, claves de proveedores o credenciales SIP al repositorio,
logs o respuestas del usuario. Los archivos `*.local.*` y los entornos privados están
excluidos de Git.

## Secretos necesarios, sin guardarlos en la documentación

Claude Code necesita conocer estos nombres y fuentes, pero no debe recibirlos escritos
en `CLAUDE.md`, en commits ni en comandos visibles:

| Uso | Variables o ubicación segura |
|---|---|
| Base de datos Vendrava | `backend/.env` local / `DATABASE_URL` en el entorno de despliegue |
| Cerebras | `CEREBRAS_API_KEY` en el entorno privado |
| Deepgram | `DEEPGRAM_API_KEY` en el entorno privado |
| Fish Audio | `FISH_API_KEY` en el entorno privado |
| Pasarela remota | `ZADARMA_GATEWAY_TOKEN` y `ZADARMA_GATEWAY_URL` |
| SIP 922118 | `ZADARMA_SIP_922118_PASSWORD` en `/etc/vendrava/zadarma.env` del VPS |
| Acceso a Zadarma web | usar la sesión del navegador o un almacén seguro; no automatizar la contraseña en la shell |
| Acceso a Hetzner | consola web o la clave SSH temporal vigente; no usar la contraseña root en scripts |

Los valores reales ya existen en entornos privados del proyecto/VPS o fueron entregados
en la conversación. No se deben copiar aquí ni reconstruir desde el historial. La
contraseña de root de Hetzner y la contraseña de la cuenta web de Hetzner/Zadarma se
consideran comprometidas por haber aparecido en el chat: hay que rotarlas. Rotarlas no
requiere cambiar el SIP ni reinstalar Asterisk.

Para una sesión local, Claude Code debe cargar las variables desde el entorno privado
existente (`backend/.env`) y comprobar solo que están presentes, por ejemplo con una
verificación booleana de nombres, nunca imprimiendo sus valores. Para el VPS, leer el
archivo de servicio con sus permisos actuales (`/etc/vendrava/zadarma.env`, usuario
`root:vendrava`, modo `0640`) sin mostrarlo ni copiarlo al repositorio.

## Arquitectura de llamadas

La llamada telefónica sigue este flujo:

1. Una campaña activa contiene leads y un agente activo.
2. El worker de llamadas reclama trabajos PostgreSQL de la cola
   `lead-call-dispatch` y pasos de secuencia de tipo `call`.
3. La pasarela Zadarma valida organización, agente, campaña, teléfono, cuota,
   cumplimiento y configuración del agente antes de marcar.
4. Asterisk origina la llamada por PJSIP y conecta audio mediante AudioSocket.
5. Deepgram transcribe, Cerebras genera la respuesta y Fish Audio sintetiza voz.
6. Asterisk usa MixMonitor para grabar la conversación completa.
7. La llamada se ingesta en el CRM con grabación privada, transcripción, resultado y
   eventos de voz.

Archivos principales:

- `backend/src/callWorker.ts`: worker dedicado exclusivamente a llamadas.
- `backend/src/lib/databaseQueue.ts`: cola PostgreSQL con aislamiento opcional por
  organización.
- `backend/src/services/salesSequence.service.ts`: pasos de secuencias, filtrados por
  organización y tipo cuando los procesa el worker de llamadas.
- `backend/src/jobs/leadCallDispatch.ts`: ejecución de un trabajo de llamada.
- `backend/src/voice/telephony/zadarma/`: runtime, gateway, AMI, AudioSocket y
  grabaciones.
- `backend/src/services/agents.service.ts`: workspace, readiness y publicación de
  agentes.
- `integrations/zadarma/`: despliegue, plantillas, scripts y documentación de Zadarma.

El worker dedicado se inicia con `BACKGROUND_WORKERS_ENABLED=false` para no arrancar
timers de email, WhatsApp ni contenido. Está aislado por `ZADARMA_ORG_ID` y no debe
convertirse en un worker global sin revisar primero el aislamiento de datos.

## Estado actual del VPS y Zadarma

Servidor autorizado: Hetzner VPS Debian 13, `178.105.157.60`, Asterisk 22.11.0.

Servicios importantes ya instalados:

- `vendrava-zadarma.service`: pasarela IA, activa y habilitada.
- `vendrava-call-worker.service`: worker de llamadas programadas, activo y habilitado
  al arranque.
- `sprintmarkt-crm.service`, Asterisk y nginx: deben permanecer activos.
- AMI, AudioSocket y control escuchan solo en loopback. El backend remoto usa la ruta
  HTTPS autenticada de la pasarela.

Comprobaciones realizadas el 17-09-2026:

- Heartbeat PostgreSQL `call-worker`: saludable.
- Pasarela: HTTP 200, cero llamadas activas durante la comprobación.
- SIP 232304 (troncal existente): `Registered`.
- SIP 922118 (línea del agente): `Registered`.
- CallerID del SIP 922118: `+34919931802`.
- Las grabaciones son privadas y se guardan mediante MixMonitor.
- Existe una copia de seguridad del despliegue del worker en
  `/opt/vendrava/backups/call-worker-20260917T184330Z`.

No hace falta instalar otra centralita ni modificar el SIP 232304. No copiar una
plantilla de PJSIP encima de la configuración existente: solo añadir objetos aislados
si una tarea lo requiere.

## Acceso remoto a Hetzner y recuperación del despliegue

Estos datos describen el procedimiento, no son una invitación a guardar secretos en el
repositorio:

- VPS: `178.105.157.60`, Debian 13, nombre `debian-4gb-fsn1-1`.
- Panel: consola web de Hetzner para el proyecto y servidor anteriores.
- Usuario remoto previsto: `root` solo para la instalación puntual; los servicios
  corren con sus usuarios dedicados (`vendrava`, `asterisk`, etc.).
- La autenticación SSH anterior responde `Permission denied (publickey,password)`.
  No intentes automatizar la contraseña root, no la pongas en argumentos, variables de
  entorno, scripts ni archivos. El usuario ha indicado que las contraseñas quedaron
  expuestas en el historial y deben rotarse después.
- La vía de recuperación es la consola web de Hetzner. El usuario debe pegar allí la
  línea de instalación de la clave temporal, o hacerlo desde una sesión root que ya
  tenga abierta. Si la clave no está instalada, Claude Code no puede inventar otro
  acceso SSH.

La clave temporal autorizada para esta ventana tiene el comentario
`vendrava-testcall-deploy-20260918` y huella pública
`SHA256:Phg0E8IDdXIQxgE2IqnPKipJ3gBGkF6+kWaFJTUJr/A`. La línea vigente caduca a
`20260920222755Z` (48 h desde el 18-09 22:27 UTC). Antes de usarla, verificar la hora
actual. La línea que el usuario debe pegar en la consola web de Hetzner es:

```sh
install -d -m 700 /root/.ssh
printf '%s\n' 'restrict,expiry-time="20260920222755Z" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPaoMfnWdt816ylMCdJMjNVl9c0gRv9lUH7TZdR6bSi1 vendrava-testcall-deploy-20260918' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Hay un segundo bloqueo, independiente de la clave: el clasificador de modo automático
de esta sesión deniega el acceso SSH al VPS (`Production Reads`, `Sensitive Remote
Exec`, `Production Deploy`), incluso para una comprobación de solo lectura. Aunque la
clave esté instalada, el despliegue no se puede ejecutar desde aquí hasta que el
usuario autorice esas acciones (regla de permisos de Bash en `settings.json`, o
ejecutar él mismo los dos comandos del despliegue).

No almacenar la clave privada en Git ni pegarla en este archivo. Usar la copia local
segura con `ssh -o IdentitiesOnly=yes -i <clave-privada> root@178.105.157.60` solo
después de confirmar que la clave pública se instaló. Al terminar, retirar la entrada
temporal y borrar la copia local privada si ya no se necesita. Si el acceso SSH no está
disponible, usar de nuevo la consola web, nunca cambiar `PermitRootLogin` ni debilitar
el firewall para forzar la conexión.

### Secuencia de despliegue pendiente

El usuario informa que la migración ya está aplicada en Neon y que el código local está
compilado y probado. El problema pendiente es que el cliente Prisma generado en el
VPS todavía no conoce el modelo nuevo `VoiceTestNumber` que usa la ruta de prueba.
Cuando haya acceso, trabajar en este orden y detenerse ante cualquier discrepancia:

1. Crear un backup fechado de `/opt/vendrava/gateway` y de la unidad antes de escribir.
2. Comprobar versión de Node, `systemctl status vendrava-zadarma
   vendrava-call-worker`, espacio en disco y el commit/artefactos instalados.
3. Comparar `backend/prisma/schema.prisma`, la migración
   `backend/prisma/migrations/20260917210000_voice_test_calls/migration.sql` y el
   cliente Prisma del VPS. La migración de Neon no debe ejecutarse otra vez a ciegas.
4. Instalar el schema y dependencias necesarias, ejecutar `prisma generate` en el
   entorno de despliegue y verificar que el cliente reconoce `VoiceTestNumber` y la
   columna `Call.isTest`. Si la migración no aparece realmente en la base, revisar
   `prisma migrate status` y aplicar solo esa migración aditiva con backup.
5. Copiar el `dist` y los archivos de runtime de la versión compilada, validar cada JS
   con `node --check` y la unidad con `systemd-analyze verify`.
6. Recargar y reiniciar únicamente `vendrava-zadarma.service` y el worker de llamadas
   si hace falta. No reiniciar Asterisk, nginx ni `sprintmarkt-crm.service`.
7. Verificar heartbeat `call-worker`, `/health` de la pasarela, registros SIP 232304 y
   922118, `activeCalls: 0` y que no haya errores de Prisma en `journalctl`.
8. Solo después registrar el teléfono propio autorizado, registrar consentimiento real
   de voz y ejecutar la prueba desde `POST /agents/:id/test-calls`. No publicar ni
   lanzar campañas hasta que la evaluación sea válida.

El despliegue remoto debe ser aditivo y reversible. Si el cliente Prisma del VPS no
puede actualizarse sin recompilar o sin riesgo para el CRM, dejar el worker anterior
intacto, conservar el backup y reportar exactamente el bloqueo.

### Estado real a 18-09-2026

- **Migración: aplicada.** `20260917210000_voice_test_calls` está en Neon;
  `prisma migrate status` responde «Database schema is up to date!». `VoiceTestNumber`
  y `Call.isTest` ya existen en la base. No volver a aplicarla.
- **Código: compilado y probado en local.** `npm run build` en raíz y backend, y 35
  pruebas offline en verde. Falla `prisma.ts selecciona TEST_DATABASE_URL` en
  `npm run test:offline`, pero es un fallo previo de HEAD: la aserción no contempla
  `withColdStartTolerance()`. No lo introdujo la ruta de prueba.
- **Despliegue: preparado, sin ejecutar.** Los dos pasos son:

  ```sh
  sh integrations/zadarma/deploy/pack-testcall.sh          # local, tras npm run build
  scp -i <clave> integrations/zadarma/testcall-bundle.local.tar.gz \
      integrations/zadarma/deploy/install-testcall.py root@178.105.157.60:/tmp/
  ssh -i <clave> root@178.105.157.60 'python3 /tmp/install-testcall.py /tmp/testcall-bundle.local.tar.gz'
  ```

  `install-testcall.py` hace por su cuenta todo lo que exige este archivo: comprueba
  cero llamadas activas antes de tocar nada, copia a `/opt/vendrava/backups/testcall-*`
  lo que va a sobrescribir, valida con `node --check` y `systemd-analyze verify`,
  resuelve el cliente Prisma (regenera con la CLI del VPS si está, y si no sustituye
  los ficheros generados conservando el motor Linux), comprueba que el cliente
  reconoce `VoiceTestNumber` y `Call.isTest`, y solo entonces reinicia la pasarela y el
  worker. Ante cualquier fallo previo al reinicio, deshace lo escrito. No toca
  Asterisk, nginx ni `sprintmarkt-crm`.

## Agente Carlos y publicación

Organización: `cmt76072o0001qr44mtnt49q2`.

Agente: `cmt8j5dmy0007dk872quuuwys` (Carlos).

- Número Vendrava y CallerID: `+34919931802`.
- Voz provisional: voz oficial de Fish Audio Makoto,
  `59a78821a8924989b70d2a63d588e8eb`.
- Guion e instrucciones: presentes.
- Estado actual: `draft`.
- Campañas asignadas: ninguna.
- Llamadas pendientes: ninguna.

La publicación normal (`POST /agents/:id/publish`) exige que estén completos todos
los checks de readiness:

1. voz seleccionada;
2. instrucciones completas;
3. número de salida;
4. consentimiento vigente de la voz;
5. una prueba real completada con evaluación mínima 75/100 y sin errores críticos.

Los dos primeros checks y el número están listos. Faltan consentimiento y evaluación.
No crear consentimientos ficticios, no convertir automáticamente `licensed=true` de un
proveedor en consentimiento personal y no cambiar `lifecycleStatus` directamente para
forzar llamadas.

La ruta telefónica de prueba para agentes en borrador ya existe:
`POST /agents/:id/test-calls` sobre un `VoiceTestNumber` autorizado
(`backend/src/services/voiceTestCall.service.ts` y `prepareSipTestCall` en la
pasarela). Exige los otros cuatro checks —incluido el consentimiento de voz—, deja
al agente en `draft`, marca la llamada con `isTest` y la evalúa al colgar. La cabina
del navegador no sirve como prueba: no crea ninguna fila `Call`. Para usarla hacen
falta la migración `20260917210000_voice_test_calls` y el despliegue del runtime
actualizado en el VPS.

El usuario indicó que quiere probar la llamada en su móvil `+34 683 529 629` y después
modificar la voz. Ese teléfono es solo para la prueba autorizada, no para campañas.
No realizar la llamada hasta que el agente esté legítimamente listo y la ruta de prueba
registre la evaluación. No programar automáticamente otra llamada a las 21:00: la
automatización anterior quedó pausada cuando el usuario pidió hacerla inmediatamente.

## Reglas de seguridad y operación

- Mantener grabación completa de todas las llamadas y avisar al interlocutor según la
  configuración de cumplimiento.
- Respetar opt-out, horarios, cuotas y límites de concurrencia.
- No llamar a contactos ni activar campañas sin que existan campaña activa, lead válido
  y agente publicado.
- No leer ni mostrar secretos en la terminal. Si una credencial ya fue entregada, usar
  el entorno privado del servicio, nunca incrustarla en código o documentación.
- Antes de cambios remotos, crear backup y verificar con `node --check`,
  `systemd-analyze verify` y estado de servicios.
- No reiniciar Asterisk, el CRM o nginx para cambios que solo afectan al worker.
- El árbol de trabajo tiene muchos cambios del usuario sin commit. Preservarlos; no
  usar `git reset --hard`, `git checkout --` ni limpiezas masivas.

## Qué debe hacer Claude Code al continuar

1. Leer este archivo y `integrations/zadarma/README.md` antes de tocar la integración
   telefónica.
2. Revisar el estado de Git y trabajar solo sobre los archivos necesarios.
3. Ejecutar primero pruebas offline y compilación local.
4. Si se cambia el runtime remoto, usar despliegue aditivo con backup y comprobar
   heartbeat, servicios y registros SIP después.
5. Para recuperar Hetzner, seguir únicamente la sección de acceso remoto; no usar
   contraseñas expuestas ni guardar secretos.
6. Resolver primero el cliente Prisma del VPS para `VoiceTestNumber` y `Call.isTest`.
7. Mantener el bloqueo de publicación hasta que exista consentimiento y evaluación
   reales. Explicar el bloqueo con precisión en vez de simular una llamada.

## Documentación relacionada

- `ESTADO_DEL_SOFTWARE.md`: explicación funcional general.
- `docs/ARQUITECTURA_VOZ.md`: arquitectura de voz.
- `docs/PRODUCCION_RUNBOOK.md`: operación y producción.
- `docs/sistema-llamadas-explicado.md`: flujo de llamadas.
- `integrations/zadarma/README.md`: estado y despliegue específico de Zadarma.
- `backend/prisma/schema.prisma`: modelo de datos.
