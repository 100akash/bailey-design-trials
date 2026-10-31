"""Engine checks. Run: python tests/test_engine.py"""
import os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "engine"))
import bailey as B  # noqa: E402


def mats_sample():
    S = [s for s in B.SIEVES if s <= 25.0]
    def g(vals): return {str(s): v for s, v in zip(S, vals)}
    return {
        "CA1": dict(name="12.5 mm chip", grad=g([100, 100, 92, 55, 8, 3, 2.5, 2.2, 2, 1.8, 1.4]), gsb=2.705, abs=1.1, luw=1430, ruw=1580),
        "CA2": dict(name="9.5 mm chip", grad=g([100, 100, 100, 96, 22, 5, 3, 2.5, 2.2, 2, 1.7]), gsb=2.690, abs=1.3, luw=1410, ruw=1560),
        "CA3": {},
        "FA1": dict(name="Manufactured sand", grad=g([100, 100, 100, 100, 98, 78, 50, 32, 20, 13, 8.5]), gsb=2.650, abs=1.6, luw=1600, ruw=1750),
        "FA2": {}, "FA3": {},
        "F1": dict(name="Limestone MF", grad=g([100, 100, 100, 100, 100, 100, 100, 100, 99, 95, 80]), gsb=2.720, abs=0),
        "F2": dict(name="Hydrated lime", grad=g([100] * 10 + [95]), gsb=2.300, abs=0),
    }


def test_forward_totals_100():
    fw = B.forward_blend(mats_sample(), 118, {"CA1": 60, "CA2": 40}, {"FA1": 100}, 10.0, f2_pct=1.0, conv=1000, pcs=2.36)
    assert abs(sum(fw["pct"].values()) - 100) < 1e-9 and fw["pct"]["F2"] == 1.0
    print("forward blend:", fw["pct"])


def test_backcalc_roundtrip():
    m = mats_sample()
    rnd = random.Random(3)
    for _ in range(25):
        cuw = rnd.uniform(108, 127); a = rnd.uniform(20, 80)
        fw = B.forward_blend(m, cuw, {"CA1": a, "CA2": 100 - a}, {"FA1": 100}, rnd.uniform(8, 11), f2_pct=1.0, rounded=False, pcs=2.36)
        bc = B.back_calc(m, fw["pct"], 12.5, 1000.0)
        assert abs(bc["cuw_pct"] - cuw) < 1e-6, (bc["cuw_pct"], cuw)
        assert abs(bc["ca_vol"]["CA1"] - a) < 1e-6
        assert abs(bc["vol_fa"] - fw["vol_fa"]) < 1e-6
    print("back-calculation round trip ok")


def test_prediction_direction():
    ref = {"volumetrics": {"vma": 16.0, "va": 3.0, "pb": 6.0, "pba": 0.4}, "ratios": {"pct_pcs": 24.0, "CA": 0.40, "FAc": 0.70, "FAf": 0.75}, "abs": 1.0}
    new = {"ratios": {"pct_pcs": 22.0, "CA": 0.40, "FAc": 0.70, "FAf": 0.75}, "abs": 1.0, "gsb": 2.7, "gca": 2.7}
    p = B.predict({}, ref, new, None, {"va": 3.5})
    assert abs(p["dvma"] - 1.0) < 1e-6, p["dvma"]          # 2% less passing PCS opens 1% VMA
    print("prediction ok: dVMA", p["dvma"], "Pb", round(p["pb"], 2))


def test_suggest_runs_and_respects_limits():
    m = mats_sample()
    mix = {"materials": m, "settings": {"gb": 1.03}, "targets": {"vma": 17.0, "va": 3.5},
           "trials": [{"id": "T1", "pct": {"CA1": 45, "CA2": 25, "FA1": 18, "F1": 11, "F2": 1},
                       "results": {"pb": 6.2, "gmb": [2.390, 2.396], "gmm": [2.470, 2.474]}}]}
    an = B.analyze_mix(mix)
    s = B.suggest(mix, mix["trials"][0], mix["trials"][0]["pct"], {"F2": True}, an["nmas"])
    for o in s["options"]:
        assert abs(sum(o["pct"].values()) - 100) < 1e-6 and o["pct"]["F2"] == 1
        small = [k for k, v in o["pct"].items() if B.KIND[k] != "F" and 0.05 < v < 5 - 1e-9]
        print(o["title"], o["pct"], "VMA", o["prediction"]["vma"], "Pb", o["prediction"]["pb"], "small piles", small)


if __name__ == "__main__":
    test_forward_totals_100(); test_backcalc_roundtrip(); test_prediction_direction(); test_suggest_runs_and_respects_limits()
    print("all checks passed")
