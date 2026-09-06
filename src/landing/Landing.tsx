import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./landing.css";
import NodeField from "./NodeField";

/** Custom properties in inline styles, without scattering `as any` through the JSX. */
const v = (o: Record<string, string | number>) => o as CSSProperties;

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Adds `.in` once an element scrolls into view. One observer for the whole page. */
function useReveal() {
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>(".aeos [data-reveal]");
    if (reduced()) {
      nodes.forEach((n) => n.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

/** How far a section has travelled through the viewport, 0 to 1. */
function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reduced()) return setProgress(1);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = r.height + window.innerHeight * 0.55;
      setProgress(Math.min(1, Math.max(0, (window.innerHeight * 0.82 - r.top) / span)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return [ref, progress] as const;
}

/** Counts up to `to` the first time it is seen. */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) return setN(to);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const dur = 1500;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / dur);
          // Ease-out quint: fast commit, long settle. Reads as a machine locking on.
          setN(Math.round(to * (1 - Math.pow(1 - t, 5))));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  return (
    <b ref={ref as React.RefObject<HTMLElement>}>
      {n.toLocaleString()}
      {suffix}
    </b>
  );
}

function Section({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={className}>
      {children}
    </section>
  );
}

function Down({ lit = false }: { lit?: boolean }) {
  return (
    <div className="flow-down" aria-hidden="true">
      <svg width="14" height="26" viewBox="0 0 14 26" fill="none">
        <path
          d="M7 0v20M7 26l-5-7h10l-5 7z"
          stroke={lit ? "#2bf58c" : "#2a332e"}
          fill={lit ? "#2bf58c" : "#2a332e"}
          strokeWidth="1"
          style={{ transition: "stroke .5s, fill .5s" }}
        />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------- hero console */

const UTTERANCE = "Create an agent that reviews Kubernetes deployments for security";
const STAGES = ["Draft", "Validate", "Authorize"];
const TOOLS = ["web_search", "github", "code_review"];

/**
 * The hero product visual: a looping, self-narrating run of the real pipeline --
 * voice in, spec drafted, validated, authorised, agent built.
 */
function HeroConsole() {
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState(0); // 0 listening, 1..3 stages, 4 built

  useEffect(() => {
    if (reduced()) {
      setTyped(UTTERANCE);
      setStep(4);
      return;
    }
    let timers: number[] = [];
    let alive = true;

    const run = () => {
      setTyped("");
      setStep(0);
      let i = 0;
      const type = () => {
        if (!alive) return;
        i += 1;
        setTyped(UTTERANCE.slice(0, i));
        if (i < UTTERANCE.length) timers.push(window.setTimeout(type, 34));
        else {
          [1, 2, 3, 4].forEach((s, k) =>
            timers.push(window.setTimeout(() => alive && setStep(s), 520 + k * 620)),
          );
          timers.push(window.setTimeout(() => alive && run(), 8200));
        }
      };
      timers.push(window.setTimeout(type, 700));
    };

    run();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  const listening = step === 0;

  return (
    <div className="console" data-reveal style={v({ "--delay": "180ms" })}>
      <div className="panel-head">
        <span className="mono" style={{ color: "#e8efea", letterSpacing: "0.18em" }}>
          AI Engineer OS
        </span>
        <span className="chip chip--on">
          <span className="dot" /> ONLINE
        </span>
      </div>

      <div className="console-body">
        <p className="mono">Voice input</p>
        <p className="utterance">
          &ldquo;{typed}
          {typed.length < UTTERANCE.length && <span className="caret" />}&rdquo;
        </p>

        <div className={`wave ${listening ? "" : "wave--idle"}`} aria-hidden="true">
          {Array.from({ length: 34 }).map((_, i) => (
            <i
              key={i}
              style={v({
                "--d": `${(i % 9) * 90}ms`,
                "--h": `${28 + Math.abs(Math.sin(i * 1.7)) * 62}%`,
              })}
            />
          ))}
        </div>

        <Down lit={step >= 1} />

        <p className="mono">Agent factory</p>
        <div className="stage-row">
          {STAGES.map((s, i) => (
            <div key={s} className={`stage ${step >= i + 1 ? "stage--done" : ""}`}>
              {s}
            </div>
          ))}
        </div>

        <Down lit={step >= 4} />

        <div className={`agent-card ${step >= 4 ? "agent-card--in" : ""}`}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <strong style={{ fontSize: "0.94rem", letterSpacing: "-0.01em" }}>
              Kubernetes Review Agent
            </strong>
            <span className="chip chip--on">VALIDATED</span>
          </div>
          <p className="mono" style={{ marginTop: "0.55rem", marginBottom: "0.5rem" }}>
            Tools authorised
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {TOOLS.map((t) => (
              <span key={t} className="chip chip--cyan">
                <span className="dot" style={{ background: "#5ce1e6", boxShadow: "0 0 8px #5ce1e6" }} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PIPE = ["Voice", "Intent", "Control", "Action"];

/** The four resolution stages, lighting in sequence on a loop. */
function VoicePipe() {
  const [lit, setLit] = useState(reduced() ? PIPE.length : 0);

  useEffect(() => {
    if (reduced()) return;
    const id = window.setInterval(
      () => setLit((n) => (n >= PIPE.length + 1 ? 0 : n + 1)),
      780,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pipe" data-reveal style={v({ "--delay": "120ms" })}>
      {PIPE.map((n, i) => (
        <div key={n} style={{ display: "grid", justifyItems: "center", gap: "0.55rem" }}>
          <div className={`pipe-node ${i < lit ? "pipe-node--on" : ""}`}>{n}</div>
          {i < PIPE.length - 1 && <Down lit={i + 1 < lit} />}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------ engineering loop */

const LOOP = [
  {
    name: "Learn",
    kicker: "Tutor",
    body: (
      <div className="mini">
        <span>&gt; explain RAG architecture</span>
        <b>Retrieval, then generation. The failure modes are separate...</b>
      </div>
    ),
  },
  {
    name: "Practice",
    kicker: "Interview",
    body: (
      <div className="mini">
        <span>STAGE 04 / TRADEOFFS</span>
        <b>When does hybrid search stop paying for itself?</b>
      </div>
    ),
  },
  {
    name: "Research",
    kicker: "Research Me",
    body: (
      <div className="mini">
        <span>6 sources &middot; 51 findings</span>
        <b>github.com &mdash; identity: high</b>
      </div>
    ),
  },
  {
    name: "Build",
    kicker: "Agent factory",
    body: (
      <div className="mini">
        <span>SPEC VALIDATED</span>
        <b>3 tools &middot; 1 permission derived</b>
      </div>
    ),
  },
  {
    name: "Observe",
    kicker: "Telemetry",
    body: (
      <div className="mini">
        <span>tokens=1,457 cost=$0.0004</span>
        <b>p95 3.2s &middot; success 100%</b>
      </div>
    ),
  },
  {
    name: "Improve",
    kicker: "Profile",
    body: (
      <div className="mini">
        <span>EVIDENCE +4</span>
        <b>LLM systems &mdash; verified</b>
      </div>
    ),
  },
];

/* ---------------------------------------------------------- telemetry log */

const LOG_SEED = [
  ["14:32:08", "tutor.llm()", "start"],
  ["14:32:09", "response.success", "tokens=842"],
  ["14:32:09", "cost.estimate", "$0.0003"],
  ["14:32:10", "research.llm()", "start"],
  ["14:32:11", "fallback", "false"],
  ["14:32:11", "response.success", "tokens=615"],
  ["14:32:12", "agent.run()", "tools=2"],
  ["14:32:13", "authorize(github)", "granted"],
  ["14:32:14", "observability.record", "ok"],
];

function TelemetryLog() {
  const [lines, setLines] = useState(LOG_SEED.slice(0, 6));

  useEffect(() => {
    if (reduced()) return;
    let i = 6;
    const id = window.setInterval(() => {
      i += 1;
      const [, name, val] = LOG_SEED[i % LOG_SEED.length];
      const now = new Date();
      const t = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((n) => String(n).padStart(2, "0"))
        .join(":");
      setLines((prev) => [...prev.slice(-7), [t, name, val]]);
    }, 1900);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="log" role="log" aria-label="Live telemetry">
      {lines.map((l, i) => (
        <div className="log-line" key={`${l[0]}-${i}`}>
          <span className="log-t">{l[0]}</span>
          <span>{l[1]}</span>
          <span className="log-v">{l[2]}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- the page */

export default function Landing({ onEnter }: { onEnter: () => void }) {
  useReveal();
  const [loopRef, loopProgress] = useScrollProgress<HTMLDivElement>();
  const [factoryRef, factoryProgress] = useScrollProgress<HTMLDivElement>();

  const activeLoop = Math.min(LOOP.length - 1, Math.floor(loopProgress * LOOP.length));
  const activeFactory = Math.min(5, Math.floor(factoryProgress * 6));

  return (
    <div className="aeos">
      {/* ============================================================ HERO */}
      <Section className="hero grid-bg grain">
        <div className="plate plate--hero">
          <img src="/img/hero-silicon.jpg" alt="" fetchPriority="high" />
        </div>

        <div className="wrap hero-grid">
          <div>
            <p className="tag" data-reveal>
              Personal AI engineering system / v1.0
            </p>

            <h1 className="display-xl" data-reveal style={v({ "--delay": "70ms", marginTop: "1.5rem" })}>
              Your AI engineering
              <br />
              career.{" "}
              <span className="glow-text">
                Running
                <br />
                as an OS.
              </span>
            </h1>

            <p className="lede" data-reveal style={v({ "--delay": "150ms", marginTop: "1.8rem" })}>
              Learn. Research. Practice. Build agents. Track the AI field, and understand
              your own engineering profile &mdash; in one system that listens.
            </p>

            <div
              data-reveal
              style={v({
                "--delay": "230ms",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.8rem",
                marginTop: "2.3rem",
              })}
            >
              <button className="cta" onClick={onEnter}>
                Enter the OS <span aria-hidden="true">&rarr;</span>
              </button>
              <a className="cta-ghost" href="#system">
                Explore the system <span aria-hidden="true">&darr;</span>
              </a>
            </div>

            <div
              data-reveal
              style={v({
                "--delay": "300ms",
                display: "flex",
                flexWrap: "wrap",
                gap: "1.4rem",
                marginTop: "2.6rem",
              })}
            >
              {["8 modules", "46 endpoints", "18/18 checks", "voice-first"].map((s) => (
                <span key={s} className="mono">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <HeroConsole />
        </div>

        <div className="scroll-hint" aria-hidden="true">
          <span />
        </div>
      </Section>

      {/* ================================================== 2. NOT ONE SKILL */}
      <Section id="system" className="sec-black grain">
        <NodeField />
        <div className="wrap-narrow" style={{ textAlign: "center" }}>
          <p className="tag" style={{ justifyContent: "center" }} data-reveal>
            The problem
          </p>
          <h2 className="display" data-reveal style={v({ "--delay": "60ms", marginTop: "1.4rem" })}>
            AI engineering
            <br />
            isn&rsquo;t one skill.
          </h2>
          <h2
            className="display"
            data-reveal
            style={v({ "--delay": "150ms", marginTop: "1.6rem", color: "#4d5a53" })}
          >
            So why are
            <br />
            your tools?
          </h2>
          <p
            className="lede"
            data-reveal
            style={v({ "--delay": "230ms", marginTop: "2rem", marginInline: "auto", textAlign: "center" })}
          >
            Six disciplines, six tabs, six places your progress goes to die. AI Engineer OS
            connects them into one loop that knows what you already know.
          </p>
        </div>
      </Section>

      {/* ======================================================== 3. THE LOOP */}
      <Section className="sec-void">
        <div className="wrap" ref={loopRef}>
          <p className="tag" data-reveal>
            The engineering loop
          </p>
          <h2 className="h-sec" data-reveal style={v({ "--delay": "60ms", margin: "1.2rem 0 2.4rem" })}>
            One loop. Six stages.
            <br />
            Nothing lost between them.
          </h2>

          <div className="rail" aria-hidden="true">
            <i style={{ transform: `scaleX(${Math.max(0.02, loopProgress)})`, width: "100%" }} />
          </div>

          <div className="loop">
            {LOOP.map((s, i) => (
              <div key={s.name} className={`loop-cell ${i <= activeLoop ? "loop-cell--on" : ""}`}>
                <span className="loop-idx">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="loop-name">{s.name}</p>
                  <p className="mono" style={{ marginTop: "0.3rem" }}>
                    {s.kicker}
                  </p>
                </div>
                {s.body}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* =========================================================== 4. VOICE */}
      <Section className="sec-black grid-bg grain">
        <div className="wrap">
          <div style={{ textAlign: "center", marginBottom: "3.4rem" }}>
            <p className="tag" style={{ justifyContent: "center" }} data-reveal>
              Voice control
            </p>
            <h2 className="h-sec" data-reveal style={v({ "--delay": "60ms", marginTop: "1.2rem" })}>
              Stop clicking.
              <br />
              <span className="glow-text">Start talking to your OS.</span>
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gap: "clamp(2rem, 5vw, 4rem)",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              alignItems: "center",
            }}
          >
            <div data-reveal>
              <div className="mic">
                <span className="mic-ring" />
                <span className="mic-ring" />
                <span className="mic-ring" />
                <span className="mic-core">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="9" y="2" width="6" height="12" rx="3" stroke="#2bf58c" strokeWidth="1.4" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="#2bf58c" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </span>
              </div>
              <p
                className="mono"
                style={{ textAlign: "center", marginTop: "1.6rem", color: "#e8efea", fontSize: "0.8rem" }}
              >
                &ldquo;Start an advanced interview on MCP&rdquo;
              </p>
            </div>

            <VoicePipe />

            <div className="panel" data-reveal style={v({ "--delay": "200ms" })}>
              <div className="panel-head">
                <span className="mono">Interview / MCP</span>
                <span className="chip chip--on">STAGE 04</span>
              </div>
              <div style={{ padding: "1rem" }}>
                <p style={{ fontSize: "0.92rem", lineHeight: 1.6, margin: 0 }}>
                  Where does the Model Context Protocol stop being the right abstraction?
                </p>
                <p className="mono" style={{ marginTop: "1.2rem" }}>
                  Deterministic match &middot; 0.92 confidence
                </p>
                <div className="wave" style={{ height: 26, marginTop: "0.7rem" }} aria-hidden="true">
                  {Array.from({ length: 26 }).map((_, i) => (
                    <i key={i} style={v({ "--d": `${(i % 7) * 110}ms`, "--h": `${30 + ((i * 37) % 55)}%` })} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* =================================================== 5. AGENT FACTORY */}
      <Section className="sec-void grain">
        <div className="plate plate--top">
          <img src="/img/factory-traces.jpg" alt="" loading="lazy" />
        </div>

        <div className="wrap" ref={factoryRef}>
          <p className="tag" data-reveal>
            Agent factory
          </p>
          <h2 className="h-sec" data-reveal style={v({ "--delay": "60ms", margin: "1.2rem 0 1.4rem" })}>
            Don&rsquo;t use 50 agents.
            <br />
            <span className="glow-text">Manufacture the one you need.</span>
          </h2>
          <p className="lede" data-reveal style={v({ "--delay": "130ms", marginBottom: "3rem" })}>
            One runtime. The model drafts a specification; deterministic code validates it,
            derives the permissions and authorises every single tool call.
          </p>

          <div className="factory">
            {[
              {
                t: "User request",
                k: "input",
                c: (
                  <p style={{ fontSize: "0.9rem", lineHeight: 1.55, margin: 0, color: "#e8efea" }}>
                    &ldquo;I need an agent that reviews Kubernetes deployments.&rdquo;
                  </p>
                ),
              },
              {
                t: "AI proposal",
                k: "llm",
                c: (
                  <>
                    <p style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>
                      Kubernetes Review Agent
                    </p>
                    <p className="mono" style={{ marginTop: "0.4rem" }}>
                      4 skills proposed &middot; 5 tools proposed
                    </p>
                  </>
                ),
              },
              {
                t: "Validate",
                k: "python",
                c: (
                  <>
                    {["Known skills only", "Known tools only", "Permissions derived", "Forbidden tools rejected"].map(
                      (x, i) => (
                        // Staggered by transition delay so the checks tick down in sequence
                        // rather than all snapping on together.
                        <div
                          key={x}
                          className={`check ${activeFactory >= 2 ? "check--on" : ""}`}
                          style={{ transitionDelay: `${i * 110}ms` }}
                        >
                          <i style={{ transitionDelay: `${i * 110}ms` }} />
                          {x}
                        </div>
                      ),
                    )}
                  </>
                ),
              },
              {
                t: "Authorize",
                k: "python",
                c: (
                  <>
                    {["Tool exists", "Agent holds tool", "Permission present", "Tool connected"].map((x, i) => (
                      <div
                        key={x}
                        className={`check ${activeFactory >= 3 ? "check--on" : ""}`}
                        style={{ transitionDelay: `${i * 110}ms` }}
                      >
                        <i style={{ transitionDelay: `${i * 110}ms` }} />
                        {x}
                      </div>
                    ))}
                  </>
                ),
              },
              {
                t: "Execute",
                k: "runtime",
                c: (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {TOOLS.map((x) => (
                      <span key={x} className={activeFactory >= 4 ? "chip chip--on" : "chip"}>
                        {x}
                      </span>
                    ))}
                  </div>
                ),
              },
              {
                t: "Result",
                k: "output",
                c: (
                  <>
                    <p style={{ fontSize: "0.9rem", margin: 0, color: "#e8efea" }}>
                      Deployment review complete.
                    </p>
                    <p className="mono" style={{ marginTop: "0.4rem" }}>
                      3 findings &middot; 2 tool calls &middot; 4.1s
                    </p>
                  </>
                ),
              },
            ].map((s, i) => (
              <div key={s.t} className={`fstep ${i <= activeFactory ? "fstep--on" : ""}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="mono" style={{ color: i <= activeFactory ? "#2bf58c" : undefined }}>
                    {String(i + 1).padStart(2, "0")} {s.t}
                  </span>
                  <span className="mono" style={{ fontSize: "0.56rem" }}>
                    {s.k}
                  </span>
                </div>
                {s.c}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ================================================ 6. PROFILE/EVIDENCE */}
      <Section className="sec-black">
        <div className="plate plate--right">
          <img src="/img/evidence-fibre.jpg" alt="" loading="lazy" />
        </div>

        <div className="wrap">
          <div
            style={{
              display: "grid",
              gap: "clamp(2rem, 5vw, 4rem)",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              alignItems: "center",
            }}
          >
            <div>
              <p className="tag" data-reveal>
                Profile &amp; research
              </p>
              <h2 className="h-sec" data-reveal style={v({ "--delay": "60ms", margin: "1.2rem 0 1.4rem" })}>
                Your resume tells a story.
                <br />
                <span style={{ color: "#4d5a53" }}>Your engineering footprint tells the rest.</span>
              </h2>
              <p className="lede" data-reveal style={v({ "--delay": "130ms" })}>
                An autonomous agent searches public sources, follows its own leads, and scores
                every finding for identity confidence. Nothing enters your profile until you
                approve it &mdash; and nothing is ever invented.
              </p>

              <div
                data-reveal
                style={v({ "--delay": "200ms", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1.8rem" })}
              >
                {["resume", "portfolio", "github", "public sources"].map((s) => (
                  <span key={s} className="chip">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="evidence" data-reveal style={v({ "--delay": "150ms" })}>
              <div className="panel-head" style={{ borderRadius: "10px 10px 0 0", border: "1px solid #1c2320" }}>
                <span className="mono">Evidence graph</span>
                <span className="mono">6 sources &middot; 51 findings</span>
              </div>
              {[
                ["Python", "resume + github + portfolio", "VERIFIED", "ok"],
                ["FastAPI", "github + portfolio", "VERIFIED", "ok"],
                ["LLM systems", "portfolio + 3 sources", "VERIFIED", "ok"],
                ["MCP", "1 source", "DEVELOPING", "mid"],
                ["Kubernetes", "no corroboration", "INSUFFICIENT EVIDENCE", "none"],
              ].map(([name, src, verdict, kind]) => (
                <div className="ev-row" key={name}>
                  <div>
                    <p className="ev-name" style={{ margin: 0 }}>
                      {name}
                    </p>
                    <p className="ev-src" style={{ margin: 0 }}>
                      {src}
                    </p>
                  </div>
                  <span className={`verdict verdict--${kind}`}>
                    {kind === "ok" ? "✓ " : kind === "mid" ? "◐ " : "? "}
                    {verdict}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ================================================ 7. LEARN + INTERVIEW */}
      <Section className="sec-void grid-bg">
        <div className="wrap">
          <div style={{ marginBottom: "3rem" }}>
            <p className="tag" data-reveal>
              Tutor &amp; interview
            </p>
            <h2 className="h-sec" data-reveal style={v({ "--delay": "60ms", marginTop: "1.2rem" })}>
              Learn it.
              <br />
              <span className="glow-text">Then defend it.</span>
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gap: "1.4rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            }}
          >
            <div className="panel" data-reveal>
              <div className="panel-head">
                <span className="mono">Tutor / senior</span>
                <span className="chip">intent: explain</span>
              </div>
              <div style={{ padding: "1.1rem", display: "grid", gap: "0.9rem" }}>
                <p className="mono" style={{ color: "#e8efea" }}>&gt; Explain RAG architecture.</p>
                <p style={{ fontSize: "0.9rem", lineHeight: 1.65, color: "#7c8b82", margin: 0 }}>
                  Retrieval and generation fail independently, so measure them independently.
                  A confident answer over the wrong chunk is a retrieval bug wearing a
                  generation costume&hellip;
                </p>
                <p className="mono">1 follow-up question queued</p>
              </div>
            </div>

            <div className="panel" data-reveal style={v({ "--delay": "120ms" })}>
              <div className="panel-head">
                <span className="mono">Interview / grading</span>
                <span className="chip chip--on">SCORED</span>
              </div>
              <div style={{ padding: "1.1rem", display: "grid", gap: "1rem" }}>
                <p className="mono" style={{ color: "#e8efea" }}>&gt; Now explain the tradeoffs.</p>
                {[
                  ["Understanding", 84],
                  ["Implementation", 72],
                  ["Tradeoffs", 61],
                ].map(([label, pct], i) => (
                  <div key={label as string} style={{ display: "grid", gap: "0.4rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="mono">{label}</span>
                      <span className="mono" style={{ color: "#2bf58c" }}>{pct}%</span>
                    </div>
                    <ScoreBar pct={pct as number} delay={i * 160} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* =================================================== 8. OBSERVABILITY */}
      <Section className="sec-black grain">
        <div className="plate plate--top">
          <img src="/img/observe-racks.jpg" alt="" loading="lazy" />
        </div>

        <div className="wrap">
          <p className="tag" data-reveal>
            Observability
          </p>
          <h2 className="h-sec" data-reveal style={v({ "--delay": "60ms", margin: "1.2rem 0 2.6rem" })}>
            Every token
            <br />
            <span className="glow-text">leaves a trace.</span>
          </h2>

          <div className="metrics" data-reveal>
            {[
              ["LLM requests", 36, ""],
              ["Tokens", 18421, ""],
              ["Est. cost", 42, "¢"],
              ["Avg latency", 182, "0ms"],
            ].map(([label, n, suffix]) => (
              <div className="metric" key={label as string}>
                <Counter to={n as number} suffix={suffix as string} />
                <span className="mono">{label}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gap: "1.4rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              marginTop: "1.4rem",
            }}
          >
            <div className="panel" data-reveal style={v({ "--delay": "80ms", padding: "1.1rem" })}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                <span className="mono">Spend by feature</span>
                <span className="mono">7 days</span>
              </div>
              <div className="spark" aria-hidden="true">
                {[38, 52, 31, 74, 46, 88, 61, 43, 70, 55, 92, 48, 66, 39, 81, 57, 45, 72].map((h, i) => (
                  <i key={i} style={v({ height: `${h}%`, "--d": `${i * 45}ms` })} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1.1rem" }}>
                {["tutor", "interview", "research", "agents"].map((f) => (
                  <span key={f} className="chip">
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <div data-reveal style={v({ "--delay": "150ms" })}>
              <TelemetryLog />
            </div>
          </div>
        </div>
      </Section>

      {/* ==================================================== 9. ARCHITECTURE */}
      <Section className="sec-void">
        <div className="wrap-narrow" style={{ textAlign: "center" }}>
          <p className="tag" style={{ justifyContent: "center" }} data-reveal>
            Trust boundary
          </p>
          <h2 className="display" data-reveal style={v({ "--delay": "60ms", margin: "1.4rem 0 1rem" })}>
            AI proposes.
          </h2>
          <h2 className="display glow-text" data-reveal style={v({ "--delay": "140ms", marginBottom: "3rem" })}>
            Code decides.
          </h2>

          <div className="arch" data-reveal style={v({ "--delay": "220ms" })}>
            {[
              ["llm()", "The one path to a model. Failover, token floors, truncated-JSON salvage and telemetry all live here, once."],
              ["validate_spec()", "Keeps only registry-known skills and tools. Permissions are derived from what survives, never read from the model."],
              ["authorize()", "Re-checked on every single tool call: tool exists, agent holds it, permission present, tool actually connected."],
              ["web_fetch()", "The only way out to the internet. Private address ranges blocked, and revalidated on every redirect hop."],
              ["observability", "Shape and cost, never content. No prompts, no responses, no keys -- enforced by a test."],
            ].map(([fn, why], i, arr) => (
              <div key={fn} style={{ display: "grid", gap: "0.6rem" }}>
                <div className="arch-node" tabIndex={0}>
                  <p className="arch-fn" style={{ margin: 0 }}>
                    {fn}
                  </p>
                  <p className="arch-why" style={{ margin: 0 }}>
                    {why}
                  </p>
                </div>
                {i < arr.length - 1 && <span className="arrow-v" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ======================================================= 10. SNAPSHOT */}
      <Section className="sec-black grain">
        <div className="plate">
          <img src="/img/hero-silicon.jpg" alt="" loading="lazy" style={{ filter: "saturate(.3) brightness(.3) contrast(1.2)" }} />
        </div>
        <div className="wrap">
          <p className="tag" data-reveal style={{ marginBottom: "2.2rem" }}>
            Current system snapshot
          </p>
        </div>
        <div className="snap" data-reveal>
          {[
            [5935, "", "Python LOC"],
            [5252, "", "TypeScript LOC"],
            [46, "", "API endpoints"],
            [18, " / 18", "Checks passing"],
            [8, "", "Core modules"],
            [12, "", "Registered tools"],
          ].map(([n, suffix, label]) => (
            <div className="snap-cell" key={label as string}>
              <Counter to={n as number} suffix={suffix as string} />
              <span className="mono">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ 11. CTA */}
      <Section className="sec-void grain" >
        <NodeField sparse />
        <div className="wrap-narrow" style={{ textAlign: "center", paddingBlock: "clamp(2rem,8vh,5rem)" }}>
          <h2 className="display" data-reveal>
            Your next AI engineering skill
            <br />
            <span style={{ color: "#4d5a53" }}>shouldn&rsquo;t live in another tab.</span>
          </h2>
          <div data-reveal style={v({ "--delay": "140ms", marginTop: "2.8rem" })}>
            <button className="cta" onClick={onEnter}>
              Enter the OS <span aria-hidden="true">&rarr;</span>
            </button>
          </div>

          <div className="rule" style={{ margin: "4.5rem 0 2rem" }} />
          <nav className="foot-nav">
            {["Learn", "Research", "Practice", "Build", "Profile", "Observe"].map((x) => (
              <span key={x}>{x}</span>
            ))}
          </nav>
          <p className="mono" style={{ marginTop: "2rem", fontSize: "0.58rem" }}>
            AI Engineer OS v1.0 &middot; single-user local build &middot; photography via Unsplash
          </p>
        </div>
      </Section>
    </div>
  );
}

/** Grading bar that fills once seen, so the score reads as being measured. */
function ScoreBar({ pct, delay }: { pct: number; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) return setW(pct);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setTimeout(() => setW(pct), delay);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pct, delay]);

  return (
    <span className="bar" ref={ref}>
      <i style={{ width: `${w}%` }} />
    </span>
  );
}
