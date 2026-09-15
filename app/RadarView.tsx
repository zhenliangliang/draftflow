"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImportedMarkdownDraft } from "./ProductViews";

type Source = { id: string; name: string; source_type: "wechat" | "rss"; source_url?: string; enabled: number };
type Article = { id: string; source_id: string | null; source_name: string; title: string; url: string; digest: string; published_at: string | null; read_count: number; like_count: number; hot_score: number };
type Recommendation = { id: string; title: string; angle: string; audience: string; outline: string[]; keywords: string[]; predicted_score: number };
type StyleProfile = {
  id: string;
  sourceId: string;
  sourceName: string;
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
  sampleArticleIds: string[];
  sampleCount: number;
  updatedAt: string;
};
type AIProvider = "openai" | "litellm";
type AIStatus = { configured: boolean; provider: AIProvider; baseUrl: string; model: string; apiKeyMasked: string; updatedAt: string | null };

async function readApi<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function fetchRadarData() {
  const [sourceData, articleData, analysisData, profileData] = await Promise.all([
    readApi<{ sources: Source[] }>(await fetch("/api/radar/sources")),
    readApi<{ articles: Article[] }>(await fetch("/api/radar/articles")),
    readApi<{ ai: AIStatus; recommendations: Recommendation[] }>(await fetch("/api/radar/analyze")),
    readApi<{ profiles: StyleProfile[] }>(await fetch("/api/radar/profiles")),
  ]);
  return { sourceData, articleData, analysisData, profileData };
}

function articleDate(value: string | null) {
  return value ? value.slice(0, 10).replace(/-/g, "/") : "时间未识别";
}

function profileConfidence(sampleCount: number) {
  if (sampleCount >= 5) return "高置信画像";
  if (sampleCount >= 3) return "稳定画像";
  return "初步画像";
}

export function RadarView({ onUseDraft }: { onUseDraft: (draft: ImportedMarkdownDraft) => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [expandedProfileId, setExpandedProfileId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [ai, setAI] = useState<AIStatus>({ configured: false, provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", apiKeyMasked: "", updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [styleAnalyzing, setStyleAnalyzing] = useState("");
  const [generating, setGenerating] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSource, setShowSource] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<"wechat" | "rss">("wechat");
  const [sourceUrl, setSourceUrl] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [articleSource, setArticleSource] = useState("");
  const [readCount, setReadCount] = useState("");
  const [likeCount, setLikeCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiProvider, setAIProvider] = useState<AIProvider>("openai");
  const [aiBaseUrl, setAIBaseUrl] = useState("https://api.openai.com/v1");
  const [aiModel, setAIModel] = useState("gpt-5.6-luna");
  const [aiApiKey, setAIApiKey] = useState("");
  const [aiModels, setAIModels] = useState<string[]>([]);
  const [aiModelsLoading, setAIModelsLoading] = useState(false);
  const [aiSaving, setAISaving] = useState(false);
  const [aiConfigError, setAIConfigError] = useState("");
  const averageHeat = useMemo(() => articles.length ? Math.round(articles.reduce((total, item) => total + item.hot_score, 0) / articles.length) : 0, [articles]);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? null;
  const selectedArticles = articles.filter((article) => selected.includes(article.id));
  const selectedSourceIds = new Set(selectedArticles.map((article) => article.source_id).filter(Boolean));
  const canAnalyzeSelectedStyle = selectedArticles.length > 0 && selectedSourceIds.size === 1;

  function applyRadarData(data: Awaited<ReturnType<typeof fetchRadarData>>) {
    setSources(data.sourceData.sources);
    setArticles(data.articleData.articles);
    setRecommendations(data.analysisData.recommendations);
    setAI(data.analysisData.ai);
    setProfiles(data.profileData.profiles);
    setActiveProfileId((current) => data.profileData.profiles.some((profile) => profile.id === current) ? current : data.profileData.profiles[0]?.id ?? "");
  }

  async function refresh() {
    applyRadarData(await fetchRadarData());
  }

  useEffect(() => {
    let cancelled = false;
    fetchRadarData().then((data) => {
      if (!cancelled) applyRadarData(data);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "内容雷达加载失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function addSource(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await readApi(await fetch("/api/radar/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: sourceName, sourceType, sourceUrl }) }));
      setSourceName(""); setSourceUrl(""); setShowSource(false); setNotice("订阅源已添加，现在导入 2—5 篇代表文章即可建立作者画像"); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "订阅失败"); }
    finally { setSaving(false); }
  }

  async function importArticle(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const result = await readApi<{ article: { title: string; sourceId: string } }>(await fetch("/api/radar/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: articleUrl, sourceId: articleSource || undefined, readCount: Number(readCount) || 0, likeCount: Number(likeCount) || 0 }) }));
      setArticleUrl(""); setArticleSource(result.article.sourceId); setReadCount(""); setLikeCount(""); setShowImport(false); setNotice(`已导入《${result.article.title}》，可继续导入同一作者样本`); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "文章导入失败"); }
    finally { setSaving(false); }
  }

  function openAIConfig() {
    setAIProvider(ai.provider || "openai");
    setAIBaseUrl(ai.baseUrl || "https://api.openai.com/v1");
    setAIModel(ai.model || "gpt-5.6-luna");
    setAIApiKey("");
    setAIModels([]);
    setAIConfigError("");
    setShowAIConfig(true);
  }

  async function loadAIModels() {
    setAIModelsLoading(true); setAIConfigError("");
    try {
      const result = await readApi<{ models: string[] }>(await fetch("/api/ai/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: aiProvider, baseUrl: aiBaseUrl, apiKey: aiApiKey }),
      }));
      setAIModels(result.models);
      if (!result.models.includes(aiModel)) setAIModel(result.models[0] || "");
    } catch (reason) { setAIConfigError(reason instanceof Error ? reason.message : "模型列表获取失败"); }
    finally { setAIModelsLoading(false); }
  }

  async function saveAI(event: React.FormEvent) {
    event.preventDefault(); setAISaving(true); setAIConfigError(""); setError("");
    try {
      const result = await readApi<{ ai: AIStatus }>(await fetch("/api/ai/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: aiProvider, baseUrl: aiBaseUrl, model: aiModel, apiKey: aiApiKey }),
      }));
      setAI(result.ai); setAIApiKey(""); setShowAIConfig(false); setNotice("AI 已通过连接验证并加密保存");
    } catch (reason) { setAIConfigError(reason instanceof Error ? reason.message : "AI 配置保存失败"); }
    finally { setAISaving(false); }
  }

  async function analyzeStyle(sourceId?: string) {
    const requestKey = sourceId || "selected";
    if (!sourceId && !selected.length) { setError("请先选择同一个公众号的文章样本"); return; }
    if (!sourceId && !canAnalyzeSelectedStyle) { setError("作者画像只能分析同一个公众号的文章，请重新选择"); return; }
    setStyleAnalyzing(requestKey); setError(""); setNotice("");
    try {
      const result = await readApi<{ profile: StyleProfile }>(await fetch("/api/radar/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sourceId ? { sourceId } : { articleIds: selected }),
      }));
      setProfiles((current) => [result.profile, ...current.filter((profile) => profile.id !== result.profile.id)]);
      setActiveProfileId(result.profile.id);
      setExpandedProfileId(result.profile.id);
      setNotice(`已建立「${result.profile.sourceName}」写作画像，后续选题与草稿将使用该风格`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "作者风格分析失败"); }
    finally { setStyleAnalyzing(""); }
  }

  async function analyze() {
    setAnalyzing(true); setError(""); setNotice("");
    try {
      const result = await readApi<{ recommendations: Recommendation[]; mode?: string }>(await fetch("/api/radar/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ articleIds: selected, styleProfileId: activeProfileId || undefined }) }));
      setRecommendations(result.recommendations);
      setNotice(result.mode === "rules" ? "已生成基础选题；配置 AI 后可获得更深入分析" : activeProfile ? `AI 已按「${activeProfile.sourceName}」画像生成原创选题` : "AI 已完成热点归因与原创选题推荐");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "分析失败"); }
    finally { setAnalyzing(false); }
  }

  async function generate(recommendation: Recommendation) {
    setGenerating(recommendation.id); setError("");
    try {
      const result = await readApi<{ mode: string; draft: { title: string; digest: string; content: string } }>(await fetch("/api/radar/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recommendationId: recommendation.id, styleProfileId: activeProfileId || undefined }) }));
      const profileLabel = activeProfile ? ` · ${activeProfile.sourceName}风格` : "";
      onUseDraft({ id: `radar-${recommendation.id}-${result.draft.content.length}`, title: result.draft.title, digest: result.draft.digest, content: result.draft.content, fileName: result.mode === "ai" ? `AI 原创草稿${profileLabel}` : "推荐选题提纲" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "草稿生成失败"); }
    finally { setGenerating(""); }
  }

  if (loading) return <div className="product-view"><div className="radar-loading panel">正在启动内容雷达…</div></div>;

  return <div className="product-view radar-view">
    <div className="view-heading"><div><p>CONTENT INTELLIGENCE</p><h1>内容雷达</h1><span>用公开文章建立作者写作画像，让后续选题和草稿继承结构、语气与节奏。</span></div><div className="radar-heading-actions"><button className="secondary-btn" onClick={openAIConfig}>✦ 配置 AI</button><button className="secondary-btn" onClick={() => setShowSource(true)}>＋ 添加公众号</button><button className="primary-btn" onClick={() => setShowImport(true)}>导入文章链接</button></div></div>
    {error && <div className="page-error radar-message">{error}</div>}{notice && <div className="audit-notice radar-message">✓ {notice}</div>}
    <section className="radar-workflow panel"><span className="done"><b>1</b><i>导入样本</i><small>同一公众号 2—5 篇</small></span><em>→</em><span className={profiles.length ? "done" : ""}><b>2</b><i>生成作者画像</i><small>手法 · 结构 · 语言</small></span><em>→</em><span className={activeProfile ? "done" : ""}><b>3</b><i>选择画像写作</i><small>高层风格迁移</small></span></section>
    <section className="radar-metrics"><article><small>订阅源</small><strong>{sources.length}</strong><span>公众号 / RSS</span></article><article><small>文章样本</small><strong>{articles.length}</strong><span>用于作者分析</span></article><article><small>作者画像</small><strong>{profiles.length}</strong><span>{activeProfile ? `当前：${activeProfile.sourceName}` : "尚未选择"}</span></article><article><small>平均热度</small><strong>{averageHeat || "—"}</strong><span>预测评分</span></article><button type="button" className="ai-config-card" onClick={openAIConfig}><small>AI 引擎</small><strong className={ai.configured ? "ok" : "needs-work"}>{ai.configured ? "已连接" : "点击配置"}</strong><span>{ai.model || "作者画像需要 AI"} · 管理配置 →</span></button></section>
    <div className="radar-grid">
      <aside className="panel radar-sources"><div className="radar-section-head"><div><h2>公众号来源</h2><p>每个来源单独积累样本和写作画像。</p></div></div>{sources.length ? sources.map((source) => {
        const sampleCount = articles.filter((article) => article.source_id === source.id).length;
        const profile = profiles.find((item) => item.sourceId === source.id);
        return <article key={source.id} className={profile?.id === activeProfileId ? "active" : ""}><span>{source.source_type === "rss" ? "R" : "微"}</span><div><strong>{source.name}</strong><small>{sampleCount} 篇样本 · {profile ? "画像已建立" : "待分析"}</small></div>{source.source_type === "wechat" && <button disabled={!sampleCount || Boolean(styleAnalyzing)} onClick={() => void analyzeStyle(source.id)}>{styleAnalyzing === source.id ? "分析中" : profile ? "更新" : "分析"}</button>}</article>;
      }) : <div className="radar-empty-small"><strong>还没有公众号来源</strong><p>导入公开文章时系统也会自动识别。</p><button onClick={() => setShowImport(true)}>导入第一篇</button></div>}</aside>
      <section className="panel radar-articles"><div className="radar-section-head"><div><h2>文章样本池</h2><p>勾选同一公众号文章可建立画像；也可分析热点选题。</p></div><div className="radar-analysis-actions"><button className="radar-style-action" disabled={!ai.configured || !canAnalyzeSelectedStyle || Boolean(styleAnalyzing)} onClick={() => void analyzeStyle()}>{styleAnalyzing === "selected" ? "提炼画像中…" : `生成作者画像${selected.length ? `（${selected.length}）` : ""}`}</button><button className="radar-analyze" disabled={analyzing || !articles.length} onClick={analyze}>✦ {analyzing ? "分析中…" : `推荐选题${selected.length ? `（${selected.length}）` : ""}`}</button></div></div>{articles.length ? articles.map((article) => <label className="radar-article" key={article.id}><input type="checkbox" checked={selected.includes(article.id)} onChange={(event) => setSelected((value) => event.target.checked ? [...value, article.id] : value.filter((id) => id !== article.id))} /><span className={`heat-score ${article.hot_score >= 80 ? "hot" : ""}`}>{article.hot_score}</span><div><strong>{article.title}</strong><p>{article.digest || "已提取公开文章正文，等待生成作者画像。"}</p><small>{article.source_name} · {articleDate(article.published_at)}</small></div><a href={article.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>↗</a></label>) : <div className="radar-empty"><span>雷</span><h3>先导入作者的代表文章</h3><p>建议粘贴同一公众号 2—5 篇公开文章链接，样本越多，写作画像越稳定。</p><button className="primary-btn" onClick={() => setShowImport(true)}>导入第一篇文章</button></div>}</section>
    </div>
    <section className="radar-profiles"><div className="radar-section-head"><div><h2>作者写作画像</h2><p>只提炼可迁移的写作机制，不复制原句、案例、口头禅或作者身份。</p></div><span>{profiles.length ? `${profiles.length} 个可复用画像` : "等待分析"}</span></div>{profiles.length ? <div className="style-profile-grid">{profiles.map((profile) => {
      const active = profile.id === activeProfileId;
      const expanded = profile.id === expandedProfileId;
      return <article className={`style-profile-card panel ${active ? "active" : ""}`} key={profile.id}><div className="style-profile-head"><span>风</span><div><small>{profileConfidence(profile.sampleCount)} · {profile.sampleCount} 篇样本</small><h3>{profile.sourceName}</h3></div>{active && <b>写作中使用</b>}</div><p>{profile.summary}</p><div className="style-profile-tags">{[...profile.tone, ...profile.contentFocus].slice(0, 6).map((item) => <i key={item}>{item}</i>)}</div>{expanded && <div className="style-profile-details"><section><small>标题机制</small><strong>{profile.titlePatterns.join("；")}</strong></section><section><small>开场钩子</small><strong>{profile.openingPatterns.join("；")}</strong></section><section><small>结构推进</small><strong>{profile.structurePatterns.join("；")}</strong></section><section><small>论证手法</small><strong>{profile.reasoningPatterns.join("；")}</strong></section><section><small>语言与节奏</small><strong>{profile.languageTraits.join("；")}。{profile.pacing}</strong></section><section><small>结尾动作</small><strong>{profile.endingPatterns.join("；")}</strong></section><section className="wide safe"><small>建议迁移</small><strong>{profile.doRules.join("；")}</strong></section><section className="wide guard"><small>原创边界</small><strong>{profile.avoidRules.join("；")}</strong></section></div>}<div className="style-profile-actions"><button className={active ? "active" : ""} onClick={() => setActiveProfileId(active ? "" : profile.id)}>{active ? "✓ 已用于后续写作" : "用于后续写作"}</button><button onClick={() => setExpandedProfileId(expanded ? "" : profile.id)}>{expanded ? "收起画像" : "查看完整画像"}</button></div></article>;
    })}</div> : <div className="panel radar-empty-profile"><span>AI</span><div><strong>还没有作者画像</strong><p>选择同一公众号的文章样本，然后点击“生成作者画像”。建议至少 2 篇，3—5 篇效果更稳定。</p></div></div>}</section>
    <section className="radar-recommendations"><div className="radar-section-head"><div><h2>推荐选题与写作</h2><p>先选作者画像，再生成保持原创边界的新文章。</p></div><label className="radar-style-picker"><span>后续写作风格</span><select value={activeProfileId} onChange={(event) => setActiveProfileId(event.target.value)}><option value="">不使用画像 · 默认原创风格</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.sourceName} · {profile.sampleCount} 篇样本</option>)}</select></label></div>{activeProfile && <div className="active-style-banner"><span>风</span><div><strong>已启用「{activeProfile.sourceName}」写作画像</strong><p>将迁移标题机制、结构、论证和节奏；不会复刻原文或冒充作者。</p></div><button onClick={() => setActiveProfileId("")}>取消使用</button></div>}{recommendations.length ? <div className="recommendation-grid">{recommendations.map((item) => <article className="recommendation-card" key={item.id}><div className="recommendation-top"><span>预测热度 {item.predicted_score}</span><small>{item.audience}</small></div><h3>{item.title}</h3><p>{item.angle}</p><div className="keyword-row">{item.keywords.slice(0, 4).map((keyword) => <i key={keyword}>#{keyword}</i>)}</div><ol>{item.outline.slice(0, 4).map((line) => <li key={line}>{line}</li>)}</ol><button onClick={() => void generate(item)} disabled={generating === item.id}>{generating === item.id ? "正在生成原创草稿…" : ai.configured ? activeProfile ? `按「${activeProfile.sourceName}」画像写作 →` : "用 AI 生成原创草稿 →" : "生成写作提纲 →"}</button></article>)}</div> : <div className="panel radar-empty-recommendation">选择热门文章并点击“推荐选题”，系统会生成原创选题和文章提纲。</div>}</section>
    {showSource && <div className="modal-backdrop"><form className="modal-card connect-modal" onSubmit={addSource}><button type="button" className="modal-close" onClick={() => setShowSource(false)}>×</button><p className="modal-kicker">SUBSCRIBE SOURCE</p><h2>添加公众号来源</h2><p>为作者建立独立样本库和写作画像。添加后请继续导入该公众号的公开文章。</p><label>公众号名称<input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="例如：技术领导力" required /></label><label>来源类型<select value={sourceType} onChange={(event) => setSourceType(event.target.value as "wechat" | "rss")}><option value="wechat">微信公众号</option><option value="rss">RSS / 授权数据源</option></select></label>{sourceType === "rss" && <label>RSS 地址<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} type="url" placeholder="https://example.com/feed.xml" required /></label>}<div className="form-note">微信没有开放任意公众号的历史文章列表，因此使用公开文章链接作为合法样本，不抓取登录态或绕过平台限制。</div><button className="sync-confirm" disabled={saving}>{saving ? "正在添加…" : "添加并开始采样"}</button></form></div>}
    {showImport && <div className="modal-backdrop"><form className="modal-card connect-modal" onSubmit={importArticle}><button type="button" className="modal-close" onClick={() => setShowImport(false)}>×</button><p className="modal-kicker">IMPORT STYLE SAMPLE</p><h2>导入公众号文章样本</h2><p>读取公开页面的标题、正文和结构，用于分析作者的写作机制。</p><label>公开文章链接<input value={articleUrl} onChange={(event) => setArticleUrl(event.target.value)} type="url" placeholder="https://mp.weixin.qq.com/s/..." required /></label><label>归属公众号<select value={articleSource} onChange={(event) => setArticleSource(event.target.value)}><option value="">自动识别公众号</option>{sources.filter((source) => source.source_type === "wechat").map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><div className="radar-number-fields"><label>阅读量（可选）<input value={readCount} onChange={(event) => setReadCount(event.target.value)} type="number" min="0" placeholder="用于热度校准" /></label><label>点赞量（可选）<input value={likeCount} onChange={(event) => setLikeCount(event.target.value)} type="number" min="0" placeholder="用于热度校准" /></label></div><div className="form-note"><strong>画像建议</strong>：同一作者导入 2—5 篇代表文章。系统只保存分析所需文本，不会自动转载或发布原文。</div><button className="sync-confirm" disabled={saving}>{saving ? "正在读取文章…" : "导入为风格样本"}</button></form></div>}
    {showAIConfig && <div className="modal-backdrop"><form className="modal-card connect-modal ai-config-modal" onSubmit={saveAI}>
      <button type="button" className="modal-close" onClick={() => setShowAIConfig(false)}>×</button>
      <p className="modal-kicker">AI CONNECTION</p><h2>{ai.configured ? "管理 AI 配置" : "连接 AI 模型"}</h2>
      <p>支持 OpenAI 与 LiteLLM 网关。作者画像和风格写作会使用这里保存的模型。</p>
      <label>服务类型<select value={aiProvider} onChange={(event) => { const provider = event.target.value as AIProvider; setAIProvider(provider); setAIModels([]); if (provider === "openai" && !aiBaseUrl) setAIBaseUrl("https://api.openai.com/v1"); }}><option value="openai">OpenAI</option><option value="litellm">LiteLLM 网关</option></select></label>
      <label>接口地址<input value={aiBaseUrl} onChange={(event) => { setAIBaseUrl(event.target.value); setAIModels([]); }} type="url" placeholder={aiProvider === "litellm" ? "https://llm-gateway.example.com" : "https://api.openai.com/v1"} required /><small>{aiProvider === "litellm" ? "可填写网关根地址，系统会自动补全 /v1。" : "OpenAI 官方接口地址默认已包含 /v1。"}</small></label>
      <label>API Key<input value={aiApiKey} onChange={(event) => { setAIApiKey(event.target.value); setAIModels([]); }} type="password" autoComplete="new-password" placeholder={ai.configured ? "已保存；留空表示继续使用原密钥" : "sk-..."} required={!ai.configured} /></label>
      <div className="ai-model-picker"><div><strong>可用模型</strong><small>{aiModels.length ? `已获取 ${aiModels.length} 个模型` : "从网关读取当前密钥有权访问的模型"}</small></div><button type="button" className="secondary-btn" onClick={() => void loadAIModels()} disabled={aiModelsLoading}>{aiModelsLoading ? "获取中…" : "获取模型列表"}</button></div>
      {aiModels.length ? <label>选择模型<select value={aiModel} onChange={(event) => setAIModel(event.target.value)} required>{aiModels.map((model) => <option key={model} value={model}>{model}</option>)}</select></label> : <label>模型名称<input value={aiModel} onChange={(event) => setAIModel(event.target.value)} placeholder="请先获取模型列表，也可手动填写" required /></label>}
      <div className="form-note ai-security-note"><strong>安全存储</strong><span>密钥仅发送到服务端验证，使用 AES-256-GCM 加密后写入数据库；页面不会读取或显示原密钥。</span></div>
      {aiConfigError && <div className="page-error ai-config-error">{aiConfigError}</div>}
      <button className="sync-confirm" disabled={aiSaving || aiModelsLoading}>{aiSaving ? "正在验证连接…" : "验证并加密保存"}</button>
    </form></div>}
  </div>;
}
