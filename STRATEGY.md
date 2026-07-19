# STRATEGY — Extending rashi-search to all of Rashi's commentaries

*Drafted 2026-07-19 from a two-agent research pass (codebase audit + Sefaria corpus survey). This is the plan; nothing here is built yet.*

## The landscape

| Corpus | Sefaria coverage | Text | Size (comments) | Lift |
|---|---|---|---|---|
| Chumash (done) | 5 books | Vocalized, `<b>` dibbur hamaschil | 7,816 (~5 MB) | — |
| **Nach** | All 39 books, "Rashi on {Book}" | Same vocalized edition, same `<b>` convention | est. 2–4× Chumash bundle | **Small** |
| **Talmud Bavli** | All tractates, "Rashi on {Tractate}" | Unvocalized Vilna (PD), same `<b>` convention | **~100K** (~19/amud × ~5,400 amudim; wide error bars) | **Large** |
| Rashi on Avot | Mishnah commentary, 494 comments | Disputed authorship | tiny | trivial, optional |
| Responsa / Siddur Rashi / school works | On Sefaria but prose, not lemma-structured | — | small | **Skip** — wrong shape for a dibbur-hamaschil app |

Authorship caveats to surface in the UI (all still filed under "Rashi" on Sefaria):
- **Pseudo-Rashi:** Chronicles, Ezra–Nehemiah (Nach); Nedarim, Nazir (Bavli).
- **Mid-tractate handoffs:** Bava Batra from 29a is Rashbam; Makkot from ~19b is Rivan. Exact transition points in Sefaria's data still unverified.

## What the codebase audit found

Cleanly reusable as-is: chipus (already handles Aramaic), normalize/skeleton logic, gematria parsing, highlighting, results UI, Hebrew keyboard, the boost-blending mechanism. Index is built once at load (not per keystroke) — the architecture is sound.

The Chumash coupling sits at enumerable seams:
1. **Record schema** bakes in `c`/`v` (chapter:verse) and `p`/`ph` (parsha) — daf/amud doesn't fit, and parsha is meaningless outside Chumash.
2. **`smartParse()`** (index.html ~404–486) is the most corpus-specific function: parsha-first matching, book-must-be-first-token, (perek, passuk) capture. No daf/amud recognition exists.
3. **Ref formatting** (`refHe`, `sefariaUrl`) hardcodes "Book C:V" / `Rashi_on_{book}.{c}.{v}.{i}`.
4. **Calendar boost** is parsha-only; daf yomi is a drop-in analog from the *same* `/api/calendars` endpoint (note: it returns a bare daf with no amud — default to `a`).
5. **Scaling:** per-keystroke linear scan + `chipusIndex.search(limit: DB.length)` is fine at 8K records, unproven at 100K+; a single monolithic JSON blob won't fly at 30–50 MB; the `NORM` array ~triples string memory.
6. **build.py** is the friendliest seam — the hardcoded `BOOKS` loop becomes a list of corpus objects fairly mechanically. But per-amud link-count fetches across ~5,400 amudim serially would be brutal: switch the build to the **Sefaria-Export bulk dump** (`gs://sefaria-export/`, ~26 GB total but selectively downloadable, monthly refresh) for Shas.

## Recommended architecture direction

- **Generic location model.** Replace `{c, v}` with corpus-tagged locations: `{corpus, book, loc: [..]}` where Tanakh is `[chapter, verse]` and Bavli is `[daf, amud]`; parsha becomes an optional Chumash-only annotation. One formatter/parser pair per corpus scheme ("chapter:verse" vs "daf/amud"), registered in a corpus config that also carries book lists, aliases, Sefaria URL templates, and the calendar-boost source (parsha / daf yomi / none).
- **Sharded data, lazy loading.** Keep Chumash (and later per-sefer Nach, per-tractate Shas) as separate JSON shards. Load Chumash eagerly (current behavior unchanged), fetch other shards on demand — triggered by corpus toggle or by smartParse recognizing a book/tractate name. Index shards incrementally into chipus as they arrive.
- **One smart box, corpus-aware.** Don't build tabs-per-corpus; extend smartParse so "ברכות ב" / "brachos 2a" / "yeshaya 6" resolve naturally. Tractate names join the same alias/fuzzy machinery as parsha names. An optional scope chip (תורה / נ"ך / ש"ס) filters when wanted.
- **Perf gate before Shas.** Benchmark chipus + the linear scan at a synthetic 100K records *before* building the Talmud pipeline. If keystroke latency blows past ~50 ms, move search to a Web Worker and/or pre-filter by corpus scope. (Chipus v2 vowel-aware ranking is pending upstream — coordinate.)

## Milestones (each independently shippable)

- **M1 — Generalize without growing.** Schema v2 + corpus-config refactor of build.py and index.html, Chumash only. Done = byte-identical search behavior on the existing 7 verified query classes. (Mostly Sonnet-delegable against a written spec.)
- **M2 — Nach.** Add 39 books via existing API path (same vocalized edition). Per-sefer or per-section shards; book aliases (translit + typo); haftarah boost optional; pseudo-Rashi disclaimer for Chronicles/Ezra. Small lift — this ships real value early.
- **M3 — Shas data pipeline.** Sefaria-Export-based build for all tractates; per-tractate shards; link-count popularity from the dump if feasible (else skip popularity boost for Shas v1); authorship labels for Nedarim/Nazir/BB/Makkot.
- **M4 — Shas UX.** Daf/amud parsing in smartParse (gematria dapim, א/ב amud, "2a"), daf-yomi boost, Sefaria deep links, fields-mode daf input.
- **M5 — Perf + polish.** 100K-record benchmark, worker if needed, mobile memory check, Rashi-on-Avot as a freebie if trivial.

## Must verify before building

1. **License of "Sefaria vocalized edition"** (currently "unknown" in version metadata) — the repo already bundles it privately; confirm with Sefaria before any public flip or Nach expansion. Vilna Talmud is clean PD.
2. Real comment counts from raw shape JSON (agent estimates were partly LLM-summarized; Bava Batra number known-bad).
3. Bava Batra 29a / Makkot 19b transition representation in Sefaria's data.
4. Chipus v2 timeline — M1's refactor should land against whichever chipus version is current.
