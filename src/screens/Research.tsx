import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type Conflict,
  type Finding,
  type ResearchSession,
  type ResearchSource,
  type TimelineStep,
} from "../api";
import { ErrorNote, Icon, ICONS, Panel, ScreenHeader, Spinner, asArray, pretty } from "../ui";
import { useVoiceTargets } from "../voiceTargets";

const CONF: Record<string, string> = {
  high: "border-emerald-500/50 text-emerald-500",
  medium: "border-amber-500/50 text-amber-500",
  low: "border-line text-ink-muted",
  unrelated: "border-line text-ink-muted",
};

const STAGE_ICON: Record<string, string> = {
  start: "◆",
  search: "🔎",
  opened: "✓",
  discovered: "✦",
  blocked: "⚠",
  failed: "✕",
  plan: "→",
  stop: "■",
};



/** Both confidences, always together: is it you, and is the claim solid. */
function ConfidencePair({ finding }: { finding: Finding }) {
  return (
    <>
      <span className={`badge ${CONF[finding.identity_confidence]}`}>
        identity: {finding.identity_confidence}
      </span>
      <span className={`badge ${CONF[finding.fact_confidence]}`}>
        fact: {finding.fact_confidence}
      </span>
    </>
  );
}

function EvidenceList({ finding }: { finding: Finding }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {finding.evidence.map((e, i) => (
        <li key={i} className="text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="badge">{pretty(e.source_type)}</span>
            <span className="text-ink">{e.title}</span>
          </div>
          {e.snippet && <p className="mt-0.5 text-ink-muted">“{e.snippet}”</p>}
          <a href={e.url} target="_blank" rel="noreferrer noopener" className="underline text-ink-muted">
            {e.url}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function Research() {
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [form, setForm] = useState({ name: "", portfolio: "", github: "", other: "" });
  const [deep, setDeep] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    api
      .getResearch()
      .then((s) => {
        setSession(s);
        if (s?.identity) setForm((f) => ({ ...f, ...s.identity }));
      })
      .catch(() => {});
  }, []);

  async function research() {
    if (!form.name.trim() && !form.portfolio && !form.github && !form.other) {
      return setError("Give a name, or at least one public URL.");
    }
    setRunning(true);
    setError(null);
    setNote(null);
    try {
      setSession(await api.runResearch({ ...form, deep }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Research failed.");
    } finally {
      setRunning(false);
    }
  }

  async function decide(finding: Finding, approve: boolean) {
    setBusy(finding.id);
    setError(null);
    try {
      const result = approve
        ? await api.approveFinding(finding.id)
        : await api.ignoreFinding(finding.id);
      setSession((s) =>
        s ? { ...s, findings: (s.findings ?? []).map((f) => (f.id === finding.id ? result.finding : f)) } : s,
      );
      if (approve) setNote(`Added “${finding.label}” to Personal Details.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save that decision.");
    } finally {
      setBusy(null);
    }
  }

  async function bio(style: "short" | "professional" | "interview" | "technical") {
    setBusy(style);
    setError(null);
    try {
      const r = await api.researchBio(style);
      setSession((s) =>
        s ? { ...s, generated_bios: { ...(s.generated_bios ?? {}), [style]: { text: r.text, generated_at: "" } } } : s,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate that bio.");
    } finally {
      setBusy(null);
    }
  }

  const findings = session?.findings ?? [];
  const pending = findings.filter((f) => f.status === "pending" || f.status === "changed");
  const sources = session?.sources ?? [];
  const summary = session?.summary;

  // Two levels in one screen: findings are addressable by name, and the one currently
  // open adds its own decisions on top. Approving writes to Personal Details, so it is
  // flagged destructive and the backend demands a spoken confirmation first.
  const opened = findings.find((f) => f.id === open);
  useVoiceTargets(
    [
      { id: "run", label: "Run research", kind: "action" as const },
      ...(["short", "professional", "interview", "technical"] as const).map((style) => ({
        id: `bio:${style}`,
        label: `${style} bio`,
        kind: "action" as const,
      })),
      ...(opened
        ? [
            { id: "approve", label: "Approve finding", kind: "action" as const, destructive: true },
            { id: "ignore", label: "Ignore finding", kind: "action" as const },
            { id: "close", label: "Close finding", kind: "action" as const },
          ]
        : []),
      // Bounded: the merged list travels with every command, so it stays readable.
      ...findings.slice(0, 40).map((f) => ({
        id: `finding:${f.id}`,
        label: f.label,
        kind: "select" as const,
      })),
    ],
    (id) => {
      if (id === "run") return void research();
      if (id === "close") return setOpen(null);
      if (id === "approve" && opened) return void decide(opened, true);
      if (id === "ignore" && opened) return void decide(opened, false);
      if (id.startsWith("bio:")) {
        return void bio(id.slice(4) as "short" | "professional" | "interview" | "technical");
      }
      if (id.startsWith("finding:")) setOpen(id.slice(8));
    },
  );

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="🔎 Research Me"
        subtitle="An agent that searches the public web, follows leads, and shows its evidence. Nothing is saved until you approve it."
      />

      <ErrorNote error={error} />
      {note && (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-500">
          {note}
        </p>
      )}

      {/* Identity anchors --------------------------------------------------- */}
      <Panel
        title="Who should I research?"
        subtitle="A name is enough. URLs are identity anchors, not the only sources."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Your name", "Chandrasekhar Gadagottu"],
              ["portfolio", "Portfolio (optional)", "https://you.dev"],
              ["github", "GitHub (optional)", "https://github.com/you"],
              ["other", "Other public profile (optional)", "blog, docs, talks…"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <label key={key}>
              <span className="label">{label}</span>
              <input
                className="field"
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={research} disabled={running}>
            {running ? <Spinner label="Researching the public web" /> : "🔎 Research Me"}
          </button>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
            Deep research <span className="text-xs">(more rounds, more leads)</span>
          </label>
          {session?.completed_at && !running && (
            <span className="ml-auto text-xs text-ink-muted">
              Last researched {new Date(session.completed_at).toLocaleString()}
            </span>
          )}
        </div>

        {session && session.search_available === false && (
          <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-500">
            No web-search API key is configured, so the agent searched GitHub and your supplied
            URLs only. Add <span className="font-mono">BRAVE_API_KEY</span> to <span className="font-mono">.env</span>{" "}
            for full autonomous web search.
          </p>
        )}

        {session?.delta && (session.delta.new > 0 || session.delta.changed > 0) && !running && (
          <p className="mt-3 text-sm text-ink-muted">
            <span className="text-accent">{session.delta.new} new</span> ·{" "}
            <span className="text-amber-500">{session.delta.changed} changed</span> since the last run
          </p>
        )}
      </Panel>

      {/* Research summary --------------------------------------------------- */}
      {summary && (
        <Panel title="Research summary" icon="📊" subtitle="Every number here is counted, not generated.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["sources_researched", "Sources researched"],
                ["relevant_sources", "Relevant sources"],
                ["projects_discovered", "Projects"],
                ["skills_discovered", "Skills"],
                ["high_confidence_findings", "High confidence"],
                ["needs_review", "Needs review"],
                ["blocked_sources", "Blocked"],
                ["failed_sources", "Unreachable"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-xl border border-line bg-surface-2 p-3 text-center">
                <p className="text-xl font-semibold">{summary[key]}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-muted">{label}</p>
              </div>
            ))}
          </div>
          {!!session?.queries?.length && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-ink-muted">
                {session.queries.length} searches run
              </summary>
              <ul className="mt-2 space-y-0.5 font-mono text-ink-muted">
                {session.queries.map((q, i) => (
                  <li key={i}>· {q}</li>
                ))}
              </ul>
            </details>
          )}
        </Panel>
      )}

      {/* Research timeline -------------------------------------------------- */}
      {!!session?.timeline?.length && (
        <Panel title="Research timeline" icon="🔎" subtitle="How the agent found what it found.">
          <ol className="space-y-1.5">
            {session.timeline.map((step: TimelineStep, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-0.5 w-4 shrink-0 text-center text-xs ${
                    step.stage === "blocked"
                      ? "text-amber-500"
                      : step.stage === "failed"
                        ? "text-red-400"
                        : step.stage === "discovered"
                          ? "text-accent"
                          : "text-ink-muted"
                  }`}
                >
                  {STAGE_ICON[step.stage] ?? "·"}
                </span>
                <span className="min-w-0">
                  <span className={step.stage === "discovered" ? "text-ink" : "text-ink-muted"}>
                    {step.detail}
                  </span>
                  {step.url && (
                    <a
                      href={step.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ml-1.5 truncate text-xs text-ink-muted underline"
                    >
                      ↗
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {/* Identity warnings + conflicts -------------------------------------- */}
      {!!session?.identity_warnings?.length && (
        <Panel title="Possible identity mismatch" icon="⚠" subtitle="This may be a different person with the same name.">
          <ul className="space-y-2">
            {session.identity_warnings.map((w, i) => (
              <li key={i} className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                {w.message}
                <a href={w.source} target="_blank" rel="noreferrer noopener" className="mt-1 block text-xs underline">
                  {w.source}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {!!session?.conflicts?.length && (
        <Panel title="Conflicting information" icon="⚠" subtitle="Shown, not silently resolved.">
          {session.conflicts.map((c: Conflict, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label">{pretty(c.field)}</p>
              <ul className="space-y-1">
                {c.values.map((v, j) => (
                  <li key={j} className="text-sm">
                    <span className="badge">{pretty(v.type)}</span> <span>{v.value}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">{c.note}</p>
            </div>
          ))}
        </Panel>
      )}

      {/* How the web sees you ----------------------------------------------- */}
      {session?.insights && (
        <Panel
          title="How the web sees you"
          icon="🌐"
          subtitle={`From ${summary?.relevant_sources ?? 0} relevant source(s).`}
        >
          {session.insights.focus && <p className="prose-reply mb-3">{session.insights.focus}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["strengths", "Technical strengths"],
                ["projects", "Projects"],
                ["footprint", "Public footprint"],
                ["notable", "Notable public work"],
              ] as const
            ).map(([key, label]) => {
              const values = asArray(session.insights?.[key]);
              if (!values.length) return null;
              return (
                <div key={key} className="rounded-xl border border-line bg-surface-2 p-3">
                  <p className="label">{label}</p>
                  <ul className="space-y-1 text-sm">
                    {values.map((v, i) => <li key={i}>· {v}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Engineering DNA ----------------------------------------------------- */}
      {session?.engineering_dna && (
        <Panel title="Engineering DNA" icon="🧬" subtitle="Recurring themes across your public work.">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["technical_themes", "Technical themes"],
                ["engineering_patterns", "Engineering patterns"],
                ["specializations", "Specialisations"],
                ["emerging", "Emerging areas"],
                ["recommended", "Recommended to explore"],
              ] as const
            ).map(([key, label]) => {
              const values = asArray(session.engineering_dna?.[key]);
              if (!values.length) return null;
              return (
                <div key={key} className="rounded-xl border border-line bg-surface-2 p-3">
                  <p className="label">{label}</p>
                  <ul className="space-y-1 text-sm">
                    {values.map((v, i) => <li key={i}>· {v}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Discovery map -------------------------------------------------------- */}
      {findings.length > 0 && (
        <Panel title="Discovery map" icon="🕸" subtitle="Click any node to see the evidence behind it.">
          <div className="space-y-1 font-mono text-sm">
            <p className="text-ink">{session?.identity?.name || "YOU"}</p>
            {Object.entries(
              findings.reduce<Record<string, Finding[]>>((groups, f) => {
                (groups[f.section] ||= []).push(f);
                return groups;
              }, {}),
            ).map(([section, items], gi, arr) => (
              <div key={section}>
                <p className="text-ink-muted">
                  {gi === arr.length - 1 ? "└──" : "├──"} {pretty(section)} ({items.length})
                </p>
                <div className="ml-6 flex flex-wrap gap-1.5 py-1">
                  {items.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setOpen(open === f.id ? null : f.id)}
                      aria-expanded={open === f.id}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-accent ${
                        CONF[f.identity_confidence]
                      } ${f.status === "approved" ? "bg-emerald-500/10" : ""}`}
                    >
                      {f.label}
                      {f.source_urls.length > 1 && ` ·${f.source_urls.length}`}
                    </button>
                  ))}
                </div>
                {items
                  .filter((f) => f.id === open)
                  .map((f) => (
                    <div key={f.id} className="ml-6 rounded-xl border border-line bg-surface-2 p-3 font-sans">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="font-medium">{f.claim}</span>
                        <ConfidencePair finding={f} />
                      </p>
                      <EvidenceList finding={f} />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Findings + approval -------------------------------------------------- */}
      {findings.length > 0 && (
        <Panel
          title="Findings"
          subtitle={`${pending.length} awaiting your decision`}
          action={
            <span className="badge">
              <Icon path={ICONS.check} className="size-3" />
              Nothing is saved without approval
            </span>
          }
        >
          {pending.length === 0 ? (
            <p className="text-sm text-ink-muted">Every finding has been decided.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((f) => (
                <li key={f.id} className="rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="badge">{pretty(f.section)}</span>
                    <span className="font-medium">{f.claim}</span>
                    <ConfidencePair finding={f} />
                    {f.status === "changed" && <span className="badge text-amber-500">changed</span>}
                  </div>
                  <EvidenceList finding={f} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="btn-primary py-1.5 text-xs"
                      disabled={busy !== null}
                      onClick={() => decide(f, true)}
                      title={
                        f.identity_confidence === "low"
                          ? "Low identity confidence — review the evidence first"
                          : undefined
                      }
                    >
                      {busy === f.id ? "…" : "✓ Add to Personal Details"}
                    </button>
                    <button
                      className="btn-ghost py-1.5 text-xs"
                      disabled={busy !== null}
                      onClick={() => decide(f, false)}
                    >
                      Ignore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* AI bio ---------------------------------------------------------------- */}
      {findings.length > 0 && (
        <Panel title="AI professional bio" icon="✨" subtitle="Written only from verified findings.">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(["short", "professional", "interview", "technical"] as const).map((style) => (
              <button key={style} className="btn-chip" disabled={busy !== null} onClick={() => bio(style)}>
                {busy === style ? "…" : pretty(style)}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {Object.entries(session?.generated_bios ?? {}).map(([style, value]) => (
              <div key={style} className="rounded-xl border border-line bg-surface-2 p-3">
                <p className="mb-1 flex items-center gap-1.5">
                  <span className="label mb-0">{pretty(style)}</span>
                  <span className="badge">AI generated</span>
                </p>
                <textarea className="field text-sm" rows={3} defaultValue={value.text} aria-label={`${style} bio`} />
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Sources --------------------------------------------------------------- */}
      {sources.length > 0 && (
        <Panel
          title="Sources examined"
          subtitle="Blocked sources are recorded, never bypassed — research continues elsewhere."
        >
          <ul className="space-y-2">
            {sources.map((s: ResearchSource) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`badge ${
                    s.status === "ok"
                      ? CONF[s.identity_confidence]
                      : s.status === "blocked"
                        ? "text-amber-500"
                        : "text-red-400"
                  }`}
                >
                  {s.status === "ok" ? `${s.identity_confidence} · ${pretty(s.type)}` : s.status}
                </span>
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="truncate underline">
                  {s.title || s.url}
                </a>
                <span className="text-xs text-ink-muted">
                  {s.status === "ok" ? `${s.chars.toLocaleString()} chars` : s.error}
                </span>
                {s.origin && <span className="badge text-[10px]">{s.origin}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
