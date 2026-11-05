import type { z } from 'zod'
import type { SoilType } from '../schemas.js'

type Soil = z.infer<typeof SoilType>

/**
 * The dominant soil of each Maharashtra district, from the broad state soil map: medium to deep
 * black (Deccan trap) soils over most of the state, laterite along the Konkan coast and its hills,
 * and red soils in eastern Vidarbha. Farm by farm it varies, which is why the app calls this the
 * district's usual soil and lets the farmer correct it in Settings.
 */
export const DISTRICT_SOIL: Record<string, Soil> = {
  Ahmednagar: 'black',
  Akola: 'black',
  Amravati: 'black',
  Beed: 'black',
  Bhandara: 'red',
  Buldhana: 'black',
  Chandrapur: 'black',
  'Chhatrapati Sambhajinagar': 'black',
  Dharashiv: 'black',
  Dhule: 'black',
  Gadchiroli: 'red',
  Gondia: 'red',
  Hingoli: 'black',
  Jalgaon: 'black',
  Jalna: 'black',
  Kolhapur: 'black',
  Latur: 'black',
  'Mumbai City': 'alluvial',
  'Mumbai Suburban': 'alluvial',
  Nagpur: 'black',
  Nanded: 'black',
  Nandurbar: 'black',
  Nashik: 'black',
  Palghar: 'laterite',
  Parbhani: 'black',
  Pune: 'black',
  Raigad: 'laterite',
  Ratnagiri: 'laterite',
  Sangli: 'black',
  Satara: 'black',
  Sindhudurg: 'laterite',
  Solapur: 'black',
  Thane: 'laterite',
  Wardha: 'black',
  Washim: 'black',
  Yavatmal: 'black',
}

/** Soil Health Card dashboard, where a farmer can see and request a test. */
export const SOIL_HEALTH_SOURCE = 'https://soilhealth.dac.gov.in'
