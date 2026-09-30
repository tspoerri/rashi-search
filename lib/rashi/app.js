// Unified Rashi search UI: one page, corpus (Torah / Nach / Bavli) selectable.
// Search, indexing and rendering are shared; each corpus contributes a config
// (lib/rashi/corpora/*.js): book lists, shard layout, query grammar, references.
"use strict";
import { ChipusIndex } from "../chipus/src/index.js";
import { CorpusStore } from "./store.js";
import { CORPUS_IDS, CORPUS_FACTORIES, PAGE_TO_CORPUS } from "./corpora/index.js";
import { highlight, esc } from "./text.js";

const $ = (id) => document.getElementById(id);

const KBD_ROWS = [
  ["ק","ר","א","ט","ו","ן","ם","פ"],
  ["ש","ד","ג","כ","ע","י","ח","ל","ך","ף"],
  ["ז","ס","ב","ה","נ","מ","צ","ת","ץ"],
];

// Which corpus this page shows: legacy wrapper page name, then ?c=, then Torah.
export function corpusFromLocation(loc = location) {
  const page = loc.pathname.split("/").pop();
  if (PAGE_TO_CORPUS[page]) return PAGE_TO_CORPUS[page];
  const c = new URLSearchParams(loc.search).get("c");
  return CORPUS_IDS.includes(c) ? c : "torah";
}

export function start(initialId) {
  const cfgs = {}, stores = {};
  let active = null;          // active CorpusStore
  let mode = "smart";
  let searchSeq = 0;
  let currentToks = [];
  let lastInput = null;
  const deps = {
    ChipusIndex,
    fetchJson: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(url + " → HTTP " + res.status);
      return res.json();
    },
    yieldFn: () => new Promise((r) => setTimeout(r)),
    now: () => performance.now(),
  };

  document.getElementById("app").innerHTML =
    '<div class="wrap">' +
    '<header><h1 id="h1"></h1><span class="count" id="count">Loading…</span>' +
    '<nav class="corpora" id="corpora"></nav>' +
    '<nav class="tabs"><button id="tab-fields">Fields</button>' +
    '<button id="tab-smart" class="active">Smart search</button>' +
    '<span id="kbd-wrap"><button id="kbd-btn" title="Hebrew keyboard">⌨ עברית</button><div id="kbd"></div></span></nav>' +
    '</header>' +
    '<div id="controls"><div class="fields" id="fieldbar"></div>' +
    '<div id="smartbar"><input id="f-smart" dir="auto" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false">' +
    '<div class="hint" id="hint"></div></div></div>' +
    '<div id="loadnote" hidden></div>' +
    '<div id="results"><div id="empty">Type to search.</div></div></div>';

  const getCfg = (id) => (cfgs[id] ||= CORPUS_FACTORIES[id]());
  const setCount = (t) => { $("count").textContent = t; };
  function setNote(text) { $("loadnote").textContent = text || ""; $("loadnote").hidden = !text; }
  const fieldEl = (id) => $("f-" + id);
  const get = (id) => (fieldEl(id) ? fieldEl(id).value : "");
  const set = (id, v) => { if (fieldEl(id)) fieldEl(id).value = v; };

  function readyCount(store) {
    const cfg = store.cfg, n = store.total.toLocaleString("en");
    if (store.fullLoaded) return n + " Rashis · all " + store.units.length + " " + cfg.unitNounPlural + " loaded";
    if (store.LOADED.size) {
      const names = store.units.filter((u) => store.LOADED.has(u.id)).map((u) => u.he).join(", ");
      return n + " Rashis · loaded: " + names;
    }
    return n + " Rashis · " + store.units.length + " " + cfg.unitNounPlural + " · name one to begin";
  }

  /* ---------- corpus switching + per-corpus chrome ---------- */
  function renderCorpusButtons() {
    $("corpora").innerHTML = CORPUS_IDS.map((id) =>
      '<button data-corpus="' + id + '"' + (active && active.cfg.id === id ? ' class="active"' : "") + ">" +
      esc(getCfg(id).he) + "</button>").join("");
  }
  function buildFields(cfg) {
    $("fieldbar").innerHTML = cfg.fields.map((f) => {
      const id = "f-" + f.id;
      let control;
      if (f.kind === "select") control = '<select id="' + id + '"></select>';
      else control = '<input id="' + id + '" dir="auto" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false"' +
        (f.kind === "datalist" ? ' list="dl-' + f.id + '"' : "") + ' placeholder="' + esc(f.ph || "") + '">' +
        (f.kind === "datalist" ? '<datalist id="dl-' + f.id + '"></datalist>' : "");
      return '<div class="field"><label for="' + id + '">' + esc(f.label) + "</label>" + control + "</div>";
    }).join("");
  }
  // (Re)fill select/datalist options from the corpus; keeps a still-valid selection.
  function fillFields() {
    const store = active, cfg = store.cfg;
    for (const f of cfg.fields) {
      if (f.kind === "text") continue;
      const opts = cfg.fieldOptions(f.id, store, get);
      if (f.kind === "select") {
        const sel = fieldEl(f.id), cur = sel.value;
        sel.length = 0;
        for (const o of opts) sel.add(new Option(o.l, o.v));
        sel.value = opts.some((o) => o.v === cur) ? cur : (opts[0] ? opts[0].v : "");
      } else {
        const dl = $("dl-" + f.id);
        dl.innerHTML = "";
        for (const o of opts) dl.appendChild(new Option(o.l, o.v));
      }
    }
  }
  function defaultInput() { return $(mode === "smart" ? "f-smart" : "f-dh"); }

  function activate(id, { fromClick = false } = {}) {
    const cfg = getCfg(id);
    const store = (stores[id] ||= new CorpusStore(cfg, deps));
    active = store;
    ++searchSeq;
    document.title = cfg.title;
    $("h1").textContent = cfg.h1;
    $("f-smart").placeholder = cfg.smartPlaceholder;
    $("f-smart").value = "";
    $("hint").textContent = cfg.hint;
    buildFields(cfg);
    renderCorpusButtons();
    $("results").innerHTML = '<div id="empty">Type to search.</div>';
    setNote("");
    lastInput = null;
    if (fromClick) {
      try { history.replaceState(null, "", cfg.url + location.hash); } catch (e) { /* file:// etc. */ }
    }
    if (!store.bootPromise) {
      store.bootPromise = (async () => {
        await store.init();
        if (cfg.eager) {
          await store.ensureAll((msg) => { if (active === store) setCount(msg); });
        }
      })().catch((e) => { store.bootError = e; });
    }
    setCount(store.ready ? readyCount(store) : "Loading…");
    store.bootPromise.then(() => {
      if (active !== store) return;
      if (store.bootError) {
        setCount("Failed to load");
        $("results").innerHTML = '<div id="empty">Could not load data: ' + esc(String(store.bootError.message || store.bootError)) + "</div>";
        return;
      }
      fillFields();
      runSearch();
    });
    if (fromClick) defaultInput().focus();
  }

  /* ---------- search flow ---------- */
  function currentQuery() {
    const cfg = active.cfg;
    return mode === "smart" ? cfg.smartParse($("f-smart").value) : cfg.queryFromFields(get, active);
  }
  function executeSearch(q) {
    const store = active;
    currentToks = (q.dh + " " + q.kw).split(" ").filter(Boolean);
    const t0 = performance.now();
    const hits = q._softHits || store.search(q);
    renderResults(hits, currentToks);
    return { hits, ms: performance.now() - t0 };
  }
  function renderPartial() {
    const q = currentQuery();
    if (q.ambigFamily || !active.cfg.hasCriteria(q)) return;
    const { hits } = executeSearch(q);
    setCount(hits.length + " results so far · " + active.DB.length.toLocaleString("en") + " Rashis loaded");
  }
  async function loadEverything() {
    const store = active, cfg = store.cfg;
    await store.ensureAll((msg) => { if (active === store) setCount(msg); }, (done, total) => {
      if (active !== store) return;
      setNote("Loading " + cfg.allLabel + " — " + done + "/" + total + " " + cfg.unitNounPlural + " · " +
        store.DB.length.toLocaleString("en") + " Rashis so far. Results update as they arrive.");
      renderPartial();
    });
    if (active !== store) return;
    setNote("");
    runSearch();
  }

  async function runSearch() {
    const store = active, cfg = store.cfg;
    const seq = ++searchSeq;
    if (!store.ready || (cfg.eager && !store.fullLoaded)) { setCount("Loading…"); return; }
    let q = currentQuery();
    if (q.ambigFamily) {
      $("results").innerHTML = cfg.ambigHtml(q);
      setCount("Ambiguous book name");
      return;
    }
    if (!cfg.hasCriteria(q)) {
      $("results").innerHTML = '<div id="empty">Type to search.</div>';
      setCount(readyCount(store));
      return;
    }
    // Lazy tier 1: pull in exactly the one shard this query names.
    const unit = cfg.unitToLoad(q);
    if (unit && !store.LOADED.has(unit)) {
      $("results").innerHTML = '<div id="empty">Loading…</div>';
      await store.ensureUnit(unit, (msg) => { if (seq === searchSeq && active === store) setCount(msg); });
      if (seq !== searchSeq || active !== store) return;   // a later run owns the UI
    }
    if (mode === "smart") q = store.resolveSoft(q);
    if (!unit && !cfg.eager && !store.fullLoaded) {
      if (store.loadingAll) { renderPartial(); return; }
      $("results").innerHTML = '<div id="empty">' + cfg.optInHtml(q, store) + "</div>";
      setCount(readyCount(store));
      return;
    }
    const { hits, ms } = executeSearch(q);
    setCount(hits.length + " results · " + ms.toFixed(1) + " ms" + (cfg.eager ? "" : " · " + readyCount(store)));
  }

  /* ---------- rendering ---------- */
  function renderResults(hits, toks) {
    const store = active, cfg = store.cfg, box = $("results");
    if (!hits.length) { box.innerHTML = '<div id="empty">No results.</div>'; return; }
    box.innerHTML = hits.map((h) => {
      const r = store.DB[h.i];
      const dh = r.dh ? highlight(r.dh, toks) : '<span style="color:var(--muted)">(אין ד"ה)</span>';
      return '<div class="hit" data-i="' + h.i + '">' +
        '<div class="sum"><span class="dh">' + dh + "</span> " +
        '<span class="ref">· ' + cfg.refHe(r) + cfg.refExtra(r) + "</span>" +
        '<div class="snip">' + highlight(r.t.slice(0, 220), toks) + "</div></div>" +
        '<div class="exp"></div></div>';
    }).join("");
  }
  function toggleHit(el) {
    const store = active, cfg = store.cfg, toks = currentToks;
    if (el.classList.contains("open")) { el.classList.remove("open"); return; }
    document.querySelectorAll(".hit.open").forEach((o) => o.classList.remove("open"));
    const r = store.DB[+el.dataset.i];
    const note = cfg.note(r);
    el.querySelector(".exp").innerHTML =
      '<div class="verse">' + esc(r.vt) + "</div>" +
      (r.dh ? '<div><span class="rashi-dh">' + highlight(r.dh, toks) + ".</span></div>" : "") +
      '<div class="rashi-text">' + highlight(r.t, toks) + "</div>" +
      (note ? '<div class="note">' + esc(note) + "</div>" : "") +
      '<div class="links"><a href="' + cfg.sefariaUrl(r) + '" target="_blank" rel="noopener">Open in Sefaria ↗</a></div>';
    el.classList.add("open");
  }

  /* ---------- wiring ---------- */
  let deb;
  const onInput = () => { clearTimeout(deb); deb = setTimeout(runSearch, 80); };
  $("controls").addEventListener("input", (e) => { if (e.target.matches("input")) onInput(); });
  $("controls").addEventListener("focusin", (e) => { if (e.target.matches("input")) lastInput = e.target; });
  $("controls").addEventListener("change", (e) => {
    if (!e.target.matches("select")) return;
    const cfg = active.cfg;
    if (cfg.onFieldChange) cfg.onFieldChange(e.target.id.slice(2), get, set);
    fillFields();
    runSearch();
  });
  $("corpora").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-corpus]");
    if (b && b.dataset.corpus !== active.cfg.id) activate(b.dataset.corpus, { fromClick: true });
  });
  $("results").addEventListener("click", (e) => {
    if (e.target.closest("a")) return;                                   // Sefaria link
    if (e.target.closest("#load-all")) { loadEverything(); return; }
    const ab = e.target.closest("button[data-book]");
    if (ab) {                                                           // ambiguous-book choice
      $("f-smart").value = active.cfg.applyAmbig($("f-smart").value, ab.dataset.book);
      runSearch(); $("f-smart").focus(); return;
    }
    const hit = e.target.closest(".hit");
    if (hit) toggleHit(hit);
  });
  function setMode(m) {
    mode = m;
    $("tab-fields").classList.toggle("active", m === "fields");
    $("tab-smart").classList.toggle("active", m === "smart");
    $("fieldbar").style.display = m === "fields" ? "flex" : "none";
    $("smartbar").style.display = m === "smart" ? "block" : "none";
    defaultInput().focus();
    runSearch();
  }
  $("tab-fields").addEventListener("click", () => setMode("fields"));
  $("tab-smart").addEventListener("click", () => setMode("smart"));

  // Hebrew on-screen keyboard
  const kbd = $("kbd");
  kbd.innerHTML = KBD_ROWS.map((row) =>
    '<div class="krow">' + row.map((ch) => '<button data-ch="' + ch + '">' + ch + "</button>").join("") + "</div>").join("") +
    '<div class="krow"><button data-ch=" " class="wide">space</button>' +
    '<button data-act="bs" class="wide">⌫</button><button data-act="clear" class="wide">clear</button></div>';
  kbd.addEventListener("mousedown", (e) => e.preventDefault());  // keep input focus
  kbd.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const el = lastInput || defaultInput();
    if (b.dataset.act === "clear") el.value = "";
    else if (b.dataset.act === "bs") {
      const p = el.selectionStart;
      if (p > 0) { el.value = el.value.slice(0, p - 1) + el.value.slice(el.selectionEnd); el.setSelectionRange(p - 1, p - 1); }
    } else {
      const p = el.selectionStart;
      el.value = el.value.slice(0, p) + b.dataset.ch + el.value.slice(el.selectionEnd);
      el.setSelectionRange(p + 1, p + 1);
    }
    el.focus();
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("kbd-btn").addEventListener("click", () => {
    kbd.classList.toggle("open");
    (lastInput || defaultInput()).focus();
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#kbd-wrap")) kbd.classList.remove("open"); });

  // Diagnostics hook (eval harness / measurements): per-corpus load + heap cost.
  const heap = () => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null);
  globalThis.rashiStats = (id) => {
    const s = id ? stores[id] : active;
    return s ? { corpus: s.cfg.id, ...s.stats(heap()) } : null;
  };

  activate(initialId || corpusFromLocation());
}
