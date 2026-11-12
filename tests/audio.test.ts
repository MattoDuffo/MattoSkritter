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
