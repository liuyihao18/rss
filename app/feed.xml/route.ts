import { NextRequest, NextResponse } from "next/server";
import { appConfig } from "@/lib/config";
import { isRequestAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { escapeXml, stripHtml, truncate } from "@/lib/text";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!appConfig.publicFeed && !isRequestAuthenticated(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const articles = await prisma.article.findMany({
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { source: true }
  });

  const origin = request.nextUrl.origin;
  const items = articles
    .map((article) => {
      const description = article.aiSummary || article.summary || article.content || "";
      const pubDate = (article.publishedAt || article.createdAt).toUTCString();
      return `
    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(article.link)}</link>
      <guid isPermaLink="false">${escapeXml(article.guid)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <source url="${escapeXml(article.source.url)}">${escapeXml(article.source.name)}</source>
      <description>${escapeXml(truncate(stripHtml(description), 1000))}</description>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI 最新消息</title>
    <link>${escapeXml(origin)}</link>
    <description>聚合 OpenAI、Anthropic、DeepMind、Hugging Face 等 AI 消息源。</description>
    <language>zh-CN</language>
    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
