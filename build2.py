#!/usr/bin/env python3
"""Build the Rashi search index from Sefaria.

Downloads Rashi on Chumash + the Chumash text + parsha boundaries,
and emits data/rashi.json consumed by index.html.
"""
import html
import json
import re
import urllib.request
import urllib.parse
from pathlib import Path

BOOKS = [
    ("Genesis", "בראשית"),
    ("Exodus", "שמות"),
    ("Leviticus", "ויקרא"),
    ("Numbers", "במדבר"),
    ("Deuteronomy", "דברים"),
    ("Joshua", "יהושע"),
  ("Judges","שופטים"),
  ("I Samuel","שמואל א"),
  ("II Samuel","שמואל ב"),
  ("I Kings","מלכים א"),
  ("II Kings","מלכים ב"),
  ("Isaiah","ישעיהו"),
  ("Jeremiah","ירמיהו"),
  ("Ezekiel","יחזקאל"),
  ("Hosea","הושע"),
  ("Joel","יואל"),
  ("Amos","עמוס"),
  ("Obadiah","עובדיה"),
  ("Jonah","יונה"),
  ("Micah","מיכה"),
  ("Nahum","נחום"),
  ("Habakkuk","חבקוק"),
  ("Zephaniah","צפניה"),
  ("Haggai","חגי"),
  ("Zechariah","זכריה"),
  ("Malachi","מלאכי"),
  ("Psalms","תהילים"),
  ("Proverbs","משלי"),
  ("Job","איוב"),
  ("Song of Songs","שיר השירים"),
  ("Ruth","רות"),
  ("Lamentations","איכה"),
  ("Ecclesiastes","קהלת"),
  ("Esther","אסתר"),
  ("Daniel","דניאל"),
  ("Ezra","עזרא"),
  ("Nehemiah","נחמיה"),
  ("I Chronicles","דברי הימים א"),
  ("II Chronicles","דברי הימים ב")
]

DATA = Path(__file__).parent / "data"
DATA.mkdir(exist_ok=True)

TAGS = re.compile(r"<[^>]+>")
THIN_SPACES = re.compile(r"[   ​﻿]")


def clean(s):
    """Strip tags, decode HTML entities, normalize odd whitespace."""
    s = html.unescape(TAGS.sub("", s))
    return THIN_SPACES.sub(" ", s).strip()


def fetch_json(url, cache_name):
    """Fetch URL with a local file cache so re-runs are free."""
    cache = DATA / cache_name
    if cache.exists():
        return json.loads(cache.read_text())
    req = urllib.request.Request(url, headers={"User-Agent": "rashi-search/1.0"})
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode("utf-8")
    cache.write_text(raw)
    return json.loads(raw)


def get_text(title, cache_name):
    """Whole-book Hebrew text via v3 API. Returns nested list."""
    url = ("https://www.sefaria.org/api/v3/texts/"
           + urllib.parse.quote(title) + "?version=hebrew")
    d = fetch_json(url, cache_name)
    return d["versions"][0]["text"]


def get_link_counts(book_en, n_chapters):
    """Sefaria links per Rashi segment -> {(perek, passuk, idx): count}.

    Used as a popularity signal for ranking ties.
    """
    counts = {}
    seg = re.compile(rf"^Rashi on {book_en} (\d+):(\d+):(\d+)")
    for c in range(1, n_chapters + 1):
        url = ("https://www.sefaria.org/api/links/"
               + urllib.parse.quote(f"Rashi on {book_en}") + f".{c}?with_text=0")
        try:
            links = fetch_json(url, f"links_{book_en}_{c}.json")
        except Exception as e:
            print(f"  links {book_en} {c} failed: {e}")
            continue
        for link in links:
            m = seg.match(link.get("anchorRef", ""))
            if m:
                key = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
                counts[key] = counts.get(key, 0) + 1
    return counts


def main():
    records = []
    for book_en, book_he in BOOKS:
        print(f"Fetching {book_en}...")
        rashi = get_text(f"Rashi on {book_en}", f"rashi_{book_en}.json")
        verses = get_text(book_en, f"text_{book_en}.json")
        link_counts = get_link_counts(book_en, len(rashi))

        for ci, chapter in enumerate(rashi):
            for vi, comments in enumerate(chapter):
                if not comments:
                    continue
                perek, passuk = ci + 1, vi + 1
                p = [perek, passuk]
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
                    records.append({
                        "b": book_en, "bh": book_he,
                        "p": p,
                        "c": perek, "v": passuk, "i": ri + 1,
                        "dh": dh,   # display forms, with nikud;
                        "t": body,  # the app normalizes for search
                        "vt": verse,
                        "lk": link_counts.get((perek, passuk, ri + 1), 0),
                    })
        print(f"  {sum(1 for r in records if r['b'] == book_en)} comments")

    out = DATA / "rashi.json"
    out.write_text(json.dumps(records, ensure_ascii=False,
                              separators=(",", ":")))
    print(f"Wrote {len(records)} records to {out} "
          f"({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
