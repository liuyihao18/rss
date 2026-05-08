import { NextRequest, NextResponse } from "next/server";
import { isRequestAuthenticated } from "@/lib/auth";
import { ensureSources } from "@/lib/rss";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSources();
  const sources = await prisma.source.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(sources);
}
