# Visión y principios

## Objetivo

Convertir VozIA en un sistema operativo de ingresos: captar demanda, conversar con ella, nutrirla, convertirla, operar los canales y medir el resultado desde un mismo contexto de cliente.

La experiencia debe parecer una sola plataforma, no una colección de herramientas compradas por separado.

## Áreas de primer nivel

| Área | Propósito | Módulos principales |
| --- | --- | --- |
| Captación | Generar demanda y entradas | Campañas, ADS, SEO, Google Business, Prospect Finder, Scraping, Landings, Funnels, Formularios |
| Conversación | Gestionar interacciones | Inbox, Llamadas, WhatsApp, Chat Web, Redes, SMS, Reuniones, Voz IA |
| Nutrición | Mover contactos hacia la conversión | Automatizaciones, Secuencias, Email, Scoring, Remarketing, Contenido |
| Ventas | Gestionar el proceso comercial | Leads, Empresas, Contactos, Oportunidades, Pipeline, Clientes, Finanzas |
| Operaciones | Ejecutar y supervisar comunicaciones | Centralita, Números, IVR, Colas, Horarios, Calidad, Monitor |
| IA | Crear, probar y gobernar capacidades IA | Agentes, Prompts, Modelos, Voces, Conocimiento, Memorias, Evaluaciones |
| Analítica | Entender rendimiento y atribución | Dashboard, Embudos, Conversión, ROI, Forecast, Informes |
| Sistema | Administrar la cuenta | Usuarios, Roles, Equipos, Integraciones, API, Logs, Suscripción |

## Principios no negociables

### 1. Contexto antes que navegación

Una persona debe poder abrir una empresa o una oportunidad y ver sus conversaciones, tareas, campañas, documentos, cobros y automatizaciones sin saltar por diez secciones.

### 2. Una ficha, muchas pestañas

Cada entidad relevante tiene una ficha estándar con encabezado, estado, acciones, timeline y pestañas relacionadas. No duplicar lógica en páginas parecidas.

### 3. Configuración separada de ejecución

La configuración de una integración, un canal o un agente vive en su módulo de configuración. La ejecución diaria vive en listas, bandejas y dashboards.

### 4. Progressive disclosure

Mostrar primero las tareas frecuentes. Mover opciones avanzadas a pestañas, paneles laterales, menús de contexto y configuración.

### 5. Backend real para acciones reales

Crear, editar, eliminar, importar, exportar, conectar, enviar y aplicar deben persistir en backend. Un toast no es una implementación.

### 6. Multi-tenant y permisos desde el principio

Toda entidad de negocio debe estar vinculada a la organización/workspace y pasar por autenticación y autorización. No confiar en el frontend para ocultar permisos.

### 7. Medición transversal

Toda entrada de demanda debe conservar fuente, campaña, canal, audiencia, fecha y atribución hasta la oportunidad y el ingreso.

## Lo que no se debe hacer

- No crear `/seo-palabras-clave`, `/seo-auditorias`, `/seo-posicionamiento` como tres páginas independientes.
- No duplicar un componente de tabla para cada módulo.
- No crear datos mock para una acción que el usuario entiende como persistente.
- No añadir una sección visible al sidebar si puede ser una vista secundaria del módulo.
- No modificar `src/App.jsx` con decenas de rutas antes de definir el registro de módulos.
- No guardar secretos en frontend ni versionar archivos `.env`.

## Personas y trabajos principales

La arquitectura debe servir a varias personas sin obligarlas a entender toda la plataforma.

| Persona | Trabajo principal | Entrada recomendada | Resultado esperado |
| --- | --- | --- | --- |
| Dirección | Saber qué está funcionando | Dashboard Ejecutivo | decisiones sobre inversión y foco |
| Marketing | Generar y nutrir demanda | Captación / Nutrición | campañas, audiencias y leads atribuidos |
| SDR/comercial | Convertir demanda | Inbox / Leads / Pipeline | actividades y oportunidades avanzadas |
| Responsable de ventas | Gestionar previsión | Oportunidades / Forecast | pipeline fiable y objetivos |
| Supervisor | Controlar operación | Centralita / Monitor / Calidad | incidencias y coaching |
| Responsable IA | Mejorar agentes | IA / Evaluaciones | agentes publicados con métricas |
| Administrador | Gobernar la cuenta | Sistema | usuarios, permisos, integraciones y auditoría |

## North Star y métricas de producto

La plataforma debe optimizar el tiempo desde la entrada de un lead hasta una acción comercial útil, sin perder trazabilidad.

Métricas base:

- Tiempo hasta primer contacto.
- Porcentaje de leads con fuente y campaña conocidas.
- Porcentaje de conversaciones respondidas.
- Conversión de lead a oportunidad.
- Valor de pipeline atribuido.
- Ingresos atribuidos por canal.
- Porcentaje de automatizaciones ejecutadas sin error.
- Tasa de resolución o transferencia de agentes IA.
- Tiempo de configuración de un canal nuevo.

Cada métrica debe indicar definición, fuente, zona horaria, ventana temporal y si es estimada o definitiva.

## Decisiones de producto que deben quedar explícitas

Antes de implementar un módulo, el agente debe documentar:

1. Qué problema resuelve.
2. Qué objeto crea o modifica.
3. Quién lo utiliza.
4. Qué integración requiere.
5. Qué datos son obligatorios.
6. Qué ocurre si falla la integración.
7. Qué permisos necesita.
8. Qué evento produce.
9. Qué métricas genera.
10. Qué parte se deja para una fase posterior.

Si estas respuestas no existen, el módulo todavía no está listo para desarrollo.
