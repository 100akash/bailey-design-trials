/* Bailey Design Trials: runs the Python engine (engine/*.py) in the browser with Pyodide.
   The page sends {id, path, body}; the worker answers {id, out} where out is a JSON string. */
const q = new URL(self.location.href).searchParams;
const BASE = q.get("pyodide") || "https://cdn.jsdelivr.net/npm/pyodide@0.29.4/";
const VER = q.get("v") || "";
importScripts(BASE + "pyodide.js");

const ready = (async () => {
  const py = await loadPyodide({ indexURL: BASE });
  const root = new URL("../engine/", self.location.href);
  for (const f of ["bailey.py", "routes.py"]) {
    const r = await fetch(new URL(f, root).href + (VER ? "?v=" + VER : ""));
    if (!r.ok) throw new Error(`Could not load ${f} (${r.status})`);
    py.FS.writeFile("/home/pyodide/" + f, await r.text());
  }
  py.runPython("import sys\nsys.path.insert(0, '/home/pyodide')\nimport routes");
  return py.globals.get("routes").handle_json;
})();

self.onmessage = async (e) => {
  const { id, path, body } = e.data;
  try {
    const handle = await ready;
    self.postMessage({ id, out: handle(path, body || "") });
  } catch (err) {
    self.postMessage({ id, out: JSON.stringify({ ok: false, error: "The calculation engine did not load. " + (err && err.message ? err.message : err) }) });
  }
};
