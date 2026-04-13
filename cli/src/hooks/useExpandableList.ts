import { useState, useCallback } from 'react'

export type SortKey = string

export function useExpandableList<T>(items: T[], defaultSort?: SortKey) {
  const [cursor, setCursor] = useState(0)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort ?? '')

  const moveUp = useCallback(() => {
    setCursor(prev => Math.max(0, prev - 1))
  }, [])

  const moveDown = useCallback(() => {
    setCursor(prev => Math.min(items.length - 1, prev + 1))
  }, [items.length])

  const toggleExpand = useCallback(() => {
    setExpandedIndex(prev => prev === cursor ? null : cursor)
  }, [cursor])

  const sort = useCallback((key: SortKey) => {
    setSortKey(key)
    setExpandedIndex(null)
    setCursor(0)
  }, [])

  return { cursor, expandedIndex, sortKey, moveUp, moveDown, toggleExpand, sort, setCursor }
}
