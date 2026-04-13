import React from 'react'
import { render } from 'ink'
import { App } from './app.js'

const { waitUntilExit, unmount } = render(
  <App onExit={() => { unmount(); process.exit(0) }} />
)
waitUntilExit().then(() => { process.exit(0) })
