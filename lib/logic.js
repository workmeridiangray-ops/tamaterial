'use strict';
// Pure business rules shared by the seed and the API. No I/O here.

const pad = (n, l) => String(n).padStart(l, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
const today = () => iso(new Date());
const addDays = (s, n) => { const p = s.split('-').map(Number); return iso(new Date(p[0], p[1] - 1, p[2] + n)); };
const r2 = n => Math.round((+n + Number.EPSILON) * 100) / 100;
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? NaN : n; };
const yy = () => today().slice(2, 4);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

function rateFor(client, test) {
  const v = client && client.rates ? client.rates[test.id] : '';
  return (v !== '' && v != null && !isNaN(+v)) ? +v : +test.rate;
}
// Which rate applies on a date: the client's active work order first, then the client's own rate, then the standard rate.
function rateInfo(ctx, client, test, on) {
  on = on || today();
  const wos = ((ctx && ctx.workorders) || []).filter(w => client && w.clientId === client.id && w.status !== 'closed' && (!w.date || w.date <= on) && (!w.validTill || w.validTill >= on))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const w of wos) { const v = w.rates && w.rates[test.id]; if (v !== '' && v != null && !isNaN(+v)) return { rate: +v, src: 'wo', woNo: w.no, woId: w.id }; }
  const v = client && client.rates ? client.rates[test.id] : '';
  if (v !== '' && v != null && !isNaN(+v)) return { rate: +v, src: 'client' };
  return { rate: +test.rate, src: 'standard' };
}
const qtyOf = (s, t) => t.kind === 'cube' ? (s.d.total || 0) : (+s.d.qty || 0);

function expandRows(d) {
  const o = [];
  (d.sizes || []).forEach(s => { for (let i = 0; i < (+s.n || 0); i++) o.push({ l: +s.l, b: +s.b, h: +s.h }); });
  return o.length ? o : [{ l: 150, b: 150, h: 150 }];
}
// N/mm2 = load(kN) x 1000 / (L x B)
const strength = (loadKn, l, b) => r2(loadKn * 1000 / (l * b));

// Builds (does not store) the invoice for a sample.
function buildInvoice(ctx, s, invNo, on) {
  const c = ctx.clients.find(x => x.id === s.clientId);
  const t = ctx.tests.find(x => x.id === s.testId);
  const ri = rateInfo(ctx, c, t, on || s.receipt), rate = ri.rate, qty = qtyOf(s, t), sub = r2(rate * qty);
  const gp = num(ctx.settings.gst), gstPct = isNaN(gp) ? 18 : gp;
  const gst = r2(sub * gstPct / 100);
  const days = parseInt(c.creditDays, 10) || parseInt(ctx.settings.creditDays, 10) || 30;
  const due = s.billing === 'Advance' ? s.receipt : addDays(s.receipt, days);
  return {
    id: 'i' + s.id.slice(1), no: 'INV-' + s.receipt.slice(2, 4) + '-' + pad(invNo, 4), sampleId: s.id, clientId: c.id,
    date: s.receipt, due, lines: [{ desc: t.name + ' (' + t.code + ')', qty, unit: t.unit, rate, amount: sub, rateSrc: ri.src, woNo: ri.woNo || '' }],
    subtotal: sub, gstPct, gst, total: r2(sub + gst)
  };
}

// Automatic checks shown to the reviewer. jobs = this sample's jobs, t = the test definition.
const TEMP_MID = 27, TEMP_TOL = 2, SPREAD_MAX = 15;
function reviewChecks(s, jobs, t) {
  const done = jobs.filter(j => j.status === 'done' && j.results);
  const out = [];
  if (t.kind !== 'cube') {
    out.push({ id: 'result', ok: done.length > 0 && done.length === jobs.length, title: 'Result entered', note: done.length + ' of ' + jobs.length + ' test(s) have a result' });
    return out;
  }
  let calcOk = true, rows = 0, worst = 0, photos = 0, calBad = [], tempBad = [], testDate = '';
  done.forEach(j => {
    const rs = j.results.rows || [];
    rs.forEach(r => { rows++; if (r.strength !== strength(r.load, r.l, r.b)) calcOk = false; if (r.photo) photos++; });
    const avg = rs.reduce((a, r) => a + r.strength, 0) / (rs.length || 1);
    rs.forEach(r => { if (avg > 0) worst = Math.max(worst, Math.abs(r.strength - avg) / avg * 100); });
    const su = j.setup || {}, td = j.doneOn || j.due; testDate = td;
    if (!su.calDate || !isDate(su.calDate) || su.calDate > td || addDays(su.calDate, 365) <= td) calBad.push(j.age + '-day');
    const tmp = num(su.temp); if (isNaN(tmp) || Math.abs(tmp - TEMP_MID) > TEMP_TOL) tempBad.push(j.age + '-day');
  });
  const su0 = (done[0] && done[0].setup) || {};
  out.push({ id: 'calc', ok: calcOk && rows > 0, title: 'Calculation checked', note: 'Area = L × B, strength = P × 1000 ÷ A for all ' + rows + ' cube' + (rows === 1 ? '' : 's') });
  out.push({ id: 'spread', ok: worst <= SPREAD_MAX, title: 'Cubes within ±' + SPREAD_MAX + '% of average', note: 'Largest difference ' + r2(worst) + '%' });
  out.push({ id: 'machine', ok: !calBad.length && done.length > 0, title: 'Machine calibration valid', note: calBad.length ? 'Check calibration for the ' + calBad.join(', ') + ' test' : (su0.machine || 'Machine') + ', valid till ' + (su0.calDate ? addDays(su0.calDate, 364) : '—') });
  out.push({ id: 'temp', ok: !tempBad.length && done.length > 0, title: 'Lab temperature in range', note: tempBad.length ? 'Outside ' + TEMP_MID + ' ± ' + TEMP_TOL + ' °C for the ' + tempBad.join(', ') + ' test' : (su0.temp != null ? su0.temp : '—') + ' °C (' + TEMP_MID + ' ± ' + TEMP_TOL + ' °C)' });
  out.push({ id: 'photos', ok: rows > 0 && photos === rows, title: 'Photos attached', note: photos + ' of ' + rows + ' cubes' });
  return out;
}

module.exports = { reviewChecks, TEMP_MID, TEMP_TOL, pad, iso, today, addDays, r2, num, yy, isDate, rateFor, rateInfo, qtyOf, expandRows, strength, buildInvoice };
