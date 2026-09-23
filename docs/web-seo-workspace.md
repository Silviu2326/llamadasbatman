# Web y SEO: revisión y mejora de webs

La ruta /captacion/convertir reúne tres vistas:
- Mi web: conexión, última revisión, vigilancia, hallazgos accionables y actividad.
- Páginas: URLs descubiertas en sitemap, páginas revisadas, redirecciones, exclusiones y detalle.
- Resultados: eventos recibidos, diagnóstico histórico y Search Console de la propiedad correspondiente.

## Operación
El alta de una conexión encola website.seo.audit. La revisión se guarda en Job y SeoReport; no depende del navegador. Cada 24 horas se programa otra revisión, teniendo en cuenta el último intento. Las conexiones desconectadas se excluyen. Los fallos se reintentan hasta dos intentos; la interfaz permite solicitar otra revisión.

El worker general (npm run worker en backend) incluye la vigilancia. Para ejecutar solo auditorías y propuestas Git, usar npm run worker:web-seo. En producción, compilar y ejecutar npm run start:web-seo bajo un supervisor; este proceso debe mantenerse activo. No es necesario ejecutar ambas variantes. La interfaz muestra vigilancia activa solo cuando recibe heartbeat del proceso.

No hay nueva migración: se reutilizan WebsiteConnection, Job, SeoReport, WebsiteChangeProposal y WorkerHeartbeat. Las auditorías técnicas automáticas no llaman al modelo de IA. El plan editorial se solicita aparte.

Las propuestas Git usan el conector existente y el trabajo web.git.proposal. El proceso dedicado también las ejecuta, pero solo después de que se soliciten desde la interfaz. No fusiona ni despliega automáticamente. La aprobación se hace en GitHub. WordPress conserva su editor existente.

## Cobertura y medición
- robots.txt, sitemap índices y mapas hijos del mismo dominio.
- Máximo 20 sitemaps, 2000 URLs descubiertas y 50 páginas leídas por revisión; hasta 4 lecturas simultáneas.
- Límites y exclusiones visibles. Una revisión parcial no equivale a haber auditado toda la web.
- Destinos públicos validados en cada redirección, máximo 5 saltos, 2 MB por respuesta y tiempo limitado.
- Títulos, descripciones, H1, imágenes, checklist técnico y Core Web Vitals cuando el proveedor dispone de datos.
- Sin eventos se muestra “sin datos”; conectar Git no equivale a instalar analítica.
- Search Console se acota a la propiedad que corresponde a la URL seleccionada. Las métricas de búsquedas no son estimaciones del modelo.

## Validación
Pruebas sin base de datos real:
node --import tsx --test src/__tests__/websiteSeo.offline.test.ts src/__tests__/websiteDetection.test.ts

La comprobación de navegador en scripts/web-seo-ui-check.cjs (con Playwright instalado o PLAYWRIGHT_MODULE apuntando a su módulo) usa respuestas simuladas para no crear cambios en repositorios reales. Comprueba pestañas, filtrado, apertura del editor, petición de propuesta, revisión y anchura móvil.
