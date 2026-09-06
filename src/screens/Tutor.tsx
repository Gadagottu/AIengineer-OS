import { useEffect, useRef, useState } from "react";
import { api, ApiError, type TutorLevel, type Turn, type User } from "../api";
import type { Inbound } from "../App";
import { Empty, ErrorNote, ScreenHeader, Spinner } from "../ui";
import { useVoiceTargets } from "../voiceTargets";

const LEVELS: TutorLevel[] = ["beginner", "intermediate", "advanced", "senior"];

const QUICK_PROMPTS = [
  "Teach me RAG",
  "Explain embeddings",
  "Explain transformers",
  "Give me an example of hybrid search",
  "Challenge me on MCP",
  "Ask me a follow-up question",
];

export default function Tutor({ user, inbound }: { user: User; inbound: Inbound }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [level, setLevel] = useState<TutorLevel>((user.level as TutorLevel) || "intermediate");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = () =>
    api
      .history(60)
      .then((h) => setTurns(h.turns))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load history."))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  // A voice command already ran server-side; pull the new turns in.
  useEffect(() => {
    if (inbound?.action === "tutor") load();
  }, [inbound?.at]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const now = new Date().toISOString();
    const attached = showCode && code.trim() ? `${trimmed}\n\n\`\`\`\n${code.trim()}\n\`\`\`` : trimmed;
    setTurns((prev) => [...prev, { role: "user", content: attached, ts: now }]);
    setMessage("");
    setBusy(true);
    setError(null);

    try {
      const reply = await api.chat(trimmed, level, showCode ? code : undefined);
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: reply.reply, ts: now, intent: reply.intent },
      ]);
      setCode("");
      setShowCode(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The tutor could not answer.");
      setTurns((prev) => prev.slice(0, -1)); // roll back the optimistic turn
    } finally {
      setBusy(false);
    }
  }

  useVoiceTargets(
    QUICK_PROMPTS.map((p) => ({ id: `prompt:${p}`, label: p, kind: "action" as const })),
    (id) => {
      if (id.startsWith("prompt:")) send(id.slice(7));
    },
  );

  return (
    <div className="space-y-5">
      <ScreenHeader title="Tutor" subtitle="Ask, get challenged, go one level deeper.">
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Level
          <select
            className="field w-auto py-1.5 text-xs"
            value={level}
            onChange={(e) => setLevel(e.target.value as TutorLevel)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </ScreenHeader>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((prompt) => (
          <button key={prompt} className="btn-chip" disabled={busy} onClick={() => send(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <ErrorNote error={error} />

      <div className="space-y-3">
        {loading && <Spinner label="Loading history" />}
        {!loading && turns.length === 0 && (
          <Empty
            title="No lessons yet"
            hint="Pick a prompt above, or say “Teach me RAG” into the command bar."
          />
        )}

        {turns.map((turn, i) => (
          <article
            key={`${turn.ts}-${i}`}
            className={
              turn.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 px-4 py-3"
                : "card max-w-[92%] px-4 py-3"
            }
          >
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {turn.role === "user" ? "You" : `Tutor${turn.intent ? ` · ${turn.intent}` : ""}`}
            </p>
            <p className="prose-reply">{turn.content}</p>
          </article>
        ))}

        {busy && (
          <div className="card px-4 py-3">
            <Spinner label="Thinking" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-20 space-y-2 md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(message);
        }}
      >
        {showCode && (
          <textarea
            className="field font-mono text-xs"
            rows={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste the code you want explained…"
            aria-label="Code to explain"
          />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowCode((s) => !s)}
            aria-pressed={showCode}
            className="btn-ghost px-3"
            title="Attach code"
          >
            {"</>"}
          </button>
          <input
            className="field"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask anything about AI engineering…"
            aria-label="Message the tutor"
          />
          <button className="btn-primary" disabled={busy || !message.trim()}>
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
