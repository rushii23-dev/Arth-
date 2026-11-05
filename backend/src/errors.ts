import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** Thrown anywhere in a handler; rendered as SPEC §3 `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const notFound = (code: string, message: string) => new ApiError(404, code, message)
export const badRequest = (code: string, message: string) => new ApiError(400, code, message)

export function errorBody(c: Context, status: ContentfulStatusCode, code: string, message: string) {
  return c.json({ error: { code, message } }, status)
}
