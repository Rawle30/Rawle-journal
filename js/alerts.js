export let alerts = [];

/**
 * Adds a new alert to the list and re-renders the alert UI.
 * @param {string} symbol - The trading symbol (e.g., AAPL, BTC-USD)
 * @param {number} threshold - The price threshold to trigger the alert
 * @param {'above'|'below'} condition - The condition to trigger the alert
 */
export function addAlert(symbol, threshold, condition) {
  alerts.push({ symbol, threshold, condition });
  renderAlerts();
}

/**
 * Checks all alerts against current prices and triggers notifications if conditions are met.
 * @param {Object} currentPrices - A map of symbol → current price
 */
export function checkAlerts(currentPrices) {
  alerts.forEach(alert => {
    const price = currentPrices[alert.symbol];
    if (!price) return;

    const triggered = alert.condition === 'above'
      ? price > alert.threshold
      : price < alert.threshold;

    if (triggered) {
      alertUser(alert.symbol, price, alert.condition, alert.threshold);
    }
  });
}

/**
 * Displays a browser alert when a price condition is triggered.
 */
function alertUser(symbol, price, condition, threshold) {
  alert(`🚨 Alert triggered for ${symbol}: ${price} is ${condition} ${threshold}`);
}

/**
 * Renders the list of active alerts in the UI.
 */
export function renderAlerts() {
  const container = document.getElementById('alert-list');
  if (!container) return;

  container.innerHTML = '';
  alerts.forEach((a, i) => {
    const div = document.createElement('div');
    div.className = 'alert-item';
    div.textContent = `${a.symbol} ${a.condition} ${a.threshold}`;
    container.appendChild(div);
  });
}
