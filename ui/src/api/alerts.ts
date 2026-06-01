import { api } from "./client";

export type AlertConditionType =
  | 'price_above'
  | 'price_below'
  | 'percent_change'
  | 'volume_spike'
  | 'earnings_date'

export interface AlertRule {
  id: string
  ticker: string
  conditionType: AlertConditionType
  threshold: string | null
  agentId: string | null
  active: boolean
  createdAt: string
}

export const CONDITION_LABELS: Record<AlertConditionType, string> = {
  price_above: 'Price above',
  price_below: 'Price below',
  percent_change: 'Price change %',
  volume_spike: 'Volume spike',
  earnings_date: 'Earnings date',
}

export const alertsApi = {
  list: (companyId: string) =>
    api.get<AlertRule[]>(`/alerts/${encodeURIComponent(companyId)}`),

  create: (companyId: string, data: { ticker: string; conditionType: AlertConditionType; threshold?: string | null }) =>
    api.post<AlertRule>(`/alerts/${encodeURIComponent(companyId)}`, data),

  delete: (companyId: string, alertId: string) =>
    api.delete<void>(`/alerts/${encodeURIComponent(companyId)}/${encodeURIComponent(alertId)}`),

  setActive: (companyId: string, alertId: string, active: boolean) =>
    api.patch<{ id: string; active: boolean }>(`/alerts/${encodeURIComponent(companyId)}/${encodeURIComponent(alertId)}`, { active }),
};
