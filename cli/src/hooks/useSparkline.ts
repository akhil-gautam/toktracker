import { sparkline } from '../theme.js'

export function useSparkline(values: number[]): string {
  return sparkline(values)
}
