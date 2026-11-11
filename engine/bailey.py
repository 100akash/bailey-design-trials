"""
Bailey design engine: SMA and dense-graded (coarse and fine) mixes.

Method: Vavrik, Huber, Pine, Carpenter and Bailey (2002), Bailey Method for
Gradation Selection in HMA Mixture Design, TRB Circular E-C044. Volume blending
follows the Bailey steps for SMA. VMA prediction uses linear rules of thumb that
the user can edit per mix. Pure Python, no dependencies.

Conventions
  * Gradations are % passing, ordered from the largest sieve to 0.075 mm.
  * Blend percentages are % by mass of total aggregate (sum 100).
  * Pb is % by mass of total mix. Fibers are logged only.
"""
from __future__ import annotations
from decimal import Decimal, ROUND_HALF_UP
import math

# ---------------------------------------------------------------- constants
SIEVES = [50.0, 37.5, 25.0, 19.0, 12.5, 9.5, 4.75, 2.36, 1.18, 0.6, 0.3, 0.15, 0.075]
TOP_DEFAULT_100 = (50.0, 37.5)   # older mixes have no values here: treat as 100 % passing
SIEVE_LABELS = {
    50.0: ("50.0 mm", '2"'), 37.5: ("37.5 mm", '1 1/2"'), 25.0: ("25.0 mm", '1"'), 19.0: ("19.0 mm", '3/4"'), 12.5: ("12.5 mm", '1/2"'),
    9.5: ("9.5 mm", '3/8"'), 4.75: ("4.75 mm", "#4"), 2.36: ("2.36 mm", "#8"),
    1.18: ("1.18 mm", "#16"), 0.6: ("0.600 mm", "#30"), 0.3: ("0.300 mm", "#50"),
    0.15: ("0.150 mm", "#100"), 0.075: ("0.075 mm", "#200"),
}
SLOTS = ["CA1", "CA2", "CA3", "FA1", "FA2", "FA3", "F1", "F2"]
KIND = {"CA1": "CA", "CA2": "CA", "CA3": "CA", "FA1": "FA", "FA2": "FA", "FA3": "FA", "F1": "F", "F2": "F"}

# control sieves for C-G and SMA: half, PCS, SCS, TCS
CONTROL = {
    37.5: (19.0, 9.5, 2.36, 0.6),
    25.0: (12.5, 4.75, 1.18, 0.3),
    19.0: (9.5, 4.75, 1.18, 0.3),
    12.5: (6.35, 2.36, 0.6, 0.15),   # 6.35 interpolated
    9.5: (4.75, 2.36, 0.6, 0.15),
    4.75: (2.36, 1.18, 0.3, 0.075),
}

# fine-graded mixes: new half, new PCS, new SCS, new TCS on the fine fraction, plus the original PCS
FG_CONTROL = {
    37.5: (4.75, 2.36, 0.6, 0.15, 9.5),
    25.0: (2.36, 1.18, 0.3, 0.075, 4.75),
    19.0: (2.36, 1.18, 0.3, 0.075, 4.75),
    12.5: (1.18, 0.6, 0.15, None, 2.36),
    9.5: (1.18, 0.6, 0.15, None, 2.36),
    4.75: (0.6, 0.3, 0.075, None, 1.18),
}

# Typical values from the 2023 Bailey Method course; they take priority over TRB E-C044.
CA_RANGE = {
    "sma": {25.0: (0.45, 0.60), 19.0: (0.35, 0.50), 12.5: (0.25, 0.40), 9.5: (0.15, 0.30), 4.75: (0.05, 0.20)},
    "cg": {37.5: (0.80, 0.95), 25.0: (0.70, 0.85), 19.0: (0.60, 0.75), 12.5: (0.50, 0.65), 9.5: (0.40, 0.55), 4.75: (0.30, 0.45)},
}
SMA_CA_RANGE = CA_RANGE["sma"]

TYPE_INFO = {
    "sma": {"label": "SMA", "uw_ref": "ruw", "fa_ref": "luw", "uw_range": [110, 125], "uw_start": 118, "uw_label": "% CA RUW",
            "FAc": [0.60, 0.85], "FAf": [0.65, 0.90],
            "rot": {"PCS": 2.0, "CA": 0.20, "FAc": 0.10, "FAf": 0.10, "FAc_dip": 0.65, "FAf_dip": 0.70, "AC": 2.25, "pba_abs": 0.65},
            "rot_range": {"PCS": [1, 3], "CA": [0.10, 0.30], "FAc": [0.075, 0.125], "FAf": [0.075, 0.125],
                          "FAc_dip": [0.55, 0.75], "FAf_dip": [0.60, 0.80], "AC": [1.5, 3.0]},
            "pcs_dir": -1, "vca": "VCAmix at or below VCA dry-rodded", "lever": "Coarse volume",
            "band": "AASHTO M 325"},
    "cg": {"label": "Dense, coarse-graded", "uw_ref": "luw", "fa_ref": "ruw", "uw_range": [95, 105], "uw_start": 100, "uw_label": "% CA LUW",
           "FAc": [0.35, 0.50], "FAf": [0.35, 0.50],
           "rot": {"PCS": 4.0, "CA": 0.20, "FAc": 0.05, "FAf": 0.05, "FAc_dip": 0.55, "FAf_dip": 0.55, "AC": 2.25, "pba_abs": 0.65},
           "rot_range": {"PCS": [3, 5], "CA": [0.10, 0.30], "FAc": [0.025, 0.075], "FAf": [0.025, 0.075],
                         "FAc_dip": [0.45, 0.65], "FAf_dip": [0.45, 0.65], "AC": [1.5, 3.0]},
           "pcs_dir": -1, "vca": "VCAmix at or below the fine aggregate volume", "lever": "FAc",
           "band": "ASTM D3515"},
    "fg": {"label": "Dense, fine-graded", "uw_ref": "luw", "fa_ref": "ruw", "uw_range": [60, 80], "uw_start": 70, "uw_label": "% CA LUW",
           "CA": [0.60, 1.00], "FAc": [0.35, 0.50], "FAf": [0.35, 0.50],
           "rot": {"PCS": 6.0, "CA": 0.35, "FAc": 0.05, "FAf": 0.05, "FAc_dip": 0.50, "FAf_dip": 0.50, "AC": 2.25, "pba_abs": 0.65},
           "rot_range": {"PCS": [5, 7], "CA": [0.25, 0.45], "FAc": [0.025, 0.075], "FAf": [0.025, 0.075],
                         "FAc_dip": [0.40, 0.60], "FAf_dip": [0.40, 0.60], "AC": [1.5, 3.0]},
           "pcs_dir": 1, "vca": "VCAmix 3 to 5% below the fine aggregate volume", "lever": "New FAc",
           "band": "ASTM D3515"},
}
DEFAULT_ROT = dict(TYPE_INFO["sma"]["rot"])

# gradation bands: sieve -> (min, max)
SPEC_BANDS = {
    "sma": {
        19.0: {25.0: (100, 100), 19.0: (90, 100), 12.5: (50, 88), 9.5: (25, 60), 4.75: (20, 28), 2.36: (16, 24), 0.075: (8, 11)},
        12.5: {19.0: (100, 100), 12.5: (90, 100), 9.5: (50, 80), 4.75: (20, 35), 2.36: (16, 24), 0.075: (8, 11)},
        9.5: {12.5: (100, 100), 9.5: (70, 95), 4.75: (30, 50), 2.36: (20, 30), 1.18: (None, 21), 0.6: (None, 18), 0.3: (None, 15), 0.075: (8, 12)},
        4.75: {9.5: (100, 100), 4.75: (90, 100), 2.36: (28, 65), 1.18: (22, 36), 0.6: (18, 28), 0.3: (15, 22), 0.15: (13, 18), 0.075: (12, 15)},
    },
    "dense": {
        37.5: {50.0: (100, 100), 37.5: (90, 100), 25.0: (68, 88), 19.0: (56, 80), 12.5: (44, 70), 9.5: (37, 64), 4.75: (23, 53), 2.36: (15, 41), 1.18: (10, 30), 0.6: (7, 22), 0.3: (4, 16), 0.15: (2, 12), 0.075: (0, 6)},
        25.0: {37.5: (100, 100), 25.0: (90, 100), 19.0: (74, 91), 12.5: (56, 80), 9.5: (46, 73), 4.75: (29, 59), 2.36: (19, 45), 1.18: (13, 33), 0.6: (8, 24), 0.3: (5, 17), 0.15: (3, 12), 0.075: (1, 7)},
        19.0: {25.0: (100, 100), 19.0: (90, 100), 12.5: (68, 88), 9.5: (56, 80), 4.75: (35, 65), 2.36: (23, 49), 1.18: (15, 35), 0.6: (9, 25), 0.3: (5, 19), 0.15: (3, 13), 0.075: (2, 8)},
        12.5: {19.0: (100, 100), 12.5: (90, 100), 9.5: (74, 91), 4.75: (44, 74), 2.36: (28, 58), 1.18: (18, 42), 0.6: (11, 30), 0.3: (5, 21), 0.15: (3, 15), 0.075: (2, 10)},
        9.5: {12.5: (100, 100), 9.5: (90, 100), 4.75: (55, 85), 2.36: (32, 67), 1.18: (20, 46), 0.6: (12, 33), 0.3: (7, 23), 0.15: (3, 15), 0.075: (2, 10)},
        4.75: {9.5: (95, 100), 4.75: (90, 100), 2.36: (50, 75), 1.18: (30, 54), 0.6: (20, 40), 0.3: (13, 30), 0.15: (8, 20), 0.075: (6, 12)},
    },
}


def mix_type(mix, nmas=None):
    """'sma', 'cg' or 'fg'. 'dense' means detect: fine-graded when the coarse aggregate
    sits at 90 % of LUW or less in the first full trial."""
    t = str((mix.get("settings") or {}).get("mix_type") or "sma").lower()
    if t in ("sma", "cg", "fg"):
        return t
    if t != "dense":
        return "sma"
    nmas = nmas or design_nmas(mix)
    if nmas:
        conv = detect_conv(mix.get("materials", {}), (mix.get("settings") or {}).get("units", "auto"))
        for tr in mix.get("trials") or []:
            pct = tr.get("pct") or {}
            if sum((num(v) or 0) for v in pct.values()) > 99:
                try:
                    bc = back_calc(mix["materials"], pct, nmas, conv, mix="cg")
                    if bc and bc.get("cuw_pct") is not None:
                        return "fg" if bc["cuw_pct"] <= 90 else "cg"
                except Exception:
                    pass
                break
    return "cg"


def rot_for(mix, mtype=None):
    mtype = mtype or mix_type(mix)
    base = TYPE_INFO[mtype]["rot"]
    if "rot_override" in mix:
        src = mix.get("rot_override") or {}
    else:   # older files stored the full factor set; keep only what differs from the defaults
        src = {k: v for k, v in (mix.get("rot") or {}).items() if num(v) is not None and k in base and abs(num(v) - base[k]) > 1e-9}
    over = {k: num(v) for k, v in src.items() if num(v) is not None and k in base}
    return {**base, **over}


# Bailey goals: key, soft scale, tolerance used when a goal is hard or a target value
BAILEY_KEYS = (("ca_ruw", 1.0, 1.0), ("CA", 0.05, 0.01), ("FAc", 0.05, 0.01), ("FAf", 0.05, 0.01))


def bailey_goals(mix, nmas):
    """Range from setup, optional target value and hard flag from the Next trial screen."""
    rng = mix.get("bailey_ranges") or default_ranges(nmas, mix_type(mix, nmas))
    tg = mix.get("bailey_targets") or {}
    out = {}
    for k, _, tol in BAILEY_KEYS:
        r = rng.get(k) or [None, None]
        t = tg.get(k) or {}
        target = num(t.get("target"))
        out[k] = {"lo": num(r[0]) if len(r) > 0 else None, "hi": num(r[1]) if len(r) > 1 else None,
                  "target": target, "hard": bool(t.get("hard")), "tol": tol}
    return out


def bailey_value(an, k):
    return (an.get("bailey") or {}).get("cuw_pct") if k == "ca_ruw" else an["ratios"].get(k)


def practical(mix):
    """Practical limits for the search. Defaults: aggregate stockpiles 0 or at least 5 %,
    fillers exempt, and a soft preference for a single fine aggregate."""
    sp = mix.get("search") or {}
    mn = num(sp.get("min_pile_pct"))
    return {"min_pile_pct": 5.0 if mn is None and "min_pile_pct" not in sp else (mn or 0.0),
            "min_fillers": bool(sp.get("min_fillers", False)),
            "one_fine": bool(sp.get("one_fine", True))}


def default_ranges(nmas, mtype="sma"):
    info = TYPE_INFO[mtype]
    if mtype == "fg":
        ca = info["CA"]
    else:
        ca = CA_RANGE[mtype].get(nmas, (None, None)) if nmas else (None, None)
    return {"ca_ruw": list(info["uw_range"]), "CA": list(ca), "FAc": list(info["FAc"]), "FAf": list(info["FAf"])}


# ---------------------------------------------------------------- helpers
def xround(x, n=0):
    """Excel ROUND (half away from zero)."""
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return x
    q = Decimal(1).scaleb(-n)
    d = Decimal(repr(abs(x))).quantize(q, rounding=ROUND_HALF_UP)
    return float(d) if x >= 0 else -float(d)


def num(v):
    try:
        if v is None or v == "":
            return None
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def mean(vals):
    v = [num(x) for x in vals if num(x) is not None and num(x) > 0]
    return sum(v) / len(v) if v else None


def grad_list(mat):
    """Material gradation as list aligned to SIEVES (None if missing)."""
    g = mat.get("grad") or {}
    out = []
    for s in SIEVES:
        v = g.get(str(s)) if isinstance(g, dict) else None
        if v is None and isinstance(g, dict):
            v = g.get(f"{s:g}")
        v = num(v)
        if v is None and s in TOP_DEFAULT_100:
            v = 100.0
        out.append(v)
    return out


def material_ready(mat):
    if not mat or not mat.get("name") and not mat.get("grad"):
        return False
    g = grad_list(mat)
    return all(v is not None for v in g) and (num(mat.get("gsb")) or 0) > 0


def detect_conv(materials, units_setting="auto"):
    """1000 for kg/m3, 62.4 for lb/ft3."""
    if units_setting == "metric":
        return 1000.0
    if units_setting == "english":
        return 62.4
    uws = [num(m.get(k)) for m in materials.values() for k in ("luw", "ruw") if num(m.get(k))]
    if not uws:
        return 1000.0
    return 1000.0 if max(uws) > 500 else 62.4


# ---------------------------------------------------------------- gradation
def blend_gradation(materials, pct, rounded=True):
    out = {}
    for i, s in enumerate(SIEVES):
        tot = 0.0
        for slot, p in pct.items():
            p = num(p) or 0.0
            if p <= 0:
                continue
            g = grad_list(materials.get(slot, {}))
            tot += (g[i] or 0.0) * p / 100.0
        out[s] = xround(tot, 1) if rounded else tot
    return out


def gradation_by_volume(materials, pct):
    """% passing by volume (retained mass / Gsb)."""
    vols = []
    for i in range(len(SIEVES)):
        v = 0.0
        for slot, p in pct.items():
            p = num(p) or 0.0
            m = materials.get(slot, {})
            gsb = num(m.get("gsb")) or 0
            if p <= 0 or gsb <= 0:
                continue
            g = grad_list(m)
            above = 100.0 if i == 0 else (g[i - 1] or 0)
            v += (above - (g[i] or 0)) / gsb * p / 100.0
        vols.append(v)
    pan = 0.0
    for slot, p in pct.items():
        p = num(p) or 0.0
        m = materials.get(slot, {})
        gsb = num(m.get("gsb")) or 0
        if p > 0 and gsb > 0:
            pan += (grad_list(m)[-1] or 0) / gsb * p / 100.0
    total = sum(vols) + pan
    out, cum = {}, 0.0
    for i, s in enumerate(SIEVES):
        cum += 100 * vols[i] / total if total else 0
        out[s] = xround(100 - cum, 1)
    return out


def bailey_nmas(grad):
    """One sieve larger than the first sieve with CUMULATIVE retained > 15 %."""
    for i, s in enumerate(SIEVES):
        if 100.0 - grad[s] > 15.0:
            return SIEVES[i - 1] if i > 0 else SIEVES[0]
    return SIEVES[-1]


def half_635(p95, p475):
    return xround(p95 - 0.6632 * (p95 - p475), 1)


def control_points(nmas, mtype="sma"):
    if mtype == "fg":
        h, pcs, scs, tcs, op = FG_CONTROL[nmas]
        return {"half": h, "pcs": pcs, "scs": scs, "tcs": tcs, "coarse_pcs": op, "new": True}
    h, pcs, scs, tcs = CONTROL[nmas]
    return {"half": h, "pcs": pcs, "scs": scs, "tcs": tcs, "coarse_pcs": pcs, "new": False}


def ratios(nmas, grad, mtype="sma"):
    def safe(a, b):
        return xround(a / b, 3) if b else None
    if mtype == "fg":
        h, pcs, scs, tcs, op = FG_CONTROL[nmas]
        ph = grad[h]
        return {
            "pct_half": ph, "pct_pcs": grad[op], "pct_newpcs": grad[pcs], "pct_scs": grad[scs],
            "pct_tcs": grad[tcs] if tcs else None,
            "CA": safe(ph - grad[pcs], grad[op] - ph),
            "FAc": safe(grad[scs], grad[pcs]),
            "FAf": safe(grad[tcs], grad[scs]) if tcs else None,
        }
    h, pcs, scs, tcs = CONTROL[nmas]
    ph = half_635(grad[9.5], grad[4.75]) if nmas == 12.5 else grad[h]
    return {
        "pct_half": ph, "pct_pcs": grad[pcs], "pct_scs": grad[scs], "pct_tcs": grad[tcs],
        "CA": safe(ph - grad[pcs], 100 - ph),
        "FAc": safe(grad[scs], grad[pcs]),
        "FAf": safe(grad[tcs], grad[scs]),
    }


# ---------------------------------------------------------------- aggregate properties
def combined_gsb(materials, pct):
    s = 0.0
    for slot, p in pct.items():
        p = num(p) or 0
        g = num(materials.get(slot, {}).get("gsb")) or 0
        if p > 0 and g > 0:
            s += p / g
    return xround(100 / s, 3) if s else None


def combined_abs(materials, pct):
    s = 0.0
    for slot, p in pct.items():
        p = num(p) or 0
        a = num(materials.get(slot, {}).get("abs"))
        s += p / 100 * (a if a is not None else 0.0)
    return xround(s, 2)


def combined_gca(materials, pct, pcs):
    """Gsb of the plus-PCS material (used for VCAmix)."""
    ipcs = SIEVES.index(pcs)
    w = {}
    for slot, p in pct.items():
        p = num(p) or 0
        m = materials.get(slot, {})
        if p > 0:
            w[slot] = p / 100 * (100 - (grad_list(m)[ipcs] or 0))
    tot = sum(w.values())
    if not tot:
        return None
    s = 0.0
    for slot, x in w.items():
        g = num(materials[slot].get("gsb")) or 0
        if g > 0:
            s += xround(100 * x / tot, 1) / g
    return xround(100 / s, 3) if s else None


# ---------------------------------------------------------------- forward volume blend (SMA)
def _push_residual(vals: dict, keys):
    keys = [k for k in keys if k in vals]
    if not keys:
        return vals
    r = 100 - sum(vals[k] for k in keys)
    mx = max(vals[k] for k in keys)
    for k in keys:
        if vals[k] == mx:
            vals[k] = vals[k] + r
    return vals


def forward_blend(materials, cuw_pct, ca_vol, fa_vol, dust_target, f2_pct=0.0,
                  conv=1000.0, mix="sma", fa_uw_pct=100.0, rounded=True, pcs=2.36):
    """Bailey volume blend for SMA, steps 1-9. ca_vol/fa_vol: dict slot->% volume.
    F1 is the adjustable filler (like MF), F2 a fixed % (like lime).
    Returns dict slot->% by mass. rounded=False gives the smooth version."""
    R = (lambda x, n: xround(x, n)) if rounded else (lambda x, n: x)
    pcs_i = None
    CA = [s for s in ("CA1", "CA2", "CA3") if (num(ca_vol.get(s)) or 0) > 0]
    FA = [s for s in ("FA1", "FA2", "FA3") if (num(fa_vol.get(s)) or 0) > 0]
    if not CA or not FA:
        raise ValueError("Need at least one coarse and one fine aggregate in the volume blend.")
    nm = materials
    pcs_i = SIEVES.index(pcs)
    i200 = SIEVES.index(0.075)
    ref_ca = "ruw" if mix == "sma" else "luw"
    ref_fa = "luw" if mix == "sma" else "ruw"
    cuw = {s: cuw_pct / 100 * num(nm[s][ref_ca]) for s in CA}
    fauw = {s: fa_uw_pct / 100 * num(nm[s][ref_fa]) for s in FA}
    m = {s: num(ca_vol[s]) / 100 * cuw[s] for s in CA}
    voids = R(sum((1 - cuw[s] / (num(nm[s]["gsb"]) * conv)) * num(ca_vol[s]) for s in CA), 1)
    for s in FA:
        m[s] = fauw[s] * (num(fa_vol[s]) / 100) * (voids / 100)
    tot = sum(m.values())
    F = {s: R(100 * x / tot, 1) for s, x in m.items()}
    if rounded:
        F = _push_residual(F, list(F))
    gp = {s: grad_list(nm[s]) for s in CA + FA}
    fa_in_ca = {s: R(F[s] / 100 * gp[s][pcs_i], 1) for s in CA}
    ca_in_fa = {s: R(F[s] / 100 * (100 - gp[s][pcs_i]), 1) for s in FA}
    sca, sfa = sum(F[s] for s in CA), sum(F[s] for s in FA)
    G = {}
    for s in CA:
        G[s] = R(F[s] + fa_in_ca[s] - F[s] / sca * sum(ca_in_fa.values()), 1)
    for s in FA:
        G[s] = R(F[s] + ca_in_fa[s] - F[s] / sfa * sum(fa_in_ca.values()), 1)
    if rounded:
        G = _push_residual(G, list(G))
    dust = sum(G[s] / 100 * gp[s][i200] for s in CA + FA)
    f1 = nm.get("F1") if material_ready(nm.get("F1")) else None
    f1_200 = grad_list(f1)[i200] if f1 else 0
    need = 0.0 if (not f1_200 or dust > dust_target) else R((dust_target - dust) / (f1_200 / 100), 1)
    sfa = sum(G[s] for s in FA)
    out = {s: G[s] for s in CA}
    for s in FA:
        if need > f2_pct:
            out[s] = R(G[s] - G[s] / sfa * need, 1)
        else:
            out[s] = R(G[s] - G[s] / sfa * need - G[s] / sfa * f2_pct, 1)
    out["F1"] = R(need - f2_pct if need >= f2_pct else need, 1)
    out["F2"] = f2_pct
    if rounded:
        out = _push_residual(out, list(out))
    return {"pct": out, "ca_voids": voids, "vol_ca": R(100 - voids, 1), "vol_fa": voids,
            "f1_needed": need, "dust_before_filler": dust}


# ---------------------------------------------------------------- back-calculation
def back_calc(materials, pct, nmas, conv, mix="sma", fa_uw_pct=100.0):
    """Recover the Bailey design inputs from a blend given as % by mass.
    Inverse of forward_blend (smooth form): CA chosen UW (% RUW for SMA),
    CA and FA volume blends, CA/FA volumes and the #200 target.
    Exact inverse of the unrounded forward sequence."""
    pcs = CONTROL[nmas][1]
    ip = SIEVES.index(pcs)
    CA = [s for s in ("CA1", "CA2", "CA3") if (num(pct.get(s)) or 0) > 0]
    FA = [s for s in ("FA1", "FA2", "FA3") if (num(pct.get(s)) or 0) > 0]
    if not CA or not FA:
        return None
    ref_ca = "ruw" if mix == "sma" else "luw"
    ref_fa = "luw" if mix == "sma" else "ruw"
    for s in CA:
        if not num(materials[s].get(ref_ca)):
            return {"error": f"{materials[s].get('name') or s} needs a {ref_ca.upper()}."}
    for s in FA:
        if not num(materials[s].get(ref_fa)):
            return {"error": f"{materials[s].get('name') or s} needs a {ref_fa.upper()}."}
    M = {s: num(pct[s]) for s in CA + FA}
    fill = (num(pct.get("F1")) or 0) + (num(pct.get("F2")) or 0)
    sfa = sum(M[s] for s in FA)
    G = {s: M[s] for s in CA}
    for s in FA:
        G[s] = M[s] * (sfa + fill) / sfa
    p = {s: (grad_list(materials[s])[ip] or 0) for s in CA}          # FA in CA (% passing PCS)
    q = {s: 100 - (grad_list(materials[s])[ip] or 0) for s in FA}    # CA in FA (% retained)
    F = dict(G)
    for _ in range(200):
        Fca, Ffa = sum(F[s] for s in CA), sum(F[s] for s in FA)
        Scf = sum(F[s] * q[s] / 100 for s in FA)
        Sfc = sum(F[s] * p[s] / 100 for s in CA)
        new = {}
        for s in CA:
            new[s] = G[s] / (1 + p[s] / 100 - Scf / Fca)
        for s in FA:
            new[s] = G[s] / (1 + q[s] / 100 - Sfc / Ffa)
        diff = max(abs(new[s] - F[s]) for s in F)
        F = new
        if diff < 1e-10:
            break
    uw_ca = {s: num(materials[s][ref_ca]) for s in CA}
    uw_fa = {s: fa_uw_pct / 100 * num(materials[s][ref_fa]) for s in FA}
    vv = {s: F[s] / uw_ca[s] for s in CA}
    ww = {s: F[s] / uw_fa[s] for s in FA}
    ca_vol = {s: 100 * vv[s] / sum(vv.values()) for s in CA}
    fa_vol = {s: 100 * ww[s] / sum(ww.values()) for s in FA}
    a, b = sum(F[s] for s in CA), sum(F[s] for s in FA)
    Cm = sum(ca_vol[s] * uw_ca[s] for s in CA) / 100
    B = sum(ca_vol[s] * uw_ca[s] / (num(materials[s]["gsb"]) * conv) for s in CA)
    A = sum(uw_fa[s] * fa_vol[s] for s in FA) / 100
    k = 100 * A * a / (100 * Cm * b + A * a * B)
    vol_ca = k * B
    grad = blend_gradation(materials, pct)
    return {"cuw_pct": 100 * k, "ca_vol": ca_vol, "fa_vol": fa_vol,
            "vol_ca": vol_ca, "vol_fa": 100 - vol_ca, "dust": grad[0.075],
            "f2_pct": num(pct.get("F2")) or 0.0, "reference": "% CA RUW" if mix == "sma" else "% CA LUW"}


# ---------------------------------------------------------------- volumetrics
def volumetrics(pb, gmb, gmm, gsb, gb=1.03):
    out = {"pb": pb, "gmb": gmb, "gmm": gmm}
    if not (pb and gmb and gsb):
        return out
    out["vma"] = xround(100 - gmb * (100 - pb) / gsb, 2)
    if gmm:
        out["va"] = xround(100 - 100 * gmb / gmm, 2)
        out["vfa"] = xround(100 * (out["vma"] - out["va"]) / out["vma"], 1) if out["vma"] else None
        gse = (100 - pb) / (100 / gmm - pb / gb)
        out["gse"] = xround(gse, 3)
        pba = 100 * gb * (gse - gsb) / (gsb * gse)
        out["pba"] = xround(pba, 2)
        out["pbe"] = xround(pb - pba * (100 - pb) / 100, 2)
    return out


def vca_mix(gmb, pb, gca, pct_pcs):
    if not (gmb and gca and pb is not None):
        return None
    return xround(100 - (gmb / gca) * ((100 - pb) / 100) * (100 - pct_pcs), 2)


# ---------------------------------------------------------------- VCA break sieve
# AASHTO R 46 break point sieve for the coarse fraction, by NMAS (mm)
VCA_BREAK_AASHTO = {37.5: 4.75, 25: 4.75, 19: 4.75, 12.5: 4.75, 9.5: 2.36, 4.75: 1.18}


def vca_break(mix, nmas, cs):
    """Sieve that splits coarse from fine for VCAmix and VCA dry-rodded.
    settings.vca_sieve: 'pcs' (Bailey PCS, default), 'aashto' (R 46 break point) or a sieve size."""
    v = (mix.get("settings") or {}).get("vca_sieve") or "pcs"
    s = None
    if v == "aashto":
        s = VCA_BREAK_AASHTO.get(nmas)
    elif v != "pcs":
        x = num(v)
        s = next((k for k in SIEVES if x is not None and abs(k - x) < 1e-9), None)
    return (s, v if s is not None else "pcs") if s is not None else (cs["coarse_pcs"], "pcs")


# ---------------------------------------------------------------- analysis of one blend
def analyze_blend(mix, pct, nmas=None):
    materials = mix["materials"]
    conv = detect_conv(materials, mix.get("settings", {}).get("units", "auto"))
    grad = blend_gradation(materials, pct)
    nm_det = bailey_nmas(grad)
    nmas = nmas or nm_det
    if nmas not in CONTROL:
        nmas = min(CONTROL, key=lambda k: abs(k - nmas))
    mt = mix_type(mix, nmas)
    r = ratios(nmas, grad, mt)
    cs = control_points(nmas, mt)
    out = {
        "gradation": grad, "gradation_volume": gradation_by_volume(materials, pct),
        "nmas_detected": nm_det, "nmas": nmas, "mix_type": mt, "control": cs, "ratios": r,
        "gsb": combined_gsb(materials, pct), "abs": combined_abs(materials, pct),
        "conv": conv,
        "sum": xround(sum((num(v) or 0) for v in pct.values()), 2),
    }
    vs, vmode = vca_break(mix, nmas, cs)
    out["vca_sieve"], out["vca_mode"] = vs, vmode
    out["gca"] = combined_gca(materials, pct, vs)
    out["pct_vca"] = r["pct_pcs"] if vmode == "pcs" else grad.get(vs)
    try:
        out["bailey"] = back_calc(materials, pct, nmas, conv, mix="sma" if mt == "sma" else "cg")
    except Exception as e:  # incomplete materials
        out["bailey"] = {"error": str(e)}
    out["warnings"] = slot_warnings(materials, cs["coarse_pcs"], pct)
    # first-trial binder estimate, as in the volume blending sheet
    tg = mix.get("targets") or {}
    vt, at = num(tg.get("vma")), num(tg.get("va"))
    if vt is not None and at is not None and out["abs"] is not None:
        rot = rot_for(mix, mt)
        pba = rot["pba_abs"] * out["abs"]
        pbe = (vt - at) / rot["AC"]
        out["est_pb"] = {"pba": xround(pba, 2), "pbe": xround(pbe, 2), "pb": xround(pba + pbe, 2)}
    return out


def slot_warnings(materials, pcs, pct):
    w = []
    ip = SIEVES.index(pcs)
    for s in SLOTS:
        m = materials.get(s) or {}
        if (num(pct.get(s)) or 0) <= 0:
            continue
        g = grad_list(m)
        if g[ip] is None:
            continue
        name = m.get("name") or s
        if KIND[s] == "CA" and g[ip] >= 50:
            w.append(f"{name} passes {g[ip]:.1f}% on the PCS ({pcs} mm). Bailey treats it as a fine aggregate.")
        if KIND[s] == "FA" and g[ip] < 50:
            w.append(f"{name} passes only {g[ip]:.1f}% on the PCS ({pcs} mm). Bailey treats it as a coarse aggregate.")
    return w


def trial_results(mix, trial, nmas):
    """Blend analysis plus measured volumetrics for a trial."""
    a = analyze_blend(mix, trial.get("pct", {}), nmas)
    res = trial.get("results") or {}
    gb = num(mix.get("settings", {}).get("gb")) or 1.03
    pb = num(res.get("pb"))
    gmb = mean(res.get("gmb") or [])
    gmm = mean(res.get("gmm") or [])
    vol = volumetrics(pb, gmb, gmm, a["gsb"], gb)
    if gmb and pb:
        vol["vca_mix"] = vca_mix(gmb, pb, a["gca"], a["pct_vca"])
    vcadrc = num((trial.get("results") or {}).get("vcadrc")) or num(mix.get("targets", {}).get("vcadrc"))
    if vcadrc and vol.get("vca_mix") is not None:
        vol["vca_ok"] = vol["vca_mix"] <= vcadrc
    vol["complete"] = all(vol.get(k) is not None for k in ("vma", "va", "pba"))
    # extra volumetrics for the Results screen
    gl = [num(x) for x in (res.get("gmb") or []) if num(x)]
    ml = [num(x) for x in (res.get("gmm") or []) if num(x)]
    ex = {"gsb": a["gsb"], "gca": a["gca"], "abs": a["abs"], "vca_sieve": a["vca_sieve"], "vca_mode": a["vca_mode"],
          "gmb_n": len(gl), "gmb_spread": xround(max(gl) - min(gl), 3) if len(gl) > 1 else None,
          "gmm_n": len(ml), "gmm_spread": xround(max(ml) - min(ml), 3) if len(ml) > 1 else None}
    if vol.get("complete"):
        ex["vbe"] = xround(vol["vma"] - vol["va"], 2)
        ex["pba_share"] = xround(vol["pba"] / a["abs"], 2) if a["abs"] else None
        p200 = a["gradation"].get(0.075)
        ex["dust_pbe"] = xround(p200 / vol["pbe"], 2) if vol.get("pbe") else None
        ex["dust_pb"] = xround(p200 / pb, 2) if pb else None
        ex["density"] = xround(vol["gmb"] * a["conv"], 0) if vol.get("gmb") else None
        ex["ps"] = xround(100 - pb, 2)
    mt = a.get("mix_type", "sma")
    vca = vol.get("vca_mix")
    chk = {"rule": TYPE_INFO[mt]["vca"], "vca_mix": vca, "ok": None, "limit": None}
    if vca is not None:
        if mt == "sma":
            if vcadrc:
                chk.update(limit=vcadrc, ok=vca <= vcadrc, text=f"VCAmix {vca:.1f}% vs VCA dry-rodded {vcadrc:.1f}%")
            else:
                chk["text"] = "Enter VCA dry-rodded to check stone-on-stone contact."
        else:
            fa = (a.get("bailey") or {}).get("vol_fa")
            if fa is not None:
                if mt == "cg":
                    chk.update(limit=xround(fa, 1), ok=vca <= fa, text=f"VCAmix {vca:.1f}% vs fine aggregate volume {fa:.1f}%")
                else:
                    chk.update(limit=xround(fa, 1), ok=(fa - 5) <= vca <= (fa - 3), text=f"VCAmix {vca:.1f}% vs fine aggregate volume {fa:.1f}% (aim 3 to 5% below)")
    ex["vca_check"] = chk
    vol["extra"] = ex
    a["volumetrics"] = vol
    pred = trial.get("prediction")
    if pred and vol.get("vma") is not None:
        err = {"vma": xround(pred["vma"] - vol["vma"], 2) if pred.get("vma") is not None else None, "va": None}
        r = pred.get("ref") or {}
        if vol.get("va") is not None and pb and all(r.get(k) is not None for k in ("va", "pb", "pba")) and pred.get("pba") is not None:
            # predicted Va at the Pb actually used in the lab
            va_pred = r["va"] + pred["dvma"] + ((r["pb"] - r["pba"]) - (pb - pred["pba"])) * pred.get("ac_factor", 2.25)
            err["va_pred_at_actual_pb"] = xround(va_pred, 2)
            err["va"] = xround(va_pred - vol["va"], 2)
        a["prediction_error"] = err
    return a


# ---------------------------------------------------------------- prediction
def _dip(a, b, f, d):
    return (abs(b - d) - abs(a - d)) / f


def predict(mix, ref, new, rot=None, targets=None):
    """ref: trial_results() of the reference trial (needs volumetrics).
    new: analyze_blend() of the proposed blend.
    Returns predicted VMA, recommended Pb for target Va, Va at that Pb, VCAmix."""
    mt = new.get("mix_type") or mix_type(mix)
    rot = {**rot_for(mix, mt), **(rot or {})}
    targets = targets or {}
    rv, rr, nr = ref["volumetrics"], ref["ratios"], new["ratios"]
    both = lambda k: rr.get(k) is not None and nr.get(k) is not None
    terms = {
        "PCS": TYPE_INFO[mt]["pcs_dir"] * (nr["pct_pcs"] - rr["pct_pcs"]) / rot["PCS"],
        "CA": (nr["CA"] - rr["CA"]) / rot["CA"] if both("CA") else 0.0,
        "FAc": _dip(rr["FAc"], nr["FAc"], rot["FAc"], rot["FAc_dip"]) if both("FAc") else 0.0,
        "FAf": _dip(rr["FAf"], nr["FAf"], rot["FAf"], rot["FAf_dip"]) if both("FAf") else 0.0,
    }
    dvma = sum(terms.values())
    vma = rv["vma"] + dvma
    pba_new = rv["pba"] + rot["pba_abs"] * (new["abs"] - ref["abs"])
    va_t = num(targets.get("va"))
    pb_ref = rv["pb"]
    if va_t is not None:
        pb_rec = pba_new + (pb_ref - rv["pba"]) - (va_t - rv["va"] - dvma) / rot["AC"]
    else:
        pb_rec = pb_ref
    va = rv["va"] + dvma + ((pb_ref - rv["pba"]) - (pb_rec - pba_new)) * rot["AC"]
    va_same_pb = rv["va"] + dvma + ((pb_ref - rv["pba"]) - (pb_ref - pba_new)) * rot["AC"]
    gsb = new["gsb"]
    gmb = (100 - vma) * gsb / (100 - pb_rec) if gsb else None
    vca = vca_mix(gmb, pb_rec, new.get("gca"), new.get("pct_vca", nr["pct_pcs"])) if gmb else None
    vfa = 100 * (vma - va) / vma if vma else None
    big = []
    if abs(nr["pct_pcs"] - rr["pct_pcs"]) > 3: big.append("PCS")
    if both("CA") and abs(nr["CA"] - rr["CA"]) > 0.15: big.append("CA ratio")
    if both("FAc") and abs(nr["FAc"] - rr["FAc"]) > 0.10: big.append("FAc")
    if both("FAf") and abs(nr["FAf"] - rr["FAf"]) > 0.10: big.append("FAf")
    return {
        "terms": {k: xround(v, 2) for k, v in terms.items()},
        "dvma": xround(dvma, 2), "vma": xround(vma, 2),
        "pb": xround(pb_rec, 2), "va_at_pb": xround(va, 2), "va_at_ref_pb": xround(va_same_pb, 2),
        "vfa": xround(vfa, 1) if vfa else None, "pba": xround(pba_new, 2),
        "gmb": xround(gmb, 3) if gmb else None, "vca_mix": vca,
        "large_moves": big, "ref_trial": ref.get("_id"),
        "ref": {"vma": rv["vma"], "va": rv["va"], "pb": pb_ref, "pba": rv["pba"]}, "ac_factor": rot["AC"],
        "rot": rot,
    }


# ---------------------------------------------------------------- next-trial search
def _penalty_range(v, rng, scale):
    if v is None or not rng:
        return 0.0
    lo, hi = num(rng[0]), num(rng[1])
    d = 0.0
    if lo is not None and v < lo:
        d = lo - v
    if hi is not None and v > hi:
        d = v - hi
    return (d / scale) ** 2


def _shares(pct, group):
    tot = sum(pct.get(s, 0) for s in group)
    return {s: (100 * pct.get(s, 0) / tot if tot else 0) for s in group}


def objective(mix, ref, cand_pct, base_pct, weights, nmas, cache=None):
    key = tuple(round(cand_pct.get(s, 0), 4) for s in SLOTS)
    if cache is not None and key in cache:
        return cache[key]
    targets = mix.get("targets", {})
    new = analyze_blend(mix, cand_pct, nmas)
    p = predict(mix, ref, new, None, targets)
    J = 0.0
    vt = num(targets.get("vma"))
    if vt is not None:
        J += weights["vma"] * ((p["vma"] - vt) / 0.1) ** 2
    goals = bailey_goals(mix, nmas)
    for k, sc, tol in BAILEY_KEYS:
        g, v = goals[k], bailey_value(new, k)
        # an option only enforces hard goals on the principles it is allowed to move
        hard = (g["hard"] or weights.get("bailey_hard", False)) and k in weights.get("controls", ("ca_ruw", "CA", "FAc", "FAf"))
        if g["target"] is not None:
            band = [g["target"] - tol, g["target"] + tol] if hard else [g["target"], g["target"]]
        else:
            band = [g["lo"], g["hi"]]
        if hard:
            J += 2000 * _penalty_range(v, band, tol)
        else:
            J += (weights["skeleton"] if k == "ca_ruw" else weights["soft"]) * _penalty_range(v, band, sc)
    # Do not lean on the far side of an FA dip to buy VMA. The usual advice for
    # SMA is to move VMA with CA volume and to find an optimum filler content.
    rot = rot_for(mix, new["mix_type"])
    for k, d in (("FAc", rot["FAc_dip"]), ("FAf", rot["FAf_dip"])):
        if ref["ratios"].get(k) is None:
            continue
        lim = max(d, ref["ratios"][k])
        if new["ratios"][k] is not None and new["ratios"][k] > lim:
            J += weights["soft"] * ((new["ratios"][k] - lim) / 0.03) ** 2
    for s, lim in (mix.get("control_points") or {}).items():
        try:
            sv = float(s)
        except ValueError:
            continue
        if sv not in new["gradation"] or not lim:
            continue
        J += 400 * _penalty_range(new["gradation"][sv], [lim.get("min"), lim.get("max")], 0.2)
        J += weights["soft"] * _penalty_range(new["gradation"][sv], [lim.get("soft_min"), lim.get("soft_max")], 0.5)
    # practical limits: a stockpile is either off or at least the minimum
    pr = practical(mix)
    locked = weights.get("_locks") or {}
    mn = pr["min_pile_pct"]
    if mn > 0:
        for sl in SLOTS:
            if locked.get(sl) or (KIND[sl] == "F" and not pr["min_fillers"]):
                continue
            x = cand_pct.get(sl, 0)
            if 0.05 < x < mn - 1e-9:
                J += 300 * (min(x, mn - x) / 0.5) ** 2 + 50
    if pr["one_fine"]:
        used = sorted(cand_pct.get(sl, 0) for sl in ("FA1", "FA2", "FA3") if cand_pct.get(sl, 0) > 0.05)
        if len(used) > 1:
            J += 2.0 * (len(used) - 1) + 0.15 * sum(used[:-1])
    vcadrc = num(targets.get("vcadrc"))
    if vcadrc and p.get("vca_mix") is not None and p["vca_mix"] > vcadrc:
        J += 200 * ((p["vca_mix"] - vcadrc) / 0.2) ** 2
    pbmin = num(targets.get("pb_min"))
    if pbmin and p["pb"] < pbmin:
        J += 200 * ((pbmin - p["pb"]) / 0.1) ** 2
    vfa = targets.get("vfa") or [None, None]
    if p.get("vfa") is not None:
        J += 20 * _penalty_range(p["vfa"], vfa, 1.0)
    if new["nmas_detected"] != nmas:
        J += 500
    # change penalties
    ca = ["CA1", "CA2", "CA3"]
    fines = ["FA1", "FA2", "FA3", "F1", "F2"]
    dca_tot = sum(cand_pct.get(s, 0) for s in ca) - sum(base_pct.get(s, 0) for s in ca)
    sh_c, sh_b = _shares(cand_pct, ca), _shares(base_pct, ca)
    fh_c, fh_b = _shares(cand_pct, fines), _shares(base_pct, fines)
    J += weights["ca_total"] * dca_tot ** 2
    J += weights["ca_split"] * sum((sh_c[s] - sh_b[s]) ** 2 for s in ca)
    J += weights["fine_split"] * sum((fh_c[s] - fh_b[s]) ** 2 for s in fines)
    out = (J, p, new)
    if cache is not None:
        cache[key] = out
    return out


OPTIONS = {
    "balanced": {"mode": "all", "title": "Recommended", "about": "Moves every unlocked stockpile as needed, with the smallest total change.",
                 "w": {"vma": 4.0, "soft": 1.0, "skeleton": 3.0, "ca_total": 0.004, "ca_split": 0.0006, "fine_split": 0.0006}},
    "coarse": {"mode": "volume", "title": "Coarse volume first", "about": "Changes only the coarse aggregate volume (PCS). Keeps the coarse piles and the fine piles in their current proportions.",
               "w": {"vma": 4.0, "soft": 1.0, "skeleton": 3.0, "ca_total": 0.0005, "ca_split": 0.05, "fine_split": 0.05, "controls": ("ca_ruw",)}},
    "fines": {"mode": "fines", "title": "Fines and filler first", "about": "Keeps the coarse aggregate the same. Rebalances fine aggregates and fillers (FAc, FAf).",
              "w": {"vma": 4.0, "soft": 1.0, "skeleton": 3.0, "ca_total": 2.0, "ca_split": 0.05, "fine_split": 0.0004, "controls": ("FAc", "FAf")}},
    "bailey": {"mode": "all", "title": "Bailey targets first", "about": "Holds every Bailey range or target as a hard limit. Then gets as close to the VMA target as it can.",
               "w": {"vma": 4.0, "soft": 1.0, "skeleton": 3.0, "ca_total": 0.004, "ca_split": 0.0006, "fine_split": 0.0006, "bailey_hard": True}},
}


def _search_pairs(mix, ref, x, J, base, movable, w, nmas, cache):
    """Pattern search: move mass from one stockpile to another."""
    for step in (4.0, 2.0, 1.0, 0.5, 0.2, 0.1):
        for _ in range(200):
            best = (J, None)
            for a in movable:
                for b in movable:
                    if a == b or x[b] < step - 1e-9:
                        continue
                    y = dict(x)
                    y[a] += step
                    y[b] -= step
                    Jy = objective(mix, ref, y, base, w, nmas, cache)[0]
                    if Jy < best[0] - 1e-9:
                        best = (Jy, y)
            if best[1] is None:
                break
            J, x = best
        # switch a stockpile off (its mass goes to another one) or on at the minimum
        mn = max(practical(mix)["min_pile_pct"], step)
        improved = True
        while improved:
            improved, best = False, (J, None)
            for a in movable:
                for b in movable:
                    if a == b:
                        continue
                    if 0 < x[b] <= 15:
                        y = dict(x); y[a] += y[b]; y[b] = 0.0
                        Jy = objective(mix, ref, y, base, w, nmas, cache)[0]
                        if Jy < best[0] - 1e-9:
                            best = (Jy, y)
                    if x[b] == 0 and x[a] >= mn:
                        y = dict(x); y[a] -= mn; y[b] = mn
                        Jy = objective(mix, ref, y, base, w, nmas, cache)[0]
                        if Jy < best[0] - 1e-9:
                            best = (Jy, y)
            if best[1] is not None:
                J, x = best
                improved = True
    return x, J


def _volume_blend_at(base, free, t):
    """Blend with total coarse aggregate = t, every group keeping its proportions."""
    ca_free = [s for s in free if KIND[s] == "CA"]
    fi_free = [s for s in free if KIND[s] != "CA"]
    lock_ca = sum(base[s] for s in SLOTS if KIND[s] == "CA" and s not in free)
    lock_fi = sum(base[s] for s in SLOTS if KIND[s] != "CA" and s not in free)
    room_ca, room_fi = t - lock_ca, 100 - t - lock_fi
    bca, bfi = sum(base[s] for s in ca_free), sum(base[s] for s in fi_free)
    if room_ca < 0 or room_fi < 0 or bca <= 0 or bfi <= 0:
        return None
    y = dict(base)
    for s in ca_free:
        y[s] = room_ca * base[s] / bca
    for s in fi_free:
        y[s] = room_fi * base[s] / bfi
    return y


def _search_volume(mix, ref, base, free, w, nmas, cache):
    t0 = sum(base[s] for s in SLOTS if KIND[s] == "CA")
    best = (objective(mix, ref, base, base, w, nmas, cache)[0], dict(base))
    lo, hi, step = max(0.0, t0 - 30), min(100.0, t0 + 30), 1.0
    for _ in range(3):
        t = lo
        while t <= hi + 1e-9:
            y = _volume_blend_at(base, free, t)
            if y:
                Jy = objective(mix, ref, y, base, w, nmas, cache)[0]
                if Jy < best[0]:
                    best = (Jy, y)
            t += step
        tc = sum(best[1][s] for s in SLOTS if KIND[s] == "CA")
        lo, hi, step = tc - step, tc + step, step / 10
    return best[1], best[0]


def suggest(mix, ref_trial, base_pct, locks, nmas):
    """Return next-trial options. ref_trial: trial dict with results.
    base_pct: starting blend (usually the reference trial's blend)."""
    ref = trial_results(mix, ref_trial, nmas)
    if not ref["volumetrics"].get("complete"):
        raise ValueError("The reference trial needs Pb, Gmb and Gmm before the tool can predict.")
    ref["_id"] = ref_trial.get("id")
    materials = mix["materials"]
    avail = [s for s in SLOTS if material_ready(materials.get(s))]
    free = [s for s in avail if not locks.get(s)]
    base = {s: float(num(base_pct.get(s)) or 0) for s in SLOTS}
    results = []
    for key, opt in OPTIONS.items():
        cache = {}
        x = dict(base)
        opt = {**opt, "w": {**opt["w"], "_locks": locks}}
        J, p, new = objective(mix, ref, x, base, opt["w"], nmas, cache)
        if opt["mode"] == "volume":
            x, J = _search_volume(mix, ref, base, free, opt["w"], nmas, cache)
        else:
            movable = [s for s in free if not (opt["mode"] == "fines" and KIND[s] == "CA")]
            x, J = _search_pairs(mix, ref, x, J, base, movable, opt["w"], nmas, cache)
        x = {s: xround(v, 1) for s, v in x.items()}
        if free:
            r = 100 - sum(x.values())
            big = max(free, key=lambda k: x[k])
            x[big] = xround(x[big] + r, 1)
        J, p, new = objective(mix, ref, x, base, opt["w"], nmas)
        status = range_status(mix, new, nmas)
        pr = practical(mix)
        status["small_piles"] = [sl for sl in SLOTS if 0 < x.get(sl, 0) < pr["min_pile_pct"] - 1e-9
                                 and not locks.get(sl) and (KIND[sl] != "F" or pr["min_fillers"])]
        results.append({"key": key, "title": opt["title"], "about": opt["about"], "pct": x,
                        "prediction": p, "analysis": new, "score": xround(J, 3), "status": status,
                        "changes": {s: xround(x[s] - base[s], 1) for s in SLOTS if abs(x[s] - base[s]) >= 0.05}})
    # drop exact duplicates, keep order
    seen, uniq = set(), []
    for r in results:
        k = tuple(r["pct"].get(s, 0) for s in SLOTS)
        if k in seen:
            r["duplicate_of"] = next(u["title"] for u in uniq if tuple(u["pct"].get(s, 0) for s in SLOTS) == k)
        seen.add(k)
        uniq.append(r)
    return {"reference": ref, "options": uniq}


def range_status(mix, an, nmas):
    def st(v, r):
        if v is None or not r or (num(r[0]) is None and num(r[1]) is None):
            return "none"
        lo, hi = num(r[0]), num(r[1])
        if lo is not None and v < lo: return "low"
        if hi is not None and v > hi: return "high"
        return "ok"
    goals = bailey_goals(mix, nmas)
    out = {}
    for k, _, tol in BAILEY_KEYS:
        g = goals[k]
        band = [g["target"] - tol, g["target"] + tol] if g["target"] is not None else [g["lo"], g["hi"]]
        out[k] = st(bailey_value(an, k), band)
    out["goals"] = goals
    cp, soft = [], []
    for s, lim in (mix.get("control_points") or {}).items():
        try:
            sv = float(s)
        except ValueError:
            continue
        if sv in an["gradation"] and lim:
            v = st(an["gradation"][sv], [lim.get("min"), lim.get("max")])
            if v in ("low", "high"):
                cp.append({"sieve": sv, "value": an["gradation"][sv], "side": v})
            v2 = st(an["gradation"][sv], [lim.get("soft_min"), lim.get("soft_max")])
            if v2 in ("low", "high"):
                soft.append({"sieve": sv, "value": an["gradation"][sv], "side": v2,
                             "lo": num(lim.get("soft_min")), "hi": num(lim.get("soft_max"))})
    out["control_points"] = cp
    out["soft_points"] = soft
    return out


# ---------------------------------------------------------------- whole mix
def design_nmas(mix):
    o = num(mix.get("settings", {}).get("nmas_override"))
    if o in CONTROL:
        return o
    trials = mix.get("trials") or []
    for t in trials:
        pct = t.get("pct") or {}
        if sum((num(v) or 0) for v in pct.values()) > 99:
            try:
                return bailey_nmas(blend_gradation(mix["materials"], pct))
            except Exception:
                pass
    return None


def analyze_mix(mix):
    nmas = design_nmas(mix)
    mt = mix_type(mix, nmas)
    out = {"nmas": nmas, "mix_type": mt, "type_info": TYPE_INFO[mt], "rot": rot_for(mix, mt),
           "conv": detect_conv(mix.get("materials", {}), mix.get("settings", {}).get("units", "auto")),
           "default_ranges": default_ranges(nmas, mt), "trials": [], "materials": {}}
    for s in SLOTS:
        m = mix.get("materials", {}).get(s) or {}
        info = {"ready": material_ready(m)}
        conv = out["conv"]
        gsb = num(m.get("gsb"))
        for k in ("luw", "ruw"):
            uw = num(m.get(k))
            if uw and gsb:
                info[k + "_voids"] = xround(100 * (1 - uw / (gsb * conv)), 1)
        out["materials"][s] = info
    if nmas:
        out["control"] = control_points(nmas, mt)
        out["band"] = {"name": TYPE_INFO[mt]["band"],
                       "limits": {str(k): list(v) for k, v in SPEC_BANDS["sma" if mt == "sma" else "dense"].get(nmas, {}).items()}}
        for t in mix.get("trials") or []:
            pct = t.get("pct") or {}
            if sum((num(v) or 0) for v in pct.values()) < 99:
                out["trials"].append({"id": t.get("id"), "incomplete": True})
                continue
            try:
                a = trial_results(mix, t, nmas)
                a["id"] = t.get("id")
                a["status"] = range_status(mix, a, nmas)
                out["trials"].append(a)
            except Exception as e:
                out["trials"].append({"id": t.get("id"), "error": str(e)})
    return out


# ---------------------------------------------------------------- prediction accuracy and fitted factors
def tested_trials(mix, nmas):
    out = []
    for t in mix.get("trials") or []:
        pct = t.get("pct") or {}
        if sum((num(v) or 0) for v in pct.values()) < 99:
            continue
        try:
            r = trial_results(mix, t, nmas)
        except Exception:
            continue
        if r["volumetrics"].get("complete"):
            r["_id"] = t.get("id")
            r["_label"] = t.get("label") or t.get("id")
            out.append(r)
    return out


def _pair_error(mix, ref, new, rot):
    p = predict(mix, ref, new, rot, mix.get("targets"))
    v, rv = new["volumetrics"], ref["volumetrics"]
    pba_new = p["pba"]
    va_pred = rv["va"] + p["dvma"] + ((rv["pb"] - rv["pba"]) - (v["pb"] - pba_new)) * p["ac_factor"]
    return {"ref": ref["_id"], "ref_label": ref["_label"], "id": new["_id"], "label": new["_label"],
            "vma_pred": xround(p["vma"], 2), "vma": v["vma"], "vma_err": xround(p["vma"] - v["vma"], 2),
            "va_pred": xround(va_pred, 2), "va": v["va"], "va_err": xround(va_pred - v["va"], 2)}


def accuracy(mix, mode="previous", rot=None):
    """Predict each tested trial from the one before it ('previous') or from the first ('first')."""
    nmas = design_nmas(mix)
    T = tested_trials(mix, nmas) if nmas else []
    rows = []
    for i in range(1, len(T)):
        ref = T[i - 1] if mode == "previous" else T[0]
        rows.append(_pair_error(mix, ref, T[i], rot))
    within = sum(1 for r in rows if abs(r["vma_err"]) <= 0.5)
    return {"mode": mode, "rows": rows, "n": len(rows), "within_05": within, "tested": len(T)}


def fit_rot(mix):
    """Fit the rules of thumb to the user's tested trials. Every tested trial is predicted
    from every earlier one; factors stay inside the typical range for the mix type."""
    nmas = design_nmas(mix)
    T = tested_trials(mix, nmas) if nmas else []
    mt = mix_type(mix, nmas)
    if len(T) < 3:
        return {"ok": False, "tested": len(T), "message": "Needs at least 3 tested trials."}
    pairs = [(T[i], T[j]) for i in range(len(T)) for j in range(i + 1, len(T))]
    rng = TYPE_INFO[mt]["rot_range"]
    cur = rot_for(mix, mt)

    def cost(r, key="vma_err"):
        e = [_pair_error(mix, a, b, r)[key] for a, b in pairs]
        return sum(x * x for x in e) / len(e)

    start = dict(cur)
    best = dict(cur)
    bc = cost(best)
    steps = {"PCS": 0.05, "CA": 0.005, "FAc": 0.0025, "FAf": 0.0025, "FAc_dip": 0.005, "FAf_dip": 0.005}
    for _ in range(40):
        improved = False
        for k in ("FAc_dip", "FAf_dip", "PCS", "CA", "FAc", "FAf"):
            for d in (+1, -1):
                for mult in (8, 4, 2, 1):
                    trial = dict(best)
                    trial[k] = min(rng[k][1], max(rng[k][0], best[k] + d * mult * steps[k]))
                    if abs(trial[k] - best[k]) < 1e-12:
                        continue
                    c = cost(trial)
                    if c < bc - 1e-6:
                        best, bc, improved = trial, c, True
                        break
        if not improved:
            break
    # binder factor from the air-void errors
    vc = cost(best, "va_err")
    for _ in range(60):
        moved = False
        for d in (0.05, -0.05):
            trial = dict(best)
            trial["AC"] = min(rng["AC"][1], max(rng["AC"][0], best["AC"] + d))
            c = cost(trial, "va_err")
            if c < vc - 1e-6:
                best, vc, moved = trial, c, True
                break
        if not moved:
            break
    rms = lambda r, k="vma_err": math.sqrt(cost(r, k))
    return {"ok": True, "tested": len(T), "comparisons": len(pairs), "mix_type": mt,
            "rot": {k: xround(v, 4) for k, v in best.items()},
            "vma_rms_before": xround(rms(start), 2), "vma_rms_after": xround(rms(best), 2),
            "va_rms_before": xround(rms(start, "va_err"), 2), "va_rms_after": xround(rms(best, "va_err"), 2)}
