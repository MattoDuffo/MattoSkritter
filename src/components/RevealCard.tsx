import { useState } from 'react';
import { speak } from '../lib/audio';
import type { StoredCard, Word } from '../lib/db';
import type { Settings } from '../lib/settings';
import type { Grade4 } from '../lib/srs';
import { GradeBar, Pinyin } from './common';
import { Icon } from './icons';

/** Definition (what does it mean?) and Reading (how is it pronounced?) cards: reveal, then self-grade. */
export function RevealCard({
  word,
  card,
  part,
  settings,
  onDone,
}: {
  word: Word;
  card?: StoredCard;
  part: 'defn' | 'read';
  settings: Settings;
  onDone: (grade: Grade4) => void;
}) {
  const [shown, setShown] = useState(false);
  const show = () => {
    setShown(true);
    if (settings.autoplayAudio) speak(word.simp, word.pinyin);
  };
  return (
    <>
      <div className="prompt">
        <div className="part-label">{part === 'defn' ? 'What does it mean?' : 'How is it pronounced?'}</div>
      </div>
      {/* Only the hanzi at first: tap the card to see pinyin and meaning. */}
      <div
        className={`reveal-area ${shown ? '' : 'tap-card'}`}
        role={shown ? undefined : 'button'}
        aria-label={shown ? undefined : 'Show answer'}
        onClick={shown ? undefined : show}
      >
        <div className="big-han han">{word.simp}</div>
        {shown ? (
          <div className="answer" style={{ marginTop: 18 }}>
            <div className="pinyin">
              <Pinyin value={word.pinyin} />
            </div>
            <div className="def">{word.def}</div>
            <button className="icon-btn" style={{ marginTop: 12 }} onClick={() => speak(word.simp, word.pinyin)} aria-label="Play audio">
              <Icon.sound />
            </button>
          </div>
        ) : (
          <div className="small muted" style={{ marginTop: 18 }}>
            Tap to show the {part === 'defn' ? 'meaning' : 'pronunciation'}
          </div>
        )}
      </div>
      {!shown ? (
        <div style={{ marginTop: 'auto' }}>
          <button className="btn primary big" onClick={show}>
            Show answer
          </button>
        </div>
      ) : (
        <GradeBar card={card} onGrade={onDone} />
      )}
    </>
  );
}
