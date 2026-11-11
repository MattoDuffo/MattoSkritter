# MattoSkritter

A personal Skritter-style app for learning to **write Mandarin characters** (Simplified), built as an installable web app for iPhone.

- **Writing** practice with stroke-by-stroke recognition (finger-friendly), hints, outline, reveal and automatic grading
- **Tone**, **definition** and **reading** cards
- Spaced repetition with **FSRS**, four grades (Forgot / So-so / Got it / Too easy), undo, ban, mark known
- Your **Skritter lists built in** (one-tap import), plus import of any Skritter export file
- **Stubbornness slider** for new words, **remembered session size**, **dark mode**, **add/edit words in the app**
- Full **CC-CEDICT** dictionary search (hanzi, pinyin with/without tones, English)
- Progress stats, daily goal, streak, review forecast, heatmap
- Works **offline**; backup/restore to a file (Files / iCloud Drive)

See [PLAN.md](PLAN.md) for the full design.

## Put it on your iPhone (one-time setup)

1. **Merge** this branch into `main` (the deploy runs from `main`).
2. On GitHub: **Settings → General → Danger Zone → Change visibility → Public** (GitHub Pages is free for public repos).
3. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. **Actions** tab → *Deploy to GitHub Pages* → **Run workflow** (or push to `main`). After ~2 minutes the site is at
   `https://<your-username>.github.io/MattoSkritter/`.
5. Open that address in **Safari** on the iPhone → Share → **Add to Home Screen**. Open it from the home screen.
6. Tap **Import my Skritter data**. Done — it now works offline too.

Every later push to `main` updates the app automatically (it refreshes the next time you open it).

## Development

```sh
npm install
npm run dev        # builds data into public/data, starts the dev server
npm test           # unit tests (pinyin, tones, scheduler, importer, dictionary)
npm run build      # production build in dist/
npm run preview &  # serve dist/ on :4173
npm run e2e        # iPhone-emulated end-to-end test (needs Playwright + Chromium)
```

`public/data` is generated (git-ignored) by `scripts/build-data.mjs` from npm packages:
stroke data from `hanzi-writer-data` and the dictionary from `cedict-json`. Your Skritter exports live in
`data/skritter-exports/`.

## Credits

- Dictionary: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), CC BY-SA 4.0
- Stroke data: [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) via [Hanzi Writer](https://hanziwriter.org) data, Arphic Public License / LGPL
- Scheduling: [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), MIT
