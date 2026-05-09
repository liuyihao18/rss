import type { Article, Source } from "@prisma/client";

export function serializeArticle(article: Article & { source: Pick<Source, "id" | "name"> }) {
  return {
    id: article.id,
    title: article.title,
    link: article.link,
    summary: article.summary,
    content: article.content,
    publishedAt: article.publishedAt?.toISOString() || null,
    isRead: article.isRead,
    isFavorite: article.isFavorite,
    aiSummary: article.aiSummary,
    aiBullets: article.aiBullets,
    aiError: article.aiError,
    aiGeneratedAt: article.aiGeneratedAt?.toISOString() || null,
    aiTranslation: article.aiTranslation,
    aiTranslationError: article.aiTranslationError,
    aiTranslationGeneratedAt: article.aiTranslationGeneratedAt?.toISOString() || null,
    aiTranslationSourceHash: article.aiTranslationSourceHash,
    source: {
      id: article.source.id,
      name: article.source.name
    }
  };
}
