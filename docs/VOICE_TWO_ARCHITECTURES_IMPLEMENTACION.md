# Vendrava Voice Modular y Vendrava Duplex

Fecha: 2026-07-24  
Ámbito: llamadas comerciales en inglés, servidor propio y comparación A/B.

## Decisión

Se construirán dos arquitecturas con la misma capa de negocio:

| Producto | Motor conversacional | Objetivo |
|---|---|---|
| `Vendrava Voice Modular` | VAD/Smart Turn + STT streaming + LLM local + TTS cancelable | Producción controlable desde los primeros clientes |
| `Vendrava Duplex` | Moshi/Mimi full dúplex personalizado | Activo tecnológico propio y máxima naturalidad potencial |

No se comparan dos guiones ni dos CRMs. Se compara el motor conversacional manteniendo constante la telefonía, el `Policy Engine`, las herramientas, el consentimiento, el opt-out, la transferencia y las métricas.

## Arquitectura compartida

```text
Twilio / telefonía
  -> AudioBridge + cancelación de salida
  -> VoiceSession seleccionada por arquitectura
  -> Node Policy Engine de Vendrava
       permisos · consentimiento · opt-out · CRM · AMD · transferencia
  -> VoiceTrace + Call Judge + persistencia
```

El modelo de voz no recibe credenciales ni ejecuta directamente acciones de negocio. Puede proponer una acción o devolver una salida estructurada; Node valida y ejecuta.

## A. Vendrava Voice Modular

```text
Audio continuo
  -> VAD + Smart Turn
  -> STT parcial/final
  -> LLM local de razonamiento y redacción
  -> Policy Engine
  -> TTS local cancelable
  -> audio telefónico
```

### Componentes iniciales

- STT: `faster-whisper` local, con Smart Turn opcional para el final de turno.
- LLM: servidor OpenAI-compatible local, inicialmente vLLM + Qwen3.
- TTS: Piper o Qwen3-TTS local, con voz telefónica validada.
- Control: `TurnManager`, `ProsodyController`, `SalesBrain` y `VoiceTrace` existentes.
- Ventaja operativa: cada decisión queda explicable y cada componente se puede sustituir sin volver a entrenar todo el sistema.

## B. Vendrava Duplex

```text
Audio del cliente <-> Moshi/Mimi/Moshi-Call-EN
                              |
                              +-> texto/eventos/estado estructurado
                                      -> Node Policy Engine
```

Moshi se mantiene aislado como motor de audio full dúplex. La inferencia puede vivir en un servicio local separado y Node conserva el control de la llamada. El repositorio oficial de Moshi separa implementaciones PyTorch, MLX y Rust, y documenta una ruta de servidor propia; el adaptador de Vendrava debe traducir esa sesión a nuestro contrato WebSocket sin acoplar CRM al modelo: [Moshi](https://github.com/kyutai-labs/moshi).

### Evolución del modelo

1. Moshi base para validar latencia, solapamiento e interrupciones.
2. Dataset estéreo cliente/agente con llamadas autorizadas.
3. LoRA o fine-tuning para ventas, objeciones, pausas y backchannels.
4. Alineamiento de interactividad para distinguir `wait`, backchannel, respuesta e interrupción.
5. Salida paralela de texto/eventos para trazabilidad, incertidumbre y transferencia.

No se entrena `Moshi-Call-EN` antes de tener datos reales suficientes. El primer presupuesto se dedica a grabaciones consentidas, etiquetado, prototipos y evaluación.

## Selección en el backend

La selección se resuelve una vez por llamada:

```env
# Producción inicial
VOICE_ENGINE_MODE=remote
VOICE_ENGINE_ARCHITECTURE=modular
VOICE_ENGINE_URL=ws://127.0.0.1:9100/ws
VOICE_ENGINE_TOKEN=change-this

# Servicio Moshi/Moshi-Call-EN aislado
VOICE_DUPLEX_ENGINE_URL=ws://127.0.0.1:9200/ws
VOICE_DUPLEX_ENGINE_TOKEN=change-this
```

El `VOICE_ENGINE_ARCHITECTURE` por defecto es `modular`. Una variante de experimento puede sobrescribirlo con:

```json
{
  "architecture": "duplex"
}
```

Esto permite enviar un porcentaje controlado de llamadas al motor dúplex sin duplicar la lógica de telefonía ni abrirle acceso al CRM.

## Estado implementado

- El backend reconoce `modular` y `duplex`.
- La configuración global puede seleccionar cualquiera de los dos.
- El payload de un experimento A/B puede seleccionar `duplex` por llamada.
- La sesión remota anuncia al servidor la arquitectura y el control plane de Node.
- El runtime snapshot registra la arquitectura ejecutada.
- Se han añadido pruebas para el valor por defecto, la selección dúplex y la prioridad del experimento.

## Pendiente para pasar Vendrava Duplex de canario a producción

- Instalar y validar los pesos Moshi/Mimi en el servidor GPU objetivo.
- Convertir audio PSTN de 8 kHz/µ-law a la frecuencia que necesite Mimi y devolver audio telefónico estable.
- Calibrar el STT inglés paralelo y emitir eventos de incertidumbre/salida estructurada del futuro checkpoint.
- Añadir cancelación, límites de duración y recuperación ante caída del proceso Moshi.
- Validar concurrencia por GPU antes de permitir tráfico comercial.

El gateway dúplex ya está implementado en `voice-engine/moshi_gateway.py`. Hasta
validar pesos, GPU, recuperación y concurrencia, el modo `duplex` debe utilizarse
sólo en staging o canario. No debe configurarse como fallback silencioso a la
cascada, porque entonces se perdería la validez de la comparación.

El smoke test real está en `voice-engine/smoke_duplex.py` y exige que el gateway
esté arrancado con pesos Moshi/Mimi instalados. Comprueba handshake, audio
devuelto e interrupción por barge-in.

## Prueba comparativa

### Fase 1: simulación

100 conversaciones con el mismo guion y los mismos datos, incluyendo:

- saludo y detección de persona humana;
- `um`, `let me think`, pausas y continuación;
- pregunta dentro de una respuesta;
- objeciones de precio, tiempo y proveedor actual;
- interrupción durante una frase;
- petición de no volver a llamar;
- petición de hablar con una persona;
- buzón, IVR y gatekeeper.

### Fase 2: llamadas controladas

Comenzar con un canario de 5–10% para `Vendrava Duplex`, manteniendo `Vendrava Voice Modular` como baseline. Medir por arquitectura:

- latencia de primer audio y P50/P95;
- `false_takeover_rate` y `hold_compliance`;
- interrupciones correctas y respuesta prematura;
- errores de nombres, teléfonos, fechas y precios;
- conversión o siguiente acción;
- transferencias y opt-out correctos;
- coste por minuto y llamadas simultáneas por GPU;
- errores críticos de CRM/compliance;
- valoración ciega de naturalidad por angloparlantes.

## Criterio de decisión

`Vendrava Voice Modular` gana la entrada a producción si el dúplex no mejora de forma estadísticamente clara la naturalidad o la conversión sin superar los límites de latencia, coste, errores de CRM y transferencias.

`Vendrava Duplex` gana expansión si conserva las mismas garantías de negocio y demuestra una mejora sostenida en turn-taking, interrupciones, backchannels, duración útil de llamada y satisfacción.
