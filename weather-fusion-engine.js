(() => {
  'use strict';

  const STORAGE_KEY = 'vento.weather.shared.v3';
  const MAX_CACHE_AGE_MS = 12 * 60 * 60 * 1000;
  const SAME_LOCATION_RADIUS_KM = 2;

  class WeatherFusionEngine {
    constructor() {
      this.lastBundle = null;
      this.lastData = null;
      this.bundleFetcher = null;
      this.listeners = new Set();
      this.restoreFromStorage();
    }

    restoreFromStorage() {
      try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!raw || !raw.timestamp) return;
        if (Date.now() - raw.timestamp > MAX_CACHE_AGE_MS) return;

        this.lastBundle = raw.bundle || null;
        this.lastData = raw.data || this.bundleToLegacy(this.lastBundle, this.lastBundle?.providers || [], {
          used: true,
          stale: false,
          ageMs: Date.now() - raw.timestamp
        });
        if (window.SkyDroneServices?.reliabilityService?.adjustLegacyData && this.lastData) {
          this.lastData = window.SkyDroneServices.reliabilityService.adjustLegacyData(this.lastData, this.lastBundle, this.lastBundle?.providers || [], {
            used: true,
            stale: false,
            ageMs: Date.now() - raw.timestamp
          });
        }
      } catch (error) {
        this.lastBundle = null;
        this.lastData = null;
      }

      if (!this.lastData && window.SkyDroneServices?.cacheService?.loadLastValid) {
        const saved = window.SkyDroneServices.cacheService.loadLastValid();
        const savedBundle = window.SkyDroneServices.cacheService.buildBundleFromCachedEntry(saved);
        if (savedBundle?.current) {
          this.lastBundle = savedBundle;
          this.lastData = this.bundleToLegacy(savedBundle, savedBundle.providers || [], {
            used: true,
            stale: true,
            saved: true,
            ageMs: saved.ageMs
          });
        }
      }
    }

    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          timestamp: Date.now(),
          bundle: this.lastBundle,
          data: this.lastData
        }));
      } catch (error) {
        console.warn('Falha ao persistir cache meteorologico compartilhado:', error);
      }
      window.SkyDroneServices?.cacheService?.saveLastValid?.(this.lastData, this.lastBundle, {
        location: this.lastBundle?.location || this.lastData?.location || null
      });
    }

    registerBundleFetcher(fetcher) {
      if (typeof fetcher === 'function') {
        this.bundleFetcher = fetcher;
      }
    }

    onChange(listener) {
      if (typeof listener !== 'function') return () => {};
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit() {
      const payload = this.getLastData();
      this.listeners.forEach((listener) => {
        try {
          listener(payload, this.lastBundle);
        } catch (error) {
          console.warn('Listener meteorologico falhou:', error);
        }
      });
    }

    setLastBundle(bundle, providerRuns = [], cacheInfo = {}) {
      if (!bundle || !bundle.current) {
        return this.getLastData();
      }

      const serializedProviders = this.serializeProviderRuns(
        providerRuns.length ? providerRuns : (Array.isArray(bundle.providers) ? bundle.providers : [])
      );
      const nextBundle = {
        ...bundle,
        providers: serializedProviders
      };

      const reliableBundle = window.SkyDroneServices?.reliabilityService?.applyToBundle?.(nextBundle, serializedProviders, cacheInfo) || nextBundle;

      this.lastBundle = reliableBundle;
      this.lastData = this.bundleToLegacy(reliableBundle, serializedProviders, cacheInfo);
      this.persist();
      this.emit();
      return this.lastData;
    }

    setLastData(data) {
      if (!data) return this.getLastData();
      if (data.bundle && data.bundle.current) {
        return this.setLastBundle(data.bundle, data.providerRuns || data.bundle.providers || [], data.cacheInfo || {});
      }

      this.lastData = this.normalizeLegacyData(data);
      this.persist();
      this.emit();
      return this.lastData;
    }

    getLastBundle() {
      return this.lastBundle;
    }

    getLastData() {
      if (this.lastData) return this.lastData;
      if (!this.lastBundle) return null;
      this.lastData = this.bundleToLegacy(this.lastBundle, this.lastBundle.providers || [], {});
      return this.lastData;
    }

    async getWeather(lat, lon, options = {}) {
      const cached = this.getLastData();
      if (this.isSameLocation(this.lastBundle?.location, { lat, lon }) && cached) {
        return cached;
      }

      if (typeof this.bundleFetcher === 'function') {
        try {
          const result = await this.bundleFetcher({ lat, lon }, options);
          if (result?.bundle) {
            return this.setLastBundle(result.bundle, result.providerRuns || result.bundle.providers || [], result.cacheInfo || {});
          }
        } catch (error) {
          console.warn('Falha ao consultar a ponte meteorologica compartilhada:', error);
        }
      }

      if (cached) {
        return window.SkyDroneServices?.reliabilityService?.adjustLegacyData?.({
          ...cached,
          cached: true,
          cache_stale: true
        }, this.lastBundle, this.lastBundle?.providers || [], {
          used: true,
          stale: true,
          apiFailed: true,
          ageMs: Math.max(0, Date.now() - new Date(cached.generated_at || Date.now()).getTime())
        }) || {
          ...cached,
          cached: true,
          cache_stale: true
        };
      }

      return this.getDefaultWeatherData();
    }

    async getWeatherBundle(lat, lon, options = {}) {
      if (this.isSameLocation(this.lastBundle?.location, { lat, lon }) && this.lastBundle) {
        return {
          bundle: this.lastBundle,
          providerRuns: this.lastBundle.providers || [],
          cacheInfo: {
            used: false,
            stale: false,
            ageMs: 0
          }
        };
      }

      if (typeof this.bundleFetcher === 'function') {
        const result = await this.bundleFetcher({ lat, lon }, options);
        if (result?.bundle) {
          this.setLastBundle(result.bundle, result.providerRuns || result.bundle.providers || [], result.cacheInfo || {});
          return result;
        }
      }

      if (this.lastBundle) {
        return {
          bundle: this.lastBundle,
          providerRuns: this.lastBundle.providers || [],
          cacheInfo: {
            used: true,
            stale: true,
            ageMs: Math.max(0, Date.now() - new Date(this.lastBundle.generatedAt || Date.now()).getTime())
          }
        };
      }

      throw new Error('Nenhum pacote meteorologico disponivel.');
    }

    serializeProviderRuns(providerRuns) {
      return (Array.isArray(providerRuns) ? providerRuns : [])
        .filter(Boolean)
        .map((run) => ({
          providerKey: run.providerKey || '',
          label: run.label || '',
          reliability: this.safeNumber(run.reliability, null),
          type: run.type || '',
          hidden: Boolean(run.hidden),
          success: run.success !== false,
          status: run.status || (run.success === false ? 'offline' : 'online'),
          message: run.message || '',
          fetchedAt: run.fetchedAt || null,
          latencyMs: this.safeNumber(run.latencyMs, 0),
          weight: this.safeNumber(run.weight, 0),
          stationSelection: run.stationSelection || null,
          current: run.current || null,
          hourly: Array.isArray(run.hourly) ? run.hourly : [],
          daily: Array.isArray(run.daily) ? run.daily : []
        }));
    }

    bundleToLegacy(bundle, providerRuns = [], cacheInfo = {}) {
      if (!bundle?.current) {
        return this.getDefaultWeatherData();
      }

      const current = bundle.current;
      const analytics = bundle.analytics || {};
      const serializedProviders = this.serializeProviderRuns(providerRuns);
      const visibleProviders = serializedProviders.filter((run) => !run.hidden);
      const activeProviders = visibleProviders.filter((run) => run.success && (run.weight || 0) > 0);
      const fallbackProviders = activeProviders.length
        ? activeProviders
        : visibleProviders.filter((run) => run.success);
      const usedProviders = fallbackProviders.length ? fallbackProviders : visibleProviders;
      const reliability = this.safeInteger(analytics.confidence, this.safeInteger(current.confidence, 0));

      return {
        temp: this.safeInteger(current.temperature, null),
        feels_like: this.safeInteger(current.feelsLike, null),
        humidity: this.safeInteger(current.humidity, null),
        pressure: this.safeInteger(current.pressure, null),
        wind: this.safeInteger(current.windSpeed, null),
        wind_direction: this.safeInteger(current.windDirection, 0),
        wind_gusts: this.safeInteger(current.windGusts, null),
        precip: this.safeNumber(current.precipitation, 0),
        rain_probability: this.safeInteger(current.rainProbability, 0),
        visibility_km: this.safeNumber(current.visibilityKm, 10),
        cloud_cover: this.safeInteger(current.cloudCover, null),
        uv_index: this.safeNumber(current.uvIndex, 0),
        condition: this.mapWeatherCodeToCondition(current.weatherCode),
        condition_text: this.normalizeText(current.description || ''),
        icon: current.icon || '--',
        reliability,
        reliability_label: this.getReliabilityLabel(reliability),
        sources_count: usedProviders.length || this.safeInteger(analytics.providerCount, 0),
        sources_total: this.safeInteger(analytics.providerTotal, visibleProviders.length),
        sources_used: usedProviders.map((run) => run.label).join(', '),
        cached: Boolean(cacheInfo?.used),
        cache_stale: Boolean(cacheInfo?.stale),
        cache_age_ms: this.safeNumber(cacheInfo?.ageMs, 0),
        generated_at: bundle.generatedAt || new Date().toISOString(),
        location: bundle.location || null,
        analytics,
        alerts: Array.isArray(bundle.alerts) ? bundle.alerts : [],
        hourly: (Array.isArray(bundle.hourly) ? bundle.hourly : []).map((entry) => ({
          time: entry.time,
          temp: this.safeInteger(entry.temperature, null),
          condition: this.mapWeatherCodeToCondition(entry.weatherCode),
          condition_text: this.normalizeText(entry.description || ''),
          icon: entry.icon || '--',
          rain_prob: this.safeInteger(entry.rainProbability, 0),
          precip: this.safeNumber(entry.precipitation, 0),
          wind: this.safeInteger(entry.windSpeed, null),
          confidence: this.safeInteger(entry.confidence, reliability)
        })),
        daily: (Array.isArray(bundle.daily) ? bundle.daily : []).map((entry) => ({
          time: entry.detail?.time || entry.time,
          max: this.safeInteger(entry.maxTemp, null),
          min: this.safeInteger(entry.minTemp, null),
          condition: this.mapWeatherCodeToCondition(entry.detail?.weatherCode),
          condition_text: this.normalizeText(entry.description || entry.headline || ''),
          icon: entry.icon || '--',
          precip: this.safeNumber(entry.detail?.precipitation, 0),
          rain_prob: this.safeInteger(entry.rainProbability, 0),
          confidence: this.safeInteger(entry.confidence, reliability)
        })),
        bundle
      };
    }

    normalizeLegacyData(data) {
      const normalized = {
        ...data,
        temp: this.safeInteger(data.temp, null),
        feels_like: this.safeInteger(data.feels_like, null),
        humidity: this.safeInteger(data.humidity, null),
        pressure: this.safeInteger(data.pressure, null),
        wind: this.safeInteger(data.wind, null),
        wind_direction: this.safeInteger(data.wind_direction, 0),
        wind_gusts: this.safeInteger(data.wind_gusts, null),
        precip: this.safeNumber(data.precip, 0),
        rain_probability: this.safeInteger(data.rain_probability, 0),
        visibility_km: this.safeNumber(data.visibility_km, 10),
        cloud_cover: this.safeInteger(data.cloud_cover, null),
        uv_index: this.safeNumber(data.uv_index, 0),
        reliability: this.safeInteger(data.reliability, 0),
        sources_count: this.safeInteger(data.sources_count, 0),
        sources_total: this.safeInteger(data.sources_total, this.safeInteger(data.analytics?.providerTotal, 0)),
        sources_used: String(data.sources_used || ''),
        cached: Boolean(data.cached),
        cache_stale: Boolean(data.cache_stale),
        cache_age_ms: this.safeNumber(data.cache_age_ms, 0),
        condition: String(data.condition || 'Clouds'),
        condition_text: this.normalizeText(data.condition_text || data.condition || ''),
        icon: data.icon || '--',
        hourly: Array.isArray(data.hourly) ? data.hourly : [],
        daily: Array.isArray(data.daily) ? data.daily : []
      };

      normalized.reliability_label = this.getReliabilityLabel(normalized.reliability);

      return normalized;
    }

    getDefaultWeatherData() {
      return {
        temp: null,
        feels_like: null,
        humidity: null,
        pressure: null,
        wind: null,
        wind_direction: 0,
        wind_gusts: null,
        precip: 0,
        rain_probability: 0,
        visibility_km: null,
        cloud_cover: null,
        uv_index: 0,
        condition: 'Clouds',
        condition_text: 'Sem dados meteorologicos disponiveis',
        icon: '--',
        reliability: 0,
        reliability_label: 'Baixa',
        sources_count: 0,
        sources_total: 0,
        sources_used: '',
        cached: true,
        cache_stale: true,
        cache_age_ms: 0,
        hourly: [],
        daily: [],
        alerts: [],
        analytics: {}
      };
    }

    mapWeatherCodeToCondition(code) {
      const value = Number(code);
      if (!Number.isFinite(value)) return 'Clouds';
      if (value === 0 || value === 1) return 'Clear';
      if (value === 2 || value === 3) return 'Clouds';
      if (value >= 45 && value <= 48) return 'Fog';
      if (value >= 51 && value <= 67) return 'Rain';
      if (value >= 71 && value <= 77) return 'Snow';
      if (value >= 80 && value <= 82) return 'Rain';
      if (value >= 85 && value <= 86) return 'Snow';
      if (value >= 95) return 'Thunderstorm';
      return 'Clouds';
    }

    normalizeText(value) {
      const text = String(value || '').trim();
      if (!text) return '';

      const mojibakeHints = ['Ã', 'Â', 'â€¢', 'â€', 'ðŸ'];
      if (!mojibakeHints.some((hint) => text.includes(hint))) {
        return text;
      }

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

    normalizeText(value) {
      const text = String(value || '').trim();
      if (!text) return '';

      const mojibakeHints = ['Ã', 'Â', 'â€¢', 'â€', 'ðŸ'];
      if (!mojibakeHints.some((hint) => text.includes(hint))) {
        return text;
      }

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

    getReliabilityLabel(value) {
      const reliability = this.safeInteger(value, 0);
      if (reliability > 90) return 'Alta precisao';
      if (reliability >= 75) return 'Boa';
      if (reliability >= 60) return 'Media';
      return 'Baixa';
    }

    safeNumber(value, fallback = 0) {
      return Number.isFinite(Number(value)) ? Number(value) : fallback;
    }

    safeInteger(value, fallback = 0) {
      return Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
    }

    isSameLocation(a, b) {
      if (!a || !b) return false;
      if (!Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lon))) return false;
      if (!Number.isFinite(Number(b.lat)) || !Number.isFinite(Number(b.lon))) return false;
      return this.distanceKm(a, b) <= SAME_LOCATION_RADIUS_KM;
    }

    distanceKm(a, b) {
      const toRad = (degrees) => degrees * Math.PI / 180;
      const lat1 = Number(a.lat);
      const lon1 = Number(a.lon);
      const lat2 = Number(b.lat);
      const lon2 = Number(b.lon);
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const sa = Math.sin(dLat / 2);
      const sb = Math.sin(dLon / 2);
      const c = sa * sa + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sb * sb;
      return 6371 * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
    }
  }

  window.weatherFusionEngine = new WeatherFusionEngine();
})();
