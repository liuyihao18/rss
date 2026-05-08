import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
import { isAiConfigured } from "@/lib/config";
import { formatDisplayDateTime } from "@/lib/dates";
import { fetchOriginalArticle } from "@/lib/original";
import ArticleSummaryBox from "@/components/ArticleSummaryBox";

export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: { params: { id: string } }) {
  if (!isAuthenticated()) redirect("/login");
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    include: { source: true }
  });
  if (!article) redirect("/");

  const bullets = article.aiBullets ? (JSON.parse(article.aiBullets) as string[]) : [];
  const original = await fetchOriginalArticle(article.link);
  const fallbackText = article.content || article.summary || "此 RSS 条目没有提供摘要内容。";
  const bodyText = original.text || fallbackText;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-moss">
        <ArrowLeft size={16} />
        返回列表
      </Link>

      <article className="rounded-lg border border-moss/15 bg-white p-5 shadow-soft sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-ink/55">{article.source.name}</span>
          <span className="inline-flex items-center gap-2 rounded-md bg-mist px-3 py-1 text-xs font-medium text-moss">
            <FileText size={14} />
            {original.text ? "已拉取原文" : "显示 RSS 内容"}
          </span>
        </div>

        <h1 className="mb-4 text-2xl font-semibold leading-tight text-ink sm:text-3xl">{article.title}</h1>
        {article.publishedAt ? <p className="mb-5 text-sm text-ink/55">{formatDisplayDateTime(article.publishedAt)}</p> : null}
        {original.error ? <p className="mb-5 rounded-md border border-saffron/20 bg-saffron/10 p-3 text-sm text-ink/65">{toChineseOriginalError(original.error)}</p> : null}

        <ArticleSummaryBox
          articleId={article.id}
          aiConfigured={isAiConfigured()}
          initialSummary={article.aiSummary}
          initialBullets={bullets}
          initialError={article.aiError}
          contentOverride={bodyText}
        />

        <div className="space-y-5 leading-8 text-ink/78">
          {bodyText.split(/\n{2,}/).map((paragraph) => (
            <p key={paragraph.slice(0, 80)}>{paragraph}</p>
          ))}
        </div>

        <a
          href={article.link}
          target="_blank"
          rel="noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"
        >
          阅读原站页面
          <ExternalLink size={16} />
        </a>
      </article>
    </main>
  );
}

function toChineseOriginalError(error: string) {
  if (error.includes("timed out")) return "原文拉取超时，已显示 RSS 内容。";
  if (error.includes("HTTP")) return error.replace("Original site returned HTTP", "原文站点返回 HTTP").replace("; showing RSS content.", "，已显示 RSS 内容。");
  if (error.includes("not HTML")) return "原文不是 HTML 页面，已显示 RSS 内容。";
  if (error.includes("not a valid")) return "原文链接不是有效的 HTTP 地址。";
  if (error.includes("extract enough")) return "未能从原文页面提取到足够正文，已显示 RSS 内容。";
  return "原文拉取失败，已显示 RSS 内容。";
}
