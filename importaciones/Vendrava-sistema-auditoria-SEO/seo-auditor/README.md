# Vendrava · Auditorías SEO

Aplicación ejecutable para gestionar leads, auditar webs y convertir demanda cualificada en escenarios comerciales. Implementación para un administrador, con React + TypeScript, FastAPI, SQLite y un worker persistente. Interfaz y documentación en español.

## Arrancar en Windows

1. Descomprime el ZIP completo.
2. Instala y abre Docker Desktop, si todavía no lo tienes.
3. Ejecuta **ARRANCAR-WINDOWS.bat** dentro de `seo-auditor`.
4. Abre **http://localhost:8787** y crea tu contraseña de administrador de al menos 12 caracteres.
5. Pulsa **Cargar demostración** para recorrer el sistema con datos ficticios, o **Nuevo lead** para introducir una web real.

La primera construcción descarga Python, Node, Chromium y las dependencias. El archivo de arranque crea `.env` desde `.env.example` sin claves. Los datos permanecen en el volumen Docker `auditor_data` al reiniciar. El puerto se publica únicamente en el propio ordenador.

En Linux/macOS: `./arrancar.sh`. Arranque manual con Docker:

```sh
cp .env.example .env
docker compose up --build -d
```

Para detener sin borrar datos: `docker compose stop`. Para ver errores: `docker compose logs --tail=100 auditor`. **No uses `docker compose down -v` si quieres conservar los datos.**

## Lo que puedes hacer

| Área | Funcionamiento |
|---|---|
| Leads | Alta, ficha comercial, filtro por empresa/dominio, CSV de hasta 100 filas, deduplicación de dominios. Edición y borrado disponibles en API; edición también en el panel. |
| Descubrimiento | Consulta de posibles empresas mediante SERP de DataForSEO; eliges qué candidatos añadir. |
| Pipeline | Auditorías individuales o de la lista visible; cola persistente, historial, estados, cancelación y detección de trabajos interrumpidos. |
| Fase 1 | Rastreo HTTP, TLS, robots, sitemap, enlaces, extracción HTML, 97 reglas y evidencias por URL. Navegador opcional, HTML original comprimido en el expediente y render separado. |
| Demanda | Importación CSV/JSON, inclusión/exclusión/ambigüedad, pesos explícitos, marca, segmentos, geografía, periodo y grupos de volumen compartido. |
| Cualificación IA | Propone encaje usando la ficha comercial; sus propuestas se revisan y se aplican al borrador antes de guardar. |
| Competidores | Importación o consulta de posiciones con fecha, dispositivo, ubicación y clasificación de competidor. Estimación descriptiva de clics separada de ingresos. |
| Calculadora | CTR actual/objetivo, sesiones por clic, contacto, presupuesto, cierre, ticket, margen, capacidad, estacionalidad, retrasos, crecimiento gradual, retención y costes. |
| Escenarios | Versiones inmutables con entradas, ficha comercial, fórmula, identificador de cálculo y serie mensual por cohortes. |
| Fase 2 | Interpretación con OpenAI, salida estructurada, referencias a evidencias, máximo ocho acciones y validación antes de guardar. |
| Informe | HTML descargable con narrativa comercial y evidencias; se puede imprimir a PDF desde el navegador. Exportación completa JSON e inspección del paquete que recibirá la IA. |
| Fuentes propias | Importación normalizada de CrUX, Search Console, indexación, backlinks, ficha local, reglas de marcado y comparaciones de entidades. Crea una revisión del expediente sin sobrescribir el anterior. |
| Consumo | Registro de intentos, tokens informados y costes que proporciona el proveedor; tope diario de llamadas. |

Los 97 identificadores del catálogo se evalúan. **No todos pueden producir un diagnóstico en cualquier web:** el estado `unknown` explica el dato o prerrequisito que falta. Una regla que necesita CrUX no se resuelve con Lighthouse; una identidad de sede no confirmada no genera una incoherencia comercial. El código de condiciones está en `backend/app/rules.py` y la definición completa en `backend/app/catalog.json`.

## Primer recorrido real

1. Crea un lead con nombre y URL. Abre el lápiz junto al nombre para definir servicios, mínimos, compradores excluidos y URLs que deben ser indexables.
2. **Auditar web** → perfil Exploración. Las comprobaciones y pruebas aparecen al terminar. Puedes seguir trabajando mientras la cola procesa otras empresas.
3. En **Demanda**, carga tus consultas con `examples/demanda.csv` como referencia de formato. Sustituye los números ficticios por datos de tu proveedor. Revisa las variantes y las exclusiones y guarda.
4. En **Competidores**, importa observaciones en el formato de `examples/serp.json`, o consulta el proveedor conectado.
5. En **Calculadora**, ajusta las tasas del negocio. Los segmentos deben coincidir con los identificadores de Demanda. Calcula y guarda un escenario.
6. **Generar análisis** ejecuta la fase IA si la conexión está configurada. El informe por código está disponible aunque no utilices IA.
7. En **Informe**, descarga HTML o el expediente JSON. Para PDF, abre el HTML y usa Imprimir → Guardar como PDF.

Los dominios `.example` de la demostración son ficticios y no se rastrean. La demostración nunca se presenta como una auditoría de Cartonajes Mora ni de otra empresa real.

## Conexiones

Todas las claves se configuran **en `.env`, en tu ordenador/servidor**, y después se reinicia el servicio: `docker compose up -d --force-recreate`. No se introducen claves en el código del navegador.

| Variable | Uso |
|---|---|
| `OPENAI_API_KEY` | Clave de tu cuenta de OpenAI. |
| `OPENAI_MODEL` | Identificador de un modelo de tu cuenta compatible con Responses API y Structured Outputs. |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Credenciales de la API de DataForSEO. |
| `PAGESPEED_API_KEY` | Clave de Google habilitada para PageSpeed Insights. |
| `ENABLE_PAID_PROVIDERS=true` | Habilita las llamadas externas explícitas. Desactivadas de inicio. |
| `MAX_PROVIDER_CALLS_PER_DAY` | Tope global de intentos externos en cada día UTC; por defecto 100. |
| `COOKIE_SECURE=true` | Usar cuando se sirve mediante HTTPS. Para localhost HTTP se mantiene false. |
| `ALLOWED_ORIGINS` | Orígenes autorizados para solicitudes de modificación. |

El tope de llamadas no es un límite garantizado de euros. No se muestra un coste desconocido como cero. Las llamadas SERP usan una tarea por petición y el número de palabras clave está acotado.

Sin claves funcionan el panel, la persistencia, las importaciones, el rastreo HTTP, el navegador instalado, las reglas deterministas, la calculadora y la exportación. Las fuentes conectadas requieren sus propias cuentas, acceso, saldo y cuotas. El acceso OAuth nativo a Search Console/Analytics y la sincronización automática con un CRM no se incluyen: los datos propios entran mediante importaciones y tasas documentadas.

## Cómo se calculan las cifras

- Las variantes con un mismo `group_id` se suman una sola vez. Si discrepan en volumen, fuente o clasificación, se rechaza el cálculo.
- Se excluyen consultas de marca de la captación nueva. Las consultas ambiguas usan un peso declarado como supuesto.
- No se mezclan países o periodos incompatibles dentro de un mercado. El periodo de un conjunto de volúmenes históricos identifica la edición del dataset; no convierte una media histórica en una medición de ese mes.
- Se resta CTR actual de CTR objetivo. Si el actual falta, se declara expresamente una base cero hipotética.
- Se conservan resultados negativos: una hipótesis peor no se convierte en una oportunidad positiva.
- Cada cohorte se cierra a mitad de mes; el primer mes factura medio periodo. La retención anual se convierte en supervivencia mensual.
- Se distinguen valor anualizado, ingresos dentro del primer año, ingresos de las cohortes del primer año dentro del horizonte e ingresos de todas las cohortes del horizonte.
- El coste de esperar compara el plan con otro desplazado tres meses, con el mismo horizonte. No multiplica búsquedas por ticket.
- Los ingresos se presentan como escenarios. La contribución y el ROI solo se calculan si se proporciona margen para todos los segmentos.

Prueba del ejemplo industrial, sin bajas ni retrasos: 2.250 × 12 % × 2 % × 50 % × 20 % × 12 = **6,48 clientes/año**, **226.800 € anualizados** y **113.400 € dentro del primer año** con cierres repartidos uniformemente. Con un CTR actual del 1 %, la oportunidad anualizada incremental es 207.900 €. La demo inicia una hipótesis de retención del 85 %: su calendario incorpora ese supuesto.

La curva CTR de competidores es una **simulación histórica SISTRIX 2020**; no es una medición actual del tráfico de cada dominio. Fuera de las posiciones con curva no se asigna cero. No se calculan ni atribuyen ventas reales a competidores.

## Desarrollo sin Docker

Necesitas Python 3.12 y Node 22. El ZIP ya incluye `frontend/dist`, por lo que puedes ejecutar el backend sin recompilar la interfaz.

```sh
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements-lock.txt
playwright install chromium
# Linux puede necesitar: playwright install --with-deps chromium
# Copia ../.env.example a backend/.env para desarrollo y completa lo necesario.
uvicorn app.main:app --host 127.0.0.1 --port 8787 --workers 1
```

Para modificar el panel, en otra terminal:

```sh
cd frontend
npm ci
npm run dev
```

Abre `http://localhost:5173`. Vite redirige `/api` al backend. Para actualizar el panel servido por Python: `npm run build` y reinicia el backend si estaba arrancado antes de crear `dist`.

`requirements.txt` define rangos compatibles. `requirements-lock.txt` recoge las versiones usadas en la validación. El Dockerfile usa ese archivo fijo. `package-lock.json` fija las dependencias de frontend.

## Pruebas y límites de validación

```sh
cd backend
python -m pytest -q
```

La prueba de render real se activa con `BROWSER_EXECUTABLE` apuntando a Chromium. En Docker puedes obtener la ruta con `python -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); print(p.chromium.executable_path)"`.

Se validaron **40 pruebas del backend**, incluida la ejecución de JavaScript en Chromium con respuestas controladas, y la compilación TypeScript/Vite. Cubren reglas, robots, redirecciones, DNS mixto, IPs privadas, XML, duplicados de demanda, fórmulas, cohortes, negativos, capacidad, referencias IA, autenticación, CSV, cola, revisión inmutable y adaptadores mediante transporte simulado.

Se recorrió el panel en Chromium a 1536 × 1024 y 390 × 844: acceso, demostración, evidencias, modificación y guardado de ticket, descarga de informe, alta de lead, catálogo, conexiones y cierre de sesión. Sin errores JavaScript ni desbordamiento global en móvil. Las tablas y pestañas tienen su propio desplazamiento horizontal.

**Pendiente de validación en tu equipo:** llamadas reales con tus credenciales, rastreo de dominios públicos desde tu red y construcción de la imagen Docker. El entorno de desarrollo no resolvía DNS externo y no tenía Docker; estas limitaciones no se han ocultado mediante datos simulados presentados como reales. El navegador local se verificó con Playwright porque no había conexión Browser disponible.

## Persistencia y mantenimiento

SQLite utiliza WAL y claves foráneas. Ejecuta **un único proceso Uvicorn**: la cola y el reinicio de trabajos están diseñados para un worker de aplicación. El worker lee trabajos de SQLite y marca como interrumpidos los que quedaron activos tras reiniciar. Los interrumpidos se pueden repetir; los trabajos pendientes continúan en la cola.

- Exportación por empresa: botón de expediente JSON.
- Copia consistente de toda la base: `python -m app.backup ruta/destino.db` desde backend, o el mismo comando mediante `docker compose exec auditor` hacia `/data/backups/copia.db`.
- Las copias completas contienen datos y hashes de contraseñas y sesiones locales. Guárdalas con el mismo cuidado que la base.
- No se ejecuta borrado automático de históricos. Define tu política de conservación antes de usarlo como servicio para terceros.
- El despliegue público requiere HTTPS, origen permitido, cookie segura y una revisión de operación. Esta entrega está preparada para un espacio privado de un administrador; el aislamiento de múltiples organizaciones, roles y facturación SaaS requiere trabajo adicional.

## Archivos principales

- `backend/app/crawler.py`: transporte público, robots, sitemap, HTML y navegador.
- `backend/app/rules.py` / `catalog.json`: evaluadores y reglas versionadas.
- `backend/app/economics.py`: cualificación, cohortes y comparación de visibilidad.
- `backend/app/analysis.py`: paquetes, llamadas IA y validadores.
- `backend/app/providers.py`: adaptadores y registro de consumo.
- `backend/app/main.py`: autenticación, API y aplicación.
- `backend/app/worker.py` / `db.py`: cola y persistencia.
- `backend/app/reports.py`: informe seguro generado por código.
- `frontend/src/features`: módulos de interfaz.
- `docs/ARQUITECTURA.md`: decisiones y contratos.
- `docs/schemas`: esquemas JSON y OpenAPI exportado.
- `examples`: formatos de importación con datos ficticios.

## Referencias de integración

- DataForSEO SERP Live: https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/
- DataForSEO volúmenes: https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/
- Google PageSpeed: https://developers.google.com/speed/docs/insights/v5/get-started
- OpenAI Responses: https://platform.openai.com/docs/api-reference/responses
- CTR histórico: https://www.sistrix.com/blog/why-almost-everything-you-knew-about-google-ctr-is-no-longer-valid/

Cada comprobación incluye su propia referencia en el catálogo. Los umbrales operativos del producto no se presentan como penalizaciones universales de Google.
