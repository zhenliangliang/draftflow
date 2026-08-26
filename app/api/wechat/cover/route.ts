import { assertSameOrigin, createWechatMediaForm, errorResponse, getAccessToken, wechatJson } from "@/lib/wechat";

type UploadResult = { media_id?: string; url?: string; errcode?: number; errmsg?: string };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.formData();
    const cover = body.get("cover");
    if (!(cover instanceof File)) return Response.json({ ok: false, error: "请选择封面图片" }, { status: 400 });
    if (!["image/jpeg", "image/png", "image/gif", "image/bmp"].includes(cover.type)) {
      return Response.json({ ok: false, error: "封面仅支持 JPG、PNG、GIF 或 BMP" }, { status: 400 });
    }
    if (cover.size > 2 * 1024 * 1024) return Response.json({ ok: false, error: "微信永久封面素材不能超过 2MB，请压缩后重试" }, { status: 400 });

    const token = await getAccessToken();
    const upload = await createWechatMediaForm(cover, "draft-cover");
    const result = await wechatJson<UploadResult>(
      `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`,
      { method: "POST", body: upload },
    );
    if (!result.media_id) throw new Error("微信未返回封面 media_id");
    return Response.json({ ok: true, mediaId: result.media_id, url: result.url ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
