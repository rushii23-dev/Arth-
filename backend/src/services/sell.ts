import { CROPS, cropName } from '../data/crops.js'
import { rupees, t } from '../lib/i18n.js'
import type { LangCode } from '../lib/time.js'
import { slopePerDay, type MandiView } from './mandi.js'

export interface SellOption {
  market: string
  modalPrice: number
  distanceKm: number
  transportCost: number
  netEarning: number
}

export interface SellAdvice {
  recommendation: 'SELL_NOW' | 'WAIT'
  bestMarket: string
  netEarning: number
  options: SellOption[]
  trendSlope: number
  reasoning: string
}

/** A daily move of at least this share of the price counts as a real trend. */
const TREND_SHARE_PER_DAY = 0.005
const MAX_OPTIONS = 5

export function sellAdvice(
  view: MandiView,
  req: { commodity: string; quantityQuintals: number; lang: LangCode },
  rsPerQuintalKm: number,
): SellAdvice {
  const qty = req.quantityQuintals
  const options = view.markets
    .map((m) => {
      const transportCost = Math.round(m.distanceKm * rsPerQuintalKm * qty)
      return {
        market: m.market,
        modalPrice: m.modalPrice,
        distanceKm: m.distanceKm,
        transportCost,
        netEarning: Math.round(m.modalPrice * qty - transportCost),
      }
    })
    .sort((a, b) => b.netEarning - a.netEarning)
    .slice(0, MAX_OPTIONS)
  const best = options[0]!

  const slope = slopePerDay(view.trend, 7)
  const lastPrice = view.trend.at(-1)?.modalPrice ?? best.modalPrice
  const threshold = lastPrice * TREND_SHARE_PER_DAY
  const storable = CROPS[req.commodity]?.storable ?? false
  const rising = slope >= threshold
  const falling = slope <= -threshold
  const wait = rising && storable

  const vars = {
    market: best.market,
    net: rupees(best.netEarning),
    qty: qty,
    trendMarket: view.trendMarket,
    slope: rupees(Math.abs(slope)),
    crop: cropName(req.commodity, req.lang),
    gain: rupees(Math.round((slope * 7 * qty) / 100) * 100),
  }
  const trendLine = rising
    ? t(req.lang, storable ? 'sell.risingWait' : 'sell.risingPerishable', vars)
    : t(req.lang, falling ? 'sell.falling' : 'sell.flat', vars)

  return {
    recommendation: wait ? 'WAIT' : 'SELL_NOW',
    bestMarket: best.market,
    netEarning: best.netEarning,
    options,
    trendSlope: slope,
    reasoning: [t(req.lang, 'sell.best', vars), trendLine, t(req.lang, 'sell.note')].join(' '),
  }
}
