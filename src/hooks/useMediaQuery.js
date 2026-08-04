import { useEffect, useState } from 'react'

/** Reacciona a un media query desde JS. Para lo que no se puede resolver en
 *  CSS: `inert`, props de componentes, ramas de render. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}
