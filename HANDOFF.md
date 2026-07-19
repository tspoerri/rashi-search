# HANDOFF — rashi-search (updated 2026-07-18)

**Next action:** Decide whether parsha/book alias lookup should get fuzzy (bounded edit-distance) matching so typo'd names like "berelshit" resolve as filters, then implement or close the question.

## Current state
- v2 committed on `main` (017dcd7): smart search + fields keyword box run on vendored chipus v0.1 (`lib/chipus/`, copied from `../chipus/src` — re-copy to pick up upstream changes, never edit in place).
- Transliterated queries work: "bereishis", "toldos", "chayei sara" resolve as parsha filters via folded-key alias maps; "lech lecha 12" adds perek filter; "בראשית א א" exact-pins; typos ("berelshit") fall through to chipus fuzzy free-text and still surface Gen 1:1.
- Verified live in browser 2026-07-18: 7 query classes, all correct, 1.4–34 ms steady state (one ~55 ms cold-cache outlier); no console errors. Index build over 7,816 records ~1.5 s at load.
- Highlighting for translit-only matches is a no-op by design (chipus `matches` carries field+wordIndex if precise highlighting is ever wanted).
- `.claude/launch.json` here AND in `~/Documents/Projects/.claude/launch.json` (preview_start reads the latter when the session cwd is Projects/): must use `sh -c "cd … && exec /opt/homebrew/bin/python3 -m http.server 8641"` — Xcode's python fails on `os.getcwd()` under TCC.

## Open questions
- Fuzzy alias lookup for typo'd parsha/book names (see next action).
- Precise `<mark>` highlighting for translit matches — worth the complexity?
- Extend keyword search to Onkelos / other meforshim? (carried from v1)

## Resume command
```sh
cd ~/Documents/Projects/rashi-search && claude
# say: "Read HANDOFF.md and continue"
```
