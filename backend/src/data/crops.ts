import type { LangCode } from '../lib/time.js'

export interface CropInfo {
  /** Commodity name as Agmarknet 2.0 (data.gov.in) spells it; the pre-2.0 names stopped getting new prices in 2023-25. */
  agmarknet: string
  name: Record<LangCode, string>
  /** Can be held a few weeks for a better price (dry grain, cured onion, lint). */
  storable: boolean
  /**
   * Core crops have Arth's full support: crop calendar, weather jobs and the crop doctor's
   * checked advice. The rest get mandi prices, sell advice and schemes.
   */
  core: boolean
}

type Entry = [agmarknet: string, en: string, hi: string, mr: string, storable: boolean]
const build = (core: boolean, list: Record<string, Entry>): Record<string, CropInfo> =>
  Object.fromEntries(
    Object.entries(list).map(([id, [agmarknet, en, hi, mr, storable]]) => [id, { agmarknet, name: { en, hi, mr }, storable, core }]),
  )

/** The onboarding tiles (frontend CORE_CROPS). */
const CORE = build(true, {
  onion: ['Onion', 'Onion', 'प्याज', 'कांदा', true],
  soybean: ['Soyabean', 'Soybean', 'सोयाबीन', 'सोयाबीन', true],
  tomato: ['Tomato', 'Tomato', 'टमाटर', 'टोमॅटो', false],
  grapes: ['Grapes', 'Grapes', 'अंगूर', 'द्राक्षे', false],
  cotton: ['Cotton', 'Cotton', 'कपास', 'कापूस', true],
  wheat: ['Wheat', 'Wheat', 'गेहूं', 'गहू', true],
  gram: ['Bengal Gram(Gram)(Whole)', 'Gram', 'चना', 'हरभरा', true],
  sugarcane: ['Sugarcane', 'Sugarcane', 'गन्ना', 'ऊस', false],
  pomegranate: ['Pomegranate', 'Pomegranate', 'अनार', 'डाळिंब', false],
  maize: ['Maize', 'Maize', 'मक्का', 'मका', true],
})

/** "Other crops" in onboarding (frontend MORE_CROPS): the rest of what Maharashtra grows. */
const MORE = build(false, {
  // grains and pulses
  jowar: ['Jowar(Sorghum)', 'Jowar', 'ज्वार', 'ज्वारी', true],
  bajra: ['Bajra(Pearl Millet/Cumbu)', 'Bajra', 'बाजरा', 'बाजरी', true],
  paddy: ['Paddy(Common)', 'Paddy (rice)', 'धान', 'भात (धान)', true],
  ragi: ['Ragi(Finger Millet)', 'Ragi (nachni)', 'रागी', 'नाचणी', true],
  tur: ['Red gram/Arhar/Tur(whole)', 'Tur (arhar)', 'अरहर (तुअर)', 'तूर', true],
  moong: ['Green Gram(Moong)(Whole)', 'Moong', 'मूंग', 'मूग', true],
  urad: ['Black Gram(Urd Beans)(Whole)', 'Urad', 'उड़द', 'उडीद', true],
  peas: ['Peas Wet', 'Green peas', 'हरी मटर', 'हिरवा वाटाणा', false],
  // oilseeds
  groundnut: ['Groundnut', 'Groundnut', 'मूंगफली', 'भुईमूग', true],
  sunflower: ['Sunflower/Sunflower Seed', 'Sunflower', 'सूरजमुखी', 'सूर्यफूल', true],
  safflower: ['Safflower', 'Safflower', 'कुसुम', 'करडई', true],
  sesame: ['Sesamum(Sesame,Gingelly,Til)', 'Sesame (til)', 'तिल', 'तीळ', true],
  // fruit
  banana: ['Banana', 'Banana', 'केला', 'केळी', false],
  orange: ['Orange', 'Orange (santra)', 'संतरा', 'संत्रा', false],
  mosambi: ['Mousambi(Sweet Lime)', 'Mosambi', 'मौसमी', 'मोसंबी', false],
  mango: ['Mango(Raw-Ripe)', 'Mango', 'आम', 'आंबा', false],
  papaya: ['Papaya', 'Papaya', 'पपीता', 'पपई', false],
  guava: ['Guava', 'Guava', 'अमरूद', 'पेरू', false],
  custard_apple: ['Seetapal', 'Custard apple', 'सीताफल', 'सीताफळ', false],
  lemon: ['Lime', 'Lemon', 'नींबू', 'लिंबू', false],
  watermelon: ['Water Melon', 'Watermelon', 'तरबूज', 'टरबूज', false],
  // vegetables
  chilli: ['Green Chilli', 'Green chilli', 'हरी मिर्च', 'हिरवी मिरची', false],
  capsicum: ['Chilly Capsicum', 'Capsicum', 'शिमला मिर्च', 'ढोबळी मिरची', false],
  brinjal: ['Brinjal', 'Brinjal', 'बैंगन', 'वांगी', false],
  okra: ['Bhindi(Ladies Finger)', 'Okra (bhindi)', 'भिंडी', 'भेंडी', false],
  cabbage: ['Cabbage', 'Cabbage', 'पत्तागोभी', 'कोबी', false],
  cauliflower: ['Cauliflower', 'Cauliflower', 'फूलगोभी', 'फुलकोबी', false],
  potato: ['Potato', 'Potato', 'आलू', 'बटाटा', false],
  carrot: ['Carrot', 'Carrot', 'गाजर', 'गाजर', false],
  cucumber: ['Cucumbar(Kheera)', 'Cucumber', 'खीरा', 'काकडी', false],
  bottle_gourd: ['Bottle gourd', 'Bottle gourd', 'लौकी', 'दुधी भोपळा', false],
  bitter_gourd: ['Bitter gourd', 'Bitter gourd', 'करेला', 'कारले', false],
  drumstick: ['Drumstick', 'Drumstick', 'सहजन', 'शेवगा', false],
  coriander: ['Coriander(Leaves)', 'Coriander', 'धनिया', 'कोथिंबीर', false],
  methi: ['Methi(Leaves)', 'Methi', 'मेथी', 'मेथी', false],
  // spices
  garlic: ['Garlic', 'Garlic', 'लहसुन', 'लसूण', true],
  ginger: ['Ginger(Green)', 'Ginger', 'अदरक', 'आले', false],
  turmeric: ['Turmeric', 'Turmeric', 'हल्दी', 'हळद', true],
})

/**
 * Every crop Arth knows by id. A farmer's profile may also hold a crop typed in by
 * hand that is in neither list: that one is kept as text and only named, never priced.
 */
export const CROPS: Record<string, CropInfo> = { ...CORE, ...MORE }

export const cropName = (id: string, lang: LangCode) => (Object.hasOwn(CROPS, id) ? CROPS[id]!.name[lang] : id)

/** A crop id from the catalog (an own key: never "constructor" and the like). */
export const isCrop = (id: string | null | undefined): id is string => !!id && Object.hasOwn(CROPS, id)

/** A core crop: calendar, weather jobs and crop doctor advice exist for it. */
export const isCoreCrop = (id: string | null | undefined): id is string => isCrop(id) && CROPS[id]!.core
