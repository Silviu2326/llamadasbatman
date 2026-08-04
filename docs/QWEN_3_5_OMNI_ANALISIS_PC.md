# Qwen 3.5 Omni: calidad, ejecución local y encaje en este PC

**Fecha de comprobación:** 3 de agosto de 2026  
**Equipo analizado:** este ordenador, consultado directamente desde Windows y `nvidia-smi`  
**Objetivo:** saber si Qwen 3.5 Omni se puede ejecutar localmente, qué ofrece y si tiene sentido para un sistema de llamadas en español.

## Resumen ejecutivo

**Qwen 3.5 Omni no se puede ejecutar localmente en este PC.** En realidad, a fecha de este análisis tampoco existe una vía oficial soportada para instalar el modelo exacto en ningún PC: Alibaba ofrece Qwen 3.5 Omni como servicio cerrado mediante Qwen Chat y las API de Model Studio/QwenCloud, pero no ha publicado sus pesos.

Aunque se publicaran, este equipo seguiría muy lejos del hardware necesario. Qwen describe la familia como modelos de **cientos de miles de millones de parámetros**. Una cuantización a 4 bits necesita aproximadamente 50 GB por cada 100.000 millones de parámetros solo para los pesos, sin contar caché, activaciones, los codificadores de audio/vídeo ni el sistema operativo. La RTX 2080 SUPER tiene 8 GB de VRAM y el equipo 16 GB de RAM.

Sí se puede utilizar Qwen 3.5 Omni **por API o desde su demo web**. En ese caso, el cálculo ocurre en Alibaba Cloud y este ordenador solo captura/envía audio, vídeo o texto y reproduce la respuesta. Para este proyecto, la opción sensata sería probar primero `qwen3.5-omni-flash-realtime` por API y compararlo con la arquitectura de voz actual.

| Opción | ¿Funciona en este PC? | Veredicto |
|---|---:|---|
| Qwen 3.5 Omni local | No | Sin pesos públicos y hardware muy insuficiente |
| Qwen 3.5 Omni por API | Sí | Opción recomendada para evaluarlo |
| Qwen 3 Omni 30B-A3B local | No | Requiere decenas de GB de VRAM |
| Qwen 2.5 Omni 7B Int4 local | No de forma completa/normal | El mínimo oficial supera los 8 GB de VRAM |
| Qwen 2.5 Omni 3B con MNN cuantizado | Posible como experimento | No equivale a Qwen 3.5 Omni ni es la ruta más simple para producción |

## 1. Hardware detectado

| Componente | Especificación |
|---|---|
| CPU | Intel Core i9-9900K, 8 núcleos / 16 hilos, 3,60 GHz |
| RAM | 15,8 GB utilizables |
| GPU dedicada | NVIDIA GeForce RTX 2080 SUPER |
| VRAM real | 8.192 MiB (8 GB), confirmados con `nvidia-smi` |
| Arquitectura CUDA | Turing, capacidad de cómputo 7.5 |
| Driver NVIDIA | 560.94 |
| Sistema | Windows 10 Pro de 64 bits, versión 10.0.19045 |
| Disco C: | 464,8 GB totales; solo 10,9 GB libres |
| Disco D: | 931,5 GB totales; 478,9 GB libres |
| Disco E: | 931,5 GB totales; 528,5 GB libres |

El espacio de D: y E: sería suficiente para descargar modelos pequeños o medianos. C: está demasiado lleno para entornos CUDA, cachés y checkpoints grandes. No obstante, el cuello de botella para un modelo Omni no es el disco, sino la VRAM y la RAM.

## 2. Qué es Qwen 3.5 Omni

Qwen 3.5 Omni es una familia nativamente multimodal de Alibaba/Qwen publicada el 30 de marzo de 2026. Unifica en un solo sistema:

- entrada de texto, imágenes, audio y vídeo;
- salida de texto y voz;
- conversación de voz en tiempo real;
- comprensión conjunta de lo que se ve y se oye;
- llamadas a herramientas y búsqueda web;
- control por instrucciones del volumen, velocidad y emoción de la voz;
- clonación de voz en los alias móviles `plus` y `flash`;
- contexto de 256.000 tokens en la API estándar.

La familia pública en la nube tiene cuatro rutas principales:

| Modelo | Uso principal |
|---|---|
| `qwen3.5-omni-plus` | Máxima calidad, análisis largo y respuesta por HTTP/streaming |
| `qwen3.5-omni-flash` | Menor precio y mayor velocidad |
| `qwen3.5-omni-plus-realtime` | Conversación multimodal por WebSocket con mayor calidad |
| `qwen3.5-omni-flash-realtime` | Conversación por WebSocket priorizando velocidad/coste |

La arquitectura usa dos grandes bloques MoE (*Mixture of Experts*):

- **Thinker:** entiende y razona sobre texto, imagen, audio y vídeo.
- **Talker:** genera la voz de forma progresiva.

Utiliza una combinación de atención lineal y atención completa para secuencias largas. La tecnología **ARIA** alinea dinámicamente unidades de texto y voz para reducir saltos, errores de lectura y prosodia inestable durante el habla en streaming. La ficha técnica habla de cientos de miles de millones de parámetros y de entrenamiento con más de 100 millones de horas de contenido audiovisual. [Informe técnico de Qwen](https://arxiv.org/abs/2604.15804)

### Capacidades prácticas de la API

La documentación comercial indica:

- hasta 3 horas de audio o 1 hora de vídeo por petición no interactiva;
- reconocimiento de 113 idiomas y dialectos, incluido español;
- generación de audio en 36 idiomas en el servicio comercial;
- entrada combinada, por ejemplo texto + imágenes + audio en una petición;
- *function calling* tanto en modo estándar como en tiempo real;
- una ventana de 256K y hasta 64K de salida en los endpoints estándar;
- análisis temporal de escenas, sonidos, diálogo, OCR y subtítulos.

Fuentes: [documentación Qwen-Omni de Alibaba Cloud](https://www.alibabacloud.com/help/en/model-studio/qwen-omni), [modelos y límites de QwenCloud](https://docs.qwencloud.com/developer-guides/getting-started/vision-models) y [catálogo de endpoints de Model Studio](https://www.alibabacloud.com/help/en/model-studio/models).

## 3. Qué tal es

### Puntos fuertes

1. **Audio y vídeo son modalidades de primera clase.** No se limita a transcribir el audio antes de razonar: puede usar habla, sonidos, imagen y secuencia temporal de forma conjunta.
2. **Muy fuerte en comprensión audiovisual.** Qwen afirma resultados de estado del arte en 215 subtareas y resultados superiores a Gemini 3.1 Pro en varias pruebas de audio. Son cifras del fabricante, pero la amplitud de la evaluación es notable.
3. **Buen encaje lingüístico.** El español figura entre los idiomas admitidos para entrada y salida de voz.
4. **Conversación de voz end-to-end.** Evita parte de la latencia acumulada de una cascada STT → LLM → TTS y conserva más información prosódica.
5. **Preparado para agentes.** Los modelos 3.5 Omni permiten llamadas a funciones y búsqueda web; esto facilita consultar CRM, agenda, catálogo o estado de una oportunidad.
6. **Entradas largas.** Resulta atractivo para resumir reuniones, auditar llamadas y analizar vídeos extensos.
7. **Plus y Flash permiten clonación de voz.** La API admite una muestra de referencia de 10–20 segundos, según la [documentación oficial de clonación](https://www.alibabacloud.com/help/en/model-studio/qwen-omni-voice-cloning).

### Límites y riesgos

1. **No es autoalojable.** No hay checkpoint oficial de Qwen 3.5 Omni; se depende del proveedor, sus precios, sus regiones y su disponibilidad.
2. **Los tamaños exactos de Plus y Flash no son públicos.** Saber que son MoE no permite calcular un requisito local preciso. MoE reduce los parámetros activos por token, pero todos los expertos siguen necesitando memoria o transferencia.
3. **Sin modo de pensamiento profundo en 3.5 Omni.** La documentación de Model Studio marca *thinking mode* como no soportado para esta familia. Para una conversación rápida puede ser una ventaja; para razonamiento largo puede ser una limitación.
4. **Privacidad y cumplimiento.** Audio, vídeo, voz clonada y datos del CRM saldrían hacia Alibaba Cloud. Antes de producción hay que validar región, contrato de tratamiento, retención, consentimiento, grabación y transferencias internacionales.
5. **Los benchmarks principales proceden de Qwen.** Son útiles, pero no sustituyen una prueba con llamadas españolas reales, ruido telefónico, interrupciones y nombres propios.
6. **Percibir emoción no garantiza usarla bien.** Un estudio independiente de junio de 2026 encontró que Qwen 3.5 Omni Plus/Flash y otros sistemas líderes podían reconocer miedo, llanto o sarcasmo cuando se les preguntaba directamente, pero no siempre incorporaban esa señal al tomar decisiones. No se debe confiar al modelo una transferencia bancaria, consentimiento, alta o cierre de llamada basándose solo en el tono. [Estudio “Real-Time Voice AI Hears but Does Not Listen”](https://arxiv.org/abs/2606.26083)

## 4. Por qué no cabe localmente

### El Qwen 3.5 Omni exacto

No se ha publicado un repositorio oficial con pesos descargables de Qwen 3.5 Omni. La documentación ofrece identificadores de modelo y endpoints de nube, y la organización oficial de Qwen mantiene los pesos abiertos del Qwen 3 Omni anterior, no los de 3.5 Omni. Por tanto, no hay un comando válido de Ollama, llama.cpp, Transformers o vLLM que convierta este PC en un servidor local del modelo exacto.

Además, el informe lo sitúa en la escala de cientos de miles de millones de parámetros:

```text
100.000 millones de parámetros × 4 bits ≈ 50 GB de pesos
200.000 millones de parámetros × 4 bits ≈ 100 GB de pesos
```

Estas cifras no incluyen caché KV, activaciones, vision/audio encoders, Talker ni memoria de ejecución. El PC suma 8 GB de VRAM y 16 GB de RAM. La diferencia no se resuelve con una cuantización normal ni con *CPU offload*.

### Comparación con los modelos Omni abiertos anteriores

Los requisitos oficiales de modelos bastante más pequeños muestran la distancia:

| Modelo abierto | Modalidad/precisión | Memoria oficial para vídeo de 15 s | Frente a este PC |
|---|---|---:|---|
| Qwen 3 Omni 30B-A3B Instruct | BF16 | 78,85 GB de GPU | Casi 10 veces la VRAM disponible |
| Qwen 3 Omni 30B-A3B Thinking | BF16 | 68,74 GB de GPU | Más de 8 veces la VRAM disponible |
| Qwen 2.5 Omni 3B | BF16 | 18,38 GB teóricos; en la práctica ≥1,2× | No cabe en 8 GB y rebasa la RAM práctica |
| Qwen 2.5 Omni 7B | GPTQ Int4 | 11,64 GB | No cabe en 8 GB |
| Qwen 2.5 Omni 7B | AWQ Int4 | 11,77 GB | No cabe en 8 GB |

El consumo crece con la duración: Qwen 3 Omni Instruct llega a 144,81 GB para 120 segundos de vídeo; Qwen 2.5 Omni 7B Int4 ronda 17,4–17,8 GB para 30 segundos.

Fuentes oficiales: [Qwen 3 Omni: requisitos mínimos](https://github.com/QwenLM/Qwen3-Omni#usage-tips-recommended-reading) y [Qwen 2.5 Omni: requisitos y modo de baja VRAM](https://github.com/QwenLM/Qwen2.5-Omni#minimum-gpu-memory-requirements).

### La única alternativa local razonable para experimentar

Qwen 2.5 Omni 3B cuenta con una conversión MNN cuantizada que en móviles registró un pico aproximado de 3,6 GB. Podría ser objeto de una prueba técnica en este ordenador, pero:

- no es Qwen 3.5 Omni;
- es sensiblemente menos capaz;
- el dato de 3,6 GB procede de SoC móviles y del runtime MNN, no de Transformers/CUDA en Windows;
- la integración y el soporte son menos directos;
- no debería asumirse voz en tiempo real fluida sin medirla.

Si el objetivo es mejorar llamadas comerciales ahora, invertir tiempo en forzar esta ruta probablemente aporta menos que evaluar el endpoint Flash Realtime o mantener una cascada local modular.

## 5. Coste orientativo de la API

Los precios publicados por QwenCloud el 3 de agosto de 2026, por millón de tokens, son:

| Modelo | Entrada texto/imagen/vídeo | Entrada audio | Salida texto | Salida texto + audio |
|---|---:|---:|---:|---:|
| `qwen3.5-omni-flash` | 0,40 USD | 3,00 USD | 2,20 USD | 11,90 USD |
| `qwen3.5-omni-plus` | 1,40 USD | 11,00 USD | 8,30 USD | 44,00 USD |

Conversión publicada: unas 7 unidades de token por segundo de audio de entrada y 12,5 por segundo de audio generado. Fuente: [precios oficiales de QwenCloud](https://docs.qwencloud.com/developer-guides/getting-started/pricing).

Ejemplo muy aproximado de una llamada de 10 minutos, suponiendo 5 minutos de habla del cliente y 5 minutos del agente:

| Modelo | Entrada de voz | Salida de voz | Total aproximado de modelo |
|---|---:|---:|---:|
| Flash | 0,0063 USD | 0,0446 USD | **0,051 USD/llamada** |
| Plus | 0,0231 USD | 0,1650 USD | **0,188 USD/llamada** |

No incluye telefonía, búsqueda web, texto adicional, almacenamiento, clonación de voz, reintentos, silencios facturables ni impuestos. El precio real debe medirse con el campo `usage` de la API y confirmarse en la región contratada.

## 6. Encaje en este CRM de llamadas

Qwen 3.5 Omni es interesante como **motor remoto experimental de conversación**, especialmente por audio nativo, interrupción semántica y llamadas a herramientas. No debería recibir autoridad directa sobre cumplimiento, opt-out, transferencias o cambios de CRM.

Arquitectura recomendada:

```text
telefonía / WebSocket
        ↓
controlador local de sesión y cumplimiento
        ↓
Qwen 3.5 Omni Flash Realtime por API
        ↓
tool calls validadas por el backend
        ↓
CRM / agenda / catálogo / transferencia humana
```

El backend debe conservar:

- autenticación y autorización;
- reglas de consentimiento, grabación y opt-out;
- validación de argumentos de cada herramienta;
- límites de importe y acciones permitidas;
- registro auditable de decisiones;
- posibilidad de interrumpir al modelo y transferir a una persona;
- política explícita para no actuar solo por emoción inferida.

## 7. Prueba recomendada

1. Crear un piloto aislado con `qwen3.5-omni-flash-realtime` y una voz estándar, sin clonación.
2. Usar 30–50 guiones reales en español: saludo, objeciones, datos deletreados, silencios, `mmm`, interrupciones, ruido y solicitud de baja.
3. Permitir únicamente herramientas de lectura en la primera fase.
4. Comparar contra la arquitectura actual con las mismas grabaciones.
5. Medir:
   - latencia de primera respuesta p50/p95;
   - tiempo hasta interrupción efectiva;
   - errores de transcripción de nombres, cifras y teléfonos;
   - exactitud de las llamadas a herramientas;
   - alucinaciones y promesas no autorizadas;
   - naturalidad valorada por hablantes españoles;
   - coste por minuto y por llamada completada;
   - tasa de opt-out y transferencia ejecutadas correctamente.
6. Probar Plus solo en los casos donde Flash falle por calidad, para comprobar si la diferencia justifica aproximadamente 3,7 veces más coste de voz en el ejemplo anterior.

## 8. Recomendación final

**No comprar hardware para intentar ejecutar Qwen 3.5 Omni localmente.** No hay pesos oficiales y una RTX 2080 SUPER de 8 GB no está cerca de la escala requerida.

Para este proyecto:

- **mejor forma de probar Qwen 3.5 Omni:** API `flash-realtime`;
- **mejor forma de conservar privacidad/control local:** continuar con una cascada modular local y comparar resultados;
- **experimento local opcional:** Qwen 2.5 Omni 3B cuantizado con MNN, solo como laboratorio;
- **si se quiere un Omni abierto serio:** usar GPU de servidor/alquiler para Qwen 3 Omni 30B-A3B, no este PC;
- **decisión de producción:** basarla en un A/B con llamadas españolas y cumplimiento real, no solo en benchmarks.

## Fuentes consultadas

- [Qwen3.5-Omni Technical Report (Qwen Team, abril de 2026)](https://arxiv.org/abs/2604.15804)
- [Qwen-Omni en Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/qwen-omni)
- [Catálogo de modelos y endpoints de Alibaba Cloud](https://www.alibabacloud.com/help/en/model-studio/models)
- [Límites de modelos QwenCloud](https://docs.qwencloud.com/developer-guides/getting-started/vision-models)
- [Precios de QwenCloud](https://docs.qwencloud.com/developer-guides/getting-started/pricing)
- [Repositorio oficial de Qwen 3 Omni abierto](https://github.com/QwenLM/Qwen3-Omni)
- [Repositorio oficial de Qwen 2.5 Omni abierto](https://github.com/QwenLM/Qwen2.5-Omni)
- [Estudio independiente sobre el uso de señales emocionales](https://arxiv.org/abs/2606.26083)

---

**Nota de vigencia:** disponibilidad de pesos, modelos, límites y precios puede cambiar. Conviene volver a comprobar las páginas oficiales antes de desplegar o contratar capacidad.
