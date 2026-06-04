export interface AnalystPersona {
  id: string;
  name: string;
  blurb: string;
  skillKey: string;
  role: string;
  icon?: string;
}
function persona(id: string, name: string, blurb: string): AnalystPersona {
  return { id, name, blurb, skillKey: `paperclipai/optional/finance/${id}`, role: "researcher" };
}
export const ANALYST_PERSONAS: AnalystPersona[] = [
  persona("equity-analyst", "Equity Analyst", "Deep fundamental research on individual stocks with a BUY/HOLD/SELL call."),
  persona("news-sentinel", "News Sentinel", "Monitors and summarizes market-moving news + sentiment for your tickers."),
  persona("portfolio-manager", "Portfolio Manager", "Reviews holdings, allocation, and risk; surfaces actionable observations."),
  persona("macro-researcher", "Macro Researcher", "Analyzes rates, inflation, and growth and their impact on markets."),
  persona("quant-analyst", "Quant Analyst", "Quantitative/statistical analysis on prices and factors to find signals."),
  persona("earnings-scout", "Earnings Scout", "Tracks upcoming earnings, estimates, and post-report reactions."),
];
