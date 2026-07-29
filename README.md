# ☀️ ClimaCompare

**ClimaCompare** is a modern, ad-free, fast weather comparison web application that lets you compare long-term climate normals, recent actuals, hourly diurnal temperature profiles, and multi-decadal warming trends across cities worldwide.

🔗 **Live App**: [https://nzewail.github.io/clima-compare/](https://nzewail.github.io/clima-compare/)

---

## ✨ Features

* **30-Year Climate Normals (1995–2024 Baseline)**: Evaluates ~10,000+ daily weather observations per city to establish true World Meteorological Organization (WMO) climate normals.
* **Yearly Actuals Overlay (2019–2026)**: Overlay specific recent years (e.g. 2026 actuals) directly against the 30-year baseline to see if a year was warmer, cooler, or typical.
* **Hourly Temperature Heatmap**: WeatherSpark-style 2D heatmap matrix (12 months × 24 hours of the day) showing diurnal temperature profiles with interactive cell tooltips and temperature color spectrum.
* **Climate Warming Trends (1950–2026)**: Multi-decadal trend line chart with 10-year smooth rolling averages and decadal temperature change calculations (Δ 1950–2026).
* **URL Sharing & Deep Linking**: Real-time URL parameter state syncing and 1-click share button to share exact city comparisons, units, view modes, and year overlays with anyone.
* **Global Country Flags**: Automatic country flag emojis for cities in search results, city chips, heatmap titles, and tables.
* **Ad-Free Dark Glassmorphism UI**: High-contrast, premium dark theme with fluid micro-animations, keyboard navigation, and responsive mobile layout.

---

## 🛠️ Tech Stack

* **Core**: HTML5, Vanilla JavaScript (ES6+), Vanilla CSS
* **Charting**: [Chart.js v4](https://www.chartjs.org/) & HTML5 Canvas
* **Data Provider**: [Open-Meteo Historical Weather API](https://open-meteo.com/) (ERA5 Reanalysis Data)
* **Fonts**: Inter (Google Fonts)

---

## 🚀 Running Locally

No build tools or installation required! Simply serve the directory with any HTTP server:

```bash
git clone https://github.com/nzewail/clima-compare.git
cd clima-compare
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

---

## 📄 License

Distributed under the [MIT License](LICENSE). Copyright © 2026 Nabeel Zewail.
