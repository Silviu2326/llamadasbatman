# Proveedores API para Gemma-4-31B — comparativa para VozIA

> Criterio prioritario: **velocidad end-to-end** para llamadas de voz en tiempo real (TTFT bajo + alto throughput). Coste es secundario mientras no sea desproporcionado.

## Resumen ejecutivo

- **Cerebras** es el más rápido con diferencia (~2.000 t/s, TTFT ~1,4s), pero Gemma-4-31B está en *public preview limitado* y hemos visto timeouts intermitentes de 10s.
- **SambaNova** y **Lightning AI** son las mejores alternativas GPU con throughput decente (160–190 t/s), aunque sus TTFT (~11–12s según benchmarks) pueden ser demasiado lentos para conversación fluida.
- **DeepInfra** y **Novita** son OpenAI-compatible, baratos y estables, pero lentos (~20–35 t/s), lo que se nota al generar respuestas largas.
- **Together AI** es estable (99% uptime) pero caro y lento (~59 t/s, TTFT ~30s), poco adecuado para voz RT.
- **OpenRouter** no es un proveedor, es un router: útil como capa de failover entre varios backends.

Recomendación práctica: probar **SambaNova Cloud** como primera alternativa estable y rápida; si sigue sin dar latencia aceptable, usar **DeepInfra** o **Novita** por estabilidad y luego optimizar el prompt para respuestas más cortas.

---

## Tabla comparativa (datos públicos, julio 2026)

| # | Proveedor | Model ID | Base URL OpenAI-compatible | TTFT aprox. | Throughput aprox. | Precio input | Precio output | Notas para VozIA |
|---|-----------|----------|----------------------------|-------------|-------------------|--------------|---------------|------------------|
| 1 | **Cerebras** | `gemma-4-31b` | `https://api.cerebras.ai/v1` | **1,4 s** | **~2.092 t/s** | n/d en preview | n/d en preview | Más rápido, pero timeouts intermitentes en preview. No recomendable hasta GA estable. |
| 2 | **SambaNova Cloud** | ver dashboard | `https://api.sambanova.ai/v1` | ~12 s* | ~193 t/s | $0,22/M | $0,59/M | Mejor alternativa GPU estable. Verificar exacto model ID en dashboard. |
| 3 | **Lightning AI** | ver dashboard | `https://api.lightning.ai/v1` | ~11 s* | ~165 t/s | $0,17/M blend. | $0,17/M blend. | Buen throughput, pero TTFT irregular. Menos maduro para producción. |
| 4 | **Novita AI** | `google/gemma-4-31b-it` | `https://api.novita.ai/openai` | ~0,9–1,2 s | ~35 t/s | $0,14/M | $0,40/M | OpenAI-compatible, estable, precio razonable. Lento para respuestas largas. |
| 5 | **DeepInfra** | `google/gemma-4-31B-it` | `https://api.deepinfra.com/v1/openai` | ~0,9 s | ~20 t/s | $0,13/M | $0,38/M | El más barato. Muy lento para voz RT (~103× más lento que Cerebras). |
| 6 | **Together AI** | `google/gemma-4-31b-it` | `https://api.together.xyz/v1` | ~30 s | ~59 t/s | $0,39/M | $0,97/M | 99% uptime, pero TTFT muy alto. Descartar para voz RT. |
| 7 | **Fireworks** | `accounts/fireworks/models/gemma-4-31b-it` | `https://api.fireworks.ai/v1` | n/d | n/d | $0,90/M | $0,90/M | Caro y sin datos claros de velocidad. No primera opción. |
| 8 | **OpenRouter** | `google/gemma-4-31b-it` | `https://openrouter.ai/api/v1` | depende ruta | depende ruta | $0,12/M | $0,35/M | Router: útil como failover/capa de redundancia, no como proveedor único. |

\* TTFT de benchmarks de Artificial Analysis para prompts largos; en prompts cortos de voz puede ser menor.

---

## Ranking por velocidad (uso real en voz)

Para llamadas en tiempo real, lo que importa es la combinación de:

1. **TTFT** (time to first token): el silencio entre que el usuario termina de hablar y el agente empieza a responder. Ideal < 500 ms; aceptable < 1,5 s.
2. **Throughput** (tokens/s): cuánto tarda en llegar el resto de la respuesta. A mayor throughput, menos latencia acumulada y mejor cadencia.

| Ranking | Proveedor | ¿Recomendado para VozIA? |
|---------|-----------|--------------------------|
| 1 | Cerebras | Solo si estabiliza la preview; por ahora no. |
| 2 | SambaNova Cloud | **Principal candidato** si el TTFT real en prompts cortos está por debajo de 2 s. |
| 3 | Lightning AI | Segunda opción si SambaNova falla. |
| 4 | Novita AI | **Opción segura** si se prioriza estabilidad sobre velocidad. |
| 5 | DeepInfra | Opción económica, pero obliga a respuestas muy cortas. |
| 6 | Together AI / Fireworks | No recomendados por latencia o precio. |

---

## Recomendaciones de implementación

### Opción A: SambaNova Cloud (más rápido estable)

- Crear cuenta en [cloud.sambanova.ai](https://cloud.sambanova.ai/).
- Verificar el model ID exacto para `gemma-4-31b-it` en el dashboard (suele ser `gemma-4-31b-it` o `google/gemma-4-31b-it`).
- Configurar en `.env`:
  ```env
  CEREBRAS_API_KEY=<samba_key>
  CEREBRAS_MODEL=gemma-4-31b-it
  CEREBRAS_BASE_URL=https://api.sambanova.ai/v1
  CEREBRAS_TIMEOUT_SECONDS=10
  ```
- **Nota**: el código actual de `cerebras.ts` usa `baseURL: 'https://api.cerebras.ai/v1'` hardcodeada. Para usar SambaNova hay que hacer configurable la `baseURL`.

### Opción B: Novita AI (estable y barato)

- Crear cuenta en [novita.ai](https://novita.ai/).
- Configurar en `.env`:
  ```env
  CEREBRAS_API_KEY=<novita_key>
  CEREBRAS_MODEL=google/gemma-4-31b-it
  CEREBRAS_BASE_URL=https://api.novita.ai/openai
  CEREBRAS_TIMEOUT_SECONDS=10
  ```
- Para compensar el throughput bajo, forzar respuestas más cortas en el prompt del sistema: *“Máximo 2 frases cortas.”*

### Opción C: OpenRouter como failover

- Crear cuenta en [openrouter.ai](https://openrouter.ai/).
- Usar `CEREBRAS_BASE_URL=https://openrouter.ai/api/v1` y modo `Nitro` para priorizar velocidad.
- Útil si se quiere evitar depender de un único proveedor, pero añade un hop de red.

---

## Cambio necesario en el backend

Actualmente `backend/src/voice/intelligence/llm/cerebras.ts` tiene la `baseURL` fija:

```ts
baseURL: 'https://api.cerebras.ai/v1',
```

Para poder cambiar de proveedor sin tocar código cada vez, hay que hacerla configurable mediante variable de entorno, por ejemplo:

```ts
baseURL: process.env.CEREBRAS_BASE_URL ?? 'https://api.cerebras.ai/v1',
```

Esto permite probar SambaNova, Novita, DeepInfra, etc., cambiando solo `.env`.

---

## Conclusión

- **Si la prioridad es velocidad y se acepta un poco de riesgo**: probar **SambaNova Cloud**.
- **Si la prioridad es estabilidad con velocidad razonable**: probar **Novita AI**.
- **Si se quiere redundancia**: usar **OpenRouter** sobre varios backends.
- **Evitar**: Cerebras hasta que Gemma-4-31B salga de preview; Together AI y Fireworks por latencia/precio para voz RT.

---

## Fuentes

- [Artificial Analysis — Gemma-4-31B providers benchmark](https://artificialanalysis.ai/models/gemma-4-31b/providers)
- [Cerebras — Gemma 4 on Cerebras](https://www.cerebras.ai/blog/gemma-4-on-cerebras-the-fastest-inference-is-now-multimodal)
- [DeepInfra — Gemma-4-31B-it API](https://deepinfra.com/google/gemma-4-31B-it/api)
- [Together AI — Gemma-4-31B](https://www.together.ai/models/gemma-4-31b)
- [Novita AI — Gemma-4-31B](https://novita.ai/models/model-detail/google-gemma-4-31b-it)
- [OpenRouter — Gemma-4-31B-it](https://openrouter.ai/google/gemma-4-31b-it)
- [PricePerToken — Gemma-4-31B pricing](https://pricepertoken.com/pricing-page/model/google-gemma-4-31b-it)
- [arXiv — Gemma 4 on Google Cloud TPU](https://arxiv.org/abs/2605.25645)
