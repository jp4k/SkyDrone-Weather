/**
 * Integracao do satelite com o motor de fusao meteorologica.
 * Garante overlay resiliente e sem quebra mesmo com dados parciais.
 */

class SatelliteWeatherIntegration {
  constructor() {
    this.lastWeatherData = null;
    this.weatherOverlay = null;
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
      wind: toNumber(weather.wind),
      wind_direction: toNumber(weather.wind_direction),
      humidity: toNumber(weather.humidity),
      precip: toNumber(weather.precip),
      reliability: toNumber(weather.reliability) ?? 0,
      condition: String(weather.condition || '--'),
      icon: String(weather.icon || '--'),
      sources_count: toNumber(weather.sources_count) ?? 0,
      sources_total: toNumber(weather.sources_total) ?? toNumber(weather.analytics?.providerTotal) ?? 0,
      sources_used: String(weather.sources_used || '')
    };
  }

  generateWeatherOverlay() {
    const weather = this.sanitizeWeatherData(this.getWeatherData());
    this.lastWeatherData = weather;

    const overlay = {
      status: weather ? 'ready' : 'unavailable',
      message: weather ? 'Dados meteorologicos sincronizados' : 'Dados meteorologicos indisponiveis',
      title: 'Condicoes Meteorologicas',
      data: [
        { label: 'Temperatura', value: this._withUnit(weather?.temp, 'C'), icon: 'T', status: this._getTempStatus(weather?.temp) },
        { label: 'Sensacao Termica', value: this._withUnit(weather?.feels_like, 'C'), icon: 'ST', status: 'info' },
        { label: 'Vento', value: this._withUnit(weather?.wind, 'km/h'), icon: 'V', status: this._getWindStatus(weather?.wind) },
        { label: 'Direcao do Vento', value: Number.isFinite(weather?.wind_direction) ? `${Math.round(weather.wind_direction)} deg` : '--', icon: 'DV', status: 'info' },
        { label: 'Umidade', value: this._withUnit(weather?.humidity, '%', true), icon: 'U', status: this._getHumidityStatus(weather?.humidity) },
        { label: 'Precipitacao', value: this._withUnit(weather?.precip, 'mm'), icon: 'P', status: (weather?.precip ?? 0) > 0 ? 'warning' : 'safe' },
        { label: 'Condicao', value: weather?.condition || '--', icon: weather?.icon || '--', status: 'info' },
        { label: 'Confiabilidade', value: this._withUnit(weather?.reliability, '%', true), icon: 'C', status: this._getReliabilityStatus(weather?.reliability) }
      ],
      sources: {
        count: weather?.sources_count ?? 0,
        total: weather?.sources_total ?? weather?.sources_count ?? 0,
        list: weather?.sources_used ? weather.sources_used.split(',').map((item) => item.trim()).filter(Boolean) : [],
        reliability: weather?.reliability ?? 0
      },
      lastUpdate: new Date().toLocaleString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };

    this.weatherOverlay = overlay;
    return overlay;
  }

  _getTempStatus(temp) {
    if (!Number.isFinite(temp)) return 'info';
    if (temp < 0 || temp > 40) return 'danger';
    if (temp < 5 || temp > 35) return 'warning';
    return 'safe';
  }

  _getWindStatus(wind) {
    if (!Number.isFinite(wind)) return 'info';
    if (wind > 40) return 'danger';
    if (wind > 25) return 'warning';
    return 'safe';
  }

  _getHumidityStatus(humidity) {
    if (!Number.isFinite(humidity)) return 'info';
    if (humidity > 85 || humidity < 30) return 'warning';
    return 'safe';
  }

  _getReliabilityStatus(reliability) {
    if (!Number.isFinite(reliability)) return 'info';
    if (reliability > 85) return 'safe';
    if (reliability > 60) return 'warning';
    return 'danger';
  }

  updateSatelliteUI() {
    const overlay = this.generateWeatherOverlay();
    const weatherCard = document.querySelector('.satellite-floating-card');
    if (!weatherCard) {
      return;
    }

    let weatherSection = weatherCard.querySelector('.weather-overlay-section');
    if (!weatherSection) {
      weatherSection = document.createElement('div');
      weatherSection.className = 'weather-overlay-section';
      weatherCard.appendChild(weatherSection);
    }

    const html = `
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
        <h5 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #9ca3af;">
          ${overlay.title}
        </h5>
        <div style="display: grid; gap: 8px; font-size: 12px;">
          ${overlay.data.map((item) => `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>${item.icon} ${item.label}</span>
              <span style="font-weight: 600; color: #e5e7eb;">${item.value || '--'}</span>
            </div>
          `).join('')}
        </div>
        <div style="margin-top: 12px; padding: 8px; background: rgba(99,102,241,0.1); border-radius: 8px; font-size: 11px; color: #cbd5e1;">
          <strong>Confiabilidade:</strong> ${overlay.sources.reliability}% |
          <strong>Fontes:</strong> ${overlay.sources.count}/${overlay.sources.total} |
          <strong>Atualizado:</strong> ${overlay.lastUpdate}
        </div>
      </div>
    `;

    weatherSection.innerHTML = html;
  }

  checkWeatherForMeasurement() {
    const weather = this.sanitizeWeatherData(this.getWeatherData());
    if (!weather) {
      return { safe: true, warnings: [] };
    }

    const warnings = [];

    if ((weather.wind ?? 0) > 25) {
      warnings.push(`Vento forte (${weather.wind} km/h) - imagens podem perder nitidez.`);
    }

    if ((weather.precip ?? 0) > 0 || weather.condition.includes('Rain')) {
      warnings.push('Chuva detectada - cobertura de nuvens pode prejudicar medicoes.');
    }

    if ((weather.reliability ?? 0) < 60) {
      warnings.push(`Baixa confiabilidade meteorologica (${weather.reliability}%).`);
    }

    return {
      safe: warnings.length === 0,
      warnings
    };
  }

  onMapClick(lat, lon) {
    const weather = this.sanitizeWeatherData(this.getWeatherData());
    const warnings = this.checkWeatherForMeasurement();

    return {
      location: { lat, lon },
      weather: weather || null,
      measurement_warnings: warnings.warnings
    };
  }

  setupAutoUpdate() {
    if (window.weatherFusionEngine?.onChange && !this.unsubscribe) {
      this.unsubscribe = window.weatherFusionEngine.onChange(() => {
        this.updateSatelliteUI();
      });
    }

    window.setInterval(() => {
      const satelliteTab = document.getElementById('satellite');
      if (satelliteTab?.classList.contains('active')) {
        this.updateSatelliteUI();
      }
    }, 30000);
  }

  _withUnit(value, unit, roundInteger = false) {
    if (!Number.isFinite(value)) return '--';
    return roundInteger ? `${Math.round(value)}${unit}` : `${Number(value).toFixed(1)} ${unit}`;
  }
}

window.satelliteWeatherIntegration = new SatelliteWeatherIntegration();

document.addEventListener('DOMContentLoaded', () => {
  window.satelliteWeatherIntegration.setupAutoUpdate();

  const satelliteButton = document.querySelector('[onclick*="satellite"]');
  if (satelliteButton) {
    satelliteButton.addEventListener('click', () => {
      window.setTimeout(() => {
        window.satelliteWeatherIntegration.updateSatelliteUI();
      }, 500);
    });
  }
});
