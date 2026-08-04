# Tema claro / oscuro

## Cómo funciona

El tema vive en un atributo del `<html>`: `data-theme="dark"` o `data-theme="light"`.

1. **`index.html`** tiene un script inline que resuelve el tema **antes del primer pintado** (si se hiciera desde React habría un flash del tema contrario). Lee `localStorage['vozia:theme']`; si no hay nada guardado, sigue a `prefers-color-scheme` del sistema operativo y se queda escuchando por si el usuario lo cambia ahí.
2. **`src/theme.css`** define los dos juegos de tokens, uno por bloque `[data-theme='…']`. Se importa el primero en `src/main.jsx`.
3. **`src/hooks/useTheme.js`** expone:
   - `useTheme()` → `[theme, setTheme, isAuto]`. `setTheme('dark'|'light')` fija; `setTheme(null)` vuelve a seguir al SO.
   - `useThemeColors()` → los mismos tokens **resueltos a hex**.
4. El selector Auto / ☀ / ☾ está en el pie del sidebar (`src/components/Sidebar.jsx`).

## La regla

> **No escribas un hex fuera de `src/theme.css`.** Usa `var(--token)`.

Vale igual en CSS y en estilos inline de React:

```jsx
<div style={{ background: 'var(--surface)', border: '1px solid var(--line)' }} />
```

## La excepción: SVG y Recharts

`var()` **no resuelve en atributos de presentación SVG**. Esto no funciona:

```jsx
<CartesianGrid stroke="var(--line)" />   {/* ✗ se pinta en negro */}
```

Para gráficos (Recharts, `<circle>`, `<path>`, gradientes en `<defs>`) usa el hook, que devuelve el hex ya resuelto y se recalcula solo al cambiar de tema:

```jsx
const colors = useThemeColors()
<CartesianGrid stroke={colors.line} />   {/* ✓ */}
```

`#fff`, `#000` y los `rgba(0,0,0,…)` de sombra sí pueden quedarse literales: funcionan en ambos temas (knobs de toggle, texto sobre un relleno de acento, sombras).

## La otra excepción: transparencias

Concatenar alfa hexadecimal a un color **deja de funcionar** en cuanto ese color es un token:

```jsx
background: `${color}18`   // ✗ '#818cf818' era válido; 'var(--accent-soft)18' no
```

El resultado es CSS inválido, así que la tinta no se pinta y no hay ningún error en consola que lo delate. Usa `color-mix()`, que acepta tanto un hex como un `var()`:

```jsx
background: `color-mix(in srgb, ${color} 9%, transparent)`   // ✓
```

La conversión de los 116 casos que había la hizo `scripts/alpha-to-colormix.mjs`, que también sirve para comprobar que no han vuelto a aparecer:

```bash
node scripts/alpha-to-colormix.mjs          # muestra lo que haría
node scripts/alpha-to-colormix.mjs --write  # escribe
```

Si lo que necesitas es un fondo teñido de un color semántico, mira antes si te sirve un token `--success-bg` / `--warn-bg` / `--danger-bg` / `--accent-bg`.

## Los tokens

Los nombres van por **rol**, no por color, para que cambien de valor entre temas sin mentir:

| Grupo | Tokens |
|---|---|
| Lienzo | `--bg` |
| Superficies | `--surface`, `--surface-soft`, `--surface-2`, `--surface-3`, `--surface-hover` |
| Líneas | `--line`, `--line-2`, `--line-hover`, `--line-control` |
| Texto (de más a menos prominente) | `--text-strong`, `--text`, `--text-2`, `--muted`, `--dim`, `--faint`, `--on-accent` |
| Acento de marca | `--accent`, `--accent-soft`, `--accent-faint`, `--accent-deep`, `--accent-bg` |
| Secundarios | `--violet(-soft/-deep)`, `--cyan(-soft/-deep/-bg)`, `--pink`, `--lime` |
| Semánticos | `--success(-soft/-deep/-bg)`, `--warn(-soft/-faint/-deep/-bg)`, `--danger(-soft/-faint/-deep/-bg)`, `--info(-deep/-bg)` |
| Sombras y velos | `--shadow-1`, `--shadow-2`, `--shadow-color`, `--scrim` |

La rampa de texto es monótona en ambos temas: en oscuro va de claro a oscuro, en claro al revés. Si necesitas "un gris un poco distinto", casi siempre es que te falta bajar un escalón de la rampa, no añadir un token.

**`-soft` y `-faint` invierten su dirección entre temas.** En oscuro son escalones *más claros* que el base (más énfasis sobre fondo oscuro); en claro son *más oscuros*. Es lo que hace que `color: var(--success-soft)` siga siendo legible en los dos sitios. Si añades un tono, respeta esa regla o romperás cientos de usos de golpe.

**`--line-hover`** es el borde de `:hover`/`:focus-visible`. Existe porque si el hover usa el mismo `--line-2` que el reposo, la regla no se ve: había 46 hover así.

**`--line-control`** es el borde de `input`, `select`, `textarea` y checkbox. WCAG 1.4.11 pide 3:1 para el contorno de un control, y `--line`/`--line-2` son separadores decorativos que no llegan (1.2-1.7:1). Si el borde es lo único que delimita un campo, usa este token; si es una raya entre dos bloques, no.

### Contraste de la rampa de texto

Ratios sobre `--surface` / `--surface-3`, calculados:

| Token | Oscuro | Claro |
|---|---|---|
| `--text` | 15.35 / 14.12 | 14.63 / 12.45 |
| `--text-2` | 12.75 / 11.72 | 10.35 / 8.81 |
| `--muted` | 7.38 / 6.79 | 7.34 / 6.25 |
| `--dim` | 4.92 / 4.52 | 6.17 / 5.25 |
| `--faint` | **3.44 / 3.16** | 4.99 / 4.24 |

**`--faint` no vale para texto de tamaño normal.** Se queda en 3.2-3.4 en oscuro: solo para texto grande (≥18.66px, o ≥14px en negrita), iconos, bordes y estados deshabilitados. Para texto secundario pequeño, el escalón correcto es `--dim`.

Subirlo más colapsaría la rampa contra `--dim`, así que la decisión es explícita: `--faint` es un token de no-texto que además sirve para titulares grandes.

**`--shadow-color`** es el color de sombra, no la sombra entera. Se tokeniza solo el color para que cada regla conserve su geometría (`0 20px 60px var(--shadow-color)`); un negro literal al 50% que en oscuro da profundidad, en claro da suciedad.

**`--scrim`** es el velo de modal, oscuro en ambos temas a propósito: uno claro no separaría el modal del fondo. Había 10 densidades distintas repartidas por el proyecto.

Los `*-bg` son **fondos teñidos**, no rellenos sólidos: en oscuro son la variante 900 del color y en claro la 100, igual que `--accent-bg`. Van con el texto del mismo color encima (`background: var(--success-bg); color: var(--success)`), nunca al revés.

`--lime` existe porque el verde-amarillo no lo cubría ningún token y es el color identificativo de *Captación orgánica* en el sidebar. Es el único acento "de sección" que necesitó token propio: el resto (naranja de Reuniones → `--warn`, rosa de Probar voz → `--danger`, teal de Playbooks → `--success`, indigo claro de Inteligencia comercial → `--accent-soft`) cae en un token semántico existente.

## De dónde viene esto

El CRM nació sin sistema de color: **1.747 hex distintos en 7.746 usos**, con 8 fondos de página casi idénticos, ~45 superficies, las escalas *gray* y *slate* de Tailwind mezcladas para el mismo rol, 9 "primarios" y 8 verdes / 8 ámbares / 7 rojos. Dos vistas (`/organic` y la pantalla de error global) estaban además hardcodeadas en claro dentro de un CRM oscuro.

La migración la hizo **`scripts/tokenize-colors.mjs`**, que se conserva porque *es* la documentación del mapeo hex → token. Si aparece un hex nuevo, se añade al `MAP` y se vuelve a pasar:

```bash
node scripts/tokenize-colors.mjs          # muestra lo que haría + los hex sin mapear
node scripts/tokenize-colors.mjs --write  # escribe
```

Ejecutarlo sin `--write` es la forma rápida de auditar cuánto color sin tokenizar queda.

## Excepciones vivas

Lo que queda sin tokenizar (`node scripts/tokenize-colors.mjs` lo lista) es a propósito:

- **`src/style.css`, bloque `.login-*`** y los hex de `src/pages/LoginPage.jsx`: el login es una landing pública con split-screen claro intencional, con su propia paleta `--login-*`. No sigue el tema y así debe seguir.
  - `#f2f5ff` y `#f5f7ff` aparecen a la vez en el login y en páginas del CRM. Un hex solo puede tener un token, así que se quedan literales: tokenizarlos rompería el login.
- **Colores de marca de terceros**: Facebook `#1877f2`/`#0c4a9e`, LinkedIn `#0a66c2`, Instagram `#e1306c`, TikTok `#25f4ee`, YouTube `#ff4d67`, Google `#4285f4`/`#34a853`, Zoom `#2d8cff`, Teams `#5b5ea6`. Son identidad ajena, no color de nuestro tema.
- **`#fff` / `#ffffff` / `#000`**: funcionan en ambos temas, pero **solo sobre un relleno de acento sólido**. `color:#fff` sobre `var(--surface)` es invisible en claro; distingue siempre los dos casos.
- **Hex de 8 dígitos (color + alfa), ~890 usos**: `scripts/tokenize-colors.mjs` solo toca hex opacos de 6 dígitos, así que estos siguen literales. Los que quedan son de **alfa baja sobre una base de luminancia media** (`#10b98115`): componen bien en los dos temas. Todos los de alfa ≥40% sobre una base extrema (muy oscura o muy clara) sí se migraron, porque esos eran los que en el otro tema daban un panel opaco o un borde invisible.

  Si tocas uno, pásalo a `color-mix(in srgb, var(--token) N%, transparent)`. **Elige el token cuyo valor en OSCURO sea ese mismo hex**: así el tema oscuro se renderiza idéntico y solo cambia el claro. Si no hay ninguno exacto, compensa el porcentaje — `#4c0519` al 40 % equivale a `--danger-bg` al 12 %, porque `--danger-bg` es 3 veces más claro.
- **Velos sobre fotografía** (`ads-wizard.css` `.ads-creative-preview::after`, `landings.css` `.landing-thumb-shade`): oscuros en los dos temas a propósito. Llevan texto blanco encima y la imagen de debajo no cambia con el tema.
- **`src/components/dashboard/EmbudoChart.jsx`**: resuelve tokens a hex a propósito para atributos SVG.
