import { useEffect, useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { BarChart2, Search, TrendingUp, TrendingDown, ExternalLink } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { marketApi } from "../api/market"
import type { HistoricalPrice } from "../api/market"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "../components/EmptyState"

const TICKER_RE = /^[A-Z0-9.\-^=]{1,20}$/i

function PriceChart({ prices }: { prices: HistoricalPrice[] }) {
  if (prices.length < 2) return null
  const closes = prices.map((p) => p.close)
  const minClose = Math.min(...closes)
  const maxClose = Math.max(...closes)
  const range = maxClose - minClose || 1
  const w = 600
  const h = 120
  const pad = 8
  const points = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (w - pad * 2)
    const y = pad + ((maxClose - p.close) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
  const isUp = closes[closes.length - 1] >= closes[0]
  const color = isUp ? "#22c55e" : "#ef4444"
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex justify-between text-xs text-muted-foreground mb-2">
        <span>${minClose.toFixed(2)}</span>
        <span>30-day price history</span>
        <span>${maxClose.toFixed(2)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
        <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
      </svg>
    </div>
  )
}

function QuoteCard({ ticker }: { ticker: string }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), [])

  const { data: quote, isLoading: quoteLoading, error: quoteError } = useQuery({
    queryKey: queryKeys.market.quote(ticker),
    queryFn: () => marketApi.getQuote(ticker),
    staleTime: 60_000,
  })

  const { data: history } = useQuery({
    queryKey: queryKeys.market.history(ticker, thirtyDaysAgo, today),
    queryFn: () => marketApi.getHistory(ticker, thirtyDaysAgo, today),
    staleTime: 60_000,
  })

  const { data: news } = useQuery({
    queryKey: queryKeys.market.news(ticker, 5),
    queryFn: () => marketApi.getNews(ticker, 5),
    staleTime: 5 * 60_000,
  })

  if (quoteLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (quoteError) return <p className="text-sm text-destructive">Failed to load quote for {ticker}.</p>
  if (!quote) return null

  const up = quote.change >= 0

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-mono font-bold">{ticker}</h2>
            <p className="text-sm text-muted-foreground capitalize">{quote.marketState.toLowerCase()} market</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums">${quote.price.toFixed(2)}</p>
            <p className={`flex items-center justify-end gap-1 text-sm tabular-nums font-medium ${up ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {up ? "+" : ""}{quote.change.toFixed(2)} ({up ? "+" : ""}{quote.changePercent.toFixed(2)}%)
            </p>
          </div>
        </div>
        {(quote.fiftyTwoWeekHigh || quote.fiftyTwoWeekLow) && (
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            {quote.fiftyTwoWeekHigh && <span>52W High: <span className="text-foreground">${quote.fiftyTwoWeekHigh.toFixed(2)}</span></span>}
            {quote.fiftyTwoWeekLow && <span>52W Low: <span className="text-foreground">${quote.fiftyTwoWeekLow.toFixed(2)}</span></span>}
            {quote.volume && <span>Volume: <span className="text-foreground">{quote.volume.toLocaleString()}</span></span>}
          </div>
        )}
      </div>

      {history && history.length > 1 && <PriceChart prices={history} />}

      {news && news.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent News</h3>
          <div className="border border-border divide-y divide-border overflow-hidden">
            {news.map((item) => (
              <a
                key={item.url}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-accent/30 transition-colors no-underline text-inherit"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.source} · {new Date(item.publishedAt).toLocaleDateString()}
                    {item.sentiment && (
                      <Badge variant={item.sentiment === "positive" ? "default" : item.sentiment === "negative" ? "destructive" : "secondary"} className="ml-2 text-[10px]">
                        {item.sentiment}
                      </Badge>
                    )}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Market() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()
  const [input, setInput] = useState("")
  const [activeTicker, setActiveTicker] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([{ label: "Market" }])
  }, [setBreadcrumbs])

  function handleSearch() {
    const val = input.trim().toUpperCase()
    if (TICKER_RE.test(val)) setActiveTicker(val)
  }

  if (!selectedCompanyId) return <EmptyState icon={BarChart2} message="Select a company to use market data." />

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Market</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Look up quotes, price history, and news</p>
      </div>

      <div className="flex gap-2 max-w-sm">
        <Input
          placeholder="Enter ticker (e.g. AAPL)"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="font-mono"
          maxLength={20}
        />
        <Button onClick={handleSearch}>
          <Search className="h-4 w-4 mr-1" />
          Look up
        </Button>
      </div>

      {activeTicker ? (
        <QuoteCard ticker={activeTicker} />
      ) : (
        <EmptyState icon={BarChart2} message="Enter a ticker symbol above to look up a stock." />
      )}
    </div>
  )
}
