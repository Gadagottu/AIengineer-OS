import { useEffect, useState } from "react";
import { api, ApiError, type NewsFeed, type NewsItem } from "../api";
import type { Inbound, VoiceContext } from "../App";
import { Empty, ErrorNote, ScreenHeader, Spinner } from "../ui";
import { useVoiceTargets } from "../voiceTargets";

export default function News({
  inbound,
  onContext,
}: {
  inbound: Inbound;
  onContext: (patch: VoiceContext) => void;
}) {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [explaining, setExplaining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load(refresh = false) {
    setLoading(true);
    setError(null);
    api
      .news(30, refresh)
      .then(setFeed)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load news."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  // Adopt whatever the voice command already fetched or explained.
  useEffect(() => {
    if (inbound?.action === "news") setFeed(inbound.result as unknown as NewsFeed);
    if (inbound?.action === "explain_news") {
      const result = inbound.result as { item?: NewsItem; explanation?: string };
      if (result.item) setSelected(result.item);
      if (result.explanation) setExplanation(result.explanation);
    }
  }, [inbound?.at]);

  async function explain(item: NewsItem) {
    setSelected(item);
    setExplanation(null);
    setExplaining(true);
    setError(null);
    onContext({ news_id: item.id }); // so "explain this news" works by voice
    try {
      const result = await api.explainNews(item.id);
      setExplanation(result.explanation);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not explain this item.");
    } finally {
      setExplaining(false);
    }
  }

  // Each headline is addressable by (part of) its title.
  useVoiceTargets(
    [
      { id: "refresh", label: "Refresh news", kind: "action" as const },
      ...(feed?.items ?? []).map((i) => ({
        id: `news:${i.id}`,
        label: i.title,
        kind: "select" as const,
      })),
    ],
    (id) => {
      if (id === "refresh") return load(true);
      const item = (feed?.items ?? []).find((i) => `news:${i.id}` === id);
      if (item) explain(item);
    },
  );

  return (
    <div className="space-y-5">
      <ScreenHeader title="AI News" subtitle="High-signal sources, ranked by importance.">
        <button className="btn-ghost" onClick={() => load(true)} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </ScreenHeader>

      <ErrorNote error={error} />

      {feed && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="badge">{feed.live_count} live</span>
          {feed.seeded_count > 0 && <span className="badge">{feed.seeded_count} seeded/demo</span>}
          {feed.fetched_at && <span>updated {new Date(feed.fetched_at).toLocaleString()}</span>}
          {feed.fetch_errors.length > 0 && (
            <span className="text-amber-500">{feed.fetch_errors.length} source(s) unreachable</span>
          )}
        </div>
      )}

      {feed?.note && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-500">
          {feed.note}
        </p>
      )}

      {loading && !feed && <Spinner label="Fetching news" />}
      {feed && feed.items.length === 0 && !loading && (
        <Empty title="Nothing to show" hint="No live items and no seeded items. Try Refresh." />
      )}

      <ul className="space-y-3">
        {feed?.items.map((item) => (
          <li key={item.id} className="card p-4">
            <div className="flex items-start gap-3">
              <span
                title={`Importance ${item.importance} of 10`}
                className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold ${
                  item.importance >= 9
                    ? "bg-accent text-accent-ink"
                    : item.importance >= 7
                      ? "bg-accent/20 text-accent"
                      : "bg-surface-2 text-ink-muted"
                }`}
              >
                {item.importance}
              </span>

              <div className="min-w-0 flex-1">
                <h2 className="font-medium leading-snug">{item.title}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                  <span>{item.source}</span>
                  {item.published_at && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{new Date(item.published_at).toLocaleDateString()}</span>
                    </>
                  )}
                  {item.kind === "seed" && <span className="badge">seeded</span>}
                </p>
                {item.summary && (
                  <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{item.summary}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-chip" onClick={() => explain(item)}>
                    Why it matters
                  </button>
                  <a
                    className="btn-chip"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Source ↗
                  </a>
                </div>

                {selected?.id === item.id && (explaining || explanation) && (
                  <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3.5">
                    {explaining ? (
                      <Spinner label="Explaining" />
                    ) : (
                      <p className="prose-reply">{explanation}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
