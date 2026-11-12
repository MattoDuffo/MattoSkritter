import { useEffect, useState } from 'react';
import { speak } from '../lib/audio';
import type { Word } from '../lib/db';
import { hanChars } from '../lib/pinyin';
import type { Settings } from '../lib/settings';
import { Pinyin } from './common';
import { Icon } from './icons';
import { Grid, Writer } from './Writer';

/** First meeting with a new word: meaning, pronunciation and stroke-order animation. */
export function IntroCard({
  word,
  settings,
  onStart,
  onKnown,
}: {
  word: Word;
  settings: Settings;
  onStart: () => void;
  onKnown: () => void;
}) {
  const chars = hanChars(word.simp);
  const size = Math.min(160, Math.floor((Math.min(window.innerWidth, 560) - 48) / Math.min(chars.length, 3)));
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (settings.autoplayAudio) speak(word.simp, word.pinyin);
  }, [word.simp, settings.autoplayAudio]);
  return (
    <>
      <div className="prompt">
        <div className="part-label">New word</div>
      </div>
      <div className="reveal-area" style={{ paddingTop: 0 }}>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
          {chars.map((c, i) => (
            <div key={i} className="mini-canvas" style={{ width: size, height: size }}>
              <Grid size={size} kind={settings.grid} />
              <Writer char={c} size={size} mode="animate" nonce={nonce} />
            </div>
          ))}
        </div>
        <div className="answer" style={{ marginTop: 14 }}>
          <div className="pinyin">
            <Pinyin value={word.pinyin} />
          </div>
          <div className="def">{word.def}</div>
          {word.notes && <div className="small muted" style={{ marginTop: 6 }}>{word.notes}</div>}
        </div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="icon-btn" onClick={() => speak(word.simp, word.pinyin)} aria-label="Play audio">
            <Icon.sound />
          </button>
          <button className="icon-btn" onClick={() => setNonce(nonce + 1)} aria-label="Replay animation">
            <Icon.play />
          </button>
        </div>
      </div>
      <div style={{ marginTop: 'auto' }} className="stack">
        <button className="btn primary big" onClick={onStart}>
          Learn it
        </button>
        <button className="btn ghost block" onClick={onKnown}>
          I already know this word
        </button>
      </div>
    </>
  );
}
