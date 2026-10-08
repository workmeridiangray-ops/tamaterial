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
const qtyOf = (s, t) => t.kind === 'cube' ? (s.d.total || 0) : (+s.d.qty || 0);

function expandRows(d) {
  const o = [];
  (d.sizes || []).forEach(s => { for (let i = 0; i < (+s.n || 0); i++) o.push({ l: +s.l, b: +s.b, h: +s.h }); });
  return o.length ? o : [{ l: 150, b: 150, h: 150 }];
}
// N/mm2 = load(kN) x 1000 / (L x B)
const strength = (loadKn, l, b) => r2(loadKn * 1000 / (l * b));

// Builds (does not store) the invoice for a sample.
function buildInvoice(ctx, s, invNo) {
  const c = ctx.clients.find(x => x.id === s.clientId);
  const t = ctx.tests.find(x => x.id === s.testId);
  const rate = rateFor(c, t), qty = qtyOf(s, t), sub = r2(rate * qty);
  const gp = num(ctx.settings.gst), gstPct = isNaN(gp) ? 18 : gp;
  const gst = r2(sub * gstPct / 100);
  const days = parseInt(c.creditDays, 10) || parseInt(ctx.settings.creditDays, 10) || 30;
  const due = s.billing === 'Advance' ? s.receipt : addDays(s.receipt, days);
  return {
    id: 'i' + s.id.slice(1), no: 'INV-' + s.receipt.slice(2, 4) + '-' + pad(invNo, 4), sampleId: s.id, clientId: c.id,
    date: s.receipt, due, lines: [{ desc: t.name + ' (' + t.code + ')', qty, unit: t.unit, rate, amount: sub }],
    subtotal: sub, gstPct, gst, total: r2(sub + gst)
  };
}

module.exports = { pad, iso, today, addDays, r2, num, yy, isDate, rateFor, qtyOf, expandRows, strength, buildInvoice };
