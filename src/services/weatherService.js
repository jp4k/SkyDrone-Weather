(() => {
  'use strict';

  const root = window.SkyDroneServices = window.SkyDroneServices || {};
  const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const WEATHERAPI_FORECAST_URL = 'https://api.weatherapi.com/v1/forecast.json';
  const PREPARED_BACKEND_MODELS = Object.freeze([
    'ECMWF licensed',
    'AROME',
    'NAM',
    'HRRR',
    'ACCESS',
    'OpenWeather',
    'WeatherAPI'
  ]);

  function getConfiguredBackendOrigin() {
    let stored = '';
    try {
      stored = String(localStorage.getItem('vento.proxy.origin') || '').trim();
    } catch (error) {
      stored = '';
    }
    const configured = String(window.VENTO_PROXY_ORIGIN || stored || '').trim();
    if (/^https?:\/\//i.test(configured)) {
      return configured.replace(/\/+$/, '');
    }

    if (!window.location || !/^https?:$/i.test(window.location.protocol)) {
      return '';
    }

    const hostname = window.location.hostname;
    const isLocalBackend = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0';

    return isLocalBackend ? window.location.origin : '';
  }

  function hasServerlessBackend() {
    return Boolean(getConfiguredBackendOrigin());
  }

  function buildBackendProxyUrl(targetUrl) {
    const origin = getConfiguredBackendOrigin();
    if (!origin) {
      throw new Error('Backend/serverless indisponivel para fonte opcional.');
    }

    const proxyUrl = new URL('/api/proxy', origin);
    proxyUrl.searchParams.set('url', targetUrl);
    return proxyUrl.toString();
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 8000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: options.headers || {}
      });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.statusCode = response.status;
        throw error;
      }

      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function fetchOpenMeteo(location, options = {}) {
    const params = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lon),
      timezone: 'auto',
      forecast_days: String(options.forecastDays || 7),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,visibility,uv_index',
      hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,visibility,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset'
    });

    return fetchJson(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`, {
      timeoutMs: options.timeoutMs || 8000
    });
  }

  async function fetchWeatherApiViaBackend(location, options = {}) {
    if (!hasServerlessBackend()) {
      const error = new Error('WeatherAPI opcional requer backend/serverless.');
      error.code = 'backend_unavailable';
      throw error;
    }

    const params = new URLSearchParams({
      q: `${location.lat},${location.lon}`,
      days: String(options.days || 3),
      alerts: 'yes',
      aqi: 'no',
      lang: 'pt'
    });
    const targetUrl = `${WEATHERAPI_FORECAST_URL}?${params.toString()}`;

    return fetchJson(buildBackendProxyUrl(targetUrl), {
      timeoutMs: options.timeoutMs || 9000
    });
  }

  root.weatherService = {
    fetchOpenMeteo,
    fetchWeatherApiViaBackend,
    hasServerlessBackend,
    getConfiguredBackendOrigin,
    buildBackendProxyUrl,
    getPreparedBackendModels: () => [...PREPARED_BACKEND_MODELS]
  };
})();
