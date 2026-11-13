// Rule-based claim check for Ayurveda / health content.
// Basis: Drugs & Magic Remedies (Objectionable Advertisements) Act 1954, AYUSH + ASCI guidelines,
// Meta health & wellness ad policy. This is a safety net, not legal advice: a human approves every post.

export type ComplianceFlag = {
  term: string
  reason: string
  severity: 'block' | 'warn'
  field: 'heading' | 'caption' | 'hashtags' | 'cta'
}

type Rule = { pattern: RegExp; reason: string; severity: 'block' | 'warn' }

// \b does not work for Devanagari, so Hindi rules match the plain substring.
const w = (words: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, 'iu')

const RULES: Rule[] = [
  // Cure / guarantee claims (block)
  { pattern: w('cure[sd]?|curing|permanent(?:ly)? (?:cure|relief|solution)'), reason: 'Cure ka claim mana hai (DMR Act)', severity: 'block' },
  { pattern: w('guarantee[sd]?|guaranteed'), reason: 'Guarantee ka claim mana hai', severity: 'block' },
  { pattern: /100\s?%/u, reason: '"100%" jaisa absolute claim mana hai', severity: 'block' },
  { pattern: w('miracle|miraculous|magic(?:al)?'), reason: 'Chamatkari / magic claim mana hai (DMR Act)', severity: 'block' },
  { pattern: w('no side[- ]effects?|side[- ]effect[- ]free|zero side[- ]effects?|completely safe|100% safe'), reason: '"No side effects" claim mana hai', severity: 'block' },
  { pattern: w('instant(?:ly)? (?:relief|cure|results?)|overnight results?'), reason: 'Turant asar ka claim mana hai', severity: 'block' },
  { pattern: w('eliminates?|eradicates?|reverses?') , reason: 'Bimari khatam karne ka claim', severity: 'warn' },
  { pattern: w('ilaaj|ilaj|guarantee|chamatkar(?:i)?|rambaan|ram baan|jad se khatam|jadd se khatam|hamesha ke liye'), reason: 'Ilaaj / guarantee / chamatkar ka claim mana hai', severity: 'block' },
  { pattern: /इलाज|गारंटी|चमत्कार|रामबाण|जड़ से खत्म|जड़ से ख़त्म|हमेशा के लिए|100\s?प्रतिशत/u, reason: 'इलाज / गारंटी / चमत्कार का दावा मना है', severity: 'block' },
  // Diseases listed in the DMR Act schedule: no treatment claims at all
  {
    pattern: w('cancer|diabetes|diabetic|hiv/aids|hiv|paralysis|epilepsy|infertility|impotence|tuberculosis|tb|kidney stones?|obesity|blood pressure|hypertension|heart disease|asthma|arthritis|cataract|glaucoma|leprosy|sexual (?:power|stamina|weakness)'),
    reason: 'Ye bimari DMR Act ki list me hai: iske ilaaj ka koi claim nahi',
    severity: 'block',
  },
  { pattern: /कैंसर|मधुमेह|डायबिटीज|शुगर की बीमारी|लकवा|मिर्गी|बांझपन|नपुंसकता|मोटापा|दमा|गठिया|यौन शक्ति/u, reason: 'DMR Act की सूची वाली बीमारी: इलाज का दावा नहीं', severity: 'block' },
  // Softer claims that need care (warn)
  { pattern: w('clinically (?:proven|tested)|scientifically proven|doctor[- ]recommended|recommended by doctors'), reason: 'Proof chahiye; bina proof ke mat likho (ASCI)', severity: 'warn' },
  { pattern: w('treats?|treatment|heals?|healing|prevents?|prevention'), reason: 'Medical claim lagta hai; "supports / helps" jaisa narm shabd use karo', severity: 'warn' },
  { pattern: w('best|no\\.? ?1|number one|#1'), reason: 'Superlative claim ke liye proof chahiye (ASCI)', severity: 'warn' },
  { pattern: w('lose \\d+ ?kg|weight loss in \\d+ days?'), reason: 'Weight loss ka number claim mana hai', severity: 'block' },
]

export type CheckableContent = { heading?: string | null; caption?: string | null; hashtags?: string[] | null; cta?: string | null }

/** Returns one flag per (field, rule/term). Empty array = no problems found. */
export function checkCompliance(content: CheckableContent, extraBannedWords: string[] = []): ComplianceFlag[] {
  const fields: [ComplianceFlag['field'], string][] = [
    ['heading', content.heading ?? ''],
    ['caption', content.caption ?? ''],
    ['hashtags', (content.hashtags ?? []).join(' ')],
    ['cta', content.cta ?? ''],
  ]
  const flags: ComplianceFlag[] = []
  for (const [field, text] of fields) {
    if (!text) continue
    for (const rule of RULES) {
      const m = text.match(rule.pattern)
      if (m) flags.push({ term: m[0], reason: rule.reason, severity: rule.severity, field })
    }
    const lower = text.toLowerCase()
    for (const word of extraBannedWords) {
      if (word && lower.includes(word.toLowerCase())) {
        flags.push({ term: word, reason: 'Brand Kit me ye shabd banned hai', severity: 'block', field })
      }
    }
  }
  return flags
}

/** Plain-language rules given to the Content AI so it avoids claims in the first place. */
export const COMPLIANCE_PROMPT = `Indian advertising law for Ayurvedic products applies (Drugs & Magic Remedies Act, AYUSH and ASCI guidelines, Meta health policy):
- Never claim the product cures, treats, heals, prevents or eliminates any disease or condition.
- Never use: cure, guaranteed, 100%, miracle, magic, permanent, instant results, no side effects, clinically proven (unless given), best / No.1.
- Hindi / Hinglish too: never use इलाज / ilaaj, गारंटी / guarantee, चमत्कार / chamatkar, रामबाण / rambaan, जड़ से खत्म / jad se khatam.
- Never mention these diseases in a treatment context: cancer, diabetes, blood pressure, heart disease, obesity, asthma, arthritis, infertility, sexual weakness, kidney stones, epilepsy, paralysis.
- Use soft wellness language instead: "supports", "helps maintain", "traditionally used for", "part of a healthy routine".
- Do not invent facts (ingredients, benefits, numbers, offers) that are not in the product details.`
