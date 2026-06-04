export type KeyKind = "ai" | "data";
export interface KeyProviderMeta {
  kind: KeyKind;
  provider: string;
  label: string;
  helpUrl: string;
  placeholder: string;
}

export const AI_KEY_PROVIDERS: KeyProviderMeta[] = [
  { kind: "ai", provider: "anthropic", label: "Anthropic (Claude)", helpUrl: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-..." },
  { kind: "ai", provider: "openai", label: "OpenAI", helpUrl: "https://platform.openai.com/api-keys", placeholder: "sk-..." },
  { kind: "ai", provider: "gemini", label: "Google Gemini", helpUrl: "https://aistudio.google.com/app/apikey", placeholder: "AIza..." },
];

export const DATA_KEY_PROVIDERS: KeyProviderMeta[] = [
  { kind: "data", provider: "alpha_vantage", label: "Alpha Vantage", helpUrl: "https://www.alphavantage.co/support/#api-key", placeholder: "Your Alpha Vantage key" },
  { kind: "data", provider: "polygon", label: "Polygon.io", helpUrl: "https://polygon.io/dashboard/api-keys", placeholder: "Your Polygon key" },
];

export function isConnected(keys: string[], kind: KeyKind, provider: string): boolean {
  return keys.includes(`${kind}.${provider}`);
}
