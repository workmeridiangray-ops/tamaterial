'use strict';
// Demo data. Dates are relative to "today" so the app always has due-today, overdue and upcoming work.
const L = require('./logic');

function buildSeed() {
  const T = L.today(), Y = L.yy(), pad = L.pad, addDays = L.addDays, r2 = L.r2;
  const tests = [
    { id: 't_cube', name: 'Cube', code: 'IS 516 (Part 1/Sec 1):2021', rate: 350, nabl: true, kind: 'cube', unit: 'cube', ru: 'N/mm²' },
    { id: 't_cem', name: 'Cement compressive strength', code: 'IS 4031 (Part 6):1988', rate: 1800, nabl: true, kind: 'simple', unit: 'sample', ru: 'N/mm²' },
    { id: 't_tmt', name: 'Steel TMT tensile', code: 'IS 1786:2008', rate: 900, nabl: true, kind: 'simple', unit: 'sample', ru: 'N/mm² (UTS)' },
    { id: 't_agg', name: 'Aggregate sieve analysis', code: 'IS 2386 (Part 1):1963', rate: 1500, nabl: true, kind: 'simple', unit: 'sample', ru: '% passing 20 mm' },
    { id: 't_brk', name: 'Brick compressive strength', code: 'IS 3495 (Part 1):2019', rate: 220, nabl: true, kind: 'simple', unit: 'brick', ru: 'N/mm²' },
    { id: 't_wat', name: 'Water pH and chlorides', code: 'IS 3025 (Part 11):2022', rate: 1200, nabl: false, kind: 'simple', unit: 'sample', ru: 'pH' }];
  const users = [
    { id: 'u_admin', login: 'admin', pin: '1111', name: 'Anjali', role: 'admin', active: true },
    { id: 'u_rahul', login: 'rahul', pin: '2222', name: 'Rahul', role: 'store', active: true },
    { id: 'u_suresh', login: 'suresh', pin: '3333', name: 'Suresh', role: 'tester', active: true },
    { id: 'u_meera', login: 'meera', pin: '4444', name: 'Meera', role: 'accounts', active: true },
    { id: 'u_imran', login: 'imran', pin: '5555', name: 'Imran', role: 'tester', active: true }];
  const clients = [
    { id: 'c1', code: 'SCP-001', name: 'Shree Constructions Pvt Ltd', address: 'Plot 12, Baner Road, Pune 411045', gst: '27AABCS4521F1Z5', terms: 'Credit', creditDays: '30', contact: 'Mr. Vikram Shinde', phone: '9822011101', rates: { t_cube: '330', t_tmt: '850' } },
    { id: 'c2', code: 'DID-002', name: 'Deccan Infra Developers', address: 'Office 304, Kalyani Nagar, Pune 411006', gst: '27AAFCD7788K1Z2', terms: 'Advance', creditDays: '0', contact: 'Ms. Pooja Kulkarni', phone: '9822011102', rates: { t_cube: '340', t_brk: '200' } },
    { id: 'c3', code: 'SMW-003', name: 'Sahyadri Metro Works LLP', address: 'Survey 45, Hadapsar Industrial Estate, Pune 411013', gst: '27AAJFS3390M1Z8', terms: 'Credit', creditDays: '45', contact: 'Mr. Anil Deshpande', phone: '9822011103', rates: { t_agg: '1400' } },
    { id: 'c4', code: 'KHC-004', name: 'Kothrud Homes & Co', address: '12, Paud Road, Kothrud, Pune 411038', gst: '27AABFK1200P1Z9', terms: 'Advance', creditDays: '0', contact: 'Mrs. Sunita Joshi', phone: '9822011104', rates: { t_brk: '210' } }];
  const projects = [
    { id: 'p1', clientId: 'c1', name: 'Sky Heights – Tower B', site: 'Gat 88, Baner–Pashan Link Road, Pune' },
    { id: 'p2', clientId: 'c1', name: 'Baner Riverside Villas', site: 'Survey 21, Baner Riverfront, Pune' },
    { id: 'p3', clientId: 'c2', name: 'Hinjewadi IT Park Phase 3', site: 'Plot 9, Rajiv Gandhi Infotech Park, Hinjewadi' },
    { id: 'p4', clientId: 'c2', name: 'Wakad Mall Foundation', site: 'Datta Mandir Road, Wakad, Pune' },
    { id: 'p5', clientId: 'c3', name: 'Viaduct Pier P-18, Metro Line 3', site: 'Shivajinagar–Hinjewadi corridor, Pune' },
    { id: 'p6', clientId: 'c3', name: 'Depot Shed, Hadapsar', site: 'Hadapsar Industrial Estate, Pune' },
    { id: 'p7', clientId: 'c4', name: 'Kothrud Residency Phase 1', site: 'Paud Road, Kothrud, Pune' },
    { id: 'p8', clientId: 'c4', name: 'Karve Road Annex', site: 'Karve Road, Erandwane, Pune' }];
  const settings = { cert: 'TC0000', gst: '18', creditDays: '30' };
  const out = { users, tests, clients, projects, samples: [], jobs: [], invoices: [], payments: [], leads: [], interactions: [], tasks: [] };
  const ctx = { settings, tests, clients };

  function mk(o) {
    const c = clients.find(x => x.id === o.c), t = tests.find(x => x.id === o.t), d = {};
    if (t.kind === 'cube') Object.assign(d, { grade: o.grade, source: o.source, supplier: o.supplier || '', casting: addDays(T, -o.cast), ages: o.ages, sizes: [{ l: 150, b: 150, h: 150, n: o.n }], total: o.n });
    else Object.assign(d, { desc: o.desc, qty: o.qty, due: addDays(T, -o.r + (o.dueIn || 2)) });
    const s = { id: 's' + o.num, uid: 'UID-' + Y + '-' + pad(o.num, 6), ulr: t.nabl ? settings.cert + '-' + Y + '-' + pad(o.num, 6) + '-F' : '', receipt: addDays(T, -o.r), clientId: c.id, projectId: o.p, sampledBy: o.by || 'TechAssures', billing: c.terms, testId: t.id, mark: o.mark, d, photo: '', cond: 'Acceptable', reason: '', rep: { name: o.rep || 'Site Engineer', mobile: '98220' + pad(o.num, 5), sig: '' }, assignee: o.as, createdBy: 'u_rahul', reportStatus: o.status };
    if (o.status === 'approved' || o.status === 'sent') { s.approvedBy = 'Meera'; s.approvedOn = addDays(T, -(o.apOff || 3)); }
    if (o.status === 'sent') s.sentOn = addDays(T, -(o.apOff || 3) + 1);
    out.samples.push(s);
    if (t.kind === 'cube') {
      const rw = L.expandRows(d), per = Math.max(1, Math.ceil(d.total / d.ages.length));
      d.ages.forEach(a => {
        const j = { id: 'j' + o.num + '_' + a, sampleId: s.id, age: a, due: addDays(d.casting, a), assignee: o.as, status: 'pending', results: null, remarks: '' };
        if (o.doneAges && o.doneAges.indexOf(a) >= 0) {
          const base = a === 7 ? o.l7 : o.l28, rr = [];
          for (let k = 0; k < per; k++) { const q = rw[k % rw.length], load = base + (k * 7 - 6); rr.push({ l: q.l, b: q.b, h: q.h, load, strength: L.strength(load, q.l, q.b) }); }
          j.status = 'done'; j.results = { rows: rr, avg: r2(rr.reduce((x, y) => x + y.strength, 0) / rr.length) }; j.doneOn = j.due;
        }
        out.jobs.push(j);
      });
    } else {
      out.jobs.push({ id: 'j' + o.num, sampleId: s.id, age: null, due: d.due, assignee: o.as, status: o.val != null ? 'done' : 'pending', results: o.val != null ? { value: o.val } : null, remarks: o.rem || '', doneOn: o.val != null ? d.due : null });
    }
    const inv = L.buildInvoice(ctx, s, o.invNo);
    out.invoices.push(inv); s.invoiceId = inv.id; s.billNo = inv.no;
    if (o.paid) out.payments.push({ id: 'pay' + o.num, invoiceId: inv.id, amount: o.paid === 'full' ? inv.total : r2(inv.total * 0.5), date: addDays(s.receipt, 2), mode: 'UPI', ref: 'UPI' + (480000 + o.num) });
  }
  mk({ num: 138, r: 36, cast: 38, c: 'c1', p: 'p1', t: 't_cube', mark: 'Slab L5 – batch 12', grade: 'M30', source: 'RMC', supplier: 'Pune Ready Mix', n: 6, ages: [7, 28], doneAges: [7, 28], l7: 512, l28: 742, status: 'sent', apOff: 9, as: 'u_suresh', paid: 'full', invNo: 31, rep: 'Santosh Pawar' });
  mk({ num: 139, r: 20, cast: 22, c: 'c2', p: 'p3', t: 't_cube', mark: 'Footing F4', grade: 'M25', source: 'Site mix', n: 6, ages: [7, 14], doneAges: [7, 14], l7: 418, l28: 560, status: 'approved', apOff: 5, as: 'u_imran', paid: 'full', invNo: 32, by: 'Client', rep: 'Pooja Kulkarni' });
  mk({ num: 140, r: 6, c: 'c4', p: 'p7', t: 't_brk', mark: 'Brick lot B-17', desc: 'Red clay bricks, first class', qty: 5, val: '8.6', rem: 'Average of 5 bricks. Water absorption not in scope.', status: 'approved', apOff: 1, as: 'u_suresh', invNo: 33 });
  mk({ num: 141, r: 5, c: 'c1', p: 'p2', t: 't_tmt', mark: 'TMT Fe500D 16 mm', desc: 'TMT bar 16 mm, 3 pcs (1 m each)', qty: 3, val: '588', rem: 'Elongation 16.5%, yield 541 N/mm²', status: 'awaiting', as: 'u_suresh', paid: 'part', invNo: 34 });
  mk({ num: 142, r: 4, c: 'c3', p: 'p6', t: 't_wat', mark: 'Curing water – tank 2', desc: 'Curing water sample, 1 litre', qty: 1, val: '7.4', rem: 'Chlorides 182 mg/l', status: 'awaiting', as: 'u_imran', invNo: 35 });
  mk({ num: 143, r: 62, c: 'c3', p: 'p5', t: 't_agg', mark: '20 mm coarse aggregate', desc: 'Coarse aggregate 20 mm, 25 kg', qty: 1, val: '96.4', rem: 'Within IS 383 grading limits', status: 'sent', apOff: 50, as: 'u_suresh', invNo: 36 });
  mk({ num: 144, r: 7, cast: 7, c: 'c1', p: 'p1', t: 't_cube', mark: 'Column C12 – lift 3', grade: 'M35', source: 'RMC', supplier: 'Pune Ready Mix', n: 6, ages: [7, 28], doneAges: [], status: 'testing', as: 'u_suresh', invNo: 37, rep: 'Santosh Pawar' });
  mk({ num: 145, r: 9, cast: 9, c: 'c2', p: 'p4', t: 't_cube', mark: 'Raft R2 – pour 1', grade: 'M25', source: 'RMC', supplier: 'Deccan Mix', n: 6, ages: [7, 28], doneAges: [], status: 'testing', as: 'u_imran', invNo: 38, rep: 'Pooja Kulkarni' });

  // ---- CRM ----
  const mkLead = (id, name, contact, phone, source, stage, value, fu, notes, extra) => out.leads.push(Object.assign({ id, name, contact, phone, email: '', source, stage, value, nextFollowUp: fu, owner: 'u_meera', notes, lostReason: '', clientId: '', createdOn: addDays(T, -20), updatedOn: T }, extra || {}));
  mkLead('l1', 'Prime Realty Ventures', 'Mr. Nikhil Bapat', '9890011122', 'Referral', 'new', 85000, addDays(T, 1), 'Referred by Shree Constructions. Two towers planned at Balewadi.');
  mkLead('l2', 'Mahalaxmi Builders', 'Mr. Suhas Pawar', '9890011133', 'Website', 'contacted', 140000, addDays(T, -2), 'Asked for cube and steel testing rates for a 12-floor project.', { createdOn: addDays(T, -14) });
  mkLead('l3', 'Greenfield Precast Pvt Ltd', 'Ms. Rekha Nair', '9890011144', 'Site visit', 'quoted', 260000, addDays(T, 3), 'Quote sent for monthly cube and cement testing. Wants 45 days credit.', { createdOn: addDays(T, -30) });
  mkLead('l4', 'Tulsi Infra', 'Mr. Ganesh Tulsi', '9890011155', 'Cold call', 'quoted', 95000, addDays(T, -1), 'Comparing us with another NABL lab. Price is the main concern.', { createdOn: addDays(T, -25) });
  mkLead('l5', 'Kothrud Homes & Co', 'Mrs. Sunita Joshi', '9822011104', 'Referral', 'won', 120000, '', 'Converted. Brick and cube work for Kothrud Residency.', { clientId: 'c4', createdOn: addDays(T, -90) });
  mkLead('l6', 'Bhosari MIDC Works', 'Mr. Dilip Kale', '9890011166', 'Website', 'lost', 70000, '', 'Went with a lab closer to Bhosari.', { lostReason: 'Location', createdOn: addDays(T, -60) });
  const mkInt = (id, o) => out.interactions.push(Object.assign({ id, clientId: '', leadId: '', type: 'call', summary: '', date: T, by: 'u_meera' }, o));
  mkInt('n1', { clientId: 'c2', type: 'call', summary: 'Reminded about the advance payment for UID-' + Y + '-000145. Promised transfer by tomorrow.', date: addDays(T, -1) });
  mkInt('n2', { clientId: 'c3', type: 'email', summary: 'Sent statement. Invoice for aggregate test is past due.', date: addDays(T, -3) });
  mkInt('n3', { clientId: 'c1', type: 'visit', summary: 'Site visit at Sky Heights. They plan about 40 cubes a month for the next quarter.', date: addDays(T, -8), by: 'u_admin' });
  mkInt('n4', { clientId: 'c4', type: 'whatsapp', summary: 'Shared brick test report copy. Asked for advance on the next lot.', date: addDays(T, -5), by: 'u_rahul' });
  mkInt('n5', { leadId: 'l2', type: 'call', summary: 'Discussed scope. Will share rate card.', date: addDays(T, -6) });
  mkInt('n6', { leadId: 'l3', type: 'email', summary: 'Quote sent with 45 day credit request flagged for approval.', date: addDays(T, -4) });
  mkInt('n7', { leadId: 'l4', type: 'call', summary: 'They have a competing quote. Asked us to match.', date: addDays(T, -9) });
  mkInt('n8', { clientId: 'c3', type: 'note', summary: 'Contact changed: Mr. Anil Deshpande handles all payments now.', date: addDays(T, -15), by: 'u_admin' });
  const mkTask = (id, o) => out.tasks.push(Object.assign({ id, title: '', due: T, done: false, doneOn: '', assignee: 'u_meera', clientId: '', leadId: '' }, o));
  mkTask('k1', { title: 'Follow up on overdue aggregate invoice', due: addDays(T, -2), clientId: 'c3' });
  mkTask('k2', { title: 'Chase advance for UID-' + Y + '-000145', due: T, clientId: 'c2' });
  mkTask('k3', { title: 'Send rate card to Mahalaxmi Builders', due: addDays(T, -2), leadId: 'l2' });
  mkTask('k4', { title: 'Call Greenfield about credit terms', due: addDays(T, 3), leadId: 'l3' });
  mkTask('k5', { title: 'Quarterly review visit at Sky Heights', due: addDays(T, 14), clientId: 'c1', assignee: 'u_admin' });
  mkTask('k6', { title: 'Thank-you call after report delivery', due: addDays(T, -5), done: true, doneOn: addDays(T, -5), clientId: 'c1' });

  return { records: out, settings, counters: { uid: 146, inv: 39 } };
}

module.exports = { buildSeed };
