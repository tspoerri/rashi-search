#!/usr/bin/env python3
"""Build the Rashi-on-Nach search index shards from Sefaria.

Downloads Rashi on each of the 39 Nach books + the base text, and emits
data/nach/{Book}.json + data/nach/manifest.json. Modeled on build.py
(Chumash record schema) and build_bavli.py (sharded output + SSL setup).
"""
import argparse
import html
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
import urllib.parse
from pathlib import Path

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = None

# Reused verbatim from build2.py's BOOKS list (all 39 Nach books).
BOOKS = [
    ("Joshua", "יהושע"),
    ("Judges", "שופטים"),
    ("I Samuel", "שמואל א"),
    ("II Samuel", "שמואל ב"),
    ("I Kings", "מלכים א"),
    ("II Kings", "מלכים ב"),
    ("Isaiah", "ישעיהו"),
    ("Jeremiah", "ירמיהו"),
    ("Ezekiel", "יחזקאל"),
    ("Hosea", "הושע"),
    ("Joel", "יואל"),
    ("Amos", "עמוס"),
    ("Obadiah", "עובדיה"),
    ("Jonah", "יונה"),
    ("Micah", "מיכה"),
    ("Nahum", "נחום"),
    ("Habakkuk", "חבקוק"),
    ("Zephaniah", "צפניה"),
    ("Haggai", "חגי"),
    ("Zechariah", "זכריה"),
    ("Malachi", "מלאכי"),
    ("Psalms", "תהילים"),
    ("Proverbs", "משלי"),
    ("Job", "איוב"),
    ("Song of Songs", "שיר השירים"),
    ("Ruth", "רות"),
    ("Lamentations", "איכה"),
    ("Ecclesiastes", "קהלת"),
    ("Esther", "אסתר"),
    ("Daniel", "דניאל"),
    ("Ezra", "עזרא"),
    ("Nehemiah", "נחמיה"),
    ("I Chronicles", "דברי הימים א"),
    ("II Chronicles", "דברי הימים ב"),
]

# Rashi on these books is traditionally understood NOT to be by Rashi
# himself (pseudo-Rashi / attributed). Mirrors the spirit of build_bavli.py's
# NOTES dict + "cx" flag, but applied per-book since the whole book's
# commentary carries the flag here (not just a sub-range).
PSEUDO_RASHI_BOOKS = {"I Chronicles", "II Chronicles", "Ezra", "Nehemiah"}
PSEUDO_RASHI_NOTE = 'הפירוש המיוחס לרש"י — אינו מרש"י עצמו'

DATA = Path(__file__).parent / "data"
DATA.mkdir(exist_ok=True)
NACH = DATA / "nach"
NACH.mkdir(exist_ok=True)

TAGS = re.compile(r"<[^>]+>")
THIN_SPACES = re.compile(r"[   ​﻿]")
FOOTNOTE_MARKER = re.compile(r"<sup class=\"footnote-marker\">.*?</sup>", re.S)
FOOTNOTE_ITALIC = re.compile(r"<i class=\"footnote\">.*?</i>", re.S)


def clean(s):
    """Strip footnotes+tags, decode HTML entities, normalize odd whitespace.

    Nach Rashi text on Sefaria carries footnote markup
    (<sup class="footnote-marker">...</sup> plus its paired
    <i class="footnote">...</i> body) that build.py's original clean()
    never had to deal with. Both are stripped entirely -- footnote content
    is editorial apparatus, not part of Rashi's words, and left in would
    pollute both the searchable body and (worse) a dibbur-hamaschil if a
    footnote marker happened to land inside the opening <b> tag.
    """
    s = FOOTNOTE_MARKER.sub("", s)
    s = FOOTNOTE_ITALIC.sub("", s)
    s = html.unescape(TAGS.sub("", s))
    return THIN_SPACES.sub(" ", s).strip()


def fetch_json(url, cache_name):
    """Fetch URL with a local file cache so re-runs are free."""
    cache = NACH / cache_name
    if cache.exists():
        return json.loads(cache.read_text())
    req = urllib.request.Request(url, headers={"User-Agent": "rashi-search/1.0"})
    with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r:
        raw = r.read().decode("utf-8")
    cache.write_text(raw)
    return json.loads(raw)


def title_exists(title):
    """Validate a title against Sefaria's /api/name before trusting it."""
    url = "https://www.sefaria.org/api/name/" + urllib.parse.quote(title)
    safe = re.sub(r"[^A-Za-z0-9]+", "_", title)
    try:
        d = fetch_json(url, f"name_{safe}.json")
    except Exception as e:
        print(f"  name lookup failed for {title!r}: {e}")
        return False
    return bool(d.get("is_ref") or d.get("is_book") or d.get("match_title") or d.get("title"))


def get_text(title, cache_name):
    """Whole-book Hebrew text via v3 API, with fill_in_missing_segments so
    chapter/verse indices line up with the base text even in sparse books.
    Returns nested list."""
    url = ("https://www.sefaria.org/api/v3/texts/"
           + urllib.parse.quote(title)
           + "?version=hebrew&fill_in_missing_segments=1")
    d = fetch_json(url, cache_name)
    return d["versions"][0]["text"]


def get_link_counts(book_en, n_chapters):
    """Sefaria links per Rashi segment -> {(perek, passuk, idx): count}."""
    counts = {}
    seg = re.compile(rf"^Rashi on {re.escape(book_en)} (\d+):(\d+):(\d+)")
    safe = book_en.replace(" ", "_")
    for c in range(1, n_chapters + 1):
        url = ("https://www.sefaria.org/api/links/"
               + urllib.parse.quote(f"Rashi on {book_en}") + f".{c}?with_text=0")
        try:
            links = fetch_json(url, f"links_nach_{safe}_{c}.json")
        except Exception as e:
            print(f"  links {book_en} {c} failed: {e}")
            continue
        for link in links:
            m = seg.match(link.get("anchorRef", ""))
            if m:
                key = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
                counts[key] = counts.get(key, 0) + 1
    return counts


def build_book(en, he, want_links):
    safe = en.replace(" ", "_")
    rashi_title = f"Rashi on {en}"

    if not title_exists(rashi_title):
        raise RuntimeError(f"{rashi_title!r} not found via /api/name")

    rashi = get_text(rashi_title, f"rashi_nach_{safe}.json")
    verses = get_text(en, f"text_nach_{safe}.json")
    link_counts = get_link_counts(en, len(rashi)) if want_links else {}

    is_pseudo = en in PSEUDO_RASHI_BOOKS
    records = []
    for ci, chapter in enumerate(rashi):
        for vi, comments in enumerate(chapter):
            if not comments:
                continue
            perek, passuk = ci + 1, vi + 1
            try:
                verse = clean(verses[ci][vi])
            except IndexError:
                verse = ""
            for ri, comment in enumerate(comments):
                if not comment:
                    continue
                m = re.match(r"\s*<b>(.*?)</b>", comment)
                dh = clean(m.group(1)).strip(" .:־") if m else ""
                body = comment[m.end():].strip() if m else comment
                body = clean(body)
                if not body:
                    continue
                rec = {
                    "b": en, "bh": he,
                    "c": perek, "v": passuk, "i": ri + 1,
                    "dh": dh,
                    "t": body,
                    "vt": verse,
                    "lk": link_counts.get((perek, passuk, ri + 1), 0),
                }
                if is_pseudo:
                    rec["cx"] = 1  # pseudo-Rashi: not by Rashi himself
                records.append(rec)
    return records


def spot_check(en, records, n=3):
    """Print a few (dh, vt) pairs so alignment can be eyeballed."""
    print(f"  spot-check {en}:")
    for r in records[:n]:
        print(f"    {r['c']}:{r['v']} dh={r['dh'][:20]!r} vt={r['vt'][:40]!r}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-links", action="store_true",
                     help="skip fetching Sefaria link-count popularity data")
    args = ap.parse_args()
    want_links = not args.no_links

    manifest = []
    skipped = []
    total = 0
    for idx, (en, he) in enumerate(BOOKS):
        print(f"Fetching {en}...")
        try:
            records = build_book(en, he, want_links)
        except Exception as e:
            print(f"  SKIPPED {en}: {e}")
            skipped.append((en, str(e)))
            continue

        if not records:
            print(f"  SKIPPED {en}: no records found")
            skipped.append((en, "no records"))
            continue

        fname = en.replace(" ", "_") + ".json"
        out = NACH / fname
        out.write_text(json.dumps(records, ensure_ascii=False,
                                   separators=(",", ":")))
        manifest.append({
            "en": en, "he": he, "file": fname,
            "count": len(records),
            "pseudoRashi": en in PSEUDO_RASHI_BOOKS,
        })
        total += len(records)
        print(f"  {len(records)} records -> {out} "
              f"({out.stat().st_size / 1e6:.2f} MB)")
        if idx < 6 or en in ("Song of Songs", "I Samuel", "Ezra", "Psalms"):
            spot_check(en, records)

    (NACH / "manifest.json").write_text(
        json.dumps({"books": manifest, "links": want_links},
                   ensure_ascii=False, separators=(",", ":")))
    print(f"\nTotal: {total} records across {len(manifest)} books.")
    if skipped:
        print("Skipped books:")
        for en, err in skipped:
            print(f"  {en}: {err}")


if __name__ == "__main__":
    main()
