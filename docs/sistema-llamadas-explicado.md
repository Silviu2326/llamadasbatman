# El sistema de llamadas, explicado en simple

Actualizado: 08/08/2026. Versión sin jerga de [`sistema-llamadas.md`](./sistema-llamadas.md)
(mapa técnico) y [`llamadas/09-sistema-actual-implementado.md`](../llamadas/09-sistema-actual-implementado.md)
(estado pieza por pieza).

## 1. Qué es

Un agente que atiende y hace llamadas de teléfono reales, habla con la persona,
entiende lo que dice, responde con una voz propia y deja todo registrado en el
CRM: transcripción, resultado, siguiente acción.

No es una locución grabada ni un menú de opciones. Es una conversación: puedes
interrumpirle a mitad de frase y se calla, como haría una persona.

## 2. Las cinco piezas

Cinco especialistas en cadena. Cada uno hace una sola cosa:

| Pieza | En cristiano | Qué usa |
|---|---|---|
| **VAD** | Decide si lo que llega es voz o es ruido | Silero |
| **Fin de turno** | Decide si la persona **ha terminado** de hablar o solo hizo una pausa | Smart Turn v3 |
| **STT** | Convierte la voz en texto | faster-whisper |
| **LLM** | Decide qué contestar | Llama 3.3 70B (Cerebras) o modelo local |
| **TTS** | Convierte el texto en voz | Qwen3-TTS con la voz del actor |

Y por encima de los cinco, **Node**: el que manda. Ninguna respuesta sale al aire
sin que Node dé permiso (sección 5).

## 3. El viaje de una llamada, paso a paso

```text
La persona habla
      ↓
Twilio nos manda el audio del teléfono (calidad telefónica, 8 kHz)
      ↓
Lo limpiamos y lo subimos a 16 kHz (filtro + control de volumen)
      ↓
VAD: "esto es voz"
      ↓
La persona se calla
      ↓
Fin de turno: "¿ha terminado o está pensando?"      ← aquí se juega la latencia
      ↓
STT: "ha dicho: quiero cita para el martes"
      ↓
Node decide: ¿respondemos? ¿aclaramos? ¿transferimos? ¿colgamos?
      ↓
LLM escribe la respuesta, frase a frase
      ↓
TTS convierte la primera frase en voz mientras escribe la segunda
      ↓
Bajamos el audio a calidad telefónica y lo enviamos a Twilio
      ↓
La persona oye la respuesta
```

Si la persona vuelve a hablar en cualquier punto de ese recorrido, todo lo que
está en marcha se cancela y se vacía el audio pendiente. Eso es el **barge-in**:
que no siga hablando encima de ti.

## 4. La latencia: el número que lo decide todo

### Qué es

El tiempo desde que la persona **termina** de hablar hasta que **empieza** a oír
la respuesta. Por debajo de un segundo, la conversación se siente natural. Por
encima de segundo y medio, se nota que es una máquina y la gente empieza a
hablar encima o a colgar.

### Cuánto tarda cada tramo

| Tramo | Tiempo | Comentario |
|---|---:|---|
| Detectar que ha terminado de hablar | 250 ms | El tramo más caro, y es **decisión nuestra**, no lentitud |
| Pasar la voz a texto (STT) | 50-150 ms | En GPU, con vocabulario del negocio cargado |
| Decidir qué responder (LLM) | 300-500 ms | Hasta la primera frase, no hasta el final |
| Empezar a hablar (TTS) | incluido | Empieza con la primera frase, no espera al párrafo |
| **Total percibido** | **~700-900 ms** | Picos de ~1,2 s cuando la persona deja una frase a medias |

### Por qué esperar 250 ms es lo correcto

El error clásico de estos sistemas es responder demasiado pronto y pisar a la
persona. Aquí la espera no es fija: va de 250 ms a 1.200 ms según la **certeza**
de que la frase ha terminado, y se recalcula cada 150 ms mientras dura el
silencio.

| Situación | Espera | Ejemplo |
|---|---:|---|
| Claramente terminada | **250 ms** | "Quiero cita para el martes." |
| Dudoso | **entre medias** | Cuanta menos certeza, más espera |
| Claramente a medias | **1.200 ms** | "Pues mira, lo que pasa es que…" |

Y encima de eso, tres cosas que el sistema ya sabía y ahora usa:

- **Qué acaba de preguntar.** Una pregunta de sí/no se cierra un 20% antes; una
  pregunta abierta o una propuesta de cita esperan hasta un 40% más, porque la
  persona está pensando o mirando su calendario.
- **Cómo termina la frase.** Nadie acaba un turno en "porque", "es que" o "para".
  Ni deletreando un correo a medias ("robin arroba…"). Si el texto queda abierto,
  se espera al máximo pase lo que pase.
- **Cómo pausa esa persona.** Se miden sus pausas reales durante la llamada; a
  quien habla despacio no se le corta a los 250 ms aunque el modelo lo sugiera.

O sea: rápido cuando puede serlo, paciente cuando la persona todavía está
pensando. Y si se equivoca y responde antes de tiempo, el barge-in lo corrige
solo — la persona sigue hablando y el agente se calla.

### Tres trucos que hacen que se note menos

1. **Habla por frases.** Empieza a sonar la primera frase mientras el modelo
   escribe la segunda. La espera real se parte por la mitad.
2. **Muletillas** ("ajá", "mmm") mientras piensa, igual que una persona.
3. **Ruido de línea muy sutil.** El silencio digital absoluto suena a robot; un
   fondo casi imperceptible hace que la llamada suene a llamada.

## 5. Quién manda: el freno de mano

Esta es la diferencia importante con un asistente de voz normal.

En un sistema típico, el modelo de lenguaje oye y contesta directamente. Aquí no:
entre el "lo que ha dicho" y el "lo que voy a contestar" hay una parada
obligatoria en Node, nuestro backend.

```text
Motor:  "ha dicho esto, propongo responder"
Node:   comprueba consentimiento, opt-out, si pide hablar con una persona,
        si está enfadado, si la acción comercial está permitida,
        en qué punto de la venta estamos y qué datos puede usar
Node:   "responde" / "aclara" / "transfiere" / "cuelga"
Motor:  solo entonces arranca el modelo y la voz
```

Cuatro respuestas posibles y solo una permite hablar:

- **responder** — conversación normal;
- **aclarar** — confirmar el dato dudoso antes de seguir (si no se ha entendido
  bien un precio, un email o una fecha);
- **transferir** — callar y pasar la llamada a una persona;
- **colgar** — callar y terminar (por ejemplo, si pide que no le llamen más).

Si esa consulta tarda demasiado, el sistema no improvisa: por defecto pide
aclaración y nunca confirma precios, citas ni datos sensibles por su cuenta.

**Por qué importa:** el modelo de lenguaje nunca decide sobre cumplimiento
legal. No puede saltarse un opt-out aunque el texto de la conversación le empuje
a ello, porque no llega a ejecutarse. Esa parada está en el camino del audio, no
en un documento de políticas.

## 6. Qué más hace mientras habla

- **Sabe con quién habla:** ficha del lead, notas y última llamada entran en el
  contexto antes de descolgar.
- **Sabe del negocio:** precios y plazos salen de la base de conocimiento. Si el
  dato no está, lo dice; no se lo inventa.
- **Nota el tono:** un módulo aparte detecta si la persona suena molesta,
  dudosa o receptiva, y el agente adapta el registro. Corre en paralelo, así que
  no añade ni un milisegundo a la respuesta.
- **Duda cuando debe:** si el reconocimiento de voz no está seguro de lo que ha
  oído, confirma antes de responder en vez de adivinar.
- **Se presenta como IA** al empezar, salvo configuración explícita. Si además
  analiza el tono de voz, también lo dice.
- **Recuerda la llamada entera:** a partir de 16 turnos hace un resumen rodante
  para no perder el hilo.

## 7. Qué es real hoy y qué no

**Funciona y está probado en código:**

- la cadena completa de audio, el fin de turno adaptativo y el barge-in;
- el freno de mano de Node con sus cuatro decisiones;
- opt-out, transferencia, consentimiento y aviso de IA;
- la voz del actor con varios registros (neutro, cálido, empático, serio…);
- todo lo que pasa queda registrado y es auditable llamada a llamada.

**Todavía no:**

- **el número de latencia no está medido en llamadas reales.** Los ~700-900 ms
  son un presupuesto calculado tramo a tramo en el laboratorio, no un p50/p95
  medido por teléfono. Hasta hacer esa prueba no hay compromiso de servicio;
- los modelos grandes del perfil de máxima calidad necesitan servidores que
  todavía no están desplegados;
- las voces definitivas del actor están pendientes de grabar.

## 8. Lo que hay que responder cuando pregunten

| Pregunta | Respuesta honesta |
|---|---|
| "¿Cuánto tarda en contestar?" | Presupuesto de 700-900 ms; medición telefónica real pendiente. |
| "¿Se le puede interrumpir?" | Sí, y deja de hablar de inmediato. |
| "¿Se nota que es una IA?" | Lo dice él mismo al empezar. Es obligatorio desde el 2 de agosto de 2026. |
| "¿Puede meter la pata con un precio?" | Solo dice lo que hay en la base de conocimiento; si no está, lo reconoce. |
| "¿Y si el cliente pide que no le llamen?" | Se corta la respuesta a medias, se registra la exclusión y se cuelga. |
| "¿Está en producción?" | Aún no: falta la prueba telefónica completa y cerrar los hallazgos de la auditoría. |
