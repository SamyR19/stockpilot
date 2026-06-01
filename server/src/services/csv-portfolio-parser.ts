import Papa from 'papaparse'
import type { PortfolioHolding } from './schwab-client.js'

type CsvHolding = Omit<PortfolioHolding, 'broker'> & { broker: 'csv' }

function parseNum(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 0
  const cleaned = String(value).replace(/[$,%]/g, '').replace(/,/g, '').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function findColumn(headers: string[], ...candidates: string[]): string | undefined {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase())
    if (idx !== -1) return headers[idx]
  }
  return undefined
}

export function parseCsvPortfolio(csv: string): CsvHolding[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  const rows = result.data
  if (rows.length === 0) throw new Error('CSV is empty or has no data rows')

  const headers = Object.keys(rows[0])
  const symbolCol = findColumn(headers, 'symbol', 'ticker', 'stock')
  const qtyCol = findColumn(headers, 'quantity', 'qty', 'shares')
  const costCol = findColumn(headers, 'average cost basis', 'average cost', 'cost basis', 'avg cost', 'cost')
  const mvCol = findColumn(headers, 'market value', 'current value', 'value')

  if (!symbolCol || !qtyCol) {
    throw new Error('CSV must have at least Symbol and Quantity columns')
  }

  const holdings: CsvHolding[] = []
  for (const row of rows) {
    const ticker = (row[symbolCol] ?? '').replace(/"/g, '').trim()
    const quantity = parseNum(qtyCol ? row[qtyCol] : 0)
    if (!ticker || quantity === 0) continue
    holdings.push({
      ticker: ticker.toUpperCase(),
      assetType: 'EQUITY',
      quantity,
      averageCost: costCol ? parseNum(row[costCol]) : 0,
      marketValue: mvCol ? parseNum(row[mvCol]) : 0,
      broker: 'csv',
    })
  }
  return holdings
}
