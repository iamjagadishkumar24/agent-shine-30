// Shared CSV cell escaper with formula-injection protection.
// Prefixes cells starting with =, +, -, @, tab, or CR with a single quote
// so spreadsheet software (Excel, Sheets, Numbers) treats them as text.
// See OWASP "Formula Injection" / CVE class CWE-1236.

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const raw = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : String(v);
  const neutralized = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(neutralized)) return `"${neutralized.replace(/"/g, '""')}"`;
  return neutralized;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvEscape).join(",") + "\n";
}
