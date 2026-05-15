// ═══════════════════════════════════════════════════════════════
// DSP ENGINE v4 — Butterworth, FFT, HRV, Poincaré, SQI
// ═══════════════════════════════════════════════════════════════

export const D = {
  // ── Butterworth bandpass ───────────────────────────────────
  bp2(fs, fl, fh) {
    const wL = 2 * Math.PI * fl / fs, wH = 2 * Math.PI * fh / fs;
    const wLw = 2 * fs * Math.tan(wL / 2), wHw = 2 * fs * Math.tan(wH / 2);
    const bw = wHw - wLw, w0 = Math.sqrt(wLw * wHw), Q = .7071;
    const K = 2 * fs, K2 = K * K, w02 = w0 * w0, a0 = K2 + bw * K / Q + w02;
    return { b: [bw * K / a0, 0, -bw * K / a0], a: [1, (2 * w02 - 2 * K2) / a0, (K2 - bw * K / Q + w02) / a0] };
  },
  bp4(fs, fl = .5, fh = 4) { return [this.bp2(fs, fl, fh), this.bp2(fs, fl, fh)]; },

  // ── IIR biquad filter ──────────────────────────────────────
  af(s, c) {
    const o = new Float64Array(s.length); let z1 = 0, z2 = 0;
    for (let i = 0; i < s.length; i++) {
      const x = s[i], y = c.b[0] * x + z1;
      z1 = c.b[1] * x - c.a[1] * y + z2;
      z2 = c.b[2] * x - c.a[2] * y;
      o[i] = y;
    }
    return o;
  },

  // ── Zero-phase filter (filtfilt) ───────────────────────────
  ff1(s, c) {
    const p = Math.min(9, s.length - 1), pd = new Float64Array(s.length + 2 * p);
    for (let i = 0; i < p; i++) { pd[i] = 2 * s[0] - s[p - i]; pd[s.length + p + i] = 2 * s[s.length - 1] - s[s.length - 2 - i]; }
    for (let i = 0; i < s.length; i++) pd[p + i] = s[i];
    const f = this.af(pd, c), r = new Float64Array(f.length);
    for (let i = 0; i < f.length; i++) r[i] = f[f.length - 1 - i];
    const b = this.af(r, c), o = new Float64Array(s.length);
    for (let i = 0; i < s.length; i++) o[i] = b[b.length - 1 - p - i];
    return o;
  },
  ff(s, secs) { let o = s; for (const sec of secs) o = this.ff1(o, sec); return o; },

  // ── Peak detection & refinement ────────────────────────────
  rp(d, i) {
    if (i <= 0 || i >= d.length - 1) return i;
    const dn = 2 * (2 * d[i] - d[i - 1] - d[i + 1]);
    return Math.abs(dn) < 1e-10 ? i : i + Math.max(-.5, Math.min(.5, (d[i - 1] - d[i + 1]) / dn));
  },
  fp(d, md, th = .35) {
    const pk = []; if (d.length < 5) return pk;
    const s = [...d].sort((a, b) => a - b);
    const t = s[0 | s.length * .1] + (s[0 | s.length * .9] - s[0 | s.length * .1]) * th;
    for (let i = 2; i < d.length - 2; i++)
      if (d[i] > t && d[i] >= d[i - 1] && d[i] >= d[i + 1] && d[i] > d[i - 2] && d[i] > d[i + 2]) {
        if (!pk.length || i - pk[pk.length - 1] >= md) pk.push(i);
        else if (d[i] > d[pk[pk.length - 1]]) pk[pk.length - 1] = i;
      }
    return pk;
  },

  // ── SQI (calibrated for camera PPG) ────────────────────────
  sq(f, pk, fs) {
    if (pk.length < 3) return 0;
    const ib = []; for (let i = 1; i < pk.length; i++) ib.push((pk[i] - pk[i - 1]) / fs * 1e3);
    const m = ib.reduce((a, b) => a + b, 0) / ib.length;
    const sd = Math.sqrt(ib.map(x => (x - m) ** 2).reduce((a, b) => a + b, 0) / ib.length);
    const rs = Math.max(0, Math.min(40, 40 * (1 - sd / m / .5)));
    const am = pk.map(i => f[i]), mA = am.reduce((a, b) => a + b, 0) / am.length;
    const sA = Math.sqrt(am.map(x => (x - mA) ** 2).reduce((a, b) => a + b, 0) / am.length);
    const as = Math.max(0, Math.min(30, 30 * (1 - (mA ? sA / Math.abs(mA) : 1) / .9)));
    const ab = [...f].map(Math.abs).sort((a, b) => a - b);
    const n = ab[0 | ab.length * .25], sg = ab[0 | ab.length * .95], snr = n > 0 ? sg / n : sg > 0 ? 15 : 0;
    return Math.round(rs + as + Math.max(0, Math.min(30, 30 * Math.min(1, snr / 4))));
  },

  // ── Clean R-R series (shared by hrv + poincaré) ─────────────
  cleanRR(rr) {
    if (rr.length < 3) return [];
    // Step 1: physiological bounds (40–180 BPM)
    let v = rr.filter(r => r > 333 && r < 1500); if (v.length < 3) return [];
    // Step 2: median filter — keep within ±20% of median
    const s = [...v].sort((a, b) => a - b), md = s[0 | s.length / 2];
    v = v.filter(r => Math.abs(r - md) < md * .20); if (v.length < 3) return [];
    // Step 3: successive-diff filter — reject jumps >25% from previous
    const clean = [v[0]];
    for (let i = 1; i < v.length; i++) {
      if (Math.abs(v[i] - clean[clean.length - 1]) < clean[clean.length - 1] * 0.25) clean.push(v[i]);
    }
    return clean.length >= 3 ? clean : [];
  },

  // ── Time-domain HRV ────────────────────────────────────────
  hrv(rr) {
    const fl = this.cleanRR(rr); if (fl.length < 3) return null;
    const m = fl.reduce((a, b) => a + b, 0) / fl.length;
    const sfl = [...fl].sort((a, b) => a - b), medRR = sfl[0 | sfl.length / 2];
    const sd = Math.sqrt(fl.map(r => (r - m) ** 2).reduce((a, b) => a + b, 0) / fl.length);
    const df = []; for (let i = 1; i < fl.length; i++) df.push(fl[i] - fl[i - 1]);
    const rm = Math.sqrt(df.map(d => d * d).reduce((a, b) => a + b, 0) / df.length);
    const pn = (df.filter(d => Math.abs(d) > 50).length / df.length) * 100;
    return {
      bpm: Math.round(6e5 / medRR) / 10, sdnn: Math.round(sd * 10) / 10, rmssd: Math.round(rm * 10) / 10,
      pnn50: Math.round(pn * 10) / 10, meanRR: Math.round(m * 10) / 10, count: fl.length, rej: rr.length - fl.length
    };
  },

  // ── Poincaré SD1/SD2 ───────────────────────────────────────
  poincare(rr) {
    const v = this.cleanRR(rr); if (v.length < 4) return null;
    const d1 = [], d2 = [];
    for (let i = 0; i < v.length - 1; i++) {
      d1.push((v[i + 1] - v[i]) / Math.SQRT2);
      d2.push((v[i + 1] + v[i]) / Math.SQRT2);
    }
    const m1 = d1.reduce((a, b) => a + b, 0) / d1.length;
    const m2 = d2.reduce((a, b) => a + b, 0) / d2.length;
    const sd1 = Math.sqrt(d1.map(x => (x - m1) ** 2).reduce((a, b) => a + b, 0) / d1.length);
    const sd2 = Math.sqrt(d2.map(x => (x - m2) ** 2).reduce((a, b) => a + b, 0) / d2.length);
    const ratio = sd2 > 0 ? sd1 / sd2 : 0;
    const pairs = [];
    for (let i = 0; i < v.length - 1; i++) pairs.push([v[i], v[i + 1]]);
    return { sd1: Math.round(sd1 * 10) / 10, sd2: Math.round(sd2 * 10) / 10, ratio: Math.round(ratio * 100) / 100, pairs };
  },

  // ── FFT (Radix-2, Cooley-Tukey) ────────────────────────────
  fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = 2 * Math.PI / len, wRe = Math.cos(ang), wIm = -Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let curRe = 1, curIm = 0;
        for (let j = 0; j < len / 2; j++) {
          const uRe = re[i + j], uIm = im[i + j];
          const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
          const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
          re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
          re[i + j + len / 2] = uRe - vRe; im[i + j + len / 2] = uIm - vIm;
          const nc = curRe * wRe - curIm * wIm; curIm = curRe * wIm + curIm * wRe; curRe = nc;
        }
      }
    }
  },

  // ── Resample RR to uniform rate ────────────────────────────
  resampleRR(rrMs, targetFs = 4) {
    if (rrMs.length < 4) return null;
    const tRR = [0];
    for (let i = 0; i < rrMs.length; i++) tRR.push(tRR[tRR.length - 1] + rrMs[i] / 1000);
    const yRR = [rrMs[0] / 1000];
    for (let i = 0; i < rrMs.length; i++) yRR.push(rrMs[i] / 1000);
    const duration = tRR[tRR.length - 1], nSamples = Math.floor(duration * targetFs);
    if (nSamples < 8) return null;
    const uniform = new Float64Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      const t = i / targetFs;
      let k = 1; while (k < tRR.length - 1 && tRR[k] < t) k++;
      k = Math.min(k, tRR.length - 1);
      const t0 = tRR[k - 1], t1 = tRR[k], frac = (t1 !== t0) ? (t - t0) / (t1 - t0) : 0;
      uniform[i] = yRR[k - 1] + (yRR[k] - yRR[k - 1]) * frac;
    }
    return { data: uniform, fs: targetFs, duration };
  },

  hann(n) { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = .5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))); return w; },

  // ── Frequency-domain HRV (PSD via FFT) ─────────────────────
  freqHRV(rrMs) {
    if (rrMs.length < 10) return null;
    const resamp = this.resampleRR(rrMs, 4);
    if (!resamp) return null;
    const { data, fs } = resamp;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    for (let i = 0; i < data.length; i++) data[i] -= mean;

    let N = 1; while (N < data.length) N <<= 1;
    N = Math.max(N, 256);
    const re = new Float64Array(N), im = new Float64Array(N);
    const win = this.hann(data.length);
    let winPow = 0; for (let i = 0; i < win.length; i++) winPow += win[i] * win[i];
    winPow /= win.length;
    for (let i = 0; i < data.length; i++) re[i] = data[i] * win[i];
    this.fft(re, im);

    const nFreqs = N / 2 + 1, psd = new Float64Array(nFreqs), freqs = new Float64Array(nFreqs), df = fs / N;
    for (let i = 0; i < nFreqs; i++) {
      freqs[i] = i * df;
      let p = (re[i] * re[i] + im[i] * im[i]) / (fs * N * winPow);
      if (i > 0 && i < N / 2) p *= 2;
      psd[i] = p * 1e6;
    }

    let vlf = 0, lf = 0, hf = 0, tp = 0;
    for (let i = 0; i < nFreqs; i++) {
      const f = freqs[i];
      if (f >= 0.003 && f < 0.04) vlf += psd[i] * df;
      if (f >= 0.04 && f < 0.15) lf += psd[i] * df;
      if (f >= 0.15 && f <= 0.4) hf += psd[i] * df;
      if (f >= 0.003 && f <= 0.4) tp += psd[i] * df;
    }
    const ratio = hf > 0 ? lf / hf : 0, lfhfSum = lf + hf || 1;
    return {
      lf: Math.round(lf * 10) / 10, hf: Math.round(hf * 10) / 10, vlf: Math.round(vlf * 10) / 10,
      tp: Math.round(tp * 10) / 10, ratio: Math.round(ratio * 100) / 100,
      lfNu: Math.round((lf / lfhfSum) * 100), hfNu: Math.round((hf / lfhfSum) * 100),
      psd, freqs, nFreqs
    };
  }
};
