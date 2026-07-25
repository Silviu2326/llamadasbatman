# Auditoría independiente de Prisma y pruebas de integración

Fecha: 22/07/2026.

Esta revisión es estática y no mutante. No aplica migraciones, no edita
`backend/prisma/schema.prisma`, no crea un `PrismaClient`, no abre red y no
ejecuta workers ni proveedores.

## Dictamen ejecutivo

La revisión estática encuentra una estructura coherente entre el schema y el
SQL versionado: 15 migraciones, una secuencia temporal sin duplicados, 70
modelos, 14 enums y los agregados críticos con columnas, índices y relaciones
presentes. Esto no demuestra que una base histórica pueda recibir el historial:
para eso falta un staging vacío, una shadow database descartable y una consulta
de `"_prisma_migrations"` en el destino real.

El estado actual no es todavía un release reproducible: las 14 migraciones
posteriores a la baseline están sin rastrear (`??`) y la baseline está
modificada en el working tree. La diferencia visible de la baseline es sólo un
salto de línea final, pero no se debe editar una baseline que ya haya sido
marcada como aplicada.

## Archivos entregados y comandos de auditoría

Se añadió:

- `scripts/prisma-readiness-audit.mjs`: analizador offline; no carga `.env`, no
  usa Prisma, no abre red y no escribe en el repositorio.
- `docs/PRISMA_INTEGRATION_AUDIT.md`: este dictamen y el procedimiento de
  staging.
- `ops:prisma-audit` en `package.json`.

Desde la raíz:

```powershell
node --check scripts/prisma-readiness-audit.mjs
npm.cmd run ops:prisma-audit
```

Resultado observado:

```text
read-only: yes | network: no | migrations applied: no | schema edited: no
0 errores estructurales, 7 advertencias
```

También pasa:

```powershell
cd backend
npx.cmd prisma validate --schema prisma/schema.prisma
```

`prisma format --check` no pasa actualmente porque hay archivos sin formatear;
al usar `--check` no modifica el schema.

Los dos comandos de estado/diff que requieren infraestructura no pudieron
certificar el entorno actual:

```powershell
cd backend
npx.cmd prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script
npx.cmd prisma migrate status --schema prisma/schema.prisma
```

El primero termina indicando que hace falta `--shadow-database-url`; el segundo
alcanza la URL cargada desde `.env` y termina con un error del schema engine.
Ninguno aplicó migraciones. Por eso la convergencia SQL sólo está demostrada de
forma estática hasta disponer de una shadow y un staging controlados.

## Orden y conflictos de baseline

El orden detectado es:

```text
20260714000000_baseline
20260715000000_add_growth_programs
20260715010000_add_growth_automation_journey
20260715020000_harden_auth_and_public_ingress
20260715030000_add_worker_leases
20260715100000_add_revenue_intelligence
20260715110000_add_enterprise_access_control
20260715111000_bootstrap_organization_owners
20260722120000_add_organic_leads_mvp
20260722153000_add_organic_google_oauth
20260722170000_add_persistent_action_center
20260722193000_add_sales_sequence_runtime
20260722210000_add_org_integration_credentials
20260722211000_harden_meta_credentials
20260722220000_add_operational_webhook_fields
```

Hallazgos:

1. No hay prefijos temporales duplicados y la baseline es la primera.
2. La baseline crea 50 tablas y 9 enums. Su DDL no es idempotente (`CREATE
   TABLE`/`CREATE TYPE` sin `IF NOT EXISTS`); sirve como punto de arranque, no
   para superponerse a una base histórica.
3. Las migraciones posteriores aparecen como no rastreadas. Un checkout limpio
   o un artefacto que no las incluya no podrá aplicar el schema actual.
4. `docs/BACKEND_PENDIENTE_PAGINAS.md` menciona dos migraciones ausentes del
   directorio actual: `20260713120000_add_acquisition_events` y
   `20260713183000_add_omnichannel_conversations`. Es documentación histórica,
   pero puede indicar un historial de base distinto; no hay que recrearlas por
   intuición.

### Consulta de historial, sólo lectura

Ejecutar únicamente contra una URL de staging confirmada y con un rol de
lectura:

```sql
SELECT migration_name,
       started_at,
       finished_at,
       rolled_back_at,
       applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at, migration_name;
```

Comparar los nombres devueltos con los 15 directorios anteriores. Hay conflicto
si la base contiene una migración ausente en el checkout, si la baseline no está
marcada pero sus tablas ya existen, si hay una fila incompleta/revertida o si el
schema actual proviene de `db push` sin una historia equivalente.

En esos casos no se debe usar `db push`, editar la baseline ni ejecutar
`migrate resolve` directamente en producción. Primero hay que clonar la base,
hacer backup y comparar schema. Una eventual resolución con
`prisma migrate resolve --applied <nombre>` es una escritura sobre el historial
y requiere aprobación explícita después de ensayarse en el clon.

## Modelos críticos auditados

| Modelo | Migración | Resultado estático |
|---|---|---|
| `ActionItem`, `ActionItemHistory` | `20260722170000_add_persistent_action_center` | Columnas, enums, índices y FKs concordantes |
| `SalesSequenceEnrollment`, `SalesSequenceStepRun` | `20260722193000_add_sales_sequence_runtime` | Unicidad programa+lead, deduplicación de pasos y FKs concordantes |
| `OrganizationIntegrationCredential` | `20260722210000_add_org_integration_credentials` | Unicidad org+provider+slot y estados concordantes |
| `WebhookEvent` | baseline + `20260722220000_add_operational_webhook_fields` | Reintentos, correlación e índices concordantes |
| `MetaAdAccount` | baseline + `20260722211000_harden_meta_credentials` | Columnas OAuth y nulabilidad concordantes |

Esto compara archivos; no sustituye aplicar el historial en una base vacía y
verificar el schema físico.

## Guard de `TEST_DATABASE_URL`

El guard actual comprueba que existan `TEST_DATABASE_URL` y `DATABASE_URL`, y
rechaza que sean la misma URL después de normalizar credenciales, query, hash y
slash final. La ejecución actual confirma el bloqueo temprano:

```powershell
cd backend
node --env-file=.env scripts/test-database-guard.mjs
npm.cmd test
```

Resultado actual en ambos casos:

```text
TEST_DATABASE_URL debe apuntar a una base de pruebas aislada.
```

Riesgos concretos del guard:

1. No valida que la URL sea PostgreSQL ni que sea parseable antes de aceptar el
   aislamiento.
2. No rechaza una URL de producción con otro nombre de base si no coincide
   literalmente con `DATABASE_URL`.
3. No compara shadow/direct URL ni verifica qué URL leyó el cliente Prisma.
4. `src/lib/prisma.ts` construye `new PrismaClient()` al importar el módulo,
   mientras `src/__tests__/testHelpers.ts` reasigna `process.env.DATABASE_URL`
   después de importar el singleton. El guard puede pasar y el cliente seguir
   usando la URL de aplicación original.

La corrección pendiente debe hacer explícita la URL del datasource al construir
el cliente de test, o cargar la URL de test antes de importar cualquier módulo
que cree Prisma. Después hay que verificar en la conexión de test
`current_database()` y `current_schema()` sin registrar la URL.

## Cobertura y aislamiento de tests

El árbol tiene 18 archivos `*.test.ts` y 68 casos estáticos, incluidos los
contratos en `src/__tests__/contracts`. El script actual es:

```text
node --env-file=.env --import=tsx --test src/__tests__/*.test.ts
```

Ese glob es de primer nivel y puede omitir `contracts`. Además, `pretest`
bloquea también tests puros de contrato si no hay base, aunque no hagan
consultas. La suite debe separarse en:

- tests puros/unitarios/contrato sin base;
- integración Prisma con base efímera;
- E2E HTTP/proveedores sólo contra staging y sandboxes.

`cleanupOrgs` no elimina todos los agregados org-scoped críticos: `ActionItem`,
`ActionItemHistory`, credenciales por organización, `WebhookEvent`, OAuth states
y varios modelos Organic. Antes de usar una base compartida hay que completar
el teardown o usar una base efímera por ejecución.

## Qué falta para ejecutar la suite completa en staging

### 1. Provisionar tres destinos

Separar físicamente o lógicamente:

- `DATABASE_URL`: aplicación de staging;
- `TEST_DATABASE_URL`: base efímera de integración;
- `SHADOW_DATABASE_URL`: base descartable para reconstruir migraciones.

Demostrar la separación con `current_database()`/`current_schema()`. No basta
con cambiar el usuario.

### 2. Aplicar y verificar el historial en staging

Con `DATABASE_URL` apuntando sólo a staging:

```powershell
cd backend
npx.cmd prisma validate --schema prisma/schema.prisma
npx.cmd prisma migrate deploy --schema prisma/schema.prisma
npx.cmd prisma migrate status --schema prisma/schema.prisma
```

`migrate deploy` escribe staging y no se ejecutó en esta auditoría.

Para comprobar la convergencia contra una shadow vacía y descartable:

```powershell
$env:SHADOW_DATABASE_URL = 'postgresql://<shadow-user>:<secret>@<shadow-host>:5432/vendrava_shadow'
npx.cmd prisma migrate diff `
  --from-migrations prisma/migrations `
  --to-schema-datamodel prisma/schema.prisma `
  --shadow-database-url $env:SHADOW_DATABASE_URL `
  --script
```

Prisma exige `--shadow-database-url` para reconstruir un directorio de
migraciones. No se proporcionó aquí porque requiere una base descartable real;
nunca se debe reutilizar la base de aplicación.

### 3. Preparar y ejecutar la base de tests

Aplicar el mismo historial a `TEST_DATABASE_URL`, generar el cliente y corregir
primero la resolución de URL del singleton:

```powershell
$env:DATABASE_URL = 'postgresql://<staging-app-user>:<secret>@<staging-host>:5432/vendrava_staging'
$env:TEST_DATABASE_URL = 'postgresql://<test-user>:<secret>@<test-host>:5432/vendrava_staging_test'
cd backend
npx.cmd prisma generate
npm.cmd test
```

La suite no es evidencia de aislamiento hasta que se observe también:

- guard validando la URL de test;
- `migrate deploy` exitoso sobre la base de test;
- descubrimiento de todos los archivos, incluidos `contracts`;
- conexión confirmada a `TEST_DATABASE_URL`;
- teardown sin residuos o destrucción de la base efímera.

### 4. Ejecutar E2E mutante al final

Sólo con backend, workspace y proveedores sandbox no productivos:

```powershell
node scripts/staging-e2e.test.mjs
node scripts/staging-e2e.mjs --flow all
node scripts/staging-e2e.mjs --run --confirm-staging-mutations --flow all
```

El último comando muta staging y queda fuera de esta revisión.

## Estado final de esta ronda

Entregado: script de auditoría offline, comando npm, documentación y checks de
sintaxis/validación. No se aplicaron migraciones ni se editó el schema.

Pendiente para declarar la suite lista: resolver la conexión explícita del
cliente de tests, incluir todos los archivos, completar aislamiento/teardown,
provisionar staging + shadow + test y ejecutar allí `migrate deploy`, `migrate
status`, la suite completa y los E2E con evidencias guardadas.
