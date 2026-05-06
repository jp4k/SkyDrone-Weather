(() => {
  const state = {
    mode: 'distance',
    activeLayer: 'satellite',
    areaClosed: false,
    points: [],
    mapReady: false,
    map: null,
    layers: {},
    activeLayerInstance: null,
    measurementLayer: null,
    button: null,
    tab: null,
    container: null,
    dom: {}
  };

  document.addEventListener('DOMContentLoaded', initSatelliteModule);

  function initSatelliteModule() {
    const scaffold = ensureSatelliteScaffold();
    if (!scaffold) return;

    state.button = scaffold.button;
    state.tab = scaffold.tab;
    state.container = scaffold.container;

    renderSatelliteShell();
    cacheDom();
    bindUI();
    observeTabVisibility();

    if (state.tab.classList.contains('active')) {
      ensureMapReady();
    }
  }

  function ensureSatelliteScaffold() {
    const tabsContainer = document.querySelector('.tabs');
    if (!tabsContainer) return null;

    let button = document.querySelector('[onclick="switchTab(\'satellite\')"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('onclick', "switchTab('satellite')");
      button.textContent = '🛰️ Satélite';
      tabsContainer.appendChild(button);
    }

    let tab = document.getElementById('satellite');
    if (!tab) {
      tab = document.createElement('div');
      tab.id = 'satellite';
      tab.className = 'content';
      tab.innerHTML = '<div id="satellite-system"></div>';

      const droneTab = document.getElementById('drone');
      if (droneTab && droneTab.parentNode) {
        droneTab.insertAdjacentElement('afterend', tab);
      } else {
        document.body.appendChild(tab);
      }
    }

    let container = tab.querySelector('#satellite-system');
    if (!container) {
      container = document.createElement('div');
      container.id = 'satellite-system';
      tab.appendChild(container);
    }

    return { button, tab, container };
  }

  function renderSatelliteShell() {
    state.container.innerHTML = `
      <section class="satellite-shell">
        <div class="satellite-frame">
          <section class="satellite-map-card">
            <div id="satellite-map" class="satellite-map" aria-label="Mapa interativo satelital"></div>

            <div class="satellite-floating-stack top-left">
              <div class="satellite-floating-card">
                <h4>Ferramentas</h4>
                <div class="satellite-button-grid tools" id="satellite-tool-buttons">
                  <button class="satellite-btn is-active" type="button" data-satellite-mode="distance">📏 Distância</button>
                  <button class="satellite-btn" type="button" data-satellite-mode="area">🌾 Área</button>
                  <button class="satellite-btn is-area" type="button" id="satellite-close-area-btn">🔺 Fechar área</button>
                  <button class="satellite-btn is-clear" type="button" id="satellite-clear-btn">🧹 Limpar</button>
                </div>
              </div>

              <div class="satellite-live-chip" id="satellite-live-status">Clique no mapa para adicionar o primeiro ponto.</div>
            </div>

            <div class="satellite-floating-stack top-right">
              <div class="satellite-floating-card">
                <h4>Camadas</h4>
                <div class="satellite-button-grid layers" id="satellite-layer-buttons">
                  <button class="satellite-btn" type="button" data-satellite-layer="standard">🌍 Padrão</button>
                  <button class="satellite-btn is-active" type="button" data-satellite-layer="satellite">🛰️ Satélite</button>
                  <button class="satellite-btn" type="button" data-satellite-layer="terrain">🗻 Relevo</button>
                  <button class="satellite-btn" type="button" data-satellite-layer="hybrid">🧭 Híbrido</button>
                </div>
              </div>
            </div>

            <div class="satellite-summary">
              <div class="satellite-floating-card">
                <div class="satellite-summary-grid">
                  <div class="satellite-summary-card">
                    <div class="satellite-summary-label">Modo ativo</div>
                    <div class="satellite-summary-value" id="satellite-summary-mode">Distância</div>
                    <div class="satellite-summary-note" id="satellite-summary-note">Pronto para medir trajetos ponto a ponto.</div>
                  </div>
                  <div class="satellite-summary-card">
                    <div class="satellite-summary-label">Resultado</div>
                    <div class="satellite-summary-value" id="satellite-summary-primary">0 m</div>
                    <div class="satellite-summary-note" id="satellite-summary-secondary">Área: 0 m² • 0 ha</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside class="satellite-panel">
            <div class="satellite-panel-hero">
              <div>
                <span class="satellite-eyebrow">Satellite GIS</span>
                <h2 class="satellite-panel-title">Medição profissional no mapa</h2>
                <p class="satellite-panel-text">
                  Alterne camadas em tempo real, marque pontos com precisão e acompanhe distância total,
                  perímetro e área em uma experiência inspirada em ferramentas GIS.
                </p>
              </div>
              <div class="satellite-panel-icon">🌍</div>
            </div>

            <div class="satellite-stat-grid">
              <div class="satellite-stat-card">
                <div class="satellite-stat-label">Modo</div>
                <div class="satellite-stat-value" id="satellite-active-mode">Distância</div>
                <div class="satellite-stat-detail" id="satellite-mode-detail">Some segmentos entre pontos para medir trajetos.</div>
              </div>
              <div class="satellite-stat-card">
                <div class="satellite-stat-label">Pontos</div>
                <div class="satellite-stat-value" id="satellite-points-count">0</div>
                <div class="satellite-stat-detail">Cada clique adiciona um novo vértice com latitude e longitude.</div>
              </div>
              <div class="satellite-stat-card">
                <div class="satellite-stat-label">Distância total</div>
                <div class="satellite-stat-value" id="satellite-total-distance">0 m</div>
                <div class="satellite-stat-detail" id="satellite-total-distance-detail">Aguardando dois pontos para calcular.</div>
              </div>
              <div class="satellite-stat-card">
                <div class="satellite-stat-label">Área</div>
                <div class="satellite-stat-value" id="satellite-area-value">0 m²</div>
                <div class="satellite-stat-detail" id="satellite-area-detail">0 ha • adicione pelo menos 3 pontos.</div>
              </div>
              <div class="satellite-stat-card full">
                <div class="satellite-stat-label">Último ponto</div>
                <div class="satellite-stat-value" id="satellite-last-point">Nenhum ponto</div>
                <div class="satellite-stat-detail" id="satellite-last-point-detail">Clique no mapa para iniciar a medição.</div>
              </div>
            </div>

            <section class="satellite-points-panel">
              <div class="satellite-points-header">
                <h3>Pontos marcados</h3>
                <span class="satellite-live-chip" id="satellite-points-total">0 vértices</span>
              </div>
              <div class="satellite-points-list" id="satellite-points-list">
                <div class="satellite-points-empty">
                  Nenhum ponto registrado ainda. Use os botões flutuantes do mapa e clique para começar a medir.
                </div>
              </div>
            </section>

            <section class="satellite-tip-list">
              <div class="satellite-tip">
                Distância: clique em sequência para medir trajetos em metros e quilômetros com atualização instantânea.
              </div>
              <div class="satellite-tip">
                Área: troque para o modo de área, adicione ao menos 3 pontos e use “Fechar área” para travar o polígono.
              </div>
              <div class="satellite-tip">
                <span class="satellite-legend"><span class="satellite-legend-line"></span> Linha de medição</span>
                <span class="satellite-legend"><span class="satellite-legend-area"></span> Área destacada</span>
              </div>
            </section>
          </aside>
        </div>
      </section>
    `;
  }

  function cacheDom() {
    const ids = [
      'satellite-map',
      'satellite-tool-buttons',
      'satellite-layer-buttons',
      'satellite-close-area-btn',
      'satellite-clear-btn',
      'satellite-live-status',
      'satellite-summary-mode',
      'satellite-summary-note',
      'satellite-summary-primary',
      'satellite-summary-secondary',
      'satellite-active-mode',
      'satellite-mode-detail',
      'satellite-points-count',
      'satellite-total-distance',
      'satellite-total-distance-detail',
      'satellite-area-value',
      'satellite-area-detail',
      'satellite-last-point',
      'satellite-last-point-detail',
      'satellite-points-total',
      'satellite-points-list'
    ];

    ids.forEach((id) => {
      state.dom[id] = document.getElementById(id);
    });
  }

  function bindUI() {
    state.dom['satellite-tool-buttons'].addEventListener('click', (event) => {
      const modeButton = event.target.closest('[data-satellite-mode]');
      if (modeButton) {
        setMode(modeButton.dataset.satelliteMode);
        return;
      }

      if (event.target.closest('#satellite-close-area-btn')) {
        toggleAreaClosed();
        return;
      }

      if (event.target.closest('#satellite-clear-btn')) {
        clearMeasurements();
      }
    });

    state.dom['satellite-layer-buttons'].addEventListener('click', (event) => {
      const layerButton = event.target.closest('[data-satellite-layer]');
      if (!layerButton) return;
      setMapLayer(layerButton.dataset.satelliteLayer);
    });

    state.dom['satellite-points-list'].addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-satellite-remove]');
      if (!removeButton) return;
      removePoint(Number(removeButton.dataset.satelliteRemove));
    });
  }

  function observeTabVisibility() {
    const observer = new MutationObserver(() => {
      if (state.tab.classList.contains('active')) {
        ensureMapReady();
        window.setTimeout(() => {
          if (state.map) state.map.invalidateSize();
        }, 120);
      }
    });

    observer.observe(state.tab, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  function ensureMapReady() {
    if (state.mapReady) {
      state.map.invalidateSize();
      return;
    }

    state.map = L.map('satellite-map', {
      zoomControl: true,
      preferCanvas: true
    }).setView([-15.793889, -47.882778], 5);

    state.layers = createLayerCatalog();
    state.measurementLayer = L.layerGroup().addTo(state.map);
    setMapLayer(state.activeLayer, true);

    state.map.on('click', handleMapClick);
    state.mapReady = true;
    renderMeasurements();
  }

  function createLayerCatalog() {
    const standard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    });

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    });

    const terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data &copy; OpenTopoMap contributors',
      maxZoom: 17
    });

    const hybridBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    });

    const hybridLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
      attribution: '&copy; CARTO',
      maxZoom: 20
    });

    return {
      standard,
      satellite,
      terrain,
      hybrid: L.layerGroup([hybridBase, hybridLabels])
    };
  }

  function setMapLayer(layerKey, initial = false) {
    if (!state.layers[layerKey]) return;

    if (state.activeLayerInstance && state.map.hasLayer(state.activeLayerInstance)) {
      state.map.removeLayer(state.activeLayerInstance);
    }

    state.activeLayer = layerKey;
    state.activeLayerInstance = state.layers[layerKey];
    state.activeLayerInstance.addTo(state.map);

    updateLayerButtons();
    if (!initial) {
      updateLiveStatus(`Camada ${getLayerLabel(layerKey)} ativada sem perder o zoom atual.`);
    }
  }

  function handleMapClick(event) {
    if (state.mode === 'area' && state.areaClosed) {
      updateLiveStatus('A área já está fechada. Remova um ponto ou limpe para iniciar outra medição.');
      return;
    }

    state.points.push({
      lat: event.latlng.lat,
      lng: event.latlng.lng
    });

    renderMeasurements();
  }

  function setMode(mode) {
    if (mode === state.mode) return;

    state.mode = mode;
    if (mode !== 'area') {
      state.areaClosed = false;
    }

    updateModeButtons();
    renderMeasurements();
  }

  function toggleAreaClosed() {
    if (state.mode !== 'area') {
      updateLiveStatus('Troque para o modo Área para fechar o polígono.');
      return;
    }

    if (state.points.length < 3) {
      updateLiveStatus('Adicione pelo menos 3 pontos antes de fechar a área.');
      return;
    }

    state.areaClosed = !state.areaClosed;
    renderMeasurements();
  }

  function clearMeasurements() {
    state.points = [];
    state.areaClosed = false;
    renderMeasurements();
  }

  function removePoint(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.points.length) return;

    state.points.splice(index, 1);
    if (state.points.length < 3) {
      state.areaClosed = false;
    }

    renderMeasurements();
  }

  function renderMeasurements() {
    const points = state.points;
    const openDistance = calculatePathDistance(points, false);
    const closedDistance = calculatePathDistance(points, true);
    const area = calculatePolygonArea(points);
    const lastPoint = points.length ? points[points.length - 1] : null;
    const isAreaMode = state.mode === 'area';
    const effectiveDistance = isAreaMode ? (state.areaClosed ? closedDistance : openDistance) : openDistance;

    updateModeButtons();
    updateLayerButtons();
    updatePointList();

    if (state.mapReady) {
      state.measurementLayer.clearLayers();
      drawMeasurements(points, isAreaMode);
    }

    state.dom['satellite-points-count'].textContent = String(points.length);
    state.dom['satellite-points-total'].textContent = `${points.length} ${points.length === 1 ? 'vértice' : 'vértices'}`;
    state.dom['satellite-total-distance'].textContent = formatDistance(effectiveDistance);
    state.dom['satellite-total-distance-detail'].textContent = isAreaMode
      ? `Perímetro potencial: ${formatDistance(closedDistance)}`
      : `${points.length >= 2 ? 'Trajeto atualizado em tempo real.' : 'Aguardando dois pontos para calcular.'}`;

    state.dom['satellite-area-value'].textContent = formatAreaPrimary(area);
    state.dom['satellite-area-detail'].textContent = `${formatAreaSecondary(area)} • ${getPolygonStatusLabel(points.length, state.areaClosed)}`;
    state.dom['satellite-summary-primary'].textContent = formatDistance(effectiveDistance);
    state.dom['satellite-summary-secondary'].textContent = `Área: ${formatAreaPrimary(area)} • ${formatAreaSecondary(area)}`;

    if (isAreaMode) {
      state.dom['satellite-summary-mode'].textContent = 'Área';
      state.dom['satellite-active-mode'].textContent = state.areaClosed ? 'Área fechada' : 'Área em edição';
      state.dom['satellite-mode-detail'].textContent = state.areaClosed
        ? 'Polígono travado. Use remover ponto ou limpar para medir outra área.'
        : 'Adicione pontos e feche o polígono quando quiser consolidar a medição.';
      state.dom['satellite-summary-note'].textContent = state.areaClosed
        ? 'Polígono fechado com perímetro e área consolidados.'
        : 'Prévia dinâmica da área enquanto você adiciona vértices.';
    } else {
      state.dom['satellite-summary-mode'].textContent = 'Distância';
      state.dom['satellite-active-mode'].textContent = 'Distância';
      state.dom['satellite-mode-detail'].textContent = 'Some segmentos entre pontos para medir trajetos.';
      state.dom['satellite-summary-note'].textContent = 'Pronto para medir trajetos ponto a ponto.';
    }

    if (lastPoint) {
      state.dom['satellite-last-point'].textContent = `${formatCoordinate(lastPoint.lat, 5)}°, ${formatCoordinate(lastPoint.lng, 5)}°`;
      state.dom['satellite-last-point-detail'].textContent = `Latitude ${formatCoordinate(lastPoint.lat, 6)} • Longitude ${formatCoordinate(lastPoint.lng, 6)}`;
    } else {
      state.dom['satellite-last-point'].textContent = 'Nenhum ponto';
      state.dom['satellite-last-point-detail'].textContent = 'Clique no mapa para iniciar a medição.';
    }

    updateLiveStatus(buildLiveStatusMessage(points.length, openDistance, area, isAreaMode, state.areaClosed));
  }

  function drawMeasurements(points, isAreaMode) {
    if (!points.length) return;

    const latLngs = points.map((point) => [point.lat, point.lng]);

    points.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: 'satellite-marker-wrapper',
          html: `<div class="satellite-marker">${index + 1}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        })
      });

      marker.bindPopup(`
        <strong>Ponto ${index + 1}</strong><br>
        Lat: ${formatCoordinate(point.lat, 6)}<br>
        Lon: ${formatCoordinate(point.lng, 6)}
      `);

      state.measurementLayer.addLayer(marker);
    });

    if (points.length >= 2) {
      const line = L.polyline(latLngs, {
        color: '#f59e0b',
        weight: 4,
        opacity: 0.95,
        dashArray: isAreaMode && !state.areaClosed ? '10 8' : null
      });

      state.measurementLayer.addLayer(line);
      attachLineTooltip(latLngs, isAreaMode);
    }

    if (isAreaMode && points.length >= 3) {
      const polygon = L.polygon(latLngs, {
        color: state.areaClosed ? '#22c55e' : '#38bdf8',
        weight: 3,
        opacity: 1,
        dashArray: state.areaClosed ? null : '8 8',
        fillColor: '#22c55e',
        fillOpacity: state.areaClosed ? 0.22 : 0.14
      });

      state.measurementLayer.addLayer(polygon);
      attachAreaTooltip(points);
    }
  }

  function attachLineTooltip(latLngs, isAreaMode) {
    const lastLatLng = latLngs[latLngs.length - 1];
    const openDistance = calculatePathDistance(state.points, false);
    const label = isAreaMode
      ? `Trajeto: ${formatDistance(openDistance)}`
      : `Distância: ${formatDistance(openDistance)}`;

    const tooltipHost = L.marker(lastLatLng, {
      opacity: 0,
      interactive: false
    });

    tooltipHost.bindTooltip(label, {
      permanent: true,
      direction: 'top',
      className: 'satellite-map-tooltip',
      offset: [0, -10]
    });

    state.measurementLayer.addLayer(tooltipHost);
  }

  function attachAreaTooltip(points) {
    const centroid = getCentroid(points);
    const closedDistance = calculatePathDistance(points, true);
    const area = calculatePolygonArea(points);
    const tooltipHost = L.marker([centroid.lat, centroid.lng], {
      opacity: 0,
      interactive: false
    });

    tooltipHost.bindTooltip(`${formatAreaPrimary(area)} • ${formatDistance(closedDistance)}`, {
      permanent: true,
      direction: 'center',
      className: 'satellite-map-tooltip'
    });

    state.measurementLayer.addLayer(tooltipHost);
  }

  function updatePointList() {
    if (!state.points.length) {
      state.dom['satellite-points-list'].innerHTML = `
        <div class="satellite-points-empty">
          Nenhum ponto registrado ainda. Use os botões flutuantes do mapa e clique para começar a medir.
        </div>
      `;
      return;
    }

    state.dom['satellite-points-list'].innerHTML = state.points
      .map((point, index) => `
        <div class="satellite-point-row">
          <div class="satellite-point-badge">${index + 1}</div>
          <div class="satellite-point-coords">
            <div class="satellite-point-name">Ponto ${index + 1}</div>
            <div class="satellite-point-meta">Lat ${formatCoordinate(point.lat, 6)} • Lon ${formatCoordinate(point.lng, 6)}</div>
          </div>
          <button class="satellite-remove-btn" type="button" data-satellite-remove="${index}">Remover</button>
        </div>
      `)
      .join('');
  }

  function updateModeButtons() {
    const modeButtons = state.container.querySelectorAll('[data-satellite-mode]');
    modeButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.satelliteMode === state.mode);
    });

    const closeButton = state.dom['satellite-close-area-btn'];
    closeButton.classList.toggle('is-active', state.mode === 'area' && state.areaClosed);
    closeButton.textContent = state.mode === 'area' && state.areaClosed ? '✅ Área fechada' : '🔺 Fechar área';
  }

  function updateLayerButtons() {
    const layerButtons = state.container.querySelectorAll('[data-satellite-layer]');
    layerButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.satelliteLayer === state.activeLayer);
    });
  }

  function updateLiveStatus(message) {
    state.dom['satellite-live-status'].textContent = message;
  }

  function calculatePathDistance(points, closePath) {
    if (points.length < 2) return 0;

    let distance = 0;
    for (let index = 1; index < points.length; index += 1) {
      distance += distanceBetween(points[index - 1], points[index]);
    }

    if (closePath && points.length >= 3) {
      distance += distanceBetween(points[points.length - 1], points[0]);
    }

    return distance;
  }

  function distanceBetween(pointA, pointB) {
    if (state.mapReady) {
      return state.map.distance([pointA.lat, pointA.lng], [pointB.lat, pointB.lng]);
    }

    const toRadians = (value) => (value * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRadians(pointB.lat - pointA.lat);
    const dLng = toRadians(pointB.lng - pointA.lng);
    const lat1 = toRadians(pointA.lat);
    const lat2 = toRadians(pointB.lat);

    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calculatePolygonArea(points) {
    if (points.length < 3) return 0;

    const toRadians = (value) => (value * Math.PI) / 180;
    const earthRadius = 6378137;
    let total = 0;

    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      total += toRadians(next.lng - current.lng) *
        (2 + Math.sin(toRadians(current.lat)) + Math.sin(toRadians(next.lat)));
    }

    return Math.abs((total * earthRadius * earthRadius) / 2);
  }

  function getCentroid(points) {
    const sum = points.reduce((accumulator, point) => {
      accumulator.lat += point.lat;
      accumulator.lng += point.lng;
      return accumulator;
    }, { lat: 0, lng: 0 });

    return {
      lat: sum.lat / points.length,
      lng: sum.lng / points.length
    };
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters) || meters <= 0) return '0 m';
    if (meters < 1000) return `${meters.toFixed(1)} m`;
    return `${(meters / 1000).toFixed(3)} km`;
  }

  function formatAreaPrimary(areaSqMeters) {
    if (!Number.isFinite(areaSqMeters) || areaSqMeters <= 0) return '0 m²';
    if (areaSqMeters < 10000) return `${areaSqMeters.toFixed(1)} m²`;
    return `${areaSqMeters.toFixed(0)} m²`;
  }

  function formatAreaSecondary(areaSqMeters) {
    if (!Number.isFinite(areaSqMeters) || areaSqMeters <= 0) return '0 ha';
    return `${(areaSqMeters / 10000).toFixed(4)} ha`;
  }

  function formatCoordinate(value, digits) {
    return Number(value).toFixed(digits);
  }

  function buildLiveStatusMessage(pointCount, distance, area, isAreaMode, areaClosed) {
    if (!pointCount) {
      return 'Clique no mapa para adicionar o primeiro ponto.';
    }

    if (!isAreaMode) {
      return pointCount === 1
        ? 'Primeiro ponto registrado. Adicione outro para medir a distância.'
        : `Trajeto atualizado: ${formatDistance(distance)} em ${pointCount} pontos.`;
    }

    if (pointCount < 3) {
      return 'Modo área ativo. Adicione pelo menos 3 pontos para começar a calcular.';
    }

    return areaClosed
      ? `Área consolidada: ${formatAreaPrimary(area)} • ${formatAreaSecondary(area)}.`
      : `Prévia de área: ${formatAreaPrimary(area)} • ${formatAreaSecondary(area)}.`;
  }

  function getPolygonStatusLabel(pointCount, areaClosed) {
    if (pointCount < 3) return 'Polígono incompleto';
    return areaClosed ? 'Polígono fechado' : 'Prévia aberta';
  }

  function getLayerLabel(layerKey) {
    const labels = {
      standard: 'Padrão',
      satellite: 'Satélite',
      terrain: 'Relevo',
      hybrid: 'Híbrido'
    };

    return labels[layerKey] || layerKey;
  }
})();
