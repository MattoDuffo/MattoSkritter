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

/** Speak Mandarin text with the device's text-to-speech voice. */
export function speak(text: string) {
  if (!canSpeak()) return;
  if (voice === undefined) voice = pickVoice();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  if (voice) u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}
