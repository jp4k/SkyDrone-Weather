(() => {
  'use strict';

  const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
  const OPEN_METEO_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  const AVIATION_WEATHER_BASE_URL = 'https://aviationweather.gov';
  const METAR_STATIONS_CACHE_URL = `${AVIATION_WEATHER_BASE_URL}/data/cache/stations.cache.json.gz`;
  const METAR_DATA_URL = `${AVIATION_WEATHER_BASE_URL}/api/data/metar`;
  const METEOSTAT_HOURLY_URL = 'https://meteostat.p.rapidapi.com/point/hourly';
  const METEOSTAT_DAILY_URL = 'https://meteostat.p.rapidapi.com/point/daily';
  const METEOSTAT_NEARBY_STATIONS_URL = 'https://meteostat.p.rapidapi.com/stations/nearby';
  const METEOSTAT_STATION_HOURLY_URL = 'https://meteostat.p.rapidapi.com/stations/hourly';
  const METEOSTAT_STATION_DAILY_URL = 'https://meteostat.p.rapidapi.com/stations/daily';
  const INMET_PREVMET_URL = 'https://apiprevmet3.inmet.gov.br';
  const INMET_STATIONS_URL = 'https://apitempo.inmet.gov.br/estacoes';
  const INMET_STATION_DATA_URL = 'https://apitempo.inmet.gov.br/estacao';
  const CPTEC_XML_URL = 'https://servicos.cptec.inpe.br/XML';
  const CLIMATEMPO_BASE_URL = 'https://www.climatempo.com.br';
  const CLIMATEMPO_JSON_URL = `${CLIMATEMPO_BASE_URL}/json`;
  const CLIMATEMPO_MATCH_RADIUS_KM = 18;
  const CLIMATEMPO_CITY_RADIUS_KM = 120;
  const NOAA_POINTS_URL = 'https://api.weather.gov/points';
  const RAINVIEWER_URL = 'https://api.rainviewer.com/public/weather-maps.json';

  const FALLBACK_LOCATION = { lat: -30.3619, lon: -54.1169, name: 'São Gabriel - RS' };
  const DEFAULT_REFRESH_SECONDS = 300;
  const CORE_PROVIDER_TIMEOUT_MS = 2000;
  const METEOSTAT_HISTORY_DAYS = 7;
  const STATION_CACHE_TTL_MS = 10 * 60 * 1000;
  const STATION_NEAR_RADIUS_KM = 50;
  const STATION_BLEND_RADIUS_KM = 150;
  const STATION_DISCOVERY_RADIUS_KM = 250;
  const STATION_BLEND_LIMIT = 4;
  const INMET_STATION_LOOKBACK_DAYS = 4;
  const INMET_STATION_CANDIDATE_LIMIT = 6;
  const INMET_STATION_CACHE_KEY = 'lookup:inmet-stations:v1';
  const INMET_STATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const METAR_STATION_CACHE_KEY = 'lookup:metar-stations:v1';
  const METAR_STATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const METAR_STATION_CANDIDATE_LIMIT = 8;
  const FIELD_FRAME_OFFSETS = [0, 3, 6, 9, 12, 15, 18, 21];
  const FIELD_GRID_SIZE = 5;
  const FIELD_GRID_LAT_STEP = 0.38;
  const PROVIDER_ORDER = ['openMeteo', 'gfs', 'icon', 'ecmwf', 'weatherApi', 'demoWeather'];
  const MULTI_MODEL_PROVIDER_KEYS = ['openMeteo', 'gfs', 'icon', 'ecmwf', 'weatherApi'];
  const FIELD_MODEL_WEIGHTS = Object.freeze({
    ecmwf: 1.0,
    gfs: 0.8,
    icon: 0.7,
    openMeteo: 0.6
  });
  const PROVIDER_BASE_WEIGHTS = Object.freeze({
    openMeteo: 1.0,
    gfs: 0.9,
    icon: 0.86,
    ecmwf: 0.96,
    weatherApi: 0.78,
    demoWeather: 0.25
  });
  const BRAZIL_SOURCE_WEIGHTS = Object.freeze({
    inmet: 1.1,
    metarNoaa: 1.0,
    meteostat: 0.9,
    regionalBrasil: 1.0
  });
  const BRAZIL_SOURCE_CONFIDENCE_BONUS = Object.freeze({
    inmet: 4.2,
    metarNoaa: 3.1,
    meteostat: 2.4,
    regionalBrasil: 2.4
  });
  const CLIMATEMPO_SOURCES = [
    {
      pageUrl: 'https://www.climatempo.com.br/previsao-do-tempo/15-dias/cidade/5246/saogabriel-ba',
      city: 'São Gabriel',
      uf: 'BA',
      lat: -11.229,
      lon: -41.912,
      label: 'São Gabriel - BA'
    }
  ];

  const CACHE_TTL = {
    weather: 5 * 60 * 1000,
    provider: 5 * 60 * 1000,
    stationSelection: STATION_CACHE_TTL_MS,
    radar: 10 * 60 * 1000,
    history: 45 * 60 * 1000,
    search: 24 * 60 * 60 * 1000,
    field: 15 * 60 * 1000
  };

  const RESILIENCE_LIMITS = {
    minRetryMs: 60 * 1000,
    maxRetryMs: 5 * 60 * 1000,
    refreshStallMs: 45 * 1000,
    renderStallMs: 20 * 1000,
    overlayRetryMs: 15 * 1000,
    visibilityCatchupMs: 75 * 1000,
    recoveryCooldownMs: 10 * 1000,
    hiddenAnimationFloorMs: 1800,
    scheduleGraceMs: 4000,
    watchdogMs: 15000
  };
  const LOW_CONFIDENCE_RETRY_MS = 60 * 1000;

  const METRIC_LIMITS = {
    temperature: { min: -90, max: 60, digits: 1 },
    feelsLike: { min: -110, max: 70, digits: 1 },
    humidity: { min: 0, max: 100, digits: 0 },
    pressure: { min: 850, max: 1100, digits: 1 },
    windSpeed: { min: 0, max: 220, digits: 1 },
    windDirection: { min: 0, max: 360, digits: 0, circular: true },
    windGusts: { min: 0, max: 280, digits: 1 },
    precipitation: { min: 0, max: 500, digits: 1 },
    rainProbability: { min: 0, max: 100, digits: 0 },
    cloudCover: { min: 0, max: 100, digits: 0 },
    visibilityKm: { min: 0.1, max: 80, digits: 1 },
    uvIndex: { min: 0, max: 20, digits: 1 },
    maxTemp: { min: -90, max: 60, digits: 1 },
    minTemp: { min: -90, max: 60, digits: 1 },
    feelsLikeMax: { min: -110, max: 70, digits: 1 },
    feelsLikeMin: { min: -110, max: 70, digits: 1 },
    humidityMean: { min: 0, max: 100, digits: 0 },
    uvIndexMax: { min: 0, max: 20, digits: 1 }
  };

  const ROBUST_METRIC_RULES = {
    temperature: { outlierDelta: 8, minSampleCount: 3 },
    feelsLike: { outlierDelta: 10, minSampleCount: 3 },
    humidity: { outlierDelta: 25, minSampleCount: 3 },
    pressure: { outlierDelta: 12, minSampleCount: 3 },
    windSpeed: { outlierDelta: 18, minSampleCount: 3 },
    windGusts: { outlierDelta: 24, minSampleCount: 3 },
    visibilityKm: { outlierDelta: 18, minSampleCount: 3 },
    cloudCover: { outlierDelta: 40, minSampleCount: 3 },
    rainProbability: { outlierDelta: 45, minSampleCount: 4 },
    precipitation: { outlierDelta: 15, minSampleCount: 4 },
    maxTemp: { outlierDelta: 8, minSampleCount: 3 },
    minTemp: { outlierDelta: 8, minSampleCount: 3 },
    feelsLikeMax: { outlierDelta: 10, minSampleCount: 3 },
    feelsLikeMin: { outlierDelta: 10, minSampleCount: 3 },
    humidityMean: { outlierDelta: 25, minSampleCount: 3 }
  };
  const MODEL_DIVERGENCE_THRESHOLDS = Object.freeze({
    temperature: { medium: 3, high: 7 },
    windSpeed: { medium: 8, high: 18 },
    rainProbability: { medium: 35, high: 70 }
  });

  const STORAGE_KEYS = {
    favorites: 'vento.climate.favorites.v2'
  };

  const WEATHER_KEYS = loadWeatherKeys();

  const PROVIDERS = [
    {
      providerKey: 'openMeteo',
      label: 'Open-Meteo',
      type: 'primary',
      reliability: 0.92,
      fetcher: (location) => fetchOpenMeteoModel(location, {
        providerKey: 'openMeteo',
        label: 'Open-Meteo'
      })
    },
    {
      providerKey: 'gfs',
      label: 'GFS',
      type: 'model',
      reliability: 0.9,
      fetcher: (location) => fetchOpenMeteoModel(location, {
        providerKey: 'gfs',
        label: 'GFS',
        model: 'gfs_seamless'
      })
    },
    {
      providerKey: 'icon',
      label: 'ICON',
      type: 'model',
      reliability: 0.86,
      fetcher: (location) => fetchOpenMeteoModel(location, {
        providerKey: 'icon',
        label: 'ICON',
        model: 'icon_seamless'
      })
    },
    {
      providerKey: 'ecmwf',
      label: 'ECMWF',
      type: 'model',
      reliability: 0.96,
      fetcher: (location) => fetchOpenMeteoModel(location, {
        providerKey: 'ecmwf',
        label: 'ECMWF',
        model: 'ecmwf_ifs04'
      })
    },
    {
      providerKey: 'weatherApi',
      label: 'WeatherAPI serverless',
      type: 'serverless',
      reliability: 0.86,
      requiresBackend: true,
      fetcher: fetchWeatherApi
    }
  ];

  function isProviderEnabled(provider) {
    if (!provider?.requiresBackend) return true;
    return Boolean(window.SkyDroneServices?.weatherService?.hasServerlessBackend?.());
  }

  function getEnabledProviders() {
    return PROVIDERS.filter(isProviderEnabled);
  }

  const dom = {};
  const climateLayers = {};
  const climateCharts = {
    overview: null,
    wind: null,
    atmosphere: null
  };

  const state = {
    activeTab: 'clima',
    climateLayer: 'default',
    weatherLayer: 'temperature',
    chartMode: 'overview',
    chartRangeHours: 24,
    refreshSeconds: DEFAULT_REFRESH_SECONDS,
    countdown: DEFAULT_REFRESH_SECONDS,
    selectedDayIndex: 0,
    requestId: 0,
    lastUpdate: null,
    cacheInfo: {
      used: false,
      stale: false,
      ageMs: 0
    },
    location: { ...FALLBACK_LOCATION },
    locationInfo: {
      message: 'Obtendo localização...',
      tone: ''
    },
    weatherBundle: null,
    providerRuns: [],
    favorites: loadFavorites(),
    searchResults: [],
    history: null,
    animation: {
      playing: true,
      speedMs: 1400,
      frameIndex: 0,
      timer: null,
      lastTickAt: 0
    },
    radar: {
      frames: [],
      activeLayer: null
    },
    fieldOverlay: {
      key: '',
      model: 'fused',
      bundle: null,
      loading: false
    },
    resilience: {
      notice: null,
      refreshInFlight: false,
      lastRefreshStartedAt: 0,
      lastRefreshCompletedAt: 0,
      lastSuccessfulRefreshAt: 0,
      lastRefreshErrorAt: 0,
      lastOverlayRenderedAt: 0,
      lastAnimationAdvanceAt: 0,
      lastRecoveryAt: 0,
      consecutiveRefreshFailures: 0,
      scheduledRefreshAt: 0,
      lastGoodWeatherBundle: null,
      lastGoodProviderRuns: [],
      lastGoodCacheInfo: {
        used: false,
        stale: false,
        ageMs: 0
      },
      lastGoodFieldBundle: null,
      lastGoodRadarFrames: [],
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false
    },
    timers: {
      refresh: null,
      countdown: null,
      search: null,
      health: null,
      fieldRecovery: null,
      radarRecovery: null,
      runtimeRecovery: null
    }
  };

  let climateMap = null;
  let droneMap = null;
  let climateMarker = null;
  let droneMarker = null;
  let droneRadius = null;
  let fieldRenderer = null;

  document.addEventListener('DOMContentLoaded', init);
  window.switchTab = switchTab;

  function init() {
    cacheDom();
    reportMissingClimateElements();
    prepareClimateShell();
    bindUI();
    initResilienceRuntime();
    hydrateFavorites();
    if (typeof L !== 'undefined' && document.getElementById('map')) {
      initClimateMap();
    } else {
      console.warn('[clima] Leaflet indisponivel. O mapa da aba Clima nao sera iniciado.');
    }
    registerSharedWeatherBridge();
    updateChartButtons();
    updateWeatherLayerButtons();
    updateBaseLayerButtons();
    updateAnimationButton();
    hydrateSharedWeatherCache();
    updateLocationDisplays();
    updateCountdown();
    if (!state.weatherBundle) {
      renderProviderStatusGrid([]);
      renderHistoricalSummary();
    }
    resolveUserLocation();
  }

  function reportMissingClimateElements() {
    [
      'temp',
      'feels',
      'vento',
      'umidade',
      'chuva',
      'currentSummary',
      'currentWindDirection',
      'currentRainProbability',
      'forecastWeek',
      'hourlyTimeline',
      'map'
    ].forEach((id) => {
      if (!document.getElementById(id)) {
        console.warn(`[clima] Elemento ausente: #${id}`);
      }
    });
  }

  function prepareClimateShell() {
    const climaRoot = document.getElementById('clima');
    if (climaRoot) {
      climaRoot.classList.add('weather-theme-initializing');
    }

    if (dom.mapModelSelect) {
      dom.mapModelSelect.innerHTML = `
        <option value="fused" selected>Modo: Open-Meteo</option>
        <option value="ecmwf">Campo: ECMWF sem chave</option>
        <option value="gfs">Campo: GFS sem chave</option>
      `;
    }

    if (dom.locationSearchInput && !dom.locationSearchInput.placeholder.includes('coordenadas')) {
      dom.locationSearchInput.placeholder = 'Buscar cidade, aeroporto, regiao ou coordenadas';
    }
  }

  function initResilienceRuntime() {
    state.resilience.online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    state.resilience.lastAnimationAdvanceAt = Date.now();
    state.resilience.lastOverlayRenderedAt = Date.now();
    state.timers.health = window.setInterval(runResilienceWatchdog, RESILIENCE_LIMITS.watchdogMs);
    startAutoRefresh(getBaseRefreshDelayMs());

    window.addEventListener('online', () => {
      state.resilience.online = true;
      clearResilienceNotice();
      startAutoRefresh(1500);
      recoverRuntime('Conectividade restaurada. O motor meteorolÃ³gico estÃ¡ sincronizando novamente.', { forceRefresh: true });
    });

    window.addEventListener('offline', () => {
      state.resilience.online = false;
      setResilienceNotice(buildResilienceNotice('ConexÃ£o indisponÃ­vel. Mantendo o Ãºltimo quadro vÃ¡lido atÃ© a reconexÃ£o.'));
      if (state.weatherBundle) {
        renderClimateTab();
      }
      startAutoRefresh(getRecoveryRefreshDelayMs());
    });

    window.addEventListener('focus', () => {
      if (Date.now() - state.resilience.lastSuccessfulRefreshAt > RESILIENCE_LIMITS.visibilityCatchupMs) {
        startAutoRefresh(1200);
      }
      restartAnimationLoop();
    });

    window.addEventListener('pageshow', () => {
      restartAnimationLoop();
      if (Date.now() - state.resilience.lastSuccessfulRefreshAt > RESILIENCE_LIMITS.visibilityCatchupMs) {
        startAutoRefresh(1200);
      }
    });

    window.addEventListener('error', (event) => {
      recoverRuntime(event.error || event.message || 'Erro inesperado no painel climÃ¡tico.');
    });

    window.addEventListener('unhandledrejection', (event) => {
      recoverRuntime(event.reason || 'Falha assÃ­ncrona no painel climÃ¡tico.');
    });
  }

  function getBaseRefreshDelayMs() {
    return Math.max(RESILIENCE_LIMITS.minRetryMs, Number(state.refreshSeconds || DEFAULT_REFRESH_SECONDS) * 1000);
  }

  function getRecoveryRefreshDelayMs() {
    const baseDelay = Math.min(getBaseRefreshDelayMs(), RESILIENCE_LIMITS.maxRetryMs);
    const multiplier = Math.pow(1.6, Math.max(0, state.resilience.consecutiveRefreshFailures - 1));
    return clamp(Math.round(baseDelay * multiplier), RESILIENCE_LIMITS.minRetryMs, RESILIENCE_LIMITS.maxRetryMs);
  }

  function getScheduledSecondsRemaining() {
    if (!state.resilience.scheduledRefreshAt) return state.refreshSeconds;
    return Math.max(0, Math.ceil((state.resilience.scheduledRefreshAt - Date.now()) / 1000));
  }

  function buildResilienceNotice(text, tone = 'warning') {
    return {
      tone,
      text
    };
  }

  function setResilienceNotice(notice) {
    state.resilience.notice = notice || null;
  }

  function clearResilienceNotice() {
    state.resilience.notice = null;
  }

  function registerSharedWeatherBridge() {
    if (!window.weatherFusionEngine?.registerBundleFetcher) return;

    window.weatherFusionEngine.registerBundleFetcher(async (location, options = {}) => {
      const target = {
        lat: Number(location?.lat),
        lon: Number(location?.lon),
        name: location?.name || state.location?.name || 'Ponto selecionado'
      };

      return getWeatherBundleForLocation(target, {
        force: Boolean(options.force)
      });
    });
  }

  function hydrateSharedWeatherCache() {
    const cachedBundle = window.weatherFusionEngine?.getLastBundle?.();
    if (!cachedBundle?.current) return;
    const allowedProviders = new Set(getEnabledProviders().map((provider) => provider.providerKey));
    const cachedProviders = (Array.isArray(cachedBundle.providers) ? cachedBundle.providers : [])
      .filter((provider) => allowedProviders.has(provider.providerKey));

    state.location = {
      ...state.location,
      ...(cachedBundle.location || {})
    };
    state.weatherBundle = {
      ...cachedBundle,
      providers: cachedProviders
    };
    state.providerRuns = cachedProviders.slice();
    state.cacheInfo = {
      used: true,
      stale: false,
      ageMs: Math.max(0, Date.now() - new Date(cachedBundle.generatedAt || Date.now()).getTime())
    };
    state.lastUpdate = new Date(cachedBundle.generatedAt || Date.now());
    state.locationInfo = {
      message: 'Ultimo pacote meteorologico restaurado localmente.',
      tone: 'success'
    };
    rememberSuccessfulWeatherState(cachedBundle, state.providerRuns, state.cacheInfo);
    setResilienceNotice(buildResilienceNotice('Usando \u00faltimo dado valido salvo'));
    setWeatherUpdateStatus('Usando \u00faltimo dado valido salvo', 'cache');
    syncSharedWeatherEngine();
    renderClimateTab();
    renderDroneTab();
    updateTimestamp();
  }

  function syncSharedWeatherEngine() {
    if (!state.weatherBundle || !window.weatherFusionEngine?.setLastBundle) return;
    window.weatherFusionEngine.setLastBundle(state.weatherBundle, state.providerRuns, state.cacheInfo);
  }

  function applyReliabilityGuard(bundle, providerRuns, cacheInfo) {
    return window.SkyDroneServices?.reliabilityService?.applyToBundle?.(bundle, providerRuns, cacheInfo) || bundle;
  }

  function saveLastValidWeatherBundle(bundle, providerRuns, cacheInfo) {
    if (!bundle?.current || cacheInfo?.used) return;
    window.SkyDroneServices?.cacheService?.saveLastValid?.(null, bundle, {
      location: state.location,
      providerRuns,
      cacheInfo
    });
  }

  function buildCachedWeatherResult(bundle, providerRuns, cacheInfo) {
    const adjustedBundle = applyReliabilityGuard(bundle, providerRuns, cacheInfo);
    return {
      bundle: adjustedBundle,
      providerRuns,
      cacheInfo
    };
  }

  function setWeatherUpdateStatus(message, tone = '') {
    if (dom.locationSearchStatus) {
      dom.locationSearchStatus.textContent = message;
    }
    window.SkyDroneServices?.autoUpdateService?.setStatus?.(tone || 'info', message);
  }

  function getActiveWeatherModelLabels(providerRuns = state.providerRuns) {
    return (Array.isArray(providerRuns) ? providerRuns : [])
      .filter((run) => isDisplayableLiveProvider(run))
      .filter((run) => run.type !== 'demo' && run.type !== 'cache' && run.providerKey !== 'demoWeather' && run.providerKey !== 'savedCache')
      .map((run) => run.label || run.providerKey)
      .filter(Boolean);
  }

  function isDisplayableLiveProvider(run) {
    if (!run || run.success !== true || run.status === 'loading' || run.hidden) return false;
    if (!hasUsableProviderSignal(run)) return false;
    const message = String(run.message || '').toLowerCase();
    const fromFallbackCache = message.includes('cache') || message.includes('fallback automatico') || message.includes('fallback autom');
    return !fromFallbackCache || run.status === 'online';
  }

  function getModelsSummary(providerRuns = state.providerRuns) {
    const labels = getActiveWeatherModelLabels(providerRuns);
    if (!labels.length) return 'Modelos: indisponiveis';
    const visible = labels.slice(0, 4).join(' + ');
    return labels.length > 4 ? `Modelos: ${visible} +${labels.length - 4}` : `Modelos: ${visible}`;
  }

  function getUpdateAgeText(date = state.lastUpdate) {
    if (!date) return 'Atualizacao pendente';
    const ageMs = Math.max(0, Date.now() - new Date(date).getTime());
    return `Atualizado ha ${formatDurationShort(ageMs)}`;
  }

  function rememberSuccessfulWeatherState(bundle, providerRuns, cacheInfo) {
    state.resilience.lastGoodWeatherBundle = bundle;
    state.resilience.lastGoodProviderRuns = Array.isArray(providerRuns) ? providerRuns.slice() : [];
    state.resilience.lastGoodCacheInfo = {
      used: Boolean(cacheInfo?.used),
      stale: Boolean(cacheInfo?.stale),
      ageMs: Number(cacheInfo?.ageMs) || 0
    };
    state.resilience.lastSuccessfulRefreshAt = Date.now();
    saveLastValidWeatherBundle(bundle, providerRuns, cacheInfo);
  }

  function restoreLastGoodWeatherState(error) {
    if (!state.resilience.lastGoodWeatherBundle) return false;

    state.providerRuns = state.resilience.lastGoodProviderRuns.slice();
    state.cacheInfo = {
      used: true,
      stale: true,
      apiFailed: true,
      ageMs: state.resilience.lastSuccessfulRefreshAt
        ? Date.now() - state.resilience.lastSuccessfulRefreshAt
        : state.resilience.lastGoodCacheInfo.ageMs,
      reason: 'Usando ultimo dado valido salvo'
    };
    state.weatherBundle = applyReliabilityGuard(state.resilience.lastGoodWeatherBundle, state.providerRuns, state.cacheInfo);
    state.lastUpdate = new Date(state.resilience.lastSuccessfulRefreshAt || Date.now());
    setResilienceNotice(buildResilienceNotice('Usando \u00faltimo dado valido salvo'));
    setWeatherUpdateStatus('Usando \u00faltimo dado valido salvo', 'cache');
    setResilienceNotice(buildResilienceNotice(
      state.resilience.online
        ? `Falha temporÃ¡ria ao atualizar os dados. Mantendo o Ãºltimo pacote vÃ¡lido enquanto o sistema se recupera automaticamente.`
        : 'ConexÃ£o indisponÃ­vel. Mantendo o Ãºltimo pacote vÃ¡lido atÃ© o retorno da rede.'
    ));
    updateRadarStatus('Motor em fallback resiliente com o Ãºltimo frame vÃ¡lido.');
    syncSharedWeatherEngine();
    setResilienceNotice(buildResilienceNotice('Usando \u00faltimo dado valido salvo'));
    setWeatherUpdateStatus('Usando \u00faltimo dado valido salvo', 'cache');
    renderClimateTab();
    renderDroneTab();
    updateTimestamp();
    return true;
  }

  function rememberFieldBundle(bundle) {
    if (bundle?.frames?.length) {
      state.resilience.lastGoodFieldBundle = bundle;
    }
  }

  function rememberRadarFrames(frames) {
    if (Array.isArray(frames) && frames.length) {
      state.resilience.lastGoodRadarFrames = frames.slice();
    }
  }

  function noteOverlayRendered() {
    const now = Date.now();
    state.resilience.lastOverlayRenderedAt = now;
    state.resilience.lastAnimationAdvanceAt = now;
  }

  function scheduleOverlayRecovery(kind, force = false) {
    const timerKey = kind === 'radar' ? 'radarRecovery' : 'fieldRecovery';
    window.clearTimeout(state.timers[timerKey]);
    state.timers[timerKey] = window.setTimeout(async () => {
      try {
        if (kind === 'radar') {
          await loadRadarFrames(force);
          if (state.weatherLayer === 'radar') {
            showRadarFrame(state.animation.frameIndex);
          }
          return;
        }

        state.fieldOverlay.key = '';
        if (state.weatherLayer !== 'radar') {
          await renderMapOverlays();
        }
      } catch (error) {
        console.warn(`Falha ao recuperar camada ${kind}:`, error);
      }
    }, RESILIENCE_LIMITS.overlayRetryMs);
  }

  function recoverRuntime(reason, options = {}) {
    const now = Date.now();
    if (now - state.resilience.lastRecoveryAt < RESILIENCE_LIMITS.recoveryCooldownMs) return;

    state.resilience.lastRecoveryAt = now;
    setResilienceNotice(buildResilienceNotice(
      typeof reason === 'string' && reason
        ? `${reason} RecuperaÃ§Ã£o automÃ¡tica em andamento.`
        : 'Falha interna detectada. RecuperaÃ§Ã£o automÃ¡tica em andamento.'
    ));

    if (state.weatherBundle) {
      renderClimateTab();
    }

    window.clearTimeout(state.timers.runtimeRecovery);
    state.timers.runtimeRecovery = window.setTimeout(async () => {
      try {
        restartAnimationLoop();
        if (state.activeTab === 'clima') {
          await renderMapOverlays();
        }
        if (!state.resilience.refreshInFlight) {
          refreshWeather({ showLoading: false, force: Boolean(options.forceRefresh) });
        }
      } catch (error) {
        console.warn('Falha durante a recuperaÃ§Ã£o automÃ¡tica:', error);
      }
    }, 180);
  }

  function runResilienceWatchdog() {
    const now = Date.now();

    if (state.resilience.refreshInFlight && now - state.resilience.lastRefreshStartedAt > RESILIENCE_LIMITS.refreshStallMs) {
      state.resilience.refreshInFlight = false;
      recoverRuntime('AtualizaÃ§Ã£o meteorolÃ³gica travou.', { forceRefresh: true });
      startAutoRefresh(1500);
      return;
    }

    if (state.activeTab === 'clima' && state.animation.playing && !document.hidden) {
      const frameCount = getAnimationFrameCount();
      if (frameCount > 1 && now - state.resilience.lastAnimationAdvanceAt > Math.max(RESILIENCE_LIMITS.renderStallMs, state.animation.speedMs * 6)) {
        recoverRuntime('Loop de animaÃ§Ã£o ficou sem avanÃ§o.', { forceRefresh: false });
      }
    }

    if (state.resilience.scheduledRefreshAt && now > state.resilience.scheduledRefreshAt + RESILIENCE_LIMITS.scheduleGraceMs && !state.resilience.refreshInFlight) {
      startAutoRefresh(1000);
    }

    if (state.weatherBundle && state.weatherLayer !== 'radar' && !state.fieldOverlay.bundle && state.resilience.lastGoodFieldBundle) {
      state.fieldOverlay.bundle = state.resilience.lastGoodFieldBundle;
      if (state.activeTab === 'clima') {
        renderMapOverlays().catch(() => {});
      }
    }

    if (state.weatherLayer === 'radar' && !state.radar.frames.length && state.resilience.lastGoodRadarFrames.length) {
      state.radar.frames = state.resilience.lastGoodRadarFrames.slice();
      if (state.activeTab === 'clima') {
        showRadarFrame(state.animation.frameIndex);
      }
    }
  }

  function cacheDom() {
    [
      'loadingOverlay',
      'climaLocationLabel',
      'currentWeatherIcon',
      'temp',
      'feels',
      'currentSummary',
      'currentStatusTag',
      'currentRainTag',
      'currentWindTag',
      'confidenceValue',
      'confidenceNote',
      'confidenceChip',
      'divergenceValue',
      'divergenceNote',
      'trendValue',
      'trendNote',
      'locationSearchForm',
      'locationSearchInput',
      'searchResults',
      'detectLocationBtn',
      'manualRefreshBtn',
      'addFavoriteBtn',
      'favoritesSelect',
      'refreshIntervalSelect',
      'currentLocationSummary',
      'providerSummary',
      'cacheStatus',
      'radarStatus',
      'locationSearchStatus',
      'mapLayerToggle',
      'weatherLayerToggle',
      'animationPlayBtn',
      'animationSpeedSelect',
      'mapModelSelect',
      'animationFrameLabel',
      'time',
      'vento',
      'umidade',
      'chuva',
      'currentWindDirection',
      'currentPressure',
      'currentRainProbability',
      'currentVisibility',
      'currentCloudCover',
      'currentUvValue',
      'currentUvDetail',
      'currentConfidenceValue',
      'currentConfidenceDetail',
      'currentTrendValue',
      'currentTrendDetail',
      'currentSpreadValue',
      'currentSpreadDetail',
      'climateInsights',
      'alertStream',
      'reliabilityScore',
      'reliabilityExplanation',
      'modelSpreadScore',
      'modelSpreadExplanation',
      'trendHeadline',
      'trendExplanation',
      'refreshSummary',
      'refreshExplanation',
      'providerStatusGrid',
      'historicalSummary',
      'hourlyReference',
      'chartModeToggle',
      'chartRangeToggle',
      'graficoOverview',
      'graficoWind',
      'graficoAtmosphere',
      'hourlyTimelineLabel',
      'hourlyTimeline',
      'forecastWeek',
      'detailTitle',
      'detailTimeLabel',
      'detailIntelligence',
      'detailTemp',
      'detailTempRange',
      'detailFeels',
      'detailHumidity',
      'detailHumidityMean',
      'detailPressure',
      'detailVisibility',
      'detailWind',
      'detailGusts',
      'detailWindDirection',
      'detailWindDirectionText',
      'detailCloudCover',
      'detailRainProbability',
      'detailPrecipitation',
      'detailWeatherType',
      'detailWeatherDescription',
      'detailUv',
      'detailConfidence',
      'detailTrend',
      'detailSpread',
      'detailSunWindow',
      'flightStatusPanel',
      'statusIcon',
      'statusTitle',
      'statusSubtitle',
      'flightBadges',
      'flightScore',
      'userLat',
      'userLon',
      'locationStatus',
      'analysisWind',
      'windStatus',
      'analysisGusts',
      'gustsStatus',
      'analysisRain',
      'rainStatus',
      'analysisVis',
      'visStatus',
      'analysisHumidity',
      'humidityStatus',
      'analysisFeels',
      'feelsStatus',
      'metricWind',
      'metricGusts',
      'metricDirection',
      'metricDirectionText',
      'metricTemp',
      'metricFeelsLike',
      'metricHumidity',
      'metricPressure',
      'metricVisibility',
      'metricRainProb',
      'metricClouds',
      'recommendationsList',
      'lastUpdate',
      'countdown'
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });

    dom.loadingText = document.querySelector('.loading-text');
    dom.analysisItems = Array.from(document.querySelectorAll('.analysis-item'));
    dom.layerButtons = Array.from(document.querySelectorAll('#clima [data-layer]'));
    dom.weatherLayerButtons = Array.from(document.querySelectorAll('#clima [data-weather-layer]'));
    dom.chartModeButtons = Array.from(document.querySelectorAll('#clima [data-chart-mode]'));
    dom.chartRangeButtons = Array.from(document.querySelectorAll('#clima [data-range-hours]'));
    dom.chartCanvases = {
      overview: dom.graficoOverview,
      wind: dom.graficoWind,
      atmosphere: dom.graficoAtmosphere
    };
  }

  function bindUI() {
    dom.mapLayerToggle?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-layer]');
      if (!button) return;
      setClimateMapLayer(button.dataset.layer);
    });

    dom.weatherLayerToggle?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-weather-layer]');
      if (!button) return;
      setWeatherLayer(button.dataset.weatherLayer);
    });

    dom.forecastWeek?.addEventListener('click', (event) => {
      const card = event.target.closest('.forecast-card');
      if (!card) return;
      selectForecastDay(Number(card.dataset.dayIndex));
    });

    dom.chartModeToggle?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-chart-mode]');
      if (!button) return;
      setChartMode(button.dataset.chartMode);
    });

    dom.chartRangeToggle?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-range-hours]');
      if (!button) return;
      setChartRange(Number(button.dataset.rangeHours));
    });

    dom.locationSearchForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      performSearch(dom.locationSearchInput?.value || '', true);
    });

    dom.locationSearchInput?.addEventListener('input', () => {
      window.clearTimeout(state.timers.search);
      const query = (dom.locationSearchInput?.value || '').trim();
      if (query.length < 3) {
        renderSearchResults([]);
        return;
      }
      state.timers.search = window.setTimeout(() => {
        performSearch(query, false);
      }, 320);
    });

    dom.searchResults?.addEventListener('click', (event) => {
      const result = event.target.closest('[data-search-lat]');
      if (!result) return;
      applyLocation(
        {
          lat: Number(result.dataset.searchLat),
          lon: Number(result.dataset.searchLon),
          name: result.dataset.searchLabel || 'Local selecionado'
        },
        {
          statusMessage: 'Local ajustado via busca inteligente.',
          statusTone: 'success',
          showLoading: true,
          force: true
        }
      );
      renderSearchResults([]);
    });

    dom.detectLocationBtn?.addEventListener('click', resolveUserLocation);
    dom.manualRefreshBtn?.addEventListener('click', () => refreshWeather({ showLoading: true, force: true }));
    dom.addFavoriteBtn?.addEventListener('click', saveCurrentFavorite);

    dom.favoritesSelect?.addEventListener('change', () => {
      const index = Number(dom.favoritesSelect.value);
      if (!Number.isFinite(index) || index < 0 || index >= state.favorites.length) return;
      const favorite = state.favorites[index];
      applyLocation(
        { lat: favorite.lat, lon: favorite.lon, name: favorite.name },
        {
          statusMessage: `Favorito "${favorite.name}" carregado.`,
          statusTone: 'success',
          showLoading: true,
          force: true
        }
      );
      dom.favoritesSelect.value = '';
    });

    dom.refreshIntervalSelect?.addEventListener('change', () => {
      const nextValue = Number(dom.refreshIntervalSelect.value);
      if (!Number.isFinite(nextValue) || nextValue <= 0) return;
      state.refreshSeconds = nextValue;
      state.countdown = nextValue;
      updateCountdown();
      startAutoRefresh(getBaseRefreshDelayMs());
      if (state.weatherBundle) {
        renderClimateTab();
      }
    });

    dom.animationPlayBtn?.addEventListener('click', toggleAnimation);

    dom.animationSpeedSelect?.addEventListener('change', () => {
      const nextValue = Number(dom.animationSpeedSelect.value);
      if (!Number.isFinite(nextValue) || nextValue <= 0) return;
      state.animation.speedMs = nextValue;
      restartAnimationLoop();
    });

    dom.mapModelSelect?.addEventListener('change', async () => {
      state.fieldOverlay.model = dom.mapModelSelect.value || 'fused';
      state.fieldOverlay.bundle = null;
      state.fieldOverlay.key = '';
      state.animation.frameIndex = 0;
      if (state.weatherLayer !== 'radar') {
        updateRadarStatus('Camada meteorologica atualizada.');
        await renderMapOverlays();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        fieldRenderer?.pauseParticles();
        return;
      }
      fieldRenderer?.resumeParticles();
      fieldRenderer?.sync();
      restartAnimationLoop();
      if (Date.now() - state.resilience.lastSuccessfulRefreshAt > RESILIENCE_LIMITS.visibilityCatchupMs) {
        startAutoRefresh(1200);
      }
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;

    document.querySelectorAll('.tabs button').forEach((button) => button.classList.remove('active'));
    document.querySelectorAll('.content').forEach((content) => content.classList.remove('active'));

    const activeButton = document.querySelector(`[onclick="switchTab('${tab}')"]`);
    const activeContent = document.getElementById(tab);

    if (activeButton) activeButton.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
    window.VentoUXEnhancements?.handleTabChange?.(tab);

    if (tab === 'clima' && climateMap) {
      window.setTimeout(() => {
        climateMap.invalidateSize();
        fieldRenderer?.sync();
        renderMapOverlays();
        renderCharts();
      }, 120);
    }

    if (tab === 'drone') {
      if (!droneMap) {
        initDroneMap();
      }
      if (droneMap) {
        window.setTimeout(() => droneMap.invalidateSize(), 120);
      }
    }

    restartAnimationLoop();
  }

  function resolveUserLocation() {
    state.locationInfo = {
      message: 'Tentando obter localização precisa...',
      tone: ''
    };
    updateLocationDisplays();

    if (!navigator.geolocation) {
      applyLocation(
        { ...FALLBACK_LOCATION },
        {
          statusMessage: 'Geolocalização indisponível. Usando São Gabriel - RS.',
          statusTone: 'warning',
          showLoading: true,
          force: true
        }
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyLocation(
          {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            name: 'Sua localização'
          },
          {
            statusMessage: 'Localização obtida com sucesso.',
            statusTone: 'success',
            showLoading: true,
            force: true
          }
        );
      },
      () => {
        applyLocation(
          { ...FALLBACK_LOCATION },
          {
            statusMessage: 'Permissão negada. Usando São Gabriel - RS como referência.',
            statusTone: 'warning',
            showLoading: true,
            force: true
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  }

  function applyLocation(location, options = {}) {
    state.location = {
      ...state.location,
      ...location
    };

    state.locationInfo = {
      message: options.statusMessage || state.locationInfo.message,
      tone: options.statusTone || state.locationInfo.tone
    };

    state.selectedDayIndex = 0;
    state.animation.frameIndex = 0;
    updateLocationDisplays();
    syncMapMarkers(true);

    if (options.refresh !== false) {
      refreshWeather({
        showLoading: Boolean(options.showLoading),
        force: Boolean(options.force)
      });
    }
  }

  function updateLocationDisplays() {
    const locationLabel = state.location.name || 'Ponto selecionado';
    const coordsLabel = `${state.location.lat.toFixed(4)}, ${state.location.lon.toFixed(4)}`;

    if (dom.userLat) {
      dom.userLat.innerHTML = `${state.location.lat.toFixed(4)}<span class="coord-suffix">&deg;</span>`;
    }
    if (dom.userLon) {
      dom.userLon.innerHTML = `${state.location.lon.toFixed(4)}<span class="coord-suffix">&deg;</span>`;
    }
    if (dom.climaLocationLabel) {
      dom.climaLocationLabel.textContent = `${locationLabel} • ${coordsLabel}`;
    }
    if (dom.currentLocationSummary) {
      dom.currentLocationSummary.textContent = locationLabel;
    }
    if (dom.locationStatus) {
      dom.locationStatus.textContent = state.locationInfo.message;
      dom.locationStatus.className = `location-info${state.locationInfo.tone ? ` ${state.locationInfo.tone}` : ''}`;
    }
    if (dom.locationSearchStatus) {
      dom.locationSearchStatus.textContent = state.locationInfo.message;
    }
  }

  async function refreshWeather({ showLoading = false, force = false } = {}) {
    if (state.resilience.refreshInFlight) {
      const activeRefreshAge = Date.now() - state.resilience.lastRefreshStartedAt;
      if (!force || activeRefreshAge < RESILIENCE_LIMITS.refreshStallMs) {
        return;
      }
      state.resilience.refreshInFlight = false;
    }

    const requestId = ++state.requestId;
    state.resilience.refreshInFlight = true;
    state.resilience.lastRefreshStartedAt = Date.now();

    try {
      if (showLoading) {
        showLoadingOverlay(true, 'Sincronizando dados meteorologicos...');
      }

      setWeatherUpdateStatus('Atualizando...', 'updating');

      const result = await getWeatherBundleForLocation(state.location, {
        force,
        onProgress: (providerRuns) => {
          state.providerRuns = providerRuns;
          renderProviderStatusGrid(state.providerRuns);
        }
      });

      if (requestId !== state.requestId) return;

      state.weatherBundle = result.bundle;
      state.providerRuns = result.providerRuns;
      state.cacheInfo = result.cacheInfo;
      state.lastUpdate = new Date(result.bundle.generatedAt || Date.now());
      state.resilience.consecutiveRefreshFailures = 0;
      rememberSuccessfulWeatherState(result.bundle, result.providerRuns, result.cacheInfo);
      clearResilienceNotice();
      syncSharedWeatherEngine();

      if (state.selectedDayIndex >= state.weatherBundle.daily.length) {
        state.selectedDayIndex = 0;
      }

      renderClimateTab();
      renderDroneTab();
      updateTimestamp();
      setWeatherUpdateStatus(
        state.cacheInfo.used
          ? (state.cacheInfo.saved || state.cacheInfo.stale ? 'Usando \u00faltimo dado valido salvo' : 'Usando cache salvo')
          : 'Dados atualizados',
        state.cacheInfo.used ? 'cache' : 'success'
      );
      if (requestId === state.requestId) {
        state.resilience.lastRefreshErrorAt = 0;
        const confidence = Number(state.weatherBundle?.analytics?.confidence);
        startAutoRefresh(Number.isFinite(confidence) && confidence < 70
          ? LOW_CONFIDENCE_RETRY_MS
          : getBaseRefreshDelayMs());
      }
      queueEnhancementLoads();
    } catch (error) {
      state.resilience.lastRefreshErrorAt = Date.now();
      state.resilience.consecutiveRefreshFailures += 1;
      const restored = restoreLastGoodWeatherState(error);
      if (restored) {
        if (requestId === state.requestId) {
          startAutoRefresh(getRecoveryRefreshDelayMs());
        }
        return;
      }
      console.error('Erro ao buscar dados meteorológicos:', error);
      setWeatherUpdateStatus('Erro na atualiza\u00e7\u00e3o', 'error');
      showError('Dados meteorologicos temporariamente indisponiveis. O painel tentara sincronizar novamente em breve.');
      if (requestId === state.requestId) {
        startAutoRefresh(getRecoveryRefreshDelayMs());
      }
    } finally {
      state.resilience.refreshInFlight = false;
      state.resilience.lastRefreshCompletedAt = Date.now();
      if (requestId === state.requestId) {
        showLoadingOverlay(false);
      }
    }
  }

  function queueEnhancementLoads() {
    scheduleIdle(() => {
      refreshHistoricalSummary().catch((error) => console.warn('Falha ao carregar histórico climático:', error));
    });

    scheduleIdle(() => {
      loadRadarFrames().catch((error) => {
        console.warn('Falha ao carregar radar:', error);
        scheduleOverlayRecovery('radar', true);
        updateRadarStatus('Radar indisponível no momento.');
      });
    });

    if (state.weatherLayer !== 'radar') {
      scheduleIdle(() => {
        renderMapOverlays().catch((error) => {
          scheduleOverlayRecovery('field', true);
          console.warn('Falha ao carregar campo meteorológico:', error);
          updateRadarStatus('Camadas meteorológicas indisponíveis.');
        });
      });
    }
  }

  async function getWeatherBundleForLocation(location, { force = false, onProgress = null } = {}) {
    const cacheKey = buildCacheKey('weather', location);
    const cached = readCache(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;

    if (!force && cached && cacheAge <= CACHE_TTL.weather) {
      return buildCachedWeatherResult(cached.value.bundle, cached.value.providerRuns, {
        used: true,
        stale: false,
        ageMs: cacheAge,
        reason: 'Usando cache salvo'
      });
    }

    try {
      const live = await fetchLiveWeatherBundle(location, { onProgress });
      const activeProviderCount = getActiveProviderCount(live.providerRuns);

      if (activeProviderCount < 1 && cached) {
        return buildCachedWeatherResult(cached.value.bundle, cached.value.providerRuns, {
          used: true,
          stale: true,
          apiFailed: true,
          ageMs: cacheAge,
          reason: 'Usando ultimo dado valido salvo'
        });
      }

      const liveCacheInfo = {
        used: false,
        stale: false,
        ageMs: 0
      };
      const guardedLive = {
        bundle: applyReliabilityGuard(live.bundle, live.providerRuns, liveCacheInfo),
        providerRuns: live.providerRuns
      };
      writeCache(cacheKey, guardedLive);
      saveLastValidWeatherBundle(guardedLive.bundle, guardedLive.providerRuns, liveCacheInfo);
      return {
        ...guardedLive,
        cacheInfo: liveCacheInfo
      };
    } catch (error) {
      if (cached) {
        return buildCachedWeatherResult(cached.value.bundle, cached.value.providerRuns, {
          used: true,
          stale: true,
          apiFailed: true,
          ageMs: cacheAge,
          reason: 'Usando ultimo dado valido salvo'
        });
      }

      const saved = window.SkyDroneServices?.cacheService?.loadLastValid?.(location);
      if (saved && !saved.locationMismatch) {
        const savedBundle = window.SkyDroneServices.cacheService.buildBundleFromCachedEntry(saved, location);
        const savedProviders = savedBundle?.providers || [];
        return buildCachedWeatherResult(savedBundle, savedProviders, {
          used: true,
          stale: true,
          saved: true,
          apiFailed: true,
          ageMs: saved.ageMs,
          reason: 'Usando ultimo dado valido salvo'
        });
      }
      throw error;
    }
  }

  async function fetchLiveWeatherBundle(location, { onProgress = null } = {}) {
    const context = createProviderContext(location);
    const activeProviders = getEnabledProviders();
    const progressRuns = activeProviders.map((provider) => createLoadingProviderRun(provider));
    emitProviderProgress(progressRuns, onProgress);
    const settledRuns = await Promise.allSettled(
      activeProviders.map((provider, index) => runProvider(provider, location, context)
        .then((run) => {
          progressRuns[index] = stripTransientProviderFields(run);
          emitProviderProgress(progressRuns, onProgress);
          return run;
        }))
    );
    const providerRuns = settledRuns.map((result, index) => (
      result.status === 'fulfilled'
        ? result.value
        : createProviderFailureRun(activeProviders[index], result.reason, performance.now())
    ));
    const successfulRuns = providerRuns.filter((run) => isValidProviderRun(run));

    if (!successfulRuns.length) {
      throw new Error('Nenhuma fonte meteorológica respondeu com sucesso.');
    }

    const bundle = buildWeatherBundle(successfulRuns, providerRuns, location);
    if (!isUsableWeatherBundle(bundle)) {
      throw new Error('A fusao meteorologica nao retornou dados confiaveis suficientes.');
    }
    return { bundle, providerRuns };
  }

  // APIs: providers, fusion, and normalization
  function createProviderContext(location) {
    const cache = {};

    return {
      async getCptecBundle() {
        if (!cache.cptecBundlePromise) {
          cache.cptecBundlePromise = fetchCptecLatLonForecast(location);
        }
        return cache.cptecBundlePromise;
      },
      async getPrimaryOpenMeteoBundle() {
        if (!cache.primaryOpenMeteoPromise) {
          cache.primaryOpenMeteoPromise = fetchOpenMeteoModel(location, {
            providerKey: 'openMeteo',
            label: 'Open-Meteo'
          });
        }
        return cache.primaryOpenMeteoPromise;
      },
      async getEcmwfBundle() {
        if (!cache.ecmwfPromise) {
          cache.ecmwfPromise = fetchOpenMeteoModel(location, {
            providerKey: 'ecmwf',
            label: 'ECMWF',
            model: 'ecmwf_ifs04'
          });
        }
        return cache.ecmwfPromise;
      },
      async getGfsBundle() {
        if (!cache.gfsPromise) {
          cache.gfsPromise = fetchOpenMeteoModel(location, {
            providerKey: 'gfs',
            label: 'GFS',
            model: 'gfs_seamless'
          });
        }
        return cache.gfsPromise;
      },
      async getInmetStations() {
        if (!cache.inmetStationsPromise) {
          cache.inmetStationsPromise = fetchInmetStationsCatalog();
        }
        return cache.inmetStationsPromise;
      },
      async getInmetStationSelection() {
        if (!cache.inmetSelectionPromise) {
          cache.inmetSelectionPromise = resolveInmetStationSelection(location);
        }
        return cache.inmetSelectionPromise;
      },
      async getMetarStationSelection() {
        if (!cache.metarSelectionPromise) {
          cache.metarSelectionPromise = resolveMetarStationSelection(location);
        }
        return cache.metarSelectionPromise;
      },
      async getMeteostatStationSelection() {
        if (!cache.meteostatSelectionPromise) {
          cache.meteostatSelectionPromise = resolveMeteostatStationSelection(location);
        }
        return cache.meteostatSelectionPromise;
      },
      async getPrimaryObservationSelection() {
        if (!cache.primaryObservationSelectionPromise) {
          cache.primaryObservationSelectionPromise = resolvePrimaryObservationSelection(location, this);
        }
        return cache.primaryObservationSelectionPromise;
      }
    };
  }

  async function runProvider(provider, location, context) {
    const startedAt = performance.now();
    const providerCacheKey = buildCacheKey(`provider:${provider.providerKey}`, location);
    const cachedProvider = readCache(providerCacheKey);
    const cachedAge = cachedProvider ? Date.now() - cachedProvider.timestamp : Number.POSITIVE_INFINITY;
    let lastError = null;

    try {
      const data = await provider.fetcher(location, provider, context);
      const normalized = finalizeProviderRun(provider, data, startedAt);
      writeCache(providerCacheKey, stripTransientProviderFields(normalized));
      return normalized;
    } catch (error) {
      lastError = error;
    }

    if (cachedProvider && cachedAge <= CACHE_TTL.provider) {
      return reviveCachedProviderRun(provider, cachedProvider.value, cachedAge, startedAt, lastError);
    }

    return createProviderFailureRun(provider, lastError, startedAt);
  }

  async function fetchOpenMeteoModel(location, options) {
    const isPrimaryOpenMeteo = !options?.model;
    const params = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lon),
      timezone: 'auto',
      forecast_days: isPrimaryOpenMeteo ? '10' : '14',
      current: isPrimaryOpenMeteo
        ? 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,visibility,uv_index'
        : 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,visibility,uv_index',
      hourly: isPrimaryOpenMeteo
        ? 'temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,visibility,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index'
        : 'temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,visibility,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index',
      daily: isPrimaryOpenMeteo
        ? 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset'
        : 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset'
    });

    if (options?.model) {
      params.set('models', options.model);
    }

    const data = await fetchJson(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS });
    return normalizeOpenMeteoResponse(data, options.label);
  }

  async function fetchInmet(location, provider, context) {
    const cptecBundle = await context?.getCptecBundle?.().catch(() => null);
    const inmetTarget = await resolveInmetTarget(location, cptecBundle?.location || null);
    if (!inmetTarget?.geocode) {
      throw createError('unsupported', 'INMET sem município compatível para o ponto selecionado.');
    }

    const data = await fetchJson(`${INMET_PREVMET_URL}/previsao/${inmetTarget.geocode}`, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS });
    return normalizeInmetResponse(data, inmetTarget);
  }

  async function fetchCptec(location, provider, context) {
    if (context?.getCptecBundle) {
      return context.getCptecBundle();
    }
    return fetchCptecLatLonForecast(location);
  }

  async function fetchClimatempo(location) {
    const target = await resolveClimatempoTarget(location);
    if (!target) {
      throw createError('unsupported', 'Climatempo sem cidade compativel para o ponto selecionado.');
    }

    const html = await fetchText(target.pageUrl, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS });
    const payload = parseClimatempoPayload(html);
    validateClimatempoPayload(payload, target, location);
    return normalizeClimatempoResponse(payload, target);
  }

  async function fetchDemoWeather(location) {
    const start = new Date();
    start.setMinutes(0, 0, 0);

    const locationSeed = Math.abs(Math.sin((Number(location.lat) || 0) * 12.9898 + (Number(location.lon) || 0) * 78.233));
    const hourly = Array.from({ length: 7 * 24 }, (_, index) => {
      const time = new Date(start.getTime() + index * 60 * 60 * 1000);
      const hour = time.getHours();
      const dayOffset = Math.floor(index / 24);
      const daylightCurve = Math.sin(((hour - 8) / 24) * Math.PI * 2);
      const mildVariation = Math.sin((index + locationSeed * 8) / 5) * 1.4;
      const temperature = index === 0
        ? 25
        : roundTo(25 + daylightCurve * 3.8 + mildVariation - dayOffset * 0.15, 1);
      const rainPulse = Math.max(0, Math.sin((index - 18) / 9));
      const rainProbability = index === 0 ? 8 : Math.round(clamp(8 + rainPulse * 24 + dayOffset * 1.5, 4, 42));
      const cloudCover = index === 0 ? 18 : Math.round(clamp(18 + rainPulse * 34 + Math.max(0, -daylightCurve) * 12, 8, 72));
      const weatherCode = rainProbability >= 35 ? 61 : cloudCover <= 25 ? 0 : cloudCover >= 60 ? 3 : 2;
      const isDay = hour >= 6 && hour <= 18;
      const presentation = getWeatherPresentation(weatherCode, isDay);

      return {
        time: time.toISOString(),
        dateKey: extractDateKey(time.toISOString()),
        temperature,
        feelsLike: roundTo(temperature + (isDay ? 1 : -0.3), 1),
        humidity: Math.round(clamp(58 + rainPulse * 18 + Math.max(0, -daylightCurve) * 10, 42, 84)),
        pressure: roundTo(1014 + Math.cos(index / 12) * 2.5, 1),
        visibilityKm: roundTo(clamp(16 - rainPulse * 5 - cloudCover / 28, 7, 18), 1),
        windSpeed: roundTo(clamp(12 + Math.sin(index / 4) * 4 + dayOffset * 0.4, 6, 22), 1),
        windDirection: Math.round((85 + index * 7 + locationSeed * 40) % 360),
        windGusts: roundTo(clamp(18 + Math.sin(index / 3) * 5 + rainPulse * 6, 12, 34), 1),
        cloudCover,
        rainProbability,
        precipitation: rainProbability >= 35 ? roundTo(0.4 + rainPulse * 0.8, 1) : 0,
        uvIndex: isDay ? roundTo(clamp(7.5 - cloudCover / 25, 1.2, 8.4), 1) : 0,
        weatherCode,
        isDay,
        icon: presentation.icon,
        description: index === 0 ? 'Ceu limpo em modo demo' : presentation.label
      };
    });

    const daily = Array.from(groupHourlySeriesByDate(hourly).entries())
      .map(([dateKey, hours]) => aggregateHoursToDaily(dateKey, hours))
      .filter(Boolean)
      .slice(0, 7);

    return {
      fetchedAt: new Date().toISOString(),
      message: 'Demo automatico ativo com dados climaticos simulados, sem chave de API.',
      current: hourly[0],
      hourly,
      daily
    };
  }

  async function fetchWeatherApi(location) {
    if (!window.SkyDroneServices?.weatherService?.hasServerlessBackend?.()) {
      throw createError('unsupported', 'WeatherAPI opcional requer backend/serverless. No GitHub Pages o painel usa apenas Open-Meteo.');
    }

    try {
      const data = await window.SkyDroneServices.weatherService.fetchWeatherApiViaBackend(location, {
        timeoutMs: CORE_PROVIDER_TIMEOUT_MS,
        days: 3
      });
      console.info('[clima] WeatherAPI carregado com sucesso.', {
        lat: location.lat,
        lon: location.lon
      });
      return normalizeWeatherApiResponse(data);
    } catch (error) {
      console.warn('[clima] Falha ao consultar WeatherAPI.', error);
      throw error;
    }
  }

  async function fetchMeteostat(location) {
    if (!WEATHER_KEYS.meteostat && !canAttemptServerProxy()) {
      throw createError('missing_key', 'Chave do Meteostat ausente.');
    }

    const start = new Date();
    start.setHours(start.getHours() - 24);
    const end = new Date();
    const params = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      tz: 'UTC'
    });

    const data = await fetchJson(`${METEOSTAT_HOURLY_URL}?${params.toString()}`, {
      timeoutMs: CORE_PROVIDER_TIMEOUT_MS,
      headers: {}
    });

    return normalizeMeteostatResponse(data);
  }

  async function fetchInmet(location, provider, context) {
    const selection = await context?.getInmetStationSelection?.().catch(() => resolveInmetStationSelection(location));
    if (!selection?.candidates?.length || selection.method === 'unavailable') {
      throw createError('unsupported', 'INMET sem estacao compativel para o ponto selecionado.');
    }
    if (selection.method === 'global-model') {
      throw createError('unsupported', 'INMET sem estacao local dentro de 150 km para o ponto selecionado.');
    }

    return fetchObservationPayloadFromSelection(
      selection,
      async (station) => normalizeInmetStationResponse(await fetchInmetStationSeries(station), station),
      {
        providerLabel: provider?.label || 'INMET',
        nearestErrorMessage: 'INMET sem dados recentes para as estacoes mais proximas.',
        defaultConfidence: 88
      }
    );
  }

  async function fetchMetarNoaa(location, provider, context) {
    const baseSelection = await context?.getMetarStationSelection?.().catch(() => resolveMetarStationSelection(location));
    if (!baseSelection?.candidates?.length || baseSelection.method === 'unavailable') {
      throw createError('unsupported', 'METAR/NOAA sem aeroporto compativel para o ponto selecionado.');
    }

    const reports = await fetchMetarReports(baseSelection.candidates.map((station) => station.id));
    const observedCandidates = baseSelection.candidates.filter((station) => reports.has(station.id));
    const selection = rebuildStationSelectionFromCandidates(baseSelection, observedCandidates);

    if (!selection?.candidates?.length) {
      throw createError('unsupported', 'METAR/NOAA sem observacoes recentes nos aeroportos mais proximos.');
    }
    if (selection.method === 'global-model') {
      throw createError('unsupported', 'METAR/NOAA sem aeroporto observacional dentro de 150 km para este ponto.');
    }
    if (!selection?.stations?.length) {
      throw createError('unsupported', 'METAR/NOAA sem observacoes validas nos aeroportos selecionados.');
    }

    const payloadEntries = selection.stations
      .map((station) => {
        const report = reports.get(station.id);
        return report ? { station, payload: normalizeMetarStationResponse(report, station) } : null;
      })
      .filter(Boolean);

    if (!payloadEntries.length) {
      throw createError('unsupported', 'METAR/NOAA sem observacoes validas nos aeroportos selecionados.');
    }

    if (selection.method === 'blend') {
      return blendStationPayloadEntries(payloadEntries, selection, {
        providerLabel: provider?.label || 'METAR/NOAA',
        defaultConfidence: 83
      });
    }

    return attachStationSelection(payloadEntries[0].payload, selection);
  }

  async function fetchRegionalBrasil(location, provider, context) {
    try {
      return await fetchClimatempo(location);
    } catch (regionalError) {
      try {
        const payload = await fetchInmet(location, provider, context);
        return createProviderFallbackPayload(
          payload,
          'Regional Brasil em fallback unico via INMET para manter cobertura nacional.',
          'INMET',
          0.72
        );
      } catch (fallbackError) {
        const controlledError = createError('controlled_offline', 'Regional Brasil em offline controlado apos 1 fallback.');
        controlledError.cause = fallbackError || regionalError;
        throw controlledError;
      }
    }
  }

  async function fetchMeteostat(location, provider, context) {
    if (!WEATHER_KEYS.meteostat && !canAttemptServerProxy()) {
      return buildMeteostatFallbackPayload(
        location,
        context,
        null,
        'Meteostat sem credencial local; fallback Open-Meteo ativo por coordenadas.'
      );
    }

    const selection = await context?.getMeteostatStationSelection?.().catch(() => resolveMeteostatStationSelection(location));
    try {
      if (selection?.stations?.length && selection.method !== 'global-model' && selection.method !== 'unavailable') {
        return await fetchMeteostatStationSelectionPayload(selection, provider?.label || 'Meteostat');
      }
    } catch (error) {
      console.warn('Falha ao consultar estacoes Meteostat, usando fallback por coordenadas:', error);
    }

    try {
      const pointPayload = await fetchMeteostatPointPayload(location);
      const effectiveSelection = selection
        ? {
            ...selection,
            method: selection.method === 'global-model' ? 'global-model' : 'fallback-point',
            distanceWeight: getStationDistanceWeight(selection.primaryDistanceKm)
          }
        : createVirtualStationSelection('meteostat', 'Meteostat', 'fallback-point');

      return attachStationSelection(createProviderFallbackPayload(
        pointPayload,
        selection?.method === 'global-model'
          ? 'Meteostat sem estacao observacional dentro de 150 km; interpolacao por coordenadas mantida com prioridade aos modelos globais.'
          : 'Meteostat sem estacao valida local; interpolacao por coordenadas ativada como fallback inteligente.',
        'Meteostat Point',
        selection?.method === 'global-model' ? 0.52 : 0.62
      ), effectiveSelection);
    } catch (error) {
      return buildMeteostatFallbackPayload(
        location,
        context,
        selection,
        'Meteostat indisponivel; fallback Open-Meteo ativo para preservar dados por coordenadas.'
      );
    }
  }

  async function fetchMeteostatStationSelectionPayload(selection, providerLabel) {
    return fetchObservationPayloadFromSelection(
      selection,
      fetchMeteostatStationPayload,
      {
        providerLabel,
        nearestErrorMessage: 'Meteostat sem dados horarios recentes nas estacoes mais proximas.',
        defaultConfidence: 84
      }
    );
  }

  async function fetchMeteostatStationPayload(station) {
    const headers = buildMeteostatHeaders();
    const hourlyStart = new Date();
    hourlyStart.setDate(hourlyStart.getDate() - 2);
    const dailyStart = new Date();
    dailyStart.setDate(dailyStart.getDate() - (METEOSTAT_HISTORY_DAYS - 1));
    const end = new Date();
    const hourlyParams = new URLSearchParams({
      station: station.id,
      start: hourlyStart.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      tz: 'UTC',
      model: 'true',
      units: 'metric'
    });
    const dailyParams = new URLSearchParams({
      station: station.id,
      start: dailyStart.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      model: 'true',
      units: 'metric'
    });

    const responses = await Promise.allSettled([
      fetchJson(`${METEOSTAT_STATION_HOURLY_URL}?${hourlyParams.toString()}`, {
        timeoutMs: CORE_PROVIDER_TIMEOUT_MS,
        headers
      }),
      fetchJson(`${METEOSTAT_STATION_DAILY_URL}?${dailyParams.toString()}`, {
        timeoutMs: CORE_PROVIDER_TIMEOUT_MS,
        headers
      })
    ]);
    const hourlyData = responses[0].status === 'fulfilled' ? responses[0].value : null;
    const dailyData = responses[1].status === 'fulfilled' ? responses[1].value : null;

    if (!hourlyData || !dailyData) {
      throw createError('unsupported', `Meteostat sem serie valida para a estacao ${station.id}.`);
    }

    const payload = normalizeMeteostatResponse(hourlyData, dailyData);
    payload.message = `Meteostat ativo via estacao ${station.name || station.id} (${formatNumber(station.distanceKm, 1)} km).`;
    return payload;
  }

  async function fetchMeteostatPointPayload(location) {
    const hourlyStart = new Date();
    hourlyStart.setDate(hourlyStart.getDate() - 2);
    const dailyStart = new Date();
    dailyStart.setDate(dailyStart.getDate() - (METEOSTAT_HISTORY_DAYS - 1));
    const end = new Date();
    const baseParams = {
      lat: String(location.lat),
      lon: String(location.lon),
      model: 'true',
      units: 'metric'
    };
    const headers = buildMeteostatHeaders();
    const hourlyParams = new URLSearchParams({
      ...baseParams,
      start: hourlyStart.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      tz: 'UTC'
    });
    const dailyParams = new URLSearchParams({
      ...baseParams,
      start: dailyStart.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    });

    const responses = await Promise.allSettled([
      fetchJson(`${METEOSTAT_HOURLY_URL}?${hourlyParams.toString()}`, {
        timeoutMs: CORE_PROVIDER_TIMEOUT_MS,
        headers
      }),
      fetchJson(`${METEOSTAT_DAILY_URL}?${dailyParams.toString()}`, {
        timeoutMs: CORE_PROVIDER_TIMEOUT_MS,
        headers
      })
    ]);
    const hourlyData = responses[0].status === 'fulfilled' ? responses[0].value : null;
    const dailyData = responses[1].status === 'fulfilled' ? responses[1].value : null;

    if (!hourlyData || !dailyData) {
      throw createError('network', 'Meteostat retornou apenas parte da serie necessaria.');
    }

    return normalizeMeteostatResponse(hourlyData, dailyData);
  }

  function buildMeteostatHeaders() {
    return {};
  }

  async function buildMeteostatFallbackPayload(location, context, selection, message) {
    const fallbackSelection = selection
      ? {
          ...selection,
          method: 'global-model',
          distanceWeight: getStationDistanceWeight(selection.primaryDistanceKm)
        }
      : createVirtualStationSelection('meteostat', 'Meteostat', 'global-model');

    try {
      const fallbackPayload = await getOpenMeteoFallbackPayload(location, context);
      return attachStationSelection(createProviderFallbackPayload(
        fallbackPayload,
        message,
        'Open-Meteo',
        0.56
      ), fallbackSelection);
    } catch (error) {
      const modelBlendPayload = await getModelBlendFallbackPayload(location, context);
      return attachStationSelection(createProviderFallbackPayload(
        modelBlendPayload,
        'Meteostat e Open-Meteo indisponiveis; media GFS + ECMWF ativada como fallback global.',
        'GFS + ECMWF',
        0.5
      ), fallbackSelection);
    }
  }

  async function getOpenMeteoFallbackPayload(location, context) {
    if (context?.getPrimaryOpenMeteoBundle) {
      return context.getPrimaryOpenMeteoBundle();
    }
    return fetchOpenMeteoModel(location, {
      providerKey: 'openMeteo',
      label: 'Open-Meteo'
    });
  }

  async function getModelBlendFallbackPayload(location, context) {
    const responses = await Promise.allSettled([
      context?.getEcmwfBundle ? context.getEcmwfBundle() : fetchOpenMeteoModel(location, {
        providerKey: 'ecmwf',
        label: 'ECMWF',
        model: 'ecmwf_ifs04'
      }),
      context?.getGfsBundle ? context.getGfsBundle() : fetchOpenMeteoModel(location, {
        providerKey: 'gfs',
        label: 'GFS',
        model: 'gfs_seamless'
      })
    ]);
    const runs = responses
      .map((result, index) => {
        if (result.status !== 'fulfilled') return null;
        const definition = index === 0
          ? { providerKey: 'ecmwf', label: 'ECMWF', weight: 0.56 }
          : { providerKey: 'gfs', label: 'GFS', weight: 0.44 };
        return createSyntheticProviderRun(definition.providerKey, definition.label, result.value, definition.weight);
      })
      .filter(Boolean);

    if (!runs.length) {
      throw createError('network', 'Falha ao compor fallback global GFS + ECMWF.');
    }

    const fused = fuseNormalizedPayloadRuns(runs, 78);
    return {
      fetchedAt: new Date().toISOString(),
      message: 'Modelos globais GFS + ECMWF ativos como fallback final.',
      current: fused.current,
      hourly: fused.hourly,
      daily: fused.daily,
      partial: false
    };
  }

  function createProviderFallbackPayload(payload, message, fallbackSource, weightMultiplier = 0.65) {
    return {
      ...payload,
      fetchedAt: new Date().toISOString(),
      message,
      partial: true,
      fallbackSource,
      weightMultiplier,
      stationSelection: payload?.stationSelection || null
    };
  }

  async function resolvePrimaryObservationSelection(location, context) {
    const [inmet, metar, meteostat] = await Promise.allSettled([
      context?.getInmetStationSelection ? context.getInmetStationSelection() : resolveInmetStationSelection(location),
      context?.getMetarStationSelection ? context.getMetarStationSelection() : resolveMetarStationSelection(location),
      context?.getMeteostatStationSelection ? context.getMeteostatStationSelection() : resolveMeteostatStationSelection(location)
    ]);

    const ordered = [inmet, metar, meteostat]
      .map((result) => result.status === 'fulfilled' ? result.value : null)
      .filter(Boolean);

    return ordered.find((selection) => selection.stations?.length && selection.method !== 'global-model')
      || ordered.find((selection) => selection.sourceKey === 'meteostat')
      || createVirtualStationSelection('openMeteo', 'Open-Meteo', 'global-model');
  }

  async function resolveInmetStationSelection(location) {
    const cacheKey = buildCacheKey('stationSelection:inmet', location);
    const cached = readCache(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;
    if (cached && cacheAge <= CACHE_TTL.stationSelection && cached.value) {
      return cached.value;
    }

    const stations = await fetchInmetStationsCatalog();
    const candidates = pickNearestInmetStations(stations, location, INMET_STATION_CANDIDATE_LIMIT);
    const selection = buildStationSelection('inmet', 'INMET', candidates, location, { priority: 'official' });
    writeCache(cacheKey, selection);
    return selection;
  }

  async function resolveMetarStationSelection(location) {
    const cacheKey = buildCacheKey('stationSelection:metarNoaa', location);
    const cached = readCache(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;
    if (cached && cacheAge <= CACHE_TTL.stationSelection && cached.value) {
      return cached.value;
    }

    const stations = await fetchMetarStationsCatalog();
    const candidates = pickNearestStations(stations, location, METAR_STATION_CANDIDATE_LIMIT);
    const selection = buildStationSelection('metarNoaa', 'METAR/NOAA', candidates, location, { priority: 'airport' });
    writeCache(cacheKey, selection);
    return selection;
  }

  async function resolveMeteostatStationSelection(location) {
    const cacheKey = buildCacheKey('stationSelection:meteostat', location);
    const cached = readCache(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;
    if (cached && cacheAge <= CACHE_TTL.stationSelection && cached.value) {
      return cached.value;
    }

    if (!WEATHER_KEYS.meteostat && !canAttemptServerProxy()) {
      return createVirtualStationSelection('meteostat', 'Meteostat', 'global-model');
    }

    const params = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
      limit: String(METAR_STATION_CANDIDATE_LIMIT),
      radius: String(STATION_DISCOVERY_RADIUS_KM * 1000)
    });
    const response = await fetchJson(`${METEOSTAT_NEARBY_STATIONS_URL}?${params.toString()}`, {
      timeoutMs: CORE_PROVIDER_TIMEOUT_MS,
      headers: buildMeteostatHeaders()
    }).catch(() => ({ data: [] }));
    const candidates = (Array.isArray(response?.data) ? response.data : [])
      .map(normalizeMeteostatNearbyStation)
      .filter(Boolean);
    const selection = buildStationSelection('meteostat', 'Meteostat', candidates, location, { priority: 'meteostat' });
    writeCache(cacheKey, selection);
    return selection;
  }

  async function fetchMetarStationsCatalog() {
    const cached = readCache(METAR_STATION_CACHE_KEY);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;
    if (cached && cacheAge <= METAR_STATION_CACHE_TTL_MS && Array.isArray(cached.value) && cached.value.length) {
      return cached.value;
    }

    const data = await fetchCompressedJson(METAR_STATIONS_CACHE_URL, { timeoutMs: 12000 });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.stations)
          ? data.stations
          : [];
    const stations = rows
      .map(normalizeMetarStationCatalogEntry)
      .filter(Boolean);

    if (!stations.length) {
      throw createError('network', 'METAR/NOAA sem catalogo de estacoes disponivel.');
    }

    writeCache(METAR_STATION_CACHE_KEY, stations);
    return stations;
  }

  async function fetchMetarReports(ids) {
    const stationIds = (Array.isArray(ids) ? ids : [])
      .map((id) => String(id || '').trim().toUpperCase())
      .filter(Boolean)
      .slice(0, METAR_STATION_CANDIDATE_LIMIT);

    if (!stationIds.length) {
      return new Map();
    }

    const params = new URLSearchParams({
      ids: stationIds.join(','),
      format: 'json'
    });

    let data = [];
    try {
      data = await fetchJson(`${METAR_DATA_URL}?${params.toString()}`, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS });
    } catch (error) {
      if (error.code === 'empty_response') {
        return new Map();
      }
      throw error;
    }

    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : [];

    return rows.reduce((map, row) => {
      const id = String(row?.icaoId || row?.station_id || row?.stationId || row?.id || '').trim().toUpperCase();
      if (id) {
        map.set(id, row);
      }
      return map;
    }, new Map());
  }

  async function fetchCompressedJson(url, options = {}) {
    const response = await fetchWithRetry(url, options, options.retries ?? 1);
    if (!response?.ok) {
      throw createError('provider_offline', 'API offline');
    }

    const rawBuffer = await response.arrayBuffer();
    let text = '';

    if (typeof DecompressionStream === 'function') {
      const compressed = new Blob([rawBuffer]).stream();
      const decompressed = compressed.pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(decompressed).text();
    } else {
      text = await new Response(rawBuffer).text();
    }

    if (!text || text.trim() === '') {
      throw createError('empty_response', 'Resposta vazia');
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw createError('invalid_json', 'JSON invalido retornado pela API.');
    }
  }

  async function fetchObservationPayloadFromSelection(selection, payloadFetcher, options = {}) {
    if (!selection?.candidates?.length) {
      throw createError('unsupported', options.nearestErrorMessage || 'Sem estacoes compativeis para o ponto selecionado.');
    }

    if (selection.method === 'blend') {
      const settled = await Promise.allSettled(
        selection.stations.map(async (station) => ({
          station,
          payload: await payloadFetcher(station)
        }))
      );
      const validPayloads = settled
        .map((result) => result.status === 'fulfilled' ? result.value : null)
        .filter(Boolean);

      if (!validPayloads.length) {
        throw createError('unsupported', options.nearestErrorMessage || 'Sem dados validos nas estacoes selecionadas.');
      }

      if (validPayloads.length === 1) {
        return attachStationSelection(validPayloads[0].payload, {
          ...selection,
          method: 'nearest',
          stations: [validPayloads[0].station]
        });
      }

      return blendStationPayloadEntries(validPayloads, selection, {
        providerLabel: options.providerLabel,
        defaultConfidence: options.defaultConfidence || 84
      });
    }

    let lastError = null;
    const fallbackStations = selection.candidates.slice(0, Math.max(selection.candidates.length, 1));
    for (const station of fallbackStations) {
      try {
        const payload = await payloadFetcher(station);
        return attachStationSelection(payload, {
          ...selection,
          stations: [station],
          primaryDistanceKm: station.distanceKm,
          distanceWeight: getStationDistanceWeight(station.distanceKm)
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || createError('unsupported', options.nearestErrorMessage || 'Sem dados validos para a estacao selecionada.');
  }

  function blendStationPayloadEntries(entries, selection, options = {}) {
    const runs = entries
      .map((entry) => createSyntheticProviderRun(
        `${selection.sourceKey}:${entry.station.id}`,
        entry.station.name || entry.station.id,
        entry.payload,
        getStationAggregationWeight(entry.station.distanceKm)
      ))
      .filter(Boolean);

    if (!runs.length) {
      throw createError('unsupported', `${options.providerLabel || selection.label}: sem dados validos para media entre estacoes.`);
    }

    const fused = fuseNormalizedPayloadRuns(runs, options.defaultConfidence || 84);
    const stationLabel = entries.length === 1
      ? entries[0].station.name || entries[0].station.id
      : `${entries.length} estacoes proximas`;

    return attachStationSelection({
      fetchedAt: new Date().toISOString(),
      message: `${options.providerLabel || selection.label} ativo pela media de ${stationLabel} (${formatNumber(selection.primaryDistanceKm, 1)} km ao ponto).`,
      current: fused.current,
      hourly: fused.hourly,
      daily: fused.daily,
      partial: true
    }, selection);
  }

  function createSyntheticProviderRun(providerKey, label, payload, weight = 1) {
    const sanitized = sanitizeProviderPayload(payload);
    if (!sanitized.current) {
      return null;
    }

    return {
      providerKey,
      label,
      success: true,
      current: sanitized.current,
      hourly: sanitized.hourly,
      daily: sanitized.daily,
      dailyMap: new Map(sanitized.daily.map((entry) => [entry.dateKey, entry])),
      weight
    };
  }

  function fuseNormalizedPayloadRuns(runs, defaultConfidence = 82) {
    const agreement = {
      available: false,
      score: defaultConfidence,
      byHour: new Map(),
      byDay: new Map()
    };
    const currentBase = fuseCurrentMetrics(runs, agreement, defaultConfidence);
    const hourly = fuseHourlySeries(runs, agreement, defaultConfidence);
    const daily = fuseDailySeries(runs, hourly, agreement, defaultConfidence);
    const current = hydrateCurrentFromSeries(currentBase, hourly, daily) || currentBase;

    return {
      current,
      hourly,
      daily
    };
  }

  function attachStationSelection(payload, selection) {
    return {
      ...payload,
      stationSelection: normalizeStationSelection(selection)
    };
  }

  function normalizeStationSelection(selection) {
    if (!selection || typeof selection !== 'object') {
      return null;
    }

    return {
      sourceKey: String(selection.sourceKey || ''),
      label: String(selection.label || ''),
      priority: String(selection.priority || ''),
      method: String(selection.method || 'unavailable'),
      primaryDistanceKm: toFiniteNumber(selection.primaryDistanceKm),
      distanceWeight: getStationDistanceWeight(selection.primaryDistanceKm),
      searchRadiusKm: toFiniteNumber(selection.searchRadiusKm) || STATION_DISCOVERY_RADIUS_KM,
      stationCount: Array.isArray(selection.stations) ? selection.stations.length : 0,
      stations: (Array.isArray(selection.stations) ? selection.stations : [])
        .map((station) => ({
          id: String(station.id || '').trim().toUpperCase(),
          name: String(station.name || station.id || '').trim(),
          distanceKm: toFiniteNumber(station.distanceKm)
        }))
        .filter((station) => station.id)
    };
  }

  function createVirtualStationSelection(sourceKey, label, method = 'unavailable') {
    return normalizeStationSelection({
      sourceKey,
      label,
      priority: sourceKey,
      method,
      primaryDistanceKm: null,
      searchRadiusKm: STATION_DISCOVERY_RADIUS_KM,
      stations: []
    });
  }

  function buildStationSelection(sourceKey, label, candidates, location, options = {}) {
    const rankedCandidates = (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => normalizeStationCandidate(candidate, location))
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, Math.max(options.limit || METAR_STATION_CANDIDATE_LIMIT, 1));

    if (!rankedCandidates.length) {
      return normalizeStationSelection({
        sourceKey,
        label,
        priority: options.priority || sourceKey,
        method: 'unavailable',
        primaryDistanceKm: null,
        searchRadiusKm: STATION_DISCOVERY_RADIUS_KM,
        candidates: [],
        stations: []
      });
    }

    const primary = rankedCandidates[0];
    const method = primary.distanceKm <= STATION_NEAR_RADIUS_KM
      ? 'nearest'
      : primary.distanceKm <= STATION_BLEND_RADIUS_KM
        ? 'blend'
        : 'global-model';
    const selectedStations = method === 'nearest'
      ? [primary]
      : method === 'blend'
        ? rankedCandidates.filter((station) => station.distanceKm <= STATION_BLEND_RADIUS_KM).slice(0, STATION_BLEND_LIMIT)
        : [];

    return {
      sourceKey,
      label,
      priority: options.priority || sourceKey,
      method,
      primaryDistanceKm: primary.distanceKm,
      distanceWeight: getStationDistanceWeight(primary.distanceKm),
      searchRadiusKm: STATION_DISCOVERY_RADIUS_KM,
      candidates: rankedCandidates,
      stations: selectedStations
    };
  }

  function rebuildStationSelectionFromCandidates(baseSelection, candidates) {
    if (!baseSelection) {
      return null;
    }
    return buildStationSelection(
      baseSelection.sourceKey,
      baseSelection.label,
      candidates,
      null,
      {
        priority: baseSelection.priority,
        limit: baseSelection.candidates?.length || METAR_STATION_CANDIDATE_LIMIT
      }
    );
  }

  function normalizeStationCandidate(candidate, location) {
    if (!candidate || typeof candidate !== 'object') return null;
    const distanceKm = Number.isFinite(candidate.distanceKm)
      ? Number(candidate.distanceKm)
      : (location && Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon)
        ? getDistance(location.lat, location.lon, candidate.lat, candidate.lon)
        : null);
    if (!Number.isFinite(distanceKm)) return null;

    return {
      ...candidate,
      id: String(candidate.id || '').trim().toUpperCase(),
      name: normalizeLabelSpacing(candidate.name || candidate.id || ''),
      distanceKm: roundTo(distanceKm, 1)
    };
  }

  function pickNearestStations(stations, location, limit = 6) {
    return (Array.isArray(stations) ? stations : [])
      .map((station) => normalizeStationCandidate(station, location))
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, Math.max(1, limit));
  }

  function getStationDistanceWeight(distanceKm) {
    if (!Number.isFinite(distanceKm)) return 0.4;
    if (distanceKm < 20) return 1.0;
    if (distanceKm < 50) return 0.8;
    if (distanceKm < 100) return 0.6;
    return 0.4;
  }

  function getStationAggregationWeight(distanceKm) {
    const distanceWeight = getStationDistanceWeight(distanceKm);
    return roundTo(distanceWeight / Math.max(1, (distanceKm || 1) / 25), 4);
  }

  function normalizeMetarStationCatalogEntry(raw) {
    const lat = toFiniteNumber(raw?.lat ?? raw?.latitude ?? raw?.latitude_deg);
    const lon = toFiniteNumber(raw?.lon ?? raw?.longitude ?? raw?.longitude_deg);
    const id = String(raw?.station_id ?? raw?.stationId ?? raw?.icaoId ?? raw?.icao ?? raw?.id ?? '').trim().toUpperCase();
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return {
      id,
      name: normalizeLabelSpacing(raw?.site ?? raw?.name ?? raw?.station_name ?? raw?.airport ?? id),
      lat,
      lon,
      operational: true
    };
  }

  function normalizeMeteostatNearbyStation(raw) {
    const id = String(raw?.id || '').trim().toUpperCase();
    const distanceMeters = toFiniteNumber(raw?.distance);
    if (!id || !Number.isFinite(distanceMeters)) {
      return null;
    }

    return {
      id,
      name: normalizeLabelSpacing(raw?.name?.en || raw?.name || id),
      distanceKm: roundTo(distanceMeters / 1000, 1),
      operational: true
    };
  }

  function normalizeMetarStationResponse(entry, station) {
    const time = normalizeTimeValue(entry?.reportTime || entry?.receiptTime || epochToIso(entry?.obsTime)) || new Date().toISOString();
    const weatherCode = inferMetarWeatherCode(entry);
    const cloudCover = inferMetarCloudCover(entry);
    const precipitation = inferMetarPrecipitation(entry);
    const presentation = getWeatherPresentation(weatherCode, isDaytimeFromHour(time));
    const windSpeed = knotsToKmh(valueOr(entry?.wspd, 0));
    const current = {
      time,
      dateKey: extractDateKey(time),
      temperature: toFiniteNumber(entry?.temp),
      feelsLike: toFiniteNumber(entry?.temp),
      humidity: calculateRelativeHumidity(toFiniteNumber(entry?.temp), toFiniteNumber(entry?.dewp)),
      pressure: normalizeMetarPressure(entry?.altim),
      visibilityKm: parseMetarVisibilityKm(entry?.visib, entry?.rawOb),
      windSpeed,
      windDirection: sanitizeMetricValue('windDirection', entry?.wdir),
      windGusts: valueOr(knotsToKmh(toFiniteNumber(entry?.wgst)), windSpeed),
      cloudCover,
      rainProbability: precipitation > 0 ? 84 : cloudCover >= 80 ? 28 : 12,
      precipitation,
      uvIndex: null,
      weatherCode,
      isDay: isDaytimeFromHour(time),
      icon: presentation.icon,
      description: presentation.label
    };

    return {
      fetchedAt: new Date().toISOString(),
      message: `METAR/NOAA ativo via aeroporto ${station.name || station.id} (${formatNumber(station.distanceKm, 1)} km).`,
      current,
      hourly: [current],
      daily: [aggregateHoursToDaily(extractDateKey(time), [current])],
      partial: true
    };
  }

  function inferMetarWeatherCode(entry) {
    const raw = `${entry?.wxString || ''} ${entry?.rawOb || ''}`.toUpperCase();
    const cloudCover = inferMetarCloudCover(entry);

    if (/TS/.test(raw)) return 95;
    if (/\bSN\b|\bSG\b|\bGS\b/.test(raw)) return 71;
    if (/\bRA\b|\bSHRA\b/.test(raw)) return 61;
    if (/\bDZ\b/.test(raw)) return 51;
    if (/\bFG\b|\bBR\b|\bHZ\b/.test(raw)) return 45;
    if (cloudCover >= 88) return 3;
    if (cloudCover >= 55) return 2;
    if (cloudCover >= 20) return 1;
    return 0;
  }

  function inferMetarCloudCover(entry) {
    const cloudEntries = Array.isArray(entry?.clouds) ? entry.clouds : [];
    const coverCandidates = [
      entry?.cover,
      ...cloudEntries.map((cloud) => cloud?.cover || cloud?.cover_code || cloud)
    ]
      .map((value) => String(value || '').trim().toUpperCase())
      .filter(Boolean);

    if (String(entry?.rawOb || '').toUpperCase().includes('CAVOK')) return 8;
    if (coverCandidates.some((value) => value.includes('OVC') || value.includes('VV'))) return 94;
    if (coverCandidates.some((value) => value.includes('BKN'))) return 78;
    if (coverCandidates.some((value) => value.includes('SCT'))) return 48;
    if (coverCandidates.some((value) => value.includes('FEW'))) return 24;
    if (coverCandidates.some((value) => value.includes('CLR') || value.includes('SKC') || value.includes('NSC'))) return 8;

    if (String(entry?.fltCat || '').toUpperCase() === 'IFR') return 92;
    if (String(entry?.fltCat || '').toUpperCase() === 'MVFR') return 68;
    return 18;
  }

  function inferMetarPrecipitation(entry) {
    const raw = `${entry?.wxString || ''} ${entry?.rawOb || ''}`.toUpperCase();
    if (/TS/.test(raw)) return 2.1;
    if (/\bSN\b|\bGS\b|\bSG\b/.test(raw)) return 1.2;
    if (/\bRA\b|\bSHRA\b/.test(raw)) return 0.8;
    if (/\bDZ\b/.test(raw)) return 0.3;
    return 0;
  }

  function parseMetarVisibilityKm(value, rawOb = '') {
    const raw = String(value || '').trim();
    const report = String(rawOb || '').toUpperCase();
    if (report.includes('CAVOK')) return 10;
    if (!raw) return estimateVisibilityKm(null, inferMetarPrecipitation({ rawOb }));

    const cleaned = raw.replace(/\+/g, '').trim();
    const fraction = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    const simpleFraction = cleaned.match(/^(\d+)\/(\d+)$/);
    let numeric = toFiniteNumber(cleaned);

    if (!Number.isFinite(numeric) && fraction) {
      numeric = Number(fraction[1]) + Number(fraction[2]) / Number(fraction[3]);
    } else if (!Number.isFinite(numeric) && simpleFraction) {
      numeric = Number(simpleFraction[1]) / Number(simpleFraction[2]);
    }

    if (!Number.isFinite(numeric)) {
      return estimateVisibilityKm(inferMetarCloudCover({ rawOb }), inferMetarPrecipitation({ rawOb }));
    }

    if (numeric > 80) return roundTo(numeric / 1000, 1);
    return roundTo(Math.min(10, numeric * 1.60934), 1);
  }

  function normalizeMetarPressure(value) {
    const numeric = toFiniteNumber(value);
    if (!Number.isFinite(numeric)) return null;
    if (numeric < 200) {
      return roundTo(numeric * 33.8639, 1);
    }
    return roundTo(numeric, 1);
  }

  function calculateRelativeHumidity(temp, dewPoint) {
    if (!Number.isFinite(temp) || !Number.isFinite(dewPoint)) return null;
    const vapor = 6.112 * Math.exp((17.67 * dewPoint) / (dewPoint + 243.5));
    const saturation = 6.112 * Math.exp((17.67 * temp) / (temp + 243.5));
    if (!Number.isFinite(vapor) || !Number.isFinite(saturation) || saturation <= 0) return null;
    return roundTo(clamp((vapor / saturation) * 100, 0, 100), 0);
  }

  function knotsToKmh(value) {
    const numeric = toFiniteNumber(value);
    return Number.isFinite(numeric) ? roundTo(numeric * 1.852, 1) : null;
  }

  function epochToIso(value) {
    const numeric = toFiniteNumber(value);
    if (!Number.isFinite(numeric)) return null;
    return new Date(numeric * 1000).toISOString();
  }

  function createLoadingProviderRun(provider) {
    return {
      providerKey: provider.providerKey,
      label: provider.label,
      reliability: provider.reliability,
      type: provider.type,
      hidden: provider.visible === false,
      success: true,
      status: 'loading',
      message: `${provider.label}: sincronizando fonte com retry inteligente e cache de seguranca.`,
      fetchedAt: null,
      latencyMs: null,
      weight: null,
      current: null,
      hourly: [],
      daily: []
    };
  }

  function emitProviderProgress(providerRuns, onProgress) {
    if (typeof onProgress !== 'function') return;
    try {
      onProgress(providerRuns.map((run) => stripTransientProviderFields(run)));
    } catch (error) {
      console.warn('Falha ao propagar progresso dos provedores:', error);
    }
  }

  async function fetchInmetStationsCatalog() {
    const cached = readCache(INMET_STATION_CACHE_KEY);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;
    if (cached && cacheAge <= INMET_STATION_CACHE_TTL_MS && Array.isArray(cached.value) && cached.value.length) {
      return cached.value;
    }

    const [automatic, manual] = await Promise.allSettled([
      fetchJson(`${INMET_STATIONS_URL}/T`, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS }),
      fetchJson(`${INMET_STATIONS_URL}/M`, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS })
    ]);

    const stations = [automatic, manual]
      .flatMap((result) => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [])
      .map(normalizeInmetStationCatalogEntry)
      .filter(Boolean);

    if (!stations.length) {
      throw createError('network', 'INMET sem catalogo de estacoes disponivel no momento.');
    }

    writeCache(INMET_STATION_CACHE_KEY, stations);
    return stations;
  }

  function normalizeInmetStationCatalogEntry(raw) {
    const lat = toFiniteNumber(raw?.VL_LATITUDE ?? raw?.latitude ?? raw?.lat);
    const lon = toFiniteNumber(raw?.VL_LONGITUDE ?? raw?.longitude ?? raw?.lon);
    const stationId = String(raw?.CD_ESTACAO ?? raw?.id ?? raw?.codigo ?? '').trim().toUpperCase();
    if (!stationId || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    const type = normalizeLabelSpacing(raw?.TP_ESTACAO || raw?.tipo || '');
    const status = normalizeLabelSpacing(raw?.CD_SITUACAO || raw?.situacao || raw?.status || '');

    return {
      id: stationId,
      name: normalizeLabelSpacing(raw?.DC_NOME || raw?.nome || stationId),
      uf: String(raw?.SG_ESTADO || raw?.UF || raw?.uf || '').trim().toUpperCase(),
      lat,
      lon,
      type,
      status,
      operational: !status || /operante|ativa|ativo/i.test(status),
      typeRank: /auto/i.test(type) ? 0 : 1
    };
  }

  function pickNearestInmetStations(stations, location, limit = 5) {
    return (Array.isArray(stations) ? stations : [])
      .map((station) => ({
        ...station,
        distanceKm: haversineKm(location.lat, location.lon, station.lat, station.lon)
      }))
      .sort((a, b) => {
        if (a.operational !== b.operational) return a.operational ? -1 : 1;
        if (a.typeRank !== b.typeRank) return a.typeRank - b.typeRank;
        return a.distanceKm - b.distanceKm;
      })
      .slice(0, Math.max(1, limit));
  }

  async function fetchInmetStationSeries(station) {
    const start = new Date();
    start.setDate(start.getDate() - INMET_STATION_LOOKBACK_DAYS);
    const end = new Date();
    const url = `${INMET_STATION_DATA_URL}/${start.toISOString().slice(0, 10)}/${end.toISOString().slice(0, 10)}/${encodeURIComponent(station.id)}`;
    const data = await fetchJson(url, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS });
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      throw createError('unsupported', `INMET sem observacoes recentes para a estacao ${station.id}.`);
    }
    return rows;
  }

  function normalizeInmetStationResponse(data, station) {
    const hourly = data
      .map((entry) => buildInmetObservedSnapshot(entry))
      .filter(Boolean)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    if (!hourly.length) {
      throw createError('unsupported', `INMET sem leituras validas para a estacao ${station.id}.`);
    }

    const daily = Array.from(groupHourlySeriesByDate(hourly).entries())
      .map(([dateKey, hours]) => aggregateHoursToDaily(dateKey, hours))
      .filter(Boolean)
      .slice(-7);
    const current = hourly[hourly.length - 1];
    const stationLabel = [station.name, station.uf].filter(Boolean).join(' - ') || station.id;

    return {
      fetchedAt: new Date().toISOString(),
      message: `INMET ativo por coordenadas via estacao ${stationLabel} (${formatNumber(station.distanceKm, 1)} km).`,
      current,
      hourly: hourly.slice(-48),
      daily,
      partial: true
    };
  }

  function buildInmetObservedSnapshot(entry) {
    const dateKey = normalizeBrazilDate(entry?.DT_MEDICAO);
    const time = combineDateAndDigits(dateKey, entry?.HR_MEDICAO);
    if (!dateKey || !time) return null;

    const temperature = valueOr(toFiniteNumber(entry?.TEM_INS), toFiniteNumber(entry?.TEM_SEN), toFiniteNumber(entry?.TEMP_MED), null);
    const humidity = valueOr(toFiniteNumber(entry?.UMD_INS), toFiniteNumber(entry?.UMID_MED), null);
    const windSpeed = valueOr(toFiniteNumber(entry?.VEN_VEL), toFiniteNumber(entry?.VEL_VENTO_MED), 0);
    const precipitation = valueOr(toFiniteNumber(entry?.CHUVA), 0);
    const cloudCover = inferCloudCoverFromHumidity(humidity, precipitation);
    const weatherCode = inferObservedWeatherCode(precipitation, humidity, windSpeed, cloudCover);

    return {
      time,
      dateKey,
      temperature,
      feelsLike: temperature,
      humidity,
      pressure: valueOr(toFiniteNumber(entry?.PRE_INS), toFiniteNumber(entry?.PRESSAO_ATM), null),
      visibilityKm: estimateVisibilityKm(cloudCover, precipitation),
      windSpeed,
      windDirection: valueOr(toFiniteNumber(entry?.VEN_DIR), null),
      windGusts: valueOr(toFiniteNumber(entry?.VEN_RAJ), windSpeed, null),
      cloudCover,
      rainProbability: precipitation > 0 ? 74 : humidity >= 92 ? 38 : 18,
      precipitation,
      uvIndex: null,
      weatherCode,
      isDay: isDaytimeFromHour(time)
    };
  }

  function combineDateAndDigits(date, value) {
    if (!date || value == null) return null;
    const digits = String(value).replace(/\D/g, '').padStart(4, '0').slice(0, 4);
    if (digits.length !== 4) return null;
    return `${date}T${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  }

  function inferCloudCoverFromHumidity(humidity, precipitation) {
    if (Number.isFinite(precipitation) && precipitation > 1.5) return 96;
    if (Number.isFinite(precipitation) && precipitation > 0.2) return 88;
    if (!Number.isFinite(humidity)) return null;
    if (humidity >= 96) return 94;
    if (humidity >= 88) return 78;
    if (humidity >= 72) return 56;
    if (humidity >= 55) return 34;
    return 18;
  }

  function inferObservedWeatherCode(precipitation, humidity, windSpeed, cloudCover) {
    if (Number.isFinite(precipitation) && precipitation >= 6) return 63;
    if (Number.isFinite(precipitation) && precipitation > 0.2) return 61;
    if (Number.isFinite(cloudCover) && cloudCover >= 88 && Number.isFinite(humidity) && humidity >= 95) return 45;
    if (Number.isFinite(cloudCover) && cloudCover >= 78) return 3;
    if (Number.isFinite(cloudCover) && cloudCover >= 38) return 2;
    if (Number.isFinite(windSpeed) && windSpeed >= 28 && Number.isFinite(cloudCover) && cloudCover >= 52) return 3;
    return 1;
  }

  async function fetchNoaa(location) {
    if (!isLikelyNoaaCoverage(location)) {
      throw createError('unsupported', 'Cobertura NOAA limitada fora dos EUA e territórios.');
    }

    const pointData = await fetchJson(`${NOAA_POINTS_URL}/${location.lat.toFixed(4)},${location.lon.toFixed(4)}`, {
      timeoutMs: 12000,
      headers: {
        Accept: 'application/geo+json'
      }
    });

    const forecastHourlyUrl = pointData?.properties?.forecastHourly;
    const forecastDailyUrl = pointData?.properties?.forecast;

    if (!forecastHourlyUrl || !forecastDailyUrl) {
      throw createError('unsupported', 'NOAA sem cobertura para o ponto selecionado.');
    }

    const forecastResponses = await Promise.allSettled([
      fetchJson(forecastHourlyUrl, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS, headers: { Accept: 'application/geo+json' } }),
      fetchJson(forecastDailyUrl, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS, headers: { Accept: 'application/geo+json' } })
    ]);
    const hourlyData = forecastResponses[0].status === 'fulfilled' ? forecastResponses[0].value : null;
    const dailyData = forecastResponses[1].status === 'fulfilled' ? forecastResponses[1].value : null;

    if (!hourlyData || !dailyData) {
      throw createError('network', 'NOAA retornou apenas parte da previsao necessaria.');
    }

    return normalizeNoaaResponse(hourlyData, dailyData);
  }

  async function fetchCptecLatLonForecast(location) {
    const url = `${CPTEC_XML_URL}/cidade/7dias/${roundCoordinate(location.lat)}/${roundCoordinate(location.lon)}/previsaoLatLon.xml`;
    const xml = await fetchXml(url, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS });
    return normalizeCptecResponse(xml);
  }

  async function resolveInmetTarget(location, cptecLocation = null) {
    const candidates = buildInmetQueryCandidates(location, cptecLocation);

    for (const candidate of candidates) {
      const matches = await searchInmetMunicipalities(candidate.query);
      if (!matches.length) continue;

      const selected = pickNearestLocationCandidate(matches, location, candidate.uf);
      if (selected) {
        return selected;
      }
    }

    throw createError('unsupported', 'INMET sem correspondência de município para este ponto.');
  }

  async function searchInmetMunicipalities(query) {
    if (!query) return [];

    const data = await fetchJson(`${INMET_PREVMET_URL}/autocomplete/${encodeURIComponent(query)}`, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS });
    const results = Array.isArray(data) ? data : [];

    return results.map((result) => ({
      label: result.label || result.value || result.id || 'Município INMET',
      geocode: Number(result.geocode),
      lat: Number(result.latitude),
      lon: Number(result.longitude),
      uf: extractUfFromText(result.custom || result.label || result.id || ''),
      city: extractCityName(result.custom || result.label || result.id || '')
    })).filter((result) => Number.isFinite(result.geocode) && Number.isFinite(result.lat) && Number.isFinite(result.lon));
  }

  function buildInmetQueryCandidates(location, cptecLocation) {
    const hints = [
      extractLocationHint(location?.name),
      cptecLocation
    ].filter(Boolean);

    const seen = new Set();
    const queries = [];

    hints.forEach((hint) => {
      const baseCity = normalizeLabelSpacing(hint.city || extractCityName(hint.name || ''));
      const uf = (hint.uf || extractUfFromText(hint.name || '') || '').toUpperCase();
      if (!baseCity || isGenericLocationName(baseCity)) return;

      [
        uf ? `${baseCity}-${uf}` : '',
        uf ? `${baseCity} ${uf}` : '',
        baseCity,
        uf ? `${stripAccents(baseCity)} ${uf}` : '',
        stripAccents(baseCity)
      ].forEach((query) => {
        const normalized = query.trim();
        if (!normalized || seen.has(normalized.toLowerCase())) return;
        seen.add(normalized.toLowerCase());
        queries.push({ query: normalized, uf });
      });
    });

    return queries;
  }

  function pickNearestLocationCandidate(candidates, location, preferredUf) {
    const filtered = preferredUf
      ? candidates.filter((candidate) => candidate.uf === preferredUf.toUpperCase())
      : candidates;
    const pool = filtered.length ? filtered : candidates;

    return pool
      .map((candidate) => ({
        ...candidate,
        distance: haversineKm(location.lat, location.lon, candidate.lat, candidate.lon)
      }))
      .sort((a, b) => a.distance - b.distance)[0] || null;
  }

  function normalizeInmetResponse(data, target) {
    const root = data?.[String(target.geocode)] || Object.values(data || {})[0];
    if (!root || typeof root !== 'object') {
      throw createError('unsupported', 'INMET sem previsão detalhada para este município.');
    }

    const daily = Object.entries(root)
      .map(([rawDate, value]) => normalizeInmetDailyEntry(rawDate, value))
      .filter(Boolean)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .slice(0, 7);

    if (!daily.length) {
      throw createError('unsupported', 'INMET retornou previsão vazia para este município.');
    }

    const hourly = daily
      .flatMap((entry) => entry.hourlySegments || [])
      .slice(0, 24)
      .map(({ inmetMaxTemp, inmetMinTemp, ...entry }) => entry);

    const current = buildInmetCurrentEntry(daily, hourly);

    return {
      fetchedAt: new Date().toISOString(),
      message: `INMET ativo para ${target.label || target.city || 'município selecionado'}`,
      current,
      hourly,
      daily: daily.map(({ hourlySegments, ...entry }) => entry),
      partial: true
    };
  }

  function normalizeInmetDailyEntry(rawDate, dayData) {
    const dateKey = normalizeBrazilDate(rawDate);
    if (!dateKey || !dayData || typeof dayData !== 'object') return null;

    const periodNames = ['manha', 'tarde', 'noite'].filter((name) => dayData?.[name] && typeof dayData[name] === 'object');
    const hourlySegments = periodNames.length
      ? periodNames.map((name) => buildInmetPeriodEntry(dateKey, dayData[name], name)).filter(Boolean)
      : [buildInmetSummaryEntry(dateKey, dayData)].filter(Boolean);

    if (!hourlySegments.length) return null;

    const weatherCode = weightedMode(hourlySegments.map((entry) => ({ value: entry.weatherCode, weight: 1 })));
    const maxTemp = maxOfValues(hourlySegments.map((entry) => valueOr(entry.inmetMaxTemp, entry.temperature)));
    const minTemp = minOfValues(hourlySegments.map((entry) => valueOr(entry.inmetMinTemp, entry.temperature)));
    const humidityMean = meanOfValues(hourlySegments.map((entry) => entry.humidity));
    const windSpeed = maxOfValues(hourlySegments.map((entry) => entry.windSpeed));
    const windGusts = maxOfValues(hourlySegments.map((entry) => entry.windGusts));
    const windDirection = dominantDirection(hourlySegments.map((entry) => entry.windDirection));
    const rainProbability = maxOfValues(hourlySegments.map((entry) => entry.rainProbability));
    const cloudCover = meanOfValues(hourlySegments.map((entry) => entry.cloudCover));
    const visibilityKm = meanOfValues(hourlySegments.map((entry) => entry.visibilityKm));
    const representative = selectRepresentativeHour(hourlySegments, dateKey === extractDateKey(new Date().toISOString()) ? 0 : 1) || hourlySegments[0];

    return {
      dateKey,
      time: representative.time,
      maxTemp,
      minTemp,
      feelsLikeMax: maxTemp,
      feelsLikeMin: minTemp,
      humidityMean,
      pressure: null,
      visibilityKm,
      windSpeed,
      windGusts,
      windDirection,
      cloudCover,
      rainProbability,
      precipitation: maxOfValues(hourlySegments.map((entry) => entry.precipitation)),
      uvIndexMax: null,
      weatherCode,
      sunrise: combineDateAndTime24(dateKey, dayData?.nascer),
      sunset: combineDateAndTime24(dateKey, dayData?.ocaso),
      hourlySegments,
      partial: true
    };
  }

  function buildInmetPeriodEntry(dateKey, periodData, periodName) {
    if (!periodData || typeof periodData !== 'object') return null;

    const maxTemp = toFiniteNumber(periodData.temp_max);
    const minTemp = toFiniteNumber(periodData.temp_min);
    const weatherText = [periodData.resumo, periodData.tempo].filter(Boolean).join(' ');
    const weatherCode = mapTextToWeatherCode(weatherText);
    const rainProbability = inferRainProbabilityFromNarrative(weatherText);
    const cloudCover = inferCloudCover(weatherCode, weatherText);
    const precipitation = inferPrecipitationFromProbability(rainProbability, weatherCode);
    const windSpeed = mapInmetWindIntensityToKmh(periodData.int_vento);
    const humidity = meanOfValues([toFiniteNumber(periodData.umidade_max), toFiniteNumber(periodData.umidade_min)]);
    const windDirection = cardinalToDegrees(periodData.dir_vento);
    const temperature = estimateInmetTemperature(minTemp, maxTemp, periodName);
    const hour = periodName === 'manha' ? '09:00' : periodName === 'tarde' ? '15:00' : '21:00';
    const presentation = getWeatherPresentation(weatherCode, periodName !== 'noite');

    return {
      time: `${dateKey}T${hour}`,
      dateKey,
      temperature,
      feelsLike: temperature,
      humidity,
      pressure: null,
      visibilityKm: estimateVisibilityKm(cloudCover, precipitation),
      windSpeed,
      windDirection,
      windGusts: Number.isFinite(windSpeed) ? roundTo(windSpeed * 1.28, 1) : null,
      cloudCover,
      rainProbability,
      precipitation,
      uvIndex: null,
      weatherCode,
      isDay: periodName !== 'noite',
      icon: presentation.icon,
      description: presentation.label,
      inmetMaxTemp: maxTemp,
      inmetMinTemp: minTemp
    };
  }

  function buildInmetSummaryEntry(dateKey, dayData) {
    const maxTemp = toFiniteNumber(dayData.temp_max);
    const minTemp = toFiniteNumber(dayData.temp_min);
    const weatherText = [dayData.resumo, dayData.tempo].filter(Boolean).join(' ');
    const weatherCode = mapTextToWeatherCode(weatherText);
    const rainProbability = inferRainProbabilityFromNarrative(weatherText);
    const cloudCover = inferCloudCover(weatherCode, weatherText);
    const precipitation = inferPrecipitationFromProbability(rainProbability, weatherCode);
    const windSpeed = mapInmetWindIntensityToKmh(dayData.int_vento);
    const humidity = meanOfValues([toFiniteNumber(dayData.umidade_max), toFiniteNumber(dayData.umidade_min)]);
    const windDirection = cardinalToDegrees(dayData.dir_vento);
    const temperature = meanOfValues([minTemp, maxTemp]);
    const presentation = getWeatherPresentation(weatherCode, true);

    return {
      time: `${dateKey}T14:00`,
      dateKey,
      temperature,
      feelsLike: temperature,
      humidity,
      pressure: null,
      visibilityKm: estimateVisibilityKm(cloudCover, precipitation),
      windSpeed,
      windDirection,
      windGusts: Number.isFinite(windSpeed) ? roundTo(windSpeed * 1.2, 1) : null,
      cloudCover,
      rainProbability,
      precipitation,
      uvIndex: null,
      weatherCode,
      isDay: true,
      icon: presentation.icon,
      description: presentation.label,
      inmetMaxTemp: maxTemp,
      inmetMinTemp: minTemp
    };
  }

  function buildInmetCurrentEntry(daily, hourly) {
    const todayKey = extractDateKey(new Date().toISOString());
    const dayHours = hourly.filter((entry) => entry.dateKey === todayKey);
    const currentHour = new Date().getHours();
    const liveEntry = (dayHours.length ? dayHours : hourly)
      .slice()
      .sort((a, b) => Math.abs(new Date(a.time).getHours() - currentHour) - Math.abs(new Date(b.time).getHours() - currentHour))[0];
    const fallbackDay = daily.find((entry) => entry.dateKey === todayKey) || daily[0];
    const weatherCode = valueOr(liveEntry?.weatherCode, fallbackDay?.weatherCode, 2);
    const isDay = liveEntry?.isDay == null ? true : Boolean(liveEntry.isDay);
    const presentation = getWeatherPresentation(weatherCode, isDay);

    return {
      time: liveEntry?.time || fallbackDay?.time || new Date().toISOString(),
      temperature: valueOr(liveEntry?.temperature, meanOfValues([fallbackDay?.minTemp, fallbackDay?.maxTemp]), null),
      feelsLike: valueOr(liveEntry?.feelsLike, meanOfValues([fallbackDay?.minTemp, fallbackDay?.maxTemp]), null),
      humidity: valueOr(liveEntry?.humidity, fallbackDay?.humidityMean, null),
      pressure: null,
      windSpeed: valueOr(liveEntry?.windSpeed, fallbackDay?.windSpeed, null),
      windDirection: valueOr(liveEntry?.windDirection, fallbackDay?.windDirection, null),
      windGusts: valueOr(liveEntry?.windGusts, fallbackDay?.windGusts, fallbackDay?.windSpeed, null),
      precipitation: valueOr(liveEntry?.precipitation, fallbackDay?.precipitation, 0),
      rainProbability: valueOr(liveEntry?.rainProbability, fallbackDay?.rainProbability, 0),
      cloudCover: valueOr(liveEntry?.cloudCover, fallbackDay?.cloudCover, null),
      visibilityKm: valueOr(liveEntry?.visibilityKm, fallbackDay?.visibilityKm, estimateVisibilityKm(fallbackDay?.cloudCover, fallbackDay?.precipitation), 10),
      uvIndex: null,
      weatherCode,
      isDay,
      icon: presentation.icon,
      description: presentation.label
    };
  }

  function normalizeCptecResponse(xml) {
    const cityNode = xml?.querySelector('cidade');
    if (!cityNode) {
      throw createError('unsupported', 'CPTEC/INPE sem previsão para este ponto.');
    }

    const location = {
      name: xmlText(cityNode, 'nome'),
      uf: xmlText(cityNode, 'uf')
    };

    const daily = Array.from(cityNode.getElementsByTagName('previsao'))
      .map((node) => {
        const dateKey = xmlText(node, 'dia');
        const weatherCodeKey = xmlText(node, 'tempo').toLowerCase();
        const weatherCode = mapCptecTempoCode(weatherCodeKey);
        const rainProbability = mapCptecRainProbability(weatherCodeKey);
        const cloudCover = inferCloudCover(weatherCode, weatherCodeKey);
        const precipitation = inferPrecipitationFromProbability(rainProbability, weatherCode);

        return {
          dateKey,
          time: `${dateKey}T14:00`,
          maxTemp: toFiniteNumber(xmlText(node, 'maxima')),
          minTemp: toFiniteNumber(xmlText(node, 'minima')),
          feelsLikeMax: toFiniteNumber(xmlText(node, 'maxima')),
          feelsLikeMin: toFiniteNumber(xmlText(node, 'minima')),
          humidityMean: null,
          pressure: null,
          visibilityKm: estimateVisibilityKm(cloudCover, precipitation),
          windSpeed: null,
          windGusts: null,
          windDirection: null,
          cloudCover,
          rainProbability,
          precipitation,
          uvIndexMax: toFiniteNumber(xmlText(node, 'iuv')),
          weatherCode,
          sunrise: null,
          sunset: null
        };
      })
      .filter((entry) => entry.dateKey)
      .slice(0, 7);

    if (!daily.length) {
      throw createError('unsupported', 'CPTEC/INPE retornou previsão vazia para este ponto.');
    }

    const hourly = daily.slice(0, 3).map((day) => {
      const presentation = getWeatherPresentation(day.weatherCode, true);
      const temperature = meanOfValues([day.minTemp, day.maxTemp]);
      return {
        time: `${day.dateKey}T12:00`,
        dateKey: day.dateKey,
        temperature,
        feelsLike: temperature,
        humidity: null,
        pressure: null,
        visibilityKm: day.visibilityKm,
        windSpeed: null,
        windDirection: null,
        windGusts: null,
        cloudCover: day.cloudCover,
        rainProbability: day.rainProbability,
        precipitation: day.precipitation,
        uvIndex: day.uvIndexMax,
        weatherCode: day.weatherCode,
        isDay: true,
        icon: presentation.icon,
        description: presentation.label
      };
    });

    const firstDay = daily[0];
    const currentWeather = getWeatherPresentation(firstDay.weatherCode, true);
    const currentTemperature = meanOfValues([firstDay.minTemp, firstDay.maxTemp]);

    return {
      fetchedAt: new Date().toISOString(),
      message: `CPTEC/INPE ativo próximo de ${[location.name, location.uf].filter(Boolean).join('/') || 'referência local'}`,
      location,
      current: {
        time: `${firstDay.dateKey}T12:00`,
        temperature: currentTemperature,
        feelsLike: currentTemperature,
        humidity: null,
        pressure: null,
        windSpeed: null,
        windDirection: null,
        windGusts: null,
        precipitation: firstDay.precipitation,
        rainProbability: firstDay.rainProbability,
        cloudCover: firstDay.cloudCover,
        visibilityKm: firstDay.visibilityKm,
        uvIndex: firstDay.uvIndexMax,
        weatherCode: firstDay.weatherCode,
        isDay: true,
        icon: currentWeather.icon,
        description: currentWeather.label
      },
      hourly,
      daily,
      partial: true
    };
  }

  function parseClimatempoPayload(html) {
    const infoCity = parseJsonBlock(extractJsonPropertyBlock(html, 'infoCity'), 'infoCity');
    const currentWeather = parseJsonBlock(extractJsonPropertyBlock(html, 'currentWeather'), 'currentWeather');
    const dailyForecast = parseJsonBlock(extractJsonPropertyBlock(html, 'dailyForecast'), 'dailyForecast');
    const hourlyForecast = parseJsonBlock(extractJsonPropertyBlock(html, 'hourlyForecast'), 'hourlyForecast');

    if (!infoCity || !currentWeather || !Array.isArray(dailyForecast) || !dailyForecast.length) {
      throw new Error('Climatempo sem dados estruturados suficientes para a cidade configurada.');
    }

    return {
      infoCity,
      currentWeather,
      dailyForecast,
      hourlyForecast: hourlyForecast && typeof hourlyForecast === 'object' ? hourlyForecast : {}
    };
  }

  function validateClimatempoPayload(payload, source) {
    const payloadLat = toFiniteNumber(payload?.infoCity?.latitude);
    const payloadLon = toFiniteNumber(payload?.infoCity?.longitude);
    const payloadUf = String(payload?.infoCity?.uf || '').toUpperCase();
    const payloadCity = normalizeLocationToken(payload?.infoCity?.city);

    if (payloadUf && source.uf && payloadUf !== source.uf) {
      throw new Error('Climatempo retornou uma UF diferente da fonte configurada.');
    }

    if (payloadCity && normalizeLocationToken(source.city) && payloadCity !== normalizeLocationToken(source.city)) {
      throw new Error('Climatempo retornou uma cidade diferente da fonte configurada.');
    }

    if (Number.isFinite(payloadLat) && Number.isFinite(payloadLon)) {
      const distance = haversineKm(payloadLat, payloadLon, source.lat, source.lon);
      if (distance > 40) {
        throw new Error('Climatempo retornou coordenadas incompatíveis com a fonte configurada.');
      }
    }
  }

  function normalizeClimatempoResponse(payload, source) {
    const rawDaily = Array.isArray(payload.dailyForecast) ? payload.dailyForecast.slice(0, 14) : [];
    const rawHourly = Object.values(payload.hourlyForecast || {})
      .flat()
      .filter((entry) => entry?.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (!rawDaily.length || !rawHourly.length) {
      throw new Error('Climatempo retornou previsÃ£o vazia para a fonte configurada.');
    }

    const dayByDate = new Map(rawDaily.map((entry) => [entry.date, entry]));
    const hourly = rawHourly.slice(0, 72).map((entry) => normalizeClimatempoHourlyEntry(entry, dayByDate.get(extractDateKey(entry.date))));
    const daily = rawDaily
      .map((entry) => {
        const hours = rawHourly.filter((hour) => extractDateKey(hour?.date) === entry.date);
        return normalizeClimatempoDailyEntry(entry, hours);
      })
      .filter(Boolean);

    const currentDateKey = normalizeBrazilDate(payload.currentWeather?.date) || daily[0]?.dateKey || extractDateKey(rawHourly[0]?.date);
    const currentStamp = combineDateAndClock(currentDateKey, payload.currentWeather?.dateUpdate);
    const currentHourly = findClosestHourlyEntry(hourly, currentStamp || `${currentDateKey}T12:00`, 180) || hourly[0];
    const currentDay = daily.find((entry) => entry.dateKey === currentDateKey) || daily[0];
    const currentCode = mapClimatempoIconCode(payload.currentWeather?.icon, payload.currentWeather?.condition);
    const currentIsDay = isClimatempoIconDay(payload.currentWeather?.icon, currentStamp || currentHourly?.time);
    const currentPresentation = getWeatherPresentation(currentCode, currentIsDay);

    return {
      fetchedAt: new Date().toISOString(),
      message: `Regional Brasil ativo para ${source.label}`,
      current: {
        time: currentStamp || currentHourly?.time || new Date().toISOString(),
        temperature: valueOr(payload.currentWeather?.temperature, currentHourly?.temperature, meanOfValues([currentDay?.minTemp, currentDay?.maxTemp]), null),
        feelsLike: valueOr(payload.currentWeather?.sensation, currentHourly?.feelsLike, meanOfValues([currentDay?.minTemp, currentDay?.maxTemp]), null),
        humidity: valueOr(payload.currentWeather?.humidity, currentHourly?.humidity, currentDay?.humidityMean, null),
        pressure: valueOr(payload.currentWeather?.pressure, currentHourly?.pressure, currentDay?.pressure, null),
        windSpeed: valueOr(payload.currentWeather?.windVelocity, currentHourly?.windSpeed, currentDay?.windSpeed, null),
        windDirection: valueOr(payload.currentWeather?.windDirectionDegrees, cardinalToDegrees(payload.currentWeather?.windDirection), currentHourly?.windDirection, currentDay?.windDirection, null),
        windGusts: valueOr(currentHourly?.windGusts, currentDay?.windGusts, currentDay?.windSpeed, null),
        precipitation: valueOr(currentHourly?.precipitation, currentDay?.precipitation, 0),
        rainProbability: valueOr(currentHourly?.rainProbability, currentDay?.rainProbability, 0),
        cloudCover: valueOr(currentHourly?.cloudCover, currentDay?.cloudCover, inferCloudCover(currentCode, payload.currentWeather?.condition), null),
        visibilityKm: valueOr(currentHourly?.visibilityKm, currentDay?.visibilityKm, estimateVisibilityKm(currentDay?.cloudCover, currentDay?.precipitation), 10),
        uvIndex: valueOr(currentDay?.uvIndexMax, null),
        weatherCode: currentCode,
        isDay: currentIsDay,
        icon: currentPresentation.icon,
        description: normalizeLabelSpacing(payload.currentWeather?.condition) || currentPresentation.label
      },
      hourly,
      daily,
      partial: false
    };
  }

  function normalizeClimatempoHourlyEntry(entry, day) {
    const time = entry?.date || new Date().toISOString();
    const dateKey = extractDateKey(time);
    const weatherCode = mapClimatempoIconCode(entry?.icon?.resource, day?.textIcon?.text?.pt || day?.weekdayPhrase || '');
    const precipitation = valueOr(toFiniteNumber(entry?.rain?.precipitation), 0);
    const rainProbability = estimateClimatempoRainProbability(precipitation, day?.rain?.probability, weatherCode);
    const cloudCover = inferCloudCover(weatherCode, day?.textIcon?.text?.pt || '');
    const windSpeed = toFiniteNumber(entry?.wind?.velocity);
    const windDirection = valueOr(entry?.wind?.direction_degrees, cardinalToDegrees(entry?.wind?.direction));
    const isDay = isClimatempoIconDay(entry?.icon?.resource, time);
    const presentation = getWeatherPresentation(weatherCode, isDay);

    return {
      time,
      dateKey,
      temperature: toFiniteNumber(entry?.temperature?.temperature),
      feelsLike: toFiniteNumber(entry?.temperature?.temperature),
      humidity: toFiniteNumber(entry?.humidity?.relativeHumidity),
      pressure: toFiniteNumber(entry?.pressure?.pressure),
      visibilityKm: estimateVisibilityKm(cloudCover, precipitation),
      windSpeed,
      windDirection,
      windGusts: estimateClimatempoWindGust(windSpeed, day?.wind),
      cloudCover,
      rainProbability,
      precipitation,
      uvIndex: null,
      weatherCode,
      isDay,
      icon: presentation.icon,
      description: presentation.label
    };
  }

  function normalizeClimatempoDailyEntry(entry, hourlyEntries) {
    if (!entry?.date) return null;

    const weatherText = entry?.textIcon?.text?.reducedPhrasePt || entry?.textIcon?.text?.pt || entry?.weekdayPhrase || '';
    const weatherCode = mapClimatempoIconCode(entry?.textIcon?.icon?.day, weatherText);
    const rawHours = Array.isArray(hourlyEntries) ? hourlyEntries : [];
    const hourlyCloud = rawHours.map((hour) => inferCloudCover(mapClimatempoIconCode(hour?.icon?.resource, weatherText), weatherText));
    const hourlyPressure = rawHours.map((hour) => toFiniteNumber(hour?.pressure?.pressure));
    const hourlyVisibility = rawHours.map((hour) => estimateVisibilityKm(
      inferCloudCover(mapClimatempoIconCode(hour?.icon?.resource, weatherText), weatherText),
      toFiniteNumber(hour?.rain?.precipitation)
    ));

    return {
      dateKey: entry.date,
      time: `${entry.date}T14:00`,
      maxTemp: toFiniteNumber(entry?.temperature?.max),
      minTemp: toFiniteNumber(entry?.temperature?.min),
      feelsLikeMax: toFiniteNumber(entry?.thermalSensation?.thermalSensation),
      feelsLikeMin: toFiniteNumber(entry?.thermalSensation?.thermalSensationMin),
      humidityMean: meanOfValues([toFiniteNumber(entry?.humidity?.min), toFiniteNumber(entry?.humidity?.max)]),
      pressure: meanOfValues(hourlyPressure),
      visibilityKm: meanOfValues(hourlyVisibility),
      windSpeed: valueOr(entry?.wind?.maxVelocity, entry?.wind?.avgVelocity, null),
      windGusts: valueOr(entry?.wind?.maxGust, estimateClimatempoWindGust(valueOr(entry?.wind?.maxVelocity, entry?.wind?.avgVelocity, null), entry?.wind), null),
      windDirection: valueOr(entry?.wind?.direction_degrees, cardinalToDegrees(entry?.wind?.direction)),
      cloudCover: meanOfValues(hourlyCloud),
      rainProbability: valueOr(entry?.rain?.probability, 0),
      precipitation: valueOr(toFiniteNumber(entry?.rain?.precipitation), 0),
      uvIndexMax: toFiniteNumber(entry?.uv?.max),
      weatherCode,
      sunrise: combineDateAndClock(entry.date, entry?.sun?.sunshine),
      sunset: combineDateAndClock(entry.date, entry?.sun?.sunset),
      partial: false
    };
  }

  function normalizeOpenMeteoResponse(data, label) {
    const hourlyTimes = data?.hourly?.time || [];
    const currentTime = data?.current?.time || hourlyTimes[0] || new Date().toISOString();
    const currentIndex = findClosestHourIndex(hourlyTimes, currentTime);
    const currentFromHourly = buildHourlySnapshotFromOpenMeteo(data?.hourly, currentIndex);
    const weatherPresentation = getWeatherPresentation(valueOr(data?.current?.weather_code, currentFromHourly.weatherCode, 0), data?.current?.is_day === 1);

    const current = {
      time: currentTime,
      temperature: valueOr(data?.current?.temperature_2m, currentFromHourly.temperature, 0),
      feelsLike: valueOr(data?.current?.apparent_temperature, currentFromHourly.feelsLike, 0),
      humidity: valueOr(data?.current?.relative_humidity_2m, currentFromHourly.humidity, 0),
      pressure: valueOr(data?.current?.pressure_msl, currentFromHourly.pressure, 1013),
      windSpeed: valueOr(data?.current?.wind_speed_10m, currentFromHourly.windSpeed, 0),
      windDirection: valueOr(data?.current?.wind_direction_10m, currentFromHourly.windDirection, 0),
      windGusts: valueOr(data?.current?.wind_gusts_10m, currentFromHourly.windGusts, 0),
      precipitation: valueOr(data?.current?.precipitation, currentFromHourly.precipitation, 0),
      rainProbability: valueOr(currentFromHourly.rainProbability, data?.daily?.precipitation_probability_max?.[0], 0),
      cloudCover: valueOr(data?.current?.cloud_cover, currentFromHourly.cloudCover, 0),
      visibilityKm: valueOr(data?.current?.visibility, null) != null
        ? valueOr(data?.current?.visibility, 0) / 1000
        : valueOr(currentFromHourly.visibilityKm, estimateVisibilityKm(data?.current?.cloud_cover, data?.current?.precipitation), 10),
      uvIndex: valueOr(data?.current?.uv_index, currentFromHourly.uvIndex, 0),
      weatherCode: valueOr(data?.current?.weather_code, currentFromHourly.weatherCode, 0),
      isDay: data?.current?.is_day === 1,
      icon: weatherPresentation.icon,
      description: weatherPresentation.label
    };

    const hourly = hourlyTimes.slice(0, 72).map((time, index) => {
      const snapshot = buildHourlySnapshotFromOpenMeteo(data?.hourly, index);
      return {
        time,
        dateKey: extractDateKey(time),
        ...snapshot,
        isDay: isDaytimeFromHour(time),
        description: getWeatherPresentation(snapshot.weatherCode, isDaytimeFromHour(time)).label
      };
    });

    const daily = (data?.daily?.time || []).slice(0, 14).map((dateKey, index) => ({
      dateKey,
      time: `${dateKey}T14:00`,
      maxTemp: valueOr(data?.daily?.temperature_2m_max?.[index], null),
      minTemp: valueOr(data?.daily?.temperature_2m_min?.[index], null),
      feelsLikeMax: valueOr(data?.daily?.apparent_temperature_max?.[index], null),
      feelsLikeMin: valueOr(data?.daily?.apparent_temperature_min?.[index], null),
      humidityMean: meanOfValues(hourly.filter((entry) => entry.dateKey === dateKey).map((entry) => entry.humidity)),
      pressure: meanOfValues(hourly.filter((entry) => entry.dateKey === dateKey).map((entry) => entry.pressure)),
      visibilityKm: meanOfValues(hourly.filter((entry) => entry.dateKey === dateKey).map((entry) => entry.visibilityKm)),
      windSpeed: valueOr(data?.daily?.wind_speed_10m_max?.[index], null),
      windGusts: valueOr(data?.daily?.wind_gusts_10m_max?.[index], null),
      windDirection: valueOr(data?.daily?.wind_direction_10m_dominant?.[index], null),
      cloudCover: meanOfValues(hourly.filter((entry) => entry.dateKey === dateKey).map((entry) => entry.cloudCover)),
      rainProbability: valueOr(data?.daily?.precipitation_probability_max?.[index], maxOfValues(hourly.filter((entry) => entry.dateKey === dateKey).map((entry) => entry.rainProbability)), 0),
      precipitation: valueOr(data?.daily?.precipitation_sum?.[index], sumOfValues(hourly.filter((entry) => entry.dateKey === dateKey).map((entry) => entry.precipitation)), 0),
      uvIndexMax: valueOr(data?.daily?.uv_index_max?.[index], maxOfValues(hourly.filter((entry) => entry.dateKey === dateKey).map((entry) => entry.uvIndex)), 0),
      weatherCode: valueOr(data?.daily?.weather_code?.[index], null),
      sunrise: data?.daily?.sunrise?.[index] || null,
      sunset: data?.daily?.sunset?.[index] || null
    }));

    return {
      fetchedAt: new Date().toISOString(),
      message: `${label} ativo`,
      current,
      hourly,
      daily
    };
  }

  function normalizeWeatherApiResponse(data) {
    const currentCode = mapWeatherApiCode(data?.current?.condition?.code, data?.current?.condition?.text);
    const presentation = getWeatherPresentation(currentCode, data?.current?.is_day === 1);

    const current = {
      time: data?.current?.last_updated || new Date().toISOString(),
      temperature: valueOr(data?.current?.temp_c, 0),
      feelsLike: valueOr(data?.current?.feelslike_c, 0),
      humidity: valueOr(data?.current?.humidity, 0),
      pressure: valueOr(data?.current?.pressure_mb, 1013),
      windSpeed: valueOr(data?.current?.wind_kph, 0),
      windDirection: cardinalToDegrees(data?.current?.wind_dir),
      windGusts: valueOr(data?.current?.gust_kph, data?.current?.wind_kph, 0),
      precipitation: valueOr(data?.current?.precip_mm, 0),
      rainProbability: valueOr(data?.forecast?.forecastday?.[0]?.day?.daily_chance_of_rain, 0),
      cloudCover: valueOr(data?.current?.cloud, 0),
      visibilityKm: valueOr(data?.current?.vis_km, 10),
      uvIndex: valueOr(data?.current?.uv, 0),
      weatherCode: currentCode,
      isDay: data?.current?.is_day === 1,
      icon: presentation.icon,
      description: data?.current?.condition?.text || presentation.label
    };

    const hourly = (data?.forecast?.forecastday || [])
      .flatMap((day) => day?.hour || [])
      .slice(0, 72)
      .map((entry) => {
        const weatherCode = mapWeatherApiCode(entry?.condition?.code, entry?.condition?.text);
        return {
          time: entry?.time || new Date().toISOString(),
          dateKey: extractDateKey(entry?.time),
          temperature: valueOr(entry?.temp_c, null),
          feelsLike: valueOr(entry?.feelslike_c, null),
          humidity: valueOr(entry?.humidity, null),
          pressure: valueOr(entry?.pressure_mb, null),
          visibilityKm: valueOr(entry?.vis_km, null),
          windSpeed: valueOr(entry?.wind_kph, null),
          windDirection: cardinalToDegrees(entry?.wind_dir),
          windGusts: valueOr(entry?.gust_kph, entry?.wind_kph, null),
          cloudCover: valueOr(entry?.cloud, null),
          rainProbability: valueOr(entry?.chance_of_rain, 0),
          precipitation: valueOr(entry?.precip_mm, 0),
          uvIndex: valueOr(entry?.uv, 0),
          weatherCode
        };
      });

    const daily = (data?.forecast?.forecastday || []).map((entry) => ({
      dateKey: entry?.date || extractDateKey(entry?.hour?.[12]?.time),
      time: entry?.date ? `${entry.date}T14:00` : new Date().toISOString(),
      maxTemp: valueOr(entry?.day?.maxtemp_c, null),
      minTemp: valueOr(entry?.day?.mintemp_c, null),
      feelsLikeMax: valueOr(entry?.day?.maxtemp_c, null),
      feelsLikeMin: valueOr(entry?.day?.mintemp_c, null),
      humidityMean: valueOr(entry?.day?.avghumidity, null),
      pressure: meanOfValues((entry?.hour || []).map((hour) => hour?.pressure_mb)),
      visibilityKm: meanOfValues((entry?.hour || []).map((hour) => hour?.vis_km)),
      windSpeed: valueOr(entry?.day?.maxwind_kph, null),
      windGusts: maxOfValues((entry?.hour || []).map((hour) => hour?.gust_kph)),
      windDirection: dominantDirection((entry?.hour || []).map((hour) => cardinalToDegrees(hour?.wind_dir))),
      cloudCover: meanOfValues((entry?.hour || []).map((hour) => hour?.cloud)),
      rainProbability: valueOr(entry?.day?.daily_chance_of_rain, 0),
      precipitation: valueOr(entry?.day?.totalprecip_mm, 0),
      uvIndexMax: valueOr(entry?.day?.uv, 0),
      weatherCode: mapWeatherApiCode(entry?.day?.condition?.code, entry?.day?.condition?.text),
      sunrise: combineDateAndTime(entry?.date, entry?.astro?.sunrise),
      sunset: combineDateAndTime(entry?.date, entry?.astro?.sunset)
    }));

    return {
      fetchedAt: new Date().toISOString(),
      message: 'WeatherAPI ativo',
      current,
      hourly,
      daily,
      partial: daily.length < 7
    };
  }

  function normalizeMeteostatResponse(data) {
    const rows = Array.isArray(data?.data) ? data.data.filter(Boolean) : [];
    if (!rows.length) {
      throw createError('unsupported', 'Meteostat sem dados recentes para o ponto.');
    }

    const latest = rows[rows.length - 1];
    const weatherCode = mapMeteostatCode(latest?.coco);
    const presentation = getWeatherPresentation(weatherCode, true);

    const current = {
      time: latest?.time || new Date().toISOString(),
      temperature: valueOr(latest?.temp, 0),
      feelsLike: valueOr(latest?.temp, 0),
      humidity: valueOr(latest?.rhum, null),
      pressure: valueOr(latest?.pres, 1013),
      windSpeed: valueOr(latest?.wspd, 0),
      windDirection: valueOr(latest?.wdir, 0),
      windGusts: valueOr(latest?.wpgt, latest?.wspd, 0),
      precipitation: valueOr(latest?.prcp, 0),
      rainProbability: valueOr(latest?.prcp, 0) > 0 ? 70 : 25,
      cloudCover: null,
      visibilityKm: null,
      uvIndex: null,
      weatherCode,
      isDay: true,
      icon: presentation.icon,
      description: presentation.label
    };

    const hourly = rows.slice(-24).map((entry) => ({
      time: entry?.time || new Date().toISOString(),
      dateKey: extractDateKey(entry?.time),
      temperature: valueOr(entry?.temp, null),
      feelsLike: valueOr(entry?.temp, null),
      humidity: valueOr(entry?.rhum, null),
      pressure: valueOr(entry?.pres, null),
      visibilityKm: null,
      windSpeed: valueOr(entry?.wspd, null),
      windDirection: valueOr(entry?.wdir, null),
      windGusts: valueOr(entry?.wpgt, entry?.wspd, null),
      cloudCover: null,
      rainProbability: valueOr(entry?.prcp, 0) > 0 ? 65 : 20,
      precipitation: valueOr(entry?.prcp, 0),
      uvIndex: null,
      weatherCode: mapMeteostatCode(entry?.coco)
    }));

    return {
      fetchedAt: new Date().toISOString(),
      message: 'Meteostat ativo para observações recentes',
      current,
      hourly,
      daily: [],
      partial: true
    };
  }

  function normalizeMeteostatResponse(hourlyData, dailyData) {
    const hourlyRows = Array.isArray(hourlyData?.data) ? hourlyData.data.filter(Boolean) : [];
    const dailyRows = Array.isArray(dailyData?.data) ? dailyData.data.filter(Boolean) : [];
    if (!hourlyRows.length && !dailyRows.length) {
      throw createError('unsupported', 'Meteostat sem dados recentes para o ponto.');
    }

    const latest = hourlyRows[hourlyRows.length - 1] || null;
    const weatherCode = latest
      ? mapMeteostatCode(latest?.coco)
      : inferMeteostatDailyWeatherCode(dailyRows[dailyRows.length - 1]);
    const presentation = getWeatherPresentation(weatherCode, true);
    const current = latest ? {
      time: latest?.time || new Date().toISOString(),
      temperature: valueOr(latest?.temp, null),
      feelsLike: valueOr(latest?.temp, null),
      humidity: valueOr(latest?.rhum, null),
      pressure: valueOr(latest?.pres, null),
      windSpeed: valueOr(latest?.wspd, null),
      windDirection: valueOr(latest?.wdir, null),
      windGusts: valueOr(latest?.wpgt, latest?.wspd, null),
      precipitation: valueOr(latest?.prcp, 0),
      rainProbability: valueOr(latest?.prcp, 0) > 0 ? 72 : 24,
      cloudCover: inferCloudCover(weatherCode, presentation.label),
      visibilityKm: estimateVisibilityKm(inferCloudCover(weatherCode, presentation.label), valueOr(latest?.prcp, 0)),
      uvIndex: null,
      weatherCode,
      isDay: true,
      icon: presentation.icon,
      description: presentation.label
    } : {
      time: `${dailyRows[dailyRows.length - 1]?.date || extractDateKey(new Date().toISOString())}T14:00`,
      temperature: valueOr(dailyRows[dailyRows.length - 1]?.tavg, dailyRows[dailyRows.length - 1]?.tmax, null),
      feelsLike: valueOr(dailyRows[dailyRows.length - 1]?.tavg, dailyRows[dailyRows.length - 1]?.tmax, null),
      humidity: null,
      pressure: valueOr(dailyRows[dailyRows.length - 1]?.pres, null),
      windSpeed: valueOr(dailyRows[dailyRows.length - 1]?.wspd, null),
      windDirection: valueOr(dailyRows[dailyRows.length - 1]?.wdir, null),
      windGusts: valueOr(dailyRows[dailyRows.length - 1]?.wpgt, dailyRows[dailyRows.length - 1]?.wspd, null),
      precipitation: valueOr(dailyRows[dailyRows.length - 1]?.prcp, 0),
      rainProbability: valueOr(dailyRows[dailyRows.length - 1]?.prcp, 0) > 0 ? 65 : 20,
      cloudCover: inferCloudCover(weatherCode, presentation.label),
      visibilityKm: estimateVisibilityKm(inferCloudCover(weatherCode, presentation.label), valueOr(dailyRows[dailyRows.length - 1]?.prcp, 0)),
      uvIndex: null,
      weatherCode,
      isDay: true,
      icon: presentation.icon,
      description: presentation.label
    };

    const hourly = hourlyRows.slice(-48).map((entry) => {
      const hourlyCode = mapMeteostatCode(entry?.coco);
      const hourlyCloudCover = inferCloudCover(hourlyCode, getWeatherPresentation(hourlyCode, isDaytimeFromHour(entry?.time)).label);
      return {
        time: entry?.time || new Date().toISOString(),
        dateKey: extractDateKey(entry?.time),
        temperature: valueOr(entry?.temp, null),
        feelsLike: valueOr(entry?.temp, null),
        humidity: valueOr(entry?.rhum, null),
        pressure: valueOr(entry?.pres, null),
        visibilityKm: estimateVisibilityKm(hourlyCloudCover, valueOr(entry?.prcp, 0)),
        windSpeed: valueOr(entry?.wspd, null),
        windDirection: valueOr(entry?.wdir, null),
        windGusts: valueOr(entry?.wpgt, entry?.wspd, null),
        cloudCover: hourlyCloudCover,
        rainProbability: valueOr(entry?.prcp, 0) > 0 ? 68 : 20,
        precipitation: valueOr(entry?.prcp, 0),
        uvIndex: null,
        weatherCode: hourlyCode
      };
    });

    const daily = dailyRows.length
      ? dailyRows.slice(-METEOSTAT_HISTORY_DAYS).map((entry) => ({
        dateKey: normalizeBrazilDate(entry?.date) || extractDateKey(entry?.date),
        time: `${normalizeBrazilDate(entry?.date) || extractDateKey(entry?.date)}T14:00`,
        maxTemp: valueOr(entry?.tmax, null),
        minTemp: valueOr(entry?.tmin, null),
        feelsLikeMax: valueOr(entry?.tmax, null),
        feelsLikeMin: valueOr(entry?.tmin, null),
        humidityMean: null,
        pressure: valueOr(entry?.pres, null),
        visibilityKm: estimateVisibilityKm(inferCloudCover(inferMeteostatDailyWeatherCode(entry), ''), valueOr(entry?.prcp, 0)),
        windSpeed: valueOr(entry?.wspd, null),
        windGusts: valueOr(entry?.wpgt, entry?.wspd, null),
        windDirection: valueOr(entry?.wdir, null),
        cloudCover: inferCloudCover(inferMeteostatDailyWeatherCode(entry), ''),
        rainProbability: valueOr(entry?.prcp, 0) > 0 ? 65 : 18,
        precipitation: valueOr(entry?.prcp, 0),
        uvIndexMax: null,
        weatherCode: inferMeteostatDailyWeatherCode(entry),
        sunrise: null,
        sunset: null
      }))
      : Array.from(groupHourlySeriesByDate(hourly).entries())
        .map(([dateKey, hours]) => aggregateHoursToDaily(dateKey, hours));

    return {
      fetchedAt: new Date().toISOString(),
      message: 'Meteostat ativo para historico e observacoes recentes por coordenadas',
      current,
      hourly,
      daily,
      partial: true
    };
  }

  function inferMeteostatDailyWeatherCode(entry) {
    const precipitation = valueOr(entry?.prcp, 0);
    if (precipitation >= 8) return 63;
    if (precipitation > 0.2) return 61;
    const wind = valueOr(entry?.wspd, 0);
    if (wind >= 28) return 3;
    return 2;
  }

  function normalizeNoaaResponse(hourlyData, dailyData) {
    const hourlyPeriods = hourlyData?.properties?.periods || [];
    const dailyPeriods = dailyData?.properties?.periods || [];

    if (!hourlyPeriods.length) {
      throw createError('unsupported', 'NOAA sem períodos horários disponíveis.');
    }

    const first = hourlyPeriods[0];
    const currentCode = mapTextToWeatherCode(first?.shortForecast || first?.detailedForecast || '');
    const currentPresentation = getWeatherPresentation(currentCode, Boolean(first?.isDaytime));

    const current = {
      time: first?.startTime || new Date().toISOString(),
      temperature: fahrenheitToCelsius(valueOr(first?.temperature, 32)),
      feelsLike: fahrenheitToCelsius(valueOr(first?.temperature, 32)),
      humidity: null,
      pressure: null,
      windSpeed: parseNoaaWindSpeed(first?.windSpeed),
      windDirection: cardinalToDegrees(first?.windDirection),
      windGusts: parseNoaaWindSpeed(first?.windSpeed),
      precipitation: 0,
      rainProbability: valueOr(first?.probabilityOfPrecipitation?.value, 0),
      cloudCover: null,
      visibilityKm: null,
      uvIndex: null,
      weatherCode: currentCode,
      isDay: Boolean(first?.isDaytime),
      icon: currentPresentation.icon,
      description: first?.shortForecast || currentPresentation.label
    };

    const hourly = hourlyPeriods.slice(0, 48).map((period) => {
      const weatherCode = mapTextToWeatherCode(period?.shortForecast || period?.detailedForecast || '');
      return {
        time: period?.startTime || new Date().toISOString(),
        dateKey: extractDateKey(period?.startTime),
        temperature: fahrenheitToCelsius(valueOr(period?.temperature, null)),
        feelsLike: fahrenheitToCelsius(valueOr(period?.temperature, null)),
        humidity: null,
        pressure: null,
        visibilityKm: null,
        windSpeed: parseNoaaWindSpeed(period?.windSpeed),
        windDirection: cardinalToDegrees(period?.windDirection),
        windGusts: parseNoaaWindSpeed(period?.windSpeed),
        cloudCover: null,
        rainProbability: valueOr(period?.probabilityOfPrecipitation?.value, 0),
        precipitation: 0,
        uvIndex: null,
        weatherCode
      };
    });

    return {
      fetchedAt: new Date().toISOString(),
      message: 'NOAA ativa para o ponto selecionado',
      current,
      hourly,
      daily: mergeNoaaDailyPeriods(dailyPeriods),
      partial: true
    };
  }
  function buildWeatherBundle(successfulRuns, allRuns, location) {
    const validRuns = successfulRuns.filter((run) => isValidProviderRun(run));
    const activeRuns = validRuns.filter((run) => (run.weight || 0) > 0);
    const fusionRuns = activeRuns.length ? activeRuns : validRuns;
    const visibleFusionRuns = fusionRuns.filter((run) => !run.hidden);
    const realRunCount = fusionRuns.filter((run) => run.type !== 'demo' && run.type !== 'cache' && run.providerKey !== 'demoWeather' && run.providerKey !== 'savedCache').length;
    const defaultConfidence = realRunCount >= 3
      ? 94
      : realRunCount === 2
        ? 88
        : realRunCount === 1
          ? 82
          : 45;
    const modelAgreement = buildModelAgreement(fusionRuns, defaultConfidence);
    const fusedCurrent = fuseCurrentMetrics(fusionRuns, modelAgreement, defaultConfidence);
    const hourly = fuseHourlySeries(fusionRuns, modelAgreement, defaultConfidence);
    const daily = fuseDailySeries(fusionRuns, hourly, modelAgreement, defaultConfidence);
    const current = hydrateCurrentFromSeries(fusedCurrent, hourly, daily) || fusedCurrent;
    const trend = buildTrendSummary(current, hourly);
    const sourceConsensus = buildSourceConsensus(fusionRuns);
    const brazilSourceCoverage = getBrazilSourceCoverage(fusionRuns, sourceConsensus);
    const confidence = computeConfidence(fusionRuns, modelAgreement, sourceConsensus, defaultConfidence);
    const activeProviderCount = visibleFusionRuns.length || fusionRuns.length;
    const visibleProviderTotal = getEnabledProviders().filter((provider) => provider.visible !== false).length;

    const analytics = {
      providerCount: activeProviderCount,
      providerTotal: visibleProviderTotal,
      brazilSourceCoverage,
      confidence,
      confidenceLabel: getConfidenceLabel(confidence),
      confidenceNote: buildConfidenceNote(confidence, modelAgreement, sourceConsensus, activeProviderCount),
      modelSpreadSummary: buildSpreadSummary(modelAgreement),
      modelComparison: {
        divergence: modelAgreement.divergenceLevel,
        consensus: modelAgreement.consensusLevel,
        activeModels: modelAgreement.activeModelCount,
        comparedModelKeys: modelAgreement.comparedModelKeys
      },
      sourceConsensus,
      trend,
      headline: getClimateHeadline({ ...current, confidence }),
      cacheNote: 'Dados ao vivo'
    };

    const bundle = {
      generatedAt: new Date().toISOString(),
      location,
      current: {
        ...current,
        confidence,
        trendLabel: trend.label,
        spreadLabel: buildSpreadSummary(modelAgreement),
        consensusLabel: sourceConsensus.available
          ? sourceConsensus.summary
          : modelAgreement.available
            ? `${modelAgreement.consensusLevel} entre ${modelAgreement.activeModelCount} modelos`
            : ''
      },
      hourly,
      daily,
      analytics,
      providers: allRuns.map(stripTransientProviderFields),
      modelAgreement,
      alerts: []
    };

    bundle.alerts = buildAlertStream(bundle);
    bundle.insights = buildClimateInsights(bundle);

    return bundle;
  }

  function finalizeProviderRun(provider, data, startedAt) {
    const sanitized = sanitizeProviderPayload(data);

    if (!sanitized.current) {
      throw new Error(`${provider.label}: resposta sem dados atuais confiáveis.`);
    }

    const run = {
      providerKey: provider.providerKey,
      label: provider.label,
      reliability: provider.reliability,
      type: provider.type,
      hidden: provider.visible === false,
      success: true,
      status: sanitized.partial ? 'partial' : 'online',
      message: sanitized.message
        || (sanitized.partial
          ? `${provider.label} ativo com cobertura parcial e fallback validado.`
          : `${provider.label} ativo com dados validados.`),
      fetchedAt: sanitized.fetchedAt,
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      fallbackSource: sanitized.fallbackSource || '',
      weightMultiplier: sanitized.weightMultiplier,
      stationSelection: sanitized.stationSelection,
      current: sanitized.current,
      hourly: sanitized.hourly,
      daily: sanitized.daily
    };

    run.dailyMap = new Map(run.daily.map((entry) => [entry.dateKey, entry]));
    run.weight = computeProviderWeight(run);

    return run;
  }

  function sanitizeProviderPayload(data) {
    const hourly = sanitizeHourlySeries(Array.isArray(data?.hourly) ? data.hourly : []);
    const daily = sanitizeDailySeries(Array.isArray(data?.daily) ? data.daily : [], hourly);
    let current = sanitizeCurrentSnapshot(data?.current);

    if (!current) {
      current = hydrateProviderCurrentFromSeries(hourly, daily);
    } else {
      current = fillMissingSnapshotMetrics(current, hourly[0] || null, daily[0] || null);
    }

    return {
      fetchedAt: data?.fetchedAt || new Date().toISOString(),
      message: String(data?.message || '').trim(),
      partial: Boolean(data?.partial) || hourly.length < 12 || daily.length < 3,
      fallbackSource: String(data?.fallbackSource || '').trim(),
      weightMultiplier: Number.isFinite(Number(data?.weightMultiplier)) ? Number(data.weightMultiplier) : 1,
      stationSelection: normalizeStationSelection(data?.stationSelection),
      current,
      hourly,
      daily
    };
  }

  function sanitizeCurrentSnapshot(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const time = normalizeTimeValue(entry.time) || new Date().toISOString();
    const weatherCode = sanitizeWeatherCode(entry.weatherCode);
    const snapshot = {
      time,
      dateKey: extractDateKey(time),
      temperature: sanitizeMetricValue('temperature', entry.temperature),
      feelsLike: sanitizeMetricValue('feelsLike', entry.feelsLike),
      humidity: sanitizeMetricValue('humidity', entry.humidity),
      pressure: sanitizeMetricValue('pressure', entry.pressure),
      windSpeed: sanitizeMetricValue('windSpeed', entry.windSpeed),
      windDirection: sanitizeMetricValue('windDirection', entry.windDirection),
      windGusts: sanitizeMetricValue('windGusts', entry.windGusts),
      precipitation: sanitizeMetricValue('precipitation', entry.precipitation),
      rainProbability: sanitizeMetricValue('rainProbability', entry.rainProbability),
      cloudCover: sanitizeMetricValue('cloudCover', entry.cloudCover),
      visibilityKm: sanitizeMetricValue('visibilityKm', entry.visibilityKm),
      uvIndex: sanitizeMetricValue('uvIndex', entry.uvIndex),
      weatherCode,
      isDay: entry.isDay == null ? isDaytimeFromHour(time) : Boolean(entry.isDay)
    };

    snapshot.windGusts = valueOr(snapshot.windGusts, snapshot.windSpeed);
    snapshot.visibilityKm = valueOr(snapshot.visibilityKm, estimateVisibilityKm(snapshot.cloudCover, snapshot.precipitation), 10);
    snapshot.rainProbability = valueOr(snapshot.rainProbability, 0);
    snapshot.weatherCode = valueOr(snapshot.weatherCode, 2);

    return isMeaningfulSnapshot(snapshot) ? snapshot : null;
  }

  function sanitizeHourlySeries(entries) {
    const normalized = entries
      .map((entry) => {
        const time = normalizeTimeValue(entry?.time);
        if (!time) return null;

        const snapshot = fillMissingSnapshotMetrics({
          time,
          dateKey: extractDateKey(time),
          temperature: sanitizeMetricValue('temperature', entry.temperature),
          feelsLike: sanitizeMetricValue('feelsLike', entry.feelsLike),
          humidity: sanitizeMetricValue('humidity', entry.humidity),
          pressure: sanitizeMetricValue('pressure', entry.pressure),
          visibilityKm: sanitizeMetricValue('visibilityKm', entry.visibilityKm),
          windSpeed: sanitizeMetricValue('windSpeed', entry.windSpeed),
          windDirection: sanitizeMetricValue('windDirection', entry.windDirection),
          windGusts: sanitizeMetricValue('windGusts', entry.windGusts),
          cloudCover: sanitizeMetricValue('cloudCover', entry.cloudCover),
          rainProbability: sanitizeMetricValue('rainProbability', entry.rainProbability),
          precipitation: sanitizeMetricValue('precipitation', entry.precipitation),
          uvIndex: sanitizeMetricValue('uvIndex', entry.uvIndex),
          weatherCode: sanitizeWeatherCode(entry.weatherCode),
          isDay: entry?.isDay == null ? isDaytimeFromHour(time) : Boolean(entry.isDay)
        });

        return isMeaningfulSnapshot(snapshot) ? snapshot : null;
      })
      .filter(Boolean);

    return dedupeSeries(normalized, (entry) => entry.time).slice(0, 48);
  }

  function sanitizeDailySeries(entries, hourly) {
    const hourlyByDate = groupHourlySeriesByDate(hourly);
    const normalized = entries
      .map((entry) => sanitizeDailyEntry(entry, hourlyByDate.get(entry?.dateKey || extractDateKey(entry?.time)) || []))
      .filter(Boolean);

    hourlyByDate.forEach((hours, dateKey) => {
      if (normalized.some((entry) => entry.dateKey === dateKey)) return;
      const aggregated = sanitizeDailyEntry(aggregateHoursToDaily(dateKey, hours), hours);
      if (aggregated) {
        normalized.push(aggregated);
      }
    });

    return dedupeSeries(normalized, (entry) => entry.dateKey).slice(0, 14);
  }

  function sanitizeDailyEntry(entry, hourlyEntries = []) {
    if (!entry || typeof entry !== 'object') return null;

    const dateKey = entry.dateKey || extractDateKey(entry.time);
    if (!dateKey) return null;

    const aggregate = hourlyEntries.length ? aggregateHoursToDaily(dateKey, hourlyEntries) : null;
    let minTemp = sanitizeMetricValue('minTemp', valueOr(entry.minTemp, aggregate?.minTemp));
    let maxTemp = sanitizeMetricValue('maxTemp', valueOr(entry.maxTemp, aggregate?.maxTemp));

    if (Number.isFinite(minTemp) && Number.isFinite(maxTemp) && minTemp > maxTemp) {
      [minTemp, maxTemp] = [maxTemp, minTemp];
    }

    const daily = {
      dateKey,
      time: normalizeTimeValue(entry.time) || `${dateKey}T14:00`,
      maxTemp,
      minTemp,
      feelsLikeMax: sanitizeMetricValue('feelsLikeMax', valueOr(entry.feelsLikeMax, aggregate?.feelsLikeMax)),
      feelsLikeMin: sanitizeMetricValue('feelsLikeMin', valueOr(entry.feelsLikeMin, aggregate?.feelsLikeMin)),
      humidityMean: sanitizeMetricValue('humidityMean', valueOr(entry.humidityMean, aggregate?.humidityMean)),
      pressure: sanitizeMetricValue('pressure', valueOr(entry.pressure, aggregate?.pressure)),
      visibilityKm: sanitizeMetricValue('visibilityKm', valueOr(entry.visibilityKm, aggregate?.visibilityKm)),
      windSpeed: sanitizeMetricValue('windSpeed', valueOr(entry.windSpeed, aggregate?.windSpeed)),
      windGusts: sanitizeMetricValue('windGusts', valueOr(entry.windGusts, aggregate?.windGusts)),
      windDirection: sanitizeMetricValue('windDirection', valueOr(entry.windDirection, aggregate?.windDirection)),
      cloudCover: sanitizeMetricValue('cloudCover', valueOr(entry.cloudCover, aggregate?.cloudCover)),
      rainProbability: sanitizeMetricValue('rainProbability', valueOr(entry.rainProbability, aggregate?.rainProbability)),
      precipitation: sanitizeMetricValue('precipitation', valueOr(entry.precipitation, aggregate?.precipitation)),
      uvIndexMax: sanitizeMetricValue('uvIndexMax', valueOr(entry.uvIndexMax, aggregate?.uvIndexMax)),
      weatherCode: valueOr(sanitizeWeatherCode(entry.weatherCode), sanitizeWeatherCode(aggregate?.weatherCode), 2),
      sunrise: normalizeTimeValue(entry.sunrise) || aggregate?.sunrise || null,
      sunset: normalizeTimeValue(entry.sunset) || aggregate?.sunset || null
    };

    daily.windGusts = valueOr(daily.windGusts, daily.windSpeed);
    daily.visibilityKm = valueOr(daily.visibilityKm, estimateVisibilityKm(daily.cloudCover, daily.precipitation), 10);
    daily.rainProbability = valueOr(daily.rainProbability, 0);

    return isMeaningfulDailySnapshot(daily) ? daily : null;
  }

  function hydrateProviderCurrentFromSeries(hourly, daily) {
    const firstHour = hourly[0] || null;
    const firstDay = daily[0] || null;

    if (!firstHour && !firstDay) return null;

    return fillMissingSnapshotMetrics({
      time: firstHour?.time || `${firstDay.dateKey}T12:00`,
      dateKey: firstHour?.dateKey || firstDay?.dateKey || extractDateKey(firstHour?.time),
      temperature: firstHour?.temperature,
      feelsLike: firstHour?.feelsLike,
      humidity: firstHour?.humidity,
      pressure: firstHour?.pressure,
      visibilityKm: firstHour?.visibilityKm,
      windSpeed: firstHour?.windSpeed,
      windDirection: firstHour?.windDirection,
      windGusts: firstHour?.windGusts,
      cloudCover: firstHour?.cloudCover,
      rainProbability: firstHour?.rainProbability,
      precipitation: firstHour?.precipitation,
      uvIndex: firstHour?.uvIndex,
      weatherCode: firstHour?.weatherCode,
      isDay: firstHour?.isDay
    }, firstHour, firstDay);
  }

  function hydrateCurrentFromSeries(current, hourly, daily) {
    const firstHour = Array.isArray(hourly) ? (hourly[0] || null) : null;
    const firstDay = Array.isArray(daily) ? (daily[0] || null) : null;
    const firstDayDetail = firstDay?.detail || null;

    if (!current && !firstHour && !firstDay && !firstDayDetail) {
      return null;
    }

    const dailyFallback = firstDay
      ? {
          dateKey: firstDay.dateKey || extractDateKey(firstDayDetail?.time || firstDay?.time),
          minTemp: valueOr(firstDay.minTemp, firstDayDetail?.temperature),
          maxTemp: valueOr(firstDay.maxTemp, firstDayDetail?.temperature),
          feelsLikeMin: valueOr(firstDayDetail?.feelsLike, firstDay.minTemp),
          feelsLikeMax: valueOr(firstDayDetail?.feelsLike, firstDay.maxTemp),
          humidityMean: valueOr(firstDay.humidityMean, firstDayDetail?.humidity),
          pressure: valueOr(firstDayDetail?.pressure, firstDay.pressure),
          visibilityKm: valueOr(firstDayDetail?.visibilityKm, firstDay.visibilityKm),
          windSpeed: valueOr(firstDayDetail?.windSpeed, firstDay.windSpeed),
          windDirection: valueOr(firstDayDetail?.windDirection, firstDay.windDirection),
          windGusts: valueOr(firstDayDetail?.windGusts, firstDay.windGusts),
          cloudCover: valueOr(firstDayDetail?.cloudCover, firstDay.cloudCover),
          rainProbability: valueOr(firstDay.rainProbability, firstDayDetail?.rainProbability),
          precipitation: valueOr(firstDayDetail?.precipitation, firstDay.precipitation),
          uvIndexMax: valueOr(firstDayDetail?.uvIndex, firstDay.uvIndexMax),
          weatherCode: valueOr(firstDayDetail?.weatherCode, firstDay.weatherCode),
          sunrise: valueOr(firstDayDetail?.sunrise, firstDay.sunrise, null),
          sunset: valueOr(firstDayDetail?.sunset, firstDay.sunset, null)
        }
      : null;

    const hydrated = fillMissingSnapshotMetrics({
      time: current?.time || firstHour?.time || firstDayDetail?.time || firstDay?.time || new Date().toISOString(),
      dateKey: current?.dateKey || firstHour?.dateKey || firstDay?.dateKey,
      temperature: current?.temperature,
      feelsLike: current?.feelsLike,
      humidity: current?.humidity,
      pressure: current?.pressure,
      visibilityKm: current?.visibilityKm,
      windSpeed: current?.windSpeed,
      windDirection: current?.windDirection,
      windGusts: current?.windGusts,
      cloudCover: current?.cloudCover,
      rainProbability: current?.rainProbability,
      precipitation: current?.precipitation,
      uvIndex: current?.uvIndex,
      weatherCode: current?.weatherCode,
      isDay: current?.isDay
    }, firstHour, dailyFallback);

    if (!hydrated) return null;

    const presentation = getWeatherPresentation(hydrated.weatherCode, hydrated.isDay);
    return {
      ...hydrated,
      icon: current?.icon || firstHour?.icon || firstDay?.icon || presentation.icon,
      description: normalizeLabelSpacing(
        current?.description
        || firstHour?.description
        || firstDay?.description
        || firstDayDetail?.weatherLabel
        || presentation.label
      ),
      confidence: valueOr(current?.confidence, firstHour?.confidence, firstDay?.confidence, 0)
    };
  }

  function fillMissingSnapshotMetrics(snapshot, hourlyFallback = null, dailyFallback = null) {
    if (!snapshot) return null;

    const time = normalizeTimeValue(snapshot.time) || normalizeTimeValue(hourlyFallback?.time) || `${dailyFallback?.dateKey || extractDateKey(new Date().toISOString())}T12:00`;
    const completed = {
      time,
      dateKey: snapshot.dateKey || extractDateKey(time),
      temperature: sanitizeMetricValue('temperature', valueOr(snapshot.temperature, hourlyFallback?.temperature, meanOfValues([dailyFallback?.minTemp, dailyFallback?.maxTemp]))),
      feelsLike: sanitizeMetricValue('feelsLike', valueOr(snapshot.feelsLike, hourlyFallback?.feelsLike, meanOfValues([dailyFallback?.feelsLikeMin, dailyFallback?.feelsLikeMax]), meanOfValues([dailyFallback?.minTemp, dailyFallback?.maxTemp]))),
      humidity: sanitizeMetricValue('humidity', valueOr(snapshot.humidity, hourlyFallback?.humidity, dailyFallback?.humidityMean)),
      pressure: sanitizeMetricValue('pressure', valueOr(snapshot.pressure, hourlyFallback?.pressure, dailyFallback?.pressure)),
      visibilityKm: sanitizeMetricValue('visibilityKm', valueOr(snapshot.visibilityKm, hourlyFallback?.visibilityKm, dailyFallback?.visibilityKm)),
      windSpeed: sanitizeMetricValue('windSpeed', valueOr(snapshot.windSpeed, hourlyFallback?.windSpeed, dailyFallback?.windSpeed)),
      windDirection: sanitizeMetricValue('windDirection', valueOr(snapshot.windDirection, hourlyFallback?.windDirection, dailyFallback?.windDirection)),
      windGusts: sanitizeMetricValue('windGusts', valueOr(snapshot.windGusts, hourlyFallback?.windGusts, dailyFallback?.windGusts, snapshot.windSpeed, hourlyFallback?.windSpeed, dailyFallback?.windSpeed)),
      cloudCover: sanitizeMetricValue('cloudCover', valueOr(snapshot.cloudCover, hourlyFallback?.cloudCover, dailyFallback?.cloudCover)),
      rainProbability: sanitizeMetricValue('rainProbability', valueOr(snapshot.rainProbability, hourlyFallback?.rainProbability, dailyFallback?.rainProbability, 0)),
      precipitation: sanitizeMetricValue('precipitation', valueOr(snapshot.precipitation, hourlyFallback?.precipitation, dailyFallback?.precipitation, 0)),
      uvIndex: sanitizeMetricValue('uvIndex', valueOr(snapshot.uvIndex, hourlyFallback?.uvIndex, dailyFallback?.uvIndexMax, 0)),
      weatherCode: valueOr(sanitizeWeatherCode(snapshot.weatherCode), sanitizeWeatherCode(hourlyFallback?.weatherCode), sanitizeWeatherCode(dailyFallback?.weatherCode), 2),
      isDay: snapshot.isDay == null ? (hourlyFallback?.isDay == null ? isDaytimeFromHour(time) : Boolean(hourlyFallback.isDay)) : Boolean(snapshot.isDay)
    };

    completed.visibilityKm = valueOr(completed.visibilityKm, estimateVisibilityKm(completed.cloudCover, completed.precipitation), 10);
    completed.windGusts = valueOr(completed.windGusts, completed.windSpeed);
    completed.rainProbability = valueOr(completed.rainProbability, 0);

    return completed;
  }

  function dedupeSeries(entries, keySelector) {
    const selected = new Map();

    entries.forEach((entry) => {
      const key = keySelector(entry);
      if (!key) return;
      const current = selected.get(key);
      if (!current || getSnapshotCompleteness(entry) >= getSnapshotCompleteness(current)) {
        selected.set(key, entry);
      }
    });

    return Array.from(selected.values()).sort((a, b) => String(keySelector(a)).localeCompare(String(keySelector(b))));
  }

  function groupHourlySeriesByDate(hourly) {
    return hourly.reduce((map, entry) => {
      if (!entry?.dateKey) return map;
      if (!map.has(entry.dateKey)) {
        map.set(entry.dateKey, []);
      }
      map.get(entry.dateKey).push(entry);
      return map;
    }, new Map());
  }

  function getSnapshotCompleteness(entry) {
    return Object.entries(entry || {}).reduce((score, [key, value]) => {
      if (key === 'time' || key === 'dateKey' || key === 'sunrise' || key === 'sunset') {
        return score + (value ? 1 : 0);
      }
      if (key === 'isDay') {
        return score + 1;
      }
      return score + (Number.isFinite(value) ? 1 : 0);
    }, 0);
  }

  function sanitizeMetricValue(field, value) {
    const numeric = toFiniteNumber(value);
    if (!Number.isFinite(numeric)) return null;

    const limits = METRIC_LIMITS[field];
    if (!limits) return numeric;

    if (limits.circular) {
      const normalized = ((numeric % 360) + 360) % 360;
      return roundTo(normalized, limits.digits || 0);
    }

    if (numeric < limits.min || numeric > limits.max) {
      return null;
    }

    return roundTo(numeric, limits.digits || 0);
  }

  function sanitizeWeatherCode(value) {
    const numeric = toFiniteNumber(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(numeric);
  }

  function normalizeTimeValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : raw;
  }

  function isMeaningfulSnapshot(snapshot) {
    if (!snapshot) return false;
    const signalFields = ['temperature', 'feelsLike', 'humidity', 'pressure', 'windSpeed', 'windGusts', 'cloudCover', 'rainProbability', 'precipitation', 'visibilityKm', 'uvIndex'];
    return signalFields.some((field) => Number.isFinite(snapshot[field])) || Number.isFinite(snapshot.weatherCode);
  }

  function isMeaningfulDailySnapshot(snapshot) {
    if (!snapshot) return false;
    const signalFields = ['maxTemp', 'minTemp', 'humidityMean', 'pressure', 'windSpeed', 'windGusts', 'cloudCover', 'rainProbability', 'precipitation', 'visibilityKm', 'uvIndexMax'];
    return signalFields.some((field) => Number.isFinite(snapshot[field])) || Number.isFinite(snapshot.weatherCode);
  }

  function reviveCachedProviderRun(provider, cachedValue, cachedAge, startedAt, lastError) {
    const reason = lastError ? friendlyProviderError(lastError, provider) : 'Ultimo dado valido preservado no cache resiliente.';
    const restored = {
      providerKey: provider.providerKey,
      label: provider.label,
      reliability: provider.reliability,
      type: provider.type,
      hidden: provider.visible === false,
      success: true,
      status: 'partial',
      message: `${provider.label}: fallback automático usando cache válido (${formatDurationShort(cachedAge)}). ${reason}`,
      fetchedAt: cachedValue?.fetchedAt || new Date(Date.now() - cachedAge).toISOString(),
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      weight: Number.isFinite(cachedValue?.weight) ? cachedValue.weight : 0,
      stationSelection: normalizeStationSelection(cachedValue?.stationSelection),
      current: cachedValue?.current || null,
      hourly: Array.isArray(cachedValue?.hourly) ? cachedValue.hourly : [],
      daily: Array.isArray(cachedValue?.daily) ? cachedValue.daily : []
    };

    restored.dailyMap = new Map(restored.daily.map((entry) => [entry.dateKey, entry]));
    restored.weight = restored.weight || computeProviderWeight(restored);

    return restored;
  }

  function createProviderFailureRun(provider, error, startedAt) {
    return {
      providerKey: provider.providerKey,
      label: provider.label,
      reliability: provider.reliability,
      type: provider.type,
      hidden: provider.visible === false,
      success: false,
      status: 'offline-controlled',
      message: friendlyProviderError(error || new Error('Fonte indisponível.'), provider),
      fetchedAt: null,
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      weight: 0,
      current: null,
      hourly: [],
      daily: [],
      dailyMap: new Map()
    };
  }

  function isValidProviderRun(run) {
    return Boolean(run?.success && hasUsableProviderSignal(run));
  }

  function hasUsableProviderSignal(run) {
    if (!run?.current || typeof run.current !== 'object') return false;
    const signalFields = ['temperature', 'humidity', 'pressure', 'windSpeed', 'visibilityKm', 'rainProbability', 'cloudCover'];
    return signalFields.some((field) => Number.isFinite(run.current?.[field]))
      || (Array.isArray(run.hourly) && run.hourly.length > 0)
      || (Array.isArray(run.daily) && run.daily.length > 0);
  }

  function getActiveProviderCount(providerRuns) {
    return (Array.isArray(providerRuns) ? providerRuns : [])
      .filter((run) => isValidProviderRun(run) && Number.isFinite(run.weight) && run.weight > 0)
      .length;
  }

  function isUsableWeatherBundle(bundle) {
    if (!bundle?.current) return false;

    const requiredCurrentSignals = ['temperature', 'humidity', 'pressure', 'windSpeed', 'visibilityKm'];
    const currentCoverage = requiredCurrentSignals.filter((field) => Number.isFinite(bundle.current?.[field])).length;

    return currentCoverage >= 3
      && Array.isArray(bundle.hourly)
      && bundle.hourly.length >= 6
      && Array.isArray(bundle.daily)
      && bundle.daily.length >= 3;
  }

  function resolveRobustWeightedMetric(field, entries) {
    const limits = METRIC_LIMITS[field];
    const rule = ROBUST_METRIC_RULES[field];
    let valid = entries
      .map((entry) => ({
        value: sanitizeMetricValue(field, entry?.value),
        weight: Number.isFinite(entry?.weight) && entry.weight > 0 ? entry.weight : 0
      }))
      .filter((entry) => Number.isFinite(entry.value) && entry.weight > 0);

    if (!valid.length) return null;

    if ((field === 'windSpeed' || field === 'windGusts') && valid.length >= 3) {
      const nonZeroSamples = valid.filter((entry) => entry.value > 0.8);
      if (nonZeroSamples.length >= 2) {
        valid = nonZeroSamples;
      }
    }

    if (!rule || valid.length < rule.minSampleCount) {
      const baseline = weightedAverage(valid);
      return Number.isFinite(baseline) ? roundTo(clamp(baseline, limits.min, limits.max), limits.digits || 0) : null;
    }

    const sortedValues = valid.map((entry) => entry.value).sort((a, b) => a - b);
    const median = sortedValues[Math.floor(sortedValues.length / 2)];
    let survivors = valid.filter((entry) => Math.abs(entry.value - median) <= rule.outlierDelta);

    if (!survivors.length) {
      survivors = [...valid]
        .sort((a, b) => Math.abs(a.value - median) - Math.abs(b.value - median))
        .slice(0, Math.max(2, Math.ceil(valid.length / 2)));
    }

    const resolved = weightedAverage(survivors);
    return Number.isFinite(resolved) ? roundTo(clamp(resolved, limits.min, limits.max), limits.digits || 0) : null;
  }

  function stripTransientProviderFields(run) {
    return {
      providerKey: run.providerKey,
      label: run.label,
      reliability: run.reliability,
      type: run.type,
      hidden: Boolean(run.hidden),
      success: run.success,
      status: run.status,
      message: run.message,
      fetchedAt: run.fetchedAt,
      latencyMs: run.latencyMs,
      weight: run.weight,
      stationSelection: normalizeStationSelection(run.stationSelection),
      current: run.current,
      hourly: run.hourly,
      daily: run.daily
    };
  }

  function computeProviderWeight(run) {
    if (!run?.success || !hasUsableProviderSignal(run)) {
      return 0;
    }

    const baseWeight = valueOr(PROVIDER_BASE_WEIGHTS[run.providerKey], 0.3);
    const coverageFields = [
      'temperature',
      'feelsLike',
      'humidity',
      'pressure',
      'windSpeed',
      'windDirection',
      'windGusts',
      'precipitation',
      'rainProbability',
      'cloudCover',
      'visibilityKm',
      'uvIndex'
    ];

    const coverageScore = coverageFields.filter((field) => Number.isFinite(run.current?.[field])).length / coverageFields.length;
    const hourlyCoverage = Math.min(1, (run.hourly?.length || 0) / 48);
    const dailyCoverage = Math.min(1, (run.daily?.length || 0) / 7);
    const horizonScore = clamp(hourlyCoverage * 0.42 + dailyCoverage * 0.58, 0, 1);
    const ageMinutes = Math.abs(Date.now() - new Date(run.current?.time || run.fetchedAt || Date.now()).getTime()) / 60000;
    const recencyFactor = clamp(1.02 - ageMinutes / 480, 0.72, 1.02);
    const latencyFactor = Number.isFinite(run.latencyMs)
      ? clamp(1 - (run.latencyMs / CORE_PROVIDER_TIMEOUT_MS) * 0.12, 0.74, 1)
      : 0.9;
    const coverageFactor = clamp(0.72 + coverageScore * 0.18 + horizonScore * 0.1, 0.72, 1.02);
    const partialFactor = run.status === 'partial' ? 0.78 : 1;
    const fallbackMultiplier = clamp(valueOr(run.weightMultiplier, 1), 0, 1);
    const stationDistanceFactor = clamp(valueOr(run.stationSelection?.distanceWeight, 1), 0.4, 1);
    const stationModeFactor = run.stationSelection?.method === 'blend'
      ? 0.94
      : run.stationSelection?.method === 'global-model' || run.stationSelection?.method === 'fallback-point'
        ? 0.7
        : 1;
    const stationPriorityFactor = run.stationSelection?.priority === 'official'
      ? 1.08
      : run.stationSelection?.priority === 'airport'
        ? 1.03
        : 1;

    const resolvedWeight = baseWeight
      * recencyFactor
      * latencyFactor
      * coverageFactor
      * partialFactor
      * fallbackMultiplier
      * stationDistanceFactor
      * stationModeFactor
      * stationPriorityFactor;
    return roundTo(Math.max(run.stationSelection ? 0.18 : 0.3, resolvedWeight), 3);
  }

  function buildModelAgreement(successfulRuns, defaultConfidence) {
    const comparisonRuns = dedupeFallbackRuns(successfulRuns).filter((run) => (
      isDisplayableLiveProvider(run)
      && MULTI_MODEL_PROVIDER_KEYS.includes(run.providerKey)
      && (run.weight || 0) > 0
      && ((run.hourly?.length || 0) > 0 || (run.daily?.length || 0) > 0)
    ));

    if (comparisonRuns.length < 2) {
      return {
        available: false,
        score: defaultConfidence,
        averageTempSpread: null,
        averageWindSpread: null,
        averageRainSpread: null,
        divergenceLevel: 'medio',
        consensusLevel: getConfidenceLabel(defaultConfidence),
        activeModelCount: comparisonRuns.length,
        comparedModelKeys: comparisonRuns.map((run) => run.providerKey),
        ignoredModelCount: 0,
        ignoredModelLabels: [],
        byHour: new Map(),
        byDay: new Map()
      };
    }

    const canonicalTimes = collectCanonicalHours(comparisonRuns).slice(0, 48);
    const byHour = new Map();
    const hourComparisons = [];

    canonicalTimes.forEach((time) => {
      const hourKey = normalizeHourKey(time);
      const samples = comparisonRuns
        .map((run) => ({
          label: run.label,
          weight: run.weight,
          snapshot: findClosestHourlyEntry(run.hourly, time, 90)
        }))
        .filter((item) => item.snapshot);

      if (samples.length < 2) return;

      const comparison = summarizeModelSpread(samples.map((item) => ({
        label: item.label,
        weight: item.weight,
        temperature: item.snapshot.temperature,
        windSpeed: item.snapshot.windSpeed,
        rainProbability: item.snapshot.rainProbability
      })), defaultConfidence);

      byHour.set(hourKey, comparison);
      hourComparisons.push(comparison);
    });

    const dailyKeys = collectCanonicalDays(comparisonRuns).slice(0, 14);
    const byDay = new Map();
    const dayComparisons = [];

    dailyKeys.forEach((dateKey) => {
      const samples = comparisonRuns
        .map((run) => ({
          label: run.label,
          weight: run.weight,
          snapshot: getProviderDailySnapshot(run, dateKey)
        }))
        .filter((item) => item.snapshot);

      if (samples.length < 2) return;

      const comparison = summarizeModelSpread(samples.map((item) => ({
        label: item.label,
        weight: item.weight,
        temperature: valueOr(item.snapshot.maxTemp, item.snapshot.temperature),
        windSpeed: item.snapshot.windSpeed,
        rainProbability: item.snapshot.rainProbability
      })), defaultConfidence);

      byDay.set(dateKey, comparison);
      dayComparisons.push(comparison);
    });

    const aggregateSamples = [...hourComparisons, ...dayComparisons];
    const aggregateScore = Math.round(meanOfValues(aggregateSamples.map((entry) => entry.confidence)) || defaultConfidence);
    const ignoredModelLabels = [...new Set(aggregateSamples.flatMap((entry) => entry.ignoredModelLabels || []))];

    return {
      available: hourComparisons.length > 0 || dayComparisons.length > 0,
      score: aggregateScore,
      averageTempSpread: meanOfValues(aggregateSamples.map((entry) => entry.tempSpread)),
      averageWindSpread: meanOfValues(aggregateSamples.map((entry) => entry.windSpread)),
      averageRainSpread: meanOfValues(aggregateSamples.map((entry) => entry.rainSpread)),
      divergenceLevel: mergeDivergenceLevels(aggregateSamples.map((entry) => entry.divergenceLevel)),
      consensusLevel: getConfidenceLabel(aggregateScore),
      activeModelCount: comparisonRuns.length,
      comparedModelKeys: comparisonRuns.map((run) => run.providerKey),
      ignoredModelCount: ignoredModelLabels.length,
      ignoredModelLabels,
      byHour,
      byDay
    };
  }

  function summarizeModelSpread(samples, defaultConfidence) {
    const comparable = (Array.isArray(samples) ? samples : [])
      .map((sample) => ({
        label: sample.label,
        weight: Number.isFinite(sample.weight) && sample.weight > 0 ? sample.weight : 0,
        temperature: sanitizeMetricValue('temperature', sample.temperature),
        windSpeed: sanitizeMetricValue('windSpeed', sample.windSpeed),
        rainProbability: sanitizeMetricValue('rainProbability', sample.rainProbability)
      }))
      .filter((sample) => sample.weight > 0);

    const filtered = filterModelOutliers(comparable);
    const stableSamples = filtered.samples.length >= 2 ? filtered.samples : comparable;
    const tempSpread = calculateSpread(stableSamples.map((sample) => sample.temperature));
    const windSpread = calculateSpread(stableSamples.map((sample) => sample.windSpeed));
    const rainSpread = calculateSpread(stableSamples.map((sample) => sample.rainProbability));
    const divergenceLevel = mergeDivergenceLevels([
      getMetricDivergenceLevel('temperature', tempSpread),
      getMetricDivergenceLevel('windSpeed', windSpread),
      getMetricDivergenceLevel('rainProbability', rainSpread)
    ]);
    const tempExcess = Math.max(0, valueOr(tempSpread, 0) - MODEL_DIVERGENCE_THRESHOLDS.temperature.medium);
    const windExcess = Math.max(0, valueOr(windSpread, 0) - MODEL_DIVERGENCE_THRESHOLDS.windSpeed.medium);
    const rainExcess = Math.max(0, valueOr(rainSpread, 0) - MODEL_DIVERGENCE_THRESHOLDS.rainProbability.medium);
    const lowDivergenceBonus = divergenceLevel === 'baixo' && stableSamples.length >= 3 ? 3 : 0;
    const outlierPenalty = filtered.ignored.length ? 1.5 : 0;
    const confidence = clamp(Math.round(
      (stableSamples.length >= 3 ? 95 : 90)
      + lowDivergenceBonus
      - tempExcess * 1.6
      - windExcess * 0.55
      - rainExcess * 0.08
      - Math.max(0, 3 - stableSamples.length) * 3
      - outlierPenalty
    ), 58, 98);

    return {
      tempSpread,
      windSpread,
      rainSpread,
      confidence: Number.isFinite(confidence) ? confidence : defaultConfidence,
      divergenceLevel,
      consensusLabel: getConfidenceLabel(confidence),
      sampleCount: stableSamples.length,
      rawSampleCount: comparable.length,
      ignoredModelCount: filtered.ignored.length,
      ignoredModelLabels: filtered.ignored.map((sample) => sample.label).filter(Boolean)
    };
  }

  function filterModelOutliers(samples) {
    const list = (Array.isArray(samples) ? samples : []).filter((sample) => sample && sample.weight > 0);
    if (list.length < 3) {
      return { samples: list, ignored: [] };
    }

    const ignored = new Set();
    [
      { key: 'temperature', threshold: MODEL_DIVERGENCE_THRESHOLDS.temperature.high },
      { key: 'windSpeed', threshold: MODEL_DIVERGENCE_THRESHOLDS.windSpeed.high },
      { key: 'rainProbability', threshold: MODEL_DIVERGENCE_THRESHOLDS.rainProbability.high }
    ].forEach(({ key, threshold }) => {
      const values = list
        .map((sample) => sample[key])
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
      if (values.length < 3) return;
      const median = values[Math.floor(values.length / 2)];
      list.forEach((sample) => {
        if (Number.isFinite(sample[key]) && Math.abs(sample[key] - median) > threshold) {
          ignored.add(sample);
        }
      });
    });

    const samplesKept = list.filter((sample) => !ignored.has(sample));
    if (samplesKept.length < 2) {
      return { samples: list, ignored: [] };
    }

    return {
      samples: samplesKept,
      ignored: [...ignored]
    };
  }

  function calculateSpread(values) {
    const valid = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
    if (valid.length < 2) return 0;
    return roundTo(maxOfValues(valid) - minOfValues(valid), 1);
  }

  function getMetricDivergenceLevel(metricKey, spread) {
    const thresholds = MODEL_DIVERGENCE_THRESHOLDS[metricKey];
    if (!thresholds || !Number.isFinite(spread)) return 'baixo';
    if (spread > thresholds.high) return 'alto';
    if (spread > thresholds.medium) return 'medio';
    return 'baixo';
  }

  function mergeDivergenceLevels(levels) {
    const list = Array.isArray(levels) ? levels : [];
    if (list.includes('alto')) return 'alto';
    if (list.includes('medio')) return 'medio';
    return 'baixo';
  }

  function normalizeProviderAliasToKey(value) {
    const normalized = stripAccents(String(value || '')).toLowerCase();
    if (!normalized) return '';
    if (normalized.includes('demo')) return 'demoWeather';
    if (normalized.includes('open-meteo') || normalized.includes('open meteo')) return 'openMeteo';
    if (normalized.includes('regional brasil')) return 'regionalBrasil';
    if (normalized.includes('weatherapi')) return 'weatherApi';
    if (normalized.includes('meteostat')) return 'meteostat';
    if (normalized.includes('ecmwf')) return 'ecmwf';
    if (normalized.includes('gfs')) return 'gfs';
    if (normalized.includes('icon')) return 'icon';
    if (normalized.includes('inmet')) return 'inmet';
    return '';
  }

  function dedupeFallbackRuns(runs) {
    const list = Array.isArray(runs) ? runs : [];
    const activeKeys = new Set(list.map((run) => run.providerKey));
    return list.filter((run) => {
      const fallbackKey = normalizeProviderAliasToKey(run.fallbackSource);
      return !fallbackKey || fallbackKey === run.providerKey || !activeKeys.has(fallbackKey);
    });
  }

  function buildSourceConsensus(successfulRuns) {
    const consensusRuns = dedupeFallbackRuns(successfulRuns).filter((run) => (
      isDisplayableLiveProvider(run)
      && run.type !== 'demo'
      && run.type !== 'cache'
      && run.providerKey !== 'demoWeather'
      && run.providerKey !== 'savedCache'
    ));
    const comparableMetrics = {
      temperature: {
        label: 'temperatura',
        unit: '°C',
        safeSpread: 3,
        warningSpread: 7,
        scoreFactor: 1.4,
        resolver: (run) => valueOr(run.current?.temperature, meanOfValues([run.daily?.[0]?.minTemp, run.daily?.[0]?.maxTemp]))
      },
      windSpeed: {
        label: 'vento',
        unit: 'km/h',
        safeSpread: 8,
        warningSpread: 18,
        scoreFactor: 0.45,
        resolver: (run) => valueOr(run.current?.windSpeed, run.daily?.[0]?.windSpeed)
      },
      windGusts: {
        label: 'rajadas',
        unit: 'km/h',
        safeSpread: 12,
        warningSpread: 24,
        scoreFactor: 0.35,
        resolver: (run) => valueOr(run.current?.windGusts, run.daily?.[0]?.windGusts)
      },
      rainProbability: {
        label: 'chuva',
        unit: '%',
        safeSpread: 28,
        warningSpread: 58,
        scoreFactor: 0.08,
        resolver: (run) => valueOr(run.current?.rainProbability, run.daily?.[0]?.rainProbability)
      },
      precipitation: {
        label: 'chuva acumulada',
        unit: 'mm',
        safeSpread: 2,
        warningSpread: 8,
        scoreFactor: 0.7,
        resolver: (run) => valueOr(run.current?.precipitation, run.daily?.[0]?.precipitation)
      },
      humidity: {
        label: 'umidade',
        unit: '%',
        safeSpread: 15,
        warningSpread: 30,
        scoreFactor: 0.1,
        resolver: (run) => valueOr(run.current?.humidity, run.daily?.[0]?.humidityMean)
      },
      pressure: {
        label: 'pressão',
        unit: 'hPa',
        safeSpread: 5,
        warningSpread: 11,
        scoreFactor: 0.35,
        resolver: (run) => valueOr(run.current?.pressure, run.daily?.[0]?.pressure)
      },
      visibilityKm: {
        label: 'visibilidade',
        unit: 'km',
        safeSpread: 5,
        warningSpread: 12,
        scoreFactor: 0.9,
        resolver: (run) => valueOr(run.current?.visibilityKm, run.daily?.[0]?.visibilityKm)
      }
    };

    const metrics = {};
    let score = 100;
    const ignoredSourceLabels = new Set();

    Object.entries(comparableMetrics).forEach(([key, definition]) => {
      const rawSamples = consensusRuns
        .map((run) => ({
          label: run.label,
          weight: run.weight,
          value: definition.resolver(run)
        }))
        .filter((sample) => Number.isFinite(sample.value));

      const filtered = filterConsensusOutliers(rawSamples, definition);
      filtered.ignored.forEach((sample) => ignoredSourceLabels.add(sample.label));
      const samples = filtered.samples;

      if (samples.length < 2) return;

      const values = samples.map((sample) => sample.value);
      const spread = maxOfValues(values) - minOfValues(values);
      const mean = weightedAverage(samples.map((sample) => ({
        value: sample.value,
        weight: Number.isFinite(sample.weight) && sample.weight > 0 ? sample.weight : 1
      }))) || meanOfValues(values);
      const lightRain = (key === 'rainProbability' && mean <= 38) || (key === 'precipitation' && mean <= 2.5);
      const safeSpread = lightRain ? definition.safeSpread * 1.5 : definition.safeSpread;
      const warningSpread = lightRain ? definition.warningSpread * 1.45 : definition.warningSpread;
      const status = spread > warningSpread ? 'warning' : spread > safeSpread ? 'watch' : 'safe';

      metrics[key] = {
        label: definition.label,
        unit: definition.unit,
        spread: roundTo(spread, key === 'rainProbability' || key === 'humidity' || key === 'pressure' ? 0 : 1),
        mean: roundTo(mean, key === 'rainProbability' || key === 'humidity' || key === 'pressure' ? 0 : 1),
        min: roundTo(minOfValues(values), key === 'rainProbability' || key === 'humidity' || key === 'pressure' ? 0 : 1),
        max: roundTo(maxOfValues(values), key === 'rainProbability' || key === 'humidity' || key === 'pressure' ? 0 : 1),
        sampleCount: samples.length,
        status,
        samples
      };

      score -= Math.min(status === 'warning' ? 18 : 5, spread * definition.scoreFactor);
    });

    score -= Math.max(0, 3 - consensusRuns.length) * 6;
    if (ignoredSourceLabels.size) {
      score -= 1.5;
    }
    score = clamp(Math.round(score), 44, 98);

    if (!Object.keys(metrics).length) {
      return {
        available: false,
        score: clamp(Math.round(60 + consensusRuns.length * 4), 48, 82),
        overallStatus: 'warning',
        summary: 'Consenso limitado entre fontes',
        shortLabel: 'Base parcial',
        leadMessage: 'Ainda ha poucas fontes comparaveis para medir concordancia com seguranca.',
        windConflict: false,
        rainConflict: false,
        thermalConflict: false,
        humidityConflict: false,
        ignoredSourceCount: ignoredSourceLabels.size,
        ignoredSourceLabels: [...ignoredSourceLabels],
        metrics
      };
    }

    const windConflict = valueOr(metrics.windSpeed?.spread, 0) > 18;
    const gustConflict = valueOr(metrics.windGusts?.spread, 0) > 24;
    const rainConflict = valueOr(metrics.rainProbability?.spread, 0) > 58 || valueOr(metrics.precipitation?.spread, 0) > 8;
    const thermalConflict = valueOr(metrics.temperature?.spread, 0) > 7;
    const humidityConflict = valueOr(metrics.humidity?.spread, 0) > 30;
    const pressureConflict = valueOr(metrics.pressure?.spread, 0) > 11;
    const visibilityConflict = valueOr(metrics.visibilityKm?.spread, 0) > 12;

    let overallStatus = 'safe';
    if (score < 66 || windConflict || gustConflict || rainConflict || visibilityConflict) {
      overallStatus = 'warning';
    }

    let leadMessage = 'Alta concordância entre fontes: condições mais consistentes para análise.';
    if (windConflict) {
      leadMessage = 'Vento instável entre fontes. Voe com cautela e preserve margem extra de retorno.';
    } else if (gustConflict) {
      leadMessage = 'Rajadas variam bastante entre fontes. Mantenha margem extra para pouso e retorno.';
    } else if (rainConflict) {
      leadMessage = 'Probabilidade de chuva varia bastante entre fontes. Reforce contingência e plano de pouso.';
    } else if (thermalConflict) {
      leadMessage = 'Temperatura varia entre fontes. Considere variação térmica maior no planejamento.';
    } else if (humidityConflict) {
      leadMessage = 'Umidade varia bastante entre fontes. Monitore condensação e eletrônica sensível.';
    }

    if (!windConflict && !gustConflict && !rainConflict && !thermalConflict && !humidityConflict && pressureConflict) {
      leadMessage = 'Pressao varia entre fontes. Monitore mudancas bruscas no curto prazo.';
    } else if (!windConflict && !gustConflict && !rainConflict && !thermalConflict && !humidityConflict && visibilityConflict) {
      leadMessage = 'Visibilidade varia entre fontes. Confirme condicao visual antes de voar.';
    }

    return {
      available: true,
      score,
      overallStatus,
      summary: overallStatus === 'safe'
        ? `Consenso alto entre ${consensusRuns.length} fontes`
        : `Consenso moderado entre ${consensusRuns.length} fontes`,
      shortLabel: overallStatus === 'safe' ? 'Alta concordancia' : 'Variacao moderada',
      leadMessage,
      windConflict,
      gustConflict,
      rainConflict,
      thermalConflict,
      humidityConflict,
      pressureConflict,
      visibilityConflict,
      ignoredSourceCount: ignoredSourceLabels.size,
      ignoredSourceLabels: [...ignoredSourceLabels],
      metrics
    };
  }

  function filterConsensusOutliers(samples, definition) {
    const list = (Array.isArray(samples) ? samples : []).filter((sample) => Number.isFinite(sample.value));
    if (list.length < 3) {
      return { samples: list, ignored: [] };
    }

    const sorted = list.map((sample) => sample.value).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const threshold = definition.warningSpread;
    const ignored = list.filter((sample) => Math.abs(sample.value - median) > threshold);
    const samplesKept = list.filter((sample) => !ignored.includes(sample));

    if (ignored.length !== 1 || samplesKept.length < 2) {
      return { samples: list, ignored: [] };
    }

    return {
      samples: samplesKept,
      ignored
    };
  }

  function getBrazilSourceCoverage(successfulRuns, sourceConsensus) {
    const activeRuns = dedupeFallbackRuns(successfulRuns)
      .filter((run) => BRAZIL_SOURCE_CONFIDENCE_BONUS[run.providerKey]);
    const bonus = clamp(
      activeRuns.reduce((total, run) => total + valueOr(BRAZIL_SOURCE_CONFIDENCE_BONUS[run.providerKey], 0), 0),
      0,
      8
    );
    const penalty = sourceConsensus?.available && activeRuns.length >= 2 && sourceConsensus.overallStatus === 'warning'
      ? (sourceConsensus.windConflict || sourceConsensus.rainConflict ? 4.5 : 2.5)
      : 0;

    return {
      activeCount: activeRuns.length,
      labels: activeRuns.map((run) => run.label),
      bonus,
      penalty
    };
  }

  function getConfidenceLabel(confidence) {
    if (confidence > 90) return 'Alta precisão';
    if (confidence >= 75) return 'Boa';
    if (confidence >= 60) return 'Media';
    return 'Baixa';
  }

  function computeConfidence(successfulRuns, modelAgreement, sourceConsensus, defaultConfidence) {
    const activeRuns = successfulRuns.filter((run) => isValidProviderRun(run) && (run.weight || 0) > 0);
    const realRuns = activeRuns.filter((run) => run.type !== 'demo' && run.type !== 'cache' && run.providerKey !== 'demoWeather' && run.providerKey !== 'savedCache');
    const activeCount = activeRuns.length;
    const realCount = realRuns.length;
    const meanLatency = meanOfValues(activeRuns.map((run) => run.latencyMs));

    const lowDivergence = Boolean(
      (modelAgreement?.available && modelAgreement.divergenceLevel === 'baixo')
      || (sourceConsensus?.available && sourceConsensus.overallStatus === 'safe')
    );
    const highLatency = Number.isFinite(meanLatency) && meanLatency > CORE_PROVIDER_TIMEOUT_MS * 0.75;

    let confidence = realCount >= 3
      ? (lowDivergence ? 96 : 88)
      : realCount === 2
        ? (lowDivergence ? 91 : 82)
        : realCount === 1
          ? 82
          : 45;

    if (lowDivergence) {
      confidence += 2;
    }
    if (highLatency) {
      confidence -= 5;
    }

    if (!realCount) {
      return clamp(defaultConfidence, 0, 45);
    }

    const cap = realCount >= 3 ? 98 : realCount === 2 ? 94 : 85;
    return clamp(Math.round(confidence), 45, cap);
  }

  function buildConfidenceNote(confidence, modelAgreement, sourceConsensus, providerCount) {
    if (!modelAgreement.available) {
      return `${providerCount} fontes ativas. O consenso entre fontes validas ganhou mais peso nesta atualizacao.`;
    }
    if (sourceConsensus?.available && sourceConsensus.overallStatus === 'warning') {
      return `Confiabilidade: ${confidence}% com variação perceptível entre fontes, apesar da fusão entre modelos e oficiais.`;
    }
    if (confidence >= 84) {
      return `Confiabilidade: ${confidence}% com alta concordância entre modelos e fontes oficiais brasileiras.`;
    }
    if (confidence >= 68) {
      return `Confiabilidade: ${confidence}% com variação moderada entre modelos e fontes auxiliares.`;
    }
    return `Confiabilidade: ${confidence}% com variação relevante no curto prazo.`;
  }

  function buildSpreadSummary(modelAgreement) {
    if (!modelAgreement.available) {
      return 'Comparacao entre fontes indisponivel';
    }
    return `ΔT ${formatNumber(modelAgreement.averageTempSpread, 1)}°C • ΔV ${formatNumber(modelAgreement.averageWindSpread, 1)} km/h • ΔC ${formatNumber(modelAgreement.averageRainSpread, 0)}%`;
  }

  function buildConfidenceNote(confidence, modelAgreement, sourceConsensus, providerCount) {
    if (!modelAgreement.available) {
      return `${providerCount} fontes ativas. O consenso do modo demo e das fontes sem chave ganhou mais peso nesta atualizacao.`;
    }
    if (sourceConsensus?.available && sourceConsensus.overallStatus === 'warning') {
      return `Confiabilidade: ${confidence}% com variacao perceptivel entre as fontes ativas, apesar da fusao ponderada.`;
    }
    if (confidence > 85) {
      return `Confiabilidade: ${confidence}% com alta concordancia entre modelos globais, observacao historica e reforco regional.`;
    }
    if (confidence >= 60) {
      return `Confiabilidade: ${confidence}% com variacao moderada entre modelos e fontes auxiliares.`;
    }
    return `Confiabilidade: ${confidence}% com variacao relevante no curto prazo.`;
  }

  function buildConfidenceNote(confidence, modelAgreement, sourceConsensus, providerCount) {
    if (!modelAgreement.available) {
      return `${providerCount} fontes ativas. O consenso do modo demo e das fontes sem chave ganhou mais peso nesta atualizacao.`;
    }
    if (sourceConsensus?.available && sourceConsensus.overallStatus === 'warning') {
      return `Confiabilidade: ${confidence}% com variacao perceptivel entre as fontes ativas, com filtro robusto de outliers e fallback regional em operacao.`;
    }
    if (confidence >= 85) {
      return `Confiabilidade: ${confidence}% com alta concordancia entre modelos globais, INMET, Meteostat e reforco regional brasileiro.`;
    }
    if (confidence >= 68) {
      return `Confiabilidade: ${confidence}% com variacao moderada entre modelos e fontes auxiliares, mantendo prioridade regional brasileira.`;
    }
    return `Confiabilidade: ${confidence}% com variacao relevante no curto prazo.`;
  }

  function formatIgnoredModelNotice(modelAgreement, sourceConsensus) {
    const labels = [
      ...(Array.isArray(modelAgreement?.ignoredModelLabels) ? modelAgreement.ignoredModelLabels : []),
      ...(Array.isArray(sourceConsensus?.ignoredSourceLabels) ? sourceConsensus.ignoredSourceLabels : [])
    ].filter(Boolean);
    const explicitCount = valueOr(modelAgreement?.ignoredModelCount, 0) + valueOr(sourceConsensus?.ignoredSourceCount, 0);
    const ignoredCount = labels.length ? new Set(labels).size : explicitCount;
    if (!ignoredCount) return '';
    return `${ignoredCount} ${ignoredCount === 1 ? 'modelo ignorado' : 'modelos ignorados'} por inconsistência`;
  }

  function buildConfidenceNote(confidence, modelAgreement, sourceConsensus, providerCount) {
    const ignoredNotice = formatIgnoredModelNotice(modelAgreement, sourceConsensus);
    const ignoredSuffix = ignoredNotice ? ` ${ignoredNotice}.` : '';
    const variationLevel = modelAgreement?.available ? modelAgreement.divergenceLevel : 'baixo';

    if (sourceConsensus?.available && sourceConsensus.overallStatus === 'warning') {
      if (ignoredNotice && variationLevel === 'baixo') {
        return `Confiabilidade: ${confidence}% com consenso entre modelos validos. ${ignoredNotice}.`;
      }
      return `Confiabilidade: ${confidence}% com variacao relevante entre fontes ativas. A fusao ponderada reduziu peso de leituras inconsistentes.${ignoredSuffix}`;
    }
    if (providerCount >= 3 && modelAgreement.available) {
      return variationLevel === 'baixo'
        ? `Confiabilidade: ${confidence}% com alta concordancia entre modelos validos.${ignoredSuffix}`
        : `Confiabilidade: ${confidence}% com variacao controlada entre modelos validos.${ignoredSuffix}`;
    }
    if (providerCount === 2 && modelAgreement.available) {
      return `Confiabilidade: ${confidence}% com duas fontes validas comparadas.${ignoredSuffix}`;
    }
    if (!modelAgreement.available) {
      return `Confiabilidade: ${confidence}% com uma fonte real validada e cache pronto para fallback.${ignoredSuffix}`;
    }
    return `Confiabilidade: ${confidence}% com fusao ponderada entre modelos validos.${ignoredSuffix}`;
  }

  function buildSpreadSummary(modelAgreement) {
    if (!modelAgreement.available) {
      return 'Comparacao entre fontes indisponivel';
    }
    const ignoredNotice = formatIgnoredModelNotice(modelAgreement, null);
    const variationText = modelAgreement.divergenceLevel === 'alto' ? 'Variacao alta' : 'Variacao moderada';
    const statusText = ignoredNotice || (modelAgreement.divergenceLevel === 'baixo'
      ? 'Consenso OK'
      : variationText);
    return `ΔT ${formatNumber(modelAgreement.averageTempSpread, 1)}°C • ΔV ${formatNumber(modelAgreement.averageWindSpread, 1)} km/h • ΔC ${formatNumber(modelAgreement.averageRainSpread, 0)}% • ${statusText}`;
  }

  function buildModelSpreadExplanation(modelAgreement, sourceConsensus) {
    if (!modelAgreement?.available) {
      return 'Comparacao entre fontes indisponivel para este ponto.';
    }
    const ignoredNotice = formatIgnoredModelNotice(modelAgreement, sourceConsensus);
    if (ignoredNotice) {
      return `${ignoredNotice}. Calculo principal usa fontes coerentes.`;
    }
    if (modelAgreement.divergenceLevel === 'baixo') {
      return sourceConsensus?.available
        ? `Variacao normal entre modelos nas proximas 24 horas. ${sourceConsensus.summary}.`
        : 'Variacao normal entre modelos nas proximas 24 horas.';
    }
    const level = modelAgreement.divergenceLevel === 'alto' ? 'alta' : 'moderada';
    return sourceConsensus?.available
      ? `Variacao ${level} entre fontes ativas nas proximas 24 horas. ${sourceConsensus.summary}.`
      : `Variacao ${level} entre fontes ativas nas proximas 24 horas.`;
  }

  function fuseCurrentMetrics(successfulRuns, modelAgreement, defaultConfidence) {
    const scalarFields = ['temperature', 'feelsLike', 'humidity', 'pressure', 'windSpeed', 'windGusts', 'precipitation', 'rainProbability', 'cloudCover', 'visibilityKm', 'uvIndex'];
    const current = {};

    scalarFields.forEach((field) => {
      current[field] = resolveRobustWeightedMetric(field, successfulRuns.map((run) => ({
        value: run.current?.[field],
        weight: run.weight
      })));
    });

    current.windDirection = weightedDirection(successfulRuns.map((run) => ({
      value: run.current?.windDirection,
      weight: run.weight * Math.max(1, valueOr(run.current?.windSpeed, 0))
    })));

    current.weatherCode = weightedMode(successfulRuns.map((run) => ({
      value: run.current?.weatherCode,
      weight: run.weight
    })));

    current.isDay = weightedMode(successfulRuns.map((run) => ({
      value: run.current?.isDay ? 1 : 0,
      weight: run.weight
    }))) === 1;

    current.time = successfulRuns
      .map((run) => run.current?.time)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || new Date().toISOString();

    current.visibilityKm = valueOr(current.visibilityKm, estimateVisibilityKm(current.cloudCover, current.precipitation), 10);
    current.rainProbability = valueOr(current.rainProbability, 0);
    current.uvIndex = valueOr(current.uvIndex, 0);

    const weatherPresentation = getWeatherPresentation(current.weatherCode, current.isDay);
    current.icon = weatherPresentation.icon;
    current.description = weatherPresentation.label;
    current.confidence = modelAgreement.available ? modelAgreement.score : defaultConfidence;

    return current;
  }

  function fuseHourlySeries(successfulRuns, modelAgreement, defaultConfidence) {
    return collectCanonicalHours(successfulRuns)
      .slice(0, 48)
      .map((time) => fuseHourlyEntry(time, successfulRuns, modelAgreement.byHour.get(normalizeHourKey(time)), defaultConfidence))
      .filter(Boolean);
  }

  function fuseHourlyEntry(time, successfulRuns, comparison, defaultConfidence) {
    const snapshots = successfulRuns
      .map((run) => ({
        run,
        snapshot: findClosestHourlyEntry(run.hourly, time, 90)
      }))
      .filter((item) => item.snapshot);

    if (!snapshots.length) return null;

    const scalarFields = ['temperature', 'feelsLike', 'humidity', 'pressure', 'visibilityKm', 'windSpeed', 'windGusts', 'cloudCover', 'rainProbability', 'precipitation', 'uvIndex'];
    const entry = {
      time,
      dateKey: extractDateKey(time)
    };

    scalarFields.forEach((field) => {
      entry[field] = resolveRobustWeightedMetric(field, snapshots.map((item) => ({
        value: item.snapshot[field],
        weight: item.run.weight
      })));
    });

    entry.windDirection = weightedDirection(snapshots.map((item) => ({
      value: item.snapshot.windDirection,
      weight: item.run.weight * Math.max(1, valueOr(item.snapshot.windSpeed, 0))
    })));
    entry.weatherCode = weightedMode(snapshots.map((item) => ({
      value: item.snapshot.weatherCode,
      weight: item.run.weight
    })));
    entry.confidence = comparison?.confidence || defaultConfidence;
    entry.spreadText = comparison
      ? `ΔT ${formatNumber(comparison.tempSpread, 1)}°C • ΔV ${formatNumber(comparison.windSpread, 1)} km/h`
      : 'Sem spread detalhado';
    entry.isDay = isDaytimeFromHour(time);
    entry.visibilityKm = valueOr(entry.visibilityKm, estimateVisibilityKm(entry.cloudCover, entry.precipitation), 10);
    const presentation = getWeatherPresentation(entry.weatherCode, entry.isDay);
    entry.icon = presentation.icon;
    entry.description = presentation.label;

    return entry;
  }

  function fuseDailySeries(successfulRuns, hourly, modelAgreement, defaultConfidence) {
    return collectCanonicalDays(successfulRuns)
      .slice(0, 14)
      .map((dateKey, index) => {
        const merged = fuseDailyEntry(dateKey, successfulRuns);
        if (!merged) return null;
        return buildDailyDisplayEntry(merged, hourly, index, modelAgreement.byDay.get(dateKey), defaultConfidence);
      })
      .filter(Boolean);
  }

  function fuseDailyEntry(dateKey, successfulRuns) {
    const snapshots = successfulRuns
      .map((run) => ({
        run,
        snapshot: getProviderDailySnapshot(run, dateKey)
      }))
      .filter((item) => item.snapshot);

    if (!snapshots.length) return null;

    const scalarFields = ['maxTemp', 'minTemp', 'feelsLikeMax', 'feelsLikeMin', 'humidityMean', 'pressure', 'visibilityKm', 'windSpeed', 'windGusts', 'cloudCover', 'rainProbability', 'precipitation', 'uvIndexMax'];
    const merged = {
      dateKey,
      time: `${dateKey}T14:00`
    };

    scalarFields.forEach((field) => {
      merged[field] = resolveRobustWeightedMetric(field, snapshots.map((item) => ({
        value: item.snapshot[field],
        weight: item.run.weight
      })));
    });

    merged.windDirection = weightedDirection(snapshots.map((item) => ({
      value: item.snapshot.windDirection,
      weight: item.run.weight * Math.max(1, valueOr(item.snapshot.windSpeed, 0))
    })));
    merged.weatherCode = weightedMode(snapshots.map((item) => ({
      value: item.snapshot.weatherCode,
      weight: item.run.weight
    })));
    merged.sunrise = firstDefinedValue(snapshots.map((item) => item.snapshot.sunrise));
    merged.sunset = firstDefinedValue(snapshots.map((item) => item.snapshot.sunset));

    return merged;
  }

  function buildDailyDisplayEntry(merged, hourly, index, comparison, defaultConfidence) {
    const dayHours = hourly.filter((entry) => entry.dateKey === merged.dateKey);
    const representative = selectRepresentativeHour(dayHours, index);
    const weatherCode = valueOr(merged.weatherCode, representative?.weatherCode, 0);
    const presentation = getWeatherPresentation(weatherCode, true);
    const detail = {
      time: representative?.time || merged.time,
      temperature: valueOr(representative?.temperature, merged.maxTemp, 0),
      feelsLike: valueOr(representative?.feelsLike, merged.feelsLikeMax, merged.maxTemp, 0),
      humidity: valueOr(representative?.humidity, merged.humidityMean, 0),
      pressure: valueOr(representative?.pressure, merged.pressure, 1013),
      visibilityKm: valueOr(representative?.visibilityKm, merged.visibilityKm, 10),
      windSpeed: valueOr(representative?.windSpeed, merged.windSpeed, 0),
      windGusts: valueOr(representative?.windGusts, merged.windGusts, merged.windSpeed, 0),
      windDirection: valueOr(representative?.windDirection, merged.windDirection, 0),
      cloudCover: valueOr(representative?.cloudCover, merged.cloudCover, 0),
      rainProbability: valueOr(representative?.rainProbability, merged.rainProbability, 0),
      precipitation: valueOr(representative?.precipitation, merged.precipitation, 0),
      weatherCode,
      weatherIcon: presentation.icon,
      weatherLabel: presentation.label,
      uvIndex: valueOr(representative?.uvIndex, merged.uvIndexMax, 0),
      confidence: comparison?.confidence || defaultConfidence,
      trend: buildTrendSummary(representative || merged, dayHours).label,
      spread: comparison
        ? `ΔT ${formatNumber(comparison.tempSpread, 1)}° • ΔV ${formatNumber(comparison.windSpread, 1)} km/h`
        : 'Sem spread detalhado',
      sunrise: merged.sunrise,
      sunset: merged.sunset
    };

    const baseMetrics = {
      weatherCode,
      rainProbability: valueOr(merged.rainProbability, detail.rainProbability, 0),
      windSpeed: valueOr(merged.windSpeed, detail.windSpeed, 0),
      windGusts: valueOr(merged.windGusts, detail.windGusts, 0),
      visibilityKm: valueOr(merged.visibilityKm, detail.visibilityKm, 10),
      cloudCover: valueOr(merged.cloudCover, detail.cloudCover, 0),
      confidence: detail.confidence
    };

    return {
      index,
      dateKey: merged.dateKey,
      label: formatDayLabel(merged.dateKey, index),
      shortDate: formatShortDate(merged.dateKey),
      icon: presentation.icon,
      description: presentation.label,
      minTemp: valueOr(merged.minTemp, detail.temperature, 0),
      maxTemp: valueOr(merged.maxTemp, detail.temperature, 0),
      humidityMean: Math.round(valueOr(merged.humidityMean, detail.humidity, 0)),
      rainProbability: Math.round(valueOr(merged.rainProbability, detail.rainProbability, 0)),
      windSpeed: valueOr(merged.windSpeed, detail.windSpeed, 0),
      confidence: detail.confidence,
      headline: getClimateHeadline({ ...baseMetrics, isDay: true }),
      messages: buildDailyMessages({ ...baseMetrics, detail }),
      detail
    };
  }

  function getProviderDailySnapshot(run, dateKey) {
    if (run.dailyMap?.has(dateKey)) {
      return run.dailyMap.get(dateKey);
    }

    const hours = run.hourly.filter((entry) => entry.dateKey === dateKey);
    if (!hours.length) return null;

    return aggregateHoursToDaily(dateKey, hours);
  }

  function aggregateHoursToDaily(dateKey, hours) {
    return {
      dateKey,
      time: `${dateKey}T14:00`,
      maxTemp: maxOfValues(hours.map((entry) => entry.temperature)),
      minTemp: minOfValues(hours.map((entry) => entry.temperature)),
      feelsLikeMax: maxOfValues(hours.map((entry) => entry.feelsLike)),
      feelsLikeMin: minOfValues(hours.map((entry) => entry.feelsLike)),
      humidityMean: meanOfValues(hours.map((entry) => entry.humidity)),
      pressure: meanOfValues(hours.map((entry) => entry.pressure)),
      visibilityKm: meanOfValues(hours.map((entry) => entry.visibilityKm)),
      windSpeed: maxOfValues(hours.map((entry) => entry.windSpeed)),
      windGusts: maxOfValues(hours.map((entry) => entry.windGusts)),
      windDirection: weightedDirection(hours.map((entry) => ({ value: entry.windDirection, weight: Math.max(1, valueOr(entry.windSpeed, 0)) }))),
      cloudCover: meanOfValues(hours.map((entry) => entry.cloudCover)),
      rainProbability: maxOfValues(hours.map((entry) => entry.rainProbability)),
      precipitation: sumOfValues(hours.map((entry) => entry.precipitation)),
      uvIndexMax: maxOfValues(hours.map((entry) => entry.uvIndex)),
      weatherCode: weightedMode(hours.map((entry) => ({ value: entry.weatherCode, weight: 1 }))),
      sunrise: null,
      sunset: null
    };
  }

  function buildTrendSummary(current, hourly) {
    const firstWindow = Array.isArray(hourly) ? hourly.slice(0, 6) : [];
    const secondWindow = Array.isArray(hourly) ? hourly.slice(6, 12) : [];

    const tempDelta = valueOr(meanOfValues(secondWindow.map((entry) => entry.temperature)), valueOr(current.temperature, 0))
      - valueOr(meanOfValues(firstWindow.map((entry) => entry.temperature)), valueOr(current.temperature, 0));
    const pressureDelta = valueOr(meanOfValues(secondWindow.map((entry) => entry.pressure)), valueOr(current.pressure, 1013))
      - valueOr(meanOfValues(firstWindow.map((entry) => entry.pressure)), valueOr(current.pressure, 1013));
    const windDelta = valueOr(meanOfValues(secondWindow.map((entry) => entry.windSpeed)), valueOr(current.windSpeed, 0))
      - valueOr(meanOfValues(firstWindow.map((entry) => entry.windSpeed)), valueOr(current.windSpeed, 0));
    const rainDelta = valueOr(maxOfValues(secondWindow.map((entry) => entry.rainProbability)), valueOr(current.rainProbability, 0))
      - valueOr(maxOfValues(firstWindow.map((entry) => entry.rainProbability)), valueOr(current.rainProbability, 0));

    if (pressureDelta <= -3 && rainDelta >= 18) {
      return {
        label: 'Instabilidade crescente',
        note: 'Pressão em queda e aumento de chuva nas próximas horas.',
        short: 'Instável'
      };
    }

    if (windDelta >= 8) {
      return {
        label: 'Vento em reforço',
        note: 'O vento tende a ganhar intensidade ao longo do curto prazo.',
        short: 'Vento'
      };
    }

    if (tempDelta >= 3) {
      return {
        label: 'Aquecimento gradual',
        note: 'Temperatura em elevação com manutenção das condições atuais.',
        short: 'Aquecendo'
      };
    }

    if (tempDelta <= -3) {
      return {
        label: 'Resfriamento rápido',
        note: 'Temperatura em queda perceptível nas próximas horas.',
        short: 'Resfriando'
      };
    }

    return {
      label: 'Padrão estável',
      note: 'Baixa variabilidade prevista no curto prazo.',
      short: 'Estável'
    };
  }

  function buildAlertStream(bundle) {
    const alerts = [];
    const next3Hours = bundle.hourly.slice(0, 3);
    const next6Hours = bundle.hourly.slice(0, 6);
    const current = bundle.current;
    const trend = bundle.analytics.trend;
    const sourceConsensus = bundle.analytics.sourceConsensus;

    if (next3Hours.some((entry) => [95, 96, 99].includes(entry.weatherCode) || (entry.rainProbability >= 75 && entry.precipitation >= 1.2))) {
      alerts.push({
        tone: 'danger',
        title: 'Alta probabilidade de tempestade',
        text: 'Alta probabilidade de tempestade nas próximas 3 horas. Considere adiar atividades externas e decolagens.',
        windowLabel: 'Próximas 3h'
      });
    }

    const maxGusts = maxOfValues(next6Hours.map((entry) => entry.windGusts));
    if (valueOr(maxGusts, 0) >= 45 || valueOr(current.windSpeed, 0) >= 32) {
      alerts.push({
        tone: 'danger',
        title: 'Vento acima do limite seguro',
        text: 'Vento acima do limite seguro para voo estável e operações sensíveis no curto prazo.',
        windowLabel: 'Próximas 6h'
      });
    } else if (valueOr(maxGusts, 0) >= 35 || valueOr(current.windSpeed, 0) >= 22) {
      alerts.push({
        tone: 'warning',
        title: 'Rajadas moderadas a fortes',
        text: 'Rajadas acima do ideal. Monitore hover, aproximação e margem de retorno.',
        windowLabel: 'Próximas 6h'
      });
    }

    if (trend.label === 'Instabilidade crescente') {
      alerts.push({
        tone: 'warning',
        title: 'Mudança brusca em formação',
        text: 'A análise identifica pressão em queda e aumento de chuva. Mudanças bruscas são prováveis.',
        windowLabel: 'Próximas 12h'
      });
    }

    if (bundle.analytics.confidence < 65) {
      alerts.push({
        tone: 'warning',
        title: 'Modelos com baixa concordancia',
        text: 'Os modelos estão com concordância limitada. Use margens maiores para planejamento crítico.',
        windowLabel: 'Confiabilidade'
      });
    }

    if (sourceConsensus?.available && sourceConsensus.overallStatus === 'warning') {
      alerts.push({
        tone: 'warning',
        title: 'Fontes com variacao relevante',
        text: sourceConsensus.leadMessage,
        windowLabel: 'Consenso'
      });
    }

    if (
      bundle.analytics.confidence >= 78 &&
      sourceConsensus?.overallStatus !== 'warning' &&
      valueOr(current.rainProbability, 0) < 25 &&
      valueOr(current.windSpeed, 0) < 18 &&
      valueOr(current.windGusts, 0) < 28
    ) {
      alerts.push({
        tone: 'safe',
        title: 'Condições ideais para voo',
        text: 'Condições ideais para voo no momento, com baixa variabilidade e boa concordância entre modelos e fontes oficiais.',
        windowLabel: 'Agora'
      });
    }

    if (!alerts.length) {
      alerts.push({
        tone: 'safe',
        title: 'Sem risco severo imediato',
        text: 'Não há sinais fortes de severidade imediata. Continue acompanhando a tendência do curto prazo.',
        windowLabel: 'Monitoramento'
      });
    }

    return alerts.slice(0, 5);
  }

  function buildClimateInsights(bundle) {
    const insights = [];
    const sourceConsensus = bundle.analytics.sourceConsensus;

    if (bundle.analytics.confidence >= 84) {
      insights.push({
        tone: 'safe',
        text: `Confiabilidade de ${bundle.analytics.confidence}% com alta concordância entre os modelos principais.`
      });
    } else if (bundle.analytics.confidence < 68) {
      insights.push({
        tone: 'warning',
        text: `Confiabilidade de ${bundle.analytics.confidence}% com variacao relevante entre modelos.`
      });
    }

    if (bundle.modelAgreement.available) {
      insights.push({
        tone: bundle.modelAgreement.score >= 80 ? 'safe' : 'warning',
        text: `Spread multimodelo: ${buildSpreadSummary(bundle.modelAgreement)}.`
      });
    }

    if (sourceConsensus?.available) {
      insights.push({
        tone: sourceConsensus.overallStatus === 'safe' ? 'safe' : 'warning',
        text: sourceConsensus.leadMessage
      });
    }

    if (bundle.analytics.trend.label === 'Instabilidade crescente') {
      insights.push({
        tone: 'warning',
        text: 'Pressão em queda e chuva em aceleração indicam aumento da instabilidade no curto prazo.'
      });
    } else {
      insights.push({
        tone: 'safe',
        text: `${bundle.analytics.trend.label}. ${bundle.analytics.trend.note}`
      });
    }

    if (bundle.current.uvIndex >= 7) {
      insights.push({
        tone: 'warning',
        text: `Índice UV atual em ${formatNumber(bundle.current.uvIndex, 1)}. Proteção solar reforçada é recomendada.`
      });
    }

    if (!insights.length) {
      insights.push({
        tone: 'safe',
        text: 'Condições equilibradas no momento, com variabilidade controlada no curto prazo.'
      });
    }

    return insights.slice(0, 4);
  }

  function buildDailyMessages(metrics) {
    const messages = [];

    if ([95, 96, 99].includes(metrics.weatherCode) || valueOr(metrics.detail?.rainProbability, 0) >= 75) {
      messages.push({
        tone: 'danger',
        text: 'Janela com risco elevado de chuva intensa ou tempestade.'
      });
    } else if (valueOr(metrics.detail?.rainProbability, 0) >= 45) {
      messages.push({
        tone: 'warning',
        text: 'Chance moderada de chuva. Planeje deslocamentos mais curtos.'
      });
    }

    if (valueOr(metrics.detail?.windSpeed, 0) >= 28 || valueOr(metrics.detail?.windGusts, 0) >= 40) {
      messages.push({
        tone: 'warning',
        text: 'Vento e rajadas acima da zona confortável para operações delicadas.'
      });
    }

    if (valueOr(metrics.detail?.confidence, 0) >= 82) {
      messages.push({
        tone: 'safe',
        text: `Confiabilidade diária alta em ${metrics.detail.confidence}%.`
      });
    } else {
      messages.push({
        tone: 'warning',
        text: `Confiabilidade diária em ${Math.round(valueOr(metrics.detail?.confidence, 0))}%.`
      });
    }

    return messages.slice(0, 3);
  }

  // Clima: main rendering, forecast details, and charts
  function renderClimateTab() {
    if (!state.weatherBundle) return;

    const bundle = state.weatherBundle;
    const current = bundle.current;
    const sourceConsensus = bundle.analytics.sourceConsensus;
    const resilienceNotice = state.resilience.notice;
    const refreshSecondsRemaining = getScheduledSecondsRemaining();
    const modelsSummary = getModelsSummary(state.providerRuns);
    const updateAgeText = getUpdateAgeText(state.lastUpdate);
    const summaryDetail = resilienceNotice?.text || bundle.alerts[0]?.text || bundle.analytics.trend.note;
    const insightMessages = resilienceNotice ? [resilienceNotice, ...bundle.insights] : bundle.insights;
    applyClimateTheme(current);

    dom.temp.textContent = `${formatNumber(current.temperature)}°C`;
    dom.feels.textContent = `${formatNumber(current.feelsLike)}°C`;
    dom.currentWeatherIcon.textContent = current.icon;
    dom.currentSummary.textContent = `${current.description}. ${summaryDetail}`;
    dom.currentStatusTag.textContent = resilienceNotice ? 'Modo resiliente ativo' : bundle.analytics.headline;
    dom.currentRainTag.textContent = `Chuva: ${Math.round(valueOr(current.rainProbability, 0))}%`;
    dom.currentWindTag.textContent = `Vento: ${formatNumber(current.windSpeed)} km/h`;

    dom.confidenceValue.textContent = `${bundle.analytics.confidence}%`;
    dom.confidenceNote.textContent = `${bundle.analytics.confidenceNote} ${modelsSummary}.`;
    dom.divergenceValue.textContent = bundle.modelAgreement.available ? `${formatNumber(bundle.modelAgreement.averageTempSpread, 1)}° / ${formatNumber(bundle.modelAgreement.averageWindSpread, 1)} km/h` : '--';
    dom.divergenceNote.textContent = sourceConsensus?.available
      ? `${buildSpreadSummary(bundle.modelAgreement)} • ${sourceConsensus.summary}`
      : 'Comparacao entre fontes indisponivel no momento.';
    dom.trendValue.textContent = bundle.analytics.trend.short;
    dom.trendNote.textContent = bundle.analytics.trend.note;

    dom.providerSummary.textContent = modelsSummary;
    dom.cacheStatus.textContent = state.cacheInfo.used
      ? state.cacheInfo.stale
        ? `Usando ultimo dado valido salvo (${formatDurationShort(state.cacheInfo.ageMs)})`
        : `Ultimo dado valido salvo (${formatDurationShort(state.cacheInfo.ageMs)})`
      : 'Ao vivo';
    dom.refreshSummary.textContent = `a cada ${state.refreshSeconds}s`;
    dom.refreshExplanation.textContent = state.cacheInfo.used
      ? `Usando \u00faltimo dado valido salvo com ${formatDurationShort(state.cacheInfo.ageMs)} de idade.`
      : 'Atualização ao vivo com cache inteligente de segurança.';

    dom.refreshExplanation.textContent = state.cacheInfo.used
      ? `Usando \u00faltimo dado valido salvo com ${formatDurationShort(state.cacheInfo.ageMs)} de idade.`
      : `${updateAgeText}. ${modelsSummary}.`;

    if (resilienceNotice) {
      dom.refreshExplanation.textContent = `${summaryDetail} Nova tentativa automÃ¡tica em ${refreshSecondsRemaining}s.`;
    }

    dom.vento.textContent = `${formatNumber(current.windSpeed)} km/h`;
    dom.umidade.textContent = `${Math.round(valueOr(current.humidity, 0))}%`;
    dom.chuva.textContent = `${formatNumber(current.precipitation)} mm`;
    dom.time.textContent = formatDateTime(state.lastUpdate);
    dom.currentWindDirection.textContent = `Direção ${formatNumber(current.windDirection, 0)}° • ${getWindDirection(current.windDirection)}`;
    dom.currentPressure.textContent = `Pressão ${formatNumber(current.pressure, 0)} hPa`;
    dom.currentRainProbability.textContent = `Probabilidade ${Math.round(valueOr(current.rainProbability, 0))}%`;
    dom.currentVisibility.textContent = `${formatNumber(current.visibilityKm)} km`;
    dom.currentCloudCover.textContent = `Nuvens ${Math.round(valueOr(current.cloudCover, 0))}%`;
    dom.currentUvValue.textContent = formatNumber(current.uvIndex, 1);
    dom.currentUvDetail.textContent = current.uvIndex >= 7 ? 'Exposição alta' : 'Exposição controlada';
    dom.currentConfidenceValue.textContent = `${bundle.analytics.confidence}%`;
    dom.currentConfidenceDetail.textContent = sourceConsensus?.available ? `${sourceConsensus.shortLabel} entre modelos` : modelsSummary;
    dom.currentTrendValue.textContent = bundle.analytics.trend.short;
    dom.currentTrendDetail.textContent = bundle.analytics.trend.note;
    dom.currentSpreadValue.textContent = bundle.modelAgreement.available ? `${formatNumber(bundle.modelAgreement.averageTempSpread, 1)}°` : '--';
    dom.currentSpreadDetail.textContent = sourceConsensus?.available
      ? `${buildSpreadSummary(bundle.modelAgreement)} • ${sourceConsensus.summary}`
      : 'Comparacao entre fontes indisponivel no momento.';

    dom.reliabilityScore.textContent = `${bundle.analytics.confidence}%`;
    dom.reliabilityExplanation.textContent = `${bundle.analytics.confidenceNote} ${modelsSummary}. ${updateAgeText}.`;
    dom.modelSpreadScore.textContent = buildSpreadSummary(bundle.modelAgreement);
    dom.modelSpreadExplanation.textContent = buildModelSpreadExplanation(bundle.modelAgreement, sourceConsensus);
    dom.trendHeadline.textContent = bundle.analytics.trend.label;
    dom.trendExplanation.textContent = sourceConsensus?.available
      ? `${bundle.analytics.trend.note} ${sourceConsensus.leadMessage}`
      : bundle.analytics.trend.note;

    dom.climateInsights.innerHTML = insightMessages.map((message) => createInsightChip(message)).join('');

    renderAlertStream(bundle.alerts, resilienceNotice);
    renderProviderStatusGrid(state.providerRuns);
    renderHistoricalSummary();
    renderForecastWeek();
    renderClimateDetail();
    renderHourlyTimeline();
    renderCharts();
    renderMapOverlays();
    window.VentoUXEnhancements?.updateWeatherDashboard?.({
      bundle,
      providerRuns: state.providerRuns,
      cacheInfo: state.cacheInfo,
      location: state.location,
      analysis: buildFlightAnalysis(bundle),
      modelsSummary,
      updateAgeText
    });
  }

  function applyClimateTheme(current) {
    const climateRoot = document.getElementById('clima');
    if (!climateRoot || !current) return;

    const themeClasses = [
      'weather-theme-initializing',
      'weather-theme-clear',
      'weather-theme-clouds',
      'weather-theme-rain',
      'weather-theme-storm',
      'weather-theme-night'
    ];
    climateRoot.classList.remove(...themeClasses);

    const weatherCode = Number(current.weatherCode);
    let nextTheme = 'weather-theme-clouds';

    if (!current.isDay) {
      nextTheme = 'weather-theme-night';
    } else if (weatherCode >= 95) {
      nextTheme = 'weather-theme-storm';
    } else if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) {
      nextTheme = 'weather-theme-rain';
    } else if (weatherCode === 0 || weatherCode === 1) {
      nextTheme = 'weather-theme-clear';
    }

    climateRoot.classList.add(nextTheme);
  }

  function renderAlertStream(alerts, resilienceNotice = null) {
    const combinedAlerts = resilienceNotice
      ? [{
        title: 'Auto-recuperacao',
        text: resilienceNotice.text,
        tone: resilienceNotice.tone || 'warning',
        windowLabel: 'Supervisor resiliente ativo'
      }, ...(alerts || [])]
      : (alerts || []);

    dom.alertStream.innerHTML = combinedAlerts
      .map((alert) => `
        <article class="alert-card ${alert.tone}">
          <strong>${alert.title}</strong>
          <p>${alert.text}</p>
          <small>${alert.windowLabel}</small>
        </article>
      `)
      .join('');
  }

  function renderProviderStatusGrid(providerRuns) {
    const visibleRuns = (Array.isArray(providerRuns) ? providerRuns : []).filter((run) => !run?.hidden);

    if (!visibleRuns.length) {
      dom.providerStatusGrid.innerHTML = `
        <article class="provider-card offline">
          <div class="provider-card-head">
            <strong>Fusão climática</strong>
            <span>Aguardando</span>
          </div>
          <p>Os provedores serão listados assim que a primeira atualização terminar.</p>
        </article>
      `;
      return;
    }

    dom.providerStatusGrid.innerHTML = visibleRuns
      .map((run) => {
        const statusClass = run.status === 'loading'
          ? 'partial'
          : run.success
            ? (run.status === 'partial' ? 'partial' : 'online')
            : 'offline';
        const statusLabel = run.status === 'loading'
          ? 'Sincronizando'
          : run.status === 'offline-controlled'
            ? 'Offline controlado'
            : run.success
              ? (run.status === 'partial' ? 'Parcial' : 'Online')
              : 'Offline';
        const currentTemp = Number.isFinite(run.current?.temperature) ? `${formatNumber(run.current.temperature)}°C` : '--';
        const currentWind = Number.isFinite(run.current?.windSpeed) ? `${formatNumber(run.current.windSpeed)} km/h` : '--';
        const weightText = Number.isFinite(run.weight) ? formatNumber(run.weight, 2) : '--';
        const latencyText = Number.isFinite(run.latencyMs) ? `${run.latencyMs}ms` : '--';

        return `
          <article class="provider-card ${statusClass}">
            <div class="provider-card-head">
              <strong>${run.label}</strong>
              <span>${statusLabel}</span>
            </div>
            <div class="provider-card-metrics">
              <div class="provider-metric">
                <span class="provider-card-meta">Peso</span>
                <strong>${weightText}</strong>
              </div>
              <div class="provider-metric">
                <span class="provider-card-meta">Latência</span>
                <strong>${latencyText}</strong>
              </div>
              <div class="provider-metric">
                <span class="provider-card-meta">Temperatura</span>
                <strong>${currentTemp}</strong>
              </div>
              <div class="provider-metric">
                <span class="provider-card-meta">Vento</span>
                <strong>${currentWind}</strong>
              </div>
            </div>
            <p>${run.message}</p>
          </article>
        `;
      })
      .join('');
  }

  async function refreshHistoricalSummary() {
    const cacheKey = buildCacheKey('history', state.location);
    const cached = readCache(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;

    if (cached && cacheAge <= CACHE_TTL.history) {
      state.history = cached.value;
      renderHistoricalSummary();
      return;
    }

    const historical = await fetchHistoricalContext(state.location);
    state.history = historical;
    writeCache(cacheKey, historical);
    renderHistoricalSummary();
  }

  async function fetchHistoricalContext(location) {
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);

    const params = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lon),
      timezone: 'auto',
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max'
    });

    const data = await fetchJson(`${OPEN_METEO_ARCHIVE_URL}?${params.toString()}`, { timeoutMs: 15000 });
    const days = (data?.daily?.time || []).map((dateKey, index) => ({
      dateKey,
      maxTemp: valueOr(data?.daily?.temperature_2m_max?.[index], null),
      minTemp: valueOr(data?.daily?.temperature_2m_min?.[index], null),
      precipitation: valueOr(data?.daily?.precipitation_sum?.[index], 0),
      windSpeed: valueOr(data?.daily?.wind_speed_10m_max?.[index], null)
    }));

    return {
      periodLabel: 'Últimos 7 dias',
      averageTemp: meanOfValues(days.map((day) => (valueOr(day.maxTemp, 0) + valueOr(day.minTemp, 0)) / 2)),
      averageRain: meanOfValues(days.map((day) => day.precipitation)),
      averageWind: meanOfValues(days.map((day) => day.windSpeed)),
      totalRain: sumOfValues(days.map((day) => day.precipitation)),
      days
    };
  }

  function renderHistoricalSummary() {
    if (!state.history || !state.weatherBundle) {
      dom.historicalSummary.innerHTML = `
        <article class="historical-card">
          <span class="historical-label">Histórico recente</span>
          <strong>Carregando contexto histórico...</strong>
          <span>Assim que a coleta concluir, a aba clima compara o momento atual com os últimos dias.</span>
        </article>
      `;
      return;
    }

    const current = state.weatherBundle.current;
    const tempDelta = valueOr(current.temperature, 0) - valueOr(state.history.averageTemp, 0);
    const windDelta = valueOr(current.windSpeed, 0) - valueOr(state.history.averageWind, 0);
    const rainDelta = valueOr(current.precipitation, 0) - valueOr(state.history.averageRain, 0);

    dom.historicalSummary.innerHTML = `
      <article class="historical-card">
        <span class="historical-label">Temperatura vs média</span>
        <strong>${tempDelta >= 0 ? '+' : ''}${formatNumber(tempDelta)}°C</strong>
        <span>Média recente em ${formatNumber(state.history.averageTemp)}°C.</span>
      </article>
      <article class="historical-card">
        <span class="historical-label">Chuva acumulada 7d</span>
        <strong>${formatNumber(state.history.totalRain)} mm</strong>
        <span>Agora ${rainDelta >= 0 ? 'acima' : 'abaixo'} da média diária recente em ${formatNumber(Math.abs(rainDelta))} mm.</span>
      </article>
      <article class="historical-card">
        <span class="historical-label">Vento vs média</span>
        <strong>${windDelta >= 0 ? '+' : ''}${formatNumber(windDelta)} km/h</strong>
        <span>Média recente de rajadas máximas em ${formatNumber(state.history.averageWind)} km/h.</span>
      </article>
    `;
  }

  function renderForecastWeek() {
    dom.forecastWeek.innerHTML = state.weatherBundle.daily
      .map((day) => {
        const activeClass = day.index === state.selectedDayIndex ? ' active' : '';
        return `
          <article class="forecast-card${activeClass}" data-day-index="${day.index}">
            <div class="forecast-topline">
              <div>
                <div class="forecast-day">${day.label}</div>
                <div class="forecast-date">${day.shortDate}</div>
              </div>
              <div class="forecast-icon">${day.icon}</div>
            </div>
            <div class="forecast-temperature">
              <span class="forecast-max">${formatNumber(day.maxTemp)}°</span>
              <span class="forecast-min">min ${formatNumber(day.minTemp)}°</span>
            </div>
            <div class="forecast-summary">${day.headline}</div>
            <div class="forecast-stats">
              <div class="forecast-stat"><span>Chuva</span><strong>${day.rainProbability}%</strong></div>
              <div class="forecast-stat"><span>Vento</span><strong>${formatNumber(day.windSpeed)} km/h</strong></div>
              <div class="forecast-stat"><span>Conf.</span><strong>${day.confidence}%</strong></div>
              <div class="forecast-stat"><span>Umidade</span><strong>${day.humidityMean}%</strong></div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function renderClimateDetail() {
    const selectedDay = state.weatherBundle.daily[state.selectedDayIndex] || state.weatherBundle.daily[0];
    if (!selectedDay) return;

    const detail = selectedDay.detail;

    dom.detailTitle.textContent = `Detalhes de ${selectedDay.label} • ${selectedDay.shortDate}`;
    dom.detailTimeLabel.textContent = `Base horária: ${formatHour(detail.time)}`;
    dom.detailIntelligence.innerHTML = selectedDay.messages.map((message) => createInsightChip(message)).join('');

    dom.detailTemp.textContent = `${formatNumber(detail.temperature)}°C`;
    dom.detailTempRange.textContent = `${formatNumber(selectedDay.minTemp)}°C a ${formatNumber(selectedDay.maxTemp)}°C`;
    dom.detailFeels.textContent = `${formatNumber(detail.feelsLike)}°C`;
    dom.detailHumidity.textContent = `${Math.round(valueOr(detail.humidity, 0))}%`;
    dom.detailHumidityMean.textContent = `${selectedDay.humidityMean}%`;
    dom.detailPressure.textContent = `${formatNumber(detail.pressure, 0)} hPa`;
    dom.detailVisibility.textContent = `${formatNumber(detail.visibilityKm)} km`;
    dom.detailWind.textContent = `${formatNumber(detail.windSpeed)} km/h`;
    dom.detailGusts.textContent = `${formatNumber(detail.windGusts)} km/h`;
    dom.detailWindDirection.textContent = `${formatNumber(detail.windDirection, 0)}°`;
    dom.detailWindDirectionText.textContent = getWindDirection(detail.windDirection);
    dom.detailCloudCover.textContent = `${Math.round(valueOr(detail.cloudCover, 0))}%`;
    dom.detailRainProbability.textContent = `${Math.round(valueOr(detail.rainProbability, 0))}%`;
    dom.detailPrecipitation.textContent = `${formatNumber(detail.precipitation)} mm`;
    dom.detailWeatherType.textContent = `${detail.weatherIcon} ${detail.weatherLabel}`;
    dom.detailWeatherDescription.textContent = selectedDay.headline;
    dom.detailUv.textContent = formatNumber(detail.uvIndex, 1);
    dom.detailConfidence.textContent = `${Math.round(valueOr(detail.confidence, 0))}%`;
    dom.detailTrend.textContent = detail.trend;
    dom.detailSpread.textContent = detail.spread;
    dom.detailSunWindow.textContent = formatSunWindow(detail.sunrise, detail.sunset);
    dom.hourlyReference.textContent = `${selectedDay.label} • chuva, vento e tendencia para as proximas horas`;
    dom.hourlyTimelineLabel.textContent = `48 horas a partir de ${selectedDay.label.toLowerCase()} com foco em chuva, vento e confiabilidade`;
  }

  function renderHourlyTimeline() {
    dom.hourlyTimeline.innerHTML = state.weatherBundle.hourly
      .slice(0, 48)
      .map((entry) => `
        <article class="hourly-card">
          <div class="hourly-card-top">
            <span>${formatHourlyCardLabel(entry.time)}</span>
            <span class="hourly-card-icon">${entry.icon}</span>
          </div>
          <strong class="hourly-temp">${formatNumber(entry.temperature)}°C</strong>
          <div class="hourly-card-bottom">
            <span>${entry.description}</span>
            <strong>${entry.confidence}%</strong>
          </div>
          <div class="hourly-meta-grid">
            <div class="hourly-meta-row"><span>Chuva</span><strong>${Math.round(valueOr(entry.rainProbability, 0))}%</strong></div>
            <div class="hourly-meta-row"><span>Volume</span><strong>${formatNumber(entry.precipitation)} mm</strong></div>
            <div class="hourly-meta-row"><span>Vento</span><strong>${formatNumber(entry.windSpeed)} km/h</strong></div>
            <div class="hourly-meta-row"><span>Spread</span><strong>${entry.spreadText}</strong></div>
          </div>
        </article>
      `)
      .join('');
  }

  function selectForecastDay(index) {
    state.selectedDayIndex = index;
    renderForecastWeek();
    renderClimateDetail();
  }

  function setChartMode(mode) {
    state.chartMode = mode;
    updateChartButtons();
    renderCharts();
  }

  function setChartRange(hours) {
    state.chartRangeHours = Number.isFinite(hours) ? hours : 24;
    updateChartButtons();
    renderCharts();
  }

  function updateChartButtons() {
    dom.chartModeButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.chartMode === state.chartMode);
    });
    dom.chartRangeButtons.forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.rangeHours) === state.chartRangeHours);
    });

    Object.entries(dom.chartCanvases).forEach(([mode, canvas]) => {
      canvas?.classList.toggle('active', mode === state.chartMode);
    });
  }

  function renderCharts() {
    if (!state.weatherBundle) return;
    if (typeof Chart === 'undefined') {
      console.warn('[clima] Chart.js indisponivel. Graficos nao renderizados.');
      return;
    }

    const series = state.weatherBundle.hourly.slice(0, state.chartRangeHours);
    if (!series.length) return;

    const providerMap = new Map(state.weatherBundle.providers.map((provider) => [provider.providerKey, provider]));
    const demoSeries = getProviderSeriesForChart(providerMap.get('openMeteo'), series);
    const trendSeries = series.map((entry) => ({
      temperature: entry.temperature,
      windSpeed: entry.windSpeed
    }));

    renderOverviewChart(series, demoSeries, trendSeries);
    renderWindChart(series, demoSeries, trendSeries);
    renderAtmosphereChart(series);
  }

  function renderOverviewChart(series, demoSeries, trendSeries) {
    const labels = series.map((entry) => formatChartLabel(entry.time, state.chartRangeHours));
    const precipitation = series.map((entry) => valueOr(entry.precipitation, 0));
    const rainProbability = series.map((entry) => valueOr(entry.rainProbability, 0));

    if (climateCharts.overview) {
      climateCharts.overview.destroy();
    }

    climateCharts.overview = new Chart(dom.graficoOverview.getContext('2d'), {
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Precipitação (mm)',
            data: precipitation,
            yAxisID: 'yRain',
            borderRadius: 8,
            backgroundColor: 'rgba(56, 189, 248, 0.22)',
            borderColor: 'rgba(56, 189, 248, 0.45)',
            borderWidth: 1
          },
          {
            type: 'line',
            label: 'Temperatura fundida (°C)',
            data: series.map((entry) => valueOr(entry.temperature, null)),
            yAxisID: 'yTemp',
            borderColor: '#22d3ee',
            backgroundColor: 'rgba(34, 211, 238, 0.14)',
            fill: true,
            tension: 0.35,
            pointRadius: 2.5,
            pointHoverRadius: 4
          },
          {
            type: 'line',
            label: 'Prob. chuva (%)',
            data: rainProbability,
            yAxisID: 'yRainPercent',
            borderColor: '#fb7185',
            fill: false,
            tension: 0.3,
            borderDash: [6, 4],
            pointRadius: 1.6
          },
          {
            type: 'line',
            label: 'Open-Meteo (°C)',
            data: demoSeries.map((entry) => entry.temperature),
            yAxisID: 'yTemp',
            borderColor: '#f59e0b',
            fill: false,
            tension: 0.25,
            pointRadius: 0
          },
          {
            type: 'line',
            label: 'Tendencia atual (°C)',
            data: trendSeries.map((entry) => entry.temperature),
            yAxisID: 'yTemp',
            borderColor: '#8b5cf6',
            fill: false,
            tension: 0.25,
            pointRadius: 0
          }
        ]
      },
      options: buildCommonChartOptions({
        scales: {
          x: buildChartXAxis(),
          yTemp: {
            position: 'left',
            ticks: { color: '#cbd5e1' },
            grid: { color: 'rgba(148, 163, 184, 0.12)' }
          },
          yRain: {
            position: 'right',
            ticks: { color: '#67e8f9' },
            grid: { display: false }
          },
          yRainPercent: {
            position: 'right',
            min: 0,
            max: 100,
            display: false
          }
        }
      })
    });
  }

  function renderWindChart(series, demoSeries, trendSeries) {
    const labels = series.map((entry) => formatChartLabel(entry.time, state.chartRangeHours));

    if (climateCharts.wind) {
      climateCharts.wind.destroy();
    }

    climateCharts.wind = new Chart(dom.graficoWind.getContext('2d'), {
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'Vento fundido (km/h)',
            data: series.map((entry) => valueOr(entry.windSpeed, null)),
            yAxisID: 'yWind',
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            fill: true,
            tension: 0.32,
            pointRadius: 2.5
          },
          {
            type: 'line',
            label: 'Rajadas (km/h)',
            data: series.map((entry) => valueOr(entry.windGusts, null)),
            yAxisID: 'yWind',
            borderColor: '#f97316',
            fill: false,
            tension: 0.28,
            pointRadius: 1.5
          },
          {
            type: 'line',
            label: 'Direção (°)',
            data: series.map((entry) => valueOr(entry.windDirection, null)),
            yAxisID: 'yDirection',
            borderColor: '#a78bfa',
            fill: false,
            tension: 0.12,
            pointRadius: 0,
            borderDash: [6, 4]
          },
          {
            type: 'line',
            label: 'Open-Meteo vento (km/h)',
            data: demoSeries.map((entry) => entry.windSpeed),
            yAxisID: 'yWind',
            borderColor: '#fbbf24',
            fill: false,
            pointRadius: 0
          },
          {
            type: 'line',
            label: 'Tendencia atual vento (km/h)',
            data: trendSeries.map((entry) => entry.windSpeed),
            yAxisID: 'yWind',
            borderColor: '#8b5cf6',
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: buildCommonChartOptions({
        scales: {
          x: buildChartXAxis(),
          yWind: {
            position: 'left',
            ticks: { color: '#cbd5e1' },
            grid: { color: 'rgba(148, 163, 184, 0.12)' }
          },
          yDirection: {
            position: 'right',
            min: 0,
            max: 360,
            ticks: { color: '#c4b5fd' },
            grid: { display: false }
          }
        }
      })
    });
  }

  function renderAtmosphereChart(series) {
    const labels = series.map((entry) => formatChartLabel(entry.time, state.chartRangeHours));

    if (climateCharts.atmosphere) {
      climateCharts.atmosphere.destroy();
    }

    climateCharts.atmosphere = new Chart(dom.graficoAtmosphere.getContext('2d'), {
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'Pressão (hPa)',
            data: series.map((entry) => valueOr(entry.pressure, null)),
            yAxisID: 'yPressure',
            borderColor: '#f8fafc',
            fill: false,
            tension: 0.25,
            pointRadius: 2
          },
          {
            type: 'line',
            label: 'Umidade (%)',
            data: series.map((entry) => valueOr(entry.humidity, null)),
            yAxisID: 'yHumidity',
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 1.8
          },
          {
            type: 'line',
            label: 'UV',
            data: series.map((entry) => valueOr(entry.uvIndex, null)),
            yAxisID: 'yUv',
            borderColor: '#f43f5e',
            fill: false,
            tension: 0.24,
            pointRadius: 1.5
          }
        ]
      },
      options: buildCommonChartOptions({
        scales: {
          x: buildChartXAxis(),
          yPressure: {
            position: 'left',
            ticks: { color: '#e2e8f0' },
            grid: { color: 'rgba(148, 163, 184, 0.12)' }
          },
          yHumidity: {
            position: 'right',
            min: 0,
            max: 100,
            ticks: { color: '#86efac' },
            grid: { display: false }
          },
          yUv: {
            position: 'right',
            display: false,
            min: 0
          }
        }
      })
    });
  }

  function buildCommonChartOptions(extra) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: '#e5e7eb'
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const label = context.dataset.label || 'Série';
              const value = context.parsed.y;
              return `${label}: ${Number.isFinite(value) ? value.toFixed(1) : '--'}`;
            }
          }
        }
      },
      ...extra
    };
  }

  function buildChartXAxis() {
    return {
      ticks: {
        color: '#94a3b8',
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: state.chartRangeHours <= 12 ? 12 : 8
      },
      grid: {
        color: 'rgba(148, 163, 184, 0.08)'
      }
    };
  }

  function getProviderSeriesForChart(provider, baseSeries) {
    if (!provider || !provider.hourly?.length) {
      return baseSeries.map(() => ({ temperature: null, windSpeed: null }));
    }

    return baseSeries.map((entry) => {
      const match = findClosestHourlyEntry(provider.hourly, entry.time, 90);
      return {
        temperature: match?.temperature ?? null,
        windSpeed: match?.windSpeed ?? null
      };
    });
  }

  // APIs: location search and favorites helpers
  async function performSearch(query, showStatus) {
    const normalizedQuery = String(query || '').trim();
    if (normalizedQuery.length < 3) {
      renderSearchResults([]);
      return;
    }

    const cacheKey = `search:${normalizedQuery.toLowerCase()}`;
    const cached = readCache(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;

    if (showStatus && dom.locationSearchStatus) {
      dom.locationSearchStatus.textContent = `Buscando "${normalizedQuery}"...`;
    }

    try {
      let results = [];

      if (cached && cacheAge <= CACHE_TTL.search) {
        results = cached.value;
      } else {
        results = await fetchSearchResults(normalizedQuery);
        writeCache(cacheKey, results);
      }

      state.searchResults = results;
      renderSearchResults(results);
      if (showStatus && dom.locationSearchStatus) {
        dom.locationSearchStatus.textContent = results.length
          ? `${results.length} resultado(s) para "${normalizedQuery}".`
          : `Nenhum resultado para "${normalizedQuery}".`;
      }
    } catch (error) {
      console.error('Falha na busca por local:', error);
      if (showStatus && dom.locationSearchStatus) {
        dom.locationSearchStatus.textContent = 'Não foi possível buscar esse local agora.';
      }
      renderSearchResults([]);
    }
  }

  async function fetchSearchResults(query) {
    const coordinateMatch = parseCoordinateSearch(query);
    if (coordinateMatch) {
      return [coordinateMatch];
    }

    const params = new URLSearchParams({
      name: query,
      count: '6',
      language: 'pt',
      format: 'json'
    });

    const data = await fetchJson(`${OPEN_METEO_GEOCODE_URL}?${params.toString()}`, { timeoutMs: 12000 });
    const results = Array.isArray(data?.results) ? data.results : [];

    return results.map((result) => ({
      lat: result.latitude,
      lon: result.longitude,
      label: [result.name, result.admin1, result.country].filter(Boolean).join(', '),
      country: result.country || '',
      timezone: result.timezone || ''
    }));
  }

  function parseCoordinateSearch(query) {
    const match = String(query || '').trim().match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (!match) return null;

    const lat = Number(match[1].replace(',', '.'));
    const lon = Number(match[2].replace(',', '.'));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    return {
      lat,
      lon,
      label: `Coordenadas ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      country: '',
      timezone: 'Busca direta por coordenadas'
    };
  }

  function renderSearchResults(results) {
    dom.searchResults.innerHTML = (results || [])
      .map((result) => `
        <button
          class="search-result-item"
          type="button"
          data-search-lat="${result.lat}"
          data-search-lon="${result.lon}"
          data-search-label="${escapeAttribute(result.label)}"
        >
          <span class="search-result-main">
            <strong>${result.label}</strong>
            <span>${result.timezone || result.country || 'Ponto pesquisado'}</span>
          </span>
          <span class="search-result-coords">${result.lat.toFixed(2)}, ${result.lon.toFixed(2)}</span>
        </button>
      `)
      .join('');
  }

  function saveCurrentFavorite() {
    const signature = `${state.location.lat.toFixed(3)}:${state.location.lon.toFixed(3)}`;
    const existingIndex = state.favorites.findIndex((favorite) => `${favorite.lat.toFixed(3)}:${favorite.lon.toFixed(3)}` === signature);

    if (existingIndex >= 0) {
      state.favorites[existingIndex] = {
        ...state.favorites[existingIndex],
        name: state.location.name || state.favorites[existingIndex].name
      };
    } else {
      state.favorites.push({
        name: state.location.name || `Favorito ${state.favorites.length + 1}`,
        lat: state.location.lat,
        lon: state.location.lon
      });
    }

    writeFavorites();
    hydrateFavorites();

    if (dom.locationSearchStatus) {
      dom.locationSearchStatus.textContent = `Favorito "${state.location.name || 'Local atual'}" salvo.`;
    }
  }

  function hydrateFavorites() {
    dom.favoritesSelect.innerHTML = `
      <option value="">Favoritos salvos</option>
      ${state.favorites
        .map((favorite, index) => `<option value="${index}">${favorite.name}</option>`)
        .join('')}
    `;
  }

  function loadFavorites() {
    return loadFavoritesFromStorage();
  }

  function writeFavorites() {
    try {
      localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state.favorites));
    } catch (error) {
      console.warn('Falha ao salvar favoritos:', error);
    }
  }

  // Mapa: base maps, markers, and weather overlays
  function initClimateMap() {
    if (typeof L === 'undefined' || !document.getElementById('map')) {
      console.warn('[clima] Leaflet ou container do mapa indisponivel.');
      return;
    }

    climateMap = L.map('map', {
      zoomControl: true,
      fadeAnimation: true,
      zoomAnimation: true,
      markerZoomAnimation: true,
      preferCanvas: true,
      wheelDebounceTime: 30,
      wheelPxPerZoomLevel: 72
    }).setView([state.location.lat, state.location.lon], 7);

    climateLayers.default = createTileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      '&copy; OpenStreetMap contributors'
    );
    climateLayers.satellite = createTileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'Tiles &copy; Esri'
    );
    climateLayers.terrain = createTileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      'Map data &copy; OpenTopoMap contributors'
    );

    climateLayers.default.addTo(climateMap);
    climateMarker = L.marker([state.location.lat, state.location.lon]).addTo(climateMap);
    climateMarker.bindTooltip('Ponto de analise climatica', {
      direction: 'top',
      opacity: 0.92
    });
    climateMarker.bindPopup('Ponto de análise climática');

    fieldRenderer = createWeatherFieldRenderer(climateMap);

    climateMap.on('click', (event) => {
      applyLocation(
        {
          lat: event.latlng.lat,
          lon: event.latlng.lng,
          name: 'Ponto selecionado no mapa'
        },
        {
          statusMessage: 'Ponto ajustado manualmente no mapa climático.',
          statusTone: 'success',
          showLoading: false,
          force: true
        }
      );
    });

    climateMap.on('move zoom resize', () => {
      fieldRenderer?.sync();
      if (state.activeTab === 'clima') {
        renderMapOverlays();
      }
    });

    window.VentoUXEnhancements?.attachClimateMap?.({
      map: climateMap,
      marker: climateMarker,
      getState: () => state,
      applyLocation
    });
  }

  function initDroneMap() {
    if (typeof L === 'undefined' || !document.getElementById('drone-map')) {
      console.warn('[drone] Leaflet ou container do mapa indisponivel.');
      return;
    }

    droneMap = L.map('drone-map', {
      zoomAnimation: true,
      markerZoomAnimation: true,
      preferCanvas: true,
      wheelDebounceTime: 30,
      wheelPxPerZoomLevel: 72
    }).setView([state.location.lat, state.location.lon], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(droneMap);

    const droneIcon = L.divIcon({
      html: '<div style="background:#6366f1;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 10px rgba(99,102,241,0.5);border:3px solid white;">🚁</div>',
      className: 'drone-marker',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    droneMarker = L.marker([state.location.lat, state.location.lon], { icon: droneIcon }).addTo(droneMap);
    droneMarker.bindTooltip('Ponto operacional do drone', {
      direction: 'top',
      opacity: 0.92
    });
    droneMarker.bindPopup('<b>Ponto de voo</b><br>Análise profissional ativa');

    droneRadius = L.circle([state.location.lat, state.location.lon], {
      color: '#6366f1',
      fillColor: '#6366f1',
      fillOpacity: 0.1,
      radius: 1000
    }).addTo(droneMap);

    droneMap.on('click', (event) => {
      applyLocation(
        {
          lat: event.latlng.lat,
          lon: event.latlng.lng,
          name: 'Ponto operacional selecionado'
        },
        {
          statusMessage: 'Área de voo definida manualmente no mapa.',
          statusTone: 'success',
          showLoading: false,
          force: true
        }
      );
    });

    window.VentoUXEnhancements?.attachDroneMap?.({
      map: droneMap,
      marker: droneMarker,
      radius: droneRadius,
      getState: () => state
    });
  }

  function syncMapMarkers(centerMaps = false) {
    if (climateMarker) {
      climateMarker.setLatLng([state.location.lat, state.location.lon]);
      climateMarker.bindPopup(`<b>${state.location.name || 'Ponto de análise'}</b><br>${state.location.lat.toFixed(4)}, ${state.location.lon.toFixed(4)}`);
    }

    if (climateMap && centerMaps) {
      climateMap.setView([state.location.lat, state.location.lon], Math.max(climateMap.getZoom(), 7));
    }

    if (droneMarker) {
      droneMarker.setLatLng([state.location.lat, state.location.lon]);
      droneMarker.bindPopup(`<b>Ponto de voo</b><br>${state.location.name || 'Ponto operacional'}`);
    }

    if (droneRadius) {
      droneRadius.setLatLng([state.location.lat, state.location.lon]);
    }

    if (droneMap && centerMaps) {
      droneMap.setView([state.location.lat, state.location.lon], Math.max(droneMap.getZoom(), 13));
    }
  }

  function setClimateMapLayer(layerKey) {
    const nextLayer = climateLayers[layerKey];
    const currentLayer = climateLayers[state.climateLayer];

    if (!nextLayer || layerKey === state.climateLayer) return;

    if (!climateMap.hasLayer(nextLayer)) {
      nextLayer.setOpacity(0);
      nextLayer.addTo(climateMap);
    }

    requestAnimationFrame(() => nextLayer.setOpacity(1));

    if (currentLayer && climateMap.hasLayer(currentLayer)) {
      currentLayer.setOpacity(0);
      window.setTimeout(() => {
        if (climateMap.hasLayer(currentLayer)) {
          climateMap.removeLayer(currentLayer);
          currentLayer.setOpacity(1);
        }
      }, 320);
    }

    state.climateLayer = layerKey;
    updateBaseLayerButtons();
  }

  function setWeatherLayer(layerKey) {
    if (!layerKey || layerKey === state.weatherLayer) return;
    state.weatherLayer = layerKey;
    state.animation.frameIndex = 0;
    updateWeatherLayerButtons();
    renderMapOverlays();
  }

  function updateBaseLayerButtons() {
    dom.layerButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.layer === state.climateLayer);
    });
  }

  function updateWeatherLayerButtons() {
    dom.weatherLayerButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.weatherLayer === state.weatherLayer);
    });
  }

  async function loadRadarFrames(force = false) {
    const cacheKey = 'radar:frames';
    const cached = readCache(cacheKey);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;

    if (!force && cached && cacheAge <= CACHE_TTL.radar) {
      state.radar.frames = cached.value;
      rememberRadarFrames(cached.value);
      updateRadarStatus(`${state.radar.frames.length} frames de radar prontas`);
      return;
    }

    const data = await fetchJson(RAINVIEWER_URL, { timeoutMs: 12000 });
    const host = data?.host || 'https://tilecache.rainviewer.com';
    const past = Array.isArray(data?.radar?.past) ? data.radar.past.slice(-6) : [];
    const forecast = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast.slice(0, 6) : [];

    const frames = [...past.map((frame) => ({ ...frame, kind: 'Radar' })), ...forecast.map((frame) => ({ ...frame, kind: 'Previsão' }))]
      .map((frame, index) => ({
        index,
        time: frame?.time ? new Date(frame.time * 1000).toISOString() : new Date().toISOString(),
        kind: frame.kind,
        url: buildRainViewerTileUrl(host, frame?.path)
      }))
      .filter((frame) => frame.url);

    if (!frames.length) {
      throw new Error('Radar sem frames disponíveis.');
    }

    state.radar.frames = frames;
    rememberRadarFrames(frames);
    writeCache(cacheKey, frames);
    updateRadarStatus(`${frames.length} frames de radar prontas`);
  }

  async function ensureFieldOverlayBundle(force = false) {
    if (!state.weatherBundle) return null;

    const key = buildCacheKey(`field:${state.fieldOverlay.model}`, state.location);
    if (!force && state.fieldOverlay.key === key && state.fieldOverlay.bundle) {
      return state.fieldOverlay.bundle;
    }

    const cached = readCache(key);
    const cacheAge = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;

    if (!force && cached && cacheAge <= CACHE_TTL.field) {
      state.fieldOverlay.key = key;
      state.fieldOverlay.bundle = cached.value;
      rememberFieldBundle(cached.value);
      return cached.value;
    }

    state.fieldOverlay.loading = true;
    fieldRenderer?.showLoading('Gerando campo meteorológico...');

    try {
      const bundle = await fetchFieldOverlayBundle(state.location, state.fieldOverlay.model);
      state.fieldOverlay.key = key;
      state.fieldOverlay.bundle = bundle;
      rememberFieldBundle(bundle);
      writeCache(key, bundle);
      return bundle;
    } catch (error) {
      const fallbackBundle = cached?.value || state.resilience.lastGoodFieldBundle;
      if (fallbackBundle?.frames?.length) {
        state.fieldOverlay.key = key;
        state.fieldOverlay.bundle = fallbackBundle;
        rememberFieldBundle(fallbackBundle);
        updateRadarStatus('Campo meteorologico em fallback resiliente.');
        return fallbackBundle;
      }
      throw error;
    } finally {
      state.fieldOverlay.loading = false;
      fieldRenderer?.hideLoading();
    }
  }

  async function fetchFieldOverlayBundle(location, modelKey) {
    const gridPoints = buildFieldGridPoints(location);
    const responses = await Promise.allSettled(
      gridPoints.map((point) => fetchFieldPoint(point, modelKey))
    );

    const resolvedPoints = gridPoints.map((point, index) => {
      const result = responses[index];
      return result.status === 'fulfilled' ? result.value : null;
    });

    const validPoints = resolvedPoints.filter(Boolean);
    if (validPoints.length < Math.ceil(gridPoints.length * 0.5)) {
      throw new Error('Não foi possível gerar o campo meteorológico local.');
    }

    const filledPoints = resolvedPoints.map((point, index) => point || cloneFieldPoint(validPoints[index % validPoints.length], gridPoints[index]));
    const frames = FIELD_FRAME_OFFSETS.map((offsetHours, frameIndex) => {
      const cells = filledPoints.map((point) => {
        const source = point.frames[Math.min(frameIndex, point.frames.length - 1)] || point.frames[0];
        return {
          lat: point.lat,
          lon: point.lon,
          row: point.row,
          col: point.col,
          ...source
        };
      });
      return {
        offsetHours,
        time: cells[0]?.time || new Date(Date.now() + offsetHours * 3600 * 1000).toISOString(),
        label: offsetHours === 0 ? 'Agora' : `+${offsetHours}h`,
        cells,
        matrix: buildFieldMatrix(cells, FIELD_GRID_SIZE)
      };
    });

    return {
      modelKey,
      stepLat: FIELD_GRID_LAT_STEP,
      stepLon: getFieldLonStep(location.lat),
      frames
    };
  }

  async function fetchFieldPoint(point, modelKey) {
    if (modelKey === 'fused') {
      const fieldModels = [
        { providerKey: 'ecmwf', model: 'ecmwf_ifs04' },
        { providerKey: 'gfs', model: 'gfs_seamless' },
        { providerKey: 'icon', model: 'icon_seamless' },
        { providerKey: 'openMeteo', model: '' }
      ];
      const modelResults = await Promise.allSettled(
        fieldModels.map((definition) => fetchFieldPointModel(point, definition.model).then((result) => ({
          ...result,
          providerKey: definition.providerKey
        })))
      );
      const resolvedModels = modelResults
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);

      if (resolvedModels.length >= 2) {
        return combineFieldPointModels(resolvedModels, point);
      }
      if (resolvedModels.length === 1) return resolvedModels[0];
      throw new Error('Campo meteorologico sem resposta de ECMWF, GFS, ICON e Open-Meteo.');
    }

    const model = modelKey === 'ecmwf'
      ? 'ecmwf_ifs04'
      : modelKey === 'gfs'
        ? 'gfs_seamless'
        : modelKey === 'icon'
          ? 'icon_seamless'
          : '';
    return fetchFieldPointModel(point, model);
  }

  async function fetchFieldPointModel(point, model) {
    const params = new URLSearchParams({
      latitude: String(point.lat),
      longitude: String(point.lon),
      timezone: 'auto',
      forecast_days: '2',
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,cloud_cover,weather_code',
      hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,cloud_cover,weather_code'
    });

    if (model) {
      params.set('models', model);
    }

    const data = await fetchJson(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`, { timeoutMs: CORE_PROVIDER_TIMEOUT_MS });
    const frames = extractFieldFramesFromOpenMeteo(data);

    return {
      lat: point.lat,
      lon: point.lon,
      row: point.row,
      col: point.col,
      frames
    };
  }

  function extractFieldFramesFromOpenMeteo(data) {
    const hourly = data?.hourly || {};
    const time = hourly.time || [];
    const current = data?.current || {};

    return FIELD_FRAME_OFFSETS.map((offsetHours, frameIndex) => {
      if (frameIndex === 0) {
        return {
          time: current.time || time[0] || new Date().toISOString(),
          temperature: valueOr(current.temperature_2m, hourly.temperature_2m?.[0], 0),
          feelsLike: valueOr(current.apparent_temperature, hourly.apparent_temperature?.[0], 0),
          humidity: valueOr(current.relative_humidity_2m, hourly.relative_humidity_2m?.[0], 0),
          pressure: valueOr(current.pressure_msl, hourly.pressure_msl?.[0], 1013),
          windSpeed: valueOr(current.wind_speed_10m, hourly.wind_speed_10m?.[0], 0),
          windDirection: valueOr(current.wind_direction_10m, hourly.wind_direction_10m?.[0], 0),
          windGusts: valueOr(current.wind_gusts_10m, hourly.wind_gusts_10m?.[0], 0),
          precipitation: valueOr(current.precipitation, hourly.precipitation?.[0], 0),
          rainProbability: valueOr(hourly.precipitation_probability?.[0], 0),
          cloudCover: valueOr(current.cloud_cover, hourly.cloud_cover?.[0], 0),
          weatherCode: valueOr(current.weather_code, hourly.weather_code?.[0], 0)
        };
      }

      const hourIndex = Math.min(offsetHours, Math.max(0, time.length - 1));
      return {
        time: time[hourIndex] || new Date(Date.now() + offsetHours * 3600 * 1000).toISOString(),
        temperature: valueOr(hourly.temperature_2m?.[hourIndex], 0),
        feelsLike: valueOr(hourly.apparent_temperature?.[hourIndex], 0),
        humidity: valueOr(hourly.relative_humidity_2m?.[hourIndex], 0),
        pressure: valueOr(hourly.pressure_msl?.[hourIndex], 1013),
        windSpeed: valueOr(hourly.wind_speed_10m?.[hourIndex], 0),
        windDirection: valueOr(hourly.wind_direction_10m?.[hourIndex], 0),
        windGusts: valueOr(hourly.wind_gusts_10m?.[hourIndex], 0),
        precipitation: valueOr(hourly.precipitation?.[hourIndex], 0),
        rainProbability: valueOr(hourly.precipitation_probability?.[hourIndex], 0),
        cloudCover: valueOr(hourly.cloud_cover?.[hourIndex], 0),
        weatherCode: valueOr(hourly.weather_code?.[hourIndex], 0)
      };
    });
  }

  function combineFieldPointModels(points, fallbackPoint) {
    const validPoints = (Array.isArray(points) ? points : []).filter((point) => point?.frames?.length);
    if (!validPoints.length) return cloneFieldPoint(null, fallbackPoint);
    if (validPoints.length === 1) return cloneFieldPoint(validPoints[0], fallbackPoint);

    return {
      lat: fallbackPoint.lat,
      lon: fallbackPoint.lon,
      row: fallbackPoint.row,
      col: fallbackPoint.col,
      frames: FIELD_FRAME_OFFSETS.map((_, index) => {
        const framePoints = validPoints
          .map((point) => ({
            providerKey: point.providerKey,
            frame: point.frames[index]
          }))
          .filter((entry) => entry.frame);
        const getFieldWeight = (providerKey) => valueOr(FIELD_MODEL_WEIGHTS[providerKey], 0.5);

        return {
          time: framePoints[0]?.frame?.time || new Date().toISOString(),
          temperature: weightedAverage(framePoints.map((entry) => ({ value: entry.frame.temperature, weight: getFieldWeight(entry.providerKey) }))),
          feelsLike: weightedAverage(framePoints.map((entry) => ({ value: entry.frame.feelsLike, weight: getFieldWeight(entry.providerKey) }))),
          humidity: weightedAverage(framePoints.map((entry) => ({ value: entry.frame.humidity, weight: getFieldWeight(entry.providerKey) }))),
          pressure: weightedAverage(framePoints.map((entry) => ({ value: entry.frame.pressure, weight: getFieldWeight(entry.providerKey) }))),
          windSpeed: weightedAverage(framePoints.map((entry) => ({ value: entry.frame.windSpeed, weight: getFieldWeight(entry.providerKey) }))),
          windDirection: weightedDirection(framePoints.map((entry) => ({ value: entry.frame.windDirection, weight: getFieldWeight(entry.providerKey) }))),
          windGusts: weightedAverage(framePoints.map((entry) => ({ value: entry.frame.windGusts, weight: getFieldWeight(entry.providerKey) }))),
          precipitation: weightedAverage(framePoints.map((entry) => ({ value: entry.frame.precipitation, weight: getFieldWeight(entry.providerKey) }))),
          rainProbability: weightedAverage(framePoints.map((entry) => ({ value: entry.frame.rainProbability, weight: getFieldWeight(entry.providerKey) }))),
          cloudCover: weightedAverage(framePoints.map((entry) => ({ value: entry.frame.cloudCover, weight: getFieldWeight(entry.providerKey) }))),
          weatherCode: weightedMode(framePoints.map((entry) => ({ value: entry.frame.weatherCode, weight: getFieldWeight(entry.providerKey) })))
        };
      })
    };
  }

  function cloneFieldPoint(source, point) {
    return {
      lat: point.lat,
      lon: point.lon,
      row: point.row,
      col: point.col,
      frames: (source?.frames || []).map((frame) => ({ ...frame }))
    };
  }

  function buildFieldGridPoints(location) {
    const points = [];
    const centerOffset = Math.floor(FIELD_GRID_SIZE / 2);
    const lonStep = getFieldLonStep(location.lat);

    for (let row = 0; row < FIELD_GRID_SIZE; row += 1) {
      for (let col = 0; col < FIELD_GRID_SIZE; col += 1) {
        points.push({
          row,
          col,
          lat: location.lat + (centerOffset - row) * FIELD_GRID_LAT_STEP,
          lon: location.lon + (col - centerOffset) * lonStep
        });
      }
    }

    return points;
  }

  function getFieldLonStep(latitude) {
    return FIELD_GRID_LAT_STEP / Math.max(0.35, Math.cos((latitude * Math.PI) / 180));
  }

  function buildFieldMatrix(cells, size) {
    const matrix = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
    cells.forEach((cell) => {
      if (Number.isInteger(cell.row) && Number.isInteger(cell.col) && matrix[cell.row]) {
        matrix[cell.row][cell.col] = cell;
      }
    });
    return matrix;
  }

  async function renderMapOverlays() {
    if (!climateMap || !fieldRenderer) return;

    if (state.weatherLayer === 'radar') {
      try {
        if (!state.radar.frames.length) {
          await loadRadarFrames();
        }
        clearFieldOverlay();
        showRadarFrame(state.animation.frameIndex);
      } catch (error) {
        console.warn('Falha ao renderizar radar:', error);
        scheduleOverlayRecovery('radar', true);
        if (state.resilience.lastGoodRadarFrames.length) {
          state.radar.frames = state.resilience.lastGoodRadarFrames.slice();
          showRadarFrame(state.animation.frameIndex);
          updateRadarStatus('Radar em fallback com o Ãºltimo frame vÃ¡lido.');
          restartAnimationLoop();
          return;
        }
        updateRadarStatus('Radar indisponível.');
      }
      restartAnimationLoop();
      return;
    }

    clearRadarLayer();

    try {
      const bundle = await ensureFieldOverlayBundle() || state.resilience.lastGoodFieldBundle;
      if (!bundle) return;
      state.fieldOverlay.bundle = bundle;
      fieldRenderer.draw(bundle, state.weatherLayer, state.animation.frameIndex);
      noteOverlayRendered();
      updateAnimationFrameLabel();
    } catch (error) {
      console.warn('Falha ao renderizar camada meteorológica:', error);
      scheduleOverlayRecovery('field', true);
      if (state.resilience.lastGoodFieldBundle) {
        state.fieldOverlay.bundle = state.resilience.lastGoodFieldBundle;
        fieldRenderer.draw(state.resilience.lastGoodFieldBundle, state.weatherLayer, state.animation.frameIndex);
        noteOverlayRendered();
      }
    }

    restartAnimationLoop();
  }

  function buildRainViewerTileUrl(host, path) {
    if (!path) return '';
    if (path.includes('{z}')) return path.startsWith('http') ? path : `${host}${path}`;
    if (path.endsWith('.png')) return path.startsWith('http') ? path : `${host}${path}`;
    return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;
  }

  function showRadarFrame(frameIndex) {
    if (!state.radar.frames.length || !climateMap) return;

    const nextIndex = frameIndex % state.radar.frames.length;
    const frame = state.radar.frames[nextIndex];
    updateAnimationFrameLabel(frame);

    if (state.radar.activeLayer && climateMap.hasLayer(state.radar.activeLayer)) {
      climateMap.removeLayer(state.radar.activeLayer);
    }

    state.radar.activeLayer = L.tileLayer(frame.url, {
      attribution: 'Radar © RainViewer',
      opacity: 0.72,
      pane: 'overlayPane'
    }).addTo(climateMap);
    noteOverlayRendered();
  }

  function clearRadarLayer() {
    if (state.radar.activeLayer && climateMap && climateMap.hasLayer(state.radar.activeLayer)) {
      climateMap.removeLayer(state.radar.activeLayer);
    }
    state.radar.activeLayer = null;
  }

  function clearFieldOverlay() {
    fieldRenderer?.clear();
  }

  function toggleAnimation() {
    state.animation.playing = !state.animation.playing;
    updateAnimationButton();
    restartAnimationLoop();
  }

  function updateAnimationButton() {
    if (!dom.animationPlayBtn) return;
    dom.animationPlayBtn.textContent = state.animation.playing ? 'Pausar loop' : 'Retomar loop';
  }

  function getAnimationFrameCount() {
    return state.weatherLayer === 'radar'
      ? state.radar.frames.length
      : state.fieldOverlay.bundle?.frames?.length
        || state.resilience.lastGoodFieldBundle?.frames?.length
        || 0;
  }

  function renderAnimationFrame() {
    try {
      if (state.weatherLayer === 'radar') {
        showRadarFrame(state.animation.frameIndex);
        return;
      }

      const activeBundle = state.fieldOverlay.bundle || state.resilience.lastGoodFieldBundle;
      if (!activeBundle?.frames?.length) return;

      state.fieldOverlay.bundle = activeBundle;
      fieldRenderer?.draw(activeBundle, state.weatherLayer, state.animation.frameIndex);
      noteOverlayRendered();
      updateAnimationFrameLabel();
    } catch (error) {
      console.warn('Falha ao animar quadro meteorolÃ³gico:', error);
      recoverRuntime('A animaÃ§Ã£o climÃ¡tica falhou.', { forceRefresh: false });
    }
  }

  function restartAnimationLoop() {
    stopAnimationLoop();

    const frameCount = getAnimationFrameCount();

    updateAnimationFrameLabel();

    if (!state.animation.playing || frameCount <= 1 || state.activeTab !== 'clima') {
      return;
    }

    state.animation.lastTickAt = 0;

    if (document.hidden) {
      state.animation.timer = window.setTimeout(() => {
        if (!state.animation.playing || state.activeTab !== 'clima') {
          state.animation.timer = null;
          return;
        }

        const hiddenFrameCount = getAnimationFrameCount();
        if (hiddenFrameCount <= 1) {
          restartAnimationLoop();
          return;
        }

        state.animation.frameIndex = (state.animation.frameIndex + 1) % hiddenFrameCount;
        renderAnimationFrame();
        restartAnimationLoop();
      }, Math.max(state.animation.speedMs, RESILIENCE_LIMITS.hiddenAnimationFloorMs));
      return;
    }

    const step = (timestamp) => {
      if (!state.animation.playing || state.activeTab !== 'clima') {
        state.animation.timer = null;
        return;
      }

      if (document.hidden) {
        restartAnimationLoop();
        return;
      }

      const nextFrameCount = getAnimationFrameCount();
      if (nextFrameCount <= 1) {
        state.animation.timer = window.requestAnimationFrame(step);
        return;
      }

      if (!state.animation.lastTickAt) {
        state.animation.lastTickAt = timestamp;
      }

      const frameDuration = document.hidden
        ? Math.max(state.animation.speedMs, RESILIENCE_LIMITS.hiddenAnimationFloorMs)
        : state.animation.speedMs;

      if (timestamp - state.animation.lastTickAt >= frameDuration) {
        state.animation.lastTickAt = timestamp;
        state.animation.frameIndex = (state.animation.frameIndex + 1) % nextFrameCount;
        renderAnimationFrame();
      }

      state.animation.timer = window.requestAnimationFrame(step);
    };

    state.animation.timer = window.requestAnimationFrame(step);
  }

  function stopAnimationLoop() {
    window.clearTimeout(state.animation.timer);
    window.cancelAnimationFrame(state.animation.timer);
    state.animation.timer = null;
    state.animation.lastTickAt = 0;
  }

  function updateAnimationFrameLabel(frame) {
    if (!dom.animationFrameLabel) return;

    const activeFrame = frame
      || (state.weatherLayer === 'radar'
        ? state.radar.frames[state.animation.frameIndex % Math.max(1, state.radar.frames.length)]
        : (state.fieldOverlay.bundle || state.resilience.lastGoodFieldBundle)?.frames?.[state.animation.frameIndex % Math.max(1, (state.fieldOverlay.bundle || state.resilience.lastGoodFieldBundle)?.frames?.length || 1)]);

    if (!activeFrame) {
      dom.animationFrameLabel.textContent = 'Sem frames carregados';
      return;
    }

    if (state.weatherLayer === 'radar') {
      dom.animationFrameLabel.textContent = `${activeFrame.kind} • ${formatHour(activeFrame.time)}`;
      return;
    }

    dom.animationFrameLabel.textContent = `${activeFrame.label || 'Agora'} • ${formatHour(activeFrame.time)}`;
  }

  function updateRadarStatus(message) {
    if (dom.radarStatus) {
      dom.radarStatus.textContent = message;
    }
  }

  // Drone: flight analysis, status, and recommendations
  function renderDroneTab() {
    if (!state.weatherBundle) return;

    const analysis = buildFlightAnalysis(state.weatherBundle);

    updateStatusPanel(analysis);
    updateAnalysisGrid(analysis);
    updateWeatherMetrics(state.weatherBundle.current);
    updateRecommendations(analysis, state.weatherBundle.current);

    if (droneMap) {
      syncMapMarkers(false);
    }
  }

  function buildFlightAnalysis(bundle) {
    const serviceAnalysis = window.SkyDroneServices?.flightSafetyService?.evaluateBundle?.(bundle, {
      cacheInfo: state.cacheInfo
    });
    if (serviceAnalysis) {
      return window.SkyDroneServices.flightSafetyService.toTabsAnalysis(
        serviceAnalysis,
        bundle.analytics?.sourceConsensus || null
      );
    }

    const current = bundle.current;
    const sourceConsensus = bundle.analytics?.sourceConsensus || null;
    const metrics = {
      wind: {
        value: current.windSpeed,
        status: evaluateUpperMetric(current.windSpeed, 20, 30),
        warningText: 'Vento moderado. Evite voos altos e amplie a margem de retorno.',
        dangerText: 'Vento forte. Operação fora da janela recomendada.'
      },
      gusts: {
        value: current.windGusts,
        status: evaluateUpperMetric(current.windGusts, 35, 45),
        warningText: 'Rajadas podem desestabilizar hover e pouso.',
        dangerText: 'Rajadas fortes. Risco elevado de perda de estabilidade.'
      },
      rain: {
        value: current.rainProbability,
        status: evaluateUpperMetric(current.rainProbability, 30, 60),
        warningText: 'Possibilidade de chuva. Planeje pouso alternativo.',
        dangerText: 'Alta chance de chuva. Não recomendado decolar.'
      },
      visibility: {
        value: current.visibilityKm,
        status: evaluateLowerMetric(current.visibilityKm, 6, 3),
        warningText: 'Visibilidade reduzida. Mantenha o drone em VLOS constante.',
        dangerText: 'Visibilidade crítica. Operação visual comprometida.'
      },
      humidity: {
        value: current.humidity,
        status: evaluateUpperMetric(current.humidity, 85, 92),
        warningText: 'Umidade elevada. Inspecione sensores e carcaça antes do voo.',
        dangerText: 'Umidade extrema. Maior risco de condensação e falha elétrica.'
      },
      feelsLike: {
        value: current.feelsLike,
        status: evaluateBandMetric(current.feelsLike, 5, 32, 0, 38),
        warningText: 'Sensação térmica fora da faixa ideal. Monitore bateria e eletrônica.',
        dangerText: 'Temperatura aparente extrema. Estresse elevado para bateria e motor.'
      }
    };

    const penaltyMap = {
      wind: { warning: 18, danger: 34 },
      gusts: { warning: 14, danger: 28 },
      rain: { warning: 16, danger: 32 },
      visibility: { warning: 18, danger: 34 },
      humidity: { warning: 8, danger: 16 },
      feelsLike: { warning: 10, danger: 18 }
    };

    let score = 100;
    let warningCount = 0;
    let dangerCount = 0;

    Object.entries(metrics).forEach(([key, metric]) => {
      if (metric.status === 'warning') {
        warningCount += 1;
        score -= penaltyMap[key].warning;
      }
      if (metric.status === 'danger') {
        dangerCount += 1;
        score -= penaltyMap[key].danger;
      }
    });

    if (sourceConsensus?.available && sourceConsensus.overallStatus === 'warning') {
      warningCount += 1;
      score -= sourceConsensus.windConflict || sourceConsensus.rainConflict ? 10 : 6;
    }

    score = Math.max(0, Math.round(score));

    let overallStatus = 'safe';
    if (dangerCount > 0 || score < 45) {
      overallStatus = 'danger';
    } else if (warningCount >= 2 || score < 75) {
      overallStatus = 'warning';
    }

    if (overallStatus === 'safe' && sourceConsensus?.available && sourceConsensus.overallStatus === 'warning') {
      overallStatus = 'warning';
    }

    const badges = [];
    if (sourceConsensus?.windConflict) badges.push('Vento varia entre fontes');
    if (sourceConsensus?.rainConflict) badges.push('Chuva varia entre fontes');
    if (metrics.wind.status !== 'ok') badges.push(metrics.wind.status === 'danger' ? 'Vento acima do limite' : 'Vento exige cautela');
    if (metrics.gusts.status !== 'ok') badges.push(metrics.gusts.status === 'danger' ? 'Rajadas críticas' : 'Rajadas moderadas');
    if (metrics.rain.status !== 'ok') badges.push(metrics.rain.status === 'danger' ? 'Janela de chuva crítica' : 'Chance de chuva presente');
    if (metrics.visibility.status !== 'ok') badges.push(metrics.visibility.status === 'danger' ? 'Baixa visibilidade severa' : 'Visibilidade reduzida');
    if (sourceConsensus?.available && sourceConsensus.overallStatus === 'safe') badges.push('Alta concordância entre fontes');
    if (!badges.length) {
      badges.push('Vento dentro do limite');
      badges.push('Boa visibilidade');
      badges.push('Baixa chance de chuva');
    }

    const leadRisk =
      metrics.rain.status === 'danger' ? metrics.rain.dangerText :
      metrics.wind.status === 'danger' ? metrics.wind.dangerText :
      metrics.gusts.status === 'danger' ? metrics.gusts.dangerText :
      metrics.visibility.status === 'danger' ? metrics.visibility.dangerText :
      metrics.humidity.status === 'danger' ? metrics.humidity.dangerText :
      metrics.feelsLike.status === 'danger' ? metrics.feelsLike.dangerText :
      sourceConsensus?.available && sourceConsensus.overallStatus === 'warning' ? sourceConsensus.leadMessage :
      metrics.rain.status === 'warning' ? metrics.rain.warningText :
      metrics.wind.status === 'warning' ? metrics.wind.warningText :
      metrics.gusts.status === 'warning' ? metrics.gusts.warningText :
      metrics.visibility.status === 'warning' ? metrics.visibility.warningText :
      metrics.humidity.status === 'warning' ? metrics.humidity.warningText :
      metrics.feelsLike.status === 'warning' ? metrics.feelsLike.warningText :
      'Janela operacional estável para planejamento de missão.';

    return {
      ...metrics,
      score,
      overallStatus,
      badges: badges.slice(0, 3),
      leadRisk,
      sourceConsensus
    };
  }

  function updateStatusPanel(analysis) {
    dom.flightStatusPanel.className = `flight-status-panel ${analysis.overallStatus}`;
    dom.flightScore.textContent = analysis.score;
    dom.flightBadges.innerHTML = analysis.badges
      .map((badge) => `<span class="status-badge">${badge}</span>`)
      .join('');

    if (analysis.overallStatus === 'safe') {
      dom.statusIcon.textContent = '✅';
      dom.statusTitle.textContent = 'Seguro';
      if (analysis.smartRecommendation) {
        dom.statusSubtitle.textContent = analysis.smartRecommendation;
      }
      dom.statusSubtitle.textContent = 'Janela favorável para voo. Ainda assim, faça checklist e confirme área segura.';
      if (analysis.smartRecommendation) {
        dom.statusSubtitle.textContent = analysis.smartRecommendation;
      }
      return;
    }

    if (analysis.overallStatus === 'warning') {
      dom.statusIcon.textContent = '⚠️';
      dom.statusTitle.textContent = 'Atenção';
      dom.statusSubtitle.textContent = analysis.leadRisk;
      return;
    }

    dom.statusIcon.textContent = '❌';
    dom.statusTitle.textContent = 'Não recomendado';
    dom.statusSubtitle.textContent = analysis.leadRisk;
  }

  function updateAnalysisGrid(analysis) {
    const items = [
      { valueEl: dom.analysisWind, statusEl: dom.windStatus, value: `${formatNumber(analysis.wind.value)} km/h`, status: analysis.wind.status },
      { valueEl: dom.analysisGusts, statusEl: dom.gustsStatus, value: `${formatNumber(analysis.gusts.value)} km/h`, status: analysis.gusts.status },
      { valueEl: dom.analysisRain, statusEl: dom.rainStatus, value: `${Math.round(valueOr(analysis.rain.value, 0))}%`, status: analysis.rain.status },
      { valueEl: dom.analysisVis, statusEl: dom.visStatus, value: `${formatNumber(analysis.visibility.value)} km`, status: analysis.visibility.status },
      { valueEl: dom.analysisHumidity, statusEl: dom.humidityStatus, value: `${Math.round(valueOr(analysis.humidity.value, 0))}%`, status: analysis.humidity.status },
      { valueEl: dom.analysisFeels, statusEl: dom.feelsStatus, value: `${formatNumber(analysis.feelsLike.value)}°C`, status: analysis.feelsLike.status }
    ];

    items.forEach((item, index) => {
      item.valueEl.textContent = item.value;
      item.statusEl.textContent = getStatusSymbol(item.status);
      item.statusEl.closest('.analysis-item').className = `analysis-item ${item.status}`;
      if (dom.analysisItems[index]) {
        dom.analysisItems[index].className = `analysis-item ${item.status}`;
      }
    });
  }

  function updateWeatherMetrics(current) {
    dom.metricWind.textContent = formatNumber(current.windSpeed);
    dom.metricGusts.textContent = formatNumber(current.windGusts);
    dom.metricDirection.textContent = `${formatNumber(current.windDirection, 0)}°`;
    dom.metricDirectionText.textContent = getWindDirection(current.windDirection);
    dom.metricTemp.textContent = formatNumber(current.temperature);
    dom.metricFeelsLike.textContent = formatNumber(current.feelsLike);
    dom.metricHumidity.textContent = Math.round(valueOr(current.humidity, 0));
    dom.metricPressure.textContent = formatNumber(current.pressure, 0);
    dom.metricVisibility.textContent = formatNumber(current.visibilityKm);
    dom.metricRainProb.textContent = Math.round(valueOr(current.rainProbability, 0));
    dom.metricClouds.textContent = Math.round(valueOr(current.cloudCover, 0));
  }

  function updateRecommendations(analysis, current) {
    const recommendations = [];

    if (analysis.smartRecommendation) {
      recommendations.push({
        icon: analysis.overallStatus === 'danger' ? '!' : analysis.overallStatus === 'warning' ? '!' : 'OK',
        text: analysis.smartRecommendation
      });
    }

    if (analysis.sourceConsensus?.available) {
      if (analysis.sourceConsensus.overallStatus === 'warning') {
        recommendations.push({
          icon: '📡',
          text: analysis.sourceConsensus.leadMessage
        });
      } else if (analysis.overallStatus === 'safe') {
        recommendations.push({
          icon: '📡',
          text: 'Alta concordância entre fontes: condições mais previsíveis para tomada de decisão de voo.'
        });
      }
    }

    if (analysis.rain.status !== 'ok') {
      recommendations.push({
        icon: '🌧️',
        text: 'Possibilidade de chuva. Planeje pouso alternativo e reduza o raio de missão.'
      });
    }
    if (analysis.wind.status !== 'ok') {
      recommendations.push({
        icon: '💨',
        text: 'Vento forte. Evite voos altos, acelerações bruscas e trajetórias longas contra o vento.'
      });
    }
    if (analysis.gusts.status !== 'ok') {
      recommendations.push({
        icon: '🌪️',
        text: 'Rajadas irregulares podem desestabilizar hover e aproximação. Priorize pousos conservadores.'
      });
    }
    if (analysis.visibility.status !== 'ok') {
      recommendations.push({
        icon: '👁️',
        text: 'Visibilidade reduzida. Mantenha o drone sempre em linha de visão e encurte a distância operacional.'
      });
    }
    if (analysis.humidity.status !== 'ok') {
      recommendations.push({
        icon: '💧',
        text: 'Umidade elevada. Verifique selagem, lente e sinais de condensação antes da decolagem.'
      });
    }
    if (current.temperature > 35 || current.feelsLike > 38) {
      recommendations.push({
        icon: '🌡️',
        text: 'Calor elevado. Monitore temperatura da bateria e prefira missões curtas com pausas.'
      });
    }
    if (current.temperature < 5 || current.feelsLike < 0) {
      recommendations.push({
        icon: '🧊',
        text: 'Frio intenso. Considere aquecimento prévio da bateria e reserve mais margem para retorno.'
      });
    }
    if (!recommendations.length) {
      recommendations.push({
        icon: '✅',
        text: 'Condições estáveis no momento. Ainda confirme checklist, zona aérea, RTH e carga útil antes de voar.'
      });
    }

    dom.recommendationsList.innerHTML = recommendations
      .map((recommendation) => `
        <div class="recommendation-item">
          <span class="rec-icon">${recommendation.icon}</span>
          <span class="rec-text">${recommendation.text}</span>
        </div>
      `)
      .join('');
  }

  function updateTimestamp() {
    if (!state.lastUpdate) return;
    dom.lastUpdate.textContent = formatDateTime(state.lastUpdate);
  }

  function startAutoRefresh(delayMs = getBaseRefreshDelayMs()) {
    window.clearTimeout(state.timers.refresh);
    window.clearInterval(state.timers.countdown);
    window.SkyDroneServices?.autoUpdateService?.stop?.();

    const safeDelay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : getBaseRefreshDelayMs();
    const normalizedDelay = Math.max(1000, Math.round(safeDelay));
    state.resilience.scheduledRefreshAt = Date.now() + normalizedDelay;
    state.countdown = Math.max(0, Math.ceil(normalizedDelay / 1000));
    updateCountdown();

    if (window.SkyDroneServices?.autoUpdateService?.schedule) {
      const handles = window.SkyDroneServices.autoUpdateService.schedule({
        delayMs: normalizedDelay,
        onCountdown: (seconds) => {
          state.countdown = seconds;
          updateCountdown();
        },
        onRefresh: () => {
          if (state.resilience.refreshInFlight) {
            startAutoRefresh(3000);
            return;
          }

          const confidence = Number(state.weatherBundle?.analytics?.confidence);
          const lowConfidence = Number.isFinite(confidence) && confidence < 70;
          refreshWeather({
            showLoading: false,
            force: lowConfidence || !state.resilience.online || state.resilience.consecutiveRefreshFailures > 0
          });
        }
      });
      state.timers.refresh = handles.refreshTimer;
      state.timers.countdown = handles.countdownTimer;
      return;
    }

    state.timers.refresh = window.setTimeout(() => {
      if (state.resilience.refreshInFlight) {
        startAutoRefresh(3000);
        return;
      }

      const confidence = Number(state.weatherBundle?.analytics?.confidence);
      const lowConfidence = Number.isFinite(confidence) && confidence < 70;
      refreshWeather({
        showLoading: false,
        force: lowConfidence || !state.resilience.online || state.resilience.consecutiveRefreshFailures > 0
      });
    }, normalizedDelay);

    state.timers.countdown = window.setInterval(() => {
      state.countdown = getScheduledSecondsRemaining();
      updateCountdown();
    }, 1000);
  }

  function updateCountdown() {
    if (dom.countdown) {
      dom.countdown.textContent = String(getScheduledSecondsRemaining());
    }
  }

  function showLoadingOverlay(show, message = 'Atualizando dados...') {
    if (dom.loadingText) {
      dom.loadingText.textContent = message;
    }
    if (!dom.loadingOverlay) return;

    if (show) {
      dom.loadingOverlay.classList.remove('hidden');
      return;
    }
    dom.loadingOverlay.classList.add('hidden');
  }

  function showError(message) {
    if (state.resilience.lastGoodWeatherBundle) {
      state.weatherBundle = state.resilience.lastGoodWeatherBundle;
      state.providerRuns = state.resilience.lastGoodProviderRuns.slice();
      state.cacheInfo = {
        used: true,
        stale: true,
        ageMs: state.resilience.lastSuccessfulRefreshAt
          ? Date.now() - state.resilience.lastSuccessfulRefreshAt
          : state.resilience.lastGoodCacheInfo.ageMs
      };
      state.lastUpdate = new Date(state.resilience.lastSuccessfulRefreshAt || Date.now());
      setResilienceNotice(buildResilienceNotice(
        message || 'Falha temporÃ¡ria. Mantendo o Ãºltimo quadro vÃ¡lido.'
      ));
      renderClimateTab();
      renderDroneTab();
      updateTimestamp();
      return;
    }

    if (dom.currentSummary) {
      dom.currentSummary.textContent = message;
    }
    if (dom.climateInsights) {
      dom.climateInsights.innerHTML = createInsightChip({ tone: 'danger', text: message });
    }
    if (dom.alertStream) {
      dom.alertStream.innerHTML = `
        <article class="alert-card danger">
          <strong>Dados indisponíveis</strong>
          <p>${message}</p>
          <small>Fallback interrompido</small>
        </article>
      `;
    }
    if (dom.recommendationsList) {
      dom.recommendationsList.innerHTML = `
        <div class="recommendation-item">
          <span class="rec-icon">⚠️</span>
          <span class="rec-text">${message}</span>
        </div>
      `;
    }
    if (dom.statusIcon) dom.statusIcon.textContent = '⚠️';
    if (dom.statusTitle) dom.statusTitle.textContent = 'Dados indisponíveis';
    if (dom.statusSubtitle) dom.statusSubtitle.textContent = message;
    if (dom.flightScore) dom.flightScore.textContent = '--';
    if (dom.flightBadges) dom.flightBadges.innerHTML = '';
  }

  // Mapa: internal canvas renderer for field overlays
  function createWeatherFieldRenderer(map) {
    const overlayPane = map.getPanes().overlayPane;
    const rasterCanvas = L.DomUtil.create('canvas', 'climate-overlay-canvas', overlayPane);
    const particleCanvas = L.DomUtil.create('canvas', 'climate-particle-canvas', overlayPane);
    const loadingBadge = L.DomUtil.create('div', 'climate-map-loading hidden', map.getContainer());
    loadingBadge.textContent = 'Gerando campo meteorológico...';

    const rasterCtx = rasterCanvas.getContext('2d');
    const particleCtx = particleCanvas.getContext('2d');
    const particleState = {
      particles: [],
      frame: null,
      activeLayer: '',
      animationId: 0,
      lastTickAt: 0
    };

    let activeBundle = null;
    let activeLayer = 'temperature';
    let activeFrameIndex = 0;

    function sync() {
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      const pixelRatio = window.devicePixelRatio || 1;

      [rasterCanvas, particleCanvas].forEach((canvas) => {
        L.DomUtil.setPosition(canvas, topLeft);
        canvas.width = size.x * pixelRatio;
        canvas.height = size.y * pixelRatio;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      });

      rasterCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particleCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      draw(activeBundle, activeLayer, activeFrameIndex);
    }

    function clear() {
      rasterCtx.clearRect(0, 0, rasterCanvas.width, rasterCanvas.height);
      particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      particleState.frame = null;
      particleState.activeLayer = '';
      particleState.lastTickAt = 0;
      if (particleState.particles.length > 180) {
        particleState.particles.length = 180;
      }
    }

    function draw(bundle, layer, frameIndex) {
      activeBundle = bundle;
      activeLayer = layer;
      activeFrameIndex = frameIndex;
      clear();

      if (!bundle || !bundle.frames?.length) return;

      const frame = bundle.frames[frameIndex % bundle.frames.length];
      if (!frame) return;

      particleState.frame = frame;
      particleState.activeLayer = layer;

      if (layer === 'pressure') {
        drawScalarCells(frame, 'pressure', 0.22);
        drawPressureContours(frame);
      } else if (layer === 'wind') {
        drawScalarCells(frame, 'windSpeed', 0.18);
        drawWindArrows(frame);
      } else if (layer === 'storms') {
        drawStormField(frame);
      } else {
        drawScalarCells(frame, layer, 0.48);
      }

      noteOverlayRendered();
    }

    function drawScalarCells(frame, layer, alpha) {
      frame.cells.forEach((cell) => {
        const value = getLayerValue(cell, layer);
        if (!Number.isFinite(value)) return;

        const bounds = getFieldCellBounds(cell, activeBundle.stepLat, activeBundle.stepLon);
        const northWest = map.latLngToContainerPoint([bounds.north, bounds.west]);
        const southEast = map.latLngToContainerPoint([bounds.south, bounds.east]);
        const x = Math.min(northWest.x, southEast.x);
        const y = Math.min(northWest.y, southEast.y);
        const width = Math.abs(southEast.x - northWest.x);
        const height = Math.abs(southEast.y - northWest.y);

        rasterCtx.fillStyle = getLayerColor(layer, value, alpha);
        rasterCtx.fillRect(x, y, width, height);
      });
    }

    function drawWindArrows(frame) {
      rasterCtx.save();
      rasterCtx.lineWidth = 1.2;
      rasterCtx.strokeStyle = 'rgba(248, 250, 252, 0.86)';
      rasterCtx.fillStyle = 'rgba(248, 250, 252, 0.92)';

      frame.cells.forEach((cell) => {
        if (!Number.isFinite(cell.windSpeed) || !Number.isFinite(cell.windDirection)) return;

        const origin = map.latLngToContainerPoint([cell.lat, cell.lon]);
        const vector = windVectorFromDirection(cell.windDirection, cell.windSpeed);
        const length = 8 + Math.min(26, cell.windSpeed * 0.35);
        const endX = origin.x + vector.x * length;
        const endY = origin.y + vector.y * length;

        rasterCtx.beginPath();
        rasterCtx.moveTo(origin.x, origin.y);
        rasterCtx.lineTo(endX, endY);
        rasterCtx.stroke();

        const angle = Math.atan2(vector.y, vector.x);
        rasterCtx.beginPath();
        rasterCtx.moveTo(endX, endY);
        rasterCtx.lineTo(endX - Math.cos(angle - 0.45) * 6, endY - Math.sin(angle - 0.45) * 6);
        rasterCtx.lineTo(endX - Math.cos(angle + 0.45) * 6, endY - Math.sin(angle + 0.45) * 6);
        rasterCtx.closePath();
        rasterCtx.fill();
      });

      rasterCtx.restore();
    }

    function drawStormField(frame) {
      frame.cells.forEach((cell) => {
        const risk = getStormRisk(cell);
        if (risk < 0.16) return;

        const center = map.latLngToContainerPoint([cell.lat, cell.lon]);
        const radius = 18 + risk * 16;
        const gradient = rasterCtx.createRadialGradient(center.x, center.y, 4, center.x, center.y, radius);
        gradient.addColorStop(0, getLayerColor('storms', risk, 0.76));
        gradient.addColorStop(1, getLayerColor('storms', 0, 0));
        rasterCtx.fillStyle = gradient;
        rasterCtx.beginPath();
        rasterCtx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        rasterCtx.fill();
      });
    }

    function drawPressureContours(frame) {
      const levels = buildPressureLevels(frame.matrix);
      if (!levels.length) return;

      rasterCtx.save();
      rasterCtx.strokeStyle = 'rgba(248, 250, 252, 0.74)';
      rasterCtx.lineWidth = 1;

      levels.forEach((level) => {
        rasterCtx.beginPath();
        for (let row = 0; row < frame.matrix.length - 1; row += 1) {
          for (let col = 0; col < frame.matrix[row].length - 1; col += 1) {
            const topLeft = frame.matrix[row][col];
            const topRight = frame.matrix[row][col + 1];
            const bottomRight = frame.matrix[row + 1][col + 1];
            const bottomLeft = frame.matrix[row + 1][col];

            if (![topLeft, topRight, bottomRight, bottomLeft].every(Boolean)) continue;

            const segments = buildMarchingSegments(topLeft, topRight, bottomRight, bottomLeft, level);
            segments.forEach(([a, b]) => {
              rasterCtx.moveTo(a.x, a.y);
              rasterCtx.lineTo(b.x, b.y);
            });
          }
        }
        rasterCtx.stroke();
      });

      rasterCtx.restore();
    }

    function buildPressureLevels(matrix) {
      const values = matrix.flat().filter(Boolean).map((cell) => cell.pressure).filter(Number.isFinite);
      if (!values.length) return [];
      const min = Math.floor(Math.min(...values) / 2) * 2;
      const max = Math.ceil(Math.max(...values) / 2) * 2;
      const levels = [];
      for (let level = min; level <= max; level += 2) {
        levels.push(level);
      }
      return levels;
    }

    function buildMarchingSegments(topLeft, topRight, bottomRight, bottomLeft, level) {
      const tl = valueOr(topLeft.pressure, null);
      const tr = valueOr(topRight.pressure, null);
      const br = valueOr(bottomRight.pressure, null);
      const bl = valueOr(bottomLeft.pressure, null);

      if (![tl, tr, br, bl].every(Number.isFinite)) return [];

      const mask =
        (tl >= level ? 1 : 0) |
        (tr >= level ? 2 : 0) |
        (br >= level ? 4 : 0) |
        (bl >= level ? 8 : 0);

      const lookup = {
        1: [['left', 'top']],
        2: [['top', 'right']],
        3: [['left', 'right']],
        4: [['right', 'bottom']],
        5: [['left', 'top'], ['right', 'bottom']],
        6: [['top', 'bottom']],
        7: [['left', 'bottom']],
        8: [['left', 'bottom']],
        9: [['top', 'bottom']],
        10: [['top', 'right'], ['bottom', 'left']],
        11: [['right', 'bottom']],
        12: [['left', 'right']],
        13: [['top', 'right']],
        14: [['left', 'top']]
      };

      const segments = lookup[mask] || [];
      return segments.map(([fromEdge, toEdge]) => [
        interpolatePressureEdge(fromEdge, topLeft, topRight, bottomRight, bottomLeft, level),
        interpolatePressureEdge(toEdge, topLeft, topRight, bottomRight, bottomLeft, level)
      ]);
    }

    function interpolatePressureEdge(edge, topLeft, topRight, bottomRight, bottomLeft, level) {
      if (edge === 'top') {
        return interpolateContourPoint(topLeft, topRight, topLeft.pressure, topRight.pressure, level);
      }
      if (edge === 'right') {
        return interpolateContourPoint(topRight, bottomRight, topRight.pressure, bottomRight.pressure, level);
      }
      if (edge === 'bottom') {
        return interpolateContourPoint(bottomLeft, bottomRight, bottomLeft.pressure, bottomRight.pressure, level);
      }
      return interpolateContourPoint(topLeft, bottomLeft, topLeft.pressure, bottomLeft.pressure, level);
    }

    function interpolateContourPoint(pointA, pointB, valueA, valueB, level) {
      const ratio = Number.isFinite(valueA) && Number.isFinite(valueB) && valueA !== valueB
        ? clamp((level - valueA) / (valueB - valueA), 0, 1)
        : 0.5;

      const lat = pointA.lat + (pointB.lat - pointA.lat) * ratio;
      const lon = pointA.lon + (pointB.lon - pointA.lon) * ratio;
      return map.latLngToContainerPoint([lat, lon]);
    }

    function animateParticles(timestamp) {
      particleState.animationId = window.requestAnimationFrame(animateParticles);

      if (particleState.activeLayer !== 'wind' || !particleState.frame || state.activeTab !== 'clima' || document.hidden) {
        particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
        particleState.lastTickAt = 0;
        return;
      }

      if (!particleState.lastTickAt) {
        particleState.lastTickAt = timestamp;
      }

      if (timestamp - particleState.lastTickAt < 33) {
        return;
      }

      particleState.lastTickAt = timestamp;

      ensureParticles();

      particleCtx.fillStyle = 'rgba(2, 6, 23, 0.06)';
      particleCtx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);
      particleCtx.strokeStyle = 'rgba(148, 250, 255, 0.42)';
      particleCtx.lineWidth = 1.1;

      const size = map.getSize();

      particleState.particles.forEach((particle) => {
        const latLng = map.containerPointToLatLng([particle.x, particle.y]);
        const cell = findNearestFieldCell(particleState.frame.cells, latLng.lat, latLng.lng);
        if (!cell) {
          resetParticle(particle, size);
          return;
        }

        const vector = windVectorFromDirection(cell.windDirection, cell.windSpeed);
        const speedScale = 0.8 + Math.min(2.4, valueOr(cell.windSpeed, 0) / 18);
        const nextX = particle.x + vector.x * speedScale;
        const nextY = particle.y + vector.y * speedScale;

        particleCtx.beginPath();
        particleCtx.moveTo(particle.x, particle.y);
        particleCtx.lineTo(nextX, nextY);
        particleCtx.stroke();

        particle.x = nextX;
        particle.y = nextY;
        particle.life -= 1;

        if (particle.life <= 0 || nextX < 0 || nextY < 0 || nextX > size.x || nextY > size.y) {
          resetParticle(particle, size);
        }
      });
    }

    function ensureParticles() {
      const size = map.getSize();
      const desiredCount = Math.max(60, Math.round((size.x * size.y) / 9000));
      if (particleState.particles.length > desiredCount * 1.35) {
        particleState.particles.length = desiredCount;
      }
      while (particleState.particles.length < desiredCount) {
        particleState.particles.push(createParticle(size));
      }
    }

    function createParticle(size) {
      return {
        x: Math.random() * size.x,
        y: Math.random() * size.y,
        life: Math.floor(Math.random() * 90) + 40
      };
    }

    function resetParticle(particle, size) {
      particle.x = Math.random() * size.x;
      particle.y = Math.random() * size.y;
      particle.life = Math.floor(Math.random() * 90) + 40;
    }

    function pauseParticles() {
      particleState.activeLayer = '';
      particleState.lastTickAt = 0;
      particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    }

    function resumeParticles() {
      if (activeLayer === 'wind' && activeBundle) {
        particleState.activeLayer = 'wind';
        particleState.lastTickAt = 0;
      }
    }

    function showLoading(text) {
      loadingBadge.textContent = text;
      loadingBadge.classList.remove('hidden');
    }

    function hideLoading() {
      loadingBadge.classList.add('hidden');
    }

    animateParticles();
    sync();

    return {
      sync,
      draw,
      clear,
      pauseParticles,
      resumeParticles,
      showLoading,
      hideLoading
    };
  }

  function getFieldCellBounds(cell, stepLat, stepLon) {
    return {
      north: cell.lat + stepLat / 2,
      south: cell.lat - stepLat / 2,
      west: cell.lon - stepLon / 2,
      east: cell.lon + stepLon / 2
    };
  }

  function getLayerValue(cell, layer) {
    if (layer === 'temperature') return cell.temperature;
    if (layer === 'humidity') return cell.humidity;
    if (layer === 'feelsLike') return cell.feelsLike;
    if (layer === 'precipitation') return cell.precipitation;
    if (layer === 'clouds') return cell.cloudCover;
    if (layer === 'pressure') return cell.pressure;
    if (layer === 'windSpeed' || layer === 'wind') return cell.windSpeed;
    return null;
  }

  function getLayerColor(layer, value, alpha = 0.42) {
    if (!Number.isFinite(value)) return 'rgba(0,0,0,0)';

    const palettes = {
      temperature: [
        { stop: -8, color: '#1d4ed8' },
        { stop: 0, color: '#38bdf8' },
        { stop: 12, color: '#22c55e' },
        { stop: 24, color: '#facc15' },
        { stop: 32, color: '#f97316' },
        { stop: 40, color: '#ef4444' }
      ],
      humidity: [
        { stop: 0, color: '#0f172a' },
        { stop: 40, color: '#0ea5e9' },
        { stop: 70, color: '#22d3ee' },
        { stop: 100, color: '#ecfeff' }
      ],
      feelsLike: [
        { stop: -8, color: '#2563eb' },
        { stop: 8, color: '#14b8a6' },
        { stop: 20, color: '#84cc16' },
        { stop: 30, color: '#f59e0b' },
        { stop: 40, color: '#e11d48' }
      ],
      precipitation: [
        { stop: 0, color: '#0f172a' },
        { stop: 1, color: '#0ea5e9' },
        { stop: 4, color: '#60a5fa' },
        { stop: 8, color: '#8b5cf6' },
        { stop: 16, color: '#db2777' }
      ],
      clouds: [
        { stop: 0, color: '#1e293b' },
        { stop: 40, color: '#64748b' },
        { stop: 70, color: '#cbd5e1' },
        { stop: 100, color: '#ffffff' }
      ],
      pressure: [
        { stop: 992, color: '#312e81' },
        { stop: 1004, color: '#2563eb' },
        { stop: 1014, color: '#0f766e' },
        { stop: 1022, color: '#84cc16' },
        { stop: 1032, color: '#facc15' }
      ],
      windSpeed: [
        { stop: 0, color: '#0f172a' },
        { stop: 12, color: '#22d3ee' },
        { stop: 22, color: '#0ea5e9' },
        { stop: 32, color: '#8b5cf6' },
        { stop: 45, color: '#f43f5e' }
      ],
      storms: [
        { stop: 0, color: '#000000' },
        { stop: 0.25, color: '#facc15' },
        { stop: 0.5, color: '#f97316' },
        { stop: 0.75, color: '#ef4444' },
        { stop: 1, color: '#db2777' }
      ]
    };

    const palette = palettes[layer] || palettes.temperature;
    const color = interpolateColorStops(palette, value);
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  }

  function interpolateColorStops(stops, value) {
    if (value <= stops[0].stop) return hexToRgb(stops[0].color);
    if (value >= stops[stops.length - 1].stop) return hexToRgb(stops[stops.length - 1].color);

    for (let index = 0; index < stops.length - 1; index += 1) {
      const start = stops[index];
      const end = stops[index + 1];
      if (value >= start.stop && value <= end.stop) {
        const ratio = (value - start.stop) / (end.stop - start.stop);
        const startRgb = hexToRgb(start.color);
        const endRgb = hexToRgb(end.color);
        return {
          r: Math.round(startRgb.r + (endRgb.r - startRgb.r) * ratio),
          g: Math.round(startRgb.g + (endRgb.g - startRgb.g) * ratio),
          b: Math.round(startRgb.b + (endRgb.b - startRgb.b) * ratio)
        };
      }
    }

    return hexToRgb(stops[stops.length - 1].color);
  }

  function hexToRgb(color) {
    const normalized = color.replace('#', '');
    const safe = normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized;
    return {
      r: parseInt(safe.slice(0, 2), 16),
      g: parseInt(safe.slice(2, 4), 16),
      b: parseInt(safe.slice(4, 6), 16)
    };
  }

  function getStormRisk(cell) {
    const thunder = [95, 96, 99].includes(cell.weatherCode) ? 0.55 : 0;
    const rain = clamp(valueOr(cell.rainProbability, 0) / 100, 0, 1) * 0.25;
    const gusts = clamp(valueOr(cell.windGusts, 0) / 55, 0, 1) * 0.2;
    return clamp(thunder + rain + gusts, 0, 1);
  }

  function windVectorFromDirection(direction, speed) {
    const bearing = ((valueOr(direction, 0) + 180) % 360) - 90;
    const radians = (bearing * Math.PI) / 180;
    const magnitude = Math.max(0.2, valueOr(speed, 0) / 28);
    return {
      x: Math.cos(radians) * magnitude,
      y: Math.sin(radians) * magnitude
    };
  }

  function findNearestFieldCell(cells, lat, lon) {
    let nearest = null;
    let smallestDistance = Number.POSITIVE_INFINITY;

    cells.forEach((cell) => {
      const distance = Math.abs(cell.lat - lat) + Math.abs(cell.lon - lon);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        nearest = cell;
      }
    });

    return nearest;
  }

  function createTileLayer(url, attribution) {
    return L.tileLayer(url, {
      attribution,
      maxZoom: 19
    });
  }

  function buildHourlySnapshotFromOpenMeteo(hourly, index) {
    if (!hourly || !Array.isArray(hourly.time) || index == null || index < 0 || index >= hourly.time.length) {
      return {
        temperature: null,
        feelsLike: null,
        humidity: null,
        pressure: null,
        visibilityKm: null,
        windSpeed: null,
        windDirection: null,
        windGusts: null,
        cloudCover: null,
        rainProbability: null,
        precipitation: null,
        uvIndex: null,
        weatherCode: null
      };
    }

    return {
      temperature: valueOr(hourly.temperature_2m?.[index], null),
      feelsLike: valueOr(hourly.apparent_temperature?.[index], null),
      humidity: valueOr(hourly.relative_humidity_2m?.[index], null),
      pressure: valueOr(hourly.pressure_msl?.[index], null),
      visibilityKm: valueOr(hourly.visibility?.[index], null) != null ? hourly.visibility[index] / 1000 : null,
      windSpeed: valueOr(hourly.wind_speed_10m?.[index], null),
      windDirection: valueOr(hourly.wind_direction_10m?.[index], null),
      windGusts: valueOr(hourly.wind_gusts_10m?.[index], null),
      cloudCover: valueOr(hourly.cloud_cover?.[index], null),
      rainProbability: valueOr(hourly.precipitation_probability?.[index], null),
      precipitation: valueOr(hourly.precipitation?.[index], null),
      uvIndex: valueOr(hourly.uv_index?.[index], null),
      weatherCode: valueOr(hourly.weather_code?.[index], null)
    };
  }

  function collectCanonicalHours(runs) {
    const preferred = pickPreferredProvider(runs, 'hourly');
    if (preferred?.hourly?.length) {
      return preferred.hourly.slice(0, 48).map((entry) => entry.time);
    }

    const keys = new Set();
    runs.forEach((run) => {
      run.hourly.slice(0, 48).forEach((entry) => keys.add(entry.time));
    });
    return Array.from(keys).sort();
  }

  function collectCanonicalDays(runs) {
    const preferred = pickPreferredProvider(runs, 'daily');
    if (preferred?.daily?.length) {
      return preferred.daily.slice(0, 14).map((entry) => entry.dateKey);
    }

    const keys = new Set();
    runs.forEach((run) => {
      run.daily.slice(0, 14).forEach((entry) => keys.add(entry.dateKey));
    });
    return Array.from(keys).sort();
  }

  function pickPreferredProvider(runs, type) {
    const minimumLength = type === 'daily' ? 14 : type === 'hourly' ? 48 : 1;
    const orderedRuns = PROVIDER_ORDER
      .map((providerKey) => runs.find((run) => run.providerKey === providerKey && Array.isArray(run[type]) && run[type].length))
      .filter(Boolean);

    return orderedRuns.find((run) => (run[type]?.length || 0) >= minimumLength)
      || orderedRuns.sort((a, b) => (b[type]?.length || 0) - (a[type]?.length || 0))[0]
      || runs.find((run) => Array.isArray(run[type]) && run[type].length);
  }

  function selectRepresentativeHour(dayHours, dayIndex) {
    if (!dayHours.length) return null;
    if (dayIndex === 0) return dayHours[0];

    let best = dayHours[0];
    let smallestDistance = Number.POSITIVE_INFINITY;

    dayHours.forEach((hour) => {
      const distance = Math.abs(new Date(hour.time).getHours() - 14);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        best = hour;
      }
    });

    return best;
  }

  function findClosestHourIndex(hourlyTimes, targetTime) {
    if (!Array.isArray(hourlyTimes) || !hourlyTimes.length) return 0;

    const targetDate = new Date(targetTime).getTime();
    let bestIndex = 0;
    let smallestDistance = Number.POSITIVE_INFINITY;

    hourlyTimes.forEach((time, index) => {
      const distance = Math.abs(new Date(time).getTime() - targetDate);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  function findClosestHourlyEntry(series, targetTime, maxDiffMinutes) {
    if (!Array.isArray(series) || !series.length) return null;

    const target = new Date(targetTime).getTime();
    let bestEntry = null;
    let smallest = Number.POSITIVE_INFINITY;

    series.forEach((entry) => {
      const distance = Math.abs(new Date(entry.time).getTime() - target);
      if (distance < smallest) {
        smallest = distance;
        bestEntry = entry;
      }
    });

    return smallest <= maxDiffMinutes * 60 * 1000 ? bestEntry : null;
  }

  function createInsightChip(message) {
    return `<div class="climate-insight-chip ${message.tone}"><span>${getToneIcon(message.tone)}</span><span>${message.text}</span></div>`;
  }

  function getToneIcon(tone) {
    if (tone === 'danger') return '❗';
    if (tone === 'warning') return '⚠️';
    return '✓';
  }

  function getStatusSymbol(status) {
    if (status === 'danger') return '❌';
    if (status === 'warning') return '⚠️';
    return '✓';
  }

  function getClimateHeadline(metrics) {
    if ([95, 96, 99].includes(metrics.weatherCode)) return 'Condições severas possíveis';
    if (metrics.rainProbability >= 70) return 'Alta chance de chuva';
    if (metrics.windSpeed >= 30 || metrics.windGusts >= 45) return 'Vento em nível crítico';
    if (metrics.visibilityKm < 3) return 'Baixa visibilidade';
    if (metrics.confidence >= 82 && metrics.rainProbability < 25 && metrics.windSpeed < 18) return 'Tempo estável';
    if (metrics.rainProbability >= 40) return 'Instabilidade moderada';
    return 'Céu variável';
  }

  function getWindDirection(degrees) {
    if (!Number.isFinite(degrees)) return '--';
    const directions = ['Norte', 'NNE', 'Nordeste', 'ENE', 'Leste', 'ESE', 'Sudeste', 'SSE', 'Sul', 'SSW', 'Sudoeste', 'WSW', 'Oeste', 'WNW', 'Noroeste', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
  }

  function getWeatherPresentation(code, isDay) {
    if (code === 0) return { icon: isDay ? '☀️' : '🌙', label: isDay ? 'Céu limpo' : 'Noite limpa' };
    if ([1].includes(code)) return { icon: isDay ? '🌤️' : '🌥️', label: 'Predomínio de sol' };
    if ([2].includes(code)) return { icon: '⛅', label: 'Parcialmente nublado' };
    if ([3].includes(code)) return { icon: '☁️', label: 'Nublado' };
    if ([45, 48].includes(code)) return { icon: '🌫️', label: 'Neblina' };
    if ([51, 53, 55, 56, 57].includes(code)) return { icon: '🌦️', label: 'Garoa' };
    if ([61, 63, 65, 66, 67].includes(code)) return { icon: '🌧️', label: 'Chuva' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '🌨️', label: 'Neve' };
    if ([80, 81, 82].includes(code)) return { icon: '🌦️', label: 'Pancadas de chuva' };
    if ([95, 96, 99].includes(code)) return { icon: '⛈️', label: 'Tempestade' };
    return { icon: '🌤️', label: 'Condição variável' };
  }

  function formatDayLabel(dateKey, index) {
    if (index === 0) return 'Hoje';
    if (index === 1) return 'Amanhã';
    const label = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date(`${dateKey}T12:00:00`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function formatShortDate(dateKey) {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${dateKey}T12:00:00`));
  }

  function formatHour(dateLike) {
    if (!dateLike) return '--';
    return new Date(dateLike).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatHourlyCardLabel(time) {
    const date = new Date(time);
    return date.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit' });
  }

  function formatChartLabel(time, rangeHours) {
    const date = new Date(time);
    return rangeHours > 24
      ? date.toLocaleString('pt-BR', { day: '2-digit', hour: '2-digit' })
      : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateTime(dateLike) {
    if (!dateLike) return '--';
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatSunWindow(sunrise, sunset) {
    if (!sunrise || !sunset) return '--';
    return `${formatHour(sunrise)} • ${formatHour(sunset)}`;
  }

  function formatDurationShort(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0s';
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const totalMinutes = Math.round(totalSeconds / 60);
    if (totalMinutes < 60) return `${totalMinutes}min`;
    const totalHours = Math.round(totalMinutes / 60);
    return `${totalHours}h`;
  }

  function formatNumber(value, digits = 1) {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : '--';
  }

  function evaluateUpperMetric(value, safeMax, warningMax) {
    if (!Number.isFinite(value)) return 'warning';
    if (value > warningMax) return 'danger';
    if (value > safeMax) return 'warning';
    return 'ok';
  }

  function evaluateLowerMetric(value, safeMin, warningMin) {
    if (!Number.isFinite(value)) return 'warning';
    if (value < warningMin) return 'danger';
    if (value < safeMin) return 'warning';
    return 'ok';
  }

  function evaluateBandMetric(value, safeMin, safeMax, warningMin, warningMax) {
    if (!Number.isFinite(value)) return 'warning';
    if (value < warningMin || value > warningMax) return 'danger';
    if (value < safeMin || value > safeMax) return 'warning';
    return 'ok';
  }

  function weightedAverage(entries) {
    const valid = entries.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0);
    if (!valid.length) return null;
    const totalWeight = valid.reduce((sum, entry) => sum + entry.weight, 0);
    return valid.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
  }

  function weightedDirection(entries) {
    const valid = entries.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0);
    if (!valid.length) return null;

    const vector = valid.reduce((sum, entry) => {
      const radians = (entry.value * Math.PI) / 180;
      return {
        x: sum.x + Math.cos(radians) * entry.weight,
        y: sum.y + Math.sin(radians) * entry.weight
      };
    }, { x: 0, y: 0 });

    const angle = (Math.atan2(vector.y, vector.x) * 180) / Math.PI;
    return angle >= 0 ? angle : angle + 360;
  }

  function weightedMode(entries) {
    const buckets = new Map();

    entries.forEach((entry) => {
      if (entry.value == null || !Number.isFinite(entry.weight) || entry.weight <= 0) return;
      const key = String(entry.value);
      buckets.set(key, (buckets.get(key) || 0) + entry.weight);
    });

    let bestKey = null;
    let bestWeight = -1;
    buckets.forEach((weight, key) => {
      if (weight > bestWeight) {
        bestWeight = weight;
        bestKey = key;
      }
    });

    if (bestKey == null) return null;
    return Number.isFinite(Number(bestKey)) ? Number(bestKey) : bestKey;
  }

  function estimateVisibilityKm(cloudCover, precipitation) {
    let baseVisibility = 10;
    if (Number.isFinite(precipitation) && precipitation > 0) {
      baseVisibility -= precipitation * 4.5;
    }
    if (Number.isFinite(cloudCover) && cloudCover > 85) {
      baseVisibility -= 3;
    } else if (Number.isFinite(cloudCover) && cloudCover > 60) {
      baseVisibility -= 1.5;
    }
    return Math.max(0.8, baseVisibility);
  }

  function valueOr(...candidates) {
    for (const candidate of candidates) {
      if (Number.isFinite(candidate)) {
        return Number(candidate);
      }
    }
    return null;
  }

  function meanOfValues(values) {
    const valid = values.filter(Number.isFinite);
    if (!valid.length) return null;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  }

  function maxOfValues(values) {
    const valid = values.filter(Number.isFinite);
    return valid.length ? Math.max(...valid) : null;
  }

  function minOfValues(values) {
    const valid = values.filter(Number.isFinite);
    return valid.length ? Math.min(...valid) : null;
  }

  function sumOfValues(values) {
    const valid = values.filter(Number.isFinite);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) : null;
  }

  function dominantDirection(values) {
    return weightedDirection(values.map((value) => ({ value, weight: 1 })));
  }

  function roundTo(value, digits) {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function msToKmh(value) {
    return Number.isFinite(value) ? value * 3.6 : null;
  }

  function fahrenheitToCelsius(value) {
    return Number.isFinite(value) ? (value - 32) * (5 / 9) : null;
  }

  function toFiniteNumber(value) {
    if (Number.isFinite(value)) return Number(value);
    if (value == null) return null;
    const normalized = String(value).replace(',', '.').replace(/[^\d.+-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundCoordinate(value) {
    return Number(value).toFixed(4);
  }

  function normalizeBrazilDate(value) {
    const raw = String(value || '').trim();
    const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashMatch) {
      return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : extractDateKey(raw);
  }

  function combineDateAndTime24(date, time) {
    if (!date || !time) return null;
    const match = String(time).match(/(\d{1,2})h(\d{2})/i);
    if (!match) return null;
    return `${date}T${String(match[1]).padStart(2, '0')}:${match[2]}`;
  }

  function combineDateAndClock(date, time) {
    if (!date || !time) return null;
    const match = String(time).match(/(\d{1,2})[:h](\d{2})(?::\d{2})?/i);
    if (!match) return null;
    return `${date}T${String(match[1]).padStart(2, '0')}:${match[2]}`;
  }

  function stripAccents(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeMojibake(value) {
    const text = String(value || '');
    if (!text) return '';
    if (!/[ÃÂâ]/.test(text)) return text;

    try {
      return decodeURIComponent(escape(text));
    } catch (error) {
      return text
        .replace(/Ã¡/g, 'á')
        .replace(/Ã¢/g, 'â')
        .replace(/Ã£/g, 'ã')
        .replace(/Ã©/g, 'é')
        .replace(/Ãª/g, 'ê')
        .replace(/Ã­/g, 'í')
        .replace(/Ã³/g, 'ó')
        .replace(/Ã´/g, 'ô')
        .replace(/Ãµ/g, 'õ')
        .replace(/Ãº/g, 'ú')
        .replace(/Ã§/g, 'ç')
        .replace(/Â°/g, '°')
        .replace(/â€¢/g, '•');
    }
  }

  function normalizeMojibake(value) {
    const text = String(value || '');
    if (!text) return '';
    if (!/[ÃÂâð]/.test(text)) return text;

    const applyFallbackReplacements = (input) => input
      .replace(/Ã¡/g, 'á')
      .replace(/Ã¢/g, 'â')
      .replace(/Ã£/g, 'ã')
      .replace(/Ã©/g, 'é')
      .replace(/Ãª/g, 'ê')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ã´/g, 'ô')
      .replace(/Ãµ/g, 'õ')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã§/g, 'ç')
      .replace(/Â°/g, '°')
      .replace(/â€¢/g, '•')
      .replace(/â€“/g, '–')
      .replace(/â€”/g, '—')
      .replace(/â€œ/g, '"')
      .replace(/â€/g, '"')
      .replace(/â€˜/g, '\'')
      .replace(/â€™/g, '\'');

    try {
      return applyFallbackReplacements(decodeURIComponent(escape(text)));
    } catch (error) {
      return applyFallbackReplacements(text);
    }
  }

  function normalizeLabelSpacing(value) {
    return normalizeMojibake(value).replace(/\s+/g, ' ').trim();
  }

  function extractUfFromText(value) {
    const matches = String(value || '').toUpperCase().match(/\b[A-Z]{2}\b/g);
    return matches ? matches[matches.length - 1] : '';
  }

  function extractCityName(value) {
    const cleaned = normalizeLabelSpacing(
      String(value || '')
        .replace(/^[A-Z]{2}\s*-\s*/i, '')
        .replace(/\s*-\s*[A-Z]{2}$/i, '')
        .split(',')[0]
        .split('•')[0]
    );

    return cleaned;
  }

  function extractLocationHint(name) {
    if (!name || isGenericLocationName(name)) return null;
    const city = extractCityName(name);
    if (!city) return null;
    return {
      city,
      uf: extractUfFromText(name),
      name
    };
  }

  function isGenericLocationName(name) {
    const normalized = stripAccents(String(name || '').toLowerCase());
    return !normalized
      || normalized.includes('sua localizacao')
      || normalized.includes('ponto selecionado')
      || normalized.includes('ponto operacional')
      || normalized.includes('local selecionado')
      || normalized.includes('favorito ');
  }

  function normalizeLocationToken(value) {
    return stripAccents(String(value || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
  }

  function estimateInmetTemperature(minTemp, maxTemp, periodName) {
    if (!Number.isFinite(minTemp) && !Number.isFinite(maxTemp)) return null;
    const safeMin = valueOr(minTemp, maxTemp, null);
    const safeMax = valueOr(maxTemp, minTemp, null);
    const factor = periodName === 'manha' ? 0.38 : periodName === 'tarde' ? 0.82 : 0.56;
    return roundTo(safeMin + (safeMax - safeMin) * factor, 1);
  }

  function mapInmetWindIntensityToKmh(value) {
    const normalized = stripAccents(String(value || '').toLowerCase());
    if (!normalized) return null;
    if (normalized.includes('muito') || normalized.includes('intens')) return 44;
    if (normalized.includes('fort')) return 34;
    if (normalized.includes('moder')) return 22;
    if (normalized.includes('fraco') || normalized.includes('leve')) return 12;
    if (normalized.includes('calm')) return 4;
    return 18;
  }

  function inferRainProbabilityFromNarrative(value) {
    const normalized = stripAccents(String(value || '').toLowerCase());
    if (!normalized) return 25;
    if (normalized.includes('trovoada') || normalized.includes('tempest')) return 88;
    if (normalized.includes('pancad')) return 68;
    if (normalized.includes('chuva') && normalized.includes('isolad')) return 58;
    if (normalized.includes('chuva')) return 72;
    if (normalized.includes('garoa') || normalized.includes('chuvis')) return 46;
    if (normalized.includes('possibilidade')) return 38;
    if (normalized.includes('muitas nuvens') || normalized.includes('nublado')) return 24;
    if (normalized.includes('sol') || normalized.includes('limpo')) return 8;
    return 18;
  }

  function inferCloudCover(weatherCode, narrative) {
    const normalized = stripAccents(String(narrative || '').toLowerCase());
    if ([95, 96, 99].includes(weatherCode)) return 96;
    if ([61, 63, 65, 80, 81, 82].includes(weatherCode)) return 88;
    if ([51, 53, 55, 56, 57].includes(weatherCode)) return 80;
    if ([45, 48].includes(weatherCode)) return 76;
    if (normalized.includes('muitas nuvens')) return 84;
    if (normalized.includes('nublado')) return 76;
    if (normalized.includes('parcial')) return 56;
    if ([2].includes(weatherCode)) return 52;
    if ([3].includes(weatherCode)) return 74;
    if ([0, 1].includes(weatherCode)) return 18;
    return 48;
  }

  function inferPrecipitationFromProbability(rainProbability, weatherCode) {
    const probability = valueOr(rainProbability, 0);
    if ([95, 96, 99].includes(weatherCode)) return probability >= 80 ? 2.8 : 1.8;
    if ([61, 63, 65, 80, 81, 82].includes(weatherCode)) return probability >= 65 ? 1.2 : probability >= 40 ? 0.6 : 0.2;
    if ([51, 53, 55, 56, 57].includes(weatherCode)) return probability >= 45 ? 0.4 : 0.1;
    return 0;
  }

  function mapCptecTempoCode(code) {
    const normalized = String(code || '').trim().toLowerCase();
    const lookup = {
      cl: 0,
      ps: 1,
      psm: 1,
      pst: 1,
      psn: 1,
      pn: 2,
      vn: 2,
      c: 63,
      ch: 63,
      cm: 63,
      cn: 63,
      ct: 63,
      ci: 80,
      ec: 63,
      cv: 51,
      n: 3,
      e: 3,
      ne: 71,
      g: 71,
      in: 95,
      t: 95,
      pc: 80,
      pcm: 80,
      pct: 80,
      pcn: 80,
      pnt: 80,
      pp: 61,
      ppm: 61,
      ppt: 61,
      ppn: 61,
      np: 61,
      npm: 61,
      npt: 61,
      npn: 61,
      npp: 61,
      psc: 61
    };

    return lookup[normalized] ?? 2;
  }

  function mapCptecRainProbability(code) {
    const normalized = String(code || '').trim().toLowerCase();
    if (['t', 'in'].includes(normalized)) return 88;
    if (['c', 'ch', 'cm', 'cn', 'ct', 'ec'].includes(normalized)) return 74;
    if (['ci', 'pc', 'pcm', 'pct', 'pcn', 'pnt'].includes(normalized)) return 62;
    if (['pp', 'ppm', 'ppt', 'ppn', 'np', 'npm', 'npt', 'npn', 'npp', 'psc', 'cv'].includes(normalized)) return 44;
    if (['pn', 'vn', 'n', 'e'].includes(normalized)) return 18;
    if (['cl', 'ps', 'psm', 'pst', 'psn'].includes(normalized)) return 8;
    return 20;
  }

  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180)
      * Math.cos(lat2 * Math.PI / 180)
      * Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    return getDistance(lat1, lon1, lat2, lon2);
  }

  function parseNoaaWindSpeed(text) {
    if (!text) return null;
    const matches = String(text).match(/(\d+)/g);
    if (!matches?.length) return null;
    const value = Math.max(...matches.map(Number));
    return value * 1.60934;
  }

  function cardinalToDegrees(value) {
    if (!value) return null;
    const normalized = String(value).trim().toUpperCase();
    const lookup = {
      N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
      S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5
    };
    if (lookup[normalized] != null) return lookup[normalized];

    const parts = normalized
      .split(/[\/|,-]/)
      .map((part) => lookup[part.trim()])
      .filter(Number.isFinite);

    if (!parts.length) return null;
    return weightedDirection(parts.map((part) => ({ value: part, weight: 1 })));
  }

  function mapWeatherApiCode(code, text) {
    const lookup = {
      1000: 0, 1003: 2, 1006: 3, 1009: 3, 1030: 45, 1063: 61, 1066: 71, 1069: 61, 1072: 51,
      1087: 95, 1114: 71, 1117: 75, 1135: 45, 1147: 48, 1150: 51, 1153: 53, 1168: 56, 1171: 57,
      1180: 61, 1183: 63, 1186: 63, 1189: 65, 1192: 65, 1195: 65, 1198: 66, 1201: 67, 1204: 61,
      1207: 61, 1210: 71, 1213: 73, 1216: 73, 1219: 75, 1222: 75, 1225: 77, 1237: 77, 1240: 80,
      1243: 81, 1246: 82, 1249: 80, 1252: 81, 1255: 85, 1258: 86, 1261: 85, 1264: 86, 1273: 95,
      1276: 96, 1279: 95, 1282: 99
    };
    return lookup[code] ?? mapTextToWeatherCode(text);
  }

  function mapMeteostatCode(code) {
    const lookup = {
      1: 0, 2: 1, 3: 2, 4: 3, 5: 45, 7: 61, 8: 63, 11: 80, 12: 95, 13: 95, 14: 71, 15: 73, 16: 75
    };
    return lookup[code] ?? 2;
  }

  function mapTextToWeatherCode(text) {
    const normalized = normalizeMojibake(text).toLowerCase();
    if (!normalized) return 2;
    if (normalized.includes('thunder') || normalized.includes('trovoada') || normalized.includes('tempest')) return 95;
    if (normalized.includes('snow') || normalized.includes('neve') || normalized.includes('sleet') || normalized.includes('granizo')) return 71;
    if (normalized.includes('drizzle') || normalized.includes('garoa')) return 51;
    if (normalized.includes('pancad')) return 80;
    if (normalized.includes('rain') || normalized.includes('chuva') || normalized.includes('showers')) return 61;
    if (normalized.includes('fog') || normalized.includes('nebl') || normalized.includes('mist')) return 45;
    if (normalized.includes('muitas nuvens') || normalized.includes('céu nublado') || normalized.includes('ceu nublado')) return 3;
    if (normalized.includes('algumas nuvens') || normalized.includes('parcial') || normalized.includes('entre nuvens')) return 2;
    if (normalized.includes('céu limpo') || normalized.includes('ceu limpo')) return 0;
    if (normalized.includes('cloud') || normalized.includes('nublado') || normalized.includes('overcast')) return 3;
    if (normalized.includes('partly') || normalized.includes('parcial')) return 2;
    if (normalized.includes('clear') || normalized.includes('sun') || normalized.includes('ensolarado') || normalized.includes('sol')) return normalized.includes('nuv') ? 2 : 0;
    return 2;
  }

  function mapClimatempoIconCode(resource, text) {
    const normalized = String(resource || '').trim().toLowerCase();
    const lookup = {
      '1': 0,
      '1n': 0,
      '2': 2,
      '2r': 2,
      '2n': 2,
      '2rn': 2,
      '3': 3,
      '3n': 3,
      '4': 61,
      '4n': 61,
      '4t': 95,
      '4tn': 95,
      '5': 45,
      '5n': 45,
      '6': 63,
      '6n': 63,
      '7': 71,
      '7n': 71
    };

    return lookup[normalized] ?? mapTextToWeatherCode(text);
  }

  function isClimatempoIconDay(resource, fallbackTime) {
    const normalized = String(resource || '').trim().toLowerCase();
    if (normalized) {
      return !normalized.includes('n');
    }
    return isDaytimeFromHour(fallbackTime);
  }

  function estimateClimatempoRainProbability(precipitation, dailyProbability, weatherCode) {
    const rainMm = valueOr(precipitation, 0);
    const dayChance = valueOr(dailyProbability, 0);

    if (rainMm >= 1.5) return Math.max(dayChance, 82);
    if (rainMm >= 0.2) return Math.max(dayChance, 62);
    if (rainMm > 0) return Math.max(dayChance, 44);
    if ([95, 96, 99].includes(weatherCode)) return Math.max(dayChance, 72);
    if ([61, 63, 65, 80, 81, 82].includes(weatherCode)) return Math.max(Math.round(dayChance * 0.8), 36);
    if (dayChance >= 60) return Math.round(dayChance * 0.55);
    if (dayChance >= 30) return Math.round(dayChance * 0.35);
    return dayChance;
  }

  function estimateClimatempoWindGust(speed, dayWind) {
    if (!Number.isFinite(speed)) return null;
    const baseRatio = valueOr(
      Number.isFinite(dayWind?.maxGust) && Number.isFinite(dayWind?.maxVelocity) && dayWind.maxVelocity > 0
        ? dayWind.maxGust / dayWind.maxVelocity
        : null,
      1.35
    );

    return roundTo(speed * clamp(baseRatio, 1.15, 2.4), 1);
  }

  async function resolveClimatempoTarget(location) {
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) return null;

    const hint = extractLocationHint(location?.name);
    const byCoords = await fetchClimatempoTargetByCoordinates(location).catch(() => null);
    if (byCoords && matchesClimatempoResolvedTarget(location, byCoords, hint)) {
      return byCoords;
    }

    const query = hint?.city || extractCityName(location?.name) || '';
    if (!query) {
      return byCoords;
    }

    const candidates = await searchClimatempoTargets(query).catch(() => []);
    if (!candidates.length) {
      return byCoords;
    }

    return selectBestClimatempoTarget(candidates, location, hint) || byCoords;
  }

  async function fetchClimatempoTargetByCoordinates(location) {
    const body = new URLSearchParams({
      latitude: roundCoordinate(location.lat),
      longitude: roundCoordinate(location.lon)
    });
    const data = await fetchJson(`${CLIMATEMPO_JSON_URL}/minha-localizacao`, {
      method: 'POST',
      body: body.toString(),
      timeoutMs: CORE_PROVIDER_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const first = Array.isArray(data?.data) ? data.data[0] : null;
    return first ? normalizeClimatempoTarget(first) : null;
  }

  async function searchClimatempoTargets(query) {
    const body = new URLSearchParams({ name: query });
    const groups = await fetchJson(`${CLIMATEMPO_JSON_URL}/busca-por-nome`, {
      method: 'POST',
      body: body.toString(),
      timeoutMs: CORE_PROVIDER_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return (Array.isArray(groups) ? groups : [])
      .flatMap((entry) => Array.isArray(entry?.response?.data) ? entry.response.data : [])
      .map(normalizeClimatempoTarget)
      .filter(Boolean);
  }

  function normalizeClimatempoTarget(raw) {
    if (!raw || !Number.isFinite(Number(raw.latitude)) || !Number.isFinite(Number(raw.longitude))) {
      return null;
    }

    const city = normalizeLabelSpacing(raw.city || raw.airport || raw.beach || '');
    const uf = String(raw.uf || raw.ac || '').toUpperCase();
    const idcity = Number(raw.idcity);
    if (!city || !Number.isFinite(idcity)) return null;

    return {
      idcity,
      idlocale: Number(raw.idlocale),
      city,
      uf,
      country: raw.country || 'Brasil',
      lat: Number(raw.latitude),
      lon: Number(raw.longitude),
      label: [city, uf].filter(Boolean).join(' - '),
      pageUrl: `${CLIMATEMPO_BASE_URL}/previsao-do-tempo/15-dias/cidade/${idcity}/${slugifyClimatempoCity(city)}-${uf.toLowerCase()}`
    };
  }

  function selectBestClimatempoTarget(candidates, location, hint) {
    if (!candidates.length) return null;

    const locationCity = normalizeLocationToken(hint?.city || location?.name);
    const locationUf = hint?.uf || extractUfFromText(location?.name);

    return candidates
      .map((candidate) => {
        const sameCity = locationCity && normalizeLocationToken(candidate.city) === locationCity;
        const sameUf = locationUf && candidate.uf === locationUf;
        const distance = haversineKm(location.lat, location.lon, candidate.lat, candidate.lon);
        const score = (sameCity ? 200 : 0) + (sameUf ? 60 : 0) - Math.min(distance, 500);
        return { candidate, distance, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.candidate || null;
  }

  function matchesClimatempoResolvedTarget(location, target, hint) {
    if (!target) return false;
    const distance = haversineKm(location.lat, location.lon, target.lat, target.lon);
    const locationCity = normalizeLocationToken(hint?.city || location?.name);
    const sameCity = Boolean(locationCity && normalizeLocationToken(target.city) === locationCity);
    const sameUf = !hint?.uf || target.uf === hint.uf;

    return distance <= CLIMATEMPO_MATCH_RADIUS_KM || (sameCity && sameUf && distance <= CLIMATEMPO_CITY_RADIUS_KM);
  }

  function slugifyClimatempoCity(value) {
    return stripAccents(String(value || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
  }

  function extractJsonPropertyBlock(source, propertyName) {
    const matcher = new RegExp(`${propertyName}\\s*:`);
    const match = matcher.exec(source);
    if (!match) return null;

    const valueStart = match.index + match[0].length;
    const openerIndex = source.slice(valueStart).search(/[\[{]/);
    if (openerIndex < 0) return null;

    return extractBalancedBlock(source, valueStart + openerIndex);
  }

  function extractBalancedBlock(source, startIndex) {
    const opener = source[startIndex];
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < source.length; index += 1) {
      const char = source[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === opener) {
        depth += 1;
      } else if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          return source.slice(startIndex, index + 1);
        }
      }
    }

    return null;
  }

  function parseJsonBlock(block, label) {
    if (!block) return null;

    try {
      return JSON.parse(block);
    } catch (error) {
      throw new Error(`Climatempo com bloco invÃ¡lido em ${label}.`);
    }
  }

  function combineDateAndTime(date, time) {
    if (!date || !time) return null;
    const sanitized = String(time).replace(/\s?[AP]M/i, '');
    return `${date}T${sanitized}`;
  }

  function mergeNoaaDailyPeriods(periods) {
    const result = [];
    for (let index = 0; index < periods.length; index += 1) {
      const period = periods[index];
      if (!period?.isDaytime) continue;
      const nightPeriod = periods[index + 1];
      const dateKey = extractDateKey(period.startTime);
      result.push({
        dateKey,
        time: period.startTime,
        maxTemp: fahrenheitToCelsius(valueOr(period.temperature, null)),
        minTemp: fahrenheitToCelsius(valueOr(nightPeriod?.temperature, period.temperature, null)),
        feelsLikeMax: fahrenheitToCelsius(valueOr(period.temperature, null)),
        feelsLikeMin: fahrenheitToCelsius(valueOr(nightPeriod?.temperature, period.temperature, null)),
        humidityMean: null,
        pressure: null,
        visibilityKm: null,
        windSpeed: parseNoaaWindSpeed(period.windSpeed),
        windGusts: Math.max(parseNoaaWindSpeed(period.windSpeed) || 0, parseNoaaWindSpeed(nightPeriod?.windSpeed) || 0),
        windDirection: cardinalToDegrees(period.windDirection),
        cloudCover: null,
        rainProbability: Math.max(valueOr(period.probabilityOfPrecipitation?.value, 0), valueOr(nightPeriod?.probabilityOfPrecipitation?.value, 0)),
        precipitation: 0,
        uvIndexMax: null,
        weatherCode: mapTextToWeatherCode(period.shortForecast || period.detailedForecast),
        sunrise: null,
        sunset: null
      });
    }
    return result.slice(0, 14);
  }

  function normalizeHourKey(time) {
    if (!time) return '';
    const date = new Date(time);
    date.setMinutes(0, 0, 0);
    return date.toISOString();
  }

  function extractDateKey(value) {
    if (!value) return '';
    const asString = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(asString)) {
      return asString.slice(0, 10);
    }
    return new Date(value).toISOString().slice(0, 10);
  }

  function toIsoFromUnix(value) {
    if (!Number.isFinite(value)) return new Date().toISOString();
    return new Date(value * 1000).toISOString();
  }

  function isDaytimeFromHour(time) {
    const hour = new Date(time).getHours();
    return hour >= 6 && hour < 18;
  }

  function isDayFromUnix(current, sunrise, sunset) {
    if (!Number.isFinite(current) || !Number.isFinite(sunrise) || !Number.isFinite(sunset)) return true;
    return current >= sunrise && current < sunset;
  }

  function firstDefinedValue(values) {
    return values.find((value) => value != null) || null;
  }

  function isRetryableNetworkError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('failed to fetch')
      || message.includes('networkerror')
      || message.includes('load failed')
      || message.includes('tempo limite');
  }

  function shouldRetryProviderError(error) {
    if (!error || error.code === 'missing_key' || error.code === 'unsupported') {
      return false;
    }

    const message = String(error.message || '').toLowerCase();
    if (['network', 'provider_offline', 'empty_response', 'invalid_json'].includes(error.code)) {
      return true;
    }
    if (error.code === 'controlled_offline') {
      return false;
    }
    return isRetryableNetworkError(error)
      || message.includes('http 408')
      || message.includes('http 425')
      || message.includes('http 429')
      || message.includes('http 500')
      || message.includes('http 502')
      || message.includes('http 503')
      || message.includes('http 504');
  }

  function createError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function friendlyProviderError(error, provider) {
    if (error.code === 'missing_key') {
      return `${provider.label}: configure a chave para ativar esta fonte.`;
    }
    if (error.code === 'unsupported') {
      return error.message || `${provider.label}: ponto fora da cobertura.`;
    }
    if (error.code === 'provider_offline') {
      return `${provider.label}: API offline no momento.`;
    }
    if (error.code === 'empty_response') {
      return `${provider.label}: resposta vazia recebida da API.`;
    }
    if (error.code === 'invalid_json') {
      return `${provider.label}: JSON invalido retornado pela API.`;
    }
    if (error.code === 'controlled_offline') {
      return `${provider.label}: Offline controlado. Cache e fallback esgotados com seguranca.`;
    }
    if (String(error.message || '').includes('401')) {
      return `${provider.label}: autenticação inválida.`;
    }
    if (String(error.message || '').toLowerCase().includes('failed to fetch')) {
      return `${provider.label}: falha temporaria de conectividade, com fallback automatico ativo.`;
    }
    if (String(error.message || '').toLowerCase().includes('acesso negado')) {
      return `${provider.label}: acesso negado pela origem remota.`;
    }
    return `${provider.label}: ${error.message || 'falha ao consultar a fonte.'}`;
  }

  // APIs: transport, proxy fallback, and local cache helpers
  function getServerProxyOrigins() {
    const origins = [];
    let configuredProxy = '';

    try {
      configuredProxy = String(window.VENTO_PROXY_ORIGIN || localStorage.getItem('vento.proxy.origin') || '').trim();
    } catch (error) {
      configuredProxy = String(window.VENTO_PROXY_ORIGIN || '').trim();
    }

    const serviceBackend = window.SkyDroneServices?.weatherService?.getConfiguredBackendOrigin?.() || '';
    if (serviceBackend) {
      origins.push(serviceBackend);
    } else if ((window.location.protocol === 'http:' || window.location.protocol === 'https:')
      && ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)) {
      origins.push(window.location.origin);
    }

    if (/^https?:\/\//i.test(configuredProxy)) {
      origins.push(configuredProxy.replace(/\/+$/, ''));
    }

    return [...new Set(origins.filter(Boolean))];
  }

  function canAttemptServerProxy() {
    return getServerProxyOrigins().length > 0;
  }

  function shouldUseServerProxy(url, options = {}) {
    if (options.disableProxy || !canAttemptServerProxy()) return false;

    try {
      const targetUrl = new URL(url, window.location.href);
      const pageOrigin = window.location.protocol === 'http:' || window.location.protocol === 'https:'
        ? window.location.origin
        : '';

      return ['http:', 'https:'].includes(targetUrl.protocol)
        && (!pageOrigin || targetUrl.origin !== pageOrigin);
    } catch (error) {
      return false;
    }
  }

  function buildFetchTargets(url, options = {}) {
    const normalizedHeaders = { ...(options.headers || {}) };
    const directTarget = {
      url,
      init: {
        method: options.method || 'GET',
        cache: 'no-store',
        headers: normalizedHeaders,
        body: options.body
      }
    };

    if (!shouldUseServerProxy(url, options)) {
      return [directTarget];
    }

    const targetUrl = new URL(url, window.location.href).toString();
    const proxyTargets = getServerProxyOrigins().map((origin) => {
      const proxyUrl = new URL('/api/proxy', origin);
      proxyUrl.searchParams.set('url', targetUrl);

      const proxyHeaders = {};
      if (normalizedHeaders['Content-Type']) {
        proxyHeaders['Content-Type'] = normalizedHeaders['Content-Type'];
      }
      if (normalizedHeaders['content-type']) {
        proxyHeaders['Content-Type'] = normalizedHeaders['content-type'];
      }
      if (Object.keys(normalizedHeaders).length) {
        proxyHeaders['X-Vento-Forward-Headers'] = JSON.stringify(normalizedHeaders);
      }

      return {
        url: proxyUrl.toString(),
        init: {
          method: options.method || 'GET',
          cache: 'no-store',
          headers: proxyHeaders,
          body: options.body
        }
      };
    });

    return options.allowDirectFallback ? [...proxyTargets, directTarget] : proxyTargets;
  }

  async function fetchWithFallback(url, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 10000);
    const attempts = buildFetchTargets(url, options);
    let lastError = null;

    try {
      for (const attempt of attempts) {
        try {
          const response = await fetch(attempt.url, {
            ...attempt.init,
            signal: controller.signal
          });

          if (!response.ok) {
            const error = createError('provider_offline', 'API offline');
            error.statusCode = response.status;
            throw error;
          }

          return response;
        } catch (error) {
          lastError = error;
          if (error.name === 'AbortError') {
            throw createError('network', 'Tempo limite excedido.');
          }
        }
      }

      throw lastError || createError('network', 'Falha ao buscar recurso remoto.');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function fetchWithRetry(url, options = {}, retries = 1) {
    let attemptsRemaining = Math.max(0, retries);
    let lastError = null;

    while (attemptsRemaining >= 0) {
      try {
        return await fetchWithFallback(url, options);
      } catch (error) {
        lastError = error;
        if (attemptsRemaining === 0 || !shouldRetryProviderError(error)) {
          throw error;
        }
      }

      attemptsRemaining -= 1;
    }

    throw lastError || createError('network', 'Falha ao buscar recurso remoto.');
  }

  async function readResponseTextOrThrow(response) {
    if (!response?.ok) {
      throw createError('provider_offline', 'API offline');
    }

    const text = await response.text();
    if (!text || text.trim() === '') {
      throw createError('empty_response', 'Resposta vazia');
    }

    return text;
  }

  async function fetchText(url, options = {}) {
    const response = await fetchWithRetry(url, options, options.retries ?? 1);
    return readResponseTextOrThrow(response);
  }

  async function fetchXml(url, options = {}) {
    const raw = await fetchText(url, options);
    const xml = new DOMParser().parseFromString(raw, 'application/xml');
    if (xml.querySelector('parsererror')) {
      throw new Error('Resposta XML inválida.');
    }
    return xml;
  }

  function xmlText(parent, selector) {
    return parent?.querySelector(selector)?.textContent?.trim() || '';
  }

  async function fetchJson(url, options = {}) {
    const response = await fetchWithRetry(url, options, options.retries ?? 1);
    const text = await readResponseTextOrThrow(response);

    try {
      return JSON.parse(text);
    } catch (error) {
      throw createError('invalid_json', 'JSON invalido retornado pela API.');
    }
  }

  function buildCacheKey(namespace, location) {
    return `${namespace}:${location.lat.toFixed(3)}:${location.lon.toFixed(3)}`;
  }

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function writeCache(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), value }));
    } catch (error) {
      console.warn('Falha ao salvar cache local:', error);
    }
  }

  function loadWeatherKeys() {
    return {
      weatherApi: '',
      meteostat: ''
    };
  }

  function loadFavoritesFromStorage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function scheduleIdle(fn) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => fn());
      return;
    }
    window.setTimeout(() => fn(), 60);
  }

  function isLikelyNoaaCoverage(location) {
    return location.lat >= 10 && location.lat <= 75 && location.lon >= -175 && location.lon <= -55;
  }

  function escapeAttribute(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
