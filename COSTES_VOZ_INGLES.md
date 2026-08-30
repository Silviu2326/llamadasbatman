# Coste del stack de voz en inglés (Cartesia → Cerebras → MiniMax)

Fecha: 10 de agosto de 2026. Modelo de coste del pipeline `vendrava` tal y como está
implementado en `backend/src/voice/pipelines/vendravaVoice.ts`.

> **Verifica los precios unitarios antes de presupuestar.** Son los que tengo, no una
> cotización. Cada uno lleva enlace; si uno cambia, cambia solo esa celda y las tablas
> de abajo se recalculan con las fórmulas del final.

## 1. Precios unitarios

| Componente | Proveedor | Precio | Unidad |
|---|---|---|---|
| STT | [Cartesia Ink-2](https://cartesia.ai/pricing) | **$0,13** | por hora de audio (≈ $0,00217/min) |
| LLM entrada | [Cerebras gpt-oss-120b](https://inference-docs.cerebras.ai/support/pricing) | **$0,25** | por millón de tokens |
| LLM salida | Cerebras gpt-oss-120b | **$0,69** | por millón de tokens (incluye tokens de razonamiento) |
| TTS turbo | [MiniMax speech-2.8-turbo](https://platform.minimax.io/document/price) | **$60** | por millón de caracteres |
| TTS HD | MiniMax speech-2.8-hd | **$100** | por millón de caracteres |
| Telefonía saliente | [Twilio Programmable Voice](https://www.twilio.com/en-us/voice/pricing) US | **$0,014** | por minuto |
| Media Streams | Twilio | **$0,004** | por minuto (audio bidireccional al backend) |
| Número | Twilio US local | **$1,15** | por mes |

Twilio a UK/ES/MX sale más caro que US: cuenta **$0,02–0,05/min** a fijo y bastante más a móvil.
El número es coste fijo, no por llamada.

## 2. Llamada tipo

Lo que se factura no es "una llamada", son cuatro contadores distintos. Asumo una llamada
de venta normal, la que ya sale en la cabina:

| Parámetro | Valor | De dónde sale |
|---|---|---|
| Duración | 3 min | llamada saliente típica que no cuelgan al segundo |
| Turnos del agente | 8 | ~1 turno cada 22 s |
| Caracteres hablados por turno | 200 | el prompt limita a 35 palabras/turno |
| Tokens de entrada por turno (responder) | 700 | prompt de sistema + historial creciente + coaching |
| Tokens de salida por turno (responder) | 55 | tope de 110, media real más baja |
| Llamadas al guru | 8 | una por turno del agente, en el hueco muerto |
| Tokens guru (entrada / salida) | 600 / 350 | transcript recortado a 12 turnos; `reasoning_effort: medium` |
| Desperdicio por especulación | +35 % LLM, +20 % TTS | generaciones lanzadas en `turn.eager_end` que se descartan en `turn.resume` |

### Coste por llamada de 3 minutos

| Concepto | Cálculo | Coste |
|---|---|---|
| Cartesia STT | 3 min × $0,00217 | $0,0065 |
| Cerebras responder | 7.560 tok in + 594 tok out | $0,0023 |
| Cerebras guru | 4.800 tok in + 2.800 tok out | $0,0031 |
| MiniMax turbo | 1.920 caracteres | **$0,1152** |
| **Subtotal IA (sin telefonía)** | | **$0,127** |
| Twilio (voz + media streams) | 3 min × $0,018 | $0,054 |
| **Total con Twilio (US)** | | **$0,181** |

Por minuto: **$0,042/min** sin Twilio, **$0,060/min** con Twilio.

**El TTS es el 91 % del coste de IA.** Cartesia, Cerebras y el guru juntos no llegan al 10 %.
Cualquier optimización que no toque MiniMax es ruido.

## 3. Cuántas llamadas te da tu presupuesto

Llamadas de 3 minutos, TTS turbo:

| Presupuesto/mes | Sin Twilio (cabina, WebRTC) | Con Twilio (US) |
|---|---|---|
| $100 | **787 llamadas** (2.361 min) | **552 llamadas** (1.656 min) |
| $250 | 1.966 | 1.380 |
| $500 | 3.933 | 2.760 |
| $1.000 | 7.866 | 5.521 |
| $5.000 | 39.330 | 27.604 |

Al revés, coste por volumen:

| Volumen/mes | Sin Twilio | Con Twilio (US) |
|---|---|---|
| 500 llamadas | $64 | $91 |
| 1.000 llamadas | $127 | $181 |
| 5.000 llamadas | $636 | $906 |
| 10.000 llamadas | $1.271 | $1.811 |
| 50.000 llamadas | $6.357 | $9.057 |

Con **speech-2.8-hd** en vez de turbo, el TTS pasa de $0,115 a $0,192 por llamada:
el total sube a **$0,204 sin Twilio** y **$0,258 con Twilio**, y el presupuesto rinde un 38 % menos.

## 4. Con Twilio vs. sin Twilio

"Sin Twilio" no es gratis en abstracto: es que el audio ya llega por otro sitio.

| Escenario | Coste de transporte | Cuándo aplica |
|---|---|---|
| Cabina en el navegador (`/voz/cabina`) | **$0/min** | demos, pruebas, agente humano asistido, widget en tu web |
| Twilio Programmable Voice + Media Streams | $0,018/min US | llamadas salientes a teléfono, que es el producto |
| SIP trunk (Twilio Elastic SIP, Telnyx) | ~$0,007–0,010/min | mismo teléfono, más barato, pero tú montas el puente RTP→WebSocket |

Twilio añade un **42 % sobre el coste de IA** en US. Fuera de US puede duplicarlo.
Si el volumen pasa de ~20.000 min/mes, el SIP trunk se paga solo: ahorra ~$0,0095/min,
unos $190/mes a ese volumen, contra el trabajo de mantener el puente.

## 5. Palancas de ahorro, por orden de impacto

1. **Turnos más cortos.** −25 % de caracteres = −$0,029/llamada (−23 % del total sin Twilio).
   Es una línea del prompt de sistema.
2. **Recortar el desperdicio especulativo.** El +20 % de TTS descartado son $0,019/llamada.
   Subir `eager_end_threshold` en `cartesiaInk.ts` reduce especulaciones fallidas — a costa de latencia.
3. **Turbo en vez de HD.** Ya es el default. No lo cambies sin una razón que se oiga.
4. **Guru cada N turnos en vez de cada uno.** Ahorra hasta $0,0031/llamada. Marginal: no lo toques por dinero.
5. **Cachear el saludo.** El saludo es idéntico en todas las llamadas y hoy se sintetiza cada vez:
   ~90 caracteres, $0,0054/llamada, $54 por cada 10.000 llamadas. Es el único gasto 100 % evitable.

## 6. Recalcular con tus números

```
STT      = minutos × 0,00217
Responder= turnos × (tok_in × 0,25 + tok_out × 0,69) / 1.000.000 × 1,35
Guru     = turnos × (600 × 0,25 + 350 × 0,69) / 1.000.000
TTS      = turnos × chars_turno × 1,20 × 60 / 1.000.000
Twilio   = minutos × 0,018        (0 si es cabina de navegador)

Coste llamada = STT + Responder + Guru + TTS + Twilio
```

Los factores 1,35 y 1,20 son el desperdicio especulativo. Con `speculative: false` en los
ajustes de la cabina desaparecen: la llamada baja a $0,107 sin Twilio, pero pierdes los
~200 ms de adelanto que dan los 650 ms objetivo.

## 7. Lo que este modelo no incluye

- Mínimos, comprometidos anuales o descuentos por volumen de los tres proveedores.
- Llamadas que no contestan: en telefonía pagas el intento, y en el CRM el AMD las corta antes
  de abrir el pipeline, así que cuestan Twilio pero no IA.
- Almacenamiento de grabaciones y transcripciones (S3 + Postgres), analítica post-llamada, y el
  resto del CRM.
- Impuestos, y el número de Twilio ($1,15/mes por número).
