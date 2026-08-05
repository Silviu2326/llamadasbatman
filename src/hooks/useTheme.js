import { useEffect, useState } from 'react'

const KEY = 'vendrava:theme'

/** Tema activo ('dark' | 'light') y setter. `null` = seguir al sistema.
 *  El valor inicial ya lo puso el script inline de index.html antes de pintar. */
export function useTheme() {
  const [theme, setThemeState] = useState(() => document.documentElement.dataset.theme || 'dark')

  useEffect(() => observeTheme(setThemeState), [])

  const setTheme = next => {
    if (next) localStorage.setItem(KEY, next)
    else localStorage.removeItem(KEY)
    document.documentElement.dataset.theme =
      next || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  }

  return [theme, setTheme, localStorage.getItem(KEY) === null]
}

/** Valores resueltos de los tokens de src/theme.css, para quien no puede usar
 *  var(): Recharts los pasa a atributos de presentación SVG, donde var() no
 *  resuelve. Se relee solo cuando cambia el tema. */
export function useThemeColors() {
  const [colors, setColors] = useState(readTokens)
  useEffect(() => observeTheme(() => setColors(readTokens())), [])
  return colors
}

function readTokens() {
  const style = getComputedStyle(document.documentElement)
  const value = name => style.getPropertyValue(name).trim()
  return {
    bg: value('--bg'),
    surface: value('--surface'),
    surface2: value('--surface-2'),
    surfaceHover: value('--surface-hover'),
    line: value('--line'),
    line2: value('--line-2'),
    text: value('--text'),
    muted: value('--muted'),
    dim: value('--dim'),
    faint: value('--faint'),
    accent: value('--accent'),
    accentSoft: value('--accent-soft'),
    violet: value('--violet'),
    cyan: value('--cyan'),
    pink: value('--pink'),
    success: value('--success'),
    warn: value('--warn'),
    danger: value('--danger'),
    info: value('--info'),
  }
}

// El atributo lo cambian tanto el toggle como el listener de prefers-color-scheme
// de index.html, así que se observa el DOM en vez de encadenar callbacks.
function observeTheme(onChange) {
  const target = document.documentElement
  const observer = new MutationObserver(() => onChange(target.dataset.theme || 'dark'))
  observer.observe(target, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
