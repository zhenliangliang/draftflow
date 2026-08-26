import { assertSameOrigin, configureWechatAccount, errorResponse, getSafeAccounts, setActiveWechatAccount } from "@/lib/wechat";

export async function GET() {
  try {
    const accounts = await getSafeAccounts();
    const account = accounts.find((item) => item.active) ?? accounts[0] ?? null;
    return Response.json({ ok: true, configured: Boolean(account), account, accounts, limit: 5 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ accountId?: string }>();
    const accountId = body.accountId?.trim() ?? "";
    if (!accountId) return Response.json({ ok: false, error: "请选择公众号" }, { status: 400 });
    const account = await setActiveWechatAccount(accountId);
    return Response.json({ ok: true, account });
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
