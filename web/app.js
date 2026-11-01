/* Bailey Design Trials: interface.
   Plain JavaScript, no build step. Talks to server.py, or to the Python engine
   running in the browser (webapi.js) on the web version. */
"use strict";

const S = {
  meta: null, file: null, mix: null, an: null,
  tab: "trials", sel: null, sub: "blend",
  live: {},          // live prediction per trial id
  sugg: {},          // suggestions per trial id
  addedSlots: {},    // empty stockpile columns the user added this session
  chartBasis: "mass",
};
const SLOT_NAMES = { CA1: "Coarse 1", CA2: "Coarse 2", CA3: "Coarse 3", FA1: "Fine 1", FA2: "Fine 2", FA3: "Fine 3", F1: "Filler 1", F2: "Filler 2" };
const KIND_NAMES = { CA: "Coarse", FA: "Fine", F: "Filler" };
const SLOT_COLORS = { CA1: "#1F62B8", CA2: "#4C98E6", CA3: "#0D3D78", FA1: "#2B9A56", FA2: "#7AC46F", FA3: "#196B3B", F1: "#8E3FB3", F2: "#D65BB5" };
const slotColor = (s) => SLOT_COLORS[s] || "#666";
const C_CUR = "#FF5F05", C_PROP = "#13294B", C_OLD = "#A9AEB3", C_REF = "#7E848A";
const TYPE_KEYS = [["sma", "SMA"], ["cg", "Dense, coarse-graded"], ["fg", "Dense, fine-graded"], ["dense", "Dense, detect from Trial 1"]];
const NMAS_KEYS = ["37.5", "25.0", "19.0", "12.5", "9.5", "4.75"];
/* ---------------------------------------------------------------- utilities */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
const num = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let t = String(v).replace(/[\s\u00a0%]/g, "");
  if (!t || /^[-\u2013]$/.test(t)) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");   // 1,430 -> 1430
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");                // 2,705 decimal comma
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t)) return null;
  return parseFloat(t);
};
const isNumText = (v) => num(v) !== null;
const fmt = (v, d = 1) => (v === null || v === undefined || v === "" || !Number.isFinite(+v)) ? "-" : (+v).toFixed(d);
const sgn = (v, d = 2) => (v === null || v === undefined) ? "-" : ((v > 0 ? "+" : "") + (+v).toFixed(d));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600); }
async function api(path, body) {
  if (window.BDT_API) return window.BDT_API(path, body);   // browser version: Python runs in a web worker
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function getPath(o, path) { return path.reduce((a, k) => (a == null ? undefined : a[k]), o); }
function setPath(o, path, v) {
  let cur = o;
  path.slice(0, -1).forEach((k, i) => { if (cur[k] == null) cur[k] = typeof path[i + 1] === "number" ? [] : {}; cur = cur[k]; });
  cur[path[path.length - 1]] = v;
}

/* ---------------------------------------------------------------- mix helpers */
const allSieves = () => S.meta.sieves;
function topSieve() {
  const n = S.an?.nmas ?? num(S.mix?.settings?.nmas_override);
  let top = 25;
  if (n >= 37.5) top = 50; else if (n >= 25) top = 37.5;
  ["50.0", "37.5"].forEach((s) => {
    if (+s > top && Object.values(S.mix?.materials || {}).some((m) => num(m?.grad?.[s]) != null && num(m.grad[s]) < 100)) top = Math.max(top, +s);
  });
  return top;
}
const sieves = () => allSieves().filter((s) => +s <= topSieve() + 1e-9);
const lab = (s) => S.meta.labels[s] || [s + " mm", ""];
const matName = (slot) => (S.mix.materials[slot]?.name || "").trim() || SLOT_NAMES[slot];
const readySlots = () => S.meta.slots.filter((s) => { const m = S.mix.materials[s]; return m && (m.name || "").trim() && num(m.gsb); });
const usedSlots = () => S.meta.slots.filter((s) => (S.mix.materials[s]?.name || "").trim() || S.addedSlots[s]);
function normType(t) { t = String(t || "sma").toLowerCase(); return ["sma", "cg", "fg", "dense"].includes(t) ? t : "sma"; }
const mixType = () => S.an?.mix_type || (normType(S.mix.settings.mix_type) === "dense" ? "cg" : normType(S.mix.settings.mix_type));
const typeInfo = () => S.meta.types[mixType()];
function typeLabel() {
  const t = normType(S.mix.settings.mix_type);
  if (t === "dense") return S.an?.mix_type ? `${S.meta.types[S.an.mix_type].label} (detected)` : "Dense";
  return S.meta.types[t].label;
}
const uwKey = () => (mixType() === "sma" ? "ruw" : "luw");
const faUwKey = () => (mixType() === "sma" ? "luw" : "ruw");
const unitLabel = () => (S.an?.conv === 62.4 ? "lb/ft³" : "kg/m³");
const trialById = (id) => (S.mix.trials || []).find((t) => t.id === id);
const anTrial = (id) => (S.an?.trials || []).find((t) => t.id === id);
const testedAn = () => (S.an?.trials || []).filter((t) => t.volumetrics?.complete);
const isTested = (id) => !!anTrial(id)?.volumetrics?.complete;
const pctSum = (pct) => Object.values(pct || {}).reduce((x, y) => x + (num(y) || 0), 0);
function trialStatus(t) {
  if (isTested(t.id)) return "Tested";
  return Math.abs(pctSum(t.pct) - 100) <= 0.05 ? "Planned" : "Draft";
}
const sieveName = (v) => { const k = allSieves().find((x) => Math.abs(+x - +v) < 1e-9); return k ? `${lab(k)[0]} (${lab(k)[1]})` : `${v} mm`; };
function practicalUI(seed) {
  if (seed && !S.mix.search) S.mix.search = { min_pile_pct: 5, min_fillers: false, one_fine: true };
  const sp = S.mix.search || {};
  const mn = "min_pile_pct" in sp ? (num(sp.min_pile_pct) || 0) : 5;
  return { min_pile_pct: mn, min_fillers: !!sp.min_fillers, one_fine: sp.one_fine == null ? true : !!sp.one_fine, lock_small_fillers: sp.lock_small_fillers == null ? true : !!sp.lock_small_fillers };
}
function smallPiles(pct, locks) {
  const pr = practicalUI(), out = [];
  if (pr.min_pile_pct <= 0) return [out, 0];
  readySlots().forEach((s) => {
    const x = num(pct?.[s]) || 0;
    if (locks?.[s] || (S.meta.kind[s] === "F" && !pr.min_fillers)) return;
    if (x > 0.05 && x < pr.min_pile_pct - 1e-9) out.push([s, x]);
  });
  return [out, pr.min_pile_pct];
}
const tolVMA = () => num(S.mix.targets?.vma_tol) ?? 0.3;
/* number input used everywhere */
function numInput(path, opts = {}) {
  const v = getPath(S.mix, path);
  const inp = h("input", { type: "text", inputmode: "decimal", value: v ?? "", placeholder: opts.placeholder || "", "aria-label": opts.label || "", class: opts.cls || null, autocomplete: "off" });
  inp.dataset.path = JSON.stringify(path);
  inp.addEventListener("input", () => { edit(path, opts.text ? inp.value : num(inp.value)); });
  inp.addEventListener("keydown", gridKeys);
  if (opts.grid) { inp.dataset.r = opts.grid[0]; inp.dataset.c = opts.grid[1]; inp.dataset.g = opts.grid[2]; inp.addEventListener("paste", gridPaste); }
  return inp;
}
function textInput(path, opts = {}) { const i = numInput(path, { ...opts, text: true }); i.dataset.text = "1"; return i; }

/* arrow and enter keys move between grid cells like a spreadsheet */
function gridKeys(e) {
  const t = e.target; if (!t.dataset.g) return;
  const r = +t.dataset.r, c = +t.dataset.c, g = t.dataset.g;
  const move = { ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0] }[e.key];
  if (!move) return;
  const nxt = $(`input[data-g="${g}"][data-r="${r + move[0]}"][data-c="${c + move[1]}"]`);
  if (nxt) { e.preventDefault(); nxt.focus(); nxt.select(); }
}
/* paste a block from Excel into a grid */
function parseClip(text) {
  const rows = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n").map((l) => l.split("\t").map((c) => { c = c.trim(); return (c.length > 1 && c[0] === '"' && c[c.length - 1] === '"') ? c.slice(1, -1).replace(/""/g, '"') : c; }));
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.concat(Array(w - r.length).fill("")));
}
function gridPaste(e) {
  const text = (e.clipboardData || window.clipboardData).getData("text");
  if (!/[\t\n]/.test(text.replace(/\s+$/, ""))) return;   // single value: normal paste
  e.preventDefault();
  const t = e.target, g = t.dataset.g;
  let r0 = +t.dataset.r; const c0 = +t.dataset.c;
  let m = parseClip(text);
  const targetIsNum = !t.dataset.text;
  const cell = (r, c) => $(`input[data-g="${g}"][data-r="${r}"][data-c="${c}"]`);
  // a column of labels on the left (sieve sizes, stockpile names) is dropped
  if (targetIsNum && m[0].length > 1 && m.every((r) => !isNumText(r[0]))) m = m.map((r) => r.slice(1));
  // a header row of names goes into the name row if there is one, otherwise it is dropped
  let hdr = null;
  if (targetIsNum && m.length > 1 && m[0].every((v) => !isNumText(v)) && m[0].some((v) => v)) {
    if (r0 === 0 && cell(-1, c0)) hdr = m[0];
    m = m.slice(1);
  }
  // gradations listed fine to coarse are flipped; a trailing pan row is dropped
  if (g === "mat" && r0 >= 0 && r0 < 20) {
    const ns = sieves().length;
    if (m.length === ns + 1 && m[ns].every((v) => !v || num(v) === 0)) m = m.slice(0, ns);
    const col = m.map((r) => num(r[0])).filter((v) => v !== null);
    if (r0 === 0 && col.length >= 5 && col[0] < col[col.length - 1] && col.every((v, i) => i === 0 || v >= col[i - 1])) { m = m.slice().reverse(); toast("Values ran from fine to coarse, so they were flipped"); }
  }
  let n = 0; const hit = [];
  if (hdr) hdr.forEach((val, j) => { const el = cell(-1, c0 + j); if (!el || !val) return; el.value = val; setPath(S.mix, JSON.parse(el.dataset.path), val); hit.push(el); n++; });
  m.forEach((cols, i) => cols.forEach((val, j) => {
    let el = cell(r0 + i, c0 + j);
    if (!el && r0 + i >= 0) {   // jump over gaps between row groups
      const rowsBelow = $$(`input[data-g="${g}"][data-c="${c0 + j}"]`).map((x) => +x.dataset.r).filter((r) => r >= r0).sort((a, b) => a - b);
      const rr = rowsBelow[rowsBelow.indexOf(r0) + i]; el = rr !== undefined ? cell(rr, c0 + j) : null;
    }
    if (!el) return;
    const path = JSON.parse(el.dataset.path);
    const v = el.dataset.text ? val : num(val);
    el.value = el.dataset.text ? val : (v ?? "");
    setPath(S.mix, path, v);
    hit.push(el); n++;
  }));
  hit.forEach((el) => { el.classList.remove("pasted"); void el.offsetWidth; el.classList.add("pasted"); });
  changed();
  if (!toast._t || !$("#toast").classList.contains("on")) toast(`Pasted ${n} value${n === 1 ? "" : "s"}`);
}

/* copy a grid as tab-separated text, ready to paste into Excel */
async function copyGrid(tableSel) {
  const t = $(tableSel); if (!t) return;
  const lines = [...t.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => {
    const i = c.querySelector("input, select");
    let v;
    if (i) v = i.value;
    else { const k = c.cloneNode(true); k.querySelectorAll("small, button").forEach((x) => x.remove()); v = k.textContent; }
    v = String(v ?? "").replace(/\s+/g, " ").replace(/^-$/, "").trim();
    return v;
  }).join("\t"));
  const txt = lines.join("\r\n");
  try { await navigator.clipboard.writeText(txt); }
  catch (e) { const ta = h("textarea", { style: "position:fixed;left:-9999px" }); ta.value = txt; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  toast("Copied. Paste it into Excel.");
}

/* ---------------------------------------------------------------- edits, saving, analysis */
function edit(path, value) { setPath(S.mix, path, value); changed(); }
function changed(opts = {}) {
  S.mix.modified_local = Date.now();
  const ss = $("#savestate"); if (ss) ss.textContent = "Unsaved changes";
  clearTimeout(changed._s); changed._s = setTimeout(save, 1200);
  clearTimeout(changed._a); changed._a = setTimeout(analyze, opts.now ? 0 : 280);
}
async function saveNow() {
  clearTimeout(changed._s);
  await save();
  if (/^Saved/.test($("#savestate")?.textContent || "")) toast(S.meta.web ? "Saved in this browser" : `Saved to ${S.file}`);
}
async function save() {
  if (!S.mix) return;
  const ss = $("#savestate");
  try {
    if (ss) ss.textContent = "Saving…";
    const r = await api("/api/save", { file: S.file, mix: S.mix });
    S.file = r.file;
    if ($("#savestate")) $("#savestate").textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) { if ($("#savestate")) $("#savestate").textContent = "Not saved: " + e.message; }
}
async function analyze() {
  if (!S.mix) return;
  if (S.beforeAnalyze) S.beforeAnalyze();
  try { S.an = await api("/api/analyze", { mix: S.mix }); }
  catch (e) { S.an = null; console.error(e); }
  updateTopbar(); updateTabs();
  if (S.refresh) S.refresh();
}
async function analyzeQuiet() { try { S.an = await api("/api/analyze", { mix: S.mix }); } catch (e) { S.an = null; } }

/* ---------------------------------------------------------------- boot */
async function boot() {
  try { S.meta = await api("/api/meta"); }
  catch (e) {
    $("#app").innerHTML = "";
    $("#app").append(h("div", { class: "boot" }, h("h1", {}, "Could not start"), h("p", { class: "err" }, e.message), h("button", { class: "btn", onclick: () => location.reload() }, "Reload")));
    return;
  }
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (S.mix) saveNow(); } });
  home();
}

/* ---------------------------------------------------------------- top bar and tabs */
function updateTopbar() {
  const bar = $("#topbar"); if (!bar) return;
  bar.innerHTML = "";
  bar.append(h("button", { class: "brand", title: "All mixes", onclick: () => { if (S.mix) save(); home(); } },
    h("svg", { viewBox: "0 0 40 24", "aria-hidden": "true", html: '<path d="M2 21 C12 20 18 6 38 3"/><circle cx="15" cy="13.6" r="2.4"/>' }), h("span", {}, "Bailey Design Trials")));
  if (S.mix) {
    const tg = S.mix.targets || {};
    bar.append(h("span", { class: "sep" }), h("span", { class: "mixname" }, S.mix.name || "Untitled mix"),
      h("span", { class: "chips" },
        h("span", { class: "chip" }, `Target VMA ${num(tg.vma) != null ? fmt(tg.vma, 1) + "%" : "not set"}`),
        h("span", { class: "chip" }, `Target Va ${num(tg.va) != null ? fmt(tg.va, 1) + "%" : "not set"}`),
        h("span", { class: "chip" }, `${typeLabel()}${S.an?.nmas ? ", " + S.an.nmas + " mm" : ""}`)));
  }
  bar.append(h("span", { class: "spacer" }),
    h("button", { class: "toplink", onclick: () => { S.tab = "reference"; S.mix ? render() : renderReferencePage(); } }, "Bailey reference"));
  if (S.mix) bar.append(h("span", { class: "savestate", id: "savestate", "aria-live": "polite" }), h("button", { class: "btn small ghost", onclick: saveNow, title: "Save now (Ctrl+S)" }, "Save"));
}
const TABS = [["stockpiles", "Stockpiles"], ["criteria", "Criteria"], ["trials", "Trials"], ["compare", "Compare"]];
function tabNote(k) {
  if (k === "stockpiles") { const n = readySlots().length; return n ? `${n} in use` : "add yours"; }
  if (k === "criteria") return num(S.mix.targets?.vma) != null && num(S.mix.targets?.va) != null ? "targets set" : "set targets";
  if (k === "trials") {
    const T = S.mix.trials || [];
    if (!T.length) return "none yet";
    const t = T.filter((x) => isTested(x.id)).length;
    return `${t} tested${T.length - t ? `, ${T.length - t} planned` : ""}`;
  }
  return testedAn().length >= 2 ? "all trials, export" : "after 2 tests";
}
function tabsBar() {
  return h("nav", { class: "tabs", id: "tabs", "aria-label": "Design steps" }, TABS.map(([k, t], i) =>
    h("button", { class: "tab", "aria-current": S.tab === k ? "page" : null, onclick: () => { S.tab = k; render(); } },
      h("b", {}, i + 1), h("span", { class: "tt" }, t), h("span", { class: "tn", id: "tn-" + k }, tabNote(k)))));
}
function updateTabs() { TABS.forEach(([k]) => { const e = $("#tn-" + k); if (e) e.textContent = tabNote(k); }); }

function render() {
  S.refresh = null; S.beforeAnalyze = null;
  const app = $("#app"); app.innerHTML = "";
  updateTopbar();
  if (S.tab === "reference") { app.append(renderReference()); return; }
  app.append(tabsBar());
  const page = h("div", { class: "page" });
  app.append(page);
  ({ stockpiles: renderStockpiles, criteria: renderCriteria, trials: renderTrials, compare: renderCompare })[S.tab](page);
  if (S.refresh && !S.refresh.isRender) S.refresh();
}

/* ---------------------------------------------------------------- home */
function aboutBlock() {
  return h("footer", { class: "about" },
    h("p", {}, h("b", {}, "Bailey Design Trials. "), "Developed by Akash Bajaj, Illinois Center for Transportation, University of Illinois Urbana-Champaign. ",
      h("a", { href: "https://github.com/100akash/bailey-design-trials", target: "_blank", rel: "noopener" }, "Source code and instructions"), "."),
    h("p", {}, "References: Pine, W.J. ", h("i", {}, "The Bailey Method: Achieving Volumetrics and HMA Compactability"), ", course manual (2023 class), the source of the typical values. Vavrik, W.R., Huber, G., Pine, W.J., Carpenter, S.H., and Bailey, R. (2002). ",
      h("a", { href: "https://onlinepubs.trb.org/onlinepubs/circulars/ec044.pdf", target: "_blank", rel: "noopener" }, h("i", {}, "Bailey Method for Gradation Selection in HMA Mixture Design")),
      ". Transportation Research Circular E-C044, Transportation Research Board."),
    h("p", { class: "disclaimer" }, "Predictions use rules of thumb and are estimates only. Confirm every trial in the lab. This tool is not endorsed by the FAA or by any Bailey Method course."));
}
async function home() {
  S.mix = null; S.file = null; S.an = null; S.live = {}; S.sugg = {}; S.addedSlots = {}; S.refresh = null;
  updateTopbar();
  const list = await api("/api/mixes");
  const app = $("#app"); app.innerHTML = "";
  const nameIn = h("input", { type: "text", placeholder: "e.g. P-401 Mix A to SMA 12.5", "aria-label": "Mix name" });
  const typeSel = h("select", { "aria-label": "Mix type" }, TYPE_KEYS.map(([v, t]) => h("option", { value: v }, t)));
  const nmasSel = h("select", { "aria-label": "NMAS" }, h("option", { value: "" }, "Detect from Trial 1"), NMAS_KEYS.map((v) => h("option", { value: v, selected: v === "12.5" ? true : null }, `${v} mm`)));
  const create = async () => {
    const name = nameIn.value.trim();
    if (!name) { nameIn.focus(); toast("Give the mix a name first"); return; }
    const mix = newMix(await uniqueName(name), typeSel.value, num(nmasSel.value));
    const r = await api("/api/save", { mix });
    openMix(r.file, "stockpiles");
  };
  nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
  const steps = [["Stockpiles", "Gradations, Gsb, absorption, unit weights."], ["Criteria", "Mix type, VMA and air-void targets, limits."], ["Trials", "Test, review, plan the next one."], ["Compare", "All trials side by side, prediction accuracy."]];
  app.append(h("div", { class: "home" },
    h("section", {},
      h("h1", {}, "Design trials from the stockpiles you have"),
      h("p", { class: "lede" }, "For SMA and dense-graded mixes, 4.75 to 37.5 mm. Enter your stockpiles and targets once. Then each round goes: test a trial, review it, and let the tool plan the next blend and binder. It does the work of the Bailey volume blending and VMA estimation spreadsheets in one place."),
      h("ol", { class: "flow" }, steps.map(([t, d], i) => h("li", {}, h("b", {}, i + 1), h("span", { class: "t" }, t), h("span", { class: "d" }, d)))),
      h("h2", {}, "Your mixes"),
      h("div", { class: "ledger" },
        list.length ? list.map((m) => h("button", { class: "ledger-row", onclick: () => openMix(m.file) },
          h("span", {}, h("span", { class: "nm" }, m.name), h("span", { class: "sub" }, `${S.meta.web ? "" : m.file + ", "}edited ${new Date(m.modified * 1000).toLocaleString()}`)),
          h("span", { class: "count" }, `${m.materials ?? 0} stockpiles`),
          h("span", { class: "count" }, `${m.tested ?? 0} of ${m.trials ?? 0} trials tested`))) :
          h("div", { class: "empty" }, "No mixes yet. Start one on the right."))),
    h("aside", { class: "newmix" },
      h("h2", {}, "Start a new mix"),
      h("label", { class: "f" }, h("span", {}, "Mix name"), nameIn),
      h("div", { class: "fgrid two", style: "margin-top:12px" }, h("label", { class: "f" }, h("span", {}, "Mix type"), typeSel), h("label", { class: "f" }, h("span", {}, "NMAS"), nmasSel)),
      h("p", { class: "hint" }, "Typical Bailey values and rules of thumb for the type load automatically. You can change them in Criteria."),
      h("div", { class: "row", style: "margin-top:14px" }, h("button", { class: "btn primary", onclick: create }, "Create mix"),
        h("button", { class: "btn", onclick: openMixFile, title: "Open a .json mix file downloaded from this tool" }, "Open a mix file")),
      h("p", { class: "hint", style: "margin-top:16px" }, S.meta.web
        ? "Your mixes are saved in this browser only. Nothing is uploaded. Use Download mix file now and then to keep a copy or to share it."
        : `Mixes are saved as files in ${S.meta.mixes_folder}.`)),
    S.meta.web ? aboutBlock() : null));
  nameIn.focus();
}
function renderReferencePage() {
  const app = $("#app"); app.innerHTML = ""; updateTopbar();
  app.append(renderReference());
}
function newMix(name, type = "sma", nmas = null) {
  const materials = {};
  S.meta.slots.forEach((s) => (materials[s] = { name: "", grad: {}, gsb: null, abs: null, luw: null, ruw: null }));
  return {
    schema: 2, name, notes: "", created: new Date().toISOString(),
    settings: { mix_type: type, gb: 1.03, fiber_pct: type === "sma" ? 0.3 : null, fiber_type: type === "sma" ? "Cellulose" : "", units: "auto", nmas_override: nmas },
    targets: { vma: null, va: null, vfa: [null, null], pb_min: null, vcadrc: null, vma_tol: 0.3 },
    bailey_ranges: null, rot_override: {}, control_points: {}, materials, trials: [],
    search: { min_pile_pct: 5, min_fillers: false, one_fine: true, lock_small_fillers: true },
  };
}
async function openMix(file, tab) {
  const r = await api("/api/mix?file=" + encodeURIComponent(file));
  S.file = r.file; S.mix = r.mix; S.live = {}; S.sugg = {}; S.addedSlots = {};
  const m = S.mix;
  m.trials = m.trials || []; m.settings = m.settings || {}; m.targets = m.targets || {}; m.control_points = m.control_points || {};
  if (!m.settings.mix_type || m.settings.mix_type === "SMA") m.settings.mix_type = "sma";
  await analyzeQuiet();
  const last = m.trials[m.trials.length - 1];
  S.sel = last ? last.id : null;
  S.sub = last && isTested(last.id) ? "results" : "blend";
  S.tab = tab || (readySlots().length < 2 ? "stockpiles" : "trials");
  render();
}
function downloadMix() {
  if (!S.mix) return;
  const blob = new Blob([JSON.stringify(S.mix, null, 1)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: (S.file || (S.mix.name || "mix") + ".json") });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  S.mix.last_download = new Date().toISOString(); changed();
}
async function deleteMix() {
  if (!S.mix || !confirm(`Delete "${S.mix.name}"? ${S.meta.web ? "Download it first if you may want it back." : "A copy is kept in the mixes/_history folder."}`)) return;
  clearTimeout(changed._s);
  try { await api("/api/delete", { file: S.file }); toast("Mix deleted"); home(); } catch (e) { toast(e.message); }
}
async function uniqueName(name) {
  const used = new Set((await api("/api/mixes")).map((m) => m.name));
  let n = name, i = 2;
  while (used.has(n)) n = `${name} (${i++})`;
  return n;
}
function openMixFile() {
  const inp = h("input", { type: "file", accept: ".json,application/json", style: "display:none" });
  inp.addEventListener("change", async () => {
    const f = inp.files[0]; inp.remove(); if (!f) return;
    try {
      const mix = JSON.parse(await f.text());
      if (!mix || typeof mix !== "object" || !mix.materials) throw new Error("This file is not a mix from this tool.");
      mix.name = await uniqueName(mix.name || f.name.replace(/\.json$/i, ""));
      mix.trials = mix.trials || []; mix.control_points = mix.control_points || {};
      const r = await api("/api/save", { mix });
      toast(`Opened ${mix.name}`); openMix(r.file);
    } catch (e) { toast("Could not open the file. " + e.message); }
  });
  document.body.append(inp); inp.click();
}

/* ---------------------------------------------------------------- 1 Stockpiles */
function renderStockpiles(page) {
  if (!usedSlots().length) ["CA1", "CA2", "FA1", "F1"].forEach((s) => (S.addedSlots[s] = true));
  const slots = usedSlots();
  const main = h("section", { class: "main" }), side = h("section", { class: "below" });
  page.append(main, side);
  const t = mixType();
  main.append(h("div", { class: "head" },
    h("div", {}, h("h1", {}, "Stockpiles"),
      h("p", { class: "intro" }, `The aggregates you have to work with. Washed gradations as % passing. Every coarse and fine stockpile needs both LUW and RUW. Fillers need only gradation and Gsb.`)),
    h("div", { class: "row" }, h("button", { class: "btn", onclick: pasteTableDialog }, "Paste from Excel"), h("button", { class: "btn", onclick: importDialog }, "Copy from another mix"))));
  const addMenu = h("div", { class: "addcol" },
    h("span", { class: "lbl" }, "Add stockpile"),
    ["CA", "FA", "F"].map((k) => {
      const free = S.meta.slots.find((s) => S.meta.kind[s] === k && !slots.includes(s));
      return h("button", { class: "btn link", disabled: free ? null : true, onclick: () => { S.addedSlots[free] = true; render(); } }, KIND_NAMES[k].toLowerCase());
    }));
  const head = h("tr", {}, h("th", { class: "rowh" }, "Sieve"),
    slots.map((s, c) => h("th", { class: "pilehead", style: `--k:${slotColor(s)}` },
      h("span", { class: "kind" }, SLOT_NAMES[s],
        h("button", { class: "x", title: "Remove this stockpile", "aria-label": `Remove ${matName(s)}`, onclick: () => removePile(s) }, "×")),
      textInput(["materials", s, "name"], { placeholder: "Name", label: SLOT_NAMES[s] + " name", grid: [-1, c, "mat"], cls: "pname" }))),
    h("th", { class: "addhead" }, addMenu));
  const body = h("tbody", {});
  sieves().forEach((sv, r) => body.append(h("tr", {}, h("th", { class: "rowh" }, lab(sv)[0], h("small", {}, lab(sv)[1])),
    slots.map((s, c) => h("td", {}, numInput(["materials", s, "grad", sv], { grid: [r, c, "mat"] }))), h("td", { class: "addcell" }))));
  const props = [["gsb", "Gsb", ""], ["abs", "Absorption, %", ""], ["luw", "Loose unit weight", "uw"], ["ruw", "Rodded unit weight", "uw"]];
  props.forEach(([k, tl, uw], i) => body.append(h("tr", { class: i === 0 ? "first" : null }, h("th", { class: "rowh" }, tl, uw ? h("small", {}, unitLabel()) : null),
    slots.map((s, c) => (uw && S.meta.kind[s] === "F") ? h("td", { class: "na", title: "Not used for fillers" }) : h("td", {}, numInput(["materials", s, k], { grid: [20 + i, c, "mat"] }))), h("td", { class: "addcell" }))));
  [["luw_voids", "Loose voids, %"], ["ruw_voids", "Rodded voids, %"], ["pcs", "Passing the PCS, %"]].forEach(([k, tl], i) =>
    body.append(h("tr", { class: "calcrow" + (i === 0 ? " first" : "") }, h("th", { class: "rowh" }, tl, h("small", {}, "calculated")), slots.map((s) => h("td", { class: "calc", id: `chk-${k}-${s}` }, "-")), h("td", { class: "addcell" }))));
  main.append(h("div", { class: "gridwrap" }, h("table", { class: "grid mat", id: "mat-grid" }, h("thead", {}, head), body)),
    h("div", { class: "row note" }, h("button", { class: "btn small", onclick: () => copyGrid("#mat-grid") }, "Copy table for Excel"),
      h("span", { class: "hint" }, "Click a cell and paste a block from Excel. Sieve labels and a row of names are recognised.")),
    h("div", { id: "mat-notes" }));
  S.refresh = () => {
    const typ = { CA: { luw: [43, 49], ruw: [37, 43] }, FA: { luw: [35, 43], ruw: [28, 36] } };
    const pcs = S.an?.control?.coarse_pcs;
    slots.forEach((s) => {
      const info = S.an?.materials?.[s] || {}, kind = S.meta.kind[s];
      ["luw", "ruw"].forEach((k) => {
        const cell = $(`#chk-${k}_voids-${s}`); if (!cell) return;
        const v = info[k + "_voids"]; cell.textContent = fmt(v, 1); cell.className = "calc";
        if (v != null && typ[kind]) cell.classList.add(v < typ[kind][k][0] || v > typ[kind][k][1] ? "st-high" : "st-ok");
        cell.title = typ[kind] ? `Typical ${typ[kind][k][0]} to ${typ[kind][k][1]}%` : "";
      });
      const c = $(`#chk-pcs-${s}`); if (!c) return;
      const g = num(S.mix.materials[s]?.grad?.[pcs != null ? allSieves().find((x) => Math.abs(+x - pcs) < 1e-9) : ""]);
      c.className = "calc";
      if (pcs && g != null) {
        c.textContent = fmt(g, 1);
        const wrong = (kind === "CA" && g >= 50) || (kind === "FA" && g < 50);
        if (kind !== "F") c.classList.add(wrong ? "st-high" : "st-ok");
        c.title = `PCS ${pcs} mm. Coarse piles pass less than 50%.`;
      } else c.textContent = pcs ? "-" : "set NMAS";
    });
    const notes = $("#mat-notes");
    if (notes) {
      notes.innerHTML = "";
      const msg = [];
      slots.forEach((s) => {
        const m = S.mix.materials[s]; if (!(m?.name || "").trim()) return;
        const k = S.meta.kind[s];
        const miss = sieves().filter((sv) => num(m.grad?.[sv]) == null && +sv <= 25);
        if (miss.length) msg.push(`${m.name}: gradation missing on ${miss.length} sieve${miss.length > 1 ? "s" : ""}.`);
        if (!num(m.gsb)) msg.push(`${m.name}: needs Gsb.`);
        if (k !== "F") { const miss2 = ["luw", "ruw"].filter((u) => !num(m[u])).map((u) => u.toUpperCase()); if (miss2.length) msg.push(`${m.name}: needs ${miss2.join(" and ")}.`); }
      });
      if (msg.length) notes.append(h("div", { class: "notice" }, h("b", {}, "Still needed"), h("ul", {}, msg.map((x) => h("li", {}, x)))));
    }
    side.innerHTML = "";
    const series = readySlots().map((s) => ({ name: matName(s), grad: S.mix.materials[s].grad, color: slotColor(s), cls: "pile" }));
    side.append(h("div", { class: "card" }, h("div", { class: "cardhead" }, h("h2", {}, "Stockpile gradations"), scaleToggle()),
      chartBox(gradChart({ series, nmas: S.an?.nmas, cps: {} }), series),
      h("p", { class: "caption" }, S.an?.nmas ? `Dashed lines mark the Bailey control sieves for ${S.an.nmas} mm. The shaded side is the coarse fraction.` : "The Bailey control sieves appear once the NMAS is set in Criteria or by Trial 1.")),
      h("div", { class: "card" }, h("h2", {}, "Values on the chart"), gradTable(series, null)));
  };
}
function removePile(s) {
  const m = S.mix.materials[s] || {};
  const used = (S.mix.trials || []).some((t) => (num(t.pct?.[s]) || 0) > 0);
  if ((m.name || "").trim() && !confirm(`Remove ${m.name}?${used ? " Trials that use it will no longer total 100%." : ""}`)) return;
  S.mix.materials[s] = { name: "", grad: {}, gsb: null, abs: null, luw: null, ruw: null };
  delete S.addedSlots[s];
  changed({ now: true }); render();
}
/* paste a whole table from Excel: stockpiles in columns or rows, sieve labels optional */
function sieveFromLabel(lbl) {
  const t = String(lbl || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || /pan/.test(t)) return null;
  const SV = allSieves().map(Number);
  const near = (x) => { const k = SV.find((v) => Math.abs(v - x) / v < 0.04); return k === undefined ? null : k; };
  let m = t.match(/(\d+(?:\.\d+)?)\s*mm/); if (m) return near(+m[1]);
  const NO = { 4: 4.75, 8: 2.36, 16: 1.18, 30: 0.6, 50: 0.3, 100: 0.15, 200: 0.075 };
  m = t.match(/(?:#|no\.?\s*)(\d+)/); if (m) return NO[+m[1]] ?? null;
  const IN = { "1": 25, "3/4": 19, "1/2": 12.5, "3/8": 9.5, "1-1/2": 37.5 };
  m = t.match(/(\d+(?:-\d+)?\/\d+|\d+)\s*("|in|\u2033|\u201d|'')/); if (m) return IN[m[1]] ?? null;
  m = t.match(/^(\d+(?:\.\d+)?)$/); if (m) { const v = +m[1]; return near(v) ?? NO[v] ?? null; }
  return null;
}
function propFromLabel(lbl) {
  const t = String(lbl || "").toLowerCase();
  if (/gsb|bulk|specific/.test(t)) return "gsb";
  if (/abs/.test(t)) return "abs";
  if (/luw|loose/.test(t)) return "luw";
  if (/ruw|rodded|dry.?rod/.test(t)) return "ruw";
  return null;
}
function parseTable(text, retained) {
  let m = parseClip(text);
  // find which axis carries sieve labels
  const colHits = m.filter((r) => sieveFromLabel(r[0]) !== null).length;
  const rowHits = (m[0] || []).filter((v) => sieveFromLabel(v) !== null).length;
  if (rowHits > colHits) m = m[0].map((_, j) => m.map((r) => r[j]));   // stockpiles were in rows
  const hasLabels = m.filter((r) => sieveFromLabel(r[0]) !== null || propFromLabel(r[0])).length >= 3;
  let rows = m, names = null;
  const first = hasLabels ? 1 : 0;
  const head = m[0].slice(first);
  if (head.some((v) => v && !isNumText(v))) { names = head; rows = m.slice(1); }
  const ncol = Math.max(...m.map((r) => r.length)) - first;
  const piles = Array.from({ length: ncol }, (_, j) => ({ name: (names?.[j] || "").trim(), grad: {}, props: {} }));
  const keys = sieves();
  let gi = 0;
  rows.forEach((r) => {
    let sv = null, pr = null;
    if (hasLabels) { sv = sieveFromLabel(r[0]); pr = sv === null ? propFromLabel(r[0]) : null; if (sv === null && !pr) return; }
    else { if (gi >= keys.length) return; sv = +keys[gi++]; }
    r.slice(first).forEach((v, j) => {
      if (!piles[j]) return;
      const x = num(v); if (x === null) return;
      if (sv !== null) { const k = allSieves().find((kk) => Math.abs(+kk - sv) < 1e-9); if (k) piles[j].grad[k] = retained ? +(100 - x).toFixed(2) : x; }
      else piles[j].props[pr] = x;
    });
  });
  // fine-to-coarse order without labels: flip
  if (!hasLabels) piles.forEach((p) => {
    const v = keys.map((k) => p.grad[k]).filter((x) => x != null);
    if (v.length > 4 && v[0] < v[v.length - 1]) { const g = {}; keys.forEach((k, i) => (g[keys[keys.length - 1 - i]] = p.grad[k])); p.grad = g; }
  });
  return piles.filter((p) => Object.keys(p.grad).length || Object.keys(p.props).length);
}
function guessKind(p) {
  const g = p.grad; const p475 = num(g["4.75"]), p075 = num(g["0.075"]);
  if (p075 != null && p075 >= 60) return "F";
  if (p475 != null && p475 < 50) return "CA";
  return "FA";
}
function pasteTableDialog() {
  const d = $("#dialog"); d.innerHTML = ""; d.style.maxWidth = "860px";
  const ta = h("textarea", { rows: 8, placeholder: "Copy the gradation table in Excel and paste it here (Ctrl+V)", style: "width:100%;font:13px/1.35 Consolas, monospace" });
  const ret = h("input", { type: "checkbox" });
  const prev = h("div", {});
  let piles = [], map = [];
  const run = () => {
    piles = ta.value.trim() ? parseTable(ta.value, ret.checked) : [];
    const used = new Set();
    map = piles.map((p) => {
      const kind = guessKind(p);
      const order = S.meta.slots.filter((s) => S.meta.kind[s] === kind);
      const empty = order.find((s) => !used.has(s) && !(S.mix.materials[s]?.name || "").trim());
      const slot = empty || order.find((s) => !used.has(s)) || "";
      if (slot) used.add(slot);
      return slot;
    });
    prev.innerHTML = "";
    if (!piles.length) { prev.append(h("p", { class: "hint" }, ta.value.trim() ? "No numbers found. Include the sieve sizes in the first column, or paste values in the tool's sieve order (25.0 mm down to 0.075 mm)." : "")); return; }
    const keys = sieves();
    const tbl = h("table", { class: "grid" },
      h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Goes to"), piles.map((p, j) => {
        const sel = h("select", {}, h("option", { value: "" }, "Skip"), S.meta.slots.map((s) => h("option", { value: s, selected: map[j] === s ? true : null }, `${SLOT_NAMES[s]}${(S.mix.materials[s]?.name || "").trim() ? " (replace)" : ""}`)));
        sel.addEventListener("change", () => (map[j] = sel.value));
        return h("th", { style: `--k:${map[j] ? slotColor(map[j]) : "#999"}`, class: "kind-" + (map[j] ? S.meta.kind[map[j]] : "") }, h("div", { style: "font:600 13px var(--sans);text-align:left;margin-bottom:4px" }, p.name || `Column ${j + 1}`), sel);
      }))),
      h("tbody", {}, keys.map((k) => h("tr", {}, h("th", { class: "rowh" }, lab(k)[0], h("small", {}, lab(k)[1])), piles.map((p) => h("td", { class: "calc" + (p.grad[k] == null ? " st-high" : "") }, p.grad[k] == null ? "missing" : fmt(p.grad[k], 1))))),
        ["gsb", "abs", "luw", "ruw"].some((k) => piles.some((p) => p.props[k] != null)) ? ["gsb", "abs", "luw", "ruw"].map((k) => h("tr", {}, h("th", { class: "rowh" }, { gsb: "Gsb", abs: "Absorption, %", luw: "LUW", ruw: "RUW" }[k]), piles.map((p) => h("td", { class: "calc" }, p.props[k] == null ? "-" : p.props[k])))) : null));
    prev.append(h("p", { class: "hint" }, `Found ${piles.length} stockpile${piles.length === 1 ? "" : "s"}. Check where each one goes.`), h("div", { class: "gridwrap", style: "max-height:44vh;overflow:auto" }, tbl));
  };
  ta.addEventListener("input", run); ret.addEventListener("change", run);
  d.append(h("h3", {}, "Paste a table from Excel"),
    h("p", { class: "hint" }, "Stockpiles can be in columns or rows. Sieve labels like 12.5, 12.5 mm, 1/2\" or #8 are matched to the right sieve. Rows named Gsb, absorption, LUW or RUW are picked up too."),
    ta, h("label", { class: "row", style: "margin:8px 0;font-size:13.5px" }, ret, "My values are cumulative % retained (convert to % passing)"), prev,
    h("div", { class: "row", style: "margin-top:14px" }, h("span", { class: "spacer" }), h("button", { class: "btn", onclick: () => d.close() }, "Cancel"),
      h("button", { class: "btn primary", onclick: () => {
        let n = 0;
        piles.forEach((p, j) => {
          const slot = map[j]; if (!slot) return;
          const m = S.mix.materials[slot] = S.mix.materials[slot] || {};
          if (p.name) m.name = p.name; else if (!(m.name || "").trim()) m.name = SLOT_NAMES[slot];
          m.grad = { ...(m.grad || {}), ...p.grad };
          Object.assign(m, p.props); n++;
        });
        d.close(); d.style.maxWidth = ""; changed({ now: true }); render(); toast(`Filled ${n} stockpile${n === 1 ? "" : "s"}`);
      } }, "Fill materials")));
  d.showModal(); setTimeout(() => ta.focus(), 50);
}

async function importDialog() {
  const d = $("#dialog"); d.innerHTML = "";
  const list = (await api("/api/mixes")).filter((m) => m.file !== S.file);
  if (!list.length) { toast("No other saved mixes to import from"); return; }
  const sel = h("select", {}, list.map((m) => h("option", { value: m.file }, m.name)));
  const box = h("div", { class: "checklist" });
  let src = null;
  const load = async () => {
    src = (await api("/api/mix?file=" + encodeURIComponent(sel.value))).mix;
    box.innerHTML = "";
    S.meta.slots.forEach((s) => {
      const m = src.materials?.[s]; if (!(m?.name || "").trim()) return;
      box.append(h("label", {}, h("input", { type: "checkbox", value: s, checked: true }), `${SLOT_NAMES[s]}: ${m.name}`,
        (S.mix.materials[s]?.name || "").trim() ? h("span", { class: "hint inline" }, `replaces ${S.mix.materials[s].name}`) : null));
    });
    if (!box.children.length) box.append(h("p", { class: "hint" }, "That mix has no materials yet."));
  };
  sel.addEventListener("change", load);
  d.append(h("h3", {}, "Import materials"), h("p", { class: "hint" }, "Copies gradations and properties into the same slots of this mix."),
    h("label", { class: "f" }, h("span", {}, "From mix"), sel), box,
    h("div", { class: "row" }, h("span", { class: "spacer" }), h("button", { class: "btn", onclick: () => d.close() }, "Cancel"),
      h("button", { class: "btn primary", onclick: () => {
        $$("input:checked", box).forEach((c) => (S.mix.materials[c.value] = JSON.parse(JSON.stringify(src.materials[c.value]))));
        d.close(); changed({ now: true }); render(); toast("Materials imported");
      } }, "Import selected")));
  await load(); d.showModal();
}

/* ---------------------------------------------------------------- 2 Criteria */
const ROT_ROWS = [["PCS", "% passing PCS per 1% VMA", 2], ["CA", "CA ratio per 1% VMA", 3], ["FAc", "FAc ratio per 1% VMA", 3], ["FAf", "FAf ratio per 1% VMA", 3],
  ["FAc_dip", "FAc dip (VMA lowest)", 2], ["FAf_dip", "FAf dip (VMA lowest)", 2], ["AC", "Air voids per 1% effective binder", 2], ["pba_abs", "Pba as a share of water absorption", 2]];
function renderCriteria(page) {
  const m = S.mix;
  practicalUI(true);
  const typeSel = h("select", { "aria-label": "Mix type" }, TYPE_KEYS.map(([v, t]) => h("option", { value: v, selected: normType(m.settings.mix_type) === v ? true : null }, t)));
  const nmasSel = h("select", { "aria-label": "NMAS" }, h("option", { value: "" }, "Detect from Trial 1"), NMAS_KEYS.map((v) => h("option", { value: v, selected: num(m.settings.nmas_override) === +v ? true : null }, `${v} mm`)));
  const unitSel = h("select", { "aria-label": "Units" }, [["auto", "Detect from unit weights"], ["metric", "Metric (kg/m³)"], ["english", "US customary (lb/ft³)"]].map(([v, t]) => h("option", { value: v, selected: m.settings.units === v ? true : null }, t)));
  const typeChanged = () => { m.bailey_ranges = null; m.rot_override = {}; S.fit = null; changed({ now: true }); setTimeout(render, 400); toast("Typical values loaded for the new mix type"); };
  typeSel.addEventListener("change", () => { m.settings.mix_type = typeSel.value; typeChanged(); });
  nmasSel.addEventListener("change", () => { m.settings.nmas_override = num(nmasSel.value); m.bailey_ranges = null; changed({ now: true }); setTimeout(render, 400); });
  unitSel.addEventListener("change", () => edit(["settings", "units"], unitSel.value));
  page.append(h("div", { class: "head" }, h("div", {}, h("h1", {}, "Criteria"),
    h("p", { class: "intro" }, "What a good trial looks like for this mix. Pick the mix type and NMAS first. Typical Bailey values for that type load below, and you can change any of them. Leave a box blank to ignore it."))));
  const banner = h("div", { class: "banner", id: "type-banner" });
  page.append(h("section", { class: "card topcard" },
    h("div", { class: "fgrid five" },
      h("label", { class: "f" }, h("span", {}, "Mix type"), typeSel),
      h("label", { class: "f" }, h("span", {}, "NMAS"), nmasSel),
      h("label", { class: "f" }, h("span", {}, "Binder Gb"), numInput(["settings", "gb"])),
      h("label", { class: "f" }, h("span", {}, "Fiber, % of total mix"), numInput(["settings", "fiber_pct"], { placeholder: "none" })),
      h("label", { class: "f" }, h("span", {}, "Units"), unitSel)),
    banner,
    h("label", { class: "f", style: "margin-top:12px" }, h("span", {}, "Notes"),
      (() => { const t = h("textarea", { rows: 2 }); t.value = m.notes || ""; t.addEventListener("input", () => edit(["notes"], t.value)); return t; })())));

  const left = h("div", { class: "col" }), right = h("div", { class: "col" });
  page.append(h("div", { class: "cols2" }, left, right));

  // volumetric targets
  const vol = [["vma", "VMA, %", "e.g. 17.0"], ["va", "Air voids, %", "e.g. 3.5"], ["pb_min", "Minimum binder, %", "optional"],
    [["vfa", 0], "VFA min, %", "optional"], [["vfa", 1], "VFA max, %", "optional"], ["vcadrc", "VCA dry-rodded, %", "once measured"], ["vma_tol", "Tune binder once VMA is within ±", "0.3"]];
  left.append(h("section", { class: "card" }, h("h2", {}, "Volumetric targets"), h("p", { class: "hint" }, "The search aims for VMA. Binder is then set for the air voids."),
    h("div", { class: "fgrid three" }, vol.map(([k, t, ph]) => h("label", { class: "f" }, h("span", {}, t), numInput(["targets"].concat(k), { placeholder: ph }))))));

  // Bailey ranges
  const rb = h("tbody", { id: "ranges-body" });
  left.append(h("section", { class: "card" }, h("div", { class: "cardhead" }, h("h2", {}, "Bailey ranges"), h("span", { class: "hint", id: "ranges-for" })),
    h("p", { class: "hint" }, "Soft goals for the search. A fine-graded mix uses the new CA, FAc and FAf ratios on the fine fraction."),
    h("table", { class: "grid compact" }, h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Principle"), h("th", {}, "Min"), h("th", {}, "Max"), h("th", {}, "Typical"))), rb),
    h("div", { class: "row note" }, h("button", { class: "btn small", onclick: () => { m.bailey_ranges = null; changed({ now: true }); setTimeout(render, 350); } }, "Reset ranges to typical"))));

  // rules of thumb
  const rotBody = h("tbody", { id: "rot-body" });
  left.append(h("section", { class: "card" }, h("div", { class: "cardhead" }, h("h2", {}, "Rules of thumb for prediction"), h("span", { class: "hint", id: "rot-for" })),
    h("p", { class: "hint" }, "How much each value must change to move VMA by 1%. The class values are used until you change them. After 3 tested trials the tool can fit them to your mix."),
    h("table", { class: "grid compact" }, h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Factor"), h("th", {}, "In use"), h("th", {}, "Class value"), h("th", {}, "Typical range"), h("th", {}, "Fitted to your trials"))), rotBody),
    h("div", { class: "row note", id: "fit-row" })));

  // gradation limits
  const cpBody = h("tbody", {});
  sieves().forEach((s, r) => cpBody.append(h("tr", {}, h("th", { class: "rowh" }, lab(s)[0], h("small", {}, lab(s)[1])),
    h("td", {}, numInput(["control_points", s, "min"], { grid: [r, 0, "cp"] })),
    h("td", {}, numInput(["control_points", s, "max"], { grid: [r, 1, "cp"] })),
    h("td", { class: "soft" }, numInput(["control_points", s, "soft_min"], { grid: [r, 2, "cp"] })),
    h("td", { class: "soft" }, numInput(["control_points", s, "soft_max"], { grid: [r, 3, "cp"] })))));
  right.append(h("section", { class: "card" }, h("div", { class: "cardhead" }, h("h2", {}, "Gradation limits"), h("span", { id: "band-btn" })),
    h("p", { class: "hint" }, "Control points are hard limits. Soft targets are where you would like a sieve to land, for example 22 to 24% on #8."),
    h("div", { id: "cp-preview" }),
    h("table", { class: "grid compact" }, h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Sieve"), h("th", {}, "Control min"), h("th", {}, "Control max"), h("th", { class: "softh" }, "Soft min"), h("th", { class: "softh" }, "Soft max"))), cpBody),
    h("p", { class: "hint" }, "Paste columns straight from Excel into the first box.")));

  // practical limits
  const pr = practicalUI(true);
  const cb = (key, val, label) => { const i = h("input", { type: "checkbox", checked: val ? true : null }); i.addEventListener("change", () => edit(["search", key], i.checked)); return h("label", { class: "check" }, i, h("span", {}, label)); };
  right.append(h("section", { class: "card" }, h("h2", {}, "Practical limits"), h("p", { class: "hint" }, "What the plant can actually feed."),
    h("label", { class: "check" }, h("span", {}, "A stockpile is 0% or at least"), numInput(["search", "min_pile_pct"], { cls: "tiny", label: "Minimum stockpile percent" }), h("span", {}, "%")),
    cb("min_fillers", pr.min_fillers, "Apply that minimum to fillers too"),
    cb("one_fine", pr.one_fine, "Prefer one fine aggregate. Two are kept only when it clearly helps."),
    cb("lock_small_fillers", pr.lock_small_fillers, "Keep fillers at 2% or less fixed unless I unlock them")));

  S.refresh = () => {
    const ti = typeInfo(), dr = S.an?.default_ranges || {}, nm = S.an?.nmas, isFG = mixType() === "fg";
    const c = S.an?.control;
    banner.innerHTML = "";
    banner.append(h("span", { class: "grow" }, "Typical values loaded for ", h("b", {}, `${typeLabel()}${nm ? ", " + nm + " mm" : ""}`), ": ",
      c ? `control sieves ${[c.half, c.pcs, c.scs, c.tcs].filter((x) => x != null).join(", ")} mm${isFG ? ` (new sieves; original PCS ${c.coarse_pcs} mm)` : ""}, ` : "control sieves once the NMAS is known, ",
      `coarse unit weight ${ti.uw_range[0]} to ${ti.uw_range[1]}% of ${ti.uw_ref.toUpperCase()}, fine unit weight 100% of ${ti.fa_ref.toUpperCase()}, and the ${ti.label} rules of thumb.`),
      h("button", { class: "btn small", onclick: () => { m.bailey_ranges = null; m.rot_override = {}; changed({ now: true }); setTimeout(render, 350); } }, "Reset to typical"),
      h("button", { class: "btn link", onclick: () => { S.tab = "reference"; render(); } }, "All mix types"));
    $("#ranges-for").textContent = `typical for ${ti.label}${nm ? ", " + nm + " mm" : ""}`;
    $("#rot-for").textContent = `class values for ${ti.label}`;
    // ranges table (rebuilt only when it holds no focus)
    if (!rb.contains(document.activeElement)) {
      rb.innerHTML = "";
      const cur = () => m.bailey_ranges || dr;
      [["ca_ruw", ti.uw_label + " (chosen unit weight)"], ["CA", (isFG ? "New " : "") + "CA ratio"], ["FAc", (isFG ? "New " : "") + "FAc ratio"], ["FAf", (isFG ? "New " : "") + "FAf ratio"]].forEach(([k, t]) => {
        const mk = (i) => {
          const inp = h("input", { type: "text", inputmode: "decimal", value: cur()[k]?.[i] ?? "", "aria-label": `${t} ${i ? "max" : "min"}` });
          inp.addEventListener("input", () => {
            if (!m.bailey_ranges) m.bailey_ranges = JSON.parse(JSON.stringify(dr));
            m.bailey_ranges[k] = m.bailey_ranges[k] || [null, null];
            m.bailey_ranges[k][i] = num(inp.value); changed();
          });
          return inp;
        };
        rb.append(h("tr", {}, h("th", { class: "rowh" }, t), h("td", {}, mk(0)), h("td", {}, mk(1)), h("td", { class: "calc" }, dr[k]?.[0] == null ? "-" : `${dr[k][0]} to ${dr[k][1]}`)));
      });
    }
    if (!rotBody.contains(document.activeElement)) {
      rotBody.innerHTML = "";
      const ov = m.rot_override || {}, fit = S.fit?.ok ? S.fit.rot : null;
      ROT_ROWS.forEach(([k, t, d]) => {
        const label = k === "PCS" && isFG ? "% passing original PCS per 1% VMA" : (isFG && ["CA", "FAc", "FAf"].includes(k) ? "New " + t : t);
        const inp = h("input", { type: "text", inputmode: "decimal", value: ov[k] ?? "", placeholder: String(ti.rot[k]), "aria-label": label });
        inp.addEventListener("input", () => { m.rot_override = m.rot_override || {}; const v = num(inp.value); if (v == null) delete m.rot_override[k]; else m.rot_override[k] = v; changed(); });
        const r = ti.rot_range[k];
        rotBody.append(h("tr", {}, h("th", { class: "rowh" }, label), h("td", {}, inp), h("td", { class: "calc" }, ti.rot[k]),
          h("td", { class: "calc" }, r ? `${r[0]} to ${r[1]}` : "-"), h("td", { class: "calc" + (fit ? " fitted" : "") }, fit ? fmt(fit[k], d) : "after 3 tests")));
      });
      const fr = $("#fit-row"); fr.innerHTML = "";
      const nT = testedAn().length;
      fr.append(h("button", { class: "btn small", disabled: nT < 3 ? true : null, onclick: runFit }, "Fit to my trials"));
      if (S.fit?.ok) fr.append(h("button", { class: "btn small primary", onclick: () => { m.rot_override = { ...S.fit.rot }; changed({ now: true }); toast("Fitted values in use"); setTimeout(render, 350); } }, "Use fitted values"),
        h("span", { class: "hint" }, `VMA error ${S.fit.vma_rms_before} → ${S.fit.vma_rms_after} (rms, ${S.fit.comparisons} comparisons)`));
      else fr.append(h("span", { class: "hint" }, nT < 3 ? `${nT} of 3 tested trials so far.` : "Ready to fit."));
      if (Object.keys(ov).length) fr.append(h("button", { class: "btn link", onclick: () => { m.rot_override = {}; changed({ now: true }); setTimeout(render, 350); } }, "Back to class values"));
    }
    const bb = $("#band-btn"); bb.innerHTML = "";
    if (S.an?.band && Object.keys(S.an.band.limits).length) bb.append(h("button", { class: "btn small", onclick: () => {
      Object.entries(S.an.band.limits).forEach(([s, [lo, hi]]) => { const k = allSieves().find((x) => Math.abs(+x - +s) < 1e-9); if (!k) return; m.control_points[k] = { ...(m.control_points[k] || {}), min: lo, max: hi }; });
      changed({ now: true }); setTimeout(render, 350); toast(`${S.an.band.name} band loaded as control points`);
    } }, `Load ${S.an.band.name} band`));
    const pv = $("#cp-preview"); pv.innerHTML = "";
    pv.append(h("div", { class: "chart small", html: gradChart({ series: [], nmas: S.an?.nmas, cps: m.control_points, compact: true }) }));
  };
}
async function runFit() {
  try { S.fit = await api("/api/fit", { mix: S.mix }); }
  catch (e) { toast(e.message); return; }
  if (!S.fit.ok) toast(S.fit.message);
  if (S.refresh) S.refresh();
}

/* ---------------------------------------------------------------- 3 Trials */
function nextTrialId() { let n = 1; while (trialById("T" + n)) n++; return "T" + n; }
function largestOf(pct, kind, locks = {}) {
  const c = readySlots().filter((s) => S.meta.kind[s] === kind && !locks[s]);
  return c.sort((a, b) => (num(pct?.[b]) || 0) - (num(pct?.[a]) || 0))[0] || null;
}
function defaultLocks(pct) {
  const L = {};
  if (practicalUI().lock_small_fillers) readySlots().forEach((s) => { const x = num(pct?.[s]) || 0; if (S.meta.kind[s] === "F" && x > 0 && x <= 2) L[s] = true; });
  return L;
}
function addTrial(extra = {}) {
  const id = nextTrialId();
  const pct = extra.pct ? { ...extra.pct } : {};
  const t = { id, label: "Trial " + id.slice(1), source: "lab", created: new Date().toISOString(), pct,
    results: { pb: null, gmb: [], gmm: [], vcadrc: null }, mode: "mass", ...extra };
  t.locks = t.locks || defaultLocks(pct);
  t.balance = t.balance || largestOf(pct, "FA", t.locks) || largestOf(pct, "CA", t.locks);
  S.mix.trials.push(t); S.sel = id; S.sub = "blend";
  return t;
}
function planNext(fromId, binderOnly = false) {
  const T = testedAn();
  const refA = (fromId && anTrial(fromId)?.volumetrics?.complete) ? anTrial(fromId) : T[T.length - 1];
  if (!refA) { toast("Test a trial first"); return; }
  const ref = trialById(refA.id);
  const t = addTrial({ pct: { ...ref.pct }, ref: ref.id, source: "tool", results: { pb: num(ref.results?.pb), gmb: [], gmm: [], vcadrc: null } });
  t.option = binderOnly ? "binder" : null;
  changed({ now: true }); render();
  if (!binderOnly) findSuggestions(t);
  else liveUpdate(t, true);
}
function startTrial(mode) {
  const pct = {};
  if (mode === "mass") readySlots().forEach((s) => (pct[s] = 0));
  const t = addTrial({ pct, mode, source: mode === "bailey" ? "bailey" : "lab" });
  if (mode === "bailey") t.bailey_inputs = defaultBaileyInputs();
  changed({ now: true }); render();
  if (mode === "bailey") runForward(t);
}
function defaultBaileyInputs() {
  const ca = readySlots().filter((s) => S.meta.kind[s] === "CA"), fa = readySlots().filter((s) => S.meta.kind[s] === "FA");
  const split = (arr) => { const o = {}; arr.forEach((s, i) => (o[s] = i === 0 ? 100 - Math.round(100 / arr.length) * (arr.length - 1) : Math.round(100 / arr.length))); return o; };
  const f2 = (S.mix.materials.F2?.name || "").trim() ? 1 : 0;
  return { cuw: typeInfo().uw_start, ca_vol: split(ca), fa_vol: split(fa), dust: mixType() === "sma" ? 10 : 5, f2 };
}
function removeTrial(id) {
  if (!confirm("Delete this trial and its lab data?")) return;
  S.mix.trials = S.mix.trials.filter((t) => t.id !== id);
  const last = S.mix.trials[S.mix.trials.length - 1];
  S.sel = last ? last.id : null;
  changed({ now: true }); render();
}
function scheduleSave() { clearTimeout(changed._s); changed._s = setTimeout(save, 1200); }

function renderTrials(page) {
  page.classList.add("three");
  const rail = h("aside", { class: "rail" }), main = h("section", { class: "main" }), side = h("aside", { class: "side" });
  page.append(rail, main, side);
  const T = S.mix.trials;
  if (readySlots().length < 2) {
    main.append(h("h1", {}, "Trials"), h("div", { class: "notice" }, "Add at least two stockpiles with a name and a Gsb in Stockpiles first."));
    renderRail(rail); return;
  }
  if (!S.sel || !trialById(S.sel)) S.sel = T.length ? T[T.length - 1].id : null;
  renderRail(rail);
  if (!S.sel) { renderFirstTrial(main, side); return; }
  const t = trialById(S.sel);
  const st = trialStatus(t);
  const nameIn = textInput(["trials", T.indexOf(t), "label"], { cls: "tname", label: "Trial name" });
  const fit = () => (nameIn.style.width = Math.max(5, (nameIn.value || "").length + 1) + "ch");
  fit();
  nameIn.addEventListener("input", () => { fit(); renderRail(rail); });
  const refT = t.ref ? trialById(t.ref) : null;
  main.append(h("div", { class: "trialhead" },
    h("div", { class: "row" }, nameIn, h("span", { class: "status " + st.toLowerCase(), id: "t-status" }, st), h("span", { class: "phase", id: "t-phase" })),
    h("div", { class: "row" }, h("span", { class: "hint" }, refT ? `Planned from ${refT.label}${t.option ? ", " + optTitle(t.option) : ""}.` : t.source === "bailey" ? "Built from Bailey inputs." : "Blend entered by you."),
      h("span", { class: "spacer" }), h("button", { class: "btn link danger", onclick: () => removeTrial(t.id) }, "Delete trial"))));
  const subs = [["blend", "1 Blend and binder"], ["lab", "2 Lab results"], ["results", "3 Results"]];
  main.append(h("div", { class: "subtabs", role: "tablist" }, subs.map(([k, l]) => h("button", { role: "tab", "aria-selected": S.sub === k ? "true" : "false", onclick: () => { S.sub = k; render(); } }, l))));
  const body = h("div", { class: "subbody" });
  main.append(body);
  if (S.sub === "blend") renderBlend(body, side, t);
  else if (S.sub === "lab") renderLab(body, side, t);
  else renderResults(body, side, t);
}
function optTitle(k) { return { balanced: "Recommended", coarse: "Coarse volume first", fines: "Fines and filler first", bailey: "Bailey targets first", binder: "Binder only" }[k] || k; }

function railLine(t) {
  const a = anTrial(t.id), v = a?.volumetrics || {};
  if (v.complete) return `VMA ${fmt(v.vma, 1)}, Va ${fmt(v.va, 1)}, Pb ${fmt(v.pb, 1)}`;
  const p = S.live[t.id]?.pred || t.prediction;
  if (p && Math.abs(pctSum(t.pct) - 100) <= 0.05) return `Predicted VMA ${fmt(p.vma, 1)} at Pb ${fmt(num(t.results?.pb) ?? p.pb, 1)}`;
  return `Blend totals ${fmt(pctSum(t.pct), 1)}%`;
}
function renderRail(rail) {
  rail.innerHTML = "";
  rail.append(h("div", { class: "railhead" }, "Trials"));
  (S.mix.trials || []).forEach((t) => {
    const st = trialStatus(t);
    rail.append(h("button", { class: "tcard" + (t.id === S.sel ? " sel" : ""), onclick: () => { S.sel = t.id; S.sub = isTested(t.id) ? "results" : "blend"; render(); } },
      h("span", { class: "row" }, h("b", {}, t.label || t.id), h("span", { class: "status " + st.toLowerCase() }, st)),
      h("span", { class: "line" }, railLine(t))));
  });
  if (!(S.mix.trials || []).length) rail.append(h("div", { class: "empty" }, "No trials yet. Your first one will appear here."));
  const T = testedAn();
  if (T.length) rail.append(h("button", { class: "btn primary block", onclick: () => planNext(isTested(S.sel) ? S.sel : null) }, "Plan next trial"));
  rail.append(h("button", { class: "btn block", onclick: () => startTrial("bailey") }, T.length ? "New trial from Bailey inputs" : "Generate Trial 1"),
    h("button", { class: "btn link block", onclick: () => startTrial("mass") }, "Enter a blend yourself"));
  rail.append(h("div", { class: "railtools" },
    h("button", { class: "btn link", onclick: downloadMix }, "Download mix file"),
    h("button", { class: "btn link danger", onclick: deleteMix }, "Delete mix")));
}

function renderFirstTrial(main, side) {
  main.append(h("h1", {}, "Trial 1"), h("p", { class: "intro" }, "Two ways to start. Either way you can change any pile and the binder before you save."),
    h("section", { class: "card accent" }, h("h2", {}, "Generate Trial 1 from Bailey inputs"),
      h("p", {}, `Set the coarse unit weight (typical ${typeInfo().uw_range[0]} to ${typeInfo().uw_range[1]}% of ${typeInfo().uw_ref.toUpperCase()} for ${typeInfo().label}), how the piles share each fraction by volume, and the #200 target. The tool does the volume blend, the same steps as the Bailey volume blending sheet.`),
      h("button", { class: "btn primary", onclick: () => startTrial("bailey") }, "Generate Trial 1")),
    h("section", { class: "card" }, h("h2", {}, "Or enter a blend you already have"),
      h("p", {}, "For example a blend adapted from an existing design. You can paste the percentages from Excel."),
      h("button", { class: "btn", onclick: () => startTrial("mass") }, "Enter a blend")));
  side.append(h("div", { class: "card" }, h("h2", {}, "Before you start"),
    h("ul", { class: "plain" }, h("li", {}, `${readySlots().length} stockpiles are ready.`),
      h("li", {}, num(S.mix.targets?.vma) != null ? `VMA target ${fmt(S.mix.targets.vma, 1)}%, air voids ${fmt(S.mix.targets.va, 1)}%.` : "Set the VMA and air-void targets in Criteria. The first binder estimate uses them."),
      h("li", {}, S.an?.nmas ? `NMAS ${S.an.nmas} mm.` : "Set the NMAS in Criteria, or let Trial 1 detect it."))));
}

/* ---------- blend and binder */
function renderBlend(body, side, t) {
  const tested = isTested(t.id);
  if (tested) {
    body.append(h("div", { class: "notice teal" }, "This trial is tested. Changes here correct its record. To try a different blend, plan a new trial.",
      h("button", { class: "btn small", style: "margin-left:12px", onclick: () => planNext(t.id) }, "Plan next trial from this one")));
  }
  const T = testedAn().filter((a) => a.id !== t.id);
  if (!tested) {
    const refSel = h("select", { "aria-label": "Start from" }, h("option", { value: "" }, T.length ? "No reference (no prediction)" : "No tested trial yet"),
      T.map((a) => h("option", { value: a.id, selected: t.ref === a.id ? true : null }, `${trialById(a.id)?.label}: VMA ${fmt(a.volumetrics.vma, 1)}, Va ${fmt(a.volumetrics.va, 1)} at Pb ${fmt(a.volumetrics.pb, 1)}`)));
    refSel.addEventListener("change", () => { t.ref = refSel.value || null; delete S.sugg[t.id]; changed(); render(); liveUpdate(t, true); });
    body.append(h("div", { class: "row startfrom" }, h("label", {}, "Start from"), refSel));
    if (t.ref) body.append(suggestionsBlock(t));
  }
  const isB = t.mode === "bailey" && !tested;
  if (!tested) {
    const seg = (on, label, fn) => h("button", { role: "radio", "aria-checked": on ? "true" : "false", class: "seg" + (on ? " on" : ""), onclick: fn }, label);
    body.append(h("div", { class: "row editby", role: "radiogroup", "aria-label": "How to edit the blend" }, h("span", {}, "Edit the blend by"),
      h("span", { class: "segs" }, seg(!isB, "Stockpile %", () => { t.mode = "mass"; changed(); render(); }),
        seg(isB, "Bailey inputs (volume blend)", () => { t.mode = "bailey"; if (!t.bailey_inputs) t.bailey_inputs = baileyFromTrial(t); changed(); render(); runForward(t); }))));
  }
  body.append(isB ? baileyInputsBlock(t) : massBlock(t, tested));
  body.append(binderBlock(t, tested));
  renderBlendSide(side, t);
  S.refresh = () => { updateMassCalc(t); if (!tested) liveUpdate(t, true); else renderBlendSide(side, t); };
  liveUpdate(t, true);
}
function baileyFromTrial(t) {
  const b = anTrial(t.id)?.bailey;
  if (b && !b.error && b.cuw_pct) return { cuw: +b.cuw_pct.toFixed(1), ca_vol: Object.fromEntries(Object.entries(b.ca_vol).map(([k, v]) => [k, +v.toFixed(1)])), fa_vol: Object.fromEntries(Object.entries(b.fa_vol).map(([k, v]) => [k, +v.toFixed(1)])), dust: b.dust, f2: b.f2_pct || 0 };
  return defaultBaileyInputs();
}
function suggestionsBlock(t) {
  const box = h("section", { class: "sugg" });
  const sg = S.sugg[t.id];
  const head = h("div", { class: "cardhead" }, h("h2", {}, "Start from a suggestion"),
    h("button", { class: "btn small", onclick: () => findSuggestions(t) }, sg?.loading ? "Searching…" : sg?.options ? "Search again" : "Find suggestions"));
  box.append(head);
  if (sg?.loading) { box.append(h("div", { class: "hint" }, "Searching for blends that reach your targets. This takes a few seconds.")); return box; }
  if (sg?.error) { box.append(h("div", { class: "notice" }, sg.error)); return box; }
  if (!sg?.options) { box.append(h("p", { class: "hint" }, "The tool searches for the blend that reaches your VMA target with the smallest change, using your locks and criteria.")); return box; }
  const ref = trialById(t.ref);
  const cards = sg.options.filter((o) => !o.duplicate_of).map((o) => ({ key: o.key, title: o.title, about: o.about, vma: o.prediction.vma, pb: o.prediction.pb, pct: o.pct }));
  const bo = sg.binder;
  if (bo) cards.push({ key: "binder", title: "Binder only", about: `Same blend as ${ref?.label}. Tune Pb for air voids.`, vma: bo.vma, pb: bo.pb, pct: { ...ref.pct } });
  box.append(h("div", { class: "cards5", role: "radiogroup" }, cards.map((c) => h("button", { role: "radio", "aria-checked": t.option === c.key ? "true" : "false", class: "scard" + (t.option === c.key ? " on" : ""), onclick: () => {
    t.pct = { ...c.pct }; t.option = c.key; t.mode = "mass";
    t.results = t.results || {}; t.results.pb = +(+c.pb).toFixed(1);
    t.balance = t.balance && (num(t.pct[t.balance]) || 0) > 0 ? t.balance : largestOf(t.pct, "FA", t.locks) || largestOf(t.pct, "CA", t.locks);
    changed(); render();
  } }, h("span", { class: "t" }, c.title), h("span", { class: "a" }, c.about),
    h("span", { class: "n" }, h("span", {}, h("b", {}, fmt(c.vma, 1)), " VMA"), h("span", {}, h("b", {}, fmt(c.pb, 2)), " Pb"))))));
  return box;
}
async function findSuggestions(t) {
  if (!t.ref) return;
  S.sugg[t.id] = { loading: true };
  if (S.sel === t.id && S.tab === "trials") render();
  try {
    const locks = {}; Object.entries(t.locks || {}).forEach(([k, v]) => { if (v) locks[k] = true; });
    const ref = trialById(t.ref);
    const r = await api("/api/suggest", { mix: S.mix, ref: t.ref, locks, base: ref.pct });
    const bo = await api("/api/predict", { mix: S.mix, ref: t.ref, pct: ref.pct });
    S.sugg[t.id] = { options: r.options, binder: bo.prediction };
  } catch (e) { S.sugg[t.id] = { error: e.message }; }
  if (S.sel === t.id && S.tab === "trials" && S.sub === "blend") render();
}

function massBlock(t, tested) {
  const ref = t.ref ? trialById(t.ref) : null;
  const slots = readySlots();
  const box = h("section", { class: "card" }, h("div", { class: "cardhead" }, h("h2", {}, tested ? "Blend, % by mass of aggregate" : "Your blend"),
    !tested ? h("span", { class: "hint" }, t.option ? `Started from ${optTitle(t.option)}` : "") : null));
  if (!tested) box.append(h("p", { class: "hint" }, "Type a % or use − and +. The pile marked Balance takes up the difference, so the total stays at 100. Lock a pile to keep it fixed."));
  const rows = slots.map((s, r) => {
    const inp = h("input", { type: "text", inputmode: "decimal", value: num(t.pct[s]) != null ? fmt(t.pct[s], 1) : "", "aria-label": `${matName(s)} %`, class: "pct", disabled: t.locks?.[s] && !tested ? true : null });
    inp.dataset.slot = s; inp.dataset.g = "blend"; inp.dataset.r = r; inp.dataset.c = 0; inp.dataset.path = JSON.stringify(["trials", S.mix.trials.indexOf(t), "pct", s]);
    inp.addEventListener("keydown", gridKeys); inp.addEventListener("paste", gridPaste);
    let last = num(t.pct[s]) || 0;
    inp.addEventListener("focus", () => (last = num(t.pct[s]) || 0));
    inp.addEventListener("input", () => setPile(t, s, num(inp.value), last, tested, (v) => (last = v)));
    const step = (d) => { const old = num(t.pct[s]) || 0; const nv = Math.max(0, +(old + d).toFixed(1)); inp.value = fmt(nv, 1); setPile(t, s, nv, old, tested); };
    const lock = h("input", { type: "checkbox", checked: t.locks?.[s] ? true : null, "aria-label": `Lock ${matName(s)}` });
    lock.addEventListener("change", () => { t.locks = t.locks || {}; t.locks[s] = lock.checked; if (lock.checked && t.balance === s) t.balance = largestOf(t.pct, "FA", t.locks) || largestOf(t.pct, "CA", t.locks); changed(); render(); });
    const bal = h("input", { type: "radio", name: "balance", checked: t.balance === s ? true : null, disabled: t.locks?.[s] ? true : null, "aria-label": `Balance with ${matName(s)}` });
    bal.addEventListener("change", () => { t.balance = s; changed(); render(); });
    return h("tr", { class: t.balance === s && !tested ? "isbal" : null },
      h("th", { class: "rowh" }, h("i", { class: "sw", style: `background:${slotColor(s)}` }), matName(s), h("small", {}, SLOT_NAMES[s])),
      ref ? h("td", { class: "calc" }, fmt(num(ref.pct?.[s]) || 0, 1)) : null,
      h("td", { class: "stepper" }, tested ? inp : [h("button", { class: "stp", "aria-label": `Less ${matName(s)}`, disabled: t.locks?.[s] ? true : null, onclick: () => step(-0.5) }, "−"), inp, h("button", { class: "stp", "aria-label": `More ${matName(s)}`, disabled: t.locks?.[s] ? true : null, onclick: () => step(0.5) }, "+")]),
      ref ? h("td", { class: "calc delta", id: "d-" + s }, "") : null,
      !tested ? h("td", { class: "ctr" }, lock) : null,
      !tested ? h("td", { class: "ctr" }, bal) : null);
  });
  box.append(h("table", { class: "grid blend" },
    h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Stockpile"), ref ? h("th", {}, ref.label) : null, h("th", { class: "ctr" }, tested ? "%" : `${t.label}, %`), ref ? h("th", {}, "Change") : null, !tested ? h("th", { class: "ctr" }, "Lock") : null, !tested ? h("th", { class: "ctr" }, "Balance") : null)),
    h("tbody", {}, rows, h("tr", { class: "total" }, h("th", { class: "rowh" }, "Total"), ref ? h("td", { class: "calc" }, "100.0") : null, h("td", { class: "calc strong", id: "blend-total" }, ""), h("td", { colspan: 3, id: "blend-fix" })))));
  const [small, mn] = smallPiles(t.pct, t.locks);
  if (small.length) box.append(h("p", { class: "warnline" }, small.map(([s, x]) => `${matName(s)} is ${fmt(x, 1)}%, below your ${fmt(mn, 1)}% practical minimum.`).join(" ")));
  return box;
}
function setPile(t, s, v, old, tested, setLast) {
  t.pct[s] = v == null ? 0 : v;
  const bal = t.balance;
  if (!tested && bal && bal !== s && !t.locks?.[bal] && v != null) {
    const nb = Math.max(0, +((num(t.pct[bal]) || 0) + (old || 0) - v).toFixed(1));
    t.pct[bal] = nb;
    const bi = $(`input.pct[data-slot="${bal}"]`); if (bi) bi.value = fmt(nb, 1);
  }
  if (setLast) setLast(t.pct[s]);
  t.option = t.option ? t.option : null;
  changed(); updateMassCalc(t); liveUpdate(t);
}
function updateMassCalc(t) {
  const tot = pctSum(t.pct);
  const te = $("#blend-total");
  if (te) { te.textContent = fmt(tot, 1); te.className = "calc strong " + (Math.abs(tot - 100) > 0.05 ? "st-high" : "st-ok"); }
  const fx = $("#blend-fix");
  if (fx) {
    fx.innerHTML = "";
    if (Math.abs(tot - 100) > 0.05) fx.append(h("button", { class: "btn link", onclick: () => {
      const k = (t.balance && !t.locks?.[t.balance]) ? t.balance : largestOf(t.pct, "FA", t.locks) || largestOf(t.pct, "CA", t.locks);
      if (!k) return; t.pct[k] = Math.max(0, +((num(t.pct[k]) || 0) + 100 - tot).toFixed(1));
      const bi = $(`input.pct[data-slot="${k}"]`); if (bi) bi.value = fmt(t.pct[k], 1);
      changed(); updateMassCalc(t); liveUpdate(t);
    } }, "Make 100 with the balance pile"));
  }
  const ref = t.ref ? trialById(t.ref) : null;
  if (ref) readySlots().forEach((s) => {
    const d = (num(t.pct[s]) || 0) - (num(ref.pct?.[s]) || 0), c = $("#d-" + s); if (!c) return;
    c.textContent = Math.abs(d) < 0.05 ? "-" : sgn(d, 1); c.className = "calc delta " + (d > 0.05 ? "up" : d < -0.05 ? "down" : "");
  });
}

function baileyInputsBlock(t) {
  const bi = t.bailey_inputs = t.bailey_inputs || defaultBaileyInputs();
  const ti = typeInfo();
  const ca = readySlots().filter((s) => S.meta.kind[s] === "CA"), fa = readySlots().filter((s) => S.meta.kind[s] === "FA");
  const field = (label, get, set, stepv, note) => {
    const inp = h("input", { type: "text", inputmode: "decimal", value: get() ?? "", "aria-label": label });
    inp.addEventListener("input", () => { set(num(inp.value)); changed(); runForward(t); });
    const st = (d) => { const v = Math.max(0, +((num(get()) || 0) + d).toFixed(1)); inp.value = v; set(v); changed(); runForward(t); };
    return h("div", { class: "bifield" }, h("span", { class: "l" }, label),
      h("span", { class: "stepper" }, h("button", { class: "stp", "aria-label": "Lower " + label, onclick: () => st(-stepv) }, "−"), inp, h("button", { class: "stp", "aria-label": "Raise " + label, onclick: () => st(stepv) }, "+")),
      note ? h("span", { class: "n" }, note) : null);
  };
  const box = h("section", { class: "card" }, h("h2", {}, "Your blend, from Bailey inputs"),
    h("p", { class: "hint" }, `Set the coarse unit weight and how the piles share each fraction by volume. ${(S.mix.materials.F1?.name || "").trim() ? matName("F1") + " is set to hit the #200 target." : "Add a filler as Filler 1 to control the #200."} The same steps as the Bailey volume blending sheet, done live.`));
  box.append(h("div", { class: "bigrid" },
    field(`Coarse unit weight, ${ti.uw_label.replace("CA ", "")}`, () => bi.cuw, (v) => (bi.cuw = v), 1, `typical ${ti.uw_range[0]} to ${ti.uw_range[1]}`),
    field("Passing #200 target, %", () => bi.dust, (v) => (bi.dust = v), 0.5, "set by Filler 1"),
    (S.mix.materials.F2?.name || "").trim() ? field(`${matName("F2")}, % fixed`, () => bi.f2, (v) => (bi.f2 = v), 0.5, "Filler 2") : null));
  const split = (arr, key, title) => h("div", { class: "split" }, h("div", { class: "l" }, title),
    arr.map((s) => field(matName(s), () => bi[key][s] ?? 0, (v) => (bi[key][s] = v), 5, null)),
    h("div", { class: "n", id: "sum-" + key }, ""));
  box.append(h("div", { class: "splits" }, split(ca, "ca_vol", "Coarse piles, % by volume (total 100)"), split(fa, "fa_vol", "Fine piles, % by volume (total 100)")));
  box.append(h("div", { class: "l", style: "margin-top:14px" }, "Resulting blend, % by mass"), h("div", { class: "chips5", id: "bi-result" }));
  box.append(h("p", { class: "hint" }, "Switch to Stockpile % to fine-tune pile by pile. The blend carries over."));
  return box;
}
async function runForward(t) {
  clearTimeout(runForward._t);
  runForward._t = setTimeout(async () => {
    const bi = t.bailey_inputs; if (!bi) return;
    const sumv = (o) => Object.values(o || {}).reduce((a, b) => a + (num(b) || 0), 0);
    ["ca_vol", "fa_vol"].forEach((k) => { const e = $("#sum-" + k); if (e) { const v = sumv(bi[k]); e.textContent = `Total ${fmt(v, 1)}%`; e.className = "n " + (Math.abs(v - 100) > 0.05 ? "st-high" : "st-ok"); } });
    const out = $("#bi-result");
    try {
      if (Math.abs(sumv(bi.ca_vol) - 100) > 0.05 || Math.abs(sumv(bi.fa_vol) - 100) > 0.05) throw new Error("Each volume split must total 100%.");
      const r = await api("/api/forward", { mix: S.mix, cuw: bi.cuw, ca_vol: bi.ca_vol, fa_vol: bi.fa_vol, dust: bi.dust ?? 0, f2: bi.f2 || 0, nmas: S.an?.nmas || num(S.mix.settings.nmas_override) || 12.5 });
      readySlots().forEach((s) => (t.pct[s] = num(r.blend.pct[s]) || 0));
      if (out) { out.innerHTML = ""; readySlots().forEach((s) => out.append(h("div", { class: "chip5" }, h("i", { style: `background:${slotColor(s)}` }), h("span", {}, matName(s)), h("b", {}, fmt(t.pct[s], 1)))));
        out.append(h("div", { class: "chip5 note" }, h("span", {}, "Coarse volume"), h("b", {}, fmt(r.blend.vol_ca, 1) + "%"))); }
      scheduleSave(); liveUpdate(t, true);
    } catch (e) { if (out) { out.innerHTML = ""; out.append(h("div", { class: "warnline" }, e.message)); } }
  }, 150);
}

function binderBlock(t, tested) {
  const box = h("section", { class: "card binder" });
  const inp = h("input", { type: "text", inputmode: "decimal", value: num(t.results?.pb) != null ? fmt(t.results.pb, 1) : "", "aria-label": "Binder content, %", class: "pb" });
  const setPb = (v) => { t.results = t.results || {}; t.results.pb = v; changed(); liveUpdate(t); };
  inp.addEventListener("input", () => setPb(num(inp.value)));
  const st = (d) => { const v = Math.max(0, +((num(t.results?.pb) || 0) + d).toFixed(1)); inp.value = fmt(v, 1); setPb(v); };
  box.append(h("div", {}, h("h2", {}, tested ? "Binder content tested" : "Binder"),
    h("span", { class: "stepper big" }, h("button", { class: "stp", "aria-label": "Less binder", onclick: () => st(-0.1) }, "−"), inp, h("button", { class: "stp", "aria-label": "More binder", onclick: () => st(0.1) }, "+"), h("span", { class: "u" }, "% Pb"))),
    h("div", { id: "pb-note", class: "pbnote" }));
  return box;
}

/* live prediction for the trial being edited */
function liveUpdate(t, now) {
  clearTimeout(liveUpdate._t);
  liveUpdate._t = setTimeout(async () => {
    try {
      if (t.ref && isTested(t.ref) && t.ref !== t.id) {
        const r = await api("/api/predict", { mix: S.mix, ref: t.ref, pct: t.pct });
        S.live[t.id] = { pred: r.prediction, an: r.analysis };
        if (!isTested(t.id)) { t.prediction = r.prediction; t.reference = t.ref; scheduleSave(); }
      } else {
        const a = await api("/api/preview", { mix: S.mix, pct: t.pct });
        S.live[t.id] = { an: a };
      }
    } catch (e) { S.live[t.id] = { error: e.message }; }
    if (S.sel === t.id && S.tab === "trials") {
      const side = $(".side"); if (side && S.sub === "blend") renderBlendSide(side, t);
      if (S.sub === "blend") updatePbNote(t);
      const rail = $(".rail"); if (rail) renderRail(rail);
    }
  }, now ? 0 : 140);
}
const vaAtPb = (p, pb) => (p && pb != null) ? p.va_at_pb - (pb - p.pb) * (p.ac_factor || 2.25) : null;
function updatePbNote(t) {
  const e = $("#pb-note"); if (!e) return;
  e.innerHTML = "";
  const L = S.live[t.id], p = L?.pred, est = L?.an?.est_pb;
  if (p) {
    const pb = num(t.results?.pb);
    e.append(h("div", {}, `Recommended for ${fmt(S.mix.targets?.va, 1)}% air voids: `, h("b", {}, fmt(p.pb, 2) + "%"), ". ",
      pb == null || Math.abs(pb - p.pb) > 0.049 ? h("button", { class: "btn link", onclick: () => { t.results.pb = +p.pb.toFixed(1); changed(); render(); } }, "Use it") : null));
    e.append(h("div", { class: "hint" }, `Once VMA is within ±${tolVMA()} of target, keep the blend and change only the binder.`));
  } else if (est) {
    e.append(h("div", {}, "Starting estimate from your targets and absorption: ", h("b", {}, fmt(est.pb, 1) + "%"), ` (Pba ${fmt(est.pba, 2)} plus Pbe ${fmt(est.pbe, 2)}). `,
      num(t.results?.pb) == null ? h("button", { class: "btn link", onclick: () => { t.results.pb = +est.pb.toFixed(1); changed(); render(); } }, "Use it") : null));
  } else e.append(h("div", { class: "hint" }, "Set VMA and air-void targets in Criteria to get a binder estimate."));
}
function phaseOf(vma) {
  const vt = num(S.mix.targets?.vma);
  if (vt == null || vma == null) return null;
  return Math.abs(vma - vt) <= tolVMA() ? ["on", "VMA on target: tune binder"] : ["off", "Adjusting blend for VMA"];
}

function renderBlendSide(side, t) {
  side.innerHTML = "";
  const L = S.live[t.id] || {}, A = L.an, P = L.pred;
  const tested = isTested(t.id);
  const ph = $("#t-phase");
  const tg = S.mix.targets || {};
  if (tested) { renderTrialSide(side, t); return; }
  if (P) {
    const pb = num(t.results?.pb) ?? P.pb;
    const va = vaAtPb(P, pb);
    const vfa = P.vma ? 100 * (P.vma - va) / P.vma : null;
    const pz = phaseOf(P.vma);
    if (ph) { ph.textContent = pz ? pz[1] : ""; ph.className = "phase " + (pz ? pz[0] : ""); }
    const off = (v, t0, d) => (t0 == null || v == null) ? "" : Math.abs(v - t0) < 0.05 ? "on target" : `${fmt(Math.abs(v - t0), d)} ${v > t0 ? "above" : "below"} ${fmt(t0, d)}`;
    const okc = (v, t0, tol) => (t0 == null || v == null) ? "" : Math.abs(v - t0) <= tol ? "ok" : "off";
    const st = A?.status || {};
    const ref = trialById(t.ref), refA = anTrial(t.ref);
    const card = h("div", { class: "card live" }, h("div", { class: "cardhead" }, h("h2", {}, "Predicted, live"), h("span", { class: "hint" }, `from ${ref?.label} by rules of thumb`)),
      h("div", { class: "kpi3" },
        h("div", {}, h("span", { class: "k" }, "VMA"), h("b", {}, fmt(P.vma, 1) + "%"), h("span", { class: "n " + okc(P.vma, num(tg.vma), tolVMA()) }, off(P.vma, num(tg.vma), 1))),
        h("div", {}, h("span", { class: "k" }, `Air voids at ${fmt(pb, 1)}%`), h("b", {}, fmt(va, 1) + "%"), h("span", { class: "n " + okc(va, num(tg.va), 0.2) }, off(va, num(tg.va), 1))),
        h("div", {}, h("span", { class: "k" }, "VFA"), h("b", {}, fmt(vfa, 1) + "%"), h("span", { class: "n" }, P.vca_mix != null ? `VCAmix ${fmt(P.vca_mix, 1)}%` : ""))),
      h("div", { class: "k", style: "margin-top:12px" }, "Where the VMA change comes from"),
      h("div", { class: "terms" }, Object.entries(P.terms).map(([k, x]) => h("div", {}, h("span", {}, k === "PCS" ? "Coarse volume" : k + " ratio"), h("b", { class: x > 0.005 ? "up" : x < -0.005 ? "down" : "" }, sgn(x, 2))))),
      h("div", { class: "k", style: "margin-top:12px" }, `Bailey values: ${ref?.label} (grey) and ${t.label} (navy)`),
      baileyBars(refA, A),
      warnList(t, A, P));
    side.append(card);
  } else if (A) {
    if (ph) { ph.textContent = ""; ph.className = "phase"; }
    side.append(h("div", { class: "card live" }, h("h2", {}, "This blend"),
      h("p", { class: "hint" }, t.ref ? "Prediction needs the reference trial to be tested." : "VMA and binder can only be predicted after a trial is tested. This one sets the baseline."),
      baileyBars(null, A), warnList(t, A, null)));
  } else if (L.error) side.append(h("div", { class: "notice" }, L.error));
  const series = [];
  if (t.ref && anTrial(t.ref)?.gradation) series.push({ name: trialById(t.ref).label, grad: anTrial(t.ref)[S.chartBasis === "volume" ? "gradation_volume" : "gradation"], cls: "ref", color: C_REF });
  if (A?.gradation) series.push({ name: t.label, grad: A[S.chartBasis === "volume" ? "gradation_volume" : "gradation"], cls: "prop", color: C_PROP });
  side.append(chartCard(series, A?.nmas || S.an?.nmas));
}
function warnList(t, A, P) {
  const w = [];
  if (!A) return null;
  const st = A.status || {};
  (st.control_points || []).forEach((c) => w.push(`${sieveName(c.sieve)} is ${fmt(c.value, 1)}%, ${c.side === "low" ? "below" : "above"} its control point.`));
  (st.soft_points || []).forEach((c) => w.push(`${sieveName(c.sieve)} is ${fmt(c.value, 1)}%, outside your soft target of ${c.lo ?? "..."} to ${c.hi ?? "..."}%.`));
  const [small, mn] = smallPiles(t.pct, t.locks);
  small.forEach(([s, x]) => w.push(`${matName(s)} is ${fmt(x, 1)}%, below your ${fmt(mn, 1)}% minimum.`));
  if (Math.abs(pctSum(t.pct) - 100) > 0.05) w.push(`The blend totals ${fmt(pctSum(t.pct), 1)}%. It must be 100.`);
  if (A.nmas_detected && S.an?.nmas && A.nmas_detected !== S.an.nmas) w.push(`This blend reads as ${A.nmas_detected} mm NMAS, not ${S.an.nmas} mm.`);
  if (P?.large_moves?.length) w.push(`Large change in ${P.large_moves.join(", ")}. The rules of thumb are linear, so treat this as a direction.`);
  const vcad = num(S.mix.targets?.vcadrc);
  if (vcad && P?.vca_mix > vcad) w.push(`Predicted VCAmix ${fmt(P.vca_mix, 1)}% is above VCA dry-rodded ${fmt(vcad, 1)}%.`);
  (A.warnings || []).forEach((x) => w.push(x));
  if (!w.length) return h("div", { class: "okline" }, "All control points and soft targets met.");
  return h("ul", { class: "warns" }, w.map((x) => h("li", {}, x)));
}
function baileyBars(refA, A) {
  if (!A) return null;
  const rng = S.mix.bailey_ranges || S.an?.default_ranges || {};
  const isFG = mixType() === "fg";
  const rows = [["ca_ruw", typeInfo().uw_label, (a) => a?.bailey?.cuw_pct, 1, [Math.min(50, (rng.ca_ruw?.[0] ?? 100) - 20), (rng.ca_ruw?.[1] ?? 120) + 15]],
    ["CA", (isFG ? "New " : "") + "CA", (a) => a?.ratios?.CA, 2, [0, isFG ? 1.4 : 1.0]], ["FAc", (isFG ? "New " : "") + "FAc", (a) => a?.ratios?.FAc, 2, [0.2, 1.0]], ["FAf", (isFG ? "New " : "") + "FAf", (a) => a?.ratios?.FAf, 2, [0.2, 1.0]]];
  return h("div", { class: "bars" }, rows.map(([k, t, get, d, dom]) => {
    const v = get(A), r = refA ? get(refA) : null, R = rng[k] || [];
    if (v == null) return null;
    const lo = Math.min(dom[0], v, r ?? v), hi = Math.max(dom[1], v, r ?? v);
    const pos = (x) => (100 * (x - lo) / (hi - lo)).toFixed(1);
    const inR = (x) => (R[0] == null || x >= R[0]) && (R[1] == null || x <= R[1]);
    const dist = (x) => (R[0] != null && x < R[0] ? R[0] - x : R[1] != null && x > R[1] ? x - R[1] : 0);
    const arrow = r == null ? "" : v > r + Math.pow(10, -d) / 2 ? "↑" : v < r - Math.pow(10, -d) / 2 ? "↓" : "=";
    const cls = r == null ? "" : dist(v) < dist(r) - 1e-6 ? "better" : dist(v) > dist(r) + 1e-6 ? "worse" : "";
    return h("div", { class: "bar" }, h("span", { class: "bk" }, t),
      h("span", { class: "track" }, (R[0] != null || R[1] != null) ? h("i", { class: "rng", style: `left:${pos(R[0] ?? lo)}%;width:${pos(R[1] ?? hi) - pos(R[0] ?? lo)}%` }) : null,
        r != null ? h("i", { class: "ref", style: `left:calc(${pos(r)}% - 1px)` }) : null,
        h("i", { class: "cur " + (inR(v) ? "in" : "out"), style: `left:calc(${pos(v)}% - 2px)` })),
      h("span", { class: "bv" }, r != null ? [fmt(r, d), " ", h("span", { class: "arw " + cls }, arrow), " "] : null, h("b", {}, fmt(v, d))));
  }));
}

/* ---------- lab results */
function labOf(t) {
  t.results = t.results || {};
  const r = t.results;
  r.gmb = Array.isArray(r.gmb) ? r.gmb : [];
  r.gmm = Array.isArray(r.gmm) ? r.gmm : [];
  r.lab = r.lab || {};
  const L = r.lab;
  if (!Array.isArray(L.spec)) L.spec = [];
  const n = Math.max(2, r.gmb.length, L.spec.length);
  while (L.spec.length < n) L.spec.push({ h: null, mass: null });
  while (r.gmb.length < n) r.gmb.push(null);
  while (r.gmm.length < 2) r.gmm.push(null);
  return L;
}
function renderLab(body, side, t) {
  const L = labOf(t), idx = S.mix.trials.indexOf(t), R = ["trials", idx, "results"];
  body.append(h("p", { class: "intro" }, "What you measured for this trial. The results update as you type."));
  body.append(h("section", { class: "card" }, h("h2", {}, "Mix and compaction"),
    h("div", { class: "fgrid four" },
      h("label", { class: "f" }, h("span", {}, "Binder content Pb, %"), numInput(R.concat("pb"))),
      h("label", { class: "f" }, h("span", {}, "Gyrations, Ndes"), numInput(R.concat(["lab", "ndes"]), { placeholder: "e.g. 75" })),
      h("label", { class: "f" }, h("span", {}, "Compaction temperature, °C"), numInput(R.concat(["lab", "temp"]), { placeholder: "optional" })),
      h("label", { class: "f" }, h("span", {}, "VCA dry-rodded, %"), numInput(R.concat("vcadrc"), { placeholder: "optional" })))));
  const sb = h("tbody", {});
  L.spec.forEach((s, i) => sb.append(h("tr", {}, h("th", { class: "rowh" }, `Specimen ${i + 1}`),
    h("td", {}, numInput(R.concat(["gmb", i]), { grid: [i, 0, "spec" + idx], cls: "result" })),
    h("td", {}, numInput(R.concat(["lab", "spec", i, "h"]), { grid: [i, 1, "spec" + idx] })),
    h("td", {}, numInput(R.concat(["lab", "spec", i, "mass"]), { grid: [i, 2, "spec" + idx] })))));
  body.append(h("section", { class: "card" }, h("h2", {}, "Compacted specimens"),
    h("table", { class: "grid compact" }, h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, ""), h("th", {}, "Gmb"), h("th", {}, "Height, mm"), h("th", {}, "Mass, g"))), sb),
    h("div", { class: "row note" }, h("button", { class: "btn link", onclick: () => { L.spec.push({ h: null, mass: null }); t.results.gmb.push(null); changed(); render(); } }, "Add a specimen"),
      L.spec.length > 1 ? h("button", { class: "btn link", onclick: () => { L.spec.pop(); t.results.gmb.pop(); changed({ now: true }); render(); } }, "Remove last") : null,
      h("span", { class: "hint", id: "gmb-note" }))));
  const gb = h("tbody", {});
  t.results.gmm.forEach((g, i) => gb.append(h("tr", {}, h("th", { class: "rowh" }, `Sample ${i + 1}`), h("td", {}, numInput(R.concat(["gmm", i]), { grid: [i, 0, "gmm" + idx], cls: "result" })))));
  body.append(h("section", { class: "card" }, h("h2", {}, "Maximum specific gravity"),
    h("table", { class: "grid compact narrow" }, h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, ""), h("th", {}, "Gmm"))), gb),
    h("div", { class: "row note" }, h("button", { class: "btn link", onclick: () => { t.results.gmm.push(null); changed(); render(); } }, "Add a sample"),
      t.results.gmm.length > 1 ? h("button", { class: "btn link", onclick: () => { t.results.gmm.pop(); changed({ now: true }); render(); } }, "Remove last") : null)));
  const upd = () => {
    const g = t.results.gmb.map(num).filter((x) => x != null);
    const note = $("#gmb-note");
    if (note) note.textContent = g.length > 1 && Math.max(...g) - Math.min(...g) > 0.02 ? `Gmb spread is ${fmt(Math.max(...g) - Math.min(...g), 3)}. More than about 0.02 is worth a check.` : "";
    renderTrialSide(side, t);
    const st = trialStatus(t), se = $("#t-status"); if (se) { se.textContent = st; se.className = "status " + st.toLowerCase(); }
    const rail = $(".rail"); if (rail) renderRail(rail);
  };
  upd();
  S.refresh = upd;
}

/* ---------- results */
function renderResults(body, side, t) {
  const a = anTrial(t.id);
  const v = a?.volumetrics || {};
  const tg = S.mix.targets || {};
  if (!v.complete) {
    body.append(h("div", { class: "notice" }, "Enter the binder content, Gmb and Gmm in Lab results to see the results of this trial.",
      h("button", { class: "btn small", style: "margin-left:12px", onclick: () => { S.sub = "lab"; render(); } }, "Open Lab results")));
    renderTrialSide(side, t); S.refresh = () => renderTrialSide(side, t); return;
  }
  const off = (x, t0, d) => t0 == null ? ["no target", "plain"] : Math.abs(x - t0) < 0.05 ? ["on target", "ok"] : [`${fmt(Math.abs(x - t0), d)} ${x > t0 ? "above" : "below"} ${fmt(t0, d)}`, Math.abs(x - t0) <= (d === 1 ? 0.2 : 0.2) ? "ok" : "off"];
  const vo = off(v.vma, num(tg.vma), 1), ao = off(v.va, num(tg.va), 1);
  const vcad = num(t.results?.vcadrc) ?? num(tg.vcadrc);
  const kp = [["VMA", fmt(v.vma, 1) + "%", vo[0], vo[1]], ["Air voids", fmt(v.va, 1) + "%", ao[0], ao[1]], ["VFA", fmt(v.vfa, 1) + "%", (tg.vfa?.[0] != null || tg.vfa?.[1] != null) ? `limits ${tg.vfa?.[0] ?? "..."} to ${tg.vfa?.[1] ?? "..."}` : "no limit set", "plain"],
    ["VCAmix", fmt(v.vca_mix, 1) + "%", vcad ? `VCA dry-rodded ${fmt(vcad, 1)}%` : "add VCA dry-rodded to check", vcad ? (v.vca_ok ? "ok" : "off") : "plain"],
    ["Effective binder", fmt(v.pbe, 2) + "%", `Pba ${fmt(v.pba, 2)}%, Gse ${fmt(v.gse, 3)}`, "plain"]];
  body.append(h("div", { class: "kpis" }, kp.map(([k, val, n, c]) => h("div", { class: "kpi" }, h("span", { class: "k" }, k), h("b", {}, val), h("span", { class: "n " + c }, n)))));
  const e = a.prediction_error;
  if (t.prediction && e) {
    body.append(h("section", { class: "card" }, h("h2", {}, "How the prediction did"),
      h("div", { class: "fgrid three" },
        h("div", {}, h("span", { class: "k" }, "VMA"), h("div", {}, h("b", {}, `Predicted ${fmt(t.prediction.vma, 1)}`), `, measured ${fmt(v.vma, 1)}. Off by ${fmt(Math.abs(e.vma), 1)}.`)),
        h("div", {}, h("span", { class: "k" }, `Air voids at ${fmt(v.pb, 1)}% Pb`), h("div", {}, e.va_pred_at_actual_pb != null ? [h("b", {}, `Predicted ${fmt(e.va_pred_at_actual_pb, 1)}`), `, measured ${fmt(v.va, 1)}. Off by ${fmt(Math.abs(e.va), 1)}.`] : "-")),
        h("div", {}, h("span", { class: "k" }, "What it means"), h("div", {}, Math.abs(e.vma) <= 0.5 ? "Inside the usual ±0.5% for the rules of thumb." : "Larger than the usual ±0.5%. After 3 tested trials, try fitting the rules of thumb in Criteria.")))));
  }
  body.append(h("section", { class: "card" }, h("h2", {}, "Bailey values"), baileyBars(null, a), h("p", { class: "hint" }, "Green band: your range from Criteria. The tick is this trial.")));
  const w = warnList(t, a, null);
  if (w) body.append(h("section", { class: "card" }, h("h2", {}, "Gradation checks"), w));
  const vt = num(tg.vma), onV = vt != null && Math.abs(v.vma - vt) <= tolVMA();
  const nxt = (S.mix.trials.length + 1);
  body.append(h("section", { class: "next" }, h("div", { class: "grow" }, h("h2", {}, onV ? "VMA is on target: tune the binder" : `Next: plan Trial ${nxt}`),
    h("p", {}, vt == null ? "Set a VMA target in Criteria so the tool knows where to aim." :
      onV ? `VMA is within ±${tolVMA()} of ${fmt(vt, 1)}. Keep this blend and change the binder to reach ${fmt(tg.va, 1)}% air voids.` :
        `VMA is ${fmt(Math.abs(v.vma - vt), 1)} ${v.vma > vt ? "above" : "below"} target, so the blend still needs a change. The tool suggests a blend and binder, and you can change any pile or the binder and watch the result update.`)),
    h("div", { class: "col" }, h("button", { class: "btn primary", onclick: () => planNext(t.id, onV) }, onV ? "Binder only, next trial" : `Plan Trial ${nxt}`),
      h("button", { class: "btn link", onclick: () => planNext(t.id, !onV) }, onV ? "Change the blend instead" : "Keep this blend, change binder only"))));
  renderTrialSide(side, t);
  const rr = () => render(); rr.isRender = true;
  S.refresh = rr;
}
function renderTrialSide(side, t) {
  side.innerHTML = "";
  const series = [];
  (S.mix.trials || []).forEach((x) => {
    const a = anTrial(x.id); if (!a?.gradation) return;
    if (x.id === t.id) return;
    series.push({ name: x.label, grad: a[S.chartBasis === "volume" ? "gradation_volume" : "gradation"], cls: "old", color: C_OLD });
  });
  const a = anTrial(t.id);
  if (a?.gradation) series.push({ name: t.label, grad: a[S.chartBasis === "volume" ? "gradation_volume" : "gradation"], cls: "cur", color: C_CUR });
  side.append(chartCard(series, S.an?.nmas));
  if (a && S.sub === "lab") {
    const v = a.volumetrics || {};
    side.append(h("div", { class: "card" }, h("h2", {}, "From these numbers"),
      [["Gmb, average", fmt(v.gmb, 3)], ["Gmm, average", fmt(v.gmm, 3)], ["Air voids", fmt(v.va, 1) + "%"], ["VMA", fmt(v.vma, 1) + "%"], ["VFA", fmt(v.vfa, 1) + "%"]].map(([k, x]) => h("div", { class: "kv" }, h("span", {}, k), h("b", {}, x))),
      v.complete ? h("button", { class: "btn primary block", style: "margin-top:12px", onclick: () => { S.sub = "results"; render(); } }, "See full results") : h("p", { class: "hint" }, "The trial counts as tested once Pb, Gmb and Gmm are in.")));
  }
}

/* ---------------------------------------------------------------- 4 Compare */
function renderCompare(page) {
  page.classList.add("two");
  const main = h("section", { class: "main" }), side = h("aside", { class: "side" });
  page.append(main, side);
  const T = S.mix.trials || [];
  main.append(h("div", { class: "head" }, h("div", {}, h("h1", {}, "Compare trials"), h("p", { class: "intro" }, "Every trial side by side, and how the design is converging.")),
    h("div", { class: "row" }, h("button", { class: "btn", onclick: () => copyGrid("#cmp-grid") }, "Copy for Excel"), h("button", { class: "btn", onclick: downloadMix }, "Download mix file"), h("button", { class: "btn primary", onclick: () => window.print() }, "Print"))));
  if (!T.length) { main.append(h("div", { class: "notice" }, "No trials yet.")); return; }
  const tg = S.mix.targets || {};
  const rng = S.mix.bailey_ranges || S.an?.default_ranges || {};
  const col = (t) => anTrial(t.id) || {};
  const grp = (k) => h("tr", { class: "grp" }, h("th", { colspan: T.length + 2 }, k));
  const row = (k, f, target) => h("tr", {}, h("th", { class: "rowh" }, k), T.map((t) => h("td", { class: "calc" + (isTested(t.id) ? "" : " planned") }, f(t, col(t)))), h("td", { class: "calc tgt" }, target ?? ""));
  const slots = readySlots();
  const cps = S.mix.control_points || {};
  const keySieves = sieves().filter((s) => { const c = cps[s] || {}; return [c.min, c.max, c.soft_min, c.soft_max].some((x) => num(x) != null); });
  const pv = (t) => S.live[t.id]?.pred || t.prediction;
  const rows = [grp("Blend, % of aggregate"), ...slots.map((s) => row(matName(s), (t) => fmt(num(t.pct?.[s]) || 0, 1))),
    grp("Volumetrics (planned trials show predictions)"),
    row("Binder Pb, %", (t, a) => fmt(a.volumetrics?.pb ?? num(t.results?.pb), 1)),
    row("VMA, %", (t, a) => a.volumetrics?.complete ? fmt(a.volumetrics.vma, 1) : (pv(t) ? fmt(pv(t).vma, 1) : "-"), num(tg.vma) != null ? fmt(tg.vma, 1) : ""),
    row("Air voids, %", (t, a) => a.volumetrics?.complete ? fmt(a.volumetrics.va, 1) : (pv(t) ? fmt(vaAtPb(pv(t), num(t.results?.pb) ?? pv(t).pb), 1) : "-"), num(tg.va) != null ? fmt(tg.va, 1) : ""),
    row("VFA, %", (t, a) => fmt(a.volumetrics?.vfa, 1)),
    row("VCAmix, %", (t, a) => fmt(a.volumetrics?.vca_mix, 1)),
    grp("Bailey"),
    row(typeInfo().uw_label, (t, a) => fmt(a.bailey?.cuw_pct, 1), rng.ca_ruw ? `${rng.ca_ruw[0]} to ${rng.ca_ruw[1]}` : ""),
    row("CA ratio", (t, a) => fmt(a.ratios?.CA, 2), rng.CA?.[0] != null ? `${rng.CA[0]} to ${rng.CA[1]}` : ""),
    row("FAc ratio", (t, a) => fmt(a.ratios?.FAc, 2), rng.FAc ? `${rng.FAc[0]} to ${rng.FAc[1]}` : ""),
    row("FAf ratio", (t, a) => fmt(a.ratios?.FAf, 2), rng.FAf ? `${rng.FAf[0]} to ${rng.FAf[1]}` : ""),
    keySieves.length ? grp("Gradation, % passing") : null,
    ...keySieves.map((s) => { const c = cps[s]; const lim = [c.min != null ? `${c.min} to ${c.max}` : "", c.soft_min != null ? `soft ${c.soft_min} to ${c.soft_max}` : ""].filter(Boolean).join(", ");
      return row(`${lab(s)[0]} (${lab(s)[1]})`, (t, a) => fmt(a.gradation?.[+s] ?? a.gradation?.[s], 1), lim); })];
  main.append(h("div", { class: "gridwrap" }, h("table", { class: "grid cmp", id: "cmp-grid" },
    h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, ""), T.map((t) => h("th", { class: isTested(t.id) ? "" : "planned" }, t.label, h("small", {}, trialStatus(t)))), h("th", {}, "Target"))),
    h("tbody", {}, rows))));
  // accuracy
  const acc = h("section", { class: "card", id: "acc" });
  main.append(acc);
  const mode = S.accMode || "previous";
  const loadAcc = async () => {
    acc.innerHTML = "";
    const sel = h("select", { "aria-label": "Predict each trial from" }, h("option", { value: "previous", selected: mode === "previous" ? true : null }, "the trial before it"), h("option", { value: "first", selected: mode === "first" ? true : null }, "the first tested trial"));
    sel.addEventListener("change", () => { S.accMode = sel.value; render(); });
    acc.append(h("div", { class: "cardhead" }, h("h2", {}, "How good are the predictions?"), h("span", { class: "row" }, h("span", { class: "hint" }, "Predict each trial from"), sel)));
    let r;
    try { r = await api("/api/accuracy", { mix: S.mix, mode }); } catch (e) { acc.append(h("p", { class: "hint" }, e.message)); return; }
    if (!r.rows.length) { acc.append(h("p", { class: "hint" }, "Needs two tested trials.")); return; }
    acc.append(h("table", { class: "grid compact" }, h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Trial"), h("th", {}, "From"), h("th", {}, "VMA predicted"), h("th", {}, "measured"), h("th", {}, "error"), h("th", {}, "Va predicted"), h("th", {}, "measured"), h("th", {}, "error"))),
      h("tbody", {}, r.rows.map((x) => h("tr", {}, h("th", { class: "rowh" }, x.label), h("td", { class: "calc" }, x.ref_label), h("td", { class: "calc" }, fmt(x.vma_pred, 1)), h("td", { class: "calc" }, fmt(x.vma, 1)),
        h("td", { class: "calc " + (Math.abs(x.vma_err) <= 0.5 ? "st-ok" : "st-high") }, sgn(x.vma_err, 1)), h("td", { class: "calc" }, fmt(x.va_pred, 1)), h("td", { class: "calc" }, fmt(x.va, 1)), h("td", { class: "calc" }, sgn(x.va_err, 1)))))),
      h("p", {}, `${r.within_05} of ${r.n} within ±0.5% VMA. The goal is 8 in 10.`),
      h("div", { class: "row" }, h("button", { class: "btn", disabled: r.tested < 3 ? true : null, onclick: () => { S.tab = "criteria"; render(); runFit(); } }, r.tested < 3 ? `Fit the rules of thumb (after 3 tested, ${r.tested} so far)` : "Fit the rules of thumb to my trials"),
        h("span", { class: "hint" }, "Fitting keeps each factor inside its typical range for the mix type.")));
  };
  loadAcc();
  // side charts
  const done = testedAn();
  side.append(trendCard("VMA by trial", "vma", num(tg.vma)), trendCard("Air voids by trial", "va", num(tg.va)));
  const series = T.map((t, i) => { const a = anTrial(t.id); return a?.gradation ? { name: t.label, grad: a.gradation, cls: i === T.length - 1 ? "cur" : "old", color: i === T.length - 1 ? C_CUR : C_OLD } : null; }).filter(Boolean);
  side.append(chartCard(series, S.an?.nmas, true));
  S.refresh = null;
}
function trendCard(title, key, target) {
  const T = S.mix.trials || [];
  const pts = T.map((t) => {
    const a = anTrial(t.id);
    if (a?.volumetrics?.complete) return { x: t.label, v: a.volumetrics[key], pred: false };
    const p = S.live[t.id]?.pred || t.prediction;
    if (p && Math.abs(pctSum(t.pct) - 100) <= 0.05) return { x: t.label, v: key === "vma" ? p.vma : vaAtPb(p, num(t.results?.pb) ?? p.pb), pred: true };
    return null;
  }).filter((p) => p && p.v != null);
  const card = h("div", { class: "card" }, h("h2", {}, title));
  if (!pts.length) { card.append(h("p", { class: "hint" }, "Appears once a trial is tested.")); return card; }
  const W = 420, H = 180, L = 40, R = 24, Tp = 30, B = 30;
  const vals = pts.map((p) => p.v).concat(target != null ? [target] : []);
  let lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const X = (i) => pts.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (pts.length - 1);
  const Y = (v) => Tp + (hi - v) / (hi - lo) * (H - Tp - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  for (let v = lo; v <= hi; v += (hi - lo > 6 ? 2 : 1)) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  if (target != null) s += `<line class="tgt" x1="${L}" x2="${W - R}" y1="${Y(target)}" y2="${Y(target)}"/><text class="ax" x="${W - R}" y="${Y(target) - 5}" text-anchor="end">target ${fmt(target, 1)}</text>`;
  const real = pts.map((p, i) => [X(i), Y(p.v), p]);
  const solid = real.filter((r) => !r[2].pred);
  if (solid.length > 1) s += `<polyline class="tl" points="${solid.map((r) => r[0] + "," + r[1]).join(" ")}"/>`;
  real.forEach((r, i) => { if (r[2].pred && i > 0) s += `<line class="tl pred" x1="${real[i - 1][0]}" y1="${real[i - 1][1]}" x2="${r[0]}" y2="${r[1]}"/>`; });
  real.forEach((r) => (s += `<circle class="${r[2].pred ? "pd" : "pt"}" cx="${r[0]}" cy="${r[1]}" r="5"/><text class="vl" x="${r[0]}" y="${r[1] - 10}" text-anchor="middle">${fmt(r[2].v, 1)}</text><text class="ax" x="${r[0]}" y="${H - 8}" text-anchor="middle">${esc(r[2].x)}${r[2].pred ? " (pred.)" : ""}</text>`));
  card.append(h("div", { class: "chart", html: s + "</svg>" }));
  return card;
}

/* ---------------------------------------------------------------- Bailey reference */
function renderReference() {
  const M = S.meta, ty = M.types;
  const wrap = h("div", { class: "reference" });
  wrap.append(h("div", { class: "row" }, h("h1", {}, "Bailey reference"), h("span", { class: "spacer" }), S.mix ? h("button", { class: "btn", onclick: () => { S.tab = "criteria"; render(); } }, "Back to my mix") : h("button", { class: "btn", onclick: home }, "Back to my mixes")),
    h("p", { class: "intro" }, "Typical values for each mix type, from W.J. Pine's course The Bailey Method: Achieving Volumetrics and HMA Compactability (2023). Where they differ from TRB E-C044 (2002), these are used. They load as your starting values when you pick a mix type and NMAS in Criteria. After 3 tested trials, the tool can fit the rules of thumb to your own mix."));
  const k3 = ["sma", "cg", "fg"];
  const rows = [
    ["Unit weights"],
    ["Coarse chosen unit weight", (t) => `${ty[t].uw_range[0]} to ${ty[t].uw_range[1]}% of ${ty[t].uw_ref.toUpperCase()}. Start at ${ty[t].uw_start}.`],
    ["Fine unit weight", (t) => `100% of ${ty[t].fa_ref.toUpperCase()}`],
    ["Bailey ranges"],
    ["CA ratio", (t) => t === "fg" ? `New CA ${ty.fg.CA[0].toFixed(2)} to ${ty.fg.CA[1].toFixed(2)}` : "By NMAS, see below"],
    ["FAc ratio", (t) => `${t === "fg" ? "New FAc " : ""}${ty[t].FAc[0].toFixed(2)} to ${ty[t].FAc[1].toFixed(2)}`],
    ["FAf ratio", (t) => `${t === "fg" ? "New FAf " : ""}${ty[t].FAf[0].toFixed(2)} to ${ty[t].FAf[1].toFixed(2)}`],
    ["Ratio where VMA is lowest (dip)", (t) => `FAc ${ty[t].rot.FAc_dip.toFixed(2)}, FAf ${ty[t].rot.FAf_dip.toFixed(2)}`],
    ["VMA rules of thumb: change for 1% VMA"],
    ["Coarse fraction (PCS)", (t) => `${ty[t].rot.PCS}% passing ${t === "fg" ? "original " : ""}PCS (${ty[t].rot_range.PCS[0]} to ${ty[t].rot_range.PCS[1]}). ${ty[t].pcs_dir < 0 ? "Less passing, more VMA." : "More passing, more VMA."}`],
    ["CA ratio", (t) => `${t === "fg" ? "New CA " : ""}${ty[t].rot.CA} (${ty[t].rot_range.CA[0]} to ${ty[t].rot_range.CA[1]}). Higher CA, more VMA.`],
    ["FAc and FAf ratios", (t) => `${ty[t].rot.FAc} each (${ty[t].rot_range.FAc[0]} to ${ty[t].rot_range.FAc[1]}). Toward the dip, less VMA.`],
    ["Strongest lever", (t) => ty[t].lever],
    ["Binder and checks"],
    ["Binder to air voids", (t) => `1% more effective binder lowers air voids by about ${ty[t].rot.AC} (${ty[t].rot_range.AC[0]} to ${ty[t].rot_range.AC[1]})`],
    ["Absorbed binder, Pba", (t) => `${ty[t].rot.pba_abs} times the combined water absorption`],
    ["VCA check", (t) => ty[t].vca],
    ["Gradation band", (t) => ty[t].band],
  ];
  wrap.append(h("div", { class: "gridwrap" }, h("table", { class: "grid ref" },
    h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "By mix type"), k3.map((t) => h("th", {}, ty[t].label)))),
    h("tbody", {}, rows.map((r) => r.length === 1 ? h("tr", { class: "grp" }, h("th", { colspan: 4 }, r[0])) : h("tr", {}, h("th", { class: "rowh" }, r[0]), k3.map((t) => h("td", {}, r[1](t)))))))));
  const ns = ["37.5", "25.0", "19.0", "12.5", "9.5", "4.75"];
  const fgc = (n) => { const c = M.fg_control[n]; return c ? `${c.slice(0, 4).map((x) => x == null ? "none" : x).join(", ")}` : "-"; };
  wrap.append(h("div", { class: "cols2" },
    h("section", { class: "card" }, h("h2", {}, "Control sieves by NMAS, mm"),
      h("p", { class: "hint" }, "Half = 0.5 NMAS, PCS = 0.22 NMAS, SCS = 0.22 PCS, TCS = 0.22 SCS. NMAS is one sieve larger than the first sieve with more than 15% cumulative retained. For 12.5 mm the half sieve is 6.35 mm, interpolated between 9.5 and 4.75 mm."),
      h("table", { class: "grid compact" }, h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "NMAS"), h("th", {}, "Half"), h("th", {}, "PCS"), h("th", {}, "SCS"), h("th", {}, "TCS"), h("th", {}, "Fine-graded: new Half, PCS, SCS, TCS"))),
        h("tbody", {}, ns.map((n) => { const c = M.control[n]; return h("tr", {}, h("th", { class: "rowh" }, n), c.map((x) => h("td", { class: "calc" }, x)), h("td", { class: "calc" }, fgc(n))); })))),
    h("section", { class: "card" }, h("h2", {}, "CA ratio ranges by NMAS"),
      h("p", { class: "hint" }, "Fine-graded mixes use the new CA ratio (0.60 to 1.00) instead."),
      h("table", { class: "grid compact" }, h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "NMAS"), h("th", {}, "SMA"), h("th", {}, "Dense, coarse-graded"))),
        h("tbody", {}, ns.map((n) => { const a = M.ca_range.sma[n], b = M.ca_range.cg[n]; return h("tr", {}, h("th", { class: "rowh" }, n), h("td", { class: "calc" }, a ? `${a[0].toFixed(2)} to ${a[1].toFixed(2)}` : "not used"), h("td", { class: "calc" }, b ? `${b[0].toFixed(2)} to ${b[1].toFixed(2)}` : "-")); }))))));
  wrap.append(h("section", { class: "card" }, h("h2", {}, "How good the rules of thumb are"),
    h("ul", { class: "plain" }, h("li", {}, "Aim for at least 8 in 10 predictions within ±0.5% VMA of the measured value."),
      h("li", {}, "A Gsb or Gmb change of 0.015 alone moves VMA by about 0.5%."),
      h("li", {}, "After 3 or more tested trials, the tool can fit the factors to your own results, within the ranges above."))),
    h("section", { class: "card" }, h("h2", {}, "References"),
      h("ul", { class: "plain" },
        h("li", {}, "Pine, W.J. ", h("i", {}, "The Bailey Method: Achieving Volumetrics and HMA Compactability."), " Course manual, 2023 class. The typical values on this page come from this course."),
        h("li", {}, "Vavrik, W.R., Huber, G., Pine, W.J., Carpenter, S.H., and Bailey, R. (2002). ",
          h("a", { href: "https://onlinepubs.trb.org/onlinepubs/circulars/ec044.pdf", target: "_blank", rel: "noopener" }, h("i", {}, "Bailey Method for Gradation Selection in HMA Mixture Design")), ". Transportation Research Circular E-C044, Transportation Research Board."))));
  return wrap;
}

/* ---------------------------------------------------------------- charts */
S.xScale = (() => { try { return localStorage.getItem("bailey.xscale") || "even"; } catch (e) { return "even"; } })();
function scaleToggle() {
  return h("button", { class: "btn link", title: "Switch the sieve axis", onclick: () => {
    S.xScale = S.xScale === "even" ? "p45" : "even";
    try { localStorage.setItem("bailey.xscale", S.xScale); } catch (e) { /* ignore */ }
    if (S.refresh) S.refresh(); else render();
  } }, S.xScale === "even" ? "0.45 power axis" : "Even sieve spacing");
}
function chartCard(series, nmas, noTable) {
  const cps = S.mix?.control_points || {};
  const tg = h("button", { class: "btn link", onclick: () => { S.chartBasis = S.chartBasis === "mass" ? "volume" : "mass"; if (S.refresh) S.refresh(); else render(); } }, S.chartBasis === "mass" ? "By volume" : "By mass");
  return h("div", { class: "card" }, h("div", { class: "cardhead" }, h("h2", {}, `Gradation, by ${S.chartBasis}`), h("span", { class: "row" }, scaleToggle(), tg)),
    chartBox(gradChart({ series, nmas, cps }), series, true), noTable ? null : gradTable(series.slice().reverse(), cps),
    nmas && S.an?.control ? h("p", { class: "caption" }, `${nmas} mm NMAS. Control sieves ${[S.an.control.half, S.an.control.pcs, S.an.control.scs, S.an.control.tcs].filter((x) => x != null).join(", ")} mm. The shaded side is the coarse fraction.`) : null);
}
function gradChart({ series, nmas, cps, compact }) {
  const W = 580, H = compact ? 300 : 390, L = 46, R = 16, T = compact ? 16 : 32, B = 46;
  const keys = sieves(), sv = keys.map(Number), n = sv.length;
  const pw = (d) => Math.pow(d, 0.45);
  const PL = L, PR = W - R, PT = T, PB = H - B;
  let X;
  if (S.xScale === "even") {
    const step = (PR - PL) / n;
    const xi = (i) => PR - step / 2 - i * step;
    const asc = sv.slice().reverse();
    X = (d) => {
      const iA = asc.findIndex((v) => Math.abs(v - d) < 1e-9);
      if (iA >= 0) return xi(n - 1 - iA);
      for (let i = 0; i < asc.length - 1; i++) if (d > asc[i] && d < asc[i + 1]) {
        const f = (pw(d) - pw(asc[i])) / (pw(asc[i + 1]) - pw(asc[i]));
        return xi(n - 1 - i) + f * (xi(n - 2 - i) - xi(n - 1 - i));
      }
      return d < asc[0] ? xi(n - 1) : xi(0);
    };
  } else {
    const a = pw(0.075) - 0.1, b = pw(sv[0]) + 0.1;
    X = (d) => PL + (pw(d) - a) / (b - a) * (PR - PL);
  }
  const Y = (p) => PT + (100 - p) / 100 * (PB - PT);
  const C = nmas && S.an?.control && S.an.nmas === nmas ? S.an.control : null;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gradation chart, percent passing by sieve size">`;
  s += `<rect class="plot" x="${PL}" y="${PT}" width="${PR - PL}" height="${PB - PT}"/>`;
  if (C && !compact) {
    const xp = X(C.coarse_pcs);
    s += `<rect class="zone" x="${xp}" y="${PT}" width="${PR - xp}" height="${PB - PT}"/>`;
    s += `<text class="zlabel" x="${PR - 8}" y="${PB - 10}" text-anchor="end">coarse fraction</text>`;
  }
  s += `<g class="gridl">`;
  for (let p = 0; p <= 100; p += 10) s += `<line x1="${PL}" x2="${PR}" y1="${Y(p)}" y2="${Y(p)}"${p % 20 ? ' class="minor"' : ""}/>`;
  sv.forEach((d) => (s += `<line x1="${X(d)}" x2="${X(d)}" y1="${PT}" y2="${PB}"/>`));
  s += `</g><g class="axis">`;
  for (let p = 0; p <= 100; p += 20) s += `<text x="${PL - 7}" y="${Y(p) + 4}" text-anchor="end">${p}</text>`;
  keys.forEach((k, i) => {
    const lb = lab(k); const x = X(sv[i]);
    const crowd = S.xScale !== "even" && sv[i] < 1.18 && (i % 2 === 1);
    const y0 = PB + 15 + (crowd ? 20 : 0);
    s += `<text class="xmm" x="${x}" y="${y0}" text-anchor="middle">${lb[0].replace(" mm", "")}</text><text class="xus" x="${x}" y="${y0 + 12}" text-anchor="middle">${esc(lb[1])}</text>`;
  });
  s += `<text class="ttl" transform="translate(${PL - 32},${(PT + PB) / 2}) rotate(-90)" text-anchor="middle">% passing</text></g>`;
  if (C && !compact) {
    s += `<g class="ctl">`;
    [["Half", C.half], ["PCS", C.pcs], ["SCS", C.scs], ["TCS", C.tcs]].forEach(([nm, d]) => {
      if (d == null || d < sv[n - 1] - 1e-9 || d > sv[0] + 1e-9) return;
      const x = X(d), w = nm.length * 7 + 10;
      s += `<line x1="${x}" x2="${x}" y1="${PT}" y2="${PB}"/><rect x="${x - w / 2}" y="${PT - 19}" width="${w}" height="15" rx="3"/><text x="${x}" y="${PT - 8}" text-anchor="middle">${nm}</text>`;
    });
    s += `</g>`;
    const idx = sv.findIndex((v) => Math.abs(v - nmas) < 1e-9); const dmax = idx > 0 ? sv[idx - 1] : sv[0];
    const pts = [];
    sv.slice().reverse().filter((d) => d <= dmax + 1e-9).forEach((d, i, arr) => {
      if (i > 0) { const d0 = arr[i - 1]; for (let k = 1; k < 6; k++) { const dd = Math.pow(pw(d0) + (pw(d) - pw(d0)) * k / 6, 1 / 0.45); pts.push(`${X(dd).toFixed(1)},${Y(100 * Math.pow(dd / dmax, 0.45)).toFixed(1)}`); } }
      pts.push(`${X(d).toFixed(1)},${Y(100 * Math.pow(d / dmax, 0.45)).toFixed(1)}`);
    });
    s += `<polyline class="mdl" points="${pts.join(" ")}"/>`;
  }
  const cp = keys.map((k) => { const v = (cps || {})[k] || {}; return { k, d: +k, lo: num(v.min), hi: num(v.max), slo: num(v.soft_min), shi: num(v.soft_max) }; });
  for (let i = 0; i < cp.length - 1; i++) {
    const a = cp[i], b = cp[i + 1];
    if (a.lo != null && a.hi != null && b.lo != null && b.hi != null)
      s += `<polygon class="band" points="${X(a.d)},${Y(a.hi)} ${X(b.d)},${Y(b.hi)} ${X(b.d)},${Y(b.lo)} ${X(a.d)},${Y(a.lo)}"/>`;
  }
  cp.forEach((c) => {
    const x = X(c.d);
    if (c.lo != null && c.hi != null) s += `<line class="cp" x1="${x}" x2="${x}" y1="${Y(c.hi)}" y2="${Y(c.lo)}"/>`;
    if (c.lo != null) s += `<line class="cp" x1="${x - 6}" x2="${x + 6}" y1="${Y(c.lo)}" y2="${Y(c.lo)}"/>`;
    if (c.hi != null) s += `<line class="cp" x1="${x - 6}" x2="${x + 6}" y1="${Y(c.hi)}" y2="${Y(c.hi)}"/>`;
    if (c.slo != null || c.shi != null) {
      const xs = x + 9, y1 = Y(c.shi ?? 100), y2 = Y(c.slo ?? 0);
      s += `<g class="softpt"><rect x="${xs - 4}" y="${y1}" width="8" height="${Math.max(1, y2 - y1)}"/><title>Soft target ${esc(lab(c.k)[0])}: ${c.slo ?? "..."} to ${c.shi ?? "..."}%</title></g>`;
    }
  });
  series.forEach((ser) => {
    const pts = keys.map((k) => { const v = num(ser.grad?.[k] ?? ser.grad?.[+k]); return v == null ? null : [X(+k), Y(v), k, v]; }).filter(Boolean);
    if (pts.length < 2) return;
    s += `<polyline class="series ${ser.cls || ""}" style="stroke:${ser.color}" points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}"/>`;
    if (ser.cls !== "old") pts.forEach((p) => (s += `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="${ser.cls === "pile" ? 2.6 : 3.3}" style="fill:${ser.color}"><title>${esc(ser.name)}: ${lab(p[2])[0]} (${esc(lab(p[2])[1])}) ${fmt(p[3], 1)}%</title></circle>`));
  });
  return s + `</svg>`;
}
function chartBox(svg, series, legend) {
  const box = h("div", { class: "chart", html: svg });
  const hasCp = Object.values(S.mix?.control_points || {}).some((v) => v && (num(v.min) != null || num(v.max) != null));
  const hasSoft = Object.values(S.mix?.control_points || {}).some((v) => v && (num(v.soft_min) != null || num(v.soft_max) != null));
  const items = legend ? series.filter((s) => s.cls !== "old").concat(series.filter((s) => s.cls === "old").slice(-3)) : series;
  box.append(h("div", { class: "legend" }, items.map((s) => h("span", { class: s.cls === "prop" ? "dash" : "" }, h("i", { style: `color:${s.color}` }), s.name)),
    legend && S.an?.nmas ? h("span", { class: "dash" }, h("i", { style: "color:#6B7780" }), "max density") : null,
    legend && hasCp ? h("span", { class: "bandkey" }, h("i"), "control points") : null,
    legend && hasSoft ? h("span", { class: "softkey" }, h("i"), "soft targets") : null));
  return box;
}
function gradTable(series, cps) {
  const keys = sieves();
  const lim = (k) => { const v = (cps || {})[k] || {}; return { lo: num(v.min), hi: num(v.max), slo: num(v.soft_min), shi: num(v.soft_max) }; };
  const rng = (a, b) => (a == null && b == null ? "" : `${a ?? ""}-${b ?? ""}`);
  const hasCp = cps && keys.some((k) => lim(k).lo != null || lim(k).hi != null);
  const hasSoft = cps && keys.some((k) => lim(k).slo != null || lim(k).shi != null);
  const rows = series.filter((r) => r.grad).map((r) => h("tr", { class: "gv-" + (r.cls || "") },
    h("th", { class: "rowh" }, h("i", { class: "sw", style: `background:${r.color}` }), r.name),
    keys.map((k) => {
      const v = num(r.grad[k] ?? r.grad[+k]); if (v == null) return h("td", {}, "");
      const L = lim(k); let c = "";
      if (cps && r.cls !== "pile") {
        if ((L.lo != null && v < L.lo - 1e-9) || (L.hi != null && v > L.hi + 1e-9)) c = "out";
        else if ((L.slo != null && v < L.slo - 1e-9) || (L.shi != null && v > L.shi + 1e-9)) c = "softout";
      }
      return h("td", { class: c, style: r.cls === "old" ? "" : `color:${r.color}` }, fmt(v, 1));
    })));
  if (hasCp) rows.push(h("tr", { class: "gv-lim" }, h("th", { class: "rowh" }, "Control"), keys.map((k) => h("td", {}, rng(lim(k).lo, lim(k).hi)))));
  if (hasSoft) rows.push(h("tr", { class: "gv-lim soft" }, h("th", { class: "rowh" }, "Soft"), keys.map((k) => h("td", {}, rng(lim(k).slo, lim(k).shi)))));
  if (!rows.length) return document.createTextNode("");
  const id = "gv-" + Math.random().toString(36).slice(2, 7);
  return h("div", { class: "gvals" },
    h("div", { class: "gridwrap" }, h("table", { class: "gv", id },
      h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "% passing"), keys.map((k) => h("th", {}, lab(k)[0].replace(" mm", ""), h("small", {}, lab(k)[1]))))),
      h("tbody", {}, rows))),
    h("div", { class: "row" }, h("button", { class: "btn link", onclick: () => copyGrid("#" + id) }, "Copy values for Excel"),
      cps ? h("span", { class: "hint" }, "Red: outside a control point. Wavy underline: outside a soft target.") : null));
}

window.addEventListener("beforeunload", () => { if (S.mix && window.BDT_API) { window.BDT_API("/api/save", { file: S.file, mix: S.mix }); return; } if (S.mix) navigator.sendBeacon && navigator.sendBeacon("/api/save", new Blob([JSON.stringify({ file: S.file, mix: S.mix })], { type: "application/json" })); });
boot();
