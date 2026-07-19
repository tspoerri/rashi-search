# HANDOFF — rashi-search (updated 2026-07-19)

**Next action:** Execute chipus `DESIGN-v3.md` (evidence-weighted ranking: field-coverage + term-rarity, drafted 2026-07-19 — lives in `~/Documents/Projects/chipus/DESIGN-v3.md`). Step 0 needs Tamar: persist the round-1 calibration queries (currently transcript-only) to `eval/queries.json`, then transliterate rounds 2–3 (`node scripts/sample-rashis.mjs 10 --seed 2 --spread`). Steps 1–2 (eval harness + experiment grid) are Sonnet-delegable against the doc.

## Calibration round 1 (2026-07-19, seed unspecified, 10 samples)
Ran Tamar's transliterations of 10 random sampled Rashis through the real pipeline (Node harness). 4/10 exact top-1 match. One real bug found and fixed (see below). Remaining 5/10 misses are all short (2-4 word) dibbur/comments using generic vocabulary reused elsewhere in Torah — the true answer sometimes doesn't even crack top-3, and low-likes items can't out-boost more "popular"-scoring false positives that share the same common words. popBoost isn't the lever here — it's roughly symmetric across the tied candidates. This reads as a **term-rarity weighting gap**: chipus currently doesn't reward distinctive/rare terms over common ones, so short comments built from common words are hard to disambiguate. Worth folding into the vowels/prefixes rework rather than a quick constant tweak — flagging for that thread, not fixing now.
- Fixed en route (048a898): `resolveSoft`'s guard skipped verification whenever a translit alias capture consumed the *entire* query (kw empty) — meant to protect legitimate pure-filter queries like "toldos", but it also let bad **fuzzy** alias hits through unchecked. "noach teiva" (2-word fuzzy → Ki Tavo) and "pishon" (1-word fuzzy edit-distance-1 collision → Vayeshev) both hit this. Fix: track whether an alias capture was exact or fuzzy (`q._softFuzzy`); only exact hits skip verification, fuzzy hits are always corpus-checked. Full regression suite + both new cases pass.

## Current state
- All committed and pushed (main = 5f77bf4): https://github.com/tspoerri/rashi-search — clean tree.
- `lib/chipus/` is now a **git submodule** of https://github.com/tspoerri/chipus (chipus v2, vowel-aware ranking). Edit in place → commit/push inside `lib/chipus` → commit the pointer bump here. Pages workflow checks out submodules. Import path: `./lib/chipus/src/index.js`.
- Alias-guard tiers landed (42cbe2e): AMBIG sentinel on colliding alias keys, ≥3-char min on exact translit lookups, soft capture with corpus-agreement check (`resolveSoft`). "vhabor rek ein bo" → Gen 37:24 first; regression cases ("toldos", "lech lecha", "bereishis 12", typo "toldois") pass. Verified in Node harness + live browser.
- **Latency regression FIXED** (chipus 3c8e59f, pointer bump 5a66da5): v2's refine pass ran the O(n·m) `refinedDistance` DP once per posting (`refinedSimCalls == postingsScanned`, 55–75% of query time); now memoized per distinct refined key inside `_matchToken`. Bit-identical output, 26/26 chipus tests pass, DP calls cut 8–13x. Measured in-browser post-fix: 12–108 ms/query (worst = "ויאמר משה"). NOTE: the old "689–1391 ms" figures were mostly a measurement artifact — hidden browser tabs clamp setTimeout to ~1 s, so anything timed through the 80 ms debounce in a background tab reads as ~1 s. Measure search latency synchronously (call `idx.search()` directly), never through the debounce. `limit` has ~zero latency effect (scoring happens before the slice). Remaining headroom if ever needed: the fuzzy tier scans length-neighbor vocab keys with boundedEditDistance (engine.js ~184-226) — a SymSpell/BK-tree index would cut it; skip the "prune-then-refine" idea (only one with ranking risk). Index build is ~5.4 s in a hidden tab (~1.5 s foreground v0.1) — one-time, low priority.
- `scripts/sample-rashis.mjs` ready for calibration: prints random Rashis (`--spread` stratifies by popularity) with transliteration prompts; Tamar's transliterations become test queries to tune params (e.g. popBoost, now capped at 50).
- STRATEGY.md: Nach + Shas expansion plan (M1–M5), plus Sefaria hosted-search note (5f77bf4).
- Test harness pattern (not in repo, rebuildable): extract inline module script from index.html, rewrite chipus import to absolute file path, stub DOM, load data/rashi.json, exercise smartParse/resolveSoft/search directly.

## Open questions
- Repo is private (bundles Sefaria Rashi text) — flip public? Also verify vocalized-edition license before Nach expansion.
- Precise `<mark>` highlighting for translit matches — worth the complexity?

## Resume command
```sh
cd ~/Documents/Projects/rashi-search && claude
# say: "Read HANDOFF.md and continue"
```
