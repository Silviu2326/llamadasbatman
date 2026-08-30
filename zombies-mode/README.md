# Umbra Protocol — modo Zombis aislado

Juego top-down de supervivencia por rondas, independiente del CRM del repositorio. No importa rutas, estilos, autenticación ni estado de Vendrava.

## Ejecutar

Desde la raíz del repositorio:

```powershell
npm run zombies:dev
```

El modo se sirve en `http://127.0.0.1:4174/`. Usa un puerto fijo y estricto para no mezclarse con el servidor del CRM.

Build independiente:

```powershell
npm run zombies:build
```

## Controles

- `WASD`: movimiento.
- Ratón: apuntar.
- Clic o `Espacio`: disparar.
- `E`: interactuar/comprar/activar secretos.
- `R`: recargar.
- `Q`, `1` y `2`: cambiar de arma.
- `Esc` o `P`: pausa.
- En pantallas táctiles aparecen controles virtuales.

## Contenido

- Tres mapas propios: Terminal Cero, Observatorio Ceniza y Jardines de la Última Luz.
- Tres sectores comprables por mapa y una red de energía ligada a la primera anomalía.
- Rondas infinitas, un evento especial cada cinco rondas y custodios con comportamiento propio.
- Dos ranuras, siete armas, Contrabando Inestable determinista y tres niveles de Forja.
- Cuatro bebidas/poderes acumulables.
- Trampa exclusiva por mapa; las trampas y mejoras avanzadas gastan componentes.
- Drops temporales de salud, munición y doble residuo.
- Un Easter egg de cinco fases por mapa con secuencias, objetivos de bajas, defensas y jefe.
- Extracción física en el mapa: activa la baliza y supera una defensa final de 30 segundos.
- Récord y misterios resueltos guardados localmente.

## Assets

Los conceptos, mapas y sprites son originales y se generaron para este módulo. `sprites-atlas.png` y `systems-v2-atlas.png` usan transparencia real extraída de atlas chroma-key. El HUD, las colisiones, proyectiles y estado de juego son code-native.
