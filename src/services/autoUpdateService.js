(() => {
  'use strict';

  const root = window.SkyDroneServices = window.SkyDroneServices || {};

  let refreshTimer = null;
  let countdownTimer = null;
  let scheduledAt = 0;
  let status = {
    state: 'idle',
    message: 'Aguardando atualizacao',
    updatedAt: new Date().toISOString()
  };

  function stop() {
    window.clearTimeout(refreshTimer);
    window.clearInterval(countdownTimer);
    refreshTimer = null;
    countdownTimer = null;
    scheduledAt = 0;
  }

  function setStatus(nextState, message) {
    status = {
      state: nextState || status.state,
      message: message || status.message,
      updatedAt: new Date().toISOString()
    };
    return status;
  }

  function getScheduledSeconds() {
    if (!scheduledAt) return 0;
    return Math.max(0, Math.ceil((scheduledAt - Date.now()) / 1000));
  }

  function schedule(options = {}) {
    const delayMs = Math.max(1000, Math.round(Number(options.delayMs) || 5 * 60 * 1000));
    const onRefresh = typeof options.onRefresh === 'function' ? options.onRefresh : null;
    const onCountdown = typeof options.onCountdown === 'function' ? options.onCountdown : null;

    stop();
    scheduledAt = Date.now() + delayMs;
    setStatus('scheduled', 'Proxima atualizacao agendada');

    if (onCountdown) {
      onCountdown(getScheduledSeconds());
      countdownTimer = window.setInterval(() => {
        onCountdown(getScheduledSeconds());
      }, 1000);
    }

    refreshTimer = window.setTimeout(() => {
      setStatus('updating', 'Atualizando...');
      if (onRefresh) onRefresh();
    }, delayMs);

    return {
      refreshTimer,
      countdownTimer,
      scheduledAt
    };
  }

  root.autoUpdateService = {
    schedule,
    stop,
    setStatus,
    getStatus: () => ({ ...status }),
    getScheduledSeconds,
    getRefreshTimer: () => refreshTimer,
    getCountdownTimer: () => countdownTimer
  };
})();
