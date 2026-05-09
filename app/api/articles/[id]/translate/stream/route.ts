import { NextRequest } from "next/server";
import { isRequestAuthenticated } from "@/lib/auth";
import { fetchOriginalArticle } from "@/lib/original";
import { serializeArticle } from "@/lib/serializers";
import {
  buildFallbackTranslationInput,
  createTranslationSourceHash,
  fetchAiTranslation,
  getArticleForTranslation,
  limitParagraphs,
  normalizeTranslationInput,
  parsePlainTranslation,
  saveTranslation,
  saveTranslationError,
  splitParagraphs,
  validateTranslationRequest
} from "@/lib/translation";

const MIN_TRANSLATION_INPUT_LEN = 400;
const encoder = new TextEncoder();

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isRequestAuthenticated(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { force?: boolean; contentOverride?: string };
  const article = await getArticleForTranslation(params.id);

  let bodyText = normalizeTranslationInput(typeof body.contentOverride === "string" ? body.contentOverride : "");
  if (bodyText.length < MIN_TRANSLATION_INPUT_LEN) {
    const original = await fetchOriginalArticle(article.link);
    if (original.text) {
      bodyText = original.text;
    }
  }

  if (!bodyText) {
    bodyText = buildFallbackTranslationInput(article.content || article.summary || article.title || "");
  }

  const normalized = normalizeTranslationInput(bodyText);
  const sourceHash = createTranslationSourceHash(normalized);
  if (!body.force && article.aiTranslation && article.aiTranslationSourceHash === sourceHash) {
    return streamDone(serializeArticle(article));
  }

  const early = await validateTranslationRequest(article.id, normalized);
  if (early) {
    return streamDone(serializeArticle(early));
  }

  const paragraphs = limitParagraphs(splitParagraphs(normalized));
  if (!paragraphs.length) {
    const updated = await saveTranslationError(article.id, "文章内容过少，无法生成翻译。", sourceHash);
    return streamDone(serializeArticle(updated));
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 120000);
      let fullText = "";

      try {
        const response = await fetchAiTranslation(article, paragraphs, true, abort.signal);
        if (!response.body) throw new Error("AI 接口未返回流式内容");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const token = readSseToken(part);
            if (!token) continue;
            fullText += token;
            send(controller, "token", token);
          }
        }

        const parsed = parsePlainTranslation(fullText, paragraphs.length);
        const updated = await saveTranslation(article.id, parsed, sourceHash);
        send(controller, "done", serializeArticle(updated));
      } catch (error) {
        const updated = await saveTranslationError(
          article.id,
          error instanceof Error ? error.message : "AI 翻译生成失败",
          sourceHash
        );
        send(controller, "error", serializeArticle(updated));
      } finally {
        clearTimeout(timer);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive"
    }
  });
}

function streamDone(data: unknown) {
  return new Response(encoder.encode(formatSse("done", data)), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function readSseToken(part: string) {
  const lines = part
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  let token = "";
  for (const line of lines) {
    if (!line || line === "[DONE]") continue;
    try {
      const chunk = JSON.parse(line) as { choices?: Array<{ delta?: { content?: string } }> };
      token += chunk.choices?.[0]?.delta?.content || "";
    } catch {
      continue;
    }
  }
  return token;
}

function send(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
  controller.enqueue(encoder.encode(formatSse(event, data)));
}

function formatSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
