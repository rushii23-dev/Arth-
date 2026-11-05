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

  'act.priceUp.title': '{crop} up {pct}% at {market}',
  'act.priceUp.detail': '₹{price} a quintal now. See which market pays most after transport.',

  'sell.best': '{market} pays the most after transport: ₹{net} for {qty} quintals.',
  'sell.risingWait':
    'Prices at {trendMarket} are rising by about ₹{slope} a quintal a day, and {crop} stores well. Waiting a week could earn about ₹{gain} more.',
  'sell.risingPerishable': 'Prices at {trendMarket} are rising, but {crop} does not keep, so sell while it is fresh.',
  'sell.falling': 'Prices at {trendMarket} are falling by about ₹{slope} a quintal a day, so selling now is safer.',
  'sell.flat': 'Prices at {trendMarket} have held steady this week, so there is little to gain by waiting.',
  'sell.note': "Prices are from Agmarknet. Check today's rate at the market before you load.",

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

  'act.priceUp.title': '{market} में {crop} {pct}% ऊपर',
  'act.priceUp.detail': 'अभी ₹{price} प्रति क्विंटल। देखें वाहन खर्च के बाद कौन सी मंडी सबसे ज़्यादा देती है।',

  'sell.best': 'वाहन खर्च के बाद {market} में सबसे ज़्यादा मिलेगा: {qty} क्विंटल के ₹{net}।',
  'sell.risingWait':
    '{trendMarket} में भाव रोज़ लगभग ₹{slope} प्रति क्विंटल बढ़ रहे हैं, और {crop} रखा जा सकता है। एक हफ़्ता रुकने पर लगभग ₹{gain} ज़्यादा मिल सकते हैं।',
  'sell.risingPerishable': '{trendMarket} में भाव बढ़ रहे हैं, पर {crop} ज़्यादा दिन नहीं टिकता, इसलिए ताज़ा रहते बेचें।',
  'sell.falling': '{trendMarket} में भाव रोज़ लगभग ₹{slope} प्रति क्विंटल गिर रहे हैं, इसलिए अभी बेचना सुरक्षित है।',
  'sell.flat': 'इस हफ़्ते {trendMarket} में भाव स्थिर रहे हैं, इसलिए रुकने से ख़ास फ़ायदा नहीं।',
  'sell.note': 'भाव एगमार्कनेट से हैं। माल लादने से पहले मंडी का आज का भाव पता कर लें।',

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

  'act.priceUp.title': '{market} मध्ये {crop} {pct}% वाढला',
  'act.priceUp.detail': 'सध्या ₹{price} प्रति क्विंटल. वाहतूक खर्चानंतर कोणती बाजार समिती जास्त देते ते पाहा.',

  'sell.best': 'वाहतूक खर्चानंतर {market} मध्ये सर्वात जास्त मिळेल: {qty} क्विंटलचे ₹{net}.',
  'sell.risingWait':
    '{trendMarket} मध्ये भाव रोज सुमारे ₹{slope} प्रति क्विंटल वाढत आहेत, आणि {crop} साठवता येतो. एक आठवडा थांबल्यास सुमारे ₹{gain} जास्त मिळू शकतात.',
  'sell.risingPerishable': '{trendMarket} मध्ये भाव वाढत आहेत, पण {crop} जास्त दिवस टिकत नाही, म्हणून ताजे असतानाच विका.',
  'sell.falling': '{trendMarket} मध्ये भाव रोज सुमारे ₹{slope} प्रति क्विंटल घसरत आहेत, म्हणून आता विकणे सुरक्षित आहे.',
  'sell.flat': 'या आठवड्यात {trendMarket} मध्ये भाव स्थिर राहिले, त्यामुळे थांबून फारसा फायदा नाही.',
  'sell.note': 'भाव ॲगमार्कनेटवरून आहेत. माल भरण्यापूर्वी बाजार समितीतील आजचा भाव खात्री करून घ्या.',

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

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
/** 125000 → "1,25,000" (Indian grouping, same digits in every language). */
export const rupees = (n: number) => inr.format(Math.round(n))

/** Capitalise the first letter for English titles that start with a day label. */
export const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
