import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { z } from 'zod'
import { ApiError } from '../errors.js'

export type Part = { text: string } | { media: { mimeType: string; data: Uint8Array } }

export interface JsonRequest<T extends z.ZodType> {
  model: string
  system: string
  parts: Part[]
  schema: T
  /** what the model's answer must look like, shown to it as an example */
  shape: string
}

/** Asks a model for one JSON object and validates it. Media is sent inline and never stored. */
export type Llm = <T extends z.ZodType>(req: JsonRequest<T>) => Promise<z.infer<T>>

/** The frontend gives up on /ai/* after 20 s; answer or fail before that. */
const MODEL_TIMEOUT_MS = 18_000

/** Pulls the first JSON object out of a reply that may wrap it in prose or ``` fences. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = fenced?.[1] ?? text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON object in reply')
  return JSON.parse(body.slice(start, end + 1))
}

export function gemini(apiKey: string): Llm {
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null

  return async ({ model, system, parts, schema, shape }) => {
    if (!ai || !model) throw new ApiError(503, 'ai_not_configured', 'AI is not set up on this server')
    const contents = [
      {
        role: 'user',
        parts: [
          ...parts.map((p) =>
            'text' in p
              ? { text: p.text }
              : { inlineData: { mimeType: p.media.mimeType, data: Buffer.from(p.media.data).toString('base64') } },
          ),
          { text: `Answer with ONE JSON object only, no other text, shaped exactly like:\n${shape}` },
        ],
      },
    ]

    // one retry when the reply is not valid JSON of the right shape
    let lastError = 'invalid reply'
    for (let attempt = 0; attempt < 2; attempt++) {
      let text: string
      try {
        const res = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: system,
            temperature: 0.2,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
          },
        })
        text = res.text ?? ''
      } catch (err) {
        const status = (err as { status?: number }).status
        if (status === 429) throw new ApiError(503, 'ai_busy', 'The AI is busy, try again in a minute')
        if (err instanceof Error && err.name === 'AbortError') throw new ApiError(504, 'ai_timeout', 'The AI took too long')
        throw new ApiError(502, 'ai_unavailable', 'The AI did not answer')
      }
      try {
        const parsed = schema.safeParse(extractJson(text))
        if (parsed.success) return parsed.data
        lastError = parsed.error.issues[0]?.message ?? 'wrong shape'
      } catch (e) {
        lastError = (e as Error).message
      }
    }
    throw new ApiError(502, 'ai_bad_reply', `The AI reply could not be read (${lastError})`)
  }
}
