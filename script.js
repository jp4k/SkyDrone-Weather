(() => {
  'use strict';

  function hasModernClimateShell() {
    return Boolean(
      document.getElementById('locationSearchForm')
      && document.getElementById('climaLocationLabel')
      && document.getElementById('map')
    );
  }

  function hasLegacyWeatherShell() {
    return Boolean(
      document.getElementById('city-name')
      && document.getElementById('current-temp')
      && document.getElementById('status-msg')
    );
  }

  function renderLegacyShell() {
    if (!hasLegacyWeatherShell() || !window.weatherFusionEngine?.getLastData) return;

    const data = window.weatherFusionEngine.getLastData();
    if (!data) return;

    const cityName = document.getElementById('city-name');
    const currentTemp = document.getElementById('current-temp');
    const feelLike = document.getElementById('feel-like');
    const humidity = document.getElementById('humidity');
    const windSpeed = document.getElementById('wind-speed');
    const precipitation = document.getElementById('precipitation');
    const weatherIcon = document.getElementById('weather-icon');
    const statusMsg = document.getElementById('status-msg');

    if (cityName) cityName.textContent = data.location?.name || 'Ponto selecionado';
    if (currentTemp) currentTemp.textContent = data.temp == null ? '--' : `${data.temp}\u00B0C`;
    if (feelLike) feelLike.textContent = data.feels_like == null ? 'Sensacao: --' : `Sensacao: ${data.feels_like}\u00B0C`;
    if (humidity) humidity.textContent = data.humidity == null ? '--' : `${data.humidity}%`;
    if (windSpeed) windSpeed.textContent = data.wind == null ? '--' : `${data.wind} km/h`;
    if (precipitation) precipitation.textContent = `${Math.round(Number(data.rain_probability || 0))}%`;
    if (weatherIcon) weatherIcon.textContent = data.icon || '--';
    if (statusMsg) {
      const totalSources = data.sources_total || data.analytics?.providerTotal || data.sources_count || 0;
      statusMsg.textContent = `Confiabilidade ${data.reliability || 0}% | Fontes ${data.sources_count || 0}/${totalSources}`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (hasModernClimateShell()) {
      return;
    }

    renderLegacyShell();
    window.weatherFusionEngine?.onChange?.(() => {
      renderLegacyShell();
    });
  });
})();
