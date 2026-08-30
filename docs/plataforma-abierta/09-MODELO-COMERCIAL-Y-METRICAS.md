# 09 — Modelo comercial, créditos y métricas

Implementa §10–§11 de la visión sobre la realidad de facturación actual del repo: `Organization.plan` + `stripeCustomerId` + `billing.service.ts` (Stripe por REST), sin modelos de suscripción, crédito ni uso. `AgencyClient` ya tiene precio/coste mayorista y cuotas — el plan Agency es el más maduro comercialmente.

Principio de la visión que ordena todo: **se cobra por la plataforma y el proceso; el consumo puede ser del cliente (BYOK) o gestionado por Vendrava.**

---

## 1. Secuencia comercial (ligada a las fases técnicas)

| Momento | Qué se puede vender | Requisito técnico |
|---|---|---|
| Hoy | Planes actuales (free/pro/completo/agency) | — |
| Tras Fase 0 | Nada nuevo, pero **visibilidad de margen** por org/proveedor | `UsageRecord` |
| Tras Fase 1 | **BYOK como feature de plan**: "conecta tus claves de Magnific/OpenAI/Anthropic" en pro+; cuota de orquestación implícita en el plan | Registro + credenciales generalizadas |
| Tras ledger + Wallet | **Créditos gestionados** con margen definido | `Wallet` + enforcement en router |
| Tras Fase 2 | **Microapps premium** por ejecución o paquete; recetas de flujo por plan | `MicroappRun` + entitlements |
| Fase 3 | Marketplace con revenue share | membership N:M, manifiestos firmados |

**No vender consumo gestionado antes del ledger.** Es la única línea roja financiera (riesgo de margen negativo invisible, §12 "margen imprevisible").

---

## 2. Créditos gestionados: mecánica

> **Anotación de revisión:** el saldo que ve el cliente puede expresarse en céntimos, pero los eventos de uso internos necesitan precisión subcéntimo. Separar cantidad consumida, coste proveedor, precio cliente, moneda y versión de tarifa. Wallet debe reservar el estimado de forma atómica mediante holds e idempotencia; comprobar saldo y descontar después no es seguro con jobs concurrentes.

- Unidad: **céntimos de euro**, no "créditos" abstractos. La visión pide margen transparente; una unidad opaca lo contradice y complica el soporte. El precio al cliente por capability = coste proveedor × multiplicador por familia (definido en el descriptor, revisable en PR).
- Recarga vía Stripe (checkout de pago único) → `WalletTransaction(reason: topup)`.
- Reserva al crear Job (estimado) → ajuste al coste real al finalizar → liberación de la diferencia. Evita sobregiro con trabajos concurrentes.
- `softLimit` → aviso (banner + email); `hardLimit`/saldo insuficiente → el router devuelve 402 con las dos salidas: recargar o conectar clave propia. **Cada bloqueo por saldo es un momento de conversión a BYOK o upsell — diseñar ese mensaje con cariño.**
- Paquetes de capacidad (§10 "paquetes: investigación, vídeo, llamadas") = precios con descuento por familia de capability, aplicados como multiplicador reducido; no inventar una segunda moneda.

## 3. BYOK: qué se cobra

- BYOK se activa por plan (`entitlements.ts`, capability existente `integrations` + nueva granularidad por familia si hace falta).
- El valor cobrado es la plataforma: orquestación, flujos, aprobaciones, biblioteca, atribución. No hay recargo por ejecución BYOK en fase 1–2 (fricción alta, cobro difícil de justificar); si más adelante se quiere, el `UsageRecord(billingMode: byok)` ya registra el volumen para decidir con datos.

## 4. Agencias y marca blanca

Ya existen `AgencyClient` (precio/coste mayorista, cuotas de minutos/mensajes) y `WhiteLabelConfig/Usage`. Extensiones:

- `Wallet` por workspace cliente con recarga desde la agencia (transferencia entre wallets = 2 `WalletTransaction`).
- La sala de aprobación pública (`/aprobar/:token`) y el `brandScope` de `Asset`/`Production` cubren el flujo agencia→cliente final sin trabajo extra.
- Informe de coste por cliente = query de `UsageRecord` por `brandScope`/workspace — argumento de venta directo para agencias.

## 5. Métricas (§11) y la north star

North star de la visión: *resultados de negocio completados por organización y semana mediante flujos*. Materialización:

```prisma
model OutcomeEvent {
  id        String   @id @default(cuid())
  orgId     String
  kind      String   // research_used | ad_approved | meeting_booked | campaign_published | deal_won | asset_published
  sourceRef Json     // { flowRunId?, microappRunId?, callId?, campaignId?, opportunityId? }
  valueCents Int?    // si tiene valor económico directo
  createdAt DateTime @default(now())
  @@index([orgId, kind, createdAt])
}
```

Se emite desde los puntos que ya existen (`OpportunityStageHistory` a won, publicación de campaña, `Meeting` creado, aprobación de contenido) vía outbox — sin tocar la lógica de negocio, solo suscriptores.

### Tablero mínimo (todas calculables con los modelos de este plan)

| Métrica (§11) | Fuente |
|---|---|
| Tiempo hasta primer resultado útil | primer `OutcomeEvent` de la org vs `createdAt` |
| % trabajos aprobados sin regeneración | `Job` por `parentJobId`/reintentos + aprobaciones |
| Coste por activo aprobado | `UsageRecord` ÷ `Asset(status: approved)` |
| % flujos con ≥2 capacidades | `FlowRun` → capabilities distintas de sus Jobs |
| % gestionado vs BYOK | `UsageRecord.billingMode` |
| Ahorro por routing | coste real vs candidato más caro en `Job._routing` |
| Tasa de fallo/cambio de proveedor | `Job.status` + breaker events |
| Uso semanal de microapps | `MicroappRun` |
| Activos reutilizados en >1 campaña | `Asset` ↔ campañas |
| Ingresos atribuidos | `OutcomeEvent.valueCents` + `adAttribution` existente |
| Incidencias de derechos | `ConsentGrant` revocaciones + bloqueos de publicación |

## 6. Precios: decisiones a tomar (no técnicas)

1. Multiplicador de margen por familia (sugerencia inicial: LLM ×1.3, imagen ×1.5, vídeo ×1.4, telefonía ×1.25 — el vídeo con base cara admite menos multiplicador relativo pero más margen absoluto).
2. Qué microapps son "incluidas" por plan y cuáles premium por ejecución (sugerencia: investigación incluida con cuota, Studio y vídeo siempre a consumo).
3. Si el plan Agency incluye un depósito de créditos mensual (ancla el hábito de consumo gestionado).

Los multiplicadores anteriores son hipótesis para modelar escenarios, no defaults que deban codificarse. Deben validarse con coste real, fallos no reembolsados, storage, transferencia, soporte, impuestos, moneda y comisiones de pago.
