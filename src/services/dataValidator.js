(() => {
  'use strict';

  const root = window.SkyDroneServices = window.SkyDroneServices || {};

  const RANGES = Object.freeze({
    temperature: { min: -90, max: 60 },
    windSpeed: { min: 0, max: 220 },
    windGusts: { min: 0, max: 280 },
    humidity: { min: 0, max: 100 },
    pressure: { min: 850, max: 1100 },
    precipitation: { min: 0, max: 500 },
    rainProbability: { min: 0, max: 100 },
    visibilityKm: { min: 0.1, max: 80 }
  });

  const COMPARISON_RULES = Object.freeze({
    temperature: { label: 'temperatura', safeSpread: 3, warningSpread: 7, digits: 1 },
    windSpeed: { label: 'vento', safeSpread: 8, warningSpread: 18, digits: 1 },
    windGusts: { label: 'rajadas', safeSpread: 12, warningSpread: 24, digits: 1 },
    humidity: { label: 'umidade', safeSpread: 15, warningSpread: 30, digits: 0 },
    pressure: { label: 'pressao', safeSpread: 5, warningSpread: 11, digits: 0 },
    precipitation: { label: 'chuva', safeSpread: 2, warningSpread: 8, digits: 1, lightRainTolerant: true },
    rainProbability: { label: 'probabilidade de chuva', safeSpread: 28, warningSpread: 58, digits: 0, lightRainTolerant: true },
    visibilityKm: { label: 'visibilidade', safeSpread: 5, warningSpread: 12 }
  });

  function toNumber(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function firstNumber(...values) {
    for (const value of values) {
      const parsed = toNumber(value, null);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function normalizeCurrent(input) {
    const current = input?.current || input || {};
    return {
      temperature: normalizeTemperature(firstNumber(current.temperature, current.temp, current.temp_c, current.temperature_2m), current.temperatureUnit || current.temp_unit),
      windSpeed: normalizeWindSpeed(
        firstNumber(current.windSpeed, current.wind, current.wind_kph, current.wind_speed_10m, current.wspd),
        current.windUnit || current.wind_unit || current.windSpeedUnit
      ),
      windGusts: normalizeWindSpeed(
        firstNumber(current.windGusts, current.wind_gusts, current.gust_kph, current.gust, current.wind_gusts_10m),
        current.windGustUnit || current.wind_unit || current.windSpeedUnit,
        'windGusts'
      ),
      humidity: normalizePercent(firstNumber(current.humidity, current.relative_humidity_2m)),
      pressure: normalizePressure(
        firstNumber(current.pressure, current.pressure_mb, current.pressure_msl),
        current.pressureUnit || current.pressure_unit
      ),
      precipitation: normalizePrecipitation(
        firstNumber(current.precipitation, current.precip, current.precip_mm),
        current.precipitationUnit || current.precipUnit || current.precip_unit
      ),
      rainProbability: normalizePercent(firstNumber(current.rainProbability, current.rain_probability, current.precipitation_probability)),
      visibilityKm: normalizeVisibility(
        firstNumber(current.visibilityKm, current.visibility_km, current.vis_km, current.visibility),
        current.visibilityUnit || current.visibility_unit
      ),
      updatedAt: current.time || current.updatedAt || current.generated_at || current.generatedAt || input?.generatedAt || input?.generated_at || null,
      source: current.source || input?.source || input?.sources_used || ''
    };
  }

  function normalizeTemperature(value, unit = '') {
    const numeric = toNumber(value, null);
    if (numeric === null) return null;
    const normalizedUnit = String(unit || '').toLowerCase();
    const resolved = normalizedUnit.includes('f') || numeric > 70
      ? (numeric - 32) * 5 / 9
      : numeric;
    return roundMetric('temperature', resolved);
  }

  function normalizeWindSpeed(value, unit = '', metric = 'windSpeed') {
    const numeric = toNumber(value, null);
    if (numeric === null) return null;
    const normalizedUnit = String(unit || '').toLowerCase();
    let resolved = numeric;
    if (normalizedUnit.includes('m/s') || normalizedUnit.includes('ms')) {
      resolved = numeric * 3.6;
    } else if (normalizedUnit.includes('kt') || normalizedUnit.includes('knot')) {
      resolved = numeric * 1.852;
    } else if (normalizedUnit.includes('mph')) {
      resolved = numeric * 1.60934;
    }
    return roundMetric(metric, resolved);
  }

  function normalizePercent(value) {
    const numeric = toNumber(value, null);
    if (numeric === null) return null;
    return roundMetric('humidity', numeric <= 1 && numeric >= 0 ? numeric * 100 : numeric);
  }

  function normalizePressure(value, unit = '') {
    const numeric = toNumber(value, null);
    if (numeric === null) return null;
    const normalizedUnit = String(unit || '').toLowerCase();
    let resolved = numeric;
    if (normalizedUnit.includes('kpa')) {
      resolved = numeric * 10;
    } else if (normalizedUnit.includes('inhg') || normalizedUnit.includes('inch')) {
      resolved = numeric * 33.8639;
    } else if (numeric > 80 && numeric < 120) {
      resolved = numeric * 10;
    } else if (numeric > 20 && numeric < 40) {
      resolved = numeric * 33.8639;
    }
    return roundMetric('pressure', resolved);
  }

  function normalizePrecipitation(value, unit = '') {
    const numeric = toNumber(value, null);
    if (numeric === null) return null;
    const normalizedUnit = String(unit || '').toLowerCase();
    const resolved = normalizedUnit.includes('inch') || normalizedUnit === 'in'
      ? numeric * 25.4
      : numeric;
    return roundMetric('precipitation', Math.max(0, resolved));
  }

  function normalizeVisibility(value, unit = '') {
    const numeric = toNumber(value, null);
    if (numeric === null) return null;
    const normalizedUnit = String(unit || '').toLowerCase();
    const resolved = normalizedUnit.includes('mile') || normalizedUnit === 'mi'
      ? numeric * 1.60934
      : numeric > 100
        ? numeric / 1000
        : numeric;
    return roundMetric('visibilityKm', resolved);
  }

  function roundMetric(metric, value) {
    const range = RANGES[metric];
    if (!Number.isFinite(value) || !range || value < range.min || value > range.max) return null;
    const digits = metric === 'temperature' || metric === 'windSpeed' || metric === 'windGusts' || metric === 'precipitation' || metric === 'visibilityKm' ? 1 : 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function validateMetric(metric, value) {
    const range = RANGES[metric];
    if (!range) {
      return { valid: true, value };
    }

    if (!Number.isFinite(value)) {
      return { valid: false, reason: 'missing' };
    }

    if (value < range.min || value > range.max) {
      return { valid: false, reason: 'out_of_range' };
    }

    return { valid: true, value };
  }

  function validateCurrent(input) {
    const snapshot = normalizeCurrent(input);
    const missing = [];
    const invalid = [];
    const warnings = [];

    Object.keys(RANGES).forEach((metric) => {
      const result = validateMetric(metric, snapshot[metric]);
      if (result.valid) return;
      if (result.reason === 'missing') {
        missing.push(metric);
      } else {
        invalid.push(metric);
      }
    });

    if (!Number.isFinite(snapshot.windSpeed)) {
      warnings.push('wind_missing');
    }

    if (!Number.isFinite(snapshot.precipitation) && !Number.isFinite(snapshot.rainProbability)) {
      warnings.push('rain_missing');
    }

    if (Number.isFinite(snapshot.windGusts) && Number.isFinite(snapshot.windSpeed) && snapshot.windGusts < snapshot.windSpeed) {
      warnings.push('gust_below_wind');
      snapshot.windGusts = snapshot.windSpeed;
    }

    if (Number.isFinite(snapshot.visibilityKm) && snapshot.visibilityKm > 80) {
      snapshot.visibilityKm = 80;
    }

    const coreValid = Number.isFinite(snapshot.temperature)
      && Number.isFinite(snapshot.windSpeed)
      && Number.isFinite(snapshot.humidity);

    return {
      valid: coreValid && invalid.length === 0,
      partial: !coreValid || missing.length > 0,
      missing,
      invalid,
      warnings,
      snapshot
    };
  }

  function getRunCurrent(run) {
    if (!run) return null;
    if (run.current) return run.current;
    return run;
  }

  function sampleValue(run, metric) {
    const current = normalizeCurrent(getRunCurrent(run));
    return current[metric];
  }

  function compareSources(runs) {
    const comparableRuns = (Array.isArray(runs) ? runs : [])
      .filter((run) => run && run.success === true && run.status !== 'loading' && !run.hidden)
      .filter((run) => getRunCurrent(run));

    const metrics = {};
    let score = 100;
    let comparedMetricCount = 0;
    let severeDivergence = false;
    const ignoredLabels = new Set();

    Object.entries(COMPARISON_RULES).forEach(([metric, rule]) => {
      const rawSamples = comparableRuns
        .map((run) => ({
          label: run.label || run.providerKey || 'Fonte',
          weight: Number.isFinite(run.weight) && run.weight > 0 ? run.weight : 1,
          value: sampleValue(run, metric)
        }))
        .filter((sample) => Number.isFinite(sample.value));

      const filtered = filterOutlierSamples(rawSamples, rule);
      filtered.ignored.forEach((sample) => ignoredLabels.add(sample.label));
      const samples = filtered.samples;

      if (samples.length < 2) return;

      comparedMetricCount += 1;
      const values = samples.map((sample) => sample.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const spread = max - min;
      const totalWeight = samples.reduce((total, sample) => total + sample.weight, 0);
      const mean = totalWeight > 0
        ? samples.reduce((total, sample) => total + sample.value * sample.weight, 0) / totalWeight
        : values.reduce((total, value) => total + value, 0) / values.length;
      const lightRain = rule.lightRainTolerant && mean <= (metric === 'precipitation' ? 2.5 : 38);
      const safeSpread = lightRain ? rule.safeSpread * 1.5 : rule.safeSpread;
      const warningSpread = lightRain ? rule.warningSpread * 1.45 : rule.warningSpread;
      const status = spread > warningSpread
        ? 'warning'
        : spread > safeSpread
          ? 'watch'
          : 'safe';

      if (status === 'warning') {
        severeDivergence = true;
      }

      score -= status === 'warning'
        ? Math.min(18, (spread / warningSpread) * 12)
        : status === 'watch'
          ? Math.min(5, (spread / safeSpread) * 2.5)
          : 0;

      metrics[metric] = {
        label: rule.label,
        samples,
        sampleCount: samples.length,
        min: roundValue(min, rule.digits),
        max: roundValue(max, rule.digits),
        mean: roundValue(mean, rule.digits),
        spread: roundValue(spread, rule.digits),
        status,
        ignored: filtered.ignored
      };
    });

    const activeSourceCount = comparableRuns.length;
    const available = activeSourceCount >= 2 && comparedMetricCount > 0;
    const coherent = available && !severeDivergence && score >= 82;

    return {
      available,
      coherent,
      score: clamp(Math.round(score + (coherent && activeSourceCount >= 3 ? 2 : 0)), 35, 98),
      activeSourceCount,
      comparedMetricCount,
      severeDivergence,
      ignoredSourceCount: ignoredLabels.size,
      ignoredSourceLabels: [...ignoredLabels],
      metrics
    };
  }

  function filterOutlierSamples(samples, rule) {
    const list = Array.isArray(samples) ? samples.filter((sample) => Number.isFinite(sample.value)) : [];
    if (list.length < 3) {
      return { samples: list, ignored: [] };
    }

    const sorted = [...list].sort((a, b) => a.value - b.value);
    const median = sorted[Math.floor(sorted.length / 2)].value;
    const threshold = rule.warningSpread * (rule.lightRainTolerant ? 1.45 : 1);
    const samplesKept = list.filter((sample) => Math.abs(sample.value - median) <= threshold);
    const ignored = list.filter((sample) => !samplesKept.includes(sample));

    if (ignored.length !== 1 || samplesKept.length < 2) {
      return { samples: list, ignored: [] };
    }

    return {
      samples: samplesKept,
      ignored
    };
  }

  function roundValue(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  root.dataValidator = {
    RANGES,
    normalizeCurrent,
    normalizeWeatherSnapshot: normalizeCurrent,
    validateCurrent,
    validateMetric,
    compareSources,
    toNumber
  };
})();
