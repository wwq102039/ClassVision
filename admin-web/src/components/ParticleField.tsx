import { useEffect, useRef } from 'react'

/** Decoration only: never receives pointer events or keyboard focus. */
export default function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0, height = 0, frame = 0, last = 0
    const pointer = { x: -1000, y: -1000 }
    let points: { x: number; y: number; vx: number; vy: number }[] = []
    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * ratio
      canvas.height = height * ratio
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      points = Array.from({ length: Math.min(85, Math.floor(width * height / 14500)) }, () => ({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3 }))
    }
    const draw = (time: number) => {
      const delta = Math.min((time - last) / 16.67 || 1, 2)
      last = time
      ctx.clearRect(0, 0, width, height)
      points.forEach((p, index) => {
        if (!reduced.matches) { p.x = (p.x + p.vx * delta + width) % width; p.y = (p.y + p.vy * delta + height) % height }
        const near = Math.hypot(p.x - pointer.x, p.y - pointer.y) < 170
        ctx.fillStyle = near ? '#b4fcff' : '#41c9f4'
        ctx.shadowBlur = 9
        ctx.shadowColor = '#3ddaff'
        ctx.beginPath(); ctx.arc(p.x, p.y, near ? 2.2 : 1.3, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
        for (let j = index + 1; j < points.length; j++) {
          const q = points[j], distance = Math.hypot(p.x - q.x, p.y - q.y)
          if (distance < 135) {
            ctx.strokeStyle = `rgba(61, 202, 244, ${(1 - distance / 135) * .25})`
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke()
          }
        }
      })
      if (!reduced.matches && !document.hidden) frame = requestAnimationFrame(draw)
    }
    const restart = () => { cancelAnimationFrame(frame); last = 0; draw(0) }
    const onResize = () => { resize(); restart() }
    const move = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY }
    resize(); restart()
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('visibilitychange', restart)
    reduced.addEventListener('change', restart)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', move)
      document.removeEventListener('visibilitychange', restart)
      reduced.removeEventListener('change', restart)
    }
  }, [])
  return <canvas ref={ref} className="particle-canvas" aria-hidden="true" />
}
