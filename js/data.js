export function isValidDate(d) {
  return d && !isNaN(new Date(d).getTime());
}

export function normalizeTrade(trade) {
  return {
    id: trade.id || Date.now().toString(),
    broker: (trade.broker || "unknown").toLowerCase(),
    symbol: (trade.symbol || "").toUpperCase().trim(),
    type: (trade.type || "stock").toLowerCase(),
    date: isValidDate(trade.date) ? trade.date : new Date().toISOString().split("T")[0],
    exitDate: isValidDate(trade.exitDate) ? trade.exitDate : null,
    qty: parseFloat(trade.qty) || 0,
    entry: parseFloat(trade.entry) || 0,
    stopLoss: trade.stopLoss != null ? parseFloat(trade.stopLoss) : null,
    exit: trade.exit != null ? parseFloat(trade.exit) : null,
    fees: parseFloat(trade.fees) || 0,
    multiplier: parseFloat(trade.multiplier) || 1,
    notes: (trade.notes || '').replace(/[<>"'\\]/g, ''),
    tags: Array.isArray(trade.tags)
      ? trade.tags.map(t => t.replace(/[<>"'\\]/g, ''))
      : (trade.tags || '').split(',').map(t => t.trim()).filter(t => t).map(t => t.replace(/[<>"'\\]/g, ''))
  };
}

export function validateTrade(trade) {
  const validBrokers = ["etrade", "schwab", "fidelity", "webull", "robinhood"];
  const validTypes = ["stock", "option", "crypto", "etf"];
  return (
    validBrokers.includes(String(trade.broker).toLowerCase()) &&
    validTypes.includes(String(trade.type).toLowerCase()) &&
    trade.symbol && /^[A-Z0-9.-/]+$/.test(trade.symbol) &&
    trade.qty > 0 &&
    trade.entry > 0 &&
    trade.multiplier >= 1 &&
    (!trade.exit || trade.exit >= 0) &&
    (!trade.stopLoss || trade.stopLoss >= 0) &&
    (!trade.fees || trade.fees >= 0) &&
    isValidDate(trade.date) &&
    (!trade.exitDate || (isValidDate(trade.exitDate) && new Date(trade.exitDate) >= new Date(trade.date)))
  );
}
