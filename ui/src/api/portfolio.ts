import { api } from "./client";

export interface ManualHolding {
  id: string;
  ticker: string;
  shares: string;
  avgCost: string | null;
  notes: string | null;
}

export const portfolioApi = {
  listHoldings: (companyId: string) =>
    api.get<ManualHolding[]>(`/portfolio/${encodeURIComponent(companyId)}/holdings`),

  addHolding: (
    companyId: string,
    data: { ticker: string; shares: string; avgCost?: string; notes?: string },
  ) =>
    api.post<ManualHolding>(`/portfolio/${encodeURIComponent(companyId)}/holdings`, data),

  updateHolding: (companyId: string, id: string, data: Record<string, unknown>) =>
    api.patch<ManualHolding>(
      `/portfolio/${encodeURIComponent(companyId)}/holdings/${id}`,
      data,
    ),

  removeHolding: (companyId: string, id: string) =>
    api.delete<{ ok: true }>(`/portfolio/${encodeURIComponent(companyId)}/holdings/${id}`),
};
