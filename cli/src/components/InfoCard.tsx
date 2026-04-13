import React from 'react'
import { Box, Text } from 'ink'

interface InfoCardProps {
  children: React.ReactNode
  borderColor?: string
  width?: number
}

export function InfoCard({ children, borderColor, width }: InfoCardProps) {
  return (
    <Box
      borderStyle="round"
      borderColor={borderColor ?? 'gray'}
      paddingX={1}
      paddingY={0}
      width={width ?? 28}
      flexDirection="column"
    >
      {children}
    </Box>
  )
}
