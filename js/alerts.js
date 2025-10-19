// alerts.js — robust, persistent alerts with notifications

export let alerts = loadAlerts();

/**
 * Adds a new alert and re-renders the UI.
 * @param {string} symbol - Trading symbol, e.g. AAPL, BTC-USD
 * @param {number|string} threshold - Trigger price
 * @param {'above'|'below'} condition - Trigger condition
 */
export function addAlert(symbol, threshold, condition) {
  const sym = String(symbol || '').trim().toUpperCase();
  const thr = Number(threshold);

  if (!sym || !Number.isFinite(thr) || (condition !== 'above' && condition !== 'below')) return;

  // prevent exact duplicate
  const exists = alerts.some(a => a.symbol === sym && a.threshold === thr && a.condition === condition);
  if (exists) return;

  alerts.push({ symbol: sym, threshold: thr, condition });
  persist();
  renderAlerts();
}

/**
 * Checks all alerts against current prices and triggers notifications.
 * @param {Record<string, number>} currentPrices - symbol → price
 */
export function checkAlerts(currentPrices) {
  alerts.forEach(a => {
    const price = currentPrices?.[a.symbol];
    if (!Number.isFinite(price)) return;

    const triggered = a.condition === 'above'
      ? price > a.threshold
      : price < a.threshold;

    if (triggered) {
      notifyUser(a.symbol, price, a.condition, a.threshold);
    }
  });
}

/** Renders the active alerts list. Expects a container with id="alertsList". */
export function renderAlerts() {
  const container = document.getElementById('alertsList');
  if (!container) return;

  container.innerHTML = '';
  if (!alerts.length) {
    const empty = document.createElement('div');
    empty.className = 'alert-empty muted';
    empty.textContent = 'No alerts yet.';
    container.appendChild(empty);
    return;
  }

  alerts.forEach((a, i) => {
    const row = document.createElement('div');
    row.className = 'alert-item';
    row.innerHTML = `
      <span class="alert-text"><strong>${a.symbol}</strong> ${a.condition} ${a.threshold}</span>
      <button class="delete-btn" aria-label="Delete alert">✖</button>
    `;
    row.querySelector('.delete-btn').addEventListener('click', () => {
      alerts.splice(i, 1);
      persist();
      renderAlerts();
    });
    container.appendChild(row);
  });
}

/** Optional helpers */
export function clearAlerts() {
  alerts = [];
  persist();
  renderAlerts();
}
export function removeAlert(predicate) {
  // predicate: (a) => boolean
  const before = alerts.length;
  alerts = alerts.filter(a => !predicate(a));
  if (alerts.length !== before) {
    persist();
    renderAlerts();
  }
}

/* ---------------- internal utilities ---------------- */

function persist() {
  try { localStorage.setItem('alerts', JSON.stringify(alerts)); } catch {}
}

function loadAlerts() {
  try {
    const raw = localStorage.getItem('alerts');
    const arr = raw ? JSON.parse(raw) : [];
    // sanitize
    return Array.isArray(arr)
      ? arr
          .map(a => ({
            symbol: String(a.symbol || '').toUpperCase().trim(),
            threshold: Number(a.threshold),
            condition: a.condition === 'below' ? 'below' : 'above'
          }))
          .filter(a => a.symbol && Number.isFinite(a.threshold))
      : [];
  } catch {
    return [];
  }
}

function notifyUser(symbol, price, condition, threshold) {
  const msg = `🚨 ${symbol}: ${price} is ${condition} ${threshold}`;
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification('Trading Alert', { body: msg });
      return;
    }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') new Notification('Trading Alert', { body: msg });
        else fallbackAlert(msg);
      }).catch(() => fallbackAlert(msg));
      return;
    }
  }
  fallbackAlert(msg);
}

function fallbackAlert(message) {
  // Use non-blocking toast if available; fallback to alert()
  const toast = window.showToast;
  if (typeof toast === 'function') {
    toast(message, 'warn', 3500);
  } else {
    alert(message);
  }
}

// Request notification permission once on load (soft)
if ('Notification' in window && Notification.permission === 'default') {
  try { Notification.requestPermission(); } catch {}
}

