import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query"
import { TrendingUp, Plug, Upload, Trash2, RefreshCw, Plus, Pencil, Check, X } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { brokerApi } from "../api/broker"
import type { BrokerConnection, PortfolioHolding } from "../api/broker"
import { portfolioApi } from "../api/portfolio"
import type { ManualHolding } from "../api/portfolio"
import { marketApi } from "../api/market"
import type { StockQuote } from "../api/market"
import { Button } from "@/components/ui/button"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"
import { useToastActions } from "../context/ToastContext"

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value)
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function ConnectionCard({ conn, onDisconnect }: { conn: BrokerConnection; onDisconnect: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <p className="text-sm font-medium capitalize">{conn.broker}</p>
        <p className="text-xs text-muted-foreground">
          {conn.lastSyncedAt ? `Last synced ${new Date(conn.lastSyncedAt).toLocaleDateString()}` : "Never synced"}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onDisconnect} aria-label={`Disconnect ${conn.broker}`} className="text-destructive hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function HoldingsTable({ holdings }: { holdings: PortfolioHolding[] }) {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0)
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Holdings</h2>
        <span className="text-sm font-semibold">{formatCurrency(totalValue)} total</span>
      </div>
      <div className="border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Ticker</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Qty</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Avg Cost</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Market Value</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Gain/Loss</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {holdings.map((h) => {
              const costBasis = h.quantity * h.averageCost
              const gainLoss = h.marketValue - costBasis
              const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0
              return (
                <tr key={`${h.ticker}-${h.broker}`} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold">{h.ticker}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(h.averageCost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(h.marketValue)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${gainLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {formatCurrency(gainLoss)} ({formatPercent(gainLossPct)})
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground capitalize">{h.broker}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ManualHoldingsSection({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  const { pushToast } = useToastActions()

  // Add form state
  const [addTicker, setAddTicker] = useState("")
  const [addShares, setAddShares] = useState("")
  const [addAvgCost, setAddAvgCost] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Edit state: holdingId -> partial edit values
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editShares, setEditShares] = useState("")
  const [editAvgCost, setEditAvgCost] = useState("")

  // Delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const holdingsQuery = useQuery({
    queryKey: queryKeys.portfolio.holdings(companyId),
    queryFn: () => portfolioApi.listHoldings(companyId),
    enabled: !!companyId,
  })

  const holdings = holdingsQuery.data ?? []

  // Get unique tickers for quotes
  const uniqueTickers = Array.from(new Set(holdings.map((h) => h.ticker.toUpperCase())))

  const quoteResults = useQueries({
    queries: uniqueTickers.map((ticker) => ({
      queryKey: queryKeys.market.quote(ticker),
      queryFn: () => marketApi.getQuote(ticker),
      retry: 1,
    })),
  })

  // Build a map ticker -> quote
  const quoteByTicker: Record<string, StockQuote | null> = {}
  uniqueTickers.forEach((ticker, i) => {
    const result = quoteResults[i]
    quoteByTicker[ticker] = result?.data ?? null
  })
  const quoteLoadingTicker: Record<string, boolean> = {}
  uniqueTickers.forEach((ticker, i) => {
    quoteLoadingTicker[ticker] = quoteResults[i]?.isLoading ?? false
  })

  const invalidateHoldings = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.holdings(companyId) })

  const addMutation = useMutation({
    mutationFn: (data: { ticker: string; shares: string; avgCost?: string }) =>
      portfolioApi.addHolding(companyId, data),
    onSuccess: () => {
      invalidateHoldings()
      setAddTicker("")
      setAddShares("")
      setAddAvgCost("")
      setShowAddForm(false)
      setAddError(null)
      pushToast({ title: "Holding added", tone: "success" })
    },
    onError: () => {
      pushToast({ title: "Failed to add holding", tone: "error" })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      portfolioApi.updateHolding(companyId, id, data),
    onSuccess: () => {
      invalidateHoldings()
      setEditingId(null)
      pushToast({ title: "Holding updated", tone: "success" })
    },
    onError: () => {
      pushToast({ title: "Failed to update holding", tone: "error" })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => portfolioApi.removeHolding(companyId, id),
    onSuccess: () => {
      invalidateHoldings()
      setConfirmDeleteId(null)
      pushToast({ title: "Holding removed", tone: "success" })
    },
    onError: () => {
      pushToast({ title: "Failed to remove holding", tone: "error" })
    },
  })

  function handleAdd() {
    const ticker = addTicker.trim().toUpperCase()
    const sharesNum = Number(addShares)
    if (!ticker) { setAddError("Ticker is required."); return }
    if (!addShares || sharesNum <= 0 || isNaN(sharesNum)) { setAddError("Shares must be greater than 0."); return }
    setAddError(null)
    addMutation.mutate({
      ticker,
      shares: addShares,
      ...(addAvgCost.trim() ? { avgCost: addAvgCost.trim() } : {}),
    })
  }

  function startEdit(h: ManualHolding) {
    setEditingId(h.id)
    setEditShares(h.shares)
    setEditAvgCost(h.avgCost ?? "")
  }

  function commitEdit(id: string) {
    const data: Record<string, unknown> = { shares: editShares }
    if (editAvgCost.trim()) data.avgCost = editAvgCost.trim()
    updateMutation.mutate({ id, data })
  }

  // Totals
  let totalMarketValue = 0
  let totalGainLoss = 0
  let hasAnyPrice = false

  holdings.forEach((h) => {
    const ticker = h.ticker.toUpperCase()
    const quote = quoteByTicker[ticker]
    if (!quote) return
    const shares = Number(h.shares)
    const price = quote.price
    const mv = shares * price
    totalMarketValue += mv
    hasAnyPrice = true
    if (h.avgCost) {
      const avgCost = Number(h.avgCost)
      totalGainLoss += (price - avgCost) * shares
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Your Holdings</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAddForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add position
        </Button>
      </div>

      {showAddForm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium mb-3">Add position</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Ticker *</label>
              <input
                className="h-8 w-24 rounded border border-border bg-background px-2 text-sm font-mono uppercase"
                placeholder="AAPL"
                value={addTicker}
                onChange={(e) => setAddTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Shares *</label>
              <input
                className="h-8 w-24 rounded border border-border bg-background px-2 text-sm tabular-nums"
                placeholder="10"
                type="number"
                min="0"
                value={addShares}
                onChange={(e) => setAddShares(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Avg Cost</label>
              <input
                className="h-8 w-28 rounded border border-border bg-background px-2 text-sm tabular-nums"
                placeholder="150.00"
                type="number"
                min="0"
                value={addAvgCost}
                onChange={(e) => setAddAvgCost(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <Button size="sm" onClick={handleAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding…" : "Add"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setAddError(null) }}>
              Cancel
            </Button>
          </div>
          {addError && <p className="text-xs text-destructive mt-2">{addError}</p>}
        </div>
      )}

      {holdingsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading holdings…</p>
      ) : holdings.length === 0 ? (
        <EmptyState icon={TrendingUp} message="Add your first holding to track your portfolio." />
      ) : (
        <div className="border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Ticker</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Shares</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Avg Cost</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Market Value</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Gain/Loss</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {holdings.map((h) => {
                const ticker = h.ticker.toUpperCase()
                const quote = quoteByTicker[ticker]
                const isLoadingQuote = quoteLoadingTicker[ticker]
                const shares = Number(h.shares)
                const avgCost = h.avgCost ? Number(h.avgCost) : null
                const price = quote?.price ?? null
                const marketValue = price !== null ? shares * price : null
                const gainLoss = price !== null && avgCost !== null ? (price - avgCost) * shares : null
                const gainLossPct = gainLoss !== null && avgCost !== null && avgCost > 0
                  ? (gainLoss / (avgCost * shares)) * 100
                  : null
                const isEditing = editingId === h.id

                return (
                  <tr key={h.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold">{ticker}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEditing ? (
                        <input
                          className="h-7 w-20 rounded border border-border bg-background px-2 text-sm tabular-nums text-right"
                          type="number"
                          min="0"
                          value={editShares}
                          onChange={(e) => setEditShares(e.target.value)}
                        />
                      ) : (
                        Number(h.shares).toLocaleString()
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEditing ? (
                        <input
                          className="h-7 w-24 rounded border border-border bg-background px-2 text-sm tabular-nums text-right"
                          type="number"
                          min="0"
                          placeholder="—"
                          value={editAvgCost}
                          onChange={(e) => setEditAvgCost(e.target.value)}
                        />
                      ) : (
                        avgCost !== null ? formatCurrency(avgCost) : "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isLoadingQuote ? (
                        <span className="text-muted-foreground animate-pulse">…</span>
                      ) : price !== null ? (
                        formatCurrency(price)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {isLoadingQuote ? (
                        <span className="text-muted-foreground animate-pulse">…</span>
                      ) : marketValue !== null ? (
                        formatCurrency(marketValue)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${gainLoss === null ? "" : gainLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {isLoadingQuote ? (
                        <span className="text-muted-foreground animate-pulse">…</span>
                      ) : gainLoss !== null ? (
                        `${formatCurrency(gainLoss)}${gainLossPct !== null ? ` (${formatPercent(gainLossPct)})` : ""}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => commitEdit(h.id)}
                              disabled={updateMutation.isPending}
                              aria-label="Save"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setEditingId(null)}
                              aria-label="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : confirmDeleteId === h.id ? (
                          <>
                            <span className="text-xs text-muted-foreground mr-1">Delete?</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => removeMutation.mutate(h.id)}
                              disabled={removeMutation.isPending}
                              aria-label="Confirm delete"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="Cancel delete"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => startEdit(h)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => setConfirmDeleteId(h.id)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {hasAnyPrice && (
              <tfoot className="bg-muted/50 border-t border-border">
                <tr>
                  <td className="px-4 py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide" colSpan={4}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatCurrency(totalMarketValue)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${totalGainLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {formatCurrency(totalGainLoss)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

export function Portfolio() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvHoldings, setCsvHoldings] = useState<PortfolioHolding[]>([])
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([{ label: "Portfolio" }])
  }, [setBreadcrumbs])

  const { data: connections, isLoading: connLoading } = useQuery({
    queryKey: queryKeys.broker.connections(selectedCompanyId!),
    queryFn: () => brokerApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  })

  const { data: holdings, isLoading: holdingsLoading, refetch: refetchHoldings } = useQuery({
    queryKey: queryKeys.broker.portfolio(selectedCompanyId!),
    queryFn: () => brokerApi.getPortfolio(selectedCompanyId!),
    enabled: !!selectedCompanyId && (connections?.length ?? 0) > 0,
  })

  const disconnectMutation = useMutation({
    mutationFn: ({ connectionId }: { connectionId: string }) =>
      brokerApi.deactivateConnection(selectedCompanyId!, connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.broker.connections(selectedCompanyId!) })
      queryClient.invalidateQueries({ queryKey: queryKeys.broker.portfolio(selectedCompanyId!) })
    },
  })

  async function handleConnectSchwab() {
    if (!selectedCompanyId) return
    const win = window.open("", "_blank", "noopener,noreferrer")
    try {
      const { url } = await brokerApi.getSchwabAuthUrl(selectedCompanyId)
      if (win) win.location.href = url
    } catch {
      if (win) win.close()
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedCompanyId) return
    setCsvUploading(true)
    setCsvError(null)
    try {
      const result = await brokerApi.importCsv(selectedCompanyId, file)
      setCsvHoldings(result)
    } catch {
      setCsvError("Failed to import CSV. Please check the file format and try again.")
    } finally {
      setCsvUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={TrendingUp} message="Select a workspace to view portfolio." />
  }

  if (connLoading) return <PageSkeleton />

  const allHoldings = [...(holdings ?? []), ...csvHoldings]

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Connected broker accounts and holdings</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <div>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={csvUploading}>
              <Upload className="h-4 w-4 mr-1.5" />
              {csvUploading ? "Importing…" : "Import CSV"}
            </Button>
            {csvError && <p className="text-sm text-destructive mt-1">{csvError}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={handleConnectSchwab}>
            <Plug className="h-4 w-4 mr-1.5" />
            Connect Schwab
          </Button>
        </div>
      </div>

      {(connections?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Connected Accounts</h2>
          {connections!.map((conn) => (
            <ConnectionCard
              key={conn.id}
              conn={conn}
              onDisconnect={() => disconnectMutation.mutate({ connectionId: conn.id })}
            />
          ))}
        </div>
      )}

      {(connections?.length ?? 0) === 0 ? (
        <EmptyState
          icon={TrendingUp}
          message="No broker connected. Click 'Connect Schwab' to link your account, or import a CSV."
        />
      ) : holdingsLoading ? (
        <p className="text-sm text-muted-foreground">Loading holdings…</p>
      ) : allHoldings.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span />
            <Button variant="ghost" size="sm" onClick={() => refetchHoldings()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
          <HoldingsTable holdings={allHoldings} />
        </div>
      ) : (
        <EmptyState icon={TrendingUp} message="No holdings found in connected accounts." />
      )}

      <div className="border-t border-border pt-6">
        <ManualHoldingsSection companyId={selectedCompanyId} />
      </div>
    </div>
  )
}
