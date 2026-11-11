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

// 3. Skritter exports bundled for one-tap import
const skSrc = path.join(root, 'data', 'skritter-exports');
const skOut = path.join(out, 'skritter');
fs.mkdirSync(skOut, { recursive: true });
const files = fs.existsSync(skSrc) ? fs.readdirSync(skSrc).filter((f) => /\.(txt|tsv)$/.test(f)).sort() : [];
for (const f of files) fs.copyFileSync(path.join(skSrc, f), path.join(skOut, f));
fs.writeFileSync(path.join(skOut, 'index.json'), JSON.stringify(files));
console.log(`skritter: ${files.length} export files`);
