import { marked, Renderer } from "marked";

export type MarkdownTheme = {
  color: string;
  bg: string;
};

export type ResponsiveFormatReport = {
  score: number;
  tableCount: number;
  wideTableCount: number;
  outputTableCount: number;
  longCellCount: number;
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
  renderer.codespan = ({ text }) => `<code style="margin:0 2px;padding:2px 5px;border-radius:3px;color:#a23f35;background:#f5eeeb;font-family:monospace;font-size:14px;letter-spacing:normal;white-space:normal;word-break:break-all;">${escapeHtml(addSoftBreaks(text))}</code>`;
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
    const label = title ? `${content}（${escapeHtml(title)}）` : content;
    return `<span style="color:${theme.color};text-decoration:underline;word-break:break-all;">${label}</span>`;
  };
  renderer.image = ({ href, title, text }) => {
    const safe = safeImage(href);
    if (!safe) return `<span style="display:block;margin:14px 0;padding:12px;border:1px dashed #c9d1cc;border-radius:5px;color:#7e8982;background:#f5f7f5;font-size:13px;">本地图片“${escapeHtml(text || href)}”需要重新上传</span>`;
    return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text || "正文图片")}"${title ? ` title="${escapeHtml(title)}"` : ""} style="display:block;width:100%;height:auto;margin:18px auto;border-radius:4px;" />`;
  };
  renderer.table = ({ header, rows }) => {
    const renderTable = (indexes: number[]) => {
      const firstColumnWidth = indexes.length === 2 ? "32%" : "34%";
      const head = indexes.map((index, position) => `<th${position === 0 ? ` width="${firstColumnWidth}"` : ""} bgcolor="#edf3ef" style="padding:7px;text-align:left;vertical-align:top;color:${theme.color};font-size:13px;line-height:1.55;word-break:normal;overflow-wrap:anywhere;">${inline(header[index].tokens)}</th>`).join("");
      const body = rows.map((row) => `<tr>${indexes.map((index) => `<td style="padding:7px;vertical-align:top;color:#3f4943;font-size:13px;line-height:1.65;word-break:normal;overflow-wrap:anywhere;">${inline(row[index]?.tokens ?? [])}</td>`).join("")}</tr>`).join("");
      return `<table width="100%" border="1" bordercolor="#dfe4e1" cellspacing="0" cellpadding="0" style="width:100%;margin:12px 0;border-collapse:collapse;table-layout:fixed;"><tr>${head}</tr>${body}</table>`;
    };

    if (header.length <= 2) return renderTable(header.map((_, index) => index));

    // WeChat articles are normally read inside a 320–412px viewport. Keeping
    // more than two columns makes Chinese text break every few characters.
    // Convert each wide row into "identifier + details": it remains a real
    // table, does not duplicate rows, and stays readable on both phone and web.
    const head = `<th width="28%" bgcolor="#edf3ef" style="padding:7px;text-align:left;vertical-align:top;color:${theme.color};font-size:13px;line-height:1.55;">${inline(header[0].tokens)}</th><th bgcolor="#edf3ef" style="padding:7px;text-align:left;vertical-align:top;color:${theme.color};font-size:13px;line-height:1.55;">详情</th>`;
    const body = rows.map((row) => {
      const details = header.slice(1).map((cell, offset) => `<strong style="color:${theme.color};font-weight:700;">${inline(cell.tokens)}：</strong>${inline(row[offset + 1]?.tokens ?? [])}`).join('<br><span style="display:block;height:5px;"></span>');
      return `<tr><td style="padding:7px;vertical-align:top;color:#3f4943;font-size:13px;line-height:1.65;word-break:normal;overflow-wrap:anywhere;">${inline(row[0]?.tokens ?? [])}</td><td style="padding:7px;vertical-align:top;color:#3f4943;font-size:13px;line-height:1.65;word-break:normal;overflow-wrap:anywhere;">${details}</td></tr>`;
    }).join("");
    return `<table width="100%" border="1" bordercolor="#dfe4e1" cellspacing="0" cellpadding="0" style="width:100%;margin:12px 0;border-collapse:collapse;table-layout:fixed;"><tr>${head}</tr>${body}</table>`;
  };

  const normalized = source.replace(/^(?:\u200B|\u200C|\u200D|\u200E|\u200F|\uFEFF)/u, "");
  const html = marked.parse(normalized, { renderer, gfm: true, breaks: false, async: false }) as string;
  const richHtml = `<section style="padding:4px 0;background:${theme.bg};">${html}</section>`;
  if (richHtml.length < 19_950) return richHtml;

  const compactHtml = compactWechatHtml(richHtml, theme);
  if (compactHtml.length < 19_950) return compactHtml;

  const readableHtml = compactHtml
    .replace(/<(span|code)([^>]*)\sstyle="[^"]*"/gi, "<$1$2");
  if (readableHtml.length < 19_950) return readableHtml;

  const essentialHtml = readableHtml
    .replace(/<(h[3-6])([^>]*)\sstyle="[^"]*"/gi, "<$1$2");
  if (essentialHtml.length < 19_950) return essentialHtml;

  const leanHtml = essentialHtml
    .replace(/<p\sstyle="margin:0 0 14px"/gi, "<p")
    .replace(/<span>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<br>\s*<br>/gi, "<br>");
  if (leanHtml.length < 19_950) return leanHtml;

  // Extremely long source documents still keep all text and semantic tags.
  // Only decorative inline styles are removed as a final attempt to satisfy
  // WeChat's strict 20,000-character HTML limit.
  const unstyledHtml = compactHtml
    .replace(/\sstyle="[^"]*"/gi, "")
    .replace(/<span>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<br>\s*<br>/gi, "<br>");
  return unstyledHtml
    .replace(/(<tr><td(?:\s[^>]*)?>[\s\S]*?<\/td>)<td>/gi, '$1<td style="overflow-wrap:anywhere">')
    .replace(/<table([^>]*)>/gi, '<table$1 style="table-layout:fixed">');
}

export function analyzeResponsiveMarkdown(source: string): ResponsiveFormatReport {
  const lines = source.split(/\r?\n/);
  let tableCount = 0;
  let wideTableCount = 0;
  let outputTableCount = 0;
  let longCellCount = 0;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = parseMarkdownTableRow(lines[index]);
    const separator = parseMarkdownTableRow(lines[index + 1]);
    if (header.length < 2 || separator.length !== header.length || !separator.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) continue;

    tableCount += 1;
    if (header.length > 2) wideTableCount += 1;
    outputTableCount += 1;
    let rowIndex = index + 2;
    while (rowIndex < lines.length) {
      const cells = parseMarkdownTableRow(lines[rowIndex]);
      if (cells.length !== header.length) break;
      longCellCount += cells.filter((cell) => cell.replace(/\[[^\]]+]\([^)]+\)/g, "链接").trim().length > 28).length;
      rowIndex += 1;
    }
    index = rowIndex - 1;
  }

  const score = Math.max(88, 100 - Math.min(8, longCellCount) - (wideTableCount > 0 ? 2 : 0));
  return { score, tableCount, wideTableCount, outputTableCount, longCellCount };
}

function parseMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  const body = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function compactWechatHtml(html: string, theme: MarkdownTheme) {
  const styles: Record<string, string> = {
    h1: "font-size:24px",
    h2: `padding-left:8px;border-left:3px solid ${theme.color};color:${theme.color}`,
    h3: `color:${theme.color}`,
    h4: `color:${theme.color}`,
    h5: `color:${theme.color}`,
    h6: `color:${theme.color}`,
    p: "margin:0 0 14px",
    blockquote: `padding:10px;border-left:3px solid ${theme.color};background:#edf2ee`,
    pre: "padding:10px;overflow:auto;background:#16251e;color:#fff;white-space:pre-wrap;word-break:break-word",
    code: "word-break:break-all",
    span: `color:${theme.color};text-decoration:underline;word-break:break-all`,
    img: "display:block;width:100%;height:auto;margin:18px auto",
    table: "width:100%;margin:12px 0;border-collapse:collapse;table-layout:fixed",
    th: `padding:7px;text-align:left;vertical-align:top;color:${theme.color};font-size:13px;line-height:1.55;word-break:normal;overflow-wrap:anywhere`,
    td: "padding:7px;vertical-align:top;color:#3f4943;font-size:13px;line-height:1.65;word-break:normal;overflow-wrap:anywhere",
  };

  return html
    .replace(/<([a-z0-9]+)([^>]*) style="([^"]*)"/gi, (_full, rawTag: string, attributes: string, originalStyle: string) => {
      const tag = rawTag.toLowerCase();
      let style = styles[tag];
      if (tag === "section" && originalStyle.includes("background:")) {
        style = `background:${theme.bg};color:#3f4943;font-size:16px;line-height:1.8`;
      }
      return `<${rawTag}${attributes}${style ? ` style="${style}"` : ""}`;
    })
    .replace(/<table style=/gi, '<table border="1" cellpadding="4" style=');
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

function addSoftBreaks(value: string) {
  return value.length > 22 ? value.replace(/([/._-])/g, "$1\u200B") : value;
}
