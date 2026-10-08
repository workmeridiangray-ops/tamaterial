'use strict';
/* Durable storage on Postgres (Neon/Supabase). The server keeps its fast local SQLite copy;
   this module restores it from Postgres at start-up and mirrors every change back. */
const { Pool } = require('pg');
module.exports = function pgsync(url, db) {
  const pool = new Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  let pushedRev = 0, pushedAudit = 0, timer = null, running = false, again = false, lastErr = '';
  const all = (sql, a) => db.prepare(sql).all(...(a || []));
  async function init() {
    await pool.query(`CREATE TABLE IF NOT EXISTS records(coll TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,rev BIGINT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(coll,id));
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id BIGINT PRIMARY KEY,ts TEXT NOT NULL,user_id TEXT,user_name TEXT,action TEXT NOT NULL,coll TEXT,rec_id TEXT,summary TEXT);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires BIGINT NOT NULL);`);
    const rec = (await pool.query('SELECT * FROM records')).rows;
    if (!rec.length) return false;                       /* empty remote: local seed will be pushed */
    const ir = db.prepare('INSERT OR REPLACE INTO records(coll,id,data,rev,deleted) VALUES(?,?,?,?,?)');
    const im = db.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)');
    const ia = db.prepare('INSERT OR REPLACE INTO audit(id,ts,user_id,user_name,action,coll,rec_id,summary) VALUES(?,?,?,?,?,?,?,?)');
    const is = db.prepare('INSERT OR REPLACE INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)');
    db.exec('BEGIN');
    rec.forEach(r => { ir.run(r.coll, r.id, r.data, +r.rev, r.deleted); pushedRev = Math.max(pushedRev, +r.rev); });
    (await pool.query('SELECT * FROM meta')).rows.forEach(r => im.run(r.k, r.v));
    (await pool.query('SELECT * FROM audit')).rows.forEach(r => { ia.run(+r.id, r.ts, r.user_id, r.user_name, r.action, r.coll, r.rec_id, r.summary); pushedAudit = Math.max(pushedAudit, +r.id); });
    (await pool.query('SELECT * FROM sessions WHERE expires>$1', [Date.now()])).rows.forEach(r => is.run(r.token_hash, r.user_id, +r.expires));
    db.exec('COMMIT');
    return true;
  }
  async function flushNow() {
    const recs = all('SELECT * FROM records WHERE rev>?', [pushedRev]);
    const aud = all('SELECT * FROM audit WHERE id>?', [pushedAudit]);
    const meta = all('SELECT * FROM meta');
    const ses = all('SELECT * FROM sessions');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (const r of recs) await c.query('INSERT INTO records(coll,id,data,rev,deleted) VALUES($1,$2,$3,$4,$5) ON CONFLICT(coll,id) DO UPDATE SET data=EXCLUDED.data,rev=EXCLUDED.rev,deleted=EXCLUDED.deleted', [r.coll, r.id, r.data, r.rev, r.deleted]);
      for (const a of aud) await c.query('INSERT INTO audit(id,ts,user_id,user_name,action,coll,rec_id,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING', [a.id, a.ts, a.user_id, a.user_name, a.action, a.coll, a.rec_id, a.summary]);
      for (const m of meta) await c.query('INSERT INTO meta(k,v) VALUES($1,$2) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v', [m.k, m.v]);
      await c.query('DELETE FROM sessions');
      for (const s of ses) await c.query('INSERT INTO sessions(token_hash,user_id,expires) VALUES($1,$2,$3)', [s.token_hash, s.user_id, s.expires]);
      await c.query('COMMIT');
      recs.forEach(r => { pushedRev = Math.max(pushedRev, r.rev); });
      aud.forEach(a => { pushedAudit = Math.max(pushedAudit, a.id); });
      lastErr = '';
    } catch (e) { try { await c.query('ROLLBACK'); } catch (x) { /* ignore */ } lastErr = e.message; console.error('pg sync failed:', e.message); }
    finally { c.release(); }
  }
  async function run() {
    if (running) { again = true; return; }
    running = true;
    try { await flushNow(); } finally { running = false; if (again) { again = false; schedule(); } }
  }
  function schedule() { if (!timer) timer = setTimeout(() => { timer = null; run(); }, 300); }
  async function flush() { if (timer) { clearTimeout(timer); timer = null; } while (running) await new Promise(r => setTimeout(r, 20)); await flushNow(); }
  return { init, schedule, flush, status: () => lastErr };
};
