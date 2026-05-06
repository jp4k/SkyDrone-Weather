(() => {
  'use strict';

  const root = window.SkyDroneServices = window.SkyDroneServices || {};
  const STORAGE_KEY = 'skydrone.weather.lastValid.v1';
  const MAX_LOCATION_DISTANCE_KM = 50;

  function toNumber(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeLegacyData(data, bundle) {
    const current = bundle?.current || {};
    return {
      temp: toNumber(data?.temp, toNumber(current.temperature)),
      wind: toNumber(data?.wind, toNumber(current.windSpeed)),
      wind_gusts: toNumber(data?.wind_gusts, toNumber(current.windGusts)),
      humidity: toNumber(data?.humidity, toNumber(current.humidity)),
      pressure: toNumber(data?.pressure, toNumber(current.pressure)),
      precip: toNumber(data?.precip, toNumber(current.precipitation, 0)),
      rain_probability: toNumber(data?.rain_probability, toNumber(current.rainProbability)),
      visibility_km: toNumber(data?.visibility_km, toNumber(current.visibilityKm)),
      updated_at: data?.generated_at || data?.generatedAt || bundle?.generatedAt || current.time || new Date().toISOString(),
      source: data?.sources_used || data?.source || getBundleSource(bundle),
      reliability: toNumber(data?.reliability, toNumber(bundle?.analytics?.confidence, toNumber(current.confidence, 0)))
    };
  }

  function getBundleSource(bundle) {
    const providers = Array.isArray(bundle?.providers) ? bundle.providers : [];
    return providers
      .filter((run) => run && run.success !== false && !run.hidden)
      .map((run) => run.label || run.providerKey)
      .filter(Boolean)
      .join(', ');
  }

  function getBundleModels(bundle) {
    const providers = Array.isArray(bundle?.providers) ? bundle.providers : [];
    return providers
      .filter((run) => run && run.success !== false && !run.hidden)
      .filter((run) => run.type !== 'demo' && run.type !== 'cache' && run.providerKey !== 'demoWeather' && run.providerKey !== 'savedCache')
      .map((run) => run.label || run.providerKey)
      .filter(Boolean);
  }

  function getLocation(data, bundle, fallbackLocation) {
    const source = bundle?.location || data?.location || fallbackLocation || null;
    if (!source) return null;
    const lat = toNumber(source.lat);
    const lon = toNumber(source.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      name: source.name || data?.location?.name || fallbackLocation?.name || ''
    };
  }

  function saveLastValid(data, bundle = null, metadata = {}) {
    try {
      const legacy = normalizeLegacyData(data || {}, bundle);
      const validation = root.dataValidator?.validateCurrent?.(legacy);
      if (validation && !validation.valid && !Number.isFinite(legacy.wind)) {
        return false;
      }

      const payload = {
        timestamp: Date.now(),
        updatedAt: legacy.updated_at,
        source: legacy.source || 'Fonte meteorologica',
        modelsUsed: getBundleModels(bundle),
        modelCount: getBundleModels(bundle).length,
        reliability: legacy.reliability,
        temp: legacy.temp,
        wind: legacy.wind,
        wind_gusts: legacy.wind_gusts,
        humidity: legacy.humidity,
        pressure: legacy.pressure,
        rain: legacy.precip,
        rain_probability: legacy.rain_probability,
        visibility_km: legacy.visibility_km,
        location: getLocation(data, bundle, metadata.location),
        cacheInfo: metadata.cacheInfo || null,
        data,
        bundle
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.warn('Falha ao salvar ultimo dado valido:', error);
      return false;
    }
  }

  function loadLastValid(location = null) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || !payload.timestamp) return null;

      const ageMs = Math.max(0, Date.now() - payload.timestamp);
      const distanceKm = location && payload.location ? getDistanceKm(location, payload.location) : null;
      const locationMismatch = Number.isFinite(distanceKm) && distanceKm > MAX_LOCATION_DISTANCE_KM;

      return {
        ...payload,
        ageMs,
        distanceKm,
        locationMismatch
      };
    } catch (error) {
      return null;
    }
  }

  function buildBundleFromCachedEntry(entry, location = null) {
    if (!entry) return null;
    if (entry.bundle?.current) {
      return {
        ...entry.bundle,
        generatedAt: entry.updatedAt || entry.bundle.generatedAt || new Date(entry.timestamp).toISOString(),
        location: entry.bundle.location || entry.location || location || null
      };
    }

    const generatedAt = entry.updatedAt || new Date(entry.timestamp).toISOString();
    const current = {
      time: generatedAt,
      dateKey: generatedAt.slice(0, 10),
      temperature: toNumber(entry.temp),
      feelsLike: toNumber(entry.temp),
      humidity: toNumber(entry.humidity),
      pressure: toNumber(entry.pressure),
      windSpeed: toNumber(entry.wind),
      windDirection: 0,
      windGusts: toNumber(entry.wind_gusts, toNumber(entry.wind)),
      precipitation: toNumber(entry.rain, 0),
      rainProbability: toNumber(entry.rain_probability, 0),
      visibilityKm: toNumber(entry.visibility_km, 10),
      cloudCover: null,
      uvIndex: 0,
      weatherCode: toNumber(entry.rain, 0) > 0 ? 61 : 2,
      isDay: true,
      confidence: toNumber(entry.reliability, 65),
      icon: '--',
      description: 'Ultimo dado salvo'
    };

    return {
      generatedAt,
      location: entry.location || location || null,
      current,
      hourly: [{ ...current }],
      daily: [],
      providers: [{
        providerKey: 'savedCache',
        label: entry.source || 'Cache salvo',
        type: 'cache',
        success: true,
        status: 'partial',
        reliability: 0.65,
        weight: 0.4,
        current,
        hourly: [{ ...current }],
        daily: []
      }],
      analytics: {
        providerCount: entry.modelCount || 1,
        providerTotal: entry.modelCount || 1,
        confidence: toNumber(entry.reliability, 65),
        confidenceLabel: 'Media',
        confidenceNote: `Usando ultimo dado valido salvo. Modelos salvos: ${(entry.modelsUsed || [entry.source || 'Cache salvo']).join(' + ')}.`,
        cacheNote: 'Usando ultimo dado valido salvo',
        trend: {
          label: 'Cache salvo',
          short: 'Cache',
          note: 'Leitura preservada localmente ate a proxima sincronizacao.'
        },
        sourceConsensus: {
          available: false,
          shortLabel: 'Cache salvo',
          summary: 'Comparacao indisponivel no cache'
        },
        headline: 'Usando ultimo dado valido salvo'
      },
      modelAgreement: {
        available: false,
        averageTempSpread: null,
        averageWindSpread: null,
        averageRainSpread: null,
        divergenceLevel: 'medio'
      },
      alerts: [],
      insights: []
    };
  }

  function getDistanceKm(a, b) {
    const lat1 = toNumber(a?.lat);
    const lon1 = toNumber(a?.lon);
    const lat2 = toNumber(b?.lat);
    const lon2 = toNumber(b?.lon);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

    const toRad = (degrees) => degrees * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const sLat = Math.sin(dLat / 2);
    const sLon = Math.sin(dLon / 2);
    const h = sLat * sLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sLon * sLon;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  root.cacheService = {
    STORAGE_KEY,
    saveLastValid,
    loadLastValid,
    buildBundleFromCachedEntry
  };
})();
