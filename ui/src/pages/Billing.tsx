import { useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { CreditCard, KeyRound, Zap } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { billingApi } from "../api/billing"
import { Button } from "@/components/ui/button"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

const TIER_LABEL: Record<string, string> = {
  selfhost: "Self-hosted (all features)",
  free: "Free",
  keys: "Bring your own keys",
  subscription: "Subscription",
}

export function Billing() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()

  useEffect(() => { setBreadcrumbs([{ label: "Billing" }]) }, [setBreadcrumbs])

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.billing.status(selectedCompanyId!),
    queryFn: () => billingApi.status(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  })

  const checkout = useMutation({
    mutationFn: () => billingApi.checkout(selectedCompanyId!),
    onSuccess: ({ url }) => { if (url) window.location.href = url },
  })
  const portal = useMutation({
    mutationFn: () => billingApi.portal(selectedCompanyId!),
    onSuccess: ({ url }) => { if (url) window.location.href = url },
  })

  if (!selectedCompanyId) return <EmptyState icon={CreditCard} message="Select a workspace to manage billing." />
  if (isLoading) return <PageSkeleton />
  if (!data) return <EmptyState icon={CreditCard} message="Billing is unavailable." />

  if (!data.isCloudMode) {
    return (
      <div className="space-y-6 p-6">
        <div><h1 className="text-xl font-semibold">Billing</h1></div>
        <EmptyState icon={Zap} message="You're self-hosting — all features are unlocked and there's nothing to pay. Add your own AI and data API keys under settings." />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your plan and usage</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Current plan</span>
          <span className="text-sm font-medium">{TIER_LABEL[data.tier] ?? data.tier}</span>
        </div>
        {data.tier === "free" && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Runs this month</span>
            <span className="text-sm tabular-nums">{data.monthlyRunsUsed} / 20</span>
          </div>
        )}
        {data.currentPeriodEnd && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Renews</span>
            <span className="text-sm">{new Date(data.currentPeriodEnd).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {data.tier === "subscription" ? (
          <Button onClick={() => portal.mutate()} disabled={portal.isPending}>
            <CreditCard className="h-4 w-4 mr-1.5" /> Manage subscription
          </Button>
        ) : (
          <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
            <Zap className="h-4 w-4 mr-1.5" /> Upgrade to Subscription
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <KeyRound className="h-3.5 w-3.5" /> Prefer to pay nothing? Add your own AI and data API keys to unlock all roles and unlimited runs.
      </p>
    </div>
  )
}
