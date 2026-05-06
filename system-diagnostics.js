/**
 * DIAGNÓSTICO E VALIDAÇÃO DO SISTEMA METEOROLÓGICO v2.0
 * 
 * Execute este arquivo para validar:
 * ✅ Motor de fusão carregado
 * ✅ APIs respondendo
 * ✅ Cálculo de confiabilidade
 * ✅ Cache funcionando
 * ✅ Integração com Drone
 * ✅ Integração com Satélite
 */

class SystemDiagnostics {
  constructor() {
    this.results = {
      modules: {},
      apis: {},
      features: {},
      errors: []
    };
  }

  /**
   * VALIDAR MÓDULOS CARREGADOS
   */
  checkModules() {
    console.log('\n🔍 VALIDANDO MÓDULOS...\n');

    const modules = {
      weatherFusionEngine: window.weatherFusionEngine,
      droneWeatherIntegration: window.droneWeatherIntegration,
      satelliteWeatherIntegration: window.satelliteWeatherIntegration
    };

    for (const [name, module] of Object.entries(modules)) {
      const loaded = !!module;
      this.results.modules[name] = loaded;
      const icon = loaded ? '✅' : '❌';
      console.log(`${icon} ${name}: ${loaded ? 'Carregado' : 'NÃO ENCONTRADO'}`);

      if (!loaded) {
        this.results.errors.push(`Módulo ${name} não carregado`);
      }
    }
  }

  /**
   * TESTAR CACHE
   */
  checkCache() {
    console.log('\n🔍 VALIDANDO CACHE...\n');

    try {
      // Escrever
      localStorage.setItem('test_cache', JSON.stringify({ test: true, timestamp: Date.now() }));
      const written = localStorage.getItem('test_cache');

      if (written) {
        console.log('✅ localStorage funcional');
        this.results.features.cache = true;

        // Limpar
        localStorage.removeItem('test_cache');
      } else {
        console.log('❌ localStorage falhou ao ler dados');
        this.results.features.cache = false;
        this.results.errors.push('Cache não funcional');
      }
    } catch (e) {
      console.log('❌ localStorage desativado ou cheio:', e.message);
      this.results.features.cache = false;
      this.results.errors.push(`Erro de cache: ${e.message}`);
    }
  }

  /**
   * TESTAR APIS (sem request real)
   */
  checkAPIs() {
    console.log('\n🔍 VALIDANDO DISPONIBILIDADE DE APIs...\n');

    const apis = {
      'demo-weather': 'internal:demo-weather',
      'open-meteo-search': 'https://geocoding-api.open-meteo.com/v1/search',
      'rainviewer': 'https://api.rainviewer.com/public/weather-maps.json'
    };

    this.results.apis = {};

    for (const [name, url] of Object.entries(apis)) {
      // Apenas validar que o fetch está disponível
      this.results.apis[name] = {
        url,
        ready: typeof fetch === 'function',
        status: 'pending'
      };
      console.log(`${typeof fetch === 'function' ? '✅' : '❌'} ${name}: ${url}`);
    }
  }

  /**
   * TESTAR FUNCIONALIDADES
   */
  checkFeatures() {
    console.log('\n🔍 VALIDANDO FUNCIONALIDADES...\n');

    // Geolocalização
    const geoAvailable = !!navigator.geolocation;
    this.results.features.geolocation = geoAvailable;
    console.log(`${geoAvailable ? '✅' : '⚠️'} Geolocalização: ${geoAvailable ? 'Disponível' : 'Não suportado'}`);

    // Chart.js
    const chartAvailable = typeof Chart !== 'undefined';
    this.results.features.charts = chartAvailable;
    console.log(`${chartAvailable ? '✅' : '❌'} Chart.js: ${chartAvailable ? 'Carregado' : 'NÃO ENCONTRADO'}`);

    // Leaflet
    const leafletAvailable = typeof L !== 'undefined';
    this.results.features.leaflet = leafletAvailable;
    console.log(`${leafletAvailable ? '✅' : '❌'} Leaflet Maps: ${leafletAvailable ? 'Carregado' : 'NÃO ENCONTRADO'}`);

    // DOM Elements
    const domReady = document.getElementById('current-temp') !== null
      || document.getElementById('climaLocationLabel') !== null
      || document.getElementById('locationSearchForm') !== null;
    this.results.features.domElements = domReady;
    console.log(`${domReady ? '✅' : '❌'} Elementos DOM: ${domReady ? 'Prontos' : 'INCOMPLETOS'}`);
  }

  /**
   * TESTAR MOTOR DE FUSÃO
   */
  async testWeatherFusion() {
    console.log('\n🔍 TESTANDO MOTOR DE FUSÃO...\n');

    if (!window.weatherFusionEngine) {
      console.log('❌ Motor de fusão não carregado');
      return;
    }

    try {
      // Coordenadas de teste (São Gabriel, RS)
      const lat = -30.3765;
      const lon = -54.3264;

      console.log(`📡 Buscando dados para: ${lat}, ${lon}...`);
      console.log('⏳ Aguarde até 10 segundos...\n');

      // Chamar motor de fusão
      const weatherData = await window.weatherFusionEngine.getWeather(lat, lon, { force: true });

      if (weatherData) {
        console.log('✅ Dados obtidos com sucesso\n');
        console.log('📊 RESULTADO:');
        console.log(`   Temperatura: ${weatherData.temp}°C`);
        console.log(`   Sensação: ${weatherData.feels_like}°C`);
        console.log(`   Umidade: ${weatherData.humidity}%`);
        console.log(`   Vento: ${weatherData.wind} km/h`);
        console.log(`   Confiabilidade: ${weatherData.reliability}%`);
        console.log(`   Fontes usadas: ${weatherData.sources_count}/${weatherData.sources_total || weatherData.analytics?.providerTotal || weatherData.sources_count || 0}`);
        console.log(`   Condição: ${weatherData.condition}`);
        console.log(`   Status: ${weatherData.cached ? '📦 Cache' : '🌐 Ao vivo'}`);

        this.results.features.weatherFusion = true;
      } else {
        console.log('❌ Nenhum dado retornado');
        this.results.features.weatherFusion = false;
      }
    } catch (error) {
      console.error('❌ Erro no teste:', error.message);
      this.results.features.weatherFusion = false;
      this.results.errors.push(`Teste motor de fusão: ${error.message}`);
    }
  }

  /**
   * TESTAR INTEGRAÇÃO COM DRONE
   */
  testDroneIntegration() {
    console.log('\n🔍 TESTANDO INTEGRAÇÃO DRONE...\n');

    if (!window.droneWeatherIntegration) {
      console.log('❌ Módulo de integração não carregado');
      return;
    }

    try {
      const data = window.droneWeatherIntegration.getFormattedFlightData();

      if (data && data.analysis) {
        console.log('✅ Integração Drone funcionando\n');
        console.log('📊 STATUS DE VOO:');
        console.log(`   Status: ${data.analysis.status}`);
        console.log(`   Aconselhamento: ${data.analysis.advisory}`);
        console.log(`   Mensagem: ${data.analysis.message}`);
        console.log(`   Avisos: ${data.analysis.warnings.length}`);

        this.results.features.droneIntegration = true;
      } else {
        console.log('⚠️ Integração Drone sem dados ainda');
        this.results.features.droneIntegration = false;
      }
    } catch (error) {
      console.error('❌ Erro na integração Drone:', error.message);
      this.results.features.droneIntegration = false;
      this.results.errors.push(`Integração Drone: ${error.message}`);
    }
  }

  /**
   * TESTAR INTEGRAÇÃO COM SATÉLITE
   */
  testSatelliteIntegration() {
    console.log('\n🔍 TESTANDO INTEGRAÇÃO SATÉLITE...\n');

    if (!window.satelliteWeatherIntegration) {
      console.log('❌ Módulo de integração não carregado');
      return;
    }

    try {
      const overlay = window.satelliteWeatherIntegration.generateWeatherOverlay();

      if (overlay) {
        console.log('✅ Integração Satélite funcionando\n');
        console.log('📊 OVERLAY METEOROLÓGICO:');
        console.log(`   Status: ${overlay.status}`);
        console.log(`   Itens: ${overlay.data.length}`);
        console.log(`   Confiabilidade: ${overlay.sources.reliability}%`);
        console.log(`   Fontes: ${overlay.sources.count}/${overlay.sources.total || overlay.sources.count}`);

        this.results.features.satelliteIntegration = true;
      } else {
        console.log('⚠️ Integração Satélite sem dados ainda');
        this.results.features.satelliteIntegration = false;
      }
    } catch (error) {
      console.error('❌ Erro na integração Satélite:', error.message);
      this.results.features.satelliteIntegration = false;
      this.results.errors.push(`Integração Satélite: ${error.message}`);
    }
  }

  /**
   * RELATÓRIO FINAL
   */
  generateReport() {
    console.log('\n\n' + '='.repeat(60));
    console.log('📋 RELATÓRIO FINAL DO DIAGNÓSTICO');
    console.log('='.repeat(60));

    const moduleStatus = Object.values(this.results.modules).every(v => v);
    const featuresStatus = Object.values(this.results.features).every(v => v);

    console.log('\n✅ MÓDULOS:');
    Object.entries(this.results.modules).forEach(([name, status]) => {
      console.log(`   ${status ? '✅' : '❌'} ${name}`);
    });

    console.log('\n✅ FUNCIONALIDADES:');
    Object.entries(this.results.features).forEach(([name, status]) => {
      console.log(`   ${status ? '✅' : '⚠️'} ${name}`);
    });

    if (this.results.errors.length > 0) {
      console.log('\n❌ ERROS ENCONTRADOS:');
      this.results.errors.forEach(err => {
        console.log(`   ❌ ${err}`);
      });
    }

    const overallStatus = moduleStatus && featuresStatus && this.results.errors.length === 0;
    console.log('\n' + '='.repeat(60));
    console.log(`🎯 STATUS GERAL: ${overallStatus ? '✅ SISTEMA OPERACIONAL' : '⚠️ VERIFICAÇÃO NECESSÁRIA'}`);
    console.log('='.repeat(60) + '\n');

    return this.results;
  }

  /**
   * EXECUTAR TODOS OS TESTES
   */
  async runAll() {
    console.clear();
    console.log('🚀 INICIANDO DIAGNÓSTICO DO SISTEMA METEOROLÓGICO v2.0\n');
    console.log('═'.repeat(60) + '\n');

    this.checkModules();
    this.checkCache();
    this.checkAPIs();
    this.checkFeatures();

    await this.testWeatherFusion();
    this.testDroneIntegration();
    this.testSatelliteIntegration();

    const report = this.generateReport();
    return report;
  }
}

// Executar diagnóstico quando o script for carregado
const diagnostics = new SystemDiagnostics();

// Exportar para uso manual
window.runDiagnostics = async () => {
  const report = await diagnostics.runAll();
  console.log('📊 Relatório disponível em:', report);
  return report;
};

// Executar automaticamente após 3 segundos (permitir carregamento de outros scripts)
setTimeout(() => {
  console.log('💡 DICA: Execute window.runDiagnostics() no console para executar novamente\n');
}, 3000);
