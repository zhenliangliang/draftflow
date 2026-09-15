import { generateStructured, getAIStatus } from "@/lib/ai";
import { listRadarArticles, listStyleProfiles, saveStyleProfile } from "@/lib/radar";
import { assertSameOrigin, errorResponse } from "@/lib/wechat";

type StyleAnalysis = {
  summary: string;
  audience: string;
  contentFocus: string[];
  tone: string[];
  titlePatterns: string[];
  openingPatterns: string[];
  structurePatterns: string[];
  reasoningPatterns: string[];
  languageTraits: string[];
  pacing: string;
  endingPatterns: string[];
  doRules: string[];
  avoidRules: string[];
};

const stringArray = (minItems: number, maxItems: number) => ({
  type: "array",
  minItems,
  maxItems,
  items: { type: "string" },
});

export async function GET() {
  try { return Response.json({ ok: true, profiles: await listStyleProfiles() }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json<{ sourceId?: string; articleIds?: string[] }>();
    const all = await listRadarArticles();
    const requestedIds = new Set((body.articleIds ?? []).filter(Boolean));
    const selected = requestedIds.size
      ? all.filter((article) => requestedIds.has(article.id))
      : all.filter((article) => body.sourceId && article.source_id === body.sourceId).slice(0, 8);

    if (!selected.length) {
      return Response.json({ ok: false, error: "请先为这个公众号导入至少一篇公开文章" }, { status: 400 });
    }
    const sourceIds = [...new Set(selected.map((article) => article.source_id).filter((value): value is string => Boolean(value)))];
    const sourceNames = [...new Set(selected.map((article) => article.source_name))];
    if (sourceIds.length !== 1 || sourceNames.length !== 1) {
      return Response.json({ ok: false, error: "作者画像需要使用同一个公众号的文章，请重新选择样本" }, { status: 400 });
    }
    if (!(await getAIStatus()).configured) {
      return Response.json({ ok: false, error: "作者风格分析需要 AI 模型，请先完成 AI 配置" }, { status: 400 });
    }

    const samples = selected.slice(0, 8).map((article, index) => [
      `样本 ${index + 1}`,
      `标题：${article.title}`,
      `摘要：${article.digest || "未提供"}`,
      `正文：${article.content_excerpt.slice(0, 5200)}`,
    ].join("\n")).join("\n\n---\n\n");

    const analysis = await generateStructured<StyleAnalysis>({
      schemaName: "draftflow_author_style_profile",
      maxOutputTokens: 5000,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          audience: { type: "string" },
          contentFocus: stringArray(2, 6),
          tone: stringArray(2, 6),
          titlePatterns: stringArray(2, 6),
          openingPatterns: stringArray(2, 6),
          structurePatterns: stringArray(3, 8),
          reasoningPatterns: stringArray(2, 6),
          languageTraits: stringArray(3, 8),
          pacing: { type: "string" },
          endingPatterns: stringArray(2, 5),
          doRules: stringArray(4, 10),
          avoidRules: stringArray(3, 8),
        },
        required: [
          "summary", "audience", "contentFocus", "tone", "titlePatterns", "openingPatterns",
          "structurePatterns", "reasoningPatterns", "languageTraits", "pacing", "endingPatterns",
          "doRules", "avoidRules",
        ],
      },
      instructions: [
        "你是中文公众号写作研究员。请从多篇公开文章中提炼可复用的高层写作特征，而不是复刻作者本人。",
        "重点分析选题范围、目标读者、标题机制、开场钩子、结构推进、论证方式、句段节奏、语言习惯和结尾动作。",
        "所有结论都要具体、可执行，并根据样本证据归纳；样本不足时要使用克制表述，不能虚构作者背景或偏好。",
        "doRules 只包含可安全迁移的抽象写作规则。avoidRules 必须明确禁止复制原句、标志性口头禅、独特案例、个人经历和专有表达，也不得冒充来源作者。",
      ].join("\n"),
      prompt: `公众号：${sourceNames[0]}\n样本数量：${selected.length}\n\n${samples}`,
    });

    const profile = await saveStyleProfile({
      sourceId: sourceIds[0],
      sourceName: sourceNames[0],
      ...analysis,
    }, selected.map((article) => article.id));
    return Response.json({ ok: true, profile });
  } catch (error) { return errorResponse(error); }
}
