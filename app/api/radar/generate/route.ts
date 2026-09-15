import { generateText, getAIStatus } from "@/lib/ai";
import { formatStyleProfileForPrompt, getRecommendation, getStyleProfile } from "@/lib/radar";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ recommendationId?: string; tone?: string; styleProfileId?: string }>();
    const recommendation = await getRecommendation(body.recommendationId?.trim() ?? "");
    if (!recommendation) return Response.json({ ok: false, error: "推荐选题不存在" }, { status: 404 });
    const ai = await getAIStatus();
    if (!ai.configured) {
      const outline = recommendation.outline as string[];
      return Response.json({ ok: true, mode: "outline", draft: {
        title: String(recommendation.title),
        digest: String(recommendation.angle),
        content: outline.map((item) => `## ${item}\n\n请在这里补充原创观点、实践经验和可验证的数据。`).join("\n\n"),
      } });
    }
    const profile = await getStyleProfile(body.styleProfileId?.trim() ?? "");
    const styleText = profile
      ? `\n\n选用的写作画像：\n${formatStyleProfileForPrompt(profile)}\n请迁移这些抽象规则，但保持新文章的原创表达和当前作者身份。`
      : "";
    const markdown = await generateText({
      maxOutputTokens: 6000,
      instructions: "你是专业的中文技术公众号作者。根据选题和提纲创作全新文章，直接输出 Markdown。如提供写作画像，只能迁移语气、结构、节奏、论证方式等高层特征；不得模仿标志性表达，不得复制或近似改写任何参考文章，不得复用独特案例、数据、个人经历或口头禅，也不得冒充来源作者。不得虚构数据、引用或亲身经历；需要数据的位置明确标注待核实。文章要有清晰开场、层级标题、可执行建议、总结和自然互动引导。不要输出 JSON，不要使用 Markdown 代码围栏包裹全文。",
      prompt: `请严格使用下面的输出格式：\n# 文章标题\n> 摘要：不超过 120 字的文章摘要\n\n正文 Markdown\n\n目标标题：${recommendation.title}\n角度：${recommendation.angle}\n读者：${recommendation.audience}\n提纲：${JSON.stringify(recommendation.outline)}\n关键词：${JSON.stringify(recommendation.keywords)}\n语气：${body.tone?.trim() || "专业、清晰、有判断"}${styleText}`,
    });
    const draft = parseMarkdownDraft(markdown, String(recommendation.title), String(recommendation.angle));
    return Response.json({ ok: true, mode: "ai", draft });
  } catch (error) { return errorResponse(error); }
}

function parseMarkdownDraft(value: string, fallbackTitle: string, fallbackDigest: string) {
  const normalized = value.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
  const heading = normalized.match(/^#\s+(.+?)\s*$/m);
  const digestLine = normalized.match(/^>\s*摘要[:：]\s*(.+?)\s*$/m);
  let content = normalized;
  if (heading) content = content.replace(heading[0], "").trim();
  if (digestLine) content = content.replace(digestLine[0], "").trim();
  return {
    title: heading?.[1]?.trim() || fallbackTitle,
    digest: (digestLine?.[1]?.trim() || fallbackDigest).slice(0, 128),
    content: content || `## 正文\n\n${fallbackDigest}`,
  };
}
