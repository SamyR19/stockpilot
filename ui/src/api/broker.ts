import { api } from "./client";

export interface BrokerConnection {
  id: string
  companyId: string
  broker: string
  active: boolean
  lastSyncedAt: string | null
  tokenExpiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PortfolioHolding {
  ticker: string
  assetType: string
  quantity: number
  averageCost: number
  marketValue: number
  broker: string
}

export interface SchwabAuthUrlResponse {
  url: string
}

export const brokerApi = {
  listConnections: (companyId: string) =>
    api.get<BrokerConnection[]>(`/broker/connections/${companyId}`),

  deactivateConnection: (companyId: string, connectionId: string) =>
    api.delete<{ ok: true }>(`/broker/connections/${companyId}/${connectionId}`),

  getSchwabAuthUrl: (companyId: string) =>
    api.get<SchwabAuthUrlResponse>(`/broker/schwab/auth-url?companyId=${encodeURIComponent(companyId)}`),

  getPortfolio: (companyId: string) =>
    api.get<PortfolioHolding[]>(`/broker/portfolio/${companyId}`),

  importCsv: (companyId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`/api/broker/portfolio/${companyId}/csv-import`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    }).then(async (r) => {
      if (!r.ok) throw new Error(await r.text())
      return r.json() as Promise<PortfolioHolding[]>
    })
  },
};
