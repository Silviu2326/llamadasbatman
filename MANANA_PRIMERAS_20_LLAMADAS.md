# Mañana — las primeras 20 llamadas

Guion de la jornada. 18 de agosto de 2026.
Objetivo: **20 llamadas hechas y escuchadas**, no 20 clientes.

---

## 1. Qué son estas 20 llamadas

**No son para vender. Son para oír cómo suena el agente con gente real.**

Es lo que dice el plan y conviene repetirlo, porque la tentación de subir el
volumen el primer día es la que arruina la campaña: el guion se afina con las
veinte primeras, y todo lo que se marque antes de afinarlo son contactos
quemados que no vuelven.

**Expectativa realista de esas 20:**

| | |
|---|---|
| Llamadas lanzadas | **20** |
| Descuelgan | 5 – 7 *(el número aún no tiene marca registrada, así que menos de lo normal)* |
| Conversaciones de más de 30 segundos | **3 – 5** |
| Reuniones | 0 – 1. **Si sale una, es regalo** |
| Lo que sí sacas | **Saber si el agente sirve o hay que reescribir el guion** |

---

## 2. Lo que tiene que estar listo antes de marcar

Hoy el preflight da **9 bloqueantes**. Estos son los que hay que resolver, en
este orden:

### 2.1 · 🔴 Twilio — sin esto no hay nada

Faltan `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`. No hay línea por la que salga
la llamada ni consulta de tipo de línea. Es lo primero de la mañana.

Hay que comprar además **un número local** de una de las ciudades a las que se
va a llamar. Uno basta para veinte llamadas.

> ⚠️ **El registro de marca (CNAM) tarda días.** Inícialo mañana, pero no
> esperes a que esté: para 20 llamadas de calibración da igual que el descuelgue
> sea bajo. Lo que se está probando es la conversación, no la tasa de contacto.

### 2.2 · 🔴 Tres variables

```bash
DEFAULT_PHONE_COUNTRY_CODE=1          # hoy cae a 52 (México)
REQUIRE_VOICE_CONSENT=true            # hoy llamaría sin comprobar permiso
ALLOW_COLD_CALL_BUSINESS_LANDLINE=true  # sin esto canCall bloquea las 20
```

La tercera es la que hace posible el día: **sin correo calentado no hay "YES",
así que el único camino legal mañana es el fijo de empresa verificado.** Por eso
se llama a agencias y no a techadores.

### 2.3 · 🔴 Las otras cuatro claves

`GOOGLE_PLACES_API_KEY` para la lista, y `DEEPSEEK_API_KEY` para el prompt.
`RESEND_API_KEY` y `EMAIL_VERIFIER_API_KEY` no hacen falta mañana —no se envía
correo— pero el preflight las marcará; ignóralas hoy.

### 2.4 · 🔴 Worker y Redis vivos

`REDIS_URL` está puesto, pero **el proceso worker tiene que estar arrancado**.
Si no, `enqueueLeadCall` devuelve `false` en silencio y no se llama a nadie
mientras la API dice que todo va bien.

```bash
OBSERVABILITY_URL=https://tu-backend OBSERVABILITY_TOKEN=... npm run check:alerts
```

### 2.5 · 🟠 El perfil de negocio de la organización

Menos obvio y ahora importa: **la identidad del agente se compone con el nombre
de la empresa del perfil de negocio.** Si está vacío, el agente no dirá ninguna
marca. Rellena al menos nombre, sector y descripción de SprintMarkt.

### 2.6 · ⚖️ La decisión que es tuya

El abogado TCPA aún no ha revisado el flujo. La llamada en frío a **fijos de
empresa verificados** es el hueco legal real —la prohibición federal cubre
móviles y líneas residenciales—, y el código solo permite `landline`, nunca
`voip` ni `mobile`. Aun así, **hasta que el abogado lo confirme esto va bajo tu
criterio.** Veinte llamadas es un riesgo pequeño y acotado; dos mil no lo sería.

---

## 3. La mañana — preparar la lista

*Horario español. EE. UU. está durmiendo, así que la mañana es toda preparación.*

### 09:00 · Twilio y variables

Cuenta, número local, las tres variables, reiniciar backend y worker.

### 10:00 · Comprobar

```bash
npm run preflight:usa -- <orgId>
```

No sigas hasta que Twilio, Places, DeepSeek y las tres variables salgan en
verde. Lo demás puede esperar.

### 10:30 · Sacar la lista

Cuatro ciudades bastan. Crea `zonas-dia1.json`:

```json
[
  { "city": "Raleigh",      "state": "NC" },
  { "city": "Charlotte",    "state": "NC" },
  { "city": "Richmond",     "state": "VA" },
  { "city": "Virginia Beach","state": "VA" }
]
```

```bash
npm run prospect:usa -- agencies --areas zonas-dia1.json          # enseña el plan
npm run prospect:usa -- agencies --areas zonas-dia1.json --run    # 20 consultas, ~0,64 $
```

Salen unas 200-300 agencias únicas.

### 11:00 · Importar **con auditoría**

```
POST /api/prospects/import
{
  "campaignId": "…",
  "autoAudit": true,      ← IMPRESCINDIBLE
  "enrich": true,
  "items": [ … del JSON … ]
}
```

🔴 **`autoAudit` no es opcional.** Es lo que guarda la auditoría, y sin ella el
agente no tiene el dato con el que abre. Las reglas de voz le prohíben
inventarse hechos de la empresa, así que se quedaría mudo justo en la apertura.

### 12:00 · Enriquecer

`leadEnrichment` mira el tipo de línea, calcula la zona horaria por estado y
etiqueta cada lead. Al terminar:

```bash
npm run preflight:usa -- <orgId>
```

Tiene que decir cuántos van con `route:call` —los llamables en frío— y confirmar
que hay auditorías guardadas. **Si dice "0 auditorías", el import fue sin
`autoAudit` y hay que repetirlo.**

### 13:00 · La prueba que no te puedes saltar

**Llámate a ti mismo.** Una llamada completa a tu propio móvil, escuchada
entera. Comprueba:

- [ ] Dice que es una IA en los primeros segundos
- [ ] Dice **SprintMarkt**, no otra marca
- [ ] Menciona un dato real de la web de ese prospecto
- [ ] Turnos cortos, no párrafos
- [ ] Si le interrumpes, se calla
- [ ] Si pides una persona, transfiere

Si alguna de las seis falla, **arréglala antes de las 15:00**. Con veinte
prospectos reales no se depura.

---

## 4. La tarde — las llamadas

**Ventana: 16:00 – 19:00 hora española** (10:00 – 13:00 en la costa Este). Es la
mejor franja para una oficina de agencia: ya han llegado y aún no han comido.

### 16:00 · Las tres primeras, de una en una

Lanza **tres**. Escúchalas enteras antes de lanzar ninguna más.

Este es el momento de la jornada en el que se decide todo. Si las tres suenan
mal, no lances las diecisiete restantes: corrige el `base_prompt` y vuelve a
empezar mañana. Diecisiete prospectos mal quemados no se recuperan; un día de
retraso sí.

### 16:45 · Las diecisiete

Si las tres pasan, lanza el resto en tandas de cinco, escuchando entre tanda y
tanda.

```bash
npm run enroll:leads -- <orgId> <programId> --route call --limit 20
npm run enroll:leads -- <orgId> <programId> --route call --limit 20 --run
```

*(Sin `--run` solo te enseña a quién cogería.)*

### 19:00 · Parar

No alargues a la franja de tarde americana el primer día. Con veinte hay
material de sobra para una jornada de escucha.

---

## 5. La ficha de escucha

Una línea por llamada. En papel, en una hoja de cálculo, donde sea — pero
escrita, porque al final del día no te vas a acordar.

| # | Empresa | ¿Descolgó? | Segundos | ¿Usó el dato de la web? | ¿Dónde se atascó? | Frase textual que chirrió |
|---|---|---|---|---|---|---|

**Las tres columnas que valen** son las tres últimas. La primera mitad es
contabilidad; la segunda es lo que reescribe el guion.

Y una pregunta al final de cada llamada escuchada: **¿esto lo habría dicho un
comercial bueno?** Si la respuesta es no, apunta por qué en la última columna.

---

## 6. Cuándo parar en seco

| Señal | Qué hacer |
|---|---|
| **Alguien dice "take me off your list"** | Ya se registra solo. Verifica que quedó en `OptOut` |
| **El agente se inventa un dato** | 🔴 **Parar todo.** Es lo único que no se negocia. Revisar el prompt antes de seguir |
| **Dice una marca que no es SprintMarkt** | 🔴 Parar. Falta el perfil de negocio o el `base_prompt` |
| **Tres seguidas se atascan en el mismo punto** | Parar y corregir esa parte del guion. No es mala suerte |
| **Alguien se enfada de verdad** | Escucha esa llamada dos veces. Vale más que las otras diecinueve |
| **Cero descuelgues en diez intentos** | Es el número, no el guion. Mira el CNAM y prueba con otro número local |

---

## 7. Al terminar

1. **Escucha las veinte del tirón**, seguidas. Los patrones solo se ven en serie.
2. Reescribe el `base_prompt` con lo que has apuntado en la última columna.
3. Comprueba que las que pidieron baja están en `OptOut`.
4. Deja apuntado el número real de descuelgue: es la línea base contra la que
   medirás si el CNAM sirve de algo.
5. **No subas el volumen mañana.** Segunda tanda de veinte con el guion
   corregido. El volumen entra cuando dos tandas seguidas suenen bien.

---

## 8. Lo que cuesta el día

| | |
|---|---|
| Places, 20 consultas | 0,64 $ |
| Tipo de línea, ~300 números | 2,40 $ |
| Auditorías | 0 $ |
| 20 llamadas | ~1,80 $ |
| Número local de Twilio | 1,15 $/mes |
| **Total** | **menos de 7 $** |

El día entero cuesta menos que una comida. **Lo caro sería lanzar dos mil
llamadas con un guion sin probar.**

---

## 9. La lista de mañana, en corto

- [ ] Twilio dado de alta + un número local
- [ ] `DEFAULT_PHONE_COUNTRY_CODE=1`
- [ ] `REQUIRE_VOICE_CONSENT=true`
- [ ] `ALLOW_COLD_CALL_BUSINESS_LANDLINE=true`
- [ ] `GOOGLE_PLACES_API_KEY` y `DEEPSEEK_API_KEY`
- [ ] Worker vivo (`npm run check:alerts`)
- [ ] Perfil de negocio de SprintMarkt relleno
- [ ] `npm run preflight:usa -- <orgId>` sin bloqueantes que importen hoy
- [ ] Lista sacada e importada **con `autoAudit: true`**
- [ ] Preflight confirma auditorías guardadas y leads `route:call`
- [ ] **Llamada de prueba a tu móvil, escuchada entera, con las seis casillas**
- [ ] 3 llamadas · escuchar · decidir si seguir
- [ ] 17 llamadas en tandas de 5
- [ ] Las veinte escuchadas seguidas antes de acostarte

---

**Lo único que hay que llevarse de mañana:** no son veinte oportunidades de
vender. Son veinte oportunidades de descubrir qué está mal **antes** de que
importe. El día que salga bien de verdad es el que llegue después de estas
veinte, no este.
