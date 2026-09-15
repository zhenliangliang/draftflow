import { marked, Renderer } from "marked";

export type MarkdownTheme = {
  color: string;
  bg: string;
  textColor: string;
  bodyFontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  headingStyle: "bar" | "underline" | "plain";
  quoteStyle: "tint" | "line" | "card";
  codeStyle: "dark" | "light";
  tableStyle: "grid" | "soft";
};

export type ResponsiveFormatReport = {
  score: number;
  tableCount: number;
  wideTableCount: number;
  outputTableCount: number;
  longCellCount: number;
};

export type MermaidBlock = {
  index: number;
  source: string;
};

const MERMAID_FENCE_PATTERN = /(^|\n)( {0,3})(`{3,}|~{3,})[ \t]*mermaid(?:[ \t]+[^\n]*)?\r?\n([\s\S]*?)\r?\n\2\3[ \t]*(?=\n|$)/gi;

export function markdownToWechatHtml(source: string, theme: MarkdownTheme) {
  const renderer = new Renderer();
  const inline = (tokens: Parameters<typeof renderer.parser.parseInline>[0]) => renderer.parser.parseInline(tokens);
  const block = (tokens: Parameters<typeof renderer.parser.parse>[0]) => renderer.parser.parse(tokens);
  const h2Style = headingStyle(theme);
  const h2Marker = theme.headingStyle === "bar" ? "▍ " : theme.headingStyle === "underline" ? "— " : "";
  const quote = quoteStyle(theme);
  const code = codeStyle(theme);
  const tableBorder = theme.tableStyle === "grid" ? theme.color : "#dfe4e1";
  const tableHeaderBg = theme.tableStyle === "grid" ? theme.color : theme.bg;
  const tableHeaderColor = theme.tableStyle === "grid" ? "#ffffff" : theme.color;

  renderer.html = ({ text }) => `<p style="margin:10px 0;padding:10px 12px;border-radius:4px;color:#7a665f;background:#fff3ef;font-size:13px;line-height:1.7">${escapeHtml(text)}</p>`;
  renderer.heading = ({ tokens, depth }) => {
    const content = inline(tokens);
    if (depth === 1) return `<h1 style="margin:26px 0 16px;color:${theme.textColor};font-size:26px;line-height:1.4;font-weight:750">${content}</h1>`;
    if (depth === 2) return `<h2 style="${h2Style}"><b>${h2Marker}${content}</b></h2>`;
    if (depth === 3) return `<h3><b>◆ ${content}</b></h3>`;
    return `<h${depth}><b>${content}</b></h${depth}>`;
  };
  // Body typography is inherited from the root section. Keeping paragraph
  // markup lean is important because WeChat counts HTML tags and styles in
  // its 20,000-character article limit.
  renderer.paragraph = ({ tokens }) => `<p>${inline(tokens)}</p>`;
  renderer.blockquote = ({ tokens }) => `<blockquote style="${quote}">${block(tokens)}</blockquote>`;
  renderer.code = ({ text, lang }) => {
    const language = (lang || "").trim().split(/\s+/)[0].toLowerCase();
    if (language === "mermaid") {
      const source = encodeURIComponent(text.trim());
      return `<figure data-mermaid-diagram="${escapeHtml(source)}" style="margin:20px 0;padding:10px;border:1px solid #dfe6e2;border-radius:8px;background:#ffffff;"><div data-mermaid-stage style="min-height:120px;overflow-x:auto;text-align:center;"><span data-mermaid-status style="display:inline-block;padding:42px 12px;color:#728078;font-size:13px;">正在生成架构图…</span></div><figcaption style="margin-top:8px;color:#849088;font-size:11px;line-height:1.5;text-align:center;">架构图 · 可横向查看，发送到微信时自动转为高清图片</figcaption></figure>`;
    }
    const semanticLanguage = !language || ["text", "plaintext", "ascii", "diagram", "architecture", "flow"].includes(language);
    const dialogue = semanticLanguage ? parseDialogueBlock(text) : null;
    if (dialogue) return renderDialogueBlock(dialogue, theme);
    const diagramLanguage = semanticLanguage;
    const diagram = diagramLanguage && looksLikeTextDiagram(text);
    const dualLaneDiagram = diagram ? parseDualLaneDiagram(text) : null;
    if (dualLaneDiagram) return renderDualLaneDiagram(dualLaneDiagram, theme);
    const framedReport = diagram ? parseFramedReport(text) : null;
    if (framedReport) return renderFramedReport(framedReport, theme);
    const arrowFlow = diagram ? parseArrowFlow(text) : null;
    if (arrowFlow) return renderArrowFlow(arrowFlow, theme);
    const palette = diagram
      ? { bodyBg: theme.bg, bodyColor: theme.textColor }
      : { bodyBg: code.bodyBg, bodyColor: code.bodyColor };
    const label = codeBlockLabel(language, text, diagram);
    if (!diagram) return renderWechatCodeBlock(language, text, label, code);

    // Unknown text diagrams still need fixed columns. Real source code takes a
    // different path above because WeChat's editor is unreliable when a
    // mobile-width code block depends on <pre> and white-space:pre-wrap.
    const layout = "white-space:pre;overflow-x:auto;overflow-wrap:normal;word-break:normal;letter-spacing:0;word-spacing:0;font-variant-ligatures:none;-webkit-overflow-scrolling:touch";
    return `<pre style="margin:16px 0;padding:12px;border-radius:6px;color:${palette.bodyColor};background:${palette.bodyBg};font-family:monospace;font-size:12px;line-height:1.55;${layout}"><b>${escapeHtml(label)}</b>\n\n${escapeHtml(formatCodeBlockText(text))}</pre>`;
  };
  renderer.codespan = ({ text }) => `<code>${escapeHtml(addSoftBreaks(text))}</code>`;
  renderer.hr = () => "<hr>";
  renderer.strong = ({ tokens }) => `<b>${inline(tokens)}</b>`;
  renderer.em = ({ tokens }) => `<i>${inline(tokens)}</i>`;
  renderer.del = ({ tokens }) => `<s>${inline(tokens)}</s>`;
  renderer.checkbox = ({ checked }) => checked ? "☑ " : "☐ ";
  renderer.list = ({ ordered, start, items }) => {
    const tag = ordered ? "ol" : "ul";
    const startAttr = ordered && start !== 1 ? ` start="${Number(start)}"` : "";
    return `<${tag}${startAttr}>${items.map((item) => renderer.listitem(item)).join("")}</${tag}>`;
  };
  renderer.listitem = ({ tokens }) => `<li>${block(tokens).replace(/^<p[^>]*>|<\/p>\n?$/g, "")}</li>`;
  renderer.link = ({ href, title, tokens }) => {
    const safe = safeLink(href);
    const content = inline(tokens);
    if (!safe) return content;
    const label = title ? `${content}（${escapeHtml(title)}）` : content;
    // WeChat reliably keeps links to its own articles, while arbitrary
    // external anchors are commonly stripped by the editor. Preserve their
    // visual meaning without spending the article budget on unusable URLs.
    return isWechatArticleLink(safe) ? `<a href="${escapeHtml(safe)}">${label}</a>` : `<u>${label}</u>`;
  };
  renderer.image = ({ href, title, text }) => {
    const safe = safeImage(href);
    if (!safe) return `<span style="display:block;margin:14px 0;padding:12px;border:1px dashed #c9d1cc;border-radius:5px;color:#7e8982;background:#f5f7f5;font-size:13px;">本地图片“${escapeHtml(text || href)}”需要重新上传</span>`;
    return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text || "正文图片")}"${title ? ` title="${escapeHtml(title)}"` : ""} style="display:block;width:100%;height:auto;margin:18px auto;border-radius:4px;" />`;
  };
  renderer.table = ({ header, rows }) => {
    const renderTable = (indexes: number[]) => {
      const firstColumnWidth = indexes.length === 2 ? "32%" : "34%";
      const head = indexes.map((index, position) => `<th${position === 0 ? ` width="${firstColumnWidth}"` : ""} bgcolor="${tableHeaderBg}" style="padding:7px;text-align:left;vertical-align:top;color:${tableHeaderColor}">${inline(header[index].tokens)}</th>`).join("");
      const body = rows.map((row) => `<tr>${indexes.map((index) => `<td style="padding:7px;vertical-align:top;overflow-wrap:anywhere">${inline(row[index]?.tokens ?? [])}</td>`).join("")}</tr>`).join("");
      return `<table width="100%" border="1" bordercolor="${tableBorder}" cellspacing="0" cellpadding="0" style="width:100%;margin:14px 0;border-collapse:collapse;table-layout:fixed"><tr>${head}</tr>${body}</table>`;
    };

    if (header.length <= 2) return renderTable(header.map((_, index) => index));

    const firstHeader = plainInline(inline(header[0].tokens));
    const isComparisonMatrix = /^(?:对比)?维度$|^指标$|^项目$/u.test(firstHeader.replace(/\s+/g, ""));

    if (isComparisonMatrix) {
      // Matrix tables are transposed into one product card per column. This
      // keeps every comparison field readable on a 320px phone without the
      // extremely tall and cramped "identifier + details" fallback.
      const cards = header.slice(1).map((cell, offset) => {
        const details = rows.map((row) => `${plainInline(inline(row[0]?.tokens ?? []))}：${inline(row[offset + 1]?.tokens ?? [])}`).join("<br>");
        return `<section><p><b>▍ ${plainInline(inline(cell.tokens))}</b></p><p>${details}</p></section>`;
      }).join("<hr>");
      return `<section style="padding:1px 12px;background:${theme.bg}">${cards}</section>`;
    }

    // Ordinary three/four-column data is shown as a compact record list. Each
    // source row remains one visual unit and field labels stay attached to the
    // correct values after WeChat narrows the article to a phone viewport.
    const cards = rows.map((row) => {
      const title = plainInline(inline(row[0]?.tokens ?? []));
      const details = header.slice(1).map((cell, offset) => `${plainInline(inline(cell.tokens))}：${inline(row[offset + 1]?.tokens ?? [])}`).join("<br>");
      return `<p><b>${title}</b><br>${details}</p>`;
    }).join("<hr>");
    return `<section style="padding:1px 12px;background:${theme.bg}">${cards}</section>`;
  };

  const normalized = source.replace(/^(?:\u200B|\u200C|\u200D|\u200E|\u200F|\uFEFF)/u, "");
  const html = (marked.parse(normalized, { renderer, gfm: true, breaks: false, async: false }) as string)
    .replace(/>\n(?=<)/g, ">").trim();
  // WeChat's article container may inherit justified alignment. Explicitly
  // reset the root typography so spaces between Latin words are not stretched
  // across a phone-width line, while long URLs can still wrap safely.
  const richHtml = `<section style="color:${theme.textColor};background:#fff;font-size:${theme.bodyFontSize}px;line-height:${theme.lineHeight};text-align:left;letter-spacing:normal;word-spacing:0;word-break:normal;overflow-wrap:break-word">${html}</section>`;
  return fitWechatHtmlBudget(richHtml, theme);
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

function fitWechatHtmlBudget(html: string, theme: MarkdownTheme) {
  // Leave room for template sections and any normalization WeChat applies
  // while ingesting the HTML instead of aiming at the hard 20,000 limit.
  const safeBudget = 19_300;
  if (html.length < safeBudget) return html;

  // Drop only redundant decoration first. Semantic structure, 14px body
  // typography, headings, callouts, table cards and code blocks stay intact.
  const withoutMetadata = html
    .replace(/\sdata-table-layout="[^"]*"/gi, "")
    .replace(/\sdata-code-block="[^"]*"/gi, "")
    .replace(/<code style="[^"]*">/gi, "<code>")
    .replace(/<hr style="[^"]*">/gi, "<hr>");
  if (withoutMetadata.length < safeBudget) return withoutMetadata;

  const compactHeadings = withoutMetadata
    .replace(/<h([3-6]) style="[^"]*">/gi, (_match, depth: string) => `<h${depth} style="margin:20px 0 9px;color:${theme.color}">`)
    .replace(/<li style="margin:5px 0">/gi, "<li>");
  if (compactHeadings.length < safeBudget) return compactHeadings;

  const compactParagraphs = compactHeadings
    .replace(new RegExp(`<p style="margin:0 0 ${theme.paragraphSpacing}px">`, "gi"), "<p>");
  if (compactParagraphs.length < safeBudget) return compactParagraphs;

  // Near the platform ceiling, keep code colors, padding, spacing, explicit
  // line breaks and mobile wrapping. Only remove properties already enforced
  // by the root article container (or by a normal section's browser default).
  // In particular, never merge adjacent <br> tags here: a NBSP between them is
  // an intentional blank source line, and `\s` also matches that character.
  const compactCodeBlocks = compactParagraphs.replace(
    /<section style="([^"]*font-family:monospace[^"]*)">/gi,
    (_match, style: string) => `<section style="${style
      .replace(/white-space:normal;/gi, "")
      .replace(/letter-spacing:0;/gi, "")
      .replace(/word-spacing:0;/gi, "")
      .replace(/word-break:normal;/gi, "")}">`,
  );
  if (compactCodeBlocks.length < safeBudget) return compactCodeBlocks;

  // Very long articles can cross the limit once a reusable footer, previous
  // article link and QR image are appended. Keep HCL's per-line blocks
  // untouched, but make repeated workflow rows native margin-free blocks and
  // remove a few decorative properties. This saves enough markup without
  // weakening the line boundaries that survive WeChat's HTML cleaner.
  const leanDecorations = compactCodeBlocks
    .replace(/<p style="margin:7px 0">([\s\S]*?)<\/p>/gi, "<div>$1</div>")
    .replace(/<section style="margin:16px 0;padding:12px;border-left:/gi, '<section style="padding:12px;border-left:')
    .replace(/border-radius:[^;"]+;?/gi, "");
  if (leanDecorations.length < safeBudget) return leanDecorations;

  // Preserve content rather than silently truncating it. Callers enforce the
  // platform limit and can ask the author to split truly oversized articles.
  return leanDecorations;
}

function headingStyle(theme: MarkdownTheme) {
  return `color:${theme.color}`;
}

function quoteStyle(theme: MarkdownTheme) {
  const base = "padding:12px";
  if (theme.quoteStyle === "line") return `${base};border-left:3px solid ${theme.color}`;
  if (theme.quoteStyle === "card") return `${base};border:1px solid ${theme.color};background:${theme.bg}`;
  return `${base};border-left:3px solid ${theme.color};background:${theme.bg}`;
}

function codeStyle(theme: MarkdownTheme) {
  if (theme.codeStyle === "light") {
    return { border: "#d7ddd9", labelBg: theme.color, labelColor: "#ffffff", bodyBg: "#f6f8f7", bodyColor: "#26332c" };
  }
  return { border: "#2e4138", labelBg: "#25372f", labelColor: "#b8c6be", bodyBg: "#17251f", bodyColor: "#ecf3ef" };
}

export function findLocalMarkdownImages(source: string) {
  return Array.from(source.matchAll(/!\[[^\]]*]\(([^)]+)\)/g))
    .map((match) => match[1].trim())
    .filter((href) => !safeImage(href));
}

export function findMermaidBlocks(source: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  let index = 0;
  for (const match of source.matchAll(new RegExp(MERMAID_FENCE_PATTERN.source, MERMAID_FENCE_PATTERN.flags))) {
    blocks.push({ index, source: match[4].trim() });
    index += 1;
  }
  return blocks;
}

export function replaceMermaidBlocks(source: string, imageUrls: string[]) {
  let index = 0;
  return source.replace(new RegExp(MERMAID_FENCE_PATTERN.source, MERMAID_FENCE_PATTERN.flags), (_match, leading: string) => {
    const imageUrl = imageUrls[index];
    const label = imageUrls.length > 1 ? `架构图 ${index + 1}` : "架构图";
    index += 1;
    if (!imageUrl) throw new Error(`${label}尚未成功转换，请重试`);
    return `${leading}![${label}（点击可放大查看）](${imageUrl})`;
  });
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

function isWechatArticleLink(href: string) {
  try {
    return new URL(href).hostname === "mp.weixin.qq.com";
  } catch {
    return href.startsWith("#");
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function plainInline(value: string) {
  return value.replace(/<\/?(?:b|strong|i|em|s|del|code)(?:\s[^>]*)?>/gi, "").trim();
}

function looksLikeTextDiagram(value: string) {
  const boxDrawingCount = (value.match(/[┌┐└┘├┤┬┴│─]/gu) ?? []).length;
  const arrowCount = (value.match(/(?:→|-->|=>|←|↑|↓|▼)/gu) ?? []).length;
  const asciiFrame = /(?:^|\n)\s*[+|][+|-]{3,}/u.test(value);
  return boxDrawingCount >= 3 || arrowCount >= 2 || asciiFrame;
}

function codeBlockLabel(language: string, value: string, diagram = false) {
  if (diagram) {
    if (/[┌┐└┘├┤┬┴│─]/u.test(value)) return "能力架构";
    return "工作流程";
  }
  if (language) {
    const names: Record<string, string> = {
      sh: "BASH",
      shell: "BASH",
      js: "JAVASCRIPT",
      ts: "TYPESCRIPT",
      yml: "YAML",
    };
    return names[language] || language.toUpperCase();
  }
  if (/[├└│]/u.test(value)) return "能力架构";
  if (looksLikeTextDiagram(value)) return "工作流程";
  if (/^\s*(?:参数|query|start|end|limit|org)[：:]/mu.test(value)) return "参数说明";
  if (/\{[^}\n]+\}\s*(?:\|=|\|~|\|\s*json)/u.test(value)) return "LOGQL";
  return "示例";
}

function formatCodeBlockText(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").replace(/\n$/, "");
}

type WechatCodeLine = {
  indent: number;
  text: string;
};

function renderWechatCodeBlock(
  language: string,
  value: string,
  label: string,
  palette: ReturnType<typeof codeStyle>,
) {
  const lines = formatWechatCodeLines(language, value);
  const renderedLines = lines.map((line) => {
    // Normal white-space intentionally collapses alignment padding inside a
    // source line. Only leading indentation is non-breaking, which keeps the
    // syntax hierarchy while long commands and values wrap naturally on phones.
    // A literal NBSP is equivalent to `&nbsp;` after parsing, but costs one
    // character instead of six against WeChat's strict HTML length limit.
    const indent = "\u00A0".repeat(Math.min(line.indent, 16));
    const text = line.text ? escapeHtml(line.text) : "\u00A0";
    return `${indent}${text}`;
  });
  // HCL is the format most affected by WeChat's editor because assignments,
  // nested blocks and trailing comments create many short visual lines. Give
  // every HCL source line a native block boundary; even if the editor strips
  // data attributes or wrapping styles, those lines cannot collapse together.
  // Other code remains compact and uses explicit breaks so long articles stay
  // under WeChat's 20,000-character HTML ceiling.
  const content = isHclLanguage(language)
    ? renderedLines.map((line) => `<section>${line}</section>`).join("")
    : renderedLines.join("<br>");

  return `<section data-code-block="true" style="margin:16px 0;padding:12px;color:${palette.bodyColor};background:${palette.bodyBg};font-family:monospace;font-size:12px;line-height:1.65;white-space:normal;text-align:left;letter-spacing:0;word-spacing:0;word-break:normal;overflow-wrap:break-word"><p style="margin:0 0 8px"><b>${escapeHtml(label)}</b></p>${content}</section>`;
}

function formatWechatCodeLines(language: string, value: string): WechatCodeLine[] {
  const hcl = isHclLanguage(language);
  const lines = formatCodeBlockText(value).split("\n");
  const result: WechatCodeLine[] = [];

  for (const rawLine of lines) {
    const leading = rawLine.match(/^ */u)?.[0].length ?? 0;
    const body = rawLine.slice(leading).replace(/\s+$/u, "");
    if (!body) {
      result.push({ indent: 0, text: "" });
      continue;
    }

    if (hcl) {
      const commentIndex = findHclTrailingComment(body);
      if (commentIndex > 0) {
        const source = normalizeHclLineWhitespace(body.slice(0, commentIndex).replace(/\s+$/u, ""));
        const comment = normalizeHclLineWhitespace(body.slice(commentIndex).trim());
        if (source) result.push({ indent: leading, text: source });
        result.push({ indent: leading + 2, text: comment });
        continue;
      }
    }

    result.push({
      indent: leading,
      text: hcl ? normalizeHclLineWhitespace(body) : body,
    });
  }

  return result;
}

function isHclLanguage(language: string) {
  return ["hcl", "terraform", "tf", "tfvars"].includes(language);
}

function normalizeHclLineWhitespace(value: string) {
  let result = "";
  let quote = "";
  let escaped = false;
  let pendingSpace = false;

  for (const char of value) {
    if (quote) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      if (pendingSpace && result) result += " ";
      pendingSpace = false;
      quote = char;
      result += char;
      continue;
    }

    if (/\s/u.test(char)) {
      pendingSpace = true;
      continue;
    }

    if (pendingSpace && result) result += " ";
    pendingSpace = false;
    result += char;
  }

  return result;
}

function findHclTrailingComment(value: string) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    const precededBySpace = index > 0 && /\s/u.test(value[index - 1]);
    if (char === "#" && precededBySpace) return index;
    if (char === "/" && value[index + 1] === "/" && precededBySpace) return index;
  }

  return -1;
}

type DialogueTurn = {
  speaker: string;
  content: string;
  actions: string[];
};

function parseDialogueBlock(value: string): DialogueTurn[] | null {
  const lines = formatCodeBlockText(value).split("\n");
  const turns: DialogueTurn[] = [];
  let current: DialogueTurn | null = null;
  const speakerPattern = /^\s*((?:你|用户|user|AI(?:\s+Agent)?|Agent|Claude|ChatGPT|助手|系统)(?:（[^）\n]+）|\([^)]*\))?)\s*[:：]\s*(.*)$/iu;

  for (const rawLine of lines) {
    const text = rawLine.trim();
    if (!text) continue;
    const speaker = rawLine.match(speakerPattern);
    if (speaker) {
      current = { speaker: speaker[1].trim(), content: speaker[2].trim(), actions: [] };
      turns.push(current);
      continue;
    }
    if (!current) return null;
    if (/^(?:→|->|⇒)\s*/u.test(text)) {
      current.actions.push(text.replace(/^(?:→|->|⇒)\s*/u, ""));
    } else if (current.actions.length > 0) {
      current.actions[current.actions.length - 1] = `${current.actions[current.actions.length - 1]} ${text}`.trim();
    } else {
      current.content = `${current.content} ${text}`.trim();
    }
  }

  return turns.length > 0 && turns.some((turn) => turn.content || turn.actions.length > 0) ? turns : null;
}

function renderDialogueBlock(turns: DialogueTurn[], theme: MarkdownTheme) {
  const content = turns.map((turn) => {
    const answer = turn.content ? ` ${escapeHtml(turn.content)}` : "";
    const actions = turn.actions.length > 0
      ? `${answer ? "<br>" : " "}${turn.actions.map((item) => `↳ ${escapeHtml(item)}`).join("<br>")}`
      : "";
    return `<p style="margin:7px 0"><b>${escapeHtml(turn.speaker)}：</b>${answer}${actions}</p>`;
  }).join("");
  return `<section style="margin:16px 0;padding:12px;border-left:3px solid ${theme.color};background:${theme.bg}"><p style="margin:0 0 8px;color:${theme.color};font-size:12px"><b>对话示例</b></p>${content}</section>`;
}

function parseArrowFlow(value: string): string[] | null {
  if (/[┌┐└┘├┤┬┴│─]/u.test(value)) return null;
  const lines = formatCodeBlockText(value).split("\n");
  const connectorCount = (value.match(/(?:→|-->|=>|↓|▼)/gu) ?? []).length;
  if (connectorCount < 2) return null;

  const steps: string[] = [];
  for (const rawLine of lines) {
    const text = rawLine.trim();
    if (!text || /^(?:↓|▼|→|-->|=>)$/u.test(text)) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const beginsWithArrow = /^(?:→|-->|=>)\s*/u.test(text);
    const containsArrow = /(?:→|-->|=>)/u.test(text);

    if (indent > 0 && !beginsWithArrow && !containsArrow && steps.length > 0) {
      steps[steps.length - 1] = `${steps[steps.length - 1]} ${text}`;
      continue;
    }

    const parts = text
      .replace(/^(?:→|-->|=>)\s*/u, "")
      .split(/\s*(?:→|-->|=>)\s*/u)
      .map((part) => part.trim())
      .filter(Boolean);
    steps.push(...parts);
  }

  return steps.length >= 3 ? steps : null;
}

function renderArrowFlow(steps: string[], theme: MarkdownTheme) {
  const content = steps.map((step, index) => `<p style="margin:7px 0"><b>${index + 1}.</b> ${escapeHtml(step)}</p>`).join("");
  return `<section style="margin:16px 0;padding:12px;border-left:3px solid ${theme.color};background:${theme.bg}"><p style="margin:0 0 8px;color:${theme.color};font-size:12px"><b>工作流程</b></p>${content}</section>`;
}

type DualLaneDiagram = {
  hub: string;
  lanes: Array<{ title: string; flow: string }>;
};

type FramedReportItem =
  | { kind: "metric"; label: string; separator: ":" | "："; value: string }
  | { kind: "section"; text: string }
  | { kind: "status"; text: string; tone: "success" | "warning" | "danger" }
  | { kind: "numbered"; number: string; text: string; details: string[] }
  | { kind: "text"; text: string };

type FramedReport = {
  eyebrow: string;
  title: string;
  items: FramedReportItem[];
};

function parseDualLaneDiagram(value: string): DualLaneDiagram | null {
  const lines = formatCodeBlockText(value).split("\n");
  const topIndex = lines.findIndex((line) => (line.match(/┌/gu) ?? []).length >= 2);
  if (topIndex < 0) return null;

  const titleMatches = Array.from(lines[topIndex].matchAll(/┌─+\s*([^─┐]+?)\s*─+┐/gu));
  const titles = titleMatches.map((match) => match[1].trim()).filter(Boolean);
  if (titles.length < 2) return null;

  const closeIndex = lines.findIndex((line, index) => index > topIndex && (line.match(/└/gu) ?? []).length >= titles.length);
  if (closeIndex < 0) return null;

  const laneParts = titles.map(() => [] as string[]);
  for (const line of lines.slice(topIndex + 1, closeIndex)) {
    const segments = Array.from(line.matchAll(/│([^│]*)│/gu), (match) => match[1]);
    if (segments.length < titles.length) continue;
    titles.forEach((_title, index) => {
      const content = normalizeDiagramPhrase(segments[index]);
      if (content) laneParts[index].push(content);
    });
  }

  const lanes = titles.map((title, index) => ({
    title,
    flow: laneParts[index].join(" → "),
  })).filter((lane) => lane.flow);
  if (lanes.length < 2) return null;

  const hubParts: string[] = [];
  for (const line of lines.slice(closeIndex + 1)) {
    for (const match of line.matchAll(/│([^│]+)│/gu)) {
      if (/[┌┐└┘─]/u.test(match[1])) continue;
      const content = match[1].trim().replace(/^[（(]|[）)]$/gu, "");
      if (content && /[\p{L}\p{N}]/u.test(content) && !hubParts.includes(content)) hubParts.push(content);
    }
  }

  return { hub: hubParts.join(" · "), lanes };
}

function normalizeDiagramPhrase(value: string) {
  return value.trim().replace(/^→\s*/u, "").replace(/\s+/gu, " ");
}

function parseFramedReport(value: string): FramedReport | null {
  const lines = formatCodeBlockText(value).split("\n");
  const topIndexes = lines.flatMap((line, index) => /^\s*┌─+┐\s*$/u.test(line) ? [index] : []);
  const bottomIndexes = lines.flatMap((line, index) => /^\s*└─+┘\s*$/u.test(line) ? [index] : []);
  if (topIndexes.length !== 1 || bottomIndexes.length !== 1) return null;

  const topIndex = topIndexes[0];
  const bottomIndex = bottomIndexes[0];
  if (bottomIndex <= topIndex + 1) return null;
  if (lines.slice(bottomIndex + 1).some((line) => line.trim())) return null;

  const framedLines: string[] = [];
  for (const line of lines.slice(topIndex + 1, bottomIndex)) {
    const match = line.match(/^\s*│(.*)│\s*$/u);
    if (!match) return null;
    framedLines.push(match[1].replace(/\s+$/u, ""));
  }

  const titleIndex = framedLines.findIndex((line) => line.trim());
  if (titleIndex < 0) return null;
  const title = normalizeDiagramPhrase(framedLines[titleIndex]);
  const bodyLines = framedLines.slice(titleIndex + 1);
  const indents = bodyLines.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length);
  const baseIndent = indents.length ? Math.min(...indents) : 0;
  const items: FramedReportItem[] = [];
  let currentNumbered: Extract<FramedReportItem, { kind: "numbered" }> | null = null;

  for (const rawLine of bodyLines) {
    const text = normalizeDiagramPhrase(rawLine);
    if (!text) {
      currentNumbered = null;
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    if (currentNumbered && indent > baseIndent + 1) {
      currentNumbered.details.push(text);
      continue;
    }

    const numbered = text.match(/^(\d+)[.)、．]\s*(.+)$/u);
    if (numbered) {
      currentNumbered = { kind: "numbered", number: numbered[1], text: numbered[2], details: [] };
      items.push(currentNumbered);
      continue;
    }
    currentNumbered = null;

    if (/^[^:：]{1,28}[:：]$/u.test(text)) {
      items.push({ kind: "section", text });
      continue;
    }

    if (/^(?:✅|☑|✓)/u.test(text)) {
      items.push({ kind: "status", text, tone: "success" });
      continue;
    }
    if (/^(?:⚠️?|△|!)/u.test(text)) {
      items.push({ kind: "status", text, tone: "warning" });
      continue;
    }
    if (/^(?:❌|✕|×)/u.test(text)) {
      items.push({ kind: "status", text, tone: "danger" });
      continue;
    }

    const metric = text.match(/^([^:：]{1,28}?)(\s*[:：])\s*(.+)$/u);
    if (metric) {
      items.push({
        kind: "metric",
        label: metric[1].trim(),
        separator: metric[2].includes("：") ? "：" : ":",
        value: metric[3],
      });
      continue;
    }
    items.push({ kind: "text", text });
  }

  if (!title || items.length === 0) return null;
  const eyebrow = lines.slice(0, topIndex).map(normalizeDiagramPhrase).filter(Boolean).join(" ");
  return { eyebrow, title, items };
}

function renderFramedReport(report: FramedReport, theme: MarkdownTheme) {
  const eyebrow = report.eyebrow
    ? `<p style="margin:0 0 7px;color:${theme.color};font-size:12px"><b>${escapeHtml(report.eyebrow)}</b></p>`
    : "";
  const items = report.items.map((item) => {
    if (item.kind === "metric") {
      return `<p style="margin:6px 0"><b>${escapeHtml(item.label)}${item.separator}</b> ${escapeHtml(item.value)}</p>`;
    }
    if (item.kind === "section") {
      return `<p style="margin:11px 0 5px;color:${theme.color}"><b>${escapeHtml(item.text)}</b></p>`;
    }
    if (item.kind === "status") {
      const color = item.tone === "success" ? "#247451" : item.tone === "warning" ? "#9a651c" : "#a8473d";
      return `<p style="margin:5px 0;color:${color}">${escapeHtml(item.text)}</p>`;
    }
    if (item.kind === "numbered") {
      const details = item.details.length
        ? `<br><span style="color:#6f7c74">${item.details.map(escapeHtml).join("<br>")}</span>`
        : "";
      return `<p style="margin:7px 0"><b>${escapeHtml(item.number)}.</b> ${escapeHtml(item.text)}${details}</p>`;
    }
    return `<p style="margin:6px 0">${escapeHtml(item.text)}</p>`;
  }).join("");

  // Typography and wrapping inherit from the article root. Repeating those
  // declarations on every report adds hundreds of characters to long drafts
  // and leaves too little room under WeChat's 20,000-character limit.
  return `<section style="margin:16px 0;padding:12px;border-left:3px solid ${theme.color};background:${theme.bg}">${eyebrow}<p style="margin:0 0 9px;color:${theme.color};font-size:15px"><b>${escapeHtml(report.title)}</b></p>${items}</section>`;
}

function renderDualLaneDiagram(diagram: DualLaneDiagram, theme: MarkdownTheme) {
  const hub = diagram.hub
    ? `<section style="margin:8px 0 12px;padding:10px 12px;border-radius:6px;color:#fff;background:${theme.color};text-align:center"><b>${escapeHtml(diagram.hub)}</b><br><span style="font-size:12px;opacity:.86">连接以下 ${diagram.lanes.length} 个阶段</span></section>`
    : "";
  const lanes = diagram.lanes.map((lane, index) => {
    const connector = index === 0 ? "" : `<p style="margin:5px 0;color:${theme.color};text-align:center"><b>↓</b></p>`;
    return `${connector}<section style="padding:10px 12px;border-left:3px solid ${theme.color};background:#fff"><p style="margin:0 0 5px;color:${theme.color}"><b>${index + 1}. ${escapeHtml(lane.title)}</b></p><p style="margin:0;font-size:${Math.max(12, theme.bodyFontSize - 1)}px;line-height:1.75">${escapeHtml(lane.flow)}</p></section>`;
  }).join("");
  return `<section style="margin:16px 0;padding:12px;border:1px solid #dfe6e2;border-radius:8px;background:${theme.bg}"><p style="margin:0 0 9px;color:${theme.color};font-size:12px"><b>能力架构 · 移动端适配</b></p>${hub}${lanes}</section>`;
}

function addSoftBreaks(value: string) {
  return value.length > 22 ? value.replace(/([/._-])/g, "$1\u200B") : value;
}
