# Backend del AI Campaign Lab

La página de Ads utiliza estos endpoints autenticados bajo `/api/ads`:

- `POST /strategy`: analiza `vertical`, `objetivo`, `presupuestoMensual` y `audience`.
- `GET /draft`: recupera el borrador del usuario y organización actuales.
- `PUT /draft`: guarda el brief, estrategia y variación creativa seleccionada.
- `POST /wizard`: crea la campaña y prepara sus objetos de Meta en pausa si hay una cuenta conectada. No activa gasto automáticamente.
- `GET /campaigns/:id/status`: devuelve el estado y los IDs de Meta asociados.
- `GET /campaigns/:id/insights`: devuelve los snapshots de rendimiento guardados.
- `GET /campaigns/:id/remote-status`: consulta Meta y reconcilia el estado local.
- `POST /campaigns/:id/publish`: prepara o reintenta la publicación pausada.
- `POST /campaigns/:id/activate`: activa explícitamente la campaña en Meta; exige `ads.write` y `costs.request`.
- `POST /campaigns/:id/pause`: pausa la campaña en Meta y en el CRM.
- `PUT /campaigns/:id/max-cpl`: configura el umbral del optimizador automático.

## IA

Si existe `CLAUDE_API_KEY`, `/strategy` usa `CLAUDE_MODEL` para enriquecer la audiencia, el resumen y las recomendaciones. Si el proveedor no está configurado o falla, el backend devuelve una estrategia determinista segura para que el flujo no se rompa.

## Base de datos

El modelo `AdWizardDraft` guarda un único borrador por usuario y organización. Después de actualizar el código, ejecutar desde `backend`:

```bash
npm run db:generate
npm run db:push
```

En entornos con historial de migraciones, se puede usar `npm run db:migrate` en lugar de `db:push`. La creación de campañas sigue usando el modelo `Campaign` existente.
