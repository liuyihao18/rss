import { NextRequest, NextResponse } from "next/server";
import { isRequestAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeArticle } from "@/lib/serializers";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    isRead?: boolean;
    isFavorite?: boolean;
  };

  const article = await prisma.article.update({
    where: { id: params.id },
    data: {
      ...(typeof body.isRead === "boolean" ? { isRead: body.isRead } : {}),
      ...(typeof body.isFavorite === "boolean" ? { isFavorite: body.isFavorite } : {})
    },
    include: { source: true }
  });

  return NextResponse.json(serializeArticle(article));
}
