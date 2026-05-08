import Parser from "rss-parser";
import { prisma } from "./db";
import { FEED_SOURCES } from "./sources";
import { stripHtml, truncate } from "./text";

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent": "AI RSS Reader/0.1 (+https://local)"
  },
  customFields: {
    item: ["content", "content:encoded", "summary", "description"]
  }
});

let refreshInFlight: Promise<RefreshResult> | null = null;

export type RefreshResult = {
  inserted: number;
  updatedSources: number;
  failedSources: number;
};

export async function ensureSources() {
  await Promise.all(
    FEED_SOURCES.map((source) =>
      prisma.source.upsert({
        where: { url: source.url },
        update: {
          name: source.name,
          siteUrl: source.siteUrl,
          category: source.category || "AI",
          enabled: true
        },
        create: {
          name: source.name,
          url: source.url,
          siteUrl: source.siteUrl,
          category: source.category || "AI",
          enabled: true
        }
      })
    )
  );
}

export async function refreshFeeds() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = runRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function runRefresh(): Promise<RefreshResult> {
  await ensureSources();
  const sources = await prisma.source.findMany({ where: { enabled: true } });
  let inserted = 0;
  let failedSources = 0;

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const item of feed.items) {
        const fields = item as unknown as Record<string, unknown>;
        const link = item.link || item.guid || "";
        const guid = item.guid || link || `${source.url}:${item.title}`;
        const title = stripHtml(item.title) || "Untitled";
        const content = stripHtml(asString(fields["content:encoded"])) || stripHtml(asString(fields.content));
        const summary = stripHtml(item.contentSnippet || asString(fields.summary) || asString(fields.description));
        const author = asString(fields.creator) || asString(fields.author) || null;
        const publishedAt = item.isoDate || item.pubDate ? new Date(item.isoDate || item.pubDate || "") : null;

        const result = await prisma.article.upsert({
          where: { sourceId_guid: { sourceId: source.id, guid } },
          update: {
            title,
            link,
            author,
            summary: summary ? truncate(summary, 3000) : null,
            content: content ? truncate(content, 12000) : null,
            publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null
          },
          create: {
            sourceId: source.id,
            guid,
            title,
            link,
            author,
            summary: summary ? truncate(summary, 3000) : null,
            content: content ? truncate(content, 12000) : null,
            publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null
          }
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) inserted += 1;
      }

      await prisma.source.update({
        where: { id: source.id },
        data: {
          lastFetchedAt: new Date(),
          lastSuccessAt: new Date(),
          lastError: null
        }
      });
    } catch (error) {
      failedSources += 1;
      await prisma.source.update({
        where: { id: source.id },
        data: {
          lastFetchedAt: new Date(),
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown feed error"
        }
      });
    }
  }

  await pruneOldArticles();
  return { inserted, updatedSources: sources.length - failedSources, failedSources };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

async function pruneOldArticles() {
  const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90);
  await prisma.article.deleteMany({
    where: {
      isFavorite: false,
      publishedAt: { lt: cutoff }
    }
  });
}
