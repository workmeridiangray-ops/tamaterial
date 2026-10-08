'use strict';
// Multi-lab + Google sign-in test (Google is faked with a locally generated RSA key).
const os = require('os'), path = require('path'), fs = require('fs'), crypto = require('crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talab-mt-'));
process.env.DB_PATH = path.join(dir, 't.db'); process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
const { server, __setKeys } = require('../server');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
__setKeys([jwk]);
const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(email, over, key) {
  const pay = Object.assign({ iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, email, email_verified: true, name: email.split('@')[0] }, over || {});
  const head = b({ alg: 'RS256', kid: 'k1', typ: 'JWT' }), body = b(pay);
  return head + '.' + body + '.' + crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), key || privateKey).toString('base64url');
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, p, token, body) => {
    const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; } return { s: r.status, j };
  };
  const h = (await call('GET', '/api/health')).j;
  ok(h.googleClientId === process.env.GOOGLE_CLIENT_ID, 'health exposes the Google client id');
  const bad1 = await call('POST', '/api/google', null, { credential: idToken('x@gmail.com', null, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey) });
  ok(bad1.s === 401, 'token signed with a different key is rejected');
  ok((await call('POST', '/api/google', null, { credential: idToken('x@gmail.com', { aud: 'other' }) })).s === 401, 'token for another app is rejected');
  ok((await call('POST', '/api/google', null, { credential: idToken('x@gmail.com', { exp: 1 }) })).s === 401, 'expired token is rejected');
  ok((await call('POST', '/api/google', null, { credential: idToken('x@gmail.com', { email_verified: false }) })).s === 401, 'unverified email is rejected');

  const g1 = await call('POST', '/api/google', null, { credential: idToken('owner@alpha.com', { name: 'Asha Rao' }) });
  ok(g1.j.signup && g1.j.signup.email === 'owner@alpha.com', 'unknown Google account is offered sign-up');
  ok((await call('POST', '/api/signup', null, { token: g1.j.signup.token + 'x', labName: 'Alpha' })).s === 401, 'tampered sign-up token rejected');
  const su = await call('POST', '/api/signup', null, { token: g1.j.signup.token, labName: 'Alpha Testing Lab' });
  ok(su.s === 200 && su.j.lab === 'alpha-testing-lab' && su.j.user.role === 'admin', 'new lab created, owner is admin');
  const A = su.j.token;
  const ba = (await call('GET', '/api/bootstrap', A)).j;
  ok(ba.org.slug === 'alpha-testing-lab' && !ba.org.demo, 'bootstrap names the lab');
  ok(ba.data.clients.length === 0 && ba.data.samples.length === 0 && ba.data.tests.length === 6, 'new lab starts empty with the test catalogue');
  ok(ba.data.counters.uid === 1, 'new lab UID counter starts at 1');

  const D = (await call('POST', '/api/login', null, { login: 'admin', pin: '1111' })).j.token;
  const bd = (await call('GET', '/api/bootstrap', D)).j;
  ok(bd.org.demo && bd.data.samples.length === 8 && bd.data.counters.uid === 146, 'demo lab untouched');

  // isolation
  const cl = { id: 'c_alpha', code: 'AL-1', name: 'Alpha Client', terms: 'Advance', creditDays: '0' };
  ok((await call('PUT', '/api/clients/c_alpha', A, cl)).s === 200, 'lab A saves a client');
  ok(!(await call('GET', '/api/bootstrap', D)).j.data.clients.some(c => c.id === 'c_alpha'), 'demo lab cannot see lab A client');
  ok((await call('GET', '/api/audit', A)).j.entries.every(e => !/Shree|Rahul/.test(e.summary + e.user_name)), 'audit log is per lab');
  ok((await call('POST', '/api/admin/reset', A, { confirm: 'RESET' })).s === 403, 'real labs cannot be reset');
  ok((await call('GET', '/api/changes?since=0', D)).j.upserts.clients.every(c => c.id !== 'c_alpha'), 'change feed is per lab');

  // invite by email, Google login as member
  const inv = await call('POST', '/api/users', A, { name: 'Ravi Store', email: 'ravi@alpha.com', role: 'store' });
  ok(inv.s === 200 && inv.j.email === 'ravi@alpha.com', 'admin invites a user by email only');
  ok((await call('POST', '/api/users', A, { name: 'Dup', email: 'ravi@alpha.com', role: 'store' })).s === 400, 'duplicate email refused');
  const gr = await call('POST', '/api/google', null, { credential: idToken('ravi@alpha.com') });
  ok(gr.j.token && gr.j.user.role === 'store', 'invited user signs in with Google');
  const brv = (await call('GET', '/api/bootstrap', gr.j.token)).j;
  ok(brv.org.slug === 'alpha-testing-lab' && brv.data.clients.every(c => !c.rates), 'member lands in the right lab with role limits');
  ok((await call('POST', '/api/google', null, { credential: idToken('ravi@alpha.com') })).j.token, 'second login works');
  // PIN user in lab A, with lab code
  ok((await call('POST', '/api/users', A, { name: 'Tess', login: 'tess', pin: '1234', role: 'tester' })).s === 200, 'PIN user added');
  ok((await call('POST', '/api/login', null, { lab: 'alpha-testing-lab', login: 'tess', pin: '1234' })).j.token, 'PIN login with lab code works');
  ok((await call('POST', '/api/login', null, { lab: 'demo', login: 'tess', pin: '1234' })).s === 401, 'same login does not work in another lab');
  ok((await call('POST', '/api/login', null, { lab: 'alpha-testing-lab', login: '', pin: '' })).s === 401, 'Google-only user cannot PIN-login with empty fields');

  // email in two labs -> choose
  const g2 = await call('POST', '/api/google', null, { credential: idToken('multi@x.com') });
  const s2 = await call('POST', '/api/signup', null, { token: g2.j.signup.token, labName: 'Beta Lab' });
  ok(s2.s === 200, 'second lab created');
  await call('POST', '/api/users', A, { name: 'Multi', email: 'multi@x.com', role: 'accounts' });
  const g3 = await call('POST', '/api/google', null, { credential: idToken('multi@x.com') });
  ok(g3.j.choose && g3.j.choose.length === 2, 'member of two labs is asked to choose');
  const g4 = await call('POST', '/api/google', null, { credential: idToken('multi@x.com'), lab: 'beta-lab' });
  ok(g4.j.token && g4.j.user.role === 'admin', 'choosing a lab signs in there');
  ok((await call('POST', '/api/google', null, { credential: idToken('ravi@alpha.com'), lab: 'beta-lab' })).s === 403, 'cannot sign into a lab you are not in');
  // sign-in tracking
  const si = (await call('GET', '/api/audit?kind=signins', A)).j.entries;
  ok(si.some(e => e.action === 'login' && /Google/.test(e.summary)), 'Google sign-ins are recorded with how');
  await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120 Mobile Safari/537.36', 'cf-ipcountry': 'IN' }, body: JSON.stringify({ lab: 'alpha-testing-lab', login: 'tess', pin: '0000' }) });
  await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120 Mobile Safari/537.36', 'cf-ipcountry': 'IN' }, body: JSON.stringify({ lab: 'alpha-testing-lab', login: 'tess', pin: '1234' }) });
  const si2 = (await call('GET', '/api/audit?kind=signins', A)).j.entries;
  ok(si2.some(e => e.action === 'login_failed' && /203\.0\.113\.9/.test(e.summary) && /Android Chrome/.test(e.summary) && /IN/.test(e.summary)), 'failed attempt logged with device, real IP and country');
  ok(si2.some(e => e.action === 'login' && e.user_name === 'Tess' && /PIN · Android Chrome · 203\.0\.113\.9/.test(e.summary)), 'PIN sign-in logged with device and IP');
  ok((await call('GET', '/api/audit?kind=signins', gr.j.token)).s === 403, 'only admins can see sign-ins');
  const bl = await call('POST', '/api/login', null, { lab: 'alpha-testing-lab', login: 'tess', pin: '1234' });
  ok((await call('POST', '/api/logout', bl.j.token, {})).j.ok, 'logout');
  // platform console
  const con = (m, pth, tok, body) => fetch(base + pth, { method: m, headers: { 'Content-Type': 'application/json', 'X-Console': tok || '' }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
  ok((await con('GET', '/api/console/overview', '')).s === 401, 'console needs sign-in');
  ok((await call('POST', '/api/console/login', null, { credential: idToken('stranger@gmail.com') })).s === 403, 'console refuses a stranger');
  const ccl = await call('POST', '/api/console/login', null, { credential: idToken('work.meridiangray@gmail.com') });
  ok(ccl.j.token && ccl.j.owner, 'owner signs in to the console');
  const ov = await con('GET', '/api/console/overview', ccl.j.token);
  ok(ov.j.labs.length >= 2 && ov.j.labs.some(x => x.slug === 'alpha-testing-lab'), 'console lists all labs');
  ok((await con('POST', '/api/console/team', ccl.j.token, { email: 'helper@gmail.com' })).j.team.length === 1, 'owner adds a team member');
  const hl = await call('POST', '/api/console/login', null, { credential: idToken('helper@gmail.com') });
  ok(hl.j.token && !hl.j.owner, 'team member signs in');
  ok((await con('POST', '/api/console/team', hl.j.token, { email: 'x@y.com' })).s === 403, 'team member cannot add people');
  const lv = await con('GET', '/api/console/lab/alpha-testing-lab', hl.j.token);
  ok(lv.j.users.length >= 1 && !JSON.stringify(lv.j).includes('"hash"'), 'console shows a lab without password hashes');
  const bk = await fetch(base + '/api/console/lab/alpha-testing-lab/backup', { headers: { 'X-Console': hl.j.token } });
  ok(bk.ok && (await bk.json()).data.users.length >= 1, 'console backup works');
  ok((await con('POST', '/api/console/lab/alpha-testing-lab', hl.j.token, { suspended: true })).j.lab.suspended, 'lab can be suspended');
  ok((await call('POST', '/api/login', null, { lab: 'alpha-testing-lab', login: 'tess', pin: '1234' })).s === 403, 'suspended lab cannot sign in');
  ok((await call('GET', '/api/bootstrap', gr.j.token)).s === 401, 'suspended lab sessions end');
  await con('POST', '/api/console/lab/alpha-testing-lab', hl.j.token, { suspended: false });
  ok((await call('POST', '/api/login', null, { lab: 'alpha-testing-lab', login: 'tess', pin: '1234' })).s === 200, 'lab works again after reactivation');
  await con('POST', '/api/console/team', ccl.j.token, { email: 'helper@gmail.com', remove: true });
  ok((await call('POST', '/api/console/login', null, { credential: idToken('helper@gmail.com') })).s === 403, 'removed member loses access');
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); server.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
