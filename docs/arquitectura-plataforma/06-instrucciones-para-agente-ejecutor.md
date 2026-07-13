# Instrucciones para el agente ejecutor

Este documento es el contrato de trabajo para implementar la arquitectura.

## Antes de tocar código

1. Leer todos los documentos de esta carpeta.
2. Ejecutar `git status --short` y no sobrescribir cambios locales del usuario.
3. Inspeccionar `src/App.jsx`, `src/components/Sidebar.jsx`, `src/components/ProtectedRoute.jsx`, `src/lib/api.js`, `backend/prisma/schema.prisma` y `backend/src/index.ts`.
4. Buscar si ya existe un modelo, ruta o componente reutilizable.
5. Presentar un plan de archivos antes de añadir un módulo nuevo.

## Reglas de modificación

- Preferir cambios pequeños y verificables.
- Usar componentes existentes antes de crear variantes.
- No reescribir toda la navegación para añadir una sola capacidad.
- No borrar rutas actuales sin crear alias y comprobar referencias.
- No tocar `.env` para implementar funcionalidades.
- No introducir datos mock en acciones que parezcan persistentes.
- No añadir dependencias sin justificarlo y actualizar el lockfile correspondiente.
- Mantener los nombres de dominio en español en UI y nombres técnicos estables en API.
- Añadir permisos explícitos a cada módulo nuevo.

## Flujo obligatorio por módulo

Para cada módulo, ejecutar este orden:

1. Definir objetivo, entidad y vistas en el registro.
2. Comprobar si el modelo existente sirve.
3. Crear o ampliar esquema Prisma.
4. Crear validadores, servicio, controlador y rutas.
5. Registrar la ruta en `backend/src/index.ts`.
6. Crear hook o función API en `src/lib/api.js`.
7. Montar la vista dentro de `ModuleShell`.
8. Añadir estados de carga, vacío y error.
9. Añadir permisos y feature flag.
10. Añadir prueba y actualizar criterios/documentación.

## Cómo decidir si crear una página

Crear una página nueva solo si cumple al menos una de estas condiciones:

- Tiene un flujo de trabajo distinto y sostenido.
- Necesita una navegación interna propia.
- Tiene datos y permisos que no encajan en una ficha existente.
- Se utiliza como dashboard operativo frecuente.

En caso contrario, crear una tab, drawer, modal, vista guardada o panel contextual.

## Contrato de respuesta al terminar una tarea

El agente debe informar:

```text
Módulo implementado:
Archivos creados:
Archivos modificados:
Endpoints añadidos:
Migraciones:
Permisos/flags:
Pruebas ejecutadas:
Riesgos o pendientes:
```

## Verificación final

Ejecutar, como mínimo:

```powershell
npm run build
Push-Location backend
npm run build
Pop-Location
git diff --check
git status --short
```

Si una orden no puede ejecutarse, informar del motivo exacto y no declarar el módulo terminado.
