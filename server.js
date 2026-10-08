'use strict';
/*
 * TechAssures Lab server
 * - Zero npm dependencies. Needs Node 22.5+ (built-in node:sqlite).
 * - One SQLite file holds every record, a change feed (for multi-device sync) and an audit log.
 * - Roles are enforced here, not in the browser: store/tester never receive prices or payments.
 */
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const L = require('./lib/logic');
const { buildSeed } = require('./lib/seed');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'lab.db');
const DEMO = process.env.DEMO_MODE !== '0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 7;
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const APP_SECRET = process.env.APP_SECRET || crypto.randomBytes(32).toString('hex');
const BODY_LIMIT = 8 * 1024 * 1024;

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DATABASE_URL ? ':memory:' : DB_PATH);
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS records(org TEXT NOT NULL DEFAULT 'demo',coll TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,rev INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(org,coll,id));
CREATE INDEX IF NOT EXISTS records_rev ON records(rev);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,org TEXT NOT NULL DEFAULT 'demo',ts TEXT NOT NULL,user_id TEXT,user_name TEXT,action TEXT NOT NULL,coll TEXT,rec_id TEXT,summary TEXT);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,org TEXT NOT NULL DEFAULT 'demo',user_id TEXT NOT NULL,expires INTEGER NOT NULL);
`);

/* ---------------- storage helpers ---------------- */
const stmts = {};
const st = sql => stmts[sql] || (stmts[sql] = db.prepare(sql));
const metaGet = k => { const r = st('SELECT v FROM meta WHERE k=?').get(k); return r ? r.v : null; };
const metaSet = (k, v) => st('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));
let ORG = 'demo';                       /* the lab (tenant) the current request belongs to */
const withOrg = (o, fn) => { const prev = ORG; ORG = o; try { return fn(); } finally { ORG = prev; } };
const ctr = n => +metaGet(n + ':' + ORG) || 0;
const ctrSet = (n, v) => metaSet(n + ':' + ORG, v);
const nextRev = () => { const r = (+metaGet('rev') || 0) + 1; metaSet('rev', r); return r; };
const get = (coll, id) => { const r = st('SELECT data FROM records WHERE org=? AND coll=? AND id=? AND deleted=0').get(ORG, coll, id); return r ? JSON.parse(r.data) : null; };
const all = coll => st('SELECT data FROM records WHERE org=? AND coll=? AND deleted=0').all(ORG, coll).map(r => JSON.parse(r.data));
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* ignore */ } throw e; }
}
function audit(actor, action, coll, recId, summary) {
  st('INSERT INTO audit(org,ts,user_id,user_name,action,coll,rec_id,summary) VALUES(?,?,?,?,?,?,?,?)')
    .run(ORG, new Date().toISOString(), actor ? actor.id : null, actor ? actor.name : 'system', action, coll || null, recId || null, String(summary || '').slice(0, 400));
}
const SKIP_DIFF = { photo: 1, sig: 1, rep: 1, hash: 1, salt: 1 };
function diffSummary(old, obj) {
  if (!old) return 'created';
  const out = [];
  Object.keys(obj).forEach(k => {
    if (SKIP_DIFF[k]) return;
    const a = old[k], b = obj[k];
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const sc = v => (v == null || typeof v === 'object') ? null : String(v);
    const x = sc(a), y = sc(b);
    out.push(x != null && y != null && x.length < 40 && y.length < 40 ? k + ': ' + x + ' → ' + y : k + ' changed');
  });
  return out.length ? out.join('; ') : 'saved (no field changes)';
}
function put(coll, obj, actor, action, summary) {
  const old = get(coll, obj.id), rev = nextRev();
  st('INSERT INTO records(org,coll,id,data,rev,deleted) VALUES(?,?,?,?,?,0) ON CONFLICT(org,coll,id) DO UPDATE SET data=excluded.data,rev=excluded.rev,deleted=0')
    .run(ORG, coll, obj.id, JSON.stringify(obj), rev);
  audit(actor, action || (old ? 'update' : 'create'), coll, obj.id, summary || diffSummary(old, obj));
  return obj;
}
function del(coll, id, actor) {
  const old = get(coll, id); if (!old) return false;
  st('UPDATE records SET deleted=1,rev=? WHERE org=? AND coll=? AND id=?').run(nextRev(), ORG, coll, id);
  audit(actor, 'delete', coll, id, old.name || old.title || old.summary || '');
  return true;
}

/* ---------------- errors & validation ---------------- */
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m, s) => { throw new ApiError(s || 400, m); };
function str(v, max, o) {
  o = o || {};
  const s = v == null ? '' : String(v).trim();
  if (o.req && !s) bad(o.req);
  if (s.length > max) bad('Text is too long (max ' + max + ' characters)');
  return s;
}
const isId = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s);
const rid = () => crypto.randomBytes(5).toString('hex');
function money(v, label) { const n = L.num(v); if (isNaN(n) || n < 0 || n > 1e9) bad(label + ' must be a number, 0 or more'); return n; }

/* ---------------- users, auth ---------------- */
const ROLES = ['admin', 'store', 'tester', 'accounts'];
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
function newCred(pin) { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: hashPin(pin, salt) }; }
function pinOk(u, pin) {
  if (!u.salt || !u.hash) return false;            /* Google-only user: no PIN set */
  try { return crypto.timingSafeEqual(Buffer.from(hashPin(pin, u.salt), 'hex'), Buffer.from(u.hash, 'hex')); } catch (e) { return false; }
}
const pubUser = (u, full) => full ? { id: u.id, login: u.login, email: u.email || '', name: u.name, role: u.role, active: u.active } : { id: u.id, name: u.name, role: u.role, active: u.active };
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  st('INSERT INTO sessions(token_hash,org,user_id,expires) VALUES(?,?,?,?)').run(sha(token), ORG, userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
function authUser(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer ([a-f0-9]{64})$/.exec(h);
  if (!m) return null;
  const s = st('SELECT org,user_id,expires FROM sessions WHERE token_hash=?').get(sha(m[1]));
  if (!s || s.expires < Date.now()) return null;
  ORG = s.org;
  const u = get('users', s.user_id);
  if (!u || !u.active) return null;
  u.org = s.org;
  return u;
}
const attempts = new Map();
function throttle(key) {
  const a = attempts.get(key);
  if (a && a.until > Date.now()) bad('Too many wrong attempts. Try again in a few minutes.', 429);
}
function failed(key) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  a.n++; if (a.n >= 5) { a.until = Date.now() + 10 * 60e3; a.n = 0; }
  attempts.set(key, a);
}

/* ---------------- seed ---------------- */
const COLLS = ['users', 'tests', 'clients', 'projects', 'samples', 'jobs', 'invoices', 'payments', 'leads', 'interactions', 'tasks', 'notifications', 'tickets'];
function seedDb() {                       /* the demo lab: ORG must be 'demo' */
  const seed = buildSeed(), rev = nextRev();
  const ins = st('INSERT INTO records(org,coll,id,data,rev,deleted) VALUES(?,?,?,?,?,0) ON CONFLICT(org,coll,id) DO UPDATE SET data=excluded.data,rev=excluded.rev,deleted=0');
  seed.records.users = seed.records.users.map(u => { const c = newCred(u.pin); return { id: u.id, login: u.login, name: u.name, role: u.role, active: u.active, salt: c.salt, hash: c.hash }; });
  COLLS.forEach(c => (seed.records[c] || []).forEach(r => ins.run(ORG, c, r.id, JSON.stringify(r), rev)));
  ins.run(ORG, 'settings', 'main', JSON.stringify(Object.assign({ id: 'main' }, seed.settings)), rev);
  ctrSet('uid', seed.counters.uid); ctrSet('inv', seed.counters.inv); metaSet('seeded', '1');
}
/* a brand-new lab starts with the standard test catalogue, settings and no clients or samples */
function seedBlank(admin) {
  const seed = buildSeed(), rev = nextRev();
  const ins = st('INSERT INTO records(org,coll,id,data,rev,deleted) VALUES(?,?,?,?,?,0) ON CONFLICT(org,coll,id) DO UPDATE SET data=excluded.data,rev=excluded.rev,deleted=0');
  seed.records.tests.forEach(r => ins.run(ORG, 'tests', r.id, JSON.stringify(r), rev));
  ins.run(ORG, 'settings', 'main', JSON.stringify(Object.assign({ id: 'main' }, seed.settings)), rev);
  ins.run(ORG, 'users', admin.id, JSON.stringify(admin), rev);
  ctrSet('uid', 1); ctrSet('inv', 1);
}
const sysOrgs = () => withOrg('_sys', () => all('orgs'));
const findOrg = slug => sysOrgs().find(o => o.slug === slug) || null;
function putOrg(o) { withOrg('_sys', () => put('orgs', o, null, 'create', 'Lab ' + o.name + ' created')); }
function seedIfEmpty() {
  tx(() => {
    if (!metaGet('seeded')) withOrg('demo', () => { seedDb(); audit(null, 'seed', null, null, 'Demo data loaded'); });
    else withOrg('demo', () => { if (!ctr('uid') && metaGet('uid')) { ctrSet('uid', metaGet('uid')); ctrSet('inv', metaGet('inv')); } });   /* upgrade from the single-lab version */
    if (!findOrg('demo')) putOrg({ id: 'demo', slug: 'demo', name: 'Demo Lab', plan: 'demo', createdOn: L.today(), ownerEmail: '' });
  });
}
let pg = null, ready = Promise.resolve();
if (DATABASE_URL) {
  pg = require('./lib/pgsync')(DATABASE_URL, db);
  ready = (async () => { await pg.init(); seedIfEmpty(); await pg.flush(); })();
  ready.catch(e => { console.error('Database start-up failed:', e.message); process.exit(1); });
} else seedIfEmpty();
const DEMO_PINS = { admin: '1111', rahul: '2222', suresh: '3333', meera: '4444', imran: '5555' };

/* ---------------- role-based views ---------------- */
const MONEY_ROLES = ['admin', 'accounts'];
const CRM_ROLES = ['admin', 'accounts'];
function assignedSet(u) {
  if (u.role !== 'tester') return null;
  return new Set(all('jobs').filter(j => j.assignee === u.id).map(j => j.sampleId));
}
function shape(u, coll, r, asg) {
  switch (coll) {
    case 'users': return pubUser(r, u.role === 'admin');
    case 'tests': if (u.role === 'store' || u.role === 'tester') { const t = Object.assign({}, r); delete t.rate; return t; } return r;
    case 'clients':
      if (u.role === 'tester') return null;
      if (u.role === 'store') { const c = Object.assign({}, r); delete c.rates; return c; }
      return r;
    case 'projects': return u.role === 'tester' ? null : r;
    case 'samples':
      if (u.role !== 'tester') return r;
      if (!asg.has(r.id)) return null;
      { const s = Object.assign({}, r); ['clientId', 'projectId', 'billing', 'sampledBy', 'rep', 'invoiceId', 'billNo', 'createdBy'].forEach(k => delete s[k]); return s; }
    case 'jobs': return u.role === 'tester' && r.assignee !== u.id ? null : r;
    case 'invoices': case 'payments': return MONEY_ROLES.includes(u.role) ? r : null;
    case 'leads': case 'interactions': case 'tasks': return CRM_ROLES.includes(u.role) ? r : null;
    case 'tickets': return (u.role === 'admin' || r.raisedBy === u.id || r.assignee === u.id) ? r : null;
    case 'notifications': return r.userId === u.id ? r : null;      /* everyone sees only their own */
    default: return null;
  }
}
function shapeSettings(u, s) {
  if (!s) return {};
  if (u.role === 'admin' || u.role === 'accounts') return { cert: s.cert, gst: s.gst, creditDays: s.creditDays };
  return { cert: s.cert };
}
function counters(u) { return (u.role === 'admin' || u.role === 'store') ? { uid: ctr('uid'), inv: ctr('inv') } : {}; }
function snapshot(u) {
  const asg = assignedSet(u), out = {};
  COLLS.forEach(c => { out[c] = all(c).map(r => shape(u, c, r, asg)).filter(Boolean); });
  out.settings = shapeSettings(u, get('settings', 'main'));
  out.counters = counters(u);
  const o = findOrg(u.org) || {};
  return { rev: +metaGet('rev'), data: out, org: { slug: o.slug, name: o.name, plan: o.plan, demo: o.slug === 'demo' } };
}
function changes(u, since) {
  const rev = +metaGet('rev');
  if (since > rev) return { reload: true, rev };
  const rows = st('SELECT coll,id,data,deleted FROM records WHERE org=? AND rev>? ORDER BY rev').all(ORG, since);
  const asg = assignedSet(u), up = {}, dl = {};
  rows.forEach(r => {
    if (r.deleted) { (dl[r.coll] = dl[r.coll] || []).push(r.id); return; }
    const rec = JSON.parse(r.data);
    if (r.coll === 'settings') { up.settings = shapeSettings(u, rec); return; }
    const v = shape(u, r.coll, rec, asg);
    if (v) (up[r.coll] = up[r.coll] || []).push(v);
  });
  if (u.role === 'tester' && up.jobs) {
    const have = new Set((up.samples || []).map(s => s.id));
    up.jobs.forEach(j => { if (!have.has(j.sampleId)) { const s = get('samples', j.sampleId); const v = s && shape(u, 'samples', s, asg); if (v) { (up.samples = up.samples || []).push(v); have.add(j.sampleId); } } });
  }
  return { rev, upserts: up, deletes: dl, counters: counters(u) };
}

/* ---------------- generic config collections ---------------- */
const GENERIC = {
  tests: { roles: ['admin'] },
  clients: { roles: ['admin', 'accounts'] },
  projects: { roles: ['admin', 'accounts', 'store'] },
  leads: { roles: CRM_ROLES, deletable: true },
  interactions: { roles: CRM_ROLES, deletable: true },
  tasks: { roles: CRM_ROLES, deletable: true },
  settings: { roles: ['admin'] }
};
const LEAD_STAGES = ['new', 'contacted', 'quoted', 'won', 'lost'];
const INT_TYPES = ['call', 'visit', 'email', 'whatsapp', 'note'];
const optDate = (v, label) => { if (v === '' || v == null) return ''; if (!L.isDate(v)) bad(label + ' is not a valid date'); return v; };
const optUser = (v, label) => { if (!v) return ''; const u = get('users', v); if (!u) bad(label + ' is not a known user'); return v; };
const optClient = v => { if (!v) return ''; if (!get('clients', v)) bad('Unknown client'); return v; };

function clean(coll, b, old, actor) {
  const id = b.id;
  if (coll === 'settings') {
    if (id !== 'main') bad('Unknown settings record');
    const gst = L.num(b.gst), cd = parseInt(b.creditDays, 10);
    if (isNaN(gst) || gst < 0 || gst > 100) bad('GST % must be between 0 and 100');
    if (isNaN(cd) || cd < 0 || cd > 365) bad('Default credit days must be 0–365');
    return { id: 'main', cert: str(b.cert, 20, { req: 'NABL certificate number is required' }), gst: String(gst), creditDays: String(cd) };
  }
  if (!isId(id)) bad('Invalid id');
  if (coll === 'tests') {
    return { id, name: str(b.name, 80, { req: 'Test name is required' }), code: str(b.code, 60), rate: String(money(b.rate, 'Rate')), nabl: !!b.nabl,
      kind: old ? old.kind : 'simple', unit: str(b.unit || (old && old.unit) || 'sample', 20), ru: str(b.ru || (old && old.ru) || 'value', 30) };
  }
  if (coll === 'clients') {
    const code = str(b.code, 20, { req: 'Client code is required' });
    if (all('clients').some(c => c.id !== id && c.code.toLowerCase() === code.toLowerCase())) bad('Client code ' + code + ' is already used');
    const gst = str(b.gst, 15); if (gst && gst.length !== 15) bad('GST number should be 15 characters');
    const phone = str(b.phone, 10); if (phone && !/^\d{10}$/.test(phone)) bad('Phone should be 10 digits');
    const terms = b.terms; if (terms !== 'Advance' && terms !== 'Credit') bad('Billing terms must be Advance or Credit');
    const tests = all('tests'), rates = {};
    Object.keys(b.rates || {}).forEach(k => { if (!tests.some(t => t.id === k)) return; const v = b.rates[k]; if (v === '' || v == null) rates[k] = ''; else rates[k] = String(money(v, 'Rate')); });
    const cd = parseInt(b.creditDays, 10);
    return { id, code, name: str(b.name, 120, { req: 'Client name is required' }), address: str(b.address, 300), gst: gst.toUpperCase(), terms, creditDays: String(isNaN(cd) ? 0 : cd), contact: str(b.contact, 80), phone, rates };
  }
  if (coll === 'projects') {
    if (!get('clients', b.clientId)) bad('Unknown client');
    if (old && actor.role === 'store') bad('Store users can add projects but not change them', 403);
    return { id, clientId: b.clientId, name: str(b.name, 120, { req: 'Project name is required' }), site: str(b.site, 300) };
  }
  if (coll === 'leads') {
    if (LEAD_STAGES.indexOf(b.stage) < 0) bad('Unknown lead stage');
    return { id, name: str(b.name, 120, { req: 'Lead name is required' }), contact: str(b.contact, 80), phone: str(b.phone, 20), email: str(b.email, 120), source: str(b.source, 40),
      stage: b.stage, value: money(b.value || 0, 'Value'), nextFollowUp: optDate(b.nextFollowUp, 'Follow-up date'), owner: optUser(b.owner, 'Owner'), notes: str(b.notes, 2000),
      lostReason: b.stage === 'lost' ? str(b.lostReason, 120) : '', clientId: optClient(b.clientId), createdOn: optDate(b.createdOn, 'Created date') || L.today(), updatedOn: L.today() };
  }
  if (coll === 'interactions') {
    if (INT_TYPES.indexOf(b.type) < 0) bad('Unknown interaction type');
    if (!b.clientId && !b.leadId) bad('Pick a client or a lead');
    if (b.leadId && !get('leads', b.leadId)) bad('Unknown lead');
    if (!L.isDate(b.date)) bad('Date is not valid');
    return { id, clientId: optClient(b.clientId), leadId: b.leadId || '', type: b.type, summary: str(b.summary, 1000, { req: 'Write a short summary' }), date: b.date, by: old ? old.by : actor.id };
  }
  if (coll === 'tasks') {
    if (!L.isDate(b.due)) bad('Due date is not valid');
    if (b.leadId && !get('leads', b.leadId)) bad('Unknown lead');
    return { id, title: str(b.title, 200, { req: 'Task title is required' }), due: b.due, done: !!b.done, doneOn: b.done ? (optDate(b.doneOn, 'Done date') || L.today()) : '', assignee: optUser(b.assignee, 'Assignee'), clientId: optClient(b.clientId), leadId: b.leadId || '' };
  }
  bad('Unknown collection', 404);
}
function genericSave(u, coll, id, body) {
  const g = GENERIC[coll]; if (!g) bad('Unknown collection', 404);
  if (!g.roles.includes(u.role)) bad('Your role cannot change ' + coll, 403);
  if (!body || typeof body !== 'object') bad('Expected a JSON object');
  const key = coll === 'settings' ? 'main' : (id || body.id || (coll[0] + '_' + rid()));
  const rec = clean(coll, Object.assign({}, body, { id: key }), get(coll, key), u);
  return tx(() => put(coll, rec, u));
}

/* ---------------- location stamps ---------------- */
/* The phone sends its GPS fix; the server adds its own clock, so the time cannot be edited on the device. */
function geoOf(b, required) {
  const g = b && b.geo;
  if (!g || typeof g !== 'object') { if (required) bad('Location is required for this step. Turn on location and try again.', 400); return null; }
  const lat = Number(g.lat), lng = Number(g.lng), acc = Number(g.acc);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180) || (lat === 0 && lng === 0) || isNaN(lat) || isNaN(lng)) { if (required) bad('Location could not be read. Turn on location and try again.', 400); return null; }
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: isNaN(acc) ? 0 : Math.min(99999, Math.round(acc)), at: new Date().toISOString() };
}
const geoTxt = g => g ? ' · at ' + g.lat + ',' + g.lng + (g.acc ? ' (±' + g.acc + ' m)' : '') : '';

/* ---------------- notifications ---------------- */
function putQuiet(coll, obj) {            /* system-written record: synced to devices, not listed in the audit log */
  st('INSERT INTO records(org,coll,id,data,rev,deleted) VALUES(?,?,?,?,?,0) ON CONFLICT(org,coll,id) DO UPDATE SET data=excluded.data,rev=excluded.rev,deleted=0')
    .run(ORG, coll, obj.id, JSON.stringify(obj), nextRev());
}
/* one notification per (id): calling again with the same id does nothing, so reminders are never repeated */
function notify(userId, id, o) {
  if (!userId || get('notifications', id)) return;
  putQuiet('notifications', Object.assign({ id, userId, at: new Date().toISOString(), read: false }, o));
}
const staffOf = roles => all('users').filter(x => x.active && roles.includes(x.role));
function scanDue(now) {
  now = now || new Date();
  const hr = now.getHours(), today = L.today(), tomorrow = L.addDays(today, 1);
  sysOrgs().filter(o => o.slug !== 'demo' || DEMO).forEach(org => withOrg(org.slug, () => {
    const tests = all('tests');
    tx(() => all('tickets').filter(t => ['open', 'in_progress', 'waiting'].includes(t.status) && t.due && t.due < today && hr >= 9).forEach(t => {
      const to = t.assignee ? [t.assignee] : staffOf(['admin']).map(a => a.id);
      to.forEach(uid => notify(uid, 'n_tk_' + t.id + '_od_' + today + '_' + uid, { type: 'ticket', title: 'Ticket overdue', body: t.no + ' · ' + t.title + ' (due ' + t.due + ')', ticketId: t.id }));
    }));
    tx(() => all('jobs').filter(j => j.status !== 'done').forEach(j => {
      const smp = get('samples', j.sampleId); if (!smp) return;
      const t = tests.find(x => x.id === smp.testId) || { name: 'Test', kind: 'simple' };
      const what = smp.uid + ' · ' + jobLabel(t, j);
      if (j.due === tomorrow && hr >= 16) notify(j.assignee, 'n_' + j.id + '_d1', { type: 'due', title: 'Test due tomorrow', body: what, sampleId: smp.id, jobId: j.id });
      if (j.due === today && hr >= 7) notify(j.assignee, 'n_' + j.id + '_d0', { type: 'due', title: 'Test due today', body: what, sampleId: smp.id, jobId: j.id });
      if (j.due < today && hr >= 9) {
        const who = (all('users').find(x => x.id === j.assignee) || {}).name || 'unassigned';
        notify(j.assignee, 'n_' + j.id + '_od_' + today, { type: 'overdue', title: 'Test overdue', body: what + ' was due ' + j.due, sampleId: smp.id, jobId: j.id });
        staffOf(['admin']).forEach(a => { if (a.id !== j.assignee) notify(a.id, 'n_' + j.id + '_od_' + today + '_' + a.id, { type: 'overdue', title: 'Test overdue · ' + who, body: what + ' was due ' + j.due, sampleId: smp.id, jobId: j.id }); });
      }
    }));
  }));
  if (pg) pg.schedule();
}

/* ---------------- tickets ---------------- */
const TK_STATUS = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
const TK_PRI = ['low', 'normal', 'high', 'urgent'];
const TK_CAT = ['equipment', 'sample', 'billing', 'client', 'app', 'other'];
const TK_LABEL = { open: 'Open', in_progress: 'In progress', waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed' };
const tkDue = pri => L.addDays(L.today(), { urgent: 1, high: 2, normal: 5, low: 10 }[pri]);
const tkNote = (ids, actor, t, title, body) => new Set(ids.filter(Boolean)).forEach(uid => { if (uid !== actor.id) notify(uid, 'n_tk_' + t.id + '_' + Date.now().toString(36) + '_' + uid, { type: 'ticket', title, body, ticketId: t.id }); });
function ticketCreate(u, b) {
  const title = str(b.title, 120, { req: 'Give the ticket a short title' });
  const body = str(b.body, 3000, { req: 'Describe the problem or request' });
  const category = TK_CAT.includes(b.category) ? b.category : 'other', priority = TK_PRI.includes(b.priority) ? b.priority : 'normal';
  return tx(() => {
    const n = ctr('tkt') + 1; ctrSet('tkt', n);
    const t = { id: 'tk' + n, no: 'TKT-' + L.pad(n, 4), title, body, category, priority, status: 'open', raisedBy: u.id, raisedByName: u.name, createdAt: new Date().toISOString(), assignee: '', due: tkDue(priority), related: str(b.related, 60), comments: [], updatedAt: new Date().toISOString() };
    put('tickets', t, u, 'create', t.no + ' · ' + title);
    tkNote(staffOf(['admin']).map(a => a.id), u, t, 'New ticket ' + t.no, u.name + ': ' + title);
    return { ticket: t };
  });
}
function ticketAct(u, id, b) {
  const t = get('tickets', id); if (!t || !(u.role === 'admin' || t.raisedBy === u.id || t.assignee === u.id)) bad('Ticket not found', 404);
  const isAdmin = u.role === 'admin', isAsg = t.assignee === u.id, isRaiser = t.raisedBy === u.id;
  const now = new Date().toISOString(), ev = [], oldStatus = t.status, oldAsg = t.assignee;
  const text = str(b.text, 2000);
  if (b.assignee !== undefined && b.assignee !== t.assignee) {
    if (!isAdmin) bad('Only an admin can assign tickets', 403);
    if (b.assignee) { const a = get('users', b.assignee); if (!a || !a.active) bad('Choose an active person'); ev.push('Assigned to ' + a.name); } else ev.push('Unassigned');
    t.assignee = b.assignee;
  }
  if (b.priority !== undefined && b.priority !== t.priority) {
    if (!isAdmin) bad('Only an admin can change priority', 403);
    if (!TK_PRI.includes(b.priority)) bad('Unknown priority'); ev.push('Priority: ' + t.priority + ' → ' + b.priority); t.priority = b.priority; t.due = tkDue(b.priority);
  }
  if (b.status !== undefined && b.status !== t.status) {
    if (!TK_STATUS.includes(b.status)) bad('Unknown status');
    const raiserOk = isRaiser && (b.status === 'closed' || b.status === 'open');
    if (!(isAdmin || (isAsg && b.status !== 'closed') || raiserOk)) bad('You cannot set this status', 403);
    ev.push('Status: ' + TK_LABEL[t.status] + ' → ' + TK_LABEL[b.status]); t.status = b.status;
    if (b.status === 'resolved' || b.status === 'closed') t.closedAt = now; else delete t.closedAt;
  }
  if (!text && !ev.length) bad('Nothing to update');
  return tx(() => {
    ev.forEach(e => t.comments.push({ id: rid(), kind: 'event', by: u.id, name: u.name, at: now, text: e }));
    if (text) t.comments.push({ id: rid(), kind: 'comment', by: u.id, name: u.name, at: now, text });
    t.updatedAt = now;
    put('tickets', t, u, text ? 'comment' : 'update', t.no + (ev.length ? ' · ' + ev.join('; ') : '') + (text ? ' · comment' : ''));
    if (t.assignee !== oldAsg && t.assignee) tkNote([t.assignee], u, t, 'Ticket assigned to you', t.no + ' · ' + t.title);
    if (t.assignee !== oldAsg) tkNote([t.raisedBy], u, t, 'Your ticket was assigned', t.no + ' · ' + t.title);
    if (t.status !== oldStatus) tkNote([t.raisedBy, t.assignee], u, t, 'Ticket ' + TK_LABEL[t.status].toLowerCase(), t.no + ' · ' + t.title);
    if (text) tkNote([t.raisedBy, t.assignee].concat(staffOf(['admin']).map(a => a.id).filter(() => !t.assignee && !isAdmin)), u, t, 'New comment on ' + t.no, u.name + ': ' + text.slice(0, 90));
    return { ticket: t };
  });
}

/* ---------------- domain actions ---------------- */
function createSample(u, b) {
  const geo = geoOf(b, true);
  const settings = get('settings', 'main'), tests = all('tests'), clients = all('clients');
  const test = tests.find(t => t.id === b.testId); if (!test) bad('Choose a type of test');
  const client = clients.find(c => c.id === b.clientId); if (!client) bad('Choose a client');
  const proj = get('projects', b.projectId); if (!proj || proj.clientId !== client.id) bad('Choose a project of this client');
  if (!L.isDate(b.receipt)) bad('Enter a valid date of receipt');
  if (b.receipt > L.today()) bad('Date of receipt cannot be in the future');
  if (b.sampledBy !== 'TechAssures' && b.sampledBy !== 'Client') bad('Sampled by must be TechAssures or Client');
  if (b.billing !== 'Advance' && b.billing !== 'Credit') bad('Billing type must be Advance or Credit');
  const mark = str(b.mark, 120, { req: 'Identification mark is required' });
  if (b.cond !== 'Acceptable' && b.cond !== 'Not acceptable') bad('Choose the sample condition');
  const reason = b.cond === 'Not acceptable' ? str(b.reason, 300, { req: 'Give a reason for rejecting the sample' }) : '';
  const rep = b.rep || {};
  const repName = str(rep.name, 80, { req: 'Enter the client representative name' });
  if (!/^\d{10}$/.test(String(rep.mobile || ''))) bad('Representative mobile must be 10 digits');
  const sig = String(rep.sig || ''); if (!/^data:image\/png;base64,/.test(sig) || sig.length > 300000) bad('A signature is required');
  const photo = String(b.photo || ''); if (photo && (!/^data:image\/(jpeg|png);base64,/.test(photo) || photo.length > 2e6)) bad('Photo is not valid or too large');
  const asg = get('users', b.assignee); if (!asg || asg.role !== 'tester' || !asg.active) bad('Choose an active tester');
  const dd = b.d || {}, d = {};
  if (test.kind === 'cube') {
    const ages = Array.isArray(dd.ages) ? dd.ages.map(Number).filter((a, i, arr) => [7, 14, 28].includes(a) && arr.indexOf(a) === i).sort((a, c) => a - c) : [];
    if (!ages.length) bad('Select at least one test age');
    if (!L.isDate(dd.casting) || dd.casting > L.today()) bad('Enter a valid date of casting (not in the future)');
    const sizes = (Array.isArray(dd.sizes) ? dd.sizes : []).slice(0, 10).map(s => ({ l: L.num(s.l), b: L.num(s.b), h: L.num(s.h), n: parseInt(s.n, 10) }));
    if (!sizes.length || sizes.some(s => !(s.l > 0 && s.b > 0 && s.h > 0 && s.n >= 1 && s.n <= 200))) bad('Check the cube sizes and counts');
    const grade = str(dd.grade, 6); if (!/^M(10|15|20|25|30|35|40|45|50)$/.test(grade)) bad('Choose a grade between M10 and M50');
    const source = dd.source; if (source !== 'RMC' && source !== 'Site mix') bad('Choose the concrete source');
    const supplier = source === 'RMC' ? str(dd.supplier, 80, { req: 'Enter the RMC supplier' }) : '';
    Object.assign(d, { grade, source, supplier, casting: dd.casting, ages, sizes, total: sizes.reduce((a, s) => a + s.n, 0) });
  } else {
    const qty = L.num(dd.qty); if (!(qty > 0) || qty > 100000) bad('Enter a quantity greater than 0');
    if (!L.isDate(dd.due)) bad('Choose a due date');
    Object.assign(d, { desc: str(dd.desc, 300, { req: 'Describe the sample' }), qty, due: dd.due });
  }
  return tx(() => {
    const n = ctr('uid'), invNo = ctr('inv'); ctrSet('uid', n + 1); ctrSet('inv', invNo + 1);
    const yy = b.receipt.slice(2, 4);
    const s = { id: 's' + n, uid: 'UID-' + yy + '-' + L.pad(n, 6), ulr: test.nabl ? settings.cert + '-' + yy + '-' + L.pad(n, 6) + '-F' : '', receipt: b.receipt, clientId: client.id, projectId: proj.id, sampledBy: b.sampledBy, billing: b.billing, testId: test.id, mark, d, photo, cond: b.cond, reason, rep: { name: repName, mobile: String(rep.mobile), sig }, assignee: asg.id, createdBy: u.id, reportStatus: 'testing', geo };
    const jobs = test.kind === 'cube'
      ? d.ages.map(a => ({ id: 'j' + n + '_' + a, sampleId: s.id, age: a, due: L.addDays(d.casting, a), assignee: asg.id, status: 'pending', results: null, remarks: '' }))
      : [{ id: 'j' + n, sampleId: s.id, age: null, due: d.due, assignee: asg.id, status: 'pending', results: null, remarks: '' }];
    const inv = L.buildInvoice({ settings, tests, clients }, s, invNo);
    s.invoiceId = inv.id; s.billNo = inv.no;
    put('samples', s, u, 'create', 'Sample ' + s.uid + ' received for ' + client.name + geoTxt(geo));
    jobs.forEach(j => put('jobs', j, u, 'create', jobLabel(test, j) + ' due ' + j.due));
    put('invoices', inv, u, 'create', inv.no + ' · total ' + inv.total);
    notify(asg.id, 'n_assign_' + s.id, { type: 'assign', title: 'New test assigned to you', body: s.uid + ' · ' + (test.kind === 'cube' ? 'cubes, ' + d.ages.join('/') + '-day tests' : test.name) + ' · first due ' + jobs.map(j => j.due).sort()[0], sampleId: s.id, jobId: jobs[0].id });
    return { sample: s, jobs, invoice: MONEY_ROLES.includes(u.role) ? inv : null, billNo: inv.no };
  });
}
const jobLabel = (t, j) => (t.kind === 'cube' ? j.age + '-day cube test' : t.name);

function saveResult(u, jobId, b) {
  const geo = geoOf(b, true);
  const job = get('jobs', jobId); if (!job) bad('Job not found', 404);
  if (u.role !== 'admin' && !(u.role === 'tester' && job.assignee === u.id)) bad('This test is not assigned to you', 403);
  if (job.status === 'done') bad('This result is already saved', 409);
  if (job.due > L.today()) bad('Results can be saved only on or after ' + job.due, 409);
  const s = get('samples', job.sampleId), t = get('tests', s.testId);
  let results;
  if (t.kind === 'cube') {
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 200) : [];
    if (!rows.length) bad('Enter the failing load for at least one cube');
    const out = rows.map((r, i) => {
      const l = L.num(r.l), bb = L.num(r.b), h = L.num(r.h), load = L.num(r.load);
      if (!(load > 0 && load <= 10000)) bad('Cube ' + (i + 1) + ': enter the failing load in kN');
      if (!s.d.sizes.some(z => z.l === l && z.b === bb && z.h === h)) bad('Cube ' + (i + 1) + ': size does not match the sample');
      return { l, b: bb, h, load, strength: L.strength(load, l, bb) };
    });
    results = { rows: out, avg: L.r2(out.reduce((a, r) => a + r.strength, 0) / out.length) };
  } else {
    const v = str(b.value, 40, { req: 'Enter the result value' });
    if (isNaN(L.num(v)) || L.num(v) < 0) bad('Result value must be a number');
    results = { value: v };
  }
  return tx(() => {
    job.results = results; job.remarks = str(b.remarks, 500); job.status = 'done'; job.doneOn = L.today(); job.geo = geo; job.doneAt = geo.at; job.doneBy = u.id;
    put('jobs', job, u, 'result', s.uid + ' · ' + jobLabel(t, job) + (results.avg != null ? ' · avg ' + results.avg + ' N/mm²' : ' · ' + results.value) + geoTxt(geo));
    if (all('jobs').filter(j => j.sampleId === s.id).every(j => j.status === 'done')) { s.reportStatus = 'awaiting'; put('samples', s, u, 'status', s.uid + ' moved to Awaiting approval'); staffOf(['admin', 'accounts']).forEach(a => notify(a.id, 'n_await_' + s.id + '_' + a.id, { type: 'awaiting', title: 'Report awaiting approval', body: s.uid + ' · all tests done', sampleId: s.id })); }
    const asg = assignedSet(u);
    return { job, sample: shape(u, 'samples', s, asg) };
  });
}
function approveReport(u, id, b) {
  const geo = geoOf(b, false);
  const s = get('samples', id); if (!s) bad('Sample not found', 404);
  if (s.reportStatus !== 'awaiting') bad('Only a report that is awaiting approval can be approved', 409);
  s.reportStatus = 'approved'; s.approvedBy = u.name; s.approvedOn = L.today(); s.approveGeo = geo;
  return tx(() => put('samples', s, u, 'approve', s.uid + ' report approved' + geoTxt(geo)));
}
function sendReport(u, id, b) {
  const geo = geoOf(b, false);
  const s = get('samples', id); if (!s) bad('Sample not found', 404);
  if (s.reportStatus !== 'approved') bad('Approve the report before sending it', 409);
  const inv = get('invoices', s.invoiceId);
  if (s.billing === 'Advance' && inv && balanceOf(inv) > 0.004) bad('Blocked: this is an Advance client and bill ' + inv.no + ' is unpaid', 409);
  s.reportStatus = 'sent'; s.sentOn = L.today(); s.sendGeo = geo;
  return tx(() => put('samples', s, u, 'send', s.uid + ' marked as sent' + geoTxt(geo)));
}
const paidOf = inv => L.r2(all('payments').filter(p => p.invoiceId === inv.id).reduce((a, p) => a + (+p.amount), 0));
const balanceOf = inv => L.r2(inv.total - paidOf(inv));
function recordPayment(u, invId, b) {
  const inv = get('invoices', invId); if (!inv) bad('Invoice not found', 404);
  const amount = L.r2(L.num(b.amount));
  if (!(amount > 0)) bad('Enter an amount greater than 0');
  const bal = balanceOf(inv);
  if (amount > bal + 0.004) bad('Amount is more than the balance of ₹' + bal);
  if (!L.isDate(b.date) || b.date > L.today()) bad('Choose a valid payment date (not in the future)');
  if (!['Cash', 'UPI', 'Bank transfer', 'Cheque'].includes(b.mode)) bad('Choose a payment mode');
  const geo = geoOf(b, false);
  const p = { id: 'pay' + rid(), invoiceId: inv.id, amount, date: b.date, mode: b.mode, ref: str(b.ref, 60), geo, at: new Date().toISOString() };
  return tx(() => { put('payments', p, u, 'payment', inv.no + ' · ₹' + amount + ' via ' + p.mode + geoTxt(geo)); return { payment: p }; });
}
function adminUsers(u, method, id, b) {
  if (method === 'POST') {
    const email = str(b.email, 120).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('Enter a valid email address');
    if (email && all('users').some(x => (x.email || '') === email)) bad('This email is already added');
    let login = str(b.login, 20).toLowerCase(), c = { salt: '', hash: '' };
    if (login || b.pin) {
      if (!/^[a-z0-9._-]{3,20}$/.test(login)) bad('Login name: 3–20 letters, digits, dot, dash or underscore');
      if (all('users').some(x => x.login === login)) bad('This login name is taken');
      if (!/^\d{4,8}$/.test(String(b.pin || ''))) bad('PIN must be 4 to 8 digits');
      c = newCred(b.pin);
    } else if (!email) bad('Give a login name and PIN, or an email for Google sign-in');
    if (!ROLES.includes(b.role)) bad('Choose a role');
    const rec = { id: 'u_' + rid(), login, email, name: str(b.name, 60, { req: 'Enter the full name' }), role: b.role, active: true, salt: c.salt, hash: c.hash };
    return tx(() => { put('users', rec, u, 'create', 'User ' + (login || email) + ' (' + rec.role + ') added'); return pubUser(rec, true); });
  }
  const cur = get('users', id); if (!cur) bad('User not found', 404);
  const next = Object.assign({}, cur);
  if (b.name != null) next.name = str(b.name, 60, { req: 'Enter the full name' });
  if (b.role != null) { if (!ROLES.includes(b.role)) bad('Choose a role'); next.role = b.role; }
  if (b.active != null) next.active = !!b.active;
  if (b.email != null) { const em = str(b.email, 120).toLowerCase(); if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) bad('Enter a valid email address'); if (em && all('users').some(x => x.id !== id && (x.email || '') === em)) bad('This email is already added'); next.email = em; }
  if (b.pin != null && b.pin !== '') { if (!/^\d{4,8}$/.test(String(b.pin))) bad('PIN must be 4 to 8 digits'); Object.assign(next, newCred(b.pin)); }
  if (id === u.id && (!next.active || next.role !== 'admin')) bad('You cannot disable or demote your own account');
  const others = all('users').filter(x => x.id !== id && x.active && x.role === 'admin').length;
  if (cur.role === 'admin' && (!next.active || next.role !== 'admin') && others === 0) bad('Keep at least one active admin');
  return tx(() => {
    put('users', next, u, 'update', (b.pin ? 'PIN reset; ' : '') + diffSummary(Object.assign({}, cur, { salt: 0, hash: 0 }), Object.assign({}, next, { salt: 0, hash: 0 })));
    if (!next.active) st('DELETE FROM sessions WHERE org=? AND user_id=?').run(ORG, id);
    return pubUser(next, true);
  });
}
function resetDemo(u, b) {
  if (ORG !== 'demo') bad('Only the demo lab can be reset', 403);
  if (b.confirm !== 'RESET') bad('Send {"confirm":"RESET"} to reset');
  return tx(() => {
    st('UPDATE records SET deleted=1,rev=? WHERE org=?').run(nextRev(), ORG);
    seedDb(); audit(u, 'reset', null, null, 'Demo data restored');
    return { ok: true };
  });
}

/* ---------------- csv export ---------------- */
const CSV_ROLES = { admin: COLLS.concat(['settings']), accounts: ['clients', 'projects', 'samples', 'jobs', 'invoices', 'payments', 'leads', 'interactions', 'tasks'] };
function csvCell(v) {
  if (v == null) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // block spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(coll) {
  const rows = all(coll).map(r => { const o = Object.assign({}, r); delete o.photo; delete o.salt; delete o.hash; if (o.rep) o.rep = { name: o.rep.name, mobile: o.rep.mobile }; return o; });
  const cols = []; rows.forEach(r => Object.keys(r).forEach(k => { if (cols.indexOf(k) < 0) cols.push(k); }));
  return [cols.join(',')].concat(rows.map(r => cols.map(c => csvCell(r[c])).join(','))).join('\n');
}

/* ---------------- router ---------------- */
const routes = [];
const route = (method, re, roles, fn) => routes.push({ method, re, roles, fn });
const ok = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(b); };

route('GET', /^\/api\/health$/, null, c => {
  const out = { ok: true, demo: DEMO, googleClientId: GOOGLE_CLIENT_ID };
  if (DEMO) out.demoAccounts = withOrg('demo', () => all('users')).filter(x => x.active && DEMO_PINS[x.login] && pinOk(x, DEMO_PINS[x.login])).map(x => ({ login: x.login, pin: DEMO_PINS[x.login], role: x.role }));
  return out;
});
route('POST', /^\/api\/login$/, null, c => {
  const lab = String(c.body.lab || 'demo').trim().toLowerCase(), login = String(c.body.login || '').trim().toLowerCase(), key = c.ip + '|' + lab + '|' + login;
  throttle(key);
  const org = findOrg(lab);
  if (!org || (lab === 'demo' && !DEMO)) { failed(key); bad('Wrong lab code, login name or PIN', 401); }
  return withOrg(org.slug, () => {
    const u = login ? all('users').find(x => x.login === login) : null;
    if (!u || !pinOk(u, c.body.pin)) { failed(key); audit({ id: '', name: login || '(blank)' }, 'login_failed', 'users', u ? u.id : '', 'Wrong PIN · ' + whereOf(c.req, c.ip)); bad('Wrong lab code, login name or PIN', 401); }
    if (!u.active) bad('This account is disabled. Ask the admin.', 403);
    attempts.delete(key);
    audit(u, 'login', 'users', u.id, 'PIN · ' + whereOf(c.req, c.ip));
    return { token: newSession(u.id), user: pubUser(u, true) };
  });
});
route('POST', /^\/api\/logout$/, '*', c => { const m = /^Bearer ([a-f0-9]{64})$/.exec(c.req.headers.authorization || ''); if (m) st('DELETE FROM sessions WHERE token_hash=?').run(sha(m[1])); return { ok: true }; });

/* ---------------- Google sign-in and lab sign-up ---------------- */
const google = { jwks: null, at: 0 };
async function googleKeys() {
  if (google.jwks && Date.now() - google.at < 36e5) return google.jwks;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new ApiError(502, 'Could not reach Google. Try again.');
  google.jwks = (await r.json()).keys; google.at = Date.now(); return google.jwks;
}
const b64u = b => Buffer.from(b, 'base64url');
async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID) bad('Google sign-in is not set up on this server', 501);
  const parts = String(credential || '').split('.'); if (parts.length !== 3) bad('Google sign-in failed', 401);
  let head, pay;
  try { head = JSON.parse(b64u(parts[0]).toString()); pay = JSON.parse(b64u(parts[1]).toString()); } catch (e) { bad('Google sign-in failed', 401); }
  if (head.alg !== 'RS256') bad('Google sign-in failed', 401);
  const key = (await googleKeys()).find(k => k.kid === head.kid); if (!key) bad('Google sign-in failed', 401);
  const good = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key, format: 'jwk' }), b64u(parts[2]));
  if (!good) bad('Google sign-in failed', 401);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(pay.iss) || pay.aud !== GOOGLE_CLIENT_ID || !(pay.exp * 1000 > Date.now())) bad('Google sign-in expired. Try again.', 401);
  if (!pay.email || pay.email_verified !== true) bad('Your Google email is not verified', 401);
  return { email: String(pay.email).toLowerCase(), name: String(pay.name || pay.email.split('@')[0]).slice(0, 60) };
}
const sign = o => { const p = Buffer.from(JSON.stringify(o)).toString('base64url'); return p + '.' + crypto.createHmac('sha256', APP_SECRET).update(p).digest('base64url'); };
function unsign(t) {
  const [p, m] = String(t || '').split('.'); if (!p || !m) return null;
  const want = crypto.createHmac('sha256', APP_SECRET).update(p).digest('base64url');
  if (m.length !== want.length || !crypto.timingSafeEqual(Buffer.from(m), Buffer.from(want))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch (e) { return null; }
}
route('POST', /^\/api\/google$/, null, async c => {
  const g = await (c.verify || verifyGoogle)(c.body.credential);
  const want = String(c.body.lab || '').trim().toLowerCase();
  const found = sysOrgs().filter(o => (o.slug !== 'demo' || DEMO) && (!want || o.slug === want)).map(o => ({ o, u: withOrg(o.slug, () => all('users')).find(x => (x.email || '') === g.email && x.active) })).filter(x => x.u);
  if (found.length === 1) {
    const { o, u } = found[0];
    return withOrg(o.slug, () => { audit(u, 'login', 'users', u.id, 'Google · ' + whereOf(c.req, c.ip)); return { token: newSession(u.id), user: pubUser(u, true) }; });
  }
  if (found.length > 1) return { choose: found.map(x => ({ slug: x.o.slug, name: x.o.name })) };
  if (want) bad('This Google account is not a member of that lab', 403);
  return { signup: { token: sign({ email: g.email, name: g.name, exp: Date.now() + 15 * 60e3 }), email: g.email, name: g.name } };
});
const signups = new Map();
route('POST', /^\/api\/signup$/, null, c => {
  const t = unsign(c.body.token); if (!t) bad('Sign-up expired. Sign in with Google again.', 401);
  const hr = signups.get(c.ip) || []; const recent = hr.filter(x => x > Date.now() - 36e5);
  if (recent.length >= 5) bad('Too many labs created from this network. Try later.', 429);
  const name = str(c.body.labName, 80, { req: 'Enter your lab name' });
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'lab';
  const taken = new Set(sysOrgs().map(o => o.slug)); taken.add('demo'); taken.add('_sys');
  if (taken.has(slug)) slug = slug.slice(0, 18) + '-' + rid().slice(0, 4);
  const org = { id: slug, slug, name, plan: 'trial', createdOn: L.today(), ownerEmail: t.email };
  recent.push(Date.now()); signups.set(c.ip, recent);
  return tx(() => {
    putOrg(org);
    return withOrg(slug, () => {
      const admin = { id: 'u_' + rid(), login: '', email: t.email, name: t.name, role: 'admin', active: true, salt: '', hash: '' };
      seedBlank(admin);
      audit(admin, 'signup', 'orgs', slug, 'Lab ' + name + ' created · ' + whereOf(c.req, c.ip));
      return { token: newSession(admin.id), user: pubUser(admin, true), lab: slug };
    });
  });
});

route('GET', /^\/api\/bootstrap$/, '*', c => Object.assign({ user: pubUser(c.u, true) }, snapshot(c.u)));
route('GET', /^\/api\/changes$/, '*', c => changes(c.u, parseInt(c.url.searchParams.get('since'), 10) || 0));
route('POST', /^\/api\/samples$/, ['admin', 'store'], c => createSample(c.u, c.body));
route('POST', /^\/api\/jobs\/([\w-]+)\/result$/, ['admin', 'tester'], c => saveResult(c.u, c.m[1], c.body));
route('POST', /^\/api\/samples\/([\w-]+)\/approve$/, ['admin', 'accounts'], c => ({ sample: approveReport(c.u, c.m[1], c.body) }));
route('POST', /^\/api\/samples\/([\w-]+)\/send$/, ['admin', 'accounts'], c => ({ sample: sendReport(c.u, c.m[1], c.body) }));
route('POST', /^\/api\/invoices\/([\w-]+)\/payments$/, ['admin', 'accounts'], c => recordPayment(c.u, c.m[1], c.body));
route('POST', /^\/api\/users$/, ['admin'], c => adminUsers(c.u, 'POST', null, c.body));
route('PUT', /^\/api\/users\/([\w-]+)$/, ['admin'], c => adminUsers(c.u, 'PUT', c.m[1], c.body));
route('POST', /^\/api\/admin\/reset$/, ['admin'], c => resetDemo(c.u, c.body));
route('GET', /^\/api\/audit$/, ['admin'], c => {
  const lim = Math.min(500, parseInt(c.url.searchParams.get('limit'), 10) || 100);
  if (c.url.searchParams.get('kind') === 'signins')
    return { entries: st("SELECT id,ts,user_id,user_name,action,coll,rec_id,summary FROM audit WHERE org=? AND action IN ('login','login_failed','signup') ORDER BY id DESC LIMIT ?").all(ORG, lim) };
  return { entries: st('SELECT id,ts,user_name,action,coll,rec_id,summary FROM audit WHERE org=? ORDER BY id DESC LIMIT ?').all(ORG, lim) };
});
route('GET', /^\/api\/export\/(\w+)\.csv$/, ['admin', 'accounts'], c => {
  const coll = c.m[1]; if (!(CSV_ROLES[c.u.role] || []).includes(coll)) bad('You cannot export ' + coll, 403);
  return { __csv: toCsv(coll), name: coll + '-' + L.today() + '.csv' };
});
route('POST', /^\/api\/tickets$/, '*', c => ticketCreate(c.u, c.body));
route('POST', /^\/api\/tickets\/([\w-]+)$/, '*', c => ticketAct(c.u, c.m[1], c.body));
route('POST', /^\/api\/notifications\/read$/, '*', c => {
  const ids = Array.isArray(c.body.ids) ? new Set(c.body.ids.map(String)) : null;
  let n = 0;
  tx(() => all('notifications').filter(x => x.userId === c.u.id && !x.read && (!ids || ids.has(x.id))).forEach(x => { x.read = true; putQuiet('notifications', x); n++; }));
  return { ok: true, marked: n };
});
route('PUT', /^\/api\/(\w+)\/([\w-]+)$/, '*', c => genericSave(c.u, c.m[1], c.m[2], c.body));
route('POST', /^\/api\/(\w+)$/, '*', c => genericSave(c.u, c.m[1], null, c.body));
route('DELETE', /^\/api\/(\w+)\/([\w-]+)$/, '*', c => {
  const coll = c.m[1], g = GENERIC[coll];
  if (!g) bad('Unknown collection', 404);
  if (!g.roles.includes(c.u.role)) bad('Your role cannot change ' + coll, 403);
  if (coll === 'projects') { if (c.u.role !== 'admin') bad('Only an admin can delete a project', 403); if (all('samples').some(s => s.projectId === c.m[2])) bad('This project has samples and cannot be deleted', 409); }
  else if (!g.deletable) bad('This record cannot be deleted', 405);
  return tx(() => ({ ok: del(coll, c.m[2], c.u) }));
});

/* ---------------- http ---------------- */
function clientIp(req) {                 /* behind Render's proxy the real address is the first X-Forwarded-For entry */
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (xf || req.socket.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 45);
}
function deviceOf(req) {
  const ua = String(req.headers['user-agent'] || '');
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Unknown device';
  const br = /; wv\)|Version\/[\d.]+ Chrome/i.test(ua) && /Android/i.test(ua) ? 'app/webview' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return os + ' ' + br;
}
const whereOf = (req, ip) => deviceOf(req) + ' · ' + ip + (req.headers['cf-ipcountry'] && req.headers['cf-ipcountry'] !== 'XX' ? ' · ' + req.headers['cf-ipcountry'] : '');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleusercontent.com; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
function secure(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Security-Policy', CSP);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', d => { n += d.length; if (n > BODY_LIMIT) { reject(new ApiError(413, 'Request is too large')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new ApiError(400, 'Body is not valid JSON')); }
    });
    req.on('error', reject);
  });
}
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC_DIR, p);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}
const server = http.createServer(async (req, res) => {
  secure(res);
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    try { return serveStatic(req, res, url); } catch (e) { res.writeHead(400); return res.end('Bad request'); }
  }
  try {
    await ready;
    const ip = clientIp(req);
    let hit = null, m = null;
    for (const r of routes) { if (r.method !== req.method) continue; m = r.re.exec(url.pathname); if (m) { hit = r; break; } }
    if (!hit) bad('No such endpoint', 404);
    let u = null;
    if (hit.roles) {
      u = authUser(req); if (!u) bad('Please log in again', 401);
      if (hit.roles !== '*' && !hit.roles.includes(u.role)) bad('Your role cannot do this', 403);
    }
    const body = (req.method === 'GET' || req.method === 'DELETE') ? {} : await readBody(req);
    if (u) ORG = u.org;
    const out = await hit.fn({ req, res, u, m, url, body, ip, verify: module.exports.__verify });
    if (out && out.__csv != null) {
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + out.name + '"', 'Cache-Control': 'no-store' });
      return res.end(out.__csv);
    }
    if (pg && req.method !== 'GET') pg.schedule();
    ok(res, 200, out);
  } catch (e) {
    if (e instanceof ApiError) return ok(res, e.status, { error: e.message });
    console.error(new Date().toISOString(), req.method, req.url, e);
    ok(res, 500, { error: 'Something went wrong on the server' });
  }
});
setInterval(() => { try { st('DELETE FROM sessions WHERE expires<?').run(Date.now()); } catch (e) { /* ignore */ } }, 3600e3).unref();
setInterval(() => { ready.then(() => scanDue()).catch(e => console.error('scanDue', e.message)); }, 5 * 60e3).unref();
if (require.main === module) {
  ready.then(() => scanDue()).catch(() => {});
  server.listen(PORT, HOST, () => console.log('TechAssures Lab on http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT + '  (db: ' + (DATABASE_URL ? 'postgres' : DB_PATH) + ', demo mode: ' + (DEMO ? 'on' : 'off') + ')'));
  const stop = async () => { if (pg) { try { await pg.flush(); } catch (e) { /* ignore */ } } server.close(() => { try { db.close(); } catch (e) { /* ignore */ } process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
module.exports = { server, __scanDue: scanDue, __verify: null, __setKeys: k => { google.jwks = k; google.at = Date.now(); }, __clientId: () => GOOGLE_CLIENT_ID };
