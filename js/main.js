// main.js

import { initUI, refreshCharts } from './ui.js';
import { showToast } from './ui-utils.js';
import { addAlert, renderAlerts, checkAlerts } from './alerts.js';

// Prefer a unified getPrice if your api.js exports it; fall back to fetchQuotes mock.
let getPrice = null;
let fetchQuotes = null;
(async () => {
  try {
    const api = await import('./api.js');
    getPrice = api.getPrice || null;
    fetchQuotes = api.fetchQuotes || null;
  } catch (e) {
    console.warn('api.js not found or failed to load:', e);
  }
})();

// ----------------------- PWA: Service Worker -----------------------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('./service-worker.js')
    .then(reg => {
      console.log('✅ SW registered:', reg.scope);

      // Listen for updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            // If there's a controller, this is an update
            if (navigator.serviceWorker.controller) {
              // Optional: show a toast with a quick-refresh option
              showToast('New version available. Refresh to update.', 'info', 4000);
              // If you want to auto-activate immediately, uncomment:
              // newWorker.postMessage('SKIP_WAITING');
            } else {
              showToast('App ready for offline use.', 'success', 2500);
            }
          }
        });
      });
    })
    .catch(err => console.error('SW registration failed:', err));

  // When the new SW takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('🔁 New service worker is active.');
  });
}

// Optional helper to trigger skipWaiting from UI (e.g., a “Update” button)
export function activateUpdateNow() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
  }
}

// ----------------------- PWA: Install Prompt -----------------------
let deferredPrompt = null;

function setupInstallPrompt() {
  const installBtn = document.getElementById('installBtn');
  if (installBtn) installBtn.style.display = 'none';

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
      installBtn.style.display = 'inline-block';
      installBtn.addEventListener('click', async () => {
        try {
          installBtn.disabled = true;
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
        } finally {
          deferredPrompt = null;
          installBtn.style.display = 'none';
          installBtn.disabled = false;
        }
      }, { once: true });
    }
  });
}

// ----------------------- Alerts UI Wiring -----------------------
function wireAlertForm() {
  const addBtn = document.getElementById('addAlertBtn');
  if (!addBtn) return;

  addBtn.addEventListener('click', () => {
    const sym = (document.getElementById('alertSymbol')?.value || '').trim();
    const thr = (document.getElementById('alertThreshold')?.value || '').trim();
    const cond = (document.getElementById('alertCondition')?.value || 'above').trim();

    if (!sym || !thr || isNaN(Number(thr))) {
      showToast('Please enter a valid symbol and price.', 'error');
      return;
    }
    addAlert(sym, Number(thr), cond);
    renderAlerts();
    showToast('Alert added', 'success');
  });
}

// ----------------------- Price Polling -----------------------
let pollTimer = null;
let pollIntervalMs = 15_000; // 15s default; adjust as desired

function collectSymbolsForPolling() {
  // Collect from table second column (Symbol)
  const symbols = new Set(
    Array.from(document.querySelectorAll('#plTable tbody tr td:nth-child(2)'))
      .map(td => td.textContent.trim())
      .filter(Boolean)
  );

  // Also include any alert symbols
  const alertItems = Array.from(document.querySelectorAll('#alertsList .alert-item'));
  alertItems.forEach(li => {
    const match = li.textContent.trim().match(/^([A-Z0-9.\-_/]+)/);
    if (match) symbols.add(match[1]);
  });

  // Fallback demo set if empty
  if (symbols.size === 0) ['AAPL', 'TSLA', 'NVDA'].forEach(s => symbols.add(s));

  return Array.from(symbols);
}

async function pollPricesOnce() {
  try {
    const symbols = collectSymbolsForPolling();

    // Strategy A: getPrice per symbol (serial with small concurrency to stay kind to APIs)
    if (typeof getPrice === 'function') {
      const prices = {};
      for (const sym of symbols) {
        try {
          prices[sym] = await getPrice(sym);
        } catch (e) {
          // swallow individual errors; leave symbol undefined
        }
      }
      // Alerts + charts refresh
      checkAlerts(prices);
      refreshCharts();
      return;
    }

    // Strategy B: fetchQuotes batch (mock/demo)
    if (typeof fetchQuotes === 'function') {
      const prices = await fetchQuotes(symbols);
      checkAlerts(prices);
      refreshCharts();
      return;
    }

    // No API available
    console.warn('No price API available. Skipping polling.');
  } catch (err) {
    console.warn('Price polling failed:', err);
  }
}

function startPolling() {
  stopPolling();
  pollPricesOnce(); // kick off immediately
  pollTimer = setInterval(() => {
    if (document.hidden) return; // be kind while tab hidden
    pollPricesOnce();
  }, pollIntervalMs);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Pause when hidden; resume when visible
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  // On resume, do an immediate poll
  pollPricesOnce();
});

// ----------------------- Timeframe Handling -----------------------
function handleTimeframeChanges() {
  window.addEventListener('timeframechange', (e) => {
    const range = e.detail?.range || 'ALL';
    // In a real app, you’d re-query or re-filter data by range here.
    // For now, just refresh charts (they’ll use whatever data is loaded).
    refreshCharts();
    showToast(`Timeframe: ${range}`, 'info');
  });
}

// ----------------------- Online/Offline UX -----------------------
function wireConnectivityToasts() {
  window.addEventListener('online', () => showToast('Back online', 'success'));
  window.addEventListener('offline', () => showToast('You are offline', 'warn'));
}

// ----------------------- Bootstrap -----------------------
document.addEventListener('DOMContentLoaded', () => {
  // Core UI (tables, charts, theme)
  initUI();

  // PWA bits
  registerServiceWorker();
  setupInstallPrompt();

  // UI features
  wireAlertForm();
  wireConnectivityToasts();
  handleTimeframeChanges();

  // Start price polling
  startPolling();
});

// Optional: expose controls for debugging in console
window.__app = {
  startPolling,
  stopPolling,
  pollPricesOnce,
  activateUpdateNow
};

