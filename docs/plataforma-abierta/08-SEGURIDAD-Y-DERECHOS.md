# 08 — Seguridad, derechos y confianza (transversal)

Implementa §9 de la visión. Buena parte ya existe; este documento separa lo hecho, lo que se amplía y lo nuevo.

---

## 1. Inventario: qué exige la visión vs qué hay

| Requisito (§9) | Estado | Acción |
|---|---|---|
| Secretos cifrados, aislados por org, nunca visibles | ✅ `OrganizationIntegrationCredential` + `credentialMetadata()` | Unificar los 3 cifrados (02-FUNDAMENTOS §4) |
| OAuth delegado cuando exista | ✅ Meta (PKCE), Google | Extender patrón a nuevos proveedores |
| Permisos mínimos por conector/microapp | ✅ RBAC 90 permisos + scopes | `dataAccess` en el manifiesto (07 §1) |
| Registro de quién ejecutó qué, con qué datos, en qué proveedor | Parcial (`AuditLog`, `SalesActivity`) | `Job` + `UsageRecord` + `MicroappRun` lo completan |
| Políticas por org de proveedores/regiones | ❌ | §3 abajo |
| Presupuesto, concurrencia, topes | Parcial (`limits.budgetCents` en orquestación) | `Wallet.hardLimit` + `budgetCents` en Flow/Production |
| Consentimiento de voz/rostro/avatar | ❌ (solo `ContactConsent` para contacto comercial) | §2 abajo — **lo nuevo más importante** |
| Procedencia y licencias de activos | ❌ | `Asset.license`, `Asset.prompt/provider/model` (02 §2) |
| Revisión humana para publicar/contactar/gastar | ✅ `approvalPolicy.ts` con separación de funciones | Añadir `media_generate_premium` |
| Separación entre tenants | ✅ `orgId` ubicuo + tests | Mantener test de aislamiento para cada modelo nuevo |
| Borrado y retención configurables | Parcial | Fase 3; `Asset.expiresAt` prepara el terreno |
| Señalización de contenido generado | ❌ | §4 abajo |
| Fuentes y confianza en informes | Parcial (contentSpecificity, digitalAudit) | `EvidenceItem` obligatorio en microapps (07 §1) |
| Canal de disputas/retirada | ❌ | Fase 3 (marketplace) |
| Revisión contractual antes de revender créditos | ❌ | Proceso, no código: campo `tosReviewedAt` en el descriptor (03 §3) + checklist de PR |

---

## 2. Consentimiento de identidad: `ConsentGrant`

Hermano del `ContactConsent` existente (que cubre canal de contacto), este cubre **uso de la identidad de una persona en contenido generado** (voz clonada, rostro, avatar, personaje, testimonio).

```prisma
model ConsentGrant {
  id          String   @id @default(cuid())
  orgId       String
  subjectName String
  subjectContact String?         // email/teléfono para revocación
  kind        String             // voice | face | avatar | character | testimonial | written_style
  scope       Json               // { channels: [], regions: [], purposes: [], exclusions: [] }
  evidenceAssetId String?        // documento/grabación de consentimiento
  grantedAt   DateTime
  expiresAt   DateTime?          // caducidad (§9)
  revokedAt   DateTime?
  status      String   @default("active") // active | expired | revoked
  createdById String
  createdAt   DateTime @default(now())
  @@index([orgId, kind, status])
}
```

### Enforcement (lo que lo hace real y no documental)

1. `Asset.consentGrantId` y `ProductionBibleEntry.consentGrantId` (ya previstos en 02 y 06).
2. **Guard en el router**: cualquier capability de la lista sensible (`audio.tts` con voz clonada, `video.lipsync`, avatar) exige `consentGrantId` activo y con `scope` compatible en el input; sin él, el job no se crea (error accionable con link a crear el grant).
3. **Guard en publicación**: publicar (Metricool/Meta) un asset cuyo grafo de genealogía (`AssetRelation`) contiene un consentimiento revocado o caducado → bloqueado. La comprobación debe recorrer todos los inputs con detección de ciclos y límite de profundidad.
4. Revocación: marca `revokedAt`, dispara evento outbox `consent.revoked` → job que lista los assets afectados y pausa flujos/publicaciones programadas que los usen.
5. `ownerVoice.service.ts` (clon de voz escrita) migra a exigir un `ConsentGrant(kind: written_style)` — hoy el consentimiento del dueño es implícito; hacerlo explícito cuesta poco y valida el modelo.

---

## 3. Políticas por organización: ampliar `GovernancePolicy`

El modelo `GovernancePolicy` ya existe (schema.prisma:2839). Añadir a su payload:

```ts
interface ProviderPolicy {
  allowedProviders?: string[];      // null = todos los del catálogo
  blockedProviders?: string[];
  allowedRegions?: string[];
  dataClasses?: {                   // qué datos pueden salir a proveedores (§13.2)
    piiToProviders: boolean;        // ¿prompts con datos personales de leads?
    transcriptsToProviders: 'none' | 'anonymized' | 'full';
  };
  managedSpendMonthlyCapCents?: number;
}
```

- El filtro duro 1.b del router (04 §2) lee esta política.
- `dataClasses` se aplica en los puntos donde hoy ya se parafrasea en vez de citar (`contentOpportunity` "evidencias parafraseadas, nunca cita literal" — el criterio ya existe en el producto; esto lo hace configurable).
- UI en `/gobierno-empresarial` (página existente).

---

## 4. Señalización de contenido generado

- `Asset` generado siempre conserva `provider/model/prompt` → el dato existe por construcción.
- Al publicar por Metricool/Meta: si el canal exige etiqueta de contenido sintético (Meta la tiene para ads con realismo humano), el conector la activa cuando `Asset.kind ∈ {image, video}` y hay `ConsentGrant(kind: avatar|face)` o generación total. Regla en el adapter de publicación, no en cada microapp.
- Exportaciones: opción de incrustar metadatos C2PA queda anotada como mejora futura (no bloqueante; el ecosistema aún es irregular).

---

## 5. Reglas operativas para el equipo

1. **Ningún proveedor entra al registro sin `tosReviewedAt` reciente y `commercialUseAllowed` justificado en el PR** (con enlace a los términos). Esto operacionaliza la advertencia de la visión sobre Higgsfield (§3).
2. **Toda tabla nueva con datos de cliente lleva `orgId` y entra en el test de aislamiento multi-tenant** (`__tests__/multiTenant.test.ts`).
3. **Los errores de proveedor pasan siempre por `redactProviderError()`** (`lib/integrationRuntime.ts`) antes de persistirse en `Job.error` o `lastError`.
4. **URLs de usuario → `assertSafeOutboundUrl`** sin excepciones (anti-SSRF existente).
5. **Prohibido devolver secretos por API** — la proyección `credentialMetadata()` es la única salida; los adapters reciben el secreto ya resuelto en `ProviderCtx`, nunca lo re-exponen.
6. Higiene pendiente detectada en el repo: `backend/.env` y `backend/.env.bak-preusa` están en el árbol de trabajo, y hay ~30 MB de WAV/OGG de pruebas en `backend/`. Sacar los `.env` (y **rotar** sus claves), mover los audios a fixtures fuera del repo.

> **Corrección de revisión:** ambos `.env` están actualmente ignorados y no aparecen como archivos seguidos en el estado actual, aunque el historial de Git sí contiene commits asociados a esas rutas. No se debe borrar la configuración local sin sustitución. Hay que revisar el historial, considerar expuestas las credenciales reales que hayan aparecido, rotarlas y verificar CI, artefactos y backups. La revocación de un `ConsentGrant` puede bloquear usos futuros y crear una cola de retirada, pero no garantiza borrar copias ya descargadas por plataformas externas.
