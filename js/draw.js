// ═══════════════════════════════════════════════════════════════
// DRAWING — PPG waveform, RR bars, PSD, Poincaré, Trend
// ═══════════════════════════════════════════════════════════════

export function drawWaveform(id, data, peaks) {
  const c = document.getElementById(id); if (!c || data.length < 2) return;
  const cx = c.getContext('2d'), w = c.clientWidth, h = c.clientHeight, dp = devicePixelRatio || 1;
  c.width = w * dp; c.height = h * dp; cx.scale(dp, dp); cx.clearRect(0, 0, w, h);
  cx.strokeStyle = '#00f0820a'; cx.lineWidth = .5;
  for (let y = 0; y < h; y += 20) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(w, y); cx.stroke(); }
  const vl = Math.min(data.length, w * 2), vs = data.slice(-vl), of = data.length - vl, am = Math.max(...vs.map(Math.abs)) || 1;
  const tx = i => (i / (vl - 1)) * w, ty = v => h / 2 - (v / am) * (h * .4);
  cx.beginPath(); vs.forEach((v, i) => { i ? cx.lineTo(tx(i), ty(v)) : cx.moveTo(tx(i), ty(v)); });
  cx.lineTo(w, h); cx.lineTo(0, h); cx.closePath();
  const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#00f08212'); g.addColorStop(1, '#00f08200'); cx.fillStyle = g; cx.fill();
  cx.beginPath(); cx.strokeStyle = '#00f082'; cx.lineWidth = 1.8; cx.shadowColor = '#00f082'; cx.shadowBlur = 4;
  vs.forEach((v, i) => { i ? cx.lineTo(tx(i), ty(v)) : cx.moveTo(tx(i), ty(v)); }); cx.stroke(); cx.shadowBlur = 0;
  peaks.forEach(pk => { const li = Math.round(pk) - of; if (li >= 0 && li < vl) { const x = tx(li), y = ty(vs[li]); cx.beginPath(); cx.arc(x, y, 3, 0, Math.PI * 2); cx.fillStyle = '#ff2d55'; cx.fill(); } });
}

export function drawRR(id, iv) {
  const c = document.getElementById(id); if (!c || iv.length < 2) return;
  const cx = c.getContext('2d'), w = c.clientWidth, h = c.clientHeight, dp = devicePixelRatio || 1;
  c.width = w * dp; c.height = h * dp; cx.scale(dp, dp); cx.clearRect(0, 0, w, h);
  const vs = iv.slice(-50), mx = Math.max(...vs), mn = Math.min(...vs), rg = mx - mn || 50, me = vs.reduce((a, b) => a + b, 0) / vs.length, bw = Math.max(2, (w - 16) / vs.length - 1.5);
  vs.forEach((r, i) => { const n = (r - mn) / rg, bh = 6 + n * (h - 16), x = 8 + i * (bw + 1.5), dv = Math.abs(r - me) / rg; cx.fillStyle = `hsla(${150 - dv * 120},80%,55%,.8)`; cx.beginPath(); cx.roundRect(x, h - bh, bw, bh, 1); cx.fill(); });
}

export function drawPSD(id, freq) {
  const c = document.getElementById(id); if (!c || !freq) return;
  const cx = c.getContext('2d'), w = c.clientWidth, h = c.clientHeight, dp = devicePixelRatio || 1;
  c.width = w * dp; c.height = h * dp; cx.scale(dp, dp); cx.clearRect(0, 0, w, h);
  const { psd, freqs, nFreqs } = freq;
  const maxF = 0.5, pad = 8;
  const maxIdx = Math.min(nFreqs, Math.ceil(maxF / freqs[1]));
  let maxPsd = 0; for (let i = 1; i < maxIdx; i++) if (psd[i] > maxPsd) maxPsd = psd[i];
  if (maxPsd === 0) maxPsd = 1;
  const plotW = w - 2 * pad, plotH = h - 2 * pad;
  const tx = f => pad + (f / maxF) * plotW, ty = p => pad + plotH - (p / maxPsd) * plotH;

  cx.fillStyle = 'rgba(100,140,255,0.08)'; cx.fillRect(tx(0.04), pad, tx(0.15) - tx(0.04), plotH);
  cx.fillStyle = 'rgba(0,240,130,0.08)'; cx.fillRect(tx(0.15), pad, tx(0.4) - tx(0.15), plotH);
  cx.font = '10px system-ui'; cx.textAlign = 'center';
  cx.fillStyle = 'rgba(100,140,255,0.5)'; cx.fillText('LF', tx(0.095), h - 1);
  cx.fillStyle = 'rgba(0,240,130,0.5)'; cx.fillText('HF', tx(0.275), h - 1);
  cx.fillStyle = '#7a808a'; cx.font = '9px system-ui';
  [0, 0.1, 0.2, 0.3, 0.4, 0.5].forEach(f => cx.fillText(f.toFixed(1), tx(f), h - pad + 12));

  cx.beginPath(); cx.moveTo(tx(freqs[1]), ty(0));
  for (let i = 1; i < maxIdx; i++) cx.lineTo(tx(freqs[i]), ty(psd[i]));
  cx.lineTo(tx(freqs[maxIdx - 1]), ty(0)); cx.closePath();
  const grd = cx.createLinearGradient(0, pad, 0, pad + plotH);
  grd.addColorStop(0, 'rgba(160,120,255,0.2)'); grd.addColorStop(1, 'rgba(160,120,255,0)');
  cx.fillStyle = grd; cx.fill();
  cx.beginPath(); cx.strokeStyle = '#a078ff'; cx.lineWidth = 1.5; cx.shadowColor = '#a078ff'; cx.shadowBlur = 3;
  for (let i = 1; i < maxIdx; i++) { i === 1 ? cx.moveTo(tx(freqs[i]), ty(psd[i])) : cx.lineTo(tx(freqs[i]), ty(psd[i])); }
  cx.stroke(); cx.shadowBlur = 0;
  cx.strokeStyle = 'rgba(255,255,255,0.06)'; cx.setLineDash([3, 3]); cx.lineWidth = 0.5;
  [0.04, 0.15, 0.4].forEach(f => { cx.beginPath(); cx.moveTo(tx(f), pad); cx.lineTo(tx(f), pad + plotH); cx.stroke(); });
  cx.setLineDash([]);
}

export function drawPoincare(id, pd) {
  const c = document.getElementById(id); if (!c || !pd) return;
  const cx = c.getContext('2d'), w = c.clientWidth, h = c.clientHeight, dp = devicePixelRatio || 1;
  c.width = w * dp; c.height = h * dp; cx.scale(dp, dp); cx.clearRect(0, 0, w, h);
  const { pairs, sd1, sd2 } = pd; if (pairs.length < 3) return;
  const pad = 28, allRR = pairs.flat();
  // Fixed axis range: 500–1100ms (covers 55–120 BPM)
  const plotMin = 500, plotMax = 1100, plotRange = plotMax - plotMin;
  const plotW = w - 2 * pad, plotH = h - 2 * pad;
  const tx = v => pad + (v - plotMin) / plotRange * plotW, ty = v => pad + plotH - (v - plotMin) / plotRange * plotH;

  cx.strokeStyle = 'rgba(255,255,255,0.04)'; cx.lineWidth = 0.5;
  const step = plotRange > 300 ? 100 : plotRange > 150 ? 50 : 25;
  const gridStart = Math.ceil(plotMin / step) * step;
  cx.font = '9px system-ui'; cx.fillStyle = '#7a808a'; cx.textAlign = 'center';
  for (let v = gridStart; v < plotMax; v += step) {
    cx.beginPath(); cx.moveTo(tx(v), pad); cx.lineTo(tx(v), pad + plotH); cx.stroke();
    cx.beginPath(); cx.moveTo(pad, ty(v)); cx.lineTo(pad + plotW, ty(v)); cx.stroke();
    cx.fillText(Math.round(v), tx(v), pad + plotH + 10);
  }
  cx.strokeStyle = 'rgba(255,255,255,0.08)'; cx.lineWidth = 1; cx.setLineDash([4, 4]);
  cx.beginPath(); cx.moveTo(tx(plotMin), ty(plotMin)); cx.lineTo(tx(plotMax), ty(plotMax)); cx.stroke(); cx.setLineDash([]);

  const meanX = allRR.reduce((a, b) => a + b, 0) / allRR.length;
  const centerX = tx(meanX), centerY = ty(meanX);
  const scaleX = plotW / plotRange, scaleY = plotH / plotRange;
  cx.save(); cx.translate(centerX, centerY); cx.rotate(-Math.PI / 4);
  cx.beginPath(); cx.ellipse(0, 0, sd2 * scaleX, sd1 * scaleY, 0, 0, Math.PI * 2);
  cx.strokeStyle = 'rgba(0,240,130,0.25)'; cx.lineWidth = 1.5; cx.stroke();
  cx.fillStyle = 'rgba(0,240,130,0.03)'; cx.fill(); cx.restore();

  cx.save(); cx.translate(centerX, centerY); cx.rotate(-Math.PI / 4);
  cx.strokeStyle = 'rgba(255,100,140,0.4)'; cx.lineWidth = 1; cx.setLineDash([3, 3]);
  cx.beginPath(); cx.moveTo(0, -sd1 * scaleY); cx.lineTo(0, sd1 * scaleY); cx.stroke(); cx.setLineDash([]); cx.restore();

  cx.save(); cx.translate(centerX, centerY); cx.rotate(-Math.PI / 4);
  cx.strokeStyle = 'rgba(100,140,255,0.4)'; cx.lineWidth = 1; cx.setLineDash([3, 3]);
  cx.beginPath(); cx.moveTo(-sd2 * scaleX, 0); cx.lineTo(sd2 * scaleX, 0); cx.stroke(); cx.setLineDash([]); cx.restore();

  pairs.forEach(([x, y], i) => { cx.beginPath(); cx.arc(tx(x), ty(y), 2.5, 0, Math.PI * 2); cx.fillStyle = `rgba(0,240,130,${0.3 + 0.5 * (i / pairs.length)})`; cx.fill(); });

  cx.fillStyle = '#7a808a'; cx.font = '10px system-ui';
  cx.textAlign = 'center'; cx.fillText('RR(n) ms', pad + plotW / 2, h - 2);
  cx.save(); cx.translate(8, pad + plotH / 2); cx.rotate(-Math.PI / 2); cx.textAlign = 'center'; cx.fillText('RR(n+1) ms', 0, 0); cx.restore();
  cx.font = '10px system-ui'; cx.textAlign = 'left';
  cx.fillStyle = 'rgba(255,100,140,0.7)'; cx.fillText('SD1=' + sd1, centerX + 4, centerY - sd1 * scaleY * 0.5 - 4);
  cx.fillStyle = 'rgba(100,140,255,0.7)'; cx.fillText('SD2=' + sd2, centerX + sd2 * scaleX * 0.3 + 4, centerY + 12);
}

export function drawTrend(id, entries) {
  const c = document.getElementById(id); if (!c || entries.length < 2) return;
  const cx = c.getContext('2d'), w = c.clientWidth, h = c.clientHeight, dp = devicePixelRatio || 1;
  c.width = w * dp; c.height = h * dp; cx.scale(dp, dp); cx.clearRect(0, 0, w, h);
  const data = entries.slice(-30), vals = data.map(e => e.rmssd);
  const pad = { t: 8, b: 20, l: 36, r: 8 };
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const maxV = Math.max(...vals) * 1.15, minV = Math.max(0, Math.min(...vals) * 0.85), range = maxV - minV || 1;
  const tx = i => pad.l + (i / (data.length - 1)) * plotW, ty = v => pad.t + plotH - ((v - minV) / range) * plotH;

  cx.strokeStyle = '#ffffff0a'; cx.lineWidth = 0.5;
  cx.font = '10px system-ui'; cx.fillStyle = '#7a808a'; cx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const v = minV + range * (i / 4), y = ty(v); cx.beginPath(); cx.moveTo(pad.l, y); cx.lineTo(w - pad.r, y); cx.stroke(); cx.fillText(Math.round(v), pad.l - 4, y + 4); }

  data.forEach((e, i) => { if (e.hour >= 6 && e.hour <= 9) { cx.fillStyle = 'rgba(255,214,10,0.04)'; const bw = Math.max(4, plotW / data.length * 0.8); cx.fillRect(tx(i) - bw / 2, pad.t, bw, plotH); } });

  if (data.length >= 3) {
    cx.beginPath(); cx.strokeStyle = '#648cff'; cx.lineWidth = 2; cx.setLineDash([6, 3]); let first = true;
    data.forEach((e, i) => { const ws = Math.max(0, i - 6), win = vals.slice(ws, i + 1), avg = win.reduce((a, b) => a + b, 0) / win.length; first ? (cx.moveTo(tx(i), ty(avg)), first = false) : cx.lineTo(tx(i), ty(avg)); });
    cx.stroke(); cx.setLineDash([]);
  }

  cx.beginPath(); cx.strokeStyle = 'rgba(0,240,130,0.4)'; cx.lineWidth = 1;
  data.forEach((e, i) => { i === 0 ? cx.moveTo(tx(i), ty(e.rmssd)) : cx.lineTo(tx(i), ty(e.rmssd)); }); cx.stroke();
  data.forEach((e, i) => { cx.beginPath(); cx.arc(tx(i), ty(e.rmssd), e.hour >= 6 && e.hour <= 9 ? 4 : 3, 0, Math.PI * 2); cx.fillStyle = e.hour >= 6 && e.hour <= 9 ? '#ffd60a' : '#00f082'; cx.fill(); });

  cx.fillStyle = '#7a808a'; cx.font = '9px system-ui'; cx.textAlign = 'center';
  if (data.length > 0) cx.fillText(data[0].date.slice(5), tx(0), h - 2);
  if (data.length > 2) cx.fillText(data[data.length - 1].date.slice(5), tx(data.length - 1), h - 2);
  if (data.length > 5) { const mid = Math.floor(data.length / 2); cx.fillText(data[mid].date.slice(5), tx(mid), h - 2); }
}