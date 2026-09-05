import baseWorker from './worker.js';

const PUBLIC_HOST = 'kneeplanai.com';
const PORTAL_HOST = 'research.kneeplanai.com';
const APPLE_PREFIX = '/auth/apple/';
const DEFAULT_APPLE_SERVICE_ID = 'com.yordhannofallaque.kneeplanai.research';
const DEFAULT_ACCESS_CALLBACK = 'https://nameless-sunset-e994.cloudflareaccess.com/cdn-cgi/access/callback';
const DEFAULT_APPLE_CALLBACK = 'https://kneeplanai.com/auth/apple/callback';
const APPLE_AUTHORIZE_URL = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
let authAliasSchemaPromise = null;

const AUTH_ALIAS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS researcher_auth_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  researcher_id INTEGER NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  provider TEXT NOT NULL DEFAULT '',
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (researcher_id) REFERENCES researchers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_researcher_auth_emails_researcher
  ON researcher_auth_emails(researcher_id);
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === PUBLIC_HOST && url.pathname.startsWith(APPLE_PREFIX)) {
      return handleAppleBridge(request, env, url);
    }

    if (url.hostname === PORTAL_HOST && url.pathname.startsWith('/api/research/')) {
      const canonicalRequest = await canonicalizeResearchAccessEmail(request, env, url);
      return baseWorker.fetch(canonicalRequest, env);
    }

    return baseWorker.fetch(request, env);
  },
};

async function handleAppleBridge(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/auth/apple/health') {
    return bridgeJson({ ok: true, service: 'kneeplanai-apple-oidc-bridge', version: 2 });
  }

  if (request.method === 'GET' && url.pathname === '/auth/apple/authorize') {
    return handleAppleAuthorize(env, url);
  }

  if (request.method === 'POST' && url.pathname === '/auth/apple/callback') {
    return handleAppleCallback(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/auth/apple/token') {
    return handleAppleToken(request, env);
  }

  return bridgeJson({ error: 'not_found' }, 404);
}

function handleAppleAuthorize(env, url) {
  const serviceId = appleServiceId(env);
  const accessCallback = accessCallbackUrl(env);
  const appleCallback = appleCallbackUrl(env);
  const clientId = clean(url.searchParams.get('client_id'), 300);
  const redirectUri = clean(url.searchParams.get('redirect_uri'), 1000);
  const responseType = clean(url.searchParams.get('response_type'), 100);
  const upstreamState = clean(url.searchParams.get('state'), 4000);
  const upstreamNonce = clean(url.searchParams.get('nonce'), 4000);

  if (clientId !== serviceId) return oauthError('invalid_request', 'invalid_client_id');
  if (redirectUri !== accessCallback) return oauthError('invalid_request', 'invalid_redirect_uri');
  if (!responseType.split(/\s+/).includes('code')) return oauthError('unsupported_response_type', 'code_required');
  if (!upstreamState) return oauthError('invalid_request', 'state_required');

  const appleUrl = new URL(APPLE_AUTHORIZE_URL);
  appleUrl.searchParams.set('client_id', serviceId);
  appleUrl.searchParams.set('redirect_uri', appleCallback);
  appleUrl.searchParams.set('response_type', 'code');
  appleUrl.searchParams.set('response_mode', 'form_post');
  appleUrl.searchParams.set('scope', 'email');
  appleUrl.searchParams.set('state', upstreamState);
  if (upstreamNonce) appleUrl.searchParams.set('nonce', upstreamNonce);

  return Response.redirect(appleUrl.toString(), 302);
}

async function handleAppleCallback(request, env) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('application/x-www-form-urlencoded') && !type.includes('multipart/form-data')) {
    return bridgeJson({ error: 'invalid_callback_content_type' }, 415);
  }

  const form = await request.formData();
  const state = clean(form.get('state'), 4000);
  if (!state) return bridgeJson({ error: 'invalid_state' }, 400);

  const target = new URL(accessCallbackUrl(env));
  const appleError = clean(form.get('error'), 200);
  const code = clean(form.get('code'), 5000);

  if (appleError) {
    target.searchParams.set('error', appleError);
    const description = clean(form.get('error_description'), 1000);
    if (description) target.searchParams.set('error_description', description);
  } else if (code) {
    target.searchParams.set('code', code);
  } else {
    target.searchParams.set('error', 'server_error');
    target.searchParams.set('error_description', 'apple_authorization_code_missing');
  }

  target.searchParams.set('state', state);
  return Response.redirect(target.toString(), 302);
}

async function handleAppleToken(request, env) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('application/x-www-form-urlencoded')) {
    return oauthTokenError('invalid_request', 'form_urlencoded_required', 400);
  }

  const params = new URLSearchParams(await request.text());
  const basic = readBasicCredentials(request.headers.get('authorization'));
  const serviceId = appleServiceId(env);
  const suppliedClientId = clean(params.get('client_id') || basic?.username, 300);
  const clientSecret = clean(params.get('client_secret') || basic?.password, 12000);
  const grantType = clean(params.get('grant_type'), 100);
  const code = clean(params.get('code'), 5000);
  const redirectUri = clean(params.get('redirect_uri'), 1000);

  if (suppliedClientId !== serviceId || !clientSecret) {
    return oauthTokenError('invalid_client', 'client_credentials_required', 401);
  }
  if (grantType !== 'authorization_code' || !code) {
    return oauthTokenError('invalid_grant', 'authorization_code_required', 400);
  }
  if (redirectUri && redirectUri !== accessCallbackUrl(env)) {
    return oauthTokenError('invalid_grant', 'redirect_uri_mismatch', 400);
  }

  const appleBody = new URLSearchParams();
  appleBody.set('client_id', serviceId);
  appleBody.set('client_secret', clientSecret);
  appleBody.set('code', code);
  appleBody.set('grant_type', 'authorization_code');
  appleBody.set('redirect_uri', appleCallbackUrl(env));

  let appleResponse;
  try {
    appleResponse = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'application/json',
      },
      body: appleBody.toString(),
    });
  } catch (error) {
    console.error('Apple token proxy network error', error);
    return oauthTokenError('temporarily_unavailable', 'apple_token_endpoint_unavailable', 503);
  }

  const responseBody = await appleResponse.text();
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'pragma': 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  return new Response(responseBody, { status: appleResponse.status, headers });
}

async function canonicalizeResearchAccessEmail(request, env, url) {
  const incoming = clean(request.headers.get('Cf-Access-Authenticated-User-Email'), 254).toLowerCase();
  if (!incoming || !env.RESEARCH_DB) return request;

  try {
    const schemaReady = await ensureAuthAliasSchema(env.RESEARCH_DB);
    if (!schemaReady) return request;

    const user = await findResearcherByAuthEmail(env.RESEARCH_DB, incoming);
    if (!user) return request;

    let canonical = clean(user.email, 254).toLowerCase();
    if (url.pathname.startsWith('/api/research/admin/')) {
      const configuredAdmin = clean(env.ADMIN_EMAIL, 254).toLowerCase();
      if (configuredAdmin) {
        const adminUser = await findResearcherByAuthEmail(env.RESEARCH_DB, configuredAdmin);
        if (incoming === configuredAdmin || (adminUser && Number(adminUser.id) === Number(user.id))) {
          canonical = configuredAdmin;
        }
      }
    }

    if (!canonical || canonical === incoming) return request;
    const headers = new Headers(request.headers);
    headers.set('Cf-Access-Authenticated-User-Email', canonical);
    return new Request(request, { headers });
  } catch (error) {
    console.error('Research auth alias resolution error', error);
    return request;
  }
}

async function findResearcherByAuthEmail(database, email) {
  const normalized = clean(email, 254).toLowerCase();
  if (!normalized) return null;

  const direct = await database.prepare('SELECT * FROM researchers WHERE email = ? COLLATE NOCASE')
    .bind(normalized).first();
  if (direct) return direct;

  return database.prepare(
    `SELECT r.* FROM researcher_auth_emails a
     JOIN researchers r ON r.id = a.researcher_id
     WHERE a.email = ? COLLATE NOCASE
     LIMIT 1`
  ).bind(normalized).first();
}

async function ensureAuthAliasSchema(database) {
  if (!authAliasSchemaPromise) {
    authAliasSchemaPromise = (async () => {
      try {
        await database.prepare('SELECT 1 FROM researchers LIMIT 1').first();
      } catch (_) {
        return false;
      }
      await database.exec(AUTH_ALIAS_SCHEMA_SQL);
      await database.prepare(
        `INSERT OR IGNORE INTO researcher_auth_emails (researcher_id, email, provider, is_primary)
         SELECT id, email, 'primary', 1 FROM researchers`
      ).run();
      return true;
    })().catch((error) => {
      authAliasSchemaPromise = null;
      throw error;
    });
  }
  return authAliasSchemaPromise;
}

function appleServiceId(env) {
  return clean(env.APPLE_SERVICE_ID || DEFAULT_APPLE_SERVICE_ID, 300);
}

function accessCallbackUrl(env) {
  return clean(env.APPLE_ACCESS_CALLBACK || DEFAULT_ACCESS_CALLBACK, 1000);
}

function appleCallbackUrl(env) {
  return clean(env.APPLE_BRIDGE_CALLBACK || DEFAULT_APPLE_CALLBACK, 1000);
}

function readBasicCredentials(header) {
  const value = clean(header, 20000);
  if (!/^Basic\s+/i.test(value)) return null;
  try {
    const decoded = atob(value.replace(/^Basic\s+/i, ''));
    const index = decoded.indexOf(':');
    if (index < 0) return null;
    return { username: decoded.slice(0, index), password: decoded.slice(index + 1) };
  } catch (_) {
    return null;
  }
}

function oauthError(error, description) {
  return bridgeJson({ error, error_description: description }, 400);
}

function oauthTokenError(error, description, status) {
  return bridgeJson({ error, error_description: description }, status, {
    'www-authenticate': status === 401 ? 'Basic realm="KneePlanAI Apple OIDC"' : null,
  });
}

function bridgeJson(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'pragma': 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (value) headers.set(key, value);
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function clean(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}
