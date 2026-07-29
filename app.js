/* ===================================================
   ClimaCompare — Application Logic & Heatmap Renderer
   =================================================== */

// ---------- Toast Notifications ----------
function showToast(msg, type = 'error') {
  const toast = document.createElement('div');
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: type === 'error' ? '#f97066' : '#5eead4', color: '#0b0f1a',
    padding: '10px 20px', borderRadius: '8px', fontFamily: 'Inter, sans-serif',
    fontSize: '0.85rem', fontStyle: 'normal', fontWeight: '600', zIndex: '9999',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ---------- State ----------
const state = {
  cities: [],          // { id, name, country, countryCode, lat, lon, admin1, historicalHighs, historicalLows, yearlyData, fullYearHourly, trendData, color, loading }
  unit: 'F',           // 'F' or 'C'
  viewMode: 'monthly', // 'monthly', 'hourly', or 'trend'
  trendMonth: 6,       // 0-11 (July = 6)
  selectedYears: ['avg'],
  nextColorIdx: 0,
  chart: null,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];
const TREND_YEARS = Array.from({ length: 2026 - 1950 + 1 }, (_, i) => 1950 + i);
const HOUR_LABELS = [
  '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM',
  '6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM',
  '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM',
  '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM'
];

const CITY_COLORS = [
  '#6ea8fe', '#f97066', '#5eead4', '#fbbf24',
  '#c084fc', '#fb923c', '#34d399', '#f472b6',
];

function flagEmoji(cc) {
  if (!cc) return '🌍';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// ---------- DOM Refs ----------
const $search = document.getElementById('city-search');
const $results = document.getElementById('search-results');
const $spinner = document.getElementById('search-spinner');
const $chips = document.getElementById('city-chips');
const $chipsEmpty = document.getElementById('chips-empty');
const $chartSection = document.getElementById('chart-section');
const $chartEmpty = document.getElementById('chart-empty');
const $chartLoading = document.getElementById('chart-loading');
const $loadingText = document.getElementById('loading-text');
const $canvas = document.getElementById('temp-chart');
const $legend = document.getElementById('chart-legend');
const $heatmapSection = document.getElementById('heatmap-section');
const $heatmapContainer = document.getElementById('heatmap-container');
const $heatmapLegendTicks = document.getElementById('heatmap-legend-ticks');
const $dataSection = document.getElementById('data-section');
const $dataSectionTitle = document.getElementById('data-section-title');
const $tableHead = document.getElementById('data-table-head');
const $tableBody = document.getElementById('data-table-body');
const $btnF = document.getElementById('btn-fahrenheit');
const $btnC = document.getElementById('btn-celsius');
const $btnShare = document.getElementById('btn-share');
const $btnMonthly = document.getElementById('btn-monthly');
const $btnHourly = document.getElementById('btn-hourly');
const $btnTrend = document.getElementById('btn-trend');
const $yearSelector = document.getElementById('year-selector');
const $yearPills = document.getElementById('year-pills');
const $trendMonthSelector = document.getElementById('trend-month-selector');
const $trendMonthPills = document.getElementById('trend-month-pills');

// ---------- URL Sharing & State Persistence ----------
function updateURLState() {
  const params = new URLSearchParams();
  if (state.cities.length) {
    const cityStrs = state.cities.map(c => 
      `${encodeURIComponent(c.name)}~${encodeURIComponent(c.country)}~${encodeURIComponent(c.admin1)}~${c.lat.toFixed(4)}~${c.lon.toFixed(4)}~${encodeURIComponent(c.countryCode || '')}`
    );
    params.set('cities', cityStrs.join(';'));
  }
  if (state.unit !== 'F') params.set('unit', state.unit);
  if (state.viewMode !== 'monthly') params.set('mode', state.viewMode);
  if (state.selectedYears.join(',') !== 'avg') params.set('years', state.selectedYears.join(','));
  if (state.trendMonth !== 6) params.set('tmonth', state.trendMonth);

  const query = params.toString();
  const newURL = window.location.pathname + (query ? `?${query}` : '');
  window.history.replaceState(null, '', newURL);
}

$btnShare.addEventListener('click', async () => {
  updateURLState();
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast('Shareable link copied to clipboard!', 'success');
  } catch (err) {
    const dummy = document.createElement('input');
    document.body.appendChild(dummy);
    dummy.value = window.location.href;
    dummy.select();
    document.execCommand('copy');
    document.body.removeChild(dummy);
    showToast('Shareable link copied to clipboard!', 'success');
  }
});

async function loadStateFromURL() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('unit')) state.unit = params.get('unit');
  if (params.has('mode')) state.viewMode = params.get('mode');
  if (params.has('years')) state.selectedYears = params.get('years').split(',');
  if (params.has('tmonth')) state.trendMonth = parseInt(params.get('tmonth'), 10);

  setUnit(state.unit);
  setViewMode(state.viewMode);
  initPills();

  if (params.has('cities')) {
    const rawCities = params.get('cities').split(';');
    for (const raw of rawCities) {
      const parts = raw.split('~');
      if (parts.length >= 5) {
        const result = {
          name: decodeURIComponent(parts[0]),
          country: decodeURIComponent(parts[1]),
          admin1: decodeURIComponent(parts[2]),
          latitude: parseFloat(parts[3]),
          longitude: parseFloat(parts[4]),
          country_code: parts[5] ? decodeURIComponent(parts[5]) : '',
        };
        await selectCity(result);
      }
    }
  }
}

// ---------- Init Controls ----------
function initPills() {
  let yearHtml = `<button class="pill-btn pill-btn--avg ${state.selectedYears.includes('avg') ? 'pill-btn--active' : ''}" data-year="avg">30Y Avg (1995-2024)</button>`;
  YEARS.forEach(y => {
    yearHtml += `<button class="pill-btn ${state.selectedYears.includes(y) ? 'pill-btn--active' : ''}" data-year="${y}">${y}</button>`;
  });
  $yearPills.innerHTML = yearHtml;

  $yearPills.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const y = btn.dataset.year;
      if (state.selectedYears.includes(y)) {
        if (state.selectedYears.length > 1) {
          state.selectedYears = state.selectedYears.filter(item => item !== y);
        }
      } else {
        state.selectedYears.push(y);
      }
      initPills();
      updateURLState();
      renderChart();
      renderTable();
    });
  });

  // Trend month pills
  let monthHtml = '';
  MONTHS.forEach((m, idx) => {
    monthHtml += `<button class="pill-btn ${state.trendMonth === idx ? 'pill-btn--active' : ''}" data-month="${idx}">${m}</button>`;
  });
  $trendMonthPills.innerHTML = monthHtml;

  $trendMonthPills.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.trendMonth = parseInt(btn.dataset.month, 10);
      initPills();
      updateURLState();
      await loadMissingTrendData();
      renderChart();
      renderTable();
    });
  });
}

// Mode toggle
$btnMonthly.addEventListener('click', () => setViewMode('monthly'));
$btnHourly.addEventListener('click', () => setViewMode('hourly'));
$btnTrend.addEventListener('click', () => setViewMode('trend'));

async function setViewMode(mode) {
  state.viewMode = mode;
  $btnMonthly.classList.toggle('view-mode__btn--active', mode === 'monthly');
  $btnHourly.classList.toggle('view-mode__btn--active', mode === 'hourly');
  $btnTrend.classList.toggle('view-mode__btn--active', mode === 'trend');

  $yearSelector.style.display = mode === 'monthly' ? 'flex' : 'none';
  $trendMonthSelector.style.display = mode === 'trend' ? 'flex' : 'none';

  $chartSection.style.display = (mode === 'monthly' || mode === 'trend') ? 'block' : 'none';
  $heatmapSection.style.display = mode === 'hourly' ? 'flex' : 'none';

  if (mode === 'hourly') {
    await loadMissingFullYearHourlyData();
    renderHeatmaps();
  } else if (mode === 'trend') {
    await loadMissingTrendData();
    renderChart();
  } else {
    renderChart();
  }
  renderTable();
  updateURLState();
}

// ---------- Geocoding & Search ----------
let searchTimer = null;
let focusedIdx = -1;
let currentResults = [];

$search.addEventListener('input', () => {
  const q = $search.value.trim();
  if (q.length < 2) {
    hideResults();
    return;
  }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchCities(q), 300);
});

$search.addEventListener('keydown', (e) => {
  if (!currentResults.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    focusedIdx = Math.min(focusedIdx + 1, currentResults.length - 1);
    highlightResult();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    focusedIdx = Math.max(focusedIdx - 1, 0);
    highlightResult();
  } else if (e.key === 'Enter' && focusedIdx >= 0) {
    e.preventDefault();
    selectCity(currentResults[focusedIdx]);
  } else if (e.key === 'Escape') {
    hideResults();
    $search.blur();
  }
});

$results.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const resultEl = e.target.closest('.search-result');
  if (resultEl) {
    selectCity(currentResults[+resultEl.dataset.idx]);
  }
});

$results.addEventListener('mouseover', (e) => {
  const resultEl = e.target.closest('.search-result');
  if (resultEl) {
    focusedIdx = +resultEl.dataset.idx;
    highlightResult();
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) hideResults();
});

async function searchCities(query) {
  $spinner.classList.add('search-box__spinner--visible');
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`
    );
    const data = await res.json();
    currentResults = (data.results || []).filter(r => r.latitude && r.longitude);
    focusedIdx = -1;
    renderResults();
  } catch (err) {
    console.error('Geocoding error:', err);
    showToast('Failed to search cities. Check network connection.');
    currentResults = [];
    renderResults();
  } finally {
    $spinner.classList.remove('search-box__spinner--visible');
  }
}

function renderResults() {
  if (!currentResults.length) {
    $results.innerHTML = `<div class="search-results__empty">No cities found</div>`;
    $results.classList.add('search-results--visible');
    return;
  }

  $results.innerHTML = currentResults.map((r, i) => {
    const admin = r.admin1 ? `${r.admin1}, ` : '';
    return `
      <div class="search-result" data-idx="${i}">
        <span class="search-result__flag">${flagEmoji(r.country_code)}</span>
        <div>
          <div class="search-result__name">${esc(r.name)}</div>
          <div class="search-result__detail">${esc(admin)}${esc(r.country || '')}</div>
        </div>
      </div>
    `;
  }).join('');

  $results.classList.add('search-results--visible');
}

function highlightResult() {
  $results.querySelectorAll('.search-result').forEach((el, i) => {
    el.classList.toggle('search-result--focused', i === focusedIdx);
  });
}

function hideResults() {
  $results.classList.remove('search-results--visible');
  currentResults = [];
  focusedIdx = -1;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------- City Selection & Fetching ----------
async function selectCity(result) {
  hideResults();
  $search.value = '';

  const key = `${result.latitude.toFixed(2)}_${result.longitude.toFixed(2)}`;
  if (state.cities.some(c => c.id === key)) return;

  const color = CITY_COLORS[state.nextColorIdx % CITY_COLORS.length];
  state.nextColorIdx++;

  const city = {
    id: key,
    name: result.name,
    country: result.country || '',
    countryCode: result.country_code || '',
    admin1: result.admin1 || '',
    lat: result.latitude,
    lon: result.longitude,
    historicalHighs: null,
    historicalLows: null,
    yearlyData: {},
    fullYearHourly: null, // [12][24] matrix
    color,
    loading: true,
  };

  state.cities.push(city);
  renderChips();
  updateEmptyStates();

  try {
    const data = await fetchClimateData(city.lat, city.lon);
    city.historicalHighs = data.historicalHighs;
    city.historicalLows = data.historicalLows;
    city.yearlyData = data.yearlyData;
    city.loading = false;

    if (state.viewMode === 'hourly') {
      await fetchFullYearHourlyData(city);
      renderHeatmaps();
    } else {
      renderChart();
    }

    renderChips();
    renderTable();
    updateURLState();
  } catch (err) {
    console.error('Climate data error:', err);
    showToast(`Failed to load data for ${city.name}: ${err.message}`);
    state.cities = state.cities.filter(c => c.id !== city.id);
    renderChips();
    if (state.viewMode === 'hourly') renderHeatmaps(); else renderChart();
    renderTable();
    updateEmptyStates();
  }
}

// Fetch 1995-2026 daily data (30-year WMO baseline 1995-2024)
async function fetchClimateData(lat, lon) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=1995-01-01&end_date=${todayStr}&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const times = data.daily.time;
  const maxTemps = data.daily.temperature_2m_max;
  const minTemps = data.daily.temperature_2m_min;

  // Monthly 30-year historical sums (1995-2024)
  const monthSumsHigh = new Float64Array(12);
  const monthSumsLow = new Float64Array(12);
  const monthCounts = new Uint32Array(12);

  const yearlySums = {};
  YEARS.forEach(y => {
    yearlySums[y] = {
      highSums: new Float64Array(12),
      lowSums: new Float64Array(12),
      counts: new Uint32Array(12),
    };
  });

  for (let i = 0; i < times.length; i++) {
    if (maxTemps[i] == null || minTemps[i] == null) continue;
    const yearStr = times[i].substring(0, 4);
    const month = parseInt(times[i].substring(5, 7), 10) - 1;

    // 30-year historical baseline (1995-2024)
    if (parseInt(yearStr, 10) <= 2024) {
      monthSumsHigh[month] += maxTemps[i];
      monthSumsLow[month] += minTemps[i];
      monthCounts[month]++;
    }

    if (yearlySums[yearStr]) {
      yearlySums[yearStr].highSums[month] += maxTemps[i];
      yearlySums[yearStr].lowSums[month] += minTemps[i];
      yearlySums[yearStr].counts[month]++;
    }
  }

  const historicalHighs = [];
  const historicalLows = [];
  for (let m = 0; m < 12; m++) {
    historicalHighs.push(monthCounts[m] ? monthSumsHigh[m] / monthCounts[m] : null);
    historicalLows.push(monthCounts[m] ? monthSumsLow[m] / monthCounts[m] : null);
  }

  const yearlyData = {};
  YEARS.forEach(y => {
    const ys = yearlySums[y];
    const highs = [];
    const lows = [];
    for (let m = 0; m < 12; m++) {
      highs.push(ys.counts[m] ? ys.highSums[m] / ys.counts[m] : null);
      lows.push(ys.counts[m] ? ys.lowSums[m] / ys.counts[m] : null);
    }
    yearlyData[y] = { highs, lows };
  });

  return { historicalHighs, historicalLows, yearlyData };
}

// Fetch 1950-2026 data for specific month warming trend
async function fetchTrendData(city, monthIdx) {
  if (!city.trendData) city.trendData = {};
  if (city.trendData[monthIdx]) return;

  const monthNum = String(monthIdx + 1).padStart(2, '0');
  // Fetch for all years 1950..2026
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}&start_date=1950-01-01&end_date=2026-07-29&daily=temperature_2m_max&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const times = data.daily.time;
  const temps = data.daily.temperature_2m_max;

  const yearSums = {};
  const yearCounts = {};

  for (let i = 0; i < times.length; i++) {
    if (temps[i] == null) continue;
    const m = parseInt(times[i].substring(5, 7), 10) - 1;
    if (m !== monthIdx) continue;

    const y = times[i].substring(0, 4);
    if (!yearSums[y]) {
      yearSums[y] = 0;
      yearCounts[y] = 0;
    }
    yearSums[y] += temps[i];
    yearCounts[y]++;
  }

  const yearlyAvgs = TREND_YEARS.map(y => {
    const yStr = String(y);
    return (yearCounts[yStr] && yearCounts[yStr] >= 5) ? yearSums[yStr] / yearCounts[yStr] : null;
  });

  // Calculate 10-year rolling average
  const rollingAvg = yearlyAvgs.map((val, idx) => {
    let sum = 0;
    let cnt = 0;
    for (let k = Math.max(0, idx - 4); k <= Math.min(yearlyAvgs.length - 1, idx + 5); k++) {
      if (yearlyAvgs[k] != null) {
        sum += yearlyAvgs[k];
        cnt++;
      }
    }
    return cnt ? sum / cnt : null;
  });

  city.trendData[monthIdx] = {
    yearlyAvgs,
    rollingAvg,
  };
}

async function loadMissingTrendData() {
  const loadedCities = state.cities.filter(c => !c.loading);
  if (!loadedCities.length) return;

  const missing = loadedCities.filter(c => !c.trendData || !c.trendData[state.trendMonth]);
  if (!missing.length) return;

  $chartLoading.style.display = 'flex';
  $loadingText.textContent = `Loading ${MONTHS[state.trendMonth]} historical temperature trends (1950–2026)...`;
  try {
    await Promise.all(missing.map(c => fetchTrendData(c, state.trendMonth)));
  } catch (err) {
    console.error('Trend fetch error:', err);
    showToast('Failed to load multi-decadal climate trend data');
  } finally {
    $chartLoading.style.display = 'none';
  }
}

// Fetch 8760 hourly temperatures for full year (2024) to generate 12x24 heatmap matrix
async function fetchFullYearHourlyData(city) {
  if (city.fullYearHourly) return;

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}&start_date=2024-01-01&end_date=2024-12-31&hourly=temperature_2m&timezone=auto`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    const fallbackUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}&start_date=2024-01-01&end_date=2024-12-31&hourly=temperature_2m`;
    res = await fetch(fallbackUrl);
  }
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = await res.json();

  if (!data.hourly || !data.hourly.time || !data.hourly.temperature_2m) {
    throw new Error('Invalid response structure');
  }

  const times = data.hourly.time;
  const temps = data.hourly.temperature_2m;

  // 12 months x 24 hours sums & counts
  const sums = Array.from({ length: 12 }, () => new Float64Array(24));
  const counts = Array.from({ length: 12 }, () => new Uint32Array(24));

  for (let i = 0; i < times.length; i++) {
    if (temps[i] == null) continue;
    const month = parseInt(times[i].substring(5, 7), 10) - 1;
    const hour = parseInt(times[i].substring(11, 13), 10);
    if (month >= 0 && month < 12 && hour >= 0 && hour < 24) {
      sums[month][hour] += temps[i];
      counts[month][hour]++;
    }
  }

  const matrix = Array.from({ length: 12 }, (_, m) => {
    const row = new Float64Array(24);
    for (let h = 0; h < 24; h++) {
      row[h] = counts[m][h] ? sums[m][h] / counts[m][h] : null;
    }
    return row;
  });

  city.fullYearHourly = matrix;
}

async function loadMissingFullYearHourlyData() {
  const loadedCities = state.cities.filter(c => !c.loading);
  if (!loadedCities.length) {
    $heatmapContainer.innerHTML = '';
    return;
  }

  const missing = loadedCities.filter(c => !c.fullYearHourly);
  if (!missing.length) {
    renderHeatmaps();
    return;
  }

  // Show a clear loading indicator in heatmap container
  $heatmapContainer.innerHTML = `
    <div class="heatmap-card" style="align-items:center; justify-content:center; min-height: 280px; text-align:center; padding: 48px 24px;">
      <div class="chart-loading__spinner" style="width:36px; height:36px; border-width:3px;"></div>
      <p style="color:var(--text-primary); font-weight:600; font-size:0.95rem; margin-top:16px;">
        Loading 8,760 hourly data points...
      </p>
      <p style="color:var(--text-muted); font-size:0.8rem; margin-top:4px;">
        Generating 12-month x 24-hour temperature heatmap for ${missing.map(c => c.name).join(', ')}
      </p>
    </div>
  `;

  try {
    await Promise.all(missing.map(c => fetchFullYearHourlyData(c)));
    renderHeatmaps();
  } catch (err) {
    console.error('Hourly heatmap fetch error:', err);
    showToast(`Failed to load hourly weather data: ${err.message}`);
  }
}

// ---------- Heatmap Canvas Rendering & Color Scale ----------
function tempToColor(celsius) {
  if (celsius == null) return '#101424';
  const f = (celsius * 9) / 5 + 32;

  // Stops (°F): 20° (Purple) -> 40° (Blue) -> 55° (Teal) -> 70° (Green/Yellow) -> 85° (Orange) -> 100° (Red)
  if (f <= 20) return '#3b0764';
  if (f <= 40) return interpolateColor('#3b0764', '#1e40af', (f - 20) / 20);
  if (f <= 55) return interpolateColor('#1e40af', '#0d9488', (f - 40) / 15);
  if (f <= 70) return interpolateColor('#0d9488', '#ca8a04', (f - 55) / 15);
  if (f <= 85) return interpolateColor('#ca8a04', '#ea580c', (f - 70) / 15);
  if (f <= 100) return interpolateColor('#ea580c', '#dc2626', (f - 85) / 15);
  return '#9f1239';
}

function interpolateColor(color1, color2, factor) {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  const r = Math.round(c1.r + factor * (c2.r - c1.r));
  const g = Math.round(c1.g + factor * (c2.g - c1.g));
  const b = Math.round(c1.b + factor * (c2.b - c1.b));
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
  const num = parseInt(hex.replace('#', ''), 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function renderHeatmaps() {
  if (!state.cities.length) {
    $heatmapContainer.innerHTML = '';
    return;
  }

  // Update Legend Ticks
  const ticks = state.unit === 'F' 
    ? ['<20°F', '35°F', '50°F', '65°F', '80°F', '95°F', '>100°F']
    : ['<-7°C', '2°C', '10°C', '18°C', '27°C', '35°C', '>38°C'];
  $heatmapLegendTicks.innerHTML = ticks.map(t => `<span>${t}</span>`).join('');

  $heatmapContainer.innerHTML = state.cities.map((city, idx) => {
    if (city.loading || !city.fullYearHourly) {
      return `
        <div class="heatmap-card" style="align-items:center; justify-content:center; min-height: 280px; text-align:center; padding: 48px 24px;">
          <div class="chart-loading__spinner" style="width:36px; height:36px; border-width:3px;"></div>
          <p style="color:var(--text-primary); font-weight:600; font-size:0.95rem; margin-top:16px;">
            Loading 8,760 hourly data points...
          </p>
          <p style="color:var(--text-muted); font-size:0.8rem; margin-top:4px;">
            Generating temperature heatmap for ${esc(city.name)}
          </p>
        </div>
      `;
    }

    return `
      <div class="heatmap-card">
        <div class="heatmap-card__header">
          <div class="heatmap-card__title">
            <span class="heatmap-card__dot" style="background:${city.color}"></span>
            ${flagEmoji(city.countryCode)} ${esc(city.name)}, ${esc(city.admin1 || city.country)}
          </div>
          <div class="heatmap-card__subtitle">Hourly Temperature Heatmap (Month vs. Hour of Day)</div>
        </div>
        <div class="heatmap-grid-wrap" id="heatmap-wrap-${idx}">
          <canvas class="heatmap-canvas" id="heatmap-canvas-${idx}"></canvas>
          <div class="heatmap-tooltip" id="heatmap-tooltip-${idx}"></div>
        </div>
      </div>
    `;
  }).join('');

  // Draw each loaded heatmap on its canvas
  state.cities.forEach((city, idx) => {
    if (!city.loading && city.fullYearHourly) {
      drawHeatmapCanvas(city, idx);
    }
  });
}

function drawHeatmapCanvas(city, idx) {
  const canvas = document.getElementById(`heatmap-canvas-${idx}`);
  const tooltip = document.getElementById(`heatmap-tooltip-${idx}`);
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 320;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const paddingLeft = 55;
  const paddingBottom = 30;
  const paddingTop = 10;
  const paddingRight = 15;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const cellWidth = plotWidth / 12;
  const cellHeight = plotHeight / 24;

  ctx.clearRect(0, 0, width, height);

  // Draw Cells (12 Months x 24 Hours)
  for (let m = 0; m < 12; m++) {
    for (let h = 0; h < 24; h++) {
      const tempC = city.fullYearHourly[m][h];
      ctx.fillStyle = tempToColor(tempC);

      const x = paddingLeft + m * cellWidth;
      const y = paddingTop + h * cellHeight;
      ctx.fillRect(x, y, cellWidth - 0.5, cellHeight - 0.5);
    }
  }

  // Draw X Axis (Month Labels)
  ctx.fillStyle = '#8b95a8';
  ctx.font = '500 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  MONTHS.forEach((month, m) => {
    const x = paddingLeft + (m + 0.5) * cellWidth;
    ctx.fillText(month, x, height - paddingBottom + 8);
  });

  // Draw Y Axis (Hour Labels every 3 hours)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let h = 0; h < 24; h += 3) {
    const y = paddingTop + (h + 0.5) * cellHeight;
    ctx.fillText(HOUR_LABELS[h], paddingLeft - 8, y);
  }

  // Hover Interaction
  canvas.addEventListener('mousemove', (e) => {
    const cRect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - cRect.left;
    const mouseY = e.clientY - cRect.top;

    if (
      mouseX >= paddingLeft &&
      mouseX <= width - paddingRight &&
      mouseY >= paddingTop &&
      mouseY <= height - paddingBottom
    ) {
      const m = Math.floor((mouseX - paddingLeft) / cellWidth);
      const h = Math.floor((mouseY - paddingTop) / cellHeight);

      if (m >= 0 && m < 12 && h >= 0 && h < 24) {
        const tempC = city.fullYearHourly[m][h];
        const formatted = formatTemp(tempC);
        const monthName = MONTHS[m];
        const hourLabel = HOUR_LABELS[h];

        tooltip.innerHTML = `<strong>${monthName}</strong> at <strong>${hourLabel}</strong>: <span class="heatmap-tooltip__val">${formatted}</span>`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${mouseX}px`;
        tooltip.style.top = `${mouseY}px`;
        return;
      }
    }
    tooltip.style.display = 'none';
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
}

// ---------- Temperature Conversion ----------
function toDisplay(celsius) {
  if (celsius == null) return null;
  return state.unit === 'F' ? (celsius * 9) / 5 + 32 : celsius;
}

function formatTemp(celsius) {
  const v = toDisplay(celsius);
  if (v == null) return '—';
  return `${Math.round(v)}°`;
}

// ---------- Unit Toggle ----------
$btnF.addEventListener('click', () => setUnit('F'));
$btnC.addEventListener('click', () => setUnit('C'));

function setUnit(u) {
  state.unit = u;
  $btnF.classList.toggle('unit-toggle__btn--active', u === 'F');
  $btnC.classList.toggle('unit-toggle__btn--active', u === 'C');
  updateURLState();
  if (state.cities.length) {
    if (state.viewMode === 'hourly') renderHeatmaps(); else renderChart();
    renderTable();
  }
}

// ---------- City Chips ----------
function renderChips() {
  const chips = state.cities.map(city => {
    const flag = flagEmoji(city.countryCode);
    const label = city.admin1
      ? `${city.name}, ${city.admin1}`
      : `${city.name}, ${city.country}`;
    return `
      <span class="city-chip" style="
        background: ${city.color}18;
        border-color: ${city.color}40;
        color: ${city.color};
      ">
        <span style="font-size:1rem; line-height:1;">${flag}</span> ${esc(label)}
        ${city.loading
          ? '<span class="city-chip__loading"></span>'
          : `<button class="city-chip__remove" data-id="${city.id}" title="Remove">✕</button>`
        }
      </span>
    `;
  });

  const emptyHTML = state.cities.length ? '' : `<span class="city-chips__empty" id="chips-empty">Add cities to compare their climates</span>`;
  $chips.innerHTML = emptyHTML + chips.join('');

  $chips.querySelectorAll('.city-chip__remove').forEach(btn => {
    btn.addEventListener('click', () => removeCity(btn.dataset.id));
  });
}

function removeCity(id) {
  state.cities = state.cities.filter(c => c.id !== id);
  renderChips();
  if (state.viewMode === 'hourly') renderHeatmaps(); else renderChart();
  renderTable();
  updateEmptyStates();
  updateURLState();
}

function updateEmptyStates() {
  const hasCities = state.cities.length > 0;
  $chartEmpty.classList.toggle('chart-empty--hidden', hasCities);
  if (state.viewMode === 'monthly') {
    $canvas.style.display = hasCities ? 'block' : 'none';
  }
  $dataSection.style.display = hasCities ? 'block' : 'none';
}

// ---------- Line Chart ----------
function destroyChart() {
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
  const existing = Chart.getChart($canvas);
  if (existing) {
    existing.destroy();
  }
}

function renderChart() {
  const loaded = state.cities.filter(c => !c.loading);
  if (!loaded.length) {
    destroyChart();
    $legend.innerHTML = '';
    updateEmptyStates();
    return;
  }

  updateEmptyStates();

  const datasets = [];

  if (state.viewMode === 'monthly') {
    loaded.forEach(city => {
      if (state.selectedYears.includes('avg')) {
        datasets.push({
          label: `${city.name} (Hist. Avg High)`,
          data: city.historicalHighs.map(v => toDisplay(v)),
          borderColor: city.color + '88',
          backgroundColor: 'transparent',
          fill: false,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: city.color + '88',
          pointBorderColor: 'transparent',
          tension: 0.35,
          cityId: city.id,
          dataType: 'high',
        });
        datasets.push({
          label: `${city.name} (Hist. Avg Low)`,
          data: city.historicalLows.map(v => toDisplay(v)),
          borderColor: city.color + '99',
          backgroundColor: 'transparent',
          fill: false,
          borderWidth: 2.5,
          borderDash: [4, 4],
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: city.color + '99',
          pointBorderColor: 'transparent',
          tension: 0.35,
          cityId: city.id,
          dataType: 'low',
        });
      }

      YEARS.forEach(y => {
        if (state.selectedYears.includes(y)) {
          const ydata = city.yearlyData[y];
          if (ydata) {
            const is2026 = y === '2026';
            datasets.push({
              label: `${city.name} (${y} ${is2026 ? 'Actual' : ''} High)`,
              data: ydata.highs.map(v => toDisplay(v)),
              borderColor: city.color,
              backgroundColor: is2026 ? city.color + '22' : 'transparent',
              fill: false,
              borderWidth: is2026 ? 3.5 : 2,
              pointRadius: is2026 ? 5 : 3,
              pointStyle: is2026 ? 'circle' : 'rectRot',
              pointHoverRadius: 7,
              pointBackgroundColor: is2026 ? '#ffffff' : city.color,
              pointBorderColor: city.color,
              pointBorderWidth: is2026 ? 2 : 1,
              tension: 0.35,
              cityId: city.id,
              dataType: 'year-high',
            });
          }
        }
      });
    });
  } else if (state.viewMode === 'trend') {
    const monthName = MONTHS[state.trendMonth];
    loaded.forEach(city => {
      const tData = city.trendData ? city.trendData[state.trendMonth] : null;
      if (tData) {
        // Subtle background dots for raw yearly variation
        datasets.push({
          label: `${city.name} (${monthName} Annual High)`,
          data: tData.yearlyAvgs.map(v => toDisplay(v)),
          borderColor: city.color + '33', // Faint line
          backgroundColor: 'transparent',
          fill: false,
          borderWidth: 1,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: city.color + '55',
          pointBorderColor: 'transparent',
          tension: 0.1,
          cityId: city.id,
          dataType: 'trend-raw',
        });

        // Hero 10-year smooth rolling trendline
        datasets.push({
          label: `${city.name} (10-Yr Smooth Trend)`,
          data: tData.rollingAvg.map(v => toDisplay(v)),
          borderColor: city.color,
          backgroundColor: city.color + '15',
          fill: false,
          borderWidth: 4, // Bold hero trendline
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: city.color,
          tension: 0.4,
          cityId: city.id,
          dataType: 'trend-smooth',
        });
      }
    });
  }

  const labels = state.viewMode === 'trend' ? TREND_YEARS : MONTHS;

  // Calculate comfortable Y-axis bounds for trend mode
  let yAxisConfig = {
    grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
    ticks: {
      color: '#5a6478',
      font: { family: 'Inter', size: 11 },
      padding: 8,
      callback(v) { return `${v}°`; },
    },
    border: { display: false },
  };

  if (state.viewMode === 'trend') {
    let allVals = [];
    datasets.forEach(d => {
      d.data.forEach(v => { if (v != null) allVals.push(v); });
    });
    if (allVals.length) {
      const minV = Math.min(...allVals);
      const maxV = Math.max(...allVals);
      const pad = state.unit === 'F' ? 5 : 3;
      yAxisConfig.suggestedMin = Math.floor(minV - pad);
      yAxisConfig.suggestedMax = Math.ceil(maxV + pad);
    }
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(16, 20, 36, 0.92)',
        titleColor: '#e8ecf4',
        bodyColor: '#8b95a8',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        cornerRadius: 10,
        padding: 12,
        titleFont: { family: 'Inter', weight: '600', size: 13 },
        bodyFont: { family: 'Inter', size: 12 },
        displayColors: true,
        boxWidth: 10,
        boxHeight: 10,
        boxPadding: 4,
        itemSort(a, b) {
          const typeA = a.dataset.dataType;
          const typeB = b.dataset.dataType;
          const isRawA = typeA === 'trend-raw';
          const isRawB = typeB === 'trend-raw';

          if (isRawA !== isRawB) {
            return isRawA ? 1 : -1;
          }
          return (b.raw ?? 0) - (a.raw ?? 0);
        },
        callbacks: {
          label(ctx) {
            const v = ctx.raw;
            if (v == null) return '';
            const unit = state.unit === 'F' ? '°F' : '°C';
            return ` ${ctx.dataset.label}: ${v.toFixed(1)}${unit}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
        ticks: {
          color: '#5a6478',
          font: { family: 'Inter', size: 12, weight: '500' },
          padding: 8,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: state.viewMode === 'trend' ? 12 : 12,
        },
        border: { display: false },
      },
      y: yAxisConfig,
    },
    layout: {
      padding: { top: 8, bottom: 4, left: 4, right: 12 },
    },
  };

  destroyChart();
  $canvas.style.display = 'block';
  $canvas.parentElement.style.minHeight = '380px';
  state.chart = new Chart($canvas, {
    type: 'line',
    data: { labels: labels, datasets },
    options,
  });

  renderLegend(loaded);
}

function renderLegend(loaded) {
  if (state.viewMode === 'monthly') {
    $legend.innerHTML = loaded.map(city => {
      let items = [];
      if (state.selectedYears.includes('avg')) {
        items.push(`
          <div class="chart-legend__item">
            <span class="chart-legend__swatch chart-legend__swatch--dashed" style="color:${city.color}AA;"></span>
            <span><span class="chart-legend__label">${esc(city.name)}</span> <span class="chart-legend__sublabel">Hist. Avg High</span></span>
          </div>
          <div class="chart-legend__item">
            <span class="chart-legend__swatch chart-legend__swatch--dashed" style="color:${city.color}99;"></span>
            <span><span class="chart-legend__label">${esc(city.name)}</span> <span class="chart-legend__sublabel">Hist. Avg Low</span></span>
          </div>
        `);
      }
      YEARS.forEach(y => {
        if (state.selectedYears.includes(y)) {
          const is2026 = y === '2026';
          items.push(`
            <div class="chart-legend__item">
              <span class="chart-legend__swatch" style="background:${city.color}; height:${is2026 ? '4px' : '2px'}; box-shadow:${is2026 ? '0 0 8px ' + city.color : 'none'};"></span>
              <span>
                <span class="chart-legend__label" style="${is2026 ? 'font-weight:700; color:' + city.color : ''}">${esc(city.name)}</span>
                <span class="chart-legend__sublabel" style="${is2026 ? 'font-weight:700;' : ''}">${y} ${is2026 ? 'Actual' : ''} High</span>
              </span>
            </div>
          `);
        }
      });
      return items.join('');
    }).join('');
  } else if (state.viewMode === 'trend') {
    const monthName = MONTHS[state.trendMonth];
    $legend.innerHTML = loaded.map(city => `
      <div class="chart-legend__item">
        <span class="chart-legend__swatch" style="background:${city.color}55; height:2px;"></span>
        <span><span class="chart-legend__label">${esc(city.name)}</span> <span class="chart-legend__sublabel">${monthName} Annual Avg</span></span>
      </div>
      <div class="chart-legend__item">
        <span class="chart-legend__swatch" style="background:${city.color}; height:4px; box-shadow:0 0 8px ${city.color}"></span>
        <span><span class="chart-legend__label" style="font-weight:700; color:${city.color}">${esc(city.name)}</span> <span class="chart-legend__sublabel" style="font-weight:700;">10-Yr Smooth Trend</span></span>
      </div>
    `).join('');
  } else {
    // Hourly mode legend
    const monthName = MONTHS[state.selectedMonth || 0];
    $legend.innerHTML = loaded.map(city => `
      <div class="chart-legend__item">
        <span class="chart-legend__swatch" style="background:${city.color};"></span>
        <span>
          <span class="chart-legend__label">${esc(city.name)}</span>
          <span class="chart-legend__sublabel">${monthName} Hourly Avg</span>
        </span>
      </div>
    `).join('');
  }
}

// ---------- Data Table ----------
function renderTable() {
  const loaded = state.cities.filter(c => !c.loading);
  if (!loaded.length) {
    $dataSection.style.display = 'none';
    return;
  }

  $dataSection.style.display = 'block';

  if (state.viewMode === 'monthly') {
    $dataSectionTitle.innerHTML = 'Monthly Temperature Averages <span style="font-weight:400; font-size:0.85rem; color:var(--text-muted); margin-left:8px;">(30-Year Normal: 1995–2024 &middot; Yearly Actuals: 2019–2026)</span>';
    $tableHead.innerHTML = `
      <tr>
        <th>City / Year</th>
        ${MONTHS.map(m => `<th>${m}</th>`).join('')}
      </tr>
    `;

    $tableBody.innerHTML = loaded.map(city => {
      let rows = '';
      if (state.selectedYears.includes('avg')) {
        rows += `
          <tr>
            <td style="color:${city.color};">${esc(city.name)} <span style="color:var(--text-muted);font-size:0.75rem;">Hist. High</span></td>
            ${city.historicalHighs.map(v => `<td>${formatTemp(v)}</td>`).join('')}
          </tr>
          <tr>
            <td style="color:${city.color}AA;">${esc(city.name)} <span style="color:var(--text-muted);font-size:0.75rem;">Hist. Low</span></td>
            ${city.historicalLows.map(v => `<td>${formatTemp(v)}</td>`).join('')}
          </tr>
        `;
      }
      YEARS.forEach(y => {
        if (state.selectedYears.includes(y) && city.yearlyData[y]) {
          rows += `
            <tr>
              <td style="color:${city.color};">${esc(city.name)} <span style="color:var(--text-muted);font-size:0.75rem;">${y} High</span></td>
              ${city.yearlyData[y].highs.map(v => `<td>${formatTemp(v)}</td>`).join('')}
            </tr>
          `;
        }
      });
      return rows;
    }).join('');
  } else if (state.viewMode === 'trend') {
    const monthName = MONTHS[state.trendMonth];
    $dataSectionTitle.innerHTML = `${monthName} Historical Warming Trend (1950–2026) <span style="font-weight:400; font-size:0.85rem; color:var(--text-muted); margin-left:8px;">(Decadal Averages)</span>`;
    $tableHead.innerHTML = `
      <tr>
        <th>City</th>
        <th>1950s Avg</th>
        <th>1970s Avg</th>
        <th>1990s Avg</th>
        <th>2010s Avg</th>
        <th>2020s Avg</th>
        <th>Total Change (Δ 1950-2026)</th>
      </tr>
    `;

    $tableBody.innerHTML = loaded.map(city => {
      const tData = city.trendData ? city.trendData[state.trendMonth] : null;
      if (!tData) return '';
      
      const getDecadeAvg = (startYear, endYear) => {
        let sum = 0, cnt = 0;
        TREND_YEARS.forEach((y, i) => {
          if (y >= startYear && y <= endYear && tData.yearlyAvgs[i] != null) {
            sum += tData.yearlyAvgs[i]; cnt++;
          }
        });
        return cnt ? sum / cnt : null;
      };

      const avg50s = getDecadeAvg(1950, 1959);
      const avg70s = getDecadeAvg(1970, 1979);
      const avg90s = getDecadeAvg(1990, 1999);
      const avg10s = getDecadeAvg(2010, 2019);
      const avg20s = getDecadeAvg(2020, 2026);

      const delta = (avg20s != null && avg50s != null) ? (avg20s - avg50s) : null;
      const deltaDisp = delta != null 
        ? `${delta > 0 ? '+' : ''}${(state.unit === 'F' ? delta * 1.8 : delta).toFixed(1)}°${state.unit}`
        : '—';

      return `
        <tr>
          <td style="color:${city.color};">${esc(city.name)}</td>
          <td>${formatTemp(avg50s)}</td>
          <td>${formatTemp(avg70s)}</td>
          <td>${formatTemp(avg90s)}</td>
          <td>${formatTemp(avg10s)}</td>
          <td>${formatTemp(avg20s)}</td>
          <td style="font-weight:700; color:${delta > 0 ? '#f97066' : '#5eead4'};">${deltaDisp}</td>
        </tr>
      `;
    }).join('');
  } else {
    // Hourly mode summary table (Peak Temp by Month)
    $dataSectionTitle.textContent = 'Daily Peak Temperature by Month (24-Hour Averages)';
    $tableHead.innerHTML = `
      <tr>
        <th>City</th>
        ${MONTHS.map(m => `<th>${m}</th>`).join('')}
      </tr>
    `;

    $tableBody.innerHTML = loaded.map(city => {
      if (!city.fullYearHourly) return '';
      const monthlyPeaks = city.fullYearHourly.map(hours => Math.max(...hours));
      return `
        <tr>
          <td style="color:${city.color};">${esc(city.name)}</td>
          ${monthlyPeaks.map(v => `<td>${formatTemp(v)}</td>`).join('')}
        </tr>
      `;
    }).join('');
  }
}

// ---------- Init ----------
initPills();
updateEmptyStates();
loadStateFromURL();
$search.focus();
