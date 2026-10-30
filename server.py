"""
Bailey SMA Design Tool: local server.

Run:  python server.py        (or double-click start.bat on Windows)
Then the tool opens at http://localhost:8765 in your browser.
Uses only the Python standard library.
"""
import json, os, re, sys, shutil, time, threading, webbrowser, traceback
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "engine"))
import bailey as B  # noqa: E402
import routes as R  # noqa: E402

WEB = os.path.join(ROOT, "web")
MIXES = os.path.join(ROOT, "mixes")
HISTORY = os.path.join(MIXES, "_history")
os.makedirs(HISTORY, exist_ok=True)

TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml",
         ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json"}


def slug(name):
    s = re.sub(r"[^A-Za-z0-9._ -]+", "", name or "").strip().replace(" ", "_")
    return (s or "mix")[:80]


def safe_path(fname):
    fname = os.path.basename(fname or "")
    if not fname.endswith(".json"):
        fname += ".json"
    return os.path.join(MIXES, fname)


def list_mixes():
    out = []
    for f in sorted(os.listdir(MIXES)):
        p = os.path.join(MIXES, f)
        if not f.endswith(".json") or not os.path.isfile(p):
            continue
        try:
            with open(p, encoding="utf-8") as fh:
                m = json.load(fh)
            trials = m.get("trials") or []
            done = [t for t in trials if (t.get("results") or {}).get("pb")]
            out.append({"file": f, "name": m.get("name") or f[:-5], "modified": os.path.getmtime(p),
                        "trials": len(trials), "tested": len(done),
                        "materials": sum(1 for s in B.SLOTS if (m.get("materials") or {}).get(s, {}).get("name"))})
        except Exception as e:
            out.append({"file": f, "name": f, "error": str(e)})
    out.sort(key=lambda r: -r.get("modified", 0))
    return out


def save_mix(mix, fname=None):
    fname = os.path.basename(fname) if fname else slug(mix.get("name")) + ".json"
    path = safe_path(fname)
    if os.path.exists(path):  # keep a dated copy before overwriting
        stamp = time.strftime("%Y%m%d-%H%M%S")
        shutil.copy2(path, os.path.join(HISTORY, f"{os.path.basename(path)[:-5]}__{stamp}.json"))
        hist = sorted(f for f in os.listdir(HISTORY) if f.startswith(os.path.basename(path)[:-5] + "__"))
        for old in hist[:-30]:
            os.remove(os.path.join(HISTORY, old))
    mix["modified"] = time.strftime("%Y-%m-%d %H:%M:%S")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(mix, fh, indent=1)
    os.replace(tmp, path)
    return os.path.basename(path)


def meta():
    return {**R.meta(), "mixes_folder": MIXES}


def delete_mix(fname):
    path = safe_path(fname)
    if os.path.isfile(path):
        stamp = time.strftime("%Y%m%d-%H%M%S")
        shutil.move(path, os.path.join(HISTORY, f"{os.path.basename(path)[:-5]}__deleted_{stamp}.json"))
    return {"deleted": os.path.basename(path)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, default=_jsonable).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        u = urlparse(self.path)
        try:
            if u.path == "/api/meta":
                return self._send(200, meta())
            if u.path == "/api/mixes":
                return self._send(200, list_mixes())
            if u.path == "/api/mix":
                f = parse_qs(u.query).get("file", [""])[0]
                with open(safe_path(f), encoding="utf-8") as fh:
                    return self._send(200, {"file": os.path.basename(safe_path(f)), "mix": json.load(fh)})
            path = u.path if u.path != "/" else "/index.html"
            full = os.path.normpath(os.path.join(WEB, path.lstrip("/")))
            if not full.startswith(WEB) or not os.path.isfile(full):
                return self._send(404, {"error": "Not found"})
            with open(full, "rb") as fh:
                return self._send(200, fh.read(), TYPES.get(os.path.splitext(full)[1], "application/octet-stream"))
        except Exception as e:
            traceback.print_exc()
            return self._send(500, {"error": str(e)})

    def do_POST(self):
        u = urlparse(self.path)
        try:
            b = self._body()
            if u.path == "/api/save":
                return self._send(200, {"file": save_mix(b["mix"], b.get("file"))})
            if u.path == "/api/delete":
                return self._send(200, delete_mix(b.get("file")))
            if u.path in R.POST:
                return self._send(200, R._clean(R.POST[u.path](b)))
            return self._send(404, {"error": "Unknown action"})
        except Exception as e:
            traceback.print_exc()
            return self._send(400, {"error": str(e)})


def _jsonable(o):
    if isinstance(o, float):
        return o
    return str(o)


def main():
    port = int(os.environ.get("BAILEY_PORT", "8765"))
    for p in range(port, port + 20):
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", p), Handler)
            break
        except OSError:
            continue
    else:
        print("No free port found between", port, "and", port + 19)
        return
    url = f"http://localhost:{p}"
    print(f"\n  Bailey Design Trials is running at {url}")
    print(f"  Mix files: {MIXES}")
    print("  Keep this window open while you work. Close it to stop the tool.\n")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
