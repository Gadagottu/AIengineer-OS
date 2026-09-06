import { useEffect, useState } from "react";
import {
  api,
  type Agent,
  type Completeness,
  type NewsItem,
  type ObservabilitySummary,
  type ResearchSession,
  type Turn,
  type User,
} from "../api";
import type { ScreenName } from "../App";
import { Icon, ICONS, Panel, ScreenHeader, Spinner } from "../ui";
import { useVoiceTargets } from "../voiceTargets";

/** Everything the home screen shows, each part independently optional. */
type Snapshot = {
  turns: Turn[];
  news: NewsItem[];
  completeness: Completeness | null;
  agents: Agent[];
  research: ResearchSession | null;
  telemetry: ObservabilitySummary | null;
};

const EMPTY: Snapshot = {
  turns: [],
  news: [],
  completeness: null,
  agents: [],
  research: null,
  telemetry: null,
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** A destination, with a live number so the tile says something true. */
function Tile({
  icon,
  name,
  detail,
  onOpen,
}: {
  icon: string;
  name: string;
  detail: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5
                 text-left transition-colors hover:border-accent/60"
    >
      <span className="mt-0.5 text-accent">
        <Icon path={icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{name}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-muted">{detail}</span>
      </span>
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
      <p className="label mb-0 mt-0.5">{label}</p>
    </div>
  );
}

export default function Home({
  user,
  onNavigate,
}: {
  user: User;
  onNavigate: (screen: ScreenName) => void;
}) {
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);

  // Each panel loads independently: one unreachable endpoint must not blank the page.
  useEffect(() => {
    let alive = true;
    const shrug = () => null;

    Promise.all([
      api.history(6).catch(shrug),
      api.news(3).catch(shrug),
      api.getProfile().catch(shrug),
      api.listAgents().catch(shrug),
      api.getResearch().catch(shrug),
      api.observabilitySummary(1).catch(shrug),
    ]).then(([history, news, profile, agents, research, telemetry]) => {
      if (!alive) return;
      setData({
        turns: history?.turns ?? [],
        news: news?.items ?? [],
        completeness: profile?.completeness ?? null,
        agents: agents?.agents ?? [],
        research: research ?? null,
        telemetry: telemetry ?? null,
      });
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  const { turns, news, completeness, agents, research, telemetry } = data;
  const findings = research?.findings ?? [];
  const pending = findings.filter((f) => f.status === "pending" || f.status === "changed");
  const lastAsked = [...turns].reverse().find((t) => t.role === "user");
  const totals = telemetry?.totals;

  const destinations: { id: ScreenName; icon: string; name: string; detail: string }[] = [
    {
      id: "tutor",
      icon: ICONS.tutor,
      name: "Tutor",
      detail: turns.length ? `${turns.length} recent turns` : "Ask anything, at your level",
    },
    {
      id: "news",
      icon: ICONS.news,
      name: "News",
      detail: news.length ? `${news.length} headlines ranked` : "Track the field",
    },
    {
      id: "interview",
      icon: ICONS.interview,
      name: "Interview",
      detail: "12 topics, 6 stages",
    },
    {
      id: "profile",
      icon: ICONS.profile,
      name: "Personal Details",
      detail: completeness ? `${completeness.percent}% complete` : "Build from real evidence",
    },
    {
      id: "research",
      icon: ICONS.research,
      name: "Research Me",
      detail: findings.length ? `${findings.length} findings` : "Search your public footprint",
    },
    {
      id: "agents",
      icon: ICONS.agents,
      name: "Agents",
      detail: agents.length
        ? `${agents.length} agent${agents.length === 1 ? "" : "s"} ready`
        : "Manufacture one on demand",
    },
  ];

  // Everything here is voice-addressable, including the two resume actions.
  useVoiceTargets(
    [
      ...destinations.map((d) => ({
        id: `go:${d.id}`,
        label: d.name,
        kind: "navigate" as const,
      })),
      { id: "go:observability", label: "Observability", kind: "navigate" as const },
      ...(lastAsked ? [{ id: "resume", label: "Continue learning", kind: "action" as const }] : []),
      ...(pending.length
        ? [{ id: "review", label: "Review findings", kind: "action" as const }]
        : []),
    ],
    (id) => {
      if (id === "resume") return onNavigate("tutor");
      if (id === "review") return onNavigate("research");
      if (id.startsWith("go:")) onNavigate(id.slice(3) as ScreenName);
    },
  );

  if (loading) return <Spinner label="Loading your workspace" />;

  return (
    <div className="space-y-5">
      <ScreenHeader
        title={`${greeting()}, ${user.display_name}`}
        subtitle={`${user.level} · ${user.voice_enrolled ? "voice enrolled" : "voice not enrolled"}`}
      >
        <button className="btn-ghost" onClick={() => onNavigate("observability")}>
          <Icon path={ICONS.observability} />
          Observability
        </button>
      </ScreenHeader>

      {/* Resume strip: the two things most likely to be why you opened the app. */}
      {(lastAsked || pending.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {lastAsked && (
            <button
              onClick={() => onNavigate("tutor")}
              className="rounded-2xl border border-line bg-surface p-4 text-left transition-colors
                         hover:border-accent/60"
            >
              <p className="label">Pick up where you left off</p>
              <p className="line-clamp-2 text-sm">{lastAsked.content}</p>
              <p className="mt-2 text-xs font-medium text-accent">Continue in Tutor →</p>
            </button>
          )}

          {pending.length > 0 && (
            <button
              onClick={() => onNavigate("research")}
              className="rounded-2xl border border-line bg-surface p-4 text-left transition-colors
                         hover:border-accent/60"
            >
              <p className="label">Waiting on you</p>
              <p className="text-sm">
                {pending.length} research finding{pending.length === 1 ? "" : "s"} need
                {pending.length === 1 ? "s" : ""} review before anything is saved.
              </p>
              <p className="mt-2 text-xs font-medium text-accent">Review evidence →</p>
            </button>
          )}
        </div>
      )}

      <Panel title="Where to" subtitle="Every module, with what is actually in it right now.">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((d) => (
            <Tile
              key={d.id}
              icon={d.icon}
              name={d.name}
              detail={d.detail}
              onOpen={() => onNavigate(d.id)}
            />
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Today in AI engineering"
          subtitle="Ranked by source credibility and freshness."
          action={
            <button className="btn-chip" onClick={() => onNavigate("news")}>
              All news
            </button>
          }
        >
          {news.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No live headlines cached yet. Open News to fetch them.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {news.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => onNavigate("news")}
                    className="w-full rounded-xl border border-line bg-surface-2 p-3 text-left
                               transition-colors hover:border-accent/60"
                  >
                    <p className="line-clamp-2 text-sm">{item.title}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-muted">
                      {item.source} · importance {item.importance}/10
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="System pulse"
          subtitle="Last 24 hours. Every number is counted, not modelled."
          action={
            <button className="btn-chip" onClick={() => onNavigate("observability")}>
              Details
            </button>
          }
        >
          {!totals || totals.calls === 0 ? (
            <p className="text-sm text-ink-muted">
              No model calls in the last day. Ask the tutor something and this fills in.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat value={String(totals.calls)} label="LLM calls" />
                <Stat value={totals.total_tokens.toLocaleString()} label="Tokens" />
                <Stat value={`$${totals.estimated_cost.toFixed(4)}`} label="Est. cost" />
                <Stat
                  value={`${(totals.p95_latency_ms / 1000).toFixed(1)}s`}
                  label="p95 latency"
                />
              </div>
              <div className="mt-4 border-t border-line pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted">Success rate</span>
                  <span className="font-mono tabular-nums text-accent">
                    {Math.round(totals.success_rate * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-700"
                    style={{ width: `${Math.round(totals.success_rate * 100)}%` }}
                  />
                </div>
                {totals.fallback_calls > 0 && (
                  <p className="mt-2 text-xs text-amber-500">
                    {totals.fallback_calls} call{totals.fallback_calls === 1 ? "" : "s"} served by
                    a fallback model.
                  </p>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>

      {completeness && completeness.missing.length > 0 && (
        <Panel
          title="Your profile has gaps"
          subtitle={`${completeness.filled} of ${completeness.total} sections have evidence behind them.`}
          action={
            <button className="btn-chip" onClick={() => onNavigate("profile")}>
              Fill them in
            </button>
          }
        >
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700"
              style={{ width: `${completeness.percent}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {completeness.missing.slice(0, 8).map((m) => (
              <span key={m} className="badge">
                {m}
              </span>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
