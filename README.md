# rashi-search

חיפוש רש"י על התורה
Lightning-fast local search over all 7,816 Rashis on Chumash.

## Run

```sh
python3 build.py                 # one-time: downloads from Sefaria into data/ (cached)
python3 -m http.server 8641      # then open http://localhost:8641/index.html
```

## How it works

- `build.py` downloads Rashi on each of the five books, the Chumash text, and
  parsha boundaries from Sefaria's API (raw responses cached in `data/`), splits
  each comment into dibbur hamaschil (Sefaria's `<b>` tag) and body, and writes
  `data/rashi.json` (~5 MB).
- `index.html` is the whole app. It loads the JSON once, builds two in-memory
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

## Planned

- Transliterated (Latin-character) Hebrew query support.
