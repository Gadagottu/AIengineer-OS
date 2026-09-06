import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type Completeness,
  type PastWorkUpload,
  type PersonalProfile,
  type ProfileItem,
  type SyncChange,
} from "../api";
import type { Inbound } from "../App";
import { Empty, ErrorNote, Panel, ScreenHeader, Spinner, asArray, pretty } from "../ui";
import { useVoiceTargets } from "../voiceTargets";


const ASK_PROMPTS = [
  "What are my strongest projects?",
  "What are my strongest technical skills?",
  "Prepare me for an interview based on my experience.",
  "Give me a 60-second introduction.",
  "Which project should I discuss for a senior AI engineer interview?",
  "What should I improve?",
  "Generate interview questions from my projects.",
];

/** Where a piece of information came from. Never guessed — always shown. */
function SourceBadge({
  item,
}: {
  item: { source?: string | null; edited?: boolean; evidence?: string[] };
}) {
  if (item.edited) return <span className="badge text-accent">User edited</span>;
  const sources = item.evidence?.length ? item.evidence : item.source ? [item.source] : [];
  if (!sources.length) return null;
  return (
    <>
      {sources.map((s) => (
        <span key={s} className="badge">
          {s === "ai" ? "AI generated" : `Source: ${pretty(s)}`}
        </span>
      ))}
    </>
  );
}


/** Generic editable list: add, edit and delete rows of a profile section. */
function EditableList({
  items,
  fields,
  onChange,
}: {
  items: ProfileItem[];
  fields: { key: string; label: string; wide?: boolean }[];
  onChange: (next: ProfileItem[]) => void;
}) {
  const set = (index: number, key: string, value: string) =>
    onChange(items.map((it, i) => (i === index ? { ...it, [key]: value, edited: true } : it)));

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.id ?? index} className="rounded-xl border border-line bg-surface-2 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <SourceBadge item={item} />
            <button
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="ml-auto text-xs text-ink-muted hover:text-red-400"
            >
              Delete
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key} className={field.wide ? "sm:col-span-2" : ""}>
                <span className="label">{field.label}</span>
                <input
                  className="field"
                  value={String(item[field.key] ?? "")}
                  onChange={(e) => set(index, field.key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        className="btn-ghost w-full py-2 text-xs"
        onClick={() =>
          onChange([...items, { id: `new-${Date.now()}`, source: "user", edited: true }])
        }
      >
        + Add
      </button>
    </div>
  );
}

export default function Profile({ inbound }: { inbound: Inbound }) {
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [complete, setComplete] = useState<Completeness | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pastWork, setPastWork] = useState<PastWorkUpload[]>([]);
  const [sync, setSync] = useState<SyncChange[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const resumeRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api
      .getProfile()
      .then((r) => {
        setProfile(r.profile);
        setComplete(r.completeness);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load profile."))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  // A voice command may have changed the profile server-side.
  useEffect(() => {
    if (inbound?.action?.startsWith("profile") || inbound?.action === "improve_bio") load();
  }, [inbound?.at]);

  /** Every mutating call funnels through here so status and errors stay consistent. */
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

  const patch = (next: Partial<PersonalProfile>) => {
    if (!profile) return;
    setProfile({ ...profile, ...next });
  };

  const save = () =>
    run("Saving", () => api.updateProfile(profile as unknown as Record<string, unknown>), (r) => {
      setProfile(r.profile);
      setComplete(r.completeness);
      setEditing(false);
    });

  // Registered before the early returns below, because hooks must run every render.
  useVoiceTargets(
    [
      { id: "edit", label: editing ? "Stop editing" : "Edit profile", kind: "action" as const },
      ...(editing ? [{ id: "save", label: "Save profile", kind: "action" as const }] : []),
      { id: "bio:improve", label: "Improve bio", kind: "action" as const },
      { id: "bio:interview", label: "Interview bio", kind: "action" as const },
      { id: "bio:short", label: "Short bio", kind: "action" as const },
      { id: "build", label: "Build profile", kind: "action" as const },
      { id: "analyze", label: "Analyse profile", kind: "action" as const },
      { id: "narrative", label: "Engineering DNA", kind: "action" as const },
      ...ASK_PROMPTS.map((prompt) => ({
        id: `ask:${prompt}`,
        label: prompt,
        kind: "action" as const,
      })),
    ],
    (id) => {
      if (id === "edit") return setEditing((v) => !v);
      if (id === "save") return void save();
      if (id === "build") return void run("build", () => api.buildProfile());
      if (id === "analyze") return void run("analyze", () => api.analyzeProfile());
      if (id === "narrative") return void run("narrative", () => api.generateNarrative());
      if (id.startsWith("bio:")) {
        const style = id.slice(4) as "improve" | "interview" | "short";
        return void run(style, () => api.generateBio(style));
      }
      if (id.startsWith("ask:")) {
        const prompt = id.slice(4);
        return void run("ask", () => api.askAboutMe(prompt), (r) => {
          setAnswer(r.answer);
          setQuestion(prompt);
        });
      }
    },
  );

  if (loading) return <Spinner label="Loading profile" />;
  if (!profile) return <ErrorNote error={error} />;

  const name = profile.basic.name.value;
  const hasContent = profile.sources.length > 0;

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Personal Details"
        subtitle="Your engineering identity, built from your own documents."
      >
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Done editing" : "Edit"}
          </button>
          {editing && (
            <button className="btn-primary" onClick={save} disabled={busy !== null}>
              {busy === "Saving" ? <Spinner label="Saving" /> : "Save"}
            </button>
          )}
        </div>
      </ScreenHeader>

      <ErrorNote error={error} />

      {/* 1. Profile header ------------------------------------------------ */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {editing ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {(["name", "headline", "location", "email"] as const).map((key) => (
                  <label key={key}>
                    <span className="label">{key}</span>
                    <input
                      className="field"
                      value={profile.basic[key].value ?? ""}
                      onChange={(e) =>
                        patch({
                          basic: {
                            ...profile.basic,
                            [key]: { ...profile.basic[key], value: e.target.value, edited: true },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold">{name || "Unnamed engineer"}</h2>
                <p className="text-sm text-ink-muted">
                  {profile.basic.headline.value || "No headline yet"}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["improve", "interview", "short"] as const).map((style) => (
              <button
                key={style}
                className="btn-chip"
                disabled={busy !== null || !hasContent}
                onClick={() => run(style, () => api.generateBio(style))}
              >
                {busy === style ? "…" : { improve: "Improve Bio", interview: "Interview Bio", short: "Short Bio" }[style]}
              </button>
            ))}
          </div>
        </div>

        {editing ? (
          <textarea
            className="field mt-3"
            rows={4}
            value={profile.bio.full.value ?? ""}
            onChange={(e) =>
              patch({
                bio: { ...profile.bio, full: { ...profile.bio.full, value: e.target.value, edited: true } },
              })
            }
          />
        ) : (
          profile.bio.full.value && <p className="prose-reply mt-3">{profile.bio.full.value}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <SourceBadge item={profile.bio.full} />
        </div>

        {(profile.bio.short.value || profile.bio.interview.value) && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {profile.bio.short.value && (
              <div className="rounded-xl border border-line bg-surface-2 p-3">
                <p className="label">Short bio</p>
                <p className="text-sm">{profile.bio.short.value}</p>
              </div>
            )}
            {profile.bio.interview.value && (
              <div className="rounded-xl border border-line bg-surface-2 p-3">
                <p className="label">Interview bio</p>
                <p className="text-sm">{profile.bio.interview.value}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 10. Completeness -------------------------------------------------- */}
      {complete && (
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Profile completeness</h2>
            <span className="text-sm text-ink-muted">
              {complete.filled}/{complete.total} sections
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar"
               aria-valuenow={complete.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-500"
                 style={{ width: `${complete.percent}%` }} />
          </div>
          {complete.missing.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">Still missing: {complete.missing.join(", ")}</p>
          )}
        </section>
      )}

      {/* 2. Import --------------------------------------------------------- */}
      <Panel title="Import profile" subtitle="Nothing is invented — every field is traced to a source.">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <span className="label">Resume PDF</span>
              <input ref={resumeRef} type="file" accept="application/pdf" className="field text-xs" />
            </div>
            <button
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() => {
                const file = resumeRef.current?.files?.[0];
                if (!file) return setError("Choose a PDF first.");
                run("resume", () => api.importResume(file));
              }}
            >
              {busy === "resume" ? <Spinner label="Reading" /> : "Upload"}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <label>
              <span className="label">Portfolio URL</span>
              <input
                className="field"
                placeholder="https://your-site.dev"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
              />
            </label>
            <button
              className="btn-ghost"
              disabled={busy !== null || !portfolioUrl.trim()}
              onClick={() => run("portfolio", () => api.importPortfolio(portfolioUrl.trim()))}
            >
              {busy === "portfolio" ? <Spinner label="Fetching" /> : "Fetch"}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <label>
              <span className="label">Any public link</span>
              <input
                className="field"
                placeholder="github.com/you  ·  your blog  ·  an about page"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <span className="mt-1 block text-xs text-ink-muted">
                GitHub profiles use the public API. LinkedIn blocks automated access — use its
                “More → Save to PDF” export and upload it as a resume instead.
              </span>
            </label>
            <button
              className="btn-ghost"
              disabled={busy !== null || !linkUrl.trim()}
              onClick={() => run("link", () => api.importLink(linkUrl.trim()), () => {
                setLinkUrl("");
                load();
              })}
            >
              {busy === "link" ? <Spinner label="Reading" /> : "Import"}
            </button>
          </div>

          <div>
            <span className="label">Past work PDFs</span>
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="field text-xs"
              onChange={(e) =>
                setPastWork(Array.from(e.target.files ?? []).map((file) => ({ file })))
              }
            />
            {pastWork.map((upload, index) => (
              <div key={index} className="mt-2 grid gap-2 sm:grid-cols-3">
                <span className="truncate self-center text-xs text-ink-muted">
                  {upload.file.name}
                </span>
                <input
                  className="field py-1.5 text-xs"
                  placeholder="Title (optional)"
                  onChange={(e) =>
                    setPastWork((prev) =>
                      prev.map((u, i) => (i === index ? { ...u, title: e.target.value } : u)),
                    )
                  }
                />
                <input
                  className="field py-1.5 text-xs"
                  placeholder="Category (optional)"
                  onChange={(e) =>
                    setPastWork((prev) =>
                      prev.map((u, i) => (i === index ? { ...u, category: e.target.value } : u)),
                    )
                  }
                />
              </div>
            ))}
            {pastWork.length > 0 && (
              <button
                className="btn-ghost mt-2 w-full py-2 text-xs"
                disabled={busy !== null}
                onClick={() => run("past-work", () => api.importPastWork(pastWork), () => {
                  setPastWork([]);
                  load();
                })}
              >
                {busy === "past-work" ? <Spinner label="Reading documents" /> : `Import ${pastWork.length} document(s)`}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <button
              className="btn-primary"
              disabled={busy !== null || !hasContent}
              onClick={() => run("build", () => api.buildProfile())}
            >
              {busy === "build" ? <Spinner label="Building" /> : "Build / Update Profile"}
            </button>
            <button
              className="btn-ghost"
              disabled={busy !== null || !hasContent}
              onClick={() => run("analyze", () => api.analyzeProfile())}
            >
              {busy === "analyze" ? <Spinner label="Analysing" /> : "Refresh AI analysis"}
            </button>
            <button
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() =>
                run("sync", () => api.syncPortfolio(), (r) => {
                  setSync(r.changes);
                  setPicked(new Set(r.changes.map((_, i) => i)));
                })
              }
            >
              {busy === "sync" ? <Spinner label="Checking" /> : "Sync Portfolio"}
            </button>
          </div>

          {profile.sources.length > 0 && (
            <ul className="space-y-1 border-t border-line pt-3 text-xs text-ink-muted">
              {profile.sources.map((s) => (
                <li key={s.id} className="flex flex-wrap gap-2">
                  <span className="badge">{pretty(s.source_type)}</span>
                  <span className="truncate">{s.source_name}</span>
                  <span>· {new Date(s.extracted_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {/* 9. Portfolio sync review ------------------------------------------ */}
      {sync && (
        <Panel title="Portfolio changes" subtitle="Nothing is applied until you choose.">
          {sync.length === 0 ? (
            <p className="text-sm text-ink-muted">No changes found. Your edits are untouched.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {sync.map((change, index) => (
                  <li key={index} className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={picked.has(index)}
                      onChange={(e) =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          e.target.checked ? next.add(index) : next.delete(index);
                          return next;
                        })
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-mono text-accent">
                          {change.kind === "new" ? "+" : "~"}
                        </span>{" "}
                        {pretty(change.section)}: <span className="font-medium">{change.label}</span>
                      </p>
                      {change.kind === "updated" && (
                        <p className="mt-1 text-xs text-ink-muted">Updated description from portfolio</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  className="btn-primary"
                  disabled={busy !== null}
                  onClick={() =>
                    run("apply", () => api.applySync(sync.filter((_, i) => picked.has(i))), () => {
                      setSync(null);
                      load();
                    })
                  }
                >
                  Apply Selected
                </button>
                <button className="btn-ghost" onClick={() => setSync(null)}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </Panel>
      )}

      {!hasContent && (
        <Empty
          title="No profile yet"
          hint="Upload a resume, add your portfolio URL, or import past-work documents above."
        />
      )}

      {/* 5. How AI sees you ------------------------------------------------ */}
      {profile.ai_insights && profile.ai_insights.areas.length > 0 && (
        <Panel title="How AI sees you" subtitle="Areas and evidence — deliberately not a score.">
          <div className="grid gap-2 sm:grid-cols-2">
            {profile.ai_insights.areas.map((area) => (
              <div key={area.name} className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{area.name}</p>
                  <span className={`badge ${area.level === "strong" ? "text-accent" : ""}`}>
                    {pretty(area.level || "")}
                  </span>
                </div>
                {asArray(area.evidence).length > 0 && (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Evidence: {asArray(area.evidence).join(" + ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!!profile.ai_insights.recommended?.length && (
            <div className="mt-4">
              <p className="label">Recommended to improve</p>
              <ul className="space-y-1 text-sm text-ink-muted">
                {profile.ai_insights.recommended.map((r, i) => (
                  <li key={i}>
                    <span className="text-ink">{r.area}</span> — {r.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {/* 6. Engineering DNA ------------------------------------------------ */}
      {profile.engineering_dna && (
        <Panel title="My Engineering DNA" subtitle="Recurring patterns across your actual work.">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["technical_strengths", "Technical strengths"],
                ["systems_built", "Systems built"],
                ["engineering_patterns", "Engineering patterns"],
                ["specializations", "Specialisations"],
                ["next_focus", "Suggested next focus"],
              ] as const
            ).map(([key, label]) => {
              const values = asArray(profile.engineering_dna?.[key]);
              if (!values.length) return null;
              return (
                <div key={key} className="rounded-xl border border-line bg-surface-2 p-3">
                  <p className="label">{label}</p>
                  <ul className="space-y-1 text-sm">
                    {values.map((v, i) => (
                      <li key={i}>· {v}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* 4. Project knowledge ---------------------------------------------- */}
      {profile.projects.length > 0 && (
        <Panel title="Project knowledge" subtitle="Extracted from your resume, portfolio and past work.">
          <div className="space-y-3">
            {profile.projects.map((project, index) => (
              <article key={project.id ?? index} className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="font-medium">{String(project.name ?? "Untitled")}</h3>
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    <SourceBadge item={project} />
                  </span>
                </div>
                {(
                  [
                    ["description", "Description"],
                    ["problem", "Problem solved"],
                    ["architecture", "Architecture"],
                    ["contribution", "My contribution"],
                    ["challenges", "Challenges & decisions"],
                    ["results", "Results"],
                  ] as const
                ).map(([key, label]) =>
                  project[key] ? (
                    <p key={key} className="mt-2 text-sm">
                      <span className="label mb-0 inline">{label}: </span>
                      <span className="text-ink-muted">{String(project[key])}</span>
                    </p>
                  ) : null,
                )}
                {asArray(project.technologies).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {asArray(project.technologies).map((t) => (
                      <span key={t} className="badge">{t}</span>
                    ))}
                  </div>
                )}
                {typeof project.link === "string" && project.link && (
                  <a className="btn-chip mt-3" href={project.link} target="_blank" rel="noreferrer noopener">
                    Open ↗
                  </a>
                )}
              </article>
            ))}
          </div>
        </Panel>
      )}

      {/* 7. Career narrative ----------------------------------------------- */}
      <Panel
        title="My Engineering Story"
        subtitle="Generated only from verified profile information."
        action={
          <button
            className="btn-ghost"
            disabled={busy !== null || !hasContent}
            onClick={() => run("narrative", () => api.generateNarrative())}
          >
            {busy === "narrative" ? <Spinner label="Writing" /> : "Generate"}
          </button>
        }
      >
        {editing ? (
          <textarea
            className="field"
            rows={7}
            value={profile.career_narrative.value ?? ""}
            onChange={(e) =>
              patch({
                career_narrative: { ...profile.career_narrative, value: e.target.value, edited: true },
              })
            }
          />
        ) : profile.career_narrative.value ? (
          <p className="prose-reply">{profile.career_narrative.value}</p>
        ) : (
          <p className="text-sm text-ink-muted">Not generated yet.</p>
        )}
      </Panel>

      {/* 3. Editable sections ---------------------------------------------- */}
      {editing && (
        <>
          <Panel title="Skills" subtitle="Grouped by the category you give them.">
            <EditableList
              items={profile.skills}
              fields={[{ key: "name", label: "Skill" }, { key: "category", label: "Category" }]}
              onChange={(skills) => patch({ skills })}
            />
          </Panel>
          <Panel title="Experience">
            <EditableList
              items={profile.experience}
              fields={[
                { key: "company", label: "Company" },
                { key: "role", label: "Role" },
                { key: "start", label: "Start" },
                { key: "end", label: "End" },
                { key: "summary", label: "Summary", wide: true },
              ]}
              onChange={(experience) => patch({ experience })}
            />
          </Panel>
          <Panel title="Education">
            <EditableList
              items={profile.education}
              fields={[
                { key: "institution", label: "Institution" },
                { key: "qualification", label: "Qualification" },
                { key: "year", label: "Year" },
              ]}
              onChange={(education) => patch({ education })}
            />
          </Panel>
          <Panel title="Certifications">
            <EditableList
              items={profile.certifications}
              fields={[
                { key: "name", label: "Name" },
                { key: "issuer", label: "Issuer" },
                { key: "year", label: "Year" },
              ]}
              onChange={(certifications) => patch({ certifications })}
            />
          </Panel>
          <Panel title="Achievements">
            <EditableList
              items={profile.achievements}
              fields={[
                { key: "title", label: "Title" },
                { key: "detail", label: "Detail", wide: true },
              ]}
              onChange={(achievements) => patch({ achievements })}
            />
          </Panel>
          <Panel title="Projects">
            <EditableList
              items={profile.projects}
              fields={[
                { key: "name", label: "Name" },
                { key: "link", label: "Link" },
                { key: "description", label: "Description", wide: true },
                { key: "problem", label: "Problem solved", wide: true },
                { key: "architecture", label: "Architecture", wide: true },
                { key: "contribution", label: "My contribution", wide: true },
              ]}
              onChange={(projects) => patch({ projects })}
            />
          </Panel>
          <Panel title="Professional links">
            <EditableList
              items={profile.links}
              fields={[{ key: "label", label: "Label" }, { key: "url", label: "URL" }]}
              onChange={(links) => patch({ links })}
            />
          </Panel>
        </>
      )}

      {/* Read-only skills / experience view -------------------------------- */}
      {!editing && profile.skills.length > 0 && (
        <Panel title="Skills">
          {Object.entries(
            profile.skills.reduce<Record<string, ProfileItem[]>>((groups, skill) => {
              const key = String(skill.category ?? "Other");
              (groups[key] ||= []).push(skill);
              return groups;
            }, {}),
          ).map(([category, skills]) => (
            <div key={category} className="mb-3">
              <p className="label">{category}</p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s, i) => (
                  <span key={i} className="badge" title={(s.evidence ?? []).join(", ")}>
                    {String(s.name ?? "")}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      )}

      {!editing && profile.experience.length > 0 && (
        <Panel title="Experience">
          <div className="space-y-3">
            {profile.experience.map((job, i) => (
              <div key={job.id ?? i} className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{String(job.role ?? "")}</p>
                  <p className="text-sm text-ink-muted">{String(job.company ?? "")}</p>
                  <span className="ml-auto text-xs text-ink-muted">
                    {String(job.start ?? "")} — {String(job.end ?? "")}
                  </span>
                </div>
                {job.summary ? (
                  <p className="mt-1.5 text-sm text-ink-muted">{String(job.summary)}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <SourceBadge item={job} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 8. Ask AI about me ------------------------------------------------ */}
      <Panel title="Ask AI about me" subtitle="Answers use only your saved profile.">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ASK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              className="btn-chip"
              disabled={busy !== null || !hasContent}
              onClick={() =>
                run("ask", () => api.askAboutMe(prompt), (r) => {
                  setAnswer(r.answer);
                  setQuestion(prompt);
                })
              }
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim())
              run("ask", () => api.askAboutMe(question.trim()), (r) => setAnswer(r.answer));
          }}
        >
          <input
            className="field"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your own experience…"
          />
          <button className="btn-primary" disabled={busy !== null || !question.trim()}>
            Ask
          </button>
        </form>
        {busy === "ask" && <div className="mt-3"><Spinner label="Thinking" /></div>}
        {answer && busy !== "ask" && (
          <p className="prose-reply mt-3 rounded-xl border border-line bg-surface-2 p-3">{answer}</p>
        )}
      </Panel>
    </div>
  );
}
