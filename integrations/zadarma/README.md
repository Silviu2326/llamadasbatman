# Zadarma y el agente Vendrava

## Ruta de prueba para agentes en borrador — 17 de septiembre de 2026

Implementada la ruta de producto que faltaba para cerrar el quinto requisito de
publicación. Antes no existía forma legítima de obtener la llamada real evaluada:
`leadCallDispatch` y `prepareSipCall` solo marcan con un agente `active` dentro de
una campaña activa, y la cabina del navegador escribe audio a disco sin crear
ninguna fila `Call`.

Qué hace:

- `VoiceTestNumber` (tabla nueva): teléfonos propios de la organización
  autorizados como destino de pruebas. Cada alta guarda la declaración escrita de
  a quién pertenece el número, quién lo autorizó y cuándo, crea el contacto
  interno que lo representa y su `ContactConsent` de voz. Máximo tres activos.
- `POST /agents/:id/test-calls` lanza la prueba con el agente todavía en `draft`.
  El estado del agente no cambia ni antes ni después.
- La pasarela acepta `mode: 'test'` en `/calls` (sin campaña) y prepara la llamada
  con `prepareSipTestCall`, que vuelve a validarlo todo contra la base de datos:
  no se fía del backend que la llama. El destino sale del lead interno asociado al
  número autorizado, nunca de la petición.
- Al colgar, la llamada se ingesta con `isTest = true` y se evalúa sola. Esa
  evaluación es la que cuenta para el check `test` de publicación.

Qué NO relaja:

- El consentimiento de voz sigue siendo obligatorio **antes** de la prueba: usa la
  misma voz que una llamada real. Un `licensed=true` del catálogo del proveedor no
  vale como consentimiento personal.
- Voz, instrucciones y número de salida siguen siendo obligatorios.
- Grabación completa, opt-out, horario legal, cuota y aviso de grabación: igual que
  en una llamada de campaña. Tope de diez pruebas al día por organización.
- Las llamadas de prueba no cuentan como actividad comercial del agente, pero sí
  gastan minutos y aparecen en consumo y coste.

Estado a 18-09-2026:

1. **Migración `20260917210000_voice_test_calls`: aplicada** en Neon. Comprobado contra
   la base real: `VoiceTestNumber` responde (0 filas) y `Call.isTest` es consultable.
2. **Despliegue en el VPS: preparado, sin ejecutar.** `deploy/pack-testcall.sh` arma el
   paquete en local y `deploy/install-testcall.py` lo instala en el VPS de forma
   aditiva, con copia de seguridad, `node --check`, `systemd-analyze verify`,
   resolución del cliente Prisma y reversión automática si algo falla antes de
   reiniciar. Reinicia solo la pasarela y el worker. Bloqueado por dos cosas: la clave
   SSH temporal no está instalada (el usuario debe pegar una línea en la consola web de
   Hetzner) y el clasificador de la sesión deniega el acceso SSH al VPS.
3. **Consentimiento de voz real: pendiente**, a cuenta del usuario, que va a grabar una
   voz propia. Sin él la ruta de prueba se bloquea con `consent_missing`, que es el
   comportamiento buscado.

El cliente Prisma del VPS es el punto delicado: el runtime nuevo consulta
`prisma.voiceTestNumber`, un modelo que el cliente instalado allí todavía no conoce.
El instalador lo regenera con la CLI del propio VPS si existe y, si no, sustituye los
ficheros generados —JavaScript independiente de plataforma, con el esquema nuevo
dentro— conservando el motor de consultas Linux ya instalado. Si las versiones no
coinciden, aborta en vez de sustituir a ciegas.

## Preparación de publicación y llamadas programadas — 17 de septiembre de 2026

- Agente Carlos: número asignado `+34919931802`, voz provisional oficial Fish Audio
  `59a78821a8924989b70d2a63d588e8eb` (Makoto, catálogo con licensed=true; idioma de
  muestra ja, pronunciación española pendiente de escuchar). Sigue **draft**.
- Publicación ejecutada por el servicio normal: bloqueada por autorización de voz
  y prueba real con evaluación mínima 75/100. No se creó consentimiento ni evaluación.
  La revisión automática rechazó convertir la licencia del proveedor en consentimiento
  personal. La selección de voz por sí sola no acredita esa autorización.
- Cola PostgreSQL: cero llamadas pendientes/en proceso y cero pasos de secuencia
  en la comprobación previa. Ninguna campaña asignada al agente.
- Nuevo `backend/src/callWorker.ts` y `deploy/vendrava-call-worker.service` instalados:
  cola PostgreSQL y pasos de llamada limitados a ZADARMA_ORG_ID, heartbeat call-worker,
  arranque automático y límite 384 MB. No activa trabajos de email, WhatsApp ni contenido.
  Dos pruebas offline de aislamiento y compilación del backend aprobadas.
  **Activo y habilitado al arranque desde 18:43:30 UTC del 17 de septiembre.**
  Heartbeat PostgreSQL saludable a las 18:46:33 UTC, PID 1211106; mismo PID tras
  más de tres minutos, unos 55 MB de memoria y registro de arranque sin errores.
  Pasarela HTTPS devuelve 200, cero llamadas activas. Asterisk, pasarela, CRM y
  nginx siguen activos; SIP 232304 y 922118 siguen Registered.
- Instalación realizada mediante la consola root ya autorizada de Hetzner.
  La revisión automática rechazó añadir la nueva clave SSH; no se instaló.
  Los dos archivos de la clave temporal local se eliminaron al terminar.
  Transferencia hexadecimal verificada antes de ejecutar el instalador (SHA-256
  del archivo comprimido: ba7499748f8e464df852b1f9dc75c6a7d26c5661468c62aa7727c15c52c4ca95).
  Copia anterior de los módulos en `/opt/vendrava/backups/call-worker-20260917T184330Z`.
  No fue necesario reiniciar Asterisk ni el CRM.
- La llamada al móvil del usuario no se ha realizado. La publicación sigue
  bloqueada por consentimiento y evaluación; no existe todavía una ruta de prueba
  telefónica para agentes en borrador en la pasarela Zadarma. No se falsificó ninguna
  evaluación ni se forzó el estado activo. La automatización de las 21:00 está pausada
  tras la petición del usuario de hacer la prueba inmediatamente.
- CallerID del SIP 922118: cambiado en la interfaz de Zadarma de +13055649146
  a **+34919931802**, seleccionándolo entre los números disponibles de la cuenta.
  SIP 922118 online desde el VPS, tres líneas salientes y saldo mostrado de 5 EUR.
  No se cambiaron los números entrantes ni la configuración del SIP 232304.

## Estado verificado el 16 de septiembre de 2026

Actualización de Cerebras completada en local y en el VPS. La clave nueva quedó
solo en los archivos privados de entorno; se reinició únicamente
`vendrava-zadarma.service`, tras comprobar cero llamadas activas.

Prueba sintética ejecutada desde el VPS con su usuario de servicio y su código:
Cerebras `gpt-oss-120b` respondió OK (1001 ms al primer texto), Deepgram conectó y
Fish Audio generó 280726 bytes PCM24k (1631 ms hasta el primer audio), sin errores.
Estos tiempos pertenecen a una prueba de arranque, no miden la latencia de una
conversación telefónica real. No se llamó a ningún teléfono.

Verificación posterior: pasarela, Asterisk, nginx y CRM activos, cero reinicios
inesperados; ambos registros SIP presentes. Control HTTPS: 401 sin token y 200
con token, cero llamadas activas. AudioSocket, control y AMI siguen en loopback.
El acceso SSH temporal de esta actualización se retiró: una clave eliminada,
rechazo posterior de autenticación confirmado y archivos de clave locales borrados.
El agente sigue en borrador y sin número asignado; falta la prueba telefónica real
antes de lanzar campañas. Detalle sin credenciales en `provider-check-result.json`.

Instalación aditiva en `178.105.157.60` (Debian 13, Asterisk 22.11.0):

- **SIP 922118 instalado y Registered**, endpoint `zadarma-ai`, contacto disponible.
- El SIP 232304 (`zadarma`) sigue Registered. Asterisk, nginx y
  `sprintmarkt-crm.service` siguen activos. No se ha reiniciado la centralita.
- Node oficial 22.23.2 instalado en `/opt/vendrava/node-v22.23.2-linux-x64`.
  Archivo verificado con SHA-256 del distribuidor.
- Código y dependencias Linux en `/opt/vendrava/gateway`. Se compiló localmente:
  compilar todo el backend en el VPS excedió el límite de heap de 1536 MB fijado
  para proteger el CRM; no se amplió la memoria ni se reiniciaron sus servicios.
- Contextos `vendrava-recorded` y `vendrava-reject-inbound` instalados mediante
  un include independiente. Grabaciones privadas en
  `/var/spool/asterisk/monitor/vendrava`, propietario asterisk, grupo vendrava, 2770.
- Prueba nativa **AudioSocket + MixMonitor aprobada**: canal Local interno, cuatro
  segundos, audio entrante de 440 Hz y respuesta de 880 Hz presentes en el WAV.
  128000 bytes recibidos por el motor simulado, 48000 bytes de respuesta PCM24k,
  WAV final de 64364 bytes. UUID: `af90752d-1a21-481a-ab3d-d415f21f323b`.
  El contexto temporal de prueba se elimina al terminar. No se marcó ningún teléfono.
- **Motor IA instalado, activo y habilitado al arranque** como
  `vendrava-zadarma.service`. Credenciales copiadas tras autorización explícita
  del usuario; `/etc/vendrava/zadarma.env` es root:vendrava, modo 0640, dentro de
  un directorio 0750. Servicio estable, 0 reinicios en la comprobación inicial.
- Base de datos: autenticación comprobada desde el VPS bajo el usuario vendrava,
  sin leer contactos ni guiones. AMI autenticado con el usuario dedicado. Control HTTPS comprobado: 401 sin
  token y 200 con token. DNS y certificado confirman que crm.sprintmarkt.com
  corresponde al VPS autorizado. Audio, control y AMI solo escuchan en loopback.
- Backend local configurado para la pasarela remota y grabaciones privadas;
  `ZADARMA_GATEWAY_EMBEDDED=false`. Frontend 5173 y backend 3001 arrancados,
  comprobado HTTP 200 también a través del proxy de Vite.
- **Proveedores comprobados desde el VPS** con la nueva clave de Cerebras:
  los tres servicios respondieron correctamente. El error HTTP 402 observado
  anteriormente con la clave vieja quedó resuelto en la prueba sintética.
  No se usaron datos de clientes ni se realizaron llamadas externas.
- Agente Carlos `cmt8j5dmy0007dk872quuuwys`: voz y guion presentes, estado `draft`,
  número sin asignar. No se ha publicado ni se han eludido sus comprobaciones.

Acceso de despliegue: clave SSH temporal autorizada expresamente por el usuario,
con `restrict` y caducidad `20260917200800Z`. **Retirada del servidor al terminar
la instalación**; eliminadas también las claves privadas temporales locales y
los duplicados de credenciales de staging. La contraseña root no se almacena en el repositorio. Las claves y
paquetes `.local` están excluidos de Git.

## Arquitectura y preservación del CRM

El CRM de Carlos es FastAPI/Uvicorn en `/opt/sprintmarkt-crm`; es otro producto.
No se sustituye por este backend Node. El servicio de Vendrava tiene su propio
usuario y directorio. La base de datos de Vendrava ya está alojada en Neon.

`pjsip-existing.conf.example` añade objetos `zadarma-ai*` sobre `udp-transport`.
No añade un segundo identify para las IP de Zadarma, no mueve números entrantes,
no modifica el contexto existente `zadarma-in` ni el WebRTC `/pbx/ws`.
No copiar la plantilla para centralita nueva encima del PJSIP existente.

El backend o worker selecciona Zadarma solo para ZADARMA_ORG_ID cuando está
habilitado. La pasarela consulta contacto, campaña y agente en DB; exige agente
publicado, voz/guion/número, cuotas y permisos. El destino sale de DB, nunca de una
petición arbitraria. Reserva un UUID de un uso, origina por AMI y conecta con
AudioSocket al contestar. El audio se convierte entre 8 kHz de telefonía, 16 kHz
de reconocimiento y 24 kHz de síntesis. Registra resultado, transcripción y WAV.

AMI (5038), audio (9092) y control (9093) permanecen en loopback. Para el backend
en otra máquina se ha implementado HTTPS autenticado con token y rechazo de
redirecciones. La ruta activa es
`https://crm.sprintmarkt.com/vendrava-voice-gateway/`.
La API local comprobará además la pertenencia de cada grabación antes de pedirla
al VPS con `ZADARMA_RECORDINGS_REMOTE=true`. No se sirven WAV como archivos públicos.

## Operación y siguientes pruebas

Instalación ejecutada: `prepare-host.sh`, `install-sip.py`, `install-audio.py`,
`install-config.py` y `activate.sh`. `verify-control.cjs` confirma login AMI sin
llamar a teléfonos ni a proveedores. No volver a ejecutar los instaladores sin
revisar el estado: fallan de forma segura si detectan cambios concurrentes.

Pendiente antes de llamadas comerciales:

1. Cerebras: resuelto y verificado desde el VPS; no repetir la prueba sin motivo.
2. Confirmar CallerID español del SIP 922118 en Zadarma; en la revisión anterior
   tenía CallerID de EE. UU. Enviar un número por software no sustituye ese ajuste.
3. Completar publicación del agente y asignación de número; sigue en borrador.
4. Llamada real autorizada a un número de prueba: audio, cortes al hablar,
   transcripción, latencia, CallerID y reproducción desde el CRM.

Reinicio del motor: `systemctl restart vendrava-zadarma`; no requiere reiniciar
Asterisk, nginx ni el CRM. Configuración local anterior preservada en
`backend/.env.before-zadarma.local`, excluida de Git.

Copias previas actuales: `/opt/vendrava/backups/sip-20260916T202404Z` y
`/opt/vendrava/backups/audio-20260916T202524Z`, más la configuración previa a
activar AMI/nginx en `/opt/vendrava/backups/20260916T204325Z`. No restaurar archivos completos
si Carlos ha hecho cambios posteriores: retirar únicamente los includes de
Vendrava y recargar sus módulos preservando los cambios concurrentes.

## Grabación completa y reproducción privada

Se requiere `CALL_RECORDING_POLICY=always` para este flujo. Si existe una política
`consent` u `off`, la pasarela bloquea el marcado y no la cambia por su cuenta.
El agente anuncia al inicio que la llamada se está grabando. No se inventa una
respuesta afirmativa ni se marca consentimiento que no se haya recibido.

Crear `/var/spool/asterisk/monitor/vendrava` en un volumen persistente privado y
dar acceso al usuario de Asterisk y al usuario del backend (por ejemplo, grupo
compartido, directorio 2770 y umask 0007 en ambos servicios). El backend necesita
leer WAV y marcadores; la comprobación previa también exige escritura. El valor
`ZADARMA_RECORDING_DIR` debe apuntar al mismo directorio usado en `extensions.conf`.
Nunca situarlo bajo `public` ni habilitar un directorio HTTP estático para él.

`MixMonitor` guarda un WAV mono con las dos voces, silencios y solapamientos desde
el inicio de la conversación hasta el colgado, incluso si el agente interrumpe su
respuesta. No se graba el audio generado que se descartó antes de enviarlo al teléfono.
No se usa la opción `b`, porque AudioSocket no crea el puente de `Dial()` que exige.
Antes de abrir el motor de IA se comprueba que Asterisk ha creado la grabación.

Al cerrar, `StopMixMonitor` finaliza la cabecera y el comando posterior crea el
marcador `.ready`. Solo entonces el endpoint privado entrega el WAV; verifica el
contenedor RIFF, tamaño y pertenencia de la llamada a la organización del usuario.
El reproductor usa una petición autenticada y una URL blob temporal para reproducir,
avanzar y descargar. No expone JWTs en enlaces. Si el fichero sigue finalizándose,
se muestra un mensaje para volver a intentarlo.

Las grabaciones no se borran automáticamente. Incluir este volumen en copias y
supervisar espacio libre. Un fallo de disco o cierre abrupto puede dejar un fichero
sin `.ready`; no se sirve como si fuese una grabación completa. El registro del CRM
permanece y el reproductor indica que el audio no está disponible.

## Verificación y límites

TypeScript sin errores y 14 pruebas offline de audio, grabación y HTTPS aprobadas:

```text
node --import=tsx --test src/__tests__/zadarmaAudio.offline.test.ts src/__tests__/zadarmaRecordings.offline.test.ts src/__tests__/zadarmaRemote.offline.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

La prueba nativa `deploy/audio-smoke.cjs` usa un canal Local, no un teléfono,
con un motor simulado. Su éxito no acredita calidad de los proveedores IA ni
una conversación real por la red del operador.

- Una llamada simultánea inicialmente, máximo configurable tres; veinte minutos
  máximos por llamada. Todavía no se ha medido capacidad comercial diaria.
- Pedir una persona registra callback_requested y termina; no hay transferencia
  de audio en directo. El modo separado persiste en DB pero no comparte el
  registro en memoria ni eventos Socket.IO con la API.
- No hay detección específica de buzón ni promesas de conversaciones/ventas.
- Idempotencia en memoria durante 24 horas, máximo 5000 entradas; un reinicio
  pierde esa memoria. No se reintenta por otro operador tras resultado incierto.
- El coste mostrado en el CRM sigue siendo estimado, no una factura de Zadarma.
- API de Zadarma innecesaria para SIP/AudioSocket; no se han generado claves de
  esa cuenta ni se ha cambiado el enrutamiento de sus números existentes.

Referencias: [AudioSocket](https://docs.asterisk.org/Configuration/Channel-Drivers/AudioSocket/),
[MixMonitor](https://docs.asterisk.org/Latest_API/API_Documentation/Dialplan_Applications/MixMonitor/),
[PJSIP Zadarma](https://zadarma.com/es/support/instructions/asteriskpjsip/).
