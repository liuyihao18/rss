"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpenCheck,
  ExternalLink,
  Heart,
  LogOut,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Rss
} from "lucide-react";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";

type Article = {
  id: string;
  title: string;
  link: string;
  summary: string | null;
  content: string | null;
  publishedAt: string | null;
  isRead: boolean;
  isFavorite: boolean;
  aiSummary: string | null;
  aiBullets: string | null;
  aiError: string | null;
  aiGeneratedAt: string | null;
  source: { id: string; name: string };
};

type Source = {
  id: string;
  name: string;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export default function ReaderApp({
  initialArticles,
  sources,
  aiConfigured
}: {
  initialArticles: Article[];
  sources: Source[];
  aiConfigured: boolean;
}) {
  const [articles, setArticles] = useState(initialArticles);
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState("all");
  const [filter, setFilter] = useState<"all" | "unread" | "favorite">("all");
  const [selectedId, setSelectedId] = useState(initialArticles[0]?.id || "");
  const [refreshing, setRefreshing] = useState(false);
  const [summarizingId, setSummarizingId] = useState("");
  const [streamText, setStreamText] = useState("");
  const autoSummarized = useRef(new Set<string>());

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return articles.filter((article) => {
      if (sourceId !== "all" && article.source.id !== sourceId) return false;
      if (filter === "unread" && article.isRead) return false;
      if (filter === "favorite" && !article.isFavorite) return false;
      if (!normalized) return true;
      return `${article.title} ${article.summary || ""} ${article.source.name}`.toLowerCase().includes(normalized);
    });
  }, [articles, filter, query, sourceId]);

  const selected = articles.find((article) => article.id === selectedId) || filtered[0];
  const unreadCount = articles.filter((article) => !article.isRead).length;
  const favoriteCount = articles.filter((article) => article.isFavorite).length;
  const failedCount = sources.filter((source) => source.lastError).length;

  async function refresh() {
    setRefreshing(true);
    const response = await fetch("/api/refresh", { method: "POST" });
    setRefreshing(false);
    if (response.ok) window.location.reload();
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function patchArticle(id: string, data: Partial<Pick<Article, "isRead" | "isFavorite">>) {
    const response = await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) return;
    const updated = (await response.json()) as Article;
    setArticles((current) => current.map((article) => (article.id === updated.id ? updated : article)));
  }

  async function summarize(id: string, force = false) {
    setSummarizingId(id);
    setStreamText("");
    const article = articles.find((item) => item.id === id);
    const response = await fetch(`/api/articles/${id}/summarize/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force, contentOverride: article?.content || article?.summary || article?.title || "" })
    });
    if (!response.ok || !response.body) {
      setSummarizingId("");
      return;
    }
    await readSummaryStream(response);
    setSummarizingId("");
  }

  useEffect(() => {
    if (!aiConfigured || !selected) return;
    if (selected.aiSummary || selected.aiError) return;
    if (summarizingId === selected.id) return;
    if (autoSummarized.current.has(selected.id)) return;
    autoSummarized.current.add(selected.id);
    void summarize(selected.id, false);
  }, [aiConfigured, selected?.aiError, selected?.aiSummary, selected?.id, summarizingId]);

  async function readSummaryStream(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        handleSummaryEvent(event);
      }
    }
  }

  function handleSummaryEvent(raw: string) {
    const event = raw
      .split(/\r?\n/)
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const dataLine = raw
      .split(/\r?\n/)
      .find((line) => line.startsWith("data:"))
      ?.slice(5)
      .trim();

    if (!event || !dataLine) return;
    const data = JSON.parse(dataLine) as string | Article;

    if (event === "token" && typeof data === "string") {
      setStreamText((current) => current + data);
      return;
    }

    if ((event === "done" || event === "error") && typeof data === "object") {
      setArticles((current) => current.map((article) => (article.id === data.id ? data : article)));
      setStreamText("");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-3 py-4 pb-24 sm:px-5 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:pb-6">
      <aside className="rounded-lg border border-moss/15 bg-white p-4 shadow-soft lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">AI 最新消息</h1>
            <p className="text-sm text-ink/55">{articles.length} 篇文章，{unreadCount} 篇未读</p>
          </div>
          <button title="退出登录" onClick={logout} className="rounded-md p-2 text-ink/60 hover:bg-mist hover:text-ink">
            <LogOut size={18} />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-md border border-moss/15 bg-mist/70 px-3">
          <Search size={17} className="text-moss" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、摘要、来源"
            className="h-10 w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            ["all", "全部", articles.length],
            ["unread", "未读", unreadCount],
            ["favorite", "收藏", favoriteCount]
          ].map(([value, label, count]) => (
            <button
              key={value}
              onClick={() => setFilter(value as "all" | "unread" | "favorite")}
              className={`rounded-md border px-2 py-2 text-sm ${filter === value ? "border-moss bg-moss text-white" : "border-moss/15 bg-white text-ink/70 hover:bg-mist"
                }`}
            >
              {label}
              <span className="ml-1 text-xs opacity-75">{count}</span>
            </button>
          ))}
        </div>

        <label className="mb-2 block text-sm font-medium text-ink/70" htmlFor="source">
          来源
        </label>
        <select
          id="source"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
          className="mb-4 h-10 w-full rounded-md border border-moss/15 bg-white px-3 text-sm outline-none"
        >
          <option value="all">全部来源</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>

        <button
          onClick={refresh}
          disabled={refreshing}
          className="mb-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink text-sm font-semibold text-white hover:bg-moss disabled:opacity-60"
        >
          <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "刷新中" : "刷新 RSS"}
        </button>

        <a href="/feed.xml" target="_blank" className="mb-5 flex items-center gap-2 rounded-md border border-moss/15 px-3 py-2 text-sm text-ink/70 hover:bg-mist">
          <Rss size={17} />
          聚合 RSS
        </a>

        {failedCount ? (
          <div className="rounded-md border border-berry/20 bg-berry/10 p-3 text-sm text-berry">
            {failedCount} 个来源最近刷新失败，可稍后重试。
          </div>
        ) : (
          <div className="rounded-md border border-moss/15 bg-mist/70 p-3 text-sm text-ink/60">
            {aiConfigured ? "AI 摘要已配置，可按需生成。" : "未配置 AI_API_KEY，默认显示原文摘要。"}
          </div>
        )}
      </aside>

      <section className="grid min-h-0 gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <div className="min-h-0 space-y-3 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto lg:pr-1">
          {filtered.map((article) => (
            <button
              key={article.id}
              onClick={() => {
                if (window.matchMedia("(max-width: 1023px)").matches) {
                  window.location.href = `/article/${article.id}`;
                  return;
                }
                setSelectedId(article.id);
                if (!article.isRead) void patchArticle(article.id, { isRead: true });
              }}
              className={`w-full rounded-lg border p-4 text-left transition ${selected?.id === article.id ? "border-moss bg-white shadow-soft" : "border-moss/10 bg-white/80 hover:border-moss/30"
                } ${article.isRead ? "opacity-75" : ""}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-ink/55">
                <span>{article.source.name}</span>
                <span>{formatDisplayDate(article.publishedAt)}</span>
              </div>
              <h2 className="mb-2 line-clamp-2 text-base font-semibold leading-snug text-ink">{article.title}</h2>
              <p className="line-clamp-2 text-sm leading-6 text-ink/62">{article.aiSummary || article.summary || article.content || "暂无摘要"}</p>
            </button>
          ))}
          {!filtered.length ? <div className="rounded-lg border border-moss/15 bg-white p-8 text-center text-ink/60">没有匹配文章</div> : null}
        </div>

        <article className="rounded-lg border border-moss/15 bg-white p-5 shadow-soft lg:max-h-[calc(100vh-2rem)] lg:overflow-auto sm:p-7">
          {selected ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-md bg-mist px-3 py-1 text-sm font-medium text-moss">{selected.source.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    title={selected.isRead ? "标为未读" : "标为已读"}
                    onClick={() => patchArticle(selected.id, { isRead: !selected.isRead })}
                    className="rounded-md p-2 text-ink/60 hover:bg-mist hover:text-ink"
                  >
                    <BookOpenCheck size={18} />
                  </button>
                  <button
                    title={selected.isFavorite ? "取消收藏" : "收藏"}
                    onClick={() => patchArticle(selected.id, { isFavorite: !selected.isFavorite })}
                    className="rounded-md p-2 text-ink/60 hover:bg-mist hover:text-ink"
                  >
                    {selected.isFavorite ? <Star size={18} fill="currentColor" /> : <Heart size={18} />}
                  </button>
                  <a title="阅读原文" href={selected.link} target="_blank" rel="noreferrer" className="rounded-md p-2 text-ink/60 hover:bg-mist hover:text-ink">
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>

              <h2 className="mb-3 text-2xl font-semibold leading-tight text-ink">{selected.title}</h2>
              <p className="mb-5 text-sm text-ink/50">{formatDisplayDateTime(selected.publishedAt)}</p>

              <section className="mb-5 rounded-md border border-saffron/20 bg-saffron/10 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Sparkles size={17} />
                    中文摘要
                  </div>
                  <button
                    onClick={() => summarize(selected.id, Boolean(selected.aiSummary))}
                    disabled={!aiConfigured || summarizingId === selected.id}
                    className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-moss disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {summarizingId === selected.id ? "生成中" : selected.aiSummary ? "重新生成" : "生成摘要"}
                  </button>
                </div>
                {summarizingId === selected.id && streamText ? (
                  <p className="whitespace-pre-line leading-7 text-ink/82">{streamText}</p>
                ) : selected.aiSummary ? (
                  <>
                    <p className="mb-3 leading-7 text-ink/82">{selected.aiSummary}</p>
                    <ul className="space-y-2 text-sm leading-6 text-ink/72">
                      {parseBullets(selected.aiBullets).map((bullet) => (
                        <li key={bullet}>• {bullet}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm leading-6 text-ink/62">
                    {aiConfigured ? "可为这篇文章生成中文摘要和要点。" : "未配置 AI_API_KEY，当前显示原文摘要。"}
                  </p>
                )}
                {selected.aiError ? <p className="mt-3 text-sm text-berry">{selected.aiError}</p> : null}
              </section>

              <p className="whitespace-pre-line leading-8 text-ink/76">{selected.content || selected.summary || "此 RSS 条目没有提供摘要内容。"}</p>
              <Link href={`/article/${selected.id}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-moss">
                打开详情页
                <ExternalLink size={15} />
              </Link>
            </>
          ) : (
            <div className="py-20 text-center text-ink/60">还没有文章。点击刷新 RSS 获取最新消息。</div>
          )}
        </article>
      </section>

      <nav className="fixed inset-x-3 bottom-3 grid grid-cols-3 gap-2 rounded-lg border border-moss/15 bg-white/95 p-2 shadow-soft backdrop-blur lg:hidden">
        <button onClick={refresh} className="flex h-11 items-center justify-center gap-2 rounded-md bg-ink text-sm font-semibold text-white">
          <RefreshCw size={16} />
          刷新
        </button>
        <button onClick={() => setFilter("unread")} className="flex h-11 items-center justify-center gap-2 rounded-md bg-mist text-sm font-semibold text-moss">
          <BookOpenCheck size={16} />
          未读
        </button>
        <button onClick={() => setFilter("favorite")} className="flex h-11 items-center justify-center gap-2 rounded-md bg-mist text-sm font-semibold text-moss">
          <Star size={16} />
          收藏
        </button>
      </nav>
    </main>
  );
}

function parseBullets(value: string | null) {
  if (!value) return [];
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}
