/** Maharashtra's 36 districts: HQ coordinates and the Marathi name. Same list as frontend/src/features/onboarding/model.ts. */
export const DISTRICTS: Record<string, { lat: number; lon: number; dev: string }> = {
  Ahmednagar: { lat: 19.1, lon: 74.75, dev: 'अहमदनगर' },
  Akola: { lat: 20.71, lon: 77.0, dev: 'अकोला' },
  Amravati: { lat: 20.93, lon: 77.75, dev: 'अमरावती' },
  Beed: { lat: 18.99, lon: 75.76, dev: 'बीड' },
  Bhandara: { lat: 21.17, lon: 79.65, dev: 'भंडारा' },
  Buldhana: { lat: 20.53, lon: 76.18, dev: 'बुलढाणा' },
  Chandrapur: { lat: 19.95, lon: 79.3, dev: 'चंद्रपूर' },
  'Chhatrapati Sambhajinagar': { lat: 19.88, lon: 75.34, dev: 'छत्रपती संभाजीनगर' },
  Dharashiv: { lat: 18.19, lon: 76.04, dev: 'धाराशिव' },
  Dhule: { lat: 20.9, lon: 74.77, dev: 'धुळे' },
  Gadchiroli: { lat: 20.18, lon: 80.0, dev: 'गडचिरोली' },
  Gondia: { lat: 21.46, lon: 80.2, dev: 'गोंदिया' },
  Hingoli: { lat: 19.72, lon: 77.15, dev: 'हिंगोली' },
  Jalgaon: { lat: 21.01, lon: 75.56, dev: 'जळगाव' },
  Jalna: { lat: 19.84, lon: 75.88, dev: 'जालना' },
  Kolhapur: { lat: 16.7, lon: 74.24, dev: 'कोल्हापूर' },
  Latur: { lat: 18.4, lon: 76.57, dev: 'लातूर' },
  'Mumbai City': { lat: 18.94, lon: 72.83, dev: 'मुंबई शहर' },
  'Mumbai Suburban': { lat: 19.15, lon: 72.85, dev: 'मुंबई उपनगर' },
  Nagpur: { lat: 21.15, lon: 79.09, dev: 'नागपूर' },
  Nanded: { lat: 19.15, lon: 77.32, dev: 'नांदेड' },
  Nandurbar: { lat: 21.37, lon: 74.24, dev: 'नंदुरबार' },
  Nashik: { lat: 20.0, lon: 73.79, dev: 'नाशिक' },
  Palghar: { lat: 19.7, lon: 72.77, dev: 'पालघर' },
  Parbhani: { lat: 19.27, lon: 76.78, dev: 'परभणी' },
  Pune: { lat: 18.52, lon: 73.86, dev: 'पुणे' },
  Raigad: { lat: 18.51, lon: 73.18, dev: 'रायगड' },
  Ratnagiri: { lat: 16.99, lon: 73.3, dev: 'रत्नागिरी' },
  Sangli: { lat: 16.85, lon: 74.58, dev: 'सांगली' },
  Satara: { lat: 17.69, lon: 74.0, dev: 'सातारा' },
  Sindhudurg: { lat: 16.13, lon: 73.66, dev: 'सिंधुदुर्ग' },
  Solapur: { lat: 17.66, lon: 75.91, dev: 'सोलापूर' },
  Thane: { lat: 19.22, lon: 72.98, dev: 'ठाणे' },
  Wardha: { lat: 20.75, lon: 78.6, dev: 'वर्धा' },
  Washim: { lat: 20.11, lon: 77.13, dev: 'वाशिम' },
  Yavatmal: { lat: 20.39, lon: 78.13, dev: 'यवतमाळ' },
}

/** Older or alternative spellings used by Agmarknet and other datasets. */
const ALIASES: Record<string, string> = {
  ahilyanagar: 'Ahmednagar',
  ahmadnagar: 'Ahmednagar',
  aurangabad: 'Chhatrapati Sambhajinagar',
  'chhatrapati sambhaji nagar': 'Chhatrapati Sambhajinagar',
  osmanabad: 'Dharashiv',
  mumbai: 'Mumbai City',
  'greater mumbai': 'Mumbai City',
  bid: 'Beed',
  buldana: 'Buldhana',
  gondiya: 'Gondia',
  raigarh: 'Raigad',
  'raigad(m.s.)': 'Raigad',
}

export function canonicalDistrict(name: string): string | undefined {
  const clean = name.trim()
  if (DISTRICTS[clean]) return clean
  const lower = clean.toLowerCase()
  const exact = Object.keys(DISTRICTS).find((d) => d.toLowerCase() === lower)
  return exact ?? ALIASES[lower]
}

/** Straight-line distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Roads wind: straight-line distance times this is a fair estimate of the road distance. */
export const ROAD_FACTOR = 1.25
