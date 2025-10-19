// charts.js
export let equityCurveChart = null;
export let symbolPieChart = null;

/* Safely register chart plugins (e.g., chartjs-plugin-zoom) */
function registerPlugins() {
  if (!window.Chart) return;
  const { Chart } = window;
  const ZoomPlugin = window.ChartZoom || window['chartjs-plugin-zoom'] || window.chartjsPluginZoom;
  if (ZoomPlugin && !Chart.registry.plugins.get('zoom')) {
    Chart.register(ZoomPlugin);
  }
}

function safeDestroy(chart) { try { chart?.destroy(); } catch {} }

/** Initialize Equity Curve (use canvas element or its id) */
export function initEquityCurveChart(ctxOrId = 'equity-curve-chart') {
  registerPlugins();
  const canvas = typeof ctxOrId === 'string' ? document.getElementById(ctxOrId) : ctxOrId;
  if (!canvas || !window.Chart) return;

  safeDestroy(equityCurveChart);

  equityCurveChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Equity Curve',
        data: [],
        borderColor: '#7DDA58',                         // brand green (screenshot-like)
        backgroundColor: 'rgba(125,218,88,0.25)',       // soft fill
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0
      }]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      layout: { padding: { top: 10, bottom: 10, left: 5, right: 5 } },
      plugins: {
        legend: { display: false },
        zoom: {
          pan: { enabled: true, mode: 'x' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
        }
      },
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 10 } },
        y: { beginAtZero: false }
      }
    }
  });
}

/** Update equity curve with [{date, value}] */
export function updateEquityCurve(data = []) {
  if (!equityCurveChart) return;
  equityCurveChart.data.labels = data.map(d => d.date);
  equityCurveChart.data.datasets[0].data = data.map(d => d.value);
  equityCurveChart.update();
}

/** Reset zoom (currently only equity curve supported) */
export function resetZoom(chartId = 'equity-curve-chart') {
  const chart = chartId === 'equity-curve-chart' ? equityCurveChart : null;
  chart?.resetZoom?.();
}

/** Initialize Symbol Distribution pie */
export function initSymbolPieChart(ctxOrId = 'symbol-pie-chart') {
  registerPlugins();
  const canvas = typeof ctxOrId === 'string' ? document.getElementById(ctxOrId) : ctxOrId;
  if (!canvas || !window.Chart) return;

  safeDestroy(symbolPieChart);

  symbolPieChart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: ['#E4080A', '#7DDA58', '#FFDE59', '#5DE2E7', '#FE9900', '#DFC57B']
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

/** Update pie with [{symbol, value}] */
export function updateSymbolPieChart(data = []) {
  if (!symbolPieChart) return;
  symbolPieChart.data.labels = data.map(d => d.symbol);
  symbolPieChart.data.datasets[0].data = data.map(d => d.value);
  symbolPieChart.update();
}

/** Optional demo renderer (for preview pages) */
export function renderPreviewCharts() {
  initEquityCurveChart('equity-curve-chart');
  initSymbolPieChart('symbol-pie-chart');
  updateEquityCurve([
    { date: 'Oct 1', value: 35000 },
    { date: 'Oct 5', value: 42000 },
    { date: 'Oct 13', value: 60000 },
    { date: 'Oct 18', value: 67000 },
    { date: 'Oct 24', value: 76000 }
  ]);
  updateSymbolPieChart([
    { symbol: 'AAPL', value: 1500 },
    { symbol: 'GOOG', value: 4500 },
    { symbol: 'MSFT', value: 9600 },
    { symbol: 'TSLA', value: 3000 }
  ]);
}

