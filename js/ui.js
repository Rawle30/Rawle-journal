// ui.js
import { loadTrades, saveTrades, readCachedPrice } from './storage.js';
import { updateEquityCurve, updateSymbolPieChart, resetZoom } from './charts.js';
import { showToast, applySavedTheme, toggleTheme } from './ui-utils.js';
import { sampleTrades } from './data.js';

// ---------- Helpers ----------
const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtNum = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');

/** Compute P/L for a trade (realized if exit exists, else unrealized using cache). */
function computePL(trade) {
  const { qty = 0, entry = 0, exit = null, fees = 0, multiplier = 1, symbol } = trade;
  const basis = qty * entry * multiplier;
  let exitPx = exit;

  if (exitPx == null) {
    const cached = readCachedPrice(symbol);
    exitPx = cached?.price ?? null;
  }

  if (exitPx == null) {
    return { pl: null, realized: false, exitPx: null };
  }

  const gross = (exitPx - entry) * qty * multiplier;
  const pl = gross - (fees || 0);
  return { pl, realized: exit != null, exitPx };
}

/** Build equity curve data from trades (date ascending, cumulative P/L). */
function buildEquityCurve(trades) {
  const points = [];
  const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));

  let cum = 0;
  for (const t of sorted) {
    const { pl, realized } = computePL(t);
    // Equity curve uses realized P/L only to avoid noisy swings
    const add = realized && Number.isFinite(pl) ? pl : 0;
    cum += add;
    points.push({ date: t.date, value: Math.round(cum * 100) / 100 });
  }
  // Deduplicate dates by taking the last value per date
  const byDate = new Map();
  for (const p of points) byDate.set(p.date, p.value);
  return Array.from(byDate, ([date, value]) => ({ date, value }));
}

/** Aggregate for pie: absolute dollar contribution per symbol (realized + unrealized if available). */
function buildSymbolPie(trades) {
  const map = new Map();
  for (const t of trades) {
    const { pl } = computePL(t);
    const val = Number.isFinite(pl) ? Math.abs(pl) : 0;
    map.set(t.symbol, (map.get(t.symbol) || 0) + val);
  }
  const arr = Array.from(map, ([symbol, value]) => ({ symbol, value }));
  // sort desc, take top 6 (you can tweak)
  return arr.sort((a, b) => b.value - a.value).slice(0, 6);
}

/** Download a canvas as PNG. */
function downloadCanvasPNG(canvas, filename = 'chart.png') {
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/** Apply gain/loss class to a cell by numeric value */
function applyPLClass(el, value) {
  el.classList.remove('pl-positive', 'pl-negative');
  if (!Number.isFinite(value)) return;
  el.classList.add(value < 0 ? 'pl-negative' : 'pl-positive');
}

// ---------- Table Rendering ----------
export function renderTable(trades = null) {
  const tbody = document.querySelector('#plTable tbody');
  if (!tbody) return;

  const data = trades ?? (loadTrades().length ? loadTrades() : sampleTrades);
  tbody.innerHTML = '';

  for (const t of data) {
    const tr = document.createElement('tr');

    const { pl, realized, exitPx } = computePL(t);
    const tags = Array.isArray(t.tags) ? t.tags.join(', ') : (t.tags || '');

    tr.innerHTML = `
      <td>${t.broker}</td>
      <td>${t.symbol}</td>
      <td>${fmtNum(t.qty, 0)}</td>
      <td>${fmtNum(t.entry)}</td>
      <td>${t.exit != null ? fmtNum(t.exit) : (exitPx != null ? `${fmtNum(exitPx)}*` : '—')}</td>
      <td>${fmtNum(t.fees)}</td>
      <td class="pl-cell">${Number.isFinite(pl) ? fmt.format(pl) : '—'}</td>
      <td>${tags}</td>
    `;

    // colorize P/L cell
    const plCell = tr.querySelector('.pl-cell');
    applyPLClass(plCell, pl);

    tbody.appendChild(tr);
  }
}

// ---------- Charts Wiring ----------
export function refreshCharts() {
  const trades = loadTrades().length ? loadTrades() : sampleTrades;
  const equity = buildEquityCurve(trades);
  const pie = buildSymbolPie(trades);

  updateEquityCurve(equity);
  updateSymbolPieChart(pie);
}

// ---------- Controls & Events ----------
function wireTimeframeButtons() {
  const container = document.body; // delegate
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.timeframe-btn');
    if (!btn) return;
    const range = btn.dataset.range || 'ALL';

    // mark active
    document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // emit an event so data loader can react
    const evt = new CustomEvent('timeframechange', { detail: { range } });
    window.dispatchEvent(evt);
  });
}

function wireExportButtons() {
  const exportEquity = document.getElementById('exportEquity');
  const reset = document.getElementById('resetZoom');

  exportEquity?.addEventListener('click', () => {
    const canvas = document.getElementById('equity-curve-chart');
    if (!canvas) return showToast('Equity chart not found', 'error');
    downloadCanvasPNG(canvas, 'equity-curve.png');
    showToast('Equity chart exported', 'success');
  });

  reset?.addEventListener('click', () => {
    resetZoom('equity-curve-chart');
    showToast('Zoom reset', 'info');
  });
}

function wireTheme() {
  // apply on load
  applySavedTheme();

  // optional: a button with id="themeToggle"
  const btn = document.getElementById('themeToggle');
  btn?.addEventListener('click', () => {
    toggleTheme();
    showToast('Theme updated', 'info');
  });
}

// ---------- Public API ----------
/** Initialize UI (call on DOMContentLoaded) */
export function initUI() {
  // Ensure we have trades saved at least once (so later edits persist)
  const trades = loadTrades();
  if (!trades.length && sampleTrades?.length) {
    saveTrades(sampleTrades);
  }

  wireTimeframeButtons();
  wireExportButtons();
  wireTheme();

  renderTable();
  refreshCharts();
}

// Expose a simple way to add a trade and refresh everything
export function addTradeAndRefresh(trade) {
  const list = loadTrades();
  list.push(trade);
  saveTrades(list);
  renderTable(list);
  refreshCharts();
  showToast('Trade added', 'success');
}

// Expose a way to replace trades wholesale (e.g., import)
export function setTradesAndRefresh(trades) {
  saveTrades(trades || []);
  renderTable(trades || []);
  refreshCharts();
  showToast('Trades updated', 'success');
}

