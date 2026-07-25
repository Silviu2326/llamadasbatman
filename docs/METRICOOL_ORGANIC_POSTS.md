# Posts orgánicos con Metricool

La creación de posts orgánicos usa Metricool. Postiz queda disponible únicamente para compatibilidad con consumidores antiguos de `/api/postiz`.

## Configuración

En `backend/.env` deben configurarse:

```text
METRICOOL_BASE_URL=https://app.metricool.com/api
METRICOOL_USER_TOKEN=
METRICOOL_USER_ID=
METRICOOL_BLOG_ID=
METRICOOL_TIMEZONE=Europe/Madrid
METRICOOL_APP_URL=https://app.metricool.com
```

Metricool requiere un token API, `userId` y `blogId`. El token solo se usa en backend mediante el header `X-Mc-Auth`; nunca se envía al navegador.

## Flujo

- `GET /api/metricool` comprueba la configuración y devuelve las marcas disponibles.
- `GET /api/metricool/analytics` consulta las publicaciones de los últimos 30 días.
- `POST /api/metricool/posts` crea un borrador por canal en `/v2/scheduler/posts`.
- Cada post conserva la atribución de campaña con `utm_medium=organic_social`.
- La interfaz enlaza con Metricool para revisar el calendario; no asume que Metricool admita iframe.

La publicación real requiere que la cuenta Metricool tenga acceso API (planes Advanced o Custom) y que los canales estén conectados en la marca seleccionada.
