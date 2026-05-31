// PORT-PARITET-check (offline): kör webbens capture-pipeline på en RIKTIG twachain-CSV,
// skriv ut den exakta rri-listan (= deep-link-payloaden) + webbens D.hrv på den. Den
// listan matas sen IN i native HRVMetrics.compute (DeepLinkPayloadParityTest) och vi
// jämför — bevisar att native = enda compute-vägen ger SAMMA svar som webben (ingen
// "två svar"-risk) UTAN att behöva en telefon.  Användning: node _parity_check.mjs <csv>
import { D } from './js/dsp.js';
import { readFileSync } from 'fs';

function loadCsv(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  let ti = -1, ri = -1, gi = -1, bi = -1; const R = [], G = [], B = [], T = [];
  for (const raw of lines) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    if (line.startsWith('t_ms')) {
      const c = line.split(','); ti = c.indexOf('t_ms');
      ri = c.findIndex(x => x.toUpperCase() === 'R'); gi = c.findIndex(x => x.toUpperCase() === 'G'); bi = c.findIndex(x => x.toUpperCase() === 'B');
      continue;
    }
    const p = line.split(','); if (p.length <= Math.max(ti, ri, gi, bi)) continue;
    T.push(+p[ti]); R.push(+p[ri]); G.push(+p[gi]); B.push(+p[bi]);
  }
  return { T, R, G, B };
}

const path = process.argv[2];
const { T, R, G, B } = loadCsv(path); const n = R.length;
const fps = (n - 1) / ((T[n - 1] - T[0]) / 1000);
// EXAKT samma som _twacap_real.html tick() / app.js
const combined = new Float64Array(n); for (let i = 0; i < n; i++) combined[i] = R[i] * 0.4 + G[i] * 0.6;
const detr = D.detrend(combined, 2, fps); const co = D.bp4(fps, 0.5, 4); const flt = Array.from(D.ff(detr, co));
const motion = D.detectMotion(B, fps, 0.5); const pks = D.fp(flt, Math.round(fps * 0.45));
const sqi = D.sq(flt, pks, fps); const rri = D.extractRRI(flt, pks, T, sqi, motion);
const rriRound = rri.map(x => Math.round(x));            // = exakt vad deep-linken bär (heltal)

console.log(`# ${path}  fps=${fps.toFixed(1)}  extractRRI=${rri.length}  cleanRR=${D.cleanRR(rri).length}`);
console.log('RRI=' + rriRound.join(','));
console.log('WEB_HRV_unrounded = ' + JSON.stringify(D.hrv(rri)));
console.log('WEB_HRV_rounded   = ' + JSON.stringify(D.hrv(rriRound)));
