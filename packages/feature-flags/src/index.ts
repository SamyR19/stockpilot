export type StockPilotMode = 'selfhost' | 'cloud'
export type UserTier = 'selfhost' | 'free' | 'keys' | 'subscription'
export type SubscriptionStatus = 'active' | 'keys' | 'past_due' | 'canceled' | null

export function getMode(): StockPilotMode {
  const mode = process.env.STOCKPILOT_MODE
  if (mode === 'cloud') return 'cloud'
  return 'selfhost'
}

export function isCloud(): boolean {
  return getMode() === 'cloud'
}

export function isSelfHost(): boolean {
  return getMode() === 'selfhost'
}

export function getUserTier(subscriptionStatus: SubscriptionStatus): UserTier {
  if (isSelfHost()) return 'selfhost'
  if (subscriptionStatus === 'active') return 'subscription'
  if (subscriptionStatus === 'keys') return 'keys'
  // past_due and canceled intentionally collapse to free — no access until renewed
  return 'free'
}

export const FREE_TIER_MONTHLY_RUNS = 20
export const FREE_TIER_AGENT_ROLES = ['news-sentinel'] as const
export const ALL_AGENT_ROLES = [
  'news-sentinel',
  'equity-analyst',
  'quant-analyst',
  'risk-manager',
  'macro-researcher',
  'portfolio-manager',
  'earnings-scout',
] as const

export type AgentRole = typeof ALL_AGENT_ROLES[number]

export function getAllowedRoles(tier: UserTier): readonly AgentRole[] {
  if (tier === 'free') return FREE_TIER_AGENT_ROLES
  return ALL_AGENT_ROLES
}

export function canUseRole(role: AgentRole, tier: UserTier): boolean {
  return (getAllowedRoles(tier) as readonly string[]).includes(role)
}

export type DataProvider = 'yahoo-finance' | 'alpha-vantage' | 'polygon'

const FREE_TIER_DATA_PROVIDERS: readonly DataProvider[] = ['yahoo-finance']

export function canUseDataProvider(provider: DataProvider, tier: UserTier): boolean {
  if (tier === 'free') return FREE_TIER_DATA_PROVIDERS.includes(provider)
  return true
}
