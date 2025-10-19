export let equityCurveChart;
export let symbolPieChart;

export function initEquityCurveChart(ctx) {
  equityCurveChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Equity Curve',
        data: [],
        borderColor: '#5DE2E7',
        backgroundColor: 'rgba(93, 226, 231, 0.2)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        zoom: {
          pan: { enabled: true, mode: 'x' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
        }
      }
    }
  });
}

export function updateEquityCurve(data) {
  if (!equityCurveChart) return;
  equityCurveChart.data.labels = data.map(d => d.date);
  equityCurveChart.data.datasets[0].data = data.map(d => d.value);
  equityCurveChart.update();
}

export function resetZoom(chartId) {
  const chart = chartId === 'equity-curve-chart' ? equityCurveChart : null;
  if (chart) chart.resetZoom();
}

export function initSymbolPieChart(ctx) {
  symbolPieChart = new Chart(ctx, {
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
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

export function updateSymbolPieChart(data) {
  if (!symbolPieChart) return;
  symbolPieChart.data.labels = data.map(d => d.symbol);
  symbolPieChart.data.datasets[0].data = data.map(d => d.value);
  symbolPieChart.update();
}
