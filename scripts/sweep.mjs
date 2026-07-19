#!/usr/bin/env node
// Sweep driver: loads the pipeline ONCE, then re-runs the main and partial
// eval sets under a list of {label, opts} configs.
//
// chipus v3's coverageWeight/refineWeightLatin are read by ChipusIndex at
// CONSTRUCTION time into instance fields (this.coverageWeight,
// this.refineWeightLatin), not re-read per search() call — so a
// globalThis.CHIPUS_OPTS set before loadPipeline only affects the config the
// index is *first* built with. To sweep configs against the same built
// index (avoiding an expensive rebuild per config), this driver mutates
// those instance fields directly on the live `ns.chipusIndex` between runs;
// search() reads `this.coverageWeight`/`this.refineWeightLatin` fresh on
// every call, so this is equivalent to reconstructing with different opts.
//
// Run: node scripts/sweep.mjs

import fs from 'fs';
import path from 'path';
import { loadPipeline, runOnQueries, QUERIES_PATH, REPO_ROOT } from './eval.mjs';

const PARTIAL_PATH = path.join(REPO_ROOT, 'eval/queries-partial.json');

// Edit this list to sweep other configs. The current default reproduces the
// 2026-07-19 sweep's key points: baseline (v2), and the validated winner.
const CONFIGS = [
  { label: 'baseline (v2): coverageWeight=0 refineWeightLatin=null', opts: { coverageWeight: 0, refineWeightLatin: null } },
  { label: 'coverageWeight=10', opts: { coverageWeight: 10, refineWeightLatin: null } },
  { label: 'coverageWeight=20', opts: { coverageWeight: 20, refineWeightLatin: null } },
  { label: 'coverageWeight=30', opts: { coverageWeight: 30, refineWeightLatin: null } },
  { label: 'coverageWeight=60', opts: { coverageWeight: 60, refineWeightLatin: null } },
  { label: 'coverageWeight=20 refineWeightLatin=40', opts: { coverageWeight: 20, refineWeightLatin: 40 } },
  { label: 'coverageWeight=20 refineWeightLatin=75', opts: { coverageWeight: 20, refineWeightLatin: 75 } },
  { label: 'winner: coverageWeight=20 refineWeightLatin=40', opts: { coverageWeight: 20, refineWeightLatin: 40 } },
];

function bucketAgg(agg, bucketName) {
  return agg.byBucket[bucketName] || { n: 0, top1: 0, top1tied: 0, top3: 0, mrrSum: 0, miss: 0 };
}

function pct(x, n) {
  return n ? ((x / n) * 100).toFixed(1) + '%' : 'n/a';
}

async function main() {
  // Set before loadPipeline so the index's first construction already uses
  // a sane config (matters only if some future opt is construction-only in
  // a way that can't be mutated after the fact).
  globalThis.CHIPUS_OPTS = CONFIGS[0].opts;

  const ns = await loadPipeline();
  const mainQueries = JSON.parse(fs.readFileSync(QUERIES_PATH, 'utf-8'));
  const partialQueries = JSON.parse(fs.readFileSync(PARTIAL_PATH, 'utf-8'));

  const report = [];

  for (const cfg of CONFIGS) {
    // Mutate the live index's opt fields directly — see header comment.
    ns.chipusIndex.coverageWeight = cfg.opts.coverageWeight || 0;
    ns.chipusIndex.refineWeightLatin = cfg.opts.refineWeightLatin ?? null;

    const mainAgg = runOnQueries(ns, mainQueries);
    const partialAgg = runOnQueries(ns, partialQueries);
    const b12 = bucketAgg(mainAgg, '1-2');

    const row = {
      label: cfg.label,
      opts: cfg.opts,
      main: {
        top1: pct(mainAgg.overall.top1, mainAgg.overall.n),
        top1tied: pct(mainAgg.overall.top1tied, mainAgg.overall.n),
        top3: pct(mainAgg.overall.top3, mainAgg.overall.n),
        mrr: (mainAgg.overall.mrrSum / mainAgg.overall.n).toFixed(3),
        miss: pct(mainAgg.overall.miss, mainAgg.overall.n),
      },
      dh12: {
        top1: pct(b12.top1, b12.n),
        top3: pct(b12.top3, b12.n),
        n: b12.n,
      },
      partial: {
        top1: pct(partialAgg.overall.top1, partialAgg.overall.n),
        top3: pct(partialAgg.overall.top3, partialAgg.overall.n),
        mrr: partialAgg.overall.n ? (partialAgg.overall.mrrSum / partialAgg.overall.n).toFixed(3) : 'n/a',
      },
      worst: mainAgg.worst.slice(0, 15).map((w) => ({
        query: w.query, style: w.style, variant: w.variant,
        expected: w.expected, rank: w.rank === Infinity ? 'MISS' : w.rank,
        tie: w.tie, topHitRef: w.topHitRef,
      })),
    };
    report.push(row);
    console.log(
      `${cfg.label}\n  main top1=${row.main.top1} top1tied=${row.main.top1tied} top3=${row.main.top3} mrr=${row.main.mrr} miss=${row.main.miss} | dh1-2 top1=${row.dh12.top1} top3=${row.dh12.top3} (n=${row.dh12.n}) | partial top1=${row.partial.top1} top3=${row.partial.top3} mrr=${row.partial.mrr}`,
    );
  }

  const outPath = path.join(REPO_ROOT, 'eval/sweep-v3.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
