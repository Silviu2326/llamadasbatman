# Spritmark — Cómo funciona la máquina de leads

Proceso completo, de un registro público a un cliente firmado. Qué hace cada
etapa, qué cuesta, qué código la ejecuta y qué falta por construir.

---

## 1. Qué hace, en una frase

**Convierte una lista pública y gratuita de empresas americanas en dos colas de
trabajo —una de llamadas y otra de correos— con toda la información enriquecida,
la basura descartada y la separación legal ya hecha.**

Dos horas de trabajo manual al mes. El resto va solo.

---

## 2. El proceso entero

```
  ETAPA 0 · SEMILLA                                    manual · 2 h/mes · 0 $
  Registro mercantil + licencias del estado (CSV)
  → nombre, dirección, DUEÑO, fecha de alta
                        │
                        ▼
  ETAPA 1 · IMPORTAR                                   auto · 0 $
  Deduplicar contra lo que ya tenemos
                        │  10.000 → 9.200
                        ▼
  ETAPA 2 · TELÉFONO Y WEB                             auto · 230 $
  Google Places
                        │  9.200 → 8.400
                        ▼
  ETAPA 3 · AUDITAR LA WEB                             auto · ~0 $
  Velocidad, móvil, Google + extraer su correo
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
   sin web         web mala         web buena
    2.500            4.100            1.800  ❌ DESCARTAR
       └────────────────┘
                        │  8.400 → 6.600
                        ▼
  ETAPA 4 · CORREO DEL DUEÑO                           auto · 8 $
  Nombre (etapa 0) + dominio (etapa 2) → 5 patrones → verificar
                        │  +2.050 correos nuevos
                        ▼
  ETAPA 5 · ¿FIJO O MÓVIL?                             auto · 53 $
  Twilio Lookup — decide qué es legal hacer con cada uno
                        │
       ┌────────────────┴────────────────┐
       ▼                                 ▼
  FIJO DE EMPRESA                    MÓVIL
     1.650                           4.950
       │                                 │
       ▼                                 ▼
  ETAPA 6a · LLAMAR EN FRÍO         ETAPA 6b · ESCRIBIR
  legal sin permiso                 correo primero
  4.950 llamadas · 198 $            14.800 correos · 59 $
       │                                 │
       │                                 ▼
       │                          contesta "YES"
       │                                 │
       │                                 ▼
       │                          ✍️ CONSENTIMIENTO GUARDADO
       │                                 │
       └──────────────┬──────────────────┘
                      ▼
              📞 EL AGENTE LLAMA
```

---

## 3. Las etapas, una por una

### Etapa 0 · Semilla — **lo único manual**

| | |
|---|---|
| **Qué entra** | Nada |
| **Qué sale** | 10.000 empresas con nombre, dirección, **nombre del dueño** y fecha de alta |
| **Coste** | 0 $ |
| **Tiempo** | 2 horas al mes |
| **Cómo** | Descargar el fichero de los registros estatales de licencias y del registro mercantil |

**Por qué esto NO se automatiza:** son quince estados, quince webs distintas y
formatos que cambian sin avisar. Escribir quince extractores para ahorrar dos
horas al mes es exactamente el código que luego hay que mantener a las 3 de la
mañana. Se descarga a mano y se sube.

---

### Etapa 1 · Importar y deduplicar

| | |
|---|---|
| **Entra** | 10.000 filas |
| **Sale** | 9.200 (se cae el 8 %: duplicadas, disueltas, fuera de zona) |
| **Coste** | 0 $ |
| **Código** | `jobs/importJobRunner.ts` + `leads.service.ts` — **ya existe** |

⚠️ **Tope actual:** [leads.controller.ts:21](backend/src/controllers/leads.controller.ts#L21)
limita a `MAX_IMPORT_ROWS = 2000`. Con 10.000 filas hacen falta 5 importaciones.
Es una constante: subirla a 25.000 es el arreglo, y el trabajo ya corre en
segundo plano.

---

### Etapa 2 · Teléfono y web

| | |
|---|---|
| **Entra** | 9.200 empresas con nombre y dirección |
| **Sale** | 8.400 con teléfono, web y valoraciones (el 8 % no aparece en Places) |
| **Coste** | **230 $** (0,025 $ cada una) |
| **Código** | `prospecting.service.ts` — **ya existe**, deduplica por identificador y teléfono |

---

### Etapa 3 · Auditar la web — **la etapa que más ahorra**

| | |
|---|---|
| **Entra** | 8.400 |
| **Sale** | 6.600 + una nota de su web + **su correo publicado** |
| **Coste** | ~0 $ (PageSpeed es gratis) |
| **Código** | `digitalAudit.service.ts`, [el correo sale en la línea 146](backend/src/services/digitalAudit.service.ts#L146) — **ya existe** |

Aquí pasan tres cosas a la vez:

1. **Se descarta el 21 %** — los 1.800 que tienen una web decente. No tienen
   problema, no hay nada que venderles.
2. **Se saca el argumento de venta** — la nota real de su web es lo que va dentro
   del correo y del guion de la llamada.
3. **Se saca un correo gratis** — aparece en el 65 % de las webs.

> **Por qué esta etapa va antes que las de pago:** descartar 1.800 empresas aquí
> ahorra el coste de las etapas 4 y 5 sobre ellas. Poner las etapas caras al final
> no es un detalle de ingeniería, es un tercio del presupuesto.

---

### Etapa 4 · Correo del dueño

| | |
|---|---|
| **Entra** | Nombre del dueño (etapa 0) + dominio (etapa 2) |
| **Sale** | +2.050 correos de persona con nombre |
| **Coste** | **8 $** |
| **Código** | ❌ **Falta** |

Genera los cinco patrones (`john@`, `johnsmith@`, `john.smith@`, `jsmith@`,
`smith@`), los comprueba a 0,0004 $ cada uno y se queda el que existe. Acierta el
40-60 %.

⚠️ **Todo lo que salga de esta etapa se verifica, sin excepción.** Sin verificar,
el rebote sube al 8-10 % y los buzones se queman en dos semanas. **Si el
verificador está caído, el correo se queda en cola: no se envía sin verificar.**

---

### Etapa 5 · ¿Fijo o móvil? — **la puerta legal**

| | |
|---|---|
| **Entra** | 6.600 teléfonos |
| **Sale** | 1.650 fijos de empresa · 4.950 móviles |
| **Coste** | **53 $** (0,008 $ cada uno) |
| **Código** | ❌ **Falta** — va junto a `canCall()` en `voice/compliance.ts` |

Esta consulta es lo que separa lo legal de una multa de 500 $ por llamada. Al
fijo de una empresa se le puede llamar en frío; al móvil no, sin permiso escrito.
El detalle está en [MODOS_LEGALES_AGENTE_VOZ.md](MODOS_LEGALES_AGENTE_VOZ.md).

---

### Etapa 6a · Cola de llamada en frío

| | |
|---|---|
| **Entra** | 1.650 fijos verificados |
| **Sale** | 4.950 llamadas (3 intentos cada uno) |
| **Coste** | **198 $** |
| **Código** | `jobs/leadCallDispatch.ts` + `voice/compliance.ts` — existe |

Antes de cada llamada, `canCall()` comprueba: que no esté en la lista de bajas,
que sea horario legal **en su zona horaria**, y que el consentimiento no haga
falta o esté registrado.

⚠️ **Sigue pendiente el arreglo del horario:** el mapa de zonas horarias de
`compliance.ts` es de prefijos mexicanos. Hay que guardar la zona horaria que
Places ya devuelve, en vez de adivinarla por el prefijo.

---

### Etapa 6b · Cola de correo

| | |
|---|---|
| **Entra** | 3.700 con correo utilizable |
| **Sale** | 14.800 correos (secuencia de 4) |
| **Coste** | **59 $** |
| **Código** | `emailCopy.service.ts` + `outboundEmail.service.ts` — existe |

El programa investiga cada negocio, escribe tres versiones del correo, las juzga y
manda la mejor, con el informe de su web adjunto.

**Y en el correo va la frase que alimenta a la etapa siguiente:**

> *"Reply **YES** and our AI assistant will call you within the minute."*

---

### Etapa 7 · El bucle de consentimiento

Aquí se cierra el círculo, y es lo que convierte el correo en el motor de las
llamadas:

```
Contesta "YES"  →  se guarda como consentimiento por escrito
                   (texto, fecha, hora, remitente)
                          ↓
                   pasa a la cola de llamada
                          ↓
                   el agente llama en 60 segundos
```

El registro va en el modelo `ContactConsent`, que ya tiene los campos `evidence`,
`occurredAt` y `expiresAt`. **Hay que llenarlos**: sin la prueba guardada, el
consentimiento no vale nada si algún día hay reclamación.

---

## 4. Los números de un ciclo completo

| Etapa | Entran | Salen | Coste |
|---|---|---|---|
| 0 · Semilla | — | 10.000 | 0 $ |
| 1 · Importar | 10.000 | 9.200 | 0 $ |
| 2 · Places | 9.200 | 8.400 | 230 $ |
| 3 · Auditar | 8.400 | **6.600** | ~0 $ |
| 4 · Correo del dueño | 6.600 | +2.050 correos | 8 $ |
| 5 · Tipo de línea | 6.600 | 1.650 fijos / 4.950 móviles | 53 $ |
| 6a · Llamar | 1.650 | 4.950 llamadas | 198 $ |
| 6b · Escribir | 3.700 | 14.800 correos | 59 $ |
| | | **TOTAL** | **548 $** |

### Lo que sale por el otro lado

| | |
|---|---|
| Leads utilizables | **6.600** |
| Coste por lead utilizable | **0,083 $** |
| Clientes esperados (5 por llamada + 10 por correo) | **~15** |
| **Coste por cliente** | **37 $** |
| Lo que deja cada cliente el primer año | 17.900 $ |

---

## 5. Cómo se ejecuta

### La cadencia

| Etapa | Cuándo corre | Ritmo |
|---|---|---|
| 0 · Semilla | Una vez al mes, a mano | 10.000 filas |
| 1 – 5 · Enriquecer | Continuo en segundo plano | ~500/hora |
| 6a · Llamar | Solo en horario legal **del destinatario** | 100/día |
| 6b · Escribir | Todos los días laborables | 420/día |

### La regla que evita tirar dinero

> **No enriquezcas más de lo que puedas consumir en un mes.**

Enriquecer 10.000 empresas lleva un día de máquina. Consumirlas por correo lleva
35 días. Y los datos caducan: los teléfonos y las webs se quedan viejos a un ritmo
del 2 % al mes.

Enriquecer con seis meses de adelanto tira el 12 % del gasto. **Un mes de
adelanto, y no más.**

### Cuándo algo falla

| Qué falla | Qué hace la máquina |
|---|---|
| Una fila da error | Se marca y **se sigue**. Nunca se aborta el lote entero |
| Se agota la cuota de Places | Se pausa esa etapa y sigue al día siguiente |
| **El verificador de correo está caído** | **El correo NO se envía.** Se queda en cola |
| Falla el envío | El `outboxDispatcher` reintenta con espera creciente y aparta a los 8 intentos |
| No hay zona horaria del destinatario | **No se llama.** Se manda por correo |

Los reintentos y el apartado ya los hace `jobs/outboxDispatcher.ts`. No hay que
construir nada de eso.

---

## 6. Qué falta construir

| # | Qué | Dónde va | Esfuerzo | Por qué |
|---|---|---|---|---|
| 1 | **Verificar correos** | Servicio nuevo pequeño | 3 h | Sin esto se queman los buzones |
| 2 | **Adivinar el correo del dueño** | Junto al anterior | 3 h | Duplica la respuesta |
| 3 | **Tipo de línea** | Dentro de `voice/compliance.ts` | 2 h | Es lo que hace legal la llamada en frío |
| 4 | **Arreglar el horario legal de EE. UU.** | `voice/compliance.ts` | 4 h | Hoy llamaría a California de madrugada |
| 5 | **El trabajo que encadena las etapas** | `jobs/` nuevo | 1-2 días | Es lo único que no existe |
| 6 | **Subir el tope de importación** | Una constante | 15 min | 2.000 filas se queda corto |
| 7 | Guardar la prueba del consentimiento | Rellenar `ContactConsent.evidence` | 2 h | Vale de poco sin la prueba |
| | | | **~5 días** | |

**Nada de esto es un sistema nuevo.** Son tres llamadas a APIs externas, un
arreglo de zona horaria y un trabajo que llama en orden a servicios que ya
existen. El patrón a copiar es `jobs/seoAuditRefresh.ts`, que ya hace lo mismo
para las auditorías.

### Lo que se deja fuera a propósito

| Qué | Por qué no |
|---|---|
| Extractores de los registros estatales | 15 webs distintas para ahorrar 2 h/mes |
| Usar el orquestador de planes | Esto es una tubería lineal. Un trabajo normal basta |
| Extraer de Yelp, Angi o LinkedIn | Sus condiciones lo prohíben y hay que mantenerlo |
| Permisos de obra y avisos de tormenta | Suman mucho, pero **después** de que la tubería base funcione |
| Reintentos propios | El outbox ya los hace |

---

## 7. Cómo sabremos que funciona

| Indicador | Objetivo | Si se sale |
|---|---|---|
| Coste por lead utilizable | < 0,10 $ | Revisar cuántos se caen en cada etapa |
| Supervivencia etapa 2 (Places) | > 85 % | La semilla trae empresas muertas |
| Supervivencia etapa 3 (auditoría) | 75 – 80 % | Sector demasiado moderno: cambiar |
| Correos encontrados | > 55 % | Revisar los patrones |
| **Fijos de empresa** | 20 – 35 % | Por debajo, la llamada en frío no compensa en ese sector |
| **Rebote de correo** | **< 2 %** | 🔴 **Parar los envíos.** Los buzones están en peligro |
| Descuelgue en llamadas | > 25 % | Revisar el registro de marca del número |

El rebote es el único que justifica parar la máquina. Los demás se corrigen sobre
la marcha.

---

## 8. Resumen

| | |
|---|---|
| Trabajo manual | **2 horas al mes** |
| Ciclo completo | 10.000 empresas → **6.600 leads** |
| Coste del ciclo | **548 $** |
| Coste por lead | **0,083 $** |
| Coste por cliente | **37 $** |
| Falta construir | **~5 días** |
| Ya construido | Places, auditoría, extracción de correo, redacción, envío, llamada, consentimiento, bajas, reintentos |

**Lo que hay que entender del diseño:** la etapa cara (Places) va antes de la
gratis (auditoría) porque hace falta la web para auditarla — pero **el descarte
del 21 % ocurre en la auditoría, antes de las otras dos etapas de pago.** Y la
consulta del tipo de línea va la última, cuando ya solo quedan empresas que de
verdad nos interesan.

Ese orden es la diferencia entre 548 $ y 800 $ por ciclo.
