// --- STATE & CONSTANTS ---
// Keep API key setup as requested, though exposing it in client side JS is inherently insecure. 
// For a production app, this should be moved to a backend proxy.
const API_KEY = 'b448302a8ba89ab1f7e9480ac6d97b8d';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

let currentUnit = localStorage.getItem('weatherUnit') || 'metric'; // 'metric' (C) or 'imperial' (F)
let searchHistory = JSON.parse(localStorage.getItem('weatherHistory')) || [];
let tempChartInstance = null; // To track and destroy Chart.js instance

// Timeline State
let currentHourlyData = [];
let selectedHourIndex = 0;
let originalCurrentData = null;

// --- DOM ELEMENTS ---
const form = document.getElementById('search-form');
const input = document.getElementById('cityinput');
const locationBtn = document.getElementById('location-btn');
const themeToggle = document.getElementById('theme-toggle');
const btnC = document.getElementById('btn-c');
const btnF = document.getElementById('btn-f');

const display = document.getElementById('dashboard');
const loadingState = document.getElementById('loading-state');
const errorDisplay = document.getElementById('error-display');
const errorMsg = document.getElementById('error-msg');
const searchHistoryContainer = document.getElementById('search-history');


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Theme
    const savedTheme = localStorage.getItem('weatherTheme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    // Initialize Units
    updateUnitButtons();
    
    // Initialize History
    renderSearchHistory();

    // Initialize Hourly Timeline Gestures & Controls
    setupTimelineGesturesAndControls();

    // Optionally load last searched city
    if (searchHistory.length > 0) {
        fetchWeatherByCity(searchHistory[0]);
    }
});


// --- EVENT LISTENERS ---
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const cityName = input.value.trim();
    if (!cityName) {
        showError("Please enter a city name.");
        return;
    }
    fetchWeatherByCity(cityName);
});

locationBtn.addEventListener('click', getUserLocation);

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('weatherTheme', newTheme);
});

btnC.addEventListener('click', () => {
    if (currentUnit !== 'metric') {
        currentUnit = 'metric';
        localStorage.setItem('weatherUnit', currentUnit);
        updateUnitButtons();
        if (input.value) fetchWeatherByCity(input.value);
        else if (searchHistory.length > 0) fetchWeatherByCity(searchHistory[0]);
    }
});

btnF.addEventListener('click', () => {
    if (currentUnit !== 'imperial') {
        currentUnit = 'imperial';
        localStorage.setItem('weatherUnit', currentUnit);
        updateUnitButtons();
        if (input.value) fetchWeatherByCity(input.value);
        else if (searchHistory.length > 0) fetchWeatherByCity(searchHistory[0]);
    }
});


// --- MAIN FUNCTIONS ---

function updateUnitButtons() {
    if (currentUnit === 'metric') {
        btnC.classList.add('active');
        btnF.classList.remove('active');
    } else {
        btnF.classList.add('active');
        btnC.classList.remove('active');
    }
}

async function fetchWeatherByCity(city) {
    showLoading();
    try {
        // Fetch Current Weather & Forecast concurrently
        const [currentData, forecastData] = await Promise.all([
            fetchData(`${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=${currentUnit}`),
            fetchData(`${BASE_URL}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=${currentUnit}`)
        ]);
        
        processAndDisplayData(currentData, forecastData);
        saveToHistory(currentData.name);
        
    } catch (error) {
        showError(error.message);
    }
}

async function fetchWeatherByCoords(lat, lon) {
    showLoading();
    try {
        const [currentData, forecastData] = await Promise.all([
            fetchData(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${currentUnit}`),
            fetchData(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${currentUnit}`)
        ]);
        
        processAndDisplayData(currentData, forecastData);
        saveToHistory(currentData.name);
        input.value = currentData.name; // Update input field
        
    } catch (error) {
        showError(error.message);
    }
}

async function fetchData(url) {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
        if (response.status === 401) throw new Error('Invalid API key.');
        if (response.status === 404) throw new Error('City not found. Please check spelling.');
        throw new Error(data.message || 'Unable to fetch weather data.');
    }
    return data;
}

function processAndDisplayData(currentData, forecastData) {
    originalCurrentData = currentData;
    selectedHourIndex = 0;
    displayCurrentWeather(currentData);
    displayForecastAndChart(forecastData);
    generateInsights(currentData, forecastData);
    
    loadingState.style.display = 'none';
    errorDisplay.style.display = 'none';
    display.style.display = 'flex';
}

// --- DISPLAY CURRENT WEATHER ---
function displayCurrentWeather(data) {
    const { name, sys, main: { temp, feels_like, humidity, pressure }, wind: { speed }, visibility, weather: [{ description, icon, main }] } = data;
    const country = sys ? sys.country : '';

    document.getElementById('city-name').textContent = country ? `${name}, ${country}` : name;
    document.getElementById('weather-desc').textContent = description;
    
    const unitSymbol = currentUnit === 'metric' ? '°C' : '°F';
    document.getElementById('current-temp').textContent = `${Math.round(temp)}${unitSymbol}`;
    document.getElementById('feels-like-val').textContent = `${Math.round(feels_like)}${unitSymbol}`;

    // Sunrise & Sunset (actual API timestamps in user's local time)
    if (sys && sys.sunrise && sys.sunset) {
        const sunriseStr = new Date(sys.sunrise * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        const sunsetStr = new Date(sys.sunset * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        const sunriseEl = document.getElementById('sunrise-val');
        const sunsetEl = document.getElementById('sunset-val');
        if (sunriseEl) sunriseEl.textContent = sunriseStr;
        if (sunsetEl) sunsetEl.textContent = sunsetStr;
    }
    
    document.getElementById('humidity-val').textContent = `${humidity}%`;
    
    // Wind: Metric uses m/s, Imperial uses mph. Let's convert m/s to km/h for Metric.
    const windSpeedStr = currentUnit === 'metric' ? `${(speed * 3.6).toFixed(1)} km/h` : `${speed} mph`;
    document.getElementById('wind-val').textContent = windSpeedStr;
    
    document.getElementById('pressure-val').textContent = `${pressure} hPa`;
    
    const visStr = visibility ? (currentUnit === 'metric' ? `${(visibility/1000).toFixed(1)} km` : `${(visibility/1609.34).toFixed(1)} mi`) : 'N/A';
    document.getElementById('visibility-val').textContent = visStr;
    
    document.getElementById('weather-icon').innerHTML = `<img src="https://openweathermap.org/img/wn/${icon}@4x.png" alt="${description}">`;

    updateWeatherBackground(data);
}

// --- DISPLAY FORECAST & CHART ---
function displayForecastAndChart(data) {
    const hourlyContainer = document.getElementById('hourly-forecast');
    const dailyContainer = document.getElementById('daily-forecast');
    hourlyContainer.innerHTML = '';
    dailyContainer.innerHTML = '';

    const unitSymbol = currentUnit === 'metric' ? '°' : '°';
    
    // 1. Hourly Forecast (Next 24 hours = 8 items of 3h intervals)
    const next24Hours = data.list.slice(0, 8);
    currentHourlyData = next24Hours;
    
    // Variables for Chart
    const chartLabels = [];
    const chartTemps = [];

    next24Hours.forEach(item => {
        const date = new Date(item.dt * 1000);
        const hour = date.toLocaleTimeString([], { hour: 'numeric', hour12: true });
        
        const temp = Math.round(item.main.temp);
        chartLabels.push(hour);
        chartTemps.push(temp);
    });

    renderHourlyTimeline(next24Hours);

    // 2. Daily Forecast (Aggregate 5 days)
    const dailyData = {};
    data.list.forEach(item => {
        const dateStr = item.dt_txt.split(' ')[0]; // yyyy-mm-dd
        if (!dailyData[dateStr]) {
            dailyData[dateStr] = { min: item.main.temp_min, max: item.main.temp_max, icon: item.weather[0].icon, description: item.weather[0].description };
        } else {
            dailyData[dateStr].min = Math.min(dailyData[dateStr].min, item.main.temp_min);
            dailyData[dateStr].max = Math.max(dailyData[dateStr].max, item.main.temp_max);
            // Grab midday icon roughly
            if (item.dt_txt.includes("12:00:00")) {
                dailyData[dateStr].icon = item.weather[0].icon;
                dailyData[dateStr].description = item.weather[0].description;
            }
        }
    });

    // Render 5 Days
    Object.keys(dailyData).slice(0, 5).forEach((dateStr, index) => {
        const dayData = dailyData[dateStr];
        const dateObj = new Date(dateStr);
        const dayName = index === 0 ? 'Today' : dateObj.toLocaleDateString([], { weekday: 'short' });

        dailyContainer.innerHTML += `
            <div class="forecast-item daily-forecast-item">
                <span class="forecast-time">${dayName}</span>
                <div class="forecast-icon">
                    <img src="https://openweathermap.org/img/wn/${dayData.icon}.png" alt="${dayData.description}">
                </div>
                <div class="temps">
                    <span class="temp-max">${Math.round(dayData.max)}${unitSymbol}</span>
                    <span class="temp-min">${Math.round(dayData.min)}${unitSymbol}</span>
                </div>
            </div>
        `;
    });

    // 3. Render Chart
    renderChart(chartLabels, chartTemps);
}

function renderChart(labels, dataPoints) {
    const ctx = document.getElementById('tempChart').getContext('2d');
    
    // Destroy previous instance to prevent overlapping
    if (tempChartInstance) {
        tempChartInstance.destroy();
    }

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#e5e7eb' : '#1f2937';
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    tempChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Temperature',
                data: dataPoints,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#2563eb',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.parsed.y}°`
                    }
                }
            },
            scales: {
                x: { 
                    grid: { display: false, color: gridColor }, 
                    ticks: { color: textColor } 
                },
                y: { 
                    grid: { color: gridColor }, 
                    ticks: { color: textColor, callback: (value) => `${value}°` }
                }
            }
        }
    });
}


// --- UTILITIES & INSIGHTS ---

function generateInsights(currentData, forecastData) {
    const insightsEl = document.getElementById('weather-insights');
    if (!insightsEl) return;

    const { main: { temp, humidity }, wind: { speed }, weather: [{ main: condition }] } = currentData;
    let insight = '';

    // Inspect hourly forecast data for upcoming conditions
    let rainLaterHour = null;
    let maxTempLater = -Infinity;
    let maxTempHour = '';

    if (forecastData && Array.isArray(forecastData.list)) {
        const next8 = forecastData.list.slice(0, 8);
        for (const item of next8) {
            const itemHour = new Date(item.dt * 1000).toLocaleTimeString([], { hour: 'numeric', hour12: true });
            const itemCond = item.weather[0].main;
            const itemPop = item.pop || 0;
            if (!rainLaterHour && (itemCond === 'Rain' || itemCond === 'Drizzle' || itemPop >= 0.5)) {
                rainLaterHour = itemHour;
            }
            if (item.main && item.main.temp > maxTempLater) {
                maxTempLater = item.main.temp;
                maxTempHour = itemHour;
            }
        }
    }

    if (condition === 'Rain' || condition === 'Drizzle' || condition === 'Thunderstorm') {
        insight = '🌧️ Rain in progress. Carry an umbrella if heading out.';
    } else if (rainLaterHour) {
        insight = `🌧️ Rain is likely around ${rainLaterHour}. Keep an umbrella handy.`;
    } else if (maxTempLater > temp + 3 && maxTempHour) {
        const unit = currentUnit === 'metric' ? '°C' : '°F';
        insight = `📈 Temperature will peak around ${maxTempHour} at ${Math.round(maxTempLater)}${unit}.`;
    } else if (speed > 10 && currentUnit === 'metric' || speed > 22 && currentUnit === 'imperial') {
        insight = '💨 Strong winds today. Take care when outdoors.';
    } else if (temp > 30 && currentUnit === 'metric' || temp > 86 && currentUnit === 'imperial') {
        insight = '☀️ High temperatures today. Stay well hydrated.';
    } else if (temp < 5 && currentUnit === 'metric' || temp < 41 && currentUnit === 'imperial') {
        insight = '❄️ Brisk cold today. Remember to dress warmly.';
    } else if (humidity > 80) {
        insight = '💧 High humidity makes the air feel heavy today.';
    } else if (condition === 'Clear') {
        insight = '✨ Clear skies expected throughout the evening.';
    } else {
        insight = '🌤️ Pleasant conditions expected for outdoor activities.';
    }

    insightsEl.innerHTML = `<p>${insight}</p>`;
}

function updateWeatherBackground(data) {
    const { weather: [{ id, icon }] } = data;
    const bgContainer = document.getElementById('weather-background');
    if (!bgContainer) return;
    
    bgContainer.innerHTML = ''; // Clear previous animations

    // Night detection
    const isNight = icon.endsWith('n');
    let bgClass = 'default-bg';
    if (isNight) bgClass = 'night-bg';

    // Determine background color class
    if (id >= 200 && id < 300 && !isNight) bgClass = 'thunder-bg';
    else if (((id >= 300 && id < 400) || (id >= 500 && id < 600)) && !isNight) bgClass = 'rain-bg';
    else if (id >= 600 && id < 700 && !isNight) bgClass = 'snow-bg';
    else if (id === 800 && !isNight) bgClass = 'clear-bg';
    else if (id > 800 && !isNight) bgClass = 'clouds-bg';

    document.body.className = bgClass;

    // Accessibility check for reduced motion
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // Adjust particle count for mobile
    const isMobile = window.innerWidth <= 768;
    const particleMultiplier = isMobile ? 0.5 : 1;

    // Group 2xx: Thunderstorm
    if (id >= 200 && id < 300) {
        createRain(bgContainer, Math.floor(40 * particleMultiplier));
        createLightning(bgContainer);
    } 
    // Group 3xx: Drizzle or 5xx: Rain
    else if ((id >= 300 && id < 400) || (id >= 500 && id < 600)) {
        createRain(bgContainer, Math.floor((id >= 502 ? 80 : 40) * particleMultiplier)); // Heavy rain
    }
    // Group 6xx: Snow
    else if (id >= 600 && id < 700) {
        createSnow(bgContainer, Math.floor(50 * particleMultiplier));
    }
    // Group 7xx: Atmosphere (Fog, Mist)
    else if (id >= 700 && id < 800) {
        createFog(bgContainer);
    }
    // Group 800: Clear
    else if (id === 800) {
        if (!isNight) {
            createSun(bgContainer);
        } else {
            createStars(bgContainer, Math.floor(40 * particleMultiplier));
        }
    }
    // Group 80x: Clouds
    else if (id > 800) {
        createClouds(bgContainer, Math.floor(5 * particleMultiplier));
        if (isNight) createStars(bgContainer, Math.floor(20 * particleMultiplier)); // Stars peeking through
    }
}

// -- Animation Generators --

function createRain(container, count) {
    for (let i = 0; i < count; i++) {
        const drop = document.createElement('div');
        drop.classList.add('rain-drop');
        drop.style.left = `${Math.random() * 100}vw`;
        drop.style.animationDuration = `${0.5 + Math.random() * 0.5}s`;
        drop.style.animationDelay = `${Math.random() * 2}s`;
        container.appendChild(drop);
    }
}

function createSnow(container, count) {
    for (let i = 0; i < count; i++) {
        const flake = document.createElement('div');
        flake.classList.add('snowflake');
        const size = Math.random() * 4 + 2;
        flake.style.width = `${size}px`;
        flake.style.height = `${size}px`;
        flake.style.left = `${Math.random() * 100}vw`;
        flake.style.animationDuration = `${3 + Math.random() * 4}s`;
        flake.style.animationDelay = `${Math.random() * 5}s`;
        container.appendChild(flake);
    }
}

function createStars(container, count) {
    for (let i = 0; i < count; i++) {
        const star = document.createElement('div');
        star.classList.add('star');
        const size = Math.random() * 3 + 1;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.left = `${Math.random() * 100}vw`;
        star.style.top = `${Math.random() * 60}vh`; // Mostly upper half
        star.style.animationDuration = `${1 + Math.random() * 3}s`;
        star.style.animationDelay = `${Math.random() * 2}s`;
        container.appendChild(star);
    }
}

function createClouds(container, count) {
    for (let i = 0; i < count; i++) {
        const cloud = document.createElement('div');
        cloud.classList.add('moving-cloud');
        const width = 200 + Math.random() * 300;
        const height = width * 0.4;
        cloud.style.width = `${width}px`;
        cloud.style.height = `${height}px`;
        cloud.style.top = `${Math.random() * 40}vh`;
        cloud.style.animationDuration = `${30 + Math.random() * 60}s`;
        cloud.style.animationDelay = `-${Math.random() * 30}s`;
        container.appendChild(cloud);
    }
}

function createFog(container) {
    for (let i = 0; i < 2; i++) {
        const fog = document.createElement('div');
        fog.classList.add('fog-layer');
        fog.style.animationDuration = `${30 + i * 20}s`;
        fog.style.animationDelay = `-${Math.random() * 20}s`;
        fog.style.top = `${20 * i}vh`;
        container.appendChild(fog);
    }
}

function createSun(container) {
    const sun = document.createElement('div');
    sun.classList.add('sun-glow');
    container.appendChild(sun);
}

function createLightning(container) {
    const flash = document.createElement('div');
    flash.classList.add('lightning-flash');
    flash.style.animation = `lightning ${4 + Math.random() * 6}s infinite`;
    container.appendChild(flash);
}

// --- LOCATION ---
function getUserLocation() {
    if (!navigator.geolocation) {
        showError("Geolocation is not supported by your browser.");
        return;
    }

    showLoading();
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            fetchWeatherByCoords(latitude, longitude);
        },
        (error) => {
            let msg = 'Unable to retrieve location.';
            if (error.code === error.PERMISSION_DENIED) msg = 'Location permission denied. Please search manually.';
            showError(msg);
        }
    );
}

// --- SEARCH HISTORY ---
function saveToHistory(city) {
    // Remove if already exists to move it to the front
    searchHistory = searchHistory.filter(item => item.toLowerCase() !== city.toLowerCase());
    searchHistory.unshift(city);
    if (searchHistory.length > 5) searchHistory.pop();
    
    localStorage.setItem('weatherHistory', JSON.stringify(searchHistory));
    renderSearchHistory();
}

function renderSearchHistory() {
    searchHistoryContainer.innerHTML = '';
    searchHistory.forEach(city => {
        const btn = document.createElement('button');
        btn.className = 'history-item';
        btn.textContent = city;
        btn.onclick = () => {
            input.value = city;
            fetchWeatherByCity(city);
        };
        searchHistoryContainer.appendChild(btn);
    });
}

// --- STATE MANAGEMENT ---
function showLoading() {
    display.style.display = 'none';
    errorDisplay.style.display = 'none';
    loadingState.style.display = 'block';
}

function showError(message) {
    display.style.display = 'none';
    loadingState.style.display = 'none';
    errorDisplay.style.display = 'block';
    errorMsg.textContent = message;
    document.body.className = 'default-bg';
}

// ==========================================
// --- HOURLY FORECAST TIMELINE SYSTEM ---
// ==========================================

function renderHourlyTimeline(hourlyList) {
    const hourlyContainer = document.getElementById('hourly-forecast');
    const timelineDots = document.getElementById('timeline-dots');
    if (!hourlyContainer || !timelineDots) return;

    hourlyContainer.innerHTML = '';
    timelineDots.innerHTML = '';

    const unitSymbol = currentUnit === 'metric' ? '°' : '°';

    hourlyList.forEach((item, index) => {
        const date = new Date(item.dt * 1000);
        const hourStr = date.toLocaleTimeString([], { hour: 'numeric', hour12: true });
        const isNow = index === 0;
        const pop = Math.round((item.pop || 0) * 100);
        const temp = Math.round(item.main.temp);

        // 1. Forecast Card
        const card = document.createElement('div');
        card.className = `forecast-item ${index === selectedHourIndex ? 'selected' : ''}`;
        card.dataset.index = index;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${isNow ? 'Now, ' : ''}${hourStr}: ${item.weather[0].description}, ${temp}${unitSymbol}`);

        card.innerHTML = `
            ${isNow ? '<span class="now-badge">NOW</span>' : ''}
            <span class="forecast-time">${hourStr}</span>
            <div class="forecast-icon">
                <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png" alt="${item.weather[0].description}">
            </div>
            <span class="forecast-temp">${temp}${unitSymbol}</span>
            ${pop > 0 ? `<span class="forecast-pop">💧 ${pop}%</span>` : ''}
        `;

        card.addEventListener('click', () => selectHour(index));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectHour(index);
            }
        });

        hourlyContainer.appendChild(card);

        // 2. Timeline Dot Indicator
        const dot = document.createElement('button');
        dot.className = `timeline-dot ${index === selectedHourIndex ? 'active' : ''}`;
        dot.dataset.index = index;
        dot.setAttribute('aria-label', `Navigate to ${isNow ? 'Now' : hourStr}`);
        dot.addEventListener('click', () => selectHour(index));
        timelineDots.appendChild(dot);
    });

    // Initial position without animation
    setTimeout(() => centerTimelineCard(selectedHourIndex, false), 50);
}

function selectHour(index) {
    if (!currentHourlyData || currentHourlyData.length === 0) return;

    // Boundary checks with tactile feedback
    if (index < 0) {
        triggerBoundaryBounce('left');
        return;
    }
    if (index >= currentHourlyData.length) {
        triggerBoundaryBounce('right');
        return;
    }

    selectedHourIndex = index;

    // Update active state on cards
    const cards = document.querySelectorAll('.hourly-container .forecast-item');
    cards.forEach((card, idx) => {
        card.classList.toggle('selected', idx === index);
    });

    // Update active state on indicator dots
    const dots = document.querySelectorAll('#timeline-dots .timeline-dot');
    dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === index);
    });

    // Smoothly slide the timeline carousel
    centerTimelineCard(index, true);

    // Coordinate main weather card, details, and dynamic background
    animateTimelineTransition(currentHourlyData[index], index === 0);
}

function centerTimelineCard(index, smooth = true) {
    const wrapper = document.getElementById('hourly-carousel-wrapper');
    const container = document.getElementById('hourly-forecast');
    if (!wrapper || !container) return;

    const cards = container.children;
    if (!cards || !cards[index]) return;

    const card = cards[index];
    const cardCenter = card.offsetLeft + (card.offsetWidth / 2);
    const wrapperCenter = wrapper.offsetWidth / 2;
    let targetX = wrapperCenter - cardCenter;

    // Constrain within bounds
    const minX = Math.min(0, wrapper.offsetWidth - container.scrollWidth);
    const maxX = 0;

    if (container.scrollWidth <= wrapper.offsetWidth) {
        targetX = (wrapper.offsetWidth - container.scrollWidth) / 2;
    } else {
        targetX = Math.min(maxX, Math.max(minX, targetX));
    }

    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.style.transition = (smooth && !prefersReducedMotion) ? 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';
    container.style.transform = `translateX(${targetX}px)`;
}

function getContainerTranslateX() {
    const container = document.getElementById('hourly-forecast');
    if (!container) return 0;
    const style = window.getComputedStyle(container);
    const matrix = new DOMMatrixReadOnly(style.transform);
    return matrix.m41 || 0;
}

function triggerBoundaryBounce(direction) {
    const container = document.getElementById('hourly-forecast');
    if (!container) return;

    const currentX = getContainerTranslateX();
    const bounceDelta = direction === 'left' ? 26 : -26;

    container.style.transition = 'transform 0.15s ease-out';
    container.style.transform = `translateX(${currentX + bounceDelta}px)`;

    setTimeout(() => {
        centerTimelineCard(selectedHourIndex, true);
    }, 160);
}

function animateTimelineTransition(hourData, isCurrentHour) {
    if (!hourData) return;

    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const unitSymbol = currentUnit === 'metric' ? '°C' : '°F';
    const targetTemp = Math.round(hourData.main.temp);

    // 1. Connect with Dynamic Animated Weather Background
    updateWeatherBackground(hourData);

    // 2. Animate Temperature Number
    const tempEl = document.getElementById('current-temp');
    if (tempEl) {
        if (prefersReducedMotion) {
            tempEl.textContent = `${targetTemp}${unitSymbol}`;
        } else {
            animateTemperature(tempEl, targetTemp, unitSymbol);
        }
    }

    // 3. Animate Weather Icon Transition
    const iconContainer = document.getElementById('weather-icon');
    if (iconContainer) {
        const newIconSrc = `https://openweathermap.org/img/wn/${hourData.weather[0].icon}@4x.png`;
        const currentImg = iconContainer.querySelector('img');
        if (currentImg && !prefersReducedMotion) {
            currentImg.classList.add('fade-out');
            setTimeout(() => {
                currentImg.src = newIconSrc;
                currentImg.alt = hourData.weather[0].description;
                currentImg.classList.remove('fade-out');
                currentImg.classList.add('fade-in');
                setTimeout(() => currentImg.classList.remove('fade-in'), 300);
            }, 180);
        } else {
            iconContainer.innerHTML = `<img src="${newIconSrc}" alt="${hourData.weather[0].description}">`;
        }
    }

    // 4. Animate Weather Description Transition
    const descEl = document.getElementById('weather-desc');
    if (descEl) {
        if (prefersReducedMotion) {
            descEl.textContent = hourData.weather[0].description;
        } else {
            descEl.style.opacity = '0';
            setTimeout(() => {
                descEl.textContent = hourData.weather[0].description;
                descEl.style.opacity = '1';
            }, 180);
        }
    }

    // 5. Update Weather Details Grid
    const feelsLikeEl = document.getElementById('feels-like-val');
    if (feelsLikeEl) feelsLikeEl.textContent = `${Math.round(hourData.main.feels_like)}${unitSymbol}`;

    const humidityEl = document.getElementById('humidity-val');
    if (humidityEl) humidityEl.textContent = `${hourData.main.humidity}%`;

    const windEl = document.getElementById('wind-val');
    if (windEl) {
        const windSpeed = currentUnit === 'metric' 
            ? `${(hourData.wind.speed * 3.6).toFixed(1)} km/h` 
            : `${hourData.wind.speed} mph`;
        windEl.textContent = windSpeed;
    }

    const pressureEl = document.getElementById('pressure-val');
    if (pressureEl) pressureEl.textContent = `${hourData.main.pressure} hPa`;

    const visEl = document.getElementById('visibility-val');
    if (visEl) {
        const vis = hourData.visibility;
        visEl.textContent = vis 
            ? (currentUnit === 'metric' ? `${(vis / 1000).toFixed(1)} km` : `${(vis / 1609.34).toFixed(1)} mi`)
            : (originalCurrentData && originalCurrentData.visibility 
                ? (currentUnit === 'metric' ? `${(originalCurrentData.visibility / 1000).toFixed(1)} km` : `${(originalCurrentData.visibility / 1609.34).toFixed(1)} mi`) 
                : 'N/A');
    }
}

function animateTemperature(element, targetTemp, unitSymbol) {
    const rawText = element.textContent.replace(/[^\d.-]/g, '');
    const startTemp = parseFloat(rawText);

    if (isNaN(startTemp) || startTemp === targetTemp) {
        element.textContent = `${targetTemp}${unitSymbol}`;
        return;
    }

    const startTime = performance.now();
    const duration = 300; // ms

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out quad
        const easeProgress = 1 - (1 - progress) * (1 - progress);
        const currentVal = Math.round(startTemp + (targetTemp - startTemp) * easeProgress);

        element.textContent = `${currentVal}${unitSymbol}`;

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            element.textContent = `${targetTemp}${unitSymbol}`;
        }
    }

    requestAnimationFrame(step);
}

function setupTimelineGesturesAndControls() {
    const prevBtn = document.getElementById('prev-hour');
    const nextBtn = document.getElementById('next-hour');
    const wrapper = document.getElementById('hourly-carousel-wrapper');
    const container = document.getElementById('hourly-forecast');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => selectHour(selectedHourIndex - 1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => selectHour(selectedHourIndex + 1));
    }

    if (!wrapper || !container) return;

    // Gesture handling: Pointer Events for touch & mouse drag
    let startX = 0;
    let startY = 0;
    let isDown = false;
    let isHorizontalSwipe = false;
    let initialTranslateX = 0;

    wrapper.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // Only primary mouse button
        isDown = true;
        startX = e.clientX;
        startY = e.clientY;
        isHorizontalSwipe = false;
        initialTranslateX = getContainerTranslateX();
        container.style.transition = 'none';
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDown) return;
        const diffX = e.clientX - startX;
        const diffY = e.clientY - startY;

        if (!isHorizontalSwipe) {
            // Check if gesture is primarily horizontal
            if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY)) {
                isHorizontalSwipe = true;
                wrapper.classList.add('dragging');
            } else if (Math.abs(diffY) > 10) {
                // Vertical scrolling gesture; do not interfere with page scroll
                isDown = false;
                centerTimelineCard(selectedHourIndex, true);
                return;
            }
        }

        if (isHorizontalSwipe) {
            e.preventDefault();
            const minX = Math.min(0, wrapper.offsetWidth - container.scrollWidth);
            let dragX = initialTranslateX + diffX;

            // Resistance beyond edges
            if (dragX > 0) {
                dragX = diffX * 0.35;
            } else if (dragX < minX) {
                dragX = minX + (dragX - minX) * 0.35;
            }

            container.style.transform = `translateX(${dragX}px)`;
        }
    });

    const handlePointerEnd = (e) => {
        if (!isDown) return;
        isDown = false;
        wrapper.classList.remove('dragging');

        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        container.style.transition = prefersReducedMotion ? 'none' : 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';

        if (isHorizontalSwipe) {
            const diffX = e.clientX - startX;
            const threshold = 45; // 45px swipe threshold

            if (diffX < -threshold) {
                // Swiped Left -> Move forward in timeline
                if (selectedHourIndex < currentHourlyData.length - 1) {
                    selectHour(selectedHourIndex + 1);
                } else {
                    triggerBoundaryBounce('right');
                }
            } else if (diffX > threshold) {
                // Swiped Right -> Move backward in timeline
                if (selectedHourIndex > 0) {
                    selectHour(selectedHourIndex - 1);
                } else {
                    triggerBoundaryBounce('left');
                }
            } else {
                // Snap back to current selected hour
                centerTimelineCard(selectedHourIndex, true);
            }
        }
        isHorizontalSwipe = false;
    };

    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    // Keyboard accessibility for carousel
    wrapper.tabIndex = 0;
    wrapper.setAttribute('aria-label', 'Hourly forecast timeline. Use left and right arrow keys to navigate.');
    wrapper.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            selectHour(selectedHourIndex - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            selectHour(selectedHourIndex + 1);
        }
    });

    // Handle viewport resize smoothly
    window.addEventListener('resize', () => {
        centerTimelineCard(selectedHourIndex, false);
    });
}