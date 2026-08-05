# Xarly — mapa de pantallas del MVP

Todo vive en la página actual de Redes sociales (`/redes-sociales`,
`ConectarRedesPage.jsx`), reorganizada en cuatro vistas. No se crean rutas
nuevas hasta que el circuito funcione.

## 1. Radar (vista inicial — la pantalla estrella)

Sustituye al formulario de prompt actual como primera vista.

- **Cabecera:** "Vendrava ha analizado {N} conversaciones y ha encontrado
  {M} oportunidades de contenido esta semana." N = llamadas + hilos de inbox
  del período; M = oportunidades activas.
- **Tarjetas de oportunidad** (máx. 7), cada una con:
  - Tipo: objeción / pregunta frecuente / comparación con competidor /
    señal pre-compra / frase emocional / historia de éxito.
  - Titular de la oportunidad y formato sugerido.
  - Objetivo (chip): el modo objetivo elegible al generar.
  - Evidencias: "8 menciones en 12 llamadas" + enlace "ver" que abre el
    detalle (conteos y paráfrasis; nunca transcripción cruda).
  - Acción primaria: **Generar campaña**.
- **Estado vacío honesto:** "Esta semana no hay suficientes señales para
  proponer contenido con evidencia. Conecta más llamadas o vuelve el lunes."
  (idea 26: nunca rellenar con genéricas).
- El generador libre actual (prompt manual) queda como acción secundaria
  "Crear desde una idea propia".

## 2. Estudio (generación de la campaña)

Se abre al pulsar "Generar campaña" en una tarjeta.

- Resumen de la oportunidad + selector de **objetivo** (preseleccionado
  según el tipo) y canales.
- Genera las tres piezas del MVP en paralelo: **post, carrusel (slides de
  texto) y guion de Reel** (hook 3 s + desarrollo + CTA).
- Cada pieza se muestra con la **voz del dueño** aplicada (perfil de estilo
  extraído de sus transcripciones) y las evidencias que la justifican al pie.
- Imagen por pieza: subir o generar (flujo actual, se conserva).

## 3. Sala de aprobación

Sustituye al botón suelto "crear borrador" por pieza.

- Cola de piezas pendientes con tres acciones: **Aprobar · Editar · Rechazar**.
- Rechazar exige motivo (un clic entre opciones + texto libre opcional);
  el motivo actualiza automáticamente las preferencias del negocio.
- "Aprobar todo" crea los borradores en Metricool en lote, con progreso.
- Cada pieza aprobada lleva UTM propio hacia la landing de la campaña.

## 4. Resultados

Pestaña simple al final de la página (la vista de analytics actual, enfocada).

- Las tres métricas del MVP: tiempo ahorrado, % aprobado (y sin editar),
  leads atribuidos o asistidos por pieza.
- Por pieza publicada: visitas de su UTM → leads → estado en pipeline.

## Navegación

`Radar → (Generar campaña) → Estudio → (Enviar a aprobación) → Sala → (Publicar) → Resultados`

Cada vista es una sección/pestaña dentro de la página; el estado de conexión
con Metricool se mantiene como banner superior, como hoy.
