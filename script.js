document.addEventListener('DOMContentLoaded', () => {
  const tradeForm = document.getElementById('tradeForm');
  if (!tradeForm) {
    console.error('Trade form element not found');
    return;
  }

  // 🌙 Dark Mode Toggle
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
  }
  const darkToggle = document.getElementById('darkToggle');
  if (darkToggle) {
    darkToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    });
  }

  // 📦 Compact Mode Toggle
  const compactToggle = document.getElementById('compactToggle');
  if (compactToggle) {
    compactToggle.addEventListener('change', function () {
      document.body.classList.toggle('compact', this.checked);
    });
  }

  const trades = [];
  // 🧠 Load from localStorage
  const stored = localStorage.getItem('trades');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) trades.push(...parsed);
    } catch (e) {
      console.warn('Failed to load saved trades:', e);
    }
  }

  const marketPrices = {
    AAPL: 144.95,
    GOOG: 2900,
    MSFT: 310,
    TSLA: 950
  };

  function formatPL(value) {
    const color = value >= 0 ? 'green' : 'red';
    return `<span class="${color}">$${value.toFixed(2)}</span>`;
  }

  function getPL(trade) {
    const price = trade.exit ?? marketPrices[trade.symbol] ?? trade.entry;
    const multiplier = trade.type === 'option' ? trade.multiplier || 100 : 1;
    return (price - trade.entry) * trade.qty * multiplier;
  }

  function saveTrades() {
    localStorage.setItem('trades', JSON.stringify(trades));
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.style.display = 'block';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 2000);
    }
  }

  function renderTrades(brokerFilter = 'all', symbolFilter = '') {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    const tagFilter = document.getElementById('tagFilter')?.value.toLowerCase();
    const editId = tradeForm.dataset.editId;
    const tbody = document.getElementById('tradeRows');
    if (!tbody) {
      console.warn('Trade rows tbody not found');
      return;
    }
    tbody.innerHTML = '';
    const filteredTrades = trades.filter(trade => {
      const brokerMatch = brokerFilter === 'all' || trade.broker === brokerFilter;
      const symbolMatch = trade.symbol.toLowerCase().includes(symbolFilter.toLowerCase());
      const entryDate = new Date(trade.entryDate);
      const startMatch = !startDate || entryDate >= new Date(startDate);
      const endMatch = !endDate || entryDate <= new Date(endDate);
      const tagMatch = !tagFilter || (trade.tags || []).some(tag => tag.toLowerCase().includes(tagFilter));
      return brokerMatch && symbolMatch && startMatch && endMatch && tagMatch;
    });
    filteredTrades.forEach(trade => {
      const row = document.createElement('tr');
      if (editId && trade.id === editId) {
        row.classList.add('highlight');
      }
      row.innerHTML = `
        <td>${trade.symbol}</td>
        <td>${trade.qty}</td>
        <td>$${trade.entry.toFixed(2)}</td>
        <td>${trade.entryDate}</td>
        <td>${trade.exit ? `$${trade.exit.toFixed(2)}` : '-'}</td>
        <td>${trade.exitDate ?? '-'}</td>
        <td>${trade.multiplier ?? 100}</td>
        <td>${trade.type}</td>
        <td>${trade.broker}</td>
        <td><button aria-label="Edit trade for ${trade.symbol}" onclick="editTrade('${trade.id}')">Edit</button></td>
      `;
      tbody.appendChild(row);
    });
    const tradeCount = document.getElementById('tradeCount');
    if (tradeCount) {
      tradeCount.textContent = `${filteredTrades.length} trades shown`;
    }
    const totalPL = filteredTrades.reduce((sum, t) => sum + getPL(t), 0);
    const avgPL = filteredTrades.length ? totalPL / filteredTrades.length : 0;
    const tradeSummary = document.getElementById('tradeSummary');
    if (tradeSummary) {
      tradeSummary.innerHTML = `
        <p><strong>Total P/L:</strong> ${formatPL(totalPL)}</p>
        <p><strong>Average P/L:</strong> ${formatPL(avgPL)}</p>
      `;
    }
    renderCharts(filteredTrades);
  }

  function renderCharts(filtered = trades) {
    const equityCanvas = document.getElementById('equityChart');
    const symbolCanvas = document.getElementById('symbolChart');
    const brokerCanvas = document.getElementById('brokerChart');

    if (!window.Chart || !equityCanvas || !symbolCanvas || !brokerCanvas) {
      console.warn('Chart.js or canvas elements missing, skipping chart rendering');
      return;
    }

    const labels = filtered.map(t => t.symbol);
    const equityData = filtered.map(t => getPL(t));
    const chartType = document.getElementById('chartType')?.value || 'line';

    new Chart(equityCanvas, {
      type: chartType,
      data: {
        labels,
        datasets: [{
          label: 'Equity',
          data: equityData,
          backgroundColor: chartType === 'bar' ? '#7DDA58' : '#7DDA58',
          borderColor: '#7DDA58',
          fill: chartType === 'line' ? false : true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });

    const symbolCounts = {};
    filtered.forEach(t => {
      symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1;
    });
    new Chart(symbolCanvas, {
      type: 'pie',
      data: {
        labels: Object.keys(symbolCounts),
        datasets: [{
          data: Object.values(symbolCounts),
          backgroundColor: ['#FFDE59', '#7DDA58', '#5DE2E7', '#FE9900', '#DFC57B']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    const brokerCounts = {};
    filtered.forEach(t => {
      brokerCounts[t.broker] = (brokerCounts[t.broker] || 0) + 1;
    });
    new Chart(brokerCanvas, {
      type: 'doughnut',
      data: {
        labels: Object.keys(brokerCounts),
        datasets: [{
          data: Object.values(brokerCounts),
          backgroundColor: ['#5DE2E7', '#FFDE59', '#7DDA58', '#FE9900', '#DFC57B']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  window.editTrade = function(id) {
    const trade = trades.find(t => t.id === id);
    if (!trade) {
      showToast('Trade not found');
      return;
    }
    if (!tradeForm.symbol || !tradeForm.qty || !tradeForm.entry || !tradeForm.date || !tradeForm.exit || !tradeForm.exitDate || !tradeForm.multiplier || !tradeForm.type || !tradeForm.broker || !tradeForm.tags) {
      console.error('Form fields missing');
      showToast('Error: Form is incomplete');
      return;
    }
    tradeForm.symbol.value = trade.symbol;
    tradeForm.qty.value = trade.qty;
    tradeForm.entry.value = trade.entry;
    tradeForm.date.value = trade.entryDate;
    tradeForm.exit.value = trade.exit ?? '';
    tradeForm.exitDate.value = trade.exitDate ?? '';
    tradeForm.multiplier.value = trade.multiplier ?? 100;
    tradeForm.type.value = trade.type;
    tradeForm.broker.value = trade.broker;
    tradeForm.tags.value = (trade.tags || []).join(', ');
    tradeForm.dataset.editId = trade.id;
    const cancelEdit = document.getElementById('cancelEdit');
    if (cancelEdit) {
      cancelEdit.style.display = 'inline-block';
    }
    tradeForm.scrollIntoView({ behavior: 'smooth' });
  };

  const cancelEdit = document.getElementById('cancelEdit');
  if (cancelEdit) {
    cancelEdit.addEventListener('click', () => {
      tradeForm.reset();
      delete tradeForm.dataset.editId;
      cancelEdit.style.display = 'none';
      const brokerFilter = document.getElementById('brokerFilter')?.value || 'all';
      const symbolSearch = document.getElementById('symbolSearch')?.value || '';
      renderTrades(brokerFilter, symbolSearch);
    });
  }

  tradeForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const form = e.target;
    const symbol = form.symbol.value.trim();
    const qty = parseFloat(form.qty.value);
    const entry = parseFloat(form.entry.value);
    if (!symbol || isNaN(qty) || qty <= 0 || isNaN(entry) || entry <= 0) {
      showToast('Invalid input: Symbol, quantity, and entry price are required and must be positive');
      return;
    }
    const newTrade = {
      id: form.dataset.editId || Date.now().toString(),
      symbol,
      qty,
      entry,
      entryDate: form.date.value,
      exit: form.exit.value ? parseFloat(form.exit.value) : null,
      exitDate: form.exitDate.value || null,
      multiplier: form.multiplier.value ? parseInt(form.multiplier.value) : 100,
      type: form.type.value,
      broker: form.broker.value,
      tags: form.tags.value.split(',').map(t => t.trim()).filter(Boolean)
    };
    const editId = form.dataset.editId;
    if (editId) {
      const index = trades.findIndex(t => t.id === editId);
      if (index !== -1) trades[index] = newTrade;
      delete form.dataset.editId;
      showToast('Trade updated!');
    } else {
      trades.push(newTrade);
      showToast('Trade added!');
    }
    form.reset();
    const cancelEdit = document.getElementById('cancelEdit');
    if (cancelEdit) {
      cancelEdit.style.display = 'none';
    }
    saveTrades();
    const brokerFilter = document.getElementById('brokerFilter')?.value || 'all';
    const symbolSearch = document.getElementById('symbolSearch')?.value || '';
    renderTrades(brokerFilter, symbolSearch);
    renderPL();
    renderPortfolio();
  });

  // 🔍 Filter Listeners with Debounce
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  ['brokerFilter', 'symbolSearch', 'tagFilter', 'startDate', 'endDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', debounce(() => {
        const broker = document.getElementById('brokerFilter')?.value || 'all';
        const symbol = document.getElementById('symbolSearch')?.value || '';
        renderTrades(broker, symbol);
      }, 300));
    }
  });

  // 📤 Export Filtered Trades
  const exportFiltered = document.getElementById('exportFiltered');
  if (exportFiltered) {
    exportFiltered.addEventListener('click', () => {
      const broker = document.getElementById('brokerFilter')?.value || 'all';
      const symbol = document.getElementById('symbolSearch')?.value || '';
      const tag = document.getElementById('tagFilter')?.value || '';
      const startDate = document.getElementById('startDate')?.value;
      const endDate = document.getElementById('endDate')?.value;
      const filtered = trades.filter(trade => {
        const entryDate = new Date(trade.entryDate);
        return (
          (broker === 'all' || trade.broker === broker) &&
          trade.symbol.toLowerCase().includes(symbol.toLowerCase()) &&
          (!startDate || entryDate >= new Date(startDate)) &&
          (!endDate || entryDate <= new Date(endDate)) &&
          (!tag || (trade.tags || []).some(t => t.toLowerCase().includes(tag.toLowerCase())))
        );
      });
      let csv = 'Symbol,Qty,Entry,Date,Exit,ExitDate,Multiplier,Type,Broker,Tags\n';
      filtered.forEach(trade => {
        csv += `${trade.symbol},${trade.qty},${trade.entry},${trade.entryDate},${trade.exit ?? ''},${trade.exitDate ?? ''},${trade.multiplier ?? 100},${trade.type},${trade.broker},"${(trade.tags || []).join(', ')}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'filtered_trades.csv';
      link.click();
    });
  }

  // 📥 CSV Import
  const importCSV = document.getElementById('importCSV');
  if (importCSV) {
    importCSV.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (event) {
        parseCSV(event.target.result);
      };
      reader.readAsText(file);
    });
  }

  // 📂 Drag-and-Drop CSV Upload
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = function (event) {
          parseCSV(event.target.result);
        };
        reader.readAsText(file);
      }
    });
  }

  // 🧠 CSV Parser
  function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 1) {
      showToast('Invalid CSV: No data found');
      return;
    }
    const headers = lines[0].split(',').map(h => h.trim());
    const expectedHeaders = ['Symbol', 'Qty', 'Entry', 'Date', 'Exit', 'ExitDate', 'Multiplier', 'Type', 'Broker', 'Tags'];
    if (!expectedHeaders.every((h, i) => headers[i] === h)) {
      showToast('Invalid CSV: Incorrect headers');
      return;
    }
    const newTrades = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length < 9) {
        console.warn(`Skipping invalid CSV row ${i}: insufficient fields`);
        continue;
      }
      const qty = parseFloat(values[1]);
      const entry = parseFloat(values[2]);
      const exit = values[4] ? parseFloat(values[4]) : null;
      const multiplier = values[6] ? parseInt(values[6]) : 100;
      if (isNaN(qty) || isNaN(entry) || (values[4] && isNaN(exit)) || (values[6] && isNaN(multiplier))) {
        console.warn(`Skipping invalid CSV row ${i}: invalid numbers`);
        continue;
      }
      const trade = {
        id: Date.now().toString() + i,
        symbol: values[0],
        qty,
        entry,
        entryDate: values[3],
        exit,
        exitDate: values[5] || null,
        multiplier,
        type: values[7],
        broker: values[8],
        tags: values[9] ? values[9].split(',').map(t => t.trim()).filter(Boolean) : []
      };
      newTrades.push(trade);
    }
    if (newTrades.length === 0) {
      showToast('No valid trades imported');
      return;
    }
    trades.length = 0;
    trades.push(...newTrades);
    saveTrades();
    const brokerFilter = document.getElementById('brokerFilter')?.value || 'all';
    const symbolSearch = document.getElementById('symbolSearch')?.value || '';
    renderTrades(brokerFilter, symbolSearch);
    renderPL();
    renderPortfolio();
    showToast(`Imported ${newTrades.length} trades`);
  }

  // 📈 Profit / Loss Summary
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
    if (!tbody) {
      console.warn('PL rows tbody not found');
      return;
    }
    tbody.innerHTML = '';
    let totalRealized = 0;
    let totalUnrealized = 0;
    for (const broker in brokers) {
      const realized = formatPL(brokers[broker].realized);
      const unrealized = formatPL(brokers[broker].unrealized);
      const row = document.createElement('tr');
      row.innerHTML = `<td>${broker}</td><td>${realized}</td><td>${unrealized}</td>`;
      tbody.appendChild(row);
      totalRealized += brokers[broker].realized;
      totalUnrealized += brokers[broker].unrealized;
    }
    const combinedPL = document.getElementById('combinedPL');
    if (combinedPL) {
      combinedPL.innerHTML = formatPL(totalRealized + totalUnrealized);
    }
  }

  // 📊 Portfolio Overview
  function renderPortfolio() {
    const container = document.getElementById('portfolio-summary');
    if (!container) {
      console.warn('Portfolio summary container not found');
      return;
    }
    const symbols = {};
    let invested = 0;
    let currentValue = 0;
    trades.forEach(trade => {
      const symbol = trade.symbol;
      const qty = trade.qty;
      const entry = trade.entry;
      const price = marketPrices[symbol] ?? entry;
      const value = price * qty;
      invested += entry * qty;
      currentValue += value;
      if (!symbols[symbol]) {
        symbols[symbol] = { qty: 0, value: 0 };
      }
      symbols[symbol].qty += qty;
      symbols[symbol].value += value;
    });
    const netPL = currentValue - invested;
    container.innerHTML = `
      <p><strong>Total Positions:</strong> ${trades.length}</p>
      <p><strong>Total Invested:</strong> $${invested.toFixed(2)}</p>
      <p><strong>Current Value:</strong> $${currentValue.toFixed(2)}</p>
      <p><strong>Unrealized P/L:</strong> ${formatPL(netPL)}</p>
      <h3>Holdings by Symbol:</h3>
      <ul>
        ${Object.entries(symbols).map(([sym, data]) =>
          `<li>${sym}: ${data.qty} shares (${formatPL(data.value)})</li>`).join('')}
      </ul>
    `;
  }

  // 🟢 Ticker
  function renderTicker() {
    const ticker = document.getElementById('ticker-scroll');
    if (ticker) {
      ticker.textContent = `AAPL: $${marketPrices.AAPL} | GOOG: $${marketPrices.GOOG} | MSFT: $${marketPrices.MSFT} | TSLA: $${marketPrices.TSLA}`;
    }
  }

  // 🚀 Initialize
  const brokerFilter = document.getElementById('brokerFilter')?.value || 'all';
  const symbolSearch = document.getElementById('symbolSearch')?.value || '';
  renderTrades(brokerFilter, symbolSearch);
  renderCharts();
  renderTicker();
  renderPL();
  renderPortfolio();
});
