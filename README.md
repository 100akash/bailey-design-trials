# Bailey Design Trials

A tool for designing asphalt mix trials with the Bailey Method: SMA and dense-graded mixes.
Enter your stockpiles and log each lab trial.
The tool proposes the next blend to try and the binder content for your air-void target.

**Use it online:** https://akashto.com/bailey-design-trials/

It runs entirely in your browser. Your mixes are stored in that browser only and are never uploaded.
Use **Download mix file** to keep a copy or share a mix, and **Open a mix file** to load one.

## How it works

The tool has four steps, in tabs across the top.

1. **Stockpiles.** Up to 3 coarse, 3 fine and 2 filler stockpiles. Enter washed gradations (% passing, 50 mm down to 0.075 mm), Gsb, absorption, and loose and rodded unit weights (both are needed for every coarse and fine stockpile). Paste straight from Excel.
2. **Criteria.** Pick the mix type (SMA, dense coarse-graded or dense fine-graded) and the NMAS (4.75 to 37.5 mm). The typical Bailey values for that type load automatically: control sieves, unit weight ranges, Bailey ratio ranges, FA dips and the VMA rules of thumb. Then set the VMA and air-void targets, gradation control points and soft targets (or load the AASHTO M 325 or ASTM D3515 band), and practical limits such as a 5% minimum stockpile.
3. **Trials.** The design loop. Each trial has three parts:
   - **Blend and binder.** Generate Trial 1 from Bailey inputs (coarse unit weight, volume splits, #200 target), or enter a blend. For later trials the tool suggests blends from a tested trial: Recommended, Coarse volume first, Fines and filler first, Bailey targets first, or Binder only. Change any stockpile or the binder and the predicted VMA, air voids, Bailey values and gradation update live. A balance pile keeps the total at 100.
   - **Lab results.** Binder content, Gmb, height and mass for each specimen, Gmm, gyrations, compaction temperature and VCA dry-rodded.
   - **Results.** VMA, air voids, VFA and VCAmix against your targets, how the prediction did, Bailey values against your ranges, and the next step.
4. **Compare.** All trials side by side, VMA and air voids across trials, and prediction accuracy. After 3 tested trials the tool can fit the rules of thumb to your own mix, inside the typical range for the mix type.

A **Bailey reference** page lists the typical values for every mix type.

- Agency requirements (optional, in Criteria): FAA AC 150/5370-10H items P-401, P-403 and P-404, or UFGS 32 12 15.13 (airfield asphalt), 32 12 15.16 (SMA) and 32 12 17.19 (fuel resistant). The gradation band, minimum VMA, design air voids and other limits load for the gradation that matches your blend, and Results checks each trial against them.

## The method in brief

- NMAS is one sieve larger than the first sieve with more than 15% cumulative retained.
- Control sieves: Half = 0.5 × NMAS, PCS = 0.22 × NMAS, SCS = 0.22 × PCS, TCS = 0.22 × SCS. Fine-graded mixes also use the new control sieves on the fine fraction.
- The coarse chosen unit weight is a % of RUW for SMA and of LUW for dense mixes. The fine aggregate fills the coarse voids at LUW (SMA) or RUW (dense).
- Predicted VMA = VMA of a tested trial plus terms for the change in % passing PCS and in the CA, FAc and FAf ratios, with the factors for the mix type.
- Change in air voids = change in VMA + change in effective binder × 2.25.

Typical values come from W.J. Pine, *The Bailey Method: Achieving Volumetrics and HMA Compactability*, which takes priority over E-C044 where they differ.

**Predictions use rules of thumb and are estimates only. Confirm every trial in the lab.**

## Run it on your own computer

You can also run it locally. Your mixes are then saved as JSON files in the `mixes` folder.

- **Windows:** double-click `start.bat`. The tool opens in your browser at http://localhost:8765. Keep the black window open while you work.
- **Any system:** run `python server.py` in this folder.

It needs Python 3.8 or newer and nothing else.

## Files

| Path | What it is |
|---|---|
| `index.html` | Browser version (GitHub Pages) |
| `web/` | Interface. `webapi.js` and `worker.js` run the engine in the browser with [Pyodide](https://pyodide.org). |
| `engine/bailey.py` | All calculations, standard library only |
| `engine/routes.py` | Calculation routes shared by both versions |
| `server.py`, `start.bat` | Local version |
| `mixes/` | A synthetic example mix |
| `tests/test_engine.py` | Engine checks: `python tests/test_engine.py` |

## Cite

Bajaj, A. (2026). *Bailey Design Trials* (Version 0.1). https://akashto.com/bailey-design-trials/

## Credits

Developed by Akash Bajaj, University of Illinois Urbana-Champaign.

References:

- Pine, W.J. *The Bailey Method: Achieving Volumetrics and HMA Compactability.*
- Vavrik, W.R., Huber, G., Pine, W.J., Carpenter, S.H., and Bailey, R. (2002). *Bailey Method for Gradation Selection in HMA Mixture Design.* Transportation Research Circular E-C044, Transportation Research Board. https://onlinepubs.trb.org/onlinepubs/circulars/ec044.pdf

This is an independent tool. It is not endorsed by any agency or by any Bailey Method course.

Fonts: IBM Plex Sans and Overpass from Google Fonts.

## Versions

The current version is v0.1. See [CHANGELOG.md](CHANGELOG.md). Major updates get a new version.

## License

MIT. See [LICENSE](LICENSE).
