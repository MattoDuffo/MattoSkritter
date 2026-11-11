// Numbered pinyin helpers ("zhun3bei4", "suan4 le5", "lv4", "ke3'ai4", "yi1dian3r5").

const MARKS: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à', 'a'],
  e: ['e', 'ē', 'é', 'ě', 'è', 'e'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù', 'u'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

export interface Syllable {
  text: string; // without tone number, ü normalised
  tone: number; // 1-5
}

/** Use the first reading when several are listed ("he2, huo4, ..."). */
export function primaryReading(pinyin: string): string {
  return pinyin.split(',')[0].trim();
}

/** Split numbered pinyin into syllables. Accepts joined or spaced syllables. */
export function syllables(pinyin: string): Syllable[] {
  const p = primaryReading(pinyin)
    .replace(/u:/gi, 'ü')
    .replace(/v/g, 'ü')
    .replace(/V/g, 'Ü')
    .replace(/['’·-]/g, ' ');
  const out: Syllable[] = [];
  const re = /([a-zA-ZüÜ]+?)([1-5])|([a-zA-ZüÜ]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p))) {
    if (m[1]) out.push({ text: m[1], tone: Number(m[2]) });
    else if (m[3]) out.push({ text: m[3], tone: 5 });
  }
  return out;
}

function markSyllable(text: string, tone: number): string {
  if (tone === 5 || tone === 0) return text;
  const lower = text.toLowerCase();
  let idx = -1;
  if (lower.includes('a')) idx = lower.indexOf('a');
  else if (lower.includes('e')) idx = lower.indexOf('e');
  else if (lower.includes('ou')) idx = lower.indexOf('o');
  else {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('aeiouü'.includes(lower[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return text;
  const ch = lower[idx];
  let marked = MARKS[ch][tone];
  if (text[idx] !== ch) marked = marked.toUpperCase();
  return text.slice(0, idx) + marked + text.slice(idx + 1);
}

/** "zhun3bei4" -> "zhǔnbèi"; keeps spaces where the source had them, all readings shown. */
export function toMarks(pinyin: string): string {
  return pinyin
    .split(',')
    .map((reading) =>
      reading
        .trim()
        .split(/\s+/)
        .map((chunk) =>
          syllables(chunk)
            .map((s, i) => {
              const t = markSyllable(s.text, s.tone);
              // apostrophe before a/e/o in non-initial syllables (xī'ān)
              return i > 0 && /^[aeoāáǎàēéěèōóǒò]/i.test(t) ? "'" + t : t;
            })
            .join(''),
        )
        .join(' '),
    )
    .join(', ');
}

/** Tone numbers of the primary reading, e.g. "zhun3bei4" -> [3, 4]. */
export function tones(pinyin: string): number[] {
  return syllables(pinyin).map((s) => s.tone);
}

/** Lower-case, tone-less, space-less form for searching: "Bei3jing1" -> "beijing". */
export function plain(pinyin: string): string {
  return syllables(pinyin)
    .map((s) => s.text.toLowerCase().replace('ü', 'v'))
    .join('');
}

/** Lower-case numbered form for searching with tones: "Bei3 jing1" -> "bei3jing1". */
export function numbered(pinyin: string): string {
  return syllables(pinyin)
    .map((s) => s.text.toLowerCase().replace('ü', 'v') + s.tone)
    .join('');
}

/** Lower-case tone-marked form without spaces: "Bei3 jing1" -> "běijīng". */
export function marked(pinyin: string): string {
  return toMarks(primaryReading(pinyin)).toLowerCase().replace(/[\s']/g, '');
}

/**
 * Normalise a pinyin search query. `numbered` is set when the query has tone numbers,
 * `marked` when it has tone marks; `plain` is always the tone-less form.
 */
export function normaliseQuery(q: string): { plain: string; numbered: string | null; marked: string | null } {
  const s = q.trim().toLowerCase().replace(/u:/g, 'ü');
  const reverse: Record<string, string> = {};
  for (const [base, arr] of Object.entries(MARKS)) arr.forEach((c, t) => t >= 1 && t <= 4 && (reverse[c] = base));
  const hasMarks = [...s].some((c) => reverse[c]);
  const hasNumbers = /[1-5]/.test(s);
  const plainQ = [...s]
    .map((c) => reverse[c] ?? c)
    .join('')
    .replace(/ü/g, 'v')
    .replace(/[1-5\s']/g, '');
  return {
    plain: plainQ,
    numbered: hasNumbers ? s.replace(/ü/g, 'v').replace(/[\s']/g, '') : null,
    marked: hasMarks ? s.replace(/[\s']/g, '').replace(/v/g, 'ü') : null,
  };
}

/** Count Han characters (each is written separately). */
export function hanChars(word: string): string[] {
  return Array.from(word).filter((c) => /[\u2E80-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(c));
}
