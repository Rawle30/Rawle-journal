// script.js
let trades = JSON.parse(localStorage.getItem('trades')) || [];

const marketPrices = {
  AAPL: 144.95,
  GOOG: 2900,
  MSFT: 310,
  TSLA: 950,
  BTCUSD: 34160,
  ETHUSD: 1789,
  'AAPL 10/25 150C': 4.2
};

function saveTrades() {
  localStorage.setItem('trades', JSON.stringify(trades));
}

function getPL(trade) {
  const current = marketPrices[trade.symbol] || trade.entry;
  if (trade.type === 'option') return (current - trade.entry) * trade.qty * 100;
  return (current - trade.entry) * trade.qty;
}

function renderTrades(filtered = trades) {
  const tbody = document.getElementById('tradeRows');
  tbody.innerHTML = '';

  filtered.forEach((trade, index) => {
    const pl = getPL(trade);
    const plClass = pl >= 0 ? 'green' : 'red';
    const status = trade.exit ? 'Closed' : 'Open';
    const statusClass = trade.exit ? 'status-closed' : 'status-open';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${trade.symbol}</td>
      <td>${trade.qty}</td>
      <td>$${trade.entry}</td>
      <td>${trade.exit ?? '-'}</td>
      <td>${trade.entryDate}</td>
      <td>${trade.exitDate ?? '-'}</td>
      <td>${trade.type}</td>
      <td><span class="${plClass}">${pl.toFixed(2)}</span></td>
      <td><span class="${statusClass}">${status}</span></td>
      <td>
        <button onclick="editTrade(${index})">Edit</button>
        <button onclick="deleteTrade(${index})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}


function renderPL() {
  const tbody = document.getElementById('plRows');
  tbody.innerHTML = '';
  const brokerPL = {};
  trades.forEach(trade => {
    const pl = getPL(trade);
    const broker = trade.broker;
    if (!brokerPL[broker]) brokerPL[broker] = { realized: 0, unrealized: 0 };
    if (trade.exit) brokerPL[broker].realized += pl;
    else brokerPL[broker].unrealized += pl;
  });

  let combined = 0;
  Object.entries(brokerPL).forEach(([broker, data]) => {
    const rClass = data.realized < 0 ? 'red' : 'green';
    const uClass = data.unrealized < 0 ? 'red' : 'green';
    combined += data.realized + data.unrealized;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${broker}</td>
      <td class="${rClass}">${data.realized.toFixed(2)}</td>
      <td class="${uClass}">${data.unrealized.toFixed(2)}</td>
    `;
       tbody.appendChild(row);
  });

  const combinedClass = combined < 0 ? 'red' : 'green';
  document.getElementById('combinedPL').innerHTML = `<span class="${combinedClass}">${combined.toFixed(2)}</span>`;
}

function renderCharts() {
  new Chart(document.getElementById('equityChart'), {
    type: 'line',
    data: {
      labels: ['Oct 1', 'Oct 5', 'Oct 10', 'Oct 15', 'Oct 20', 'Oct 24'],
      datasets: [{
        label: 'Equity',
        data: [60000, 64000, 67000, 72000, 76000, 78000],
        borderColor: '#7DDA58',
        fill: false
      }]
    }
  });

  const distribution = { stock: 0, crypto: 0, option: 0 };
  trades.forEach(trade => {
    const pl = getPL(trade);
    distribution[trade.type] += Math.abs(pl);
  });

  new Chart(document.getElementById('symbolChart'), {
    type: 'pie',
    data: {
      labels: ['Stocks', 'Crypto', 'Options'],
      datasets: [{
        data: Object.values(distribution),
        backgroundColor: ['#7DDA58', '#5DE2E7', '#FE9900']
      }]
    }
  });
}

function renderTicker() {
  const ticker = document.getElementById('ticker-scroll');
  ticker.textContent = `AAPL: $${marketPrices.AAPL.toFixed(2)} | GOOG: $${marketPrices.GOOG.toFixed(2)} | BTCUSD: $${marketPrices.BTCUSD.toFixed(2)} | ETHUSD: $${marketPrices.ETHUSD.toFixed(2)} | TSLA: $${marketPrices.TSLA.toFixed(2)}`;
}

function updateMarketPrices() {
  for (let symbol in marketPrices) {
    marketPrices[symbol] += (Math.random() - 0.5) * 2;
  }
  renderTicker();
  renderTrades();
  renderPL();
  renderCharts();
}

function editTrade(index) {
  const trade = trades[index];
  const form = document.getElementById('tradeForm');
  form.symbol.value = trade.symbol;
  form.qty.value = trade.qty;
  form.entry.value = trade.entry;
  form.date.value = trade.date;
  form.type.value = trade.type;
  form.broker.value = trade.broker;
  form.dataset.editIndex = index;
}

function deleteTrade(index) {
  if (confirm('Delete this trade?')) {
    trades.splice(index, 1);
    saveTrades();
    renderTrades();
    renderPL();
    renderCharts();
  }
}

document.getElementById('tradeForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const form = e.target;
  const newTrade = {
    symbol: form.symbol.value.trim(),
    qty: parseFloat(form.qty.value),
    entry: parseFloat(form.entry.value),
    date: form.date.value,
    type: form.type.value,
    broker: form.broker.value
  };

  const editIndex = form.dataset.editIndex;
  if (editIndex !== undefined) {
    trades[editIndex] = newTrade;
    delete form.dataset.editIndex;
  } else {
    trades.push(newTrade);
  }

  marketPrices[newTrade.symbol] = newTrade.entry;
  form.reset();
  saveTrades();
  renderTrades();
  renderPL();
  renderCharts();
});

renderTrades();
renderPL();
renderCharts();
renderTicker();
setInterval(updateMarketPrices, 10000);

