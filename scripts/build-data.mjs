// Builds the static data the app loads at runtime into public/data (git-ignored):
//  - strokes/<char>.json  from hanzi-writer-data (Make Me a Hanzi, Arphic PL / LGPL)
//  - dict.json            compact CC-CEDICT (CC BY-SA 4.0) from cedict-json
//  - skritter/*.txt|tsv   the user's Skritter exports + index.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(root, 'public', 'data');
fs.mkdirSync(out, { recursive: true });

// 1. Stroke data
const strokesSrc = path.dirname(require.resolve('hanzi-writer-data/package.json'));
const strokesOut = path.join(out, 'strokes');
fs.mkdirSync(strokesOut, { recursive: true });
const strokeFiles = fs.readdirSync(strokesSrc).filter((f) => f.endsWith('.json') && f !== 'package.json');
if (fs.readdirSync(strokesOut).length < strokeFiles.length) {
  for (const f of strokeFiles) fs.copyFileSync(path.join(strokesSrc, f), path.join(strokesOut, f));
  console.log(`strokes: copied ${strokeFiles.length} characters`);
} else {
  console.log(`strokes: ${strokeFiles.length} characters already present`);
}

// 2. Dictionary: [simplified, traditional-or-empty, numbered pinyin, definitions joined by "; "]
const dictOut = path.join(out, 'dict.json');
if (!fs.existsSync(dictOut)) {
  const cedictPath = path.join(root, 'node_modules', 'cedict-json', 'cedict.json');
  const cedict = JSON.parse(fs.readFileSync(cedictPath, 'utf8'));
  const rows = [];
  for (const e of cedict) {
    if (!/[㐀-鿿]/.test(e.simplified)) continue;
    rows.push([e.simplified, e.traditional === e.simplified ? '' : e.traditional, e.pinyin, e.english.join('; ')]);
  }
  fs.writeFileSync(dictOut, JSON.stringify(rows));
  console.log(`dict: ${rows.length} entries`);
} else {
  console.log('dict: already present');
}

// 2b. Homophones: for each syllable+tone, a common character that has only that reading.
// Text-to-speech often misreads rare characters and radicals (亠 -> shén instead of tóu), so for
// single characters the app speaks this unambiguous homophone instead (亠 tou2 -> 头).
const homOut = path.join(out, 'homophones.json');
if (!fs.existsSync(homOut)) {
  const cedictPath = path.join(root, 'node_modules', 'cedict-json', 'cedict.json');
  const cedict = JSON.parse(fs.readFileSync(cedictPath, 'utf8'));
  const norm = (p) => p.toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v').replace(/\s+/g, '');
  const usage = new Map(); // how many dictionary words use each character
  const readingCount = new Map(); // char -> Map(reading -> number of words using it with that reading)
  for (const e of cedict) {
    for (const c of new Set(e.simplified)) usage.set(c, (usage.get(c) ?? 0) + 1);
    if (/^[A-Z]/.test(e.pinyin)) continue; // proper nouns
    const chars = [...e.simplified];
    const syl = e.pinyin.split(/\s+/).map(norm);
    if (chars.length !== syl.length) continue;
    chars.forEach((c, k) => {
      if (!/^[a-z]+[1-5]$/.test(syl[k])) return;
      if (!readingCount.has(c)) readingCount.set(c, new Map());
      const m = readingCount.get(c);
      m.set(syl[k], (m.get(syl[k]) ?? 0) + 1);
    });
  }
  const best = {};
  for (const [c, m] of readingCount) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [r, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    // only characters that are common and (almost) always read this way
    if (r.endsWith('5') || total < 8 || n / total < 0.95) continue;
    if (!best[r] || total > (readingCount.get(best[r]) ? [...readingCount.get(best[r]).values()].reduce((a, b) => a + b, 0) : 0)) best[r] = c;
  }
  fs.writeFileSync(homOut, JSON.stringify(best));
  console.log(`homophones: ${Object.keys(best).length} syllables`);
}

// 3. Skritter exports bundled for one-tap import
const skSrc = path.join(root, 'data', 'skritter-exports');
const skOut = path.join(out, 'skritter');
fs.mkdirSync(skOut, { recursive: true });
const files = fs.existsSync(skSrc) ? fs.readdirSync(skSrc).filter((f) => /\.(txt|tsv)$/.test(f)).sort() : [];
for (const f of files) fs.copyFileSync(path.join(skSrc, f), path.join(skOut, f));
fs.writeFileSync(path.join(skOut, 'index.json'), JSON.stringify(files));
console.log(`skritter: ${files.length} export files`);
