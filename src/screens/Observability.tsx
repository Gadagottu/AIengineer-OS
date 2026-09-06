import { useEffect, useState } from "react";
import { api, ApiError, type ObservabilitySummary, type RateLimits } from "../api";
import { Empty, ErrorNote, Panel, ScreenHeader, Spinner, pretty } from "../ui";
import { useVoiceTargets } from "../voiceTargets";

const WINDOWS: { days: number; label: string }[] = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

const money = (usd: number) => (usd >= 0.01 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`);
const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3 text-center">
      <p className={`text-xl font-semibold ${tone ?? ""}`}>{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-muted">{label}</p>
    </div>
  );
}

/** A plain bar, so relative spend is readable without a charting dependency. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Observability() {
  const [days, setDays] = useState(1);
  const [data, setData] = useState<ObservabilitySummary | null>(null);
  const [limits, setLimits] = useState<RateLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (window: number) => {
    setLoading(true);
    api
      .observabilitySummary(window)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load telemetry."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(days);
  }, [days]);

  useEffect(() => {
    api.observabilityLimits().then(setLimits).catch(() => {});
  }, []);

  useVoiceTargets(
    [
      ...WINDOWS.map((w) => ({ id: `window:${w.days}`, label: w.label, kind: "select" as const })),
      { id: "refresh", label: "Refresh telemetry", kind: "action" as const },
    ],
    (id) => {
      if (id === "refresh") return load(days);
      if (id.startsWith("window:")) setDays(Number(id.slice(7)));
    },
  );

  const totals = data?.totals;
  const features = Object.entries(data?.by_feature ?? {}).sort((a, b) => b[1].cost - a[1].cost);
  const models = Object.entries(data?.by_model ?? {}).sort((a, b) => b[1].calls - a[1].calls);
  const maxCost = Math.max(0, ...features.map(([, f]) => f.cost));

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Observability"
        subtitle="Every LLM call this account has made — counted, costed and timed."
      >
        <div className="flex gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              aria-current={days === w.days ? "true" : undefined}
              className={days === w.days ? "btn-primary py-1.5 text-xs" : "btn-chip"}
            >
              {w.label}
            </button>
          ))}
        </div>
      </ScreenHeader>

      <ErrorNote error={error} />
      {loading && !data && <Spinner label="Loading telemetry" />}

      {totals && totals.calls === 0 && !loading && (
        <Empty
          title="No LLM calls in this window"
          hint="Use the tutor, run an interview or an agent, then come back."
        />
      )}

      {totals && totals.calls > 0 && (
        <>
          <Panel title="Totals" subtitle={`Window: ${WINDOWS.find((w) => w.days === days)?.label}`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="LLM calls" value={String(totals.calls)} />
              <Stat label="Estimated spend" value={money(totals.estimated_cost)} />
              <Stat label="Tokens" value={totals.total_tokens.toLocaleString()} />
              <Stat label="Avg latency" value={ms(totals.avg_latency_ms)} />
              <Stat label="p95 latency" value={ms(totals.p95_latency_ms)} />
              <Stat
                label="Success rate"
                value={`${Math.round(totals.success_rate * 100)}%`}
                tone={totals.success_rate >= 0.95 ? "text-emerald-500" : "text-amber-500"}
              />
              <Stat
                label="Failure rate"
                value={`${Math.round(totals.failure_rate * 100)}%`}
                tone={totals.failure_rate > 0 ? "text-red-400" : undefined}
              />
              <Stat
                label="Fallback calls"
                value={String(totals.fallback_calls)}
                tone={totals.fallback_calls > 0 ? "text-amber-500" : undefined}
              />
            </div>
            {totals.estimated_cost === 0 && totals.total_tokens > 0 && (
              <p className="mt-3 text-xs text-ink-muted">
                Spend shows $0 because the model in use has no price in the table — free-tier
                models are costed at zero rather than guessed.
              </p>
            )}
          </Panel>

          <Panel title="Spend by feature" subtitle="Which part of the app is costing you money.">
            <div className="space-y-2.5">
              {features.map(([name, f]) => (
                <div key={name}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{pretty(name)}</span>
                    <span className="text-xs text-ink-muted">
                      {f.calls} calls · {f.tokens.toLocaleString()} tokens · avg{" "}
                      {ms(f.avg_latency_ms)} · p95 {ms(f.p95_latency_ms)}
                      {f.failure_rate > 0 && (
                        <span className="text-red-400">
                          {" "}· {Math.round(f.failure_rate * 100)}% failed
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bar value={f.cost} max={maxCost} />
                    <span className="w-16 shrink-0 text-right text-xs">{money(f.cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Model usage">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 pr-3 font-medium">Calls</th>
                    <th className="py-2 pr-3 font-medium">Tokens</th>
                    <th className="py-2 pr-3 font-medium">Cost</th>
                    <th className="py-2 font-medium">Failure rate</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map(([name, m]) => (
                    <tr key={name} className="border-b border-line/60">
                      <td className="py-2 pr-3 font-mono text-xs">{name}</td>
                      <td className="py-2 pr-3">{m.calls}</td>
                      <td className="py-2 pr-3">{m.tokens.toLocaleString()}</td>
                      <td className="py-2 pr-3">{money(m.cost)}</td>
                      <td className={`py-2 ${m.failure_rate > 0 ? "text-red-400" : ""}`}>
                        {Math.round(m.failure_rate * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Slowest calls" subtitle="Where the waiting actually happens.">
            <ul className="space-y-1.5">
              {(data?.slowest ?? []).map((row, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="badge">{pretty(row.feature)}</span>
                  <span className="font-mono text-xs text-ink-muted">{row.model}</span>
                  <span className="ml-auto font-medium">{ms(row.latency_ms)}</span>
                  {!row.success && <span className="badge text-red-400">failed</span>}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Reliability"
            subtitle={
              totals.fallback_calls > 0
                ? `${totals.fallback_calls} call(s) were served by a fallback model.`
                : "No fallbacks needed in this window."
            }
          >
            {(data?.recent_errors ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">No failures recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {(data?.recent_errors ?? []).map((row, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="badge text-red-400">{row.error_type ?? "error"}</span>
                    <span className="badge">{pretty(row.feature)}</span>
                    <span className="font-mono text-xs text-ink-muted">{row.model}</span>
                    <span className="ml-auto text-xs text-ink-muted">
                      {new Date(row.timestamp).toLocaleTimeString()} · {row.request_id}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      {limits && (
        <Panel
          title="Rate limits"
          subtitle="Per user, per hour. Configured centrally, overridable by environment variable."
        >
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(limits.limits).map(([key, limit]) => (
              <span key={key} className="badge font-mono text-[10px]">
                {key}: {limit.max_calls}/{Math.round(limit.window_seconds / 60)}m
              </span>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
