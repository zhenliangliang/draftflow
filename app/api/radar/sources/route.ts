import { addContentSource, listContentSources } from "@/lib/radar";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

export async function GET() {
  try { return Response.json({ ok: true, sources: await listContentSources() }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ name?: string; sourceType?: "wechat" | "rss"; sourceUrl?: string }>();
    const name = body.name?.trim() ?? "";
    const sourceType = body.sourceType === "rss" ? "rss" : "wechat";
    const sourceUrl = body.sourceUrl?.trim() ?? "";
    if (!name) return Response.json({ ok: false, error: "请填写订阅源名称" }, { status: 400 });
    if (sourceType === "rss" && !/^https?:\/\//i.test(sourceUrl)) return Response.json({ ok: false, error: "请填写完整的 RSS 地址" }, { status: 400 });
    const id = await addContentSource({ name, sourceType, sourceUrl });
    return Response.json({ ok: true, id });
  } catch (error) { return errorResponse(error); }
}
