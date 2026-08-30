# Documento interno — tres opciones visuales para organizar Vendrava

**Fecha:** 19 de agosto de 2026  
**Decisión tomada:** Opción 1 — Sistema operativo por espacios  
**Estado:** opción 1 implementada y verificada en desktop/móvil.

---

## 1. El problema

La navegación actual intenta representar el producto mediante una sidebar clásica. Ya compiten por ella:

- 38 accesos de primer nivel;
- 67 rutas frontend;
- 147 microapps;
- CRM y ventas;
- campañas, Ads, SEO, social y landings;
- voz, conversaciones y agentes;
- Studio y activos;
- Jobs, Flows y automatizaciones;
- Marketplace y conexiones;
- costes, gobierno, white-label y desarrolladores.

Aunque se añadan grupos plegables, la sidebar seguirá teniendo tres defectos:

1. Expone la arquitectura técnica, no lo que el usuario quiere conseguir.
2. Mezcla trabajo diario, creación, configuración y administración.
3. Obliga a descubrir 147 microapps como si fueran 147 destinos independientes.

### Principio rector

> La sidebar no debe contener todo el producto. Debe contener únicamente los puntos de orientación permanentes. El resto debe descubrirse por búsqueda, contexto, objetivos y espacios de trabajo.

---

## 2. Elementos que deben existir en cualquiera de las tres opciones

### 2.1 Buscador/launcher universal

Atajo `Ctrl/Cmd + K` para:

- ir a cualquier módulo;
- buscar leads, cuentas, campañas, oportunidades, activos o producciones;
- lanzar una microapp;
- crear una entidad;
- ejecutar un Flow;
- abrir un Job;
- cambiar de organización o cliente.

Ejemplos:

```text
> preparar reunión con Acme
> crear campaña para SaaS España
> abrir oportunidad Renovación 2027
> ejecutar Auditor de margen sobre Cliente Norte
> generar vídeo-demo desde Producción Q4
```

### 2.2 Navegación contextual

Cuando el usuario está dentro de una cuenta, campaña, oportunidad o producción, las acciones relevantes deben aparecer allí. No debería volver al catálogo para buscar “Preparar QBR”, “Auditar margen” o “Crear storyboard”.

### 2.3 Catálogo independiente

Microapps, Flows, proveedores y Marketplace necesitan un **Centro de capacidades**, no 150 enlaces en navegación.

### 2.4 Recientes, favoritos y fijados

Cada usuario necesita:

- recientes;
- favoritos;
- fijados personales;
- recomendados por rol;
- historial de ejecuciones.

### 2.5 Separación de planos

La interfaz debe distinguir:

- **hacer trabajo**;
- **consultar datos**;
- **crear activos**;
- **administrar el sistema**.

---

# Opción 1 — Sistema operativo por espacios

## 3. Idea

Sustituir la sidebar larga por un rail de 7 espacios permanentes. Cada espacio tiene navegación local propia. Las microapps aparecen en el contexto y en el launcher global.

### Rail global

1. Inicio
2. Trabajo
3. Ventas
4. Growth
5. Crear
6. Biblioteca
7. Más

### Qué contiene cada espacio

| Espacio | Contenido |
|---|---|
| Inicio | Dashboard, prioridades, alertas, recientes y recomendaciones |
| Trabajo | Centro de acciones, Jobs, automatizaciones, Flows y aprobaciones |
| Ventas | Leads, cuentas, pipeline, reuniones, llamadas e inteligencia comercial |
| Growth | Campañas, Ads, SEO, orgánico, social, landings, email y funnels |
| Crear | Studio, contenido, microapps creativas y briefs |
| Biblioteca | Activos, Knowledge Base, plantillas, playbooks y entregables |
| Más | Marketplace, conexiones, organización, costes, accesos, gobierno, white-label y desarrolladores |

## 4. Wireframe

```text
┌──────┬──────────────────────┬──────────────────────────────────────────────┐
│  V   │ VENTAS               │ Acme / Renovación 2027                      │
│      │                      │                                              │
│ ⌂    │ Resumen              │  Salud 72     Valor 120k     Cierre 30 sep  │
│ ✓    │ Leads                │                                              │
│ $    │ Cuentas              │  Próximas acciones                           │
│ ↗    │ Pipeline             │  [Preparar MAP] [QBR] [Auditar margen]      │
│ ✦    │ Reuniones            │                                              │
│ ▣    │ Llamadas             │  Actividad          Riesgos          Jobs    │
│ …    │ Inteligencia         │  ...                ...              ...     │
│      │                      │                                              │
│ ⌘K   │ + Crear              │                         [Copiloto contextual]│
└──────┴──────────────────────┴──────────────────────────────────────────────┘
```

## 5. Cómo se visualizan las 147 microapps

No se muestran como navegación. Se accede por cuatro caminos:

1. `Cmd+K` y búsqueda.
2. Centro de capacidades con filtros.
3. Recomendaciones contextuales en cada entidad.
4. Favoritos fijados en Inicio o en cada espacio.

Ejemplo dentro de Account:

```text
Acciones inteligentes para esta cuenta
  · Riesgo de churn
  · Preparar renovación
  · QBR
  · Auditor de margen
  · Caso de éxito verificable
  · Oportunidades de expansión
```

## 6. Puntos fuertes

- Es la estructura más equilibrada.
- Escala aunque pasemos de 147 a 500 microapps.
- Mantiene orientación permanente.
- Reduce el ruido sin ocultar capacidades.
- Funciona para empresa, agencia y administrador.
- Permite migrar de forma gradual desde la sidebar actual.

## 7. Riesgos

- Hay que decidir con cuidado dónde vive cada módulo.
- Un usuario puede tardar unos días en aprender los espacios.
- Requiere un launcher excelente; si la búsqueda falla, la percepción será de funciones escondidas.

## 8. Ideal para

Una plataforma horizontal que quiere servir a ventas, marketing, agencia, producción y administración sin favorecer un único tipo de cliente.

---

# Opción 2 — Cockpit por objetivos y resultados

## 9. Idea

La pantalla principal no pregunta “¿a qué módulo quieres ir?”, sino “¿qué quieres conseguir?”. La mayor parte del trabajo empieza como una misión guiada.

### Navegación permanente mínima

1. Hoy
2. Misiones
3. Clientes/CRM
4. Biblioteca
5. Administración

### Inicio por resultados

```text
¿Qué quieres conseguir?

[Conseguir más leads]      [Cerrar una oportunidad]
[Crear una campaña]        [Preparar una reunión]
[Producir un vídeo]        [Retener un cliente]
[Investigar un mercado]    [Automatizar un proceso]
```

Cada elección abre una misión que combina módulos, microapps y aprobaciones.

## 10. Wireframe

```text
┌──────┬─────────────────────────────────────────────────────────────────────┐
│  V   │ Buenos días, Laura                                                  │
│      │                                                                     │
│ Hoy  │ ¿Qué quieres conseguir?                                             │
│ Mis. │                                                                     │
│ CRM  │ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐      │
│ Lib. │ │ Cerrar un deal   │ │ Crear campaña   │ │ Producir vídeo   │      │
│ Adm. │ │ 4 herramientas   │ │ 7 herramientas  │ │ Studio + 12 apps │      │
│      │ └──────────────────┘ └──────────────────┘ └──────────────────┘      │
│ ⌘K   │                                                                     │
│      │ En curso                  Necesita aprobación        Resultados      │
│      │ Renovación Acme  72%      Campaña Q4  €500           14 leads       │
└──────┴─────────────────────────────────────────────────────────────────────┘
```

## 11. Cómo se visualizan las microapps

Las microapps se presentan como habilidades dentro de una misión, no como productos sueltos.

Ejemplo “Cerrar una oportunidad”:

```text
1. Diagnosticar
   · Mapa de decisores
   · Detector de single-threading
   · Competidor en la oportunidad

2. Preparar
   · Business case
   · Calculadora ROI
   · Plan de cierre

3. Alinear
   · Mutual Action Plan
   · Preparador de negociación

4. Ejecutar y medir
   · Tareas, reunión, follow-up y forecast
```

## 12. Puntos fuertes

- Es la opción más fácil de entender para usuarios nuevos.
- Vende resultados, no software.
- Hace visible la potencia de las microapps sin mostrar 147 tarjetas.
- Encaja muy bien con el Orquestador y los Flows.
- Puede convertirse en la experiencia “básica” o recomendada.

## 13. Riesgos

- Los usuarios expertos pueden sentir que los recorridos guiados les ralentizan.
- No todos los trabajos empiezan con un objetivo limpio.
- Requiere diseñar y mantener una taxonomía de misiones.
- Administración, configuración y análisis profundo necesitan una vía secundaria.

## 14. Ideal para

SMB, onboarding, demos comerciales y usuarios que no quieren aprender una suite compleja.

---

# Opción 3 — Salas por cliente, campaña o proyecto

## 15. Idea

La unidad principal no es el módulo, sino el objeto sobre el que trabaja el equipo. Cada cliente, cuenta, campaña, oportunidad o producción tiene una “sala” que reúne todo lo relacionado.

### Selector superior

```text
Organización → Cliente → Proyecto
Vendrava      → Acme    → Lanzamiento Q4
```

### Tipos de sala

- Sala de cliente/cuenta.
- Sala de campaña.
- Sala de oportunidad.
- Sala de producción.
- Sala de programa Growth.

## 16. Wireframe

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Vendrava ▾   /   Acme ▾   /   Lanzamiento Q4 ▾         Buscar…      ⚙     │
├────────────────────────────────────────────────────────────────────────────┤
│ Resumen  CRM  Campañas  Contenido  Studio  Automatización  Activos  Costes │
├───────────────────────────────────────────────┬────────────────────────────┤
│                                               │ Copiloto de la sala         │
│ Timeline del proyecto                         │                            │
│                                               │ Recomendado ahora:          │
│ Brief → Landing → Ads → Leads → Meetings      │ · Auditor experiencia       │
│                                               │ · Paquete entrega           │
│ Estado, responsables, bloqueos y resultados   │ · Informe mensual           │
│                                               │                            │
│ [Crear] [Ejecutar Flow] [Abrir revisión]      │ Historial de ejecuciones    │
└───────────────────────────────────────────────┴────────────────────────────┘
```

## 17. Cómo se visualizan las microapps

Cada sala mantiene:

- acciones recomendadas según su tipo;
- microapps compatibles con sus datos;
- resultados anteriores;
- activos y Jobs generados;
- favoritos del equipo;
- un historial común.

Ejemplo de sala de producción:

```text
Preproducción        Producción          Post             Entrega
Conceptos            Tomas               Montaje          Paquete
Casting              Continuidad         Subtítulos       Derechos
Storyboard           B-roll              QC               Publicación
```

## 18. Puntos fuertes

- Es la mejor opción para agencias y trabajo colaborativo.
- Reduce muchísimo el cambio de contexto.
- Junta datos, activos, coste y resultados de un cliente.
- Hace natural el white-label y el portal de aprobación.
- El historial se entiende como una historia del proyecto.

## 19. Riesgos

- Algunas funciones son transversales y no pertenecen a una sola sala.
- Exige definir relaciones y permisos entre objetos.
- Puede duplicar visualmente información si una campaña pertenece a varios programas.
- Es la opción de migración más costosa.

## 20. Ideal para

Agencias, equipos con muchos clientes, producción audiovisual y operaciones complejas por proyecto.

---

## 21. Comparación

| Criterio | Opción 1: espacios | Opción 2: objetivos | Opción 3: salas |
|---|---:|---:|---:|
| Facilidad para usuario nuevo | Alta | **Muy alta** | Media |
| Velocidad para usuario experto | **Muy alta** | Media | Alta |
| Escala a 500 microapps | **Muy alta** | Alta | Alta |
| Encaje con CRM | Muy alto | Alto | **Muy alto** |
| Encaje con agencia | Alto | Medio | **Muy alto** |
| Encaje con Studio | Alto | Alto | **Muy alto** |
| Claridad de administración | **Muy alta** | Media | Media |
| Migración desde el estado actual | **Más sencilla** | Intermedia | Más compleja |
| Diferenciación comercial | Alta | **Muy alta** | Muy alta |

---

## 22. Mi recomendación: combinación 1 + 2 + 3, con la opción 1 como columna vertebral

No recomiendo mezclar las tres al mismo nivel. Recomiendo esta jerarquía:

### Estructura global: opción 1

Rail de espacios para orientación estable:

```text
Inicio · Trabajo · Ventas · Growth · Crear · Biblioteca · Más
```

### Home y onboarding: opción 2

Inicio basado en objetivos para que el usuario no tenga que conocer módulos.

### Contexto de clientes y proyectos: opción 3

Salas dentro de Accounts, campañas, oportunidades y producciones, sin convertirlas en la navegación global completa.

### Resultado de la combinación

```text
ORIENTACIÓN       DESCUBRIMIENTO       CONTEXTO           VELOCIDAD
7 espacios     + objetivos/misiones + salas de objetos + Cmd+K universal
```

Esta combinación permite:

- mantener una estructura comprensible;
- vender resultados en la portada;
- operar clientes y proyectos sin saltar entre módulos;
- encontrar cualquier capacidad en segundos;
- ocultar complejidad sin eliminar potencia.

---

## 23. Qué pasaría con la sidebar actual

La sidebar no desaparecería completamente. Se convertiría en un **rail global estrecho**.

### Lo que permanece siempre visible

- logo/organización;
- 6–7 espacios;
- buscador universal;
- creación rápida;
- notificaciones/aprobaciones;
- perfil.

### Lo que sale de la navegación global

- microapps individuales;
- páginas de detalle;
- herramientas administrativas secundarias;
- integraciones concretas;
- activos relacionados con una entidad;
- acciones que solo tienen sentido dentro de un contexto.

### Lo que pasa a navegación local

- submódulos de Ventas;
- submódulos de Growth;
- fases de Studio;
- configuración y gobierno;
- secciones de una sala.

---

## 24. Centro de capacidades propuesto

Independientemente de la opción elegida, debería existir una pantalla unificada:

```text
Capacidades
├── Microapps
├── Flows
├── Plantillas
├── Proveedores
└── Marketplace
```

Filtros:

- resultado deseado;
- entidad compatible;
- equipo;
- categoría;
- coste;
- proveedor;
- deterministic/IA;
- local/externa;
- instalada/Marketplace;
- favoritos y recientes.

Cada ficha debería mostrar:

- qué genera;
- qué necesita;
- qué datos leerá;
- coste estimado;
- proveedor o routing;
- vigencia;
- evidencia esperada;
- entidades compatibles;
- última ejecución;
- botón ejecutar.

---

## 25. Fases después de elegir

### Fase 1 — arquitectura de información

- elegir opción;
- definir espacios, misiones o salas;
- crear un único `moduleRegistry`;
- separar ruta canónica, permisos, plan, feature e integración.

### Fase 2 — launcher universal

- módulos;
- entidades;
- comandos;
- microapps y Flows;
- recientes y favoritos.

### Fase 3 — nueva navegación global

- rail;
- navegación local;
- responsive móvil;
- migración de rutas sin romper deep links.

### Fase 4 — contexto inteligente

- recomendaciones por Lead, Account, Opportunity, Campaign y Production;
- historial de resultados;
- acciones rápidas.

### Fase 5 — personalización

- fijados;
- home por rol;
- vista básica, recomendada y avanzada;
- métricas de descubrimiento y tiempo hasta ejecutar.

---

## 26. Decisión tomada

Se adopta la **Opción 1 — Sistema operativo por espacios** como arquitectura global de Vendrava:

```text
Inicio · Trabajo · Ventas · Growth · Crear · Biblioteca · Más
```

La opción 1 será la columna vertebral y no una mezcla de tres navegaciones globales. Más adelante se podrán incorporar componentes concretos de las otras propuestas —misiones en Inicio o vistas contextuales dentro de entidades— siempre que no alteren este modelo mental principal.

El siguiente documento debe ser una especificación visual pantalla por pantalla, con wireframes desktop/móvil, registro de módulos y plan de migración.

---

## 27. Implementación realizada

La opción 1 ya funciona como navegación global del producto:

- rail permanente de siete espacios;
- navegación local agrupada por significado, nunca por estructura técnica;
- panel local plegable con preferencia persistente;
- último módulo recordado por espacio, incluso con cambios rápidos;
- módulos fijados y recientes por organización;
- contexto visible `Espacio → módulo` en desktop y móvil;
- launcher `Ctrl/Cmd + K` para módulos, acciones de creación, microapps, Flows, leads, cuentas, oportunidades y campañas;
- resultados del launcher y preferencias aislados por organización;
- móvil con cinco destinos permanentes y hoja inferior para los siete espacios;
- Centro de capacidades como vía de acceso a las 147 microapps, sin convertirlas en navegación.

Referencias visuales aceptadas:

- `docs/design/navigation-spaces-desktop-v1.png`
- `docs/design/navigation-spaces-mobile-v1.png`

La autorización efectiva sigue residiendo en `navigationPermissions.js` y en el backend. La personalización nunca concede acceso a un destino no autorizado.
