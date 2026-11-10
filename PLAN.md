# MattoSkritter — Project Plan

A personal, customizable clone of the Skritter app for learning to write Mandarin Chinese (Simplified characters), used mainly on an **iPhone**, by a single user. The plan has two stages:

1. **Parity:** rebuild Skritter's core features with open data and open-source building blocks.
2. **Customization:** add the features Skritter lacks or that fit your own study habits.

> **Scope note:** "Copying" here means copying *features and behaviour*. Skritter's code, stroke data, audio, mnemonics, artwork and brand are proprietary, so everything below uses openly licensed equivalents. That keeps the project safe to publish on GitHub.

---

## 1. Skritter feature inventory (what we're copying)

This checklist is the target for parity. Items are tagged **[MVP]** (needed for a usable first version) or **[P]** (needed for full parity).

### 1.1 Study / review modes
| Feature | How Skritter does it | Tag |
|---|---|---|
| **Writing** | Draw a character stroke by stroke on a canvas. Each stroke is recognized and snapped to a clean stroke. Wrong strokes are rejected, and the correct stroke flashes as a hint after repeated misses. | MVP |
| **Definition** | Show the word and ask "do you know the meaning?", then reveal it and self-grade. | MVP |
| **Reading** | Show the word and recall its pinyin or kana, then reveal and self-grade. | MVP |
| **Tone** (Chinese) | Draw the tone mark as a gesture (–, /, ∨, \, or a dot for neutral) for each syllable. | P |
| Multi-character words | Write each character of a word in sequence. | MVP |
| Raw squigs mode | Draw freely with no stroke snapping, then compare against the model and self-grade. | P |
| Hints / reveal | Tap to show the next stroke, or show the whole character as an outline. | MVP |
| Stroke order enforcement | Strokes must be in the right order and direction, with configurable strictness. | MVP |
| Auto-grading | The grade is derived from mistakes made while writing, and the user can override it. | MVP |
| Four-button grading | Forgot / So-so / Got it / Too easy. | MVP |
| Audio | Play the word's pronunciation on reveal (autoplay option). | P |
| Undo last answer / edit item | Undo or adjust the last review from the study screen. | P |

### 1.2 Spaced repetition (SRS)
- A separate schedule for each **part** (writing, reading, definition, tone) of each word. **[MVP]**
- A due queue ordered by due date and priority, with "add new items" pacing (items per day). **[MVP]**
- Related items (a character and the words that contain it) influence each other's scheduling. **[P]**
- Retention target / interval settings. **[P]**
- Ban or suspend an item, mark it as known, or reset its progress. **[MVP]**

### 1.3 Content & lists
- A built-in Mandarin dictionary (Simplified). **[MVP]**
- Vocab lists, including pre-made textbook-style lists (HSK 1–6 / new HSK 1–9). **[MVP]**
- Custom lists: create, edit, reorder and split into sections, and import from CSV/TSV/Anki/Pleco exports. **[MVP: create + CSV]**
- Choose which lists are "studying" and which are paused, plus the order new items are added from. **[MVP]**
- Word detail page with: definitions, readings, components/radicals, stroke animation, example words, user notes, and mnemonics. **[MVP basic, P full]**
- Custom definitions and mnemonics per word. **[P]**
- Heisig-style keyword support (optional). **[P]**

### 1.4 Progress & stats
- Daily goal (minutes or items) with a streak. **[MVP]**
- Counts: items learned, characters and words written, time studied. **[MVP]**
- Accuracy per part over time (charts) and a heatmap calendar. **[P]**
- Forecast of upcoming reviews. **[P]**

### 1.5 Settings & accounts
- Choose which parts to study (writing, reading, definition, tone). **[MVP]**
- Stroke strictness, hint behaviour, squigs on/off, autoplay audio, grading behaviour, and the canvas grid style (米字格 / 田字格 / none). **[MVP subset]**
- Works fully offline. **[MVP]**
- Backup/restore to a file instead of accounts and sync (single user). **[MVP]**
- Works well on tablet + stylus, phone and desktop (mouse). **[MVP]**

---

## 2. Open replacements for Skritter's proprietary pieces

| Need | Source | License |
|---|---|---|
| Chinese stroke data (SVG paths + medians) | **Make Me a Hanzi** (`graphics.txt`, `dictionary.txt`) | Arphic Public License / LGPL |
| Stroke animation + quiz (recognition) | **Hanzi Writer** (JS library) | MIT |
| Chinese dictionary | **CC-CEDICT** | CC BY-SA 4.0 |
| HSK / JLPT word lists | Public HSK/JLPT lists (e.g. `hsk-vocabulary` repos, Tanos lists) | Varies, check each |
| Character decomposition | Make Me a Hanzi `decomposition` field / CJK Decomp | Open |
| Audio | Browser Web Speech API (TTS) first, then optionally recorded syllable sets (e.g. open Mandarin syllable recordings) | — |
| SRS algorithm | **FSRS** (`ts-fsrs`) | MIT |

**Licensing implication:** the CC BY-SA data means bundled data files must keep attribution and share-alike. Add a `CREDITS.md` file and keep that data separate from the app code.

---

## 3. Proposed architecture

**Recommendation:** build a local-first **Progressive Web App (PWA)** in TypeScript. It is tuned for iPhone Safari (finger writing) but still runs on any device. It installs to the home screen and works offline, with no app-store friction.

```
apps/web            React + Vite + TypeScript PWA
  src/study/        study session engine + UI per mode
  src/canvas/       drawing surface, stroke capture, recognition (wraps Hanzi Writer)
  src/srs/          scheduler (ts-fsrs) + queue builder
  src/data/         IndexedDB (Dexie) repositories
  src/lists/        list browsing, editing, import
  src/dict/         dictionary search + word detail
  src/stats/        progress dashboard
packages/content    build scripts that turn CC-CEDICT, MakeMeAHanzi, HSK etc. into compact JSON shards
(no server: single user, local data + file backup)
```

**Trade-offs of a web app vs. native apps**
| What we give up | Impact | Mitigation |
|---|---|---|
| Native touch latency (iOS stroke prediction) | A few ms of extra ink lag when writing with a finger. Fine for practice. | Pointer Events with `getCoalescedEvents()`/`getPredictedEvents()`, a lightweight canvas renderer, and `touch-action: none` |
| Guaranteed local storage (Safari can evict data of sites not opened recently) | Risk of losing offline progress | Install to the home screen, call `navigator.storage.persist()`, and add a JSON export/backup button |
| Reliable reminder notifications | Web push works on iOS only for home-screen-installed apps (iOS 16.4+) | Use web push where available, plus an optional email reminder later |
| Background sync, widgets, Siri/shortcuts, haptics on iOS | No "due today" widget and no vibration on wrong strokes | Not core to studying, so skip it |
| High-quality offline audio | Web Speech voices differ by device, and autoplay requires a user tap first | Bundle recorded syllable audio later |
| App Store presence | Not discoverable in stores (irrelevant for personal use) | If ever needed, wrap the same code with Capacitor |

What we gain: one codebase for iPad, Android, phone and desktop; instant updates with no review process; no developer-account fees; easy sharing via a URL.

**Key design decisions**
- **Data model:** `Word` (dictionary entry), `Character` (stroke data), `List` → `Section` → `ListItem(wordId)`, `Item(wordId, part, srsState)`, `Review(itemId, grade, timestamp, duration, mistakes)`. Keeping the review log means the scheduler and stats can be recomputed at any time.
- **Local-first:** all study happens against IndexedDB, with no server. Backups are a JSON export of lists and the review log.
- **Lazy content loading:** stroke data is split into small files and fetched per character, then cached by the service worker.
- **Testing:** Vitest for the SRS, queue and import logic. Playwright for study-flow end-to-end tests, including simulated strokes on the canvas.

---

## 4. Roadmap

### Phase 0 — Foundation (≈1 week)
- [ ] Scaffold the Vite + React + TS PWA, ESLint/Prettier, Vitest, Playwright, and GitHub Actions CI.
- [ ] Content pipeline: CC-CEDICT + Make Me a Hanzi + HSK lists → JSON shards in `public/data`.
- [ ] Add a `CREDITS.md` file with data licenses.

### Phase 1 — Writing practice core (MVP heart)
- [ ] Canvas component tuned for **iPhone finger writing**:
  - a square canvas filling the screen width, with buttons in thumb reach below it;
  - `touch-action: none` and blocking of double-tap zoom, pull-to-refresh and text selection;
  - keeping strokes away from the left-edge "swipe back" gesture area, and respecting safe areas (notch, home bar);
  - more forgiving stroke matching than for a stylus, because a finger is less precise and hides the stroke while writing.
- [ ] Test early on a real iPhone (installed to the home screen) before building the rest.
- [ ] Stroke recognition and snapping through Hanzi Writer quiz mode. Track the number of mistakes per stroke.
- [ ] Hints: flash the next stroke after N misses, tap to reveal, show the outline.
- [ ] Multi-character word writing flow.
- [ ] Auto-grade from mistakes, plus four-button grading override.

### Phase 2 — SRS & study sessions
- [ ] Item-per-part model, plus `ts-fsrs` scheduling mapped to the four grades.
- [ ] Queue builder: due items first, then new items limited by the daily new-item cap and drawn from active lists in order.
- [ ] Definition and Reading modes.
- [ ] Session screen: progress bar, timer, undo last answer, and ban/known/reset actions.

### Phase 3 — Lists & dictionary
- [ ] Dictionary search (hanzi, pinyin with or without tones, English).
- [ ] Word detail page: stroke animation, decomposition, example words, notes.
- [ ] Built-in HSK lists, plus custom list creation and editing with sections.
- [ ] **Skritter list import**: parse your exported Skritter lists into MattoSkritter lists, matching each word against CC-CEDICT and flagging words not found. Choose per list whether imported words start as *new* or *known*.
- [ ] Generic CSV/TSV import (and Pleco/Anki export formats).

### Phase 4 — Stats & daily goals
- [ ] Daily goal + streak.
- [ ] Dashboard: items learned, time studied, accuracy per part, review forecast, heatmap calendar.

### Phase 5 — Full parity
- [ ] Tone mode (gesture recognition for the 5 tones).
- [ ] Raw squigs mode.
- [ ] Audio (TTS first, recorded audio later).
- [ ] Custom definitions and mnemonics.
- [ ] Related-item scheduling (character ↔ word).

**Parity checkpoint:** every item in Section 1 is checked off, and you can move your real daily study from Skritter to MattoSkritter.

### Phase 6 — Your customizations (the point of the project)
Ideas to choose from. Replace these with your own wishes:
- Your own grading rules (for example, stricter stroke direction, or forgiving stroke order for simple radicals).
- Component-first learning: automatically queue a character's components before the character itself.
- Sentence mode: write whole sentences from a source text, or from a cloze with characters left out.
- Import vocab from articles, ebooks or subtitles, with unknown-word detection.
- Handwriting style analysis (proportions, balance) and calligraphy-style brush rendering.
- A Claude-powered tutor: generated mnemonics, example sentences at your level, and explanations of confusable characters.
- Different SRS tuning per list, plus "cram" mode before exams.
- A detailed stats export (CSV) and a custom dashboard.

---

## 5. Decisions made
| Question | Decision | Consequence |
|---|---|---|
| Language | Mandarin only | Japanese (KanjiVG, JMdict, JLPT) is out of scope |
| Script | Simplified only | No Traditional toggle; Simplified data only, so downloads are smaller |
| Main device | iPhone | Finger writing on a small screen drives the canvas design; test on the phone from the start |
| Users | Just you | No accounts, server or sync; local data with file backup |
| Skritter lists | Import them | Skritter list import is part of Phase 3 |

**Needed from you for the Skritter import:** an exported list file (or two) from your Skritter account, so the importer is built against the real format. Skritter's list export probably does not include your review history, so imported words would start as new or as known. If you can export review history or progress, send that too.

## 6. Immediate next step
Start **Phase 0**: scaffold the web app and build the Mandarin content pipeline (CC-CEDICT, Make Me a Hanzi, HSK lists). Then build a vertical slice on the iPhone: write one HSK 1 word with your finger, have it checked and graded, and see it scheduled.
