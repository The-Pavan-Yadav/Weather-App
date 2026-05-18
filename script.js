/* ═══════════════════════════════════════════════════
   AETHER WEATHER — script.js
   Async/await, Fetch API, Particles, Local Storage
   ═══════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// CONFIG — replace with your OpenWeatherMap key
// Get one free at: https://openweathermap.org/api
// ─────────────────────────────────────────────
const API_KEY = "0bc052fc389422aed9158f19a70458f7";
const BASE_URL = "https://api.openweathermap.org/data/2.5";

// ─────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────
const cityInput      = document.getElementById('cityInput');
const searchBtn      = document.getElementById('searchBtn');
const locateBtn      = document.getElementById('locateBtn');
const refreshBtn     = document.getElementById('refreshBtn');
const loader         = document.getElementById('loader');
const errorCard      = document.getElementById('errorCard');
const errorMsg       = document.getElementById('errorMsg');
const welcomeState   = document.getElementById('welcomeState');
const weatherCard    = document.getElementById('weatherCard');
const forecastSection= document.getElementById('forecastSection');
const forecastGrid   = document.getElementById('forecastGrid');
const recentSearches = document.getElementById('recentSearches');
const datetimeEl     = document.getElementById('datetime');
const body           = document.getElementById('body');

// Weather display elements
const cityNameEl     = document.getElementById('cityName');
const countryNameEl  = document.getElementById('countryName');
const temperatureEl  = document.getElementById('temperature');
const conditionEl    = document.getElementById('conditionLabel');
const feelsLikeEl    = document.getElementById('feelsLike');
const humidityEl     = document.getElementById('humidity');
const windSpeedEl    = document.getElementById('windSpeed');
const visibilityEl   = document.getElementById('visibility');
const weatherIconEl  = document.getElementById('weatherIcon');
const sunriseEl      = document.getElementById('sunrise');
const sunsetEl       = document.getElementById('sunset');

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let lastCity = '';          // For refresh
let lastCoords = null;      // For geo-refresh
let isLoading = false;

// ─────────────────────────────────────────────
// CLOCK — updates every second
// ─────────────────────────────────────────────
function updateClock() {
  const now  = new Date();
  const date = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
  datetimeEl.innerHTML = `${date}<br>${time}`;
}
updateClock();
setInterval(updateClock, 1000);

// ─────────────────────────────────────────────
// RECENT SEARCHES — localStorage
// ─────────────────────────────────────────────
const MAX_RECENT = 5;

function getRecent() {
  return JSON.parse(localStorage.getItem('aether_recent') || '[]');
}

function addRecent(city) {
  let list = getRecent().filter(c => c.toLowerCase() !== city.toLowerCase());
  list.unshift(city);
  if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
  localStorage.setItem('aether_recent', JSON.stringify(list));
}

function renderRecentSearches() {
  const list = getRecent();
  recentSearches.innerHTML = '';
  list.forEach(city => {
    const pill = document.createElement('button');
    pill.className = 'recent-pill';
    pill.textContent = city;
    pill.addEventListener('click', () => {
      cityInput.value = city;
      fetchWeatherByCity(city);
    });
    recentSearches.appendChild(pill);
  });
}

renderRecentSearches();

// ─────────────────────────────────────────────
// UI STATE HELPERS
// ─────────────────────────────────────────────
function showLoader() {
  loader.classList.add('visible');
  errorCard.classList.remove('visible');
  weatherCard.classList.remove('visible');
  forecastSection.classList.remove('visible');
  welcomeState.style.display = 'none';
  errorCard.style.display = 'none';
}

function hideLoader() {
  loader.classList.remove('visible');
}

function showError(msg) {
  hideLoader();
  errorCard.style.display = 'flex';
  errorCard.classList.add('visible');
  errorMsg.textContent = msg;
  weatherCard.classList.remove('visible');
  forecastSection.classList.remove('visible');
}

function showWeather() {
  hideLoader();
  errorCard.style.display = 'none';
  errorCard.classList.remove('visible');
  weatherCard.classList.add('visible');
  forecastSection.classList.add('visible');
}

// ─────────────────────────────────────────────
// DYNAMIC BACKGROUND THEME
// ─────────────────────────────────────────────
const weatherThemeMap = {
  'clear':        'weather-clear',
  'clouds':       'weather-clouds',
  'rain':         'weather-rain',
  'drizzle':      'weather-rain',
  'thunderstorm': 'weather-thunderstorm',
  'snow':         'weather-snow',
  'mist':         'weather-mist',
  'haze':         'weather-haze',
  'fog':          'weather-fog',
  'smoke':        'weather-mist',
  'dust':         'weather-mist',
  'sand':         'weather-mist',
  'ash':          'weather-mist',
  'squall':       'weather-rain',
  'tornado':      'weather-thunderstorm',
};

function applyWeatherTheme(condition) {
  const key   = condition.toLowerCase();
  const theme = weatherThemeMap[key] || 'weather-default';

  // Remove old weather classes
  body.className = '';
  body.classList.add(theme);

  // Update particle colours to match
  updateParticleColors(theme);
}

// ─────────────────────────────────────────────
// TIME FORMATTER (Unix timestamp → HH:MM AM/PM)
// ─────────────────────────────────────────────
function formatTime(unix, timezone) {
  const date = new Date((unix + timezone) * 1000);
  return date.toUTCString().slice(17, 22).replace(':', ':').trim()
    // Convert to 12h
    .replace(/(\d+):(\d+)/, (_, h, m) => {
      const hr = parseInt(h);
      const ampm = hr >= 12 ? 'PM' : 'AM';
      return `${((hr % 12) || 12)}:${m} ${ampm}`;
    });
}

// ─────────────────────────────────────────────
// FETCH CURRENT WEATHER BY CITY NAME
// ─────────────────────────────────────────────
async function fetchWeatherByCity(city) {
  if (isLoading || !city.trim()) return;
  isLoading = true;
  lastCity   = city.trim();
  lastCoords = null;
  showLoader();

  try {
    const res  = await fetch(`${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
    if (!res.ok) {
      if (res.status === 404) throw new Error(`"${city}" not found. Check spelling and try again.`);
      if (res.status === 401) throw new Error('Invalid API key. Please add your OpenWeatherMap key in script.js.');
      throw new Error(`Server error (${res.status}). Please try again.`);
    }
    const data = await res.json();
    populateWeatherCard(data);
    addRecent(data.name);
    renderRecentSearches();
    await fetchForecastByCoords(data.coord.lat, data.coord.lon);
    showWeather();
  } catch (err) {
    showError(err.message);
  } finally {
    isLoading = false;
  }
}

// ─────────────────────────────────────────────
// FETCH CURRENT WEATHER BY COORDINATES (Geolocation)
// ─────────────────────────────────────────────
async function fetchWeatherByCoords(lat, lon) {
  if (isLoading) return;
  isLoading  = true;
  lastCoords = { lat, lon };
  lastCity   = '';
  showLoader();

  try {
    const res  = await fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
    if (!res.ok) {
      if (res.status === 401) throw new Error('Invalid API key. Please add your OpenWeatherMap key in script.js.');
      throw new Error(`Server error (${res.status}). Please try again.`);
    }
    const data = await res.json();
    populateWeatherCard(data);
    addRecent(data.name);
    renderRecentSearches();
    await fetchForecastByCoords(lat, lon);
    showWeather();
  } catch (err) {
    showError(err.message);
  } finally {
    isLoading = false;
  }
}

// ─────────────────────────────────────────────
// FETCH 5-DAY FORECAST
// ─────────────────────────────────────────────
async function fetchForecastByCoords(lat, lon) {
  const res  = await fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
  if (!res.ok) return; // Forecast is bonus; fail silently
  const data = await res.json();
  populateForecast(data);
}

// ─────────────────────────────────────────────
// POPULATE MAIN WEATHER CARD
// ─────────────────────────────────────────────
function populateWeatherCard(data) {
  const { name, sys, main, weather, wind, visibility, timezone } = data;
  const w = weather[0];

  cityNameEl.textContent    = name;
  countryNameEl.textContent = sys.country;
  temperatureEl.textContent = Math.round(main.temp);
  conditionEl.textContent   = w.description;
  feelsLikeEl.textContent   = `${Math.round(main.feels_like)}°C`;
  humidityEl.textContent    = `${main.humidity}%`;
  windSpeedEl.textContent   = `${(wind.speed * 3.6).toFixed(1)} km/h`;
  visibilityEl.textContent  = visibility ? `${(visibility / 1000).toFixed(1)} km` : 'N/A';
  sunriseEl.textContent     = formatTime(sys.sunrise, timezone);
  sunsetEl.textContent      = formatTime(sys.sunset, timezone);

  // Weather icon from OpenWeatherMap
  weatherIconEl.src = `https://openweathermap.org/img/wn/${w.icon}@4x.png`;
  weatherIconEl.alt = w.description;

  // Apply dynamic theme
  applyWeatherTheme(w.main);
}

// ─────────────────────────────────────────────
// POPULATE 5-DAY FORECAST
// ─────────────────────────────────────────────
function populateForecast(data) {
  // Group by day; pick the midday slot (or closest)
  const days = {};
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  data.list.forEach(item => {
    const d   = new Date(item.dt * 1000);
    const key = d.toDateString();
    if (!days[key]) {
      days[key] = { day: dayNames[d.getDay()], items: [] };
    }
    days[key].items.push(item);
  });

  // Take next 5 days (skip today)
  const today  = new Date().toDateString();
  const entries = Object.entries(days).filter(([k]) => k !== today).slice(0, 5);

  forecastGrid.innerHTML = '';

  entries.forEach(([_, dayData]) => {
    const items = dayData.items;
    // Pick midday reading or fallback to first
    const pick = items.find(i => new Date(i.dt * 1000).getHours() >= 12) || items[0];
    const high = Math.round(Math.max(...items.map(i => i.main.temp_max)));
    const low  = Math.round(Math.min(...items.map(i => i.main.temp_min)));

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <p class="forecast-day">${dayData.day}</p>
      <img class="forecast-icon" src="https://openweathermap.org/img/wn/${pick.weather[0].icon}@2x.png" alt="${pick.weather[0].description}" />
      <p class="forecast-temp-high">${high}°</p>
      <p class="forecast-temp-low">${low}°</p>
    `;
    forecastGrid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
// GEOLOCATION — Locate Me
// ─────────────────────────────────────────────
function handleLocate() {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
    () => showError('Location access denied. Please search manually.')
  );
}

// ─────────────────────────────────────────────
// REFRESH — re-fetch last query
// ─────────────────────────────────────────────
function handleRefresh() {
  refreshBtn.classList.add('spinning');
  setTimeout(() => refreshBtn.classList.remove('spinning'), 700);

  if (lastCoords) {
    fetchWeatherByCoords(lastCoords.lat, lastCoords.lon);
  } else if (lastCity) {
    fetchWeatherByCity(lastCity);
  }
}

// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────
searchBtn.addEventListener('click', () => fetchWeatherByCity(cityInput.value));
locateBtn.addEventListener('click', handleLocate);
refreshBtn.addEventListener('click', handleRefresh);

cityInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchWeatherByCity(cityInput.value);
});

// Auto-focus search input on page load
window.addEventListener('load', () => cityInput.focus());

// ─────────────────────────────────────────────
// PARTICLE SYSTEM — canvas-based ambient floaters
// ─────────────────────────────────────────────
const canvas  = document.getElementById('particleCanvas');
const ctx     = canvas.getContext('2d');
let particles = [];
let animFrame;

// Particle colour palette (defaults; updated per weather)
let particleColors = ['rgba(79,195,247,', 'rgba(179,136,255,', 'rgba(29,233,182,'];

function updateParticleColors(theme) {
  const palettes = {
    'weather-clear':        ['rgba(255,213,79,', 'rgba(255,183,77,', 'rgba(255,255,255,'],
    'weather-rain':         ['rgba(77,208,225,', 'rgba(21,101,192,', 'rgba(129,212,250,'],
    'weather-snow':         ['rgba(227,242,253,', 'rgba(144,202,249,', 'rgba(255,255,255,'],
    'weather-clouds':       ['rgba(176,190,197,', 'rgba(96,125,139,', 'rgba(144,164,174,'],
    'weather-thunderstorm': ['rgba(206,147,216,', 'rgba(149,117,205,', 'rgba(180,100,220,'],
    'weather-mist':         ['rgba(170,183,196,', 'rgba(84,110,122,', 'rgba(120,144,156,'],
    'weather-default':      ['rgba(79,195,247,',  'rgba(179,136,255,', 'rgba(29,233,182,'],
  };
  particleColors = palettes[theme] || palettes['weather-default'];
  // Re-color existing particles
  particles.forEach(p => {
    p.color = particleColors[Math.floor(Math.random() * particleColors.length)];
  });
}

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

class Particle {
  constructor() { this.reset(true); }

  reset(initial = false) {
    this.x     = Math.random() * canvas.width;
    this.y     = initial ? Math.random() * canvas.height : canvas.height + 10;
    this.size  = Math.random() * 2.2 + 0.4;
    this.speedY = Math.random() * 0.35 + 0.1;
    this.speedX = (Math.random() - 0.5) * 0.3;
    this.opacity = Math.random() * 0.5 + 0.15;
    this.fade  = Math.random() * 0.004 + 0.001;
    this.color = particleColors[Math.floor(Math.random() * particleColors.length)];
  }

  update() {
    this.y -= this.speedY;
    this.x += this.speedX;
    this.opacity -= this.fade;
    if (this.opacity <= 0 || this.y < -10) this.reset();
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `${this.color}${this.opacity.toFixed(2)})`;
    ctx.fill();
  }
}

function initParticles() {
  const count = Math.min(Math.floor(window.innerWidth * 0.06), 80);
  particles   = Array.from({ length: count }, () => new Particle());
}

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => { p.update(); p.draw(); });
  animFrame = requestAnimationFrame(animateParticles);
}

// Start particles
resizeCanvas();
initParticles();
animateParticles();

window.addEventListener('resize', () => {
  resizeCanvas();
  initParticles();
});
