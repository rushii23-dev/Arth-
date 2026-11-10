import { serve } from '@hono/node-server'
import { buildServer } from './server.js'

// The long-running server: Cloud Run, Render or local development. Vercel uses api/index.ts instead.
const { app, config } = buildServer()

serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(JSON.stringify({ severity: 'INFO', msg: 'arth backend listening', port: info.port, store: config.store }))
})
