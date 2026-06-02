import { api } from "./client";

export interface ApiKeysList {
  keys: string[]
}

export const apiKeysApi = {
  list: (companyId: string) =>
    api.get<ApiKeysList>(`/api-keys/${encodeURIComponent(companyId)}`),

  set: (companyId: string, kind: "ai" | "data", provider: string, value: string) =>
    api.post<{ ok: true }>(`/api-keys/${encodeURIComponent(companyId)}`, { kind, provider, value }),

  remove: (companyId: string, kind: "ai" | "data", provider: string) =>
    api.delete<void>(`/api-keys/${encodeURIComponent(companyId)}/${kind}/${encodeURIComponent(provider)}`),
};
