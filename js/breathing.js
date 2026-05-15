// ═══════════════════════════════════════════════════════════════
// BREATHING GUIDE
// ═══════════════════════════════════════════════════════════════

import { D } from './dsp.js';
import { drawWaveform } from './draw.js';

export const BREATH_PATTERNS = [
  { name: 'Resonans', phases: [{ t: 5.45, l: 'Andas in', act: 'in' }, { t: 5.45, l: 'Andas ut', act: 'out' }] },
  { name: '4-7-8', phases: [{ t: 4, l: 'Andas in', act: 'in' }, { t: 7, l: 'Håll', act: 'hold' }, { t: 8, l: 'Andas ut', act: 'out' }] },
  { name: 'Box', phases: [{ t: 4, l: 'Andas in', act: 'in' }, { t: 4, l: 'Håll', act: 'hold' }, { t: 4, l: 'Andas ut', act: 'out' }, { t: 4, l: 'Håll', act: 'hold' }] }
];

// Shared animation function (used by standalone + inline modes)
export function animateBreathCircle(elapsed, patIdx, circId, labId, subId) {
  const pat = BREATH_PATTERNS[patIdx];
  const cycleLen = pat.phases.reduce((a, p) => a + p.t, 0);
  const inCycle = elapsed % cycleLen;
  let phaseTime = 0, curPhase = pat.phases[0];
  for (const p of pat.phases) {
    if (inCycle >= phaseTime && inCycle < phaseTime + p.t) { curPhase = p; break; }
    phaseTime += p.t;
  }
  const phaseProgress = (inCycle - phaseTime) / curPhase.t;
  const remaining = Math.ceil(curPhase.t - (inCycle - phaseTime));

  let size;
  if (curPhase.act === 'in') size = 60 + 110 * phaseProgress;
  else if (curPhase.act === 'out') size = 170 - 110 * phaseProgress;
  else {
    const phIdx = pat.phases.indexOf(curPhase);
    const prevAct = phIdx > 0 ? pat.phases[phIdx - 1].act : pat.phases[pat.phases.length - 1].act;
    size = prevAct === 'in' ? 170 : 60;
  }

  const circ = document.getElementById(circId);
  if (!circ) return;
  const hue = curPhase.act === 'in' ? 190 : curPhase.act === 'out' ? 170 : 210;
  const intensity = curPhase.act === 'hold' ? 0.1 : 0.2;
  circ.style.width = size + 'px'; circ.style.height = size + 'px';
  circ.style.background = `rgba(0,${hue},216,${intensity})`;
  circ.style.border = `2px solid rgba(0,${hue},216,0.5)`;
  circ.style.transition = 'width 0.15s ease, height 0.15s ease';
  document.getElementById(labId).textContent = curPhase.l;
  document.getElementById(subId).textContent = remaining + 's';
  return cycleLen;
}

// ── Standalone breathing guide state ─────────────────────────
let breathIdx = 0, breathRaf = null, breathStart = 0, breathActive = false;
let breathRRI = [], breathRaw = [], breathRawG = [], breathTS = [];
let breathFlt = [], breathPks = [], breathSqi = 0;
let stmRef = null, fpsRef = 30, coRef = null;

export function setBreathPattern(idx) {
  breathIdx = idx;
  ['bo1', 'bo2', 'bo3'].forEach((id, i) => document.getElementById(id).classList.toggle('active', i === idx));
}

export async function startBreathing(resCallback) {
  breathRRI = []; breathRaw = []; breathRawG = []; breathTS = [];

  if (!navigator.mediaDevices?.getUserMedia) return;
  const cfgs = [
    { facingMode: 'environment', width: { ideal: 160 }, height: { ideal: 120 }, frameRate: { ideal: 60, min: 30 } },
    { facingMode: 'environment' }, { facingMode: { ideal: 'environment' } }, true
  ];
  for (let i = 0; i < cfgs.length; i++) {
    try { stmRef = await navigator.mediaDevices.getUserMedia({ video: cfgs[i] }); break; }
    catch (e) { if (e.name === 'NotAllowedError' || i === cfgs.length - 1) return; }
  }
  const tk = stmRef.getVideoTracks()[0], se = tk.getSettings();
  fpsRef = se.frameRate || 30; coRef = D.bp4(fpsRef, .5, 4);
  try {
    const cp = tk.getCapabilities?.();
    if (cp?.torch) try { await tk.applyConstraints({ advanced: [{ torch: true }] }); } catch (e) {}
    const ad = [];
    if (cp?.exposureMode) ad.push({ exposureMode: 'manual' });
    if (cp?.whiteBalanceMode) ad.push({ whiteBalanceMode: 'manual' });
    if (ad.length) try { await tk.applyConstraints({ advanced: ad }); } catch (e) {}
  } catch (e) {}

  const v = document.getElementById('V'); v.srcObject = stmRef; await v.play();
  breathStart = performance.now(); breathActive = true;
  document.getElementById('P0').classList.add('hide');
  document.getElementById('P1').classList.add('hide');
  document.getElementById('P2').classList.add('hide');
  document.getElementById('P3').classList.remove('hide');
  breathRaf = requestAnimationFrame(() => breathTick(resCallback));
}

export function stopBreathing(resCallback) {
  breathActive = false;
  if (breathRaf) { cancelAnimationFrame(breathRaf); breathRaf = null; }
  if (stmRef) { stmRef.getTracks().forEach(t => t.stop()); stmRef = null; }
  document.getElementById('P3').classList.add('hide');

  if (breathRRI.length >= 10 && resCallback) {
    resCallback(breathRRI, breathFlt, breathPks, breathSqi, breathStart);
  } else {
    document.getElementById('P0').classList.remove('hide');
  }
}

function breathTick(resCallback) {
  if (!breathActive || !stmRef) return;
  const now = performance.now();
  const elapsed = (now - breathStart) / 1000;

  const cycleLen = animateBreathCircle(elapsed, breathIdx, 'BCIRC', 'BLAB', 'BSUB');

  // Camera PPG processing
  const v = document.getElementById('V'), cv = document.getElementById('C');
  if (v && cv && stmRef) {
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cv.width = 32; cv.height = 24; cx.drawImage(v, 0, 0, 32, 24);
    const px = cx.getImageData(4, 4, 24, 16).data;
    let rS = 0, gS = 0, bS = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { rS += px[i]; gS += px[i + 1]; bS += px[i + 2]; n++; }
    const rA = rS / n, gA = gS / n, bA = bS / n, ok = rA > 100 && rA > bA * 1.3 && rA > gA * 1.05;

    const bfc = document.getElementById('bfc');
    if (ok) {
      bfc.style.cssText = 'display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;font-size:10px;font-weight:600;background:#00f0820d;color:#00f082;border:1px solid #00f0821f';
      document.getElementById('bfd').style.background = '#00f082'; document.getElementById('bft').textContent = 'Finger OK';
    } else {
      bfc.style.cssText = 'display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;font-size:10px;font-weight:600;background:#ff2d550d;color:#ff2d55;border:1px solid #ff2d551f';
      document.getElementById('bfd').style.background = '#ff2d55'; document.getElementById('bft').textContent = 'Placera finger';
    }

    if (ok && elapsed > 2) {
      breathRaw.push(rA); breathRawG.push(gA); breathTS.push(now);
      if (breathRaw.length > 5000) { breathRaw = breathRaw.slice(-3600); breathRawG = breathRawG.slice(-3600); breathTS = breathTS.slice(-3600); }
      if (breathTS.length > 60) { const l = breathTS.slice(-60); fpsRef = 1e3 / ((l[l.length - 1] - l[0]) / (l.length - 1)); coRef = D.bp4(fpsRef, .5, 4); }
      if (breathRaw.length > fpsRef * 2) {
        const combined = new Float64Array(breathRaw.length);
        for (let i = 0; i < breathRaw.length; i++) combined[i] = breathRaw[i] * .4 + breathRawG[i] * .6;
        breathFlt = Array.from(D.ff(combined, coRef));
        breathPks = D.fp(breathFlt, Math.round(fpsRef * .45));
        breathSqi = D.sq(breathFlt, breathPks, fpsRef);
        drawWaveform('BW', breathFlt, breathPks);

        if (breathPks.length >= 3) {
          const pt = breathPks.map(idx => {
            const ri = D.rp(breathFlt, idx), fl2 = Math.floor(ri), fr = ri - fl2;
            return fl2 >= 0 && fl2 < breathTS.length - 1 ? breathTS[fl2] + fr * (breathTS[fl2 + 1] - breathTS[fl2]) : breathTS[Math.min(idx, breathTS.length - 1)];
          });
          breathRRI = [];
          for (let i = 1; i < pt.length; i++) { const ms = pt[i] - pt[i - 1]; if (ms > 333 && ms < 1500) breathRRI.push(Math.round(ms * 100) / 100); }

          if (breathRRI.length >= 2) {
            const rc = breathRRI.slice(-12); const srt = [...rc].sort((a,b) => a - b); const med = srt[0 | srt.length / 2];
            document.getElementById('BBPM').textContent = Math.round(6e4 / med);
          }
          const bhrv = D.hrv(breathRRI);
          if (bhrv) { document.getElementById('bxR').textContent = bhrv.rmssd; document.getElementById('bxS').textContent = bhrv.sdnn; }

          if (breathRRI.length >= 10) {
            const breathFreq = 1 / cycleLen;
            const fhr = D.freqHRV(breathRRI);
            if (fhr) {
              let breathPower = 0, totalPower = 0; const bw = 0.03;
              for (let i = 0; i < fhr.nFreqs; i++) {
                const f = fhr.freqs[i];
                if (f >= 0.003 && f <= 0.4) { totalPower += fhr.psd[i]; if (f >= breathFreq - bw && f <= breathFreq + bw) breathPower += fhr.psd[i]; }
              }
              const coherence = totalPower > 0 ? Math.min(100, Math.round(breathPower / totalPower * 300)) : 0;
              const cohColor = coherence > 70 ? '#00f082' : coherence > 40 ? '#ffd60a' : coherence > 20 ? '#ff6b35' : '#ff2d55';
              const cohLabel = coherence > 70 ? 'Hög' : coherence > 40 ? 'Medium' : coherence > 20 ? 'Låg' : 'Mycket låg';
              document.getElementById('BCOH').textContent = cohLabel + ' ' + coherence;
              document.getElementById('BCOH').style.color = cohColor;
              document.getElementById('BCOF').style.width = coherence + '%';
              document.getElementById('BCOF').style.background = cohColor;
            }
          }
        }
      }
    }
  }
  document.getElementById('bxT').textContent = Math.floor(elapsed) + 's';
  breathRaf = requestAnimationFrame(() => breathTick(resCallback));
}