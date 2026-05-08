import { NextRequest, NextResponse } from "next/server";
import { isRequestAuthenticated } from "@/lib/auth";
import { summarizeArticle } from "@/lib/ai";
import { serializeArticle } from "@/lib/serializers";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { force?: boolean; contentOverride?: string };
  const article = await summarizeArticle(
    params.id,
    Boolean(body.force),
    typeof body.contentOverride === "string" ? body.contentOverride : undefined
  );
  return NextResponse.json(serializeArticle(article));
}
