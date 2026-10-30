# Bailey Design Trials

A tool for designing Stone Matrix Asphalt (SMA) aggregate blends with the Bailey Method.
Enter your stockpiles and log each lab trial.
The tool proposes the next blend to try and the binder content for your air-void target.

**Use it online:** https://akashto.com/bailey-design-trials/

It runs entirely in your browser. Your mixes are stored in that browser only and are never uploaded.
Use **Download mix file** to keep a copy or share a mix, and **Open a mix file** to load one.

## How it works

1. **Mix setup.** Name the mix and enter your targets: VMA and air voids, plus optional VFA, minimum binder and VCA dry-rodded.
   Add gradation control points (hard limits) and soft targets on any sieve (for example 22 to 24% passing #8).
   Set the practical limits: the smallest % a stockpile can be fed at (default 5%, fillers exempt) and whether to prefer one fine aggregate.
   Typical SMA Bailey ranges are pre-filled. Edit or clear them for your mix.
2. **Materials.** Up to 3 coarse aggregates, 3 fine aggregates and 2 fillers.
   Enter washed gradations (% passing), Gsb, absorption, and loose and rodded unit weights (LUW and RUW).
   Units are detected from the unit weights. You can paste gradations straight from Excel.
3. **Trials.** Each column is one trial. Enter the blend (% by mass of aggregate) and the lab results: Pb, two Gmb and two Gmm.
   The tool computes VMA, Va, VFA, Pba, Pbe and VCAmix.
   It also works backwards from the blend to its Bailey values: % CA RUW, CA volume, % passing PCS, and the CA, FAc and FAf ratios.
4. **Next trial.** Pick a tested trial to start from and fix any stockpile you want held constant. The tool returns four options:
   - **Recommended:** the smallest change to the unlocked stockpiles that reaches your VMA target.
   - **Coarse volume first:** only the coarse aggregate volume changes.
   - **Fines and filler first:** the coarse aggregate stays the same.
   - **Bailey targets first:** every Bailey range or target is a hard limit, then VMA gets as close as it can.

   Each option shows predicted VMA, the recommended Pb for your air-void target, and how each Bailey value moves.
   Edit any % and the prediction updates. Save a blend as the next trial and compare predicted with measured results later.

The gradation chart is always on screen. It shows the maximum density line, the Bailey control sieves, your control points and soft targets, and every trial.
A table under the chart lists the values in the same colours.

## The method in brief

- NMAS is one sieve larger than the first sieve with more than 15% cumulative retained.
- Control sieves: Half = 0.5 × NMAS, PCS = 0.22 × NMAS, SCS = 0.22 × PCS, TCS = 0.22 × SCS.
- For SMA the coarse aggregate chosen unit weight is a % of its rodded unit weight. The fine aggregate fills the coarse voids at its loose unit weight.
- Predicted VMA = VMA of the start trial plus terms for the change in % passing PCS and in the CA, FAc and FAf ratios.
  The default factors are 2% passing PCS, 0.20 CA ratio, and 0.10 FAc or FAf per 1% VMA.
  FAc and FAf act around a minimum ("dip") near 0.65 and 0.70. All factors can be edited per mix.
- Change in air voids = change in VMA + change in effective binder × 2.25.

The search treats control points, minimum Pb and VCA dry-rodded as hard limits.
Bailey ranges and sieve soft targets are soft goals.

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

## Credits

Developed by Akash Bajaj, Illinois Center for Transportation, University of Illinois Urbana-Champaign.

Method reference: Vavrik, W. R., Huber, G., Pine, W. J., Carpenter, S. H., and Bailey, R. (2002).
*Bailey Method for Gradation Selection in HMA Mixture Design.* Transportation Research Circular E-C044, Transportation Research Board.
https://onlinepubs.trb.org/onlinepubs/circulars/ec044.pdf

This tool is not endorsed by the FAA or by any Bailey Method course.

Fonts: Barlow and Barlow Condensed, SIL Open Font License (`web/fonts/OFL-Barlow.txt`).

## License

MIT. See [LICENSE](LICENSE).
