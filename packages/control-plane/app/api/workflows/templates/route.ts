import { NextRequest, NextResponse } from "next/server";
import { getTemplates } from "@/lib/workflow-templates";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category") || undefined;

  const templates = getTemplates(category as string | undefined);

  return NextResponse.json({
    success: true,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      icon: t.icon,
    })),
  });
}
