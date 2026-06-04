import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { alertsApi, CONDITION_LABELS } from "../api/alerts"
import type { AlertRule, AlertConditionType } from "../api/alerts"
import { api } from "../api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

const TICKER_RE = /^[A-Z0-9.\-^=]{1,20}$/i
const CONDITION_TYPES: AlertConditionType[] = ['price_above', 'price_below', 'percent_change', 'volume_spike', 'earnings_date']
const NEEDS_THRESHOLD: AlertConditionType[] = ['price_above', 'price_below', 'percent_change']

function AlertRow({ rule, onDelete, onToggle }: { rule: AlertRule; onDelete: () => void; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className="font-mono font-semibold text-sm w-16">{rule.ticker}</span>
        <Badge variant={rule.active ? "default" : "secondary"} className="text-xs">
          {CONDITION_LABELS[rule.conditionType]}
          {rule.threshold ? ` ${rule.threshold}` : ""}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onToggle} title={rule.active ? "Disable alert" : "Enable alert"} aria-label={rule.active ? `Disable alert for ${rule.ticker}` : `Enable alert for ${rule.ticker}`}>
          {rule.active
            ? <ToggleRight className="h-4 w-4 text-green-500" />
            : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={`Delete alert for ${rule.ticker}`} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function Alerts() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()
  const queryClient = useQueryClient()
  const [ticker, setTicker] = useState("")
  const [conditionType, setConditionType] = useState<AlertConditionType>("price_above")
  const [threshold, setThreshold] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([{ label: "Alerts" }])
  }, [setBreadcrumbs])

  const { data: alerts, isLoading } = useQuery({
    queryKey: queryKeys.alerts.list(selectedCompanyId!),
    queryFn: () => alertsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  })

  interface AlertEvent {
    id: string
    ticker: string
    conditionType: AlertConditionType
    value: number | string | null
    triggeredAt: string
    notified: boolean
  }

  const EVENT_LABELS: Record<string, string> = {
    price_above: "Price above",
    price_below: "Price below",
    percent_change: "% change",
    volume_spike: "Volume spike",
    earnings_date: "Earnings date",
  }

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: queryKeys.alerts.events(selectedCompanyId!),
    queryFn: () => api.get<AlertEvent[]>(`/alerts/${encodeURIComponent(selectedCompanyId!)}/events`),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      alertsApi.create(selectedCompanyId!, {
        ticker: ticker.trim().toUpperCase(),
        conditionType,
        threshold: NEEDS_THRESHOLD.includes(conditionType) ? threshold : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.list(selectedCompanyId!) })
      setTicker("")
      setThreshold("")
      setFormError(null)
    },
    onError: (err: unknown) => setFormError((err as { message?: string })?.message ?? "Failed to create alert"),
  })

  const deleteMutation = useMutation({
    mutationFn: (alertId: string) => alertsApi.delete(selectedCompanyId!, alertId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.list(selectedCompanyId!) }),
  })

  const toggleMutation = useMutation({
    mutationFn: (rule: AlertRule) => alertsApi.setActive(selectedCompanyId!, rule.id, !rule.active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.list(selectedCompanyId!) }),
  })

  function handleCreate() {
    const t = ticker.trim().toUpperCase()
    if (!TICKER_RE.test(t)) { setFormError("Invalid ticker symbol"); return }
    if (NEEDS_THRESHOLD.includes(conditionType)) {
      if (!threshold.trim()) {
        setFormError("Threshold value is required for this condition type")
        return
      }
      if (!isFinite(Number(threshold)) || Number(threshold) <= 0) {
        setFormError("Threshold must be a positive number")
        return
      }
    }
    createMutation.mutate()
  }

  if (!selectedCompanyId) return <EmptyState icon={Bell} message="Select a workspace to manage alerts." />
  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Alerts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Get notified when price conditions are met</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-medium">New Alert</h2>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Ticker (e.g. AAPL)"
            value={ticker}
            onChange={(e) => { setTicker(e.target.value.toUpperCase()); setFormError(null) }}
            className="font-mono w-32"
            maxLength={20}
          />
          <Select value={conditionType} onValueChange={(v) => setConditionType(v as AlertConditionType)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_TYPES.map((ct) => (
                <SelectItem key={ct} value={ct}>{CONDITION_LABELS[ct]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {NEEDS_THRESHOLD.includes(conditionType) && (
            <Input
              placeholder="Value (e.g. 150)"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-32"
            />
          )}
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            Add Alert
          </Button>
        </div>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
      </div>

      {(alerts?.length ?? 0) === 0 ? (
        <EmptyState icon={Bell} message="No alerts set. Create one above." />
      ) : (
        <div className="border border-border overflow-hidden">
          {alerts!.map((rule) => (
            <AlertRow
              key={rule.id}
              rule={rule}
              onDelete={() => deleteMutation.mutate(rule.id)}
              onToggle={() => toggleMutation.mutate(rule)}
            />
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium">Triggered alerts</h2>
        </div>
        {eventsLoading ? (
          <div className="px-4 py-6 flex justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : (events?.length ?? 0) === 0 ? (
          <div className="px-4 py-6">
            <EmptyState icon={Bell} message="No alerts have triggered yet." />
          </div>
        ) : (
          events!.map((event) => (
            <div key={event.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-sm w-16">{event.ticker}</span>
                <span className="text-sm text-muted-foreground">
                  {EVENT_LABELS[event.conditionType] ?? event.conditionType}
                  {event.value != null ? ` ${event.value}` : ""}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(event.triggeredAt).toLocaleString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
