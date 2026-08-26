export type FormatAuditLevel = "error" | "warning" | "tip";

export type FormatAuditIssue = {
  id: string;
  level: FormatAuditLevel;
  title: string;
  detail: string;
  fixable: boolean;
};

export type FormatAuditResult = {
  score: number;
  label: string;
  issues: FormatAuditIssue[];
  passed: number;
};

export function auditArticle(input: { title: string; content: string; digest: string }): FormatAuditResult {
  const { title, content, digest } = input;
  const issues: FormatAuditIssue[] = [];
  const add = (issue: FormatAuditIssue) => issues.push(issue);
  const prose = content.replace(/```[\s\S]*?```/g, "");
  const wordCount = prose.replace(/[#>*_`|\-\s]/g, "").length;
  const headings = Array.from(content.matchAll(/^(#{1,6})\s+.+$/gm)).map((match) => match[1].length);
  const paragraphs = prose.split(/\n{2,}/).map((item) => item.replace(/\n/g, "").trim()).filter((item) => item && !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|\|)/.test(item));
  const localImages = Array.from(content.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)).filter((match) => !/^https?:\/\//i.test(match[1].trim()));

  if (!title.trim()) add({ id: "title-empty", level: "error", title: "缺少文章标题", detail: "标题是草稿箱必填项，也决定用户是否愿意点开。", fixable: false });
  else if (title.trim().length > 32) add({ id: "title-long", level: "error", title: "标题超过 32 个字符", detail: "微信公众号接口会拒绝过长标题，请精简核心信息。", fixable: false });
  else if (title.trim().length < 8) add({ id: "title-short", level: "tip", title: "标题信息量偏少", detail: "建议补充对象、收益或差异点，让标题更具体。", fixable: false });

  if (!digest.trim()) add({ id: "digest-empty", level: "warning", title: "缺少摘要", detail: "建议用 40–90 字说明文章价值，提升分享卡片的吸引力。", fixable: false });
  else if (digest.trim().length > 128) add({ id: "digest-long", level: "error", title: "摘要超过 128 个字符", detail: "微信公众号接口会拒绝过长摘要。", fixable: false });
  else if (digest.trim().length < 30) add({ id: "digest-short", level: "tip", title: "摘要略短", detail: "可以补充读者将获得什么，以及适合哪些人阅读。", fixable: false });

  if (wordCount > 500 && headings.filter((level) => level === 2).length === 0) {
    add({ id: "structure", level: "warning", title: "长文缺少二级标题", detail: "建议每 300–500 字设置一个小节，方便手机端快速扫读。", fixable: false });
  }
  if (headings.some((level, index) => index > 0 && level - headings[index - 1] > 1)) {
    add({ id: "heading-jump", level: "warning", title: "标题层级存在跳级", detail: "请按 H2 → H3 的顺序组织结构，避免直接从 H2 跳到 H4。", fixable: false });
  }

  const longParagraphs = paragraphs.filter((paragraph) => paragraph.length > 220).length;
  if (longParagraphs) add({ id: "long-paragraph", level: "warning", title: `${longParagraphs} 个段落过长`, detail: "手机阅读建议每段控制在 80–180 字，可拆分观点或加入列表。", fixable: false });
  if (/\u3000|[\u3400-\u9fff][ \t]+[\u3400-\u9fff]/u.test(prose)) {
    add({ id: "spacing", level: "warning", title: "检测到异常字符间距", detail: "包含全角空格或连续空格，可能导致微信端字距不均。", fixable: true });
  }
  if ((content.match(/^```/gm)?.length ?? 0) % 2 !== 0) {
    add({ id: "code-fence", level: "error", title: "代码块没有闭合", detail: "缺少结尾的 ```，后续正文会被错误显示为代码。", fixable: false });
  }
  if (localImages.length) add({ id: "local-images", level: "error", title: `${localImages.length} 张本地图片未上传`, detail: "本地路径无法在微信公众号中显示，请先通过“图片”按钮上传。", fixable: false });
  if (/!\[\s*]\(/.test(content)) add({ id: "image-alt", level: "tip", title: "部分图片缺少说明", detail: "补充简短图片说明，有助于无障碍阅读和内容管理。", fixable: false });
  if (wordCount > 1200 && !/!\[[^\]]*]\(https?:\/\//i.test(content)) add({ id: "no-image", level: "tip", title: "长文缺少正文配图", detail: "可在关键章节加入图表、架构图或对比图，降低阅读疲劳。", fixable: false });

  const ending = prose.slice(-350);
  if (wordCount > 500 && !/(关注|留言|评论|转发|分享|收藏|点赞|在看)/.test(ending)) {
    add({ id: "cta", level: "tip", title: "结尾缺少互动引导", detail: "可以邀请读者留言、收藏或关注，提升文章互动率。", fixable: false });
  }

  const deductions = { error: 14, warning: 8, tip: 3 } as const;
  const score = Math.max(0, 100 - issues.reduce((total, issue) => total + deductions[issue.level], 0));
  return { score, label: score >= 90 ? "发布状态优秀" : score >= 75 ? "可以发布，建议优化" : "发布前需要处理", issues, passed: 8 - Math.min(8, issues.length) };
}

export function autoFixMarkdown(source: string) {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let inFence = false;

  for (const original of lines) {
    if (/^\s*```/.test(original)) {
      if (!inFence && output.length && output.at(-1) !== "") output.push("");
      output.push(original.trimEnd());
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      output.push(original);
      continue;
    }

    const prefix = original.match(/^\s*/)?.[0] ?? "";
    let line = original.slice(prefix.length).replace(/\u3000/g, " ").replace(/[ \t]{2,}/g, " ").replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/gu, "$1").trimEnd();
    line = line.split(/(`[^`]*`)/g).map((part) => part.startsWith("`") ? part : part
      .replace(/\s+([，。！？；：、）》】])/g, "$1")
      .replace(/([（《【])\s+/g, "$1")
      .replace(/([\u3400-\u9fff])([A-Za-z0-9])/gu, "$1 $2")
      .replace(/([A-Za-z0-9])([\u3400-\u9fff])/gu, "$1 $2"))
      .join("");
    line = `${prefix}${line}`.trimEnd();

    const needsAir = /^(#{1,6})\s+/.test(line);
    if (needsAir && output.length && output.at(-1) !== "") output.push("");
    if (line && output.length && /^(#{1,6})\s+/.test(output.at(-1) ?? "")) output.push("");
    if (line || output.at(-1) !== "" || output.at(-2) !== "") output.push(line);
  }

  return output.join("\n").trim();
}

export function normalizeEditorialText(value: string) {
  return value
    .replace(/\u3000/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/gu, "$1")
    .replace(/([\u3400-\u9fff])([A-Za-z0-9])/gu, "$1 $2")
    .replace(/([A-Za-z0-9])([\u3400-\u9fff])/gu, "$1 $2")
    .replace(/\s+([，。！？；：、])/g, "$1")
    .trim();
}
