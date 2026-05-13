import { NextRequest, NextResponse } from "next/server";
import { getTemplate } from "@/lib/workflow-templates";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  const template = getTemplate(templateId);

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Template not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    template,
  });
}
