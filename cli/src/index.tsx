import React from 'react'
import { render } from 'ink'
import { App } from './app.js'

// Clear screen and move cursor to top-left for fullscreen feel
process.stdout.write('\x1B[2J\x1B[H')

const { waitUntilExit, unmount } = render(
  <App onExit={() => {
    // Restore screen on exit
    process.stdout.write('\x1B[2J\x1B[H')
    unmount()
    process.exit(0)
  }} />,
)
waitUntilExit().then(() => { process.exit(0) })
