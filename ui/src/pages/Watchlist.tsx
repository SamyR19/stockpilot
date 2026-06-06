import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, Eye, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { useToastActions } from "../context/ToastContext"
import { queryKeys } from "../lib/queryKeys"
import { watchlistApi } from "../api/watchlist"
import { marketApi } from "../api/market"
import { alertsApi } from "../api/alerts"
import type { AlertConditionType } from "../api/alerts"
import type { WatchlistTicker } from "../api/watchlist"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

const TICKER_RE = /^[A-Z0-9.\-^=]{1,20}$/i

function getDateStr(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function Sparkline({ ticker }: { ticker: string }) {
  const from = getDateStr(30)
  const to = getDateStr(0)
  const { data } = useQuery({
    queryKey: queryKeys.market.history(ticker, from, to),
    queryFn: () => marketApi.getHistory(ticker, from, to),
    staleTime: 300_000,
    retry: false,
  })

  const points = useMemo(() => {
    if (!data || data.length < 2) return null
    const closes = data.map((d) => d.close)
    const min = Math.min(...closes)
    const max = Math.max(...closes)
    const range = max - min || 1
    const W = 80
    const H = 24
    return closes
      .map((c, i) => {
        const x = (i / (closes.length - 1)) * W
        const y = H - ((c - min) / range) * H
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(" ")
  }, [data])

  const up = data && data.length >= 2 ? data[data.length - 1].close >= data[0].close : true
  const color = up ? "var(--color-green-500, #22c55e)" : "var(--color-red-500, #ef4444)"

  return (
    <svg width={80} height={24} className="shrink-0">
      {points && (
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

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
        {up ? "+" : ""}{data.change.toFixed(2)} ({up ? "+" : ""}{data.changePercent.toFixed(2)}%)
      </span>
    </span>
  )
}

type SetAlertCondition = "price_above" | "price_below" | "percent_change"

function SetAlertPopover({ ticker, companyId }: { ticker: string; companyId: string }) {
  const [open, setOpen] = useState(false)
  const [condition, setCondition] = useState<SetAlertCondition>("price_above")
  const [threshold, setThreshold] = useState("")
  const [validationError, setValidationError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { pushToast } = useToastActions()

  const createMutation = useMutation({
    mutationFn: () =>
      alertsApi.create(companyId, {
        ticker,
        conditionType: condition as AlertConditionType,
        threshold: String(threshold),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.list(companyId) })
      pushToast({ title: "Alert created", tone: "success" })
      setOpen(false)
      setThreshold("")
      setCondition("price_above")
      setValidationError(null)
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Failed to create alert",
        body: (err as { message?: string })?.message,
        tone: "error",
      })
    },
  })

  function handleCreate() {
    const val = parseFloat(threshold)
    if (isNaN(val) || val <= 0) {
      setValidationError("Enter a number greater than 0")
      return
    }
    setValidationError(null)
    createMutation.mutate()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Set alert for ${ticker}`} className="text-muted-foreground hover:text-foreground">
          <Bell className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-xs font-semibold mb-2">Set alert — <span className="font-mono">{ticker}</span></p>
        <div className="space-y-2">
          <Select value={condition} onValueChange={(v) => setCondition(v as SetAlertCondition)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price_above">Price above</SelectItem>
              <SelectItem value="price_below">Price below</SelectItem>
              <SelectItem value="percent_change">% change ≥</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            step="any"
            placeholder={condition === "percent_change" ? "e.g. 5" : "e.g. 150.00"}
            value={threshold}
            onChange={(e) => { setThreshold(e.target.value); setValidationError(null) }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="h-8 text-xs"
          />
          {validationError && <p className="text-xs text-destructive">{validationError}</p>}
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleCreate}
            disabled={createMutation.isPending}
          >
            Create alert
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TickerRow({ item, companyId, onRemove }: { item: WatchlistTicker; companyId: string; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className="font-mono font-semibold text-sm w-16">{item.ticker}</span>
        <QuoteBadge ticker={item.ticker} />
        <Sparkline ticker={item.ticker} />
      </div>
      <div className="flex items-center gap-1">
        {item.notes && <span className="text-xs text-muted-foreground hidden sm:block mr-2">{item.notes}</span>}
        <SetAlertPopover ticker={item.ticker} companyId={companyId} />
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
              companyId={selectedCompanyId}
              onRemove={() => removeMutation.mutate(item.ticker)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
