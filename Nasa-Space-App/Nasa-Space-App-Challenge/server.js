const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const dbName = process.env.DB_NAME || 'vitals_db';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
};

let pool;
let dbReconnectTimer = null;
let dbReconnectDelay = 5000;
const realtimeClients = new Map();
const presence = new Map();
const presenceRoles = new Set(['crew', 'surgeon', 'ground', 'admin']);
const telemetryCleanupAt = new Map();
const apiSessions = new Map();
const loginFailures = new Map();
const apiAccessPassword = process.env.APP_ACCESS_PASSWORD || '';
const apiSessionDurationMs = 12 * 60 * 60 * 1000;
const apiSessionCookie = 'vitals_session';

async function ensureDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  const bootstrap = mysql.createPool(dbConfig);
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\`
       CHARACTER SET utf8mb4
       COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await bootstrap.end();
  }

  pool = mysql.createPool({ ...dbConfig, database: dbName });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mission_states (
      mission_id VARCHAR(64) PRIMARY KEY,
      payload JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missions (
      mission_id VARCHAR(64) PRIMARY KEY,
      crew_name VARCHAR(120),
      current_day INT NOT NULL DEFAULT 0,
      mode VARCHAR(32) NOT NULL DEFAULT 'simulation',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_logs (
      mission_id VARCHAR(64) NOT NULL,
      day INT NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (mission_id, day)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telemetry_frames (
      mission_id VARCHAR(64) NOT NULL,
      day INT NOT NULL,
      hr INT,
      spo2 INT,
      temp DECIMAL(4,1),
      rad DECIMAL(8,2),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (mission_id, day)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_telemetry (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      mission_id VARCHAR(64) NOT NULL,
      source VARCHAR(24) NOT NULL DEFAULT 'simulation',
      mission_day INT NOT NULL DEFAULT 0,
      hr INT,
      spo2 DECIMAL(4,1),
      temp DECIMAL(4,1),
      observed_at_ms BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX live_telemetry_mission_time_idx (mission_id, observed_at_ms)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telemetry_alerts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      mission_id VARCHAR(64) NOT NULL,
      day INT NOT NULL DEFAULT 0,
      severity VARCHAR(16) NOT NULL,
      code VARCHAR(48) NOT NULL,
      source VARCHAR(24) NOT NULL DEFAULT 'simulation',
      text TEXT NOT NULL,
      occurred_at_ms BIGINT UNSIGNED NOT NULL,
      INDEX telemetry_alerts_mission_time_idx (mission_id, occurred_at_ms)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      mission_id VARCHAR(64) NOT NULL,
      day INT NOT NULL,
      severity VARCHAR(16) NOT NULL,
      text TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX alerts_mission_day_idx (mission_id, day)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comms_messages (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      mission_id VARCHAR(64) NOT NULL,
      day INT NOT NULL,
      message_type VARCHAR(24) NOT NULL,
      severity VARCHAR(16),
      text TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX comms_messages_mission_day_idx (mission_id, day)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS achievements (
      mission_id VARCHAR(64) NOT NULL,
      achievement_key VARCHAR(64) NOT NULL,
      unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (mission_id, achievement_key)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS flight_surgeon_notes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      mission_id VARCHAR(64) NOT NULL,
      day INT NOT NULL,
      alert_index INT,
      status VARCHAR(32) NOT NULL,
      severity VARCHAR(16) NOT NULL,
      note TEXT NOT NULL,
      author VARCHAR(120),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX flight_surgeon_notes_mission_day_idx (mission_id, day)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mission_telemetry (
      mission_id VARCHAR(64) NOT NULL,
      day INT NOT NULL,
      hr INT,
      spo2 INT,
      temp DECIMAL(4,1),
      rad DECIMAL(8,2),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (mission_id, day)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mission_alerts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      mission_id VARCHAR(64) NOT NULL,
      day INT NOT NULL,
      severity VARCHAR(16) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX mission_alerts_mission_day_idx (mission_id, day)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mission_comms (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      mission_id VARCHAR(64) NOT NULL,
      day INT NOT NULL,
      message_type VARCHAR(24) NOT NULL,
      severity VARCHAR(16),
      text TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX mission_comms_mission_day_idx (mission_id, day)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mission_achievements (
      mission_id VARCHAR(64) NOT NULL,
      achievement_key VARCHAR(64) NOT NULL,
      unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (mission_id, achievement_key)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mission_audit_events (
      event_id VARCHAR(64) PRIMARY KEY,
      mission_id VARCHAR(64) NOT NULL,
      mission_day INT NOT NULL DEFAULT 0,
      actor VARCHAR(120) NOT NULL,
      actor_role VARCHAR(32) NOT NULL DEFAULT 'crew',
      action VARCHAR(64) NOT NULL,
      entity_type VARCHAR(48) NOT NULL,
      entity_id VARCHAR(128),
      before_values JSON,
      after_values JSON,
      occurred_at_ms BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX mission_audit_events_timeline_idx (mission_id, occurred_at_ms),
      INDEX mission_audit_events_entity_idx (mission_id, entity_type, entity_id)
    )
  `);
}

function errorPayload(error) {
  return {
    ok: false,
    error: error.message || error.code || 'Unknown database error',
    code: error.code || null
  };
}

function scheduleDatabaseReconnect() {
  if (dbReconnectTimer) return;
  dbReconnectTimer = setTimeout(async () => {
    dbReconnectTimer = null;
    try {
      await ensureDatabase();
      dbReconnectDelay = 5000;
      console.log('MySQL reconnected; database-backed features are available.');
    } catch (error) {
      console.error('MySQL reconnect attempt failed:', error.message || error.code || error);
      dbReconnectDelay = Math.min(60000, dbReconnectDelay * 2);
      scheduleDatabaseReconnect();
    }
  }, dbReconnectDelay);
  dbReconnectTimer.unref?.();
}

function normalizePayload(payload) {
  if (typeof payload !== 'string') return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function sendRealtimeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastMissionState(missionId, event, data) {
  const clients = realtimeClients.get(missionId);
  if (!clients) return;
  for (const client of clients) {
    sendRealtimeEvent(client, event, data);
  }
}

function onlinePresence(missionId) {
  const cutoff = Date.now() - 20000;
  return [...presence.values()]
    .filter(item => item.missionId === missionId && item.lastSeen >= cutoff)
    .map(({ clientId, role, name, lastSeen }) => ({ clientId, role, name, lastSeen }));
}

async function writeStructuredMission(missionId, payload) {
  await pool.execute(
    `INSERT INTO missions (mission_id, crew_name, current_day, mode)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE crew_name = VALUES(crew_name), current_day = VALUES(current_day), mode = VALUES(mode)`,
    [missionId, payload.crewName || 'Commander', payload.day || 0, payload.dataSourceMode || 'simulation']
  );
  await pool.execute('DELETE FROM mission_telemetry WHERE mission_id = ?', [missionId]);
  await pool.execute('DELETE FROM mission_alerts WHERE mission_id = ?', [missionId]);
  await pool.execute('DELETE FROM mission_comms WHERE mission_id = ?', [missionId]);
  await pool.execute('DELETE FROM mission_achievements WHERE mission_id = ?', [missionId]);
  await pool.execute('DELETE FROM daily_logs WHERE mission_id = ?', [missionId]);
  await pool.execute('DELETE FROM telemetry_frames WHERE mission_id = ?', [missionId]);
  await pool.execute('DELETE FROM alerts WHERE mission_id = ?', [missionId]);
  await pool.execute('DELETE FROM comms_messages WHERE mission_id = ?', [missionId]);
  await pool.execute('DELETE FROM achievements WHERE mission_id = ?', [missionId]);
  await pool.execute('DELETE FROM flight_surgeon_notes WHERE mission_id = ?', [missionId]);

  const historyDays = Math.max(0, payload.day || 0);
  for (let day = 0; day <= historyDays; day += 1) {
    const log = {
      day,
      bone: payload.history?.bone?.[day] ?? null,
      cardio: payload.history?.cardio?.[day] ?? null,
      immune: payload.history?.immune?.[day] ?? null,
      radiation: payload.history?.radiation?.[day] ?? null,
      behavioral: payload.history?.behavioral?.[day] ?? null
    };
    await pool.execute(
      `INSERT INTO daily_logs (mission_id, day, payload)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
      [missionId, day, JSON.stringify(log)]
    );
  }

  const telemetry = Array.isArray(payload.telemetry) ? payload.telemetry : [];
  for (const frame of telemetry) {
    await pool.execute(
      `INSERT INTO mission_telemetry (mission_id, day, hr, spo2, temp, rad)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE hr = VALUES(hr), spo2 = VALUES(spo2), temp = VALUES(temp), rad = VALUES(rad)`,
      [missionId, frame.day || 0, frame.hr || null, frame.spo2 || null, frame.temp || null, frame.rad || null]
    );
    await pool.execute(
      `INSERT INTO telemetry_frames (mission_id, day, hr, spo2, temp, rad)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE hr = VALUES(hr), spo2 = VALUES(spo2), temp = VALUES(temp), rad = VALUES(rad)`,
      [missionId, frame.day || 0, frame.hr || null, frame.spo2 || null, frame.temp || null, frame.rad || null]
    );
  }

  const alerts = Array.isArray(payload.alertsHistory) ? payload.alertsHistory : [];
  for (const [index, alert] of alerts.entries()) {
    await pool.execute(
      `INSERT INTO mission_alerts (mission_id, day, severity, text)
       VALUES (?, ?, ?, ?)`,
      [missionId, alert.day || 0, alert.sev || 'ok', alert.text || '']
    );
    await pool.execute(
      `INSERT INTO alerts (mission_id, day, severity, text, status)
       VALUES (?, ?, ?, ?, ?)`,
      [missionId, alert.day || 0, alert.sev || 'ok', alert.text || '', alert.status || 'open']
    );
  }

  const comms = Array.isArray(payload.commsThread) ? payload.commsThread : [];
  for (const message of comms) {
    await pool.execute(
      `INSERT INTO mission_comms (mission_id, day, message_type, severity, text)
       VALUES (?, ?, ?, ?, ?)`,
      [missionId, message.day || 0, message.type || 'auto', message.sev || null, message.text || '']
    );
    await pool.execute(
      `INSERT INTO comms_messages (mission_id, day, message_type, severity, text)
       VALUES (?, ?, ?, ?, ?)`,
      [missionId, message.day || 0, message.type || 'auto', message.sev || null, message.text || '']
    );
  }

  const achievements = Array.isArray(payload.unlocked) ? payload.unlocked : [];
  for (const key of achievements) {
    await pool.execute(
      `INSERT INTO mission_achievements (mission_id, achievement_key)
       VALUES (?, ?)`,
      [missionId, key]
    );
    await pool.execute(
      `INSERT INTO achievements (mission_id, achievement_key)
       VALUES (?, ?)`,
      [missionId, key]
    );
  }

  const notes = Array.isArray(payload.surgeonNotes) ? payload.surgeonNotes : [];
  for (const note of notes) {
    await pool.execute(
      `INSERT INTO flight_surgeon_notes (mission_id, day, alert_index, status, severity, note, author)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [missionId, note.day || 0, note.alertIndex ?? null, note.status || 'reviewed', note.severity || 'watch', note.note || '', note.author || 'Flight Surgeon']
    );
  }
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

app.get('/api/health', async (req, res) => {
  if (!pool) {
    res.status(503).json({ ok: false, error: 'Database offline. Dashboard is running in local/offline mode.', code: 'DB_OFFLINE' });
    return;
  }
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.get('/api/auth/session', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (apiAccessPassword.length < 16) {
    return res.status(503).json({ ok: false, error: 'Server API access is not configured.' });
  }
  const token = (req.headers.cookie || '').split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${apiSessionCookie}=`))
    ?.slice(apiSessionCookie.length + 1);
  const session = token && apiSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (token) apiSessions.delete(token);
    return res.json({ ok: true, authenticated: false });
  }
  res.json({ ok: true, authenticated: true });
});

app.post('/api/auth/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (apiAccessPassword.length < 16) {
    return res.status(503).json({ ok: false, error: 'Set APP_ACCESS_PASSWORD to at least 16 characters.' });
  }
  const now = Date.now();
  for (const [ip, failure] of loginFailures) {
    if (failure.resetAt <= now) loginFailures.delete(ip);
  }
  const ip = req.ip;
  const failure = loginFailures.get(ip);
  if (failure?.count >= 10 && failure.resetAt > now) {
    res.set('Retry-After', String(Math.ceil((failure.resetAt - now) / 1000)));
    return res.status(429).json({ ok: false, error: 'Too many login attempts. Try again later.' });
  }
  const password = req.body?.password;
  const supplied = typeof password === 'string' ? Buffer.from(password) : Buffer.alloc(0);
  const configured = Buffer.from(apiAccessPassword);
  const valid = supplied.length === configured.length && crypto.timingSafeEqual(supplied, configured);
  if (!valid) {
    const current = loginFailures.get(ip);
    loginFailures.set(ip, {
      count: current && current.resetAt > now ? current.count + 1 : 1,
      resetAt: current && current.resetAt > now ? current.resetAt : now + 15 * 60 * 1000
    });
    return res.status(401).json({ ok: false, error: 'Invalid server password.' });
  }
  loginFailures.delete(ip);
  const token = crypto.randomBytes(32).toString('base64url');
  apiSessions.set(token, { expiresAt: now + apiSessionDurationMs });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.set('Set-Cookie', `${apiSessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${apiSessionDurationMs / 1000}${secure}`);
  res.json({ ok: true, authenticated: true });
});

app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers.cookie || '').split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${apiSessionCookie}=`))
    ?.slice(apiSessionCookie.length + 1);
  if (token) apiSessions.delete(token);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.set('Cache-Control', 'no-store');
  res.set('Set-Cookie', `${apiSessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  if (apiAccessPassword.length < 16) {
    return res.status(503).json({ ok: false, error: 'Server API access is not configured.' });
  }
  const token = (req.headers.cookie || '').split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${apiSessionCookie}=`))
    ?.slice(apiSessionCookie.length + 1);
  const session = token && apiSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (token) apiSessions.delete(token);
    return res.status(401).json({ ok: false, error: 'Server login required.' });
  }
  next();
});

app.get('/api/mission-state/:missionId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT payload, updated_at FROM mission_states WHERE mission_id = ?',
      [req.params.missionId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Mission state not found.' });
    res.json({ ok: true, payload: normalizePayload(rows[0].payload), updatedAt: rows[0].updated_at });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.get('/api/mission-state/:missionId/audit', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(10000, Number.parseInt(req.query.limit, 10) || 1000));
    const offset = Math.max(0, Math.min(2147483647, Number.parseInt(req.query.offset, 10) || 0));
    const [rows] = await pool.execute(
      `SELECT event_id, mission_day, actor, actor_role, action, entity_type, entity_id,
              before_values, after_values, occurred_at_ms
       FROM mission_audit_events
       WHERE mission_id = ?
       ORDER BY occurred_at_ms DESC, event_id DESC
       LIMIT ? OFFSET ?`,
      [req.params.missionId, limit, offset]
    );
    res.json({
      ok: true,
      events: rows.map(row => ({
        id: row.event_id,
        day: row.mission_day,
        actor: row.actor,
        role: row.actor_role,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        before: normalizePayload(row.before_values),
        after: normalizePayload(row.after_values),
        timestamp: Number(row.occurred_at_ms)
      }))
    });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.post('/api/mission-state/:missionId/audit', async (req, res) => {
  const event = req.body || {};
  const requiredText = ['id', 'actor', 'role', 'action', 'entityType'];
  if (requiredText.some(key => typeof event[key] !== 'string' || !event[key].trim()) ||
      !Number.isInteger(event.day) || event.day < 0 ||
      !Number.isSafeInteger(event.timestamp) || event.timestamp < 0 ||
      (event.entityId !== undefined && event.entityId !== null && typeof event.entityId !== 'string') ||
      (event.before !== undefined && event.before !== null && typeof event.before !== 'object') ||
      (event.after !== undefined && event.after !== null && typeof event.after !== 'object')) {
    res.status(400).json({ ok: false, error: 'Invalid audit event. Provide actor, role, action, entity type, mission day, and timestamp.' });
    return;
  }
  try {
    await pool.execute(
      `INSERT INTO mission_audit_events
        (event_id, mission_id, mission_day, actor, actor_role, action, entity_type, entity_id,
         before_values, after_values, occurred_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)`,
      [
        event.id.trim().slice(0, 64),
        req.params.missionId,
        event.day,
        event.actor.trim().slice(0, 120),
        event.role.trim().slice(0, 32),
        event.action.trim().slice(0, 64),
        event.entityType.trim().slice(0, 48),
        event.entityId ? event.entityId.slice(0, 128) : null,
        event.before == null ? null : JSON.stringify(event.before),
        event.after == null ? null : JSON.stringify(event.after),
        event.timestamp
      ]
    );
    res.status(201).json({ ok: true, eventId: event.id });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.get('/api/mission-state/:missionId/telemetry', async (req, res) => {
  try {
    const missionId = req.params.missionId;
    const [frames] = await pool.execute(
      `SELECT source, mission_day AS day, hr, spo2, temp, observed_at_ms AS observed_ms
       FROM live_telemetry WHERE mission_id = ? ORDER BY id DESC LIMIT 120`,
      [missionId]
    );
    const [alerts] = await pool.execute(
      `SELECT day, severity, code, source, text, occurred_at_ms AS occurred_ms
       FROM telemetry_alerts WHERE mission_id = ? ORDER BY id DESC LIMIT 100`,
      [missionId]
    );
    res.json({
      ok: true,
      frames: frames.map(frame => ({
        ...frame,
        timestamp: new Date(Number(frame.observed_ms)).toISOString(),
        hr: frame.hr === null ? null : Number(frame.hr),
        spo2: frame.spo2 === null ? null : Number(frame.spo2),
        temp: frame.temp === null ? null : Number(frame.temp)
      })),
      alerts: alerts.map(alert => ({
        ...alert,
        timestamp: new Date(Number(alert.occurred_ms)).toISOString()
      }))
    });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.post('/api/mission-state/:missionId/telemetry', async (req, res) => {
  if (!pool) {
    res.status(503).json({ ok: false, error: 'Telemetry database is offline.', code: 'DB_OFFLINE' });
    return;
  }
  try {
    const { frame, alerts = [] } = req.body || {};
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      return res.status(400).json({ ok: false, error: 'A telemetry frame is required.' });
    }
    if (!['simulation', 'sensor'].includes(frame.source)) {
      return res.status(400).json({ ok: false, error: 'Telemetry source must be simulation or sensor.' });
    }
    const validReading = (value, min, max) => value === null || (
      Number.isFinite(value) && value >= min && value <= max
    );
    if (!validReading(frame.hr, 0, 250) || !validReading(frame.spo2, 0, 100) || !validReading(frame.temp, 25, 45)) {
      return res.status(400).json({ ok: false, error: 'Telemetry readings are outside accepted numeric ranges.' });
    }
    if (!Number.isInteger(frame.day) || frame.day < 0 || frame.day > 180) {
      return res.status(400).json({ ok: false, error: 'Mission day must be between 0 and 180.' });
    }
    if (!Array.isArray(alerts) || alerts.length > 10) {
      return res.status(400).json({ ok: false, error: 'Telemetry alerts must be an array of at most 10 items.' });
    }

    for (const alert of alerts) {
      if (!alert || !['ok', 'watch', 'crit'].includes(alert.severity) || typeof alert.code !== 'string' || typeof alert.text !== 'string') {
        return res.status(400).json({ ok: false, error: 'Each alert requires a valid severity, code, and text.' });
      }
    }

    const timestamp = new Date();
    await pool.execute(
      `INSERT INTO live_telemetry (mission_id, source, mission_day, hr, spo2, temp, observed_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.missionId, frame.source, frame.day, frame.hr, frame.spo2, frame.temp, timestamp.getTime()]
    );
    const broadcastAlerts = [];
    for (const alert of alerts) {
      await pool.execute(
        `INSERT INTO telemetry_alerts (mission_id, day, severity, code, source, text, occurred_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.params.missionId, alert.day ?? frame.day, alert.severity, alert.code.slice(0, 48), frame.source, alert.text.slice(0, 1000), timestamp.getTime()]
      );
      broadcastAlerts.push({ ...alert, source: frame.source, timestamp: timestamp.toISOString() });
    }

    const lastCleanup = telemetryCleanupAt.get(req.params.missionId) || 0;
    if (Date.now() - lastCleanup > 60000) {
      telemetryCleanupAt.set(req.params.missionId, Date.now());
      await pool.execute(
        `DELETE FROM live_telemetry
         WHERE mission_id = ? AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM live_telemetry WHERE mission_id = ? ORDER BY id DESC LIMIT 500
           ) AS recent_frames
         )`,
        [req.params.missionId, req.params.missionId]
      );
      await pool.execute(
        `DELETE FROM telemetry_alerts
         WHERE mission_id = ? AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM telemetry_alerts WHERE mission_id = ? ORDER BY id DESC LIMIT 500
           ) AS recent_alerts
         )`,
        [req.params.missionId, req.params.missionId]
      );
    }

    const telemetryEvent = {
      ok: true,
      sourceClientId: frame.sourceClientId || null,
      frame: {
        source: frame.source,
        day: frame.day,
        hr: frame.hr,
        spo2: frame.spo2,
        temp: frame.temp,
        timestamp: timestamp.toISOString()
      },
      alerts: broadcastAlerts
    };
    broadcastMissionState(req.params.missionId, 'telemetry', telemetryEvent);
    res.json({ ok: true, timestamp: timestamp.toISOString() });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.post('/api/mission-state/:missionId/telemetry/alerts', async (req, res) => {
  if (!pool) {
    res.status(503).json({ ok: false, error: 'Telemetry database is offline.', code: 'DB_OFFLINE' });
    return;
  }
  try {
    const { alerts } = req.body || {};
    if (!Array.isArray(alerts) || !alerts.length || alerts.length > 10) {
      return res.status(400).json({ ok: false, error: 'Provide between 1 and 10 telemetry alerts.' });
    }
    for (const alert of alerts) {
      if (!alert || !['ok', 'watch', 'crit'].includes(alert.severity) || typeof alert.code !== 'string' || typeof alert.text !== 'string') {
        return res.status(400).json({ ok: false, error: 'Each alert requires a valid severity, code, and text.' });
      }
    }
    const timestamp = new Date();
    const broadcastAlerts = [];
    for (const alert of alerts) {
      const source = alert.source === 'sensor' ? 'sensor' : 'simulation';
      await pool.execute(
        `INSERT INTO telemetry_alerts (mission_id, day, severity, code, source, text, occurred_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.params.missionId, alert.day || 0, alert.severity, alert.code.slice(0, 48), source, alert.text.slice(0, 1000), timestamp.getTime()]
      );
      broadcastAlerts.push({ ...alert, source, timestamp: timestamp.toISOString() });
    }
    const lastCleanup = telemetryCleanupAt.get(req.params.missionId) || 0;
    if (Date.now() - lastCleanup > 60000) {
      telemetryCleanupAt.set(req.params.missionId, Date.now());
      await pool.execute(
        `DELETE FROM telemetry_alerts
         WHERE mission_id = ? AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM telemetry_alerts WHERE mission_id = ? ORDER BY id DESC LIMIT 500
           ) AS recent_alerts
         )`,
        [req.params.missionId, req.params.missionId]
      );
    }
    broadcastMissionState(req.params.missionId, 'telemetry', {
      ok: true,
      sourceClientId: req.body.sourceClientId || null,
      alerts: broadcastAlerts
    });
    res.json({ ok: true, timestamp: timestamp.toISOString() });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.get('/api/mission-state/:missionId/stream', async (req, res) => {
  const missionId = req.params.missionId;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  if (!realtimeClients.has(missionId)) realtimeClients.set(missionId, new Set());
  realtimeClients.get(missionId).add(res);
  sendRealtimeEvent(res, 'connected', { ok: true, missionId });
  const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000);

  try {
    const [rows] = await pool.execute(
      'SELECT payload, updated_at FROM mission_states WHERE mission_id = ?',
      [missionId]
    );
    if (rows.length) {
      sendRealtimeEvent(res, 'state', {
        ok: true,
        payload: normalizePayload(rows[0].payload),
        updatedAt: rows[0].updated_at
      });
    }
  } catch (error) {
    sendRealtimeEvent(res, 'error', errorPayload(error));
  }

  req.on('close', () => {
    clearInterval(heartbeat);
    const clients = realtimeClients.get(missionId);
    if (!clients) return;
    clients.delete(res);
    if (!clients.size) realtimeClients.delete(missionId);
  });
});

app.get('/api/mission-state/:missionId/structured', async (req, res) => {
  try {
    const missionId = req.params.missionId;
    const [telemetry] = await pool.execute(
      'SELECT day, hr, spo2, temp, rad, created_at FROM mission_telemetry WHERE mission_id = ? ORDER BY day',
      [missionId]
    );
    const [alerts] = await pool.execute(
      'SELECT day, severity, text, created_at FROM mission_alerts WHERE mission_id = ? ORDER BY id DESC',
      [missionId]
    );
    const [comms] = await pool.execute(
      'SELECT day, message_type, severity, text, created_at FROM mission_comms WHERE mission_id = ? ORDER BY id',
      [missionId]
    );
    const [achievements] = await pool.execute(
      'SELECT achievement_key, unlocked_at FROM mission_achievements WHERE mission_id = ? ORDER BY unlocked_at',
      [missionId]
    );
    const [notes] = await pool.execute(
      'SELECT day, alert_index, status, severity, note, author, created_at FROM flight_surgeon_notes WHERE mission_id = ? ORDER BY id DESC',
      [missionId]
    );
    res.json({ ok: true, telemetry, alerts, comms, achievements, notes });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.post('/api/mission-state/:missionId/presence', (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const name = body.name === undefined ? 'Operator' : body.name;
  const role = body.role === undefined ? 'crew' : body.role;
  const clientId = body.clientId === undefined ? `${Date.now()}-${Math.random()}` : body.clientId;
  if (typeof name !== 'string' || name.length > 80 ||
      typeof role !== 'string' || !presenceRoles.has(role) ||
      typeof clientId !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(clientId)) {
    return res.status(400).json({ ok: false, error: 'Invalid presence details.' });
  }
  const item = {
    missionId: req.params.missionId,
    clientId,
    role,
    name: name.trim() || 'Operator',
    lastSeen: Date.now()
  };
  presence.set(item.clientId, item);
  const users = onlinePresence(req.params.missionId);
  broadcastMissionState(req.params.missionId, 'presence', { ok: true, users });
  res.json({ ok: true, users });
});

app.put('/api/mission-state/:missionId', async (req, res) => {
  try {
    const payload = req.body || {};
    await pool.execute(
      `INSERT INTO mission_states (mission_id, payload)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
      [req.params.missionId, JSON.stringify(payload)]
    );
    await writeStructuredMission(req.params.missionId, payload);
    broadcastMissionState(req.params.missionId, 'state', {
      ok: true,
      payload,
      updatedAt: new Date().toISOString()
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.delete('/api/mission-state/:missionId', async (req, res) => {
  try {
    await pool.execute('DELETE FROM mission_states WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM mission_telemetry WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM live_telemetry WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM telemetry_alerts WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM mission_alerts WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM mission_comms WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM mission_achievements WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM missions WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM daily_logs WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM telemetry_frames WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM alerts WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM comms_messages WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM achievements WHERE mission_id = ?', [req.params.missionId]);
    await pool.execute('DELETE FROM flight_surgeon_notes WHERE mission_id = ?', [req.params.missionId]);
    broadcastMissionState(req.params.missionId, 'reset', {
      ok: true,
      sourceClientId: req.query.source || null,
      updatedAt: new Date().toISOString()
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json(errorPayload(error));
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'vitals.html'));
});

ensureDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`VITALS running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Could not connect to MySQL:', error.message || error.code || error);
    console.error('Starting dashboard in offline-first mode. Database connection retries automatically.');
    scheduleDatabaseReconnect();
    app.listen(port, () => {
      console.log(`VITALS running without database at http://localhost:${port}`);
    });
  });
