import type { SeasonId } from '../services/seasons.js'

/**
 * The usual crop calendar for Maharashtra (state agriculture department and agricultural
 * university package of practices, simplified). Dates are MM-DD and may cross the new year.
 * All windows are calendar windows; no monsoon-onset adjustment is claimed.
 */

export type Phase = 'sow' | 'grow' | 'protect' | 'harvest' | 'rest'
export type Soil = 'black' | 'red' | 'laterite' | 'alluvial' | 'sandy' | 'clay'

export interface StageSpan {
  start: string
  end: string
  phase: Phase
  /** text key prefix: `stage.<crop>.<key>` and `stage.<crop>.<key>.task` */
  key: string
}

export interface SowingWindow {
  season: SeasonId
  from: string
  to: string
  /** sowing (or nursery sowing / planting) to harvest */
  durationDays: number
}

export interface CropPlan {
  /** the crop's usual year, in order, covering all 12 months */
  year: StageSpan[]
  /** annual crops only; perennial orchards have no sowing window */
  windows: SowingWindow[]
  goodSoils: Soil[]
  poorSoils: Soil[]
  /** needs assured irrigation: a rain-fed farm rates it low */
  needsIrrigation: boolean
  /** week-by-week plan from sowing: [week, title key, task keys] */
  timeline: [number, string, string[]][]
}

const PREP: [number, string, string[]] = [0, 'plan.prepare', ['plan.prepare.1', 'plan.prepare.2']]

export const CROP_PLANS: Record<string, CropPlan> = {
  onion: {
    year: [
      { start: '10-15', end: '11-30', phase: 'sow', key: 'sow' },
      { start: '12-01', end: '01-15', phase: 'grow', key: 'grow' },
      { start: '01-16', end: '03-15', phase: 'protect', key: 'protect' },
      { start: '03-16', end: '05-15', phase: 'harvest', key: 'harvest' },
      { start: '05-16', end: '10-14', phase: 'rest', key: 'rest' },
    ],
    windows: [
      { season: 'kharif', from: '06-01', to: '07-15', durationDays: 120 },
      { season: 'rabi', from: '10-16', to: '11-30', durationDays: 150 },
    ],
    goodSoils: ['black', 'alluvial', 'red'],
    poorSoils: ['sandy', 'clay'],
    needsIrrigation: true,
    timeline: [
      PREP,
      [1, 'plan.sow', ['plan.sow.nursery', 'plan.sow.seed']],
      [7, 'plan.transplant', ['plan.transplant.1']],
      [10, 'plan.weed', ['plan.weed.1', 'plan.weed.2']],
      [13, 'plan.pests', ['plan.pests.1', 'plan.pests.2']],
      [19, 'plan.cure', ['plan.cure.1', 'plan.cure.2']],
      [21, 'plan.harvest', ['plan.harvest.1', 'plan.harvest.2']],
    ],
  },
  soybean: {
    year: [
      { start: '06-15', end: '07-15', phase: 'sow', key: 'sow' },
      { start: '07-16', end: '08-15', phase: 'grow', key: 'grow' },
      { start: '08-16', end: '09-20', phase: 'protect', key: 'protect' },
      { start: '09-21', end: '10-20', phase: 'harvest', key: 'harvest' },
      { start: '10-21', end: '06-14', phase: 'rest', key: 'rest' },
    ],
    windows: [{ season: 'kharif', from: '06-15', to: '07-15', durationDays: 100 }],
    goodSoils: ['black', 'alluvial', 'clay'],
    poorSoils: ['sandy', 'laterite'],
    needsIrrigation: false,
    timeline: [
      PREP,
      [1, 'plan.sow', ['plan.sow.seed']],
      [4, 'plan.weed', ['plan.weed.1', 'plan.weed.2']],
      [7, 'plan.pests', ['plan.pests.1', 'plan.pests.2']],
      [14, 'plan.harvest', ['plan.harvest.1', 'plan.harvest.2']],
    ],
  },
  cotton: {
    year: [
      { start: '06-01', end: '07-10', phase: 'sow', key: 'sow' },
      { start: '07-11', end: '08-31', phase: 'grow', key: 'grow' },
      { start: '09-01', end: '10-31', phase: 'protect', key: 'protect' },
      { start: '11-01', end: '01-31', phase: 'harvest', key: 'harvest' },
      { start: '02-01', end: '05-31', phase: 'rest', key: 'rest' },
    ],
    windows: [{ season: 'kharif', from: '06-01', to: '07-10', durationDays: 170 }],
    goodSoils: ['black', 'alluvial'],
    poorSoils: ['sandy', 'laterite'],
    needsIrrigation: false,
    timeline: [
      PREP,
      [1, 'plan.sow', ['plan.sow.seed']],
      [5, 'plan.weed', ['plan.weed.1', 'plan.weed.2']],
      [9, 'plan.pests', ['plan.pests.1', 'plan.pests.2']],
      [12, 'plan.water', ['plan.water.1']],
      [20, 'plan.harvest', ['plan.harvest.1', 'plan.harvest.2']],
    ],
  },
  tomato: {
    year: [
      { start: '10-01', end: '11-15', phase: 'sow', key: 'sow' },
      { start: '11-16', end: '12-31', phase: 'grow', key: 'grow' },
      { start: '01-01', end: '01-31', phase: 'protect', key: 'protect' },
      { start: '02-01', end: '03-31', phase: 'harvest', key: 'harvest' },
      { start: '04-01', end: '09-30', phase: 'rest', key: 'rest' },
    ],
    windows: [
      { season: 'kharif', from: '06-01', to: '07-31', durationDays: 130 },
      { season: 'rabi', from: '10-16', to: '11-30', durationDays: 130 },
      { season: 'zaid', from: '03-01', to: '03-31', durationDays: 120 },
    ],
    goodSoils: ['red', 'alluvial', 'black'],
    poorSoils: ['clay'],
    needsIrrigation: true,
    timeline: [
      PREP,
      [1, 'plan.sow', ['plan.sow.nursery', 'plan.sow.seed']],
      [5, 'plan.transplant', ['plan.transplant.1']],
      [7, 'plan.stake', ['plan.stake.1']],
      [9, 'plan.pests', ['plan.pests.1', 'plan.pests.2']],
      [14, 'plan.harvest', ['plan.harvest.1', 'plan.harvest.2']],
    ],
  },
  wheat: {
    year: [
      { start: '11-01', end: '12-15', phase: 'sow', key: 'sow' },
      { start: '12-16', end: '01-31', phase: 'grow', key: 'grow' },
      { start: '02-01', end: '02-28', phase: 'protect', key: 'protect' },
      { start: '03-01', end: '03-31', phase: 'harvest', key: 'harvest' },
      { start: '04-01', end: '10-31', phase: 'rest', key: 'rest' },
    ],
    windows: [{ season: 'rabi', from: '11-01', to: '12-15', durationDays: 115 }],
    goodSoils: ['black', 'alluvial', 'clay'],
    poorSoils: ['sandy', 'laterite'],
    needsIrrigation: true,
    timeline: [
      PREP,
      [1, 'plan.sow', ['plan.sow.seed']],
      [3, 'plan.water', ['plan.water.1']],
      [5, 'plan.weed', ['plan.weed.1', 'plan.weed.2']],
      [10, 'plan.pests', ['plan.pests.1', 'plan.pests.2']],
      [16, 'plan.harvest', ['plan.harvest.1', 'plan.harvest.2']],
    ],
  },
  gram: {
    year: [
      { start: '10-01', end: '11-15', phase: 'sow', key: 'sow' },
      { start: '11-16', end: '12-31', phase: 'grow', key: 'grow' },
      { start: '01-01', end: '01-31', phase: 'protect', key: 'protect' },
      { start: '02-01', end: '03-10', phase: 'harvest', key: 'harvest' },
      { start: '03-11', end: '09-30', phase: 'rest', key: 'rest' },
    ],
    windows: [{ season: 'rabi', from: '10-16', to: '11-15', durationDays: 105 }],
    goodSoils: ['black', 'clay', 'alluvial'],
    poorSoils: ['sandy', 'laterite'],
    needsIrrigation: false,
    timeline: [
      PREP,
      [1, 'plan.sow', ['plan.sow.seed']],
      [4, 'plan.weed', ['plan.weed.1']],
      [7, 'plan.pests', ['plan.pests.1', 'plan.pests.2']],
      [15, 'plan.harvest', ['plan.harvest.1', 'plan.harvest.2']],
    ],
  },
  maize: {
    year: [
      { start: '06-15', end: '07-15', phase: 'sow', key: 'sow' },
      { start: '07-16', end: '08-15', phase: 'grow', key: 'grow' },
      { start: '08-16', end: '09-15', phase: 'protect', key: 'protect' },
      { start: '09-16', end: '10-15', phase: 'harvest', key: 'harvest' },
      { start: '10-16', end: '06-14', phase: 'rest', key: 'rest' },
    ],
    windows: [
      { season: 'kharif', from: '06-15', to: '07-15', durationDays: 105 },
      { season: 'rabi', from: '10-16', to: '11-15', durationDays: 120 },
    ],
    goodSoils: ['black', 'alluvial', 'red'],
    poorSoils: ['clay'],
    needsIrrigation: false,
    timeline: [
      PREP,
      [1, 'plan.sow', ['plan.sow.seed']],
      [3, 'plan.pests', ['plan.pests.1', 'plan.pests.2']],
      [5, 'plan.weed', ['plan.weed.1', 'plan.weed.2']],
      [8, 'plan.water', ['plan.water.1']],
      [15, 'plan.harvest', ['plan.harvest.1', 'plan.harvest.2']],
    ],
  },
  sugarcane: {
    year: [
      { start: '01-01', end: '02-28', phase: 'sow', key: 'sow' },
      { start: '03-01', end: '06-30', phase: 'grow', key: 'grow' },
      { start: '07-01', end: '10-31', phase: 'protect', key: 'protect' },
      { start: '11-01', end: '12-31', phase: 'harvest', key: 'harvest' },
    ],
    windows: [
      { season: 'kharif', from: '07-01', to: '08-31', durationDays: 540 },
      { season: 'rabi', from: '10-16', to: '11-30', durationDays: 450 },
      { season: 'zaid', from: '03-01', to: '03-15', durationDays: 365 },
    ],
    goodSoils: ['black', 'alluvial'],
    poorSoils: ['sandy', 'laterite'],
    needsIrrigation: true,
    timeline: [
      PREP,
      [1, 'plan.sow', ['plan.sow.seed']],
      [8, 'plan.weed', ['plan.weed.1', 'plan.weed.2']],
      [16, 'plan.earth', ['plan.earth.1']],
      [24, 'plan.pests', ['plan.pests.1', 'plan.pests.2']],
    ],
  },
  grapes: {
    year: [
      { start: '04-01', end: '09-14', phase: 'grow', key: 'grow' },
      { start: '09-15', end: '10-31', phase: 'protect', key: 'protect' },
      { start: '11-01', end: '12-31', phase: 'protect', key: 'protect2' },
      { start: '01-01', end: '03-31', phase: 'harvest', key: 'harvest' },
    ],
    windows: [],
    goodSoils: ['black', 'red'],
    poorSoils: ['clay'],
    needsIrrigation: true,
    timeline: [],
  },
  pomegranate: {
    year: [
      { start: '04-01', end: '05-14', phase: 'rest', key: 'rest' },
      { start: '05-15', end: '06-15', phase: 'grow', key: 'grow' },
      { start: '06-16', end: '07-31', phase: 'protect', key: 'protect' },
      { start: '08-01', end: '11-30', phase: 'protect', key: 'protect2' },
      { start: '12-01', end: '03-31', phase: 'harvest', key: 'harvest' },
    ],
    windows: [],
    goodSoils: ['black', 'red', 'laterite'],
    poorSoils: ['clay'],
    needsIrrigation: true,
    timeline: [],
  },
}
