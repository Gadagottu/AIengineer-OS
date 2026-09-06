import { useEffect, useRef, useState } from "react";
import { api, ApiError, speak, startRecording, stopSpeaking } from "./api";
import type { VoiceContext } from "./App";
import { Icon, ICONS } from "./ui";
import { useVoiceTargetStore } from "./voiceTargets";

/** Shown in the widget so the user never has to guess what the app understands. */
const EXAMPLES = [
  "Go to tutor",
  "Go to news",
  "Go to interview",
  "Teach me RAG",
  "Show today's AI news",
  "Explain this news",
  "Start an interview on MCP",
  "Give me a hint",
  "Give me a harder question",
  "Go back",
];

/** Spoken phrases that end hands-free mode, so you never have to reach for the mouse. */
const SLEEP_PHRASE = /\b(stop listening|stop hands.?free|go to sleep|that'?s all)\b/i;

const MUTE_KEY = "aeos.muted";

// Give up after this many sessions that die on arrival, so a failing recogniser
// (no network, mic seized by another app) cannot spin forever.
const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 300;

// How many instructions one utterance may chain: "go to agents, open the security
// agent, then evaluate it".
const MAX_CHAIN = 5;

/**
 * Wait for the screen to register its controls after a navigation, so the next command
 * in a chain addresses the page that just opened rather than the one it left.
 *
 * Bounded: a screen that registers nothing must not stall the rest of the chain.
 */
async function waitForNewTargets(
  store: { version: () => number } | null | undefined,
  before: number,
  timeoutMs = 2500,
) {
  const deadline = Date.now() + timeoutMs;
  while (store && store.version() === before && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  // One more frame so the newly registered screen has painted before we act on it.
  await new Promise((resolve) => setTimeout(resolve, 60));
}

type LogEntry = { heard: string; action: string; speak: string; at: number };

// The Web Speech API is not in lib.dom's types. Only what we actually touch is declared.
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  abort?(): void;
};

const RecognitionCtor = (): (new () => Recognition) | undefined =>
  (window as unknown as Record<string, new () => Recognition>).SpeechRecognition ??
  (window as unknown as Record<string, new () => Recognition>).webkitSpeechRecognition;

export default function VoiceWidget({
  context,
  onResult,
}: {
  context: VoiceContext;
  onResult: (action: string, result: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === "1");

  const stopRef = useRef<(() => Promise<Blob>) | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const activeRef = useRef(false); // hands-free requested (survives Chrome's auto-stops)
  const pausedRef = useRef(false); // muted while the assistant is speaking
  const targetStore = useVoiceTargetStore();
  const contextRef = useRef(context);
  const mutedRef = useRef(muted);
  const startedAtRef = useRef(0);   // when the current session began
  const restartsRef = useRef(0);    // consecutive instant-death restarts

  // Recognition callbacks are created once but fire for the app's whole lifetime, so they
  // read context from a ref rather than closing over a stale value.
  contextRef.current = context;
  mutedRef.current = muted;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (speaking) return stopVoice(); // barge in first
      if (!recording && !handsFree) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, recording, handsFree, speaking]);

  // Release the microphone if the widget unmounts mid-listen.
  useEffect(() => {
    return () => {
      activeRef.current = false;
      teardown();
      stopRef.current?.();
    };
  }, []);

  async function send(input: { text?: string; audio?: Blob; confirm?: boolean }, depth = 0) {
    setBusy(true);
    setStatus(null);
    try {
      // Whatever the current screen registered travels with the command, so the backend
      // can only ever name a control the user can already see.
      const registration = targetStore?.read() ?? null;
      const reply = await api.voiceCommand({
        ...input,
        ...contextRef.current,
        targets: registration?.targets,
      });
      setLog((prev) => [{ ...reply, at: Date.now() }, ...prev].slice(0, 5));

      // Sampled before we act, so the chain below can tell when the screen has swapped
      // its controls for the new page's.
      const versionBefore = targetStore?.version() ?? 0;

      if (reply.action === "ui_target") {
        // The screen performs it; the backend only named the id.
        // The heard phrase travels with the id: a dictation target uses the words
        // themselves, so "create a cybersecurity agent" fills the box it activates.
        const target = (reply.result as { target?: { id: string } }).target;
        if (target?.id) registration?.handle(target.id, reply.heard);
      } else {
        onResult(reply.action, reply.result);
      }
      setText("");
      if (reply.action === "unknown") setStatus("Not understood — try one of the examples.");
      if (reply.action === "confirm_required") setStatus(reply.speak);

      // "go to agents, open the security agent, then evaluate it": run the rest once the
      // new screen has actually registered its controls, rather than after a fixed guess
      // at how long that takes. Bounded so a sequence cannot run away.
      if (reply.remainder && depth < MAX_CHAIN) {
        await waitForNewTargets(targetStore, versionBefore);
        await send({ text: reply.remainder }, depth + 1);
        return;
      }

      // Mute the mic while we talk back, or the next thing transcribed is our own voice.
      pausedRef.current = true;
      recognitionRef.current?.stop();
      if (!mutedRef.current) {
        setSpeaking(true);
        await speak(reply.speak);
        setSpeaking(false);
      }
      pausedRef.current = false;
      if (activeRef.current) safeStart();
    } catch (e) {
      // "go back" with no interview running is a navigation request, not an error.
      // The backend owns interview state; screen history is the client's business.
      const noSession =
        e instanceof ApiError && e.status === 400 && /no interview in progress/i.test(e.message);
      if (noSession && /\b(go\s+back|back|previous)\b/i.test(input.text ?? "")) {
        onResult("go_back", {});
        setStatus(null);
      } else {
        setStatus(e instanceof ApiError ? e.message : "Command failed.");
      }
      pausedRef.current = false;
    } finally {
      setBusy(false);
    }
  }

  /** Chrome throws if start() is called while already running; that is harmless. */
  function safeStart() {
    if (!recognitionRef.current) return;
    try {
      startedAtRef.current = Date.now();
      recognitionRef.current.start();
    } catch {
      /* already listening */
    }
  }

  async function startHandsFree() {
    if (activeRef.current) return; // already listening; never stack instances
    const Ctor = RecognitionCtor();
    if (!Ctor) {
      setStatus("Hands-free needs Chrome or Edge. Use tap-to-speak instead.");
      return;
    }

    // recognition.start() prompts for the mic itself, but when permission was previously
    // denied it fails almost silently -- an `aborted` error and nothing else. So check the
    // permission first and say something useful. Only actually open a stream when we must:
    // grabbing and releasing the device right before recognition starts can race on Windows.
    let permission = "prompt";
    try {
      permission = (await navigator.permissions.query({ name: "microphone" as PermissionName }))
        .state;
    } catch {
      /* Firefox has no microphone permission descriptor; fall through and just try. */
    }

    if (permission === "denied") {
      setStatus(
        "Microphone blocked for this site. Click the icon left of the address bar → " +
          "Microphone → Allow, then reload.",
      );
      return;
    }

    if (permission === "prompt") {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop()); // recognition opens its own stream
      } catch (e) {
        setStatus(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Microphone permission refused."
            : "No microphone found. Check your input device.",
        );
        return;
      }
    }

    teardown(); // drop any earlier instance before creating another

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => {
      console.log("[voice] recognition started");
      // Measure from the real start, not from the start() call. Do NOT reset the
      // restart counter here: a session that dies instantly still fires onstart, so
      // resetting would make the instant-death guard below unreachable.
      startedAtRef.current = Date.now();
      setStatus(null);
    };

    recognition.onresult = (event) => {
      let final = "";
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else pending += result[0].transcript;
      }
      setInterim(pending);

      if (pending) console.log("[voice] hearing:", pending);

      const phrase = final.trim();
      if (!phrase || pausedRef.current) return; // ignore our own speech
      console.log("[voice] final:", phrase);
      setInterim("");

      if (SLEEP_PHRASE.test(phrase)) {
        stopHandsFree();
        speak("Hands-free off.");
        return;
      }
      send({ text: phrase });
    };

    // Chrome ends the session after a pause; restart unless the user actually stopped.
    // A session that ends instantly means something is wrong, so don't spin on it.
    recognition.onend = () => {
      if (!activeRef.current || pausedRef.current) return;

      // A session that died almost immediately is a failure, not a natural pause.
      const lasted = Date.now() - startedAtRef.current;
      restartsRef.current = lasted < 500 ? restartsRef.current + 1 : 0;
      console.log(`[voice] ended after ${lasted}ms (strike ${restartsRef.current}/${MAX_RESTARTS})`);

      if (restartsRef.current >= MAX_RESTARTS) {
        stopHandsFree();
        setStatus(
          "Speech recognition keeps dropping. It needs an internet connection " +
            "(Chrome transcribes server-side). Use typing or tap-to-speak.",
        );
        return;
      }
      // Fixed delay: the counter above is the guard, so backing off adds nothing.
      setTimeout(() => {
        if (activeRef.current && !pausedRef.current) safeStart();
      }, RESTART_DELAY_MS);
    };

    recognition.onerror = (event) => {
      console.warn("[voice] recognition error:", event.error);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopHandsFree();
        setStatus("Microphone permission denied. Allow it in the address bar, then reload.");
      } else if (event.error === "no-speech") {
        setStatus("Didn't hear anything — speak a little louder, or closer to the mic.");
      } else if (event.error === "network") {
        setStatus("Speech recognition needs an internet connection.");
      } else if (event.error !== "aborted") {
        setStatus(`Speech recognition: ${event.error}`);
      }
    };

    recognitionRef.current = recognition;
    activeRef.current = true;
    restartsRef.current = 0;
    setHandsFree(true);
    setStatus(null);
    safeStart();
  }

  /** Cut the assistant off mid-sentence. */
  function stopVoice() {
    stopSpeaking();
    setSpeaking(false);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    if (next) stopVoice();
  }

  function stopHandsFree() {
    activeRef.current = false;
    setHandsFree(false);
    setInterim("");
    teardown();
  }

  /**
   * Detach every handler before dropping the instance. Without this an in-flight
   * `onend` from the old session fires after a new one exists and restarts it,
   * leaving two live recognitions competing for the microphone.
   */
  function teardown() {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onend = null;
    recognition.onerror = null;
    try {
      recognition.abort ? recognition.abort() : recognition.stop();
    } catch {
      /* already stopped */
    }
  }

  /** One-shot recording; used as the fallback where Web Speech is unavailable. */
  async function toggleMic() {
    if (recording) {
      setRecording(false);
      const stop = stopRef.current;
      stopRef.current = null;
      if (stop) await send({ audio: await stop() });
      return;
    }
    try {
      stopRef.current = await startRecording();
      setRecording(true);
      setStatus(null);
    } catch {
      setStatus("Microphone unavailable — type the command instead.");
    }
  }

  const latest = log[0];

  return (
    <>
      {/* Floating status stack, shown while the panel is closed so the transcript and
          the stop-speaking control are always reachable. */}
      {!open && (speaking || handsFree) && (
        <div className="fixed bottom-40 right-4 z-20 flex w-[min(24rem,calc(100vw-2rem))]
                        flex-col items-stretch gap-2 md:bottom-24 md:right-6">
          {speaking && <SpeakingBar onStop={stopVoice} />}
          {handsFree && <Caption busy={busy} interim={interim} latest={latest} />}
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={handsFree ? "Voice assistant is listening" : "Open the voice assistant"}
          className={`fixed bottom-24 right-4 z-20 grid size-14 place-items-center rounded-full
                      shadow-lg transition-transform hover:scale-105 md:bottom-6 md:right-6 ${
                        handsFree
                          ? "animate-pulse bg-red-500 text-white shadow-red-500/30"
                          : "bg-accent text-accent-ink shadow-accent/25"
                      }`}
        >
          <Icon path={ICONS.mic} className="size-6" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Voice assistant"
          className="card fixed bottom-24 right-4 z-20 flex w-[min(24rem,calc(100vw-2rem))]
                     flex-col gap-3 p-4 shadow-2xl md:bottom-6 md:right-6"
        >
          <header className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Icon path={ICONS.mic} className="size-4" />
              Voice assistant
            </p>
            <div className="flex items-center gap-1">
            <button
              onClick={toggleMute}
              aria-pressed={muted}
              title={muted ? "Voice replies are off" : "Mute voice replies"}
              className="rounded-lg px-2 py-1 text-ink-muted transition-colors hover:text-ink"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={recording}
              aria-label="Close the voice assistant"
              className="rounded-lg px-2 py-1 text-ink-muted transition-colors hover:text-ink
                         disabled:opacity-40"
            >
              ✕
            </button>
            </div>
          </header>

          {speaking && <SpeakingBar onStop={stopVoice} />}
          {handsFree && <Caption busy={busy} interim={interim} latest={latest} />}

          {/* Hands-free: click once, then just talk. */}
          <button
            onClick={handsFree ? stopHandsFree : startHandsFree}
            aria-pressed={handsFree}
            className={`flex items-center justify-center gap-3 rounded-xl border px-4 py-4
                        text-sm font-medium transition-colors ${
                          handsFree
                            ? "border-red-500/60 bg-red-500/10 text-red-400"
                            : "border-accent/50 bg-accent/10 text-accent hover:bg-accent/15"
                        }`}
          >
            {handsFree ? <Waveform /> : <Icon path={ICONS.mic} className="size-5" />}
            {handsFree ? "Listening — click to stop" : "Start hands-free"}
          </button>

          {handsFree && (
            <p className="text-xs text-ink-muted">Say “stop listening” to finish.</p>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send({ text: text.trim() });
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="…or type a command"
              aria-label="Type a command"
              className="field py-2 text-sm"
            />
            <button className="btn-primary px-3" disabled={busy || !text.trim()}>
              Run
            </button>
          </form>

          {!handsFree && (
            <button onClick={toggleMic} disabled={busy} className="btn-ghost py-2 text-xs">
              <Icon path={recording ? ICONS.stop : ICONS.mic} className="size-4" />
              {recording ? "Stop and send" : "Tap to speak once (Whisper)"}
            </button>
          )}

          {status && (
            <p role="alert" className="text-xs text-amber-500">
              {status}
            </p>
          )}

          <div aria-live="polite">
            {latest && (
              <div className="rounded-xl border border-line bg-surface-2 p-3">
                <p className="text-xs text-ink-muted">
                  Heard: <span className="text-ink">“{latest.heard}”</span>
                </p>
                <p className="mt-1.5">
                  <span className="badge">
                    <Icon path={ICONS.check} className="size-3" />
                    {latest.action.replace(/_/g, " ")}
                  </span>
                </p>
                <p className="prose-reply mt-2 line-clamp-4 text-ink-muted">{latest.speak}</p>
              </div>
            )}
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-ink-muted">Commands you can say</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  className="btn-chip"
                  disabled={busy}
                  onClick={() => send({ text: example })}
                >
                  {example}
                </button>
              ))}
            </div>
          </details>

          {log.length > 1 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-ink-muted">Recent ({log.length - 1})</summary>
              <ul className="mt-2 space-y-1">
                {log.slice(1).map((entry) => (
                  <li key={entry.at} className="flex justify-between gap-2 text-ink-muted">
                    <span className="truncate">“{entry.heard}”</span>
                    <span className="shrink-0">{entry.action.replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </>
  );
}

/** Barge-in control: always one click from silencing the assistant. */
function SpeakingBar({ onStop }: { onStop: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-accent/40 bg-accent/10
                    px-3 py-2 shadow-lg backdrop-blur">
      <Waveform />
      <span className="flex-1 text-sm text-accent">Speaking…</span>
      <button
        onClick={onStop}
        className="rounded-lg border border-accent/50 px-2.5 py-1 text-xs font-medium
                   text-accent transition-colors hover:bg-accent/15"
      >
        Stop
      </button>
    </div>
  );
}

/** Live transcript: what was heard, and which action it became. */
function Caption({
  busy,
  interim,
  latest,
}: {
  busy: boolean;
  interim: string;
  latest?: LogEntry;
}) {
  return (
    <div
      aria-live="polite"
      className="rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur"
    >
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-red-400">
        <span className="size-2 animate-pulse rounded-full bg-red-500" />
        {busy ? "Running your command" : "Listening"}
      </p>
      {interim ? (
        <p className="text-[15px] leading-snug">{interim}…</p>
      ) : latest ? (
        <p className="text-[15px] leading-snug text-ink-muted">
          “{latest.heard}” → <span className="text-ink">{latest.action.replace(/_/g, " ")}</span>
        </p>
      ) : (
        <p className="text-[15px] leading-snug text-ink-muted">
          Say a command — “go to news”, “teach me RAG”, “start an interview on MCP”.
        </p>
      )}
    </div>
  );
}

/** Five bars that bounce while the mic is open, so "listening" is unmistakable. */
function Waveform() {
  return (
    <span className="flex items-end gap-0.5" aria-hidden="true">
      {[0, 120, 240, 120, 0].map((delay, i) => (
        <span
          key={i}
          className="w-1 animate-pulse rounded-full bg-current"
          style={{ height: `${8 + (i % 3) * 6}px`, animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
