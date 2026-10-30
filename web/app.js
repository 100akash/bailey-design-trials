/* Bailey SMA Design Tool: interface.
   Plain JavaScript, no build step. Talks to server.py. */
"use strict";

const S = {
  meta: null, file: null, mix: null, an: null,
  step: "setup", selTrial: null,
  suggestion: null, optKey: "balanced", proposal: null, proposalPred: null,
  locks: {}, ref: null, chartBasis: "mass",
};
const SLOT_NAMES = { CA1: "Coarse 1", CA2: "Coarse 2", CA3: "Coarse 3", FA1: "Fine 1", FA2: "Fine 2", FA3: "Fine 3", F1: "Filler 1", F2: "Filler 2" };

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
const sieves = () => S.meta.sieves;
const ctlFor = (nmas) => { const k = Object.keys(S.meta.control).find((x) => Math.abs(+x - nmas) < 1e-9); return k ? S.meta.control[k] : null; };
const lab = (s) => S.meta.labels[s];
const matName = (slot) => (S.mix.materials[slot]?.name || "").trim() || SLOT_NAMES[slot];
const readySlots = () => S.meta.slots.filter((s) => { const m = S.mix.materials[s]; return m && (m.name || "").trim() && num(m.gsb); });
function practicalUI(seed) {
  if (seed && !S.mix.search) S.mix.search = { min_pile_pct: 5, min_fillers: false, one_fine: true };
  const sp = S.mix.search || {};
  const mn = "min_pile_pct" in sp ? (num(sp.min_pile_pct) || 0) : 5;
  return { min_pile_pct: mn, min_fillers: !!sp.min_fillers, one_fine: sp.one_fine == null ? true : !!sp.one_fine };
}
function smallPiles(pct) {
  const pr = practicalUI(), out = [];
  if (pr.min_pile_pct <= 0) return [out, 0];
  readySlots().forEach((s) => {
    const x = num(pct?.[s]) || 0;
    if (S.locks?.[s] || (S.meta.kind[s] === "F" && !pr.min_fillers)) return;
    if (x > 0.05 && x < pr.min_pile_pct - 1e-9) out.push([s, x]);
  });
  return [out, pr.min_pile_pct];
}
const sieveName = (v) => { const k = sieves().find((x) => Math.abs(+x - +v) < 1e-9); return k ? `${lab(k)[0]} (${lab(k)[1]})` : `${v} mm`; };
const unitLabel = () => (S.an?.conv === 62.4 ? "lb/ft³" : "kg/m³");
const trialById = (id) => (S.mix.trials || []).find((t) => t.id === id);
const anTrial = (id) => (S.an?.trials || []).find((t) => t.id === id);
const tested = () => (S.an?.trials || []).filter((t) => t.volumetrics?.complete);

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
  $("#savestate").textContent = "Unsaved changes";
  clearTimeout(changed._s); changed._s = setTimeout(save, 1200);
  clearTimeout(changed._a); changed._a = setTimeout(analyze, opts.now ? 0 : 280);
}
async function saveNow() {
  clearTimeout(changed._s);
  const b = $("#save-now"); b.disabled = true;
  await save();
  b.disabled = false;
  if (/^Saved/.test($("#savestate").textContent)) toast(`Saved to ${S.file}`);
}
async function save() {
  if (!S.mix) return;
  try {
    $("#savestate").textContent = "Saving…";
    const r = await api("/api/save", { file: S.file, mix: S.mix });
    S.file = r.file;
    $("#savestate").textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) { $("#savestate").textContent = "Not saved: " + e.message; }
}
async function analyze() {
  if (!S.mix) return;
  try { S.an = await api("/api/analyze", { mix: S.mix }); }
  catch (e) { S.an = null; console.error(e); }
  if (!S.selTrial || !trialById(S.selTrial)) S.selTrial = S.mix.trials?.length ? S.mix.trials[S.mix.trials.length - 1].id : null;
  updateTopbar();
  (UPDATE[S.step] || (() => {}))();
  renderSide();
}

/* ---------------------------------------------------------------- boot and home */
async function boot() {
  try { S.meta = await api("/api/meta"); }
  catch (e) {
    $("#app").innerHTML = "";
    $("#app").append(h("div", { class: "boot" }, h("h1", {}, "Could not start"), h("p", { class: "err" }, e.message), h("button", { class: "btn", onclick: () => location.reload() }, "Reload")));
    return;
  }
  $("#go-home").addEventListener("click", () => { if (S.mix) save(); home(); });
  $("#save-now").addEventListener("click", saveNow);
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (S.mix) saveNow(); } });
  home();
}

function aboutBlock() {
  return h("footer", { class: "about" },
    h("p", {}, h("b", {}, "Bailey Design Trials. "), "Developed by Akash Bajaj, Illinois Center for Transportation, University of Illinois Urbana-Champaign. ",
      h("a", { href: "https://github.com/100akash/bailey-design-trials", target: "_blank", rel: "noopener" }, "Source code and instructions"), ", MIT License."),
    h("p", {}, "Method: Vavrik, W.R., Huber, G., Pine, W.J., Carpenter, S.H., and Bailey, R. (2002). ",
      h("a", { href: "https://onlinepubs.trb.org/onlinepubs/circulars/ec044.pdf", target: "_blank", rel: "noopener" }, h("i", {}, "Bailey Method for Gradation Selection in HMA Mixture Design")),
      ". Transportation Research Circular E-C044, Transportation Research Board."),
    h("p", { class: "disclaimer" }, "Predictions use rules of thumb and are estimates only. Confirm every trial in the lab. This tool is not endorsed by the FAA or by any Bailey Method course."));
}
async function home() {
  S.mix = null; S.file = null; S.an = null; S.suggestion = null;
  $("#mixbar").hidden = true; $("#save-now").hidden = true; $("#savestate").textContent = "";
  const list = await api("/api/mixes");
  const app = $("#app"); app.innerHTML = "";
  const nameIn = h("input", { type: "text", placeholder: "e.g. P-401 Mix A to SMA 12.5", "aria-label": "Mix name" });
  const create = async () => {
    const name = nameIn.value.trim();
    if (!name) { nameIn.focus(); toast("Give the mix a name first"); return; }
    const mix = newMix(await uniqueName(name));
    const r = await api("/api/save", { mix });
    openMix(r.file);
  };
  nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
  app.append(h("div", { class: "home" },
    h("section", {},
      h("h1", {}, "Mix designs"),
      h("p", { class: "lede" }, "Design SMA blends by volume with the Bailey Method. Enter your stockpiles, log each lab trial, and let the tool propose the next blend to try."),
      h("div", { class: "ledger" },
        list.length ? list.map((m) => h("button", { class: "ledger-row", onclick: () => openMix(m.file) },
          h("div", {}, h("div", { class: "nm" }, m.name), h("div", { class: "sub" }, `${m.file}, edited ${new Date(m.modified * 1000).toLocaleString()}`)),
          h("div", { class: "count" }, `${m.materials ?? 0} materials`),
          h("div", { class: "count" }, `${m.tested ?? 0} of ${m.trials ?? 0} trials tested`))) :
          h("div", { class: "empty" }, "No mixes yet. Create your first one on the right."))),
    h("aside", { class: "newmix" },
      h("h2", {}, "Start a new mix"),
      h("label", { class: "f" }, h("span", {}, "Mix name"), nameIn),
      h("div", { class: "row", style: "margin-top:14px" }, h("button", { class: "btn primary", onclick: create }, "Create mix"),
        h("button", { class: "btn", onclick: openMixFile, title: "Open a .json mix file downloaded from this tool" }, "Open a mix file")),
      h("p", { class: "hint", style: "margin-top:16px" }, S.meta.web
        ? "Your mixes are saved in this browser only. Nothing is sent anywhere. Use Download mix file to keep a copy or share it, and Open a mix file to load one."
        : `Mixes are saved as files in ${S.meta.mixes_folder}. You can copy materials from any saved mix once it is open.`)),
    S.meta.web ? aboutBlock() : null));
  nameIn.focus();
}

function downloadMix() {
  if (!S.mix) return;
  const blob = new Blob([JSON.stringify(S.mix, null, 1)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: (S.file || (S.mix.name || "mix") + ".json") });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
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

function newMix(name) {
  const materials = {};
  S.meta.slots.forEach((s) => (materials[s] = { name: "", grad: {}, gsb: null, abs: null, luw: null, ruw: null }));
  return {
    schema: 1, name, notes: "", created: new Date().toISOString(),
    settings: { mix_type: "SMA", gb: 1.03, fiber_pct: 0.3, fiber_type: "Cellulose", units: "auto", nmas_override: null },
    targets: { vma: null, va: null, vfa: [null, null], pb_min: null, vcadrc: null },
    bailey_ranges: null, rot: { ...S.meta.rot }, control_points: {}, materials, trials: [],
  };
}

async function openMix(file) {
  const r = await api("/api/mix?file=" + encodeURIComponent(file));
  S.file = r.file; S.mix = r.mix; S.suggestion = null; S.proposal = null; S.locks = {};
  S.mix.trials = S.mix.trials || [];
  S.step = S.mix.trials.length ? "trials" : (readySlotsRaw(S.mix).length ? "trials" : "setup");
  S.selTrial = S.mix.trials.length ? S.mix.trials[S.mix.trials.length - 1].id : null;
  await analyzeQuiet();
  renderWork();
}
function readySlotsRaw(mix) { return Object.values(mix.materials || {}).filter((m) => (m.name || "").trim()); }
async function analyzeQuiet() { try { S.an = await api("/api/analyze", { mix: S.mix }); } catch (e) { S.an = null; } }

function updateTopbar() {
  $("#mixbar").hidden = false; $("#save-now").hidden = false;
  $("#mix-title").textContent = S.mix.name;
  $("#units-chip").textContent = unitLabel() + (S.mix.settings.units === "auto" ? " (auto)" : "");
  $("#nmas-chip").textContent = S.an?.nmas ? `${S.an.nmas} mm NMAS` : "NMAS from trial 1";
}

/* ---------------------------------------------------------------- workspace */
const STEPS = [
  ["setup", "Mix setup", "Targets and limits"],
  ["materials", "Materials", "Stockpiles and properties"],
  ["trials", "Trials", "Blends and lab results"],
  ["next", "Next trial", "Proposed blend"],
];
function renderWork() {
  const app = $("#app"); app.innerHTML = "";
  const nav = h("nav", { class: "steps", "aria-label": "Design steps" },
    STEPS.map(([k, t, sub], i) => h("button", { class: "step", "aria-current": S.step === k ? "true" : "false", onclick: () => { S.step = k; renderWork(); } },
      h("b", {}, i + 1), h("span", {}, t), h("small", {}, sub))),
    h("button", { class: "btn small back", onclick: () => { save(); home(); } }, "All mixes"),
    h("div", { class: "navtools" },
      h("button", { class: "btn link", onclick: downloadMix, title: "Save a copy of this mix as a .json file" }, "Download mix file"),
      h("button", { class: "btn link danger", onclick: deleteMix }, "Delete mix")));
  const pane = h("section", { class: "pane", id: "pane" });
  const side = h("aside", { class: "side", id: "side", "aria-label": "Charts" });
  app.append(h("div", { class: "work" + (S.step === "materials" ? " wide" : "") }, nav, pane, side));
  updateTopbar();
  ({ setup: renderSetup, materials: renderMaterials, trials: renderTrials, next: renderNext })[S.step](pane);
  (UPDATE[S.step] || (() => {}))();
  renderSide();
}
const UPDATE = {};

/* ---------------------------------------------------------------- step 1: setup */
function renderSetup(p) {
  const m = S.mix;
  p.append(h("h2", {}, "Mix setup"),
    h("p", { class: "intro" }, "Every mix has its own targets. Nothing here is fixed by a specification. Leave a field blank to ignore it."));
  const nmasSel = h("select", { "aria-label": "NMAS" },
    h("option", { value: "" }, "Detect from trial 1"),
    ["25.0", "19.0", "12.5", "9.5", "4.75"].map((v) => h("option", { value: v, selected: String(m.settings.nmas_override ?? "") === v ? true : null }, `${v} mm`)));
  nmasSel.addEventListener("change", () => edit(["settings", "nmas_override"], num(nmasSel.value)));
  const unitSel = h("select", { "aria-label": "Units" },
    [["auto", "Detect from unit weights"], ["metric", "Metric (kg/m³)"], ["english", "English (lb/ft³)"]].map(([v, t]) => h("option", { value: v, selected: m.settings.units === v ? true : null }, t)));
  unitSel.addEventListener("change", () => edit(["settings", "units"], unitSel.value));

  p.append(h("h3", {}, "Mix"),
    h("div", { class: "fgrid wide" },
      h("label", { class: "f" }, h("span", {}, "Mix name"), (() => { const i = textInput(["name"]); i.addEventListener("input", updateTopbar); return i; })()),
      h("label", { class: "f" }, h("span", {}, "Nominal max aggregate size"), nmasSel, h("span", { class: "hint", id: "nmas-hint" })),
      h("label", { class: "f" }, h("span", {}, "Units"), unitSel)),
    h("div", { class: "fgrid", style: "margin-top:12px" },
      h("label", { class: "f" }, h("span", {}, "Binder Gb"), numInput(["settings", "gb"])),
      h("label", { class: "f" }, h("span", {}, "Fiber, % of total mix"), numInput(["settings", "fiber_pct"])),
      h("label", { class: "f" }, h("span", {}, "Fiber type"), textInput(["settings", "fiber_type"]))),
    h("p", { class: "hint" }, "Fibers are recorded with the mix. They are not part of the volumetric calculations."),
    h("label", { class: "f", style: "margin-top:12px;max-width:900px" }, h("span", {}, "Notes"),
      (() => { const t = h("textarea", { rows: 2 }); t.value = m.notes || ""; t.addEventListener("input", () => edit(["notes"], t.value)); return t; })()));

  p.append(h("h3", {}, "Volumetric targets", h("small", {}, "The next-trial search aims for these")),
    h("div", { class: "fgrid" },
      h("label", { class: "f" }, h("span", {}, "VMA, %"), numInput(["targets", "vma"], { placeholder: "e.g. 17.0" })),
      h("label", { class: "f" }, h("span", {}, "Air voids, %"), numInput(["targets", "va"], { placeholder: "e.g. 3.5" })),
      h("label", { class: "f" }, h("span", {}, "VFA min, %"), numInput(["targets", "vfa", 0])),
      h("label", { class: "f" }, h("span", {}, "VFA max, %"), numInput(["targets", "vfa", 1])),
      h("label", { class: "f" }, h("span", {}, "Min binder, %"), numInput(["targets", "pb_min"])),
      h("label", { class: "f" }, h("span", {}, "VCA dry-rodded, %"), numInput(["targets", "vcadrc"], { placeholder: "optional" }))),
    h("p", { class: "hint" }, "Leave VCA dry-rodded blank until you measure it. Once entered, VCAmix must stay at or below it."));

  // Bailey ranges
  p.append(h("h3", {}, "Bailey ranges", h("small", {}, "Soft goals for the search. Pre-filled with typical SMA ranges. Edit them for your mix.")));
  const rt = h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Principle"), h("th", {}, "Min"), h("th", {}, "Max"), h("th", {}, "Default"))),
    h("tbody", { id: "ranges-body" }));
  p.append(h("div", { class: "gridwrap", style: "max-width:560px" }, rt),
    h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn small", onclick: () => { S.mix.bailey_ranges = null; changed({ now: true }); setTimeout(() => renderWork(), 350); } }, "Reset to defaults"),
      h("span", { class: "hint" }, "Clear a box to let the search ignore that limit.")));

  // Control points
  p.append(h("h3", {}, "Gradation limits", h("small", {}, "Optional. Control points are hard. Soft targets are goals the search leans toward.")));
  const cp = h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Sieve"), h("th", {}, "Control min"), h("th", {}, "Control max"), h("th", { class: "softh" }, "Soft min"), h("th", { class: "softh" }, "Soft max"))),
    h("tbody", {}, sieves().map((s, r) => h("tr", {},
      h("th", { class: "rowh" }, lab(s)[0], h("small", {}, lab(s)[1])),
      h("td", {}, numInput(["control_points", s, "min"], { grid: [r, 0, "cp"] })),
      h("td", {}, numInput(["control_points", s, "max"], { grid: [r, 1, "cp"] })),
      h("td", { class: "soft" }, numInput(["control_points", s, "soft_min"], { grid: [r, 2, "cp"] })),
      h("td", { class: "soft" }, numInput(["control_points", s, "soft_max"], { grid: [r, 3, "cp"] }))))));
  p.append(h("div", { class: "gridwrap", style: "max-width:640px" }, cp),
    h("p", { class: "hint" }, "Example: soft min 22 and soft max 24 on 2.36 mm (#8). The search tries to land there, but it will miss it before it breaks a control point or the VMA target. Tip: copy columns from Excel and paste into the first box."));

  // practical limits
  const pr = practicalUI(true);
  const fcb = h("input", { type: "checkbox", checked: pr.min_fillers ? true : null });
  fcb.addEventListener("change", () => edit(["search", "min_fillers"], fcb.checked));
  const ocb = h("input", { type: "checkbox", checked: pr.one_fine ? true : null });
  ocb.addEventListener("change", () => edit(["search", "one_fine"], ocb.checked));
  p.append(h("h3", {}, "Practical limits", h("small", {}, "What the plant can actually feed")),
    h("div", { class: "fgrid" },
      h("label", { class: "f" }, h("span", {}, "Minimum stockpile %, when used"), numInput(["search", "min_pile_pct"], { placeholder: "none" }))),
    h("div", { class: "checks" },
      h("label", { class: "hardbox" }, fcb, h("span", {}, "Apply the minimum to fillers too")),
      h("label", { class: "hardbox" }, ocb, h("span", {}, "Prefer one fine aggregate (soft). The search uses two only when it clearly helps."))),
    h("p", { class: "hint" }, "A stockpile is either off (0%) or at least the minimum. Fillers are exempt unless ticked, so 1% lime still works. Fixed stockpiles are left alone. Clear the box for no minimum."));

  // rules of thumb
  const rotRows = [["PCS", "% passing PCS for 1% VMA"], ["CA", "CA ratio change for 1% VMA"], ["FAc", "FAc change for 1% VMA"], ["FAf", "FAf change for 1% VMA"], ["FAc_dip", "FAc dip"], ["FAf_dip", "FAf dip"], ["AC", "Binder mass to volume factor"], ["pba_abs", "Pba as fraction of water absorption"]];
  p.append(h("details", { class: "adv" }, h("summary", {}, "Prediction factors (SMA rules of thumb)"),
    h("p", { class: "hint" }, "These drive the VMA and voids estimate. Change them only after several trials show a steady bias."),
    h("div", { class: "fgrid wide" }, rotRows.map(([k, t]) => h("label", { class: "f" }, h("span", {}, t), numInput(["rot", k])))),
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn small", onclick: () => { S.mix.rot = { ...S.meta.rot }; changed({ now: true }); renderWork(); } }, "Reset factors"))));
}
UPDATE.setup = () => {
  const nh = $("#nmas-hint"); if (nh) nh.textContent = S.an?.nmas ? `In use: ${S.an.nmas} mm (Half ${S.an.control.half}, PCS ${S.an.control.pcs}, SCS ${S.an.control.scs}, TCS ${S.an.control.tcs})` : "Enter trial 1 to detect it.";
  const body = $("#ranges-body"); if (!body || body.dataset.built) return;
  body.dataset.built = "1";
  const def = S.an?.default_ranges || { ca_ruw: [110, 125], CA: [null, null], FAc: [0.6, 0.85], FAf: [0.65, 0.9] };
  if (!S.mix.bailey_ranges) S.mix.bailey_ranges_view = JSON.parse(JSON.stringify(def));
  const cur = () => S.mix.bailey_ranges || S.mix.bailey_ranges_view;
  [["ca_ruw", "% CA RUW"], ["CA", "CA ratio"], ["FAc", "FAc ratio"], ["FAf", "FAf ratio"]].forEach(([k, t], r) => {
    const mk = (i) => {
      const inp = h("input", { type: "text", inputmode: "decimal", value: cur()[k]?.[i] ?? "" });
      inp.addEventListener("input", () => {
        if (!S.mix.bailey_ranges) S.mix.bailey_ranges = JSON.parse(JSON.stringify(cur()));
        S.mix.bailey_ranges[k] = S.mix.bailey_ranges[k] || [null, null];
        S.mix.bailey_ranges[k][i] = num(inp.value); changed();
      });
      return inp;
    };
    body.append(h("tr", {}, h("th", { class: "rowh" }, t), h("td", {}, mk(0)), h("td", {}, mk(1)), h("td", { class: "calc" }, def[k][0] == null ? "-" : `${def[k][0]} to ${def[k][1]}`)));
  });
};

/* ---------------------------------------------------------------- step 2: materials */
function renderMaterials(p) {
  p.append(h("div", { class: "row" }, h("h2", {}, "Materials"), h("span", { class: "spacer" }),
    h("button", { class: "btn small primary", onclick: pasteTableDialog }, "Paste a table from Excel"),
    h("button", { class: "btn small", onclick: importDialog }, "Import from another mix")),
    h("p", { class: "intro" }, "Washed gradations as % passing. Coarse aggregates need RUW for SMA, fine aggregates need LUW. Copy any block in Excel, click the cell where it should start, and paste. Sieve labels and a row of names are recognised."));
  const slots = S.meta.slots;
  const head = h("tr", {}, h("th", { class: "rowh" }, "Stockpile"),
    slots.map((s, c) => h("th", { class: "kind-" + S.meta.kind[s], style: `--k:${slotColor(s)}` }, h("span", { class: "slotlabel" }, h("i", { class: "sw" }), SLOT_NAMES[s]), textInput(["materials", s, "name"], { placeholder: "Name", label: SLOT_NAMES[s] + " name", grid: [-1, c, "mat"] }))));
  const body = h("tbody", {});
  sieves().forEach((sv, r) => body.append(h("tr", {}, h("th", { class: "rowh", id: "mrow-" + r }, lab(sv)[0], h("small", {}, lab(sv)[1])),
    slots.map((s, c) => h("td", {}, numInput(["materials", s, "grad", sv], { grid: [r, c, "mat"] }))))));
  const props = [["gsb", "Bulk specific gravity, Gsb"], ["abs", "Water absorption, %"], ["luw", "Loose unit weight", true], ["ruw", "Rodded unit weight", true]];
  body.append(h("tr", { class: "group" }, h("th", { colspan: 9 }, "Properties")));
  props.forEach(([k, t, uw], i) => body.append(h("tr", {}, h("th", { class: "rowh" }, t, uw ? h("small", { class: "uwunit" }, "") : null),
    slots.map((s, c) => (uw && S.meta.kind[s] === "F") ? h("td", { class: "na", title: "Not used for fillers" }) : h("td", {}, numInput(["materials", s, k], { grid: [20 + i, c, "mat"] }))))));
  body.append(h("tr", { class: "group" }, h("th", { colspan: 9 }, "Checks")));
  [["luw_voids", "LUW voids, %"], ["ruw_voids", "RUW voids, %"], ["pcs", "Passing the PCS, %"]].forEach(([k, t]) =>
    body.append(h("tr", {}, h("th", { class: "rowh" }, t), slots.map((s) => h("td", { class: "calc", id: `chk-${k}-${s}` }, "-")))));
  p.append(h("div", { class: "gridwrap" }, h("table", { class: "grid", id: "mat-grid" }, h("thead", {}, head), body)),
    h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn small", onclick: () => copyGrid("#mat-grid") }, "Copy table for Excel")),
    h("div", { id: "mat-notes" }));
}
UPDATE.materials = () => {
  $$(".uwunit").forEach((e) => (e.textContent = unitLabel()));
  const typ = { CA: { luw: [43, 49], ruw: [37, 43] }, FA: { luw: [35, 43], ruw: [28, 36] } };
  const pcs = S.an?.control?.pcs;
  S.meta.slots.forEach((s) => {
    const info = S.an?.materials?.[s] || {}, kind = S.meta.kind[s];
    ["luw", "ruw"].forEach((k) => {
      const cell = $(`#chk-${k}_voids-${s}`); if (!cell) return;
      const v = info[k + "_voids"]; cell.textContent = fmt(v, 1); cell.className = "calc";
      if (v != null && typ[kind]) cell.classList.add(v < typ[kind][k][0] || v > typ[kind][k][1] ? "st-high" : "st-ok");
      cell.title = typ[kind] ? `Typical ${typ[kind][k][0]} to ${typ[kind][k][1]}%` : "";
    });
    const c = $(`#chk-pcs-${s}`); if (!c) return;
    const g = S.mix.materials[s]?.grad?.[pcs != null ? String(pcs) : ""];
    c.className = "calc";
    if (pcs && g != null && g !== "") {
      c.textContent = fmt(g, 1);
      const wrong = (kind === "CA" && g >= 50) || (kind === "FA" && g < 50);
      if (kind !== "F") c.classList.add(wrong ? "st-high" : "st-ok");
      c.title = `PCS ${pcs} mm. Coarse aggregates pass 49.9% or less.`;
    } else c.textContent = pcs ? "-" : "after trial 1";
  });
  const notes = $("#mat-notes"); if (!notes) return;
  notes.innerHTML = "";
  const msg = [];
  S.meta.slots.forEach((s) => {
    const m = S.mix.materials[s]; if (!(m?.name || "").trim()) return;
    const k = S.meta.kind[s];
    const miss = sieves().filter((sv) => m.grad?.[sv] == null || m.grad[sv] === "");
    if (miss.length) msg.push(`${m.name}: gradation missing on ${miss.length} sieve(s).`);
    if (!num(m.gsb)) msg.push(`${m.name}: needs Gsb.`);
    if (k === "CA" && !num(m.ruw)) msg.push(`${m.name}: needs RUW (sets the coarse volume in SMA).`);
    if (k === "FA" && !num(m.luw)) msg.push(`${m.name}: needs LUW (fills the coarse voids in SMA).`);
  });
  if (msg.length) notes.append(h("div", { class: "notice" }, h("b", {}, "Still needed"), h("ul", {}, msg.map((t) => h("li", {}, t)))));
};


/* paste a whole table from Excel: stockpiles in columns or rows, sieve labels optional */
function sieveFromLabel(lbl) {
  const t = String(lbl || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || /pan/.test(t)) return null;
  const SV = sieves().map(Number);
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
      if (sv !== null) { const k = keys.find((kk) => Math.abs(+kk - sv) < 1e-9); if (k) piles[j].grad[k] = retained ? +(100 - x).toFixed(2) : x; }
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
        d.close(); d.style.maxWidth = ""; changed({ now: true }); renderWork(); toast(`Filled ${n} stockpile${n === 1 ? "" : "s"}`);
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
        d.close(); changed({ now: true }); renderWork(); toast("Materials imported");
      } }, "Import selected")));
  await load(); d.showModal();
}

/* ---------------------------------------------------------------- step 3: trials */
function nextTrialId() { let n = 1; while (trialById("T" + n)) n++; return "T" + n; }
function addTrial(pct, extra = {}) {
  const id = nextTrialId();
  const t = { id, label: "Trial " + id.slice(1), source: "lab", created: new Date().toISOString(), pct: { ...pct }, results: { pb: null, gmb: [null, null], gmm: [null, null], vcadrc: null }, notes: "", ...extra };
  S.mix.trials.push(t); S.selTrial = id;
  return t;
}
function renderTrials(p) {
  const trials = S.mix.trials;
  const slots = readySlots();
  p.append(h("div", { class: "row" }, h("h2", {}, "Trials"), h("span", { class: "spacer" }),
      h("button", { class: "btn small", onclick: baileyDialog, disabled: slots.length < 2 ? true : null }, "Build a blend from Bailey inputs"),
      h("button", { class: "btn small primary", onclick: () => {
        const last = trials[trials.length - 1];
        addTrial(last ? last.pct : {}); changed({ now: true }); renderWork();
      }, disabled: slots.length < 2 ? true : null }, "Add trial")),
    h("p", { class: "intro" }, "Each column is one trial. Enter the blend as % by mass of aggregate, then the lab results. Click a trial name to show it on the chart."));
  if (slots.length < 2) { p.append(h("div", { class: "notice" }, "Add your stockpiles in Materials first. Each one needs a name and a Gsb.")); return; }
  if (!trials.length) { p.append(h("div", { class: "notice teal" }, "Add trial 1 with the blend you mixed in the lab. The tool works out its Bailey values from the stockpile percentages.")); return; }

  const head = h("tr", {}, h("th", { class: "rowh" }, ""), trials.map((t, c) => {
    const lbl = textInput(["trials", c, "label"], { cls: "tname", label: "Trial name" });
    lbl.addEventListener("input", () => renderSide());
    return h("th", { class: "trialcol" + (t.id === S.selTrial ? " sel" : ""), dataset: { tid: t.id }, onclick: (e) => { if (e.target.tagName !== "INPUT" && e.target.tagName !== "BUTTON") { S.selTrial = t.id; highlightTrial(); renderSide(); } } },
      h("div", { class: "trialhead" }, lbl, h("span", { class: "srcflag" + (t.source === "tool" ? " tool" : "") }, t.source === "tool" ? "Proposed by tool" : t.source === "bailey" ? "Built from Bailey inputs" : "Entered"),
        h("span", { class: "row", style: "gap:2px" },
          t.prediction ? h("button", { class: "btn link", style: "font-size:12px", title: "Use this after you change a proposed blend. The old prediction no longer matches it.", onclick: () => clearPrediction(t.id) }, "Clear prediction") : null,
          h("button", { class: "btn link", style: "font-size:12px", onclick: () => removeTrial(t.id) }, "Remove"))));
  }));
  const body = h("tbody", {});
  const grp = (t) => body.append(h("tr", { class: "group" }, h("th", { colspan: trials.length + 1 }, t)));
  grp("Blend, % by mass of aggregate");
  slots.forEach((s, r) => body.append(h("tr", {}, h("th", { class: "rowh", style: `--k:${slotColor(s)}` }, h("i", { class: "sw" }), matName(s), h("small", {}, SLOT_NAMES[s])),
    trials.map((t, c) => h("td", { dataset: { tid: t.id } }, numInput(["trials", c, "pct", s], { grid: [r, c, "tri"] }))))));
  body.append(h("tr", {}, h("th", { class: "rowh" }, "Total"), trials.map((t) => h("td", { class: "calc strong", id: `sum-${t.id}`, dataset: { tid: t.id } }, "-"))));
  grp("Lab results");
  const rr = [["pb", "Binder content Pb, %"], ["gmb0", "Gmb 1"], ["gmb1", "Gmb 2"], ["gmm0", "Gmm 1"], ["gmm1", "Gmm 2"], ["vcadrc", "VCA dry-rodded, % (optional)"]];
  rr.forEach(([k, t], r) => body.append(h("tr", {}, h("th", { class: "rowh" }, t), trials.map((tr, c) => {
    const path = k.startsWith("gm") ? ["trials", c, "results", k.slice(0, 3), +k[3]] : ["trials", c, "results", k];
    return h("td", { dataset: { tid: tr.id } }, numInput(path, { grid: [20 + r, c, "tri"] }));
  }))));
  const calcRows = [
    ["Volumetrics", [["gmb", "Gmb, average", 3], ["gmm", "Gmm, average", 3], ["gsb", "Gsb of blend", 3], ["vma", "VMA, %", 1, "vma"], ["va", "Air voids, %", 1, "va"], ["vfa", "VFA, %", 1, "vfa"], ["pba", "Pba, %", 2], ["pbe", "Pbe, %", 2], ["vca_mix", "VCAmix, %", 1, "vca"]]],
    ["Bailey", [["nmas", "NMAS detected, mm", null], ["cuw", "% CA RUW", 1, "ca_ruw"], ["volca", "CA volume, %", 1], ["pcs", "Passing PCS, %", 1], ["CA", "CA ratio", 3, "CA"], ["FAc", "FAc ratio", 3, "FAc"], ["FAf", "FAf ratio", 3, "FAf"], ["p200", "Passing #200, %", 1]]],
    ["Prediction check", [["pvma", "Predicted VMA, %", 1], ["evma", "VMA error, pred minus actual", 2], ["pva", "Predicted Va at lab Pb, %", 1], ["eva", "Va error, pred minus actual", 2]]],
  ];
  calcRows.forEach(([g, rows]) => { grp(g); rows.forEach(([k, t]) => body.append(h("tr", {}, h("th", { class: "rowh" }, t), trials.map((tr) => h("td", { class: "calc", id: `c-${k}-${tr.id}`, dataset: { tid: tr.id } }, "-"))))); });
  p.append(h("div", { class: "gridwrap" }, h("table", { class: "grid", id: "trial-grid" }, h("thead", {}, head), body)),
    h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn small", onclick: () => copyGrid("#trial-grid") }, "Copy table for Excel"),
      h("span", { class: "hint" }, "To paste in, copy a block in Excel, click the first cell here, and paste.")),
    h("div", { id: "trial-notes" }));
  UPDATE.trials._rows = calcRows;
}
function highlightTrial() { $$("#trial-grid [data-tid]").forEach((e) => e.classList.toggle("sel", e.dataset.tid === S.selTrial)); }
function clearPrediction(id) {
  const t = trialById(id); if (!t) return;
  delete t.prediction; delete t.option; delete t.reference;
  t.source = "lab"; changed({ now: true }); renderWork(); toast(`${t.label}: prediction cleared`);
}
function removeTrial(id) {
  if (!confirm("Remove this trial and its lab results?")) return;
  S.mix.trials = S.mix.trials.filter((t) => t.id !== id);
  if (S.selTrial === id) S.selTrial = null;
  changed({ now: true }); renderWork();
}
UPDATE.trials = () => {
  highlightTrial();
  const st = (v, key, status) => (status && status[key]) ? "st-" + status[key] : "";
  const tgt = S.mix.targets || {};
  (S.mix.trials || []).forEach((t) => {
    const a = anTrial(t.id) || {};
    const sum = Object.values(t.pct || {}).reduce((x, y) => x + (num(y) || 0), 0);
    const sc = $(`#sum-${t.id}`); if (sc) { sc.textContent = fmt(sum, 1); sc.className = "calc strong " + (Math.abs(sum - 100) > 0.05 ? "st-high" : "st-ok"); sc.title = Math.abs(sum - 100) > 0.05 ? "Blend must total 100%" : ""; }
    const v = a.volumetrics || {}, r = a.ratios || {}, b = a.bailey || {}, e = a.prediction_error || {};
    const val = {
      gmb: v.gmb, gmm: v.gmm, gsb: a.gsb, vma: v.vma, va: v.va, vfa: v.vfa, pba: v.pba, pbe: v.pbe, vca_mix: v.vca_mix,
      nmas: a.nmas_detected, cuw: b.cuw_pct, volca: b.vol_ca, pcs: r.pct_pcs, CA: r.CA, FAc: r.FAc, FAf: r.FAf, p200: a.gradation?.["0.075"],
      pvma: t.prediction?.vma, evma: e.vma, pva: e.va_pred_at_actual_pb, eva: e.va,
    };
    (UPDATE.trials._rows || []).forEach(([, rows]) => rows.forEach(([k, , d, skey]) => {
      const cell = $(`#c-${k}-${t.id}`); if (!cell) return;
      const x = val[k];
      cell.textContent = d === null ? (x ?? "-") : fmt(x, d);
      cell.className = "calc" + (t.id === S.selTrial ? " sel" : "");
      if (skey && a.status && ["ca_ruw", "CA", "FAc", "FAf"].includes(skey) && x != null) cell.classList.add(st(x, skey, a.status));
      if (skey === "vma" && x != null && num(tgt.vma) != null) cell.classList.add(Math.abs(x - tgt.vma) <= 0.2 ? "st-ok" : "st-high");
      if (skey === "va" && x != null && num(tgt.va) != null) cell.classList.add(Math.abs(x - tgt.va) <= 0.2 ? "st-ok" : "st-high");
      if (skey === "vca" && x != null && num(tgt.vcadrc || t.results?.vcadrc) != null) cell.classList.add(v.vca_ok ? "st-ok" : "st-high");
      if (k === "nmas" && x != null && S.an?.nmas && x !== S.an.nmas) { cell.classList.add("st-high"); cell.title = `Design NMAS is ${S.an.nmas} mm`; }
    }));
  });
  const notes = $("#trial-notes"); if (!notes) return; notes.innerHTML = "";
  const w = new Set();
  (S.an?.trials || []).forEach((a) => (a.warnings || []).forEach((x) => w.add(x)));
  (S.an?.trials || []).forEach((a) => { if (a.bailey?.error) w.add(a.bailey.error); if (a.error) w.add(a.error); });
  if (w.size) notes.append(h("div", { class: "notice" }, h("b", {}, "Check"), h("ul", {}, [...w].map((x) => h("li", {}, x)))));
};

/* Bailey inputs dialog: forward volume blend */
function baileyDialog() {
  const d = $("#dialog"); d.innerHTML = "";
  const slots = readySlots();
  const ca = slots.filter((s) => S.meta.kind[s] === "CA"), fa = slots.filter((s) => S.meta.kind[s] === "FA");
  const last = anTrial(S.mix.trials[S.mix.trials.length - 1]?.id);
  const b = last?.bailey || {};
  const v = { cuw: b.cuw_pct ? +b.cuw_pct.toFixed(1) : 118, dust: last?.gradation?.["0.075"] ?? 10, f2: num(S.mix.trials[S.mix.trials.length - 1]?.pct?.F2) || 0, ca: {}, fa: {} };
  ca.forEach((s) => (v.ca[s] = b.ca_vol?.[s] != null ? +b.ca_vol[s].toFixed(1) : +(100 / ca.length).toFixed(1)));
  fa.forEach((s) => (v.fa[s] = b.fa_vol?.[s] != null ? +b.fa_vol[s].toFixed(1) : +(100 / fa.length).toFixed(1)));
  const inp = (obj, k) => { const i = h("input", { type: "text", inputmode: "decimal", value: obj[k] }); i.addEventListener("input", () => { obj[k] = num(i.value); run(); }); return i; };
  const out = h("div", { class: "hint", style: "margin:10px 0" });
  let result = null;
  const run = async () => {
    try {
      const r = await api("/api/forward", { mix: S.mix, cuw: v.cuw, ca_vol: v.ca, fa_vol: v.fa, dust: v.dust, f2: v.f2 });
      result = r.blend.pct;
      out.innerHTML = "";
      out.append(h("b", {}, "Blend: "), slots.concat(["F1", "F2"].filter((s) => !slots.includes(s))).filter((s) => result[s]).map((s) => `${matName(s)} ${fmt(result[s], 1)}%`).join(", "),
        h("br"), `CA volume ${fmt(r.blend.vol_ca, 1)}%, passing PCS ${fmt(r.analysis.ratios.pct_pcs, 1)}%, CA ${fmt(r.analysis.ratios.CA, 3)}, FAc ${fmt(r.analysis.ratios.FAc, 3)}, FAf ${fmt(r.analysis.ratios.FAf, 3)}`);
    } catch (e) { result = null; out.textContent = e.message; }
  };
  d.append(h("h3", {}, "Build a blend from Bailey inputs"),
    h("p", { class: "hint" }, "Same steps as the class Volume Blending Spreadsheet. Filler 1 is adjusted to reach the #200 target. Filler 2 is a fixed %."),
    h("div", { class: "fgrid" },
      h("label", { class: "f" }, h("span", {}, "CA chosen UW, % RUW"), inp(v, "cuw")),
      h("label", { class: "f" }, h("span", {}, "Passing #200 target, %"), inp(v, "dust")),
      h("label", { class: "f" }, h("span", {}, `${matName("F2")}, %`), inp(v, "f2"))),
    h("p", { class: "hint", style: "margin:12px 0 4px" }, "Coarse aggregates, % by volume (total 100)"),
    h("div", { class: "fgrid" }, ca.map((s) => h("label", { class: "f" }, h("span", {}, matName(s)), inp(v.ca, s)))),
    h("p", { class: "hint", style: "margin:12px 0 4px" }, "Fine aggregates, % by volume (total 100)"),
    h("div", { class: "fgrid" }, fa.map((s) => h("label", { class: "f" }, h("span", {}, matName(s)), inp(v.fa, s)))),
    out,
    h("div", { class: "row" }, h("span", { class: "spacer" }), h("button", { class: "btn", onclick: () => d.close() }, "Cancel"),
      h("button", { class: "btn primary", onclick: () => { if (!result) return; addTrial(result, { source: "bailey", bailey_inputs: JSON.parse(JSON.stringify(v)) }); d.close(); changed({ now: true }); renderWork(); } }, "Add as new trial")));
  d.showModal(); run();
}

/* ---------------------------------------------------------------- step 4: next trial */
function renderNext(p) {
  p.append(h("h2", {}, "Next trial"),
    h("p", { class: "intro" }, "The tool starts from a tested trial and searches for the blend that reaches your VMA target with the smallest change. It then sets Pb for your air-void target."),
    (() => { const pr = practicalUI(); const bits = [];
      if (pr.min_pile_pct > 0) bits.push(`each stockpile is 0 or at least ${fmt(pr.min_pile_pct, 1)}%${pr.min_fillers ? "" : " (fillers exempt)"}`);
      if (pr.one_fine) bits.push("one fine aggregate is preferred");
      return bits.length ? h("p", { class: "hint" }, `Practical limits from Mix setup: ${bits.join(", and ")}.`) : document.createTextNode(""); })());
  const done = tested();
  const tg = S.mix.targets || {};
  if (!done.length) { p.append(h("div", { class: "notice" }, "Enter Pb, Gmb and Gmm for at least one trial first.")); return; }
  if (num(tg.vma) == null || num(tg.va) == null) p.append(h("div", { class: "notice" }, "Set the VMA and air-void targets in Mix setup. Without them the search has nothing to aim for."));
  if (!S.ref || !done.find((t) => t.id === S.ref)) S.ref = done[done.length - 1].id;
  const refSel = h("select", { "aria-label": "Reference trial" }, done.map((t) => h("option", { value: t.id, selected: t.id === S.ref ? true : null }, trialById(t.id)?.label || t.id)));
  refSel.addEventListener("change", () => { S.ref = refSel.value; S.suggestion = null; S.proposal = null; renderWork(); });
  const ref = anTrial(S.ref);
  p.append(h("div", { class: "row" },
    h("label", { class: "f" }, h("span", {}, "Start from"), refSel),
    h("div", { class: "hint", style: "align-self:end" }, `VMA ${fmt(ref.volumetrics.vma, 1)}%, Va ${fmt(ref.volumetrics.va, 1)}% at Pb ${fmt(ref.volumetrics.pb, 1)}%. Targets: VMA ${fmt(tg.vma, 1)}%, Va ${fmt(tg.va, 1)}%.`)));
  p.append(h("h3", {}, "Fix stockpiles", h("small", {}, "A fixed stockpile keeps its % in every option")));
  const base = trialById(S.ref).pct || {};
  p.append(h("div", { class: "locks" }, readySlots().map((s) => {
    const cb = h("input", { type: "checkbox", checked: S.locks[s] ? true : null });
    const lbl = h("label", { class: "lock" + (S.locks[s] ? " on" : ""), style: `--k:${slotColor(s)}` }, cb, h("span", { class: "nm" }, matName(s)), h("span", { class: "pc" }, `${fmt(num(base[s]) || 0, 1)}% now`));
    cb.addEventListener("change", () => { S.locks[s] = cb.checked; lbl.classList.toggle("on", cb.checked); });
    return lbl;
  })));
  p.append(baileyGoalsPanel(ref));
  const go = h("button", { class: "btn teal", style: "margin-top:16px" }, S.suggestion ? "Search again" : "Find next trial");
  go.addEventListener("click", async () => {
    go.disabled = true; go.textContent = "Searching…";
    try {
      S.suggestion = await api("/api/suggest", { mix: S.mix, ref: S.ref, locks: S.locks });
      S.optKey = "balanced"; pickOption("balanced"); renderWork();
    } catch (e) { toast(e.message); go.disabled = false; go.textContent = "Find next trial"; }
  });
  p.append(go);
  if (!S.suggestion) return;

  p.append(h("div", { class: "options", role: "group", "aria-label": "Options" }, S.suggestion.options.map((o) => h("button", {
    class: "opt", "aria-pressed": o.key === S.optKey ? "true" : "false", onclick: () => { pickOption(o.key); renderWork(); } },
    h("h5", {}, o.title), h("p", {}, o.about),
    o.duplicate_of ? h("div", { class: "dup" }, `Same blend as ${o.duplicate_of}.`) :
      h("div", { class: "big" },
        h("div", {}, h("b", {}, fmt(o.prediction.vma, 1)), h("span", {}, "VMA, %")),
        h("div", {}, h("b", {}, fmt(o.prediction.pb, 2)), h("span", {}, "Pb, %")),
        h("div", {}, h("b", {}, fmt(o.analysis.bailey?.cuw_pct, 0)), h("span", {}, "% CA RUW")))))));
  p.append(h("div", { id: "proposal" }));
  drawProposal();
}
const GOALS = [["ca_ruw", "% CA RUW", 1, "1.0"], ["CA", "CA ratio", 3, "0.010"], ["FAc", "FAc ratio", 3, "0.010"], ["FAf", "FAf ratio", 3, "0.010"]];
function baileyGoalsPanel(ref) {
  const rng = S.mix.bailey_ranges || S.an?.default_ranges || {};
  S.mix.bailey_targets = S.mix.bailey_targets || {};
  const rows = GOALS.map(([k, t, d, tol], r) => {
    const g = S.mix.bailey_targets[k] = S.mix.bailey_targets[k] || { target: null, hard: false };
    const tIn = numInput(["bailey_targets", k, "target"], { placeholder: "optional", grid: [r, 0, "goal"], label: t + " target" });
    const hb = h("input", { type: "checkbox", checked: g.hard ? true : null, "aria-label": t + " hard" });
    hb.addEventListener("change", () => { g.hard = hb.checked; changed(); });
    const r0 = rng[k] || [];
    const v = k === "ca_ruw" ? ref.bailey?.cuw_pct : ref.ratios?.[k];
    return h("tr", {}, h("th", { class: "rowh" }, t),
      h("td", { class: "calc" }, r0[0] == null && r0[1] == null ? "none" : `${r0[0] ?? "..."} to ${r0[1] ?? "..."}`),
      h("td", { class: "calc" }, fmt(v, d)),
      h("td", {}, tIn),
      h("td", { class: "ctr" }, h("label", { class: "hardbox" }, hb, h("span", {}, "hard"))));
  });
  return h("div", {},
    h("h3", {}, "Bailey goals", h("small", {}, "Ranges come from Mix setup. A target value replaces the range.")),
    h("div", { class: "gridwrap" }, h("table", { class: "grid goals" },
      h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Principle"), h("th", {}, "Range"), h("th", {}, `${trialById(S.ref)?.label || "Start"} value`), h("th", {}, "Target value"), h("th", {}, "Hard"))),
      h("tbody", {}, rows))),
    h("p", { class: "hint" }, "Hard keeps % CA RUW within 1 and each ratio within 0.01 of a target, or inside the range when there is no target. Each option holds only what it can move: coarse volume first holds % CA RUW, and fines and filler first holds FAc and FAf. Bailey targets first holds all four, ticked or not."));
}
function pickOption(key) {
  S.optKey = key;
  const o = S.suggestion.options.find((x) => x.key === key);
  S.proposal = { ...o.pct }; S.proposalPred = { prediction: o.prediction, analysis: { ...o.analysis, status: o.status } };
}
function drawProposal() {
  const box = $("#proposal"); if (!box || !S.proposal) return;
  box.innerHTML = "";
  const base = trialById(S.ref).pct || {};
  const slots = readySlots();
  const P = S.proposalPred.prediction, A = S.proposalPred.analysis, st = A.status || {};
  const rows = slots.map((s, r) => {
    const i = h("input", { type: "text", inputmode: "decimal", value: fmt(S.proposal[s] || 0, 1) });
    i.dataset.g = "prop"; i.dataset.r = r; i.dataset.c = 0; i.addEventListener("keydown", gridKeys);
    i.addEventListener("input", () => { S.proposal[s] = num(i.value) || 0; repredict(); });
    const d = (S.proposal[s] || 0) - (num(base[s]) || 0);
    return h("tr", {}, h("th", { class: "rowh", style: `--k:${slotColor(s)}` }, h("i", { class: "sw" }), matName(s), S.locks[s] ? h("small", {}, "fixed") : null),
      h("td", { class: "calc" }, fmt(num(base[s]) || 0, 1)), h("td", {}, i),
      h("td", { class: "calc " + (Math.abs(d) < 0.05 ? "" : d > 0 ? "delta up" : "delta down"), id: "d-" + s }, Math.abs(d) < 0.05 ? "-" : sgn(d, 1)));
  });
  const total = slots.reduce((x, s) => x + (S.proposal[s] || 0), 0);
  const off = Math.abs(total - 100) > 0.05;
  rows.push(h("tr", {}, h("th", { class: "rowh" }, "Total"), h("td", { class: "calc" }, "100.0"), h("td", { class: "calc strong " + (off ? "st-high" : "st-ok") }, fmt(total, 1)),
    h("td", {}, off ? h("button", { class: "btn link", style: "font-size:12.5px;padding:4px 8px", onclick: balanceProposal, title: "Adds the difference to the largest stockpile that is not fixed" }, "Make 100") : null)));
  const flag = (k) => st[k] && st[k] !== "none" ? h("span", { class: "flag " + st[k] }, st[k] === "ok" ? "in range" : st[k]) : h("span", { class: "flag none" }, "no range");
  const warn = [], note = [];
  const goals = st.goals || {};
  GOALS.forEach(([k, t, d]) => {
    const g = goals[k]; if (!g) return;
    const isHard = g.hard || S.optKey === "bailey";
    if (isHard && (st[k] === "low" || st[k] === "high") && (g.target != null || g.lo != null || g.hi != null)) {
      const v = k === "ca_ruw" ? A.bailey?.cuw_pct : A.ratios[k];
      warn.push(`${t} is ${fmt(v, d)}, outside its hard ${g.target != null ? "target of " + fmt(g.target, d) : "range"}. These stockpiles, or the fixed ones, cannot reach it in this option.`);
    }
  });
  const vt = num(S.mix.targets?.vma);
  if (vt != null && Math.abs(P.vma - vt) > 0.3) warn.push(`Predicted VMA misses the ${fmt(vt, 1)}% target by ${sgn(P.vma - vt, 1)}. Your control points, Bailey ranges or fixed stockpiles pull the blend this way. Loosen one of them, or accept the miss and adjust in the next trial.`);
  if (P.large_moves?.length) warn.push(`Large change in ${P.large_moves.join(", ")}. The rules of thumb are linear, so treat this estimate as a direction and confirm it with the trial.`);
  (st.control_points || []).forEach((c) => warn.push(`Passing ${c.sieve} mm is ${fmt(c.value, 1)}%, ${c.side === "low" ? "below" : "above"} your control point.`));
  if (A.nmas_detected !== S.an.nmas) warn.push(`This blend reads as ${A.nmas_detected} mm NMAS, not ${S.an.nmas} mm.`);
  const vcadrc = num(S.mix.targets?.vcadrc);
  if (vcadrc && P.vca_mix > vcadrc) warn.push(`Predicted VCAmix ${fmt(P.vca_mix, 1)}% is above VCA dry-rodded ${fmt(vcadrc, 1)}%.`);
  if (Math.abs(total - 100) > 0.05) warn.push("The blend must total 100% before you can use it.");
  const [small, mn] = smallPiles(S.proposal);
  small.forEach(([sl, x]) => warn.push(`${matName(sl)} is ${fmt(x, 1)}%, below your ${fmt(mn, 1)}% practical minimum. Set it to 0 or raise it to ${fmt(mn, 1)}%.`));
  (st.soft_points || []).forEach((c) => warn.push(`Passing ${sieveName(c.sieve)} is ${fmt(c.value, 1)}%, ${c.side === "low" ? "below" : "above"} your soft target of ${c.lo ?? "..."} to ${c.hi ?? "..."}%. The search could not reach it without giving up something harder.`));
  const fines = slots.filter((sl) => S.meta.kind[sl] === "FA" && (S.proposal[sl] || 0) > 0.05);
  if (practicalUI().one_fine && fines.length > 1) note.push(`This blend uses ${fines.length} fine aggregates. Your setup prefers one. The search keeps two only when one alone misses a goal.`);

  box.append(h("h3", {}, "Proposed blend", h("small", {}, "Edit any % to test your own idea. The prediction updates as you type.")),
    h("div", { class: "propgrid" },
      h("div", { class: "gridwrap" }, h("table", { class: "grid" },
        h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "Stockpile"), h("th", {}, trialById(S.ref).label), h("th", {}, "Proposed"), h("th", {}, "Change"))),
        h("tbody", {}, rows))),
      h("div", {},
        h("div", { class: "readout" },
          h("div", {}, h("span", {}, "Predicted VMA"), h("b", {}, fmt(P.vma, 1) + "%")),
          h("div", {}, h("span", {}, "Recommended Pb"), h("b", {}, fmt(P.pb, 2) + "%")),
          h("div", {}, h("span", {}, "Va at that Pb"), h("b", {}, fmt(P.va_at_pb, 1) + "%")),
          h("div", {}, h("span", {}, `Va at Pb ${fmt(P.ref?.pb, 1)}%`), h("b", {}, fmt(P.va_at_ref_pb, 1) + "%")),
          h("div", {}, h("span", {}, "VFA"), h("b", {}, fmt(P.vfa, 1) + "%")),
          h("div", {}, h("span", {}, "VCAmix"), h("b", {}, fmt(P.vca_mix, 1) + "%")),
          h("div", {}, h("span", {}, "% CA RUW"), h("b", { class: st.ca_ruw }, fmt(A.bailey?.cuw_pct, 1))),
          h("div", {}, h("span", {}, "Passing PCS"), h("b", {}, fmt(A.ratios.pct_pcs, 1) + "%"))),
        h("p", { class: "hint", style: "margin:14px 0 4px" }, "Where the VMA change comes from"),
        h("div", { class: "terms" }, Object.entries(P.terms).map(([k, x]) => h("div", { class: "term" }, h("span", {}, k === "PCS" ? "Coarse volume" : k + " ratio"), h("b", { class: x > 0 ? "delta up" : x < 0 ? "delta down" : "" }, sgn(x, 2))))),
        h("p", { class: "hint", style: "margin:14px 0 4px" }, "How the Bailey values move"),
        (() => { const R0 = anTrial(S.ref) || {}; const rng = S.mix.bailey_ranges || S.an?.default_ranges || {};
          const items = [["ca_ruw", "% CA RUW", R0.bailey?.cuw_pct, A.bailey?.cuw_pct, 1, 10], ["CA", "CA ratio", R0.ratios?.CA, A.ratios.CA, 3, 0.1], ["FAc", "FAc ratio", R0.ratios?.FAc, A.ratios.FAc, 3, 0.1], ["FAf", "FAf ratio", R0.ratios?.FAf, A.ratios.FAf, 3, 0.1]];
          return h("div", { class: "moves" }, items.map(([k, t, v, pv, d, sc]) => {
            const tg = num(S.mix.bailey_targets?.[k]?.target), tol = k === "ca_ruw" ? 1 : 0.01;
            const mc = moveClass(v, pv, tg != null ? [tg - tol, tg + tol] : rng[k], sc), up = pv > v + 1e-9, dn = pv < v - 1e-9;
            return h("div", { class: "move " + mc }, h("span", {}, t),
              h("b", {}, fmt(v, d), h("i", { class: "ar" }, up ? "\u2191" : dn ? "\u2193" : "="), fmt(pv, d)),
              h("small", {}, flag(k), mc === "better" ? " closer" : mc === "worse" ? " further" : ""));
          })); })())),
    ...(warn.length ? [h("div", { class: "notice" }, h("ul", {}, warn.map((x) => h("li", {}, x))))] : []),
    ...(note.length ? [h("div", { class: "notice teal" }, h("ul", {}, note.map((x) => h("li", {}, x))))] : []),
    h("div", { class: "row", style: "margin-top:18px" },
      h("button", { class: "btn primary", disabled: Math.abs(total - 100) > 0.05 ? true : null, onclick: acceptProposal }, `Use this blend as ${nextTrialLabel()}`),
      h("span", { class: "hint" }, "It is saved with the prediction and the recommended Pb. Add the lab results in Trials when you have them.")));
}
function balanceProposal() {
  const free = readySlots().filter((s) => !S.locks[s]);
  if (!free.length) return;
  const total = readySlots().reduce((x, s) => x + (S.proposal[s] || 0), 0);
  const big = free.reduce((a, s) => ((S.proposal[s] || 0) > (S.proposal[a] || 0) ? s : a), free[0]);
  S.proposal[big] = +((S.proposal[big] || 0) + 100 - total).toFixed(1);
  repredict();
}
function nextTrialLabel() { return "Trial " + nextTrialId().slice(1); }
async function repredict() {
  clearTimeout(repredict._t);
  repredict._t = setTimeout(async () => {
    try {
      const r = await api("/api/predict", { mix: S.mix, ref: S.ref, pct: S.proposal });
      S.proposalPred = r;
      const active = document.activeElement, idx = active?.dataset?.r;
      drawProposal(); renderSide();
      if (idx != null) { const el = $(`#proposal input[data-r="${idx}"]`); if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); } }
    } catch (e) { console.error(e); }
  }, 250);
}
function acceptProposal() {
  const P = S.proposalPred.prediction;
  const pct = {}; readySlots().forEach((s) => (pct[s] = +(S.proposal[s] || 0).toFixed(1)));
  const t = addTrial(pct, { source: "tool", prediction: P, option: S.optKey, reference: S.ref });
  t.results.pb = P.pb != null ? +P.pb.toFixed(1) : null;
  S.suggestion = null; S.proposal = null; S.step = "trials";
  changed({ now: true }); renderWork(); toast(`${t.label} added with Pb ${fmt(t.results.pb, 1)}%`);
}
UPDATE.next = () => {};

/* ---------------------------------------------------------------- side panel and charts */
const SLOT_COLORS = { CA1: "#1F62B8", CA2: "#4C98E6", CA3: "#0D3D78", FA1: "#2B9A56", FA2: "#7AC46F", FA3: "#196B3B", F1: "#8E3FB3", F2: "#D65BB5" };
const slotColor = (s) => SLOT_COLORS[s] || "#666";
const C_CUR = "#D9730B", C_PROP = "#0B8B8E", C_OLD = "#A9B0B4";
function renderSide() {
  const side = $("#side"); if (!side) return;
  side.innerHTML = "";
  const nmas = S.an?.nmas;
  const cps = S.mix.control_points || {};
  if (S.step === "materials") {
    const series = readySlots().map((s) => ({ name: matName(s), grad: S.mix.materials[s].grad, color: slotColor(s), cls: "pile" }));
    side.append(h("div", {}, h("h4", {}, "Stockpile gradations", scaleToggle()), chartBox(gradChart({ series, nmas, cps: {} }), series), gradTable(series, null)),
      h("p", { class: "caption" }, nmas ? "Dashed lines mark the Bailey control sieves for the design NMAS. Shaded area is the coarse fraction, retained on the PCS." : "Control sieves appear once trial 1 sets the NMAS."));
    return;
  }
  let series = [], focus = null, prop = null;
  const trials = S.mix.trials || [];
  trials.forEach((t) => {
    const a = anTrial(t.id); if (!a?.gradation) return;
    const g = S.chartBasis === "volume" ? a.gradation_volume : a.gradation;
    const sel = S.step === "next" ? t.id === S.ref : t.id === S.selTrial;
    series.push({ name: t.label, grad: g, cls: sel ? "cur" : "old", color: sel ? C_CUR : C_OLD });
    if (sel) focus = a;
  });
  if (S.step === "next" && S.proposalPred) {
    const A = S.proposalPred.analysis;
    prop = A;
    series.push({ name: "Proposed", grad: S.chartBasis === "volume" ? A.gradation_volume : A.gradation, cls: "prop", color: C_PROP });
  }
  series.sort((a, b) => (a.cls === "old" ? -1 : 1) - (b.cls === "old" ? -1 : 1));
  const tg = h("button", { class: "btn link toggle", onclick: () => { S.chartBasis = S.chartBasis === "mass" ? "volume" : "mass"; renderSide(); } }, S.chartBasis === "mass" ? "By volume" : "By mass");
  side.append(h("h4", {}, `Combined gradation, by ${S.chartBasis}`, h("span", { class: "row", style: "gap:12px" }, scaleToggle(), tg)), chartBox(gradChart({ series, nmas, cps }), series, true),
    gradTable(series.slice().sort((a, b) => ORD[a.cls] - ORD[b.cls]), cps),
    h("p", { class: "caption" }, nmas ? `${nmas} mm NMAS. Half ${S.an.control.half}, PCS ${S.an.control.pcs}, SCS ${S.an.control.scs} and TCS ${S.an.control.tcs} mm. The shaded side is the coarse fraction. Teal band: your control points.` : "Add trial 1 to see the blend."));
  if (focus) {
    side.append(h("h4", {}, S.step === "next" ? "Bailey principles: start vs proposed" : `Bailey principles: ${trialById(focus.id)?.label || ""}`), gauges(focus, prop));
  }
  const done = tested();
  if (done.length && S.step !== "next") side.append(h("h4", { style: "margin-top:20px" }, "VMA and air voids by trial"), historyChart(done));
  if (S.step === "next" && prop) side.append(h("p", { class: "caption" }, "Orange: start trial. Teal dashed: proposed blend."));
}
const ORD = { cur: 0, prop: 1, old: 2, pile: 3 };
/* the numbers behind the chart, one row per line, in the line colour */
function gradTable(series, cps) {
  const keys = sieves();
  const lim = (k) => { const v = (cps || {})[k] || {}; return { lo: num(v.min), hi: num(v.max), slo: num(v.soft_min), shi: num(v.soft_max) }; };
  const rng = (a, b) => (a == null && b == null ? "" : `${a ?? ""}-${b ?? ""}`);
  const hasCp = cps && keys.some((k) => lim(k).lo != null || lim(k).hi != null);
  const hasSoft = cps && keys.some((k) => lim(k).slo != null || lim(k).shi != null);
  const rows = series.filter((r) => r.grad).map((r) => h("tr", { class: "gv-" + (r.cls || "") },
    h("th", { class: "rowh", style: `--k:${r.color}` }, h("i", { class: "sw" }), r.name),
    keys.map((k) => {
      const v = num(r.grad[k]); if (v == null) return h("td", {}, "");
      const L = lim(k); let c = "";
      if (cps && r.cls !== "pile") {
        if ((L.lo != null && v < L.lo - 1e-9) || (L.hi != null && v > L.hi + 1e-9)) c = "out";
        else if ((L.slo != null && v < L.slo - 1e-9) || (L.shi != null && v > L.shi + 1e-9)) c = "softout";
      }
      return h("td", { class: c, style: r.cls === "old" ? "" : `color:${r.color}`, title: c === "out" ? "Outside the control point" : c === "softout" ? "Outside the soft target" : null }, fmt(v, 1));
    })));
  if (hasCp) rows.push(h("tr", { class: "gv-lim" }, h("th", { class: "rowh" }, "Control points"), keys.map((k) => h("td", {}, rng(lim(k).lo, lim(k).hi)))));
  if (hasSoft) rows.push(h("tr", { class: "gv-lim soft" }, h("th", { class: "rowh" }, "Soft targets"), keys.map((k) => h("td", {}, rng(lim(k).slo, lim(k).shi)))));
  if (!rows.length) return document.createTextNode("");
  const id = "gv-" + Math.random().toString(36).slice(2, 7);
  return h("div", { class: "gvals" },
    h("div", { class: "gridwrap" }, h("table", { class: "grid gv", id },
      h("thead", {}, h("tr", {}, h("th", { class: "rowh" }, "% passing"), keys.map((k) => h("th", {}, lab(k)[0].replace(" mm", ""), h("small", {}, lab(k)[1]))))),
      h("tbody", {}, rows))),
    h("div", { class: "row", style: "margin-top:4px" }, h("button", { class: "btn link", style: "font-size:12px;padding:2px 0", onclick: () => copyGrid("#" + id) }, "Copy values for Excel"),
      cps ? h("span", { class: "hint", style: "font-size:11.5px" }, "Red: outside a control point. Underlined: outside a soft target.") : null));
}
function chartBox(svg, series, legend) {
  const box = h("div", { class: "chart", html: svg });
  if (legend && series.length) box.append(h("div", { class: "legend" }, series.filter((s) => s.cls !== "old").concat(series.filter((s) => s.cls === "old").slice(-3)).map((s) => h("span", { class: s.cls === "prop" ? "dash" : "", style: `color:${s.color}` }, h("i"), h("span", { style: "color:var(--graphite)" }, s.name))),
    S.an?.nmas ? h("span", { class: "dash", style: "color:#6B7780" }, h("i"), "max density line") : null,
    Object.values(S.mix.control_points || {}).some((v) => v && (num(v.min) != null || num(v.max) != null)) ? h("span", { style: "color:var(--teal)" }, h("i", { style: "height:8px;opacity:.35" }), h("span", { style: "color:var(--graphite)" }, "control points")) : null,
    Object.values(S.mix.control_points || {}).some((v) => v && (num(v.soft_min) != null || num(v.soft_max) != null)) ? h("span", { class: "softleg" }, h("i"), h("span", { style: "color:var(--graphite)" }, "soft targets")) : null));
  else if (series.length) box.append(h("div", { class: "legend" }, series.map((s) => h("span", { style: `color:${s.color}` }, h("i"), h("span", { style: "color:var(--graphite)" }, s.name)))));
  return box;
}

S.xScale = (() => { try { return localStorage.getItem("bailey.xscale") || "even"; } catch (e) { return "even"; } })();
function scaleToggle() {
  return h("button", { class: "btn link toggle", title: "Switch the sieve axis", onclick: () => {
    S.xScale = S.xScale === "even" ? "p45" : "even";
    try { localStorage.setItem("bailey.xscale", S.xScale); } catch (e) { /* ignore */ }
    renderSide();
  } }, S.xScale === "even" ? "0.45 power axis" : "Even sieve spacing");
}
function gradChart({ series, nmas, cps }) {
  const W = 580, H = 390, L = 50, R = 18, T = 34, B = 52;
  const keys = sieves(), sv = keys.map(Number), n = sv.length;   // coarse to fine
  const pw = (d) => Math.pow(d, 0.45);
  const PL = L, PR = W - R, PT = T, PB = H - B;
  let X;
  if (S.xScale === "even") {
    const step = (PR - PL) / n;
    const xi = (i) => PR - step / 2 - i * step;                         // i counts from the coarsest sieve, so fine sits on the left
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
    const a = pw(0.075) - 0.1, b = pw(25) + 0.1;
    X = (d) => PL + (pw(d) - a) / (b - a) * (PR - PL);
  }
  const Y = (p) => PT + (100 - p) / 100 * (PB - PT);
  const ctl = nmas ? (ctlFor(nmas) || []) : [];
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gradation chart, percent passing by sieve size">`;
  s += `<defs><linearGradient id="gcur" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C_CUR}" stop-opacity=".16"/><stop offset="1" stop-color="${C_CUR}" stop-opacity="0"/></linearGradient></defs>`;
  s += `<rect class="plot" x="${PL}" y="${PT}" width="${PR - PL}" height="${PB - PT}"/>`;
  if (nmas) {
    const xp = X(ctl[1]);
    s += `<rect class="zone" x="${xp}" y="${PT}" width="${PR - xp}" height="${PB - PT}"/>`;
    s += `<text class="zlabel" x="${PR - 8}" y="${PB - 10}" text-anchor="end">coarse fraction</text><text class="zlabel" x="${xp - 8}" y="${PB - 10}" text-anchor="end">fine fraction</text>`;
  }
  s += `<g class="grid">`;
  for (let p = 0; p <= 100; p += 10) s += `<line x1="${PL}" x2="${PR}" y1="${Y(p)}" y2="${Y(p)}"${p % 20 ? ' class="minor"' : ""}/>`;
  sv.forEach((d) => (s += `<line x1="${X(d)}" x2="${X(d)}" y1="${PT}" y2="${PB}"/>`));
  s += `</g><g class="axis">`;
  for (let p = 0; p <= 100; p += 20) s += `<text x="${PL - 8}" y="${Y(p) + 4}" text-anchor="end">${p}</text>`;
  const p45 = S.xScale !== "even";
  keys.forEach((k, i) => {
    const lb = lab(k); const x = X(sv[i]);
    const crowd = p45 && sv[i] < 1.18 && (i % 2 === 1);
    const y0 = PB + 16 + (crowd ? 22 : 0);
    s += `<text class="xmm" x="${x}" y="${y0}" text-anchor="middle">${lb[0].replace(" mm", "")}</text><text class="xus" x="${x}" y="${y0 + 13}" text-anchor="middle">${esc(lb[1])}</text>`;
  });
  s += `<text class="ttl" transform="translate(${PL - 32},${(PT + PB) / 2}) rotate(-90)" text-anchor="middle">% passing</text></g>`;
  if (nmas) {
    s += `<g class="ctl">`;
    ["Half", "PCS", "SCS", "TCS"].forEach((nm, i) => {
      const d = ctl[i], x = X(d), w = nm.length * 7 + 10;
      s += `<line x1="${x}" x2="${x}" y1="${PT}" y2="${PB}"/><rect x="${x - w / 2}" y="${PT - 20}" width="${w}" height="16" rx="3"/><text x="${x}" y="${PT - 8}" text-anchor="middle">${nm}</text>`;
    });
    s += `</g>`;
    const idx = sv.indexOf(nmas); const dmax = idx > 0 ? sv[idx - 1] : sv[0];
    const pts = [];
    sv.slice().reverse().filter((d) => d <= dmax).forEach((d, i, arr) => {
      if (i > 0) { const d0 = arr[i - 1]; for (let k = 1; k < 6; k++) { const dd = Math.pow(pw(d0) + (pw(d) - pw(d0)) * k / 6, 1 / 0.45); pts.push(`${X(dd)},${Y(100 * Math.pow(dd / dmax, 0.45))}`); } }
      pts.push(`${X(d)},${Y(100 * Math.pow(d / dmax, 0.45))}`);
    });
    s += `<polyline class="mdl" points="${pts.join(" ")}"/>`;
  }
  // control points: band where both limits exist on neighbouring sieves, ticks everywhere
  const cp = keys.map((k) => { const v = (cps || {})[k] || {}; return { k, d: +k, lo: num(v.min), hi: num(v.max) }; });
  for (let i = 0; i < cp.length - 1; i++) {
    const a = cp[i], b = cp[i + 1];
    if (a.lo != null && a.hi != null && b.lo != null && b.hi != null)
      s += `<polygon class="band" points="${X(a.d)},${Y(a.hi)} ${X(b.d)},${Y(b.hi)} ${X(b.d)},${Y(b.lo)} ${X(a.d)},${Y(a.lo)}"/>`;
  }
  cp.forEach((c) => {
    const x = X(c.d);
    if (c.lo != null && c.hi != null) s += `<line class="cp" x1="${x}" x2="${x}" y1="${Y(c.hi)}" y2="${Y(c.lo)}"/>`;
    if (c.lo != null) s += `<line class="cp" x1="${x - 7}" x2="${x + 7}" y1="${Y(c.lo)}" y2="${Y(c.lo)}"/>`;
    if (c.hi != null) s += `<line class="cp" x1="${x - 7}" x2="${x + 7}" y1="${Y(c.hi)}" y2="${Y(c.hi)}"/>`;
  });
  // soft targets: a dashed bracket beside the sieve line
  keys.forEach((k) => {
    const v = (cps || {})[k] || {}, lo = num(v.soft_min), hi = num(v.soft_max);
    if (lo == null && hi == null) return;
    const x = X(+k) + 9, y1 = Y(hi ?? 100), y2 = Y(lo ?? 0);
    s += `<g class="softpt"><rect x="${x - 4}" y="${y1}" width="8" height="${Math.max(1, y2 - y1)}"/>`;
    if (hi != null) s += `<line x1="${x - 5}" x2="${x + 5}" y1="${y1}" y2="${y1}"/>`;
    if (lo != null) s += `<line x1="${x - 5}" x2="${x + 5}" y1="${y2}" y2="${y2}"/>`;
    s += `<title>Soft target ${lab(k)[0]} (${esc(lab(k)[1])}): ${lo ?? "..."} to ${hi ?? "..."}%</title></g>`;
  });
  series.forEach((ser) => {
    const pts = keys.map((k) => { const v = num(ser.grad?.[k]); return v == null ? null : [X(+k), Y(v), k, v]; }).filter(Boolean);
    if (pts.length < 2) return;
    const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    s += `<polyline class="series ${ser.cls || ""}" style="stroke:${ser.color}" points="${line}"/>`;
    if (ser.cls !== "old") pts.forEach((p) => (s += `<circle class="dot ${ser.cls || ""}" cx="${p[0]}" cy="${p[1]}" r="${ser.cls === "pile" ? 2.8 : 3.6}" style="fill:${ser.color}"><title>${esc(ser.name)}: ${lab(p[2])[0]} (${esc(lab(p[2])[1])}) ${fmt(p[3], 1)}%</title></circle>`));
  });
  return s + `</svg>`;
}

function rangeDist(x, r) {
  if (x == null || !r) return 0;
  const lo = num(r[0]), hi = num(r[1]);
  if (lo != null && x < lo) return lo - x;
  if (hi != null && x > hi) return x - hi;
  return 0;
}
/* how a value moved relative to its range: better, worse or same */
function moveClass(v, pv, r, scale) {
  if (v == null || pv == null) return "";
  const a = rangeDist(v, r), b = rangeDist(pv, r);
  if (b < a - scale * 0.02) return "better";
  if (b > a + scale * 0.02) return "worse";
  return "same";
}
function gauges(a, p) {
  const rng = S.mix.bailey_ranges || S.an?.default_ranges || {};
  const rows = [["ca_ruw", "% CA RUW", a.bailey?.cuw_pct, p?.bailey?.cuw_pct, [90, 135], 1, 10], ["CA", "CA ratio", a.ratios.CA, p?.ratios.CA, [0, 1], 3, 0.1],
    ["FAc", "FAc ratio", a.ratios.FAc, p?.ratios.FAc, [0.3, 1.1], 3, 0.1], ["FAf", "FAf ratio", a.ratios.FAf, p?.ratios.FAf, [0.3, 1.1], 3, 0.1]];
  const out = h("div", { class: p ? "gauges moving" : "gauges" }, rows.map(([k, t, v, pv, dom, d, sc]) => {
    const tg = num(S.mix.bailey_targets?.[k]?.target);
    const tol = k === "ca_ruw" ? 1 : 0.01;
    const r = tg != null ? [tg - tol, tg + tol] : (rng[k] || []);
    const lo = Math.min(dom[0], ...[v, pv, r[0]].filter((x) => x != null)), hi = Math.max(dom[1], ...[v, pv, r[1]].filter((x) => x != null));
    const frac = (x) => 100 * (x - lo) / (hi - lo);
    const pos = (x) => `${frac(x).toFixed(1)}%`;
    const track = h("div", { class: "track" });
    if (num(r[0]) != null || num(r[1]) != null) { const a0 = num(r[0]) ?? lo, a1 = num(r[1]) ?? hi; track.append(h("span", { class: "ok", style: `left:${pos(a0)};width:calc(${pos(a1)} - ${pos(a0)})`, title: `Range ${a0} to ${a1}` })); }
    const mc = moveClass(v, pv, r, sc);
    const moved = pv != null && v != null && Math.abs(pv - v) >= Math.pow(10, -d);
    if (moved) {
      const x0 = frac(Math.min(v, pv)), x1 = frac(Math.max(v, pv));
      track.append(h("span", { class: `arw ${pv > v ? "right" : "left"} ${mc}`, style: `left:${x0.toFixed(1)}%;width:${(x1 - x0).toFixed(1)}%`, title: `${fmt(v, d)} to ${fmt(pv, d)}` }));
    }
    if (tg != null) track.append(h("span", { class: "tgt", style: `left:${pos(tg)}`, title: `Target ${fmt(tg, d)}` }));
    if (v != null) track.append(h("span", { class: "mk", style: `left:calc(${pos(v)} - 1px)`, title: `Start ${fmt(v, d)}` }));
    if (pv != null) track.append(h("span", { class: "mk prop", style: `left:calc(${pos(pv)} - 1px)`, title: `Proposed ${fmt(pv, d)}` }));
    const val = p
      ? h("div", { class: "gval" }, h("b", {}, `${fmt(v, d)} \u2192 ${fmt(pv, d)}`),
          h("small", { class: mc }, moved ? `${sgn(pv - v, d)}${mc === "better" ? ", toward range" : mc === "worse" ? ", away from range" : ""}` : "no change"))
      : h("div", { class: "gval" }, h("b", {}, fmt(v, d)));
    return h("div", { class: "gauge" }, h("span", {}, t), track, val);
  }));
  return out;
}

function historyChart(done) {
  const W = 560, H = 200, L = 40, R = 14, T = 16, B = 30;
  const tg = S.mix.targets || {};
  const vals = done.flatMap((a) => [a.volumetrics.vma, a.volumetrics.va]).concat([num(tg.vma), num(tg.va)].filter((x) => x != null));
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  const n = done.length;
  const PX = 34; const X = (i) => L + (n === 1 ? (W - L - R) / 2 : PX + i * (W - L - R - 2 * PX) / (n - 1));
  const Y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="VMA and air voids for each tested trial"><g class="grid">`;
  for (let v = lo; v <= hi; v += (hi - lo > 12 ? 2 : 1)) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  s += `</g>`;
  [["vma", "var(--amber)"], ["va", "var(--teal)"]].forEach(([k, c]) => {
    if (num(tg[k]) != null) s += `<line x1="${L}" x2="${W - R}" y1="${Y(tg[k])}" y2="${Y(tg[k])}" style="stroke:${c};stroke-dasharray:5 4;stroke-width:1.2"/>`;
    s += `<polyline class="series" style="stroke:${c};stroke-width:2.4" points="${done.map((a, i) => `${X(i)},${Y(a.volumetrics[k])}`).join(" ")}"/>`;
    done.forEach((a, i) => (s += `<circle class="dot" cx="${X(i)}" cy="${Y(a.volumetrics[k])}" r="4" style="fill:${c}"/>`));
  });
  done.forEach((a, i) => (s += `<text class="axis" x="${X(i)}" y="${H - 10}" text-anchor="middle">${esc(trialById(a.id)?.label || a.id)}</text>`));
  s += `</svg>`;
  const box = h("div", { class: "chart", html: s });
  box.append(h("div", { class: "legend" }, h("span", { style: "color:var(--amber)" }, h("i"), h("span", { style: "color:var(--graphite)" }, "VMA, %")), h("span", { style: "color:var(--teal)" }, h("i"), h("span", { style: "color:var(--graphite)" }, "Air voids, %")), h("span", { class: "dash", style: "color:var(--graphite)" }, h("i"), "targets")));
  return box;
}

window.addEventListener("beforeunload", () => { if (S.mix && window.BDT_API) { window.BDT_API("/api/save", { file: S.file, mix: S.mix }); return; } if (S.mix) navigator.sendBeacon && navigator.sendBeacon("/api/save", new Blob([JSON.stringify({ file: S.file, mix: S.mix })], { type: "application/json" })); });
boot();
