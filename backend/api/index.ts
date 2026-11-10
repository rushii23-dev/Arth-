import { buildServer } from '../src/server.js'

/**
 * Vercel entry (backend/vercel.json sends every path here, in the Mumbai region). The same Hono app
 * as the Node server, served through Vercel's web-standard handlers; built once per instance.
 */
const { app } = buildServer()
const handle = (request: Request) => app.fetch(request)

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const OPTIONS = handle
