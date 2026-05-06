const assert = require('node:assert/strict');
const http = require('http');
const { URL } = require('url');

const {
  createServer,
  buildProxyCacheKey,
  getProxyPolicy,
  shouldRetryStatusCode
} = require('./server');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address());
    });
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function request(address, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: address.address,
      port: address.port,
      path: pathname,
      method: 'GET'
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

test('retry policy marks transient upstream statuses', () => {
  assert.equal(shouldRetryStatusCode(429), true);
  assert.equal(shouldRetryStatusCode(503), true);
  assert.equal(shouldRetryStatusCode(404), false);
});

test('proxy cache key changes when negotiated headers change', () => {
  const target = new URL('https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2');
  const baseKey = buildProxyCacheKey(target, 'GET', { accept: 'application/json' });
  const localizedKey = buildProxyCacheKey(target, 'GET', {
    accept: 'application/json',
    'accept-language': 'pt-BR'
  });

  assert.notEqual(baseKey, localizedKey);
});

test('provider policy extends geocoding cache horizon', () => {
  const geocode = getProxyPolicy(new URL('https://geocoding-api.open-meteo.com/v1/search?name=sao'));
  const forecast = getProxyPolicy(new URL('https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2'));

  assert.ok(geocode.freshTtlMs > forecast.freshTtlMs);
  assert.ok(geocode.staleTtlMs > forecast.staleTtlMs);
});

test('health endpoint exposes proxy status snapshot', async () => {
  const server = createServer();
  try {
    const address = await listen(server);
    const response = await request(address, '/api/health');
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.proxy.hosts));
    assert.ok(payload.proxy.hosts.some((entry) => entry.host === 'api.open-meteo.com'));
    assert.ok(payload.proxy.hosts.some((entry) => entry.host === 'apitempo.inmet.gov.br'));
    assert.ok(payload.proxy.hosts.some((entry) => entry.host === 'aviationweather.gov'));
  } finally {
    await close(server);
  }
});

test('proxy endpoint blocks non-whitelisted hosts', async () => {
  const server = createServer();
  try {
    const address = await listen(server);
    const response = await request(address, '/api/proxy?url=https%3A%2F%2Fexample.com%2F');
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 403);
    assert.match(payload.error, /not allowed/i);
  } finally {
    await close(server);
  }
});

test('static index remains servable', async () => {
  const server = createServer();
  try {
    const address = await listen(server);
    const response = await request(address, '/');

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /text\/html/);
    assert.match(response.body, /tabs-panels\.js/);
  } finally {
    await close(server);
  }
});

(async () => {
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(error.stack || error.message || error);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
})();
