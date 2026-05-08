import { decodeHtmlEntities, truncate } from "./text";

export type OriginalArticleResult = {
  text: string | null;
  error: string | null;
};

export async function fetchOriginalArticle(url: string): Promise<OriginalArticleResult> {
  if (!/^https?:\/\//i.test(url)) {
    return { text: null, error: "Original link is not a valid HTTP URL." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI RSS Reader/0.1)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal,
      redirect: "follow"
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      return { text: null, error: `Original site returned HTTP ${response.status}; showing RSS content.` };
    }
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { text: null, error: "Original page is not HTML; showing RSS content." };
    }

    const html = await response.text();
    const text = extractReadableText(html);
    if (text.length < 400) {
      return { text: null, error: "Could not extract enough article text; showing RSS content." };
    }

    return { text: truncate(text, 30000), error: null };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Original fetch timed out; showing RSS content." : "Original fetch failed; showing RSS content.";
    return { text: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function extractReadableText(html: string) {
  const jsonLdBody = extractJsonLdArticleBody(html);
  if (jsonLdBody && jsonLdBody.length > 400) return jsonLdBody;

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|button)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ");

  const candidates = [
    ...matchAllByClass(cleaned, "post-content|entry-content|article-content|article-body|story-body|content-body|main-content|wp-block-post-content"),
    ...matchAllTags(cleaned, "article"),
    ...matchAllTags(cleaned, "main"),
    ...matchAllTags(cleaned, "body")
  ];

  const best = candidates
    .map((candidate) => htmlToParagraphText(candidate))
    .sort((a, b) => scoreText(b) - scoreText(a))[0];

  return normalizeText(best || "");
}

function extractJsonLdArticleBody(html: string) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    const raw = decodeHtmlEntities(block[1]).trim();
    try {
      const parsed = JSON.parse(raw) as unknown;
      const body = findArticleBody(parsed);
      if (body) return normalizeText(body);
    } catch {
      continue;
    }
  }
  return null;
}

function findArticleBody(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findArticleBody(item);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.articleBody === "string") return record.articleBody;
  if (Array.isArray(record["@graph"])) return findArticleBody(record["@graph"]);
  if (record.mainEntity) return findArticleBody(record.mainEntity);
  return null;
}

function matchAllTags(html: string, tag: string) {
  return [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((match) => match[1]);
}

function matchAllByClass(html: string, classPattern: string) {
  return [...html.matchAll(new RegExp(`<([a-z0-9]+)[^>]+class=["'][^"']*(${classPattern})[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "gi"))].map((match) => match[3]);
}

function htmlToParagraphText(html: string) {
  return decodeHtmlEntities(html)
    .replace(/<(br)\b[^>]*>/gi, "\n")
    .replace(/<(p|div|section|article|li|blockquote|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|blockquote|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n");
}

function normalizeText(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isBoilerplate(line))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBoilerplate(line: string) {
  if (line.length < 3) return true;
  return [
    /^close$/i,
    /^advertisement$/i,
    /^image credits?:/i,
    /opens in a new window/i,
    /^register now\.?$/i,
    /^buy one .*pass/i,
    /^tickets are going fast/i,
    /^the first strictlyvc/i
  ].some((pattern) => pattern.test(line));
}

function scoreText(text: string) {
  return text.length + (text.match(/[。.!?？]/g)?.length || 0) * 20;
}
