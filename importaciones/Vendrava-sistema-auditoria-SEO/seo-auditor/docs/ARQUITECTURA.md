# Arquitectura y contratos

## Flujo ejecutado

1. Captación por importación CSV, alta manual o resultados SERP del proveedor.
2. Normalización del dominio y deduplicación de leads.
3. Trabajo persistido en SQLite. El worker reclama un trabajo mediante una transacción `BEGIN IMMEDIATE`.
4. Fase 1: transporte HTTP acotado, robots, sitemaps, muestra de páginas, extracción y navegador opcional. Se conservan datos iniciales y renderizados por separado.
5. Evaluación de los 97 identificadores. Cada resultado incluye estado, tipo de regla, prioridad máxima, URL, prueba, fecha, acción base y referencia.
6. Demanda: agrupación de variantes, filtros comerciales, marca, segmentos, periodos y procedencia. La cualificación semántica con IA genera propuestas revisables.
7. Motor económico puro: entradas → cálculo versionado → escenarios y cohortes. Ninguna llamada de IA ejecuta las multiplicaciones del embudo.
8. Fase 2: selección de evidencias, minimización de datos, respuesta estructurada, validación de referencias/prioridad/cifras y persistencia del análisis.
9. Informe por código con incorporación del análisis validado y exportación del expediente.

## Límites de rastreo

| Perfil | URLs de contenido | Peticiones HTTP totales | Renders máximos | Tiempo HTTP/navegador | Bytes expandidos |
|---|---:|---:|---:|---:|---:|
| lite | 3 | 20 | 0 | 90 s | 10 MiB |
| standard | 20 | 100 | 4 | 600 s | 100 MiB |
| extended | 80 | 350 | 12 | 1.800 s | 300 MiB |

Un segundo de separación entre solicitudes del mismo origen. Límite de cinco redirecciones antes del sexto destino; se distingue bucle de agotamiento de saltos. Las respuestas con error comprobable se confirman con otra petición y ambos intentos consumen presupuesto. Robots y sitemaps también consumen presupuesto. Se conservan como máximo 2.000 URLs pendientes y cinco archivos sitemap. Un documento se limita a 2 MiB expandidos; un robots a 512.000 bytes.

Los renders usan el mismo transporte y presupuesto de bytes/peticiones. Se bloquean envíos POST, WebSockets, service workers, medios y destinos no públicos. Los recursos que no se pudieron observar se anotan. El navegador no navega directamente a un destino de red saltándose el transporte; las peticiones interceptadas se resuelven con el cliente seguro y se entregan al navegador. Se utiliza una sesión de navegador independiente, sin credenciales de usuario.

La opción de enlaces externos comprueba hasta cinco destinos públicos con robots y GET; está desactivada en exploración. PageSpeed es un módulo posterior y explícito: hasta dos llamadas en estándar o seis en ampliado, con timeout individual y consumo registrado. Su tiempo se suma al rastreo; no está incluido en la duración del bloque HTTP/navegador.

Las solicitudes HTTP resuelven y validan IPs públicas en el conector que establece la conexión; no se hace una validación DNS independiente seguida de una resolución insegura. Las IPs literales se validan antes de que aiohttp pueda omitir el resolutor. El cliente no utiliza proxies heredados del entorno. IPv4 privada, loopback, link-local, IPv6 local y direcciones reservadas se rechazan. No se permite introducir puertos arbitrarios, credenciales en URL ni esquemas distintos de HTTP/HTTPS.

La decodificación gzip/deflate limita la expansión por bloque. Formatos de compresión no soportados quedan incompletos y no producen comprobaciones DOM. XML usa defusedxml. Las páginas y los textos extraídos llevan límites explícitos. El HTML inicial completo dentro del límite se conserva en `html_gzip_base64` (gzip + Base64), para inspección del expediente fuera de la IA.

## Estados

- `pass`: la comprobación se resolvió sin activar su condición dentro de la muestra observada.
- `fail`: defecto o umbral determinista activado y respaldado por los datos requeridos.
- `warning`: condición heurística activada; requiere interpretar contexto.
- `observed`: observación informativa, sin penalización automática.
- `unknown`: falta un prerrequisito, hay bloqueo, error de medición, truncamiento o falta de fuente.
- `not_applicable`: el tipo de contenido o la configuración hace que la regla no corresponda.

No se crea una puntuación global SEO sumando observaciones. Los resultados por URL no son problemas comerciales independientes. El motor económico calcula por demanda/segmento; no multiplica el valor de un segmento por cada incidencia técnica.

## Fuentes y observaciones condicionales

NET-01 conserva como desconocido un error de resolución que no acredita NXDOMAIN en dos consultas; la implementación no etiqueta una empresa como cerrada por un timeout DNS. NET-03 solo calcula vencimiento si el transporte expone el certificado. NET-05 requiere mensajes de bloqueo de mixed content del navegador. IMG-06 requiere un elemento LCP real del observador. INP de campo solo se acepta como dato propio de CrUX, nunca se sustituye por TBT.

La comparación de sedes, la correspondencia de entidades con contenido visible y los requisitos de un tipo de datos estructurados dependen de evidencia adicional explícita. El importador admite:

- `schema_rules`: tipo, propiedades requeridas, URL de fuente, fecha de verificación y validez del ruleset. Un ruleset vencido no se aplica. Es responsabilidad de quien lo importa acreditar sus requisitos y fuente.
- `entity_comparisons`: URL, `entity_id`, campo, valor de marcado, valor visible, confirmación de identidad y fuente. Se normalizan y comparan valores; el sistema no inventa la correspondencia de entidades.
- `location_contacts`: URL, sede confirmada, clase de contacto, valor y fuente. Diferencias normalizadas generan una señal contextual, no prueban teléfonos erróneos.
- `performance`: medidas de campo por URL y dispositivo, periodo y suficiencia de muestra. Datos de origen o sin muestra suficiente se conservan separadamente y no se atribuyen a cada URL.
- `search_console`, `indexation`, `backlinks`, `local`: exportaciones normalizadas, con fuente y fecha del lote.

Las medidas de laboratorio y campo conservan procedencia por métrica. Importar CrUX no cambia la procedencia de un LCP de Lighthouse anterior. El importador crea otro `audit_id`, enlazado mediante `parent_audit_id`; conserva intacto el expediente anterior y no reutiliza una interpretación IA como si analizara las pruebas nuevas.

## Contratos principales

Los modelos Pydantic están en `models.py`. Rechazan propiedades desconocidas y números no finitos. Los esquemas exportados están en `docs/schemas`.

| Contrato | Campos principales |
|---|---|
| LeadInput | nombre, URL, sector, país, idioma, modelo B2B/B2C/mixto, servicios, exclusiones, mínimo, notas e intención indexable por URL. |
| AuditInput | perfil, render, rendimiento, comprobación de enlaces externos. |
| MarketInput | consultas, grupo compartido, segmento, volumen nullable, estado de encaje, peso supuesto, motivo, fuente, periodo, geografía, marca y revisión de solapamiento. |
| Serp | consulta, geografía, idioma, dispositivo, fecha, fuente y resultados con posición/URL/tipo. |
| Scenario | nombre, moneda, tasas por segmento, demoras, estacionalidad, horizonte y costes. |
| ExternalInput | fuente, fecha, mediciones y observaciones adicionales. |
| AIOutput | resumen, acciones, evidencias citadas, prioridades, criterios de aceptación, limitaciones y referencias a cálculos. |
| FitOutput | propuestas por grupo con estado, motivo y fragmento de ficha comercial. |

Paquete de auditoría guardado:

```text
version, audit_id, lead,
crawl: {root, pages, robots, sitemaps, warnings, scope, usage, dates},
external,
market,
findings[]
```

Cada `finding` incluye `id`, `rule_id`, `url`, `state`, `priority`, `kind`, `category`, `title`, `detail`, `guard`, `action`, `source_url`, `observed_at` y `page_id`.

Paquete de entrada IA: versión, identificador, alcance, ficha comercial limitada, selección de evidencias, fragmentos de páginas, cálculos referenciables, limitaciones y número de evidencias omitidas. Se priorizan fallos y advertencias; se seleccionan como máximo dos ejemplos por regla. La carga se limita a 24.000 bytes UTF-8 mediante eliminación de elementos completos, sin cortar JSON. El catálogo y el HTML bruto no se envían al modelo. Se minimizan emails y teléfonos. El proveedor informa del consumo real de tokens; bytes y tokens son unidades distintas.

La salida IA tiene un máximo de ocho acciones. Sus evidencias deben existir y corresponder a fallos o señales. No puede subir la prioridad máxima ni citar cálculos ajenos al paquete. Las cifras numéricas libres en la narrativa se rechazan: el documento inserta las cifras mediante código. El informe requiere revisión humana para valorar la interpretación semántica; estos controles no prueban automáticamente la verdad de cualquier frase redactada por un modelo.

## Persistencia y reproducibilidad

Tablas: `leads`, `audits`, `markets`, `serps`, `scenarios`, `costs`, `settings`, `sessions`. Leads únicos por dominio normalizado. Operaciones SQL parametrizadas. Contraseñas con PBKDF2 y sal aleatoria; sesiones opacas cuyo hash se almacena con caducidad. Cookies HttpOnly/SameSite, comprobación de origen, límite de cuerpo y bloqueo de intentos de acceso repetidos.

Un escenario guarda sus entradas y resultados, fecha, identificador y ficha comercial usada al guardarlo. Modificar demanda no reescribe escenarios antiguos. El cálculo es reproducible a partir de su `inputs`; `calculation_id` identifica entradas y versión del modelo, mientras `scenario_id` identifica la versión guardada de una empresa.

La base está en `DATA_DIR`, por defecto `./data`. Docker la ubica en `/data`. No se comparte entre organizaciones: esta aplicación es un espacio privado de un administrador. El despliegue multiorganización requeriría tenant IDs, permisos y separación de secretos/datos a nivel de todas las consultas.

## API

El contrato completo está en `docs/schemas/openapi.json` y en `/openapi.json` después de iniciar sesión. No depende de una interfaz de documentación descargada de un CDN.

Grupos principales: `/api/auth`, `/api/leads`, `/api/audits`, `/api/catalog`, `/api/connections`, `/api/costs`, `/api/discover`, `/api/validate`. El alta y la importación no inician contactos comerciales con terceros. Los exports se generan al solicitarlos.

## Operación pendiente para un servicio público

Antes de ofrecerlo a clientes externos: validar proveedores en vivo, calibrar tasas/CTR con datos propios, determinar política de retención, configurar HTTPS y copias, medir cargas reales y revisar aislamiento. Sin Docker disponible en el entorno de autoría, se ha entregado su configuración sin afirmar que se haya construido allí. El backend y la interfaz se ejecutaron directamente durante la validación.
