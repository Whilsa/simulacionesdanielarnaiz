/**
 * Helper function for standard Spanish number and currency formatting.
 * Formats numbers with dots (.) for thousands and commas (,) for decimals.
 * Examples:
 * 3.942,90
 * 32,50
 * 543.876,00
 * 1.847.395,40
 * 3.384.475.291,02
 */

export function formatNumber(val: number | null | undefined, decimals: number = 2): string {
  if (val === null || val === undefined || isNaN(val)) {
    return (0).toFixed(decimals).replace('.', ',');
  }
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const fixed = absVal.toFixed(decimals);
  const [integerPart, decimalPart] = fixed.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const result = decimalPart !== undefined ? `${formattedInteger},${decimalPart}` : formattedInteger;
  return isNegative ? `-${result}` : result;
}

export function formatCurrency(val: number | null | undefined): string {
  return `${formatNumber(val, 2)} €`;
}
