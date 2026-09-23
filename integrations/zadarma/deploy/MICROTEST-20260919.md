# Microprueba grabada realizada — 19 de septiembre de 2026

La llamada al número propio autorizado se conectó a las 13:25:44 UTC y terminó aproximadamente 17 segundos después. No repetirla automáticamente.

- Organización: cmt76072o0001qr44mtnt49q2.
- Agente: cmt8j5dmy0007dk872quuuwys (sigue en borrador).
- Call: cmu8f7o4a0001kmx3ve4buejw, isTest=true.
- SID: zadarma:cc34560f-ed0e-4e9e-a8e7-d0c1878d7261.
- Grabación local ignorada por Git: integrations/zadarma/microtest-recording.local.wav.
- WAV completo de 256044 bytes, 16 segundos, mono a 8000 Hz; marcador .ready presente.
- Grabación servida correctamente por HTTPS autenticado: HTTP 200, audio/wav.
- Transcripción: solo saludo del agente con identificación como IA y aviso de grabación. No consta respuesta del usuario; no afirmar conversación bidireccional validada.
- Evaluación automática heurística: 77, needs_review, sin dimensiones evaluables de turn-taking/naturalidad. No publicar basándose solo en esa puntuación.

Correcciones aplicadas y verificadas:

1. Microprueba explícitamente solicitada por el titular: autorización corta ligada a agente, número propio interno y voz, con grabación aceptada. Permite horario excepcional únicamente en esa prueba. Voz oficial de Fish Audio comprobada en vivo como licensed=true; no se creó consentimiento personal ficticio. No cambia publicación ni reglas de campañas.
2. El padre /var/spool/asterisk/monitor era asterisk:sprintmarkt 0770. El usuario autorizó expresamente la ACL u:vendrava:--x para atravesarlo, sin listar ni leer otras grabaciones. Copia de ACL original: /opt/vendrava/backups/testcall-20260919T130608Z/monitor-parent.acl.
3. La marcación eliminaba el signo + del destino. La observación acotada confirmó autenticación SIP seguida de 404 Not Found. Se corrigió originateFields para conservar E.164 completo. Tras corregirlo, la llamada sonó y se conectó.
4. Diagnóstico AMI con una lista acotada de motivos, sin mostrar destinos o texto arbitrario del operador.

El ajuste principal se desplegó a las 13:06 UTC; backup /opt/vendrava/backups/testcall-20260919T130608Z. ami.js se actualizó después con copias de seguridad en esa misma carpeta. El empaquetador ahora incluye ami.js para no perder la corrección en futuros despliegues.

Validación: backend compilado; 12 pruebas de autorización/grabación aprobadas y prueba AMI con conservación del + aprobada. Servicios Vendrava, Asterisk, nginx y Sprintmarkt activos al finalizar. No se modificó ni reinició la configuración de Asterisk/nginx/Sprintmarkt.

Cierre: la solicitud temporal en ContactConsent.metadata.internalVoiceTest se eliminó tras la llamada; ContactConsent y el número propio permanecen registrados. La clave SSH temporal se retiró de authorized_keys y se eliminaron sus archivos locales. Para otra prueba se necesita una nueva solicitud del usuario; no reutilizar una excepción caducada ni iniciar otra llamada por iniciativa propia.
