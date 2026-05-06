(() => {
  'use strict';

  const STORAGE_KEYS = {
    guideSeen: 'vento.ux.guide.seen.v1',
    mode: 'vento.ux.mode.v1',
    mission: 'vento.ux.mission.v1',
    layers: 'vento.ux.layers.v1',
    snap: 'vento.ux.snap.v1'
  };

  const LAYER_LABELS = {
    wind: 'Vento',
    heat: 'Calor',
    elevation: 'Elevacao',
    grid: 'Grid',
    gcp: 'GCP'
  };

  const MOBILE_SECTIONS = [
    { key: 'map', label: 'Mapa', symbol: 'M' },
    { key: 'planning', label: 'Planejamento', symbol: 'P' },
    { key: 'gcp', label: 'GCP', symbol: 'G' },
    { key: 'apps', label: 'Apps', symbol: 'A' },
    { key: 'settings', label: 'Config.', symbol: 'C' }
  ];

  const SOURCE_COMPARISON_RULES = Object.freeze({
    temperature: { safeSpread: 3, outlierSpread: 7, penalty: 1.8 },
    windSpeed: { safeSpread: 8, outlierSpread: 18, penalty: 0.65 },
    windGusts: { safeSpread: 12, outlierSpread: 24, penalty: 0.45 },
    humidity: { safeSpread: 15, outlierSpread: 30, penalty: 0.22 },
    pressure: { safeSpread: 5, outlierSpread: 11, penalty: 0.65 },
    rainProbability: { safeSpread: 35, outlierSpread: 70, penalty: 0.08 },
    precipitation: { safeSpread: 2, outlierSpread: 8, penalty: 1.2 },
    visibilityKm: { safeSpread: 5, outlierSpread: 12, penalty: 0.8 },
    cloudCover: { safeSpread: 35, outlierSpread: 70, penalty: 0.08 }
  });

  const WEATHER_SOURCE_FIELDS = Object.freeze([
    'temperature',
    'windSpeed',
    'humidity',
    'pressure',
    'rainProbability',
    'visibilityKm'
  ]);

  const CACHE_RECENT_MAX_SCORE = 75;
  const CACHE_WARM_MAX_SCORE = 68;

  const state = {
    map: null,
    droneMap: null,
    api: {},
    shell: null,
    elements: {},
    missionPoints: [],
    selectedIds: new Set(),
    undoStack: [],
    redoStack: [],
    markerById: new Map(),
    routeLayer: null,
    polygonLayer: null,
    overlayGroups: {},
    activeLayers: new Set(loadLayerList()),
    latestWeather: null,
    latestAnalysis: null,
    latestComparison: null,
    snapEnabled: loadJson(STORAGE_KEYS.snap, true),
    activeMobileSection: 'map',
    mapBound: false,
    uiBound: false,
    dragMission: {
      armed: false,
      active: false,
      startLatLng: null,
      originalPoints: [],
      frame: null
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindRippleFeedback();
    ensureToastStack();
    ensureBottomNav();
    applySavedMode();
    handleTabChange(document.querySelector('.content.active')?.id || 'clima');
  });

  function attachClimateMap(api = {}) {
    if (!api.map) return;

    state.map = api.map;
    state.api = {
      ...state.api,
      ...api
    };

    ensureMapShell();
    ensureOverlayGroups();
    ensureOverlayDom();
    bindMapEvents();
    loadMission();
    renderMission();
    renderLayerToggles();
    refreshOptionalLayers();
    updateHudForLocation(getCurrentLocation());
    updateWeatherDashboard({
      bundle: api.getState?.()?.weatherBundle || state.latestWeather?.bundle || null,
      providerRuns: api.getState?.()?.providerRuns || state.latestWeather?.providerRuns || [],
      cacheInfo: api.getState?.()?.cacheInfo || {},
      location: api.getState?.()?.location || getCurrentLocation()
    });

    window.setTimeout(() => state.map?.invalidateSize?.(), 80);
  }

  function attachDroneMap(api = {}) {
    if (!api.map) return;
    state.droneMap = api.map;

    if (state.droneMap.__ventoUxEnhanced) return;
    state.droneMap.__ventoUxEnhanced = true;

    state.droneMap.options.zoomAnimation = true;
    state.droneMap.options.markerZoomAnimation = true;
    state.droneMap.options.wheelDebounceTime = 32;

    if (api.marker?.bindTooltip) {
      api.marker.bindTooltip('Ponto operacional do drone', {
        direction: 'top',
        opacity: 0.92
      });
    }

    if (typeof L !== 'undefined') {
      L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(state.droneMap);
    }
  }

  function updateWeatherDashboard(input = {}) {
    const bundle = input.bundle || input.weatherBundle || null;
    const providerRuns = input.providerRuns || bundle?.providers || [];
    const cacheInfo = input.cacheInfo || {};
    const location = input.location || bundle?.location || getCurrentLocation();
    const analysis = input.analysis || buildLocalFlightAnalysis(bundle, cacheInfo);

    state.latestWeather = {
      bundle,
      providerRuns,
      cacheInfo,
      location,
      modelsSummary: input.modelsSummary || buildModelsSummary(providerRuns),
      updateAgeText: input.updateAgeText || ''
    };
    state.latestAnalysis = analysis;
    state.latestComparison = buildSourceComparison(bundle, providerRuns);

    updateHudForLocation(location);
    renderDashboard();
    renderMobileSection(state.activeMobileSection);
    refreshOptionalLayers();
  }

  function handleTabChange(tab) {
    const bottomNav = document.querySelector('.ux-bottom-nav');
    const sheet = document.querySelector('.mission-bottom-sheet');
    const showMissionUi = tab === 'clima';

    bottomNav?.classList.toggle('is-hidden', !showMissionUi);
    sheet?.classList.toggle('is-hidden', !showMissionUi);

    if (showMissionUi) {
      window.setTimeout(() => state.map?.invalidateSize?.(), 120);
    }
  }

  function ensureMapShell() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    if (!mapEl.parentElement?.classList.contains('map-viewport-shell')) {
      const shell = document.createElement('div');
      shell.className = 'map-viewport-shell';
      mapEl.parentNode.insertBefore(shell, mapEl);
      shell.appendChild(mapEl);
    }

    state.shell = mapEl.parentElement;
  }

  function ensureOverlayDom() {
    if (!state.shell) return;

    if (!state.elements.hud) {
      state.elements.hud = createElement('div', 'map-ux-hud');
      state.elements.hud.innerHTML = `
        <div class="ux-hud-grid">
          <div class="ux-hud-item">
            <span class="ux-hud-label">Coordenadas</span>
            <strong class="ux-hud-value" data-ux="coords">--</strong>
          </div>
          <div class="ux-hud-item">
            <span class="ux-hud-label">Altitude est.</span>
            <strong class="ux-hud-value" data-ux="altitude">-- m</strong>
          </div>
          <div class="ux-hud-item">
            <span class="ux-hud-label">Escala</span>
            <strong class="ux-hud-value" data-ux="scale">--</strong>
          </div>
        </div>
        <div class="ux-hud-actions">
          <button class="ux-icon-btn" type="button" data-ux-action="center" title="Centralizar tudo">C</button>
          <button class="ux-icon-btn" type="button" data-ux-action="undo" title="Desfazer">U</button>
          <button class="ux-icon-btn" type="button" data-ux-action="redo" title="Refazer">R</button>
          <button class="ux-icon-btn" type="button" data-ux-action="guide" title="Guia rapido">?</button>
        </div>
      `;
      state.shell.appendChild(state.elements.hud);
    }

    if (!state.elements.dashboard) {
      state.elements.dashboard = createElement('aside', 'mission-dashboard');
      state.shell.appendChild(state.elements.dashboard);
    }

    if (!state.elements.layerBank) {
      state.elements.layerBank = createElement('div', 'ux-layer-bank');
      state.shell.appendChild(state.elements.layerBank);
    }

    if (!state.elements.contextMenu) {
      state.elements.contextMenu = createElement('div', 'ux-map-context-menu');
      state.elements.contextMenu.innerHTML = `
        <button class="ux-context-action" type="button" data-context-action="add-waypoint">
          <span>Adicionar waypoint</span><span class="ux-context-kbd">W</span>
        </button>
        <button class="ux-context-action" type="button" data-context-action="add-gcp">
          <span>Adicionar GCP</span><span class="ux-context-kbd">G</span>
        </button>
        <button class="ux-context-action" type="button" data-context-action="add-photo">
          <span>Adicionar foto</span><span class="ux-context-kbd">F</span>
        </button>
        <button class="ux-context-action" type="button" data-context-action="set-location">
          <span>Usar como ponto ativo</span><span class="ux-context-kbd">L</span>
        </button>
        <button class="ux-context-action" type="button" data-context-action="edit">
          <span>Editar selecionado</span><span class="ux-context-kbd">E</span>
        </button>
        <button class="ux-context-action" type="button" data-context-action="drag-mission">
          <span>Mover missao</span><span class="ux-context-kbd">Shift</span>
        </button>
        <button class="ux-context-action danger" type="button" data-context-action="remove">
          <span>Remover selecionados</span><span class="ux-context-kbd">Del</span>
        </button>
      `;
      state.shell.appendChild(state.elements.contextMenu);
    }

    if (!state.elements.guide) {
      state.elements.guide = createElement('div', 'ux-quick-guide');
      state.elements.guide.innerHTML = `
        <h3>Mapa pronto para planejamento</h3>
        <p>Use clique direito para inserir waypoint ou GCP, selecione varios pontos com Ctrl/Shift e arraste pontos para ajustar a rota.</p>
        <div class="ux-guide-row">
          <span class="ux-guide-pill">+ / - zoom</span>
          <span class="ux-guide-pill">Del remove</span>
          <span class="ux-guide-pill">Shift arrasta missao</span>
          <button class="ux-guide-action" type="button" data-ux-action="dismiss-guide">Comecar</button>
        </div>
      `;
      if (loadJson(STORAGE_KEYS.guideSeen, false)) {
        state.elements.guide.classList.add('is-hidden');
      }
      state.shell.appendChild(state.elements.guide);
    }

    if (!state.uiBound) {
      state.uiBound = true;
      state.shell.addEventListener('click', handleShellClick);
      state.elements.contextMenu.addEventListener('click', handleContextClick);
      document.addEventListener('click', (event) => {
        if (!state.elements.contextMenu?.contains(event.target)) {
          hideContextMenu();
        }
      });
      document.addEventListener('keydown', handleKeyboard);
    }
  }

  function ensureBottomNav() {
    if (document.querySelector('.ux-bottom-nav')) return;

    const nav = createElement('nav', 'ux-bottom-nav');
    nav.setAttribute('aria-label', 'Navegacao do planejamento');
    nav.innerHTML = MOBILE_SECTIONS.map((section) => `
      <button type="button" data-ux-section="${section.key}" data-symbol="${section.symbol}">
        ${section.label}
      </button>
    `).join('');
    document.body.appendChild(nav);

    nav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-ux-section]');
      if (!button) return;
      activateMobileSection(button.dataset.uxSection);
    });

    syncBottomNav();
  }

  function ensureBottomSheet() {
    let sheet = document.querySelector('.mission-bottom-sheet');
    if (sheet) return sheet;

    sheet = createElement('section', 'mission-bottom-sheet');
    sheet.innerHTML = `
      <button class="ux-sheet-handle" type="button" aria-label="Expandir ou recolher painel"></button>
      <div data-sheet-stage></div>
    `;
    document.body.appendChild(sheet);

    const handle = sheet.querySelector('.ux-sheet-handle');
    let pointerHandled = false;
    handle.addEventListener('click', () => {
      if (pointerHandled) return;
      sheet.classList.toggle('is-expanded');
    });

    let startY = null;
    handle.addEventListener('pointerdown', (event) => {
      startY = event.clientY;
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointerup', (event) => {
      if (startY == null) return;
      pointerHandled = true;
      const delta = event.clientY - startY;
      sheet.classList.toggle('is-expanded', delta < 12);
      if (delta > 22) sheet.classList.remove('is-expanded');
      startY = null;
      window.setTimeout(() => {
        pointerHandled = false;
      }, 0);
    });

    return sheet;
  }

  function activateMobileSection(section) {
    const nextSection = MOBILE_SECTIONS.some((item) => item.key === section) ? section : 'map';
    state.activeMobileSection = nextSection;

    if (document.getElementById('clima') && !document.getElementById('clima').classList.contains('active')) {
      window.switchTab?.('clima');
    }

    const sheet = ensureBottomSheet();
    if (nextSection === 'map') {
      sheet.classList.remove('is-expanded');
      state.shell?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      window.setTimeout(() => state.map?.invalidateSize?.(), 180);
    } else {
      sheet.classList.add('is-expanded');
    }

    renderMobileSection(nextSection);
    syncBottomNav();
  }

  function syncBottomNav() {
    document.querySelectorAll('.ux-bottom-nav [data-ux-section]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.uxSection === state.activeMobileSection);
    });
  }

  function renderMobileSection(section) {
    const sheet = ensureBottomSheet();
    const stage = sheet.querySelector('[data-sheet-stage]');
    if (!stage) return;

    const mission = calculateMissionMetrics();
    const current = state.latestWeather?.bundle?.current || {};
    const comparison = state.latestComparison || buildSourceComparison(state.latestWeather?.bundle, state.latestWeather?.providerRuns);

    const sections = {
      map: renderSheetMap(mission),
      planning: renderSheetPlanning(mission, current),
      gcp: renderSheetGcp(mission),
      apps: renderSheetApps(comparison),
      settings: renderSheetSettings()
    };

    stage.innerHTML = sections[section] || sections.map;
    bindSheetActions(stage);
  }

  function renderSheetMap(mission) {
    return `
      <div class="ux-sheet-section is-active">
        <span class="ux-sheet-kicker">Operacao</span>
        <h3 class="ux-sheet-title">Resumo do mapa</h3>
        <div class="ux-mini-grid">
          ${miniStat('Pontos', mission.points, 'waypoints + GCP')}
          ${miniStat('Area', `${mission.areaHa.toFixed(2)} ha`, 'poligono ativo')}
          ${miniStat('Rota', mission.distanceText, 'trajeto estimado')}
        </div>
        ${renderWeatherMiniGrid()}
      </div>
    `;
  }

  function renderSheetPlanning(mission, current) {
    return `
      <div class="ux-sheet-section is-active">
        <span class="ux-sheet-kicker">Planejamento</span>
        <h3 class="ux-sheet-title">Missao fotogrametrica</h3>
        <div class="ux-sheet-grid">
          ${sheetCard('Tempo de voo', `${mission.flightMinutes} min`, 'Baseado em area, rota e margem operacional.')}
          ${sheetCard('Fotos', String(mission.photos), 'Estimativa por cobertura e sobreposicao padrao.')}
          ${sheetCard('Baterias', String(mission.batteries), 'Autonomia conservadora de 22 min por bateria.')}
          ${sheetCard('Qualidade', `${mission.quality}%`, `Vento ${formatNumber(current.windSpeed, 1)} km/h e confiabilidade ativa.`)}
        </div>
      </div>
    `;
  }

  function renderSheetGcp(mission) {
    const gcps = state.missionPoints.filter((point) => point.type === 'gcp');
    const list = gcps.length
      ? gcps.map((point, index) => sheetCard(`GCP ${index + 1}`, formatLatLng(point.lat, point.lng, 5), point.label)).join('')
      : sheetCard('GCP', '0 pontos', 'Clique direito no mapa para adicionar pontos de controle.');

    return `
      <div class="ux-sheet-section is-active">
        <span class="ux-sheet-kicker">Controle terrestre</span>
        <h3 class="ux-sheet-title">Cobertura GCP</h3>
        <div class="ux-sheet-grid">
          ${sheetCard('Cobertura', `${mission.gcpCoverage}%`, 'Raio visual de controle aplicado no mapa.')}
          ${sheetCard('Recomendacao', mission.gcpRecommendation, 'Distribua pontos nos cantos e centro da area.')}
          ${list}
        </div>
      </div>
    `;
  }

  function renderSheetApps(comparison) {
    return `
      <div class="ux-sheet-section is-active">
        <span class="ux-sheet-kicker">Fontes cruzadas</span>
        <h3 class="ux-sheet-title">Modelos ativos</h3>
        ${renderSourceComparison(comparison)}
      </div>
    `;
  }

  function renderSheetSettings() {
    const beginnerActive = getMode() !== 'pro';
    return `
      <div class="ux-sheet-section is-active">
        <span class="ux-sheet-kicker">Preferencias</span>
        <h3 class="ux-sheet-title">Configuracoes</h3>
        <div class="ux-mode-group">
          <button class="ux-mode-toggle ${beginnerActive ? 'is-active' : ''}" type="button" data-mode="beginner">Iniciante</button>
          <button class="ux-mode-toggle ${beginnerActive ? '' : 'is-active'}" type="button" data-mode="pro">Profissional</button>
        </div>
        <div class="ux-sheet-grid">
          ${Object.entries(LAYER_LABELS).map(([key, label]) => `
            <button class="ux-layer-toggle ${state.activeLayers.has(key) ? 'is-active' : ''}" type="button" data-toggle-layer="${key}">
              ${label}
            </button>
          `).join('')}
          <button class="ux-layer-toggle ${state.snapEnabled ? 'is-active' : ''}" type="button" data-toggle-snap>
            Snap em linhas
          </button>
        </div>
      </div>
    `;
  }

  function bindSheetActions(stage) {
    stage.querySelectorAll('[data-toggle-layer]').forEach((button) => {
      button.addEventListener('click', () => toggleOptionalLayer(button.dataset.toggleLayer));
    });

    stage.querySelector('[data-toggle-snap]')?.addEventListener('click', () => {
      state.snapEnabled = !state.snapEnabled;
      writeJson(STORAGE_KEYS.snap, state.snapEnabled);
      toast(state.snapEnabled ? 'Snap automatico ativado.' : 'Snap automatico desativado.');
      renderMobileSection('settings');
    });

    stage.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => setMode(button.dataset.mode));
    });
  }

  function bindMapEvents() {
    if (!state.map || state.mapBound) return;
    state.mapBound = true;

    state.map.options.zoomAnimation = true;
    state.map.options.markerZoomAnimation = true;
    state.map.options.fadeAnimation = true;
    state.map.options.wheelDebounceTime = 30;
    state.map.options.wheelPxPerZoomLevel = 72;
    state.map.options.inertia = true;

    if (typeof L !== 'undefined') {
      L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(state.map);
    }

    state.map.on('mousemove', (event) => updateHudForLocation({
      lat: event.latlng.lat,
      lon: event.latlng.lng
    }));

    state.map.on('contextmenu', (event) => {
      event.originalEvent?.preventDefault?.();
      showContextMenu(event);
    });

    state.map.on('click', () => {
      hideContextMenu();
      if (!state.dragMission.active) {
        updateSelection(new Set());
      }
    });

    state.map.on('moveend zoomend resize', debounce(() => {
      updateHudForLocation(getCurrentLocation());
      refreshOptionalLayers();
    }, 120));

    state.map.on('mousedown', handleMissionDragStart);
    state.map.on('mousemove', handleMissionDragMove);
    state.map.on('mouseup', handleMissionDragEnd);
  }

  function handleShellClick(event) {
    const actionButton = event.target.closest('[data-ux-action]');
    if (!actionButton) return;

    const action = actionButton.dataset.uxAction;
    if (action === 'center') centerAll();
    if (action === 'undo') undoMission();
    if (action === 'redo') redoMission();
    if (action === 'guide') state.elements.guide?.classList.toggle('is-hidden');
    if (action === 'dismiss-guide') {
      writeJson(STORAGE_KEYS.guideSeen, true);
      state.elements.guide?.classList.add('is-hidden');
    }
  }

  function handleContextClick(event) {
    const button = event.target.closest('[data-context-action]');
    if (!button) return;
    const latlng = state.elements.contextMenu?._latlng;
    const action = button.dataset.contextAction;

    if (action === 'add-waypoint' && latlng) addMissionPoint('waypoint', latlng);
    if (action === 'add-gcp' && latlng) addMissionPoint('gcp', latlng);
    if (action === 'add-photo' && latlng) addMissionPoint('photo', latlng);
    if (action === 'set-location' && latlng) setActiveLocation(latlng);
    if (action === 'edit') editSelectedPoint();
    if (action === 'drag-mission') armMissionDrag();
    if (action === 'remove') removeSelectedPoints();

    hideContextMenu();
  }

  function showContextMenu(event) {
    if (!state.elements.contextMenu || !state.shell) return;

    state.elements.contextMenu._latlng = event.latlng;
    const point = state.map.latLngToContainerPoint(event.latlng);
    const shellBox = state.shell.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 270;
    const x = Math.min(Math.max(8, point.x), shellBox.width - menuWidth - 8);
    const y = Math.min(Math.max(8, point.y), shellBox.height - menuHeight - 8);

    state.elements.contextMenu.style.left = `${x}px`;
    state.elements.contextMenu.style.top = `${y}px`;
    state.elements.contextMenu.classList.add('is-open');
  }

  function hideContextMenu() {
    state.elements.contextMenu?.classList.remove('is-open');
  }

  function handleKeyboard(event) {
    const target = event.target;
    const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (isTyping || !document.getElementById('clima')?.classList.contains('active')) return;

    if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedIds.size) {
      event.preventDefault();
      removeSelectedPoints();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoMission();
      else undoMission();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redoMission();
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      state.map?.zoomIn();
    } else if (event.key === '-') {
      event.preventDefault();
      state.map?.zoomOut();
    } else if (event.key.toLowerCase() === 'c') {
      centerAll();
    }
  }

  function addMissionPoint(type, latlng) {
    pushHistory();
    const id = createId(type);
    const next = {
      id,
      type,
      lat: latlng.lat,
      lng: latlng.lng,
      label: type === 'gcp' ? `GCP ${countType('gcp') + 1}` : `WP ${countType('waypoint') + 1}`
    };
    if (type === 'photo') {
      next.label = `Foto ${countType('photo') + 1}`;
    }
    state.missionPoints.push(next);
    state.selectedIds = new Set([id]);
    persistMission();
    renderMission();
    toast(type === 'gcp' ? 'GCP adicionado ao mapa.' : 'Waypoint adicionado ao plano.');
  }

  function editSelectedPoint() {
    const selected = getSelectedPoints();
    if (selected.length !== 1) {
      toast('Selecione um unico ponto para editar.');
      return;
    }

    const current = selected[0];
    const nextLabel = window.prompt('Nome do ponto', current.label);
    if (!nextLabel || nextLabel.trim() === current.label) return;

    pushHistory();
    current.label = nextLabel.trim().slice(0, 32);
    persistMission();
    renderMission();
    toast('Ponto atualizado.');
  }

  function removeSelectedPoints() {
    if (!state.selectedIds.size) {
      toast('Nenhum ponto selecionado.');
      return;
    }
    pushHistory();
    state.missionPoints = state.missionPoints.filter((point) => !state.selectedIds.has(point.id));
    state.selectedIds.clear();
    persistMission();
    renderMission();
    toast('Pontos removidos.');
  }

  function updateSelection(nextSelection) {
    state.selectedIds = nextSelection;
    renderMission();
  }

  function getSelectedPoints() {
    return state.missionPoints.filter((point) => state.selectedIds.has(point.id));
  }

  function renderMission() {
    if (!state.map || typeof L === 'undefined') return;
    ensureOverlayGroups();

    state.overlayGroups.mission.clearLayers();
    state.markerById.clear();

    state.missionPoints.forEach((point) => {
      const marker = L.marker([point.lat, point.lng], {
        draggable: true,
        icon: createMissionIcon(point)
      });

      marker.bindTooltip(buildPointTooltip(point), {
        direction: 'top',
        opacity: 0.94
      });

      marker.on('click', (event) => {
        event.originalEvent?.stopPropagation?.();
        const multi = event.originalEvent?.ctrlKey || event.originalEvent?.metaKey || event.originalEvent?.shiftKey;
        const next = multi ? new Set(state.selectedIds) : new Set();
        if (next.has(point.id)) next.delete(point.id);
        else next.add(point.id);
        updateSelection(next);
      });

      marker.on('dragstart', () => pushHistory());
      marker.on('dragend', () => {
        const latlng = marker.getLatLng();
        point.lat = latlng.lat;
        point.lng = latlng.lng;
        snapPointToRoute(point);
        persistMission();
        renderMission();
      });

      marker.addTo(state.overlayGroups.mission);
      state.markerById.set(point.id, marker);
    });

    const routePoints = state.missionPoints
      .filter((point) => point.type !== 'photo')
      .map((point) => [point.lat, point.lng]);

    if (routePoints.length >= 2) {
      state.routeLayer = L.polyline(routePoints, {
        color: '#38bdf8',
        weight: 3,
        opacity: 0.9,
        dashArray: '9 8',
        className: 'ux-mission-line'
      }).addTo(state.overlayGroups.mission);
    }

    if (routePoints.length >= 3) {
      state.polygonLayer = L.polygon(routePoints, {
        color: '#22c55e',
        weight: 1.8,
        fillColor: '#22c55e',
        fillOpacity: 0.12,
        className: 'ux-mission-line'
      }).addTo(state.overlayGroups.mission);
    }

    refreshOptionalLayers();
    renderDashboard();
    renderMobileSection(state.activeMobileSection);
    updateUndoRedoButtons();
  }

  function createMissionIcon(point) {
    const label = point.type === 'gcp'
      ? 'G'
      : point.type === 'photo'
        ? 'F'
        : String(getPointIndex(point) + 1);
    const classes = ['ux-marker', point.type];
    if (state.selectedIds.has(point.id)) classes.push('is-selected');

    return L.divIcon({
      className: 'ux-marker-wrapper',
      html: `<div class="${classes.join(' ')}">${escapeHtml(label)}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  function buildPointTooltip(point) {
    return `<strong>${escapeHtml(point.label)}</strong><br>${formatLatLng(point.lat, point.lng, 6)}`;
  }

  function snapPointToRoute(point) {
    if (!state.snapEnabled || state.missionPoints.length < 3) return;

    const others = state.missionPoints.filter((candidate) => candidate.id !== point.id && candidate.type !== 'photo');
    if (others.length < 2) return;

    let nearest = null;
    for (let index = 0; index < others.length - 1; index += 1) {
      const projection = projectPointToSegment(point, others[index], others[index + 1]);
      if (!nearest || projection.distance < nearest.distance) nearest = projection;
    }

    if (nearest && nearest.distance <= 25) {
      point.lat = nearest.lat;
      point.lng = nearest.lng;
      toast('Ponto ajustado com snap na linha.');
    }
  }

  function armMissionDrag() {
    if (!state.missionPoints.length) {
      toast('Adicione pontos antes de mover a missao.');
      return;
    }
    state.dragMission.armed = true;
    document.body.classList.add('ux-dragging-mission');
    toast('Arraste no mapa para mover a missao inteira.');
  }

  function handleMissionDragStart(event) {
    if (!state.missionPoints.length) return;
    const original = event.originalEvent || {};
    const shouldDrag = state.dragMission.armed || original.shiftKey;
    if (!shouldDrag || original.button !== 0) return;

    pushHistory();
    state.dragMission.active = true;
    state.dragMission.startLatLng = event.latlng;
    state.dragMission.originalPoints = state.missionPoints.map((point) => ({ ...point }));
    state.map.dragging.disable();
    document.body.classList.add('ux-dragging-mission');
  }

  function handleMissionDragMove(event) {
    if (!state.dragMission.active || !state.dragMission.startLatLng) return;
    const deltaLat = event.latlng.lat - state.dragMission.startLatLng.lat;
    const deltaLng = event.latlng.lng - state.dragMission.startLatLng.lng;

    state.missionPoints = state.dragMission.originalPoints.map((point) => ({
      ...point,
      lat: point.lat + deltaLat,
      lng: point.lng + deltaLng
    }));

    if (state.dragMission.frame) return;
    state.dragMission.frame = window.requestAnimationFrame(() => {
      state.dragMission.frame = null;
      renderMission();
    });
  }

  function handleMissionDragEnd() {
    if (!state.dragMission.active) return;
    state.dragMission.active = false;
    state.dragMission.armed = false;
    state.dragMission.startLatLng = null;
    state.dragMission.originalPoints = [];
    state.map.dragging.enable();
    document.body.classList.remove('ux-dragging-mission');
    persistMission();
    renderMission();
    toast('Missao reposicionada.');
  }

  function ensureOverlayGroups() {
    if (!state.map || typeof L === 'undefined') return;

    if (!state.overlayGroups.mission) {
      state.overlayGroups.mission = L.layerGroup().addTo(state.map);
    }

    ['wind', 'heat', 'elevation', 'grid', 'gcp'].forEach((key) => {
      if (!state.overlayGroups[key]) {
        state.overlayGroups[key] = L.layerGroup();
      }
      const group = state.overlayGroups[key];
      if (state.activeLayers.has(key) && !state.map.hasLayer(group)) {
        group.addTo(state.map);
      }
      if (!state.activeLayers.has(key) && state.map.hasLayer(group)) {
        state.map.removeLayer(group);
      }
    });
  }

  function renderLayerToggles() {
    if (!state.elements.layerBank) return;

    state.elements.layerBank.innerHTML = Object.entries(LAYER_LABELS).map(([key, label]) => `
      <button class="ux-layer-toggle ${state.activeLayers.has(key) ? 'is-active' : ''}" type="button" data-toggle-layer="${key}" title="Alternar ${label}">
        ${label}
      </button>
    `).join('');

    state.elements.layerBank.querySelectorAll('[data-toggle-layer]').forEach((button) => {
      button.addEventListener('click', () => toggleOptionalLayer(button.dataset.toggleLayer));
    });
  }

  function toggleOptionalLayer(key) {
    if (!LAYER_LABELS[key]) return;
    if (state.activeLayers.has(key)) state.activeLayers.delete(key);
    else state.activeLayers.add(key);

    writeJson(STORAGE_KEYS.layers, [...state.activeLayers]);
    ensureOverlayGroups();
    refreshOptionalLayers();
    renderLayerToggles();
    renderMobileSection('settings');
  }

  function refreshOptionalLayers() {
    if (!state.map || typeof L === 'undefined') return;
    ensureOverlayGroups();

    Object.values(state.overlayGroups).forEach((group) => {
      if (group !== state.overlayGroups.mission) group.clearLayers();
    });

    if (state.activeLayers.has('wind')) renderWindLayer();
    if (state.activeLayers.has('heat')) renderHeatLayer();
    if (state.activeLayers.has('elevation')) renderElevationLayer();
    if (state.activeLayers.has('grid')) renderGridLayer();
    if (state.activeLayers.has('gcp')) renderGcpCoverageLayer();
  }

  function renderWindLayer() {
    const group = state.overlayGroups.wind;
    const bounds = state.map.getBounds();
    const current = state.latestWeather?.bundle?.current || {};
    const direction = Number.isFinite(Number(current.windDirection)) ? Number(current.windDirection) : 0;
    const speed = Number.isFinite(Number(current.windSpeed)) ? Number(current.windSpeed) : 8;
    const rows = 3;
    const cols = 4;

    for (let row = 1; row <= rows; row += 1) {
      for (let col = 1; col <= cols; col += 1) {
        const lat = bounds.getSouth() + (bounds.getNorth() - bounds.getSouth()) * (row / (rows + 1));
        const lng = bounds.getWest() + (bounds.getEast() - bounds.getWest()) * (col / (cols + 1));
        const icon = L.divIcon({
          className: 'ux-wind-arrow-wrapper',
          html: `<div class="ux-wind-arrow" style="transform: rotate(${direction}deg); opacity: ${clamp(speed / 34, 0.38, 0.95)}"></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        L.marker([lat, lng], { icon, interactive: false }).addTo(group);
      }
    }
  }

  function renderHeatLayer() {
    const group = state.overlayGroups.heat;
    const center = state.map.getCenter();
    const current = state.latestWeather?.bundle?.current || {};
    const temp = Number.isFinite(Number(current.temperature)) ? Number(current.temperature) : 24;
    const color = temp >= 32 ? '#ef4444' : temp >= 24 ? '#f59e0b' : '#38bdf8';
    const radius = Math.max(450, metersPerPixel(center.lat, state.map.getZoom()) * 95);

    [
      [0, 0, 0.22],
      [0.006, 0.008, 0.12],
      [-0.007, -0.005, 0.1],
      [0.004, -0.009, 0.09]
    ].forEach(([latOffset, lngOffset, opacity]) => {
      L.circle([center.lat + latOffset, center.lng + lngOffset], {
        radius,
        stroke: false,
        fillColor: color,
        fillOpacity: opacity
      }).addTo(group);
    });
  }

  function renderElevationLayer() {
    const group = state.overlayGroups.elevation;
    const center = state.map.getCenter();
    const base = estimateAltitude(center.lat, center.lng);
    [500, 900, 1300, 1700].forEach((radius, index) => {
      L.circle([center.lat, center.lng], {
        radius,
        color: index % 2 ? '#f59e0b' : '#22c55e',
        weight: 1.4,
        opacity: 0.38,
        fill: false
      }).bindTooltip(`${base + index * 18} m est.`, { sticky: true }).addTo(group);
    });
  }

  function renderGridLayer() {
    const group = state.overlayGroups.grid;
    const bounds = state.map.getBounds();
    const zoom = state.map.getZoom();
    const step = zoom >= 15 ? 0.001 : zoom >= 13 ? 0.0025 : zoom >= 11 ? 0.006 : 0.012;
    const south = Math.floor(bounds.getSouth() / step) * step;
    const north = Math.ceil(bounds.getNorth() / step) * step;
    const west = Math.floor(bounds.getWest() / step) * step;
    const east = Math.ceil(bounds.getEast() / step) * step;

    for (let lat = south; lat <= north; lat += step) {
      L.polyline([[lat, west], [lat, east]], {
        color: '#dbeafe',
        weight: 0.7,
        opacity: 0.28,
        className: 'ux-grid-line',
        interactive: false
      }).addTo(group);
    }

    for (let lng = west; lng <= east; lng += step) {
      L.polyline([[south, lng], [north, lng]], {
        color: '#dbeafe',
        weight: 0.7,
        opacity: 0.28,
        className: 'ux-grid-line',
        interactive: false
      }).addTo(group);
    }
  }

  function renderGcpCoverageLayer() {
    const group = state.overlayGroups.gcp;
    state.missionPoints.filter((point) => point.type === 'gcp').forEach((point) => {
      L.circle([point.lat, point.lng], {
        radius: 95,
        color: '#22c55e',
        weight: 1.5,
        opacity: 0.72,
        fillColor: '#22c55e',
        fillOpacity: 0.1
      }).addTo(group);
    });
  }

  function renderDashboard() {
    if (!state.elements.dashboard) return;

    const mission = calculateMissionMetrics();
    const bundle = state.latestWeather?.bundle;
    const current = bundle?.current || {};
    const analysis = state.latestAnalysis || buildLocalFlightAnalysis(bundle, state.latestWeather?.cacheInfo);
    const status = normalizeFlightStatus(analysis?.overallStatus, current);
    const comparison = state.latestComparison || buildSourceComparison(bundle, state.latestWeather?.providerRuns);

    state.elements.dashboard.innerHTML = `
      <div class="ux-dashboard-head">
        <div>
          <h3 class="ux-dashboard-title">Dashboard da missao</h3>
          <span class="ux-dashboard-subtitle">${escapeHtml(state.latestWeather?.modelsSummary || 'Fontes em sincronizacao')}</span>
        </div>
        <span class="ux-flight-chip ${status.className}">${status.label}</span>
      </div>
      <div class="ux-dashboard-grid">
        ${dashboardMetric('Area', `${mission.areaHa.toFixed(2)} ha`, mission.areaScore)}
        ${dashboardMetric('Tempo voo', `${mission.flightMinutes} min`, mission.timeScore)}
        ${dashboardMetric('Fotos', String(mission.photos), mission.photoScore)}
        ${dashboardMetric('Baterias', String(mission.batteries), mission.batteryScore)}
        ${dashboardMetric('Qualidade', `${mission.quality}%`, mission.quality)}
        ${dashboardMetric('Confianca', `${comparison.confidenceScore}%`, comparison.confidenceScore)}
      </div>
    `;
  }

  function dashboardMetric(label, value, score) {
    const safeScore = clamp(Number(score) || 0, 0, 100);
    return `
      <div class="ux-dashboard-metric">
        <span class="ux-dashboard-label">${escapeHtml(label)}</span>
        <strong class="ux-dashboard-value">${escapeHtml(value)}</strong>
        <div class="ux-dashboard-meter" style="--value: ${safeScore}%"><span></span></div>
      </div>
    `;
  }

  function renderWeatherMiniGrid() {
    const current = state.latestWeather?.bundle?.current || {};
    const rows = [
      ['Vento', `${formatNumber(current.windSpeed, 1)} km/h`],
      ['Rajadas', `${formatNumber(current.windGusts, 1)} km/h`],
      ['Chuva', `${formatNumber(current.rainProbability, 0)}%`],
      ['Visibilidade', `${formatNumber(current.visibilityKm, 1)} km`]
    ];

    return `<div class="ux-weather-grid">${rows.map(([label, value]) => sheetCard(label, value, 'Dados consolidados')).join('')}</div>`;
  }

  function renderSourceComparison(comparison) {
    const cards = Array.isArray(comparison?.sourceCards) && comparison.sourceCards.length
      ? comparison.sourceCards
      : [comparison?.average || {}];
    const badgeClass = comparison.confidenceLabel === 'Alta' ? '' : comparison.confidenceLabel === 'Media' ? 'medium' : 'low';

    return `
      <div class="ux-source-compare">
        <div class="ux-source-grid">
          ${cards.map((source, index) => sourceCard(source.label || 'Fonte ativa', source, index % 2 === 0 ? 'is-windy' : 'is-ventusky')).join('')}
        </div>
        <div class="ux-confidence-row">
          <div>
            <span class="ux-source-label">Divergencia media</span>
            <strong class="ux-source-value">${escapeHtml(comparison.divergenceText)}</strong>
          </div>
          <span class="ux-confidence-badge ${badgeClass}">${escapeHtml(comparison.confidenceLabel)}</span>
        </div>
        <div class="ux-mini-grid">
          ${miniStat('Media vento', `${formatNumber(comparison.average.windSpeed, 1)} km/h`, 'fontes cruzadas')}
          ${miniStat('Rajadas', `${formatNumber(comparison.average.windGusts, 1)} km/h`, 'pico estimado')}
          ${miniStat('Indice voo', `${comparison.safeIndex}%`, comparison.conditionLabel)}
        </div>
      </div>
    `;
  }

  function sourceCard(label, source, className) {
    return `
      <div class="ux-source-card ${className}">
        <span class="ux-source-label">${escapeHtml(label)}</span>
        <strong class="ux-source-value">${formatNumber(source.windSpeed, 1)} km/h</strong>
        <p>Rajadas ${formatNumber(source.windGusts, 1)} km/h, chuva ${formatNumber(source.rainProbability, 0)}%, temp. ${formatNumber(source.temperature, 1)} C.</p>
      </div>
    `;
  }

  function sheetCard(label, value, detail) {
    return `
      <div class="ux-sheet-card">
        <span class="ux-dashboard-label">${escapeHtml(label)}</span>
        <strong class="ux-dashboard-value">${escapeHtml(String(value))}</strong>
        <p>${escapeHtml(detail || '')}</p>
      </div>
    `;
  }

  function miniStat(label, value, detail) {
    return `
      <div class="ux-mini-stat">
        <span class="ux-mini-label">${escapeHtml(label)}</span>
        <strong class="ux-mini-value">${escapeHtml(String(value))}</strong>
        <p>${escapeHtml(detail || '')}</p>
      </div>
    `;
  }

  function calculateMissionMetrics() {
    const routePoints = state.missionPoints.filter((point) => point.type !== 'photo');
    const gcpCount = state.missionPoints.filter((point) => point.type === 'gcp').length;
    const areaM2 = routePoints.length >= 3 ? polygonAreaMeters(routePoints) : 0;
    const areaHa = areaM2 / 10000;
    const distanceMeters = routeDistanceMeters(routePoints);
    const baseMinutes = routePoints.length ? 5 : 0;
    const flightMinutes = Math.max(0, Math.ceil(baseMinutes + areaHa * 2.8 + distanceMeters / 260 + routePoints.length * 0.45));
    const photos = Math.max(routePoints.length * 8, Math.ceil(areaHa * 92));
    const batteries = flightMinutes ? Math.max(1, Math.ceil(flightMinutes / 22)) : 0;
    const bundle = state.latestWeather?.bundle || null;
    const current = bundle?.current || {};
    const comparison = state.latestComparison || buildSourceComparison(bundle, state.latestWeather?.providerRuns || []);
    const weatherConfidence = Number(bundle?.analytics?.confidence || current.confidence || 75);
    const wind = Number(current.windSpeed || 0);
    const gcpBonus = clamp(gcpCount * 5, 0, 18);
    const quality = calculateMissionQuality({
      weatherConfidence,
      comparison,
      providerRuns: state.latestWeather?.providerRuns || [],
      cacheInfo: state.latestWeather?.cacheInfo || {},
      current,
      wind,
      gcpBonus
    });
    const gcpCoverage = areaHa > 0 ? clamp(Math.round((gcpCount / Math.max(4, Math.ceil(areaHa / 1.8))) * 100), 0, 100) : clamp(gcpCount * 20, 0, 100);

    return {
      points: state.missionPoints.length,
      gcpCount,
      areaM2,
      areaHa,
      areaScore: clamp(Math.round(areaHa * 12), 0, 100),
      distanceMeters,
      distanceText: distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(2)} km` : `${Math.round(distanceMeters)} m`,
      flightMinutes,
      timeScore: clamp(100 - Math.max(0, flightMinutes - 22) * 2, 8, 100),
      photos,
      photoScore: clamp(Math.round(photos / 8), 0, 100),
      batteries,
      batteryScore: batteries <= 1 ? 100 : batteries === 2 ? 72 : 42,
      quality,
      gcpCoverage,
      gcpRecommendation: gcpCount >= 5 ? 'Ideal' : gcpCount >= 3 ? 'Aceitavel' : 'Adicionar pontos'
    };
  }

  function buildSourceComparison(bundle, providerRuns = []) {
    const providers = providerRuns.length ? providerRuns : bundle?.providers || [];
    const fallback = normalizeCurrent(bundle?.current || {});
    const hasBundleCurrent = Boolean(bundle?.current);
    const activeSources = getActiveWeatherSources(bundle, providers);
    const sourceComparison = compareWeatherSources(activeSources);
    const average = activeSources.length
      ? buildRobustAverageSource(activeSources, sourceComparison)
      : hasBundleCurrent
        ? fillSource({ label: 'Dados consolidados', sourceCount: 1 }, fallback)
        : { label: 'Fontes pendentes', sourceCount: 0 };
    const sourceCards = buildActiveSourceCards(activeSources, hasBundleCurrent ? fallback : null);
    const hasLiveInputs = activeSources.length > 0 || hasBundleCurrent;
    const cacheInfo = state.latestWeather?.cacheInfo || {};
    const providerHealth = getProviderHealth(providers);
    const confidenceScore = computeMissionConfidence({
      bundle,
      hasLiveInputs,
      activeSourceCount: activeSources.length,
      sourceComparison,
      providerHealth,
      cacheInfo
    });
    const confidenceLabel = confidenceScore >= 82 ? 'Alta' : confidenceScore >= 64 ? 'Media' : 'Baixa';
    const safeIndex = calculateSafeFlightIndex(average, confidenceScore);
    const criticalRisks = getMissionCriticalRisks(average, confidenceScore);
    const conditionLabel = criticalRisks.length ? 'Perigoso' : safeIndex >= 78 ? 'Seguro' : 'Moderado';
    const divergence = {
      windSpeed: valueOr(sourceComparison.metrics.windSpeed?.spread, 0),
      windGusts: valueOr(sourceComparison.metrics.windGusts?.spread, 0),
      temperature: valueOr(sourceComparison.metrics.temperature?.spread, 0),
      humidity: valueOr(sourceComparison.metrics.humidity?.spread, 0),
      pressure: valueOr(sourceComparison.metrics.pressure?.spread, 0),
      rainProbability: valueOr(sourceComparison.metrics.rainProbability?.spread, 0),
      precipitation: valueOr(sourceComparison.metrics.precipitation?.spread, 0),
      cloudCover: valueOr(sourceComparison.metrics.cloudCover?.spread, 0),
      visibilityKm: valueOr(sourceComparison.metrics.visibilityKm?.spread, 0)
    };

    return {
      windy: sourceCards[0] || average,
      ventusky: sourceCards[1] || sourceCards[0] || average,
      sourceCards,
      average,
      divergence,
      confidenceScore,
      confidenceLabel,
      divergenceText: hasLiveInputs
        ? `Vento ${formatNumber(divergence.windSpeed, 1)} km/h, temp. ${formatNumber(divergence.temperature, 1)} C`
        : 'Aguardando fontes',
      safeIndex,
      conditionLabel,
      validSourceCount: activeSources.length,
      consistencyScore: sourceComparison.score,
      isConsistent: sourceComparison.isConsistent,
      ignoredSourceLabels: sourceComparison.ignoredSourceLabels,
      providerHealth,
      cacheInfo
    };
  }

  function getActiveWeatherSources(bundle, providers = []) {
    const list = (Array.isArray(providers) ? providers : [])
      .filter((provider) => (
        provider
        && provider.success !== false
        && provider.status !== 'loading'
        && !provider.hidden
        && provider.current
        && provider.type !== 'demo'
        && provider.type !== 'cache'
        && provider.providerKey !== 'demoWeather'
        && provider.providerKey !== 'savedCache'
      ))
      .map((provider) => ({
        providerKey: provider.providerKey,
        label: provider.label || provider.providerKey || 'Fonte ativa',
        weight: Number.isFinite(Number(provider.weight)) && Number(provider.weight) > 0 ? Number(provider.weight) : 1,
        fetchedAt: provider.fetchedAt || provider.current?.time || bundle?.generatedAt || null,
        current: normalizeCurrent(provider.current, provider.weight)
      }))
      .filter((source) => hasUsableCurrentSource(source.current));

    if (list.length) return list;

    if (bundle?.current) {
      return [{
        providerKey: 'fused',
        label: 'Dados consolidados',
        weight: 1,
        fetchedAt: bundle.generatedAt || bundle.current.time || null,
        current: normalizeCurrent(bundle.current)
      }].filter((source) => hasUsableCurrentSource(source.current));
    }

    return [];
  }

  function hasUsableCurrentSource(current) {
    if (!current) return false;
    const coreCount = WEATHER_SOURCE_FIELDS
      .filter((field) => Number.isFinite(Number(current[field])))
      .length;
    return coreCount >= 3 || (Number.isFinite(Number(current.temperature)) && Number.isFinite(Number(current.windSpeed)));
  }

  function compareWeatherSources(sources = []) {
    const metrics = {};
    const ignoredSourceLabels = new Set();
    let penalty = 0;
    let comparedCount = 0;

    Object.entries(SOURCE_COMPARISON_RULES).forEach(([metric, rule]) => {
      const rawSamples = sources
        .map((source) => ({
          label: source.label,
          weight: source.weight,
          value: valueOr(source.current?.[metric], null)
        }))
        .filter((sample) => Number.isFinite(sample.value));
      const filtered = filterWeatherOutliers(rawSamples, rule);
      filtered.ignored.forEach((sample) => ignoredSourceLabels.add(sample.label));
      const samples = filtered.samples;

      if (samples.length < 2) return;

      comparedCount += 1;
      const values = samples.map((sample) => sample.value);
      const spread = maxOfValues(values) - minOfValues(values);
      const excess = Math.max(0, spread - rule.safeSpread);
      const status = spread > rule.outlierSpread
        ? 'warning'
        : spread > rule.safeSpread
          ? 'watch'
          : 'safe';

      penalty += excess * rule.penalty;
      metrics[metric] = {
        samples,
        spread: roundTo(spread, metric === 'humidity' || metric === 'pressure' || metric === 'rainProbability' ? 0 : 1),
        status
      };
    });

    const sourcePenalty = Math.max(0, 3 - sources.length) * 3;
    const ignoredPenalty = ignoredSourceLabels.size ? 1 : 0;
    const score = clamp(Math.round(100 - penalty - sourcePenalty - ignoredPenalty), 35, 100);
    const criticalMetrics = ['temperature', 'windSpeed', 'humidity', 'pressure'];
    const hasCriticalWarning = criticalMetrics.some((metric) => metrics[metric]?.status === 'warning');

    return {
      available: comparedCount > 0,
      score,
      isConsistent: sources.length >= 2 && comparedCount > 0 && !hasCriticalWarning && score >= 80,
      comparedCount,
      metrics,
      ignoredSourceLabels: [...ignoredSourceLabels]
    };
  }

  function filterWeatherOutliers(samples, rule) {
    const list = (Array.isArray(samples) ? samples : []).filter((sample) => Number.isFinite(sample.value));
    if (list.length < 3) {
      return { samples: list, ignored: [] };
    }

    const sorted = list.map((sample) => sample.value).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const ignored = list.filter((sample) => Math.abs(sample.value - median) > rule.outlierSpread);
    const kept = list.filter((sample) => !ignored.includes(sample));

    if (ignored.length !== 1 || kept.length < 2) {
      return { samples: list, ignored: [] };
    }

    return { samples: kept, ignored };
  }

  function buildRobustAverageSource(sources, comparison) {
    const metric = (key) => {
      const samples = comparison?.metrics?.[key]?.samples
        || sources.map((source) => ({
          value: source.current?.[key],
          weight: source.weight
        }));
      return weightedAverage(samples);
    };

    return {
      label: sources.map((source) => source.label).slice(0, 4).join(' + ') || 'Fontes ativas',
      sourceCount: sources.length,
      temperature: metric('temperature'),
      feelsLike: metric('feelsLike') ?? metric('temperature'),
      humidity: metric('humidity'),
      pressure: metric('pressure'),
      windSpeed: metric('windSpeed'),
      windDirection: weightedDirection(sources.map((source) => ({
        value: source.current?.windDirection,
        weight: source.weight
      }))),
      windGusts: metric('windGusts') ?? metric('windSpeed'),
      precipitation: metric('precipitation'),
      rainProbability: metric('rainProbability'),
      cloudCover: metric('cloudCover'),
      visibilityKm: metric('visibilityKm')
    };
  }

  function buildActiveSourceCards(sources, fallback) {
    if (!sources.length) {
      if (!fallback) return [];
      return [fillSource({ label: 'Dados consolidados', sourceCount: fallback ? 1 : 0 }, fallback)];
    }

    const splitIndex = sources.length > 2 ? Math.ceil(sources.length / 2) : 1;
    return [sources.slice(0, splitIndex), sources.slice(splitIndex)]
      .filter((group) => group.length)
      .map((group) => ({
        ...averageSources(group.map((source) => source.current)),
        label: group.map((source) => source.label).join(' + '),
        sourceCount: group.length
      }));
  }

  function getProviderHealth(providers = []) {
    const settled = (Array.isArray(providers) ? providers : [])
      .filter((provider) => provider && provider.status !== 'loading' && !provider.hidden);
    const failed = settled.filter((provider) => provider.success === false);
    return {
      total: settled.length,
      failed: failed.length,
      active: settled.filter((provider) => provider.success !== false && provider.current).length
    };
  }

  function computeMissionConfidence({ bundle, hasLiveInputs, activeSourceCount, sourceComparison, providerHealth, cacheInfo }) {
    if (!hasLiveInputs) return 45;

    const bundleConfidence = Number(bundle?.analytics?.confidence ?? bundle?.current?.confidence);
    const consistent = Boolean(sourceComparison?.isConsistent);
    let score = activeSourceCount >= 3
      ? (consistent ? 95 : 88)
      : activeSourceCount === 2
        ? (consistent ? 88 : 80)
        : Number.isFinite(bundleConfidence)
          ? clamp(Math.round(bundleConfidence), 70, 85)
          : 75;

    if (consistent && sourceComparison?.score >= 92) score += activeSourceCount >= 3 ? 3 : 2;
    if (sourceComparison?.ignoredSourceLabels?.length) score -= 1;

    const failurePenalty = activeSourceCount >= 3
      ? Math.min(3, providerHealth.failed)
      : Math.min(8, providerHealth.failed * 2);
    score -= failurePenalty;

    if (Number.isFinite(bundleConfidence) && bundleConfidence > score && consistent) {
      score = Math.round((score + bundleConfidence) / 2);
    }

    if (cacheInfo?.used || bundle?.analytics?.reliability?.fromCache) {
      const ageMs = Math.max(0, Number(cacheInfo?.ageMs) || Number(bundle?.analytics?.reliability?.ageMs) || 0);
      const cacheCap = ageMs <= 30 * 60 * 1000 ? CACHE_RECENT_MAX_SCORE : CACHE_WARM_MAX_SCORE;
      score = Math.min(score, cacheCap);
      score = Math.max(score, ageMs <= 30 * 60 * 1000 ? 65 : 55);
    }

    const cap = activeSourceCount >= 3 ? 98 : activeSourceCount === 2 ? 92 : 85;
    return clamp(Math.round(score), 35, cap);
  }

  function calculateMissionQuality({ weatherConfidence, comparison, providerRuns, cacheInfo, current, wind, gcpBonus }) {
    const validSources = Number(comparison?.validSourceCount) || 0;
    const consistencyScore = Number(comparison?.consistencyScore);
    const consistent = Boolean(comparison?.isConsistent);
    let quality = 45;
    let qualityCap = 85;

    if (cacheInfo?.used) {
      const ageMs = Math.max(0, Number(cacheInfo.ageMs) || 0);
      quality = ageMs <= 30 * 60 * 1000 ? CACHE_RECENT_MAX_SCORE : CACHE_WARM_MAX_SCORE;
      qualityCap = CACHE_RECENT_MAX_SCORE;
    } else if (validSources >= 3 && consistent) {
      quality = clamp(Math.round(85 + Math.max(0, consistencyScore - 80) * 0.65), 85, 98);
      qualityCap = 98;
    } else if (validSources >= 2 && consistent) {
      quality = clamp(Math.round(80 + Math.max(0, consistencyScore - 80) * 0.6), 80, 92);
      qualityCap = 92;
    } else if (validSources >= 1) {
      quality = clamp(Math.round(Number.isFinite(weatherConfidence) ? weatherConfidence : 75), 68, 85);
      qualityCap = 85;
    }

    const health = comparison?.providerHealth || getProviderHealth(providerRuns);
    const failurePenalty = validSources >= 3 ? Math.min(4, health.failed) : Math.min(10, health.failed * 3);
    const missingCount = WEATHER_SOURCE_FIELDS.filter((field) => !Number.isFinite(Number(current?.[field]))).length;
    const windPenalty = Math.max(0, Number(wind || 0) - 28) * 0.8;

    quality = quality - failurePenalty - missingCount * 3 - windPenalty + Math.min(8, Number(gcpBonus || 0) * 0.35);

    quality = Math.min(quality, qualityCap);

    return clamp(Math.round(quality), 0, 100);
  }

  function buildVirtualSource(label, providers, preferredKeys) {
    const candidates = preferredKeys
      .map((key) => providers.find((provider) => provider?.providerKey === key && provider.current))
      .filter(Boolean);
    if (!candidates.length) return { label, sourceCount: 0 };
    const source = averageSources(candidates.map((provider) => normalizeCurrent(provider.current, provider.weight)));
    return {
      ...source,
      label,
      sourceCount: candidates.length,
      models: candidates.map((provider) => provider.label || provider.providerKey).join(' + ')
    };
  }

  function normalizeCurrent(current = {}, weight = 1) {
    return {
      weight: Number.isFinite(Number(weight)) && Number(weight) > 0 ? Number(weight) : 1,
      temperature: toNumber(current.temperature),
      feelsLike: toNumber(current.feelsLike),
      humidity: toNumber(current.humidity),
      pressure: toNumber(current.pressure),
      windSpeed: toNumber(current.windSpeed),
      windDirection: toNumber(current.windDirection),
      windGusts: toNumber(current.windGusts),
      precipitation: toNumber(current.precipitation),
      rainProbability: toNumber(current.rainProbability),
      cloudCover: toNumber(current.cloudCover),
      visibilityKm: toNumber(current.visibilityKm)
    };
  }

  function fillSource(source, fallback) {
    return {
      ...source,
      temperature: valueOr(source.temperature, fallback.temperature, 0),
      feelsLike: valueOr(source.feelsLike, fallback.feelsLike, source.temperature, 0),
      humidity: valueOr(source.humidity, fallback.humidity, 0),
      pressure: valueOr(source.pressure, fallback.pressure, 0),
      windSpeed: valueOr(source.windSpeed, fallback.windSpeed, 0),
      windDirection: valueOr(source.windDirection, fallback.windDirection, 0),
      windGusts: valueOr(source.windGusts, fallback.windGusts, source.windSpeed, 0),
      precipitation: valueOr(source.precipitation, fallback.precipitation, 0),
      rainProbability: valueOr(source.rainProbability, fallback.rainProbability, 0),
      cloudCover: valueOr(source.cloudCover, fallback.cloudCover, 0),
      visibilityKm: valueOr(source.visibilityKm, fallback.visibilityKm, 10)
    };
  }

  function averageSources(sources) {
    const valid = sources.filter(Boolean);
    const metric = (key) => weightedAverage(valid.map((source) => ({
      value: source[key],
      weight: source.weight
    })));

    return {
      temperature: metric('temperature'),
      feelsLike: metric('feelsLike'),
      humidity: metric('humidity'),
      pressure: metric('pressure'),
      windSpeed: metric('windSpeed'),
      windDirection: weightedDirection(valid.map((source) => ({
        value: source.windDirection,
        weight: source.weight
      }))),
      windGusts: metric('windGusts'),
      precipitation: metric('precipitation'),
      rainProbability: metric('rainProbability'),
      cloudCover: metric('cloudCover'),
      visibilityKm: metric('visibilityKm')
    };
  }

  function calculateSafeFlightIndex(source, confidenceScore) {
    let score = Number.isFinite(confidenceScore) ? confidenceScore : 75;
    score -= Math.max(0, valueOr(source.windSpeed, 0) - 18) * 2.3;
    score -= Math.max(0, valueOr(source.windGusts, 0) - 30) * 1.6;
    score -= Math.max(0, valueOr(source.rainProbability, 0) - 25) * 0.65;
    score -= Math.max(0, 5 - valueOr(source.visibilityKm, 10)) * 8;
    score -= Math.max(0, valueOr(source.precipitation, 0) - 1) * 4;
    return clamp(Math.round(score), 0, 100);
  }

  function getMissionCriticalRisks(source = {}, confidenceScore = 75) {
    const risks = [];
    const wind = valueOr(source.windSpeed, 0);
    const gusts = valueOr(source.windGusts, wind);
    const rainProbability = valueOr(source.rainProbability, 0);
    const precipitation = valueOr(source.precipitation, 0);
    const visibility = valueOr(source.visibilityKm, 10);
    const confidence = Number.isFinite(Number(confidenceScore)) ? Number(confidenceScore) : 75;

    if (wind >= 40) risks.push('wind');
    if (gusts >= 45) risks.push('gusts');
    if (precipitation >= 6 || (precipitation >= 2.5 && rainProbability >= 70)) risks.push('rain');
    if (visibility < 3) risks.push('visibility');
    if (confidence < 45) risks.push('confidence');
    return risks;
  }

  function normalizeFlightStatus(status, current) {
    const sourceStatus = status || buildLocalFlightAnalysis({ current }, state.latestWeather?.cacheInfo)?.overallStatus || 'warning';
    const comparison = state.latestComparison || buildSourceComparison(state.latestWeather?.bundle, state.latestWeather?.providerRuns || []);
    const confidence = Number(comparison?.confidenceScore || state.latestWeather?.bundle?.analytics?.confidence || current?.confidence || 75);
    const criticalRisks = getMissionCriticalRisks(comparison?.average || current || {}, confidence);
    if (criticalRisks.length) return { label: 'Perigoso', className: 'danger' };
    if (sourceStatus === 'warning') return { label: 'Moderado', className: 'warning' };
    if (sourceStatus === 'danger') return { label: 'Moderado', className: 'warning' };
    return { label: 'Seguro', className: '' };
  }

  function buildLocalFlightAnalysis(bundle, cacheInfo = {}) {
    if (!bundle?.current) return { overallStatus: 'warning', score: 60 };
    const comparison = buildSourceComparison(bundle, bundle.providers || []);
    const current = bundle.current;
    const confidence = Number(comparison.confidenceScore || bundle.analytics?.confidence || current.confidence || 75);
    let score = calculateSafeFlightIndex(comparison.average, confidence);
    if (cacheInfo?.stale) score -= 4;
    const criticalRisks = getMissionCriticalRisks(comparison.average, confidence);
    const overallStatus = criticalRisks.length ? 'danger' : score >= 78 ? 'safe' : 'warning';
    return { overallStatus, score };
  }

  function updateHudForLocation(location = {}) {
    if (!state.elements.hud) return;
    const lat = toNumber(location.lat);
    const lon = toNumber(location.lon ?? location.lng);
    const zoom = state.map?.getZoom?.() || 0;
    const scale = Number.isFinite(lat) ? metersPerPixel(lat, zoom) : null;

    setHudValue('coords', Number.isFinite(lat) && Number.isFinite(lon) ? formatLatLng(lat, lon, 5) : '--');
    setHudValue('altitude', Number.isFinite(lat) && Number.isFinite(lon) ? `${estimateAltitude(lat, lon)} m` : '-- m');
    setHudValue('scale', Number.isFinite(scale) ? `${formatNumber(scale, scale > 10 ? 0 : 1)} m/px` : '--');
  }

  function setHudValue(key, value) {
    const target = state.elements.hud?.querySelector(`[data-ux="${key}"]`);
    if (target) target.textContent = value;
  }

  function setActiveLocation(latlng) {
    if (typeof state.api.applyLocation === 'function') {
      state.api.applyLocation({
        lat: latlng.lat,
        lon: latlng.lng,
        name: 'Ponto definido no mapa'
      }, {
        statusMessage: 'Ponto ativo ajustado pelo menu do mapa.',
        statusTone: 'success',
        showLoading: false,
        force: true
      });
      toast('Ponto ativo atualizado.');
    }
  }

  function centerAll() {
    if (!state.map || typeof L === 'undefined') return;
    const points = state.missionPoints.map((point) => [point.lat, point.lng]);
    const location = getCurrentLocation();
    if (Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
      points.push([location.lat, location.lon]);
    }

    if (!points.length) return;
    if (points.length === 1) {
      state.map.flyTo(points[0], Math.max(state.map.getZoom(), 14), { duration: 0.55 });
      return;
    }
    state.map.flyToBounds(L.latLngBounds(points), {
      padding: [48, 48],
      duration: 0.65
    });
  }

  function pushHistory() {
    state.undoStack.push(JSON.stringify(state.missionPoints));
    if (state.undoStack.length > 30) state.undoStack.shift();
    state.redoStack = [];
    updateUndoRedoButtons();
  }

  function undoMission() {
    if (!state.undoStack.length) return;
    state.redoStack.push(JSON.stringify(state.missionPoints));
    state.missionPoints = JSON.parse(state.undoStack.pop() || '[]');
    state.selectedIds.clear();
    persistMission();
    renderMission();
    toast('Acao desfeita.');
  }

  function redoMission() {
    if (!state.redoStack.length) return;
    state.undoStack.push(JSON.stringify(state.missionPoints));
    state.missionPoints = JSON.parse(state.redoStack.pop() || '[]');
    state.selectedIds.clear();
    persistMission();
    renderMission();
    toast('Acao refeita.');
  }

  function updateUndoRedoButtons() {
    const undoButton = state.elements.hud?.querySelector('[data-ux-action="undo"]');
    const redoButton = state.elements.hud?.querySelector('[data-ux-action="redo"]');
    if (undoButton) undoButton.disabled = !state.undoStack.length;
    if (redoButton) redoButton.disabled = !state.redoStack.length;
  }

  function loadMission() {
    if (state.missionPoints.length) return;
    const saved = loadJson(STORAGE_KEYS.mission, []);
    state.missionPoints = Array.isArray(saved)
      ? saved
        .map((point) => ({
          id: String(point.id || createId(point.type || 'waypoint')),
          type: ['waypoint', 'gcp', 'photo'].includes(point.type) ? point.type : 'waypoint',
          lat: toNumber(point.lat),
          lng: toNumber(point.lng ?? point.lon),
          label: String(point.label || 'Ponto').slice(0, 32)
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      : [];
  }

  function persistMission() {
    writeJson(STORAGE_KEYS.mission, state.missionPoints);
  }

  function countType(type) {
    return state.missionPoints.filter((point) => point.type === type).length;
  }

  function getPointIndex(point) {
    return state.missionPoints.filter((item) => item.type !== 'photo').findIndex((item) => item.id === point.id);
  }

  function routeDistanceMeters(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += distanceMeters(points[index - 1], points[index]);
    }
    return total;
  }

  function polygonAreaMeters(points) {
    if (points.length < 3) return 0;
    const refLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
    const projected = points.map((point) => projectLatLng(point.lat, point.lng, refLat));
    let area = 0;
    for (let index = 0; index < projected.length; index += 1) {
      const current = projected[index];
      const next = projected[(index + 1) % projected.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
  }

  function projectPointToSegment(point, start, end) {
    const refLat = (point.lat + start.lat + end.lat) / 3;
    const p = projectLatLng(point.lat, point.lng, refLat);
    const a = projectLatLng(start.lat, start.lng, refLat);
    const b = projectLatLng(end.lat, end.lng, refLat);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1);
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const projected = unprojectMeters(x, y, refLat);
    return {
      ...projected,
      distance: Math.hypot(p.x - x, p.y - y)
    };
  }

  function projectLatLng(lat, lng, refLat) {
    return {
      x: lng * 111320 * Math.cos((refLat * Math.PI) / 180),
      y: lat * 110540
    };
  }

  function unprojectMeters(x, y, refLat) {
    return {
      lat: y / 110540,
      lng: x / (111320 * Math.cos((refLat * Math.PI) / 180))
    };
  }

  function distanceMeters(a, b) {
    const earthRadius = 6371000;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
    const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
    const value = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function metersPerPixel(lat, zoom) {
    return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom);
  }

  function estimateAltitude(lat, lon) {
    const wave = Math.sin(lat * 0.92) * 90 + Math.cos(lon * 0.74) * 70 + Math.sin((lat + lon) * 0.33) * 42;
    return Math.max(0, Math.round(120 + wave));
  }

  function getCurrentLocation() {
    const apiState = state.api.getState?.();
    const location = apiState?.location || state.latestWeather?.location || state.latestWeather?.bundle?.location || {};
    return {
      lat: toNumber(location.lat),
      lon: toNumber(location.lon ?? location.lng),
      name: location.name || ''
    };
  }

  function bindRippleFeedback() {
    document.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('button, .climate-action-btn, .layer-btn, .weather-layer-btn, .chart-mode-btn, .chart-range-btn, .satellite-btn');
      if (!button || button.disabled) return;

      const rect = button.getBoundingClientRect();
      const ripple = createElement('span', 'ux-ripple');
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      button.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 560);
    }, { passive: true });
  }

  function applySavedMode() {
    setMode(getMode(), false);
  }

  function getMode() {
    return loadJson(STORAGE_KEYS.mode, 'beginner') === 'pro' ? 'pro' : 'beginner';
  }

  function setMode(mode, announce = true) {
    const nextMode = mode === 'pro' ? 'pro' : 'beginner';
    writeJson(STORAGE_KEYS.mode, nextMode);
    document.body.classList.toggle('ux-pro-mode', nextMode === 'pro');
    document.body.classList.toggle('ux-beginner-mode', nextMode !== 'pro');
    if (announce) toast(nextMode === 'pro' ? 'Modo profissional ativado.' : 'Modo iniciante ativado.');
    renderMobileSection('settings');
  }

  function ensureToastStack() {
    if (!document.querySelector('.ux-toast-stack')) {
      document.body.appendChild(createElement('div', 'ux-toast-stack'));
    }
  }

  function toast(message) {
    ensureToastStack();
    const stack = document.querySelector('.ux-toast-stack');
    const item = createElement('div', 'ux-toast');
    item.textContent = message;
    stack.appendChild(item);
    window.setTimeout(() => item.remove(), 2800);
  }

  function buildModelsSummary(providerRuns = []) {
    const activeRuns = providerRuns
      .filter((run) => (
        run
        && run.success !== false
        && run.status !== 'loading'
        && !run.hidden
        && run.type !== 'demo'
        && run.providerKey !== 'demoWeather'
      ));
    const liveLabels = activeRuns
      .filter((run) => run.type !== 'cache' && run.providerKey !== 'savedCache')
      .map((run) => run.label || run.providerKey)
      .filter(Boolean);
    if (liveLabels.length) return liveLabels.slice(0, 4).join(' + ');

    const cacheLabels = activeRuns
      .filter((run) => run.type === 'cache' || run.providerKey === 'savedCache')
      .map((run) => run.label || 'Ultimo dado salvo')
      .filter(Boolean);
    return cacheLabels.length ? 'Usando ultimo dado salvo' : 'Fontes pendentes';
  }

  function createElement(tag, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    return element;
  }

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function formatLatLng(lat, lng, digits = 5) {
    return `${Number(lat).toFixed(digits)}, ${Number(lng).toFixed(digits)}`;
  }

  function formatNumber(value, digits = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '--';
    return numeric.toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function toNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function valueOr(...values) {
    for (const value of values) {
      if (Number.isFinite(Number(value))) return Number(value);
    }
    return null;
  }

  function roundTo(value, digits = 1) {
    if (!Number.isFinite(Number(value))) return null;
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  }

  function minOfValues(values) {
    const valid = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(Number(value))).map(Number);
    return valid.length ? Math.min(...valid) : null;
  }

  function maxOfValues(values) {
    const valid = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(Number(value))).map(Number);
    return valid.length ? Math.max(...valid) : null;
  }

  function weightedAverage(entries) {
    const valid = entries.filter((entry) => Number.isFinite(Number(entry.value)));
    if (!valid.length) return null;
    const totalWeight = valid.reduce((sum, entry) => sum + Math.max(0.01, Number(entry.weight) || 1), 0);
    return valid.reduce((sum, entry) => sum + Number(entry.value) * Math.max(0.01, Number(entry.weight) || 1), 0) / totalWeight;
  }

  function weightedDirection(entries) {
    const valid = entries.filter((entry) => Number.isFinite(Number(entry.value)));
    if (!valid.length) return null;
    const vector = valid.reduce((sum, entry) => {
      const weight = Math.max(0.01, Number(entry.weight) || 1);
      const radians = (Number(entry.value) * Math.PI) / 180;
      return {
        x: sum.x + Math.cos(radians) * weight,
        y: sum.y + Math.sin(radians) * weight
      };
    }, { x: 0, y: 0 });
    return (Math.atan2(vector.y, vector.x) * 180 / Math.PI + 360) % 360;
  }

  function clamp(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function loadLayerList() {
    const saved = loadJson(STORAGE_KEYS.layers, ['wind', 'grid']);
    const list = Array.isArray(saved) ? saved : ['wind', 'grid'];
    return list.filter((key) => Object.prototype.hasOwnProperty.call(LAYER_LABELS, key));
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Local storage can fail in private mode; UX should keep working.
    }
  }

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  }

  window.VentoUXEnhancements = {
    attachClimateMap,
    attachDroneMap,
    updateWeatherDashboard,
    handleTabChange
  };
})();
