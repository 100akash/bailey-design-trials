"""
Calculation routes shared by the local server (server.py) and the browser
version (web/worker.js, which runs this file with Pyodide).
Each route takes a dict and returns a JSON-ready dict.
"""
import bailey as B


def meta():
    return {"sieves": [str(s) for s in B.SIEVES],
            "labels": {str(s): list(v) for s, v in B.SIEVE_LABELS.items()},
            "slots": B.SLOTS, "kind": B.KIND, "rot": B.DEFAULT_ROT,
            "sma_ca_range": {str(k): list(v) for k, v in B.SMA_CA_RANGE.items()},
            "control": {str(k): list(v) for k, v in B.CONTROL.items()}}


def analyze(b):
    return B.analyze_mix(b["mix"])


def preview(b):
    mix, nmas = b["mix"], B.num(b.get("nmas")) or B.design_nmas(b["mix"])
    a = B.analyze_blend(mix, b["pct"], nmas)
    a["status"] = B.range_status(mix, a, a["nmas"])
    return a


def forward(b):
    mix = b["mix"]
    nmas = B.num(b.get("nmas")) or B.design_nmas(mix) or 12.5
    conv = B.detect_conv(mix["materials"], mix.get("settings", {}).get("units", "auto"))
    r = B.forward_blend(mix["materials"], float(b["cuw"]), b["ca_vol"], b["fa_vol"], float(b["dust"]),
                        f2_pct=float(b.get("f2") or 0), conv=conv, pcs=B.CONTROL[nmas][1])
    a = B.analyze_blend(mix, r["pct"], nmas)
    a["status"] = B.range_status(mix, a, nmas)
    return {"blend": r, "analysis": a}


def predict(b):
    mix = b["mix"]
    nmas = B.design_nmas(mix)
    ref_t = next(t for t in mix["trials"] if t.get("id") == b["ref"])
    ref = B.trial_results(mix, ref_t, nmas)
    if not ref["volumetrics"].get("complete"):
        raise ValueError("The reference trial needs Pb, Gmb and Gmm.")
    ref["_id"] = ref_t.get("id")
    new = B.analyze_blend(mix, b["pct"], nmas)
    new["status"] = B.range_status(mix, new, nmas)
    return {"prediction": B.predict(mix, ref, new, mix.get("rot"), mix.get("targets")), "analysis": new}


def suggest(b):
    mix = b["mix"]
    nmas = B.design_nmas(mix)
    ref = next(t for t in mix["trials"] if t.get("id") == b["ref"])
    base = b.get("base") or ref["pct"]
    return B.suggest(mix, ref, base, b.get("locks") or {}, nmas)


POST = {"/api/analyze": analyze, "/api/preview": preview, "/api/forward": forward,
        "/api/predict": predict, "/api/suggest": suggest}


def _clean(o):
    """NaN and infinity are not valid JSON; send them as null."""
    if isinstance(o, float):
        return o if o == o and abs(o) != float("inf") else None
    if isinstance(o, dict):
        return {(k if isinstance(k, str) else str(k)): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if o is None or isinstance(o, (str, int, bool)):
        return o
    return str(o)


def handle_json(path, body_json):
    """Entry point for the browser worker: JSON in, JSON out."""
    import json
    try:
        if path == "/api/meta":
            out = meta()
        else:
            out = POST[path](json.loads(body_json or "{}"))
        return json.dumps({"ok": True, "data": _clean(out)})
    except Exception as e:  # noqa: BLE001
        return json.dumps({"ok": False, "error": str(e)})
