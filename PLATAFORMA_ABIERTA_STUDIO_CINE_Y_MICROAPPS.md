# Vendrava abierta: plataforma multi-proveedor, Studio de Cine y catálogo de microapps

**Documento de visión de producto**  
**Fecha:** 18 de agosto de 2026  
**Estado:** propuesta estratégica; no implica que las integraciones descritas estén construidas o contratadas.

---

## 1. La tesis

Vendrava no debería definirse por las herramientas concretas que utiliza hoy. Debería convertirse en el **sistema operativo de captación, ventas, contenido y producción creativa** desde el que una empresa pueda ejecutar todo su crecimiento, conectando los proveedores que prefiera.

El cliente no compra «acceso a Higgsfield», «un modelo de voz» o «una API de vídeo». Compra resultados:

- investigar un mercado o una persona;
- encontrar y priorizar prospectos;
- preparar una entrevista o una llamada;
- crear anuncios y contenido;
- producir imágenes, vídeos y campañas completas;
- contactar, conversar, vender y hacer seguimiento;
- medir qué proveedor, contenido y flujo produce mejores resultados.

Las herramientas serán reemplazables. El método, los datos, los flujos, las aprobaciones, la memoria del negocio y el aprendizaje permanecerán en Vendrava.

> **Posicionamiento recomendado:** Vendrava es la capa que convierte modelos y aplicaciones aisladas en procesos de negocio completos.

No conviene presentarla como un simple «revendedor de IA». Eso reduce el valor percibido a precio y catálogo. Vendrava debe ser el **orquestador**, el lugar donde el trabajo empieza, se ejecuta, se revisa, se publica, se conecta con ingresos y se aprende para la siguiente vez.

---

## 2. Qué significa abrir muchísimo más la plataforma

Abrir la plataforma no consiste únicamente en añadir botones con logotipos. Significa crear una base común para que cualquier proveedor pueda participar sin obligar a reconstruir cada módulo.

### 2.1 Tres formas de consumir cada proveedor

Cada integración debería declarar cuáles de estos modos admite:

1. **Gestionado por Vendrava.** El usuario compra créditos o uso a Vendrava. Es la experiencia más sencilla y permite margen sobre consumo.
2. **Cuenta propia o BYOK.** El usuario conecta su API key, OAuth, MCP o cuenta autorizada y paga directamente al proveedor. Vendrava cobra por la plataforma, la automatización y la orquestación.
3. **Contrato empresarial.** Una agencia o empresa conecta un contrato con límites, equipos, centros de coste, almacenamiento y condiciones específicas.

La combinación es importante. Solo BYOK dificulta la entrada a clientes poco técnicos; solo créditos propios convierte a Vendrava en financiador del consumo y eleva el riesgo.

### 2.2 Catálogo de capacidades, no catálogo de marcas

La interfaz principal debe mostrar primero la tarea:

- generar una imagen de producto;
- mejorar una imagen;
- crear un vídeo vertical;
- producir una locución;
- investigar una empresa;
- transcribir y analizar una llamada;
- publicar una campaña;
- enriquecer un contacto.

Después puede mostrar:

- **Recomendado por Vendrava**;
- mejor calidad;
- más rápido;
- más económico;
- permite cuenta propia;
- permitido para uso comercial;
- disponible en la región del cliente;
- alternativa de respaldo.

El usuario normal no debería tener que conocer veinte modelos. El usuario avanzado sí debería poder elegirlos y fijarlos.

### 2.3 Objetos comunes que sobreviven a los proveedores

Vendrava necesita tratar como objetos propios:

- proyecto;
- campaña;
- persona, empresa y lead;
- brief;
- marca y guía de estilo;
- personaje y consentimiento de uso;
- guion, escena, plano y toma;
- activo: texto, imagen, audio, vídeo, documento o dataset;
- generación y sus parámetros;
- revisión, comentario y aprobación;
- publicación;
- coste, atribución y resultado comercial;
- evidencia y fuente;
- automatización y versión del flujo.

Así, una imagen creada con un proveedor puede mejorarse con otro, animarse con un tercero, incluirse en un anuncio, publicarse y atribuirse a una venta sin perder su historial.

### 2.4 El registro de capacidades de cada proveedor

Cada conector debería informar de forma normalizada:

- tareas admitidas;
- entradas y salidas;
- formatos, resoluciones, duraciones e idiomas;
- coste estimado y coste real;
- tiempo medio y estado del servicio;
- límites de uso y concurrencia;
- derechos comerciales y restricciones relevantes;
- moderación aplicada;
- regiones disponibles;
- posibilidad de BYOK;
- versiones de modelos y fechas de retirada;
- webhooks, tareas asíncronas y reintentos;
- métricas de calidad obtenidas dentro de Vendrava.

### 2.5 Router inteligente

El router no debe elegir «el mejor modelo del mundo», sino el mejor para el trabajo concreto y las restricciones del cliente.

Ejemplos:

- una prueba interna va al proveedor rápido y barato;
- la toma final de un anuncio va al de mayor calidad;
- si un modelo falla, se ofrece reintentar o usar el respaldo;
- una imagen con texto pequeño se dirige a un modelo adecuado para tipografía;
- un vídeo con personaje recurrente prioriza consistencia;
- datos sensibles solo pasan por proveedores aprobados por esa organización;
- una campaña no puede superar el presupuesto definido.

El router siempre debe dejar visible qué eligió, por qué, cuánto costó y qué alternativa había.

### 2.6 Constructor de flujos

Las capacidades se vuelven valiosas cuando se encadenan. Ejemplo de flujo:

`llamada ganada → extraer caso de éxito → redactar guion → generar storyboard → crear vídeo → mejorar resolución → subtitular → aprobar → publicar → atribuir leads y ventas`

El constructor debería ofrecer:

- recetas listas por sector y objetivo;
- editor visual para usuarios avanzados;
- variables reutilizables;
- pasos humanos de aprobación;
- ramas y condiciones;
- límites de gasto y tiempo;
- ejecución manual, programada o por evento;
- versiones, duplicación y rollback de recetas;
- registro completo de cada ejecución.

### 2.7 Biblioteca universal de activos

No basta con descargar el resultado. Cada activo debe conservar:

- origen y fuentes;
- prompt y parámetros;
- modelo y proveedor;
- coste;
- licencia o consentimiento relacionado;
- versiones y transformaciones;
- campaña, cliente y marca a los que pertenece;
- formatos publicados;
- resultados obtenidos;
- fecha de caducidad si contiene una oferta o dato temporal.

Esta genealogía del activo es una parte importante del foso competitivo: Vendrava sabrá no solo qué se creó, sino qué transformación y qué proveedor acabaron produciendo negocio.

---

## 3. Familias de proveedores que tendría sentido abrir

La lista es deliberadamente amplia. Antes de prometer una integración hay que verificar API, condiciones de reventa, uso comercial, disponibilidad geográfica y modalidad de autenticación vigente.

| Familia | Capacidades | Proveedores o vías que evaluar | Uso dentro de Vendrava |
|---|---|---|---|
| Modelos de lenguaje | redacción, razonamiento, extracción, agentes | OpenAI, Anthropic, Google, Mistral, Cohere, DeepSeek y modelos propios | investigación, informes, guiones, análisis y decisiones |
| Generación de imagen | texto a imagen, referencias, edición | OpenAI, Google, Flux mediante proveedores autorizados, Ideogram, Recraft, Stability y Magnific | anuncios, posts, storyboards, producto y marca |
| Mejora de imagen | upscale, relight, restauración, fondos | Magnific y alternativas especializadas | convertir borradores en activos publicables |
| Generación de vídeo | texto/imagen/vídeo a vídeo | Runway, Luma, Google Veo, Kling, Higgsfield y agregadores con licencia | anuncios, UGC, cine, b-roll y piezas sociales |
| Avatares y lip-sync | presentadores, clones autorizados, doblaje visual | HeyGen, Tavus, Synthesia, Hedra y otros | formación, ventas, UGC y localización |
| Voz y audio | TTS, STT, voces, música, efectos | Cartesia, ElevenLabs, OpenAI, Deepgram, AssemblyAI, proveedores musicales autorizados | llamadas, doblaje, podcasts y bandas sonoras |
| Telefonía | números, llamadas y mensajería | Twilio, Telnyx, Vonage y proveedores regionales | agentes de voz, campañas y atención |
| Publicidad | creación, publicación y medición | Meta, Google, TikTok, LinkedIn y plataformas programáticas | campañas y atribución |
| Redes y publicación | programación, inbox, métricas | APIs oficiales y herramientas autorizadas de social media | calendario editorial, publicación y escucha |
| Datos B2B | empresas, contactos, señales | proveedores autorizados, datos públicos y cuentas del cliente | prospección y enriquecimiento |
| Búsqueda e investigación | web, noticias, fuentes, documentos | buscadores, bases documentales y conectores empresariales | dossiers verificables y vigilancia |
| CRM y productividad | contactos, reuniones, email, documentos | CRM externos, calendarios, correo, almacenamiento y colaboración | sincronización y acciones de negocio |
| Comercio | catálogo, pedidos, pagos y suscripciones | Shopify, WooCommerce, Stripe y equivalentes | creatividades de producto, seguimiento e ingresos |
| Analítica | comportamiento, conversiones, errores | analítica web/producto y almacenes de datos | atribución, experimentos y alertas |

### Situación específica de Higgsfield y Magnific

- **Higgsfield:** hoy expone vías oficiales de conexión para agentes mediante MCP/CLI, utiliza la cuenta y los créditos existentes del usuario y ofrece creación de imagen/vídeo, historial y personajes consistentes. También aparecen SDK oficiales. Es un candidato natural para conexión de cuenta propia, pero hay que validar por escrito el uso dentro de un SaaS multiusuario, la redistribución y los permisos necesarios antes de comercializarla como integración nativa.
- **Magnific:** dispone de API oficial para generación, edición, vídeo y mejora de imagen, con claves, créditos, webhooks y límites. Encaja como proveedor directo o BYOK, sujeto al plan y a sus condiciones comerciales vigentes.
- **Runway:** su API oficial ya funciona como superficie multimodelo para imagen, vídeo y audio, con trabajos asíncronos y versiones de API. Puede servir como proveedor directo y también como acceso agregado, pero Vendrava debe conservar la identidad real del modelo utilizado y no crear dependencia de un único agregador.

---

## 4. El Studio de Cine de Vendrava

El Studio de Cine no debería ser «un cuadro para escribir un prompt de vídeo». Debe ser un entorno de producción con continuidad, decisiones creativas, versiones, costes y aprobación.

### 4.1 Qué podría producir

- anuncios de 6, 15, 30 y 60 segundos;
- UGC de producto;
- Reels, Shorts y TikToks;
- vídeos explicativos y de onboarding;
- casos de éxito dramatizados o documentales;
- videopodcasts y fragmentos;
- trailers y teasers;
- videoclips;
- piezas narrativas y cortometrajes;
- presentadores virtuales autorizados;
- variantes localizadas por idioma, país, oferta y audiencia;
- b-roll y material de apoyo;
- storyboards, animatics y previz aunque no se genere el vídeo final.

### 4.2 Flujo completo de una producción

1. **Objetivo y brief.** Producto, audiencia, canal, duración, CTA, presupuesto, referencias, restricciones y derechos.
2. **Investigación.** Mercado, competencia, tendencias, afirmaciones verificables y voz del cliente.
3. **Conceptos.** Tres direcciones creativas realmente distintas, con promesa, emoción, riesgo y coste estimado.
4. **Tratamiento.** Sinopsis, tono, estructura, mundo visual, ritmo y referencias.
5. **Guion.** Diálogo, voz en off, acciones, textos en pantalla y CTA.
6. **Biblia de producción.** Marca, personajes, vestuario, localizaciones, productos, paleta, lentes, iluminación y reglas de continuidad.
7. **Storyboard.** Un fotograma de referencia por plano, con versiones aprobadas.
8. **Desglose de planos.** Duración, encuadre, movimiento de cámara, acción, audio y modelo recomendado.
9. **Generación de tomas.** Proveedor elegido por plano, no necesariamente uno para toda la película.
10. **Control de continuidad.** Personajes, producto, colores, dirección de mirada, vestuario, manos, texto y raccord.
11. **Voz, música y sonido.** Locuciones, diálogo, ambientes, efectos y banda sonora con licencias registradas.
12. **Montaje.** Selección de tomas, orden, ritmo, transiciones y versiones.
13. **Postproducción.** Mejora, estabilización, upscale, color, subtítulos, grafismos, limpieza y mezcla.
14. **Control de calidad.** Errores visuales, afirmaciones, ortografía, marca, políticas del canal, derechos y duración.
15. **Aprobación.** Comentarios por fotograma, comparación de versiones y firma del responsable.
16. **Distribución.** Exportaciones por canal, relación de aspecto, duración, idioma y mercado.
17. **Aprendizaje.** Rendimiento conectado con conceptos, planos, hooks, modelos y costes.

### 4.3 Pantallas principales

- **Inicio del estudio:** proyectos activos, estado, coste, última revisión y próximos bloqueos.
- **Sala de conceptos:** propuestas creativas comparables y aprobación de dirección.
- **Guion y tratamiento:** editor asistido con fuentes y comentarios.
- **Biblia visual:** referencias aprobadas de marca, personajes, producto y localizaciones.
- **Storyboard:** tarjetas ordenables por plano.
- **Mesa de tomas:** generaciones, variantes, coste y elección de toma buena.
- **Timeline:** montaje, audio, subtítulos y grafismos; inicialmente puede ser ligera y exportar a editores profesionales.
- **Sala de revisión:** comentarios exactos por segundo o fotograma.
- **Localización:** idiomas, voces, lip-sync, textos y advertencias legales.
- **Exportaciones:** presets por plataforma y kit completo de campaña.
- **Informe:** coste por activo, tiempo ahorrado, rendimiento y aprendizaje creativo.

### 4.4 Lo que genera un proyecto además del vídeo

- brief estructurado;
- dossier de investigación con fuentes;
- conceptos descartados y aprobado;
- tratamiento;
- guion literario y técnico;
- biblia de personajes y estilo;
- storyboard y shot list;
- prompts y parámetros versionados;
- imágenes, voces, música, efectos y tomas;
- registro de derechos y consentimientos;
- subtítulos y transcripciones;
- archivos maestros y adaptaciones por canal;
- copies, miniaturas, títulos y CTA;
- informe de costes;
- informe de control de calidad;
- informe de rendimiento una vez publicado.

### 4.5 Funciones diferenciales

- **Director por objetivo:** no pregunta «¿qué quieres generar?», sino «¿qué debe conseguir esta pieza?».
- **Casting autorizado:** personas reales, avatares o personajes con alcance de consentimiento registrado.
- **Continuidad persistente:** la identidad visual no se pierde entre planos ni campañas.
- **Proveedor por plano:** acción, diálogo, producto y paisajes pueden ir a modelos diferentes.
- **Presupuesto de producción:** estimación previa, coste en tiempo real y tope duro.
- **Tomas de prueba y finales:** borradores económicos antes del render de calidad.
- **Evidencia creativa:** cada decisión puede conectarse a una objeción, dato o conversación real.
- **Derivación automática:** del master se generan anuncios, teasers, clips, GIF, imágenes, carruseles y emails.
- **Aprendizaje económico:** Vendrava aprende qué combinación de concepto, modelo y formato termina generando leads o ventas.

---

## 5. Contrato común de una microapp

Una microapp no debería ser una conversación vacía con un modelo. Toda microapp debe declarar:

1. **Promesa:** resultado concreto que obtiene el usuario.
2. **Entradas:** datos requeridos y opcionales.
3. **Fuentes y permisos:** de dónde sale la información y qué puede consultar.
4. **Proceso:** pasos visibles y decisiones principales.
5. **Salida estructurada:** informe, datos, activos o acciones; no solo texto libre.
6. **Evidencias:** enlaces, citas, fragmentos o eventos que justifican el resultado.
7. **Acciones posteriores:** guardar en CRM, crear campaña, contactar, publicar o automatizar.
8. **Coste y proveedor:** estimación y consumo real.
9. **Caducidad:** cuándo debe actualizarse el resultado.
10. **Control humano:** qué necesita aprobación antes de afectar a terceros.

Cada ejecución debe poder generar simultáneamente:

- una vista humana clara;
- datos estructurados reutilizables;
- un archivo exportable cuando tenga sentido;
- nuevas acciones dentro de Vendrava;
- un registro de fuentes, costes y versiones.

---

## 6. Catálogo largo de microapps

El catálogo siguiente contiene **80 propuestas**. Algunas amplían funciones que Vendrava ya tiene y otras abren categorías nuevas. No se recomienda construirlas todas: primero se crea el sistema común y después se publican como recetas sobre esa base.

### A. Investigación de personas, empresas y mercados

| # | Microapp | Cómo funciona | Qué genera |
|---:|---|---|---|
| 1 | **Investigador de invitados para podcast** | Recibe el nombre, perfiles y tema; reúne biografía, proyectos, entrevistas anteriores, opiniones, contradicciones, temas repetidos y huecos poco explorados. Distingue hechos, inferencias y asuntos sensibles. | Dossier verificable, cronología, mapa de temas, 20 preguntas ordenadas, repreguntas, rompehielos, asuntos que evitar y fichas rápidas para el presentador. |
| 2 | **Arquitecto de entrevista** | Parte del objetivo y tiempo disponible; convierte la investigación previa en un arco narrativo que empieza accesible, profundiza y termina con conclusiones memorables. | Escaleta por minutos, preguntas principales, repreguntas condicionales, transiciones y versiones de 15/30/60 minutos. |
| 3 | **Detector de preguntas ya contestadas** | Analiza entrevistas, posts y apariciones anteriores para evitar preguntas genéricas o repetidas; propone cómo llevar cada tema un nivel más lejos. | Lista «no preguntar así», respuestas conocidas, nuevos ángulos y preguntas de segundo orden. |
| 4 | **Brief de persona antes de una reunión** | Resume cargo, trayectoria, intereses profesionales, publicaciones y relación previa registrada en el CRM. Limita la investigación a información legítima y relevante. | Tarjeta de preparación, intereses comunes, contexto, posibles prioridades y tres aperturas naturales. |
| 5 | **Investigador de empresa 360** | Combina web corporativa, noticias, ofertas de empleo, reseñas, tecnología pública y datos conectados. Señala antigüedad y nivel de confianza. | Informe empresarial, cronología, señales de crecimiento o riesgo, responsables, iniciativas y oportunidades comerciales. |
| 6 | **Mapa de comité de compra** | Identifica o importa posibles decisores, usuarios, bloqueadores, finanzas y responsables técnicos; registra relaciones y vacíos. | Organigrama de compra, influencia, postura estimada, información faltante y plan de contacto por rol. |
| 7 | **Radar de cambios de cuenta** | Vigila cambios de dirección, contratación, financiación, expansión, nueva web, herramientas y noticias relevantes. | Feed de señales, alertas priorizadas, explicación de por qué importa y acción sugerida. |
| 8 | **Analista de mercado local** | Recibe sector y zona; estudia oferta, posicionamiento, reseñas, precios públicos, demanda y huecos. | Mapa competitivo, segmentos, oportunidades, riesgos, benchmark y lista de negocios. |
| 9 | **Cartógrafo de competencia** | Compara propuestas, páginas, anuncios, contenido, reseñas y mensajes de varios competidores sin reducirlo a una tabla superficial. | Matriz competitiva, territorios ocupados, huecos de posicionamiento, pruebas y recomendaciones. |
| 10 | **Radar de tendencias aplicadas** | Detecta tendencias y formatos recientes, pero solo propone aquellas que puedan traducirse de forma creíble a la marca y objetivo. | Tendencias clasificadas, vida útil estimada, adaptación concreta, riesgos y brief listo para producir. |
| 11 | **Investigador de categoría** | Construye una introducción profunda a un sector para un vendedor, creador o fundador que entra por primera vez. | Glosario, cadena de valor, actores, métricas, objeciones, regulaciones a verificar y mapa de oportunidades. |
| 12 | **Buscador de expertos y fuentes** | Encuentra especialistas y documentos útiles para validar una pieza o decisión; puntúa autoridad, cercanía al tema y actualidad. | Lista priorizada de expertos, fuentes primarias, vías de contacto permitidas y preguntas para cada fuente. |
| 13 | **Verificador de afirmaciones** | Descompone un guion, anuncio o informe en afirmaciones comprobables y busca evidencia adecuada; no presenta ausencia de evidencia como falsedad automática. | Tabla de claims, estado, fuentes, nivel de confianza, fecha y redacción segura alternativa. |
| 14 | **Radar regulatorio y de políticas** | Vigila cambios relevantes por sector, canal o región y dirige al usuario hacia las fuentes oficiales; no sustituye asesoramiento profesional. | Resumen de cambio, afectados, fecha, acciones de revisión y enlaces primarios. |
| 15 | **Preparador de evento o conferencia** | Analiza agenda, ponentes, asistentes conectados y objetivos del usuario para decidir dónde invertir el tiempo. | Agenda personalizada, reuniones objetivo, dossiers rápidos, preguntas y plan de seguimiento. |

### B. Prospección, ventas y revenue intelligence

| # | Microapp | Cómo funciona | Qué genera |
|---:|---|---|---|
| 16 | **Diagnóstico comercial de prospecto** | Amplía el diagnóstico web actual con reputación, campañas visibles, experiencia de contacto, madurez de conversión y señales del sector. | Puntuación explicada, problemas demostrables, impacto, oferta aconsejada, pitch y evidencias. |
| 17 | **Priorizador de cuentas** | Combina encaje, intención, necesidad observable, accesibilidad, valor y momento; explica cada puntuación y evita aparentar precisión falsa. | Ranking, segmentos, motivos, nivel de confianza y cola de trabajo diaria. |
| 18 | **Preparador de llamada** | Resume cuenta, persona, historial, posibles necesidades y objetivo concreto segundos antes de llamar. | Brief de una pantalla, apertura, preguntas, objeciones previsibles y siguiente paso deseado. |
| 19 | **Generador de apertura personalizada** | Usa una señal específica y verificable para crear una apertura natural; elimina elogios genéricos y datos invasivos. | Tres aperturas por canal, evidencia utilizada y nivel de personalización. |
| 20 | **Mapa de objeciones** | Agrupa objeciones reales de llamadas, correos y pérdidas; distingue objeción declarada, causa probable y momento del proceso. | Taxonomía, frecuencia, impacto, respuestas validadas, contenido faltante y alertas. |
| 21 | **Entrenador de discovery** | Convierte la información conocida en preguntas de descubrimiento sin repetir lo que el prospecto ya dijo. | Guion flexible, ramas según respuesta, señales de cualificación y campos a completar. |
| 22 | **Copiloto de reunión comercial** | Durante o después de una reunión captura temas, preguntas, compromisos, riesgos y lenguaje exacto del comprador. | Notas estructuradas, resumen, tareas, campos CRM, email de seguimiento y evidencia enlazada a la transcripción. |
| 23 | **Siguiente mejor acción** | Observa etapa, tiempo sin contacto, respuestas, señales y reglas comerciales; propone una acción, pero no la ejecuta externamente sin autorización. | Acción prioritaria, motivo, canal, mensaje borrador, fecha y condición de escalado. |
| 24 | **Constructor de propuesta** | Reúne discovery, alcance, caso económico, entregables, riesgos y condiciones aprobadas; reutiliza bloques controlados. | Propuesta editable, resumen ejecutivo, opciones, cronograma, supuestos y PDF/Doc exportable. |
| 25 | **Decodificador de RFP** | Extrae requisitos, fechas, criterios, documentación y riesgos de pliegos o solicitudes extensas. | Matriz de cumplimiento, preguntas, responsables, calendario, huecos y borrador de respuesta. |
| 26 | **Calculadora de caso económico** | Modela situación actual, mejora esperada, costes, escenarios y sensibilidad sin esconder los supuestos. | Business case, escenarios conservador/base/ambicioso, payback, gráficos y lista de supuestos a validar. |
| 27 | **Investigador de pérdidas** | Analiza oportunidades perdidas, mensajes y entrevistas internas para encontrar patrones controlables y no controlables. | Informe win/loss, causas con evidencia, segmentos afectados y acciones de producto o venta. |
| 28 | **Rescatador de oportunidades estancadas** | Detecta negocios sin avance, identifica el bloqueo probable y propone una intervención distinta a «solo hacer seguimiento». | Lista de rescate, diagnóstico, activo necesario, mensaje y criterio para cerrar o continuar. |
| 29 | **Radar de renovación y expansión** | Cruza uso, resultados, soporte, facturación y cambios de cuenta para señalar riesgo u oportunidad. | Health score explicado, alertas, cuentas expandibles, plan de conversación y QBR sugerido. |
| 30 | **Generador multicanal de seguimiento** | A partir de una interacción crea seguimiento coherente por email, llamada, WhatsApp o LinkedIn respetando consentimiento y canal. | Secuencia, variantes, calendario, condiciones de salida y registros listos para CRM. |

### C. Contenido, marca y campañas

| # | Microapp | Cómo funciona | Qué genera |
|---:|---|---|---|
| 31 | **Minero de voz del cliente** | Analiza llamadas, inbox, reseñas, encuestas y tickets para extraer expresiones, deseos, miedos, preguntas y objeciones. | Biblioteca de citas con procedencia, temas, lenguaje por segmento y oportunidades de contenido/oferta. |
| 32 | **Clon de voz escrita del dueño** | Aprende únicamente de textos aprobados y transcripciones autorizadas; separa rasgos de estilo de errores o datos personales. | Perfil de voz, reglas, ejemplos, palabras propias/prohibidas y textos consistentes. |
| 33 | **Director editorial** | Convierte objetivos comerciales, calendario, datos propios y canales en una estrategia con tesis y series reconocibles. | Plan mensual/trimestral, pilares, series, formatos, responsables, KPI y calendario. |
| 34 | **Un contenido, doce piezas** | Toma llamada, vídeo, artículo, webinar o caso y deriva piezas adaptadas de verdad a cada canal, no simples recortes. | Posts, carrusel, Reel, email, FAQ, artículo, clips, citas, títulos y CTA con trazabilidad. |
| 35 | **Laboratorio de hooks** | Genera hooks desde mecanismos distintos —dato, tensión, historia, contraste, demostración— y los somete a criterios de claridad y promesa. | Hooks clasificados, motivo, riesgo de cliché y versiones por canal. |
| 36 | **Fábrica de carruseles** | Aplica plantillas y reglas de marca; construye narrativa diapositiva a diapositiva y valida legibilidad móvil. | Copy por slide, diseño editable, imágenes, caption, alt text y exportaciones. |
| 37 | **Studio de posts** | Parte de evidencia, objetivo y voz; produce borradores que pasan por editor adversario, verificador y control de marca. | Post final, variantes, fuentes, imagen sugerida/generada, CTA y checklist. |
| 38 | **Fábrica de anuncios** | Transforma oferta, audiencia y pruebas en conceptos distintos; genera copies, imágenes/vídeos y adaptaciones por placement. | Kit de campaña, matriz concepto×audiencia, creatividades, copies, UTMs y hoja de aprobación. |
| 39 | **Arquitecto de UGC** | Diseña piezas que parecen experiencias reales sin inventar testimonios; define creador, situación, demostración y CTA. | Brief de creador, guion, shot list, b-roll, textos en pantalla, disclosure y variantes. |
| 40 | **Constructor de caso de éxito** | Extrae situación inicial, intervención, resultado y evidencia de CRM/llamadas; solicita aprobación del cliente cuando corresponde. | Caso largo, versión web, post, carrusel, guion de vídeo, citas aprobables y activos faltantes. |
| 41 | **Generador de newsletter** | Combina novedades, contenido propio, aprendizajes y objetivo comercial; mantiene secciones estables y evita relleno. | Newsletter, asuntos, preheaders, bloques, enlaces, segmentación y versión web. |
| 42 | **Brief SEO con intención real** | Analiza intención, competencia, preguntas, experiencia propia y relación con el producto; prioriza utilidad sobre volumen aislado. | Brief, esquema, fuentes, entidades, FAQs, enlace interno, CTA y criterio de éxito. |
| 43 | **Crítico de landing** | Recorre propuesta, jerarquía, prueba, fricción, móvil, velocidad y congruencia anuncio→página. | Informe priorizado, capturas anotadas, copy alternativo, experimentos y severidad. |
| 44 | **Guardia de consistencia de marca** | Compara cualquier activo con identidad, tono, claims aprobados, diseño y restricciones legales. | Puntuación explicada, violaciones, correcciones automáticas seguras y revisión requerida. |
| 45 | **Calendario de momentos comerciales** | Cruza sector, región, inventario, capacidad y eventos para anticipar campañas; evita efemérides irrelevantes. | Calendario anual, ventanas de preparación, briefs, dependencias y recordatorios. |

### D. Studio de Cine, vídeo, imagen y audio

| # | Microapp | Cómo funciona | Qué genera |
|---:|---|---|---|
| 46 | **Generador de conceptos cinematográficos** | Recibe objetivo, audiencia, formato y límites; propone tres mundos creativos con lógica, emoción, dificultad y coste. | Concept cards, referencias, logline, tratamiento corto, riesgos y presupuesto estimado. |
| 47 | **Guionista de anuncios** | Traduce oferta y evidencia a guiones ajustados a una duración real; calcula tiempo de diálogo y espacio para demostración. | Guiones 6/15/30/60 s, VO, acciones, texto en pantalla, CTA y variantes. |
| 48 | **Guionista narrativo** | Desarrolla premisa, personajes, conflicto, escenas y arcos manteniendo una biblia persistente. | Sinopsis, tratamiento, escaleta, guion, fichas y mapa de continuidad. |
| 49 | **Diseñador de storyboard** | Convierte cada beat del guion en planos legibles, vinculados a personajes y referencias aprobadas. | Storyboard, animatic opcional, prompts por plano, duración y notas de cámara. |
| 50 | **Arquitecto de shot list** | Decide qué planos hacen falta, cuáles pueden reutilizarse y qué proveedor encaja mejor con cada dificultad. | Shot list, orden de producción, dependencias, modelo recomendado, coste y plan B. |
| 51 | **Guardián de personajes** | Mantiene rasgos, vestuario, escala, voz, gestos y consentimiento a través de imágenes, tomas y campañas. | Biblia de personaje, referencias maestras, alertas de deriva y paquetes de entrada para modelos. |
| 52 | **Guardián de producto** | Comprueba logotipo, envase, colores, geometría, texto, tamaño y forma de uso en cada generación. | Checklist por toma, diferencias visuales, máscara/referencia y tomas a regenerar. |
| 53 | **Director de cámara virtual** | Traduce intención emocional a encuadre, lente, movimiento, profundidad, luz y ritmo comprensibles por el modelo elegido. | Plan de cámara, prompts técnicos adaptados, diagramas sencillos y alternativas. |
| 54 | **Generador de b-roll contextual** | Parte del guion, sector y biblioteca de marca; propone y genera apoyos que añaden información en vez de rellenar. | Lista de b-roll, tomas generadas/stock autorizado, puntos de inserción y licencias. |
| 55 | **Creador de presentador o avatar autorizado** | Configura apariencia, voz, pronunciación, idioma y límites de uso con consentimiento registrado. | Presentador reutilizable, vídeos, plantilla de guion, registro de autorización y fecha de revisión. |
| 56 | **Doblaje y localización visual** | Traduce por intención, adapta duración, moneda y referencias; genera voz y lip-sync cuando esté autorizado. | Masters por idioma, subtítulos, transcripción, glosario, QA lingüístico y diferencias legales. |
| 57 | **Compositor de banda sonora y efectos** | Construye mapa musical y sonoro por escena usando bibliotecas o generación con derechos claros. | Cue sheet, música, ambientes, SFX, stems, licencias y mezcla preliminar. |
| 58 | **Fábrica de trailers y cutdowns** | Identifica momentos y promesas del master; crea versiones por duración, audiencia y canal sin perder contexto. | Trailer, teasers, clips verticales, bumper, GIF, thumbnails, títulos y copies. |
| 59 | **Mejorador final con Magnific u otro proveedor** | Evalúa si la toma necesita upscale fiel, detalle creativo, relight o restauración; conserva original y compara. | Versión mejorada, comparación, parámetros, coste, artefactos detectados y aprobación. |
| 60 | **Inspector audiovisual** | Revisa parpadeos, manos, caras, texto, logo, saltos, audio, clipping, subtítulos, claims y especificaciones del canal. | Informe por timecode, severidad, correcciones automáticas posibles y bloqueo de exportación si procede. |

### E. Datos, automatización y operaciones

| # | Microapp | Cómo funciona | Qué genera |
|---:|---|---|---|
| 61 | **Médico de CSV y Excel** | Detecta columnas, formatos, codificaciones, teléfonos, fechas, filas rotas y valores inconsistentes antes de importar. | Archivo limpio, mapeo, errores separados, resumen y reglas reutilizables. |
| 62 | **Deduplicador inteligente** | Combina coincidencia exacta y aproximada con evidencia; nunca fusiona casos dudosos automáticamente. | Grupos de duplicados, confianza, propuesta de registro maestro y auditoría de cambios. |
| 63 | **Enriquecedor gobernado** | Completa datos desde fuentes autorizadas y distingue observado, proporcionado e inferido; respeta permisos y finalidad. | Campos enriquecidos, fuente, fecha, confianza, conflictos y datos rechazados. |
| 64 | **Constructor de base de conocimiento** | Importa documentos y conversaciones, detecta contradicciones, caducidad, propietarios y huecos. | Artículos, FAQs, fuentes, versiones, conflictos, preguntas sin respuesta y tareas de revisión. |
| 65 | **Minero de llamadas** | Procesa transcripciones para temas, objeciones, intención, compromisos, calidad y lenguaje del cliente. | Datos estructurados, clips, resúmenes, alertas, contenido sugerido y actualizaciones CRM. |
| 66 | **Auditor de consentimiento y contacto** | Comprueba base registrada, canal, región, horario, exclusiones y políticas antes de activar una acción. | Decisión permitida/bloqueada, motivo, evidencia, fecha y acción necesaria. |
| 67 | **Benchmark de proveedores** | Ejecuta un conjunto controlado de tareas entre proveedores y mide calidad humana/automática, tiempo, fallo y coste. | Ranking por caso de uso, muestras comparables, coste, latencia, estabilidad y recomendación. |
| 68 | **Asistente de elección de modelo** | Pregunta objetivo, calidad, datos, región, plazo y presupuesto; consulta el registro vigente de capacidades. | Modelo recomendado, alternativas, explicación, coste estimado y restricciones. |
| 69 | **Optimizador de gasto IA** | Identifica reintentos, modelos sobredimensionados, activos inútiles, caché posible y flujos caros. | Informe de ahorro, cambios simulados, impacto esperado y topes recomendados. |
| 70 | **Observador de automatizaciones** | Vigila ejecuciones, errores, esperas, reintentos, costes y resultados; agrupa fallos por causa. | Panel de salud, alertas, incidentes, ejecuciones recuperables y recomendación. |
| 71 | **Detector de anomalías de negocio** | Busca cambios atípicos en leads, contacto, conversión, gasto, contenido o soporte y comprueba causas básicas. | Alerta explicada, gráficos, segmentos afectados, hipótesis y acciones de investigación. |
| 72 | **Generador de informe ejecutivo** | Convierte métricas y eventos en una historia breve con comparativas, causas conocidas y decisiones requeridas. | Informe semanal/mensual, resumen de una página, audio/vídeo opcional y tareas. |
| 73 | **Controlador de calidad de datos CRM** | Revisa campos incompletos, etapas incoherentes, oportunidades olvidadas y responsables ausentes. | Score de higiene, cola de corrección, reglas y evolución por equipo. |
| 74 | **Traductor de procesos a playbooks** | Entrevista al responsable y observa ejemplos para convertir una forma de trabajar en pasos, decisiones y controles reutilizables. | Playbook, checklist, automatización propuesta, excepciones y material de formación. |
| 75 | **Simulador de flujo antes de activar** | Ejecuta una campaña con datos de prueba, calcula rutas, costes y acciones externas sin enviarlas. | Traza simulada, presupuesto, posibles bloqueos, datos faltantes y checklist de lanzamiento. |

### F. Customer success, soporte y reputación

| # | Microapp | Cómo funciona | Qué genera |
|---:|---|---|---|
| 76 | **Arquitecto de onboarding** | Adapta implantación a objetivos, herramientas, datos, equipo y fecha de valor esperada. | Plan, hitos, responsables, importaciones, formación, riesgos y primera victoria. |
| 77 | **Detector de huecos de soporte** | Agrupa tickets, llamadas y búsquedas sin respuesta para encontrar documentación o producto faltante. | Temas, impacto, artículos a crear, bugs candidatos y oportunidades de automatización. |
| 78 | **Preparador de QBR** | Combina objetivos, uso, resultados, incidencias y próximos hitos; diferencia actividad de valor. | Presentación/informe, ROI, logros, riesgos, roadmap conjunto y oportunidades de expansión. |
| 79 | **Minero de testimonios y reseñas** | Detecta momentos positivos verificables y solicita permiso antes de convertirlos en prueba pública. | Citas candidatas, contexto, solicitud de aprobación, caso de éxito y formatos derivados. |
| 80 | **Gestor de reputación y respuesta** | Consolida reseñas y menciones, clasifica urgencia y prepara respuestas coherentes sin inventar hechos ni discutir automáticamente. | Bandeja priorizada, borradores, escalados, temas recurrentes e informe de reputación. |

---

## 7. Las primeras microapps que construiría

No empezaría por las más espectaculares, sino por las que reutilizan datos que Vendrava ya posee y producen un salto visible de valor.

### Ola 1: demostrar el nuevo concepto

1. **Investigador de invitados para podcast.** Es demostrable, genera un entregable claro y abre investigación de personas.
2. **Investigador de empresa 360.** Alimenta prospección, llamadas y propuestas.
3. **Preparador de llamada.** Conecta investigación con el motor de voz y el CRM.
4. **Minero de voz del cliente.** Convierte las llamadas existentes en un activo que nadie externo tiene.
5. **Un contenido, doce piezas.** Hace visible la reutilización de datos propios.
6. **Fábrica de anuncios multimodelo.** Une texto, imagen, vídeo y publicación.
7. **Asistente de elección de modelo.** Explica por qué la plataforma abierta es útil.
8. **Benchmark de proveedores.** Crea criterio propio y evita que el catálogo sea puro marketing de terceros.
9. **Generador de conceptos cinematográficos.** Entrada elegante al Studio de Cine.
10. **Storyboard + shot list.** Produce valor aunque la generación final todavía se haga en varias herramientas.
11. **Mejorador final con Magnific.** Caso claro de encadenar proveedores.
12. **Inspector audiovisual.** Diferencia una plataforma profesional de un generador de clips.

### Ola 2: convertir microapps en flujos

- investigación de cuenta → priorización → preparación de llamada → seguimiento;
- llamada → objeciones → contenido → campaña;
- brief → concepto → guion → storyboard → vídeo → mejora → publicación;
- oportunidad ganada → caso de éxito → anuncio → atribución;
- reunión → propuesta → seguimiento → siguiente mejor acción.

### Ola 3: marketplace y ecosistema

- permitir que agencias creen microapps privadas para sus procesos;
- publicar plantillas verificadas por Vendrava;
- cobrar por microapp, ejecución, asiento o resultado;
- reparto de ingresos con creadores seleccionados;
- certificación de conectores y recetas;
- entornos de prueba, permisos y revisión antes de publicar;
- catálogo específico por sector: dental, legal, inmobiliario, SaaS, ecommerce, hostelería, etc.

---

## 8. Experiencia de usuario recomendada

### 8.1 Inicio orientado a objetivos

En vez de enseñar cien aplicaciones, el inicio puede preguntar:

- ¿Qué quieres conseguir hoy?
- Investigar
- Vender
- Crear contenido
- Producir un vídeo
- Lanzar anuncios
- Analizar resultados
- Automatizar un proceso

Vendrava recomienda la microapp o el flujo. La biblioteca completa queda disponible, con favoritos, recientes, colecciones del equipo y búsqueda.

### 8.2 Dos niveles de complejidad

**Modo sencillo**

- resultado primero;
- proveedor recomendado automáticamente;
- coste total visible;
- plantillas y defaults seguros;
- mínima configuración.

**Modo profesional**

- proveedor y modelo por paso;
- parámetros avanzados;
- cuentas propias;
- versiones y comparación;
- límites y políticas;
- ejecución por lotes y API.

### 8.3 Centro de conexiones

Cada conexión debe mostrar:

- estado;
- propietario;
- alcance de permisos;
- modo de facturación;
- consumo y límite;
- última utilización;
- regiones y equipos autorizados;
- fecha de expiración o error;
- botón de prueba;
- procesos que dejarían de funcionar si se desconecta.

### 8.4 Centro de trabajos

Toda generación o investigación larga debe entrar en una cola común:

- pendiente, ejecutando, esperando aprobación, completada o fallida;
- progreso y proveedor;
- coste acumulado;
- cancelación cuando sea posible;
- reintento seguro;
- alternativa si falla;
- activos y acciones producidas.

---

## 9. Seguridad, derechos y confianza

La apertura multiplica el valor y también el riesgo. Estos puntos son parte del producto, no documentación secundaria:

- secretos cifrados, aislados por organización y nunca visibles de nuevo;
- OAuth o autenticación delegada cuando el proveedor la permita;
- permisos mínimos por conector y por microapp;
- registro de quién ejecutó qué, con qué datos y en qué proveedor;
- políticas por organización sobre proveedores y regiones permitidas;
- controles de presupuesto, concurrencia y uso;
- consentimiento explícito para voz, rostro, avatar y personaje de una persona;
- alcance y caducidad del consentimiento;
- prohibición de suplantación engañosa y usos no autorizados;
- procedencia de activos, licencias y derechos comerciales;
- revisión humana para publicar, contactar, gastar o representar públicamente a alguien;
- separación estricta entre tenants;
- borrado y retención configurables;
- filtros de contenido y canal;
- señalización de contenido generado cuando corresponda;
- fuentes y nivel de confianza en informes;
- canal para disputas, retirada de activos y revocación de consentimiento;
- revisión contractual específica antes de revender acceso o compartir créditos de terceros.

---

## 10. Modelo comercial posible

### Plataforma

- suscripción por organización y asientos;
- niveles según automatizaciones, almacenamiento, aprobaciones y analítica;
- plan Agency con clientes, marca blanca, permisos y facturación separada.

### Consumo

- créditos gestionados con margen transparente;
- BYOK con cuota de orquestación incluida o adicional;
- paquetes de capacidad: investigación, vídeo, llamadas, enriquecimiento;
- límites y alertas por equipo, cliente o campaña.

### Microapps

- incluidas según plan;
- premium por ejecución o por volumen;
- paquetes por profesión o sector;
- microapps privadas para procesos internos;
- marketplace con reparto de ingresos en una fase posterior.

### Servicio

- configuración inicial;
- construcción de playbooks;
- producción creativa gestionada;
- auditoría y optimización trimestral;
- soporte y SLA empresarial.

El principio debe ser sencillo: **se cobra por la plataforma y el proceso; el consumo puede ser propio del cliente o gestionado por Vendrava**.

---

## 11. Métricas para saber si la apertura funciona

No medir únicamente número de proveedores o generaciones.

- tiempo hasta el primer resultado útil;
- porcentaje de trabajos aprobados sin regeneración;
- coste por activo aprobado;
- coste por lead, reunión y venta;
- porcentaje de flujos que mezclan dos o más capacidades;
- porcentaje gestionado frente a BYOK;
- ahorro obtenido por routing;
- tasa de fallo, reintento y cambio de proveedor;
- uso semanal de microapps por organización;
- activos reutilizados en más de una campaña;
- tiempo ahorrado estimado y validado;
- ingresos atribuidos o asistidos;
- retención por conjunto de microapps;
- número de recetas creadas y reutilizadas;
- incidencias de derechos, consentimiento o publicación;
- calidad puntuada por humanos, no solo por modelos.

La north star podría ser:

> **Resultados de negocio completados por organización cada semana mediante flujos de Vendrava.**

Una generación aislada no es necesariamente un resultado. Una investigación usada en una entrevista, un anuncio aprobado, una cita obtenida o una campaña publicada sí lo son.

---

## 12. Riesgos estratégicos

### Convertirse en un escaparate de herramientas

**Riesgo:** mucha amplitud y poca profundidad.  
**Respuesta:** vender objetivos, recomendar defaults y medir resultados de los flujos.

### Depender de proveedores que cambian

**Riesgo:** precios, modelos, límites o condiciones pueden cambiar rápidamente.  
**Respuesta:** contratos normalizados, versionado, conectores reemplazables, rutas alternativas y revisión periódica.

### Margen imprevisible

**Riesgo:** generaciones caras, reintentos y abuso.  
**Respuesta:** estimación, topes, borrador/final, BYOK, observabilidad y aprobación antes de trabajos costosos.

### Calidad inconsistente

**Riesgo:** dar acceso a más modelos no garantiza mejores activos.  
**Respuesta:** benchmark propio, microapps especializadas, QA y procesos de revisión.

### Complejidad para el cliente

**Riesgo:** selector de modelos incomprensible.  
**Respuesta:** modo sencillo por defecto, modo profesional opcional y lenguaje de tarea.

### Problemas de derechos o suplantación

**Riesgo:** voz, rostro, stock, música, testimonios y claims.  
**Respuesta:** consentimiento, procedencia, licencias, revisión y bloqueo de usos sensibles.

### Construir ochenta productos separados

**Riesgo:** duplicar interfaces, lógica y mantenimiento.  
**Respuesta:** una plataforma común de entradas, herramientas, trabajos, activos, evidencias, salidas y acciones. Cada microapp debe ser principalmente una receta especializada.

---

## 13. Decisiones que deben tomarse antes de construir

1. ¿Vendrava permitirá consumo gestionado, BYOK o ambos desde el inicio?
2. ¿Qué datos pueden salir hacia qué proveedores y regiones?
3. ¿Cuál será el contrato universal de trabajo y activo?
4. ¿Qué acciones externas requieren siempre aprobación?
5. ¿Cómo se registrarán derechos y consentimientos?
6. ¿Cuál es el primer flujo completo que demuestra el modelo multi-proveedor?
7. ¿Qué dos proveedores por capacidad evitan dependencia sin multiplicar mantenimiento?
8. ¿Qué microapps serán propias, cuáles plantillas y cuáles marketplace?
9. ¿Cómo se calcula y muestra el coste antes de ejecutar?
10. ¿Qué métrica de resultado comercial comparte toda la plataforma?

---

## 14. Recomendación final

La oportunidad no está en añadir generación de vídeo como una pestaña más. Está en que Vendrava pueda hacer esto:

> Investigar un mercado y una persona → decidir qué preguntar → grabar o generar la conversación → extraer conocimiento → convertirlo en contenido y anuncios → crear imágenes y vídeo con los mejores proveedores disponibles → mejorar y aprobar los activos → publicarlos → llamar a los leads resultantes → medir ventas → utilizar lo aprendido en la siguiente campaña.

Ningún proveedor aislado posee ese recorrido completo ni los datos que se generan dentro de él. Ese recorrido es el producto.

Vendrava debería aspirar a ser simultáneamente:

- el **CRM** donde viven personas y oportunidades;
- el **cerebro** que investiga y recomienda;
- el **orquestador** que elige y conecta herramientas;
- el **estudio** que produce activos;
- la **sala de control** que aprueba, publica y mide;
- la **memoria** que aprende qué funciona para cada negocio.

Si se construye así, añadir Higgsfield, Magnific, nuevos modelos de vídeo o futuras herramientas no cambia la identidad del producto. Solo aumenta las capacidades disponibles de un sistema que ya tiene método, datos, distribución y resultados.

---

## 15. Fuentes de referencia consultadas

Estas referencias sirven para confirmar posibilidades actuales; sus capacidades, precios y condiciones deben revisarse en el momento de contratar o implementar.

- [Higgsfield CLI y conexión MCP](https://higgsfield.ai/cli)
- [SDK oficial de Higgsfield para JavaScript/TypeScript](https://github.com/higgsfield-ai/higgsfield-js)
- [Términos de uso de Higgsfield](https://higgsfield.ai/terms-of-use-agreement)
- [Documentación oficial de Magnific API](https://docs.magnific.com/introduction)
- [Descripción y condiciones generales de Magnific API](https://www.magnific.com/ai/docs/magnific-api)
- [Documentación oficial de Runway API](https://docs.dev.runwayml.com/)
- [Modelos disponibles mediante Runway API](https://docs.dev.runwayml.com/guides/models/)
- [Documentación BYOK de Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)
- [Documentación BYOK de Vercel AI Gateway](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok)

