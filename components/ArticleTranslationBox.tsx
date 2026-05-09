"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Languages } from "lucide-react";

type ArticleTranslationBoxProps = {
  articleId: string;
  aiConfigured: boolean;
  initialTranslation: string | null;
  initialError: string | null;
  initialSourceHash: string | null;
  contentOverride: string;
};

type ArticlePayload = {
  aiTranslation: string | null;
  aiTranslationError: string | null;
  aiTranslationSourceHash: string | null;
};

export default function ArticleTranslationBox({
  articleId,
  aiConfigured,
  initialTranslation,
  initialError,
  initialSourceHash,
  contentOverride
}: ArticleTranslationBoxProps) {
  const [translation, setTranslation] = useState<string[]>(parseTranslation(initialTranslation));
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [sourceHash, setSourceHash] = useState<string | null>(null);

  const originalParagraphs = useMemo(() => splitParagraphs(contentOverride), [contentOverride]);

  useEffect(() => {
    let alive = true;
    void hashText(contentOverride).then((hash) => {
      if (alive) setSourceHash(hash);
    });
    return () => {
      alive = false;
    };
  }, [contentOverride]);

  const needsRefresh =
    !initialTranslation || (sourceHash && initialSourceHash && sourceHash !== initialSourceHash);

  async function translate(force = false) {
    setLoading(true);
    setError(null);
    setStreamText("");

    const response = await fetch(`/api/articles/${articleId}/translate/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force, contentOverride })
    });

    if (!response.ok || !response.body) {
      setLoading(false);
      setError("翻译生成失败，请稍后重试。");
      return;
    }

    await readTranslationStream(response);
    setLoading(false);
  }

  async function readTranslationStream(response: Response) {
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
        handleTranslationEvent(event);
      }
    }
  }

  function handleTranslationEvent(raw: string) {
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
      setTranslation(parseTranslation(data.aiTranslation));
      setError(data.aiTranslationError);
      setStreamText("");
    }
  }

  const hasTranslation = translation.length > 0;

  return (
    <section className="mb-6 rounded-md border border-moss/15 bg-mist/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Languages size={16} />
          全文翻译（中英对照）
        </div>
        <button
          onClick={() => translate(Boolean(translation.length) || Boolean(needsRefresh))}
          disabled={!aiConfigured || loading}
          className="min-h-10 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-moss disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "翻译中..." : translation.length ? "重新翻译" : "生成翻译"}
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-4 rounded-md border border-moss/10 bg-white/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">中文译文</p>
          {streamText ? (
            <p className="whitespace-pre-line leading-7 text-ink/75">{streamText}</p>
          ) : hasTranslation ? (
            translation.map((paragraph, index) => (
              <p key={`${articleId}-trans-${index}`} className="leading-7 text-ink">
                {paragraph}
              </p>
            ))
          ) : loading ? (
            <p className="text-sm leading-6 text-ink/70">正在生成中文翻译，请稍候...</p>
          ) : (
            <p className="text-sm leading-6 text-ink/62">
              {aiConfigured ? "点击“生成翻译”按钮后会显示中文译文。" : "未配置 AI_API_KEY，当前显示原文内容。"}
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-md border border-moss/10 bg-white/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">英文原文</p>
          {originalParagraphs.length ? (
            originalParagraphs.map((paragraph, index) => (
              <p key={`${articleId}-origin-${index}`} className="leading-7 text-ink/80">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="text-sm text-ink/60">未找到可显示的原文内容。</p>
          )}
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-berry">{toChineseTranslationError(error)}</p> : null}
    </section>
  );
}

function splitParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTranslation(value: string | null) {
  if (!value) return [];
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

async function hashText(value: string) {
  if (!value) return "";
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toChineseTranslationError(error: string) {
  if (error.includes("AI_API_KEY")) return "未配置 AI_API_KEY，已显示原文内容。";
  if (error.includes("too short") || error.includes("内容过少")) return "文章内容过少，无法生成翻译。";
  if (error.includes("段落数量")) return "翻译段落数量不匹配，请稍后重试。";
  return error;
}
