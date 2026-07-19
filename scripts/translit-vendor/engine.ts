// Transliteration engine — pipeline per transliteration-engine-spec.md:
// syllabify (havarotjs) → determine stress (stress.ts) → render (per-style tables).

import { Text } from "havarotjs";
import type { Syllable } from "havarotjs/syllable";
import type { Cluster } from "havarotjs/cluster";
import type { Word } from "havarotjs/word";
import { STYLE_MAP, STYLES } from "./styles.ts";
import { determineStress } from "./stress.ts";
import type {
  ConsonantName, RenderedSyllable, RenderedWord, StressRenderMode,
  StyleDef, SyllableMode, TransliterateOptions, TransliterateResult, VowelName,
} from "./types.ts";

export { STYLES, STYLE_MAP };

const DAGESH = "ּ";
const SIN_DOT = "ׂ";
const MAQAF = "־";
const GUTTURALS = new Set(["א", "ה", "ח", "ע"]);

const FINAL_TO_BASE: Record<string, ConsonantName> = {
  FINAL_KAF: "KAF", FINAL_MEM: "MEM", FINAL_NUN: "NUN",
  FINAL_PE: "PE", FINAL_TSADI: "TSADI",
};

const DIVIDER: Record<SyllableMode, string> = { none: "", hyphen: "-", dot: "·" };

/** Internal marker: a havarotjs syllable that renders as two output syllables. */
const SPLIT_MARK = "\u0001";

function consonantName(cluster: Cluster): ConsonantName | null {
  const raw = cluster.consonantNames[0];
  if (!raw) return null;
  if (raw in FINAL_TO_BASE) return FINAL_TO_BASE[raw];
  if (raw === "SHIN") {
    // Distinguish shin/sin by the dot; bare shin defaults to "sh".
    if (cluster.text.includes(SIN_DOT)) return "SIN";
    return "SHIN";
  }
  return raw as ConsonantName;
}

function consonantLatin(style: StyleDef, name: ConsonantName, hasDagesh: boolean): string {
  const entry = style.consonants[name];
  if (typeof entry === "string") return entry;
  return hasDagesh ? entry.dagesh : entry.plain;
}

function renderSyllable(syl: Syllable, style: StyleDef, isWordInitial: boolean): string {
  let out = "";
  const clusters = syl.clusters.filter((c) => !c.isPunctuation && !c.isNotHebrew);

  for (const cluster of clusters) {
    // Shureq: vav functioning as the vowel "u".
    if (cluster.isShureq) {
      out += style.vowels.SHUREQ;
      if (style.longVowelMark) out += style.longVowelMark;
      continue;
    }
    // Mater lectionis: vav/yod are silent carriers, but final mater he still
    // sounds as "h" (be-ra-chah, mal-kah — spec §2 evidence).
    if (cluster.isMater) {
      if (cluster.consonants[0] === "ה") out += consonantLatin(style, "HE", false);
      continue;
    }

    const name = consonantName(cluster);
    if (!name) continue;

    const hasDagesh = cluster.text.includes(DAGESH);
    let latin = consonantLatin(style, name, hasDagesh);
    const vowelName = cluster.vowelNames[0] as VowelName | undefined;
    const isGuttural = GUTTURALS.has(cluster.consonants[0] ?? "");

    // Silent-mapped guttural opening a non-initial syllable is marked with an
    // apostrophe (evidence: kol-ha'am — spec §3 table).
    if (latin === "" && isGuttural && !isWordInitial && cluster === clusters[0] && vowelName) {
      latin = "'";
    }

    // Furtive patach: word-final ח/ע — vowel sounds BEFORE the consonant (ruach).
    const isFurtive =
      vowelName === "PATAH" &&
      (cluster.consonants[0] === "ח" || cluster.consonants[0] === "ע") &&
      syl.isFinal &&
      cluster === clusters[clusters.length - 1] &&
      clusters.length > 1;

    let piece = latin;

    if (isFurtive) {
      piece = style.vowels.PATAH + latin;
    } else if (cluster.hasSheva) {
      const idx = clusters.indexOf(cluster);
      const isVocal = syl.vowelNames[0] === "SHEVA" && cluster === clusters[0];
      // Sheva chain after a long vowel: first of the pair is vocal, e.g.
      // וַתֵּשְׁתְּ → vat-te-shet (spec §2). Short-vowel syllables (אָכַלְתְּ →
      // a-chalt) keep both silent.
      const vocalBeforeFinalSheva =
        !isVocal &&
        clusters[idx + 1]?.hasSheva === true &&
        clusters.slice(0, idx).some((c) => c.hasLongVowel);
      if (isVocal) {
        piece += style.vocalSheva;
      } else if (vocalBeforeFinalSheva) {
        piece = SPLIT_MARK + piece + style.vocalSheva;
      } else if (isGuttural) {
        piece += "'"; // silent sheva under a guttural (spec §2: ya'-kov)
      }
    } else if (vowelName && vowelName !== "SHEVA") {
      let v = style.vowels[vowelName] ?? "";
      if (style.longVowelMark && cluster.hasLongVowel) v += style.longVowelMark;
      piece += v;
    }

    out += piece;
  }
  return out;
}

/** Gemination check via havarotjs: coda vs codaWithGemination (spec §1). */
function geminatedOnsetLatin(syl: Syllable, next: Syllable | undefined, style: StyleDef): string {
  if (!next || syl.codaWithGemination === syl.coda) return "";
  const onset = next.clusters.find((c) => c.consonantNames.length > 0 && !c.isMater);
  if (!onset) return "";
  const name = consonantName(onset);
  if (!name) return "";
  // Geminated consonant doubles its dagesh (plosive) form: גַּנִּים → Gannim.
  return consonantLatin(style, name, true);
}

// ---------------------------------------------------------------------------
// Stress rendering (spec §5)

const ACUTE_PRECOMPOSED: Record<string, string> = {
  a: "á", e: "é", i: "í", o: "ó", u: "ú",
  A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú",
};
const CYRILLIC_VOWELS = "аеиоуэюяё";

function addAcute(text: string, mode: "precomposed" | "combining"): string {
  // Accent the LAST vowel letter of the syllable.
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (mode === "precomposed" && ACUTE_PRECOMPOSED[ch]) {
      return text.slice(0, i) + ACUTE_PRECOMPOSED[ch] + text.slice(i + 1);
    }
    if (mode === "combining" && CYRILLIC_VOWELS.includes(ch.toLowerCase())) {
      return text.slice(0, i + 1) + "́" + text.slice(i + 1);
    }
  }
  return text;
}

function applyStress(
  syl: RenderedSyllable,
  mode: StressRenderMode,
  style: StyleDef,
  html: boolean,
): string {
  const t = syl.text;
  switch (mode) {
    case "ignore":
      return t;
    case "bold_all":
      return html ? `<strong>${t}</strong>` : t;
    case "bold_tag":
      return syl.stressed && html ? `<strong>${t}</strong>` : t;
    case "underline":
      return syl.stressed && html ? `<u>${t}</u>` : t;
    case "capitalize":
      return syl.stressed ? t.toUpperCase() : t;
    case "diacritic_acute":
      return syl.stressed ? addAcute(t, style.acute ?? "precomposed") : t;
    case "ipa_stress_symbol":
      return syl.stressed ? `ˈ${t}` : t;
    case "auto_economical":
      // Mark only when stress deviates from the milra default. The source
      // engine sometimes emits this tag unclosed (spec §7) — ours never does.
      return syl.stressed && syl.nonDefaultStress && html ? `<strong>${t}</strong>` : t;
  }
}

/**
 * Defensive sanitizer for the documented unclosed-<strong> class of bugs:
 * balances <strong>/<u>/<em> tags and strips any other tag. Our own renderer
 * is well-formed by construction; this guards any externally sourced HTML.
 */
export function sanitizeStressHtml(html: string): string {
  const allowed = new Set(["strong", "u", "em"]);
  const stack: string[] = [];
  let out = "";
  const re = /<\/?([a-zA-Z]+)[^>]*>|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[0][0] !== "<") {
      out += m[0];
    } else if (m[1] && allowed.has(m[1].toLowerCase())) {
      const tag = m[1].toLowerCase();
      if (m[0][1] === "/") {
        if (stack[stack.length - 1] === tag) {
          stack.pop();
          out += `</${tag}>`;
        } // stray closer (the 140_ipa bug): drop it
      } else {
        stack.push(tag);
        out += `<${tag}>`;
      }
    } // disallowed tag: drop
  }
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}

// ---------------------------------------------------------------------------
// Main entry point

/** Escape user-visible text for the HTML variant. */
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function renderWord(word: Word, style: StyleDef): RenderedWord {
  const syllables = word.syllables;
  const stressIdx = determineStress(word);
  const rendered: RenderedSyllable[] = [];

  for (let i = 0; i < syllables.length; i++) {
    const syl = syllables[i];
    let text =
      renderSyllable(syl, style, i === 0) + geminatedOnsetLatin(syl, syllables[i + 1], style);
    if (style.uppercase) text = text.toUpperCase();
    const nonDefaultStress = stressIdx !== syllables.length - 1;
    // A syllable containing a SPLIT_MARK renders as two output syllables
    // (vat-te-shet); stress stays on the first part.
    const parts = text.split(SPLIT_MARK);
    parts.forEach((part, j) => {
      if (part === "") return;
      rendered.push({
        text: part,
        stressed: i === stressIdx && j === 0,
        nonDefaultStress,
      });
    });
  }

  return { syllables: rendered, maqafNext: word.text.includes(MAQAF) };
}

/** Letter-mode rendering (310_braille): direct cluster→cell mapping, no phonetics. */
function renderWordLetterMode(word: Word, style: StyleDef): RenderedWord {
  let out = "";
  for (const cluster of word.clusters) {
    if (cluster.isPunctuation || cluster.isNotHebrew) continue;
    if (cluster.isShureq) {
      out += style.vowels.SHUREQ;
      continue;
    }
    // Holam male: the vowel cell was already emitted with the preceding
    // cluster's holam; the mater vav itself is dropped (שָׁלוֹם → %<LOM).
    if (cluster.isMater) continue;
    const name = consonantName(cluster);
    if (name) out += consonantLatin(style, name, false);
    const vowelName = cluster.vowelNames[0] as VowelName | undefined;
    if (vowelName) out += style.vowels[vowelName] ?? "";
  }
  return {
    syllables: [{ text: out, stressed: false, nonDefaultStress: false }],
    maqafNext: word.text.includes(MAQAF),
  };
}

export function transliterate(
  hebrew: string,
  options: TransliterateOptions,
): TransliterateResult {
  const style = STYLE_MAP[options.style];
  if (!style) throw new Error(`Unknown style: ${options.style}`);
  const syllableMode = options.syllableMode ?? "hyphen";
  const accentMode = options.accentMode ?? "auto";
  const stressMode = style.stressRender[accentMode];

  // longVowels: false keeps sheva after qamats gadol silent (מָלְכוּ → mal-chu,
  // avoiding the source engine's "malechu" schwa-insertion glitch, spec §7).
  const text = new Text(hebrew.normalize("NFC"), {
    qametsQatan: true,
    longVowels: false,
    allowNoNiqqud: true, // unpointed input degrades to consonants instead of throwing
  });
  const words: RenderedWord[] = [];

  // Strictly word-at-a-time — immune to the batch stress-bleed bug (spec §7).
  for (const word of text.words) {
    if (word.isNotHebrew) {
      words.push({
        syllables: [{ text: word.text, stressed: false, nonDefaultStress: false }],
        maqafNext: false,
      });
      continue;
    }
    words.push(
      style.letterMode ? renderWordLetterMode(word, style) : renderWord(word, style),
    );
  }

  const divider = DIVIDER[syllableMode];
  const joinWord = (w: RenderedWord, html: boolean) =>
    w.syllables
      .map((s) =>
        html
          ? applyStress({ ...s, text: escapeHtml(s.text) }, stressMode, style, true)
          : applyStress(s, stressMode, style, false),
      )
      .join(divider);

  const joinAll = (html: boolean) => {
    let out = "";
    words.forEach((w, i) => {
      out += joinWord(w, html);
      if (i < words.length - 1) out += w.maqafNext ? "-" : " ";
    });
    return out;
  };

  return { text: joinAll(false), html: sanitizeStressHtml(joinAll(true)), words };
}
