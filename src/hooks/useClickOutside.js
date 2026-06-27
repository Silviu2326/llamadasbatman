import { useRef, useEffect } from 'react'

export default function useClickOutside(refs, onClickOutside) {
  const refsRef = useRef(refs)
  const cbRef = useRef(onClickOutside)
  refsRef.current = refs
  cbRef.current = onClickOutside

  useEffect(() => {
    function handle(e) {
      if (refsRef.current.every(r => !r.current || !r.current.contains(e.target))) {
        cbRef.current()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])
}
