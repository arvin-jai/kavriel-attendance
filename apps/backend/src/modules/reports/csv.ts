/** Minimal RFC 4180 CSV writer with spreadsheet formula-injection protection. */

type Cell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // A cell starting with = + - @ would run as a formula in Excel/Sheets; prefix a quote.
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  // BOM so Excel opens UTF-8 (e.g. ñ in names) correctly.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
