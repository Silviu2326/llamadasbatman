# Growth Hub: captación, nutrición, ventas y fidelización

## Propósito

Growth Hub es la capa operativa que une la captación de demanda, la nutrición,
la conversión comercial y la retención. No sustituye a los módulos ya
existentes: los conecta en un único espacio de trabajo y permite guardar cada
iniciativa como un programa de la organización.

## Capacidades incluidas

| Área | Programas que se pueden crear | Resultado esperado |
| --- | --- | --- |
| Captación | Lead magnet, formulario o popup | Obtener consentimiento y generar un lead atribuible. |
| Newsletter | Newsletter editorial | Planificar un envío recurrente y dirigirlo a Email marketing. |
| Automatizaciones | Journey de automatización | Diseñar el objetivo y enlazarlo al flujo versionado que ejecuta el CRM. |
| Ventas | Secuencia comercial, propuesta o agenda | Convertir intención en una reunión, oportunidad o cierre. |
| Fidelización | NPS, referidos o salud de cliente | Detectar riesgo, solicitar recomendación y abrir una acción de seguimiento. |

## Relación con los módulos existentes

- **Landings & webs** sigue publicando las páginas y recogiendo atribución.
- **Funnels** conserva las métricas de visitas, leads, contactos y reuniones.
- **Email marketing** conserva la audiencia, plantilla, remitente, calendario,
  validación y publicación real de campañas Mautic.
- **Automatizaciones** ejecuta acciones versionadas e idempotentes.
- **Leads, Pipeline, Reuniones e Inbox** siguen siendo la fuente de verdad del
  trabajo comercial.

Los programas del Growth Hub guardan su configuración y estado, pero no
duplican leads, oportunidades ni entregas de email. Para hacer efectivo un
programa se enlaza a esos módulos mediante su configuración y las rutas de
acción de la interfaz.

## Tipos y configuración mínima

Cada programa tiene `name`, `type`, `status`, una descripción, configuración
JSON validada y marcas de creación/actualización. Los estados operativos son
`draft`, `active`, `paused`, `scheduled`, `completed` y `archived`.

La configuración se mantiene deliberadamente flexible para poder evolucionar
sin introducir una tabla por experimento. Los campos de referencia que deben
validarse antes de una integración externa son:

- `campaignId`, `landingSlug` o `automationId` cuando exista un módulo interno
  asociado;
- `audienceDefinition` y categoría de consentimiento para newsletters;
- `bookingUrl` o proveedor de agenda para agenda pública;
- responsable y reglas de prioridad para secuencias comerciales;
- `metric`, `threshold` y acción de recuperación para salud de cliente.

## Seguridad y operación

- Todas las consultas y mutaciones se filtran obligatoriamente por `orgId`.
- Los perfiles `admin` y `agent` pueden crear, modificar, activar y archivar;
  los perfiles de lectura solo consultan.
- Archivar es reversible a nivel de datos: no se borra una iniciativa que pueda
  explicar atribución, actividad o consentimiento histórico.
- Los conectores de calendario, webinar y firma digital son configurables: no
  se simula un envío externo ni una reserva hasta que el proveedor esté
  conectado y confirme el resultado.

## API

La superficie autenticada es `/api/growth-programs`:

- `GET /` lista los programas no archivados de la organización actual;
- `GET /overview` expone totales reales por estado y tipo;
- `POST /` crea un programa;
- `GET /:id` y `PUT|PATCH /:id` consultan o actualizan un programa propio;
- `POST /:id/archive` lo archiva sin destruir su trazabilidad.

## Siguiente incremento recomendado

1. Conectar el selector de cada programa con objetos reales de landings,
   campañas de Mautic y automatizaciones.
2. Añadir webhooks de proveedor para asistencia a webinar, reserva y firma.
3. Convertir los resultados NPS, referidos y health score en eventos canónicos
   para Automatizaciones y en actividades de CRM.
4. Construir atribución multitáctil a partir de `AcquisitionEvent`, campañas de
   email y oportunidades cerradas.
