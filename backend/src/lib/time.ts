export type LangCode = 'en' | 'hi' | 'mr'
export type Clock = () => Date

const IST = 'Asia/Kolkata'
const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' })

/** The date in India as YYYY-MM-DD. */
export const istDate = (d: Date) => isoFmt.format(d)

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)

const LOCALE: Record<LangCode, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' }

export function weekday(lang: LangCode, iso: string): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
}
