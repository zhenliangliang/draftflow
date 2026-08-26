import { getAIStatus, saveAIConfig } from "@/lib/ai";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

export async function GET() {
  try {
    return Response.json({ ok: true, ai: await getAIStatus() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ provider?: string; baseUrl?: string; model?: string; apiKey?: string }>();
    const baseUrl = body.baseUrl?.trim() ?? "";
    const model = body.model?.trim() ?? "";
    if (!baseUrl || !model) {
      return Response.json({ ok: false, error: "请填写 API 接口地址和模型名称" }, { status: 400 });
    }
    const ai = await saveAIConfig({
      provider: body.provider,
      baseUrl,
      model,
      apiKey: body.apiKey,
    });
    return Response.json({ ok: true, ai });
  } catch (error) {
    return errorResponse(error);
  }
}
