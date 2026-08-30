# 05 — Constructor de flujos (Fase 2)

Implementa §2.6 de la visión. La buena noticia: **no hay que construir un motor de workflows; hay que unificar los tres que ya existen.**

---

## 1. Situación actual: tres motores

| Motor | Modelo mental | Fortalezas | Límite |
|---|---|---|---|
| `Automation` (+`AutomationVersion`, `AutomationRun`, `AutomationStepRun`) | trigger evento → N acciones | Versionado inmutable, idempotencia por paso, regla "efecto externo no se reintenta", 13 tipos de acción | Lineal, sin ramas ni pasos humanos |
| `Orchestration` (`orchestration.service/adapters/runtime`) | plan multi-fase con aprobación | Ciclo proposal→approval→execution, presupuesto (`limits.budgetCents`), catálogo declarativo (`effects`, `compensation`, `retryPolicy`), worker con lease | 5 fases fijas de marketing, 10 acciones hardcodeadas |
| Autonomías por dominio (`adRuleAutonomy`, `landingAutonomy`, `organicAutonomy`) | reglas que se promueven a automáticas (N1/N2/N3) | Gradación de confianza | Específicas de dominio, no componibles |

Decisión de arquitectura: **la Orchestration evoluciona hasta ser el motor general** (ya tiene aprobaciones, presupuesto y catálogo declarativo); `Automation` queda como está para triggers simples (es estable y cumple su función); las autonomías se van registrando como acciones del catálogo con el tiempo. No se migra nada que funcione: se generaliza el más ambicioso.

---

## 2. El modelo de receta (Flow)

```prisma
model Flow {
  id          String   @id @default(cuid())
  orgId       String?  // null = receta de sistema (plantilla Vendrava)
  slug        String
  name        String
  description String?
  currentVersionId String?
  createdAt   DateTime @default(now())
  versions    FlowVersion[]
  @@unique([orgId, slug])
}

model FlowVersion {
  id        String   @id @default(cuid())
  flowId    String
  version   Int
  graph     Json     // nodos + aristas, ver §3
  createdAt DateTime @default(now())
  createdById String?
  flow      Flow     @relation(fields: [flowId], references: [id])
  @@unique([flowId, version])
}

model FlowRun {
  id            String   @id @default(cuid())
  orgId         String
  flowVersionId String
  status        String   // running | awaiting_approval | succeeded | failed | canceled
  trigger       Json     // manual | scheduled | event(topic, payloadRef)
  variables     Json     // variables reutilizables (§2.6)
  budgetCents   Int?     // tope duro del run
  spentCents    Int      @default(0)
  startedAt     DateTime @default(now())
  finishedAt    DateTime?
  steps         FlowStepRun[]
  @@index([orgId, status, startedAt])
}

model FlowStepRun {
  id         String   @id @default(cuid())
  flowRunId  String
  nodeKey    String
  status     String   // pending | running | awaiting_approval | succeeded | failed | skipped | blocked
  jobId      String?  // si el paso lanza un Job (capability)
  input      Json?
  output     Json?
  error      Json?
  startedAt  DateTime?
  finishedAt DateTime?
  flowRun    FlowRun  @relation(fields: [flowRunId], references: [id])
  @@unique([flowRunId, nodeKey])
}
```

El versionado inmutable copia el patrón `AutomationVersion` existente. `FlowStepRun.jobId` conecta con el contrato universal de trabajo (02-FUNDAMENTOS §1): un paso caro (vídeo) es un Job asíncrono y el run espera su webhook/poll.

---

## 3. El grafo

JSON declarativo, validado con zod. Tipos de nodo:

```
capability   → llama al router: { capability, input(mapeado de variables), tier, maxCostCents }
microapp     → ejecuta una microapp completa como sub-flujo (07-MICROAPPS)
action       → acción interna del catálogo de orquestación (update_lead, create_task, ...)
approval     → pausa hasta aprobación humana; usa SensitiveApprovalRequest + separación de funciones
condition    → rama por expresión sobre variables/salidas
map          → fan-out sobre una lista (ej. 1 pieza por canal) con límite de concurrencia
wait         → espera evento externo (webhook, job) o tiempo (ScheduledTrigger existente)
```

Cada nodo `capability`/`action` hereda los metadatos declarativos de `orchestration.adapters.ts` (`effects: local|external`, `compensation`, `retryPolicy`). El runner aplica las mismas reglas que hoy: efecto externo incierto → paso `blocked`, nunca reintento silencioso.

### 3.1 Ejecución agentic y circuito cerrado

Un nodo `microapp` admite opcionalmente `agentic`. No repite la microapp —evita duplicar consultas, Jobs hijos o efectos—: ejecuta una vez el contrato canónico y después somete el resultado a un consejo gobernado.

```json
{
  "key": "analizar",
  "type": "microapp",
  "microappId": "opportunity-close-plan",
  "input": { "opportunityId": { "var": "input.opportunityId" } },
  "agentic": {
    "enabled": true,
    "strategy": "closed_loop",
    "rounds": 2,
    "qualityThreshold": 85,
    "maxAdditionalCostCents": 500,
    "allowExternalReview": true
  }
}
```

El circuito común es: especialista del dominio + auditor de evidencia + controlador de riesgo → presidente → editor estructurado → nueva ronda con el foco anterior → score determinista → `ready`, `human_review` o `blocked`. Los campos sensibles —incluidas credenciales anidadas detectadas por clave— se redactan antes del consejo. La activación exige consentimiento externo explícito, máximo tres rondas y presupuesto adicional. El presidente sintetiza, pero no decide el score. El editor sí puede mejorar hojas narrativas: la plataforma restaura secretos y valores autoritativos, bloquea reordenaciones de ledger, valida de nuevo el schema y conserva el original ante cualquier revisión inválida o incompleta.

Cada una de las 147 microapps puede generar un Flow instalable con `execute_with_council → quality_gate → human_review → completed`. La aprobación `agentic_accept` aplica separación de funciones (`automations.write` solicita; `automations.publish` aprueba). El resultado completo de `MicroappRun` se materializa en el paso, por lo que nodos posteriores pueden leer rutas como `resultado.result.data` o `resultado.result.agentic.final.status`.

### Ejemplo: el flujo demo de la fase 2

```
oportunidad ganada (evento outbox real `opportunity.won`)
  → microapp: constructor de caso de éxito       [aprobación del cliente si hay cita literal]
  → capability image.generate (draft)            [3 variantes]
  → approval: elegir variante                    (sala de aprobación existente)
  → capability image.upscale (magnific, final)
  → action: crear borrador de campaña Meta       (metaCampaignBuilder existente)
  → approval: campaign_publish                   (approvalPolicy existente)
  → action: publicar
  → wait: 7 días → action: informe de atribución (adAttribution existente)
```

---

## 4. Runner

- `backend/src/jobs/flowRunner.ts` sobre el patrón de `orchestration.runtime.ts` (lease + batch). Avanza runs: resuelve nodos listos, crea Jobs, aplica presupuesto (`spentCents + estimate <= budgetCents`, si no → `awaiting_approval` con motivo "presupuesto"), materializa aprobaciones.
- Los triggers por evento se suscriben al **outbox existente**: un tipo de despacho nuevo en `outboxDispatcher.ts` que busca Flows activos con trigger matching (mismo mecanismo que hoy despacha automatizaciones).
- Registro completo de cada ejecución = `FlowRun` + `FlowStepRun` + `Job._routing` + `UsageRecord`. La visión pide exactamente esto (§2.6 "registro completo").
- "Qué dejaría de funcionar si desconectas X" (Centro de conexiones): `FlowCapabilityDependency` materializa nodos capability, proveedor fijado, Consejo LLM y capabilities internas de cada nodo microapp.

La raíz del run acepta `Idempotency-Key` y persiste una unicidad `(orgId, flowId, idempotencyKey)`. Los triggers del outbox derivan una clave SHA-256 de `topic + eventId`, por lo que la carrera entre workers se arbitra en PostgreSQL y no con `find-then-create`. Una misma clave con variables, versión, presupuesto o trigger distintos responde 409.

> **Anotación de revisión:** la búsqueda directa dentro del JSON es aceptable para v1, pero al publicar una versión conviene materializar sus dependencias en una tabla `FlowCapabilityDependency`. Facilita consultas, validación previa y bloqueo seguro al desconectar proveedores sin convertir JSON en infraestructura crítica.

## 5. Frontend

1. **v1 — recetas parametrizables, sin editor visual.** Lista de plantillas (Flows de sistema), formulario de variables, tope de gasto, y vista de ejecución tipo timeline (reutilizar los patrones de la página `/orquestador` existente). El 90 % del valor de §2.6 está aquí.
2. **v2 — editor visual** (nodos/aristas) solo cuando existan ≥10 recetas y usuarios que pidan modificarlas. No antes: es el clásico pozo de esfuerzo.
3. **Simulador antes de activar** (microapp #75 de la visión): ejecutar el grafo en modo `dryRun` — el router estima costes, los nodos de acción externa devuelven qué *harían*. Es barato de construir porque `estimateCost` ya es obligatorio en cada binding.

## 6. Criterios de salida

- [ ] El flujo demo completo (llamada ganada → caso de éxito → anuncio → publicación → atribución) ejecutable de punta a punta con 2 aprobaciones humanas.
- [ ] 5 recetas de sistema publicadas.
- [ ] Tope de presupuesto por run verificado por test de contrato.
- [ ] Simulación dry-run con coste estimado total antes de activar.
- [ ] Métrica de §11 activa: % de runs que mezclan ≥2 capacidades.
- [x] Las 147 microapps tienen wrapper agentic instalable, consejo multirol, rondas, presupuesto y quality gate humano.
