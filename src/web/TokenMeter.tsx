export interface MeterState { used: number; limit: number | null; estimated: boolean }

/** Always-visible Token Meter: a vertical glass that fills from the bottom; the green-to-red gradient is fixed by height. Never blocks. */
export function TokenMeter({ meter }: { meter: MeterState | null }) {
  if (!meter) return null;
  const pct = meter.limit ? Math.min(100, (meter.used / meter.limit) * 100) : 0;
  return (
    <div className="token-glass">
      <div className="token-rest" style={{ height: `${100 - pct}%` }} />
      <span className="token-figures">
        {meter.estimated ? "~" : ""}{meter.used} / {meter.limit ?? "?"} tokens
      </span>
    </div>
  );
}
