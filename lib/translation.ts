import type { Article, Source } from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "./db";
import { appConfig, isAiConfigured } from "./config";
import { stripHtml, truncate } from "./text";

export type TranslationResult = {
  paragraphs: string[];
};

type ArticleWithSource = Article & { source: Source };
type TranslationFields = {
  aiTranslation: string | null;
  aiTranslationError: string | null;
  aiTranslationGeneratedAt: Date | null;
  aiTranslationSourceHash: string | null;
};

const prismaUnsafe = prisma as unknown as {
  article: { update: (args: unknown) => Promise<ArticleWithSource & TranslationFields> };
};

type AiResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const MAX_TRANSLATION_CHARS = 12000;

export function createTranslationSourceHash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function normalizeTranslationInput(text: string) {
  return text.replace(/\r\n/g, "\n").trim();
}

export function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function limitParagraphs(paragraphs: string[], maxChars = MAX_TRANSLATION_CHARS) {
  const limited: string[] = [];
  let total = 0;
  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    if (total + paragraph.length > maxChars && limited.length > 0) break;
    limited.push(paragraph);
    total += paragraph.length;
    if (total >= maxChars) break;
  }
  return limited;
}

export async function translateArticle(
  articleId: string,
  bodyText: string,
  force = false
) {
  const article = await getArticleForTranslation(articleId);
  const normalized = normalizeTranslationInput(bodyText);
  const sourceHash = createTranslationSourceHash(normalized);

  if (!force && article.aiTranslation && article.aiTranslationSourceHash === sourceHash) {
    return article;
  }

  const early = await validateTranslationRequest(article.id, normalized);
  if (early) return early;

  const paragraphs = limitParagraphs(splitParagraphs(normalized));
  if (!paragraphs.length) {
    return saveTranslationError(article.id, "文章内容过少，无法生成翻译。", sourceHash);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), appConfig.ai.timeoutSeconds * 1000);

  try {
    const response = await fetchAiTranslation(article, paragraphs, false, controller.signal);
    const data = (await response.json()) as AiResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 接口未返回内容");
    const parsed = parseJsonTranslation(content, paragraphs.length);
    return saveTranslation(article.id, parsed, sourceHash);
  } catch (error) {
    return saveTranslationError(
      article.id,
      error instanceof Error ? error.message : "AI 翻译生成失败",
      sourceHash
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getArticleForTranslation(articleId: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true }
  });

  if (!article) {
    throw new Error("Article not found");
  }

  return article as ArticleWithSource & TranslationFields;
}

export async function validateTranslationRequest(articleId: string, bodyText: string) {
  if (!isAiConfigured()) {
    return saveTranslationError(articleId, "未配置 AI_API_KEY，已显示原文内容。", null);
  }

  if (!bodyText || bodyText.length < 20) {
    return saveTranslationError(articleId, "文章内容过少，无法生成翻译。", null);
  }

  return null;
}

export async function fetchAiTranslation(
  article: ArticleWithSource,
  paragraphs: string[],
  stream: boolean,
  signal: AbortSignal
) {
  const url = `${appConfig.ai.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${appConfig.ai.apiKey}`
  };
  const baseBody = buildTranslationRequestBody(article, paragraphs, stream);

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

export async function saveTranslation(articleId: string, parsed: TranslationResult, sourceHash: string) {
  return prismaUnsafe.article.update({
    where: { id: articleId },
    data: {
      aiTranslation: JSON.stringify(parsed.paragraphs),
      aiTranslationError: null,
      aiTranslationGeneratedAt: new Date(),
      aiTranslationSourceHash: sourceHash
    },
    include: { source: true }
  });
}

export async function saveTranslationError(articleId: string, message: string, sourceHash: string | null) {
  return prismaUnsafe.article.update({
    where: { id: articleId },
    data: {
      aiTranslationError: message.slice(0, 500),
      ...(sourceHash ? { aiTranslationSourceHash: sourceHash } : {})
    },
    include: { source: true }
  });
}

export function parseJsonTranslation(content: string, expectedCount: number): TranslationResult {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as { paragraphs?: string[] };
  if (!Array.isArray(parsed.paragraphs)) {
    throw new Error("AI 返回格式不正确");
  }
  const normalized = parsed.paragraphs
    .map((item) => stripHtml(item))
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (normalized.length !== expectedCount) {
    throw new Error("AI 返回段落数量不匹配");
  }

  return { paragraphs: normalized };
}

export function parsePlainTranslation(content: string, expectedCount: number): TranslationResult {
  const cleaned = content
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((line) => stripHtml(line.replace(/^[-*•]\s*/, "").trim()))
    .filter(Boolean);

  if (paragraphs.length < expectedCount) {
    const padded = [...paragraphs];
    while (padded.length < expectedCount) padded.push("");
    return { paragraphs: padded };
  }

  return { paragraphs: paragraphs.slice(0, expectedCount) };
}

function buildTranslationRequestBody(article: ArticleWithSource, paragraphs: string[], stream: boolean) {
  return {
    model: appConfig.ai.model,
    temperature: 0.2,
    stream,
    messages: [
      {
        role: "system",
        content: stream
          ? "你是专业翻译。请将输入段落翻译为中文，保持含义准确、语气自然。仅输出译文正文，不要编号，不要额外解释。每段译文用空行分隔，段落数量必须与输入一致。"
          : "你是专业翻译。请将输入段落翻译为中文，保持含义准确、语气自然。只输出 JSON，不要 Markdown，不要额外解释。格式：{\"paragraphs\":[\"段落1译文\",\"段落2译文\"]}。段落数量必须与输入一致。"
      },
      {
        role: "user",
        content: JSON.stringify({
          source: article.source.name,
          title: article.title,
          paragraphs
        })
      }
    ]
  };
}

function withReasoningDisabled(body: ReturnType<typeof buildTranslationRequestBody>) {
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

export function toChineseTranslationError(error: string) {
  if (error.includes("AI_API_KEY")) return "未配置 AI_API_KEY，已显示原文内容。";
  if (error.includes("too short") || error.includes("内容过少")) return "文章内容过少，无法生成翻译。";
  if (error.includes("段落数量")) return "翻译段落数量不匹配，请稍后重试。";
  return error;
}

export function buildFallbackTranslationInput(text: string) {
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return stripHtml(text);
  }
  return truncate(text, MAX_TRANSLATION_CHARS);
}
