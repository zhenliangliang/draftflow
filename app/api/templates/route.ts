import { clearDefaultArticleTemplate, deleteArticleTemplate, listArticleTemplates, saveArticleTemplate, setDefaultArticleTemplate } from "@/lib/template-store";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

export async function GET() {
  try {
    return Response.json({ ok: true, templates: await listArticleTemplates() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ action?: string; templateId?: string; template?: unknown }>();
    if (body.action === "save") return Response.json({ ok: true, template: await saveArticleTemplate(body.template) });
    if (body.action === "default") {
      const templateId = body.templateId?.trim() ?? "";
      if (templateId) await setDefaultArticleTemplate(templateId);
      else await clearDefaultArticleTemplate();
      return Response.json({ ok: true, defaultTemplateId: templateId });
    }
    return Response.json({ ok: false, error: "不支持的模板操作" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await deleteArticleTemplate(new URL(request.url).searchParams.get("id")?.trim() ?? "");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
