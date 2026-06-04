export interface MarketKeys {
  alphaVantageApiKey?: string;
  polygonApiKey?: string;
}

export interface MarketKeyResolverDeps {
  isCloudMode: boolean;
  globalKeys: MarketKeys;
  readCompanyKey: (companyId: string, name: string) => Promise<string | null>;
  resolveCompanyId: (req: { actor: any }) => string | undefined;
}

export function createMarketKeyResolver(deps: MarketKeyResolverDeps) {
  return async function resolveKeys(req: { actor: any }): Promise<MarketKeys> {
    if (!deps.isCloudMode) return { ...deps.globalKeys };
    const companyId = deps.resolveCompanyId(req);
    if (!companyId) return {};

    async function readOrNull(name: string): Promise<string | null> {
      try {
        return await deps.readCompanyKey(companyId!, name);
      } catch {
        return null;
      }
    }

    const [av, poly] = await Promise.all([
      readOrNull("data.alpha_vantage"),
      readOrNull("data.polygon"),
    ]);
    return {
      alphaVantageApiKey: av ?? deps.globalKeys.alphaVantageApiKey,
      polygonApiKey: poly ?? deps.globalKeys.polygonApiKey,
    };
  };
}
