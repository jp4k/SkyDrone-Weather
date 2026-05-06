// Modo demo: dados climaticos simulados, sem chave de API.
const DEMO_CITY_LABEL = 'Sao Gabriel, Brasil';

// Atualizar interface das condiÃ§Ãµes de drone
function updateDroneUI(result) {
    const { status, label, color, reasons } = result;
    let icon, className;

    switch (status) {
        case 'good':
            icon = 'ðŸŸ¢';
            className = 'drone-good';
            break;
        case 'caution':
            icon = 'ðŸŸ¡';
            className = 'drone-caution';
            break;
        case 'danger':
            icon = 'ðŸ”´';
            className = 'drone-danger';
            break;
        default:
            icon = 'â³';
            className = '';
    }

    droneIconEl.textContent = icon;
    droneTextEl.textContent = label;
    droneStatusEl.className = `drone-status ${className}`;
    droneReasonsEl.textContent = reasons.length > 0 ? reasons.join(' â€¢ ') : 'CondiÃ§Ãµes favorÃ¡veis';
}

// Avaliar condiÃ§Ãµes para voo de drone
function checkDroneConditions(weatherData, kpIndex = 2) {
    let status = "good"; // good, caution, danger
    let reasons = [];

    // Converter vento m/s â†’ km/h
    const windSpeed = weatherData.wind.speed * 3.6;
    const gust = weatherData.wind.gust ? weatherData.wind.gust * 3.6 : 0;
    const humidity = weatherData.main.humidity;
    const temp = weatherData.main.temp;
    const visibility = weatherData.visibility || 10000;
    const weatherMain = weatherData.weather[0].main.toLowerCase();

    // ðŸŒ¬ï¸ VENTO
    if (windSpeed > 25) {
        status = "danger";
        reasons.push("Vento forte");
    } else if (windSpeed > 15 && status !== "danger") {
        status = "caution";
        reasons.push("Vento moderado");
    }

    // ðŸ’¨ RAJADAS
    if (gust > 30) {
        status = "danger";
        reasons.push("Rajadas de vento fortes");
    }

    // ðŸŒ§ï¸ CHUVA / TEMPESTADE
    if (weatherMain.includes("rain")) {
        status = "danger";
        reasons.push("Chuva detectada");
    }
    if (weatherMain.includes("storm") || weatherMain.includes("thunderstorm")) {
        status = "danger";
        reasons.push("Tempestade");
    }

    // ðŸŒ«ï¸ VISIBILIDADE
    if (visibility < 1000) {
        status = "danger";
        reasons.push("Baixa visibilidade");
    } else if (visibility < 2000 && status !== "danger") {
        status = "caution";
        reasons.push("Visibilidade reduzida");
    }

    // ðŸ’§ UMIDADE
    if (humidity > 90 && status !== "danger") {
        status = "caution";
        reasons.push("Umidade alta");
    }

    // ðŸŒ¡ï¸ TEMPERATURA
    if ((temp < 0 || temp > 40) && status !== "danger") {
        status = "caution";
        reasons.push("Temperatura extrema");
    }

    // ðŸŒŒ ÃNDICE KP (geomagnÃ©tico)
    if (kpIndex >= 6) {
        status = "danger";
        reasons.push("Alta atividade geomagnÃ©tica (Kp alto)");
    } else if (kpIndex >= 4 && status !== "danger") {
        status = "caution";
        reasons.push("Atividade geomagnÃ©tica moderada");
    }

    // ðŸŽ¯ Resultado final
    let label = "";
    let color = "";

    if (status === "good") {
        label = "ðŸŸ¢ Bom para voar";
        color = "green";
    } else if (status === "caution") {
        label = "ðŸŸ¡ Voe com cautela";
        color = "yellow";
    } else {
        label = "ðŸ”´ NÃ£o recomendÃ¡vel voar";
        color = "red";
    }

    return {
        status,
        label,
        color,
        reasons
    };
}

// FunÃ§Ã£o para atualizar todos os dados do clima
async function updateWeatherData() {
    statusEl.textContent = 'Atualizando dados...';

    try {
        // Buscar dados do clima
        await fetchForecast();

        await fetchCurrentWeather();

        statusEl.textContent = 'Atualizado agora';

    } catch (error) {
        console.error('Erro na atualizaÃ§Ã£o geral:', error);
        statusEl.textContent = 'Erro ao atualizar, tentando novamente...';
    }
}

// Elementos DOM
const cityEl = document.getElementById('city');
const dateTimeEl = document.getElementById('date-time');
const statusEl = document.getElementById('status');
const weatherIconEl = document.getElementById('weather-icon');
const temperatureEl = document.getElementById('temperature');
const feelsLikeEl = document.getElementById('feels-like');
const tempMaxEl = document.getElementById('temp-max');
const tempMinEl = document.getElementById('temp-min');
const humidityEl = document.getElementById('humidity');
const precipitationEl = document.getElementById('precipitation');
const windEl = document.getElementById('wind');
const weeklyForecastEl = document.getElementById('weekly-forecast');
const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const locationBtn = document.getElementById('location-btn');

// Atualizar data e hora
function updateDateTime() {
    const now = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    dateTimeEl.textContent = now.toLocaleDateString('pt-BR', options);
}

// Ãcones do clima
const weatherIcons = {
    'Clear': 'â˜€ï¸',
    'Clouds': 'â˜ï¸',
    'Rain': 'ðŸŒ§ï¸',
    'Drizzle': 'ðŸŒ¦ï¸',
    'Thunderstorm': 'â›ˆï¸',
    'Snow': 'â„ï¸',
    'Mist': 'ðŸŒ«ï¸',
    'Fog': 'ðŸŒ«ï¸',
    'Haze': 'ðŸŒ«ï¸'
};

// Buscar dados atuais em modo demo
async function fetchCurrentWeather() {
    statusEl.textContent = 'Atualizando demo...';
    displayCurrentWeather(createMockCurrentWeather());
    statusEl.textContent = 'Demo automatico';
}

function createMockCurrentWeather() {
    const city = currentCity && currentCity !== 'Sao Gabriel' ? currentCity : DEMO_CITY_LABEL;
    return {
        city,
        temp: 25,
        feels: 26,
        tempMax: 28,
        tempMin: 18,
        humidity: 58,
        precipitation: 0,
        wind: 12,
        weather: { main: 'Clear' }
    };
}

// Combinar dados de mÃºltiplas APIs
function combineWeatherData(data) {
    const temps = data.map(d => d.main ? d.main.temp : d.current ? d.current.temp_c : null).filter(Boolean);
    const feels = data.map(d => d.main ? d.main.feels_like : d.current ? d.current.feelslike_c : null).filter(Boolean);
    const hums = data.map(d => d.main ? d.main.humidity : d.current ? d.current.humidity : null).filter(Boolean);
    const winds = data.map(d => d.wind ? d.wind.speed * 3.6 : d.current ? d.current.wind_kph : null).filter(Boolean);
    const precips = data.map(d => d.rain ? d.rain['1h'] || 0 : d.current ? d.current.precip_mm : 0).filter(Boolean);

    const avgTemp = temps.length ? Math.round(temps.reduce((a, b) => a + b) / temps.length) : 21;
    const avgFeels = feels.length ? Math.round(feels.reduce((a, b) => a + b) / feels.length) : avgTemp;
    const avgHum = hums.length ? Math.round(hums.reduce((a, b) => a + b) / hums.length) : 65;
    const avgWind = winds.length ? Math.round(winds.reduce((a, b) => a + b) / winds.length) : 15;
    const avgPrecip = precips.length ? Math.round(precips.reduce((a, b) => a + b) / precips.length) : 0;

    // Usar dados do primeiro para outros campos
    const first = data[0];
    const city = first.name || first.location?.name || 'Cidade Desconhecida';
    const country = first.sys?.country || first.location?.country || '';
    const weather = first.weather ? first.weather[0] : first.current?.condition;
    const tempMax = first.main ? first.main.temp_max : first.forecast?.forecastday[0]?.day?.maxtemp_c || avgTemp + 4;
    const tempMin = first.main ? first.main.temp_min : first.forecast?.forecastday[0]?.day?.mintemp_c || avgTemp - 4;

    return {
        city: `${city}, ${country}`,
        temp: avgTemp,
        feels: avgFeels,
        tempMax: Math.round(tempMax),
        tempMin: Math.round(tempMin),
        humidity: avgHum,
        precipitation: avgPrecip,
        wind: avgWind,
        weather: weather
    };
}

// Exibir dados atuais
function displayCurrentWeather(data) {
    cityEl.textContent = data.city;
    temperatureEl.textContent = `${data.temp}Â°C`;
    feelsLikeEl.textContent = `${data.feels}Â°C`;
    tempMaxEl.textContent = `${data.tempMax}Â°C`;
    tempMinEl.textContent = `${data.tempMin}Â°C`;
    humidityEl.textContent = `${data.humidity}%`;
    precipitationEl.textContent = `${data.precipitation} mm`;
    windEl.textContent = `${data.wind} km/h`;

    const icon = weatherIcons[data.weather.main || data.weather.text] || 'â˜€ï¸';
    weatherIconEl.textContent = icon;
}

// Buscar previsao simulada
async function fetchForecast() {
    const forecast = createMockForecastList();
    renderHourlyChart(forecast.slice(0, 8));
    renderWeeklyForecast(forecast);
}

function createMockForecastList() {
    const now = new Date();
    now.setMinutes(0, 0, 0);

    return Array.from({ length: 7 * 8 }, (_, index) => {
        const date = new Date(now.getTime() + index * 3 * 60 * 60 * 1000);
        const hour = date.getHours();
        const temp = 23 + Math.sin((hour - 8) / 24 * Math.PI * 2) * 4 + Math.sin(index / 3);
        const cloudy = index % 9 === 5;
        return {
            dt: Math.round(date.getTime() / 1000),
            main: {
                temp,
                temp_max: temp + 2,
                temp_min: temp - 3,
                humidity: cloudy ? 68 : 58
            },
            weather: [{ main: cloudy ? 'Clouds' : 'Clear' }],
            wind: { speed: 12 / 3.6, gust: 18 / 3.6 },
            visibility: 12000
        };
    });
}

// Renderizar grafico horario
function renderHourlyChart(data) {
    const ctx = document.getElementById('hourly-chart').getContext('2d');
    const labels = data.map(item => {
        const date = new Date(item.dt * 1000);
        return date.getHours() + 'h';
    });
    const temps = data.map(item => Math.round(item.main.temp));

    if (hourlyChart) {
        // Atualizar dados do grÃ¡fico existente
        hourlyChart.data.labels = labels;
        hourlyChart.data.datasets[0].data = temps;
        hourlyChart.update();
    } else {
        // Criar novo grÃ¡fico
        hourlyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperatura (Â°C)',
                    data: temps,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: '#333'
                        },
                        ticks: {
                            color: '#fff'
                        }
                    },
                    x: {
                        grid: {
                            color: '#333'
                        },
                        ticks: {
                            color: '#fff'
                        }
                    }
                }
            }
        });
    }
}

// Renderizar previsÃ£o semanal
function renderWeeklyForecast(data) {
    const dailyData = {};

    data.forEach(item => {
        const date = new Date(item.dt * 1000);
        const day = date.toLocaleDateString('pt-BR', { weekday: 'short' });

        if (!dailyData[day]) {
            dailyData[day] = {
                temps: [],
                icon: item.weather[0].main
            };
        }
        dailyData[day].temps.push(item.main.temp);
    });

    weeklyForecastEl.innerHTML = '';
    Object.keys(dailyData).slice(0, 7).forEach(day => {
        const { temps, icon } = dailyData[day];
        const max = Math.max(...temps);
        const min = Math.min(...temps);

        const dayEl = document.createElement('div');
        dayEl.className = 'day';
        dayEl.innerHTML = `
            <div>${day}</div>
            <div class="icon">${weatherIcons[icon] || 'â˜€ï¸'}</div>
            <div class="temp">
                <span>${Math.round(max)}Â°</span>
                <span>${Math.round(min)}Â°</span>
            </div>
        `;
        weeklyForecastEl.appendChild(dayEl);
    });
}

// Dados mock
function loadMockData() {
    cityEl.textContent = 'SÃ£o Gabriel, Brasil';
    temperatureEl.textContent = '21Â°C';
    feelsLikeEl.textContent = '23Â°C';
    tempMaxEl.textContent = '25Â°C';
    tempMinEl.textContent = '18Â°C';
    humidityEl.textContent = '65%';
    precipitationEl.textContent = '0 mm';
    windEl.textContent = '15 km/h';
    weatherIconEl.textContent = 'â˜€ï¸';
}

function loadMockForecast() {
    const ctx = document.getElementById('hourly-chart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['12h', '15h', '18h', '21h', '00h', '03h', '06h', '09h'],
            datasets: [{
                label: 'Temperatura (Â°C)',
                data: [20, 22, 24, 21, 19, 18, 20, 23],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: '#333'
                    },
                    ticks: {
                        color: '#fff'
                    }
                },
                x: {
                    grid: {
                        color: '#333'
                    },
                    ticks: {
                        color: '#fff'
                    }
                }
            }
        }
    });

    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'SÃ¡b', 'Dom'];
    weeklyForecastEl.innerHTML = '';
    days.forEach((day, index) => {
        const dayEl = document.createElement('div');
        dayEl.className = 'day';
        dayEl.innerHTML = `
            <div>${day}</div>
            <div class="icon">â˜€ï¸</div>
            <div class="temp">
                <span>${25 + index}Â°</span>
                <span>${18 + index}Â°</span>
            </div>
        `;
        weeklyForecastEl.appendChild(dayEl);
    });
}

// Buscar por cidade
searchBtn.addEventListener('click', () => {
    const city = cityInput.value.trim();
    if (city) {
        currentCity = city;
        currentLat = null;
        currentLon = null;
        updateWeatherData();
    }
});

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchBtn.click();
    }
});

// Usar geolocalizaÃ§Ã£o
locationBtn.addEventListener('click', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            currentLat = position.coords.latitude;
            currentLon = position.coords.longitude;
            updateWeatherData();
        }, (error) => {
            console.error('Erro de geolocalizaÃ§Ã£o:', error);
            statusEl.textContent = 'Nao foi possivel obter sua localizacao.';
        });
    } else {
        statusEl.textContent = 'Geolocalizacao nao suportada pelo navegador.';
    }
});

// Inicializar
updateDateTime();
setInterval(updateDateTime, 60000); // Atualizar data/hora a cada minuto

// SÃ³ inicializar clima se a aba estiver ativa
if (document.getElementById('weather-tab').classList.contains('active')) {
    updateWeatherData();
}

// Atualizar dados automaticamente a cada 5 minutos (300000 ms) apenas se aba ativa
setInterval(() => {
    if (document.getElementById('weather-tab').classList.contains('active')) {
        updateWeatherData();
    }
}, 300000);
