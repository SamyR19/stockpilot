import { describe, it, expect, vi } from "vitest";
import { createMarketKeyResolver } from "../market-key-resolver.js";

const global = { alphaVantageApiKey: "GAV", polygonApiKey: "GPOLY" };
const reqWith = (companyId?: string) => ({ actor: { companyId } }) as any;

describe("createMarketKeyResolver", () => {
  it("self-host returns global keys and never reads company secrets", async () => {
    const readCompanyKey = vi.fn();
    const resolve = createMarketKeyResolver({ isCloudMode: false, globalKeys: global, readCompanyKey, resolveCompanyId: () => "c1" });
    expect(await resolve(reqWith("c1"))).toEqual(global);
    expect(readCompanyKey).not.toHaveBeenCalled();
  });

  it("cloud with no company returns empty keys", async () => {
    const resolve = createMarketKeyResolver({ isCloudMode: true, globalKeys: global, readCompanyKey: vi.fn(), resolveCompanyId: () => undefined });
    expect(await resolve(reqWith(undefined))).toEqual({});
  });

  it("cloud uses company key for polygon and falls back to global for alpha_vantage", async () => {
    const readCompanyKey = vi.fn(async (_c: string, name: string) => (name === "data.polygon" ? "CPOLY" : null));
    const resolve = createMarketKeyResolver({ isCloudMode: true, globalKeys: global, readCompanyKey, resolveCompanyId: () => "c1" });
    expect(await resolve(reqWith("c1"))).toEqual({ alphaVantageApiKey: "GAV", polygonApiKey: "CPOLY" });
  });

  it("cloud: a read error falls back to global without throwing", async () => {
    const readCompanyKey = vi.fn(async () => { throw new Error("boom"); });
    const resolve = createMarketKeyResolver({ isCloudMode: true, globalKeys: global, readCompanyKey, resolveCompanyId: () => "c1" });
    expect(await resolve(reqWith("c1"))).toEqual(global);
  });
});
