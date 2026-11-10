# MattoSkritter — Project Plan

A personal, customizable clone of the Skritter app for learning to write Mandarin Chinese (Simplified characters), used mainly on an **iPhone**, by a single user. The plan has two stages:

1. **Parity:** rebuild Skritter's core features with open data and open-source building blocks.
2. **Customization:** add the features Skritter lacks or that fit your own study habits.

> **Scope note:** "Copying" here means copying *features and behaviour*. Skritter's code, stroke data, audio, mnemonics, artwork and brand are proprietary, so everything below uses openly licensed equivalents. That keeps the project safe to publish on GitHub.

---

## 0. Your must-haves (fixes for what annoys you in Skritter)
These are **part of the first version**, not later extras. Each is linked to the phase where it gets built.

| # | Requirement | Design | Phase |
|---|---|---|---|
| M1 | **Remember my session size** | Every setting, including the number of cards per session, is saved locally the moment you change it. The session start screen offers your last choice. There is no hidden reset. | 2 |
| M2 | **A "stubbornness" slider for new words** | See below. | 2 |
| M3 | **Dark mode** | Follows the iPhone's light/dark setting by default, with a manual Light / Dark / Auto override. Colours are defined once as theme tokens, so every screen, including the writing canvas (ink, grid, hints), works in both modes. | 0 (tokens), 1 (canvas) |
| M4 | **Create a new entry directly in the app** | See below. | 3 |

### M2 — New-word stubbornness slider
Skritter holds back new words until your "struggling" words are mastered. Here the slider sets how strict that gate is:

- **Struggling words** are words learned recently, or failed recently, that the scheduler isn't yet confident about (low FSRS stability, or a lapse in the last few days).
- **The slider (0–100)** sets how many struggling words you can have before new words stop coming:
  - **0 = "Eager":** new words always come at your daily new-word limit, whatever happens.
  - **50 = "Balanced":** new words slow down as struggling words pile up, and stop at around 30.
  - **100 = "Skritter-strict":** new words stop until fewer than about 5 struggling words remain.
- **Gradual, not on/off:** between those points the number of new words per day shrinks step by step instead of dropping straight from N to 0.
- **Shows its reasoning:** the session screen says why, e.g. "2 new words today (12 struggling words, stubbornness 60)".
- **Override button:** "Add 5 new words now" works whatever the slider says.
- **Separate daily limit:** the daily new-word limit is its own setting. The slider only decides how much of it you get.

### M4 — Add and edit entries in the app
- **"＋ Add word"** is reachable from the home screen, the dictionary search, and the end of a session.
- **Type in hanzi** (iOS Chinese keyboard or handwriting input). The app fills in pinyin and definition from CC-CEDICT as you type, and you can edit either one. If a word has several dictionary entries (几, 台…), you pick the right one.
- **Words not in the dictionary** (names, slang, 大世界) are allowed: you type the pinyin and definition yourself.
- **Choose list(s)** to add the word to, with "Personal" as the default. Choose to start it as *new* or *study it now*.
- **Edit** any existing word's definition, pinyin or notes from the word page or right after a review. Edits are stored as your own version and never overwritten by dictionary updates.
- **Missing stroke data:** if a character has none, the word is still added, but its writing part is disabled and the app tells you why.

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
- [ ] Deploy to Cloudflare Pages from the private repo and install on the iPhone home screen.
- [ ] Theme tokens with light/dark mode (M3).

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
- [ ] Queue builder: due items first, then new items limited by the daily new-item cap **and the stubbornness slider (M2)**, drawn from active lists in order.
- [ ] Settings persistence: every setting saved on change, and session size remembered (M1).
- [ ] Definition and Reading modes.
- [ ] Session screen: progress bar, timer, undo last answer, and ban/known/reset actions.

### Phase 3 — Lists & dictionary
- [ ] Dictionary search (hanzi, pinyin with or without tones, English).
- [ ] Word detail page: stroke animation, decomposition, example words, notes.
- [ ] Built-in HSK lists, plus custom list creation and editing with sections.
- [ ] **Skritter list import** (format in section 4b; may move earlier to seed the Phase 2 study queue with your 1,075 words): parse your exported Skritter lists into MattoSkritter lists, matching each word against CC-CEDICT and flagging words not found. Choose per list whether imported words start as *new* or *known*.
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

### Phase 6 — More customizations
Your must-haves (section 0) are built in Phases 0–3. Further ideas to choose from later:
- Your own grading rules (for example, stricter stroke direction, or forgiving stroke order for simple radicals).
- Component-first learning: automatically queue a character's components before the character itself.
- Sentence mode: write whole sentences from a source text, or from a cloze with characters left out.
- Import vocab from articles, ebooks or subtitles, with unknown-word detection.
- Handwriting style analysis (proportions, balance) and calligraphy-style brush rendering.
- A Claude-powered tutor: generated mnemonics, example sentences at your level, and explanations of confusable characters.
- Different SRS tuning per list, plus "cram" mode before exams.
- A detailed stats export (CSV) and a custom dashboard.

---

## 4b. Skritter export format (from your 5 real exports)
The sample files are in `data/skritter-exports/`. They serve both as the importer's test fixtures and as your starting data.

**Format:** UTF-8 plain text with no header and no BOM, one word per line, 4 tab-separated columns:
```
认为<TAB>認為<TAB>ren4wei2<TAB>believe; think (that); consider; to feel
simplified  traditional  numbered pinyin   definition
```

**What's in them:** 1,553 rows. After removing duplicates there are **1,075 unique words** and **765 unique characters**; 301 words appear in more than one list.

**Points the importer must handle:**
| Observation | Example | Handling |
|---|---|---|
| Pinyin uses tone numbers (5 = neutral) | `zhun3bei4`, `xi3huan5` | Convert to tone marks for display; keep numbers for tone mode |
| Syllables sometimes joined, sometimes spaced | `ren4wei2` vs `suan4 le5` | Split on tone digits |
| `v` for ü | `lv4`, `nv3` | Map to ü / ǚ |
| Apostrophes, capitals, erhua | `ke3'ai4`, `Bei3jing1`, `yi1dian3r5` | Strip apostrophes, keep capitals, treat `r5` as an erhua suffix |
| Several readings on single characters | `he2, huo4, huo2, he4, han4` | Store all readings; the first is the primary one; tone mode accepts the primary one |
| Definitions include your own edits | 辛苦了 "exhausting (Hard working)", 大世界 = Singapore mall | **Keep the file's definition** as your custom definition, and show the CC-CEDICT one alongside it |
| The traditional column tells apart words that look identical in Simplified | 几 (幾 "how many") vs 几 (几 "small table"); 台 臺/檯; 里 裡/里; 后 後/后 | Use the simplified + traditional pair to choose the right dictionary entry (the traditional form is otherwise ignored) |
| Duplicates within a list | 饺子 appears 3× in *Basic duolingo words*; a whole block repeats | Keep one copy per list, in the order of first appearance |
| No sections, no review history, no "known" status | — | Import into a single section. For each list, choose to start the words as *new* or *known*. An option sets everything to "known but due soon" so the scheduler finds your level quickly |
| Likely typos | 请家 "to ask to leave" (probably 请假), 挽/輓 | Show an import report listing words not found in CC-CEDICT, so you can fix or keep them |
| Trailing spaces | `what about...? ` | Trim |

**"Export all" file** (`skritter-export-all-2026-11-11.tsv`): same 4 columns but **no progress data** either. Differences:
- It lists the 714 items you have actually *started studying* (one per item, no duplicates), including about 25 radicals (宀, 讠, 氵…) and about 95 words that are in none of the lists.
- Column 2 repeats the simplified form instead of the traditional one, so it can't be used to tell identical-looking words apart. Look those words up in the list files instead, or pick the dictionary entry whose meaning matches the definition.
- 481 words in the list files are *not* in it, meaning you never started them.

**Import strategy:** words in "export all" start as *studied* (known but due soon, so the scheduler recalibrates within a few days); all other list words start as *new*. Words not in any list go into an extra list called "Skritter – other".

**Lists:** each file becomes one list named after the file (`export-Words_from_duolingo.txt` → "Words from duolingo"). Items are shared across lists, so a word in two lists is studied once.

## 4c. Design details (draft, to tune on your phone)

### Grading rules (writing)
- **Stroke matching:** Hanzi Writer's quiz mode, with more forgiving matching than its default because you write with a finger. The exact tolerance is tuned on your iPhone in Phase 1.
- **Stroke order:** strict, so strokes must come in order. **Stroke direction:** lenient, so a stroke drawn backwards is accepted.
- **A miss** is a stroke that isn't accepted.
  - After **2 misses** on the same stroke, it flashes as a hint.
  - After **3 misses**, it's drawn for you.
- **Grade per character:**

| What happened | Automatic grade |
|---|---|
| 0 misses, no hints | Got it |
| 1–2 misses in total, nothing drawn for you | So-so |
| Any stroke drawn for you, 3+ misses in total, or "reveal" tapped | Forgot |

- **Too easy** is only given when you tap it yourself.
- **Grade per word:** the worst grade among its characters.
- **After writing:** the four grade buttons appear with the automatic grade highlighted. Tap another to override it.
  - "Got it" moves on by itself after about 1 s, and you can turn that off.
  - The other grades wait for your tap.
- **Tone:** each syllable is a gesture: – (1st), / (2nd), ∨ (3rd), \ (4th), or a tap (neutral). One wrong tone = Forgot. Characters with several readings accept the word's main reading.
- **Definition / reading:** you tap to reveal, then grade yourself.

### Learning a new word
1. **Intro card:** the word, pinyin, definition, audio, and the stroke animation for each character.
2. **Trace:** you write over a faint outline with hints on. This isn't graded.
3. **Write from memory** later in the same session. This is the first real grade, and the word is scheduled from there.

There is a daily limit on new words (default 10), filtered by the stubbornness slider (M2).

### Session structure
- **Parts:** writing, tone, definition and reading are all on by default, and each can be turned off.
- **Characters inside words:** when a multi-character word is added, each character not already studied gets its own writing item, as in Skritter. This can be switched off.
- **Radicals:** the ~25 radicals you studied in Skritter are kept as items. New radicals are not added automatically.
- **Order:** the most overdue cards come first. Different parts of the same word are kept apart so they don't give each other away.
- **Session size:** the number of cards, remembered between sessions (M1).
- **Review cap after import:** at most 100 reviews per day, so the 714 imported "studied" words spread over the first week instead of arriving on day 1.

### Hosting
**Recommendation: Cloudflare Pages.** It's free, gives an HTTPS address, deploys automatically on every push, and works with a **private** GitHub repo. GitHub Pages would require a public repo, which would expose your word lists, or a paid plan.

### Stroke data coverage ✅ checked
All **809** characters and radicals in your Skritter exports (including 讠 钅 辶 礻 阝 忄 饣 氵 艹 刂 亻) are covered by Hanzi Writer's stroke data (`hanzi-writer-data` 2.0.1). Nothing is missing.

### Backups
- **Restore:** "Back up now" exports a JSON file (lists, edits, settings and the full review log) through the iOS share sheet, so you can save it to Files or iCloud Drive. "Restore" reads that file back.
- **Weekly prompt:** if no backup was made in 7 days, a banner asks "Back up now?".
- **Persistent storage:** the app asks Safari to keep its storage permanently (`navigator.storage.persist()`) and shows whether that was granted.

### First version is done when…
- You do your **daily reviews only in MattoSkritter for 7 days in a row**, without going back to Skritter.
- Correct finger strokes are accepted the first time **almost always**. If you notice false rejections more than about once a session, the tuning isn't done.
- It works **offline** (airplane mode) once installed to the home screen.
- **No data is lost** across app closes, iPhone restarts and a backup → restore round trip.
- All four must-haves (section 0) work.

## 5. Decisions made
| Question | Decision | Consequence |
|---|---|---|
| Language | Mandarin only | Japanese (KanjiVG, JMdict, JLPT) is out of scope |
| Script | Simplified only | No Traditional toggle; Simplified data only, so downloads are smaller |
| Main device | iPhone | Finger writing on a small screen drives the canvas design; test on the phone from the start |
| Users | Just you | No accounts, server or sync; local data with file backup |
| Skritter lists | Import them | Skritter list import is part of Phase 3 |

**Skritter import:** the format is now known from 5 sample exports (see section 4b); the importer itself is not built yet. They contain no review history, so progress can't be carried over exactly.

## 6. Immediate next step
Start **Phase 0**: scaffold the web app and build the Mandarin content pipeline (CC-CEDICT, Make Me a Hanzi, HSK lists). Then build a vertical slice on the iPhone: write one HSK 1 word with your finger, have it checked and graded, and see it scheduled.
