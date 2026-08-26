import { addSyncRecord, assertSameOrigin, errorResponse, getAccessToken, sanitizeWechatHtml, WechatApiError, wechatJson } from "@/lib/wechat";

type DraftResult = { media_id?: string; errcode?: number; errmsg?: string };

export async function POST(request: Request) {
  let title = "未命名文章";
  try {
    assertSameOrigin(request);
    const body = await request.json<{
      title?: string;
      author?: string;
      digest?: string;
      content?: string;
      contentSourceUrl?: string;
      thumbMediaId?: string;
      openComment?: boolean;
      fansOnlyComment?: boolean;
    }>();
    title = body.title?.trim() ?? "";
    const author = body.author?.trim() ?? "";
    const digest = body.digest?.trim() ?? "";
    const content = sanitizeWechatHtml(body.content?.trim() ?? "");
    const thumbMediaId = body.thumbMediaId?.trim() ?? "";
    if (!title || title.length > 32) return Response.json({ ok: false, error: "标题不能为空且不能超过 32 个字符" }, { status: 400 });
    if (author.length > 16) return Response.json({ ok: false, error: "作者名称不能超过 16 个字符" }, { status: 400 });
    if (digest.length > 128) return Response.json({ ok: false, error: "摘要不能超过 128 个字符" }, { status: 400 });
    if (!content || content.length > 20000) return Response.json({ ok: false, error: "正文不能为空且不能超过 20000 个字符" }, { status: 400 });
    if (!thumbMediaId) return Response.json({ ok: false, error: "请先上传封面图片" }, { status: 400 });

    const token = await getAccessToken();
    const result = await wechatJson<DraftResult>(
      `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          articles: [{
            article_type: "news",
            title,
            author,
            digest,
            content,
            content_source_url: body.contentSourceUrl?.trim() ?? "",
            thumb_media_id: thumbMediaId,
            need_open_comment: body.openComment ? 1 : 0,
            only_fans_can_comment: body.fansOnlyComment ? 1 : 0,
          }],
        }),
      },
    );
    if (!result.media_id) throw new Error("微信未返回草稿 media_id");
    await addSyncRecord({ title, status: "success", draftMediaId: result.media_id });
    return Response.json({ ok: true, mediaId: result.media_id });
  } catch (error) {
    const apiError = error instanceof WechatApiError ? error : null;
    try {
      await addSyncRecord({ title, status: "failed", errorCode: apiError?.code, errorMessage: error instanceof Error ? error.message : "发送失败" });
    } catch {
      // Keep the original WeChat error when history persistence also fails.
    }
    return errorResponse(error);
  }
}
