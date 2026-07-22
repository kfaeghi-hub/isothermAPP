import { useEffect, useRef } from 'react'

// Scroll reveal for the landing page: adds .lv-in when the element enters the
// viewport (once), then disconnects. Under prefers-reduced-motion the CSS
// renders .lv-hidden/.lv-group children fully visible and suppresses the
// animation, so the hook needs no special-casing.
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('lv-in')
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}
