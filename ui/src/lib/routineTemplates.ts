export interface RoutineTemplate {
  id: string;
  name: string;
  blurb: string;
  roleHint: string;
  defaultTitle: string;
  promptBody: string;
  cronExpression: string;
  timezone: string;
  scheduleLabel: string;
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: "daily-watchlist-briefing",
    name: "Daily watchlist briefing",
    blurb: "Overnight news + notable moves for your watchlist, every market morning.",
    roleHint: "Best with a News Sentinel agent",
    defaultTitle: "Daily watchlist briefing",
    promptBody:
      "Every weekday morning, review the user's watchlist tickers. Summarize the most important overnight news, pre-market moves, and notable price/volume changes for each. Produce a concise briefing (bullet points per ticker, then a short overall summary). Flag anything that may need the user's attention.",
    cronExpression: "0 8 * * 1-5",
    timezone: "America/New_York",
    scheduleLabel: "Weekdays 8:00am ET",
  },
  {
    id: "weekly-portfolio-review",
    name: "Weekly portfolio review",
    blurb: "Review your holdings and flag movers + allocation drift, every Monday.",
    roleHint: "Best with a Portfolio analyst agent",
    defaultTitle: "Weekly portfolio review",
    promptBody:
      "Once a week, review the user's current portfolio holdings. Identify the biggest gainers and losers over the past week, note any meaningful changes in allocation or concentration risk, and summarize the portfolio's overall posture. Provide a short, actionable review (not financial advice).",
    cronExpression: "0 7 * * 1",
    timezone: "America/New_York",
    scheduleLabel: "Mondays 7:00am ET",
  },
  {
    id: "earnings-watch",
    name: "Earnings watch",
    blurb: "Surface upcoming earnings for your watchlist + holdings, with what to watch.",
    roleHint: "Works with any research agent",
    defaultTitle: "Earnings watch",
    promptBody:
      "Each weekday, list the user's watchlist and holdings tickers that report earnings within the next 7 days. For each, note the report date and the key things to watch (estimates, recent guidance, prior surprises). Keep it brief and scannable.",
    cronExpression: "30 7 * * 1-5",
    timezone: "America/New_York",
    scheduleLabel: "Weekdays 7:30am ET",
  },
];

export function buildRoutineDraftFromTemplate(t: RoutineTemplate): { title: string; description: string } {
  return { title: t.defaultTitle, description: t.promptBody };
}
