const DEMO_WEATHER = Object.freeze({
    name: 'Sao Gabriel',
    main: {
        temp: 25,
        humidity: 58
    },
    wind: {
        speed: 12 / 3.6,
        gust: 18 / 3.6
    },
    weather: [{ main: 'Clear' }],
    visibility: 12000
});

function createDemoWeather() {
    return {
        ...DEMO_WEATHER,
        main: { ...DEMO_WEATHER.main },
        wind: { ...DEMO_WEATHER.wind },
        weather: DEMO_WEATHER.weather.map(item => ({ ...item }))
    };
}
let chart;
let droneWindChart;
let droneMap;
let droneMarker;
let velocityLayer;
let rainLayer;

// TABS
function trocarTab(e, id) {
    document.querySelectorAll(".content").forEach(c => c.classList.remove("active"));
    document.getElementById(id).classList.add("active");

    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
}

// DATA do clima (não alterado)
function atualizarData() {
    const d = new Date();
    document.getElementById("data").innerText = d.toLocaleString();
}

// CLIMA atual (não alterado)
async function buscarClima(lat, lon) {
    const data = createDemoWeather(lat, lon);

    document.getElementById("cidade").innerText = data.name;
    document.getElementById("temp").innerText = Math.round(data.main.temp) + "°C";
    document.getElementById("umidade").innerText = data.main.humidity + "%";
    document.getElementById("vento").innerText = (data.wind.speed * 3.6).toFixed(1) + " km/h";

    // Mantém compatibilidade com menu clima
    atualizarDrone(data);
    gerarGrafico();
    gerarDias();
}

// GRAFICO clima (não alterado)
function gerarGrafico() {
    if (chart) chart.destroy();

    chart = new Chart(document.getElementById("grafico"), {
        type: "line",
        data: {
            labels: ["15h", "18h", "21h", "00h", "03h", "06h", "09h", "12h"],
            datasets: [{
                data: [24, 24, 21, 19, 18, 18, 19, 23],
                borderWidth: 2
            }]
        }
    });
}

// 7 DIAS (não alterado)
function gerarDias() {
    const dias = document.getElementById("dias");
    dias.innerHTML = "";

    ["ter.", "qua.", "qui.", "sex.", "sáb.", "dom.", "seg."].forEach(d => {
        dias.innerHTML += `
        <div class="day">
            ${d}<br>☀️<br>${Math.floor(Math.random() * 10 + 20)}°
        </div>`;
    });
}

// DRONE (atualização minimal existente, preservada)
function atualizarDrone(data) {
    const vento = (data.wind.speed * 3.6).toFixed(1);
    document.getElementById("ventoDrone").innerText = vento + " km/h";

    const status = vento <= 15 ? "✅ Seguro" : vento <= 30 ? "⚠️ Atenção" : "❌ Perigoso";
    document.getElementById("statusDrone").innerText = status;
}

// ===== DRONE PRO =====

// Sistema inteligente de voo PRO
function checkDroneConditionsPro(vento, rajada, kp, satelites, visibilidade, chuva) {
    let status = '🟢 Perfeito';
    let color = '#22c55e';

    if (vento > 25 || rajada > 35 || kp > 5 || satelites < 8 || visibilidade < 3000 || chuva > 0) {
        status = '🔴 Não recomendado';
        color = '#ef4444';
    } else if (vento > 15 || rajada > 20 || kp > 3 || satelites < 12) {
        status = '🟡 Cautela';
        color = '#eab308';
    }

    return { status, color };
}

// Zonas reais de voo (simulação)
function checkNoFlyZone(lat, lon) {
    const zones = [
        { lat: -30.3, lon: -54.3, radius: 25000 }, // Aeroporto
        { lat: -22.9, lon: -43.2, radius: 15000 }  // Rio
    ];

    for (const zone of zones) {
        const R = 6371000;
        const dLat = (lat - zone.lat) * Math.PI / 180;
        const dLon = (lon - zone.lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat * Math.PI / 180) * Math.cos(zone.lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        if (dist <= zone.radius) return true;
    }
    return false;
}

// Buscar Kp real
async function fetchKpIndex() {
    try {
        const res = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
        const data = await res.json();
        return data[data.length - 1].kp_index;
    } catch {
        return 2; // fallback
    }
}

// Simular satélites GPS baseado em Kp
function simulateSatellites(kp) {
    if (kp > 5) return Math.floor(Math.random() * 5 + 4); // 4-8
    if (kp > 3) return Math.floor(Math.random() * 5 + 8); // 8-12
    return Math.floor(Math.random() * 5 + 12); // 12-16
}

// Buscar clima drone
async function fetchDroneWeather(lat, lon) {
    const now = new Date();
    now.setMinutes(0, 0, 0);

    return {
        current: {
            wind_speed: 12 / 3.6,
            wind_gust: 18 / 3.6,
            visibility: 12000,
            rain: { '1h': 0 }
        },
        hourly: Array.from({ length: 12 }, (_, index) => ({
            dt: Math.round((now.getTime() + index * 60 * 60 * 1000) / 1000),
            wind_speed: (10 + Math.sin(index / 2) * 3) / 3.6,
            rain: { '1h': 0 }
        }))
    };
}

// Buscar vento para camada animada (Open-Meteo)
async function fetchWindData(lat, lon) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=1`);
        const data = await res.json();
        return data;
    } catch {
        return null;
    }
}

// Inicializar mapa
function initDroneMap(lat, lon) {
    if (!droneMap) {
        droneMap = L.map('droneMap').setView([lat, lon], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(droneMap);
    } else {
        droneMap.setView([lat, lon], 12);
    }

    if (droneMarker) droneMap.removeLayer(droneMarker);
    droneMarker = L.marker([lat, lon]).addTo(droneMap).bindPopup('Você está aqui').openPopup();

    // Corrigir renderização
    setTimeout(() => droneMap.invalidateSize(), 100);
}

// Adicionar camada de vento animado
async function addWindLayer(lat, lon) {
    if (velocityLayer) droneMap.removeLayer(velocityLayer);

    const windData = await fetchWindData(lat, lon);
    if (!windData) return;

    // Simular dados para velocity
    const velocityData = {
        header: {
            parameterCategory: 2,
            parameterNumber: 2,
            dx: 0.5,
            dy: 0.5,
            nx: 10,
            ny: 10,
            refTime: new Date().toISOString(),
            lo1: lon - 2,
            la1: lat - 2
        },
        data: windData.hourly.wind_speed_10m.slice(0, 100).concat(windData.hourly.wind_direction_10m.slice(0, 100))
    };

    velocityLayer = L.velocityLayer({
        displayValues: true,
        displayOptions: {
            velocityType: 'Global Wind',
            position: 'bottomleft',
            emptyString: 'No wind data',
            angleConvention: 'bearingCW',
            displayPosition: 'bottomleft',
            displayEmptyString: 'No wind data'
        },
        data: velocityData,
        maxVelocity: 15
    });

    velocityLayer.addTo(droneMap);
}

// Adicionar radar de chuva
function addRainRadar() {
    if (rainLayer) droneMap.removeLayer(rainLayer);

    // RainViewer API
    fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then(res => res.json())
        .then(data => {
            const latest = data.radar.past[data.radar.past.length - 1];
            rainLayer = L.tileLayer(`https://tilecache.rainviewer.com/v2/radar/${latest.path}/256/{z}/{x}/{y}/2/1_1.png`, {
                opacity: 0.6
            });
            rainLayer.addTo(droneMap);
        })
        .catch(() => console.log('Radar indisponível'));
}

// Renderizar gráfico de vento
function renderDroneWindChart(hourly) {
    const labels = [];
    const dataWind = [];

    for (let i = 0; i < 8 && i < hourly.length; i++) {
        const d = new Date(hourly[i].dt * 1000);
        labels.push(`${d.getHours().toString().padStart(2, '0')}:00`);
        dataWind.push((hourly[i].wind_speed * 3.6).toFixed(1));
    }

    if (droneWindChart) droneWindChart.destroy();

    droneWindChart = new Chart(document.getElementById('droneWindChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Vento (km/h)',
                data: dataWind,
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34,197,94,0.25)',
                fill: true,
                tension: 0.25
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Renderizar forecast por hora
function renderDroneHourlyList(hourly) {
    const container = document.getElementById('droneHourlyForecast');
    container.innerHTML = '';

    for (let i = 0; i < 8 && i < hourly.length; i++) {
        const item = hourly[i];
        const d = new Date(item.dt * 1000);
        const wind = (item.wind_speed * 3.6).toFixed(1);
        const rain = item?.rain?.['1h'] ? item.rain['1h'] : 0;

        container.innerHTML += `<div class="drone-hourly-item">
            ${d.getHours().toString().padStart(2, '0')}:00<br>
            💨 ${wind} km/h<br>
            🌧 ${rain}mm
        </div>`;
    }
}

// Alertas automáticos
function showDroneNotice(message) {
    const alertEl = document.getElementById('droneAlert');
    alertEl.innerText = message;
    alertEl.style.display = 'block';
    setTimeout(() => alertEl.style.display = 'none', 5000);
}

// Função principal checkFlight
async function checkFlight() {
    document.getElementById('droneStatusText').innerText = 'Carregando dados do Drone...';

    navigator.geolocation.getCurrentPosition(async pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        // 1. Inicializar mapa
        initDroneMap(lat, lon);

        // 2. Adicionar vento animado
        await addWindLayer(lat, lon);

        // 3. Adicionar radar
        addRainRadar();

        // 4. Buscar clima
        const weather = await fetchDroneWeather(lat, lon);
        if (!weather) {
            document.getElementById('droneStatusText').innerText = 'Falha no carregamento do drone';
            return;
        }

        // 5. Buscar Kp
        const kp = await fetchKpIndex();

        // 6. Simular satélites
        const satelites = simulateSatellites(kp);

        const ventokmh = (weather.current.wind_speed * 3.6).toFixed(1);
        const gustkmh = (weather.current.wind_gust * 3.6).toFixed(1);
        const visibility = weather.current.visibility;
        const rain = weather.current.rain?.['1h'] || 0;

        // 7. Atualizar métricas
        document.getElementById('ventoDrone').innerText = ventokmh + ' km/h';
        document.getElementById('rajadaDrone').innerText = gustkmh + ' km/h';
        document.getElementById('visibilidadeDrone').innerText = (visibility / 1000).toFixed(1) + ' km';
        document.getElementById('chuvaDrone').innerText = rain + ' mm';
        document.getElementById('kpDrone').innerText = kp;
        document.getElementById('satelitesDrone').innerText = satelites;

        // 8. Verificar zona
        const zone = checkNoFlyZone(lat, lon);
        if (zone) {
            document.getElementById('zonaDroneText').innerText = 'Área restrita para voo';
            document.getElementById('droneStatusText').innerText = '🔴 ZONA PROIBIDA';
            document.getElementById('droneStatusText').style.color = '#ef4444';
            document.getElementById('statusDrone').innerText = '🔴 Não recomendado';
            showDroneNotice('Zona proibida detectada!');
            return;
        } else {
            document.getElementById('zonaDroneText').innerText = '';
        }

        // 9. Calcular condições
        const conditions = checkDroneConditionsPro(
            parseFloat(ventokmh),
            parseFloat(gustkmh),
            kp,
            satelites,
            visibility,
            rain
        );

        // 10. Atualizar UI
        document.getElementById('droneStatusText').innerText = 'Status: ' + conditions.status;
        document.getElementById('droneStatusText').style.color = conditions.color;
        document.getElementById('statusDrone').innerText = conditions.status;

        // 11. Renderizar gráfico
        renderDroneWindChart(weather.hourly);

        // 12. Renderizar forecast
        renderDroneHourlyList(weather.hourly);

        // Alertas
        if (parseFloat(ventokmh) > 25) showDroneNotice('Vento forte detectado!');
        if (rain > 0) showDroneNotice('Chuva detectada!');
        if (kp > 5) showDroneNotice('Kp alto detectado!');

    }, err => {
        document.getElementById('droneStatusText').innerText = 'GPS negado ou indisponível';
        document.getElementById('droneStatusText').style.color = '#ef4444';
    });
}

// Events
document.getElementById('btnAtualizarDrone').addEventListener('click', checkFlight);

// Inicialização
navigator.geolocation.getCurrentPosition(
    pos => {
        buscarClima(pos.coords.latitude, pos.coords.longitude);
        checkFlight();
    },
    () => { buscarClima(-30.3333, -54.3167); checkFlight(); }
);

atualizarData();
