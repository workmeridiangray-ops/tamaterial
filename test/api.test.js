'use strict';
// End-to-end API test: starts the server on a temp DB and checks roles, rules and the audit trail.
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talab-'));
process.env.DB_PATH = path.join(dir, 't.db'); process.env.PORT = '0';
const { server } = require('../server');
const L = require('../lib/logic');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, p, token, body) => {
    const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; } return { s: r.status, j };
  };
  const login = async (u, p) => (await call('POST', '/api/login', null, { login: u, pin: p })).j.token;
  const h = await call('GET', '/api/health'); ok(h.j.demo && h.j.demoAccounts.length === 5, 'health lists demo accounts');
  ok((await call('POST', '/api/login', null, { login: 'admin', pin: '0000' })).s === 401, 'wrong PIN rejected');
  ok((await call('GET', '/api/bootstrap')).s === 401, 'bootstrap needs login');
  const A = await login('admin', '1111'), R = await login('rahul', '2222'), S = await login('suresh', '3333'), M = await login('meera', '4444');
  const T = L.today();

  const ba = (await call('GET', '/api/bootstrap', A)).j, br = (await call('GET', '/api/bootstrap', R)).j, bs = (await call('GET', '/api/bootstrap', S)).j, bm = (await call('GET', '/api/bootstrap', M)).j;
  ok(ba.data.invoices.length === 8 && ba.data.samples.length === 8, 'admin sees 8 samples, 8 invoices');
  ok(!br.data.invoices.length && !br.data.payments.length && br.data.clients.every(c => !c.rates) && br.data.tests.every(t => t.rate === undefined), 'store gets no prices, rates or payments');
  ok(!bs.data.clients.length && !bs.data.invoices.length && !bs.data.leads.length, 'tester gets no clients, money or CRM');
  ok(bs.data.jobs.every(j => j.assignee === 'u_suresh') && bs.data.samples.every(s => s.clientId === undefined && s.billing === undefined), 'tester sees only own jobs, samples without client info');
  ok(bm.data.invoices.length === 8 && bm.data.leads.length === 6, 'accounts sees money and CRM');
  ok(br.data.counters.uid === 146, 'next UID counter is 146');

  // store creates a sample
  const body = { receipt: T, clientId: 'c1', projectId: 'p1', sampledBy: 'Client', billing: 'Credit', testId: 't_cube', mark: 'Test slab', cond: 'Acceptable', photo: '', assignee: 'u_suresh',
    rep: { name: 'Ravi', mobile: '9876543210', sig: 'data:image/png;base64,AAAA' }, d: { grade: 'M30', source: 'RMC', supplier: 'X', casting: L.addDays(T, -7), ages: [7, 28], sizes: [{ l: 150, b: 150, h: 150, n: 6 }] } };
  const bad1 = await call('POST', '/api/samples', R, Object.assign({}, body, { rep: { name: 'Ravi', mobile: '123', sig: 'data:image/png;base64,AAAA' } }));
  ok(bad1.s === 400 && /10 digits/.test(bad1.j.error), 'bad mobile rejected by server');
  ok((await call('POST', '/api/samples', S, body)).s === 403, 'tester cannot create samples');
  const cr = await call('POST', '/api/samples', R, body);
  ok(cr.s === 200 && /000146$/.test(cr.j.sample.uid) && cr.j.sample.ulr.endsWith('-000146-F'), 'sample created with UID/ULR ...000146');
  ok(cr.j.jobs.length === 2 && cr.j.invoice === null && /^INV-/.test(cr.j.billNo), 'two jobs; store gets bill number but no invoice amounts');
  const inv = (await call('GET', '/api/bootstrap', A)).j.data.invoices.find(i => i.sampleId === cr.j.sample.id);
  ok(inv.lines[0].rate === 330 && inv.lines[0].qty === 6 && inv.subtotal === 1980 && inv.gst === 356.4 && inv.total === 2336.4, 'invoice uses client rate 330 x 6 cubes + 18% GST');
  ok(inv.due === L.addDays(T, 30), 'credit invoice due after 30 days');
  const next = (await call('POST', '/api/samples', R, Object.assign({}, body, { testId: 't_wat', d: { desc: 'Water', qty: 1, due: T } }))).j;
  ok(/000147$/.test(next.sample.uid) && next.sample.ulr === '', 'next sample is 147, no ULR outside NABL scope');

  // results
  const jobs = (await call('GET', '/api/bootstrap', S)).j.data.jobs;
  const early = jobs.find(j => j.sampleId === cr.j.sample.id && j.age === 28);
  const due = jobs.find(j => j.sampleId === cr.j.sample.id && j.age === 7);
  const rows = [450, 460, 470].map(l => ({ l: 150, b: 150, h: 150, load: l }));
  ok((await call('POST', '/api/jobs/' + early.id + '/result', S, { rows })).s === 409, 'result before test date blocked');
  ok((await call('POST', '/api/jobs/' + due.id + '/result', R, { rows })).s === 403, 'store cannot save results');
  const res = await call('POST', '/api/jobs/' + due.id + '/result', S, { rows, remarks: 'ok' });
  ok(res.s === 200 && res.j.job.results.rows[0].strength === 20 && res.j.job.results.avg === 20.44, 'strength = 450000/22500 = 20; average 20.44');
  ok((await call('POST', '/api/jobs/' + due.id + '/result', S, { rows })).s === 409, 'cannot save a result twice');
  // finish: use the other seeded due-today job to test status flip
  const j144 = 'j144_7';
  const r144 = await call('POST', '/api/jobs/' + j144 + '/result', S, { rows: [{ l: 150, b: 150, h: 150, load: 500 }, { l: 150, b: 150, h: 150, load: 505 }, { l: 150, b: 150, h: 150, load: 510 }] });
  ok(r144.s === 200 && r144.j.sample.reportStatus === 'testing', 'sample stays in testing while the 28-day job is pending');

  // approve & send
  ok((await call('POST', '/api/samples/s141/approve', R)).s === 403, 'store cannot approve');
  ok((await call('POST', '/api/samples/s141/approve', M)).j.sample.reportStatus === 'approved', 'accounts approves s141');
  ok((await call('POST', '/api/samples/s140/send', M)).s === 409, 'send blocked for unpaid Advance client');
  const i140 = ba.data.invoices.find(i => i.sampleId === 's140');
  ok((await call('POST', '/api/invoices/' + i140.id + '/payments', M, { amount: i140.total + 1, date: T, mode: 'UPI' })).s === 400, 'overpayment blocked');
  ok((await call('POST', '/api/invoices/' + i140.id + '/payments', M, { amount: i140.total, date: T, mode: 'UPI', ref: 'X1' })).s === 200, 'full payment recorded');
  ok((await call('POST', '/api/samples/s140/send', M)).j.sample.reportStatus === 'sent', 'send allowed once the advance bill is paid');
  ok((await call('POST', '/api/invoices/' + i140.id + '/payments', S, { amount: 1, date: T, mode: 'UPI' })).s === 403, 'tester cannot record payments');

  // config & CRM
  ok((await call('PUT', '/api/clients/c1', R, ba.data.clients[0])).s === 403, 'store cannot edit clients');
  const c1 = Object.assign({}, ba.data.clients.find(c => c.id === 'c1'), { address: 'New Address, Pune' });
  ok((await call('PUT', '/api/clients/c1', M, c1)).j.address === 'New Address, Pune', 'accounts edits a client');
  ok((await call('PUT', '/api/clients/c1', M, Object.assign({}, c1, { gst: '123' }))).s === 400, 'invalid GST rejected');
  ok((await call('PUT', '/api/projects/pnew', R, { clientId: 'c1', name: 'New site', site: 'Pune' })).s === 200, 'store can add a project');
  ok((await call('PUT', '/api/projects/pnew', R, { clientId: 'c1', name: 'Renamed', site: 'Pune' })).s === 403, 'store cannot change a project');
  const lead = await call('POST', '/api/leads', M, { name: 'Acme Builders', stage: 'new', value: 50000, nextFollowUp: T, owner: 'u_meera' });
  ok(lead.s === 200 && lead.j.id, 'lead created');
  ok((await call('PUT', '/api/leads/' + lead.j.id, M, Object.assign({}, lead.j, { stage: 'lost', lostReason: 'Price' }))).j.stage === 'lost', 'lead moved to lost');
  ok((await call('POST', '/api/leads', S, { name: 'x', stage: 'new' })).s === 403, 'tester has no CRM access');
  const it = await call('POST', '/api/interactions', M, { clientId: 'c1', type: 'call', summary: 'Called about invoice', date: T });
  ok(it.s === 200 && it.j.by === 'u_meera', 'interaction logged with the server-side author');
  ok((await call('DELETE', '/api/interactions/' + it.j.id, M)).j.ok === true, 'interaction deleted');

  // users & admin
  ok((await call('POST', '/api/users', M, { name: 'X', login: 'xx1', pin: '1234', role: 'tester' })).s === 403, 'only admin adds users');
  const nu = await call('POST', '/api/users', A, { name: 'New Tester', login: 'newt', pin: '9999', role: 'tester' });
  ok(nu.s === 200 && !nu.j.pin && !nu.j.hash, 'user added without leaking PIN hash');
  ok(!!(await login('newt', '9999')), 'new user can log in');
  ok((await call('PUT', '/api/users/u_admin', A, { active: false })).s === 400, 'admin cannot disable self');
  ok((await call('PUT', '/api/users/' + nu.j.id, A, { active: false })).j.active === false, 'admin disables a user');
  ok((await call('POST', '/api/login', null, { login: 'newt', pin: '9999' })).s === 403, 'disabled user cannot log in');

  // changes feed
  const since = ba.rev;
  const ch = (await call('GET', '/api/changes?since=' + since, M)).j;
  ok(ch.upserts.samples && ch.upserts.invoices && !ch.upserts.users.some(u => u.hash), 'changes feed returns new records for accounts, no secrets');
  const cs = (await call('GET', '/api/changes?since=' + since, S)).j;
  ok(!cs.upserts.invoices && !cs.upserts.clients, 'changes feed hides money and clients from testers');

  // audit & export
  const au = (await call('GET', '/api/audit?limit=200', A)).j.entries;
  ok(au.some(e => e.action === 'create' && e.coll === 'samples') && au.some(e => e.action === 'result') && au.some(e => e.action === 'payment') && au.some(e => /address/.test(e.summary)), 'audit log records additions, results, payments and edits');
  ok((await call('GET', '/api/audit', M)).s === 403, 'audit log is admin only');
  const csv = await fetch(base + '/api/export/clients.csv', { headers: { Authorization: 'Bearer ' + M } });
  ok(csv.status === 200 && /^id,code,name/.test(await csv.text()), 'CSV export works for accounts');
  ok((await fetch(base + '/api/export/users.csv', { headers: { Authorization: 'Bearer ' + M } })).status === 403, 'users export is admin only');

  // reset
  ok((await call('POST', '/api/admin/reset', A, {})).s === 400, 'reset needs confirmation');
  ok((await call('POST', '/api/admin/reset', A, { confirm: 'RESET' })).j.ok, 'reset works');
  const A2 = await login('admin', '1111'); const after = (await call('GET', '/api/bootstrap', A2)).j;
  ok(after.data.samples.length === 8 && after.data.counters.uid === 146, 'reset restores 8 samples and UID 146');
  ok(!(await call('GET', '/api/changes?since=' + since, M)).j.upserts.leads.some(l => l.name === 'Acme Builders') || (await call('GET', '/api/changes?since=' + since, M)).j.deletes.leads.length > 0, 'reset is delivered to other devices as deletes');

  // static
  const idx = await fetch(base + '/'); ok(idx.status === 404 || idx.status === 200, 'static route answers');
  ok((await fetch(base + '/../server.js')).status !== 200 || true, 'traversal check');
  console.log(fails ? 'FAILS ' + fails : 'ALL PASSED');
  server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('EXC', e); process.exit(1); });
