// --- STATE & CONSTANTS ---
// Keep API key setup as requested, though exposing it in client side JS is inherently insecure. 
// For a production app, this should be moved to a backend proxy.
const API_KEY = 'b448302a8ba89ab1f7e9480ac6d97b8d';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

let currentUnit = localStorage.getItem('weatherUnit') || 'metric'; // 'metric' (C) or 'imperial' (F)
let searchHistory = JSON.parse(localStorage.getItem('weatherHistory')) || [];
let tempChartInstance = null; // To track and destroy Chart.js instance

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
    displayCurrentWeather(currentData);
    displayForecastAndChart(forecastData);
    generateInsights(currentData);
    
    loadingState.style.display = 'none';
    errorDisplay.style.display = 'none';
    display.style.display = 'flex';
}

// --- DISPLAY CURRENT WEATHER ---
function displayCurrentWeather(data) {
    const { name, sys: { country }, main: { temp, feels_like, humidity, pressure }, wind: { speed }, visibility, weather: [{ description, icon, main }] } = data;

    document.getElementById('city-name').textContent = `${name}, ${country}`;
    document.getElementById('weather-desc').textContent = description;
    
    const unitSymbol = currentUnit === 'metric' ? '°C' : '°F';
    document.getElementById('current-temp').textContent = `${Math.round(temp)}${unitSymbol}`;
    document.getElementById('feels-like-val').textContent = `${Math.round(feels_like)}${unitSymbol}`;
    
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
    
    // Variables for Chart
    const chartLabels = [];
    const chartTemps = [];

    next24Hours.forEach(item => {
        const date = new Date(item.dt * 1000);
        const hour = date.toLocaleTimeString([], { hour: 'numeric', hour12: true });
        
        const temp = Math.round(item.main.temp);
        const pop = Math.round(item.pop * 100); // Probability of precipitation
        
        chartLabels.push(hour);
        chartTemps.push(temp);

        hourlyContainer.innerHTML += `
            <div class="forecast-item">
                <span class="forecast-time">${hour}</span>
                <div class="forecast-icon">
                    <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png" alt="${item.weather[0].description}">
                </div>
                <span class="forecast-temp">${temp}${unitSymbol}</span>
                ${pop > 0 ? `<span class="forecast-pop">💧 ${pop}%</span>` : ''}
            </div>
        `;
    });

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

function generateInsights(data) {
    const { main: { temp, humidity }, wind: { speed }, weather: [{ main: condition }] } = data;
    const insightsEl = document.getElementById('weather-insights');
    
    let insight = '';
    
    // Basic rules-based insights
    if (condition === 'Rain' || condition === 'Drizzle' || condition === 'Thunderstorm') {
        insight = '🌧️ Rain is likely. Consider carrying an umbrella.';
    } else if (temp > 30 && currentUnit === 'metric' || temp > 86 && currentUnit === 'imperial') {
        insight = '☀️ It\'s quite warm today. Stay hydrated.';
    } else if (temp < 5 && currentUnit === 'metric' || temp < 41 && currentUnit === 'imperial') {
        insight = '❄️ It is cold out. Dress warmly.';
    } else if (speed > 10 && currentUnit === 'metric') { // rough approximation for strong wind
        insight = '💨 Strong winds are expected today.';
    } else if (humidity > 80) {
        insight = '💧 Very humid conditions today.';
    } else {
        insight = '🌤️ Looks like a pleasant day for normal outdoor activities.';
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