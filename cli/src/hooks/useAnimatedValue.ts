import { useState, useEffect } from 'react'

export function useAnimatedValue(target: number, duration: number = 400): number {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (target === 0) { setCurrent(0); return }
    const startTime = Date.now()
    const startValue = current
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(startValue + (target - startValue) * eased))
      if (progress >= 1) { clearInterval(timer); setCurrent(target) }
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration])

  return current
}

export function useAnimatedCost(targetMillicents: number, duration: number = 600): string {
  const animated = useAnimatedValue(targetMillicents, duration)
  const dollars = animated / 100_000
  if (dollars >= 100) return `$${dollars.toFixed(0)}`
  if (dollars >= 10) return `$${dollars.toFixed(1)}`
  return `$${dollars.toFixed(2)}`
}
