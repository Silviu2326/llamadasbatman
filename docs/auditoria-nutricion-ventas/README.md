# Auditoría de Nutrición y Ventas

Fecha de corte: **13 de julio de 2026**.

Esta auditoría revisa el estado real del workspace actual de VozIA/Vendrava en dos áreas:

- **Nutrición:** Email marketing y Automatizaciones.
- **Ventas:** Leads, Pipeline/Oportunidades y Reuniones.

El análisis contrasta frontend, API, servicios, workers, esquema Prisma y la especificación funcional existente. No se ha asumido que una pantalla, un botón o un texto comercial equivalgan a una capacidad operativa: cada función se clasifica según lo que realmente persiste o ejecuta el código.

## Documentos

1. [Auditoría de Email Marketing](./01-email-marketing.md)
2. [Auditoría de Automatizaciones](./02-automatizaciones.md)
3. [Auditoría de Ventas](./03-ventas.md)
4. [Backlog priorizado y roadmap](./04-backlog-priorizado.md)
5. [Arquitectura funcional objetivo](./05-arquitectura-objetivo.md)

## Escala usada

| Nivel | Significado |
| --- | --- |
| 0 | No existe. |
| 1 | Maqueta o controles principalmente decorativos. |
| 2 | Prototipo funcional con flujo básico, pero no apto para una operación comercial fiable. |
| 3 | MVP operable con carencias conocidas y controles manuales. |
| 4 | Producto estable, medible y administrable. |
| 5 | Producto maduro, optimizado y con automatización avanzada. |

## Resultado ejecutivo

| Área | Nivel actual | Lo que sí funciona | Principal limitación |
| --- | ---: | --- | --- |
| Email marketing | 2/5 | Gating por plan, proxy básico a Mautic, alta/listado/pausa/programación de campañas, prueba de email y webhooks de interacción. | No existe todavía un ciclo completo y seguro de campaña, audiencia, consentimiento, entrega y atribución. El aislamiento de plantillas en la instancia Mautic compartida es insuficiente. |
| Automatizaciones | 2/5 | Definiciones persistidas, eventos canónicos, ejecución idempotente por evento, outbox, reanudación por paso y acciones reales en varios canales. | Cuatro disparadores ofrecidos por la UI nunca se producen; faltan condiciones, esperas, ramas, historial visible, versionado y resultados por paso. |
| Leads | 2/5 | CRUD básico, importación CSV, ficha, timeline parcial, notas, archivos y auditoría digital. | El score se deriva del estado, varias etapas solo existen en la UI, las búsquedas filtran una página local y las altas manuales no pasan por la orquestación completa. |
| Pipeline | 2/5 | CRUD de oportunidades, agrupación por etapa, ficha editable y cálculo ponderado básico. | El kanban no mueve tarjetas, no hay historial de etapa ni motivo de pérdida, y el forecast usa datos insuficientes. |
| Reuniones | 2/5 | Alta, listado, detalle, notas, cancelación y exportación básica. | No hay calendario externo, invitaciones, recordatorios, reprogramación real ni historial; varios controles son inertes o muestran datos fijos. |

## Conclusión

La base técnica es aprovechable, especialmente el modelo `AutomationRun`, el outbox, el aislamiento por `orgId` en las lecturas principales y la integración inicial con Mautic. Sin embargo, el producto todavía mezcla tres tipos de información:

1. **Datos reales:** registros Prisma y respuestas confirmadas de servicios.
2. **Datos derivados débiles:** por ejemplo, usar el estado del lead como score o la fecha de creación como antigüedad de una etapa.
3. **Datos decorativos:** contadores de 23 leads hot, 3 reuniones, checklist de recordatorios o un rango de fechas de 2024.

Antes de añadir más IA o más paneles, la prioridad debe ser convertir Nutrición y Ventas en un sistema confiable de registro y ejecución. Esto requiere:

- aislamiento multi-tenant y permisos en todas las mutaciones;
- consentimiento, bajas, rebotes y supresión efectivos;
- eventos de dominio completos y un planificador de eventos temporales;
- historial de cambios y ejecución por paso;
- tareas y siguientes acciones reales;
- métricas con denominadores correctos y atribución trazable;
- eliminación de cifras y estados simulados de la interfaz.

## Hallazgos de mayor prioridad

| ID | Prioridad | Hallazgo | Riesgo |
| --- | --- | --- | --- |
| EM-01 | P0 | Las plantillas de Mautic no se filtran por organización y los envíos aceptan un ID externo arbitrario. | Exposición o uso cruzado de activos entre clientes. |
| EM-02 | P0 | La baja, el rebote y el consentimiento no bloquean todos los envíos manuales o de campaña. | Incumplimiento, daño de reputación y entregabilidad. |
| AU-01 | P0 | Los disparadores temporales publicados en la UI no tienen productor ni scheduler. | Flujos activos que nunca se ejecutan. |
| AU-02 | P0 | Una acción externa puede repetirse si el proceso cae después del envío y antes de guardar `currentStep`. | Emails, WhatsApps o llamadas duplicadas. |
| VE-01 | P0 | Varias relaciones se crean sin comprobar que lead, usuario o llamada pertenezcan a la misma organización. | Relaciones cross-tenant y corrupción lógica. |
| VE-02 | P0 | La UI presenta score, prioridades, reuniones y recordatorios que no proceden de datos reales. | Decisiones comerciales basadas en información falsa. |
| VE-03 | P1 | Las altas manuales e importadas no usan el flujo completo de ingestión. | Sin sync Mautic, conversación, consentimiento ni evento `lead.created`. |
| VE-04 | P1 | No hay `Task`, actividad unificada, historial de etapa ni siguiente acción operativo en Ventas. | Seguimiento manual e imposibilidad de auditar el proceso. |
| VE-05 | P1 | El pipeline usa `createdAt` para detectar estancamiento y no registra cuándo se entró en una etapa. | Alertas y forecast incorrectos. |
| VE-06 | P1 | Reuniones no integra calendario, invitaciones, recordatorios ni reprogramación. | Citas duplicadas, olvidos y no-shows. |

## Qué construir primero

La secuencia recomendada es:

1. **Seguridad y verdad del dato:** validación, ownership, RBAC, consentimiento/supresión y eliminación de métricas simuladas.
2. **Motor operativo:** eventos faltantes, scheduler, historial de runs y acciones idempotentes.
3. **Ventas ejecutable:** tareas, siguiente acción, score real, pipeline movible e historial de etapas.
4. **Reuniones conectadas:** calendario, recordatorios, reprogramación y resultado.
5. **Email medible:** campañas con audiencia, plantilla, variantes, entregas, eventos y atribución.

El detalle, dependencias y criterios de terminado están en [04-backlog-priorizado.md](./04-backlog-priorizado.md).

## Evidencia y limitaciones

La auditoría está respaldada por el código actual y por estas especificaciones:

- [Especificación funcional de módulos](../arquitectura-plataforma/07-especificacion-de-modulos.md)
- [Modelo de objetos](../arquitectura-plataforma/02-modelo-de-objetos.md)
- [Contratos API](../arquitectura-plataforma/08-contratos-api.md)
- [Explicación general de plataforma](../../PLATAFORMA_EXPLICACION_GENERAL.md)
- [Plan Postiz + Mautic](../../PLAN_IMPLEMENTACION_POSTIZ_MAUTIC.md)

Validaciones realizadas:

- `backend`: TypeScript compila con `tsc --noEmit`.
- `frontend`: Vite completa el build de producción; advierte que el chunk principal supera 500 kB.
- No existe una suite automatizada de API, integración o E2E para estos módulos.

No se pudo validar contra una instancia real de Mautic, un proveedor de calendario, Twilio ni datos productivos. Por tanto, las rutas externas de Mautic y la entregabilidad real deben tratarse como **no verificadas** hasta ejecutar las pruebas de contrato y E2E descritas en los documentos.
