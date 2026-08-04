# Arnés E2E mutante y seguro de staging

## Propósito

`scripts/staging-e2e.mjs` ejecuta, únicamente contra un entorno no productivo, los cuatro recorridos comerciales completos:

1. Ads → lead → reunión → pipeline → venta → atribución.
2. Organic Leads → landing → lead → venta.
3. Prospect Finder → enriquecimiento → secuencia → reunión.
4. Knowledge Base → agente → llamada → tarea → cierre.

El arnés no edita servicios de negocio. Consume las rutas HTTP existentes, crea recursos con un identificador aislado de ejecución y escribe un estado y un informe de evidencias sanitizados.

## Barreras obligatorias

El proceso termina antes de hacer red si falta cualquiera de estas condiciones:

- `STAGING_E2E_BASE_URL` debe ser HTTP(S), sin credenciales, query ni hash. El host debe contener un marcador no productivo (`staging`, `qa`, `e2e`, `test`, `sandbox`, `preview`, `dev`, etc.). Para localhost hay que declarar además `STAGING_E2E_ALLOW_LOCAL=YES`.
- El host y la base de datos se bloquean si parecen productivos (`prod`, `production`, `live`) o si el destino coincide con `DATABASE_URL`.
- `STAGING_E2E_TOKEN` es obligatorio y no puede ser un placeholder.
- `STAGING_E2E_DATABASE_URL` es obligatorio, debe ser PostgreSQL, debe tener nombre de base no productivo y exige `STAGING_E2E_DATABASE_ISOLATED=YES`.
- Para cualquier modo mutante también se exige `STAGING_E2E_DATABASE_TARGET_HASH`, igual a `shortHash(host:puerto/base)` de la URL de staging; no incluye ni imprime la contraseña.
- `STAGING_E2E_FIXTURE_NAMESPACE` debe tener prefijo no productivo, por ejemplo `staging-mi-run`.
- `STAGING_E2E_WORKSPACE_ID` se comprueba contra `GET /api/settings/organization` antes de mutar.
- `STAGING_E2E_CONFIRM=I_UNDERSTAND_STAGING_MUTATIONS` y `--confirm-staging-mutations` son confirmaciones independientes.
- El modo por defecto es dry-run: no hace peticiones y no muta.
- `--preflight` es una excepción explícita de solo lectura: consulta liveness, readiness, integraciones, workspace y, si se autoriza, workers/colas y probes externos.
- `redirect: error` impide seguir una redirección accidental hacia otro host.
- Las respuestas completas no se guardan. Tokens, credenciales, query sensibles y cuerpos de proveedor se redactan.

Para Knowledge Base también se exige `STAGING_E2E_VOICE_SERVICE_SECRET`, porque `/api/calls/ingest` usa la autenticación interna de voz. Ese secreto nunca se incluye en el estado ni en el informe.

## Preparación del entorno

El backend desplegado debe estar configurado con la misma base de datos aislada que se declara aquí y con un workspace de staging dedicado. El token debe pertenecer a un administrador o responsable con permisos de organización, CRM, growth, agents, organic y prospecting. El worker de secuencias debe estar arrancado.

Ejemplo PowerShell — sustituir todos los valores por secretos de staging reales:

```powershell
$env:STAGING_E2E_BASE_URL = 'https://api-staging.example.com'
$env:STAGING_E2E_PUBLIC_BASE_URL = 'https://api-staging.example.com'
$env:STAGING_E2E_TOKEN = '<token-jwt-de-staging>'
$env:STAGING_E2E_VOICE_SERVICE_SECRET = '<secreto-voz-de-staging>'
$env:STAGING_E2E_DATABASE_URL = 'postgresql://e2e_user:<secret>@db-staging.example.com:5432/vendrava_staging_e2e'
$env:STAGING_E2E_DATABASE_ISOLATED = 'YES'
$env:STAGING_E2E_FIXTURE_NAMESPACE = 'staging-mi-identificador'
$env:STAGING_E2E_WORKSPACE_ID = '<organization-id-de-staging>'
$env:STAGING_E2E_CONFIRM = 'I_UNDERSTAND_STAGING_MUTATIONS'
$env:STAGING_E2E_DATABASE_TARGET_HASH = '<hash-de-host-puerto-base-staging>'
$env:STAGING_E2E_OBSERVABILITY_TOKEN = '<token-lectura-observabilidad-staging>'
$env:STAGING_E2E_REQUIRED_PROVIDERS = 'meta_ads,google_search_console,metricool,mautic_email,twilio'
```

No se debe copiar la URL de producción, su token ni su `DATABASE_URL` a estas variables.

El hash se puede generar sin guardar la URL en un archivo:

```powershell
$env:STAGING_E2E_DATABASE_TARGET_HASH = (node --input-type=module -e "import { canonicalDatabaseTarget, shortHash } from './scripts/staging-e2e-lib.mjs'; console.log(shortHash(canonicalDatabaseTarget(process.env.STAGING_E2E_DATABASE_URL).comparable))").Trim()
```

## Ejecución segura

El comando por defecto es un dry-run estricto: genera configuración/evidencia
sin hacer peticiones HTTP ni mutaciones:

```powershell
node scripts/staging-e2e.mjs --flow all
```

Para validar el entorno sin escribir datos, usar el preflight explícito:

```powershell
node scripts/staging-e2e.mjs --preflight --flow all
```

Para ejecutar los cuatro flujos mutantes y limpiar al terminar:

```powershell
node scripts/staging-e2e.mjs --run --confirm-staging-mutations --flow all
```

Se puede seleccionar uno o varios recorridos:

```powershell
node scripts/staging-e2e.mjs --run --confirm-staging-mutations --flow ads,organic
```

El flujo Ads no publica ni activa un anuncio remoto por defecto. Crea una campaña y landing local de staging, registra UTM `facebook / paid_social`, y verifica el lead, la reunión, el cierre y la evidencia de atribución.

## Proveedores externos

Por seguridad, Metricool/Meta/Mautic/Twilio no se tocan durante la ejecución normal. Si existe una cuenta de prueba separada y se quiere probar una ruta del proveedor, hay que habilitar una segunda barrera:

```powershell
$env:STAGING_E2E_PROVIDER_CONFIRM = 'I_UNDERSTAND_STAGING_PROVIDER_MUTATIONS'
$env:STAGING_E2E_PROVIDER_MODE = 'staging-test-account'
$env:STAGING_E2E_PROVIDER_PROBE_CONFIRM = 'I_UNDERSTAND_STAGING_PROVIDER_PROBES'
node scripts/staging-e2e.mjs --preflight --probe-providers --flow all
```

Los probes son de solo lectura y tienen su propia confirmación. La bandera
`--with-provider-mutations` es únicamente una barrera de política: no crea por
sí sola acciones remotas. Ninguna acción de proveedor se incorpora al arnés
sin adapter explícito, cuenta de prueba y rollback verificable.

```powershell
node scripts/staging-e2e.mjs --run --confirm-staging-mutations --with-provider-mutations --flow ads
```

## Fixtures y aislamiento

El fixture versionado está en `fixtures/staging-e2e/prospect.json`. No contiene PII ni credenciales y utiliza un dominio `.invalid`. Se puede pasar otro fixture aislado:

```powershell
node scripts/staging-e2e.mjs --run --confirm-staging-mutations --flow prospect --fixture .\fixtures\staging-e2e\prospect.json
```

Cada ejecución añade `runId` al nombre, `placeId`, `externalCallId`, `externalKey` y campos JSON. Esto evita colisiones entre corridas y permite localizar solo los recursos del run.

## Limpieza

La limpieza se ejecuta automáticamente en un bloque `finally`, salvo que se indique expresamente `--keep-fixtures`. Es reversible y usa las rutas existentes:

- campañas → `draft`;
- proyectos orgánicos → inactivos;
- Knowledge Base → inactivo;
- agentes → desactivados;
- reuniones → canceladas;
- leads → `unqualified`;
- secuencias → detenidas y archivadas;
- oportunidades → reabiertas y marcadas como perdidas cuando los permisos lo permiten;
- tareas de llamada → completadas.

Leads, llamadas, eventos de adquisición, actividades y otros registros forenses no tienen borrado de dominio y se conservan como residuales de auditoría. Si solo quedan esos residuales esperados, el informe queda en `passed_with_audit_residuals` y no bloquea el proceso. Si una limpieza reversible falla, el informe queda en `passed_with_residuals` y el comando termina con código distinto de cero.

Si el proceso se interrumpe, se puede limpiar usando el estado guardado, repitiendo todas las barreras de seguridad:

```powershell
node scripts/staging-e2e.mjs --cleanup .\.artifacts\staging-e2e\<runId>.state.json --confirm-staging-mutations
```

El origen actual debe coincidir con el origen guardado en el estado.

## Evidencias

Cada run escribe, por defecto:

- `.artifacts/staging-e2e/<runId>.state.json`: IDs creados, rutas, estados de requests, assertions, cleanup y residuales.
- `.artifacts/staging-e2e/<runId>.report.json`: informe estructurado.
- `.artifacts/staging-e2e/<runId>.report.md`: informe legible para revisión.

El informe cubre:

- workspace autenticado;
- HTTP status y content-type de cada operación;
- IDs de campaña, lead, reunión, oportunidad, proyecto, secuencia, agente, llamada y tarea;
- comprobación de `closed_won`, atribución, matrícula de secuencia, reunión generada por worker, llamada completada y tarea cerrada;
- intentos y fallos de limpieza;
- residuales esperados e indicación de revisión;
- confirmación de que no se escribieron secretos.

No se guarda el cuerpo completo de ninguna respuesta. Los textos de error se limitan y redactan.

## Tests del arnés

`scripts/staging-e2e.test.mjs` contiene tests puros de seguridad para el bloqueo de producción, la coincidencia de base de datos, las confirmaciones, los fixtures y la redacción. No abre red, no importa Prisma y no muta el workspace.

## Checks operativos permitidos

La validación de esta implementación debe limitarse a checks sintácticos:

```powershell
node --check scripts/staging-e2e-lib.mjs
node --check scripts/staging-e2e.mjs
node --check scripts/staging-e2e.test.mjs
node --test scripts/staging-e2e.test.mjs scripts/ops-checks.test.mjs scripts/production-gate.test.mjs
node scripts/ops-checks.mjs
```

Estos checks no ejecutan el arnés mutante, migraciones Prisma, builds,
workers ni probes de proveedores. El arnés mutante solo se ejecuta desde un
staging aislado y después de un preflight PASS.
