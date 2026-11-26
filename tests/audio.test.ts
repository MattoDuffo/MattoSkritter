import { expect, it } from 'vitest';
import { setHomophones, speechText } from '../src/lib/audio';

it('speaks a common homophone for single characters', () => {
  setHomophones({ tou2: '投', hang2: '航', lv4: '绿' });
  expect(speechText('亠', 'tou2')).toBe('投');
  expect(speechText('行', 'hang2')).toBe('航');
  expect(speechText('律', 'lv4')).toBe('绿');
  expect(speechText('和', 'he2, huo4')).toBe('和'); // no homophone known: say it as is
  expect(speechText('准备', 'zhun3bei4')).toBe('准备'); // words are read fine
});

it('prefers the premium Han voice over the default Mandarin voices', async () => {
  const { chooseVoice } = await import('../src/lib/audio');
  const v = (name: string, voiceURI: string, lang = 'zh-CN') => ({ name, voiceURI, lang, localService: true });
  const voices = [
    v('Samantha', 'com.apple.voice.compact.en-US.Samantha', 'en-US'),
    v('Tingting', 'com.apple.voice.compact.zh-CN.Tingting'),
    v('Han', 'com.apple.voice.premium.zh-CN.Han'),
    v('Lili (Enhanced)', 'com.apple.voice.enhanced.zh-CN.Lili'),
    v('Meijia', 'com.apple.voice.compact.zh-TW.Meijia', 'zh-TW'),
  ];
  expect(chooseVoice(voices)?.voiceURI).toBe('com.apple.voice.premium.zh-CN.Han');
  expect(chooseVoice([v('Han (Premium)', 'x')])?.name).toBe('Han (Premium)');
  expect(chooseVoice(voices.slice(0, 2))?.name).toBe('Tingting');
  expect(chooseVoice([voices[0]])).toBeNull();
});
