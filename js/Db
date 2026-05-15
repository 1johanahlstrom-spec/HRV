// ═══════════════════════════════════════════════════════════════
// HISTORY & TREND DATABASE
// ═══════════════════════════════════════════════════════════════

import { drawTrend } from './draw.js';

const DB_KEY = 'hrv_history';

export function dbLoad() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || []; } catch (e) { return []; }
}

function dbSave(entries) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(entries.slice(-100))); } catch (e) {}
}

export function dbAdd(entry) {
  const h = dbLoad(); h.push(entry); dbSave(h);
}

export function dbClear() {
  if (confirm('Radera all historik?')) { localStorage.removeItem(DB_KEY); renderHistory(); }
}

export function exportCSV() {
  const entries = dbLoad();
  if (!entries.length) { alert('Ingen data att exportera.'); return; }
  const headers = ['Datum', 'Tid', 'Morgon', 'RMSSD (ms)', 'SDNN (ms)', 'BPM', 'pNN50 (%)', 'Medel RR (ms)', 'LF (ms²)', 'HF (ms²)', 'LF/HF', 'SQI', 'Längd (s)', 'R-R antal'];
  const rows = entries.map(e => [
    e.date, e.time, e.hour >= 6 && e.hour <= 9 ? 'Ja' : 'Nej',
    e.rmssd, e.sdnn, e.bpm, e.pnn50, e.meanRR,
    e.lf != null ? e.lf : '', e.hf != null ? e.hf : '', e.lfhf != null ? e.lfhf : '',
    e.sqi, e.dur, e.count
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'hrv-historik-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

export function saveMeasurement(hrvData, frData, sqiVal, durSec) {
  if (!hrvData) return;
  const now = new Date();
  dbAdd({
    ts: now.toISOString(),
    date: now.toLocaleDateString('sv-SE'),
    time: now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
    hour: now.getHours(),
    rmssd: hrvData.rmssd, sdnn: hrvData.sdnn, bpm: hrvData.bpm,
    pnn50: hrvData.pnn50, meanRR: hrvData.meanRR,
    lf: frData ? frData.lf : null, hf: frData ? frData.hf : null, lfhf: frData ? frData.ratio : null,
    sqi: sqiVal, dur: durSec, count: hrvData.count
  });
}

export function renderHistory() {
  const entries = dbLoad();
  const el = document.getElementById('HIST');
  const trend = document.getElementById('TREND');

  if (!entries.length) {
    el.innerHTML = '<div class="hist-empty">Inga mätningar sparade ännu</div>';
    trend.classList.add('hide');
    return;
  }

  const recent = entries.slice(-7).reverse();
  let html = `<div class="hist-title"><span>📊 Senaste mätningar</span><div><button class="hist-clear" style="color:#00b4d8;margin-right:8px" onclick="exportCSV()">📥 Exportera</button><button class="hist-clear" onclick="dbClear()">Rensa</button></div></div>`;
  recent.forEach(e => {
    const isMorning = e.hour >= 6 && e.hour <= 9;
    html += `<div class="hist-row">
      <div><span class="hist-date">${e.date} ${e.time}</span>${isMorning ? '<span class="hist-morning">☀ morgon</span>' : ''}</div>
      <div style="text-align:right"><span class="hist-val">${e.rmssd}</span> <span class="hist-sub">RMSSD</span><br>
      <span style="color:#8a9098;font-size:10px">${e.bpm} bpm · ${e.sdnn} sdnn${e.lfhf != null ? ' · ' + e.lfhf + ' LF/HF' : ''}</span></div>
    </div>`;
  });
  el.innerHTML = html;

  if (entries.length >= 2) {
    trend.classList.remove('hide');
    requestAnimationFrame(() => drawTrend('TCHART', entries));
  } else {
    trend.classList.add('hide');
  }
}