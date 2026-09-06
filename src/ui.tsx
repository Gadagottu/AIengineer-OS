// Small shared pieces. Kept here so the four screens don't each reinvent them.
import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { ApiError } from "./api";

export function Spinner({ label = "Working" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-muted" role="status">
      <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}…
    </span>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400"
    >
      {error}
    </p>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card grid place-items-center gap-1 px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>
      </div>
      {children}
    </header>
  );
}

/** Renders a stage or level name like `failure_debugging` as `Failure debugging`.
 *  Null-safe on purpose: server payloads evolve, and a missing field must never take
 *  the whole page down with `undefined.replace(...)`. */
export const pretty = (value: string | null | undefined) =>
  String(value ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** A titled card. Was duplicated as `Panel` in two screens and `Section` in a third. */
export function Panel({
  title,
  subtitle,
  icon,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          {icon && <span className="mt-0.5 text-lg leading-none">{icon}</span>}
          <div>
            <h2 className="font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Models return a bare string as readily as a list. Never trust the shape. */
export const asArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];

/**
 * The busy/error wrapper every screen had its own copy of.
 * `useAsyncAction` keeps one label in flight at a time and funnels errors to one place.
 */
export function useAsyncAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(label: string, fn: () => Promise<T>, after?: (r: T) => void | Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      const result = await fn();
      await after?.(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `${label} failed.`);
    } finally {
      setBusy(null);
    }
  }

  return { busy, error, setError, run };
}

export const ICONS = {
  home: "M4 11l8-7 8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5",
  mic: "M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3",
  stop: "M7 7h10v10H7z",
  tutor: "M12 4v16m8-8H4",
  news: "M4 6h16M4 12h10M4 18h13",
  interview: "M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z",
  check: "M5 12l4 4L19 7",
  profile: "M16 19v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 7a3 3 0 106 0 3 3 0 00-6 0",
  research: "M11 17a6 6 0 100-12 6 6 0 000 12zM20 20l-4.35-4.35",
  agents: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5",
  observability: "M4 19h16M7 16V9m5 7V5m5 11v-4",
};

export function Icon({ path, className = "size-[18px]" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/**
 * The script the user reads into the microphone.
 *
 * ECAPA is text-independent, so the words don't have to match between enrolment and
 * login -- the phrase exists to get a few seconds of steady, natural speech instead of
 * an awkward silence while the user works out what to say.
 */
export function ReadAloud({ phrase, active }: { phrase: string; active: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 transition-colors ${
        active ? "border-accent bg-accent/10" : "border-line bg-surface-2"
      }`}
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        <Icon path={ICONS.mic} className="size-3.5" />
        {active ? "Recording — read this aloud" : "You will read this aloud"}
      </p>
      <p className="text-[15px] leading-relaxed">“{phrase}”</p>
    </div>
  );
}


/**
 * Catches a render crash in one screen instead of unmounting the whole app.
 * Without this, a single bad field renders a completely blank page with no clue why.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] render failed:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card space-y-2 p-5">
        <h2 className="font-semibold text-red-400">This screen hit an error</h2>
        <p className="text-sm text-ink-muted">
          {this.props.label} could not render. The rest of the app still works — the details
          are in the browser console.
        </p>
        <p className="prose-reply rounded-xl border border-line bg-surface-2 p-3 text-xs">
          {this.state.error.message}
        </p>
        <button className="btn-ghost" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
