import { marked, Renderer } from "marked";

export type MarkdownTheme = {
  color: string;
  bg: string;
};

export function markdownToWechatHtml(source: string, theme: MarkdownTheme) {
  const renderer = new Renderer();
  const inline = (tokens: Parameters<typeof renderer.parser.parseInline>[0]) => renderer.parser.parseInline(tokens);
  const block = (tokens: Parameters<typeof renderer.parser.parse>[0]) => renderer.parser.parse(tokens);

  renderer.html = ({ text }) => `<p style="margin:10px 0;padding:10px 12px;border-radius:4px;color:#7a665f;background:#fff3ef;font-size:13px;line-height:1.7;">${escapeHtml(text)}</p>`;
  renderer.heading = ({ tokens, depth }) => {
    const content = inline(tokens);
    if (depth === 1) return `<h1 style="margin:26px 0 16px;color:#202522;font-size:26px;line-height:1.4;font-weight:750;">${content}</h1>`;
    if (depth === 2) return `<h2 style="margin:28px 0 14px;padding-left:12px;border-left:4px solid ${theme.color};color:${theme.color};font-size:21px;line-height:1.5;font-weight:700;">${content}</h2>`;
    return `<h${depth} style="margin:22px 0 10px;color:${theme.color};font-size:${Math.max(15, 20 - depth)}px;line-height:1.5;font-weight:700;">${content}</h${depth}>`;
  };
  renderer.paragraph = ({ tokens }) => `<p style="margin:0 0 14px;color:#3f4943;font-size:16px;line-height:1.9;text-align:left;letter-spacing:normal;word-break:normal;overflow-wrap:break-word;">${inline(tokens)}</p>`;
  renderer.blockquote = ({ tokens }) => `<blockquote style="margin:18px 0;padding:14px 16px;border-left:3px solid ${theme.color};border-radius:4px;color:#5c6961;background:#edf2ee;font-size:15px;line-height:1.9;">${block(tokens)}</blockquote>`;
  renderer.code = ({ text, lang }) => `<pre style="margin:18px 0;padding:15px 16px;overflow-x:auto;border-radius:6px;color:#e7eee9;background:#16251e;font-size:13px;line-height:1.75;"><code data-language="${escapeHtml(lang || "text")}">${escapeHtml(text)}</code></pre>`;
  renderer.codespan = ({ text }) => `<code style="margin:0 2px;padding:2px 5px;border-radius:3px;color:#a23f35;background:#f5eeeb;font-family:monospace;font-size:14px;letter-spacing:normal;white-space:normal;word-break:break-all;">${escapeHtml(text)}</code>`;
  renderer.hr = () => `<hr style="height:1px;margin:26px 0;border:0;background:#dfe5e1;" />`;
  renderer.strong = ({ tokens }) => `<strong style="color:#243129;font-weight:750;">${inline(tokens)}</strong>`;
  renderer.em = ({ tokens }) => `<em style="color:#5e6d64;font-style:italic;">${inline(tokens)}</em>`;
  renderer.del = ({ tokens }) => `<del style="color:#8a958e;">${inline(tokens)}</del>`;
  renderer.checkbox = ({ checked }) => checked ? "☑ " : "☐ ";
  renderer.list = ({ ordered, start, items }) => {
    const tag = ordered ? "ol" : "ul";
    const startAttr = ordered && start !== 1 ? ` start="${Number(start)}"` : "";
    return `<${tag}${startAttr} style="margin:12px 0 18px;padding-left:24px;color:#3f4943;font-size:16px;line-height:1.9;">${items.map((item) => renderer.listitem(item)).join("")}</${tag}>`;
  };
  renderer.listitem = ({ tokens }) => `<li style="margin:5px 0;">${block(tokens).replace(/^<p[^>]*>|<\/p>\n?$/g, "")}</li>`;
  renderer.link = ({ href, title, tokens }) => {
    const safe = safeLink(href);
    const content = inline(tokens);
    if (!safe) return content;
    return `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ""} style="color:${theme.color};text-decoration:underline;word-break:break-all;">${content}</a>`;
  };
  renderer.image = ({ href, title, text }) => {
    const safe = safeImage(href);
    if (!safe) return `<span style="display:block;margin:14px 0;padding:12px;border:1px dashed #c9d1cc;border-radius:5px;color:#7e8982;background:#f5f7f5;font-size:13px;">本地图片“${escapeHtml(text || href)}”需要重新上传</span>`;
    return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text || "正文图片")}"${title ? ` title="${escapeHtml(title)}"` : ""} style="display:block;width:100%;height:auto;margin:18px auto;border-radius:4px;" />`;
  };
  renderer.table = ({ header, rows }) => {
    const renderCell = (cell: (typeof header)[number], heading = false) => {
      const tag = heading ? "th" : "td";
      const align = cell.align ? `text-align:${cell.align};` : "";
      return `<${tag} style="padding:8px 9px;border:1px solid #dfe4e1;${align}${heading ? `color:${theme.color};background:#edf3ef;font-weight:700;` : "color:#465149;"}font-size:13px;line-height:1.6;">${inline(cell.tokens)}</${tag}>`;
    };
    const head = `<tr>${header.map((cell) => renderCell(cell, true)).join("")}</tr>`;
    const body = rows.map((row) => `<tr>${row.map((cell) => renderCell(cell)).join("")}</tr>`).join("");
    return `<section style="margin:18px 0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;table-layout:auto;">${head}${body}</table></section>`;
  };

  const normalized = source.replace(/^(?:\u200B|\u200C|\u200D|\u200E|\u200F|\uFEFF)/u, "");
  const html = marked.parse(normalized, { renderer, gfm: true, breaks: false, async: false }) as string;
  return `<section style="padding:4px 0;background:${theme.bg};">${html}</section>`;
}

export function findLocalMarkdownImages(source: string) {
  return Array.from(source.matchAll(/!\[[^\]]*]\(([^)]+)\)/g))
    .map((match) => match[1].trim())
    .filter((href) => !safeImage(href));
}

function safeLink(href: string) {
  const value = href.trim();
  if (value.startsWith("#")) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function safeImage(href: string) {
  try {
    const url = new URL(href.trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
