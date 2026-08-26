import { generateStructured, getAIStatus } from "@/lib/ai";
import { getRecommendation } from "@/lib/radar";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

type GeneratedDraft = { title: string; digest: string; content: string };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ recommendationId?: string; tone?: string }>();
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
    const draft = await generateStructured<GeneratedDraft>({
      schemaName: "draftflow_original_article",
      maxOutputTokens: 6000,
      schema: { type: "object", additionalProperties: false, properties: {
        title: { type: "string" }, digest: { type: "string" }, content: { type: "string" },
      }, required: ["title", "digest", "content"] },
      instructions: "你是专业的中文技术公众号作者。根据选题和提纲创作全新文章，使用 Markdown。不得复制或近似改写任何参考文章，不得虚构数据、引用或亲身经历；需要数据的位置明确标注待核实。文章要有清晰开场、层级标题、可执行建议、总结和自然互动引导。",
      prompt: `标题：${recommendation.title}\n角度：${recommendation.angle}\n读者：${recommendation.audience}\n提纲：${JSON.stringify(recommendation.outline)}\n关键词：${JSON.stringify(recommendation.keywords)}\n语气：${body.tone?.trim() || "专业、清晰、有判断"}`,
    });
    return Response.json({ ok: true, mode: "ai", draft });
  } catch (error) { return errorResponse(error); }
}
