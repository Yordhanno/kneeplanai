const DEVICE_COOKIE = '__Host-kpai-device';
const PORTAL_HOST = 'research.kneeplanai.com';
const METRICS = ['hka', 'mldfa', 'mpta', 'jlca', 'aldfa', 'ama', 'afta', 'ahka', 'jlo'];
const CPAK_TYPES = new Set(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']);
let researchSchemaPromise = null;

const RESEARCH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS researchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kneeplan_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('validator', 'tester', 'both')),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'suspended')),
  device_token_hash TEXT,
  device_registered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_researchers_status ON researchers(status);
CREATE TABLE IF NOT EXISTS validation_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  researcher_id INTEGER NOT NULL,
  case_code TEXT NOT NULL,
  app_version TEXT NOT NULL DEFAULT '',
  image_quality TEXT NOT NULL DEFAULT '' CHECK (image_quality IN ('', 'adequate', 'limited', 'poor')),
  analysis_duration_seconds INTEGER,
  hka_reference REAL, hka_kneeplan REAL,
  mldfa_reference REAL, mldfa_kneeplan REAL,
  mpta_reference REAL, mpta_kneeplan REAL,
  jlca_reference REAL, jlca_kneeplan REAL,
  aldfa_reference REAL, aldfa_kneeplan REAL,
  ama_reference REAL, ama_kneeplan REAL,
  afta_reference REAL, afta_kneeplan REAL,
  ahka_reference REAL, ahka_kneeplan REAL,
  jlo_reference REAL, jlo_kneeplan REAL,
  cpak_reference TEXT NOT NULL DEFAULT '',
  cpak_kneeplan TEXT NOT NULL DEFAULT '',
  comments TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (researcher_id) REFERENCES researchers(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_validation_researcher ON validation_results(researcher_id);
CREATE INDEX IF NOT EXISTS idx_validation_case ON validation_results(case_code);
CREATE INDEX IF NOT EXISTS idx_validation_created ON validation_results(created_at);
CREATE TABLE IF NOT EXISTS tester_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  researcher_id INTEGER NOT NULL,
  app_version TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('workflow', 'measurement', 'report', 'dicom', 'interface', 'performance', 'other')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  steps TEXT NOT NULL,
  expected TEXT NOT NULL DEFAULT '',
  actual TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (researcher_id) REFERENCES researchers(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_reports_researcher ON tester_reports(researcher_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON tester_reports(created_at);
CREATE TABLE IF NOT EXISTS research_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON research_audit(created_at);
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === 'www.kneeplanai.com') {
      url.hostname = 'kneeplanai.com';
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname.startsWith('/api/research/')) {
      if (url.hostname !== PORTAL_HOST) {
        return json({ error: 'not_found' }, 404);
      }
      return handleResearchApi(request, env, url);
    }

    if (url.hostname === PORTAL_HOST) {
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return serveAsset(request, env, '/research-portal.html');
      }
      if (url.pathname === '/admin' || url.pathname === '/admin/') {
        return serveAsset(request, env, '/research-admin.html');
      }
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleResearchApi(request, env, url) {
  if (!env.RESEARCH_DB) {
    return json({ error: 'research_database_unavailable' }, 503);
  }

  try {
    await ensureResearchSchema(env.RESEARCH_DB);
  } catch (error) {
    console.error('Research schema initialization error', error);
    return json({ error: 'research_database_unavailable' }, 503);
  }

  const path = url.pathname;

  try {
    if (path.startsWith('/api/research/admin/')) {
      return handleAdminApi(request, env, url);
    }

    if (url.hostname !== PORTAL_HOST) {
      return json({ error: 'portal_host_required' }, 403);
    }

    if (request.method === 'GET' && path === '/api/research/me') {
      const context = await requireResearcher(request, env, true);
      if (context.response) return context.response;

      const counts = await env.RESEARCH_DB.prepare(
        `SELECT
          (SELECT COUNT(*) FROM validation_results WHERE researcher_id = ?) AS validations,
          (SELECT COUNT(*) FROM tester_reports WHERE researcher_id = ?) AS reports`
      ).bind(context.user.id, context.user.id).first();

      return json({
        user: publicResearcher(context.user),
        counts: {
          validations: Number(counts?.validations || 0),
          reports: Number(counts?.reports || 0),
        },
      }, 200, context.cookie);
    }

    if (request.method === 'POST' && path === '/api/research/validation') {
      const originError = requireSameOrigin(request, url);
      if (originError) return originError;
      const context = await requireResearcher(request, env, true);
      if (context.response) return context.response;
      if (!['validator', 'both'].includes(context.user.role)) {
        return json({ error: 'validator_role_required' }, 403);
      }

      const payload = await readJson(request);
      const validationError = validateValidation(payload);
      if (validationError) return json({ error: validationError }, 400);

      const values = [];
      for (const metric of METRICS) {
        values.push(nullableNumber(payload[`${metric}_reference`]));
        values.push(nullableNumber(payload[`${metric}_kneeplan`]));
      }

      const columns = METRICS.flatMap((metric) => [`${metric}_reference`, `${metric}_kneeplan`]);
      const placeholders = Array(26).fill('?').join(', ');
      const result = await env.RESEARCH_DB.prepare(
        `INSERT INTO validation_results (
          researcher_id, case_code, app_version, image_quality, analysis_duration_seconds,
          ${columns.join(', ')}, cpak_reference, cpak_kneeplan, comments
        ) VALUES (${placeholders})`
      ).bind(
        context.user.id,
        clean(payload.case_code, 64),
        clean(payload.app_version, 30),
        clean(payload.image_quality, 12),
        nullableInteger(payload.analysis_duration_seconds),
        ...values,
        clean(payload.cpak_reference, 4).toUpperCase(),
        clean(payload.cpak_kneeplan, 4).toUpperCase(),
        clean(payload.comments, 2000),
      ).run();

      await audit(env, context.user.email, 'validation_created', result.meta?.last_row_id || null, payload.case_code);
      return json({ ok: true, id: result.meta?.last_row_id || null }, 201, context.cookie);
    }

    if (request.method === 'POST' && path === '/api/research/report') {
      const originError = requireSameOrigin(request, url);
      if (originError) return originError;
      const context = await requireResearcher(request, env, true);
      if (context.response) return context.response;
      if (!['tester', 'both'].includes(context.user.role)) {
        return json({ error: 'tester_role_required' }, 403);
      }

      const payload = await readJson(request);
      const reportError = validateReport(payload);
      if (reportError) return json({ error: reportError }, 400);

      const result = await env.RESEARCH_DB.prepare(
        `INSERT INTO tester_reports (
          researcher_id, app_version, category, severity, title, steps, expected, actual
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        context.user.id,
        clean(payload.app_version, 30),
        payload.category,
        payload.severity,
        clean(payload.title, 140),
        clean(payload.steps, 4000),
        clean(payload.expected, 2000),
        clean(payload.actual, 2000),
      ).run();

      await audit(env, context.user.email, 'tester_report_created', result.meta?.last_row_id || null, payload.title);
      return json({ ok: true, id: result.meta?.last_row_id || null }, 201, context.cookie);
    }

    return json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error('Research API error', error);
    if (error?.code === 'invalid_json') {
      return json({ error: 'invalid_json' }, 400);
    }
    return json({ error: 'unexpected_error' }, 500);
  }
}

async function handleAdminApi(request, env, url) {
  if (url.hostname !== PORTAL_HOST) return json({ error: 'portal_host_required' }, 403);

  const adminEmail = accessEmail(request);
  if (!adminEmail || adminEmail.toLowerCase() !== String(env.ADMIN_EMAIL || '').toLowerCase()) {
    return json({ error: 'admin_access_required' }, 403);
  }

  const path = url.pathname;

  if (request.method === 'GET' && path === '/api/research/admin/users') {
    const { results } = await env.RESEARCH_DB.prepare(
      `SELECT id, email, kneeplan_id, full_name, institution, country, role, status,
        device_registered_at, created_at, approved_at, last_seen_at
       FROM researchers ORDER BY created_at DESC`
    ).all();
    return json({ users: results || [] });
  }

  if (request.method === 'POST' && path === '/api/research/admin/users') {
    const originError = requireSameOrigin(request, url);
    if (originError) return originError;
    const payload = await readJson(request);
    const userError = validateResearcher(payload);
    if (userError) return json({ error: userError }, 400);

    try {
      const result = await env.RESEARCH_DB.prepare(
        `INSERT INTO researchers (email, kneeplan_id, full_name, institution, country, role, status)
         VALUES (?, ?, ?, ?, ?, ?, 'approved')`
      ).bind(
        clean(payload.email, 254).toLowerCase(),
        clean(payload.kneeplan_id, 254).toLowerCase(),
        clean(payload.full_name, 120),
        clean(payload.institution, 160),
        clean(payload.country, 80),
        payload.role,
      ).run();
      await audit(env, adminEmail, 'researcher_created', result.meta?.last_row_id || null, payload.email);
      return json({ ok: true, id: result.meta?.last_row_id || null }, 201);
    } catch (error) {
      if (String(error).toLowerCase().includes('unique')) {
        return json({ error: 'email_or_identity_already_exists' }, 409);
      }
      throw error;
    }
  }

  const userAction = path.match(/^\/api\/research\/admin\/users\/(\d+)\/(status|reset-device)$/);
  if (request.method === 'POST' && userAction) {
    const originError = requireSameOrigin(request, url);
    if (originError) return originError;
    const userId = Number(userAction[1]);
    const action = userAction[2];

    if (action === 'reset-device') {
      await env.RESEARCH_DB.prepare(
        `UPDATE researchers SET device_token_hash = NULL, device_registered_at = NULL WHERE id = ?`
      ).bind(userId).run();
      await audit(env, adminEmail, 'device_reset', userId, 'Approved administrator reset');
      return json({ ok: true });
    }

    const payload = await readJson(request);
    if (!['approved', 'suspended'].includes(payload.status)) {
      return json({ error: 'invalid_status' }, 400);
    }
    await env.RESEARCH_DB.prepare(`UPDATE researchers SET status = ? WHERE id = ?`)
      .bind(payload.status, userId).run();
    await audit(env, adminEmail, `researcher_${payload.status}`, userId, '');
    return json({ ok: true });
  }

  if (request.method === 'GET' && path === '/api/research/admin/validation.csv') {
    const { results } = await env.RESEARCH_DB.prepare(
      `SELECT v.id, r.kneeplan_id, r.role, v.case_code, v.app_version, v.image_quality,
        v.analysis_duration_seconds, v.hka_reference, v.hka_kneeplan,
        v.mldfa_reference, v.mldfa_kneeplan, v.mpta_reference, v.mpta_kneeplan,
        v.jlca_reference, v.jlca_kneeplan, v.aldfa_reference, v.aldfa_kneeplan,
        v.ama_reference, v.ama_kneeplan, v.afta_reference, v.afta_kneeplan,
        v.ahka_reference, v.ahka_kneeplan, v.jlo_reference, v.jlo_kneeplan,
        v.cpak_reference, v.cpak_kneeplan, v.comments, v.created_at
       FROM validation_results v JOIN researchers r ON r.id = v.researcher_id
       ORDER BY v.created_at DESC`
    ).all();
    return csvResponse(results || [], 'kneeplanai-validation-results.csv');
  }

  if (request.method === 'GET' && path === '/api/research/admin/reports.csv') {
    const { results } = await env.RESEARCH_DB.prepare(
      `SELECT t.id, r.kneeplan_id, r.role, t.app_version, t.category, t.severity,
        t.title, t.steps, t.expected, t.actual, t.created_at
       FROM tester_reports t JOIN researchers r ON r.id = t.researcher_id
       ORDER BY t.created_at DESC`
    ).all();
    return csvResponse(results || [], 'kneeplanai-tester-reports.csv');
  }

  return json({ error: 'not_found' }, 404);
}

async function requireResearcher(request, env, registerDevice) {
  const email = accessEmail(request);
  if (!email) return { response: json({ error: 'authentication_required' }, 401) };

  let user = await env.RESEARCH_DB.prepare(`SELECT * FROM researchers WHERE email = ? COLLATE NOCASE`)
    .bind(email).first();
  if (!user || user.status !== 'approved') {
    return { response: json({ error: user ? 'access_suspended' : 'access_not_approved' }, 403) };
  }

  const presentedToken = readCookie(request, DEVICE_COOKIE);
  const presentedHash = presentedToken ? await sha256(presentedToken) : null;
  let cookie = null;

  if (!user.device_token_hash && registerDevice) {
    const token = randomToken();
    const tokenHash = await sha256(token);
    const result = await env.RESEARCH_DB.prepare(
      `UPDATE researchers SET device_token_hash = ?, device_registered_at = CURRENT_TIMESTAMP
       WHERE id = ? AND device_token_hash IS NULL`
    ).bind(tokenHash, user.id).run();

    if (Number(result.meta?.changes || 0) === 1) {
      user = { ...user, device_token_hash: tokenHash, device_registered_at: new Date().toISOString() };
      cookie = `${DEVICE_COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`;
    } else {
      user = await env.RESEARCH_DB.prepare(`SELECT * FROM researchers WHERE id = ?`).bind(user.id).first();
    }
  }

  if (user.device_token_hash && presentedHash !== user.device_token_hash && !cookie) {
    return { response: json({ error: 'device_not_authorized' }, 423) };
  }

  await env.RESEARCH_DB.prepare(`UPDATE researchers SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(user.id).run();
  return { user, cookie };
}

function accessEmail(request) {
  return clean(request.headers.get('Cf-Access-Authenticated-User-Email'), 254).toLowerCase();
}

function publicResearcher(user) {
  return {
    kneeplan_id: user.kneeplan_id,
    full_name: user.full_name,
    institution: user.institution,
    country: user.country,
    role: user.role,
    device_registered_at: user.device_registered_at,
    last_seen_at: user.last_seen_at,
  };
}

function validateResearcher(payload) {
  if (!payload || typeof payload !== 'object') return 'invalid_payload';
  if (!validEmail(payload.email)) return 'invalid_email';
  if (!/^[-a-z0-9._]+@kneeplanai\.com$/i.test(clean(payload.kneeplan_id, 254))) return 'invalid_kneeplan_identity';
  if (clean(payload.full_name, 120).length < 3) return 'full_name_required';
  if (!['validator', 'tester', 'both'].includes(payload.role)) return 'invalid_role';
  return null;
}

function validateValidation(payload) {
  if (!payload || typeof payload !== 'object') return 'invalid_payload';
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(clean(payload.case_code, 64))) return 'invalid_case_code';
  if (!['', 'adequate', 'limited', 'poor'].includes(clean(payload.image_quality, 12))) return 'invalid_image_quality';
  if (!CPAK_TYPES.has(clean(payload.cpak_reference, 4).toUpperCase())) return 'invalid_cpak_reference';
  if (!CPAK_TYPES.has(clean(payload.cpak_kneeplan, 4).toUpperCase())) return 'invalid_cpak_kneeplan';
  for (const metric of METRICS) {
    for (const suffix of ['reference', 'kneeplan']) {
      const value = payload[`${metric}_${suffix}`];
      if (value !== '' && value !== null && value !== undefined) {
        const number = Number(value);
        if (!Number.isFinite(number) || number < -360 || number > 360) return `invalid_${metric}_${suffix}`;
      }
    }
  }
  const duration = payload.analysis_duration_seconds;
  if (duration !== '' && duration !== null && duration !== undefined) {
    const number = Number(duration);
    if (!Number.isInteger(number) || number < 0 || number > 86400) return 'invalid_analysis_duration';
  }
  return null;
}

function validateReport(payload) {
  if (!payload || typeof payload !== 'object') return 'invalid_payload';
  if (!['workflow', 'measurement', 'report', 'dicom', 'interface', 'performance', 'other'].includes(payload.category)) return 'invalid_category';
  if (!['low', 'medium', 'high', 'critical'].includes(payload.severity)) return 'invalid_severity';
  if (clean(payload.title, 140).length < 4) return 'title_required';
  if (clean(payload.steps, 4000).length < 4) return 'steps_required';
  if (clean(payload.actual, 2000).length < 2) return 'actual_result_required';
  return null;
}

function requireSameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin !== `${url.protocol}//${url.host}`) return json({ error: 'invalid_origin' }, 403);
  return null;
}

async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    const error = new Error('JSON request required');
    error.code = 'invalid_json';
    throw error;
  }
  try {
    return await request.json();
  } catch (_) {
    const error = new Error('Invalid JSON request');
    error.code = 'invalid_json';
    throw error;
  }
}

async function audit(env, actorEmail, action, targetId, detail) {
  await env.RESEARCH_DB.prepare(
    `INSERT INTO research_audit (actor_email, action, target_id, detail) VALUES (?, ?, ?, ?)`
  ).bind(clean(actorEmail, 254), clean(action, 80), targetId, clean(detail, 500)).run();
}

function ensureResearchSchema(database) {
  if (!researchSchemaPromise) {
    researchSchemaPromise = database.exec(RESEARCH_SCHEMA_SQL).catch((error) => {
      researchSchemaPromise = null;
      throw error;
    });
  }
  return researchSchemaPromise;
}

async function serveAsset(request, env, pathname) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;
  assetUrl.search = '';
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('content-security-policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(payload, status = 200, cookie = null) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (cookie) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(payload), { status, headers });
}

function csvResponse(rows, filename) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','));
  return new Response('\uFEFF' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    if (pair.slice(0, index).trim() === name) return pair.slice(index + 1).trim();
  }
  return null;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 254));
}

function clean(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function nullableNumber(value) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}

function nullableInteger(value) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}
