const WECHAT_IMAGE_HOSTS = new Set([
  "mmbiz.qpic.cn",
  "mmbiz.qlogo.cn",
  "wx.qlogo.cn",
]);

export function readWechatCdnUrl(value: string) {
  try {
    const url = new URL(value.replace(/&amp;/gi, "&").trim());
    if (!WECHAT_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function wechatImagePreviewUrl(value: string) {
  const url = readWechatCdnUrl(value);
  return url ? `/api/wechat/preview-image?url=${encodeURIComponent(url.href)}` : value;
}

export function proxyWechatImagesForPreview(html: string) {
  return html.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, (match, prefix: string, source: string, suffix: string) => {
    const previewUrl = wechatImagePreviewUrl(source);
    return previewUrl === source ? match : `${prefix}${previewUrl}${suffix}`;
  });
}
