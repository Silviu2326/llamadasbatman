# Diseño de la aplicación
Referencia visual: concepto Vendrava generado en esta conversación. Canvas blanco #fff, lateral gris frío #f3f7f7, verde #17634c, texto #142c25, borde #dfe6e7. Sin gradientes ni fotos. Tipografía system-ui, titulares 30/700, cuerpo14/400, controles14/500, line-height1.5. Sidebar226px; contenido con32px de margen; tabla de filas68px. Iconos Lucide20px stroke1.7.

Familias: shell lateral, cabecera, resumen abierto de métricas, tabla, pestañas, formulario/modal, alertas y lista de pruebas. Detalle bajo lista como referencia, formularios y tabs adicionales necesarios por la especificación. Adaptación móvil: navegación horizontal y tablas con desplazamiento contenido.

Copy base: Vendrava · Auditorías; Leads; Catálogo; Conexiones; De una web a una oportunidad comercial.; Nuevo lead; Empresas; Auditorías listas; En proceso; Buscar empresa o dominio; Importar CSV; Resumen; Comprobaciones; Demanda; Competidores; Calculadora; Informe. Todos los datos de ejemplo se etiquetan y solo aparecen tras cargar demostración.

## Verificación de la implementación

Se compararon concepto y captura a anchura nativa de 1536 px: sidebar y jerarquía principal, cabecera/acciones, tabla con selección, pestañas, fila abierta de métricas, tipografía, paleta blanca/gris frío/verde, bordes e iconos de trazo coherente. La implementación conserva la composición y el lenguaje visual. Se verificó también 390 × 844.

Variaciones funcionales explícitas respecto al boceto: búsqueda de leads, edición de ficha, auditoría de lista visible, autenticación, historial, indicadores de estado real, fecha localizada en vez de «Hoy» y aviso de demostración antes de las métricas. La tabla ordena por fecha de alta; las empresas no tienen un orden ficticio fijo. El historial alarga la pantalla más allá del concepto inicial. No se utiliza la imagen como interfaz ni se añaden fotografías o gradientes.

Los controles y el contenido se verificaron en Chromium con Playwright; no había conexión Browser/IAB disponible. Se revisaron ausencia de pantalla en blanco, errores de JavaScript, overflow global, filtros, escenarios y descarga del informe. Los cambios funcionales justifican el copy añadido; el resto mantiene las etiquetas previstas.
