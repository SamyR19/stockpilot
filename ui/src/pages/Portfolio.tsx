import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { TrendingUp, Plug, Upload, Trash2, RefreshCw } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { brokerApi } from "../api/broker"
import type { BrokerConnection, PortfolioHolding } from "../api/broker"
import { Button } from "@/components/ui/button"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

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
    return <EmptyState icon={TrendingUp} message="Select a company to view portfolio." />
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
    </div>
  )
}
