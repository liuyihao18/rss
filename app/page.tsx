import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
import { ensureSources } from "@/lib/rss";
import { ensureScheduler } from "@/lib/scheduler";
import { isAiConfigured } from "@/lib/config";
import ReaderApp from "@/components/ReaderApp";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isAuthenticated()) redirect("/login");
  ensureScheduler();
  await ensureSources();

  const [articles, sources] = await Promise.all([
    prisma.article.findMany({
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 250,
      include: { source: true }
    }),
    prisma.source.findMany({ orderBy: { name: "asc" } })
  ]);

  return (
    <ReaderApp
      initialArticles={articles.map((article) => ({
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
        source: {
          id: article.source.id,
          name: article.source.name
        }
      }))}
      sources={sources.map((source) => ({
        id: source.id,
        name: source.name,
        lastFetchedAt: source.lastFetchedAt?.toISOString() || null,
        lastSuccessAt: source.lastSuccessAt?.toISOString() || null,
        lastError: source.lastError
      }))}
      aiConfigured={isAiConfigured()}
    />
  );
}
