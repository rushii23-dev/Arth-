import type { z } from 'zod'
import { ApiError } from '../errors.js'

/** Validates a query string; a bad one is a 400 `invalid_query` naming the field. */
export function parseQuery<T extends z.ZodType>(schema: T, query: Record<string, string>): z.infer<T> {
  const parsed = schema.safeParse(query)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ApiError(400, 'invalid_query', `${issue?.path.join('.') || 'query'}: ${issue?.message ?? 'invalid'}`)
  }
  return parsed.data
}
