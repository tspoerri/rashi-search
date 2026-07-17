# HANDOFF

**Next action:** Add transliterated-Hebrew (Latin-character) query support to the smart search box in index.html.

## Current state (2026-07-17, v1.1)
- v1.1 complete and verified in browser. 7,816 Rashis on Chumash, searchable in ~10–50 ms.
- UI chrome is English (labels, tabs, hints); sources and proper nouns stay Hebrew.
- ⌨ עברית button opens an on-screen Hebrew keyboard dropdown that types into the last-focused input.
- Results expand in place (accordion) — no separate detail pane.
- Ranking tiebreaks: +40 for this week's parsha / +20 adjacent weeks (Sefaria calendar API, fetched live with year/month/day params — the `date=` param is silently ignored!), plus up to +20 for Sefaria link count (`lk` field, fetched per chapter by build.py, cached in data/).
- `build.py` fetches from Sefaria (responses cached in `data/`, gitignored) → `data/rashi.json`.
- `index.html` = whole app: fielded search + smart single-box parser (book/parsha names, Hebrew/Arabic numerals, free text). Detail pane shows vocalized passuk, source, Rashi, Sefaria deep link.
- Ktiv male/chaser handled via a ו/י-stripped "skeleton" index; phrase matches in body/verse boosted; exact perek:passuk pin keeps that passuk's Rashis visible even without text match.

## Open questions
- Transliteration scheme for v2: what conventions does Tamar actually type (ch vs kh, tz vs ts, final-letter forms)? Probably map many-to-one into the skeleton index.
- Should keyword search also cover Onkelos or other meforshim later?

## Resume
```sh
cd ~/Documents/Projects/rashi-search && python3 build.py && python3 -m http.server 8641
# open http://localhost:8641/index.html
```
