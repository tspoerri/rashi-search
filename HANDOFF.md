# HANDOFF — rashi-search (updated 2026-07-19)

**Next action:** Either (a) re-vendor `lib/chipus/` when chipus v2 lands (see ../chipus/HANDOFF.md), or (b) start M1 of STRATEGY.md (corpus-config refactor, no behavior change) — order flexible, but land M1 against whichever chipus is current.

## Expansion strategy (2026-07-19)
- STRATEGY.md written: full plan for extending to all of Rashi (Nach = small lift, same vocalized edition; Shas = ~100K comments, needs schema v2 + sharded lazy loading + Sefaria-Export bulk build; skip responsa/Siddur). Milestones M1–M5, each shippable.
- Before building: verify "Sefaria vocalized edition" license (unknown — repo bundles it), raw comment counts, BB 29a/Makkot 19b authorship transitions in Sefaria data.

## Current state
- Pushed to GitHub (private): https://github.com/tspoerri/rashi-search
- Fuzzy alias matching committed (02316b7): typo'd book/parsha names ("toldois", "lech lecho", "noahc") resolve as filters via boundedEditDistance fallback in smartParse; ambiguous ties fall through to free text; Hebrew paths byte-for-byte unchanged. Verified with Node script, 7/7 cases pass.
- v2 committed on `main` (017dcd7): smart search + fields keyword box run on vendored chipus v0.1 (`lib/chipus/`, copied from `../chipus/src` — re-copy to pick up upstream changes, never edit in place).
- Transliterated queries work: "bereishis", "toldos", "chayei sara" resolve as parsha filters via folded-key alias maps; "lech lecha 12" adds perek filter; "בראשית א א" exact-pins; typos ("berelshit") fall through to chipus fuzzy free-text and still surface Gen 1:1.
- Verified live in browser 2026-07-18: 7 query classes, all correct, 1.4–34 ms steady state (one ~55 ms cold-cache outlier); no console errors. Index build over 7,816 records ~1.5 s at load.
- Highlighting for translit-only matches is a no-op by design (chipus `matches` carries field+wordIndex if precise highlighting is ever wanted).
- `.claude/launch.json` here AND in `~/Documents/Projects/.claude/launch.json` (preview_start reads the latter when the session cwd is Projects/): must use `sh -c "cd … && exec /opt/homebrew/bin/python3 -m http.server 8641"` — Xcode's python fails on `os.getcwd()` under TCC.

## Open questions
- Repo is private (bundles Sefaria Rashi text) — flip with `gh repo edit --visibility public` if desired.
- Precise `<mark>` highlighting for translit matches — worth the complexity?
- Extend keyword search to Onkelos / other meforshim? (carried from v1)

## Resume command
```sh
cd ~/Documents/Projects/rashi-search && claude
# say: "Read HANDOFF.md and continue"
```
