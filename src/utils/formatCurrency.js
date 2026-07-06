export function formatCurrency(value, options = {}) {
  const { showSymbol = true, minimumFractionDigits = 0, maximumFractionDigits = 2 } = options;
  const amount = Number(value || 0);
  const formatted = amount.toLocaleString('en-IN', { minimumFractionDigits, maximumFractionDigits });
  return showSymbol ? `₹${formatted}` : formatted;
}
