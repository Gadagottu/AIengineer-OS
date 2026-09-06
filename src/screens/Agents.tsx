import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type Agent,
  type AgentRegistries,
  type AgentRun,
} from "../api";
import { Empty, ErrorNote, Panel, ScreenHeader, Spinner, pretty } from "../ui";
import { useVoiceTargets } from "../voiceTargets";

/** Starting points, so the create screen is never a blank box. */
const EXAMPLES = [
  "Create a Cybersecurity Agent that analyses vulnerabilities, explains CVEs, reviews code for security issues and recommends remediation",
  "Create a Kubernetes troubleshooting agent",
  "Create a RAG evaluation agent that judges retrieval and generation separately",
  "Create an agent that researches AI engineering news and explains why it matters",
  "Create a code review agent for Python security",
];

type View = { mode: "list" } | { mode: "create" } | { mode: "detail"; id: string };


function SpecSummary({ agent, registry }: { agent: Agent; registry: AgentRegistries | null }) {
  const unavailable = new Set(
    (registry?.tools ?? []).filter((t) => t.available === false).map((t) => t.name),
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <p className="label">Skills ({agent.skills.length})</p>
        <div className="flex flex-wrap gap-1.5">
          {agent.skills.map((s) => (
            <span key={s} className="badge">{pretty(s)}</span>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <p className="label">Tools ({agent.tools.length})</p>
        <div className="flex flex-wrap gap-1.5">
          {agent.tools.length === 0 && <span className="text-xs text-ink-muted">none</span>}
          {agent.tools.map((t) => (
            <span
              key={t}
              className={`badge ${unavailable.has(t) ? "text-amber-500" : ""}`}
              title={unavailable.has(t) ? "Assigned but not connected in this deployment" : undefined}
            >
              {pretty(t)}
              {unavailable.has(t) && " ⚠"}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <p className="label">Permissions</p>
        <div className="flex flex-wrap gap-1.5">
          {agent.permissions.length === 0 && (
            <span className="text-xs text-ink-muted">none — derived from tools</span>
          )}
          {agent.permissions.map((p) => (
            <span key={p} className="badge font-mono text-[10px]">{p}</span>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <p className="label">Runtime</p>
        <p className="text-sm text-ink-muted">
          Model {agent.model} · Memory {agent.memory_enabled ? "on" : "off"} ·{" "}
          {agent.runs.length} run{agent.runs.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

export default function Agents() {
  const [view, setView] = useState<View>({ mode: "list" });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [registry, setRegistry] = useState<AgentRegistries | null>(null);
  const [request, setRequest] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () =>
    api
      .listAgents()
      .then((r) => setAgents(r.agents))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load agents."))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.agentRegistry().then(setRegistry).catch(() => {});
  }, []);

  const current = view.mode === "detail" ? agents.find((a) => a.agent_id === view.id) : undefined;

  async function run<T>(label: string, fn: () => Promise<T>, after?: (r: T) => void) {
    setBusy(label);
    setError(null);
    try {
      const result = await fn();
      after?.(result);
      if (!after) await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `${label} failed.`);
    } finally {
      setBusy(null);
    }
  }

  const create = () =>
    run("create", () => api.createAgent(request.trim()), async (agent) => {
      setRequest("");
      await load();
      setView({ mode: "detail", id: agent.agent_id });
    });

  const send = () => {
    if (!current || !message.trim()) return;
    const text = message.trim();
    setMessage("");
    run("run", () => api.runAgent(current.agent_id, text), async () => {
      await load();
    });
  };

  /**
   * Turn a spoken request into something the factory can design from.
   *
   * "I want to create a cybersecurity agent" is a request; "create agent" is just the
   * button's name. Anything that survives stripping the command words is the brief.
   */
  const briefFrom = (phrase?: string) => {
    const brief = (phrase ?? "")
      .replace(/^\s*(please|hey|ok(ay)?)\s+/i, "")
      .replace(/^\s*(i\s+(want|need|would like)\s+(to\s+)?|let'?s\s+|can\s+you\s+(please\s+)?)/i, "")
      .replace(/^\s*(create|make|build|add|design)\s+(me\s+)?(an?\s+)?/i, "")
      .trim();
    // "create agent" is the button's own name, not a brief. One bare word never is.
    return brief.split(/\s+/).length >= 2 && brief.length >= 8 ? brief : "";
  };

  /** Open the create form, and build straight away when the words carried a brief. */
  const startCreate = (phrase?: string) => {
    const brief = briefFrom(phrase);
    setView({ mode: "create" });
    // No brief spoken: build whatever is already typed, or just show the empty form.
    if (!brief) return request.trim().length >= 5 ? create() : undefined;
    setRequest(brief);
    return run("create", () => api.createAgent(brief), async (agent) => {
      setRequest("");
      await load();
      setView({ mode: "detail", id: agent.agent_id });
    });
  };

  // Each view registers its own controls. Destructive ones are flagged, so the backend
  // demands a spoken confirmation before they fire.
  useVoiceTargets(
    view.mode === "detail" && current
      ? [
          { id: "back", label: "Back to agents", kind: "navigate" as const },
          { id: "evaluate", label: "Evaluate agent", kind: "action" as const },
          { id: "delete", label: "Delete agent", kind: "action" as const, destructive: true },
        ]
      : view.mode === "create"
        ? [
            // Dictation: whatever was said becomes the brief, then builds.
            { id: "dictate", label: "Create agent", kind: "input" as const },
            { id: "submit", label: "Build it", kind: "action" as const },
            { id: "back", label: "Back to agents", kind: "navigate" as const },
            ...EXAMPLES.map((example) => ({
              id: `example:${example}`,
              label: example.replace(/^Create an? /, ""),
              kind: "select" as const,
            })),
          ]
        : [
            { id: "create", label: "Create agent", kind: "action" as const },
            ...agents.map((a) => ({
              id: `agent:${a.agent_id}`,
              label: a.name,
              kind: "select" as const,
            })),
          ],
    (id, phrase) => {
      if (id === "back") return setView({ mode: "list" });

      // Same behaviour from the list and from the create screen, because the user means
      // the same thing in both places: a phrase carrying a brief ("an agent on cyber
      // security") is a build request; a bare "create agent" only opens the form.
      if (id === "create" || id === "dictate") return startCreate(phrase);

      if (id === "submit") return request.trim().length >= 5 ? create() : undefined;
      if (id.startsWith("example:")) return setRequest(id.slice(8));

      if (id === "evaluate" && current) {
        return run("evaluate", () => api.evaluateAgent(current.agent_id));
      }
      if (id === "delete" && current) {
        return run("delete", () => api.deleteAgent(current.agent_id), async () => {
          await load();
          setView({ mode: "list" });
        });
      }
      if (id.startsWith("agent:")) setView({ mode: "detail", id: id.slice(6) });
    },
  );

  // ------------------------------------------------------------------ create

  if (view.mode === "create") {
    return (
      <div className="space-y-5">
        <ScreenHeader title="Create an agent" subtitle="Describe what you need. The factory designs and validates it.">
          <button className="btn-ghost" onClick={() => setView({ mode: "list" })}>
            Back
          </button>
        </ScreenHeader>

        <ErrorNote error={error} />

        <Panel title="What should this agent do?" subtitle="One sentence is enough.">
          <textarea
            className="field"
            rows={4}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Create a Cybersecurity Agent that reviews Python code for security vulnerabilities…"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                className="btn-chip"
                disabled={busy !== null}
                onClick={() => setRequest(example)}
              >
                {example.replace(/^Create an? /, "").slice(0, 46)}…
              </button>
            ))}
          </div>
          <button
            className="btn-primary mt-4"
            disabled={busy !== null || request.trim().length < 5}
            onClick={create}
          >
            {busy === "create" ? <Spinner label="Designing agent" /> : "Create agent"}
          </button>
        </Panel>

        {registry && (
          <Panel
            title="What it can be composed from"
            subtitle="The factory may only choose from these. Anything else is discarded by the validator."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="label">Skills ({registry.skills.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {registry.skills.map((s) => (
                    <span key={s.name} className="badge" title={s.description}>
                      {pretty(s.name)}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="label">Tools ({registry.tools.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {registry.tools.map((t) => (
                    <span
                      key={t.name}
                      className={`badge ${t.available === false ? "text-amber-500" : ""}`}
                      title={`${t.description} · requires ${t.permission}`}
                    >
                      {pretty(t.name)}
                      {t.available === false && " ⚠"}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  ⚠ = registered but not connected in this deployment. An agent may be given one,
                  and the runtime will say so rather than pretend.
                </p>
              </div>
            </div>
          </Panel>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ detail

  if (view.mode === "detail" && current) {
    return (
      <div className="space-y-5">
        <ScreenHeader title={current.name} subtitle={current.role || current.description}>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setView({ mode: "list" })}>
              Back
            </button>
            <button
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() =>
                run("toggle", () =>
                  api.patchAgent(current.agent_id, {
                    status: current.status === "ready" ? "disabled" : "ready",
                  }),
                )
              }
            >
              {current.status === "ready" ? "Disable" : "Enable"}
            </button>
            <button
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() =>
                run("evaluate", () => api.evaluateAgent(current.agent_id))
              }
            >
              {busy === "evaluate" ? <Spinner label="Evaluating" /> : "Evaluate"}
            </button>
          </div>
        </ScreenHeader>

        <ErrorNote error={error} />

        <Panel
          title="Specification"
          subtitle={current.goal}
          action={
            <span className={`badge ${current.status === "ready" ? "text-emerald-500" : "text-amber-500"}`}>
              {current.status}
            </span>
          }
        >
          <SpecSummary agent={current} registry={registry} />
          {current.validation_notes.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="label text-amber-500">Validator changed this specification</p>
              <ul className="space-y-0.5 text-xs text-amber-500">
                {current.validation_notes.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Run" subtitle="One generic runtime executes every specification.">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              className="field"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Ask ${current.name} something…`}
              disabled={current.status !== "ready"}
            />
            <button className="btn-primary" disabled={busy !== null || !message.trim()}>
              {busy === "run" ? "…" : "Send"}
            </button>
          </form>
          {busy === "run" && <div className="mt-3"><Spinner label="Agent working" /></div>}

          <div className="mt-4 space-y-3">
            {[...current.runs].reverse().map((r: AgentRun, i) => (
              <article key={i} className="rounded-xl border border-line bg-surface-2 p-3">
                <p className="text-xs text-ink-muted">
                  {new Date(r.at).toLocaleString()} · {r.latency_ms} ms
                  {r.tool_calls.length > 0 && ` · ${r.tool_calls.length} tool call(s)`}
                </p>
                <p className="mt-1.5 text-sm font-medium">{r.message}</p>
                {r.tool_calls.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.tool_calls.map((c, j) => (
                      <span key={j} className={`badge ${c.ok ? "" : "text-red-400"}`}>
                        {pretty(c.tool)} {c.ok ? "✓" : "✕"}
                      </span>
                    ))}
                  </div>
                )}
                <p className="prose-reply mt-2 text-ink-muted">{r.answer}</p>
              </article>
            ))}
          </div>
        </Panel>

        {current.last_evaluation && (
          <Panel title="Evaluation" subtitle={`${current.last_evaluation.runs_evaluated} run(s) assessed`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(current.last_evaluation.metrics).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line bg-surface-2 p-3 text-center">
                  <p className="text-lg font-semibold">{v === null ? "—" : String(v)}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-muted">
                    {pretty(k)}
                  </p>
                </div>
              ))}
            </div>
            {Object.keys(current.last_evaluation.judgement).length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {Object.entries(current.last_evaluation.judgement).map(([k, v]) => (
                  <li key={k}>
                    <span className="label mb-0 inline">{pretty(k)}: </span>
                    <span className="text-ink-muted">{String(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <Panel title="Danger zone">
          <button
            className="btn-ghost text-red-400"
            disabled={busy !== null}
            onClick={() =>
              run("delete", () => api.deleteAgent(current.agent_id), async () => {
                await load();
                setView({ mode: "list" });
              })
            }
          >
            {busy === "delete" ? "…" : "Delete agent"}
          </button>
        </Panel>
      </div>
    );
  }

  // -------------------------------------------------------------------- list

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Agents"
        subtitle="Specialised agents, created on demand from one shared runtime."
      >
        <button className="btn-primary" onClick={() => setView({ mode: "create" })}>
          + Create agent
        </button>
      </ScreenHeader>

      <ErrorNote error={error} />

      {loading && <Spinner label="Loading agents" />}

      {!loading && agents.length === 0 && (
        <Empty
          title="No agents yet"
          hint="Create one from a sentence — a cybersecurity agent, a Kubernetes troubleshooter, a RAG evaluator."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {agents.map((agent) => (
          <button
            key={agent.agent_id}
            onClick={() => setView({ mode: "detail", id: agent.agent_id })}
            className="card p-4 text-left transition-colors hover:border-accent/60"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{agent.name}</p>
              <span
                className={`badge ${agent.status === "ready" ? "text-emerald-500" : "text-amber-500"}`}
              >
                {agent.status}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
              {agent.description || agent.goal}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agent.skills.slice(0, 4).map((s) => (
                <span key={s} className="badge">{pretty(s)}</span>
              ))}
              {agent.skills.length > 4 && (
                <span className="badge">+{agent.skills.length - 4}</span>
              )}
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {agent.tools.length} tool(s) · {agent.runs.length} run(s)
            </p>
          </button>
        ))}
      </div>

      {registry && agents.length > 0 && (
        <p className="text-center text-xs text-ink-muted">
          All {agents.length} agent(s) run on one runtime, composed from {registry.skills.length}{" "}
          skills and {registry.tools.length} tools.
        </p>
      )}
    </div>
  );
}
