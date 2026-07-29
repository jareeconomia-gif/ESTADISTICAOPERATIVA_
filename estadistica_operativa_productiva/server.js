'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT, 'backups');
const DB_PATH = path.join(DATA_DIR, 'estadistica-operativa.sqlite');
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS || 7));
const MAX_BODY = 15 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('responsable','autorizador','directivo','maestro')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    project TEXT,
    period TEXT,
    status TEXT,
    stage TEXT,
    responsible_user_id TEXT,
    created_by_user_id TEXT,
    a1_user_id TEXT,
    a2_user_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_requests_responsible ON requests(responsible_user_id);
  CREATE INDEX IF NOT EXISTS idx_requests_a1 ON requests(a1_user_id);
  CREATE INDEX IF NOT EXISTS idx_requests_a2 ON requests(a2_user_id);
  CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
  CREATE TABLE IF NOT EXISTS portal_activity (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_login_at TEXT,
    last_login_iso TEXT
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  );
`);

const DEFAULT_USERS = [
  ['u-oscar-tapia','oscar.tapia','Volumetria2026','Oscar Hugo Tapia Arias','Ingeniero de Seguimiento RMSO','responsable'],
  ['u-carlos-montes','carlos.montes','Volumetria2026','Carlos Díaz Montes Ceballos','Ingeniero de Seguimiento RMSO','responsable'],
  ['u-mario-gonzalez','mario.gonzalez','Volumetria2026','Mario Alberto Gonzalez Rodriguez','Ingeniero de Seguimiento RMSO','responsable'],
  ['u-generosa-suarez','generosa.suarez','Volumetria2026','Generosa Suárez Herrera','Auxiliar Logístico','responsable'],
  ['u-ivan-vargas','ivan.vargas','Volumetria2026','Iván Vargas Magos','Ingeniero de Seguimiento RMNE','responsable'],
  ['u-eliseo-madrigal','eliseo.madrigal','Volumetria2026','Eliseo Madrigal Hernandez','Ingeniero de Seguimiento RMSO','responsable'],
  ['u-oscar-lanz','oscar.lanz','Volumetria2026','Oscar Eduardo Lanz Jimenez','Subdirector de Operaciones RMSO','autorizador'],
  ['u-candido-carmona','candido.carmona','Volumetria2026','Candido Carmona Limón','Director de Operaciones RMSO','autorizador'],
  ['u-david-corona','david.corona','Volumetria2026','David de Jesús Corona Álvarez','Director de Operaciones RMNE','autorizador'],
  ['u-rene-rendon','rene.rendon','Volumetria2026','René Rendón','Director Ejecutivo','directivo'],
  ['u-edgar-montenegro','edgar.montenegro','Admin2026','Edgar Omar Montenegro','Administrador','maestro']
];

const DEFAULT_PROJECTS = [
  {name:'Iron Horse',responsibleUserId:'u-oscar-tapia',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['times','interventions']},
  {name:'Grand Cayon',responsibleUserId:'u-oscar-tapia',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['times','interventions']},
  {name:'Blue Eagle',responsibleUserId:'u-carlos-montes',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['times','drainage','transfer']},
  {name:'Ocean Intrepid',responsibleUserId:'u-mario-gonzalez',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['times','interventions']},
  {name:'Phoenix',responsibleUserId:'u-oscar-tapia',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['times','interventions']},
  {name:'Blue Star',responsibleUserId:'u-generosa-suarez',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['times','interventions']},
  {name:'Bluefinn',responsibleUserId:'u-generosa-suarez',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['times','interventions']},
  {name:'Yaki',responsibleUserId:'u-ivan-vargas',a1UserId:'u-david-corona',a2UserId:'u-david-corona',blocks:['times','interventions']},
  {name:'Sellados',responsibleUserId:'u-eliseo-madrigal',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['interventions']},
  {name:'Aforo RMSO',responsibleUserId:'u-eliseo-madrigal',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['interventions']},
  {name:'Membranas',responsibleUserId:'u-eliseo-madrigal',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['interventions']},
  {name:'Bombeo Continuo',responsibleUserId:'u-eliseo-madrigal',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['interventions']},
  {name:'Bajantes',responsibleUserId:'u-eliseo-madrigal',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['interventions']},
  {name:'Motocompresores',responsibleUserId:'u-eliseo-madrigal',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['interventions']},
  {name:'Portátiles',responsibleUserId:'u-ivan-vargas',a1UserId:'u-david-corona',a2UserId:'u-david-corona',blocks:['interventions']},
  {name:'Aforo RMNE',responsibleUserId:'u-ivan-vargas',a1UserId:'u-david-corona',a2UserId:'u-david-corona',blocks:['interventions']},
  {name:'Motocompresores TMDB',responsibleUserId:'u-eliseo-madrigal',a1UserId:'u-oscar-lanz',a2UserId:'u-candido-carmona',blocks:['interventions']}
];

function nowIso() { return new Date().toISOString(); }
function localStamp() { return new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }); }
function normalize(v) { return String(v || '').trim().toLocaleLowerCase('es-MX'); }
function safeJsonParse(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, encoded) {
  const [kind, salt, expected] = String(encoded || '').split('$');
  if (kind !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function publicUser(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, name: row.name, position: row.position, role: row.role };
}
function audit(userId, action, entityType, entityId = '', details = null) {
  db.prepare('INSERT INTO audit_log(user_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?)')
    .run(userId || null, action, entityType, entityId ? String(entityId) : null, details ? JSON.stringify(details) : null, nowIso());
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (!count) {
    const insert = db.prepare('INSERT INTO users(id,username,password_hash,name,position,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
    const stamp = nowIso();
    db.exec('BEGIN');
    try {
      for (const [id, username, password, name, position, role] of DEFAULT_USERS) {
        insert.run(id, username, hashPassword(password), name, position, role, stamp, stamp);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (!getSetting('projects')) setSetting('projects', DEFAULT_PROJECTS, 'system');
}
seed();

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? safeJsonParse(row.value, null) : null;
}
function setSetting(key, value, userId) {
  db.prepare(`INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .run(key, JSON.stringify(value), nowIso(), userId || null);
}

function parseCookies(req) {
  const result = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    result[decodeURIComponent(part.slice(0, index).trim())] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}
function isSecureRequest(req) {
  return process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
}
function setSessionCookie(res, token, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `vol_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `vol_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
function getAuth(req) {
  const token = parseCookies(req).vol_session;
  if (!token) return null;
  const row = db.prepare(`SELECT s.token_hash,s.expires_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND u.active=1`).get(hashToken(token));
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    if (row) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(row.token_hash);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(nowIso(), row.token_hash);
  return publicUser(row);
}
function requireAuth(req, res) {
  const user = getAuth(req);
  if (!user) {
    json(res, 401, { error: 'Sesión no válida o vencida.' });
    return null;
  }
  return user;
}
function assertSameOrigin(req, res) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || (isSecureRequest(req) ? 'https' : 'http');
  if (origin !== `${protocol}://${host}`) {
    json(res, 403, { error: 'Origen no permitido.' });
    return false;
  }
  return true;
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}
function json(res, status, payload) {
  securityHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('El contenido supera el límite permitido.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON no válido.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

const loginAttempts = new Map();
function allowLogin(ip) {
  const now = Date.now();
  const recent = (loginAttempts.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
  if (recent.length >= 12) return false;
  recent.push(now);
  loginAttempts.set(ip, recent);
  return true;
}
function resetLoginAttempts(ip) { loginAttempts.delete(ip); }

function listUsers() {
  return db.prepare('SELECT id,username,name,position,role FROM users WHERE active=1 ORDER BY name').all();
}
function listPortalActivity() {
  const result = {};
  for (const row of db.prepare('SELECT * FROM portal_activity').all()) {
    result[row.user_id] = { lastLoginAt: row.last_login_at || '', lastLoginIso: row.last_login_iso || '' };
  }
  return result;
}
function allRequestRows() { return db.prepare('SELECT * FROM requests').all(); }
function rowPayload(row) { return safeJsonParse(row.payload, {}); }
function canReadRequest(user, payload) {
  if (user.role === 'maestro' || user.role === 'directivo') return true;
  if (user.role === 'responsable') return payload.responsibleUserId === user.id || payload.createdByUserId === user.id;
  if (user.role === 'autorizador') return payload.a1UserId === user.id || payload.a2UserId === user.id;
  return false;
}
function listRequestsFor(user) {
  return allRequestRows().map(rowPayload).filter(payload => canReadRequest(user, payload));
}
function requestMeta(payload) {
  return {
    id: String(payload.id),
    payload: JSON.stringify(payload),
    project: String(payload.project || ''),
    period: String(payload.period || ''),
    status: String(payload.status || ''),
    stage: String(payload.stage || ''),
    responsibleUserId: String(payload.responsibleUserId || ''),
    createdByUserId: String(payload.createdByUserId || ''),
    a1UserId: String(payload.a1UserId || ''),
    a2UserId: String(payload.a2UserId || ''),
    updatedAt: nowIso()
  };
}
function upsertRequest(payload) {
  const m = requestMeta(payload);
  db.prepare(`INSERT INTO requests(id,payload,project,period,status,stage,responsible_user_id,created_by_user_id,a1_user_id,a2_user_id,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,project=excluded.project,period=excluded.period,status=excluded.status,
    stage=excluded.stage,responsible_user_id=excluded.responsible_user_id,created_by_user_id=excluded.created_by_user_id,
    a1_user_id=excluded.a1_user_id,a2_user_id=excluded.a2_user_id,updated_at=excluded.updated_at`)
    .run(m.id,m.payload,m.project,m.period,m.status,m.stage,m.responsibleUserId,m.createdByUserId,m.a1UserId,m.a2UserId,m.updatedAt);
}
function validateRequestPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('Registro no válido.'), { statusCode: 400 });
  if (payload.id === undefined || payload.id === null || payload.id === '') throw Object.assign(new Error('El registro no tiene identificador.'), { statusCode: 400 });
  if (JSON.stringify(payload).length > 2_000_000) throw Object.assign(new Error('El registro es demasiado grande.'), { statusCode: 413 });
  for (const key of ['times','drainage','transfer','interventions']) if (payload[key] !== undefined && !Array.isArray(payload[key])) throw Object.assign(new Error(`El bloque ${key} no es válido.`), { statusCode: 400 });
  return payload;
}
function projectFor(name) {
  const projects = getSetting('projects') || DEFAULT_PROJECTS;
  return projects.find(p => normalize(p.name) === normalize(name));
}
function preserveOperationalFields(existing, incoming) {
  const allowed = new Set([
    'comments1','comments2','decision1','decision2','decision1By','decision2By','approved1At','approved2At',
    'approval1OpenedAt','approval1OpenedIso','approval2OpenedAt','approval2OpenedIso','approval2AssignedAt','approval2AssignedIso',
    'status','stage','updatedAt','updatedByName'
  ]);
  const result = { ...existing };
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(incoming, key)) result[key] = incoming[key];
  return result;
}
function validApproverTransition(user, existing, incoming) {
  const isFirst = existing.status === 'Pendiente' && existing.stage === 'Primer autorizador' && existing.a1UserId === user.id;
  const isSecond = existing.status === 'Pendiente' && existing.stage === 'Segundo autorizador' && existing.a2UserId === user.id;
  const onlyOpen = incoming.stage === existing.stage && incoming.status === existing.status;
  if (onlyOpen) {
    const protectedFields = ['comments1','comments2','decision1','decision2','decision1By','decision2By','approved1At','approved2At','approval2AssignedAt','approval2AssignedIso'];
    return protectedFields.every(key => JSON.stringify(incoming[key] ?? '') === JSON.stringify(existing[key] ?? ''));
  }
  if (isFirst) {
    const approved = incoming.decision1 === 'Aprobado' && incoming.stage === 'Segundo autorizador' && incoming.status === 'Pendiente';
    const rejected = incoming.decision1 === 'Rechazado' && incoming.stage === 'Finalizado' && incoming.status === 'Rechazado';
    return approved || rejected;
  }
  if (isSecond) {
    const approved = incoming.decision2 === 'Aprobado' && incoming.stage === 'Finalizado' && incoming.status === 'Aprobado';
    const rejected = incoming.decision2 === 'Rechazado' && incoming.stage === 'Finalizado' && incoming.status === 'Rechazado';
    return approved || rejected;
  }
  return false;
}
function syncRequests(user, incomingList) {
  if (!Array.isArray(incomingList)) throw Object.assign(new Error('La lista de registros no es válida.'), { statusCode: 400 });
  if (incomingList.length > 10000) throw Object.assign(new Error('Demasiados registros en una sola operación.'), { statusCode: 413 });

  const incoming = incomingList.map(validateRequestPayload);
  const existingRows = allRequestRows();
  const existingMap = new Map(existingRows.map(row => [String(row.id), rowPayload(row)]));
  const incomingIds = new Set(incoming.map(item => String(item.id)));

  db.exec('BEGIN IMMEDIATE');
  try {
    if (user.role === 'directivo') throw Object.assign(new Error('El usuario directivo tiene acceso de consulta.'), { statusCode: 403 });

    for (const item of incoming) {
      const id = String(item.id);
      const old = existingMap.get(id);
      if (user.role === 'maestro') {
        upsertRequest(item);
        audit(user.id, old ? 'update' : 'create', 'request', id, { status: item.status, stage: item.stage });
        continue;
      }
      if (user.role === 'responsable') {
        if (old) {
          if (old.responsibleUserId !== user.id && old.createdByUserId !== user.id) continue;
          if (old.status !== 'Borrador' || old.stage !== 'Borrador') continue;
          const nextStatus = item.status === 'Pendiente' ? 'Pendiente' : 'Borrador';
          const nextStage = nextStatus === 'Pendiente' ? 'Primer autorizador' : 'Borrador';
          const merged = {
            ...item,
            id: old.id,
            status: nextStatus,
            stage: nextStage,
            responsibleUserId: old.responsibleUserId,
            createdByUserId: old.createdByUserId,
            responsible: old.responsible,
            a1UserId: old.a1UserId,
            a2UserId: old.a2UserId,
            a1: old.a1,
            a2: old.a2,
            blocks: old.blocks,
            comments1: '', comments2: '', decision1: '', decision2: '', decision1By: '', decision2By: '',
            approved1At: '', approved2At: ''
          };
          upsertRequest(merged);
          audit(user.id, 'update', 'request', id, { status: merged.status, stage: merged.stage });
        } else {
          const project = projectFor(item.project);
          if (!project || project.responsibleUserId !== user.id) continue;
          const responsible = db.prepare('SELECT name FROM users WHERE id=?').get(user.id);
          const a1 = db.prepare('SELECT name FROM users WHERE id=?').get(project.a1UserId);
          const a2 = db.prepare('SELECT name FROM users WHERE id=?').get(project.a2UserId);
          const safeStatus = item.status === 'Borrador' ? 'Borrador' : 'Pendiente';
          const safe = {
            ...item,
            status: safeStatus,
            stage: safeStatus === 'Borrador' ? 'Borrador' : 'Primer autorizador',
            responsibleUserId: user.id,
            createdByUserId: user.id,
            responsible: responsible?.name || item.responsible || '',
            a1UserId: project.a1UserId,
            a2UserId: project.a2UserId,
            a1: a1?.name || item.a1 || '',
            a2: a2?.name || item.a2 || '',
            blocks: project.blocks
          };
          upsertRequest(safe);
          audit(user.id, 'create', 'request', id, { status: safe.status, stage: safe.stage });
        }
        continue;
      }
      if (user.role === 'autorizador' && old && (old.a1UserId === user.id || old.a2UserId === user.id)) {
        if (!validApproverTransition(user, old, item)) continue;
        const merged = preserveOperationalFields(old, item);
        upsertRequest(merged);
        audit(user.id, 'approval_update', 'request', id, { status: merged.status, stage: merged.stage });
      }
    }

    if (user.role === 'maestro') {
      for (const old of existingMap.values()) {
        if (!incomingIds.has(String(old.id))) {
          db.prepare('DELETE FROM requests WHERE id=?').run(String(old.id));
          audit(user.id, 'delete', 'request', old.id, { folio: old.folio, project: old.project });
        }
      }
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return listRequestsFor(user);
}

async function createBackupFile(label = 'auto') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `${label}-${stamp}.sqlite`);
  await backup(db, target);
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(name => name.endsWith('.sqlite'))
    .map(name => ({ name, path: path.join(BACKUP_DIR, name), mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const file of files.slice(14)) fs.rmSync(file.path, { force: true });
  return target;
}
setTimeout(() => createBackupFile('startup').catch(console.error), 1500);
setInterval(() => createBackupFile('auto').catch(console.error), 24 * 60 * 60 * 1000).unref();
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}, 60 * 60 * 1000).unref();

const MIME = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml',
  '.ico':'image/x-icon','.webmanifest':'application/manifest+json'
};
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  rel = decodeURIComponent(rel);
  const filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) return json(res, 403, { error: 'Ruta no permitida.' });
  let finalPath = filePath;
  if (!fs.existsSync(finalPath) || fs.statSync(finalPath).isDirectory()) finalPath = path.join(PUBLIC_DIR, 'index.html');
  securityHeaders(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[path.extname(finalPath).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', path.basename(finalPath) === 'index.html' ? 'no-cache' : 'public, max-age=3600');
  fs.createReadStream(finalPath).pipe(res);
}

async function handleApi(req, res, pathname) {
  if (!assertSameOrigin(req, res)) return;

  if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, service: 'estadistica-operativa', time: nowIso() });

  if (req.method === 'POST' && pathname === '/api/login') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (!allowLogin(ip)) return json(res, 429, { error: 'Demasiados intentos. Intenta nuevamente más tarde.' });
    const body = await readJson(req);
    const username = normalize(body.username);
    const row = db.prepare('SELECT * FROM users WHERE lower(username)=? AND active=1').get(username);
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      audit(row?.id || null, 'login_failed', 'session', '', { ip });
      return json(res, 401, { error: 'Usuario o contraseña incorrectos.' });
    }
    resetLoginAttempts(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)')
      .run(hashToken(token), row.id, expires, nowIso(), nowIso());
    const stamp = localStamp();
    db.prepare(`INSERT INTO portal_activity(user_id,last_login_at,last_login_iso) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET last_login_at=excluded.last_login_at,last_login_iso=excluded.last_login_iso`)
      .run(row.id, stamp, nowIso());
    setSessionCookie(res, token, req);
    audit(row.id, 'login', 'session', '', { ip });
    return json(res, 200, { user: publicUser(row) });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    const token = parseCookies(req).vol_session;
    const user = getAuth(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    clearSessionCookie(res, req);
    if (user) audit(user.id, 'logout', 'session');
    return json(res, 200, { ok: true });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET' && pathname === '/api/me') return json(res, 200, { user });
  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    return json(res, 200, {
      user,
      users: listUsers(),
      projects: getSetting('projects') || DEFAULT_PROJECTS,
      catalogs: getSetting('catalogs'),
      portalActivity: listPortalActivity(),
      requests: listRequestsFor(user)
    });
  }

  if (req.method === 'PUT' && pathname === '/api/requests/sync') {
    const body = await readJson(req);
    const list = syncRequests(user, body.requests);
    return json(res, 200, { ok: true, requests: list });
  }

  if (req.method === 'PUT' && (pathname === '/api/state/projects' || pathname === '/api/state/catalogs')) {
    if (user.role !== 'maestro') return json(res, 403, { error: 'Solo el administrador puede modificar la configuración.' });
    const body = await readJson(req);
    const key = pathname.endsWith('/projects') ? 'projects' : 'catalogs';
    if (key === 'projects' && !Array.isArray(body.value)) return json(res, 400, { error: 'La configuración de proyectos no es válida.' });
    if (key === 'catalogs' && (!body.value || typeof body.value !== 'object' || Array.isArray(body.value))) return json(res, 400, { error: 'La configuración de catálogos no es válida.' });
    setSetting(key, body.value, user.id);
    audit(user.id, 'update', 'setting', key);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/change-password') {
    const body = await readJson(req);
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
    if (!verifyPassword(body.currentPassword, row.password_hash)) return json(res, 400, { error: 'La contraseña actual no es correcta.' });
    const next = String(body.newPassword || '');
    if (next.length < 10 || !/[A-ZÁÉÍÓÚÑ]/i.test(next) || !/\d/.test(next)) return json(res, 400, { error: 'La nueva contraseña debe tener al menos 10 caracteres e incluir letras y números.' });
    db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(hashPassword(next), nowIso(), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id, hashToken(parseCookies(req).vol_session || ''));
    audit(user.id, 'change_password', 'user', user.id);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/migrate') {
    if (user.role !== 'maestro') return json(res, 403, { error: 'Solo el administrador puede migrar datos.' });
    const body = await readJson(req);
    if (Array.isArray(body.projects)) setSetting('projects', body.projects, user.id);
    if (body.catalogs && typeof body.catalogs === 'object') setSetting('catalogs', body.catalogs, user.id);
    if (Array.isArray(body.requests)) syncRequests(user, body.requests);
    audit(user.id, 'migrate', 'system', '', { requests: Array.isArray(body.requests) ? body.requests.length : 0 });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/admin/audit') {
    if (user.role !== 'maestro') return json(res, 403, { error: 'Acceso restringido.' });
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500').all();
    return json(res, 200, { audit: rows.map(row => ({ ...row, details: safeJsonParse(row.details, null) })) });
  }

  if (req.method === 'GET' && pathname === '/api/admin/backup') {
    if (user.role !== 'maestro') return json(res, 403, { error: 'Acceso restringido.' });
    const payload = {
      generatedAt: nowIso(),
      users: listUsers(),
      projects: getSetting('projects') || DEFAULT_PROJECTS,
      catalogs: getSetting('catalogs'),
      requests: allRequestRows().map(rowPayload),
      portalActivity: listPortalActivity(),
      audit: db.prepare('SELECT * FROM audit_log ORDER BY id').all()
    };
    audit(user.id, 'backup_export', 'system');
    securityHeaders(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="respaldo-estadistica-operativa-${new Date().toISOString().slice(0,10)}.json"`);
    return res.end(JSON.stringify(payload, null, 2));
  }

  return json(res, 404, { error: 'Ruta de API no encontrada.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url.pathname);
    else serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Ocurrió un error interno.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Estadística Operativa disponible en http://${HOST}:${PORT}`);
  console.log(`Base de datos: ${DB_PATH}`);
});

function shutdown() {
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
