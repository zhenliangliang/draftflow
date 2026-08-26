import { listAIModels } from "@/lib/ai";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ provider?: string; baseUrl?: string; apiKey?: string }>();
    const baseUrl = body.baseUrl?.trim() ?? "";
    if (!baseUrl) return Response.json({ ok: false, error: "请填写网关接口地址" }, { status: 400 });
    const result = await listAIModels({
      provider: body.provider,
      baseUrl,
      apiKey: body.apiKey,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
