# 06 — Studio de Cine (Fase 2b–3)

Implementa §4 de la visión. Es la pieza con más código nuevo de todo el plan (hoy hay **cero** líneas de vídeo en el repo), así que la estrategia es entrar por fases que producen valor aunque la siguiente no llegue.

Punto de partida real: ya existen `reel_script` y `voiceover` en `ContentPiece` (guion + locución), `brandKit.service.ts` (marca), `contentCritic.service.ts` (revisión adversaria) y la sala de aprobación con enlace público. El Studio es la extensión natural de esa cadena hacia lo visual.

---

## 1. Estrategia por fases

| Fase | Entregable | Genera valor sin la siguiente |
|---|---|---|
| **v0 — Preproducción** | Brief → conceptos → tratamiento → guion → storyboard (imágenes fijas) → shot list | Sí: storyboards y guiones vendibles hoy; solo usa `llm.generate` + `image.generate` que ya existen |
| **v1 — Tomas** | Generación de tomas por plano vía Runway (`video.generate`), mesa de tomas, elección de toma buena | Sí: clips por plano descargables/publicables |
| **v2 — Post ligera** | Upscale (Magnific vídeo/imagen), subtítulos (STT existente), concatenación simple server-side | Sí: piezas verticales completas |
| **v3 — Timeline** | Montaje en navegador, capas de audio, export | Solo si v1–v2 demuestran demanda; mientras tanto "exportar a editor profesional" (la propia visión lo permite en §4.3) |

**Regla anti-sobrecoste:** v0 se construye como microapps sobre el framework (07-MICROAPPS) — `Generador de conceptos`, `Guionista`, `Storyboard`, `Shot list` son las microapps #46–#50 de la visión. El "Studio" como producto es la UI que las encadena sobre un proyecto persistente.

---

## 2. Modelos de dominio

```prisma
model Production {
  id          String   @id @default(cuid())
  orgId       String
  title       String
  status      String   @default("brief")  // brief | concepts | script | storyboard | shooting | post | review | delivered
  brief       Json     // objetivo, audiencia, canal, duración, CTA, restricciones, derechos
  budgetCents Int?
  spentCents  Int      @default(0)
  brandScope  String?  // cliente de agencia
  createdAt   DateTime @default(now())
  concepts    Concept[]
  scenes      Scene[]
  bibleEntries ProductionBibleEntry[]
  @@index([orgId, status])
}

model Concept {
  id           String @id @default(cuid())
  productionId String
  title        String
  logline      String
  treatment    Json    // sinopsis, tono, referencias, riesgo, coste estimado
  status       String  @default("proposed") // proposed | approved | discarded
  production   Production @relation(fields: [productionId], references: [id])
}

model ProductionBibleEntry {   // biblia de producción §4.2.6
  id           String @id @default(cuid())
  productionId String
  kind         String  // character | product | location | style | rule
  name         String
  data         Json    // rasgos, vestuario, paleta, reglas de continuidad
  refAssetIds  String[] // imágenes maestras de referencia
  consentGrantId String? // si es persona real (08-SEGURIDAD)
  production   Production @relation(fields: [productionId], references: [id])
}

model Scene {
  id           String @id @default(cuid())
  productionId String
  order        Int
  scriptText   Json   // diálogo, VO, acciones, textos en pantalla
  shots        Shot[]
  production   Production @relation(fields: [productionId], references: [id])
}

model Shot {
  id          String @id @default(cuid())
  sceneId     String
  order       Int
  spec        Json    // duración, encuadre, movimiento, acción, audio, modelo recomendado
  storyboardAssetId String?  // fotograma de referencia (imagen)
  status      String  @default("planned") // planned | boarded | generating | takes_ready | approved
  takes       Take[]
  scene       Scene   @relation(fields: [sceneId], references: [id])
}

model Take {
  id        String @id @default(cuid())
  shotId    String
  jobId     String   // Job de video.generate — coste, proveedor y routing viven ahí
  assetId   String?  // el clip resultante
  tier      String   // draft | final  (tomas de prueba vs render de calidad, §4.5)
  selected  Boolean  @default(false)
  qcReport  Json?    // inspector audiovisual
  shot      Shot     @relation(fields: [shotId], references: [id])
}
```

Todo lo pesado (clips, coste, proveedor, genealogía) vive en `Job` + `Asset` de la fase 0 — el Studio no inventa su propia media.

> **Anotación de revisión:** `refAssetIds String[]` y `Asset.parentAssetId` no preservan la integridad que necesita una producción. Implementar referencias y genealogía con tablas relacionales tipadas. Para garantizar una sola toma final, preferir `Shot.selectedTakeId` a varios booleanos `Take.selected`. Añadir además `vision.analyze` al catálogo antes del inspector audiovisual.

---

## 3. Pipeline v0 (preproducción) — detalle

1. **Brief**: formulario + el `businessProfile.service.ts` existente precargan producto/marca.
2. **Investigación**: reutiliza `webSearch.service.ts` + `prospectResearch.service.ts`; guarda dossier como `Asset(kind: document)` con fuentes.
3. **Conceptos** (3 direcciones distintas): `llm.generate` con `deepseek-reasoner`; salida validada contra el zod del microapp; coste estimado por concepto usando los precios del registro de vídeo (aunque aún no se genere).
4. **Guion**: el `contentStudio.service.ts` ya genera `reel_script`; se extiende a duraciones 6/15/30/60 s con cálculo de tiempo de locución (la duración de VO se puede estimar con el TTS existente).
5. **Storyboard**: 1 imagen por plano vía `image.generate` (tier draft). Consistencia de personaje en v0 = imágenes de referencia de la biblia adjuntas al prompt (`refImages`); consistencia fuerte llega con proveedores que la soporten.
6. **Shot list**: derivada del guion por LLM; cada shot recibe `modelo recomendado` del registro (qualityTier + limits) — es la microapp #50.

## 4. v1 — generación de tomas

- Cada `Take` = un `Job(kind: video.generate)` asíncrono vía Runway (03-PROVEEDORES §5). Webhook → asset → evento socket.io → la mesa de tomas se actualiza.
- **Presupuesto duro**: `Production.budgetCents`; el flowRunner rechaza generar si `spent + estimate > budget` (misma regla que FlowRun). Tomas draft con proveedor barato/resolución baja; render final solo de la toma seleccionada.
- **Aprobación**: seleccionar toma final del shot requiere el permiso de aprobación de contenido existente; el render premium se registra como acción sensible nueva `media_generate_premium` en `approvalPolicy.ts` si supera un umbral de coste.

## 5. v2 — post ligera

- **Upscale/mejora**: `AssetVersion` vía Magnific (ya integrado en fase 1). Comparación original/mejorado en UI (microapp #59).
- **Subtítulos**: STT ya existe (Cartesia); generar SRT/VTT como `Asset(kind: document)` ligado al clip.
- **Concatenación y aspect ratios**: aquí sí entra `ffmpeg` en el backend (primera dependencia binaria de media; instalarla en la imagen Docker del worker, no de la API). Operaciones limitadas: concat, recorte, crop a 9:16/1:1/16:9, mezcla de pista de VO, quemado de subtítulos. Nada de timeline libre.
- **Aislamiento de media**: FFmpeg se ejecuta en worker con límites de CPU, RAM, tiempo, bytes y formatos; los argumentos se construyen desde presets validados, nunca desde texto libre del usuario.
- **Inspector audiovisual** (microapp #60): pasada de QC con LLM multimodal sobre fotogramas muestreados + reglas duras (duración vs spec del canal, ortografía de textos, presencia de logo). Guarda `Take.qcReport` y puede bloquear la exportación.

## 6. Pantallas (reutilizando patrones del repo)

| Pantalla (visión §4.3) | Base existente |
|---|---|
| Inicio del estudio | patrón de listas + tarjetas del CRM |
| Sala de conceptos | patrón de `ContentApproval` (aprobar/descartar con comentario) |
| Guion y tratamiento | editor de `ContentPiece` |
| Storyboard | grid drag & drop — `@dnd-kit` ya está en dependencias |
| Mesa de tomas | galería + `Job` status por socket |
| Sala de revisión | `ContentApprovalLink` ampliado con comentario por timecode |
| Exportaciones | presets por canal (los formatos ya están tipificados en Metricool sync) |
| Informe | `UsageRecord` por producción |

La ruta `/ads` ya tiene una vista interna `studio` (`CreativeCommandCenterPage`); el Studio de Cine debe ser módulo hermano (`/studio`), no colgar de ads.

## 7. Criterios de salida

- v0: [ ] una producción completa brief→shot list con coste estimado total, exportable a PDF/MD.
- v1: [ ] 1 anuncio de 15 s generado por planos con ≥2 proveedores implicados (imagen de storyboard + vídeo), presupuesto respetado.
- v2: [ ] pieza vertical con subtítulos y upscale publicada vía Metricool desde el propio Studio, con atribución UTM (el campo `utmContent` de ContentPiece ya existe).
