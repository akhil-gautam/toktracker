import notifier from 'node-notifier'
import type { Detection } from '../detection/types.js'

export function notify(detection: Detection): void {
  try {
    notifier.notify({
      title: `tokscale: ${detection.ruleId}`,
      message: detection.summary,
      sound: detection.severity === 'block',
    })
  } catch {}
}
