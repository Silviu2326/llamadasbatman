# Servidor MCP de LlamadasRobin

Documento técnico y funcional del servidor MCP que conecta aplicaciones de inteligencia artificial con la API de LlamadasRobin.

## 1. Resumen

`llamadasrobin-mcp` es un servidor MCP independiente, escrito en TypeScript, que expone información de LlamadasRobin y un conjunto acotado de operaciones CRM de escritura protegida.

El servidor:

- No accede directamente a Prisma ni a la base de datos.
- No ejecuta llamadas, envía emails, envía WhatsApp ni inicia o pausa campañas.
- En modo normal solo realiza peticiones HTTP `GET`.
- En modo escritura realiza únicamente los `POST` y `PUT` documentados en este archivo.
- Delega autenticación, permisos, aislamiento por organización y auditoría en el backend de LlamadasRobin.
- Se comunica con el cliente MCP mediante `stdio` y JSON-RPC.
- Publica 78 herramientas de lectura por defecto y 22 herramientas de escritura opcionales.

## 2. Arquitectura

```text
Aplicación anfitriona de IA
ChatGPT · Claude · Cursor · Inspector
              │
              │ MCP / JSON-RPC por stdio
              ▼
      llamadasrobin-mcp
              │
              │ HTTP GET/POST/PUT + API key separada por modo
              ▼
      API de LlamadasRobin
              │
              ├── Autenticación y permisos
              ├── Organización y workspace
              ├── Servicios de negocio
              ├── Prisma / PostgreSQL
              ├── Twilio y proveedores
              └── Auditoría y observabilidad
```

El servidor MCP funciona como un adaptador. El modelo conoce las herramientas y sus esquemas; cuando decide utilizar una, el MCP llama a un endpoint autorizado del backend y devuelve el resultado estructurado.

## 3. Componentes del proyecto

```text
mcp-server/
├── src/
│   ├── index.ts              Arranque del servidor MCP y transporte stdio
│   ├── config.ts             Validación de variables de entorno
│   ├── callsrobin-client.ts  Cliente HTTP GET/POST/PUT
│   ├── tools.ts              Primer bloque de 25 herramientas
│   ├── extended-tools.ts     Bloque adicional de 50 herramientas
│   ├── write-tools.ts        20 herramientas CRM/prospección/operación de escritura protegida
│   └── intelligent-tools.ts  3 herramientas de lectura + 2 flujos inteligentes protegidos
├── test/
│   └── callsrobin-client.test.ts
├── .env.example              Plantilla de configuración local
├── package.json              Scripts y dependencias
├── package-lock.json         Versiones bloqueadas
├── tsconfig.json             Configuración TypeScript
├── README.md                 Guía rápida
└── SERVIDOR_MCP.md           Esta documentación
```

## 4. Tecnologías

- Node.js 20 o posterior.
- TypeScript.
- SDK `@modelcontextprotocol/server`.
- Zod 4 para validar los argumentos de las herramientas.
- `tsx` para desarrollo y ejecución directa de TypeScript.
- `fetch` nativo de Node.js para comunicarse con el backend.
- Transporte MCP `stdio`.

Dependencias principales definidas en `package.json`:

```json
{
  "@modelcontextprotocol/server": "^2.0.0",
  "zod": "^4.0.0"
}
```

## 5. Configuración

Copiar `.env.example` como `.env`:

```powershell
Copy-Item .env.example .env
```

Variables disponibles:

| Variable | Obligatoria | Descripción |
|---|---:|---|
| `CALLSROBIN_API_URL` | Sí | URL del backend, por ejemplo `http://localhost:3000` |
| `CALLSROBIN_API_KEY` | Sí | Clave de lectura de LlamadasRobin con prefijo `vk_` |
| `CALLSROBIN_WRITE_ENABLED` | No | `false` por defecto; activa las tools de escritura cuando vale `true` |
| `CALLSROBIN_WRITE_API_KEY` | Condicional | Segunda clave `vk_` con permisos de escritura; obligatoria si se activa el modo escritura |
| `CALLSROBIN_TIMEOUT_MS` | No | Timeout de cada petición; por defecto 15.000 ms |
| `CALLSROBIN_MAX_RESPONSE_BYTES` | No | Tamaño máximo de respuesta; por defecto 2.000.000 bytes |

Ejemplo:

```dotenv
CALLSROBIN_API_URL=http://localhost:3000
CALLSROBIN_API_KEY=vk_tu_clave_lectura
CALLSROBIN_WRITE_ENABLED=false
CALLSROBIN_WRITE_API_KEY=vk_tu_clave_escritura
CALLSROBIN_TIMEOUT_MS=15000
CALLSROBIN_MAX_RESPONSE_BYTES=2000000
```

La configuración valida que:

- La URL use `http` o `https`.
- La clave API exista.
- La clave API empiece por `vk_`.
- `CALLSROBIN_WRITE_ENABLED` sea `true` o `false`.
- Si la escritura está activada, exista una segunda clave API y empiece por `vk_`.
- Los timeouts y límites sean enteros positivos.

### Activar escritura

La escritura está desactivada por defecto. Para activarla:

```dotenv
CALLSROBIN_WRITE_ENABLED=true
CALLSROBIN_WRITE_API_KEY=vk_clave_con_permisos_de_escritura
```

La clave de escritura debe ser distinta de la clave de lectura. Si falta cualquiera de los dos controles, el proceso no registra herramientas de escritura o no arranca cuando la flag está activada.

## 6. Autenticación

La clave de lectura se envía en cada petición de lectura con:

```http
X-API-Key: vk_tu_clave
```

El backend también acepta la forma equivalente:

```http
Authorization: Bearer vk_tu_clave
```

La clave se crea desde el portal de desarrolladores de LlamadasRobin, normalmente en:

```text
/desarrolladores
```

La clave actúa con el rol de la cuenta que la crea. Para este MCP debe utilizarse una cuenta o rol con permisos de lectura. No se debe compartir una clave de administrador si no es necesario.

Cuando se activa la escritura, las operaciones `POST` y `PUT` utilizan exclusivamente `CALLSROBIN_WRITE_API_KEY`. La clave de lectura nunca se reutiliza automáticamente para escribir.

Prueba de autenticación:

```powershell
curl http://localhost:3000/api/developer/whoami `
  -H "X-API-Key: vk_tu_clave"
```

## 7. Ejecución

### Desarrollo

```powershell
cd mcp-server
npm install
Copy-Item .env.example .env
# Editar .env
npm run dev
```

El script de desarrollo ejecuta:

```text
node --env-file=.env --import=tsx src/index.ts
```

### Producción local

```powershell
npm run build
npm start
```

Esto compila `src/` en `dist/` y ejecuta:

```text
node --env-file=.env dist/index.js
```

### Inspector MCP

```powershell
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

El Inspector permite comprobar que aparecen las herramientas y probar sus esquemas sin conectar todavía un cliente de IA de producción.

## 8. Conexión desde un cliente MCP

El cliente debe iniciar el proceso compilado y proporcionarle las variables de entorno.

Ejemplo conceptual:

```json
{
  "mcpServers": {
    "llamadasrobin": {
      "command": "node",
      "args": ["E:/exclusion/silxarcrm/llamadasrobin/mcp-server/dist/index.js"],
      "env": {
        "CALLSROBIN_API_URL": "http://localhost:3000",
        "CALLSROBIN_API_KEY": "vk_tu_clave"
      }
    }
  }
}
```

La sintaxis exacta puede cambiar según el cliente MCP, pero siempre debe ejecutarse `dist/index.js` y deben estar disponibles las dos variables obligatorias.

## 9. Cómo funciona una llamada a una herramienta

1. El cliente MCP inicia `llamadasrobin-mcp`.
2. El servidor anuncia sus capacidades mediante `initialize`.
3. El cliente solicita el catálogo mediante `tools/list`.
4. El modelo elige una herramienta y envía argumentos JSON.
5. Zod valida los argumentos.
6. Si es una herramienta de escritura, exige `confirm: true` después de una confirmación explícita del usuario.
7. `CallsRobinClient` construye una URL segura y añade la API key adecuada al modo.
8. LlamadasRobin valida la identidad, la organización, los permisos y los entitlements.
9. El backend responde con JSON.
10. El MCP devuelve:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{...resultado JSON...}"
    }
  ],
  "structuredContent": {
    "data": {}
  }
}
```

El canal `stdout` está reservado para JSON-RPC. Los mensajes de diagnóstico se escriben en `stderr` para no corromper el protocolo.

## 10. Catálogo completo de herramientas

Todas las herramientas de esta sección son de solo lectura.

### 10.1 Leads

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `listar_leads` | `GET /api/leads` | `campaignId`, `status`, `search`, `source`, `page`, `limit` |
| `obtener_lead` | `GET /api/leads/:id` | `leadId` |
| `obtener_timeline_lead` | `GET /api/leads/:id/timeline` | `leadId` |
| `listar_actividades_lead` | `GET /api/leads/:id/activities` | `leadId`, `page`, `limit` |
| `listar_propietarios_leads` | `GET /api/leads/owners` | Ninguno |
| `listar_importaciones_leads` | `GET /api/leads/imports` | `page`, `limit` |
| `obtener_importacion_leads` | `GET /api/leads/imports/:id` | `importId` |
| `obtener_consentimiento_lead` | `GET /api/leads/:id/consent` | `leadId` |
| `obtener_auditoria_lead` | `GET /api/leads/:id/audit` | `leadId` |
| `obtener_historial_auditoria_lead` | `GET /api/leads/:id/audit-history` | `leadId` |
| `listar_notas_lead` | `GET /api/leads/:id/notes` | `leadId` |
| `listar_archivos_lead` | `GET /api/leads/:id/files` | `leadId` |
| `obtener_historial_email_lead` | `GET /api/leads/:id/email-history` | `leadId` |
| `obtener_preferencias_lead` | `GET /api/leads/:id/preferences` | `leadId` |

### 10.2 Llamadas y voz

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `listar_llamadas` | `GET /api/calls` | `agentId`, `campaignId`, `status`, `outcome`, `dateFrom`, `dateTo`, `page`, `limit` |
| `obtener_llamada` | `GET /api/calls/:id` | `callId` |
| `obtener_evaluacion_llamada` | `GET /api/calls/:id/evaluation` | `callId` |
| `obtener_metricas_voz` | `GET /api/calls/voice-metrics` | `from`, `to` |
| `obtener_traza_llamada` | `GET /api/calls/:id/trace` | `callId`, `limit` |
| `obtener_metricas_llamada` | `GET /api/calls/:id/metrics` | `callId` |
| `listar_notas_llamada` | `GET /api/calls/:id/notes` | `callId` |
| `listar_tareas_llamada` | `GET /api/calls/:id/tasks` | `callId` |
| `listar_llamadas_en_directo` | `GET /api/dashboard/live` | Ninguno |

### 10.3 Agentes

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `listar_agentes` | `GET /api/agents` | Ninguno |
| `obtener_estadisticas_agente` | `GET /api/agents/:id/stats` | `agentId` |

### 10.4 Campañas

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `listar_campanas` | `GET /api/campaigns` | `status`, `search`, `page`, `limit` |
| `obtener_metricas_campana` | `GET /api/campaigns/:id/stats` | `campaignId` |

### 10.5 Dashboard

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `obtener_resumen_dashboard` | `GET /api/dashboard/stats` | `days`: 7, 30 o 90 |
| `listar_actividad_dashboard` | `GET /api/dashboard/activity` | `limit` |

### 10.6 Pipeline y oportunidades

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `consultar_pipeline` | `GET /api/pipeline` | Ninguno |
| `listar_oportunidades` | `GET /api/pipeline/list` | `search`, `stage`, `ownerId`, fechas, `sort`, `page`, `limit` |
| `obtener_oportunidad` | `GET /api/pipeline/:id` | `opportunityId` |
| `obtener_insights_pipeline` | `GET /api/pipeline/insights` | Ninguno |
| `obtener_forecast_pipeline` | `GET /api/pipeline/forecast` | `ownerId`, `category`, `currency`, fechas |
| `obtener_historial_oportunidad` | `GET /api/pipeline/:id/history` | `opportunityId` |
| `obtener_actividad_oportunidad` | `GET /api/pipeline/:id/activity` | `opportunityId` |
| `listar_contactos_oportunidad` | `GET /api/pipeline/:id/contacts` | `opportunityId` |
| `listar_lineas_oportunidad` | `GET /api/pipeline/:id/line-items` | `opportunityId` |

### 10.7 Reuniones

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `listar_reuniones` | `GET /api/meetings` | `assignedTo`, `status`, fechas, `search`, `page`, `limit` |
| `obtener_reunion` | `GET /api/meetings/:id` | `meetingId` |
| `preparar_reunion` | `GET /api/meetings/:id/prep` | `meetingId` |

`preparar_reunion` es de lectura: devuelve contexto existente del lead, llamadas, notas, oportunidad, actividad y reuniones anteriores.

### 10.8 Cuentas, tareas y conversaciones

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `listar_cuentas` | `GET /api/accounts` | Ninguno |
| `obtener_cuenta` | `GET /api/accounts/:id` | `accountId` |
| `listar_tareas` | `GET /api/tasks` | `page`, `limit` |
| `obtener_tarea` | `GET /api/tasks/:id` | `taskId` |
| `listar_conversaciones` | `GET /api/conversations` | `page`, `limit` |
| `listar_plantillas_conversacion` | `GET /api/conversations/templates` | `channel` |
| `obtener_conversacion` | `GET /api/conversations/:id` | `conversationId` |

### 10.9 Publicidad y anuncios

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `obtener_overview_ads` | `GET /api/ads/overview` | Ninguno |
| `obtener_calidad_datos_ads` | `GET /api/ads/data-quality` | Ninguno |
| `obtener_politica_ads` | `GET /api/ads/policy` | Ninguno |
| `listar_acciones_ads` | `GET /api/ads/actions` | Ninguno |
| `listar_acciones_ads_pendientes` | `GET /api/ads/actions/pending` | Ninguno |
| `listar_reglas_autonomia_ads` | `GET /api/ads/rules` | Ninguno |
| `listar_experimentos_ads` | `GET /api/ads/experiments` | Ninguno |
| `obtener_asignacion_experimento_ads` | `GET /api/ads/experiments/:id/allocation` | `experimentId` |
| `obtener_asignacion_presupuesto_ads` | `GET /api/ads/budget-allocation` | Ninguno |
| `obtener_borrador_ads` | `GET /api/ads/draft` | Ninguno |
| `obtener_estado_campana_ads` | `GET /api/ads/campaigns/:id/status` | `campaignId` |
| `obtener_insights_campana_ads` | `GET /api/ads/campaigns/:id/insights` | `campaignId` |
| `obtener_atribucion_campana_ads` | `GET /api/ads/campaigns/:id/attribution` | `campaignId` |
| `obtener_decisiones_campana_ads` | `GET /api/ads/campaigns/:id/decisions` | `campaignId` |
| `obtener_estado_remoto_campana_ads` | `GET /api/ads/campaigns/:id/remote-status` | `campaignId` |

### 10.10 Email marketing

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `obtener_metricas_email_campana` | `GET /api/email/campaigns/:id/metrics` | `campaignId` |
| `obtener_variantes_email_campana` | `GET /api/email/campaigns/:id/variants` | `campaignId` |
| `obtener_ingresos_email_campana` | `GET /api/email/campaigns/:id/revenue` | `campaignId` |
| `obtener_overview_email` | `GET /api/email/overview` | Ninguno |
| `listar_suscriptores_email` | `GET /api/email/subscribers` | `page`, `limit` |
| `obtener_resumen_suscriptores_email` | `GET /api/email/subscribers/summary` | Ninguno |
| `listar_entregas_email` | `GET /api/email/deliveries` | `page`, `limit` |

### 10.11 Automatizaciones, contenido y Studio

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `listar_oportunidades_contenido` | `GET /api/content/opportunities` | `page`, `limit` |
| `listar_automatizaciones` | `GET /api/automations` | Ninguno |
| `obtener_salud_automatizaciones` | `GET /api/automations/health` | Ninguno |
| `listar_ejecuciones_automatizacion` | `GET /api/automations/:id/runs` | `automationId`, `page`, `limit` |
| `listar_producciones_studio` | `GET /api/studio/productions` | `page`, `limit` |

### 10.12 Escritura CRM protegida

Estas herramientas no aparecen por defecto. Solo se registran cuando `CALLSROBIN_WRITE_ENABLED=true` y existe `CALLSROBIN_WRITE_API_KEY`.

Todas requieren `confirm: true`. Ese campo representa que el cliente ha obtenido una confirmación explícita del usuario; además, el backend debe autorizar la operación con los permisos de la clave de escritura.

| Herramienta | Endpoint | Argumentos principales |
|---|---|---|
| `crear_lead` | `POST /api/leads` | `confirm`, `name`, `phone`, `email`, `company`, `campaignId`, `source`, `status`, `tags`, `customFields`, `accountId` |
| `actualizar_lead` | `PUT /api/leads/:id` | `confirm`, `leadId` y campos del lead |
| `anadir_nota_lead` | `POST /api/leads/:id/notes` | `confirm`, `leadId`, `text` |
| `anadir_nota_llamada` | `POST /api/calls/:id/notes` | `confirm`, `callId`, `text` |
| `crear_tarea` | `POST /api/tasks` | `confirm`, `title`, fechas, prioridad y entidades relacionadas |
| `crear_reunion` | `POST /api/meetings` | `confirm`, `leadId`, `title`, `scheduledAt`, duración y notas |
| `reprogramar_reunion` | `POST /api/meetings/:id/reschedule` | `confirm`, `meetingId`, `scheduledAt`, `reason` |
| `mover_oportunidad_etapa` | `POST /api/pipeline/:id/move-stage` | `confirm`, `opportunityId`, `toStage`, `reason`, `probability` |

### 10.13 Prospección automática

Estas herramientas conectan el MCP con el Prospect Finder existente de LlamadasRobin. La búsqueda consulta Google Places a través del backend y puede consumir créditos del proveedor. Por eso aparece dentro del modo de escritura protegida aunque no cree registros por sí sola.

| Herramienta | Endpoint | Argumentos principales | Resultado |
|---|---|---|---|
| `buscar_leads_automaticamente` | `POST /api/prospects/search` | `confirm`, `sector`, `city`, `country`, `limit` | Negocios con nombre, teléfono, web, rating, reseñas, Maps y `quickScore` |
| `importar_leads_prospectados` | `POST /api/prospects/import` | `confirm`, `campaignId`, `items`, contexto y opciones | Leads creados, duplicados omitidos y resultados de automatizaciones |

Flujo recomendado:

1. Ejecutar `buscar_leads_automaticamente` con el sector, ciudad y límite deseados.
2. Revisar los resultados y el `quickScore`; una puntuación alta indica una oportunidad preliminar, no intención de compra.
3. Ejecutar `importar_leads_prospectados` solo con los elementos seleccionados y `confirm: true`.
4. Activar `enrich`, `autoAudit`, `sequenceId`, `autoEmail` o `autoCall` únicamente cuando el usuario haya confirmado también esas consecuencias.

La importación es incremental: el backend evita duplicados por `placeId` o teléfono. La auditoría, el enriquecimiento, el email, las llamadas y las secuencias siguen sujetos a permisos, entitlements y controles del backend.

### 10.14 Flujos inteligentes

El MCP incluye herramientas compuestas que coordinan varias lecturas o acciones y devuelven un resultado orientado a decisión.

| Herramienta | Modo | Qué hace |
|---|---|---|
| `investigar_empresa_360` | Lectura | Combina ficha, timeline, actividades, notas, auditoría, preferencias e historial de email. Si una sección no está disponible devuelve el error solo en esa sección. |
| `calcular_prioridad_leads` | Lectura | Ordena hasta 100 leads con `priorityScore` y razones visibles. No escribe el score en el CRM. |
| `simular_campana` | Lectura | Calcula audiencia, contactos, reuniones y coste según supuestos configurables. La previsualización de audiencia no persiste cambios. |
| `generar_contenido_multicanal` | Escritura protegida | Consume IA para producir un plan de contenido; no publica. |
| `ejecutar_plan_comercial` | Escritura protegida | Busca y ordena prospectos y, solo si se solicita, crea campaña, importa leads y genera contenido. |

`ejecutar_plan_comercial` separa la planificación de la ejecución mediante opciones explícitas:

- Sin `importLeads`, solo devuelve prospectos ordenados y siguientes pasos.
- `createCampaign` crea una campaña outbound nueva; no se puede combinar con un `campaignId` existente.
- `importLeads` importa los prospectos encontrados y exige campaña.
- `enrich`, `autoAudit`, `autoEmail`, `autoCall` y `sequenceId` activan efectos adicionales de forma individual.
- `generateContent` genera contenido, pero no lo publica.

Aunque el nombre sea “ejecutar”, todas las llamadas de esta herramienta requieren `confirm: true`; además, el backend vuelve a aplicar permisos, entitlements, consentimiento y límites de coste.

### 10.15 Operaciones comerciales y de contenido

Estas diez herramientas cierran las conexiones operativas con campañas, leads, llamadas, email y Metricool.

| Herramienta | Endpoint | Efecto |
|---|---|---|
| `crear_campana` | `POST /api/campaigns` | Crea una campaña outbound en borrador. |
| `actualizar_campana` | `PUT /api/campaigns/:id` | Actualiza configuración, estado, fechas o presupuesto. |
| `iniciar_campana` | `POST /api/campaigns/:id/start` | Activa la campaña y encola llamadas para leads nuevos con teléfono. |
| `pausar_campana` | `POST /api/campaigns/:id/pause` | Detiene la campaña outbound. |
| `auditar_campana` | `POST /api/campaigns/:id/audit-bulk` | Audita los leads de una campaña. |
| `auditar_lead` | `POST /api/leads/:id/audit` | Ejecuta auditoría digital individual. |
| `llamar_lead_ahora` | `POST /api/leads/:id/call-now` | Encola una llamada individual. |
| `redactar_email_lead` | `POST /api/leads/:id/outbound-email/draft` | Genera un email sin enviarlo. |
| `enviar_email_lead` | `POST /api/leads/:id/outbound-email/send` | Envía email tras validaciones de consentimiento y cumplimiento. |
| `crear_publicacion_social` | `POST /api/metricool/posts` | Crea un post social vinculado a una campaña. |

Todas requieren `confirm: true`. Las herramientas de llamada, envío, inicio de campaña y publicación están marcadas como acciones destructivas o externas y no se registran en modo solo lectura.

No se han expuesto todavía herramientas para llamar a un lead, enviar emails o WhatsApp, iniciar campañas, modificar agentes o cambiar consentimientos.

## 11. Validación de argumentos

Las herramientas no reciben argumentos arbitrarios sin validación. Los esquemas Zod aplican límites defensivos:

- IDs: texto no vacío, máximo 128 caracteres.
- `limit`: normalmente entre 1 y 100, con valor por defecto 25.
- `page`: entre 1 y 100.000.
- Traza de llamada: máximo 1.000 elementos.
- Dashboard: solo ventanas de 7, 30 o 90 días.
- Estados, etapas, monedas y categorías de forecast: valores cerrados según el contrato del backend.
- Las herramientas de escritura requieren literalmente `confirm: true`.
- Los payloads de escritura se validan antes de salir del MCP y vuelven a validarse en el backend.

El backend vuelve a validar todos los permisos y parámetros. La validación del MCP no sustituye la validación del servidor de LlamadasRobin.

## 12. Errores

`CallsRobinClient` traduce los fallos técnicos a errores seguros:

| Código | Situación |
|---|---|
| `CALLSROBIN_API_ERROR` | El backend respondió con error HTTP |
| `CALLSROBIN_TIMEOUT` | Se agotó `CALLSROBIN_TIMEOUT_MS` |
| `CALLSROBIN_UNAVAILABLE` | No se pudo conectar con el backend |
| `CALLSROBIN_RESPONSE_TOO_LARGE` | La respuesta supera el límite configurado |
| `CALLSROBIN_INVALID_JSON` | El backend devolvió contenido que no es JSON válido |

Los errores HTTP del backend conservan su estado interno y un mensaje seguro, por ejemplo `401`, `403`, `404` o `503`.

## 13. Seguridad y límites actuales

### Incluido

- API key fuera del código fuente.
- Validación de URL y clave al arrancar.
- Modo lectura por defecto.
- Las herramientas de escritura no se registran si `CALLSROBIN_WRITE_ENABLED` no vale `true`.
- Las escrituras usan una API key separada.
- Las escrituras llevan `readOnlyHint: false` y `confirm: true`.
- Timeout por petición.
- Límite máximo de bytes por respuesta.
- Validación de argumentos con Zod.
- Aislamiento por organización realizado por el backend.
- Permisos del rol aplicados por el backend.

### Responsabilidades del backend

El MCP no debe intentar duplicar estas reglas. LlamadasRobin sigue siendo responsable de:

- Autenticar la clave.
- Determinar el usuario, rol y organización.
- Aplicar permisos `read`.
- Aplicar entitlements del plan.
- Aplicar alcance de workspace y ownership.
- Ocultar datos que el rol no puede leer.
- Registrar observabilidad y auditoría HTTP.
- Rechazar operaciones si la clave de escritura no tiene los permisos requeridos.

### Datos sensibles

Varias respuestas pueden contener teléfonos, emails, transcripciones, notas o URLs privadas. La clave utilizada por el MCP debe pertenecer a un rol autorizado y el cliente de IA debe tratar las respuestas como información privada.

## 14. Pruebas realizadas

Pruebas automatizadas:

```powershell
cd mcp-server
npm run build
npm test
```

La suite actual comprueba:

- Envío de la API key.
- Serialización de filtros GET.
- Conversión de errores HTTP.
- Timeout y límites de respuesta.
- Rechazo de configuración inválida.

También se ha verificado el protocolo real por `stdio`:

- `initialize` responde correctamente.
- En modo lectura, `tools/list` devuelve 78 herramientas.
- Con escritura activada, `tools/list` devuelve 100 herramientas.
- Las herramientas de escritura solo aparecen con la flag y la API key separada.

## 15. Limitaciones actuales

- Solo está implementado el transporte local `stdio`.
- No hay endpoint remoto Streamable HTTP propio.
- No hay MCP resources dinámicos como `lead://id` o `call://id`.
- No hay prompts MCP predefinidos.
- Hay 22 herramientas de escritura CRM/prospección/inteligencia protegida. La búsqueda automática, importación, generación de contenido, campañas, llamadas, email y publicación social están expuestos con confirmación y permisos del backend.
- No existe todavía un mecanismo separado para scopes de API key exclusivos del MCP; la clave utiliza el rol de la cuenta que la creó.
- Algunas respuestas grandes pueden quedar limitadas por `CALLSROBIN_MAX_RESPONSE_BYTES`.

## 16. Próximas ampliaciones recomendadas

1. Crear scopes específicos para claves MCP, por ejemplo `mcp.read.crm` y `mcp.read.voice`.
2. Añadir redacción configurable de teléfonos, emails y transcripciones.
3. Implementar resources MCP de leads, llamadas, campañas y pipeline.
4. Añadir prompts como `informe_comercial_diario`, `analizar_llamada` y `preparar_reunion`.
5. Añadir transporte Streamable HTTP para despliegues remotos.
6. Añadir caché breve para métricas y catálogos de lectura frecuente.
7. Añadir pruebas de contrato contra un backend de staging.
8. Añadir herramientas de escritura de mayor riesgo únicamente con aprobación adicional, límites de coste y auditoría reforzada.

## 17. Estado actual

| Elemento | Estado |
|---|---|
| Servidor MCP | Implementado |
| Transporte stdio | Implementado y verificado |
| Cliente API de LlamadasRobin | Implementado |
| Herramientas | 78 de lectura + 22 de escritura opcional |
| Validación Zod | Implementada |
| Tests offline | Implementados |
| Acciones de escritura | Protegidas por flag, API key separada y `confirm: true` |
| Resources MCP | Pendiente |
| Prompts MCP | Pendiente |
| Streamable HTTP | Pendiente |
