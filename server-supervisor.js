'use strict';

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const SERVER_ENTRY = path.join(__dirname, 'server.js');

const HEALTH_INTERVAL_MS = Number(process.env.VENTO_SUPERVISOR_HEALTH_INTERVAL_MS || 30000);
const HEALTH_TIMEOUT_MS = Number(process.env.VENTO_SUPERVISOR_HEALTH_TIMEOUT_MS || 5000);
const HEALTH_FAILURE_LIMIT = Number(process.env.VENTO_SUPERVISOR_HEALTH_FAILURE_LIMIT || 3);
const RESTART_DELAY_MIN_MS = Number(process.env.VENTO_SUPERVISOR_RESTART_DELAY_MIN_MS || 2000);
const RESTART_DELAY_MAX_MS = Number(process.env.VENTO_SUPERVISOR_RESTART_DELAY_MAX_MS || 30000);

let child = null;
let stopping = false;
let restartAttempts = 0;
let healthFailures = 0;
let healthTimer = null;
let restartTimer = null;
let healthCheckInFlight = false;

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[supervisor ${timestamp}] ${message}`);
}

function getRestartDelayMs() {
  const exponential = RESTART_DELAY_MIN_MS * Math.pow(2, Math.max(0, restartAttempts - 1));
  return Math.min(RESTART_DELAY_MAX_MS, exponential);
}

function clearHealthMonitor() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

function requestHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: HOST,
      port: PORT,
      path: '/api/health',
      timeout: HEALTH_TIMEOUT_MS
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Healthcheck retornou HTTP ${response.statusCode}`));
          return;
        }

        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!payload || payload.ok !== true) {
            reject(new Error('Healthcheck retornou payload invÃ¡lido.'));
            return;
          }
          resolve(payload);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Healthcheck excedeu o tempo limite.'));
    });

    req.on('error', reject);
  });
}

function startHealthMonitor() {
  clearHealthMonitor();

  healthTimer = setInterval(async () => {
    if (!child || healthCheckInFlight) return;

    healthCheckInFlight = true;

    try {
      await requestHealth();
      healthFailures = 0;
      restartAttempts = 0;
    } catch (error) {
      healthFailures += 1;
      log(`Falha no healthcheck (${healthFailures}/${HEALTH_FAILURE_LIMIT}): ${error.message}`);

      if (healthFailures >= HEALTH_FAILURE_LIMIT) {
        forceRestart('Servidor parou de responder ao healthcheck.');
      }
    } finally {
      healthCheckInFlight = false;
    }
  }, HEALTH_INTERVAL_MS);

  healthTimer.unref?.();
}

function scheduleRestart(reason) {
  if (stopping || restartTimer) return;

  restartAttempts += 1;
  const delayMs = getRestartDelayMs();
  log(`${reason} Reiniciando em ${delayMs}ms.`);

  restartTimer = setTimeout(() => {
    restartTimer = null;
    startChild();
  }, delayMs);
}

function stopChild() {
  if (!child) return;

  try {
    child.kill('SIGTERM');
  } catch (error) {
    log(`NÃ£o foi possÃ­vel encerrar o servidor filho: ${error.message}`);
  }
}

function forceRestart(reason) {
  if (!child) {
    scheduleRestart(reason);
    return;
  }

  if (child.__restartRequested) return;

  child.__restartRequested = true;
  log(reason);
  stopChild();

  setTimeout(() => {
    if (!child) return;
    try {
      child.kill('SIGKILL');
    } catch (error) {
      log(`Encerramento forÃ§ado falhou: ${error.message}`);
    }
  }, 4000).unref?.();
}

function handleChildExit(code, signal) {
  clearHealthMonitor();
  healthCheckInFlight = false;

  const wasRestartRequested = Boolean(child?.__restartRequested);
  child = null;

  if (stopping) {
    process.exit(code || 0);
    return;
  }

  healthFailures = 0;
  scheduleRestart(
    wasRestartRequested
      ? 'Supervisor solicitou reinicializaÃ§Ã£o do servidor.'
      : `Servidor finalizado (${signal || code || 'sem cÃ³digo'}).`
  );
}

function startChild() {
  clearHealthMonitor();
  healthFailures = 0;
  healthCheckInFlight = false;

  child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true
  });

  child.__restartRequested = false;
  child.on('exit', handleChildExit);
  child.on('error', (error) => {
    log(`Erro no processo filho: ${error.message}`);
    handleChildExit(1, 'spawn-error');
  });

  log(`Servidor iniciado sob supervisÃ£o em http://${HOST}:${PORT}`);
  startHealthMonitor();
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;

  log(`Encerrando supervisor por ${signal}.`);
  clearHealthMonitor();

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (!child) {
    process.exit(0);
    return;
  }

  child.once('exit', () => process.exit(0));
  stopChild();

  setTimeout(() => {
    if (!child) {
      process.exit(0);
      return;
    }

    try {
      child.kill('SIGKILL');
    } catch (error) {
      log(`Encerramento final falhou: ${error.message}`);
    }
    process.exit(0);
  }, 4000).unref?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGBREAK', () => shutdown('SIGBREAK'));

startChild();
