import { useCallback, useEffect, useRef, useState } from "react";
import { api, getToken, setToken, type User } from "./api";
import Login from "./screens/Login";
import Tutor from "./screens/Tutor";
import News from "./screens/News";
import Interview from "./screens/Interview";
import Profile from "./screens/Profile";
import Research from "./screens/Research";
import Agents from "./screens/Agents";
import Observability from "./screens/Observability";
import Home from "./screens/Home";
import Landing from "./landing/Landing";
import { ErrorBoundary, Icon, ICONS } from "./ui";
import VoiceWidget from "./VoiceWidget";
import { VoiceTargetProvider, useVoiceTargets } from "./voiceTargets";

export type ScreenName = "home" | "tutor" | "news" | "interview" | "profile" | "research" | "agents" | "observability";

/** A voice command's result, handed to whichever screen understands it. */
export type Inbound = { action: string; result: Record<string, unknown>; at: number } | null;

/** Context the backend needs to resolve "explain this news" / "give me a hint". */
export type VoiceContext = { session_id?: string; news_id?: string };

const NAV: { id: ScreenName; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: ICONS.home },
  { id: "tutor", label: "Tutor", icon: ICONS.tutor },
  { id: "news", label: "News", icon: ICONS.news },
  { id: "interview", label: "Interview", icon: ICONS.interview },
  { id: "profile", label: "Personal Details", icon: ICONS.profile },
  { id: "research", label: "Research Me", icon: ICONS.research },
  { id: "agents", label: "Agents", icon: ICONS.agents },
  { id: "observability", label: "Observability", icon: ICONS.observability },
];

/**
 * Every page in NAV is addressable by its own name, from any screen and any depth.
 *
 * This is what makes a new page voice-controllable by adding one NAV entry: the
 * backend matches the spoken phrase against these labels, so it needs no new rule.
 * SCREEN_FOR below only routes the older hard-coded backend actions.
 */
function NavVoiceTargets({ onNavigate }: { onNavigate: (screen: ScreenName) => void }) {
  useVoiceTargets(
    NAV.map((item) => ({ id: `nav:${item.id}`, label: item.label, kind: "navigate" as const })),
    (id) => {
      if (id.startsWith("nav:")) onNavigate(id.slice(4) as ScreenName);
    },
  );
  return null;
}

/** Which screen a voice action belongs to. */
const SCREEN_FOR: Record<string, ScreenName> = {
  open_home: "home",
  open_profile: "profile",
  open_research: "research",
  open_agents: "agents",
  open_observability: "observability",
  profile_projects: "profile",
  profile_experience: "profile",
  profile_intro: "profile",
  improve_bio: "profile",
  open_tutor: "tutor",
  open_interview: "interview",
  tutor: "tutor",
  news: "news",
  explain_news: "news",
  start_interview: "interview",
  hint: "interview",
  harder: "interview",
  easier: "interview",
  follow_up: "interview",
  repeat: "interview",
  back: "interview",
  end_interview: "interview",
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [entering, setEntering] = useState(false);
  const [screen, setScreen] = useState<ScreenName>("home");
  const [context, setContext] = useState<VoiceContext>({});
  const [inbound, setInbound] = useState<Inbound>(null);
  const historyRef = useRef<ScreenName[]>([]);

  // Resume an existing session on reload rather than asking the user to log in again.
  useEffect(() => {
    if (!getToken()) return setBooting(false);
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  const onContext = useCallback(
    (patch: VoiceContext) => setContext((prev) => ({ ...prev, ...patch })),
    [],
  );

  /** Push the current screen onto the back-stack before moving. */
  const navigate = useCallback((next: ScreenName) => {
    setScreen((current) => {
      if (current !== next) historyRef.current = [...historyRef.current, current].slice(-20);
      return current === next ? current : next;
    });
  }, []);

  const goBack = useCallback(() => {
    const previous = historyRef.current.pop();
    if (previous) setScreen(previous);
  }, []);

  async function handleLogout() {
    await api.logout().catch(() => {});
    setToken(null);
    setUser(null);
    setContext({});
    setEntering(false); // back out to the landing page, not a bare sign-in form
  }

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-ink-muted">Loading…</div>
    );
  }

  // Signed out, the landing page is the front door; "Enter the OS" reveals sign-in.
  // There is no router in this app, so the door is a state flag rather than a route.
  if (!user) {
    if (!entering) return <Landing onEnter={() => setEntering(true)} />;
    return (
      <div className="relative">
        <button
          onClick={() => setEntering(false)}
          className="btn-ghost fixed left-4 top-4 z-20 px-3 py-1.5 text-xs"
        >
          ← Back to overview
        </button>
        <Login onLogin={setUser} />
      </div>
    );
  }

  return (
    <VoiceTargetProvider>
    <NavVoiceTargets onNavigate={navigate} />
    <div className="min-h-dvh md:flex">
      <Sidebar screen={screen} onNavigate={navigate} user={user} onLogout={handleLogout} />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 md:pb-10">
          {/* Keyed so switching screens clears a previous screen's error state. */}
          <ErrorBoundary key={screen} label={screen}>
            {screen === "home" && <Home user={user} onNavigate={navigate} />}
            {screen === "tutor" && <Tutor user={user} inbound={inbound} />}
            {screen === "news" && <News inbound={inbound} onContext={onContext} />}
            {screen === "interview" && <Interview inbound={inbound} onContext={onContext} />}
            {screen === "profile" && <Profile inbound={inbound} />}
            {screen === "research" && <Research />}
            {screen === "agents" && <Agents />}
            {screen === "observability" && <Observability />}
          </ErrorBoundary>
        </main>
      </div>

      <VoiceWidget
        context={context}
        onResult={(action, result) => {
          if (action === "go_back") return goBack();
          const next = SCREEN_FOR[action];
          if (next) navigate(next);
          setInbound({ action, result, at: Date.now() });
        }}
      />

      <MobileNav screen={screen} onNavigate={navigate} />
    </div>
    </VoiceTargetProvider>
  );
}

function Sidebar({
  screen,
  onNavigate,
  user,
  onLogout,
}: {
  screen: ScreenName;
  onNavigate: (s: ScreenName) => void;
  user: User;
  onLogout: () => void;
}) {
  return (
    // Sticky full-height column: the nav stays put while the page scrolls.
    <aside
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line
                 bg-surface p-4 md:flex"
    >
      <div className="mb-6 px-2">
        <p className="text-sm font-semibold tracking-tight">AI Engineer OS</p>
        <p className="text-xs text-ink-muted">Voice-first learning</p>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-current={screen === item.id ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
              screen === item.id
                ? "bg-accent/15 font-medium text-accent"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Icon path={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-line bg-surface-2 p-3">
        <p className="truncate text-sm font-medium">{user.display_name}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {user.level} · {user.voice_enrolled ? "voice enrolled" : "no voice"}
        </p>
        <button onClick={onLogout} className="btn-ghost mt-3 w-full py-1.5 text-xs">
          Log out
        </button>
      </div>
    </aside>
  );
}

function MobileNav({
  screen,
  onNavigate,
}: {
  screen: ScreenName;
  onNavigate: (s: ScreenName) => void;
}) {
  return (
    // Eight destinations no longer fit a 375px row, so the bar scrolls rather than
    // crushing every label to an unreadable width.
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-line
                 bg-surface/95 backdrop-blur [scrollbar-width:none] md:hidden"
    >
      {NAV.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          aria-current={screen === item.id ? "page" : undefined}
          className={`flex min-w-[4.6rem] flex-1 shrink-0 flex-col items-center gap-1 py-2.5
            text-[11px] ${screen === item.id ? "text-accent" : "text-ink-muted"}`}
        >
          <Icon path={item.icon} />
          {item.label}
        </button>
      ))}
    </nav>
  );
}


