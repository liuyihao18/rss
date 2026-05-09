import { NextRequest, NextResponse } from "next/server";
import { isRequestAuthenticated } from "@/lib/auth";
import { fetchOriginalArticle } from "@/lib/original";
import { serializeArticle } from "@/lib/serializers";
import {
  buildFallbackTranslationInput,
  getArticleForTranslation,
  normalizeTranslationInput,
  translateArticle
} from "@/lib/translation";

const MIN_TRANSLATION_INPUT_LEN = 400;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const updated = await translateArticle(params.id, bodyText, Boolean(body.force));
  return NextResponse.json(serializeArticle(updated));
}
