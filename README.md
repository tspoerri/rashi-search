# rashi-search

חיפוש רש"י על התורה
Lightning-fast local search over all 7,816 Rashis on Chumash.

## Run

```sh
python3 build.py                 # one-time: downloads from Sefaria into data/ (cached)
python3 -m http.server 8641      # then open http://localhost:8641/ (landing → chumash.html / bavli.html)
```

## How it works

- `build.py` downloads Rashi on each of the five books, the Chumash text, and
  parsha boundaries from Sefaria's API (raw responses cached in `data/`), splits
  each comment into dibbur hamaschil (Sefaria's `<b>` tag) and body, and writes
  `data/rashi.json` (~5 MB).
- `chumash.html` is the whole Chumash app (`index.html` is a small landing page linking the two apps). It loads the JSON once, builds two in-memory
  indexes per record — nikud-stripped and a "skeleton" with ו/י removed (so
  ktiv male queries like מוקדם match the vocalized ktiv chaser מקדם) — and
  scores every record per keystroke (~10–50 ms).
- Two modes: fielded search (dibbur hamaschil, sefer, parsha, perek, passuk,
  keywords — all optional) and smart single-box search that parses book/parsha
  names, Hebrew or Arabic numerals, and free text in any order.
- Selecting a result expands it in place: the vocalized passuk, source
  (ספר פרק:פסוק + פרשה), the Rashi, and a link to that exact Rashi on Sefaria.
- Near-ties are broken toward this/last/next week's parsha (Sefaria calendar
  API at load time) and toward Rashis more commonly linked on Sefaria
  (per-segment link counts fetched by `build.py`).
- The ⌨ עברית button opens an on-screen Hebrew keyboard for typing without
  switching the system layout.

Text: Rosenbaum–Silbermann vocalized Rashi (Public Domain, via Sefaria).

## Rashi on Talmud Bavli (bavli.html)

A standalone sibling app: `python3 build_bavli.py` downloads Rashi on all of
Shas (36 tractates, ~122K comments, Vilna edition via Sefaria) into
per-tractate shards under `data/bavli/`, then open
`http://localhost:8641/bavli.html`. Differences from the Chumash app:

- Refs are מסכת/דף/עמוד; smart search understands "ברכות ב.", "שבת כא:",
  "brachos 2a", gematria dapim, and Ashkenazi/Sephardi tractate spellings.
- Near-ties break toward the current daf yomi (no popularity signal in v1).
- Authorship disclaimers: Nedarim/Nazir (pseudo-Rashi), Bava Batra from 29a
  (Rashbam, merged from Sefaria's separate text), Makkot from 19b (Rivan).
- Known limits: no Rashi on Tamid on Sefaria; index build takes ~1 min at
  load; free-text queries run ~0.7–0.8 s (located queries ~10 ms).

## Planned

- Transliterated (Latin-character) Hebrew query support.
