# Guía de evolución de la plataforma VozIA

Esta carpeta define cómo ampliar VozIA con Captación, Conversación, Nutrición, Ventas, Operaciones, IA, Analítica y Sistema sin convertir el producto en cientos de páginas aisladas.

La guía está escrita para un agente ejecutor (por ejemplo, DeepSeek) que tenga que implementar la arquitectura sobre el repositorio actual.

## Orden de lectura

1. `00-vision-y-principios.md`: objetivo de producto y límites.
2. `01-arquitectura-de-navegacion.md`: menú, módulos y rutas.
3. `02-modelo-de-objetos.md`: entidades compartidas y relaciones.
4. `03-guia-de-implementacion.md`: archivos concretos a crear o modificar.
5. `04-plan-por-fases.md`: orden seguro de ejecución.
6. `05-criterios-de-aceptacion.md`: definición de terminado.
7. `06-instrucciones-para-agente-ejecutor.md`: contrato operativo para implementar.
8. `07-especificacion-de-modulos.md`: alcance funcional detallado de cada área.
9. `08-contratos-api.md`: convenciones HTTP, paginación, filtros, errores y eventos.
10. `09-permisos-seguridad-y-multi-tenant.md`: aislamiento, roles y secretos.
11. `10-patrones-ux-y-estados.md`: comportamiento visual y estados que debe cubrir cada pantalla.
12. `11-migracion-y-compatibilidad.md`: cómo evolucionar las rutas actuales sin romper usuarios.
13. `12-pruebas-y-observabilidad.md`: pruebas, logs, métricas y alertas.
14. `13-prompt-operativo-deepseek.md`: prompt reutilizable para delegar una fase a otro agente.

## Regla principal

No crear una página por cada sustantivo del producto. Crear módulos con una lista, una ficha contextual, pestañas y componentes reutilizables.

Ejemplo: Presupuestos, contratos, cobros y facturas deben aparecer como pestañas o paneles relacionados dentro de una oportunidad o cliente. Solo tendrán una vista global cuando exista una necesidad real de gestión masiva.

## Estado de esta documentación

Es una especificación de producto e implementación. No añade funcionalidades por sí sola. El agente ejecutor debe aplicar las fases y verificar cada criterio antes de continuar.

## Cómo usarla en una sesión de implementación

El agente no debe intentar implementar toda la plataforma en una sola pasada. Debe seleccionar una fase y uno o dos módulos, leer los documentos generales y producir primero un plan de archivos. Después implementa, prueba y deja un informe de cambios.

La unidad recomendada de trabajo es:

```text
1 módulo + 1 flujo principal + 1 migración de datos + pruebas del flujo
```

Ejemplo correcto: `Formularios` con crear formulario, publicar formulario, recibir respuesta y convertir respuesta en lead.

Ejemplo incorrecto: crear simultáneamente SEO, WhatsApp, facturación y Centralita solo con pantallas mock.
