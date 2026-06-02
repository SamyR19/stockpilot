import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { watchlistApi } from "../api/watchlist"
import { marketApi } from "../api/market"
import type { WatchlistTicker } from "../api/watchlist"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

const TICKER_RE = /^[A-Z0-9.\-^=]{1,20}$/i

function QuoteBadge({ ticker }: { ticker: string }) {
  const { data } = useQuery({
    queryKey: queryKeys.market.quote(ticker),
    queryFn: () => marketApi.getQuote(ticker),
    staleTime: 60_000,
    retry: false,
  })
  if (!data) return <span className="text-xs text-muted-foreground">—</span>
  const up = data.change >= 0
  return (
    <span className={`flex items-center gap-1 text-sm tabular-nums ${up ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      ${data.price.toFixed(2)}
      <span className="text-xs opacity-70">
        ({up ? "+" : ""}{data.changePercent.toFixed(2)}%)
      </span>
    </span>
  )
}

function TickerRow({ item, onRemove }: { item: WatchlistTicker; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className="font-mono font-semibold text-sm w-16">{item.ticker}</span>
        <QuoteBadge ticker={item.ticker} />
      </div>
      <div className="flex items-center gap-3">
        {item.notes && <span className="text-xs text-muted-foreground hidden sm:block">{item.notes}</span>}
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${item.ticker} from watchlist`} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function Watchlist() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([{ label: "Watchlist" }])
  }, [setBreadcrumbs])

  const { data: tickers, isLoading } = useQuery({
    queryKey: queryKeys.watchlist.list(selectedCompanyId!),
    queryFn: () => watchlistApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  })

  const addMutation = useMutation({
    mutationFn: (ticker: string) => watchlistApi.add(selectedCompanyId!, ticker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.list(selectedCompanyId!) })
      setInput("")
      setError(null)
    },
    onError: (err: unknown) => {
      setError((err as { message?: string })?.message ?? "Failed to add ticker")
    },
  })

  const removeMutation = useMutation({
    mutationFn: (ticker: string) => watchlistApi.remove(selectedCompanyId!, ticker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.list(selectedCompanyId!) })
    },
  })

  function handleAdd() {
    const val = input.trim().toUpperCase()
    if (!TICKER_RE.test(val)) {
      setError("Invalid ticker symbol")
      return
    }
    addMutation.mutate(val)
  }

  if (!selectedCompanyId) return <EmptyState icon={Eye} message="Select a workspace to view your watchlist." />
  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Watchlist</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track tickers and monitor live prices</p>
        </div>
      </div>

      <div className="flex gap-2 max-w-sm">
        <Input
          placeholder="e.g. AAPL"
          value={input}
          onChange={(e) => { setInput(e.target.value.toUpperCase()); setError(null) }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="font-mono"
          maxLength={20}
        />
        <Button onClick={handleAdd} disabled={addMutation.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      {error && <p className="text-sm text-destructive -mt-4">{error}</p>}

      {(tickers?.length ?? 0) === 0 ? (
        <EmptyState icon={Eye} message="No tickers on your watchlist yet. Add one above." />
      ) : (
        <div className="border border-border overflow-hidden">
          {tickers!.map((item) => (
            <TickerRow
              key={item.id}
              item={item}
              onRemove={() => removeMutation.mutate(item.ticker)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
