# Cambios en «Más» y Configuración

Fecha: 5 de septiembre de 2026

Repositorio: `Silviu2326/llamadasbatman`

Rama: `codex/actualizar-plataforma`

## Objetivo

Reducir el espacio «Más» de la barra lateral a lo que de verdad necesita una entrada propia, y reunir en una sola sección todo lo que describe y gobierna la organización: cuenta, empresa, plan, integraciones y administración.

Este documento distingue las funciones implementadas de las comprobaciones que todavía requieren una sesión real. Subir el código a GitHub no acredita su despliegue en producción.

## 1. Barra lateral: espacio «Más»

### Antes

| Grupo | Página | Ruta |
| --- | --- | --- |
| Herramientas | Microapps | `/microapps` |
| Herramientas | Biblioteca | `/activos` |
| Configuración | Empresa | `/informacion-empresa` |
| Configuración | Integraciones | `/integraciones` |
| Configuración | Configuración | `/configuracion` |
| Administración | Administración | `/administracion` |

### Ahora

| Grupo | Página | Ruta |
| --- | --- | --- |
| Herramientas | Biblioteca | `/activos` |
| Organización | Configuración | `/configuracion` |

- Microapps sale del menú, pero su ruta sigue viva: se llega desde la paleta de comandos, los atajos de teclado, la ficha de lead y la selección múltiple de leads. Mismo tratamiento que Studio.
- Studio y Recetas Ads siguen ocultos, como estaban.

## 2. Configuración como sección única

Se replica el patrón de Captación: una ruta padre con la cabecera y la barra de secciones fija arriba, y cada sección como ruta anidada que carga su módulo de forma perezosa y hace su propio scroll.

| Sección | Ruta | Qué contiene | Permiso |
| --- | --- | --- | --- |
| Mi perfil | `/configuracion` | Nombre, idioma, contraseña, sesión activa y eliminación de la cuenta. | organization.read |
| Empresa | `/configuracion/empresa` | Perfil comercial, catálogo de ofertas y guardarraíles. Botón «Rellenar desde la web». | organization.read |
| Rellenar desde la web | `/configuracion/empresa/importar` | Flujo de importación desde la web del cliente. Vuelve a Empresa. | organization.read |
| Plan y facturación | `/configuracion/plan` | Plan actual, uso, métricas de plataforma abierta, Stripe o contacto, soporte. | organization.read |
| Integraciones | `/configuracion/integraciones` | Proveedores, Extensiones y API y webhooks. Conserva sus pestañas por `?tab=`. | integrations.read |
| Administración | `/configuracion/administracion` | Accesos, Gobierno y Clientes white-label. Conserva sus pestañas por `?tab=`. | access_control.read, governance.read u organization.manage |

- La barra solo pinta las secciones que el usuario puede abrir por permiso y por plan. La sección activa se mantiene siempre para no perder el contexto.
- Cada sección conserva su `moduleId` original (`settings`, `business-info`, `connections`, `administration`), así que el gating por plan no cambia con la reorganización.
- Plan y facturación deja de ser un rail lateral y un modal dentro de Configuración y pasa a tener sección propia.
- «Eliminar cuenta» vuelve a ser accesible desde Mi perfil. Antes estaba en un bloque de empresa que ya no se renderizaba.
- El formulario de empresa duplicado que había en Configuración se elimina. La única fuente es Empresa.

### Redirecciones

Todas las rutas antiguas redirigen conservando query y pestaña:

| Ruta antigua | Destino |
| --- | --- |
| `/informacion-empresa` | `/configuracion/empresa` |
| `/rellenar-desde-web` | `/configuracion/empresa/importar` |
| `/integraciones`, `/conexiones` | `/configuracion/integraciones` |
| `/marketplace` | `/configuracion/integraciones?tab=extensiones` |
| `/desarrolladores` | `/configuracion/integraciones?tab=api` |
| `/administracion` | `/configuracion/administracion` |
| `/gobierno-empresarial` | `/configuracion/administracion?tab=gobierno` |
| `/access-control` | `/configuracion/administracion?tab=accesos` |
| `/agencia/clientes` | `/configuracion/administracion?tab=clientes` |

Las páginas de detalle `/conexiones/web` y `/marketplace/:id` siguen como estaban.

### Paleta y atajos

- «Abrir marketplace» y «Abrir conexiones» apuntan a las nuevas rutas.
- Las secciones aparecen en la paleta como «Configuración · Empresa», «Configuración · Plan y facturación», etc.
- Los módulos fijados y recientes conservan sus identificadores, así que no se pierden preferencias guardadas.

## 3. Ficheros

- Nuevo: `src/pages/configuracion/ConfiguracionPage.jsx`, `PlanBillingPage.jsx` y `configuracion.css`.
- Reescrito: `src/components/Configuracion.jsx` (solo Mi perfil).
- Adaptados con prop `embedded`: `MoreIntegrationsPage.jsx`, `AdministrationCenterPage.jsx`, `BusinessProfilePage.jsx`.
- Rutas y registro: `src/App.jsx`, `src/lib/appNavigation.js`, `src/lib/navigationPermissions.js`, `src/lib/commandCenter.js`.
- Enlaces internos actualizados en `WebsiteIntakePage.jsx`, `MicroappRunnerPage.jsx` y `CreativeCommandCenterPage.jsx`. El resto de enlaces antiguos funcionan por redirección.

## 4. Comprobaciones

### Hechas

- `node --test src/lib/navigationState.test.mjs`: 9 de 9 en verde. El test estaba roto desde antes por referenciar el espacio `create` y módulos ya inexistentes; se ha actualizado a los ids actuales y se han añadido comprobaciones de «Más» y de las secciones de Configuración.
- `npx vite build`: compila sin errores.

### Pendientes de una sesión real

- Recorrer las cinco secciones con un usuario owner y con un viewer, y comprobar que la barra oculta Administración cuando no hay permiso.
- Comprobar en móvil que la barra de secciones se ve completa y que Integraciones y Administración muestran sus pestañas internas debajo.
- Confirmar que los enlaces guardados a `/marketplace`, `/access-control` y `/desarrolladores` aterrizan en la pestaña correcta.
