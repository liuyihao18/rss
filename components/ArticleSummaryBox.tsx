"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

type ArticleSummaryBoxProps = {
  articleId: string;
  aiConfigured: boolean;
  initialSummary: string | null;
  initialBullets: string[];
  initialError: string | null;
  contentOverride: string;
};

type ArticlePayload = {
  aiSummary: string | null;
  aiBullets: string | null;
  aiError: string | null;
};

export default function ArticleSummaryBox({
  articleId,
  aiConfigured,
  initialSummary,
  initialBullets,
  initialError,
  contentOverride
}: ArticleSummaryBoxProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [bullets, setBullets] = useState(initialBullets);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const autoTriggered = useRef(false);

  const handleSseEvent = useCallback((raw: string) => {
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

    const data = JSON.parse(dataLine) as string | ArticlePayload;
    if (event === "token" && typeof data === "string") {
      setStreamText((current) => current + data);
      return;
    }

    if ((event === "done" || event === "error") && typeof data === "object") {
      setSummary(data.aiSummary);
      setBullets(parseBullets(data.aiBullets));
      setError(data.aiError);
      setStreamText("");
    }
  }, []);

  const readSummaryStream = useCallback(
    async (response: Response) => {
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
          handleSseEvent(event);
        }
      }
    },
    [handleSseEvent]
  );

  const summarize = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    setStreamText("");

    const response = await fetch(`/api/articles/${articleId}/summarize/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force, contentOverride })
    });

    if (!response.ok || !response.body) {
      setLoading(false);
      setError("摘要生成失败，请稍后重试。");
      return;
    }

    await readSummaryStream(response);
    setLoading(false);
  }, [articleId, contentOverride, readSummaryStream]);

  useEffect(() => {
    if (!aiConfigured || summary || error || autoTriggered.current) return;
    autoTriggered.current = true;
    void summarize(false);
  }, [aiConfigured, error, summarize, summary]);

  return (
    <section className="mb-6 rounded-md border border-saffron/25 bg-saffron/10 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles size={16} />
          中文摘要
        </div>
        <button
          onClick={() => summarize(Boolean(summary))}
          disabled={!aiConfigured || loading}
          className="min-h-10 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-moss disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "生成中..." : summary ? "重新生成" : "生成摘要"}
        </button>
      </div>

      {streamText ? (
        <p className="whitespace-pre-line leading-7 text-ink/85">{streamText}</p>
      ) : summary ? (
        <>
          <p className="mb-3 leading-7 text-ink/85">{summary}</p>
          <ul className="space-y-2 text-sm leading-6 text-ink/75">
            {bullets.map((bullet) => (
              <li key={bullet}>• {bullet}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm leading-6 text-ink/62">
          {aiConfigured ? "可以为这篇文章生成中文摘要和要点。" : "未配置 AI_API_KEY，当前显示原文内容。"}
        </p>
      )}

      {error ? <p className="mt-3 text-sm text-berry">{toChineseAiError(error)}</p> : null}
    </section>
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

function toChineseAiError(error: string) {
  if (error.includes("AI_API_KEY")) return "未配置 AI_API_KEY，已显示原文内容。";
  if (error.includes("too short") || error.includes("内容过少")) return "文章内容过少，无法生成可靠摘要。";
  return error;
}
