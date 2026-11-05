/**
 * Tells Hindi from Marathi in Devanagari by their everyday giveaway words. Both use the same
 * script, and a model asked for Hindi "for farmers in Maharashtra" sometimes writes Marathi.
 * Used by the translation scripts (to reject a wrong-language line) and by the tests.
 */

const MARATHI = new Set([
  'आहे', 'आहेत', 'आणि', 'करा', 'मध्ये', 'नका', 'द्या', 'घ्या', 'पाहा', 'होते', 'असते', 'किंवा', 'जास्त', 'पेरणी', 'काढणी',
  'लागवड', 'तुमच्या', 'तुमची', 'तुमचा', 'तुमचे', 'शेतात', 'शेताची', 'पाने', 'पानांवर', 'झाडे', 'नाही', 'येते', 'जाते',
  'करावी', 'ठेवा', 'वापरा', 'मिळते', 'मिळेल', 'साठी', 'पण', 'म्हणून', 'वर', 'खाली', 'सुरू', 'हंगाम', 'काटणी', 'विश्रांती',
])
// 'या' is left out: "or" in Hindi but "this" in Marathi
const HINDI = new Set([
  'है', 'हैं', 'और', 'के', 'की', 'का', 'में', 'करें', 'से', 'को', 'पर', 'नहीं', 'आपके', 'आपकी', 'आपका', 'बुवाई',
  'कटाई', 'लिए', 'होता', 'होती', 'जाता', 'जाती', 'रखें', 'दें', 'लें', 'देखें', 'पत्तियों', 'पत्ते', 'खेत', 'मिलता', 'मिलेगा',
  'लेकिन', 'इसलिए', 'शुरू', 'मौसम', 'कीजिए', 'जब', 'तक', 'भी', 'वाले', 'वाली',
])

export function devanagariLang(text: string): 'hi' | 'mr' | 'unclear' {
  const words = text.split(/[\s,.;:!?()"'“”‘’\-–—/।]+/).filter(Boolean)
  let hi = 0
  let mr = (text.match(/ळ/g) ?? []).length // ळ is everyday Marathi, rare in Hindi
  for (const w of words) {
    if (HINDI.has(w)) hi++
    if (MARATHI.has(w)) mr++
    // Marathi case endings: -च्या / -ची / -चा / -चे glued to the noun
    if (/[ऀ-ॿ]{2,}(च्या|ची|चा|चे)$/.test(w)) mr++
  }
  if (hi === mr) return 'unclear'
  return hi > mr ? 'hi' : 'mr'
}

/** True when the line is clearly in the other language. Short labels with no giveaway pass. */
export const wrongLanguage = (text: string, lang: 'hi' | 'mr') => {
  const found = devanagariLang(text)
  return found !== 'unclear' && found !== lang
}
