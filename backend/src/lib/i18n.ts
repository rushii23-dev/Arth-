import { weekday, type LangCode } from './time.js'

type Messages = Record<string, string>

const en: Messages = {
  greeting: 'Namaste, {name}',
  'season.kharif': 'Kharif',
  'season.rabi': 'Rabi',
  'season.zaid': 'Summer',

  'adv.rain.title': "Don't spray {day} — {p}% rain",
  'adv.rain.detail': 'Rain soon after spraying washes the spray off. Spray on a dry day instead.',
  'adv.heavyRain.title': 'Heavy rain {day} — {mm} mm',
  'adv.heavyRain.detail': 'Clear the field drains and keep harvested produce covered.',
  'adv.wind.title': 'Too windy to spray {day} — {w} km/h',
  'adv.wind.detail': 'Spray drifts in strong wind. Spray early in the morning when the air is calm.',
  'adv.heat.title': 'Heat {day} — {t}°C',
  'adv.heat.detail': 'Irrigate early morning or evening, and avoid field work at midday.',

  'act.sprayWindow.title': 'Good days to spray',
  'act.sprayWindow.detail':
    'Dry and calm today and tomorrow, a safe window for any planned spray. Check the dose on the label first.',
  'act.sow.title': '{season} sowing is open',
  'act.sow.detail': 'Day {n} of the {season} season. See which crops suit your farm now.',

  'day.today': 'today',
  'day.tomorrow': 'tomorrow',
  'day.other': 'on {weekday}',
}

const hi: Messages = {
  greeting: 'नमस्ते {name}',
  'season.kharif': 'खरीफ',
  'season.rabi': 'रबी',
  'season.zaid': 'जायद',

  'adv.rain.title': '{day} छिड़काव न करें — {p}% बारिश की संभावना',
  'adv.rain.detail': 'छिड़काव के बाद जल्दी बारिश हुई तो दवा धुल जाएगी। सूखे दिन छिड़काव करें।',
  'adv.heavyRain.title': '{day} भारी बारिश — {mm} मिमी',
  'adv.heavyRain.detail': 'खेत की नालियाँ साफ़ रखें और कटी फसल ढककर रखें।',
  'adv.wind.title': '{day} तेज़ हवा, छिड़काव न करें — {w} किमी/घंटा',
  'adv.wind.detail': 'तेज़ हवा में दवा उड़ जाती है। सुबह जल्दी, हवा शांत होने पर छिड़काव करें।',
  'adv.heat.title': '{day} तेज़ गर्मी — {t}°C',
  'adv.heat.detail': 'सुबह जल्दी या शाम को सिंचाई करें, दोपहर में खेत का काम टालें।',

  'act.sprayWindow.title': 'छिड़काव के लिए अच्छे दिन',
  'act.sprayWindow.detail': 'आज और कल मौसम सूखा और शांत है, छिड़काव के लिए सुरक्षित समय। पहले लेबल पर मात्रा देखें।',
  'act.sow.title': '{season} की बुवाई शुरू है',
  'act.sow.detail': '{season} मौसम का {n}वाँ दिन। देखें कौन सी फसलें आपके खेत के लिए ठीक हैं।',

  'day.today': 'आज',
  'day.tomorrow': 'कल',
  'day.other': '{weekday} को',
}

const mr: Messages = {
  greeting: 'नमस्कार {name}',
  'season.kharif': 'खरीप',
  'season.rabi': 'रब्बी',
  'season.zaid': 'उन्हाळी',

  'adv.rain.title': '{day} फवारणी करू नका — {p}% पावसाची शक्यता',
  'adv.rain.detail': 'फवारणीनंतर लगेच पाऊस पडला तर औषध धुवून जाते. कोरड्या दिवशी फवारणी करा.',
  'adv.heavyRain.title': '{day} मुसळधार पाऊस — {mm} मिमी',
  'adv.heavyRain.detail': 'शेतातील चर मोकळे ठेवा आणि काढलेले पीक झाकून ठेवा.',
  'adv.wind.title': '{day} जोराचा वारा, फवारणी टाळा — {w} किमी/तास',
  'adv.wind.detail': 'जोराच्या वाऱ्यात औषध उडून जाते. सकाळी लवकर, वारा शांत असताना फवारणी करा.',
  'adv.heat.title': '{day} कडक उष्णता — {t}°C',
  'adv.heat.detail': 'सकाळी लवकर किंवा संध्याकाळी पाणी द्या, दुपारी शेतातील काम टाळा.',

  'act.sprayWindow.title': 'फवारणीसाठी चांगले दिवस',
  'act.sprayWindow.detail': 'आज आणि उद्या हवामान कोरडे आणि शांत आहे, फवारणीसाठी सुरक्षित वेळ. आधी लेबलवर मात्रा पाहा.',
  'act.sow.title': '{season} पेरणी सुरू आहे',
  'act.sow.detail': '{season} हंगामाचा {n}वा दिवस. तुमच्या शेतासाठी कोणती पिके योग्य आहेत ते पाहा.',

  'day.today': 'आज',
  'day.tomorrow': 'उद्या',
  'day.other': '{weekday}',
}

const MESSAGES: Record<LangCode, Messages> = { en, hi, mr }

export function t(lang: LangCode, key: string, vars: Record<string, string | number> = {}): string {
  const template = MESSAGES[lang][key] ?? en[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))
}

/** "today" / "tomorrow" / "on Saturday", in the farmer's language. */
export function dayLabel(lang: LangCode, iso: string, offset: number): string {
  if (offset === 0) return t(lang, 'day.today')
  if (offset === 1) return t(lang, 'day.tomorrow')
  return t(lang, 'day.other', { weekday: weekday(lang, iso) })
}

/** Capitalise the first letter for English titles that start with a day label. */
export const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
