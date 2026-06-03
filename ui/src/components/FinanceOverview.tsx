import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { queryKeys } from "../lib/queryKeys";
import { marketApi } from "../api/market";
import { brokerApi } from "../api/broker";
import { watchlistApi } from "../api/watchlist";

const INDICES = [
  { ticker: "^GSPC", label: "S&P 500" },
  { ticker: "^DJI", label: "Dow Jones" },
  { ticker: "^IXIC", label: "Nasdaq" },
] as const;

const WATCHLIST_LIMIT = 6;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function pctClass(n: number): string {
  return n >= 0
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function IndexCard({ ticker, label }: { ticker: string; label: string }) {
  const { data } = useQuery({
    queryKey: queryKeys.market.quote(ticker),
    queryFn: () => marketApi.getQuote(ticker),
    staleTime: 60_000,
    retry: false,
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {data ? (
        <>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatCurrency(data.price)}
          </p>
          <p className={`text-sm tabular-nums ${pctClass(data.changePercent)}`}>
            {formatPercent(data.changePercent)}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold text-muted-foreground">—</p>
          <p className="text-sm text-muted-foreground">—</p>
        </>
      )}
    </div>
  );
}

function PortfolioSnapshot({ companyId }: { companyId: string }) {
  const { data: connections } = useQuery({
    queryKey: queryKeys.broker.connections(companyId),
    queryFn: () => brokerApi.listConnections(companyId),
    staleTime: 60_000,
    retry: false,
  });

  const hasConnections = (connections?.length ?? 0) > 0;

  const { data: holdings } = useQuery({
    queryKey: queryKeys.broker.portfolio(companyId),
    queryFn: () => brokerApi.getPortfolio(companyId),
    enabled: hasConnections,
    staleTime: 60_000,
    retry: false,
  });

  if (connections === undefined) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Portfolio
        </h3>
        <p className="mt-2 text-2xl font-semibold text-muted-foreground">—</p>
      </div>
    );
  }

  if (!hasConnections) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Portfolio
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">No broker connected.</p>
        <Link
          to="/portfolio"
          className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
        >
          Connect on Portfolio →
        </Link>
      </div>
    );
  }

  const totalValue = (holdings ?? []).reduce((sum, h) => sum + h.marketValue, 0);
  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + h.quantity * h.averageCost,
    0,
  );
  const totalGain = totalValue - totalCost;
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Portfolio
      </h3>
      {holdings ? (
        <>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatCurrency(totalValue)}
          </p>
          <p className={`text-sm tabular-nums ${pctClass(totalGain)}`}>
            {formatCurrency(totalGain)} ({formatPercent(gainPct)})
          </p>
        </>
      ) : (
        <p className="mt-2 text-2xl font-semibold text-muted-foreground">—</p>
      )}
    </div>
  );
}

function MoverRow({ ticker }: { ticker: string }) {
  const { data } = useQuery({
    queryKey: queryKeys.market.quote(ticker),
    queryFn: () => marketApi.getQuote(ticker),
    staleTime: 60_000,
    retry: false,
  });

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="font-mono text-sm font-semibold">{ticker}</span>
      {data ? (
        <span className="flex items-center gap-3 tabular-nums">
          <span className="text-sm">{formatCurrency(data.price)}</span>
          <span className={`text-sm ${pctClass(data.changePercent)}`}>
            {formatPercent(data.changePercent)}
          </span>
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}

function WatchlistMovers({ companyId }: { companyId: string }) {
  const { data: watchlist } = useQuery({
    queryKey: queryKeys.watchlist.list(companyId),
    queryFn: () => watchlistApi.list(companyId),
    retry: false,
  });

  if (watchlist && watchlist.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Watchlist Movers
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No tickers on your watchlist.
        </p>
        <Link
          to="/watchlist"
          className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
        >
          Add tickers →
        </Link>
      </div>
    );
  }

  const tickers = (watchlist ?? []).slice(0, WATCHLIST_LIMIT);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Watchlist Movers
      </h3>
      <div className="mt-2 divide-y divide-border">
        {tickers.map((t) => (
          <MoverRow key={t.ticker} ticker={t.ticker} />
        ))}
      </div>
    </div>
  );
}

export function FinanceOverview({ companyId }: { companyId: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Market
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {INDICES.map((idx) => (
            <IndexCard key={idx.ticker} ticker={idx.ticker} label={idx.label} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PortfolioSnapshot companyId={companyId} />
        <WatchlistMovers companyId={companyId} />
      </div>
    </div>
  );
}
