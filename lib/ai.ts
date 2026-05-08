import type { Article, Source } from "@prisma/client";
import { prisma } from "./db";
import { appConfig, isAiConfigured } from "./config";
import { stripHtml, truncate } from "./text";

type ArticleWithSource = Article & { source: Source };

type AiResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export type ParsedSummary = {
  summary: string;
  bullets: string[];
};

export async function summarizeArticle(articleId: string, force = false, contentOverride?: string) {
  const article = await getArticleForSummary(articleId);

  if (!force && article.aiSummary) {
    return article;
  }

  const bodyText = getSummaryInput(article, contentOverride);
  const early = await validateSummaryRequest(article.id, bodyText);
  if (early) return early;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), appConfig.ai.timeoutSeconds * 1000);

  try {
    const response = await fetchAiCompletion(article, bodyText, false, controller.signal);
    const data = (await response.json()) as AiResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI 接口未返回内容");
    }

    return saveSummary(article.id, parseJsonSummary(content));
  } catch (error) {
    return saveSummaryError(article.id, error instanceof Error ? error.message : "AI 摘要生成失败");
  } finally {
    clearTimeout(timer);
  }
}

export async function getArticleForSummary(articleId: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true }
  });

  if (!article) {
    throw new Error("Article not found");
  }

  return article;
}

export function getSummaryInput(article: ArticleWithSource, contentOverride?: string) {
  return stripHtml(contentOverride || article.content || article.summary || article.title);
}

export async function validateSummaryRequest(articleId: string, bodyText: string) {
  if (!isAiConfigured()) {
    return saveSummaryError(articleId, "未配置 AI_API_KEY，已显示原文内容。");
  }

  if (!bodyText || bodyText.length < 20) {
    return saveSummaryError(articleId, "文章内容过少，无法生成可靠摘要。");
  }

  return null;
}

export async function fetchAiCompletion(article: ArticleWithSource, bodyText: string, stream: boolean, signal: AbortSignal) {
  const url = `${appConfig.ai.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${appConfig.ai.apiKey}`
  };
  const baseBody = buildRequestBody(article, bodyText, stream);

  const first = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(withReasoningDisabled(baseBody)),
    signal
  });

  if (first.ok) return first;

  const message = await first.text().catch(() => "");
  if (first.status === 400 && mentionsUnsupportedReasoning(message)) {
    const retry = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(baseBody),
      signal
    });
    if (retry.ok) return retry;
    throw new Error(`AI 接口返回 ${retry.status}`);
  }

  throw new Error(`AI 接口返回 ${first.status}`);
}

export async function saveSummary(articleId: string, parsed: ParsedSummary) {
  return prisma.article.update({
    where: { id: articleId },
    data: {
      aiSummary: parsed.summary,
      aiBullets: JSON.stringify(parsed.bullets),
      aiError: null,
      aiGeneratedAt: new Date()
    },
    include: { source: true }
  });
}

export async function saveSummaryError(articleId: string, message: string) {
  return prisma.article.update({
    where: { id: articleId },
    data: { aiError: message.slice(0, 500) },
    include: { source: true }
  });
}

export function parsePlainSummary(content: string): ParsedSummary {
  const lines = content
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/```$/i, "")
    .split(/\r?\n/)
    .map((line) => stripHtml(line.replace(/^[-*•]\s*/, "").replace(/^#+\s*/, "").trim()))
    .filter(Boolean);

  const bulletStart = lines.findIndex((line) => /^要点[:：]?$/.test(line) || /^关键要点[:：]?$/.test(line));
  const summaryLines = (bulletStart >= 0 ? lines.slice(0, bulletStart) : lines.slice(0, 2)).filter(
    (line) => !/^摘要[:：]?$/.test(line) && !/^中文摘要[:：]?$/.test(line)
  );
  const bulletLines = (bulletStart >= 0 ? lines.slice(bulletStart + 1) : lines.slice(2)).filter(
    (line) => !/^要点[:：]?$/.test(line) && !/^关键要点[:：]?$/.test(line)
  );

  return {
    summary: summaryLines.join(" ").slice(0, 1000) || lines.slice(0, 2).join(" "),
    bullets: bulletLines.slice(0, 5)
  };
}

function buildRequestBody(article: ArticleWithSource, bodyText: string, stream: boolean) {
  return {
    model: appConfig.ai.model,
    temperature: 0.2,
    stream,
    messages: [
      {
        role: "system",
        content: stream
          ? "你是一个严谨的 AI 新闻编辑。请用中文直接输出，不要 Markdown 标题，不要添加原文没有的信息。格式固定为：第一段是 2-3 句摘要；然后一行“要点：”；再输出 3-5 条短要点，每条以“- ”开头。"
          : "你是一个严谨的 AI 新闻编辑。请用中文输出 JSON，不要 Markdown，不要添加原文没有的信息。格式：{\"summary\":\"2-3句中文摘要\",\"bullets\":[\"要点1\",\"要点2\",\"要点3\"]}。"
      },
      {
        role: "user",
        content: `来源：${article.source.name}\n标题：${article.title}\n链接：${article.link}\n内容：${truncate(bodyText, 8000)}`
      }
    ]
  };
}

function withReasoningDisabled(body: ReturnType<typeof buildRequestBody>) {
  return {
    ...body,
    reasoning_effort: "minimal",
    enable_thinking: false,
    chat_template_kwargs: {
      enable_thinking: false
    }
  };
}

function mentionsUnsupportedReasoning(message: string) {
  return /reasoning_effort|enable_thinking|chat_template_kwargs|unknown parameter|unsupported|extra fields/i.test(message);
}

function parseJsonSummary(content: string): ParsedSummary {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as { summary?: string; bullets?: string[] };
  if (!parsed.summary || !Array.isArray(parsed.bullets)) {
    throw new Error("AI 返回格式不正确");
  }
  return {
    summary: stripHtml(parsed.summary),
    bullets: parsed.bullets.map((item) => stripHtml(item)).filter(Boolean).slice(0, 5)
  };
}
