'use strict';
/* Outbound email (Brevo or Resend over HTTPS) and Web Push (VAPID + RFC 8291), with no dependencies. */
const crypto = require('node:crypto');

const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = s => Buffer.from(String(s), 'base64url');

/* ---------- email ---------- */
const mailOn = () => !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) && !!process.env.MAIL_FROM;
function parseFrom(f) {            /* "Name <a@b.com>" or "a@b.com" */
  const m = String(f).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, '') || 'TechAssures Lab', email: m[2] } : { name: 'TechAssures Lab', email: String(f).trim() };
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function sendMail({ to, subject, text, link }) {
  if (!mailOn() || !to) return { skipped: true };
  const from = parseFrom(process.env.MAIL_FROM);
  const html = '<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#16233b"><h2 style="margin:0 0 8px;font-size:18px">' + esc(subject) + '</h2><p style="white-space:pre-line;line-height:1.5">' + esc(text) + '</p>' +
    (link ? '<p><a href="' + esc(link) + '" style="background:#1d3a6e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Open TechAssures Lab</a></p>' : '') +
    '<p style="color:#6b7790;font-size:12px">Sent by ' + esc(from.name) + '. You get this because you have an account with an email address.</p></div>';
  const body = text + (link ? '\n\n' + link : '');
  let r;
  if (process.env.BREVO_API_KEY) {
    r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: from, to: [{ email: to }], subject, htmlContent: html, textContent: body }) });
  } else {
    r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from.name + ' <' + from.email + '>', to: [to], subject, html, text: body }) });
  }
  if (!r.ok) throw new Error('mail ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return { sent: true };
}

/* ---------- web push ---------- */
function newVapid() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const j = publicKey.export({ format: 'jwk' });
  const pub = b64u(Buffer.concat([Buffer.from([4]), unb64u(j.x), unb64u(j.y)]));
  return { pub, priv: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}
function vapidHeader(v, endpoint, sub) {
  const aud = new URL(endpoint).origin;
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), c = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub }));
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + c), { key: v.priv, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + h + '.' + c + '.' + b64u(sig) + ', k=' + v.pub;
}
function encrypt(sub, payload) {            /* RFC 8291 aes128gcm */
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), secret = ecdh.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const ci = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([ci.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), ci.final(), ci.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}
function decrypt(uaPriv, uaPub, auth, body) {   /* the receiving side, used by tests */
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(uaPriv);
  const secret = ecdh.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return pt.subarray(0, pt.lastIndexOf(2)).toString();
}
/* returns 'ok' | 'gone' | 'fail' */
async function sendPush(v, sub, payload, sendFn) {
  const body = encrypt(sub, JSON.stringify(payload));
  const headers = { Authorization: vapidHeader(v, sub.endpoint, process.env.VAPID_SUBJECT || 'mailto:work.meridiangray@gmail.com'), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' };
  const r = await (sendFn || fetch)(sub.endpoint, { method: 'POST', headers, body });
  if (r.status === 404 || r.status === 410) return 'gone';
  return r.ok ? 'ok' : 'fail';
}

/* ---------- Firebase Cloud Messaging (HTTP v1) for the Android app ---------- */
let fcmTok = { t: '', exp: 0 };
function fcmAcct() {
  const raw = process.env.FCM_SERVICE_ACCOUNT; if (!raw) return null;
  try { return JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString()); } catch (e) { return null; }
}
const fcmOn = () => !!fcmAcct();
async function fcmToken(a) {
  if (fcmTok.t && Date.now() < fcmTok.exp) return fcmTok.t;
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), c = b64u(JSON.stringify({ iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + c), a.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + h + '.' + c + '.' + b64u(sig) });
  const j = await r.json(); if (!r.ok) throw new Error('fcm auth ' + r.status);
  fcmTok = { t: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return fcmTok.t;
}
/* returns 'ok' | 'gone' | 'fail' | 'off' */
async function sendFcm(token, n, sendFn) {
  const a = fcmAcct(); if (!a) return 'off';
  const r = await (sendFn || fetch)('https://fcm.googleapis.com/v1/projects/' + a.project_id + '/messages:send', { method: 'POST',
    headers: { Authorization: 'Bearer ' + await fcmToken(a), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title: n.title, body: n.body || '' }, data: { url: String(n.url || ''), tag: String(n.tag || '') }, android: { priority: 'HIGH', notification: { tag: String(n.tag || '') } } } }) });
  if (r.status === 404 || r.status === 410) return 'gone';
  return r.ok ? 'ok' : 'fail';
}

module.exports = { fcmOn, sendFcm, mailOn, sendMail, newVapid, vapidHeader, encrypt, decrypt, sendPush, b64u, unb64u };
