import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type InterviewAction,
  type InterviewLevel,
  type InterviewSummary,
  type InterviewView,
  type TopicCatalogue,
} from "../api";
import type { Inbound, VoiceContext } from "../App";
import { ErrorNote, ScreenHeader, Spinner, pretty } from "../ui";
import { useVoiceTargets } from "../voiceTargets";

const ACTIONS: { id: InterviewAction; label: string }[] = [
  { id: "hint", label: "Hint" },
  { id: "harder", label: "Harder" },
  { id: "easier", label: "Easier" },
  { id: "follow_up", label: "Follow-up" },
  { id: "repeat", label: "Repeat" },
  { id: "skip", label: "Skip" },
  { id: "back", label: "Back" },
  { id: "end", label: "End" },
];

const isSummary = (r: InterviewView | InterviewSummary): r is InterviewSummary =>
  "summary" in r;

export default function Interview({
  inbound,
  onContext,
}: {
  inbound: Inbound;
  onContext: (patch: VoiceContext) => void;
}) {
  const [catalogue, setCatalogue] = useState<TopicCatalogue | null>(null);
  const [level, setLevel] = useState<InterviewLevel>("fundamentals");
  const [view, setView] = useState<InterviewView | null>(null);
  const [summary, setSummary] = useState<InterviewSummary["summary"] | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .topics()
      .then(setCatalogue)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load topics."));
  }, []);

  // Keep the voice command bar pointed at the live session.
  useEffect(() => {
    onContext({ session_id: view?.session_id });
  }, [view?.session_id]);

  // Adopt a session that a voice command already started or advanced.
  useEffect(() => {
    if (!inbound) return;
    const result = inbound.result as unknown;
    if (inbound.action === "end_interview" && result && isSummary(result as InterviewSummary)) {
      setSummary((result as InterviewSummary).summary);
      setView(null);
    } else if (result && (result as InterviewView).session_id) {
      setView(result as InterviewView);
      setSummary(null);
    }
  }, [inbound?.at]);

  async function run<T>(fn: () => Promise<T>, after: (result: T) => void) {
    setBusy(true);
    setError(null);
    try {
      after(await fn());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const start = (topic: string) =>
    run(
      () => api.startInterview(topic, level),
      (result) => {
        setView(result);
        setSummary(null);
        setAnswer("");
      },
    );

  const submit = () =>
    run(
      () => api.answerInterview(view!.session_id, answer.trim()),
      (result) => {
        setView(result);
        setAnswer("");
      },
    );

  const act = (action: InterviewAction) =>
    run(
      () => api.interviewAction(view!.session_id, action),
      (result) => {
        if (isSummary(result)) {
          setSummary(result.summary);
          setView(null);
        } else {
          setView(result);
          if (action !== "hint") setAnswer("");
        }
      },
    );

  // Everything on this screen the user could say out loud. The list changes with the
  // view, so "give me a hint" only exists once an interview is running.
  useVoiceTargets(
    view
      ? ACTIONS.map((a) => ({ id: `action:${a.id}`, label: a.label, kind: "action" as const }))
      : (catalogue?.topics ?? []).map((t) => ({
          id: `topic:${t.id}`,
          label: t.name,
          kind: "select" as const,
        })),
    (id) => {
      const [kind, value] = id.split(":");
      if (kind === "topic") start(value);
      if (kind === "action") act(value as InterviewAction);
    },
  );

  // ---------------------------------------------------------------- summary

  if (summary) {
    return (
      <div className="space-y-5">
        <ScreenHeader title="Interview complete" subtitle={`${summary.topic} · ${summary.level}`} />
        <div className="card grid grid-cols-3 divide-x divide-line">
          {[
            ["Answered", String(summary.answered)],
            ["Average", summary.average_score === null ? "—" : `${summary.average_score}/10`],
            ["Reached", pretty(summary.stages_reached)],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-5 text-center">
              <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
              <p className="mt-1 text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <ul className="space-y-2">
          {summary.history.map((entry, i) => (
            <li key={i} className="card p-4">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                {pretty(entry.stage)} · {entry.score}/10
              </p>
              <p className="mt-1.5 text-sm font-medium">{entry.question}</p>
              <p className="mt-1.5 text-sm text-ink-muted">{entry.answer}</p>
            </li>
          ))}
        </ul>

        <button className="btn-primary" onClick={() => setSummary(null)}>
          Start another interview
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------ topic picker

  if (!view) {
    return (
      <div className="space-y-5">
        <ScreenHeader title="Interview prep" subtitle="Pick a topic. Questions get harder as you go.">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Level
            <select
              className="field w-auto py-1.5 text-xs"
              value={level}
              onChange={(e) => setLevel(e.target.value as InterviewLevel)}
            >
              {(catalogue?.levels ?? []).map((l) => (
                <option key={l} value={l}>
                  {pretty(l)}
                </option>
              ))}
            </select>
          </label>
        </ScreenHeader>

        <ErrorNote error={error} />

        {catalogue && (
          <p className="text-xs text-ink-muted">
            Progression: {catalogue.stages.map(pretty).join(" → ")}
          </p>
        )}

        {!catalogue && <Spinner label="Loading topics" />}

        <div className="grid gap-3 sm:grid-cols-2">
          {catalogue?.topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => start(topic.id)}
              disabled={busy}
              className="card p-4 text-left transition-colors hover:border-accent/60 disabled:opacity-50"
            >
              <p className="font-medium">{topic.name}</p>
              <p className="mt-1 text-sm text-ink-muted">{topic.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ live session

  const progress = (view.stage_number / view.stage_total) * 100;

  return (
    <div className="space-y-5">
      <ScreenHeader title={view.topic} subtitle={`${pretty(view.level)} · ${pretty(view.stage)}`}>
        <span className="badge">
          Stage {view.stage_number}/{view.stage_total}
        </span>
      </ScreenHeader>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={view.stage_number}
        aria-valuemin={1}
        aria-valuemax={view.stage_total}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ErrorNote error={error} />

      <div className="card p-5">
        <p className="mb-2 text-xs uppercase tracking-wide text-ink-muted">
          Question · {view.question_source}
        </p>
        <p className="text-lg leading-relaxed">{view.question}</p>

        {view.hint && (
          <p className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
            Hint: {view.hint}
          </p>
        )}
      </div>

      {view.feedback && (
        <div className="card space-y-2.5 p-5">
          <div className="flex items-center gap-2">
            <span className="badge">{view.verdict}</span>
            <span className="text-sm font-medium">{view.score}/10</span>
            {view.advanced && <span className="badge">advanced a stage</span>}
          </div>
          <p className="prose-reply">{view.feedback}</p>
          {!!view.missing?.length && (
            <p className="text-sm text-ink-muted">Missing: {view.missing.join(", ")}</p>
          )}
          {view.model_answer && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-muted">Model answer</summary>
              <p className="prose-reply mt-2">{view.model_answer}</p>
            </details>
          )}
        </div>
      )}

      <div>
        <label className="label" htmlFor="answer">
          Your answer
        </label>
        <textarea
          id="answer"
          className="field"
          rows={6}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Answer out loud, then type the key points…"
        />
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-primary" onClick={submit} disabled={busy || !answer.trim()}>
            {busy ? <Spinner label="Grading" /> : "Submit answer"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Interview actions">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            className="btn-chip"
            disabled={busy}
            onClick={() => act(action.id)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
