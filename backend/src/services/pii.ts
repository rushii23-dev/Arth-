/**
 * SPEC §5.4: redact Aadhaar, PAN, IFSC, bank account, phone and email from any text
 * before it is sent to the model, logged, returned or stored.
 */

export type PiiKind = 'Aadhaar' | 'PAN' | 'IFSC' | 'Bank account' | 'Phone' | 'Email'

// Order matters: longer, more specific numbers first so a 12-digit Aadhaar is not read as a bank account.
const RULES: { kind: PiiKind; re: RegExp }[] = [
  { kind: 'Email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: 'PAN', re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
  { kind: 'IFSC', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  // 12 digits, first 2-9, often printed 4-4-4
  { kind: 'Aadhaar', re: /(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g },
  // Indian mobile: optional +91 / 0, then 10 digits starting 6-9
  { kind: 'Phone', re: /(?<!\d)(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g },
  // bank accounts: 9 to 18 digits
  { kind: 'Bank account', re: /(?<!\d)\d{9,18}(?!\d)/g },
]

const MASK: Record<PiiKind, string> = {
  Aadhaar: '[Aadhaar]',
  PAN: '[PAN]',
  IFSC: '[IFSC]',
  'Bank account': '[account]',
  Phone: '[phone]',
  Email: '[email]',
}

export function redact(text: string): { text: string; found: PiiKind[] } {
  const found = new Set<PiiKind>()
  let out = text
  for (const { kind, re } of RULES) {
    out = out.replace(re, () => {
      found.add(kind)
      return MASK[kind]
    })
  }
  return { text: out, found: [...found] }
}

/** Redacts every string inside a JSON-like value, collecting what was found. */
export function redactDeep<T>(value: T, found = new Set<PiiKind>()): { value: T; found: Set<PiiKind> } {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = redact(v)
      r.found.forEach((k) => found.add(k))
      return r.text
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return { value: walk(value) as T, found }
}
