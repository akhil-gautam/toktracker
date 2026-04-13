import { useState, useCallback, useMemo } from 'react'

export function useScrollableList<T>(items: T[], viewportHeight: number = 15) {
  const [scrollOffset, setScrollOffset] = useState(0)
  const [cursor, setCursor] = useState(0)

  const moveUp = useCallback(() => {
    setCursor(prev => {
      const next = Math.max(0, prev - 1)
      if (next < scrollOffset) setScrollOffset(next)
      return next
    })
  }, [scrollOffset])

  const moveDown = useCallback(() => {
    setCursor(prev => {
      const next = Math.min(items.length - 1, prev + 1)
      if (next >= scrollOffset + viewportHeight) setScrollOffset(next - viewportHeight + 1)
      return next
    })
  }, [items.length, scrollOffset, viewportHeight])

  const visibleItems = useMemo(() => {
    return items.slice(scrollOffset, scrollOffset + viewportHeight)
  }, [items, scrollOffset, viewportHeight])

  const visibleStartIndex = scrollOffset

  return { cursor, scrollOffset, visibleItems, visibleStartIndex, moveUp, moveDown }
}
