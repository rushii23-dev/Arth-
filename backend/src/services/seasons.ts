import { t } from '../lib/i18n.js'
import { addDays, daysBetween, type LangCode } from '../lib/time.js'

export type SeasonId = 'kharif' | 'rabi' | 'zaid'

/** Maharashtra's three seasons as calendar windows (MM-DD); rabi crosses the new year. */
export const SEASONS: { season: SeasonId; start: string; end: string }[] = [
  { season: 'kharif', start: '06-01', end: '10-15' },
  { season: 'rabi', start: '10-16', end: '02-28' },
  { season: 'zaid', start: '03-01', end: '05-31' },
]

export interface SeasonNow {
  season: SeasonId
  name: string
  progress: number
  daysLeft: number
  nextSeason: SeasonId
  nextStarts: string
}

/** The season a date (YYYY-MM-DD) falls in, with its concrete start and end dates. */
export function seasonOn(date: string) {
  const year = Number(date.slice(0, 4))
  for (const [i, s] of SEASONS.entries()) {
    // the window that starts this year, or (for rabi) the one that started last year
    for (const startYear of [year, year - 1]) {
      const start = `${startYear}-${s.start}`
      const endYear = s.end < s.start ? startYear + 1 : startYear
      // rabi runs to the last day of February, leap years included
      const end = s.end === '02-28' ? addDays(`${endYear}-03-01`, -1) : `${endYear}-${s.end}`
      if (date >= start && date <= end) {
        const next = SEASONS[(i + 1) % SEASONS.length]!
        return { season: s.season, startDate: start, endDate: end, next: next.season, nextStarts: addDays(end, 1) }
      }
    }
  }
  throw new Error(`no season for ${date}`)
}

export function seasonNow(today: string, lang: LangCode): SeasonNow {
  const s = seasonOn(today)
  const total = daysBetween(s.startDate, s.endDate) + 1
  const elapsed = daysBetween(s.startDate, today)
  return {
    season: s.season,
    name: t(lang, `season.${s.season}`),
    progress: Math.round((elapsed / total) * 100) / 100,
    daysLeft: daysBetween(today, s.endDate),
    nextSeason: s.next,
    nextStarts: s.nextStarts,
  }
}
