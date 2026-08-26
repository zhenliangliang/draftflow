import { generateStructured, getAIStatus } from "@/lib/ai";
import { listRadarArticles, listRecommendations, saveRecommendations } from "@/lib/radar";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

type AIRecommendations = { recommendations: Array<{ title: string; angle: string; audience: string; outline: string[]; keywords: string[]; predictedScore: number }> };

export async function GET() {
  try { return Response.json({ ok: true, ai: await getAIStatus(), recommendations: await listRecommendations() }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ articleIds?: string[]; topic?: string }>();
    const all = await listRadarArticles();
    const selected = (body.articleIds?.length ? all.filter((article) => body.articleIds?.includes(article.id)) : all.slice(0, 5)).slice(0, 8);
    if (!selected.length) return Response.json({ ok: false, error: "请先导入至少一篇参考文章" }, { status: 400 });
    if (!(await getAIStatus()).configured) {
      const topic = body.topic?.trim() || selected[0].title.replace(/[：:｜|].*$/, "");
      const fallback = [
        { title: `${topic}：从概念到落地的完整实践路径`, angle: "避开简单资讯复述，聚焦读者可以执行的步骤、取舍和检查清单。", audience: "准备落地相关方案的技术负责人", outline: ["为什么现在值得关注", "落地前的关键判断", "分阶段实施路径", "常见失败原因", "行动检查清单"], keywords: ["实践", "选型", "落地", "避坑"], predictedScore: 78 },
        { title: `${topic}横评：真正拉开差距的 5 个关键指标`, angle: "把热门文章中的共同关注点转化为透明的对比框架，加入自己的判断标准。", audience: "正在做技术选型的工程团队", outline: ["明确比较边界", "五个关键指标", "不同团队的选择建议", "成本与风险", "结论"], keywords: ["横评", "指标", "成本", "决策"], predictedScore: 82 },
        { title: `别急着上${topic}：先回答这 7 个问题`, angle: "用反共识和问题清单建立标题吸引力，同时保持专业、可验证。", audience: "对热门方案感兴趣但缺少评估框架的读者", outline: ["热度背后的真实需求", "七个前置问题", "适用与不适用场景", "最小验证方案", "下一步行动"], keywords: ["反共识", "清单", "验证", "场景"], predictedScore: 85 },
      ];
      await saveRecommendations(fallback, selected.map((article) => article.id));
      return Response.json({ ok: true, mode: "rules", recommendations: await listRecommendations() });
    }
    const sourceText = selected.map((article, index) => `参考 ${index + 1}\n公众号：${article.source_name}\n标题：${article.title}\n摘要：${article.digest}\n正文摘录：${article.content_excerpt.slice(0, 2200)}\n预测热度：${article.hot_score}`).join("\n\n");
    const result = await generateStructured<AIRecommendations>({
      schemaName: "draftflow_content_recommendations",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          recommendations: { type: "array", minItems: 3, maxItems: 5, items: { type: "object", additionalProperties: false, properties: {
            title: { type: "string" }, angle: { type: "string" }, audience: { type: "string" },
            outline: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } },
            keywords: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } },
            predictedScore: { type: "integer", minimum: 1, maximum: 99 },
          }, required: ["title", "angle", "audience", "outline", "keywords", "predictedScore"] } },
        },
        required: ["recommendations"],
      },
      instructions: "你是微信公众号选题分析师。分析共同主题、读者需求、标题机制和内容结构，生成原创选题。不得复刻原文表达、独特案例、数据或段落，不得冒充来源作者。输出必须适合中文技术类公众号。",
      prompt: `用户关注方向：${body.topic?.trim() || "技术、AI 与运维"}\n\n${sourceText}`,
    });
    await saveRecommendations(result.recommendations, selected.map((article) => article.id));
    return Response.json({ ok: true, recommendations: await listRecommendations() });
  } catch (error) { return errorResponse(error); }
}
