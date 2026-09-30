// Shared Hebrew text utilities for every corpus. Pure functions, no DOM.
"use strict";

export const NIKUD_RE = /[֑-ֽֿ-ׇ]/g;   // taamim+nikud, keep maqaf

export function normalize(s) {
  return (s || "").replace(/־/g, " ")
    .replace(NIKUD_RE, "")
    .replace(/[״"׳'.,:;!?()\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
// ktiv-insensitive skeleton: drop ו/י so מוקדם matches מֻקְדָּם
export function skel(s) {
  return s.replace(/[וי]/g, "").replace(/\s+/g, " ").trim();
}
// normalize but keep a map from normalized index -> display index
export function normalizeWithMap(s) {
  let out = "", map = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i];
    if (ch === "־") ch = " ";
    if (/[֑-ֽֿ-ׇ]/.test(ch)) continue;
    if (/[״"׳'.,:;!?()\[\]{}]/.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      out += " "; map.push(i); lastSpace = true;
    } else {
      out += ch; map.push(i); lastSpace = false;
    }
  }
  return { norm: out, map };
}

const GEM = {"א":1,"ב":2,"ג":3,"ד":4,"ה":5,"ו":6,"ז":7,"ח":8,"ט":9,"י":10,
  "כ":20,"ך":20,"ל":30,"מ":40,"ם":40,"נ":50,"ן":50,"ס":60,"ע":70,"פ":80,"ף":80,
  "צ":90,"ץ":90,"ק":100,"ר":200,"ש":300,"ת":400};
export function parseHebNum(tok) {
  tok = tok.replace(/[״"׳']/g, "");
  if (/^\d+$/.test(tok)) return parseInt(tok, 10);
  if (!tok || tok.length > 3) return null;
  let sum = 0, prev = Infinity;
  for (const ch of tok) {
    const v = GEM[ch];
    if (!v || v > prev) return null;   // must be non-increasing (e.g. קכג)
    sum += v; prev = v;
  }
  return sum >= 1 && sum <= 999 ? sum : null;
}
// NB: nach.html used to map 90 -> "פ" (a typo; chumash/bavli had "צ"), so
// Psalms 90+ showed wrong letters there. The shared version is the correct one.
export function toHebNum(n) {
  const H = [[400,"ת"],[300,"ש"],[200,"ר"],[100,"ק"],[90,"צ"],[80,"פ"],[70,"ע"],
    [60,"ס"],[50,"נ"],[40,"מ"],[30,"ל"],[20,"כ"],[10,"י"],[9,"ט"],[8,"ח"],[7,"ז"],
    [6,"ו"],[5,"ה"],[4,"ד"],[3,"ג"],[2,"ב"],[1,"א"]];
  let out = "";
  for (const [v, ch] of H) {
    while (n >= v) { out += ch; n -= v; }
  }
  return out.replace(/יה$/, "טו").replace(/יו$/, "טז");
}

export function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlight(display, toks) {
  if (!toks.length) return esc(display);
  const { norm, map } = normalizeWithMap(display);
  const spans = [];
  for (const t of toks) {
    if (!t) continue;
    let idx = norm.indexOf(t);
    while (idx !== -1) {
      const from = map[idx];
      const to = idx + t.length - 1 < map.length ? map[idx + t.length - 1] + 1 : display.length;
      spans.push([from, to]);
      idx = norm.indexOf(t, idx + 1);
    }
  }
  if (!spans.length) return esc(display);
  spans.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [f, t] of spans) {
    if (f < pos) continue;
    out += esc(display.slice(pos, f)) + "<mark>" + esc(display.slice(f, t)) + "</mark>";
    pos = t;
  }
  return out + esc(display.slice(pos));
}

// word-prefix match; returns index in hay or -1
export function wordMatch(hay, tok) {
  if (!tok) return -1;
  let i = hay.indexOf(tok);
  while (i !== -1) {
    if (i === 0 || hay[i - 1] === " ") return i;
    i = hay.indexOf(tok, i + 1);
  }
  return -1;
}

export function popBoost(r) {
  return Math.min(50, Math.log2(1 + (r.lk || 0)) * 3.5);
}
