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


def get_parshiyot(book):
    d = fetch_json("https://www.sefaria.org/api/index/" + book,
                   f"index_{book}.json")
    out = []
    for node in d["alts"]["Parasha"]["nodes"]:
        ref = node["wholeRef"]  # e.g. "Genesis 1:1-6:8"
        m = re.search(r"(\d+):(\d+)-(?:(\d+):)?(\d+)$", ref)
        start = (int(m.group(1)), int(m.group(2)))
        end_chap = int(m.group(3)) if m.group(3) else start[0]
        out.append({
            "en": node["title"],
            "he": node["heTitle"],
            "start": start,
            "end": (end_chap, int(m.group(4))),
        })
    return out


def parsha_for(parshiyot, perek, passuk):
    for p in parshiyot:
        if p["start"] <= (perek, passuk) <= p["end"]:
            return p
    return parshiyot[-1]


def main():
    records = []
    for book_en, book_he in BOOKS:
        print(f"Fetching {book_en}...")
        rashi = get_text(f"Rashi on {book_en}", f"rashi_{book_en}.json")
        verses = get_text(book_en, f"text_{book_en}.json")
        parshiyot = get_parshiyot(book_en)

        for ci, chapter in enumerate(rashi):
            for vi, comments in enumerate(chapter):
                if not comments:
                    continue
                perek, passuk = ci + 1, vi + 1
                p = parsha_for(parshiyot, perek, passuk)
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
                        "p": p["en"], "ph": p["he"],
                        "c": perek, "v": passuk, "i": ri + 1,
                        "dh": dh,   # display forms, with nikud;
                        "t": body,  # the app normalizes for search
                        "vt": verse,
                    })
        print(f"  {sum(1 for r in records if r['b'] == book_en)} comments")

    out = DATA / "rashi.json"
    out.write_text(json.dumps(records, ensure_ascii=False,
                              separators=(",", ":")))
    print(f"Wrote {len(records)} records to {out} "
          f"({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
