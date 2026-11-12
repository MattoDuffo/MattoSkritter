let voice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices();
  const zh = voices.filter((v) => /^zh[-_](CN|Hans)/i.test(v.lang) || v.lang === 'zh');
  return zh.find((v) => /tingting|ting-ting|xiaoxiao|yu-shu|lili/i.test(v.name)) ?? zh[0] ?? voices.find((v) => v.lang.startsWith('zh')) ?? null;
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = pickVoice();
  });
}

export function canSpeak() {
  return typeof speechSynthesis !== 'undefined';
}

let homophones: Record<string, string> | null = null;
let homLoading: Promise<void> | null = null;

/** Load the syllable -> common homophone map (see scripts/build-data.mjs). */
export function loadHomophones(): Promise<void> {
  if (!homLoading && typeof fetch !== 'undefined' && typeof document !== 'undefined') {
    homLoading = fetch(new URL('data/homophones.json', document.baseURI).href)
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => {
        homophones = m;
      })
      .catch(() => {
        homLoading = null;
      });
  }
  return homLoading ?? Promise.resolve();
}
loadHomophones();

export function setHomophones(m: Record<string, string>) {
  homophones = m;
}

/**
 * What to actually say. Text-to-speech guesses the reading of a lone character and often gets
 * rare ones and radicals wrong (亠 read as "shén" instead of "tóu"), or picks the wrong reading
 * of a polyphonic one (行). For a single character we say a common character that is always
 * pronounced exactly like the reading we want (亠 tou2 -> 投).
 */
export function speechText(text: string, pinyin?: string): string {
  const chars = [...text.trim()];
  if (chars.length !== 1 || !pinyin || !homophones) return text;
  const reading = pinyin
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/u:/g, 'v')
    .replace(/ü/g, 'v')
    .replace(/\s+/g, '');
  return homophones[reading] ?? text;
}

/** Speak Mandarin text with the device's text-to-speech voice. Pass the pinyin for correct readings. */
export function speak(text: string, pinyin?: string) {
  if (!canSpeak()) return;
  if (voice === undefined) voice = pickVoice();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speechText(text, pinyin));
  u.lang = 'zh-CN';
  if (voice) u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}
