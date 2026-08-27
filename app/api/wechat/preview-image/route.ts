import { readWechatCdnUrl } from "@/lib/wechat-images";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("url") ?? "";
  const imageUrl = readWechatCdnUrl(source);
  if (!imageUrl) return Response.json({ ok: false, error: "仅支持预览微信图片 CDN 地址" }, { status: 400 });

  try {
    const upstream = await fetchWechatImage(imageUrl);
    if (!upstream.ok) return Response.json({ ok: false, error: `微信图片读取失败（HTTP ${upstream.status}）` }, { status: 502 });
    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) return Response.json({ ok: false, error: "微信返回的内容不是图片" }, { status: 502 });
    const contentLength = Number(upstream.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) return Response.json({ ok: false, error: "微信图片超过预览大小限制" }, { status: 413 });

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ ok: false, error: "微信图片暂时无法预览，请稍后重试" }, { status: 502 });
  }
}

async function fetchWechatImage(url: URL) {
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      referer: "https://mp.weixin.qq.com/",
      "user-agent": "Mozilla/5.0 (compatible; DraftFlowPreview/1.0)",
    },
  });
  if (response.status < 300 || response.status >= 400) return response;
  const location = response.headers.get("location");
  if (!location) return response;
  const redirected = readWechatCdnUrl(new URL(location, url).href);
  if (!redirected) throw new Error("blocked redirect");
  return fetch(redirected, {
    redirect: "manual",
    headers: {
      accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      referer: "https://mp.weixin.qq.com/",
      "user-agent": "Mozilla/5.0 (compatible; DraftFlowPreview/1.0)",
    },
  });
}
