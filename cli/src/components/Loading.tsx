import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

interface LoadingProps { message?: string }

export function Loading({ message = 'Parsing session files...' }: LoadingProps) {
  return (
    <Box>
      <Text color="cyan"><Spinner type="dots" /></Text>
      <Text color="gray"> {message}</Text>
    </Box>
  )
}
