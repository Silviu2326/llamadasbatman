# Opciones de despliegue para Vendrava Voice Modular y Vendrava Duplex

Fecha: 2026-07-25  
Objetivo: desplegar las dos arquitecturas de llamadas en inglés usando modelos y servicios autoalojados.

## 1. Resumen ejecutivo

La recomendación es separar el plano de control de los workers GPU:

```text
Internet / Twilio
        |
        v
Node + Fastify + Prisma + Redis
  auth · CRM · Policy Engine · opt-out · AMD · transferencias
        |
        +------------------------------+
        |                              |
        v                              v
Voice Modular :9100             Voice Duplex :9200
STT + LLM + TTS local           Moshi/Mimi + STT tap
        |                              |
        +---------- red privada -------+
```

### Decisión recomendada

| Fase | Despliegue | Motivo |
|---|---|---|
| Desarrollo actual | Máquina local + `Voice Modular` | No requiere Moshi ni una GPU grande para validar CRM, telefonía y contrato |
| Primer canario | RunPod Secure Cloud L40S 48 GB o Scaleway L40S 48 GB | Permite ejecutar `Voice Duplex` con pesos reales y medir latencia |
| Primeros clientes | Node/DB separados + worker modular estable + worker dúplex canario | Aísla el riesgo del modelo full dúplex |
| Producción estable | GPU dedicada L40S/A100 y despliegue Docker o Kubernetes | Evita cold starts y permite reinicio controlado |
| Entrenamiento `Moshi-Call-EN` | GPU A100/H100 temporal, con checkpoints en almacenamiento persistente | No mezclar entrenamiento con el servicio de llamadas |

El PyTorch oficial de Moshi indica que su ruta necesita una GPU con aproximadamente 24 GB de memoria y no ofrece cuantización PyTorch general; por eso una tarjeta de 24 GB es el mínimo técnico, no el tamaño recomendado para ejecutar además STT, TTS, logging y un LLM. [Repositorio oficial de Moshi](https://github.com/kyutai-labs/moshi)

## 2. Requisitos por modo

### `Vendrava Voice Modular`

```text
faster-whisper -> vLLM/Qwen -> Piper/Kokoro/Qwen3-TTS
```

- Puede funcionar con una GPU de 16–24 GB si el STT, LLM y TTS se dimensionan cuidadosamente.
- Para una operación cómoda, usar 24–48 GB.
- Es más sencillo repartir componentes entre CPU y GPU.
- Puede degradar a modelos menores si aumenta la concurrencia.
- Es el modo adecuado para los primeros clientes.

### `Vendrava Duplex`

```text
PCM 16 kHz -> resample -> Mimi 24 kHz -> Moshi -> Mimi -> PCM 24 kHz
                         + faster-whisper paralelo para Node
```

- Requiere GPU NVIDIA Linux y una instalación compatible de PyTorch/Moshi.
- Mínimo práctico: 24 GB sólo para un canario muy controlado.
- Recomendado: L40S 48 GB o A100 40/80 GB.
- El gateway actual limita deliberadamente a una sesión Moshi por GPU hasta validar batching.
- Debe mantenerse caliente: el arranque y la carga de pesos no pueden estar en el camino crítico de una llamada.

### Capacidad inicial orientativa

No es un SLA. Hay que medir P95 con audio PSTN, STT paralelo y el modelo elegido.

| GPU | Modular | Duplex base | Recomendación |
|---|---:|---:|---|
| RTX 2080 Super 8 GB | Desarrollo limitado | No | La máquina actual sirve para contrato y simulación, no para Moshi PyTorch |
| RTX 4090 24 GB | Posible con modelos pequeños | Mínimo/borderline | Staging; no compartir con varios servicios sin medir OOM |
| L4 24 GB | Modular ajustado | Mínimo/borderline | Sólo canario económico; menor margen térmico/memoria |
| L40S 48 GB | Cómodo | Recomendado | Primera opción para producción pequeña |
| A100 40/80 GB | Cómodo y más margen | Recomendado para carga/entrenamiento | Mejor para benchmark y fine-tuning |
| H100 80 GB | Exceso para primeros clientes | Excelente | Entrenamiento o alta concurrencia, no primera compra |

## 3. Proveedores y formas de despliegue

### Opción A — RunPod Secure Cloud / Pods

RunPod ofrece Pods dedicados y distingue Community Cloud de Secure Cloud. Su página de precios actualizada el 17 de julio de 2026 muestra, entre otras opciones, L40S 48 GB, A100 80 GB, RTX 4090 24 GB y L4 24 GB. [Precios oficiales de RunPod](https://www.runpod.io/pricing)

#### Referencias de precio observadas

| GPU | Precio publicado | Aproximación 730 h |
|---|---:|---:|
| RTX 4090 24 GB | US$0,69/h | US$504/mes |
| L40S 48 GB | US$0,99/h | US$723/mes |
| A100 PCIe 80 GB | US$1,39/h | US$1.015/mes |

Son cifras orientativas de la tabla pública y no incluyen necesariamente almacenamiento, tráfico, impuestos ni diferencias entre Community/Secure. Los precios y la disponibilidad cambian.

#### Encaje

- Muy bueno para probar `Voice Duplex` con una L40S.
- Muy bueno para entrenamientos temporales con A100.
- Pods dedicados son preferibles a serverless para llamadas: mantienen el modelo caliente.
- Secure Cloud es preferible a Community para tráfico de clientes y datos sensibles.

#### Riesgos

- Dependencia de disponibilidad por región.
- Hay que configurar persistent volume, backup y firewall.
- No debe exponerse el WebSocket de voz directamente a Internet.
- El precio bajo no sustituye una revisión de residencia y tratamiento de datos.

### Opción B — Scaleway GPU Instances / Elastic Metal

Scaleway ofrece L4, L40S y H100 en Europa. La instancia L40S publica 48 GB de VRAM, 96–768 GB de RAM, almacenamiento scratch y disponibilidad en París y Varsovia; el precio de referencia publicado es desde €1,47/h. [L40S oficial de Scaleway](https://www.scaleway.com/en/l40s-gpu-instance/)

La modalidad Elastic Metal publica un servidor fijo con 2×L40S 48 GB por aproximadamente €1.499,99/mes. [Elastic Metal Titanium](https://www.scaleway.com/en/elastic-metal/titanium/)

#### Encaje

- Mejor opción si se prioriza infraestructura europea y un worker GPU persistente.
- L40S 48 GB es adecuada para el canario dúplex.
- La opción 2×L40S permite separar Modular y Duplex físicamente.
- Tiene integración nativa con Kubernetes/Kapsule.

#### Riesgos

- El scratch storage es efímero; los pesos deben vivir en Block Storage u Object Storage.
- Hay que confirmar disponibilidad de la zona concreta antes de comprar.
- El coste continuo es mayor que un marketplace si el uso es muy esporádico.

### Opción C — OVHcloud Public Cloud / AI Deploy

OVHcloud publica instancias L40S de 48 GB y L4 de 24 GB, además de un producto AI Deploy que levanta réplicas Docker con mínimo y máximo de nodos. La tabla actual muestra L40S alrededor de US$1,69–1,80/h según la modalidad y L4 alrededor de US$0,91–1/h. [Precios oficiales de OVHcloud](https://www.ovhcloud.com/en/public-cloud/prices/)

#### Encaje

- Buena opción europea para empaquetar `moshi_gateway.py` como contenedor.
- AI Deploy puede encajar mejor para el modo modular si se necesita réplica automática.
- L40S ofrece margen suficiente para Moshi + STT.
- Adecuado si ya se quiere concentrar red, almacenamiento y contenedores en un proveedor europeo.

#### Riesgos

- La modalidad administrada puede tener restricciones distintas a una VM GPU completa.
- Hay que comprobar si AI Deploy mantiene conexiones WebSocket largas de llamadas sin timeout.
- El coste puede ser superior al de RunPod para el mismo hardware.

### Opción D — Vast.ai

Vast.ai es un marketplace donde el precio se fija en tiempo real por host, región y fiabilidad. La documentación oficial indica que el coste incluye GPU, almacenamiento y ancho de banda, y que las instancias interruptibles pueden pausarse. [Precios y modelo de Vast.ai](https://docs.vast.ai/guides/instances/pricing)

#### Encaje

- Excelente para benchmark, entrenamiento barato y pruebas de carga.
- Útil para comparar RTX 4090, RTX 6000, L40S o A100.
- Puede reducir mucho el coste de un experimento de pocas horas.

#### No lo usaría como primera producción

- El host puede cambiar o interrumpir el servicio.
- La residencia física y el nivel de confianza del host requieren revisión.
- El almacenamiento continúa facturándose aunque la instancia esté parada.
- No es el sitio adecuado para audio de clientes sin una evaluación de privacidad y aislamiento.

### Opción E — Lambda Cloud

Lambda ofrece máquinas GPU Linux con imágenes que incluyen drivers NVIDIA, CUDA, PyTorch, Docker y otras herramientas. Su catálogo incluye A10 de 24 GB, A6000 de 48 GB, A100 de 40/80 GB y H100 de 80 GB. [Instancias On-Demand de Lambda](https://docs.lambda.ai/public-cloud/on-demand/)

#### Encaje

- Buena opción para entrenamiento de `Moshi-Call-EN` y experimentos reproducibles.
- A100/H100 aportan margen de memoria para checkpoints, LoRA y datasets.
- La imagen preinstalada reduce el trabajo inicial de drivers.

#### Riesgos

- Menos orientado a la optimización de coste de un único worker de llamadas que RunPod.
- Hay que revisar regiones, precio actual, almacenamiento y permanencia de la instancia.
- La documentación indica que la facturación de filesystem puede continuar mientras exista aunque no esté montado; hay que apagar recursos sobrantes.

### Opción F — AWS EC2 GPU

AWS ofrece familias aceleradas como G5/A10G y G6/L4, además de familias mayores para A100/H100. La documentación oficial lista las capacidades de cada instancia; la tarifa final depende de región, modalidad On-Demand, Savings Plan o Spot. [Especificaciones oficiales de EC2 acelerado](https://docs.aws.amazon.com/ec2/latest/instancetypes/ac.html)

#### Encaje

- Útil si ya existe VPC, IAM, CloudWatch, backups y requisitos empresariales en AWS.
- Modular puede funcionar con una familia de 24 GB si se controla el tamaño de modelos.
- Duplex debería usar una GPU con margen superior al mínimo, no una fracción de L4.
- Spot puede servir para entrenar, no para una llamada en curso.

#### Riesgos

- Coste y complejidad operativa mayores.
- La disponibilidad GPU por región puede bloquear el despliegue.
- Hay que evitar que el audio salga de la VPC o se registre accidentalmente en logs.

## 4. Despliegue por topología

### Perfil 1 — Un solo servidor GPU dedicado

```text
Servidor GPU Linux
  ├─ Node/Fastify
  ├─ voice-engine modular :9100
  ├─ moshi_gateway        :9200
  ├─ vLLM
  ├─ Redis
  └─ PostgreSQL externa o gestionada
```

#### Ventajas

- Menor coste y latencia interna.
- Operación sencilla para pocos clientes.
- Datos y modelos quedan juntos.

#### Inconvenientes

- Un fallo afecta a CRM y voz a la vez.
- Modular y Duplex compiten por VRAM.
- El proceso Moshi actual sólo admite una sesión por GPU.

#### Uso recomendado

Staging o primeros clientes con **una sola variante activa**. No es mi primera opción para ejecutar ambos modos críticos simultáneamente.

### Perfil 2 — Control plane separado y dos workers GPU

```text
CPU node / managed VM
  ├─ Fastify + Prisma + Redis
  └─ private network
       ├─ GPU worker A: Voice Modular :9100
       └─ GPU worker B: Voice Duplex  :9200
```

#### Ventajas

- Comparación A/B limpia.
- Un OOM de Moshi no tira el CRM.
- Se puede reiniciar un worker sin terminar toda la plataforma.
- Cada modo puede usar una GPU distinta.

#### Inconvenientes

- Dos GPUs o dos alquileres.
- Más observabilidad, firewall y despliegue.

#### Uso recomendado

**Arquitectura recomendada para los primeros clientes y el canario dúplex.**

### Perfil 3 — Kubernetes con node pools

```text
Kubernetes
  ├─ node pool CPU: Node, Redis, workers
  ├─ node pool GPU modular: vLLM/STT/TTS
  └─ node pool GPU duplex: Moshi/Mimi/STT
```

#### Ventajas

- Réplicas, health checks y despliegues versionados.
- A/B por porcentaje y rollback.
- GPU pools separados con taints y tolerations.

#### Inconvenientes

- No resuelve la memoria del modelo por sí mismo.
- Requiere persistencia, secretos, ingress WebSocket y observabilidad.
- Puede ser demasiado complejo antes de tener tráfico real.

#### Uso recomendado

Cuando haya varios clientes, más de una GPU o necesidad de alta disponibilidad. Scaleway documenta integración nativa de L40S con Kubernetes/Kapsule. [Scaleway L40S](https://www.scaleway.com/en/l40s-gpu-instance/)

### Perfil 4 — Serverless GPU

RunPod Serverless y Vast Serverless pueden escalar workers y cobrar por tiempo activo. RunPod publica precios serverless por segundo y Vast indica que su serverless factura el coste subyacente de la instancia. [RunPod Serverless](https://docs.runpod.io/serverless/pricing), [Vast Serverless](https://docs.vast.ai/serverless/pricing)

No lo usaría para el camino crítico de una llamada full dúplex al principio:

- el cold start de pesos puede superar la tolerancia del teléfono;
- se necesita una conexión WebSocket larga y estable;
- el coste de mantener un worker caliente puede acercarse a un Pod dedicado;
- el escalado debe preservar sesión, audio pendiente y cancelación.

Sí es útil para:

- transcribir grabaciones después de la llamada;
- evaluar llamadas;
- generar datasets;
- entrenar o probar checkpoints;
- tareas que no tienen latencia telefónica.

## 5. Persistencia y seguridad

La GPU no debe ser el punto de entrada público de la plataforma.

```text
Internet -> reverse proxy / Node -> red privada -> GPU workers
```

Medidas mínimas:

- Sólo Node publica el WebSocket de telefonía.
- `VOICE_ENGINE_TOKEN` y `VOICE_DUPLEX_ENGINE_TOKEN` deben ser secretos separados.
- El worker GPU no recibe credenciales de Prisma, Twilio ni CRM.
- Egress limitado: el worker sólo necesita acceder a modelos, LLM local y almacenamiento autorizado.
- Modelos en volumen persistente; nunca depender sólo de scratch disk.
- TLS en el tramo externo y firewall entre control plane y workers.
- Logs sin audio ni transcript completo por defecto.
- Retención y borrado de audio según consentimiento y política de llamadas.
- Health check distinto de readiness: `/health` no carga pesos; `/capabilities` no demuestra inferencia.
- Readiness real debe comprobar carga del modelo, memoria libre y capacidad de aceptar una sesión.

## 6. Estrategia de costes

### Uso esporádico: menos de 100 horas/mes

- RunPod Pod bajo demanda o Vast.ai para investigación.
- Apagar GPU cuando no haya campañas.
- Mantener Node/DB en una VM CPU barata.
- No usar serverless para llamadas hasta medir cold start.

### Uso regular: 8 horas/día, 22 días/mes

- Un worker L40S para la variante activa.
- Modular como producción y Duplex sólo en un porcentaje pequeño.
- Mantener modelos descargados en volumen persistente.
- Estimar además egress, almacenamiento, snapshots y STT/TTS auxiliar.

### Uso continuo: 24/7

- Comparar mensual fijo, dedicado y cloud por hora.
- Una L40S 24/7 a €1,47/h son aproximadamente €1.073/mes antes de almacenamiento, red e impuestos.
- Dos L40S dedicadas en Elastic Metal son aproximadamente €1.500/mes según la tarifa publicada, pero la capacidad y condiciones deben confirmarse al contratar.
- Para dos modos simultáneos, dos GPUs separadas dan una comparación más limpia que compartir una sola GPU.

La cuenta correcta no es sólo `precio GPU / minutos`. Hay que calcular:

```text
coste/minuto real =
  (GPU + CPU + RAM + disco + red + backups + operación)
  / minutos de audio procesados
```

Y separar:

- minutos de conversación;
- tiempo ocioso de GPU caliente;
- coste de carga de modelo;
- llamadas fallidas;
- llamadas transferidas;
- coste de evaluación y transcripción posterior.

## 7. Plan de despliegue recomendado

### Paso 1 — Staging

1. Mantener Node y base de datos fuera de la GPU.
2. Lanzar RunPod Secure L40S o Scaleway L40S.
3. Ejecutar `Voice Modular` en :9100.
4. Ejecutar `Voice Duplex` en :9200.
5. Configurar `VOICE_ENGINE_ARCHITECTURE=modular`.
6. Crear un experimento con 5–10 % `{"architecture":"duplex"}`.

### Paso 2 — Validación de audio

1. Ejecutar [smoke_duplex.py](../voice-engine/smoke_duplex.py).
2. Reproducir 100 conversaciones simuladas en inglés.
3. Probar PSTN, ruido, silencios, buzón, gatekeeper e interrupciones.
4. Medir P50/P95 de primer audio, barge-in, coste/minuto y errores.

### Paso 3 — Primeros clientes

1. Modular al 90–95 % de llamadas.
2. Duplex sólo en canario controlado.
3. Transferencia humana como salida segura.
4. No guardar audio de investigación sin consentimiento.
5. Revisar cada llamada dúplex con métricas y evaluación humana.

### Paso 4 — Producción estable

1. Pasar Modular a un worker GPU dedicado.
2. Mantener Duplex en otro worker o apagarlo cuando no se experimente.
3. Añadir réplica de Node y failover del worker.
4. Implementar readiness real y circuit breaker.
5. Sólo aumentar Duplex cuando no empeore CRM, opt-out, transferencia o conversión.

## 8. Ranking final

| Puesto | Opción | Modular | Duplex | Coste | Operación | Privacidad | Uso recomendado |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | Scaleway L40S / 2×L40S | 9/10 | 9/10 | 7/10 | 8/10 | 9/10 | Producción europea y dos workers |
| 2 | RunPod Secure L40S | 9/10 | 9/10 | 9/10 | 8/10 | 7/10 | Mejor primera prueba real |
| 3 | OVHcloud L40S / AI Deploy | 9/10 | 8/10 | 7/10 | 8/10 | 9/10 | Producción europea con Docker |
| 4 | Lambda A100/H100 | 8/10 | 10/10 | 5/10 | 8/10 | 7/10 | Entrenamiento y benchmark potente |
| 5 | AWS GPU | 8/10 | 8/10 | 4/10 | 10/10 | 8/10 | Empresas ya integradas en AWS |
| 6 | Vast.ai | 8/10 | 8/10 | 10/10 | 4/10 | 4/10 | Investigación y cargas interruptibles |
| 7 | Serverless GPU | 7/10 | 5/10 | 8/10 | 6/10 | 6/10 | Evaluación y batch, no llamadas críticas |
| 8 | RTX 2080 Super actual | 5/10 | 1/10 | 10/10 | 6/10 | 10/10 | Desarrollo de backend y simulación |

## Veredicto

Para empezar ahora:

1. **RunPod Secure L40S** para validar rápido el gateway Moshi y conservar flexibilidad.
2. **Scaleway L40S** si se priorizan región europea, persistencia y un servicio más estable.
3. Separar Node/CRM de la GPU desde el principio.
4. Mantener Modular como producción y Duplex como canario.
5. Usar Vast.ai sólo para benchmarks y entrenamiento barato.
6. Reservar A100/H100 para `Moshi-Call-EN`, no para el primer servidor de llamadas.

La configuración equilibrada sería:

```text
Node + PostgreSQL + Redis: VM CPU estable
Voice Modular: 1×L40S o GPU equivalente
Voice Duplex: 1×L40S separada durante el canario
Modelos/datasets: volumen persistente y backup
Telefonía: Twilio/SIP conectado sólo a Node
```

### Fuentes consultadas

- [Moshi — requisitos y API oficial](https://github.com/kyutai-labs/moshi)
- [RunPod — precios GPU](https://www.runpod.io/pricing)
- [RunPod — precios Serverless](https://docs.runpod.io/serverless/pricing)
- [Scaleway — L40S](https://www.scaleway.com/en/l40s-gpu-instance/)
- [Scaleway — Elastic Metal](https://www.scaleway.com/en/elastic-metal/titanium/)
- [OVHcloud — precios Public Cloud](https://www.ovhcloud.com/en/public-cloud/prices/)
- [Vast.ai — modelo de precios](https://docs.vast.ai/guides/instances/pricing)
- [Lambda — instancias GPU](https://docs.lambda.ai/public-cloud/on-demand/)
- [AWS — instancias EC2 aceleradas](https://docs.aws.amazon.com/ec2/latest/instancetypes/ac.html)
