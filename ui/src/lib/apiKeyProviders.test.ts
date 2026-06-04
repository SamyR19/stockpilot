import { describe, it, expect } from "vitest";
import { AI_KEY_PROVIDERS, DATA_KEY_PROVIDERS, isConnected } from "./apiKeyProviders";

describe("apiKeyProviders", () => {
  it("AI providers cover anthropic/openai/gemini", () => {
    expect(AI_KEY_PROVIDERS.map((p) => p.provider).sort()).toEqual(["anthropic", "gemini", "openai"]);
    expect(AI_KEY_PROVIDERS.every((p) => p.kind === "ai" && p.label && p.helpUrl)).toBe(true);
  });
  it("DATA providers cover alpha_vantage/polygon", () => {
    expect(DATA_KEY_PROVIDERS.map((p) => p.provider).sort()).toEqual(["alpha_vantage", "polygon"]);
    expect(DATA_KEY_PROVIDERS.every((p) => p.kind === "data")).toBe(true);
  });
  it("isConnected matches `${kind}.${provider}` names", () => {
    const keys = ["ai.anthropic", "data.polygon"];
    expect(isConnected(keys, "ai", "anthropic")).toBe(true);
    expect(isConnected(keys, "ai", "openai")).toBe(false);
    expect(isConnected(keys, "data", "polygon")).toBe(true);
  });
});
