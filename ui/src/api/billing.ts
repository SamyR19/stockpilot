import { api } from "./client";

export interface BillingStatus {
  tier: "selfhost" | "free" | "keys" | "subscription"
  isCloudMode: boolean
  monthlyRunsUsed: number
  status: string
  currentPeriodEnd: string | null
}

export const billingApi = {
  status: (companyId: string) =>
    api.get<BillingStatus>(`/billing/${encodeURIComponent(companyId)}/status`),

  checkout: (companyId: string) =>
    api.post<{ url: string }>(`/billing/${encodeURIComponent(companyId)}/checkout`, {}),

  portal: (companyId: string) =>
    api.post<{ url: string }>(`/billing/${encodeURIComponent(companyId)}/portal`, {}),
};
