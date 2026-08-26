import { importWechatArticle, listRadarArticles } from "@/lib/radar";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

export async function GET() {
  try { return Response.json({ ok: true, articles: await listRadarArticles() }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ url?: string; sourceId?: string; readCount?: number; likeCount?: number }>();
    const result = await importWechatArticle({
      url: body.url?.trim() ?? "",
      sourceId: body.sourceId?.trim() || undefined,
      readCount: body.readCount,
      likeCount: body.likeCount,
    });
    return Response.json({ ok: true, article: result });
  } catch (error) { return errorResponse(error); }
}
