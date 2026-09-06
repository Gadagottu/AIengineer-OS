import { useRef, useState } from "react";
import { api, ApiError, setToken, startRecording, type TutorLevel, type User } from "../api";
import { ErrorNote, Icon, ICONS, ReadAloud, Spinner } from "../ui";

// One phrase per enrolment clip. Varied sounds give the speaker model more to work with
// than three readings of the same sentence.
const ENROL_PHRASES = [
  "The quick brown fox jumps over the lazy dog by the river.",
  "My voice is my passport; please verify me and open the system.",
  "Retrieval augmented generation combines search with language models.",
];

const LOGIN_PHRASE = "My voice is my passport; please verify me and open the system.";

type Tab = "signin" | "register" | "enroll";

const TABS: { id: Tab; label: string }[] = [
  { id: "signin", label: "Sign in" },
  { id: "register", label: "Create account" },
  { id: "enroll", label: "Enrol voice" },
];

const LEVELS: TutorLevel[] = ["beginner", "intermediate", "advanced", "senior"];

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [tab, setTab] = useState<Tab>("signin");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">AI Engineer OS</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Voice-first tutor, news and interview prep.
          </p>
        </div>

        <div className="card overflow-hidden">
          <div role="tablist" className="flex border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setError(null);
                  setNotice(null);
                }}
                className={`flex-1 px-3 py-3 text-sm transition-colors ${
                  tab === t.id
                    ? "border-b-2 border-accent font-medium text-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 p-5">
            <ErrorNote error={error} />
            {notice && (
              <p className="rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
                {notice}
              </p>
            )}

            {tab === "signin" && (
              <SignIn onLogin={onLogin} setError={setError} setNotice={setNotice} />
            )}
            {tab === "register" && (
              <Register
                setError={setError}
                onDone={(message) => {
                  setNotice(message);
                  setTab("signin");
                }}
              />
            )}
            {tab === "enroll" && <Enrol setError={setError} setNotice={setNotice} />}
          </div>
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-muted">
          Voice login uses speaker verification (ECAPA-TDNN), not transcription.
          <br />
          Password sign-in is the fallback when the model or a microphone is unavailable.
        </p>
      </div>
    </div>
  );
}

function SignIn({
  onLogin,
  setError,
  setNotice,
}: {
  onLogin: (user: User) => void;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const recorder = useRecorder();

  async function run(fn: () => Promise<{ token: string; user: User; score?: number }>) {
    setBusy(true);
    setError(null);
    try {
      const session = await fn();
      setToken(session.token);
      if (session.score !== undefined) setNotice(`Voice matched (score ${session.score}).`);
      onLogin(session.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function voiceSignIn() {
    if (recorder.recording) {
      const sample = await recorder.stop();
      if (sample) await run(() => api.loginWithVoice(sample, username.trim() || undefined));
      return;
    }
    setError(null);
    if (!(await recorder.start())) setError("Microphone unavailable. Use your password instead.");
  }

  return (
    <>
      <ReadAloud phrase={LOGIN_PHRASE} active={recorder.recording} />

      <button
        type="button"
        onClick={voiceSignIn}
        disabled={busy}
        className={`flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
          recorder.recording
            ? "animate-pulse border-red-500/60 bg-red-500/10 text-red-400"
            : "border-accent/50 bg-accent/10 text-accent hover:bg-accent/15"
        }`}
      >
        <Icon path={recorder.recording ? ICONS.stop : ICONS.mic} />
        {recorder.recording ? "Stop and verify" : "Sign in with your voice"}
      </button>
      <p className="text-center text-xs text-ink-muted">
        {recorder.recording
          ? "Read the line above, then press stop."
          : "Optionally type your username first."}
      </p>

      <div className="flex items-center gap-3 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-line" /> or password <span className="h-px flex-1 bg-line" />
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api.loginWithPassword(username.trim(), password));
        }}
      >
        <div>
          <label className="label" htmlFor="signin-user">
            Username
          </label>
          <input
            id="signin-user"
            className="field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="signin-pass">
            Password
          </label>
          <input
            id="signin-pass"
            type="password"
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner label="Signing in" /> : "Sign in"}
        </button>
      </form>
    </>
  );
}

function Register({
  setError,
  onDone,
}: {
  setError: (e: string | null) => void;
  onDone: (message: string) => void;
}) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    display_name: "",
    level: "intermediate" as TutorLevel,
  });
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api.register({ ...form, display_name: form.display_name || undefined });
          onDone("Account created. Sign in, then enrol your voice.");
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Registration failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="reg-user">
          Username
        </label>
        <input
          id="reg-user"
          className="field"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          pattern="[A-Za-z0-9_.\-]{3,32}"
          title="3–32 characters: letters, numbers, dot, dash or underscore"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="reg-name">
          Display name <span className="normal-case text-ink-muted/70">(optional)</span>
        </label>
        <input
          id="reg-name"
          className="field"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />
      </div>
      <div>
        <label className="label" htmlFor="reg-pass">
          Password
        </label>
        <input
          id="reg-pass"
          type="password"
          className="field"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          minLength={8}
          autoComplete="new-password"
          required
        />
        <p className="mt-1.5 text-xs text-ink-muted">At least 8 characters.</p>
      </div>
      <div>
        <label className="label" htmlFor="reg-level">
          Starting level
        </label>
        <select
          id="reg-level"
          className="field"
          value={form.level}
          onChange={(e) => setForm({ ...form, level: e.target.value as TutorLevel })}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner label="Creating" /> : "Create account"}
      </button>
    </form>
  );
}

function Enrol({
  setError,
  setNotice,
}: {
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [samples, setSamples] = useState<Blob[]>([]);
  const [busy, setBusy] = useState(false);
  const recorder = useRecorder();

  async function toggle() {
    if (recorder.recording) {
      const sample = await recorder.stop();
      if (sample) setSamples((prev) => [...prev, sample]);
      return;
    }
    setError(null);
    if (!(await recorder.start())) setError("Microphone unavailable.");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Record three short clips of your normal speaking voice. Enrolment is password-gated so
        nobody can attach their voice to your account.
      </p>
      <p className="text-xs text-ink-muted">
        The first enrolment after a server restart loads the speaker model and can take ~20
        seconds. Later ones are instant.
      </p>

      <div>
        <label className="label" htmlFor="enrol-user">
          Username
        </label>
        <input
          id="enrol-user"
          className="field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
      </div>
      <div>
        <label className="label" htmlFor="enrol-pass">
          Password
        </label>
        <input
          id="enrol-pass"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>

      <ReadAloud
        phrase={ENROL_PHRASES[Math.min(samples.length, ENROL_PHRASES.length - 1)]}
        active={recorder.recording}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className={recorder.recording ? "btn-ghost flex-1 animate-pulse" : "btn-ghost flex-1"}
        >
          <Icon path={recorder.recording ? ICONS.stop : ICONS.mic} />
          {recorder.recording ? "Stop clip" : `Record clip ${samples.length + 1}`}
        </button>
        {samples.length > 0 && (
          <button type="button" onClick={() => setSamples([])} className="btn-chip">
            Clear
          </button>
        )}
      </div>

      <div className="flex gap-1.5" aria-label={`${samples.length} of 3 clips recorded`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              samples.length > i ? "bg-accent" : "bg-line"
            }`}
          />
        ))}
      </div>

      <button
        className="btn-primary w-full"
        disabled={busy || samples.length === 0 || !username || !password}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const result = await api.enrollVoice(username.trim(), password, samples);
            setSamples([]);
            setNotice(`Voice enrolled — ${result.samples_stored} sample(s) stored.`);
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Enrolment failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Spinner label="Enrolling" />
        ) : samples.length === 0 ? (
          "Record a clip to enrol"
        ) : (
          `Enrol ${samples.length} clip${samples.length === 1 ? "" : "s"}`
        )}
      </button>
    </div>
  );
}

/** Shared mic state: start returns false when permission or hardware is missing. */
function useRecorder() {
  const [recording, setRecording] = useState(false);
  const stopRef = useRef<(() => Promise<Blob>) | null>(null);

  return {
    recording,
    async start() {
      try {
        stopRef.current = await startRecording();
        setRecording(true);
        return true;
      } catch {
        return false;
      }
    },
    async stop() {
      const stop = stopRef.current;
      stopRef.current = null;
      setRecording(false);
      return stop ? await stop() : null;
    },
  };
}
