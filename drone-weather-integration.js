/**
 * Integracao do drone com o motor de fusao meteorologica.
 * Mantem a aba Drone sincronizada com os dados finais e evita
 * que null/undefined vazem para a interface.
 */

class DroneWeatherIntegration {
  constructor() {
    this.lastWeatherData = null;
    this.flightAnalysis = null;
    this.unsubscribe = null;
  }

  getWeatherData() {
    if (window.weatherFusionEngine?.getLastData) {
      return window.weatherFusionEngine.getLastData();
    }
    return null;
  }

  sanitizeWeatherData(weather) {
    if (!weather || typeof weather !== 'object') {
      return null;
    }

    const toNumber = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return {
      temp: toNumber(weather.temp),
      feels_like: toNumber(weather.feels_like),
      humidity: toNumber(weather.humidity),
      pressure: toNumber(weather.pressure),
      wind: toNumber(weather.wind),
      wind_direction: toNumber(weather.wind_direction),
      wind_gusts: toNumber(weather.wind_gusts),
      precip: toNumber(weather.precip),
      rain_probability: toNumber(weather.rain_probability),
      visibility_km: toNumber(weather.visibility_km),
      cloud_cover: toNumber(weather.cloud_cover),
      reliability: toNumber(weather.reliability) ?? 0,
      condition: String(weather.condition || '--'),
      icon: String(weather.icon || '--'),
      sources_used: String(weather.sources_used || ''),
      sources_count: toNumber(weather.sources_count) ?? 0,
      sources_total: toNumber(weather.sources_total) ?? toNumber(weather.analytics?.providerTotal) ?? 0,
      cached: Boolean(weather.cached),
      cache_age_ms: toNumber(weather.cache_age_ms) ?? 0,
      generated_at: weather.generated_at || weather.generatedAt || null
    };
  }

  analyzeFlightConditions() {
    const weather = this.sanitizeWeatherData(this.getWeatherData());

    if (!weather) {
      return {
        status: 'unavailable',
        message: 'Dados meteorologicos indisponiveis',
        advisory: 'danger',
        reliability: 0,
        warnings: ['Dados meteorologicos indisponiveis'],
        recommendations: ['Aguarde nova atualizacao antes de voar.'],
        details: {
          wind: { value: '--', status: 'unknown' },
          humidity: { value: '--', status: 'unknown' },
          temperature: { value: '--', status: 'unknown' },
          visibility: { value: '--', status: 'unknown' },
          precipitation: { value: '--', status: 'unknown' },
          reliability: 0
        },
        summary: 'Dados meteorologicos indisponiveis'
      };
    }

    this.lastWeatherData = weather;

    const safety = window.SkyDroneServices?.flightSafetyService?.evaluate?.(weather, {
      cacheInfo: {
        used: weather.cached,
        stale: Boolean(weather.cache_stale),
        ageMs: weather.cache_age_ms
      }
    });
    if (safety) {
      const advisory = safety.overallStatus === 'danger'
        ? 'danger'
        : safety.overallStatus === 'warning'
          ? 'warning'
          : 'safe';
      const warnings = Object.values({
        wind: safety.wind,
        gusts: safety.gusts,
        rain: safety.rain,
        visibility: safety.visibility,
        humidity: safety.humidity,
        pressure: safety.pressure,
        reliability: safety.reliability
      })
        .filter((metric) => metric?.status && metric.status !== 'ok')
        .map((metric) => metric.status === 'danger' ? metric.dangerText : metric.warningText)
        .filter(Boolean);

      const analysis = {
        status: safety.overallStatus === 'danger'
          ? 'not-recommended'
          : safety.overallStatus === 'warning'
            ? 'proceed-with-caution'
            : 'optimal',
        message: safety.overallStatus === 'danger'
          ? 'VOO NAO RECOMENDADO'
          : safety.overallStatus === 'warning'
            ? 'VOO COM CAUTELA'
            : 'VOO OTIMIZADO',
        advisory,
        reliability: weather.reliability,
        warnings,
        recommendations: [safety.recommendation],
        details: {
          wind: safety.wind,
          humidity: safety.humidity,
          temperature: safety.feelsLike,
          visibility: safety.visibility,
          precipitation: safety.rain,
          pressure: safety.pressure,
          reliability: weather.reliability
        },
        summary: `${safety.recommendation} | Confiabilidade: ${weather.reliability}% | Fonte: ${weather.sources_used || '--'}`
      };

      this.flightAnalysis = analysis;
      return analysis;
    }

    const analysis = {
      status: 'analyzing',
      message: 'VOO OTIMIZADO',
      advisory: 'safe',
      reliability: weather.reliability,
      warnings: [],
      recommendations: [],
      details: {}
    };

    const wind = weather.wind ?? 0;
    analysis.details.wind = {
      value: wind,
      status: wind > 40 ? 'danger' : wind > 25 ? 'warning' : 'safe'
    };
    if (wind > 40) {
      analysis.warnings.push(`VENTO PERIGOSO: ${wind} km/h`);
      analysis.advisory = 'danger';
    } else if (wind > 25) {
      analysis.warnings.push(`VENTO MODERADO: ${wind} km/h`);
      analysis.advisory = 'warning';
    } else {
      analysis.recommendations.push('Vento dentro da janela recomendada.');
    }

    const humidity = weather.humidity ?? 50;
    analysis.details.humidity = {
      value: humidity,
      status: humidity > 85 ? 'warning' : 'safe'
    };
    if (humidity > 85) {
      analysis.warnings.push(`UMIDADE ALTA: ${humidity}%`);
      if (analysis.advisory !== 'danger') analysis.advisory = 'warning';
    } else {
      analysis.recommendations.push(`Umidade controlada (${humidity}%).`);
    }

    const temp = weather.temp ?? 20;
    analysis.details.temperature = {
      value: temp,
      status: temp < 0 || temp > 40 ? 'danger' : temp < 5 || temp > 35 ? 'warning' : 'safe'
    };
    if (temp < 0 || temp > 40) {
      analysis.warnings.push(`TEMPERATURA CRITICA: ${temp} C`);
      analysis.advisory = 'danger';
    } else if (temp < 5 || temp > 35) {
      analysis.warnings.push(`TEMPERATURA EXTREMA: ${temp} C`);
      if (analysis.advisory !== 'danger') analysis.advisory = 'warning';
    } else {
      analysis.recommendations.push(`Temperatura operacional adequada (${temp} C).`);
    }

    const precip = weather.precip ?? 0;
    const rainProbability = weather.rain_probability ?? 0;
    analysis.details.precipitation = {
      value: rainProbability,
      status: precip > 0 || rainProbability > 60 ? 'danger' : rainProbability > 30 ? 'warning' : 'safe'
    };
    if (weather.condition.includes('Rain') || weather.condition.includes('Thunderstorm')) {
      analysis.warnings.push('PRECIPITACAO DETECTADA: voo nao recomendado.');
      analysis.advisory = 'danger';
    } else if (precip > 0 || rainProbability > 30) {
      analysis.warnings.push(`RISCO DE CHUVA: ${rainProbability}%`);
      if (analysis.advisory !== 'danger') analysis.advisory = 'warning';
    } else {
      analysis.recommendations.push('Sem indicacao relevante de chuva no curto prazo.');
    }

    const visibility = weather.visibility_km;
    analysis.details.visibility = {
      value: visibility ?? '--',
      status: visibility == null ? 'warning' : visibility < 3 ? 'danger' : visibility < 6 ? 'warning' : 'safe'
    };
    if (visibility != null && visibility < 3) {
      analysis.warnings.push(`VISIBILIDADE CRITICA: ${visibility} km`);
      analysis.advisory = 'danger';
    } else if (visibility != null && visibility < 6) {
      analysis.warnings.push(`VISIBILIDADE REDUZIDA: ${visibility} km`);
      if (analysis.advisory !== 'danger') analysis.advisory = 'warning';
    } else if (visibility != null) {
      analysis.recommendations.push(`Visibilidade adequada (${visibility} km).`);
    }

    if (weather.reliability < 60) {
      analysis.warnings.push(`BAIXA CONFIABILIDADE DOS DADOS: ${weather.reliability}%`);
      if (analysis.advisory === 'safe') analysis.advisory = 'warning';
    }

    analysis.status = analysis.advisory === 'danger'
      ? 'not-recommended'
      : analysis.advisory === 'warning'
        ? 'proceed-with-caution'
        : 'optimal';

    analysis.message = analysis.advisory === 'danger'
      ? 'VOO NAO RECOMENDADO'
      : analysis.advisory === 'warning'
        ? 'VOO COM CAUTELA'
        : 'VOO OTIMIZADO';

    analysis.summary = `${analysis.message} | Confiabilidade: ${weather.reliability}% | Fontes: ${weather.sources_count}/${weather.sources_total || weather.sources_count}`;
    this.flightAnalysis = analysis;
    return analysis;
  }

  getFormattedFlightData() {
    const analysis = this.analyzeFlightConditions();
    return {
      analysis,
      weather: this.lastWeatherData
    };
  }

  setupAutoUpdate() {
    if (window.weatherFusionEngine?.onChange && !this.unsubscribe) {
      this.unsubscribe = window.weatherFusionEngine.onChange(() => {
        this.updateDroneUI();
      });
    }

    window.setInterval(() => {
      const droneTab = document.getElementById('drone');
      if (droneTab?.classList.contains('active')) {
        this.updateDroneUI();
      }
    }, 30000);
  }

  updateDroneUI() {
    const data = this.getFormattedFlightData();
    const weather = data.weather || null;

    const statusPanel = document.querySelector('.flight-status-panel');
    if (statusPanel) {
      statusPanel.className = `flight-status-panel ${data.analysis.advisory}`;
    }

    const statusText = document.querySelector('.flight-status-panel .status-text p');
    if (statusText) {
      statusText.textContent = data.analysis.message || '--';
    }

    this._updateMetricDisplay('metricWind', this._formatNumber(weather?.wind));
    this._updateMetricDisplay('metricGusts', this._formatNumber(weather?.wind_gusts));
    this._updateMetricDisplay('metricTemp', this._formatNumber(weather?.temp));
    this._updateMetricDisplay('metricFeelsLike', this._formatNumber(weather?.feels_like));
    this._updateMetricDisplay('metricHumidity', this._formatInteger(weather?.humidity));
    this._updateMetricDisplay('metricPressure', this._formatInteger(weather?.pressure));
    this._updateMetricDisplay('metricVisibility', this._formatNumber(weather?.visibility_km));
    this._updateMetricDisplay('metricRainProb', this._formatInteger(weather?.rain_probability));
    this._updateMetricDisplay('metricClouds', this._formatInteger(weather?.cloud_cover));
    this._updateMetricDisplay('metricDirection', this._formatDirection(weather?.wind_direction));

    const directionText = document.getElementById('metricDirectionText');
    if (directionText) {
      directionText.textContent = this._formatDirectionLabel(weather?.wind_direction);
    }

    this._updateRecommendations(data.analysis);
    this._updateTimestamp(weather?.generated_at);
  }

  _updateMetricDisplay(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value ?? '--';
    }
  }

  _updateRecommendations(analysis) {
    const recList = document.getElementById('recommendationsList');
    if (!recList) return;

    const items = [
      ...analysis.warnings.map((text) => ({ icon: '!', text })),
      ...analysis.recommendations.map((text) => ({ icon: 'OK', text }))
    ];

    if (!items.length) {
      recList.innerHTML = '<div class="recommendation-item"><span class="rec-icon">--</span><span class="rec-text">Dados indisponiveis</span></div>';
      return;
    }

    recList.innerHTML = items.map((item) => `
      <div class="recommendation-item">
        <span class="rec-icon">${item.icon}</span>
        <span class="rec-text">${item.text || '--'}</span>
      </div>
    `).join('');
  }

  _updateTimestamp(timestamp) {
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
      const date = timestamp ? new Date(timestamp) : new Date();
      lastUpdate.textContent = date.toLocaleString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  }

  _formatNumber(value) {
    return Number.isFinite(value) ? Number(value).toFixed(1) : '--';
  }

  _formatInteger(value) {
    return Number.isFinite(value) ? String(Math.round(value)) : '--';
  }

  _formatDirection(value) {
    return Number.isFinite(value) ? `${Math.round(value)} deg` : '--';
  }

  _formatDirectionLabel(value) {
    if (!Number.isFinite(value)) return '--';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(value / 22.5) % 16];
  }
}

window.droneWeatherIntegration = new DroneWeatherIntegration();

document.addEventListener('DOMContentLoaded', () => {
  window.droneWeatherIntegration.setupAutoUpdate();
});
