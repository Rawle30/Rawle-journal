document.addEventListener('DOMContentLoaded', () => {
  // Dark mode toggle
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
  }

  document.getElementById('darkToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const mode = document.body.classList.contains('dark') ? 'dark' : 'light';
    localStorage.setItem('theme', mode);
  });

  // Sample trades
  const trades = [
    { symbol: 'AAPL', qty: 10, entry: 150, date: '10/12', broker: 'Etrade' },
    { symbol: 'GOOG', qty: 5, entry: 2800, date: '10/11', broker: 'Schwab' },
    { symbol: 'MSFT', qty: 12, entry: 300, date: '10/10', broker: 'Fidelity' },
    { symbol: 'TSLA', qty: 10, entry: 1000, date: '10/14', broker: 'Robinhood' }
  ];

  const marketPrices = {
    AAPL: 144.95,
    GOOG: 2900,
    MSFT: 310,
    TSLA: 950
  };

  function getPL(trade) {
    const current = marketPrices[trade.symbol] || trade.entry;
    return (current - trade.entry) * trade.qty;
  }

  function renderTrades() {
    const tbody = document.getElementById('tradeRows');
    tbody.innerHTML = '';
    trades.forEach((trade, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${trade.symbol}</td>
        <td>${trade.qty}</td>
        <td>$${trade.entry}</td>
        <td>${trade.date}</td>
        <td>-</td>
        <td><button>Edit</button></td>
      `;
      tbody.appendChild(row);
    });
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

    new Chart(document.getElementById('symbolChart'), {
      type: 'pie',
      data: {
        labels: ['AAPL', 'GOOG', 'MSFT', 'TSLA'],
        datasets: [{
          data: [1500, 4500, 9600, 3000],
          backgroundColor: ['#FFDE59', '#7DDA58', '#5DE2E7', '#FE9900']
        }]
      }
    });
  }

  function renderTicker() {
    const ticker = document.getElementById('ticker-scroll');
    ticker.textContent = `AAPL: $${marketPrices.AAPL} | GOOG: $${
function renderTicker() {
  const ticker = document.getElementById('ticker-scroll');
  ticker.textContent = `AAPL: $${marketPrices.AAPL} | GOOG: $${marketPrices.GOOG} | MSFT: $${marketPrices.MSFT} | TSLA: $${marketPrices.TSLA}`;
}

function renderPL() {
  const brokers = {};
  trades.forEach(trade => {
    const pl = getPL(trade);
    const broker = trade.broker || 'Unknown';
    if (!brokers[broker]) {
      brokers[broker] = { realized: 0, unrealized: 0 };
    }
    if (trade.exit) {
      brokers[broker].realized += pl;
    } else {
      brokers[broker].unrealized += pl;
    }
  });

  const tbody = document.getElementById('plRows');
  tbody.innerHTML = '';
  let totalRealized = 0;
  let totalUnrealized = 0;

  for (const broker in brokers) {
    const row = document.createElement('tr');
    const realized = brokers[broker].realized.toFixed(2);
    const unrealized = brokers[broker].unrealized.toFixed(2);
    row.innerHTML = `<td>${broker}</td><td>$${realized}</td><td>$${unrealized}</td>`;
    tbody.appendChild(row);
    totalRealized += brokers[broker].realized;
    totalUnrealized += brokers[broker].unrealized;
  }

  document.getElementById('combinedPL').textContent = `$${(totalRealized + totalUnrealized).toFixed(2)}`;
}

// Initialize dashboard
renderTrades();
renderCharts();
renderTicker();
renderPL();






