# LlamadasRobin MCP — lectura y escritura protegida

Servidor MCP independiente que permite a un cliente compatible consultar la API de LlamadasRobin y, opcionalmente, ejecutar operaciones CRM protegidas. No accede directamente a Prisma.

La documentación técnica completa está en [`SERVIDOR_MCP.md`](./SERVIDOR_MCP.md).

## Requisitos

- Node.js 20 o posterior.
- Backend de LlamadasRobin accesible por HTTP.
- Clave API de lectura guardada como `CALLSROBIN_API_KEY`.
- Para escritura opcional: `CALLSROBIN_WRITE_ENABLED=true` y una segunda clave en `CALLSROBIN_WRITE_API_KEY`.

## Crear la clave API

Desde LlamadasRobin, abre el portal de desarrolladores (`/desarrolladores`) y crea una clave con una cuenta cuyo rol tenga únicamente los permisos de lectura necesarios. La clave actúa con el rol de la cuenta que la crea; no compartas una clave de administrador con este proceso. La clave completa solo se muestra una vez.

Puedes comprobarla antes de arrancar el MCP:

```powershell
curl http://localhost:3000/api/developer/whoami -H "X-API-Key: vk_tu_clave"
```

## Instalación y ejecución local

```powershell
cd mcp-server
npm install
Copy-Item .env.example .env
# Edita .env con la URL y la clave API
npm run dev
```

El canal `stdout` se reserva para MCP/JSON-RPC. Los logs van a `stderr`.

La escritura permanece desactivada si no se configura explícitamente:

```dotenv
CALLSROBIN_WRITE_ENABLED=true
CALLSROBIN_WRITE_API_KEY=vk_clave_con_permisos_de_escritura
```

Cada herramienta de escritura exige `confirm: true` y el backend vuelve a aplicar sus permisos. La clave de escritura debe ser distinta de la clave de lectura.

## Herramientas disponibles

- `listar_leads`
- `obtener_lead`
- `listar_llamadas`
- `obtener_llamada`
- `obtener_evaluacion_llamada`
- `obtener_metricas_voz`
- `listar_agentes`
- `obtener_estadisticas_agente`
- `listar_campanas`
- `obtener_metricas_campana`
- `obtener_resumen_dashboard`
- `listar_actividad_dashboard`
- `listar_llamadas_en_directo`
- `consultar_pipeline`
- `listar_oportunidades`
- `obtener_oportunidad`
- `obtener_insights_pipeline`
- `obtener_forecast_pipeline`
- `listar_reuniones`
- `obtener_reunion`
- `preparar_reunion`
- `obtener_timeline_lead`
- `listar_actividades_lead`
- `obtener_traza_llamada`
- `obtener_metricas_llamada`

### Escritura protegida (opcional)

Estas herramientas solo aparecen cuando `CALLSROBIN_WRITE_ENABLED=true` y existe una segunda clave API válida:

- `buscar_leads_automaticamente`
- `importar_leads_prospectados`
- `crear_lead`
- `actualizar_lead`
- `anadir_nota_lead`
- `anadir_nota_llamada`
- `crear_tarea`
- `crear_reunion`
- `reprogramar_reunion`
- `mover_oportunidad_etapa`
- `crear_campana`
- `actualizar_campana`
- `iniciar_campana`
- `pausar_campana`
- `auditar_campana`
- `auditar_lead`
- `llamar_lead_ahora`
- `redactar_email_lead`
- `enviar_email_lead`
- `crear_publicacion_social`

### Tools extendidas

CRM: `listar_cuentas`, `obtener_cuenta`, `listar_tareas`, `obtener_tarea`, `listar_conversaciones`, `listar_plantillas_conversacion`, `obtener_conversacion`, `listar_notas_llamada`, `listar_tareas_llamada`, `obtener_historial_oportunidad`, `obtener_actividad_oportunidad`, `listar_contactos_oportunidad`, `listar_lineas_oportunidad`, `listar_propietarios_leads`, `listar_importaciones_leads`, `obtener_importacion_leads`, `obtener_consentimiento_lead`, `obtener_auditoria_lead`, `obtener_historial_auditoria_lead`, `listar_notas_lead`, `listar_archivos_lead`, `obtener_historial_email_lead`, `obtener_preferencias_lead`.

Anuncios: `obtener_overview_ads`, `obtener_calidad_datos_ads`, `obtener_politica_ads`, `listar_acciones_ads`, `listar_acciones_ads_pendientes`, `listar_reglas_autonomia_ads`, `listar_experimentos_ads`, `obtener_asignacion_experimento_ads`, `obtener_asignacion_presupuesto_ads`, `obtener_borrador_ads`, `obtener_estado_campana_ads`, `obtener_insights_campana_ads`, `obtener_atribucion_campana_ads`, `obtener_decisiones_campana_ads`, `obtener_estado_remoto_campana_ads`.

Email, contenido y operaciones: `obtener_metricas_email_campana`, `obtener_variantes_email_campana`, `obtener_ingresos_email_campana`, `obtener_overview_email`, `listar_suscriptores_email`, `obtener_resumen_suscriptores_email`, `listar_entregas_email`, `listar_oportunidades_contenido`, `listar_automatizaciones`, `obtener_salud_automatizaciones`, `listar_ejecuciones_automatizacion`, `listar_producciones_studio`.

La búsqueda de prospectos requiere escritura porque consulta un proveedor externo con posible coste; buscar no crea leads. La importación sí crea leads y admite enriquecimiento, auditoría, secuencias, emails y llamadas opcionales.

### Herramientas inteligentes

De forma predeterminada también están disponibles estos flujos de lectura:

- `investigar_empresa_360`: dossier de lead con timeline, actividades, notas, auditoría, preferencias e historial de email.
- `calcular_prioridad_leads`: ranking explicable por estado, datos de contacto y SLA de primera respuesta.
- `simular_campana`: audiencia, contactos, reuniones y coste estimado sin publicar ni modificar.

Con escritura protegida se añaden:

- `generar_contenido_multicanal`: genera propuestas para varios canales sin publicarlas.
- `ejecutar_plan_comercial`: busca prospectos y puede crear campaña, importar leads y generar contenido; cada acción de escritura se activa por separado.

El catálogo contiene 78 herramientas de lectura y 22 herramientas de escritura protegida cuando se activa el modo de escritura, 100 en total.

Las tools de lectura delegan en endpoints `GET`; las de escritura utilizan únicamente los endpoints `POST` y `PUT` definidos en el backend. Todas tienen validación, confirmación explícita y límites. Los permisos y el aislamiento por organización los sigue aplicando LlamadasRobin mediante la API key correspondiente.

## Conectar desde un cliente MCP local

La configuración exacta depende del cliente, pero el comando es:

```text
node E:\ruta\a\llamadasrobin\mcp-server\dist\index.js
```

El proceso debe heredar las variables de entorno de `.env` o recibirlas desde la configuración del cliente.

## Inspector

Después de instalar dependencias y compilar:

```powershell
npx @modelcontextprotocol/inspector node dist/index.js
```

El Inspector permite comprobar que las herramientas aparecen y llamar una de ellas sin usar todavía un asistente de producción.
