import { describe, it, expect } from 'vitest'
import { parseCsvPortfolio } from './csv-portfolio-parser.js'

const BASIC_CSV = `Symbol,Quantity,Average Cost Basis,Market Value
AAPL,10,150.00,1750.00
MSFT,5,280.00,1450.00`

const SCHWAB_EXPORT_CSV = `"Symbol","Description","Quantity","Price","Price Change %","Price Change $","Market Value","Day Change %","Day Change $","Cost Basis","Gain/Loss %","Gain/Loss $","Ratings","Reinvest Dividends?","Capital Gains?","% Of Account","Security Type"
"AAPL","Apple Inc","10","175.00","0.5%","$0.88","$1750.00","0.5%","$8.75","$1500.00","16.67%","$250.00","","Yes","Yes","25%","Common Stocks"
"MSFT","Microsoft Corp","5","290.00","","","$1450.00","","","$1400.00","","","","","","","Common Stocks"`

describe('parseCsvPortfolio', () => {
  it('parses minimal CSV with Symbol, Quantity, Average Cost Basis', () => {
    const holdings = parseCsvPortfolio(BASIC_CSV)
    expect(holdings).toHaveLength(2)
    expect(holdings[0].ticker).toBe('AAPL')
    expect(holdings[0].quantity).toBe(10)
    expect(holdings[0].averageCost).toBe(150.00)
    expect(holdings[0].marketValue).toBe(1750.00)
    expect(holdings[0].broker).toBe('csv')
  })

  it('parses Schwab export format with quoted fields', () => {
    const holdings = parseCsvPortfolio(SCHWAB_EXPORT_CSV)
    expect(holdings.find(h => h.ticker === 'AAPL')).toBeDefined()
    expect(holdings.find(h => h.ticker === 'MSFT')).toBeDefined()
  })

  it('skips rows with no ticker or zero quantity', () => {
    const csv = `Symbol,Quantity\n,10\nAAPL,0\nMSFT,5`
    const holdings = parseCsvPortfolio(csv)
    expect(holdings).toHaveLength(1)
    expect(holdings[0].ticker).toBe('MSFT')
  })

  it('strips dollar signs and commas from numeric fields', () => {
    const csv = `Symbol,Quantity,Market Value\nAAPL,10,"$1,750.00"`
    const holdings = parseCsvPortfolio(csv)
    expect(holdings[0].marketValue).toBe(1750.00)
  })

  it('throws on empty CSV', () => {
    expect(() => parseCsvPortfolio('')).toThrow('CSV is empty or has no data rows')
  })
})
