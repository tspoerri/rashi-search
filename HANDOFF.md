# HANDOFF — rashi-search (updated 2026-07-19)

**Next action:** Run the calibration session with `node scripts/sample-rashis.mjs 10 --seed 1 --spread` (Tamar transliterates the sampled Rashis; her transliterations become test queries for tuning popBoost etc.). Also still open: "noach teiva" fuzzy false positive, and the vowels/prefixes rework.

## Current state
- All committed and pushed (main = 5f77bf4): https://github.com/tspoerri/rashi-search — clean tree.
- `lib/chipus/` is now a **git submodule** of https://github.com/tspoerri/chipus (chipus v2, vowel-aware ranking). Edit in place → commit/push inside `lib/chipus` → commit the pointer bump here. Pages workflow checks out submodules. Import path: `./lib/chipus/src/index.js`.
- Alias-guard tiers landed (42cbe2e): AMBIG sentinel on colliding alias keys, ≥3-char min on exact translit lookups, soft capture with corpus-agreement check (`resolveSoft`). "vhabor rek ein bo" → Gen 37:24 first; regression cases ("toldos", "lech lecha", "bereishis 12", typo "toldois") pass. Verified in Node harness + live browser.
- **Latency regression FIXED** (chipus 3c8e59f, pointer bump 5a66da5): v2's refine pass ran the O(n·m) `refinedDistance` DP once per posting (`refinedSimCalls == postingsScanned`, 55–75% of query time); now memoized per distinct refined key inside `_matchToken`. Bit-identical output, 26/26 chipus tests pass, DP calls cut 8–13x. Measured in-browser post-fix: 12–108 ms/query (worst = "ויאמר משה"). NOTE: the old "689–1391 ms" figures were mostly a measurement artifact — hidden browser tabs clamp setTimeout to ~1 s, so anything timed through the 80 ms debounce in a background tab reads as ~1 s. Measure search latency synchronously (call `idx.search()` directly), never through the debounce. `limit` has ~zero latency effect (scoring happens before the slice). Remaining headroom if ever needed: the fuzzy tier scans length-neighbor vocab keys with boundedEditDistance (engine.js ~184-226) — a SymSpell/BK-tree index would cut it; skip the "prune-then-refine" idea (only one with ranking risk). Index build is ~5.4 s in a hidden tab (~1.5 s foreground v0.1) — one-time, low priority.
- Known bug (task chip, pre-existing from 02316b7): "noach teiva" fuzzy 2-word alias false-positives to Ki Tavo and eats the query (kw empty → resolveSoft guard skips).
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
