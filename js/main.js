import { normalizeTrade, validateTrade } from './data.js';
import { loadTrades, saveTrades, readCachedPrice } from './storage.js';
import { fetchFromAlphaVantage, fetchFromCoinbase, fetchFromYahoo, isCrypto } from './api.js';
import { initEquityCurveChart, updateEquityCurve, initSymbolPieChart, updateSymbolPieChart } from './charts.js';
import { showToast, clearForm, applySavedTheme } from './ui.js';
import { addAlert, checkAlerts, renderAlerts } from './alerts.js';

let trades = [];

document.addEventListener('DOMContentLoaded', async () => {
  applySavedTheme();

  trades = loadTrades();
  renderTrades();
  renderAlerts();

  const equityCtx = document.getElementById('equity-curve-chart').getContext('2d');
  const pieCtx = document.getElementById('symbol-pie-chart').getContext('2d');
  initEquityCurveChart(equityCtx);
  initSymbolPieChart(pieCtx);
  updateCharts();

  registerServiceWorker();

  document.getElementById('trade-form').addEventListener('submit', handleTradeSubmit);
});

function renderTrades() {
  const container = document.getElementById('trade-list');
  if (!container) return;
  container.innerHTML = '';
  trades.forEach(trade => {
    const div = document.createElement('div');
    div.className = 'trade-item';
    div.textContent = `${trade.symbol} @ ${trade.entry} x ${trade.qty}`;
    container.appendChild(div);
  });
}

async function handleTradeSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const rawTrade = Object.fromEntries(formData.entries());
  const trade = normalizeTrade(rawTrade);

  if (!validateTrade(trade)) {
    showToast('Invalid trade data', 'error');
    return;
  }

  trades.push(trade);
  saveTrades(trades);
  renderTrades();
  updateCharts();
  clearForm(form.id);
  showToast('Trade saved', 'success');
}

async function updateCharts() {
  const equityData = trades.map(t => ({
    date: t.date,
    value: t.qty * t.entry * t.multiplier
  }));

  const symbolMap = {};
  trades.forEach(t => {
    const val = t.qty * t.entry * t.multiplier;
    symbolMap[t.symbol] = (symbolMap[t.symbol] || 0) + val;
  });

  const pieData = Object.entries(symbolMap).map(([symbol, value]) => ({ symbol, value }));

  updateEquityCurve(equityData);
  updateSymbolPieChart(pieData);

  const prices = {};
  for (const trade of trades) {
    const cached = readCachedPrice(trade.symbol, true);
    if (cached) {
      prices[trade.symbol] = cached.price;
      continue;
    }

    try {
      const price = isCrypto(trade.symbol)
        ? await fetchFromCoinbase(trade.symbol)
        : await fetchFromAlphaVantage(trade.symbol);
      prices[trade.symbol] = price;
    } catch {
      try {
        const fallback = await fetchFromYahoo(trade.symbol);
        prices[trade.symbol] = fallback;
      } catch {
        console.warn(`Price fetch failed for ${trade.symbol}`);
      }
    }
  }

  checkAlerts(prices);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('✅ Service Worker registered:', reg.scope))
      .catch(err => console.error('❌ Service Worker registration failed:', err));
  }
}
