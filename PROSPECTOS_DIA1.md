# Prospectos del día 1 — 32 agencias para las primeras 20 llamadas

Lista de trabajo para `MANANA_PRIMERAS_20_LLAMADAS.md`. Pista **agencies**
(Producto C, marca blanca), las cuatro ciudades de `zonas-dia1.json`:
Raleigh NC, Charlotte NC, Richmond VA, Virginia Beach VA.

**32 candidatos con teléfono para llenar 20 huecos.** El margen no es adorno:
una parte se caerá sola en la verificación de tipo de línea.

> ⚠️ **Cómo se ha sacado esta lista.** No con `npm run prospect:usa`: no hay
> `GOOGLE_PLACES_API_KEY` en `backend/.env` (solo está en `.env.example`), así
> que el barrido oficial no puede ejecutarse. Esto es búsqueda web manual, y eso
> tiene tres consecuencias que hay que tener presentes antes de marcar:
>
> 1. **Los teléfonos no están verificados.** Vienen de la web de cada agencia o
>    de directorios. Ninguno ha pasado por Twilio Lookup, así que **no se sabe
>    si son `landline`**, y `ALLOW_COLD_CALL_BUSINESS_LANDLINE` solo deja marcar
>    fijos de empresa. Es la comprobación que decide quién de estos 32 entra.
> 2. **No hay auditoría digital.** `autoAudit` necesita `DEEPSEEK_API_KEY`, que
>    tampoco está. Sin auditoría el agente se queda mudo en la apertura, que es
>    justo lo que avisa el §3 del plan.
> 3. **No hay `placeId` real, ni rating, ni reseñas, ni `quickScore`.** El JSON
>    lleva `placeId` sintético (`web:<slug>`). La deduplicación contra un futuro
>    import de Places se apoyará en el teléfono, no en el `placeId`.
>
> Dicho de otro modo: esto es la lista de a quién llamar, no leads listos para
> marcar. Con las claves puestas, el barrido oficial devolvería lo mismo y más,
> ya auditado.

Fichero listo para el import: [`prospects-agencies-dia1.json`](prospects-agencies-dia1.json)

---

## 1 · Los 20 propuestos

Cinco por ciudad. Criterio: agencia **local de verdad** (dirección y prefijo de
la ciudad), tamaño pequeño o mediano, web propia con material para auditar.

### Raleigh, NC

| # | Agencia | Teléfono | Web | Dato para la apertura |
|---|---|---|---|---|
| 1 | OnWired | +1 919 301 0425 | onwired.com | Fundada en 2001, en pleno centro de Raleigh |
| 2 | TheeDigital | +1 919 341 8901 | theedigital.com | Publica su propio ranking de agencias de Raleigh |
| 3 | Instinctive Branding | +1 919 295 3671 | instinctivebranding.com | 19 E Martin St; oficinas satélite en Durham, Dallas y Pompano Beach |
| 4 | Unita Marketing | +1 919 819 6020 | unitamarketing.com | Creada en 2022; pymes, entre Raleigh y Wake Forest |
| 5 | Think Designs LLC | +1 919 606 1339 | thinkdesignsllc.com | "2023 National Excellence Winner" en su propia web |

### Charlotte, NC

| # | Agencia | Teléfono | Web | Dato para la apertura |
|---|---|---|---|---|
| 6 | Breeez | +1 704 269 9940 | breeez.com | 1001 Morehead Square Dr, Ste 340; full-service |
| 7 | Web Symphonies | +1 704 336 9113 | websymphonies.com | Fundada en 2005 por Isaac Moan; +200 negocios |
| 8 | Crimson Park Digital | +1 704 710 6250 | crimsonparkdigital.com | Boutique en 3540 Toringdon Way |
| 9 | The Branding Agency | +1 704 800 7413 | mybrandingagency.com | Webs para negocios de Charlotte desde 2015 |
| 10 | WiT Group 🟡 | +1 704 336 9018 | — | Sede en Charlotte, oficinas en Columbia SC y Kannapolis |

### Richmond, VA

| # | Agencia | Teléfono | Web | Dato para la apertura |
|---|---|---|---|---|
| 11 | KNOWN Agency | +1 804 592 0213 | knownagency.com | 1901 E Franklin St; portfolio con Health Warrior y Sound Arts Richmond |
| 12 | Torx Media | +1 804 577 8679 | torxmedia.com | 612 Hull St, Ste 201-A |
| 13 | J Drake Web Design | +1 804 218 1063 | jdrakewebdesign.com | Estudio de branding digital de Richmond |
| 14 | Baylyn Media | +1 804 616 3121 | baylynmedia.com | Combina marketing de TV y digital |
| 15 | Third Marble Marketing | +1 804 638 9866 | thirdmarblemarketing.com | Especialista en SEO local |

### Virginia Beach, VA

| # | Agencia | Teléfono | Web | Dato para la apertura |
|---|---|---|---|---|
| 16 | Bryant Digital | +1 757 647 7622 | bryantdigital.com | 2421 Bowland Pkwy Ste 106; +10 años |
| 17 | COSTA Designs | +1 757 343 6894 | costadesigns.com | "Since 1999" — más de 25 años |
| 18 | Commonwealth Creative Marketing | +1 757 858 2020 | ccm-web.com | Desde 2010; "cientos de pymes" |
| 19 | Eyepinch | +1 757 301 1498 | eyepinch.com | Agencia de VB con web, hosting y SEO |
| 20 | VisioneFX | +1 757 619 6456 | visionefx.net | Web a medida, eCommerce y mantenimiento |

---

## 2 · Los 12 de reserva

Entran en cuanto uno de los veinte se caiga —número que no es fijo, empresa
cerrada, teléfono que no existe—. Están ordenados por el orden en que los metería.

| # | Agencia | Ciudad | Teléfono | Por qué está en reserva y no arriba |
|---|---|---|---|---|
| 21 | Seelutions | Richmond | +1 804 805 5020 | Web propia, pero sin dirección confirmada |
| 22 | Custom Media Associates | Richmond | +1 804 601 6333 | Igual: falta dirección |
| 23 | Go Fish Digital | Raleigh | +1 919 535 4693 | Agencia grande y multi-ciudad; menos encaje con marca blanca |
| 24 | Big Red Dog Marketing | Raleigh | +1 919 926 8727 | Teléfono de directorio, no visto en web propia |
| 25 | BTB Marketing Communications | Raleigh | +1 919 872 8172 | Igual |
| 26 | Clear Choice Marketing Group | Raleigh | +1 919 205 9269 | Igual; dirección sí (5540 Centerview Dr) |
| 27 | SEO Richmond | Richmond | +1 804 252 9227 | Ficha de Yelp; 3600 W Broad St Ste 502 |
| 28 | M.J. Web Design | Richmond | +1 804 822 0901 | Solo aparece en directorios |
| 29 | Binchmark | Norfolk / VB | +1 757 447 6040 | Norfolk, no Virginia Beach estricto |
| 30 | Mitro Digital 🟡 | Raleigh | +1 252 715 4750 | Prefijo 252 (Outer Banks), no 919 |
| 31 | Customer Magnetism 🟡 | Virginia Beach | +1 757 689 2875 | Solo apartado de correos, sin dirección física |
| 32 | Studio Center 🟡 | Virginia Beach | +1 757 286 3080 | El número publicado es **móvil de 24 h**; el fijo es un 866 gratuito |

### 🟡 Los cuatro que hay que mirar dos veces

- **WiT Group (#10)** — el mismo `704 336 9018` aparece en un directorio a
  nombre de *Digital Kings Networking*. O una revende a la otra, o el directorio
  está mal. Confírmalo antes de marcar o pasa el hueco a la reserva.
- **Mitro Digital (#30)** — la empresa opera entre Raleigh y los Outer Banks, y
  el número publicado es el de allí. La llamada saldría fuera de zona.
- **Customer Magnetism (#31)** — un apartado de correos no es una oficina. Sin
  dirección física el dato de apertura es más flojo.
- **Studio Center (#32)** — un móvil no pasa `ALLOW_COLD_CALL_BUSINESS_LANDLINE`.
  Lo más probable es que Lookup lo tumbe. Está en la lista para que se vea que
  se descartó a propósito, no por olvido.

---

## 3 · Los descartados, y por qué

Salieron en las búsquedas y **no** están en el JSON. Se dejan escritos para que
nadie los vuelva a meter dentro de dos semanas.

| Descartado | Motivo |
|---|---|
| WebFX (Richmond, Charlotte, Norfolk) | Agencia nacional de Pensilvania con landings por ciudad. El número local es de captación, no una oficina |
| NEWMEDIA.COM (Raleigh) | Igual: nacional, sede en Denver |
| Blue Corona (Charlotte) | Nacional, Maryland; además es de servicios para el hogar |
| Thrive Agency (Richmond) | Nacional, Texas |
| Loud Canvas Media (Richmond) | New Hampshire |
| Alliance Interactive (Charlotte) | Washington DC |
| Dupont Creative (Richmond) | Washington DC |
| Sprout Media Lab (Raleigh) | Teléfono 800 gratuito: ni es local ni pasa el filtro de fijo |
| Red K Studio (Richmond) | Prefijo 540, del valle del Shenandoah |
| Consult PR (Charlotte) | El teléfono es 561 — Florida |
| Quantifi Marketing (Charlotte) | Está en Huntersville y Asheville, fuera de las cuatro ciudades |
| Digital Kings Networking (Charlotte) | Mismo teléfono que WiT Group; uno de los dos está mal |
| Triangle Direct Media, Promerix, Lesser Media, GetYouFound | Landings por ciudad sin oficina en ella |

**El patrón:** una agencia nacional con página "Web Design Charlotte" no es un
prospecto local, y su número entra en una centralita de ventas. Son
exactamente las llamadas que ensucian la muestra del día 1, porque descuelgan
más que un negocio real y no dicen nada sobre si el guion funciona.

---

## 4 · Lo que falta antes de poder marcar

Estas 32 fichas no son leads todavía. En orden:

1. **Twilio de alta** (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) + un número
   local. Sin esto no hay ni llamada ni Lookup.
2. **Pasar los 32 por Lookup** y quedarse con los `landline`. Aquí es donde se
   cae parte de la lista: muchas agencias usan números de seguimiento tipo
   CallRail, que salen `voip` y el código bloquea.
3. **`DEEPSEEK_API_KEY`** para que `autoAudit` genere el dato de apertura.
4. **Importar con `autoAudit: true`** — el §3.11 del plan es explícito: sin eso
   el agente no tiene con qué abrir.

```
POST /api/prospects/import
{
  "campaignId": "…",
  "autoAudit": true,
  "enrich": true,
  "items": [ … de prospects-agencies-dia1.json … ]
}
```

> 🔴 **No mandes `state` en el cuerpo con este fichero.** El JSON mezcla NC y VA,
> y el controlador **ignora el `state` de cada item**: aplica
> `requestedState ?? stateFromAddress(item.address)`
> ([`prospects.controller.ts:126`](backend/src/controllers/prospects.controller.ts#L126)).
> Si mandas `"state": "NC"`, las doce agencias de Virginia quedan marcadas como
> Carolina del Norte y la zona horaria del lead sale mal.
>
> Sin `state` en el cuerpo funciona: las direcciones del JSON están escritas para
> que `stateFromAddress` las resuelva, y **las 32 devuelven su estado correcto**
> (comprobado contra el regex real del servicio). El campo `state` de cada item
> se queda como referencia para leer la lista a ojo, no lo consume el import.

5. **Empezar con 10 items**, ver el informe entero, y luego el resto — como dice
   el propio script al terminar.

---

## 5 · Si al final quedan menos de 20 llamables

Es el desenlace probable después del filtro de tipo de línea. Dos salidas, por
orden de preferencia:

1. **Tirar de la reserva** (§2). Doce huecos dan para absorber una caída del 37 %.
2. **Ampliar ciudad, no sector.** Añade Durham y Greensboro NC a
   `zonas-dia1.json` —ya están en la matriz `CITIES` del script— antes de tocar
   la pista `roofers`. El guion está escrito para agencias; cambiar de sector
   invalida la comparación entre llamadas, que es lo único que se busca el día 1.

Y lo que **no** hay que hacer: rellenar los huecos con las agencias nacionales
del §3 para llegar a veinte. Veinte llamadas mal elegidas enseñan menos que
catorce bien elegidas.

---

## Fuentes

Directorios y webs consultadas para armar la lista:

- [Expertise.com — Raleigh](https://www.expertise.com/business/digital-marketing-agencies/north-carolina/raleigh) · [Charlotte](https://www.expertise.com/business/digital-marketing-agencies/north-carolina/charlotte)
- [TheeDigital — 10 mejores agencias de Raleigh](https://www.theedigital.com/blog/the-10-best-digital-marketing-agencies-in-raleigh-nc)
- [Triangle Marketing Club — directorio de agencias](https://www.trianglemarketingclub.com/agency/)
- [Digital Agency Network — Charlotte](https://digitalagencynetwork.com/agencies/charlotte/)
- [INSIDEA — Top 15 agencias de Richmond](https://insidea.com/blog/digital-marketing/agencies/richmond-va)
- [Sortlist — Virginia Beach](https://www.sortlist.com/l/virginia-beach-va-us) · [GoodFirms — Virginia Beach](https://www.goodfirms.co/directory/city/top-digital-marketing-companies/virginia-beach)
- Webs propias: [OnWired](https://onwired.com/), [Instinctive Branding](https://instinctivebranding.com/), [Unita Marketing](https://unitamarketing.com/), [Think Designs](https://thinkdesignsllc.com/digital-marketing-raleigh-nc/), [Breeez](https://www.breeez.com/), [Web Symphonies](https://www.websymphonies.com/), [KNOWN](https://knownagency.com/), [Bryant Digital](https://bryantdigital.com/), [COSTA Designs](https://costadesigns.com/advertising-agency-virginia-beach/), [Commonwealth Creative](https://ccm-web.com/)
