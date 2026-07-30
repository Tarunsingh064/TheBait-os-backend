import { evaluate } from 'mathjs';

/** "A1" -> { row: 0, col: 0 }. Returns null if the string isn't a valid cell reference. */
function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!match) return null;
  const [, colLetters, rowDigits] = match;
  let col = 0;
  for (const ch of colLetters.toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { row: parseInt(rowDigits, 10) - 1, col: col - 1 };
}

function expandRange(rangeExpr: string): { row: number; col: number }[] {
  const [startRef, endRef] = rangeExpr.split(':');
  const start = parseCellRef(startRef);
  const end = endRef ? parseCellRef(endRef) : start;
  if (!start || !end) return [];

  const cells: { row: number; col: number }[] = [];
  const rowStart = Math.min(start.row, end.row);
  const rowEnd = Math.max(start.row, end.row);
  const colStart = Math.min(start.col, end.col);
  const colEnd = Math.max(start.col, end.col);
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) cells.push({ row: r, col: c });
  }
  return cells;
}

const RANGE_FN_PATTERN = /(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Za-z]+\d+(?::[A-Za-z]+\d+)?)\)/gi;
const CELL_REF_PATTERN = /\b([A-Za-z]+\d+)\b/g;

function resolveCell(
  grid: string[][],
  row: number,
  col: number,
  cache: Map<string, string>,
  visiting: Set<string>,
): string {
  const key = `${row},${col}`;
  if (cache.has(key)) return cache.get(key) as string;

  const raw = grid[row]?.[col] ?? '';
  if (!raw.startsWith('=')) {
    cache.set(key, raw);
    return raw;
  }

  if (visiting.has(key)) return '#CYCLE!';
  visiting.add(key);
  try {
    const result = evaluateFormula(raw.slice(1), grid, cache, visiting);
    cache.set(key, result);
    return result;
  } finally {
    visiting.delete(key);
  }
}

function cellsToNumbers(
  grid: string[][],
  cells: { row: number; col: number }[],
  cache: Map<string, string>,
  visiting: Set<string>,
): number[] {
  return cells
    .map((c) => resolveCell(grid, c.row, c.col, cache, visiting))
    .map((v) => parseFloat(v))
    .filter((n) => !Number.isNaN(n));
}

function evaluateFormula(expr: string, grid: string[][], cache: Map<string, string>, visiting: Set<string>): string {
  try {
    let substituted = expr.replace(RANGE_FN_PATTERN, (_match, fn: string, rangeExpr: string) => {
      const cells = expandRange(rangeExpr);
      const numbers = cellsToNumbers(grid, cells, cache, visiting);
      switch (fn.toUpperCase()) {
        case 'SUM':
          return String(numbers.reduce((a, b) => a + b, 0));
        case 'AVERAGE':
          return String(numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0);
        case 'MIN':
          return String(numbers.length ? Math.min(...numbers) : 0);
        case 'MAX':
          return String(numbers.length ? Math.max(...numbers) : 0);
        case 'COUNT':
          return String(numbers.length);
        default:
          return '0';
      }
    });

    substituted = substituted.replace(CELL_REF_PATTERN, (ref) => {
      const coords = parseCellRef(ref);
      if (!coords) return ref;
      const value = resolveCell(grid, coords.row, coords.col, cache, visiting);
      const num = parseFloat(value);
      return String(Number.isNaN(num) ? 0 : num);
    });

    const result = evaluate(substituted);
    return typeof result === 'number' ? String(result) : String(result ?? '');
  } catch {
    return '#ERROR!';
  }
}

/** Resolves every formula cell in the grid to its computed value — used to write a cached `.v` alongside the live `.f` formula on Excel export. */
export function computeDisplayGrid(data: string[][]): string[][] {
  const cache = new Map<string, string>();
  return data.map((row, r) => row.map((_cell, c) => resolveCell(data, r, c, cache, new Set())));
}
