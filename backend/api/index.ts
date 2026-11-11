/**
 * Vercel entry (backend/vercel.json sends every path here, in the Mumbai region). The same Hono app
 * as the Node server, served through Vercel's web-standard handlers; built once per instance.
 *
 * The app is loaded lazily so a start-up failure (a missing setting, a bad key) answers with its
 * message instead of an opaque FUNCTION_INVOCATION_FAILED, and the next request tries again.
 */
type App = { fetch: (request: Request) => Response | Promise<Response> }
let server: Promise<App> | null = null

function load(): Promise<App> {
  server ??= import('../src/server.js').then((m) => m.buildServer().app)
  return server
}

async function handle(request: Request): Promise<Response> {
  let app: App
  try {
    app = await load()
  } catch (err) {
    server = null
    const message = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ severity: 'ERROR', msg: 'startup failed', error: message }))
    return Response.json({ error: { code: 'startup_failed', message } }, { status: 500 })
  }
  return app.fetch(request)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const OPTIONS = handle
