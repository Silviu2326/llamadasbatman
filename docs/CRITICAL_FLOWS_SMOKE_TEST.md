# Smoke test de flujos críticos

`scripts/critical-flows-smoke.mjs` valida una API desplegada usando únicamente lecturas autenticadas. No crea campañas, leads, llamadas, reuniones, tareas ni cambios de pipeline. Esto permite detectar un despliegue incompleto sin producir datos de negocio.

## Ejecución

```powershell
$env:SMOKE_BASE_URL = 'https://api.staging.example.com'
$env:SMOKE_BEARER_TOKEN = '<token de un usuario de staging>'
$env:SMOKE_CAMPAIGN_ID = '<id opcional de una campaña de staging>'
node scripts/critical-flows-smoke.mjs --strict
```

El resultado no imprime el token ni URLs con credenciales. Un `401/403` queda como `blocked`; con `--strict` también hace fallar el proceso.

## Qué comprueba

- Ads, dashboard, actividad y atribución agregada.
- Organic Leads, proyecto e integraciones.
- Destino de campañas para Prospect Finder.
- Knowledge Base, agentes, llamadas, tareas y pipeline.
- Readiness del backend y, si está protegido/configurado, worker de fondo.

## Lo que no sustituye

La búsqueda/importación de Prospect Finder y los POST de leads, reuniones, campañas, llamadas o movimientos de pipeline son mutaciones con coste y quedan fuera a propósito. Para declarar producción hay que ejecutar además una suite E2E sobre un workspace de staging aislado, con fixtures y credenciales reales de prueba, que verifique:

1. Ads → landing → lead → contacto → reunión → oportunidad → venta → atribución.
2. Organic → oportunidad → landing/contenido → lead → reunión → venta.
3. Prospect Finder → enriquecimiento/importación → secuencia → respuesta → reunión.
4. Knowledge Base → playbook/agente → llamada → resumen/tarea → cierre.

Esa suite debe comprobar también webhooks, workers, reintentos, idempotencia, compensación y aislamiento entre organizaciones. No se debe activar una campaña ni enviar contactos desde este smoke test.
