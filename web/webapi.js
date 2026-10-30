/* Bailey Design Trials, browser version.
   Replaces the local Python server: calculations run in a web worker (worker.js),
   and mixes are kept in this browser's localStorage. Nothing is sent to any server. */
(function () {
  const VER = window.BDT_VERSION || "";
  const PYO = window.BDT_PYODIDE || "";
  const worker = new Worker(`web/worker.js?v=${encodeURIComponent(VER)}${PYO ? "&pyodide=" + encodeURIComponent(PYO) : ""}`);
  let seq = 0;
  const pending = new Map();
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id); if (!p) return;
    pending.delete(e.data.id);
    let r; try { r = JSON.parse(e.data.out); } catch (err) { return p.rej(err); }
    r.ok ? p.res(r.data) : p.rej(new Error(r.error));
  };
  worker.onerror = (e) => {
    const msg = "The calculation engine did not load. Check your internet connection and reload the page." + (e.message ? ` (${e.message})` : "");
    pending.forEach((p) => p.rej(new Error(msg))); pending.clear();
  };
  const calc = (path, body) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej });
    worker.postMessage({ id, path, body: body ? JSON.stringify(body) : "" });
  });

  /* storage: localStorage when allowed, memory otherwise */
  const mem = new Map();
  let persistent = true;
  try { localStorage.setItem("bdt.test", "1"); localStorage.removeItem("bdt.test"); } catch (e) { persistent = false; }
  const store = {
    get: (k) => { try { return persistent ? localStorage.getItem(k) : (mem.get(k) ?? null); } catch (e) { return mem.get(k) ?? null; } },
    set: (k, v) => {
      if (!persistent) { mem.set(k, v); return; }
      try { localStorage.setItem(k, v); }
      catch (e) { throw new Error("This browser's storage is full. Download and delete mixes you no longer need."); }
    },
    del: (k) => { try { persistent ? localStorage.removeItem(k) : mem.delete(k); } catch (e) { mem.delete(k); } },
    keys: () => { try { return persistent ? Object.keys(localStorage) : [...mem.keys()]; } catch (e) { return [...mem.keys()]; } },
  };
  const MIX = "bdt.mix.", HIST = "bdt.hist.";
  const slug = (n) => ((n || "").replace(/[^A-Za-z0-9._ -]+/g, "").trim().replace(/ /g, "_") || "mix").slice(0, 80);
  const fileName = (f) => { f = String(f || "").split(/[\\/]/).pop(); return f.endsWith(".json") ? f : f + ".json"; };
  const readMix = (f) => { const t = store.get(MIX + f); return t ? JSON.parse(t) : null; };
  const stamp = () => { const d = new Date(), z = (x) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };

  function list() {
    const out = [];
    store.keys().filter((k) => k.startsWith(MIX)).forEach((k) => {
      const f = k.slice(MIX.length);
      try {
        const m = JSON.parse(store.get(k));
        const trials = m.trials || [];
        out.push({ file: f, name: m.name || f.replace(/\.json$/, ""), modified: (m._saved || 0) / 1000, trials: trials.length,
          tested: trials.filter((t) => (t.results || {}).pb).length,
          materials: Object.values(m.materials || {}).filter((x) => x && (x.name || "").trim()).length });
      } catch (e) { out.push({ file: f, name: f, error: String(e) }); }
    });
    return out.sort((a, b) => (b.modified || 0) - (a.modified || 0));
  }
  function save(mix, file) {
    const f = file ? fileName(file) : slug(mix.name) + ".json";
    const old = store.get(MIX + f);
    if (old) {   // keep the last 10 versions
      let h = []; try { h = JSON.parse(store.get(HIST + f) || "[]"); } catch (e) { h = []; }
      h.push(old); h = h.slice(-10);
      try { store.set(HIST + f, JSON.stringify(h)); } catch (e) { store.del(HIST + f); }
    }
    mix.modified = stamp(); mix._saved = Date.now();
    store.set(MIX + f, JSON.stringify(mix));
    return f;
  }
  async function seedExample() {
    if (store.get("bdt.seeded")) return;
    store.set("bdt.seeded", "1");
    try {
      const r = await fetch("mixes/Example_SMA_12.5_synthetic.json" + (VER ? "?v=" + VER : ""));
      if (r.ok) save(await r.json(), "Example_SMA_12.5_synthetic.json");
    } catch (e) { /* the example is optional */ }
  }

  window.BDT_API = async (path, body) => {
    const [p, qs] = path.split("?");
    const params = new URLSearchParams(qs || "");
    switch (p) {
      case "/api/meta": { const m = await calc("/api/meta"); await seedExample(); return { ...m, web: true, persistent }; }
      case "/api/mixes": return list();
      case "/api/mix": {
        const f = fileName(params.get("file")); const m = readMix(f);
        if (!m) throw new Error("That mix is not in this browser.");
        return { file: f, mix: m };
      }
      case "/api/save": return { file: save(body.mix, body.file) };
      case "/api/delete": { const f = fileName(body.file); store.del(MIX + f); store.del(HIST + f); return { deleted: f }; }
      default: return calc(p, body);
    }
  };
})();
