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
/** Fixed so that answers repeat across calls and servers. */
const SEED = 7
/** Not worth a retry with less time than this left. */
const MIN_RETRY_MS = 4_000
/** With a stand-in model ready, the first model gets this long before the stand-in is asked instead. */
const FIRST_TRY_MS = 12_000

/**
 * When a model is overloaded (503, 429), fails or is too slow, the retry goes to a stand-in that
 * reads the same photos and audio. Gemma 4 returns bursts of 503s under load (seen live on 21 Nov 2026).
 */
export const STAND_IN: Record<string, string> = { 'gemma-4-26b-a4b-it': 'gemini-2.5-flash' }

/** Pulls the first JSON object out of a reply that may wrap it in prose or ``` fences. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = fenced?.[1] ?? text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON object in reply')
  return JSON.parse(body.slice(start, end + 1))
}

/**
 * Each family takes a different "think less" setting, and rejects the others (checked live):
 * Gemma 4 errors without MINIMAL, Gemini 2.5 takes only a token budget, Gemini 3.x rejects MINIMAL.
 */
export function thinkingFor(model: string) {
  if (model.startsWith('gemma-')) return { thinkingLevel: ThinkingLevel.MINIMAL }
  if (model.startsWith('gemini-2.5')) return { thinkingBudget: 0 }
  return { thinkingLevel: ThinkingLevel.LOW }
}

export function gemini(apiKey: string, timeoutMs = MODEL_TIMEOUT_MS): Llm {
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

    // One retry, for a server hiccup (Gemma returns occasional 500s) or a reply of the wrong shape,
    // inside one overall deadline so the farmer never waits past the app's 20 s.
    const deadline = performance.now() + timeoutMs
    const standIn = STAND_IN[model]
    let current = model
    let lastError = 'invalid reply'
    for (let attempt = 0; attempt < 2; attempt++) {
      let text: string
      const start = performance.now()
      const left = deadline - start
      if (attempt > 0 && left < MIN_RETRY_MS) break
      // leave the stand-in enough time if the first model hangs
      const budget = attempt === 0 && standIn ? Math.min(left, FIRST_TRY_MS) : left
      try {
        const res = await ai.models.generateContent({
          model: current,
          contents,
          config: {
            systemInstruction: system,
            // Same input, same answer: no sampling. Checked live, Gemma 4 repeats itself exactly with these.
            temperature: 0,
            topK: 1,
            seed: SEED,
            responseMimeType: 'application/json',
            maxOutputTokens: 1500,
            thinkingConfig: thinkingFor(current),
            abortSignal: AbortSignal.timeout(Math.max(1, Math.round(budget))),
          },
        })
        text = res.text ?? ''
        const u = res.usageMetadata
        // counts and timing only: never the prompt, the media or the reply (SPEC §5.9)
        console.log(
          JSON.stringify({
            severity: 'INFO',
            msg: 'model call',
            model: current,
            attempt,
            ms: Math.round(performance.now() - start),
            tokensIn: u?.promptTokenCount,
            tokensOut: u?.candidatesTokenCount,
            finish: res.candidates?.[0]?.finishReason,
          }),
        )
      } catch (err) {
        const status = (err as { status?: number }).status
        const timedOut = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
        // status and error kind only: an error message could quote the request
        const kind = err instanceof Error ? err.name : typeof err
        console.log(JSON.stringify({ severity: 'WARNING', msg: 'model call failed', model: current, attempt, status, timedOut, kind }))
        // busy, failing or slow: hand the second try to the stand-in, if there is one and time for it
        if (attempt === 0 && standIn && (status === 429 || timedOut || status === undefined || status >= 500)) {
          lastError = `server error ${status ?? (timedOut ? 'timeout' : 'network')}`
          current = standIn
          continue
        }
        if (status === 429) throw new ApiError(503, 'ai_busy', 'The AI is busy, try again in a minute')
        if (timedOut) throw new ApiError(504, 'ai_timeout', 'The AI took too long')
        // a 4xx is our request's fault and will fail again; a 5xx or a dropped connection may not
        const transient = status === undefined || status >= 500
        if (transient && attempt === 0) {
          lastError = `server error ${status ?? 'network'}`
          continue
        }
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
    if (lastError.startsWith('server error')) throw new ApiError(502, 'ai_unavailable', 'The AI did not answer')
    throw new ApiError(502, 'ai_bad_reply', `The AI reply could not be read (${lastError})`)
  }
}
