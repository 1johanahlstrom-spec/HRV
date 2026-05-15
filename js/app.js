// ═══════════════════════════════════════════════════════════════
// HRV MONITOR v5.4 — Main Application
// ═══════════════════════════════════════════════════════════════

import { D } from './dsp.js';
import { drawWaveform, drawRR, drawPSD, drawPoincare } from './draw.js';
import { saveMeasurement, renderHistory, dbClear, exportCSV } from './db.js';
import { BREATH_PATTERNS, animateBreathCircle, setBreathPattern, startBreathing, stopBreathing } from './breathing.js';

// ── State ────────────────────────────────────────────────────
let stm = null, raf = null, t0 = 0, fps = 30, co = null;
let raw = [], rawG = [], rawB = [], ts = [];
let flt = [], pks = [], rri = [];
let hrv = null, freqResult = null, sqi = 0, sqiHist = [];
let motionClean = null, sqiResult = null;
let measureBreathOn = false, measureBreathIdx = 0;
const DUR = 60, SETTLE = 3;

// ── Expose to HTML onclick handlers ──────────────────────────
window.go = go;
window.stop = stop;
window.rst = rst;
window.runTest = runTest;
window.runDetTest = runDetTest;
window.dbClear = dbClear;
window.exportCSV = exportCSV;
window.setBreathPattern = setBreathPattern;
window.toggleMeasureBreath = toggleMeasureBreath;
window.setMeasureBreathPattern = setMeasureBreathPattern;
window.startBreathing = () => startBreathing(handleBreathResult);
window.stopBreathing = () => stopBreathing(handleBreathResult);

function handleBreathResult(breathRRI, breathFlt, breathPks, breathSqi, breathStart) {
  rri = breathRRI; flt = breathFlt; pks = breathPks; sqi = breathSqi; sqiHist = [breathSqi];
  hrv = D.hrv(breathRRI); freqResult = D.freqHRV(breathRRI);
  t0 = breathStart;
  res();
}

// ── Inline breathing guide ───────────────────────────────────
function toggleMeasureBreath() {
  measureBreathOn = !measureBreathOn;
  document.getElementById('MBREATH').classList.toggle('hide', !measureBreathOn);
  document.getElementById('MBTN').textContent = measureBreathOn ? '🫁 Dölj andningsguide' : '🫁 Visa andningsguide';
}
function setMeasureBreathPattern(idx) {
  measureBreathIdx = idx;
  ['mo1', 'mo2', 'mo3'].forEach((id, i) => document.getElementById(id).classList.toggle('active', i === idx));
}

// ── Camera ───────────────────────────────────────────────────
async function go() {
  const b = document.getElementById('SB'), er = document.getElementById('ER');
  b.disabled = true; b.textContent = '⏳ Startar kameran...'; er.classList.add('hide');
  raw = []; rawG = []; rawB = []; ts = []; flt = []; pks = []; rri = [];
  hrv = null; freqResult = null; sqi = 0; sqiHist = []; motionClean = null; sqiResult = null;

  if (!navigator.mediaDevices?.getUserMedia) { er.innerHTML = '<b>⚠️</b> Kameran stöds inte.'; er.classList.remove('hide'); b.disabled = false; b.textContent = 'Starta mätning'; return; }
  const cfgs = [{ facingMode: 'environment', width: { ideal: 160 }, height: { ideal: 120 }, frameRate: { ideal: 60, min: 30 } }, { facingMode: 'environment' }, { facingMode: { ideal: 'environment' } }, true];
  for (let i = 0; i < cfgs.length; i++) {
    try { stm = await navigator.mediaDevices.getUserMedia({ video: cfgs[i] }); break; }
    catch (e) {
      if (e.name === 'NotAllowedError') { er.innerHTML = '<b>⚠️ Kameratillstånd nekades</b><br><br>Tryck låsikonen → Kamera → Tillåt. Ladda om.'; er.classList.remove('hide'); b.disabled = false; b.textContent = 'Starta mätning'; return; }
      if (i === cfgs.length - 1) { er.innerHTML = '<b>⚠️</b> ' + e.message; er.classList.remove('hide'); b.disabled = false; b.textContent = 'Starta mätning'; return; }
    }
  }
  const tk = stm.getVideoTracks()[0], se = tk.getSettings();
  fps = se.frameRate || 30; co = D.bp4(fps, .5, 4);
  try { const cp = tk.getCapabilities?.(); const ad = []; if (cp?.exposureMode) ad.push({ exposureMode: 'manual' }); if (cp?.whiteBalanceMode) ad.push({ whiteBalanceMode: 'manual' }); if (ad.length) try { await tk.applyConstraints({ advanced: ad }); } catch (e) {} } catch (e) {}
  const v = document.getElementById('V'); v.srcObject = stm; await v.play();

  let torchOk = false;
  for (let attempt = 0; attempt < 3 && !torchOk; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500));
    try { const cp = tk.getCapabilities?.(); if (cp?.torch) { await tk.applyConstraints({ advanced: [{ torch: true }] }); torchOk = true; } } catch (e) {}
  }

  t0 = performance.now();
  document.getElementById('P0').classList.add('hide'); document.getElementById('P1').classList.remove('hide'); document.getElementById('P2').classList.add('hide');
  document.getElementById('BM').textContent = '—'; document.getElementById('RS').classList.add('hide'); document.getElementById('MM').classList.add('hide');
  document.getElementById('SETTLE').classList.remove('hide');
  document.getElementById('TORCH').textContent = torchOk ? 'Lampa: Auto ✓' : 'Lampa: Manuell';
  document.getElementById('TORCH').style.color = torchOk ? '#00f082' : '#ffd60a';
  raf = requestAnimationFrame(tick);
}

function stop() {
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  if (stm) { stm.getTracks().forEach(t => t.stop()); stm = null; }
  document.getElementById('P1').classList.add('hide');
  if (rri.length >= 10) freqResult = D.freqHRV(rri);
  if (hrv && rri.length >= 10) {
    const durSec = Math.floor(Math.min((performance.now() - t0) / 1e3, DUR));
    const sqiF = sqiHist.length ? Math.round(sqiHist.reduce((a, b) => a + b, 0) / sqiHist.length) : sqi;
    saveMeasurement(hrv, freqResult, sqiF, durSec);
  }
  res();
}

// ── Main loop ────────────────────────────────────────────────
function tick() {
  const v = document.getElementById('V'), cv = document.getElementById('C');
  if (!v || !cv || !stm) return;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cv.width = 32; cv.height = 24; cx.drawImage(v, 0, 0, 32, 24);
  const px = cx.getImageData(4, 4, 24, 16).data;
  let rS = 0, gS = 0, bS = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) { rS += px[i]; gS += px[i + 1]; bS += px[i + 2]; n++; }
  const rA = rS / n, gA = gS / n, bA = bS / n, ok = rA > 100 && rA > bA * 1.3 && rA > gA * 1.05;

  const fc = document.getElementById('fc'), fd = document.getElementById('fd'), ft = document.getElementById('ft');
  if (ok) { fc.style.cssText = 'display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;font-size:10px;font-weight:600;background:#00f0820d;color:#00f082;border:1px solid #00f0821f'; fd.style.background = '#00f082'; fd.style.boxShadow = '0 0 5px #00f08280'; ft.textContent = 'Finger OK'; }
  else { fc.style.cssText = 'display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;font-size:10px;font-weight:600;background:#ff2d550d;color:#ff2d55;border:1px solid #ff2d551f'; fd.style.background = '#ff2d55'; fd.style.boxShadow = '0 0 5px #ff2d5580'; ft.textContent = 'Placera finger'; }

  const elapsed = (performance.now() - t0) / 1e3;
  const settling = elapsed < SETTLE;
  if (settling && ok) document.getElementById('SETTLE').classList.remove('hide');
  else document.getElementById('SETTLE').classList.add('hide');

  if (ok && !settling) {
    raw.push(rA); rawG.push(gA); rawB.push(bA); ts.push(performance.now());
    if (raw.length > 5e3) { raw = raw.slice(-3600); rawG = rawG.slice(-3600); rawB = rawB.slice(-3600); ts = ts.slice(-3600); }
    if (ts.length > 60) { const l = ts.slice(-60); fps = 1e3 / ((l[l.length - 1] - l[0]) / (l.length - 1)); co = D.bp4(fps, .5, 4); }
    if (raw.length > fps * 2) {
      // Combine channels
      const combined = new Float64Array(raw.length);
      for (let i = 0; i < raw.length; i++) combined[i] = raw[i] * .4 + rawG[i] * .6;
      // Detrend (remove slow drift with 2s window)
      const detrended = D.detrend(combined, 2, fps);
      // Bandpass filter
      flt = Array.from(D.ff(detrended, co));
      // Motion detection via blue channel
      motionClean = D.detectMotion(rawB, fps, 0.5);
      // Adaptive peak detection
      pks = D.fp(flt, Math.round(fps * .45));
      // SQI with per-peak quality
      sqiResult = D.sq(flt, pks, fps);
      sqi = sqiResult.score;
      sqiHist.push(sqi); if (sqiHist.length > 5) sqiHist.shift();
      const sqiS = Math.round(sqiHist.reduce((a, b) => a + b, 0) / sqiHist.length);
      const sl = sqiS > 60 ? 'Utmärkt' : sqiS > 35 ? 'Bra' : sqiS > 15 ? 'OK' : 'Svag';
      const sc2 = sqiS > 60 ? '#00f082' : sqiS > 35 ? '#ffd60a' : sqiS > 15 ? '#ff6b35' : '#ff2d55';
      document.getElementById('sc').style.cssText = `display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;font-size:10px;font-weight:600;background:${sc2}0d;color:${sc2};border:1px solid ${sc2}1f`;
      document.getElementById('st2').textContent = sl + ' ' + sqiS;
      drawWaveform('W', flt, pks);
      if (pks.length >= 3) {
        // SQI-gated R-R extraction (skips bad peaks + motion segments)
        rri = D.extractRRI(flt, pks, ts, sqiResult, motionClean);
        if (rri.length >= 2) { const rc = rri.slice(-12); const srt = [...rc].sort((a,b) => a - b); const med = srt[0 | srt.length / 2]; document.getElementById('BM').textContent = Math.round(6e4 / med); }
        if (rri.length > 3) { document.getElementById('RS').classList.remove('hide'); document.getElementById('RC').textContent = rri.length + ' st'; drawRR('RRC', rri); }
        hrv = D.hrv(rri);
        if (hrv) { document.getElementById('MM').classList.remove('hide'); document.getElementById('xR').textContent = hrv.rmssd; document.getElementById('xS').textContent = hrv.sdnn; document.getElementById('xP').textContent = hrv.pnn50 + '%'; }
      }
    }
  }
  const el = Math.min(elapsed, DUR);
  document.getElementById('PG').style.width = (el / DUR * 100) + '%';
  document.getElementById('EL').textContent = Math.floor(el) + 's';
  if (measureBreathOn) animateBreathCircle(elapsed, measureBreathIdx, 'MCIRC', 'MLAB', 'MSUB');
  if (elapsed >= DUR) { stop(); return; }
  raf = requestAnimationFrame(tick);
}

// ── Reference panel ──────────────────────────────────────────
function refPanel(hrvData, frData) {
  function rate(v, thresholds) { return v > thresholds[0] ? 'good' : v > thresholds[1] ? 'med' : v > thresholds[2] ? 'high' : 'stress'; }
  function rateLFHF(v) { return v < 2 ? 'good' : v < 4 ? 'med' : v < 6 ? 'high' : 'stress'; }
  function label(c) { return c === 'good' ? 'Bra' : c === 'med' ? 'Normal' : c === 'high' ? 'Förhöjd' : 'Hög stress'; }

  let html = `<div class="section-label">Tolkning &amp; referensvärden</div>
  <div class="ref"><div class="ref-title">Dina värden vs. normalområden (vuxen, vila)</div>
  <table class="ref-table"><tr><th>Mått</th><th>Ditt</th><th>Vila</th><th>Stress</th><th>Status</th></tr>
  <tr><td>RMSSD</td><td>${hrvData.rmssd} ms</td><td>40–100 ms</td><td>&lt;20 ms</td><td class="${rate(hrvData.rmssd, [50, 30, 20])}">${label(rate(hrvData.rmssd, [50, 30, 20]))}</td></tr>
  <tr><td>SDNN</td><td>${hrvData.sdnn} ms</td><td>50–100 ms</td><td>&lt;20 ms</td><td class="${rate(hrvData.sdnn, [50, 30, 20])}">${label(rate(hrvData.sdnn, [50, 30, 20]))}</td></tr>
  <tr><td>pNN50</td><td>${hrvData.pnn50}%</td><td>15–40%</td><td>&lt;3%</td><td class="${rate(hrvData.pnn50, [20, 10, 3])}">${label(rate(hrvData.pnn50, [20, 10, 3]))}</td></tr>`;
  if (frData) html += `<tr><td>LF/HF</td><td>${frData.ratio}</td><td>0.5–2.0</td><td>&gt;6</td><td class="${rateLFHF(frData.ratio)}">${label(rateLFHF(frData.ratio))}</td></tr>`;
  html += `</table></div>
  <div class="ref"><div class="ref-title">Vad mäts?</div><table class="ref-table"><tr><th>Mått</th><th>Beskrivning</th></tr>
  <tr><td>RMSSD</td><td>Variation mellan slag. Högt = stark parasympatisk (vagus) tonus = bra återhämtning</td></tr>
  <tr><td>SDNN</td><td>Total variabilitet. Speglar hela autonoma nervsystemet</td></tr>
  <tr><td>pNN50</td><td>Andel successive R-R som skiljer &gt;50 ms. Korrelerar med RMSSD</td></tr>`;
  if (frData) html += `<tr><td style="color:#648cff">LF</td><td>0.04–0.15 Hz. Blandning av sympatisk + parasympatisk. Påverkas av baroreflex</td></tr>
  <tr><td style="color:#00f082">HF</td><td>0.15–0.4 Hz. Huvudsakligen parasympatisk (vagus). Synkroniseras med andning</td></tr>
  <tr><td style="color:#a078ff">LF/HF</td><td>Sympatovagal balans. Vila ≈ 0.5–2. Under stress/träning: 4–10+</td></tr>
  <tr><td style="color:#ff648c">SD1</td><td>Poincaré korttid. ≈ RMSSD/√2. Parasympatisk slag-till-slag-variation</td></tr>
  <tr><td style="color:#648cff">SD2</td><td>Poincaré långtid. Långsammare trender i R-R. Relaterat till SDNN</td></tr>`;
  html += `</table></div>`;
  return html;
}

// ── Test modes ───────────────────────────────────────────────
function generateTestRR(targetRMSSD = 50, meanHR = 70, durationSec = 60) {
  const meanRR = 60000 / meanHR, sigma = targetRMSSD, n = Math.round(durationSec * meanHR / 60);
  const arr = [];
  for (let i = 0; i < n; i++) {
    const u1 = Math.random(), u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const diff = z * sigma * 0.707;
    const resp = 15 * Math.sin(2 * Math.PI * 0.25 * (i * meanRR / 1000));
    const lfc = 10 * Math.sin(2 * Math.PI * 0.1 * (i * meanRR / 1000)) * (targetRMSSD / 50);
    arr.push(Math.round(Math.max(400, Math.min(1400, meanRR + diff + resp + lfc)) * 100) / 100);
  }
  return arr;
}

function runTest(targetRMSSD) {
  rri = generateTestRR(targetRMSSD, 70, 60);
  hrv = D.hrv(rri); freqResult = D.freqHRV(rri);
  flt = []; fps = 30;
  for (let i = 0; i < 1800; i++) flt.push(Math.sin(2 * Math.PI * 1.17 * (i / 30)) * 50 + (Math.random() - 0.5) * 10);
  pks = []; for (let i = 26; i < flt.length; i += 26) pks.push(i);
  sqi = 85; sqiHist = [85, 85, 85]; t0 = performance.now() - 60000;
  document.getElementById('P0').classList.add('hide'); document.getElementById('P1').classList.add('hide');
  res();
}

function runDetTest() {
  const d = 25, meanRR = 800, n = 70;
  const detRR = []; for (let i = 0; i < n; i++) detRR.push(i % 2 === 0 ? meanRR + d : meanRR - d);
  rri = detRR; hrv = D.hrv(detRR); freqResult = D.freqHRV(detRR);
  flt = []; fps = 30;
  for (let i = 0; i < 2100; i++) flt.push(Math.sin(2 * Math.PI * 1.25 * (i / 30)) * 60);
  pks = []; for (let i = 12; i < flt.length; i += 24) pks.push(i);
  sqi = 100; sqiHist = [100]; t0 = performance.now() - 60000;
  document.getElementById('P0').classList.add('hide'); document.getElementById('P1').classList.add('hide');
  const expectedRMSSD = 2 * d, expectedSDNN = d, expectedMeanRR = meanRR, expectedBPM = 60000 / meanRR;
  res();
  requestAnimationFrame(() => {
    const el = document.getElementById('P2'), vd = document.createElement('div');
    vd.style.cssText = 'background:rgba(160,120,255,0.06);border:1px solid rgba(160,120,255,0.15);border-radius:11px;padding:14px;margin-top:-4px;font-size:10px;line-height:1.7;color:#b8a8e8';
    vd.innerHTML = `<div style="font-weight:700;font-size:11px;margin-bottom:6px;color:#a078ff">🔬 Deterministisk verifiering</div>
    <div style="font-size:10px;color:#9a9ab0;margin-bottom:8px">R-R alternerar ${meanRR + d} ↔ ${meanRR - d} ms (${n} slag). Diff = ±${2 * d} ms.</div>
    <table style="width:100%;border-collapse:collapse;font-size:10px">
    <tr style="border-bottom:1px solid #ffffff08"><td style="padding:3px 4px;color:#8a8f98">Mått</td><td style="padding:3px 4px;color:#8a8f98">Förväntat</td><td style="padding:3px 4px;color:#8a8f98">Uppmätt</td><td style="padding:3px 4px;color:#8a8f98">Status</td></tr>
    ${[['RMSSD', expectedRMSSD, hrv.rmssd], ['SDNN', expectedSDNN, hrv.sdnn], ['Medel RR', expectedMeanRR, hrv.meanRR], ['BPM', expectedBPM, hrv.bpm]].map(([n, e, a]) =>
      `<tr><td style="padding:3px 4px;color:#a0a5ae">${n}</td><td style="padding:3px 4px">${e}</td><td style="padding:3px 4px">${a}</td><td style="padding:3px 4px;color:${a === e ? '#00f082' : '#ff2d55'}">${a === e ? '✅' : '❌'}</td></tr>`).join('')}
    <tr><td style="padding:3px 4px;color:#a0a5ae">pNN50</td><td style="padding:3px 4px">0%</td><td style="padding:3px 4px">${hrv.pnn50}%</td><td style="padding:3px 4px;color:${hrv.pnn50 === 0 ? '#00f082' : '#ff2d55'}">${hrv.pnn50 === 0 ? '✅' : '❌'}</td></tr>
    </table>`;
    const btn = el.querySelector('.bp'); el.insertBefore(vd, btn);
  });
}

// ── Results ──────────────────────────────────────────────────
function res() {
  const el = document.getElementById('P2'); el.classList.remove('hide');
  if (!hrv) { el.innerHTML = '<p style="color:#7a808a;text-align:center;padding:40px 0;font-size:13px;line-height:1.6">Inte tillräckligt med data.</p><button class="bp" onclick="rst()">Ny mätning</button>'; return; }
  const s = Math.floor(Math.min((performance.now() - t0) / 1e3, DUR));
  const sqiF = sqiHist.length ? Math.round(sqiHist.reduce((a, b) => a + b, 0) / sqiHist.length) : sqi;
  const fr = freqResult, pc = D.poincare(rri);

  let freqHTML = '';
  if (fr) {
    freqHTML = `<div class="section-label">Frekvensdomän</div>
    <div class="ch"><div class="chh"><span class="cl">Power Spectral Density (PSD)</span><span class="cl">Hz</span></div><canvas id="RPSD" height="130"></canvas></div>
    <div class="g3"><div class="rc"><span class="rv" style="color:#648cff">${fr.lf}</span><span class="rn">LF (ms²)</span><span class="rd">0.04–0.15 Hz</span></div><div class="rc"><span class="rv" style="color:#00f082">${fr.hf}</span><span class="rn">HF (ms²)</span><span class="rd">0.15–0.4 Hz</span></div><div class="rc"><span class="rv" style="color:#a078ff">${fr.ratio}</span><span class="rn">LF/HF</span><span class="rd">Sympatovagal balans</span></div></div>
    <div class="g2"><div class="rc"><span class="rv" style="font-size:18px">${fr.lfNu}%</span><span class="rn">LF n.u.</span><span class="rd">Normaliserad</span></div><div class="rc"><span class="rv" style="font-size:18px">${fr.hfNu}%</span><span class="rn">HF n.u.</span><span class="rd">Normaliserad</span></div></div>`;
  } else { freqHTML = '<div class="w">Frekvensanalys kräver minst 10 R-R intervall.</div>'; }

  let poincareHTML = '';
  if (pc) {
    poincareHTML = `<div class="section-label">Poincaré-analys</div>
    <div class="ch"><div class="chh"><span class="cl">RR(n) vs RR(n+1)</span><span class="cl">SD1/SD2 ellips</span></div><canvas id="RPCR" height="220"></canvas></div>
    <div class="g3"><div class="rc"><span class="rv" style="color:#ff648c">${pc.sd1}</span><span class="rn">SD1 (ms)</span><span class="rd">Korttid</span></div><div class="rc"><span class="rv" style="color:#648cff">${pc.sd2}</span><span class="rn">SD2 (ms)</span><span class="rd">Långtid</span></div><div class="rc"><span class="rv" style="color:#b8a8e8">${pc.ratio}</span><span class="rn">SD1/SD2</span><span class="rd">Balans</span></div></div>
    <div class="ref"><div class="ref-title">Så tolkar du Poincaré-plotten</div>
    <table class="ref-table"><tr><th>Mönster</th><th>Form</th><th>Betydelse</th></tr>
    <tr><td class="good">Vila</td><td>Bred, rund</td><td>Hög variabilitet, stark vagustonus</td></tr>
    <tr><td class="med">Lätt stress</td><td>Smal, cigarr</td><td>SD1 minskar, sympatisk aktivering</td></tr>
    <tr><td class="stress">Hög stress</td><td>Tight punkt</td><td>Låg variation, begränsad autonom flex</td></tr>
    <tr><td style="color:#a078ff">Brusig</td><td>Utspridd</td><td>Artefakter, dålig signalkvalitet</td></tr></table></div>`;
  }

  el.innerHTML = `<div style="text-align:center;margin-bottom:6px"><div style="font-size:17px;font-weight:700;color:#eef0f4">Mätning klar</div><p style="font-size:10px;color:#7a808a">${s}s · ${hrv.count} giltiga RR · ${hrv.rej} förkastade · SQI ${sqiF}/100</p></div>
  <div class="bb"><span class="bn">${hrv.bpm}</span><span class="bu">BPM</span></div>
  <div class="section-label">Tidsdomän</div>
  <div class="g2"><div class="rc"><span class="rv">${hrv.rmssd}</span><span class="rn">RMSSD (ms)</span><span class="rd">Parasympatisk tonus</span></div><div class="rc"><span class="rv">${hrv.sdnn}</span><span class="rn">SDNN (ms)</span><span class="rd">Total variabilitet</span></div><div class="rc"><span class="rv">${hrv.pnn50}%</span><span class="rn">pNN50</span><span class="rd">Andel ΔRR > 50 ms</span></div><div class="rc"><span class="rv">${hrv.meanRR}</span><span class="rn">Medel RR (ms)</span><span class="rd">Genomsnittligt intervall</span></div></div>
  ${freqHTML}${poincareHTML}${refPanel(hrv, fr)}
  <div class="section-label">Signaldata</div>
  <div class="ch"><span class="cl">PPG-signal</span><canvas id="RW" height="100"></canvas></div>
  <div class="ch"><span class="cl">R-R intervallserie</span><canvas id="RV" height="70"></canvas></div>
  <div class="dg"><div class="dr"><span class="dk">FPS</span><span class="dv">${Math.round(fps * 10) / 10}</span></div><div class="dr"><span class="dk">Filter</span><span class="dv">Butterworth 4:e ordn.</span></div><div class="dr"><span class="dk">Kanaler</span><span class="dv">R 40% + G 60%</span></div><div class="dr"><span class="dk">SQI</span><span class="dv">${sqiF}/100</span></div></div>
  <div class="w">⚠️ Demo — ersätter inte medicinsk utrustning.</div>
  <button class="bp" onclick="rst()">Ny mätning</button>`;

  requestAnimationFrame(() => {
    drawWaveform('RW', flt, pks); drawRR('RV', rri);
    if (fr) drawPSD('RPSD', fr);
    if (pc) drawPoincare('RPCR', pc);
  });
}

function rst() {
  if (stm) { stm.getTracks().forEach(t => t.stop()); stm = null; }
  document.getElementById('P0').classList.remove('hide');
  document.getElementById('P1').classList.add('hide');
  document.getElementById('P2').classList.add('hide');
  const b = document.getElementById('SB'); b.disabled = false; b.textContent = 'Starta mätning';
  renderHistory();
}

// ── Init ─────────────────────────────────────────────────────
renderHistory();