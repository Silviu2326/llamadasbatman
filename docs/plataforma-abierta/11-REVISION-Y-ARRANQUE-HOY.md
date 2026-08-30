# 11 — Revisión crítica y arranque desde hoy

**Fecha de revisión:** 18 de agosto de 2026  
**Alcance:** revisión completa de `00`–`10`, contrastada con el código y el esquema actuales.  
**Objetivo:** convertir una arquitectura correcta pero extensa en una secuencia que pueda empezar hoy sin crear deuda irreversible.

---

## 1. Veredicto

La dirección es buena y encaja con el producto existente. La documentación acierta especialmente en cinco decisiones:

1. vender resultados y capacidades, no marcas;
2. empezar BYOK antes de asumir consumo gestionado;
3. reutilizar Orchestration, Automation, aprobaciones y outbox;
4. convertir las microapps en recetas sobre una plataforma común;
5. aplazar editor visual, timeline y marketplace hasta que exista demanda.

La plataforma abierta **puede empezar a construirse hoy**. Lo que no es realista es prometer hoy una apertura comercial completa con vídeo, créditos y marketplace.

La primera prueba debe demostrar solo esto:

> Una organización conecta su propia credencial, elige o acepta un proveedor recomendado, ejecuta una capacidad desde una función real de Vendrava y puede ver proveedor, modelo, coste estimado, resultado y motivo de la elección.

Cuando eso funcione con dos proveedores intercambiables para una misma capacidad, Vendrava ya tendrá el núcleo de una plataforma abierta. Todo lo demás amplía ese núcleo.

---

## 2. Cambios necesarios antes de usar los diseños como especificación

Los modelos Prisma y contratos TypeScript de estos documentos son **diseños conceptuales**, no bloques listos para copiar. Antes de convertirlos en una migración deben completarse relaciones inversas, nombres de relación, `onDelete`, enums, restricciones de unicidad e idempotencia.

### Hallazgos prioritarios

| Prioridad | Hallazgo | Riesgo si no se corrige | Mejora necesaria |
|---|---|---|---|
| P0 | `costCents` y `priceCents` no tienen precisión suficiente | La mayoría de llamadas LLM pequeñas costarán menos de un céntimo y quedarán registradas como cero | Guardar coste en microunidades o `Decimal`, con moneda y versión de tarifa |
| P0 | `Wallet.balanceCents` no modela reservas concurrentes | Dos jobs simultáneos pueden gastar el mismo saldo | Añadir holds/reservas e idempotencia, con descuento atómico |
| P0 | `Asset.parentAssetId` solo permite un padre | Un vídeo puede derivar de storyboard, audio, subtítulos, logo y varias tomas | Sustituirlo por relaciones N:M tipadas entre activos |
| P0 | El job remoto no tiene estado de espera de proveedor | Un render de minutos quedaría como `running` con un lease ambiguo | Añadir `submitted`/`waiting_provider`, liberar lease y reanudar por webhook o polling |
| P0 | URLs prefirmadas privadas no sirven como único mecanismo de publicación | Meta, Metricool u otros proveedores necesitan descargar activos mediante una URL estable | Separar asset privado de publicación/exportación pública inmutable |
| P0 | El flujo demo usa `call.won`, evento inexistente | El flujo nunca se dispararía | Utilizar `opportunity.won`, que sí existe en pipeline, automatizaciones, outbox y webhooks |
| P1 | El MCP disponible en una sesión de desarrollo se trata como precedente de integración | Un MCP del entorno del agente no existe dentro del backend desplegado | Validar Magnific mediante su API/SDK y credenciales del producto; no depender del MCP de esta sesión |
| P1 | La conversión automática `inputSchema` de Zod a formulario no está resuelta | El runner genérico no puede aparecer solo con los paquetes actuales | Definir `uiSchema` propio o incorporar y validar una conversión JSON Schema |
| P1 | Los webhooks de proveedores nuevos no tienen inbox genérico explícito | Duplicados, replays o eventos fuera de orden pueden completar dos veces un job | Reutilizar/generalizar `WebhookEvent` con firma, timestamp, dedupe y correlación |
| P1 | `commercialUseAllowed: boolean` simplifica demasiado los términos | El permiso puede depender de plan, región, modelo, categoría o tipo de contenido | Modelar estado de revisión, restricciones y usos permitidos/prohibidos |
| P1 | Coste del job padre y jobs hijos puede contarse dos veces | `microapp.run` y sus capabilities podrían duplicar gasto | El job padre agrega; solo los eventos de uso del proveedor facturan |
| P1 | Inputs y outputs de Job/Microapp pueden contener PII | Copiar payloads completos crea una nueva superficie de datos sensibles | Referencias a entidades, redacción, clasificación, retención y tamaño máximo |
| P2 | El score del router usa tiers demasiado genéricos | “Premium” no significa lo mismo para texto, manos, tipografía, velocidad o consistencia | Quality profile por caso de uso y benchmark, manteniendo defaults humanos al inicio |
| P2 | `refAssetIds String[]` pierde integridad referencial | Se pueden borrar referencias sin detectar producciones afectadas | Tabla de relación para referencias de biblia y roles de cada activo |
| P2 | `Take.selected Boolean` permite varias tomas elegidas | Dos tomas pueden quedar marcadas como finales a la vez | `Shot.selectedTakeId` o restricción transaccional |

---

## 3. Correcciones factuales a la documentación

### 3.1 Evento del flujo demo

El repositorio emite y consume `opportunity.won`; no existe `call.won`. El disparador recomendado es:

```text
opportunity.won
  → construir caso de éxito
  → solicitar consentimiento si se utilizan citas o identidad
  → crear activos
  → preparar campaña
```

Una llamada positiva puede generar o actualizar una oportunidad, pero no debe inventarse un estado comercial de “ganada” sobre `Call`.

### 3.2 Archivos `.env`

`backend/.env` y `backend/.env.bak-preusa` existen en el árbol local y están ignorados actualmente. No aparecen como archivos seguidos en el estado actual de Git. Sin embargo, el historial sí contiene commits asociados a esas rutas, incluido el commit inicial y otro que los retiró.

Acción correcta:

- no borrar archivos locales que necesita el usuario;
- comprobar si contenían credenciales reales;
- considerar comprometida cualquier credencial que haya vivido en el historial;
- rotarla y documentar la rotación;
- verificar que CI, artefactos y backups tampoco la conserven.

### 3.3 MCP de Magnific

La disponibilidad de un MCP en una sesión de Codex sirve para explorar y validar manualmente, pero no constituye una integración del SaaS. El adapter desplegado debe autenticarse por una vía soportada por Magnific para aplicaciones, verificar términos, firma de webhook, límites y facturación.

### 3.4 Esquemas conceptuales

Los fragmentos Prisma omiten deliberadamente relaciones inversas en `Organization`, `User`, `Campaign` y otros modelos. Deben tratarse como ADR/diseño. La migración real necesita compilar con `prisma validate`, generar cliente y pasar el test multi-tenant.

---

## 4. Definición de “plataforma abierta v0”

Para no intentar construir Fase 0 y Fase 1 completas a la vez, la v0 debe ser una tajada vertical detrás de feature flag.

### Alcance

- capability inicial: `llm.generate`;
- proveedor actual: DeepSeek;
- segundo proveedor: OpenAI Chat o Anthropic, BYOK;
- primera experiencia: **Investigador de empresa 360**, porque ya reutiliza servicios reales y produce un resultado claro;
- selección: recomendada o fijada por usuario avanzado;
- persistencia mínima: decisión de routing y uso;
- sin créditos gestionados;
- sin fallback automático si existe duda de consumo;
- sin cambiar todavía el pipeline de llamadas en vivo.

### Por qué empezar por LLM y no por vídeo

- evita bloquear la prueba con storage audiovisual;
- no necesita webhooks de renders largos;
- ya hay una capacidad usada en muchas zonas del producto;
- permite demostrar dos proveedores para el mismo contrato;
- prueba BYOK, routing, costes y políticas con un riesgo contenido;
- el resultado puede quedarse privado y estructurado.

### Criterios de terminado de v0

- [ ] `llm.generate` tiene un contrato Zod estable.
- [ ] DeepSeek y un segundo LLM pasan el mismo test de contrato.
- [ ] La organización puede guardar, probar y revocar la credencial del segundo proveedor.
- [ ] El secreto nunca aparece en respuesta, log o error persistido.
- [ ] El usuario ve proveedor, modelo y estimación antes de ejecutar.
- [ ] La decisión guarda elegido, alternativas y exclusiones.
- [ ] Investigador de empresa 360 funciona con ambos proveedores.
- [ ] Cada llamada crea un evento de uso preciso e idempotente.
- [ ] Desconectar la credencial produce un error accionable.
- [ ] Todo está detrás de `OPEN_PLATFORM_V0_ENABLED` o entitlement equivalente.

Esto no es aún un lanzamiento comercial. Es una demostración real del contrato central.

---

## 5. Orden recomendado de los primeros PR

Cada PR debe ser pequeño, reversible y desplegable por separado.

### PR 1 — Contratos y registro sin cambiar comportamiento

- crear taxonomía de capabilities;
- definir `ProviderDescriptor`, `CapabilityBinding` y `ProviderCtx`;
- registrar proveedores actuales como metadata;
- envolver DeepSeek sin cambiar los consumidores existentes;
- añadir tests de contrato;
- documentar feature flag.

**Salida:** el registro describe la realidad, pero nada del producto cambia todavía.

### PR 2 — Uso preciso e idempotente

- crear `UsageEvent` o `UsageRecord` con precisión subcéntimo;
- registrar moneda, tarifa aplicada, cantidad y unidad;
- añadir `idempotencyKey` único;
- instrumentar solo DeepSeek y OpenAI imagen inicialmente;
- construir una consulta interna de coste por organización/proveedor.

**Salida:** se observa coste real sin cobrar ni introducir Wallet.

### PR 3 — BYOK generalizado para el segundo LLM

- derivar proveedores BYOK del registro;
- añadir campos secretos del segundo proveedor;
- implementar `testConnection` barato y sin generación costosa cuando sea posible;
- exponer catálogo y estado de conexión;
- conservar el camino actual de credenciales sin regresiones.

**Salida:** una organización conecta y prueba su proveedor alternativo.

### PR 4 — Router determinista v0

- filtros duros;
- preferencia explícita;
- default recomendado;
- coste máximo;
- decisión auditable;
- sin circuit breaker ni aprendizaje automático todavía;
- sin fallback automático tras una solicitud posiblemente cobrada.

**Salida:** dos LLM comparten un contrato y una decisión visible.

### PR 5 — Primera microapp abierta

- envolver Investigador de empresa 360;
- resultado estructurado y evidencias;
- selector recomendado/profesional;
- historial ligado a empresa o lead;
- límites de tamaño, PII y retención.

**Salida:** demo de negocio completa y no meramente técnica.

### PR 6 — Assets seguros antes de abrir imagen/vídeo

- storage abstraction S3/R2;
- `Asset` mínimo;
- acceso privado y publicación pública diferenciados;
- doble escritura desde el generador de imagen actual;
- migración con dry-run de la media existente.

**Salida:** se puede empezar Magnific e imagen multimodelo sin perpetuar el disco local.

---

## 6. Mejoras al modelo `Job`

### Estados recomendados

```text
queued
running
submitted
waiting_provider
awaiting_approval
succeeded
failed
cancel_requested
canceled
```

`running` debe significar que un worker posee el lease y está haciendo trabajo local. Tras enviar un render remoto:

1. se guarda `providerJobId`;
2. el estado pasa a `waiting_provider`;
3. se libera el lease;
4. un webhook verificado o un poll programado devuelve el job a una transición procesable.

### Campos y reglas que faltan

- `idempotencyKey` único por organización y tipo;
- `nextPollAt` para respaldo de webhook;
- `progress` y mensaje seguro para UI;
- `cancelRequestedAt` y `canceledAt`;
- `submittedAt`;
- `providerCostRef` o vínculo inequívoco a eventos de uso;
- `@@unique([provider, providerJobId])` cuando exista ID externo;
- payload máximo y política de redacción;
- transición de estados validada en servicio, no mediante updates libres;
- webhook duplicado = éxito idempotente, no segundo asset;
- cancelación local no implica que el proveedor haya cancelado o reembolsado.

### Dispatcher

Postgres con lease es una opción coherente porque ya existe el patrón. La razón no debe ser que BullMQ “no soporte trabajos largos”; sí puede renovar locks. La razón correcta es mantener Postgres como fuente durable de verdad y no ocupar un worker durante la espera remota.

---

## 7. Mejoras al modelo de activos

### 7.1 Privado y publicado son estados distintos

Añadir `accessClass` o un concepto equivalente:

```text
private       → accesible con autorización o URL corta
shared        → enlace temporal de revisión
published     → derivado/copia inmutable con URL estable para canales externos
```

Meta, Metricool y otros servicios no deben depender de una URL privada que expire antes de que descarguen el archivo.

### 7.2 Genealogía N:M

Reemplazar el único `parentAssetId` por:

```prisma
model AssetRelation {
  orgId       String
  parentId    String
  childId     String
  role        String // source | image | audio | subtitle | logo | reference | upscale_of | translation_of
  createdAt   DateTime @default(now())

  @@unique([parentId, childId, role])
  @@index([orgId, childId])
}
```

Así se puede saber que un vídeo usa una imagen, una voz, una música y unos subtítulos, y comprobar derechos en toda la composición.

### 7.3 Ingesta y publicación

- límites de bytes, dimensiones y duración antes de aceptar;
- comprobación de magic bytes y decodificación real;
- checksum por organización;
- claves de storage no controladas por el usuario;
- metadatos y nombres visibles separados de `storageKey`;
- `BigInt` para tamaño si se admiten vídeos grandes;
- cache headers inmutables en publicación;
- lifecycle de originales, previews y derivados;
- proceso de retirada que registra qué canales externos deben revisarse.

### 7.4 Migración

La inferencia de `orgId` desde URLs no siempre será inequívoca. El script debe tener:

- modo `--dry-run`;
- manifiesto de archivo → organización → registro consumidor;
- categoría `unresolved` sin publicar;
- checksum;
- reanudación idempotente;
- informe de huérfanos;
- rollback que no borre el original hasta verificar lectura desde storage.

---

## 8. Mejoras a consumo, precios y Wallet

### 8.1 No almacenar solo céntimos

Separar:

- **medición:** tokens, segundos, imágenes, píxeles o caracteres;
- **coste del proveedor:** microunidades monetarias y moneda original;
- **precio al cliente:** microunidades y moneda de facturación;
- **tarifa:** versión y fuente utilizada para valorar el uso.

Una opción simple es `Decimal(20, 8)` para importes y `Decimal` para cantidad. Otra es `BigInt` en microeuros, siempre que se documente la escala.

### 8.2 Idempotencia

Cada evento facturable necesita una clave única, por ejemplo:

```text
provider + providerRequestId + capability + eventKind
```

Un webhook duplicado o un retry no puede cobrar dos veces.

### 8.3 Reservas

Antes de Wallet se necesita `WalletHold` o una reserva equivalente:

- reserva atómica del estimado;
- saldo disponible = saldo contable − holds activos;
- ajuste al coste real;
- liberación en fallo o expiración;
- idempotencia por job;
- transacción con bloqueo/condición para impedir sobregiro.

No introducir Wallet en la primera tajada. Primero observar uso real durante un periodo y validar tarifas.

### 8.4 Multiplicadores

Los multiplicadores sugeridos en `09` son hipótesis comerciales, no defaults de código. Deben validarse con:

- coste real;
- IVA/impuestos y moneda;
- comisiones de pago;
- reintentos y fallos no reembolsados;
- storage y transferencia;
- soporte;
- margen mínimo por familia.

---

## 9. Mejoras al router

### Router v0

Empezar con:

1. filtros legales, de credencial, política y límites;
2. preferencia explícita;
3. default humano por capability;
4. presupuesto;
5. alternativa visible.

No hace falta un score combinado en el primer PR.

### Después de tener datos

- perfiles de calidad por tarea: tipografía, realismo, producto, razonamiento, velocidad, español, consistencia;
- benchmark versionado;
- ventana mínima de muestras antes de usar tasa de éxito;
- protección contra que un proveedor nuevo sin datos sea penalizado injustamente;
- motivo legible y motivo técnico separados;
- reproducibilidad: guardar versión de adapter, modelo y reglas del router;
- fallback compatible con input, derechos, región, calidad y presupuesto;
- fallback automático solo si se sabe que el primer intento no produjo efecto ni cargo.

`commercialUseAllowed` debería evolucionar a algo como:

```text
termsStatus: approved | restricted | pending | blocked
allowedUseCases
blockedUseCases
requiredPlan
reviewedAt
reviewedBy
sourceUrl
notes
```

---

## 10. Mejoras a flujos y microapps

### Flujos

- cambiar el evento demo a `opportunity.won`;
- no consultar JSON del grafo indefinidamente para dependencias críticas: materializar `FlowCapabilityDependency` al publicar una versión;
- validar que el grafo sea acíclico salvo nodos de espera expresamente permitidos;
- límites de fan-out, profundidad y concurrencia;
- política de cancelación y compensación por nodo;
- snapshot de la versión de capability y microapp usada;
- distinguir `dryRun` de ejecución real en toda acción;
- test que impida publicar un flow sin provider resoluble para capacidades obligatorias.

### Microapps

- añadir `uiSchema` separado de `inputSchema`; Zod valida, pero no define por sí solo una UX buena;
- límites de tamaño y clasificación de cada input;
- `dataAccess` de lectura separado de efectos de escritura;
- referencias a entidades en vez de copiar PII completa en `input`;
- output versionado;
- evidencias con snapshot o hash cuando la fuente pueda cambiar;
- job padre agregado sin cargo propio duplicado;
- una microapp de terceros nunca recibe clientes Prisma ni secretos;
- prompts declarativos firmados y revisados en marketplace, sin código arbitrario.

---

## 11. Mejoras al Studio de Cine

La secuencia v0 → v1 → v2 → v3 es correcta. Añadir estos requisitos antes de empezar v1:

- capability `vision.analyze` para QC multimodal;
- tabla relacional para referencias de biblia;
- `Shot.selectedTakeId` para una única toma final;
- orden único por producción/escena y escena/plano;
- estados y transiciones centralizados;
- budgets reservados, no solo sumados;
- consentimiento y licencia validados antes de enviar referencias a un proveedor;
- FFmpeg aislado en worker, con límites de CPU, RAM, tiempo, tamaño y formatos;
- no ejecutar argumentos de FFmpeg construidos desde texto libre;
- previews/proxies separados de masters;
- exportación profesional antes que timeline propio;
- costes presentados como rango cuando el proveedor o la duración final no permitan exactitud.

El MVP de Studio debe seguir siendo **preproducción vendible**. No convertir el v0 en una excusa para construir edición de vídeo.

---

## 12. Seguridad y derechos: anotaciones

- La revocación de consentimiento puede bloquear futuros usos y generar una cola de retirada; no garantiza borrar copias ya descargadas o publicadas por terceros.
- Un consentimiento debe registrar sujeto verificable, versión del texto aceptado, medio de captura y jurisdicción, además del asset de evidencia.
- Distinguir identidad real, actor/stock licenciado y personaje enteramente sintético.
- Las políticas deben decidir también si se permite enviar PII, transcripciones, biometría o material confidencial a cada proveedor.
- No almacenar prompts completos cuando contengan secretos o datos innecesarios; conservar versión redactada y hash si procede.
- Webhooks: firma, tolerancia temporal, replay protection, payload máximo y respuesta rápida antes de procesar.
- Los assets compartidos para aprobación necesitan token hash, caducidad, alcance y revocación, siguiendo el buen patrón de `ContentApprovalLink`.
- Añadir threat model específico antes de avatares, clonación de voz y marketplace.

---

## 13. Qué hacer hoy

### Antes de escribir código

- [ ] Aceptar formalmente la definición de plataforma abierta v0 de este documento.
- [ ] Elegir el segundo LLM BYOK para la prueba.
- [ ] Crear feature flag/entitlement de apertura.
- [ ] Decidir precisión monetaria (`Decimal` o microeuros).
- [ ] Decidir `AssetRelation` N:M y acceso privado/publicado.
- [ ] Registrar como ADR que Postgres es la fuente de verdad de jobs remotos.

### Primer bloque de implementación

- [ ] Crear carpetas `providers/capabilities` y `providers/adapters`.
- [ ] Definir el contrato de `llm.generate`.
- [ ] Envolver DeepSeek sin migrar aún todos sus consumidores.
- [ ] Añadir un adapter alternativo BYOK.
- [ ] Escribir tests de contrato comunes.
- [ ] Añadir medición precisa e idempotente a ambos adapters.
- [ ] Ejecutar Investigador de empresa 360 con un proveedor fijado en un entorno controlado.

### Lo que no debe empezar hoy

- editor visual de flows;
- timeline de vídeo;
- marketplace;
- Wallet y recargas;
- routing del pipeline de voz en vivo;
- segundo proveedor de telefonía;
- migración masiva de toda la media sin dry-run;
- publicación de avatares sin ConsentGrant y guard real.

---

## 14. Criterio para pasar de v0 a Fase 0/Fase 1 completas

La prueba v0 se considera válida cuando:

- una persona no técnica puede conectar su clave;
- una microapp real funciona con dos proveedores;
- la elección y el coste son comprensibles;
- el resultado queda vinculado al CRM;
- no se filtran secretos ni PII innecesaria;
- los retries no duplican uso;
- desconectar un proveedor no rompe silenciosamente el flujo;
- existe evidencia de que la abstracción reduce trabajo al añadir el segundo adapter.

Después de esa validación:

1. completar Assets y storage;
2. completar Jobs remotos;
3. integrar Magnific;
4. abrir imagen multimodelo;
5. construir microapps sobre el contrato;
6. iniciar Studio v0;
7. añadir Runway/vídeo;
8. introducir Wallet solo después de observar y valorar uso real.

---

## 15. Decisión final recomendada

Mantener el roadmap `00`–`10`, con estas modificaciones:

- la primera demostración abierta será LLM + BYOK + Investigador de empresa 360;
- Fase 0 continúa siendo obligatoria antes de abrir media o consumo gestionado;
- el ledger usa precisión subcéntimo e idempotencia;
- Wallet usa reservas atómicas;
- los assets tienen múltiples padres y separación privado/publicado;
- los jobs remotos liberan lease mientras esperan proveedor;
- el evento demo es `opportunity.won`;
- el MCP del entorno no se considera una integración de producción;
- los snippets del plan son diseños, no migraciones listas para copiar.

Con estas correcciones, el plan deja de ser solo una buena visión técnica y se convierte en una secuencia que puede empezar hoy con una entrega pequeña, demostrable y compatible con todo lo que viene después.

