import { assertSameOrigin, errorResponse, getAccessToken, wechatJson } from "@/lib/wechat";

type ImageUploadResult = { url?: string; errcode?: number; errmsg?: string };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.formData();
    const image = body.get("image");
    if (!(image instanceof File)) return Response.json({ ok: false, error: "请选择正文图片" }, { status: 400 });
    if (!["image/jpeg", "image/png"].includes(image.type)) {
      return Response.json({ ok: false, error: "正文图片仅支持 JPG 或 PNG" }, { status: 400 });
    }
    if (image.size > 1024 * 1024) return Response.json({ ok: false, error: "正文图片不能超过 1MB" }, { status: 400 });

    const token = await getAccessToken();
    const upload = new FormData();
    upload.append("media", image, image.name || "article-image.jpg");
    const result = await wechatJson<ImageUploadResult>(
      `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${encodeURIComponent(token)}`,
      { method: "POST", body: upload },
    );
    if (!result.url) throw new Error("微信未返回正文图片地址");
    return Response.json({ ok: true, url: result.url });
  } catch (error) {
    return errorResponse(error);
  }
}
