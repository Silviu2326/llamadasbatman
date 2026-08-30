# 04 — Router inteligente (Fase 1–2)

Implementa §2.5 de la visión: elegir el mejor proveedor **para el trabajo concreto y las restricciones del cliente**, dejando siempre visible qué eligió, por qué, cuánto costó y qué alternativa había.

Antecedente en el repo: el único router real es el de locuciones (`contentVoiceover.service.ts:128-154`, Chatterbox local → ElevenLabs → fallo explicado). Su virtud es la simplicidad y la explicación del fallo; el router general conserva ambas.

---

## 1. Diseño: función pura + registro de decisión

**No es un servicio con estado ni un modelo ML.** Es una función determinista que puntúa bindings y un registro auditable de cada decisión. Eso es lo que la visión exige ("visible qué eligió y por qué") y lo único defendible en fase 1.

```ts
// backend/src/providers/router.ts
export async function route(req: RouteRequest): Promise<RouteDecision>

interface RouteRequest {
  orgId: string;
  capability: string;            // "image.upscale"
  input: unknown;                // validado contra el contrato zod de la capability
  preferences?: {
    providerId?: string;         // fijado por el usuario avanzado — gana siempre si es legal
    tier?: 'draft' | 'standard' | 'premium';   // borrador vs toma final (§4.5 de la visión)
    maxCostCents?: number;
    maxLatencyMs?: number;
  };
  context: { microappId?: string; flowRunId?: string; };
}

interface RouteDecision {
  binding: CapabilityBinding;
  billingMode: 'managed' | 'byok';
  estimateCents: number;
  alternatives: Array<{ providerId: string; estimateCents: number; reason: string }>;
  exclusions: Array<{ providerId: string; reason: string }>;  // por qué NO
  fallback?: { providerId: string };
}
```

## 2. Pipeline de decisión (orden fijo)

> **Anotación de revisión (v0):** no es necesario implantar la puntuación ponderada en el primer PR. Empezar con filtros duros → preferencia explícita → default humano → presupuesto → alternativa visible. Activar scoring dinámico solo después de acumular muestras suficientes y perfiles de calidad por tarea; `premium` por sí solo no representa tipografía, consistencia, realismo, español o razonamiento.

```
1. FILTROS DUROS (eliminan candidatos, generan `exclusions`)
   a. capability soportada por el binding
   b. política de la org: proveedor permitido (GovernancePolicy ampliada, 08-SEGURIDAD §3)
   c. región permitida
   d. commercialUseAllowed si el asset va a uso comercial
   e. credencial resoluble (BYOK conectada, o gestionado con saldo/plan)
   f. límites de input (duración, resolución) dentro de binding.limits
   g. estado del proveedor: circuit breaker abierto → fuera (ver §4)

2. PREFERENCIA EXPLÍCITA
   Si preferences.providerId sobrevivió a los filtros → se usa, fin.
   (El modo profesional de la visión §8.2: elegir y fijar.)

3. PUNTUACIÓN de los supervivientes
   score = w_quality * qualityTier(match con preferences.tier)
         + w_cost    * (1 - estimateCents / maxCandidateCents)
         + w_latency * (1 - avgLatencyMs / maxCandidateLatency)
         + w_health  * successRate30d          // de Job/UsageRecord
   Pesos por tier: draft → coste manda; premium → calidad manda.

4. PRESUPUESTO
   Si estimate > maxCostCents o supera el tope del flujo/wallet → degradar a
   siguiente candidato o devolver error accionable ("supera el tope de X €").

5. FALLBACK
   El segundo clasificado queda registrado como fallback del Job.
```

## 3. Persistencia de la decisión

La decisión completa (elegido, alternativas, exclusiones con motivo, estimación) se guarda en `Job.input._routing` al crear el job. La UI del Centro de trabajos la muestra tal cual — eso cumple "el router siempre debe dejar visible qué eligió, por qué, cuánto costó y qué alternativa había" sin infraestructura extra.

## 4. Salud del proveedor y fallback

- **Circuit breaker simple** por `provider+capability`: N fallos consecutivos en ventana de M minutos → abierto durante T (guardado en Redis vía `optionalRedis`; sin Redis, siempre cerrado). Sin dependencias nuevas.
- **Fallback automático solo para efectos locales e idempotentes** (generación de imagen fallida antes de producir nada). Si el trabajo pudo tener efecto externo o consumió créditos del proveedor, se aplica la regla existente de `automations.service.ts`: no reintentar en otro proveedor automáticamente; ofrecer el fallback como acción manual en el Centro de trabajos ("reintentar con X, ~Y €").
- `integrationHealth.service.ts` ya existe para salud de integraciones: ampliarlo para exponer el estado de breakers en el Centro de conexiones.

## 5. Defaults recomendados ("Recomendado por Vendrava")

Tabla estática en el registro por capability:

```ts
export const recommendedDefaults: Record<string, { draft: string; final: string }> = {
  'image.generate': { draft: 'openai-image', final: 'openai-image' },  // → flux cuando exista
  'image.upscale':  { draft: 'magnific',     final: 'magnific' },
  'llm.generate':   { draft: 'deepseek:deepseek-chat', final: 'deepseek:deepseek-reasoner' },
  'audio.tts':      { draft: 'chatterbox',   final: 'elevenlabs' },
};
```

Estos defaults son ejemplos revisables, no una afirmación permanente de calidad o disponibilidad. Cada cambio debe guardar versión de reglas, modelo y fecha para que una decisión antigua sea reproducible.

Se revisa con datos del Benchmark de proveedores (microapp #67, ver 07-MICROAPPS) — así el "recomendado" deja de ser marketing y pasa a ser medible, como pide §11 de la visión.

## 6. Qué NO hace el router (fase 1–2)

- No enruta el pipeline de llamadas en vivo (latencia crítica, combinación afinada — `voice/engine/factory.ts` sigue fijo).
- No hace bandit/aprendizaje automático de pesos. Los pesos son constantes revisables; el "aprendizaje" es el benchmark periódico + ajuste humano.
- No divide un trabajo entre proveedores (eso es del constructor de flujos: pasos distintos, proveedores distintos).

## 7. Criterios de salida

- [ ] `route()` cubierto por tests de contrato en `__tests__/contracts/` (mismo patrón que los tests de entitlements): política de org excluye, preferencia gana, presupuesto degrada, breaker excluye.
- [ ] Toda generación de imagen y locución pasa por `route()`.
- [ ] La decisión es visible en el detalle de Job del frontend.
- [ ] Ahorro por routing medible: query sobre `UsageRecord` comparando coste real vs coste del candidato más caro (métrica de §11).
