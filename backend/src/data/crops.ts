import type { LangCode } from '../lib/time.js'

export interface CropInfo {
  /** Commodity name as Agmarknet (data.gov.in) spells it. */
  agmarknet: string
  name: Record<LangCode, string>
  /** Can be held a few weeks for a better price (dry grain, cured onion, lint). */
  storable: boolean
}

/** The crops onboarding offers (frontend MANDI_COMMODITIES). */
export const CROPS: Record<string, CropInfo> = {
  onion: { agmarknet: 'Onion', name: { en: 'Onion', hi: 'प्याज', mr: 'कांदा' }, storable: true },
  soybean: { agmarknet: 'Soyabean', name: { en: 'Soybean', hi: 'सोयाबीन', mr: 'सोयाबीन' }, storable: true },
  tomato: { agmarknet: 'Tomato', name: { en: 'Tomato', hi: 'टमाटर', mr: 'टोमॅटो' }, storable: false },
  grapes: { agmarknet: 'Grapes', name: { en: 'Grapes', hi: 'अंगूर', mr: 'द्राक्षे' }, storable: false },
  cotton: { agmarknet: 'Cotton', name: { en: 'Cotton', hi: 'कपास', mr: 'कापूस' }, storable: true },
  wheat: { agmarknet: 'Wheat', name: { en: 'Wheat', hi: 'गेहूं', mr: 'गहू' }, storable: true },
  gram: { agmarknet: 'Bengal Gram(Gram)(Whole)', name: { en: 'Gram', hi: 'चना', mr: 'हरभरा' }, storable: true },
  sugarcane: { agmarknet: 'Sugarcane', name: { en: 'Sugarcane', hi: 'गन्ना', mr: 'ऊस' }, storable: false },
  pomegranate: { agmarknet: 'Pomegranate', name: { en: 'Pomegranate', hi: 'अनार', mr: 'डाळिंब' }, storable: false },
  maize: { agmarknet: 'Maize', name: { en: 'Maize', hi: 'मक्का', mr: 'मका' }, storable: true },
}

export const cropName = (id: string, lang: LangCode) => CROPS[id]?.name[lang] ?? id
