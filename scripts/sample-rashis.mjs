#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data/rashi.json');

// Parse CLI arguments
const args = process.argv.slice(2);
let count = 10;
let seed = null;
let useSpread = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed' && i + 1 < args.length) {
    seed = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--spread') {
    useSpread = true;
  } else if (!isNaN(parseInt(args[i], 10))) {
    count = parseInt(args[i], 10);
  }
}

// Seeded random number generator (simple LCG)
class SeededRandom {
  constructor(seed) {
    this.seed = seed === null ? Date.now() : seed;
  }

  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  shuffle(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

const rng = new SeededRandom(seed);

// Load data
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

// Perform sampling
let sampled;
if (useSpread) {
  // Stratified sampling: divide by popularity into thirds
  const sorted = [...data].sort((a, b) => (b.lk || 0) - (a.lk || 0));
  const thirdSize = Math.ceil(sorted.length / 3);

  const high = sorted.slice(0, thirdSize);
  const mid = sorted.slice(thirdSize, 2 * thirdSize);
  const low = sorted.slice(2 * thirdSize);

  const perTier = Math.floor(count / 3);
  const remainder = count % 3;

  const sampledHigh = rng.shuffle(high).slice(0, perTier + (remainder > 0 ? 1 : 0));
  const sampledMid = rng.shuffle(mid).slice(0, perTier + (remainder > 1 ? 1 : 0));
  const sampledLow = rng.shuffle(low).slice(0, perTier);

  sampled = rng.shuffle([...sampledHigh, ...sampledMid, ...sampledLow]);
} else {
  // Uniform random sampling
  sampled = rng.shuffle(data).slice(0, count);
}

// Helper: extract first ~40 words of text
function truncateText(text, maxWords = 40) {
  const words = text.split(/\s+/);
  return words.slice(0, maxWords).join(' ') + (words.length > maxWords ? '…' : '');
}

// Helper: format reference as "Book Parsha Chapter:Verse"
function formatRef(record) {
  return `${record.b} ${record.p} ${record.c}:${record.v}`;
}

// Print sampled records
console.log(`\n=== Rashi Calibration Sample (${sampled.length} records) ===\n`);

sampled.forEach((record, idx) => {
  const num = idx + 1;
  const ref = formatRef(record);
  const dh = record.dh;
  const bodySnip = truncateText(record.t, 40);
  const likes = record.lk || 0;

  console.log(`${num}. ${ref} (${likes} likes)`);
  console.log(`   Dibbur hamatchil: ${dh}`);
  console.log(`   "${bodySnip}"`);
  console.log(`   Your transliteration: ____`);
  console.log('');
});

console.log('━'.repeat(70));
console.log('Reply with the number and your transliterated query for each');
console.log("(any phrase from the text, as you'd naturally type it).");
console.log('━'.repeat(70));
