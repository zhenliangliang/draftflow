import { assertSameOrigin, configureWechatAccount, errorResponse, getSafeAccount } from "@/lib/wechat";

export async function GET() {
  try {
    const account = await getSafeAccount();
    return Response.json({ ok: true, configured: Boolean(account), account });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ name?: string; appId?: string; appSecret?: string; defaultAuthor?: string }>();
    const name = body.name?.trim() ?? "";
    const appId = body.appId?.trim() ?? "";
    const appSecret = body.appSecret?.trim() ?? "";
    const defaultAuthor = body.defaultAuthor?.trim() || "编辑部";
    if (!name || !/^wx[a-zA-Z0-9]{8,}$/.test(appId) || appSecret.length < 16) {
      return Response.json({ ok: false, error: "请填写有效的公众号名称、AppID 和 AppSecret" }, { status: 400 });
    }
    const account = await configureWechatAccount({ name, appId, appSecret, defaultAuthor });
    return Response.json({ ok: true, configured: true, account });
  } catch (error) {
    return errorResponse(error);
  }
}
