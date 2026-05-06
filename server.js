const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT_DIR = __dirname;
const SERVER_STARTED_AT = Date.now();

loadDotEnv(path.join(ROOT_DIR, '.env'));

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const MAX_PROXY_CACHE_ENTRIES = 240;
const MAX_PROXY_BODY_BYTES = 4 * 1024 * 1024;

const WEATHER_KEYS = {
  weatherApi: process.env.VENTO_WEATHERAPI_KEY || '',
  meteostat: process.env.VENTO_METEOSTAT_KEY || ''
};

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const ALLOWED_PROXY_HOSTS = new Set([
  'api.open-meteo.com',
  'archive-api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'api.weatherapi.com',
  'api.meteostat.net',
  'meteostat.p.rapidapi.com',
  'aviationweather.gov',
  'connect.aviationweather.gov',
  'apiprevmet3.inmet.gov.br',
  'apitempo.inmet.gov.br',
  'servicos.cptec.inpe.br',
  'api.weather.gov',
  'api.rainviewer.com',
  'www.climatempo.com.br'
]);

const FORWARDABLE_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-type',
  'origin',
  'referer',
  'x-requested-with',
  'x-api-key',
  'x-rapidapi-key',
  'x-rapidapi-host',
  'user-agent'
]);

const DEFAULT_PROXY_POLICY = Object.freeze({
  attempts: 3,
  connectTimeoutMs: 8000,
  totalTimeoutMs: 22000,
  backoffMs: 350,
  freshTtlMs: 2 * 60 * 1000,
  staleTtlMs: 6 * 60 * 60 * 1000
});

const proxyCache = new Map();
const hostHealth = new Map();

function loadDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) return;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    // .env is optional in this project.
  }
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Vento-Forward-Headers');
  response.setHeader('Cache-Control', 'no-store');
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function parseForwardHeaders(request) {
  const headerValue = request.headers['x-vento-forward-headers'];
  if (!headerValue) return {};

  try {
    const parsed = JSON.parse(String(headerValue));
    return Object.entries(parsed).reduce((headers, [key, value]) => {
      const normalizedKey = String(key || '').toLowerCase();
      if (FORWARDABLE_HEADERS.has(normalizedKey) && value != null) {
        headers[normalizedKey] = String(value);
      }
      return headers;
    }, {});
  } catch (error) {
    return {};
  }
}

function injectProviderCredentials(targetUrl, headers) {
  if (!headers['user-agent']) {
    headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
  }

  if (targetUrl.hostname === 'api.weatherapi.com' && WEATHER_KEYS.weatherApi) {
    targetUrl.searchParams.set('key', WEATHER_KEYS.weatherApi);
  }

  if (targetUrl.hostname === 'api.meteostat.net' && WEATHER_KEYS.meteostat) {
    headers['x-api-key'] = WEATHER_KEYS.meteostat;
  }

  if (targetUrl.hostname === 'meteostat.p.rapidapi.com' && WEATHER_KEYS.meteostat) {
    headers['x-rapidapi-key'] = WEATHER_KEYS.meteostat;
    headers['x-rapidapi-host'] = 'meteostat.p.rapidapi.com';
  }

  if (targetUrl.hostname === 'www.climatempo.com.br') {
    headers.accept = headers.accept || 'application/json, text/plain, */*';
    headers.origin = 'https://www.climatempo.com.br';
    headers.referer = 'https://www.climatempo.com.br/';
    headers['accept-language'] = headers['accept-language'] || 'pt-BR,pt;q=0.9,en;q=0.8';
    if (targetUrl.pathname.startsWith('/json/')) {
      headers['x-requested-with'] = 'XMLHttpRequest';
    }
  }
}

function getProxyPolicy(targetUrl) {
  const policy = { ...DEFAULT_PROXY_POLICY };

  if (targetUrl.hostname === 'geocoding-api.open-meteo.com') {
    policy.freshTtlMs = 24 * 60 * 60 * 1000;
    policy.staleTtlMs = 7 * 24 * 60 * 60 * 1000;
    policy.attempts = 2;
  } else if (targetUrl.hostname === 'archive-api.open-meteo.com') {
    policy.freshTtlMs = 60 * 60 * 1000;
    policy.staleTtlMs = 24 * 60 * 60 * 1000;
    policy.attempts = 2;
  } else if (targetUrl.hostname === 'aviationweather.gov' || targetUrl.hostname === 'connect.aviationweather.gov') {
    policy.freshTtlMs = targetUrl.pathname.includes('/data/cache/stations.cache')
      ? 24 * 60 * 60 * 1000
      : 10 * 60 * 1000;
    policy.staleTtlMs = targetUrl.pathname.includes('/data/cache/stations.cache')
      ? 7 * 24 * 60 * 60 * 1000
      : 6 * 60 * 60 * 1000;
    policy.attempts = 2;
  } else if (targetUrl.hostname === 'api.rainviewer.com') {
    policy.freshTtlMs = 5 * 60 * 1000;
    policy.staleTtlMs = 2 * 60 * 60 * 1000;
    policy.attempts = 2;
  } else if (targetUrl.hostname === 'www.climatempo.com.br') {
    policy.totalTimeoutMs = 30000;
    policy.connectTimeoutMs = 12000;
    policy.freshTtlMs = 15 * 60 * 1000;
    policy.staleTtlMs = 12 * 60 * 60 * 1000;
    policy.attempts = 2;
  } else if (targetUrl.hostname === 'api.weather.gov') {
    policy.freshTtlMs = 10 * 60 * 1000;
    policy.staleTtlMs = 6 * 60 * 60 * 1000;
  }

  return policy;
}

function buildProxyCacheKey(targetUrl, method, headers = {}) {
  const varyHeaders = ['accept', 'accept-language', 'x-requested-with']
    .map((key) => `${key}:${headers[key] || ''}`)
    .join('|');

  return `${String(method || 'GET').toUpperCase()} ${targetUrl.toString()} ${varyHeaders}`;
}

function shouldRetryStatusCode(statusCode) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(statusCode));
}

function isRetryableNetworkError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'ECONNRESET'
    || code === 'ECONNREFUSED'
    || code === 'ETIMEDOUT'
    || code === 'EAI_AGAIN'
    || code === 'ECONNABORTED'
    || message.includes('timeout')
    || message.includes('socket hang up')
    || message.includes('network');
}

function normalizeUpstreamError(error) {
  if (!error) return 'Falha ao consultar o provedor remoto.';
  if (shouldRetryStatusCode(error.statusCode)) {
    return `HTTP ${error.statusCode} retornado pelo provedor remoto.`;
  }
  if (isRetryableNetworkError(error)) {
    return 'Falha temporária de conectividade com o provedor remoto.';
  }
  if (String(error.message || '').includes('401')) {
    return 'Falha de autenticação no provedor remoto.';
  }
  return error.message || 'Falha ao consultar o provedor remoto.';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function purgeExpiredProxyCache(now = Date.now()) {
  for (const [key, entry] of proxyCache.entries()) {
    if (now - entry.timestamp > entry.staleTtlMs) {
      proxyCache.delete(key);
    }
  }
}

function trimProxyCache() {
  if (proxyCache.size <= MAX_PROXY_CACHE_ENTRIES) return;

  const ordered = Array.from(proxyCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp);

  while (ordered.length && proxyCache.size > MAX_PROXY_CACHE_ENTRIES) {
    const [oldestKey] = ordered.shift();
    proxyCache.delete(oldestKey);
  }
}

function getCachedProxyEntry(cacheKey, now = Date.now()) {
  const entry = proxyCache.get(cacheKey);
  if (!entry) return null;
  if (now - entry.timestamp > entry.staleTtlMs) {
    proxyCache.delete(cacheKey);
    return null;
  }

  return {
    entry,
    ageMs: now - entry.timestamp
  };
}

function storeProxyEntry(cacheKey, targetUrl, proxyResponse, policy) {
  if (!proxyResponse?.body?.length || proxyResponse.body.length > MAX_PROXY_BODY_BYTES) {
    return;
  }

  const contentType = String(proxyResponse.headers?.['content-type'] || 'application/octet-stream').trim();
  proxyCache.set(cacheKey, {
    host: targetUrl.hostname,
    targetUrl: targetUrl.toString(),
    contentType,
    statusCode: proxyResponse.statusCode,
    body: Buffer.from(proxyResponse.body),
    timestamp: Date.now(),
    freshTtlMs: policy.freshTtlMs,
    staleTtlMs: policy.staleTtlMs
  });

  trimProxyCache();
}

function markHostSuccess(host, meta = {}) {
  const current = hostHealth.get(host) || {
    host,
    status: 'unknown',
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFallbackAt: null,
    lastLatencyMs: null,
    lastStatusCode: null,
    lastError: ''
  };

  current.status = 'online';
  current.consecutiveFailures = 0;
  current.lastSuccessAt = new Date().toISOString();
  current.lastLatencyMs = meta.latencyMs ?? current.lastLatencyMs;
  current.lastStatusCode = meta.statusCode ?? current.lastStatusCode;
  current.lastError = '';
  hostHealth.set(host, current);
}

function markHostFailure(host, error, meta = {}) {
  const current = hostHealth.get(host) || {
    host,
    status: 'unknown',
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFallbackAt: null,
    lastLatencyMs: null,
    lastStatusCode: null,
    lastError: ''
  };

  current.consecutiveFailures += 1;
  current.status = meta.servedFromCache ? 'degraded' : 'offline';
  current.lastFailureAt = new Date().toISOString();
  current.lastLatencyMs = meta.latencyMs ?? current.lastLatencyMs;
  current.lastStatusCode = meta.statusCode ?? current.lastStatusCode;
  current.lastError = normalizeUpstreamError(error);
  hostHealth.set(host, current);
}

function markHostFallback(host) {
  const current = hostHealth.get(host) || {
    host,
    status: 'unknown',
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFallbackAt: null,
    lastLatencyMs: null,
    lastStatusCode: null,
    lastError: ''
  };

  current.status = 'degraded';
  current.lastFallbackAt = new Date().toISOString();
  hostHealth.set(host, current);
}

function getHostHealthSnapshot() {
  return Array.from(ALLOWED_PROXY_HOSTS)
    .sort((a, b) => a.localeCompare(b))
    .map((host) => {
      const entry = hostHealth.get(host);
      return {
        host,
        status: entry?.status || 'unknown',
        consecutiveFailures: entry?.consecutiveFailures || 0,
        lastSuccessAt: entry?.lastSuccessAt || null,
        lastFailureAt: entry?.lastFailureAt || null,
        lastFallbackAt: entry?.lastFallbackAt || null,
        lastLatencyMs: entry?.lastLatencyMs ?? null,
        lastStatusCode: entry?.lastStatusCode ?? null,
        lastError: entry?.lastError || ''
      };
    });
}

function proxyExternalRequest(targetUrl, options, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const transport = targetUrl.protocol === 'http:' ? http : https;
    const request = transport.request(targetUrl, options, (response) => {
      const statusCode = response.statusCode || 502;

      if (statusCode >= 300 && statusCode < 400 && response.headers.location && redirectCount < 5) {
        response.resume();
        const redirectUrl = new URL(response.headers.location, targetUrl);
        resolve(proxyExternalRequest(redirectUrl, options, redirectCount + 1));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks)
        });
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(options.timeoutMs || DEFAULT_PROXY_POLICY.totalTimeoutMs, () => {
      request.destroy(Object.assign(new Error('Tempo limite excedido.'), { code: 'ETIMEDOUT' }));
    });

    if (options.body?.length) {
      request.write(options.body);
    }
    request.end();
  });
}

function proxyExternalRequestWithCurl(targetUrl, options) {
  return new Promise((resolve, reject) => {
    const timeoutSeconds = Math.max(1, Math.ceil((options.timeoutMs || DEFAULT_PROXY_POLICY.totalTimeoutMs) / 1000));
    const connectTimeoutSeconds = Math.max(1, Math.ceil((options.connectTimeoutMs || DEFAULT_PROXY_POLICY.connectTimeoutMs) / 1000));
    const args = [
      '-sS',
      '-L',
      '--http1.1',
      '--connect-timeout',
      String(connectTimeoutSeconds),
      '--max-time',
      String(timeoutSeconds),
      '-X',
      options.method || 'GET',
      targetUrl.toString()
    ];

    Object.entries(options.headers || {}).forEach(([key, value]) => {
      if (value != null && value !== '') {
        args.push('-H', `${key}: ${value}`);
      }
    });

    if (options.body?.length) {
      args.push('--data-binary', Buffer.isBuffer(options.body) ? options.body.toString('utf8') : String(options.body));
    }

    args.push('-w', '\n__VENTO_STATUS__:%{http_code}\n__VENTO_TYPE__:%{content_type}');

    execFile('curl.exe', args, { encoding: 'buffer', maxBuffer: 12 * 1024 * 1024 }, (error, stdout, stderr) => {
      const statusMarker = Buffer.from('\n__VENTO_STATUS__:');
      const markerIndex = stdout.lastIndexOf(statusMarker);

      if (markerIndex < 0) {
        reject(new Error(stderr?.toString('utf8').trim() || error?.message || 'Curl proxy request failed.'));
        return;
      }

      const trailer = stdout.slice(markerIndex).toString('utf8');
      const statusMatch = trailer.match(/__VENTO_STATUS__:(\d+)/);
      const typeMatch = trailer.match(/__VENTO_TYPE__:(.*)/);

      resolve({
        statusCode: Number(statusMatch?.[1] || 502),
        headers: {
          'content-type': String(typeMatch?.[1] || '').trim()
        },
        body: stdout.slice(0, markerIndex)
      });
    });
  });
}

function executeUpstreamRequest(targetUrl, options) {
  const transport = targetUrl.hostname === 'www.climatempo.com.br'
    ? proxyExternalRequestWithCurl
    : proxyExternalRequest;

  return transport(targetUrl, options);
}

async function proxyWithResilience(targetUrl, options, policy) {
  let lastError = null;

  for (let attempt = 0; attempt < policy.attempts; attempt += 1) {
    try {
      const upstreamResponse = await executeUpstreamRequest(targetUrl, {
        ...options,
        timeoutMs: policy.totalTimeoutMs,
        connectTimeoutMs: policy.connectTimeoutMs
      });

      if (shouldRetryStatusCode(upstreamResponse.statusCode) && attempt < policy.attempts - 1) {
        const retryError = Object.assign(new Error(`HTTP ${upstreamResponse.statusCode}`), {
          statusCode: upstreamResponse.statusCode
        });
        lastError = retryError;
        await wait(policy.backoffMs * (attempt + 1));
        continue;
      }

      return upstreamResponse;
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt >= policy.attempts - 1) {
        break;
      }
      await wait(policy.backoffMs * (attempt + 1));
    }
  }

  throw lastError || new Error('Falha ao consultar o provedor remoto.');
}

async function handleProxyRequest(request, response, requestUrl) {
  const rawTarget = requestUrl.searchParams.get('url');
  if (!rawTarget) {
    sendJson(response, 400, { error: 'Missing url query parameter.' });
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
  } catch (error) {
    sendJson(response, 400, { error: 'Invalid target URL.' });
    return;
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol) || !ALLOWED_PROXY_HOSTS.has(targetUrl.hostname)) {
    sendJson(response, 403, { error: 'Target host is not allowed by proxy policy.' });
    return;
  }

  const body = await readRequestBody(request);
  const method = String(request.method || 'GET').toUpperCase();
  const headers = {
    accept: '*/*',
    'accept-encoding': 'identity',
    ...parseForwardHeaders(request)
  };

  if (body.length) {
    headers['content-length'] = String(body.length);
  }

  injectProviderCredentials(targetUrl, headers);

  const policy = getProxyPolicy(targetUrl);
  const cacheable = method === 'GET' && body.length === 0;
  const cacheKey = cacheable ? buildProxyCacheKey(targetUrl, method, headers) : '';
  const cached = cacheable ? getCachedProxyEntry(cacheKey) : null;
  const startedAt = Date.now();

  try {
    const proxyResponse = await proxyWithResilience(targetUrl, {
      method,
      headers,
      body
    }, policy);

    if (cacheable && proxyResponse.statusCode >= 200 && proxyResponse.statusCode < 300) {
      storeProxyEntry(cacheKey, targetUrl, proxyResponse, policy);
    }

    markHostSuccess(targetUrl.hostname, {
      latencyMs: Date.now() - startedAt,
      statusCode: proxyResponse.statusCode
    });

    setCorsHeaders(response);
    response.writeHead(proxyResponse.statusCode, {
      'Content-Type': proxyResponse.headers['content-type'] || 'application/octet-stream',
      'X-Vento-Proxy': '1',
      'X-Vento-Proxy-Cache': cacheable ? 'miss' : 'bypass',
      'X-Vento-Upstream-Host': targetUrl.hostname
    });
    response.end(proxyResponse.body);
  } catch (error) {
    if (cached) {
      markHostFailure(targetUrl.hostname, error, {
        servedFromCache: true,
        latencyMs: Date.now() - startedAt,
        statusCode: cached.entry.statusCode
      });
      markHostFallback(targetUrl.hostname);

      setCorsHeaders(response);
      response.writeHead(200, {
        'Content-Type': cached.entry.contentType,
        'X-Vento-Proxy': '1',
        'X-Vento-Proxy-Cache': cached.ageMs <= cached.entry.freshTtlMs ? 'warm' : 'stale',
        'X-Vento-Proxy-Fallback': '1',
        'X-Vento-Upstream-Host': targetUrl.hostname
      });
      response.end(Buffer.from(cached.entry.body));
      return;
    }

    markHostFailure(targetUrl.hostname, error, {
      servedFromCache: false,
      latencyMs: Date.now() - startedAt
    });

    sendJson(response, 502, {
      error: 'Upstream provider unavailable.',
      upstreamHost: targetUrl.hostname,
      message: normalizeUpstreamError(error)
    });
  }
}

async function serveStaticFile(response, requestPathname) {
  const safePath = requestPathname === '/' ? '/index.html' : requestPathname;
  const resolvedPath = path.normalize(path.join(ROOT_DIR, safePath));

  if (!resolvedPath.startsWith(ROOT_DIR)) {
    sendJson(response, 403, { error: 'Forbidden path.' });
    return;
  }

  try {
    const stat = await fs.promises.stat(resolvedPath);
    const filePath = stat.isDirectory() ? path.join(resolvedPath, 'index.html') : resolvedPath;
    const ext = path.extname(filePath).toLowerCase();
    const file = await fs.promises.readFile(filePath);
    setCorsHeaders(response);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'
    });
    response.end(file);
  } catch (error) {
    sendJson(response, 404, { error: 'File not found.' });
  }
}

function buildHealthPayload() {
  purgeExpiredProxyCache();

  return {
    ok: true,
    serverTime: new Date().toISOString(),
    uptimeMs: Date.now() - SERVER_STARTED_AT,
    configuredKeys: {
      weatherApi: Boolean(WEATHER_KEYS.weatherApi),
      meteostat: Boolean(WEATHER_KEYS.meteostat)
    },
    proxy: {
      cacheEntries: proxyCache.size,
      maxCacheEntries: MAX_PROXY_CACHE_ENTRIES,
      hosts: getHostHealthSnapshot()
    }
  };
}

function createServer() {
  const server = http.createServer(async (request, response) => {
    setCorsHeaders(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`);

    try {
      if (requestUrl.pathname === '/api/health') {
        sendJson(response, 200, buildHealthPayload());
        return;
      }

      if (requestUrl.pathname === '/api/proxy') {
        await handleProxyRequest(request, response, requestUrl);
        return;
      }

      await serveStaticFile(response, requestUrl.pathname);
    } catch (error) {
      sendJson(response, 500, {
        error: 'Internal server error.',
        message: error.message
      });
    }
  });

  return server;
}

const maintenanceTimer = setInterval(() => {
  purgeExpiredProxyCache();
}, 5 * 60 * 1000);

maintenanceTimer.unref?.();

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`Vento server listening on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  createServer,
  buildHealthPayload,
  buildProxyCacheKey,
  getProxyPolicy,
  normalizeUpstreamError,
  shouldRetryStatusCode
};
