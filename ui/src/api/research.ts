import { api } from "./client";

export interface ResearchReport {
  id: string
  ticker: string
  reportType: string
  content: string
  recommendation: string | null
  targetPriceCents: number | null
  issueId: string | null
  createdAt: string
  updatedAt: string
}

export const researchApi = {
  list: (companyId: string, ticker?: string) =>
    api.get<ResearchReport[]>(`/research/${encodeURIComponent(companyId)}${ticker ? `?ticker=${encodeURIComponent(ticker)}` : ""}`),
  get: (companyId: string, reportId: string) =>
    api.get<ResearchReport>(`/research/${encodeURIComponent(companyId)}/${encodeURIComponent(reportId)}`),
  remove: (companyId: string, reportId: string) =>
    api.delete<void>(`/research/${encodeURIComponent(companyId)}/${encodeURIComponent(reportId)}`),
};
