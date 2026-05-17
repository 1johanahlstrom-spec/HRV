# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A vanilla JS single-page web app (no build system, no dependencies) that measures Heart Rate Variability (HRV) using a smartphone's rear camera and flashlight via PPG (photoplethysmography). The UI is in Swedish; code is in English.

## Running the app

No build step. Open `index.html` directly in a browser, or serve with any static file server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Camera access (`getUserMedia`) requires HTTPS or localhost. The torch (flashlight) API only works on mobile browsers.

## Architecture

Four pages are toggled via CSS `.hide` class on divs `#P0`–`#P3`:
- **P0** — idle/home (instructions, duration picker, history)
- **P1** — measuring (live PPG waveform, progress, real-time metrics)
- **P2** — results (rendered dynamically via `res()` in `app.js`)
- **P3** — standalone breathing guide with live coherence feedback

### Module responsibilities

| File | Role |
|------|------|
| `index.html` | All CSS (inline), HTML structure for all four pages |
| `js/app.js` | Main controller: camera lifecycle, `tick()` loop, state, `res()` results builder |
| `js/dsp.js` | DSP engine exported as `D`: filter design, peak detection, SQI, HRV stats, FFT/PSD |
| `js/draw.js` | Canvas renderers: PPG waveform, R-R bars, PSD, Poincaré plot, trend chart |
| `js/breathing.js` | Standalone breathing guide: camera loop, coherence scoring, pattern animation |
| `js/db.js` | localStorage history (key: `hrv_history`, max 100 entries), CSV export |

### Signal processing pipeline (`dsp.js`)

Camera frame → average R+G channels (40%R + 60%G) → `D.detrend()` (2s moving-average baseline removal) → `D.ff()` (zero-phase Butterworth 4th-order bandpass 0.5–4 Hz) → `D.fp()` (adaptive peak detection) → `D.sq()` (SQI with per-peak quality flags) → `D.extractRRI()` (SQI-gated + motion-gated R-R intervals) → `D.hrv()` (time-domain: RMSSD, SDNN, pNN50) + `D.freqHRV()` (Welch PSD → LF/HF/ratio + respiratory rate) + `D.poincare()` (SD1/SD2).

Blue channel is used exclusively for motion artifact detection (`D.detectMotion()`).

R-R intervals are valid in the range 333–1500 ms (40–180 BPM). `D.cleanRR()` additionally filters outliers beyond ±20% of the median and ±25% step-changes.

### Key constraints

- **No framework, no npm, no transpilation** — plain ES modules loaded directly by the browser.
- **All CSS lives in `index.html`** — compact/minified style; class names are short abbreviations (`.bp` = big primary button, `.ch` = chart container, `.rc` = result cell, etc.).
- `window.go`, `window.stop`, etc. are explicitly assigned in `app.js` to expose module functions to inline `onclick` handlers in the HTML.
- History is persisted to `localStorage` only; nothing is sent to a server.
- The Poincaré plot uses a fixed axis of 450–1050 ms (covers 57–133 BPM) — do not make this auto-scaling without understanding the visual stability requirement.
