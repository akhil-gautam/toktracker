import React from 'react'
import { Box, Text } from 'ink'

interface UnpricedBannerProps {
  count: number
}

/**
 * One quiet aggregate line shown when some sessions ran on models with no known
 * price. Their cost is recorded as $0 (we no longer guess a neighbor's price), so
 * totals can be understated. Deliberately low-key — not a per-row badge.
 */
export function UnpricedBanner({ count }: UnpricedBannerProps) {
  if (count <= 0) return null
  const label = count === 1 ? 'session' : 'sessions'
  return (
    <Box>
      <Text color="#FFC107">~ </Text>
      <Text color="gray" dimColor>
        {count} {label} on unpriced models — totals may be understated
      </Text>
    </Box>
  )
}
