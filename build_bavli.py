#!/usr/bin/env python3
"""Build the Rashi-on-Bavli search index shards from Sefaria.

Downloads Rashi on each Talmud Bavli tractate + the Gemara text,
and emits data/bavli/{Tractate}.json + data/bavli/manifest.json.
"""
import html
import json
import re
import ssl
import urllib.request
import urllib.parse
from pathlib import Path

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = None

TRACTATES = [
    ("Berakhot", "ברכות"),
    ("Shabbat", "שבת"),
    ("Eruvin", "עירובין"),
    ("Pesachim", "פסחים"),
    ("Rosh Hashanah", "ראש השנה"),
    ("Yoma", "יומא"),
    ("Sukkah", "סוכה"),
    ("Beitzah", "ביצה"),
    ("Taanit", "תענית"),
    ("Megillah", "מגילה"),
    ("Moed Katan", "מועד קטן"),
    ("Chagigah", "חגיגה"),
    ("Yevamot", "יבמות"),
    ("Ketubot", "כתובות"),
    ("Nedarim", "נדרים"),
    ("Nazir", "נזיר"),
    ("Sotah", "סוטה"),
    ("Gittin", "גיטין"),
    ("Kiddushin", "קידושין"),
    ("Bava Kamma", "בבא קמא"),
    ("Bava Metzia", "בבא מציעא"),
    ("Bava Batra", "בבא בתרא"),
    ("Sanhedrin", "סנהדרין"),
    ("Makkot", "מכות"),
    ("Shevuot", "שבועות"),
    ("Avodah Zarah", "עבודה זרה"),
    ("Horayot", "הוריות"),
    ("Zevachim", "זבחים"),
    ("Menachot", "מנחות"),
    ("Chullin", "חולין"),
    ("Bekhorot", "בכורות"),
    ("Arakhin", "ערכין"),
    ("Temurah", "תמורה"),
    ("Keritot", "כריתות"),
    ("Meilah", "מעילה"),
    ("Tamid", "תמיד"),
    ("Niddah", "נדה"),
]

NOTES = {
    "Nedarim": ("הפירוש המיוחס לרש\"י — כנראה אינו מרש\"י עצמו", None),
    "Nazir": ("הפירוש המיוחס לרש\"י — כנראה אינו מרש\"י עצמו", None),
    "Bava Batra": ("מדף כט ע\"א ואילך הפירוש הוא של רשב\"ם", [29, 1]),
    "Makkot": ("מדף יט ע\"ב ואילך הפירוש הוא של ריב\"ן", [19, 2]),
}

DATA = Path(__file__).parent / "data"
DATA.mkdir(exist_ok=True)
BAVLI = DATA / "bavli"
BAVLI.mkdir(exist_ok=True)

TAGS = re.compile(r"<[^>]+>")
THIN_SPACES = re.compile(r"[   ​﻿]")
FOOTNOTE_MARKER = re.compile(r"<sup class=\"footnote-marker\">.*?</sup>", re.S)
FOOTNOTE_ITALIC = re.compile(r"<i class=\"footnote\">.*?</i>", re.S)


def clean(s):
    """Strip footnotes+tags, decode HTML entities, normalize odd whitespace."""
    s = FOOTNOTE_MARKER.sub("", s)
    s = FOOTNOTE_ITALIC.sub("", s)
    s = html.unescape(TAGS.sub("", s))
    return THIN_SPACES.sub(" ", s).strip()


def fetch_json(url, cache_name):
    """Fetch URL with a local file cache so re-runs are free."""
    cache = BAVLI / cache_name
    if cache.exists():
        return json.loads(cache.read_text())
    req = urllib.request.Request(url, headers={"User-Agent": "rashi-search/1.0"})
    with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r:
        raw = r.read().decode("utf-8")
    cache.write_text(raw)
    return json.loads(raw)


def get_text(title, cache_name):
    """Whole-book Hebrew text via v3 API. Returns nested list."""
    url = ("https://www.sefaria.org/api/v3/texts/"
           + urllib.parse.quote(title) + "?version=hebrew")
    d = fetch_json(url, cache_name)
    return d["versions"][0]["text"]


def daf_amud(i):
    """0-based daf array index -> (daf number, amud 1/2)."""
    return i // 2 + 1, 1 if i % 2 == 0 else 2


def comments_to_records(commentary, gemara, en, he, cont=False):
    """Convert a Daf->Line->Comment nested list into output records."""
    records = []
    for di, daf_lines in enumerate(commentary):
        daf, amud = daf_amud(di)
        for li, comments in enumerate(daf_lines):
            if not comments:
                continue
            line_no = li + 1
            try:
                vt_raw = gemara[di][li]
            except IndexError:
                vt_raw = ""
            vt = clean(vt_raw) if vt_raw else ""
            for ci, comment in enumerate(comments):
                if not comment:
                    continue
                m = re.match(r"\s*<b>(.*?)</b>", comment)
                if m:
                    dh = clean(m.group(1)).strip(" .:־")
                    body = clean(comment[m.end():].strip())
                else:
                    # Vilna edition (no <b> tags): dh is delimited by
                    # " – " (en dash) or, as a fallback, " - " (hyphen).
                    plain = clean(comment)
                    dm = re.search(r"\s[–-]\s", plain)
                    if dm:
                        dh = plain[:dm.start()].strip(" .:־")
                        body = plain[dm.end():].strip()
                    else:
                        dh = ""
                        body = plain
                if not body:
                    continue
                rec = {
                    "b": en, "bh": he,
                    "d": daf, "a": amud, "l": line_no, "i": ci + 1,
                    "dh": dh,
                    "t": body,
                    "vt": vt,
                    "lk": 0,
                }
                if cont:
                    rec["cx"] = 1  # from the continuation text (e.g. Rashbam)
                records.append(rec)
    return records


# Tractates whose Rashi/Rashbam-equivalent commentary is split across two
# Sefaria texts (the second continues where the first leaves off, per the
# NOTES/noteFrom hint above). Records from both are merged into one shard.
CONTINUATIONS = {
    "Bava Batra": "Rashbam on Bava Batra",
}


def build_tractate(en, he):
    safe = en.replace(" ", "_")
    rashi = get_text(f"Rashi on {en}", f"rashi_bavli_{safe}.json")
    gemara = get_text(en, f"text_bavli_{safe}.json")

    records = comments_to_records(rashi, gemara, en, he)

    cont_title = CONTINUATIONS.get(en)
    if cont_title:
        cont_safe = cont_title.replace(" ", "_")
        cont = get_text(cont_title, f"rashi_bavli_{cont_safe}.json")
        records += comments_to_records(cont, gemara, en, he, cont=True)
        records.sort(key=lambda r: (r["d"], r["a"], r["l"], r["i"]))

    return records


def main():
    manifest = []
    skipped = []
    total = 0
    for en, he in TRACTATES:
        print(f"Fetching {en}...")
        try:
            records = build_tractate(en, he)
        except Exception as e:
            print(f"  SKIPPED {en}: {e}")
            skipped.append((en, str(e)))
            continue

        fname = en.replace(" ", "_") + ".json"
        out = BAVLI / fname
        out.write_text(json.dumps(records, ensure_ascii=False,
                                   separators=(",", ":")))
        note, note_from = NOTES.get(en, (None, None))
        manifest.append({
            "en": en, "he": he, "file": fname,
            "count": len(records),
            "note": note, "noteFrom": note_from,
        })
        total += len(records)
        print(f"  {len(records)} records -> {out} "
              f"({out.stat().st_size / 1e6:.2f} MB)")

    (BAVLI / "manifest.json").write_text(
        json.dumps({"tractates": manifest}, ensure_ascii=False,
                   separators=(",", ":")))
    print(f"\nTotal: {total} records across {len(manifest)} tractates.")
    if skipped:
        print("Skipped tractates:")
        for en, err in skipped:
            print(f"  {en}: {err}")


if __name__ == "__main__":
    main()
