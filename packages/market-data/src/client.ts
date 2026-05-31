// stub — full implementation in Task 5
export class MarketDataClient {
  constructor(_config: import('./types.js').MarketDataProviderConfig) {}
  get availableProviders(): import('./types.js').MarketDataProvider[] { return ['yahoo-finance'] }
}
