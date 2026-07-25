# Comparativa de sistemas de voz para llamadas en inglés

**Fecha:** 24 de julio de 2026  
**Ámbito:** comparación de arquitecturas y modelos autoalojables para llamadas comerciales en inglés.  
**Objetivo:** determinar si el cambio de idioma hace viable usar directamente PersonaPlex/Moshi o si sigue siendo preferible una cascada OSS.

## 1. Conclusión ejecutiva

En inglés, PersonaPlex y Moshi parten de una situación mucho mejor que en español: sus modelos, demostraciones y evaluación se centran principalmente en conversaciones inglesas. PersonaPlex se presenta como un modelo speech-to-speech full dúplex con control de persona y voz, mientras que Moshi es un framework full dúplex con entrenamiento y fine-tuning públicos. [PersonaPlex](https://github.com/NVIDIA/personaplex) · [Moshi](https://github.com/kyutai-labs/moshi)

El trabajo de Kyutai sobre interactividad añade una segunda dimensión importante: no basta con entender inglés. El agente debe saber cuándo hablar, cuándo esperar, cuándo emitir `uh-huh`, `right` o `I see`, y cuándo detenerse si el usuario interrumpe. El método trata pausa, turn-taking, backchannel e interrupción como objetivos separados, con una recompensa adicional de calidad semántica. [Artículo de Kyutai](https://kyutai.org/blog/2026-06-10-interactivity/) · [paper](https://arxiv.org/abs/2606.11167)

Para inglés, el ranking cambia:

1. **PersonaPlex + alineamiento de interactividad** para la experiencia full dúplex.
2. **Moshi + fine-tuning/alineamiento** para construir un modelo propio.
3. **Qwen3-Omni** para una base end-to-end multilingüe con inglés fuerte.
4. **Cascada OSS + Interaction Loop** para producción controlable.
5. **GLM-4-Voice** como alternativa de investigación bilingüe.

Si el criterio principal es operación CRM, permisos, herramientas y trazabilidad, la cascada sigue siendo la opción de menor riesgo.

## 2. Sistemas comparados

### S1 — Cascada OSS básica

```text
audio -> VAD -> STT -> LLM -> TTS -> audio
```

**Ejemplo:** faster-whisper o Qwen3-ASR + Smart Turn + Qwen/Llama local + Piper/Kokoro/Qwen3-TTS.

**Puntos fuertes**

- Control completo del idioma, prompt, herramientas y reglas.
- Fácil de depurar cuando falla un nombre, número o acción.
- Puede usar modelos ingleses muy maduros en cada etapa.
- Permite cambiar TTS, acento o voz sin reentrenar el LLM.
- Menor riesgo de seguridad y de integración con el CRM.

**Puntos débiles**

- Latencia acumulada entre STT, LLM y TTS.
- Puede cortar el turno ante `um… let me think` o `hold on a second`.
- Backchannels y silencios suelen depender de reglas externas.
- No modela conjuntamente prosodia, solapamiento y significado.

**Inglés:** muy adecuado.  
**Full dúplex:** medio con controlador; bajo si espera siempre el final de turno.

### S2 — Cascada OSS con Interaction Loop

```text
audio continuo
  -> ring buffer + VAD
  -> STT parcial + Smart Turn
  -> listen / wait / backchannel / answer / interrupt
  -> LLM local + tools en background
  -> TTS cancelable
```

**Puntos fuertes**

- Mejor equilibrio entre naturalidad y control operativo.
- Permite tratar `um`, `uh`, `well`, `let me think` y `hold on` como pausas o retenciones.
- Permite decidir que `yeah` o `right` son backchannels y no siempre una nueva pregunta.
- Node conserva toda la autoridad sobre CRM y compliance.
- Es la ruta más sencilla para comparar acentos US/UK y voces comerciales.

**Puntos débiles**

- El comportamiento full dúplex sigue siendo orquestado externamente.
- Puede acumular reglas específicas de idioma difíciles de mantener.
- Los parciales STT no equivalen a una comprensión audio-audio nativa.
- El TTS por frases puede dejar microcortes.

**Inglés:** muy adecuado.  
**Full dúplex:** alto como experiencia, no nativo como arquitectura.

### S3 — Moshi base

Moshi modela streams de audio del usuario y del agente con Mimi y está diseñado para diálogo hablado full dúplex. El repositorio oficial describe latencias prácticas bajas en GPU y proporciona PyTorch, Rust y otros backends. [Moshi](https://github.com/kyutai-labs/moshi)

**Puntos fuertes**

- El inglés es el dominio natural de la base publicada.
- Escucha y habla de forma simultánea.
- Puede generar pausas, solapamientos y señales no verbales de manera conjunta.
- Tiene una ruta de inferencia más cercana a GPT-Live que una cascada.

**Puntos débiles**

- El modelo general no conoce automáticamente nuestro producto, CRM ni guion comercial.
- Es menos transparente que STT + LLM + TTS separados.
- La voz y el comportamiento comercial requieren adaptación.
- Necesita una política externa para herramientas, privacidad y acciones de negocio.

**Inglés:** alto.  
**Full dúplex:** muy alto.

### S4 — Moshi personalizado para llamadas en inglés

Kyutai publica [moshi-finetune](https://github.com/kyutai-labs/moshi-finetune), con dataset estéreo agente/usuario, LoRA y fine-tuning completo.

```text
Moshi + Mimi
  + llamadas inglesas estéreo
  + acento/voz de marca
  + objeciones comerciales
  + interrupciones y backchannels
  = Moshi-Call-EN
```

**Puntos fuertes**

- Menor riesgo lingüístico que Moshi-ES.
- Podemos especializarlo en ventas, soporte o cualificación.
- El dataset puede enseñar exactamente `um`, `uh-huh`, `right`, `one moment` y silencios.
- LoRA permite iterar sin reemplazar completamente el modelo base.
- Es la mejor base para nuestro propio motor inglés full dúplex.

**Puntos débiles**

- Necesita grabaciones con derechos y etiquetado temporal.
- Puede sobreajustarse a un acento, voz o patrón de venta.
- Fine-tuning puede cambiar negativamente la latencia o la naturalidad.
- Requiere evaluar llamadas completas, no sólo frases.

**Inglés:** muy alto.  
**Full dúplex:** muy alto.

### S5 — PersonaPlex original

PersonaPlex es un modelo full dúplex speech-to-speech basado en Moshi, entrenado con conversaciones sintéticas y reales, con control de rol mediante prompt y voz mediante conditioning. El model card oficial lo describe para entrada y salida inglesa, con audio mono a 24 kHz. [Repositorio](https://github.com/NVIDIA/personaplex) · [model card](https://huggingface.co/nvidia/personaplex-7b-v1)

**Puntos fuertes**

- Es el candidato más directo para una experiencia natural en inglés.
- Full dúplex nativo, incluyendo interrupciones y solapamientos.
- Voz y persona forman parte del mismo motor.
- Tiene ejemplos y roles de customer service.
- Puede servir como benchmark inmediato sin entrenar un modelo nuevo.

**Puntos débiles**

- El modelo no conoce nuestra lógica de CRM, permisos ni herramientas.
- Las voces preempaquetadas no equivalen a una voz de marca.
- Hay que adaptar su server/websocket al contrato de llamadas.
- Los pesos están bajo NVIDIA Open Model License; el código es MIT.
- Puede producir conversaciones naturales pero no necesariamente respuestas comerciales fiables.

**Inglés:** muy alto.  
**Full dúplex:** máximo entre los sistemas listos para probar.

### S6 — PersonaPlex + alineamiento de interactividad Kyutai

```text
PersonaPlex inglés
  -> post-training de interactividad
     ├─ pausa
     ├─ turn-taking
     ├─ backchannel
     ├─ interrupción
     └─ calidad semántica
```

**Puntos fuertes**

- Es la combinación con mayor potencial de conversación inglesa natural.
- Puede mejorar la decisión entre `stay silent`, `uh-huh`, respuesta completa e interrupción.
- El inglés coincide con el dominio publicado de PersonaPlex.
- La recompensa semántica reduce el riesgo de optimizar sólo rapidez.

**Puntos débiles**

- El artículo describe un método de post-entrenamiento, no un checkpoint comercial listo.
- Necesitamos datos ingleses de llamadas, no sólo conversaciones casuales.
- Los objetivos de recompensa deben evitar backchannels excesivos o inadecuados.
- Herramientas, CRM y control de negocio siguen fuera del modelo.

**Inglés:** máximo.  
**Full dúplex:** máximo.

### S7 — Qwen3-Omni

Qwen3-Omni declara 19 idiomas de entrada de voz y 10 de salida, incluyendo inglés, además de streaming de audio/texto e interacción en tiempo real. [Qwen3-Omni](https://github.com/QwenLM/Qwen3-Omni)

**Puntos fuertes**

- Modelo end-to-end con buena cobertura multilingüe.
- Inglés disponible desde el checkpoint, sin adaptación lingüística inicial.
- Texto y audio streaming en un único servicio.
- Puede ser una buena alternativa si PersonaPlex no encaja por licencia o hardware.

**Puntos débiles**

- El checkpoint principal `30B-A3B` es pesado.
- Turn-taking natural no garantiza exactamente el mismo full dúplex que PersonaPlex.
- Hay que comprobar interrupción, silencios y backchannels en llamadas reales.
- Las voces disponibles pueden no coincidir con la marca.
- La licencia del código y la del checkpoint deben revisarse separadamente.

**Inglés:** muy alto.  
**Full dúplex:** alto, pendiente de medición específica.

### S8 — GLM-4-Voice

GLM-4-Voice ofrece conversación de voz end-to-end y streaming texto/voz en chino e inglés. [GLM-4-Voice](https://github.com/zai-org/GLM-4-Voice)

**Puntos fuertes**

- Inglés soportado oficialmente.
- Arquitectura tokenizer + LLM + decoder de voz.
- Control de velocidad, emoción y estilo.
- Código Apache-2.0.

**Puntos débiles**

- Es más turn-based que Moshi/PersonaPlex.
- Tiene más piezas internas que integrar y monitorizar.
- Los pesos tienen condiciones propias.
- La calidad full dúplex y la respuesta a interrupciones deben validarse.

**Inglés:** alto.  
**Full dúplex:** medio/alto.

## 3. Ranking para llamadas comerciales en inglés

La puntuación comercial no debe premiar únicamente la naturalidad. Para Vendrava, una llamada que suena humana pero confirma mal una cita, incumple un opt-out o ejecuta una acción incorrecta es peor que una llamada ligeramente menos natural pero controlada.

### Fórmula de puntuación comercial

| Criterio | Peso | Qué representa |
|---|---:|---|
| Idioma y comprensión | 10 % | Inglés, acentos, nombres, números y entidades. |
| Interactividad | 20 % | Pausas, backchannels, turn-taking e interrupciones. |
| Latencia | 15 % | Primer audio, barge-in, parciales y herramientas. |
| Calidad de voz | 15 % | Naturalidad, inteligibilidad, prosodia y estabilidad. |
| CRM y herramientas | 25 % | Permisos, policy engine, opt-out, agenda y transferencias. |
| Riesgo de producción | 15 % | Coste, concurrencia, trazabilidad, fallos y control operativo. |

La columna `Riesgo de producción` se puntúa como **seguridad y viabilidad**, no como riesgo bruto: una puntuación alta significa menor riesgo operativo.

### Ranking ponderado

| Puesto | Sistema | Idioma | Interactividad | Latencia | Voz | CRM/tools | Seguridad | Total |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Cascada OSS + Interaction Loop inglés | 10 | 8 | 7 | 9 | 10 | 9 | **8,9** |
| 2 | Moshi-Call-EN + alineamiento Kyutai | 10 | 10 | 10 | 9 | 6 | 5 | **8,0** |
| 3 | Moshi base | 9 | 9 | 10 | 8 | 7 | 5 | **7,9** |
| 4 | PersonaPlex + alineamiento Kyutai | 10 | 10 | 10 | 9 | 5 | 4 | **7,7** |
| 5 | PersonaPlex original | 10 | 9 | 10 | 9 | 5 | 5 | **7,7** |
| 6 | Qwen3-Omni adaptado a VoiceSession | 9 | 8 | 8 | 8 | 7 | 6 | **7,6** |
| 7 | GLM-4-Voice | 9 | 6 | 7 | 8 | 6 | 6 | **6,8** |

### Dos rankings prácticos

**Mejor experiencia de conversación inglesa:**

1. PersonaPlex + alineamiento Kyutai.
2. Moshi-Call-EN + alineamiento Kyutai.
3. PersonaPlex original.

**Menor riesgo para producción comercial:**

1. Cascada OSS + Interaction Loop.
2. Qwen3-Omni detrás de un adapter controlado.
3. PersonaPlex original en canary.
4. Moshi-Call-EN cuando haya dataset propio suficiente.

**Mejor activo tecnológico propio a medio plazo:**

1. Moshi-Call-EN.
2. PersonaPlex-EN adaptado.
3. Interaction Loop OSS como capa de control común.

El ranking de demo y el ranking de producto no son el mismo. PersonaPlex debe ser el sistema que sorprende en una demostración; la cascada debe ser el sistema que atiende a los primeros clientes.

## 4. Coste, concurrencia y operación real

Antes de entrenar Moshi-Call-EN hay que responder cuatro preguntas:

- ¿Cuánta GPU consume una llamada activa?
- ¿Cuántas llamadas simultáneas soporta el servidor sin romper el P95?
- ¿Cuál es el coste por minuto incluyendo GPU, telefonía y almacenamiento?
- ¿Qué ocurre si el modelo se bloquea o se queda sin memoria?

Una prueba con una llamada no sirve como prueba de producto. Cada sistema debe medirse con 1, 2, 4, 8 y el número máximo previsto de llamadas simultáneas, registrando:

- VRAM y RAM;
- utilización de CPU/GPU;
- latencia P50/P90/P95;
- audio perdido o duplicado;
- tiempo de recuperación;
- coste aproximado por minuto;
- tasa de error por llamada.

Con un presupuesto inicial cercano a **1.500 €**, no entrenaría todavía Moshi-Call-EN. Lo usaría para:

1. preparar y etiquetar un pequeño dataset de llamadas reales;
2. probar la cascada OSS con los primeros clientes;
3. evaluar PersonaPlex en un canary de laboratorio;
4. identificar qué comportamientos provocan cuelgues, interrupciones o aceptación.

El entrenamiento propio tendría sentido después de acumular suficientes llamadas, objeciones y ejemplos de los sectores objetivo.

## 5. Telefonía, AMD y transferencia humana

Los benchmarks de micrófono limpio no representan una llamada comercial. La evaluación debe incluir móvil, ruido, altavoz, mala cobertura, G.711/µ-law y jitter.

Además de la conversación, el sistema debe medir y proteger:

### AMD y buzones

- humano real;
- buzón de voz;
- IVR;
- gatekeeper o recepción;
- silencio inicial;
- mensaje automático.

Un motor muy natural que deja un mensaje de voz largo o sigue hablando con un IVR no es un buen producto comercial.

### Transferencia humana

El agente debe transferir cuando:

- el cliente lo solicita;
- hay una objeción que la política no permite resolver;
- se requiere una decisión humana;
- la confianza cae por debajo del umbral;
- el cliente está frustrado;
- una herramienta falla repetidamente.

La transferencia debe incluir un resumen estructurado, intención, objeciones, datos confirmados y siguiente acción. El modelo de voz no debe ejecutar la transferencia por su cuenta: debe solicitarla al Policy Engine de Vendrava.

## 6. Arquitectura de producto recomendada

```text
Telefonía
   ↓
Audio continuo + cancelación de eco
   ↓
Interaction Loop
   ├─ escuchar
   ├─ esperar
   ├─ backchannel
   ├─ responder
   ├─ detener audio
   └─ solicitar transferencia
   ↓
STT inglés rápido
   ↓
LLM local / servicio de razonamiento
   ↓
Policy Engine de Vendrava
   ├─ permisos
   ├─ guion comercial
   ├─ consentimiento
   ├─ opt-out
   ├─ CRM
   ├─ AMD
   └─ tools y transferencia
   ↓
TTS cancelable
```

El modelo full dúplex no debe recibir credenciales ni poder modificar contactos, cerrar acciones comerciales o saltarse una exclusión. Node debe mantener la autoridad sobre CRM, permisos, persistencia, transferencias y compliance.

En paralelo:

```text
5–10 % de llamadas controladas
   ↓
PersonaPlex
   ↓
Comparación automática y humana
   ├─ conversión
   ├─ interrupciones
   ├─ latencia
   ├─ errores
   ├─ duración
   ├─ satisfacción
   └─ transferencias correctas
```

## 7. Medición específica para inglés

### 4.1 Pausas y expresiones de relleno

El conjunto de evaluación debe distinguir:

| Caso | Ejemplo | Comportamiento correcto |
|---|---|---|
| Pensamiento | `um… let me think` | Esperar, no tomar el turno demasiado pronto. |
| Retención | `uh… hold on a second` | Permanecer en silencio hasta que vuelva. |
| Duda breve | `well… maybe` | No responder antes de la intención completa. |
| Backchannel | `yeah`, `right`, `uh-huh` | No tratarlo automáticamente como pregunta nueva. |
| Autocorrección | `Tuesday… sorry, Thursday` | Mantener el último valor corregido. |
| Confirmación | `yes, exactly` | Reconocer y continuar sin repetir todo. |
| Interrupción | el usuario habla encima | Detener o adaptar el audio inmediatamente. |
| Pausa con ruido | teclado, respiración, oficina | No confundir ruido con nuevo turno. |

Métricas:

- `false_takeover_rate`: el agente toma el turno durante una pausa.
- `hold_compliance`: respeta `hold on`, `one moment`, `let me check`.
- `backchannel_precision`: backchannels emitidos en contexto correcto.
- `backchannel_overlap_rate`: backchannels que pisan información útil.
- `turn_end_precision` y `turn_end_recall`.
- `interruption_success_rate`.
- `semantic_recovery_rate`: recuperación correcta después de una autocorrección.

### 4.2 Latencia

Registrar P50, P90 y P95:

| Métrica | Definición | Objetivo inicial |
|---|---|---:|
| `speech_to_first_audio_ms` | fin de intención del usuario a primer audio agente | < 700 ms P50 |
| `barge_in_stop_ms` | inicio de voz usuario a audio agente detenido | < 250 ms P95 |
| `pause_decision_ms` | pausa ambigua a decisión esperar/hablar | < 300 ms |
| `backchannel_delay_ms` | oportunidad válida a `uh-huh/right/I see` | 300–1.200 ms |
| `stt_partial_ms` | frame de audio a parcial útil | < 400 ms |
| `tts_first_byte_ms` | texto listo a primer audio | < 300 ms local |
| `tool_while_speaking_ms` | petición a evento de tool sin cortar audio | sin bloqueo |

Los objetivos son metas de producto. Deben medirse con hardware, concurrencia, red y codec reales.

### 4.3 Calidad de voz inglesa

Evaluar por separado:

- acento US, UK y otros objetivos comerciales;
- inteligibilidad telefónica a 8 kHz;
- pronunciación de nombres propios y empresas;
- números, fechas, moneda y abreviaturas;
- ritmo y pausas naturales;
- consistencia de voz tras barge-in;
- `uh-huh`, `right`, `I see`, `got it` y silencios sin repetición mecánica;
- estabilidad durante llamadas de 30 minutos;
- ausencia de chasquidos, audio duplicado o frases truncadas.

Métricas recomendadas:

- MOS de naturalidad por oyentes anglófonos;
- MOS de inteligibilidad telefónica;
- speaker similarity frente a la voz de marca;
- WER de una segunda transcripción sobre el audio generado;
- tasa de artefactos y cortes;
- consistencia de prosodia y energía;
- evaluación ciega frente a operador humano y baseline TTS.

## 8. Qué sistema elegir según el objetivo

| Objetivo | Elección |
|---|---|
| Demo full dúplex inglesa con mínima adaptación | PersonaPlex original |
| Mejorar pausas, `uh-huh`, `right` e interrupciones | PersonaPlex/Moshi + alineamiento Kyutai |
| Crear nuestro propio motor inglés | Moshi-Call-EN |
| Producción con CRM, tools y trazabilidad | Cascada OSS + Interaction Loop |
| Probar modelo end-to-end multilingüe | Qwen3-Omni |
| Cambiar voces y controlar pronunciación | Cascada con TTS local especializado |
| Menor dependencia de reglas externas | Moshi o PersonaPlex |
| Menor riesgo operativo | Cascada OSS |

## 9. Estructura recomendada

```text
Producción:
  Node control plane
    -> Interaction Loop OSS
    -> STT/LLM/TTS locales
    -> CRM/tools en Node

Canary full dúplex:
  Node VoiceSession
    -> PersonaPlex o Moshi-Call-EN aislado
    -> eventos de texto, audio e interrupción
    -> mismas métricas y mismas reglas CRM
```

El motor full dúplex no debe recibir credenciales ni ejecutar directamente herramientas de negocio. Node debe seguir siendo la autoridad para permisos, datos del cliente, opt-out, transferencias y persistencia.

## 10. Veredicto

Hacer el producto en inglés vuelve mucho más viable utilizar PersonaPlex o construir `Moshi-Call-EN`. El idioma deja de ser el principal riesgo y la inversión puede centrarse en:

- voz de marca;
- interactividad;
- llamadas comerciales;
- herramientas y seguridad;
- latencia y estabilidad.

La decisión operativa recomendada queda así:

1. **Primeros 3–4 clientes:** cascada OSS + Interaction Loop, con el Policy Engine de Vendrava controlando CRM, permisos, consentimiento, opt-out y transferencias.
2. **Canario de investigación:** PersonaPlex en un 5–10% de llamadas controladas, aislado de las acciones de negocio y comparado con la cascada.
3. **Activo propio posterior:** `Moshi-Call-EN` únicamente después de reunir cientos o miles de llamadas reales, objeciones y ejemplos del sector. El presupuesto inicial de aproximadamente 1.500 € debe ir a datos, etiquetado, prototipos y evaluación; todavía no al entrenamiento.

La mejor ruta de investigación sigue siendo **PersonaPlex + alineamiento de Kyutai**. La mejor ruta para crear un activo propio, cuando exista suficiente evidencia, es **Moshi-Call-EN + fine-tuning y alineamiento**. La mejor ruta para poner el CRM en producción es **cascada OSS + Interaction Loop**.
