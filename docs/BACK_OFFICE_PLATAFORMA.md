# Back office de plataforma

Consola de operador en `/backoffice`. Es la única parte del producto que ve y
modifica datos de **todas** las organizaciones; el resto de la aplicación sigue
filtrando siempre por el `orgId` del token.

## Puesta en marcha

```bash
cd backend
npm run db:migrate          # aplica 20260905120000_platform_back_office
npm run db:generate         # regenera el cliente Prisma

# Primer operador desde cero: organización de servicio, usuario y privilegio en
# una transacción. Imprime la contraseña una sola vez.
npm run platform:admin:create -- admin@empresa.com --name="Nombre" --org="Operaciones"

# Conceder el privilegio a alguien que ya tiene cuenta
npm run platform:admin -- tu@email.com
npm run platform:admin -- --list
npm run platform:admin -- alguien@email.com --revoke
```

Al entrar por `/login`, un operador aterriza directamente en `/backoffice` en
lugar de en `/dashboard`: su organización es de servicio y su panel está vacío.
El resto de cuentas no cambia.

Sin operadores, `/backoffice` redirige a `/dashboard` y todas las rutas
`/api/backoffice/*` responden 403. Es el estado por defecto y el correcto.

## Por qué el privilegio es un flag y no un rol

`User.isPlatformAdmin` es un booleano, no una entrada más en `UserRole`. Los
roles del catálogo RBAC (`backend/src/access-control/catalog.ts`) describen qué
puede hacer alguien **dentro de una organización**, y sus permisos se conceden
con un alcance (`own` / `team` / `org`) que siempre termina acotado por el
tenant. Este privilegio es ortogonal: cruza todos los tenants. Modelarlo como
rol habría obligado a que un catálogo pensado por organización concediera
permisos fuera de ella.

**Solo se otorga desde el servidor**, con `scripts/grant-platform-admin.mjs`.
Ninguna ruta de la API lo modifica. El motivo es directo: el back office puede
cambiar roles, planes y contraseñas de cualquier cliente; si además pudiera
crear operadores desde su propia interfaz, comprometer una sola cuenta bastaría
para hacerse persistente y revocarla dejaría de servir de nada.

## Cómo se autoriza cada llamada

`requirePlatformAdmin` (`backend/src/access-control/platformAdmin.ts`) se aplica
como hook de plugin en `routes/backOffice.ts`, de modo que una ruta nueva no
puede quedarse sin guard por olvido. En cada petición:

1. Rechaza tokens de **clave de API**. Una `ApiKey` actúa como un usuario
   concreto; si ese usuario fuese operador, un secreto de larga vida en un
   archivo de configuración heredaría acceso a todos los tenants.
2. Rechaza sesiones **suplantadas**, por claim y por fila en base de datos.
   Suplantar no encadena: desde dentro de una suplantación no se vuelve a entrar
   al back office con la identidad ajena.
3. **Reconsulta la base**, no se fía del token. Los access tokens duran 15
   minutos: sin esta consulta, retirar el privilegio dejaría una ventana de
   acceso total hasta que el token caducara.

## Auditoría

Toda escritura crea un `PlatformAuditLog` **en la misma transacción** que el
cambio, con actor, `before`/`after` y el motivo que el operador escribió (el
backend exige mínimo 8 caracteres; la UI lo pide en el mismo gesto que ejecuta
la acción).

Vive aparte de `AuditLog` por dos razones:

- `orgId` es opcional — listar usuarios no pertenece a ninguna organización.
- **No hay borrado en cascada.** El registro de que un operador archivó una
  organización debe sobrevivir a esa organización, y `actorEmail` se guarda
  desnormalizado para que borrar al operador no borre la prueba de lo que hizo.

## Suplantación

`POST /api/backoffice/impersonate` abre una `AuthSession` a nombre de otra
persona, marcada con `impersonatedByUserId`, y devuelve **solo un access token**
de 15 minutos. El secreto de refresco de esa sesión no se entrega nunca, así que:

- la suplantación no se renueva en silencio (`rotateRefreshSession` además la
  rechaza explícitamente);
- la cookie de sesión del propio operador queda intacta, de modo que recargar la
  página o pulsar «Volver a mi cuenta» lo devuelve a su identidad real;
- la sesión caduca sola a los 30 minutos y puede cortarse antes.

No se puede suplantar a otro operador de plataforma: equivaldría a heredar su
privilegio sin dejar su nombre en la auditoría de lo que se haga después.
Mientras está activa, `AppShell` pinta una barra fija con la cuenta suplantada,
quién la abrió y el tiempo restante.

## Secciones

El back office es un **espacio propio del rail**, al final y separado de la
navegación del tenant, con sus secciones en el panel local. Aparece solo para
quien lleva el privilegio: sus módulos exigen `platform.operate`, un permiso
sintético que `getEffectiveNavigationPermissions` añade a partir de
`isPlatformAdmin` y que no concede ningún rol del catálogo.

Cada sección es una ruta, no una pestaña en la query, para que la sidebar pueda
listarlas y para que un enlace a una sección concreta se pueda copiar y pegar.

| Ruta | Qué muestra | Acciones |
|---|---|---|
| `/backoffice` | Totales de plataforma, reparto por plan y por rol, últimas acciones | — |
| `/backoffice/organizaciones` | Listado con buscador y filtro de plan; detalle con miembros, claves, integraciones, wallet y actividad | Crear, editar datos y plan, activar Mautic/Metricool, ajustar saldo, gestionar miembros, revocar claves |
| `/backoffice/usuarios` | Listado con buscador, filtro de rol y de operadores; detalle con membresías, sesiones y auditoría | Editar nombre y email, resetear contraseña, cerrar sesiones, entrar como |
| `/backoffice/permisos` | Matriz completa rol × permiso con alcance, y planes con capacidades y límites | Solo lectura |
| `/backoffice/credenciales` | Sesiones (activas, caducadas, suplantaciones) y claves de API de toda la plataforma | Revocar |
| `/backoffice/auditoria` | Todo el `PlatformAuditLog` con antes/después y motivo | Filtrar |

El foco sobre una organización o una persona sí viaja en la query
(`?org=`/`?usuario=`): es un detalle dentro de la sección, no un sitio al que se
navegue desde el menú. Los enlaces antiguos con `?tab=` se traducen a su ruta.

La matriz de permisos es **de solo lectura a propósito**: el catálogo es
estático y vive en el código, donde un permiso nuevo queda denegado para todos
hasta que alguien lo añada a un rol y eso pase por revisión y despliegue.
Editarla en caliente convertiría ese control en un formulario.

## Detalles que conviene recordar

- Cambiar el rol o suspender a un miembro **revoca sus sesiones** en esa
  organización: el rol viaja dentro del JWT y `authenticate` lo compara con la
  membresía, así que sin revocar seguiría operando con el rol anterior 15
  minutos.
- Cambiar el email revoca **todas** sus sesiones: es su credencial de acceso.
- El reseteo de contraseña devuelve una contraseña temporal que se muestra una
  sola vez y **no se envía por correo**: el operador decide el canal, y la
  persona conserva el flujo normal de «he olvidado mi contraseña».
- No se puede dejar una organización sin propietario activo (`LAST_OWNER`) ni a
  un usuario sin ninguna organización (`LAST_MEMBERSHIP`).
- Las credenciales de integración se listan por proveedor, pero **el secreto
  cifrado nunca sale de la base**: el back office dice qué hay conectado, no
  permite leer las credenciales de un cliente.
