import { deleteCustomTheme, getThemeLibrary, saveCustomTheme, setActiveTheme } from "@/lib/theme-store";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

export async function GET() {
  try {
    return Response.json({ ok: true, ...(await getThemeLibrary()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ action?: string; themeId?: string; theme?: unknown }>();
    if (body.action === "activate") {
      return Response.json({ ok: true, activeThemeId: await setActiveTheme(body.themeId?.trim() ?? "") });
    }
    if (body.action === "save") {
      return Response.json({ ok: true, theme: await saveCustomTheme(body.theme) });
    }
    return Response.json({ ok: false, error: "不支持的主题操作" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    await deleteCustomTheme(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
