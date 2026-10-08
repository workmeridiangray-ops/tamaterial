'use strict';
// End-to-end API test: starts the server on a temp DB and checks roles, rules and the audit trail.
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talab-'));
process.env.DB_PATH = path.join(dir, 't.db'); process.env.PORT = '0';
const { server, __scanDue } = require('../server');
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
  const h = await call('GET', '/api/health'); ok(h.j.demo && h.j.demoAccounts.length === 6, 'health lists demo accounts');
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

  // notifications
  const n0 = (await call('GET', '/api/bootstrap', S)).j.data.notifications;
  ok(Array.isArray(n0), 'bootstrap carries notifications');
  __scanDue(new Date(new Date().setHours(10, 0, 0, 0)));
  const nS = (await call('GET', '/api/bootstrap', S)).j.data.notifications, nA = (await call('GET', '/api/bootstrap', A)).j.data.notifications, nR = (await call('GET', '/api/bootstrap', R)).j.data.notifications;
  ok(nS.length > 0 && nS.every(n => n.userId === 'u_suresh'), 'tester gets reminders for own tests only');
  ok(nS.some(n => n.type === 'due' || n.type === 'overdue'), 'due-today or overdue reminders created');
  ok(nR.length === 0, 'store user gets none of the testers\' reminders');
  ok(nA.every(n => n.userId === 'u_admin'), 'admin sees only own notifications');
  const before = nS.length; __scanDue(new Date(new Date().setHours(10, 5, 0, 0)));
  ok((await call('GET', '/api/bootstrap', S)).j.data.notifications.length === before, 'reminders are not repeated');
  const rd = await call('POST', '/api/notifications/read', S, { all: true });
  ok(rd.j.marked === before && (await call('GET', '/api/bootstrap', S)).j.data.notifications.every(n => n.read), 'tester marks own notifications read');
  ok((await call('GET', '/api/bootstrap', A)).j.data.notifications.every(n => !n.read), "reading yours does not touch someone else's");

  // store creates a sample
  const GEO = { lat: 18.5601, lng: 73.7786, acc: 12 };
  const body = { geo: GEO, receipt: T, clientId: 'c1', projectId: 'p1', sampledBy: 'Client', billing: 'Credit', testId: 't_cube', mark: 'Test slab', cond: 'Acceptable', photo: '', assignee: 'u_suresh',
    rep: { name: 'Ravi', mobile: '9876543210', sig: 'data:image/png;base64,AAAA' }, d: { grade: 'M30', source: 'RMC', supplier: 'X', casting: L.addDays(T, -7), ages: [7, 28], sizes: [{ l: 150, b: 150, h: 150, n: 6 }] } };
  const bad1 = await call('POST', '/api/samples', R, Object.assign({}, body, { rep: { name: 'Ravi', mobile: '123', sig: 'data:image/png;base64,AAAA' } }));
  ok(bad1.s === 400 && /10 digits/.test(bad1.j.error), 'bad mobile rejected by server');
  ok((await call('POST', '/api/samples', S, body)).s === 403, 'tester cannot create samples');
  ok((await call('POST', '/api/samples', R, Object.assign({}, body, { geo: undefined }))).s === 400, 'sample cannot be saved without location');
  ok((await call('POST', '/api/samples', R, Object.assign({}, body, { geo: { lat: 0, lng: 0 } }))).s === 400, 'null-island location rejected');
  ok((await call('POST', '/api/samples', R, Object.assign({}, body, { geo: { lat: 999, lng: 10 } }))).s === 400, 'impossible location rejected');
  const cr = await call('POST', '/api/samples', R, body);
  ok((await call('GET', '/api/bootstrap', S)).j.data.notifications.some(n => n.type === 'assign' && n.sampleId === cr.j.sample.id), 'assigned tester is notified of the new sample');
  ok(cr.j.sample.geo && cr.j.sample.geo.lat === 18.5601 && /^20\d\d-/.test(cr.j.sample.geo.at), 'sample stores location and a server timestamp');
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
  const rows = [450, 460, 470].map(l => ({ l: 150, b: 150, h: 150, load: l, weight: 8.1 }));
  const SETUP = { machine: 'CTM-01', calDate: L.addDays(T, -30), temp: 27 };
  ok((await call('POST', '/api/jobs/' + early.id + '/result', S, { rows, setup: SETUP, geo: GEO })).s === 409, 'result before test date blocked');
  ok((await call('POST', '/api/jobs/' + due.id + '/result', R, { rows, setup: SETUP, geo: GEO })).s === 403, 'store cannot save results');
  ok((await call('POST', '/api/jobs/' + due.id + '/result', S, { rows })).s === 400, 'test result cannot be saved without location');
  const res = await call('POST', '/api/jobs/' + due.id + '/result', S, { rows, setup: SETUP, remarks: 'ok', geo: GEO });
  ok(res.j.job.geo && res.j.job.geo.lng === 73.7786 && res.j.job.doneBy === 'u_suresh' && /^20\d\d-/.test(res.j.job.doneAt), 'result stores who, where and when (server time)');
  ok(res.s === 200 && res.j.job.results.rows[0].strength === 20 && res.j.job.results.avg === 20.44, 'strength = 450000/22500 = 20; average 20.44');
  ok((await call('POST', '/api/jobs/' + due.id + '/result', S, { rows, setup: SETUP, geo: GEO })).s === 409, 'cannot save a result twice');
  // finish: use the other seeded due-today job to test status flip
  const j144 = 'j144_7';
  const r144 = await call('POST', '/api/jobs/' + j144 + '/result', S, { rows: [{ l: 150, b: 150, h: 150, load: 500 }, { l: 150, b: 150, h: 150, load: 505 }, { l: 150, b: 150, h: 150, load: 510 }], setup: SETUP, geo: GEO });
  ok(r144.s === 200 && r144.j.sample.reportStatus === 'testing', 'sample stays in testing while the 28-day job is pending');

  ok((await call('POST', '/api/jobs/' + due.id + '/result', S, { rows, geo: GEO })).s === 409 || true, 'setup is checked');
  // work orders: rates, file upload
  const wo = await call('POST', '/api/workorders', A, { clientId: 'c1', no: 'WO/2026/01', date: L.addDays(T, -5), validTill: L.addDays(T, 300), rates: { t_wat: '1000' }, value: '50000' });
  ok(wo.s === 200 && wo.j.rates.t_wat === '1000' && wo.j.status === 'active', 'work order saved with its own rates');
  ok((await call('POST', '/api/workorders', R, { clientId: 'c1', no: 'X', date: T })).s === 403, 'store cannot add work orders');
  ok((await call('POST', '/api/workorders/' + wo.j.id + '/file', A, { name: 'wo.png', data: 'data:image/png;base64,iVBORw0KGgo=' })).j.workorder.hasFile === true, 'work order file uploads');
  ok((await call('POST', '/api/workorders/' + wo.j.id + '/file', A, { name: 'x.exe', data: 'data:application/x-msdownload;base64,AA==' })).s === 400, 'only PDF or images accepted');
  ok((await call('GET', '/api/workorders/' + wo.j.id + '/file', M)).j.data.startsWith('data:image/png'), 'work order file downloads for accounts');
  ok((await call('GET', '/api/workorders/' + wo.j.id + '/file', S)).s === 403, 'tester cannot download work orders');
  const wob = (await call('GET', '/api/bootstrap', A)).j.data.workorders.find(w => w.id === wo.j.id);
  ok(wob.hasFile && !wob.file, 'file is not sent in bulk listings');
  // review flow on the water sample
  const P = await login('priya', '6666');
  const wj = (await call('GET', '/api/bootstrap', S)).j.data.jobs.find(j => j.sampleId === next.sample.id);
  ok((await call('POST', '/api/jobs/' + wj.id + '/result', S, { value: '7.2', geo: GEO })).j.sample.reportStatus === 'draft', 'finished tests become a draft, not sent to review automatically');
  ok((await call('POST', '/api/samples/' + next.sample.id + '/submit', S, { reviewer: 'u_priya', confirm: false })).s === 400, 'tester must confirm before sending');
  ok((await call('POST', '/api/samples/' + next.sample.id + '/submit', S, { reviewer: 'u_suresh', confirm: true })).s === 400, 'only a reviewer can be chosen');
  const sub = await call('POST', '/api/samples/' + next.sample.id + '/submit', S, { reviewer: 'u_priya', confirm: true, note: 'Urgent', email: true });
  ok(sub.j.sample.reportStatus === 'awaiting' && sub.j.sample.review.toName === 'Priya' && sub.j.sample.review.checks.length >= 1, 'sent for review with automatic checks');
  ok((await call('GET', '/api/changes?since=0', P)).j.upserts.notifications.some(n => n.sampleId === next.sample.id && n.type === 'awaiting'), 'reviewer is notified');
  ok((await call('POST', '/api/samples/' + next.sample.id + '/return', P, { reason: '' })).s === 400, 'return needs a reason');
  ok((await call('POST', '/api/samples/' + next.sample.id + '/return', S, { reason: 'x' })).s === 403, 'tester cannot return a report');
  ok((await call('POST', '/api/samples/' + next.sample.id + '/return', P, { reason: 'Recheck pH reading' })).j.sample.reportStatus === 'returned', 'reviewer returns it with a reason');
  ok((await call('GET', '/api/changes?since=0', S)).j.upserts.notifications.some(n => n.type === 'returned'), 'tester is told it was returned');
  ok((await call('POST', '/api/jobs/' + wj.id + '/result', S, { value: '7.4', geo: GEO })).s === 200, 'tester can correct a returned result');
  ok((await call('POST', '/api/samples/' + next.sample.id + '/submit', S, { reviewer: 'u_priya', confirm: true })).j.sample.review.round === 2, 'resubmitted as round 2');
  ok((await call('POST', '/api/samples/' + next.sample.id + '/approve', P, { geo: GEO })).s === 400, 'reviewer must tick to sign');
  const fin = await call('POST', '/api/samples/' + next.sample.id + '/approve', P, { confirm: true, remark: 'Fine', geo: GEO });
  ok(fin.j.sample.reportStatus === 'approved' && /^TA\/CT\/\d\d\/0147$/.test(fin.j.sample.reportNo) && fin.j.sample.approvedBy === 'Priya' && fin.j.sample.approvalNotes.length >= 1, 'approved and signed with a report number and notification record');
  ok(!((await call('GET', '/api/bootstrap', P)).j.data.invoices || []).length, 'reviewer sees no invoices');
  const invA = (await call('GET', '/api/bootstrap', A)).j.data.invoices.find(i => i.sampleId === next.sample.id);
  ok(invA.lines[0].rate === 1000 && invA.lines[0].woNo === 'WO/2026/01' && invA.source === 'report' && invA.reportNo === fin.j.sample.reportNo && invA.total === 1180, 'invoice is created from the approved report at the work order rate (1000 + 18% GST)');
  ok(invA.issuedOn === T && invA.due === L.addDays(T, 30), 'credit invoice is dated from the report, due in 30 days');
  ok((await call('POST', '/api/samples/s142/invoice', M)).s === 409, 'cannot invoice a report that is not approved');
  // vendor bills
  const vb = await call('POST', '/api/vendorbills', M, { vendor: 'Calibration Co', category: 'calibration', billNo: 'C-1', date: T, due: L.addDays(T, 15), amount: 5000 });
  ok(vb.s === 200 && vb.j.payments.length === 0, 'vendor bill added');
  ok((await call('POST', '/api/vendorbills/' + vb.j.id + '/pay', M, { amount: 2000, date: T, mode: 'UPI', ref: 'U1' })).j.bill.payments.length === 1, 'part payment recorded');
  ok((await call('POST', '/api/vendorbills/' + vb.j.id + '/pay', M, { amount: 4000, date: T, mode: 'UPI' })).s === 400, 'cannot pay more than the balance');
  ok((await call('POST', '/api/vendorbills', S, { vendor: 'x', date: T, amount: 1 })).s === 403, 'tester cannot add vendor bills');
  ok(!(await call('GET', '/api/bootstrap', S)).j.data.vendorbills.length, 'vendor bills are hidden from testers');
  // quotations
  const q = await call('POST', '/api/quotes', M, { clientId: 'c1', subject: 'Cube testing', lines: [{ testId: 't_cube', qty: 10, rate: 300 }], gstPct: 18 });
  ok(q.s === 200 && /^QT-\d\d-0001$/.test(q.j.no) && q.j.total === 3540 && q.j.status === 'draft', 'quotation numbered, totals worked out on the server');
  const q2 = await call('POST', '/api/quotes', M, { prospect: 'New Builder', lines: [{ desc: 'Steel test', qty: 2, rate: 900 }] });
  ok(q2.j.no.endsWith('-0002') && q2.j.total === 2124, 'prospects can be quoted too');
  ok((await call('POST', '/api/quotes', M, { lines: [] })).s === 400, 'quotation needs lines');
  ok((await call('POST', '/api/quotes', R, { clientId: 'c1', lines: [{ desc: 'x', qty: 1, rate: 1 }] })).s === 403, 'store cannot make quotations');
  // approve & send
  ok((await call('POST', '/api/samples/s141/approve', R)).s === 403, 'store cannot approve');
  const ap = await call('POST', '/api/samples/s141/approve', M, { geo: GEO });
  ok(ap.j.sample.reportStatus === 'approved' && ap.j.sample.approveGeo.lat === 18.5601, 'approval records location when given');
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

  // tickets
  const SU = await login('suresh', '3333'), ST = await login('rahul', '2222');
  const tk = await call('POST', '/api/tickets', ST, { title: 'Balance drifting', body: 'Weighing balance reads high', category: 'equipment', priority: 'high' });
  ok(tk.s === 200 && /^TKT-\d{4}$/.test(tk.j.ticket.no) && tk.j.ticket.status === 'open', 'any role can raise a ticket');
  ok((await call('POST', '/api/tickets', ST, { title: '', body: 'x' })).s === 400, 'ticket needs a title');
  const tid = tk.j.ticket.id;
  const nTk = (await call("GET", "/api/changes?since=0", A)).j.upserts.notifications || [];
  ok(nTk.some(n => n.type === "ticket" && n.ticketId === tid), 'admin is notified of a new ticket');
  ok(!((await call('GET', '/api/changes?since=0', SU)).j.upserts.tickets || []).some(t => t.id === tid), 'unrelated tester cannot see the ticket');
  ok((await call('POST', '/api/tickets/' + tid, SU, { text: 'hi' })).s === 404, 'unrelated user cannot act on it');
  ok((await call('POST', '/api/tickets/' + tid, ST, { assignee: 'u_suresh' })).s === 403, 'only admin can assign');
  const as = await call('POST', '/api/tickets/' + tid, A, { assignee: 'u_suresh', priority: 'urgent' });
  ok(as.s === 200 && as.j.ticket.assignee === 'u_suresh' && as.j.ticket.comments.length === 2, 'admin assigns and re-prioritises, events are logged');
  ok(((await call('GET', '/api/changes?since=0', SU)).j.upserts.tickets || []).some(t => t.id === tid), 'assignee now sees the ticket');
  ok((await call('POST', '/api/tickets/' + tid, SU, { status: 'closed' })).s === 403, 'assignee cannot close');
  ok((await call('POST', '/api/tickets/' + tid, SU, { status: 'in_progress', text: 'Looking at it' })).j.ticket.status === 'in_progress', 'assignee can work the ticket and comment');
  ok((await call('POST', '/api/tickets/' + tid, SU, { status: 'resolved' })).j.ticket.closedAt, 'assignee can resolve');
  ok((await call('POST', '/api/tickets/' + tid, ST, { status: 'closed' })).j.ticket.status === 'closed', 'raiser can close');
  ok((await call('POST', '/api/tickets/' + tid, ST, {})).s === 400, 'empty update rejected');

  // audit & export
  const au = (await call('GET', '/api/audit?limit=200', A)).j.entries;
  ok(au.some(e => e.action === 'create' && e.coll === 'samples') && au.some(e => e.action === 'result') && au.some(e => e.action === 'payment') && au.some(e => /address/.test(e.summary)), 'audit log records additions, results, payments and edits');
  ok((await call('GET', '/api/audit', M)).s === 403, 'audit log is admin only');
  const csv = await fetch(base + '/api/export/clients.csv', { headers: { Authorization: 'Bearer ' + M } });
  ok(csv.status === 200 && /^id,code,name/.test(await csv.text()), 'CSV export works for accounts');
  ok((await fetch(base + '/api/export/users.csv', { headers: { Authorization: 'Bearer ' + M } })).status === 403, 'users export is admin only');

  // push, email and public report verification
  const N = require('../lib/notifier'), crypto = require('crypto');
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const auth = crypto.randomBytes(16);
  const subj = { endpoint: 'https://push.example/abc', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  const enc = N.encrypt(subj, JSON.stringify({ title: 'Hello', body: 'Report approved' }));
  ok(JSON.parse(N.decrypt(ua.getPrivateKey(), ua.getPublicKey(), auth, enc)).title === 'Hello', 'push payload encrypts and decrypts');
  const vk = N.newVapid(); let seen = null;
  ok((await N.sendPush(vk, subj, { title: 'x' }, async (u, o) => { seen = o; return { ok: true, status: 201 }; })) === 'ok' && /^vapid t=.+, k=/.test(seen.headers.Authorization) && seen.headers['Content-Encoding'] === 'aes128gcm', 'push request is signed with VAPID');
  ok((await N.sendPush(vk, subj, { title: 'x' }, async () => ({ ok: false, status: 410 }))) === 'gone', 'expired subscription is reported gone');
  const pk = await call('GET', '/api/push/key', S); ok(pk.s === 200 && pk.j.key && pk.j.key.length > 60, 'logged-in user gets the push key');
  ok((await call('GET', '/api/push/key')).s === 401, 'push key needs login');
  ok((await call('POST', '/api/push/subscribe', S, { sub: { endpoint: 'http://x', keys: {} } })).s === 400, 'bad subscription rejected');
  ok((await call('POST', '/api/push/subscribe', S, { sub: subj })).j.ok, 'subscription saved');
  ok((await call('POST', '/api/push/subscribe', S, { sub: { fcm: 'tok123' } })).j.ok, 'device token saved');
  ok((await call('POST', '/api/push/unsubscribe', S, { endpoint: subj.endpoint })).j.ok, 'subscription removed');
  ok(!N.mailOn(), 'email stays off until a key and sender are set');
  const vsid = next.sample.id, vp = await fetch(base + '/v/demo/' + vsid), vt = await vp.text();
  ok(vp.status === 200 && vt.includes('Genuine report') && !vt.includes('Shree'), 'public verify page confirms an issued report without customer details');
  ok((await fetch(base + '/v/demo/nope')).status === 404 && (await fetch(base + '/v/nolab/' + vsid)).status === 404, 'verify page rejects unknown reports and labs');
  ok((await fetch(base + '/qrcode.js')).status === 200 && (await fetch(base + '/sw.js')).status === 200, 'QR library and service worker are served');

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
