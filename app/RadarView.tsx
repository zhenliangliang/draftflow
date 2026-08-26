"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImportedMarkdownDraft } from "./ProductViews";

type Source = { id: string; name: string; source_type: "wechat" | "rss"; source_url?: string; enabled: number };
type Article = { id: string; source_name: string; title: string; url: string; digest: string; published_at: string | null; read_count: number; like_count: number; hot_score: number };
type Recommendation = { id: string; title: string; angle: string; audience: string; outline: string[]; keywords: string[]; predicted_score: number };
type AIProvider = "openai" | "litellm";
type AIStatus = { configured: boolean; provider: AIProvider; baseUrl: string; model: string; apiKeyMasked: string; updatedAt: string | null };

async function readApi<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function fetchRadarData() {
  const [sourceData, articleData, analysisData] = await Promise.all([
    readApi<{ sources: Source[] }>(await fetch("/api/radar/sources")),
    readApi<{ articles: Article[] }>(await fetch("/api/radar/articles")),
    readApi<{ ai: AIStatus; recommendations: Recommendation[] }>(await fetch("/api/radar/analyze")),
  ]);
  return { sourceData, articleData, analysisData };
}

export function RadarView({ onUseDraft }: { onUseDraft: (draft: ImportedMarkdownDraft) => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [ai, setAI] = useState<AIStatus>({ configured: false, provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", apiKeyMasked: "", updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
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

  async function refresh() {
    const { sourceData, articleData, analysisData } = await fetchRadarData();
    setSources(sourceData.sources);
    setArticles(articleData.articles);
    setRecommendations(analysisData.recommendations);
    setAI(analysisData.ai);
  }

  useEffect(() => {
    let cancelled = false;
    fetchRadarData().then(({ sourceData, articleData, analysisData }) => {
      if (cancelled) return;
      setSources(sourceData.sources);
      setArticles(articleData.articles);
      setRecommendations(analysisData.recommendations);
      setAI(analysisData.ai);
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
      setSourceName(""); setSourceUrl(""); setShowSource(false); setNotice("订阅源已添加"); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "订阅失败"); }
    finally { setSaving(false); }
  }

  async function importArticle(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const result = await readApi<{ article: { title: string } }>(await fetch("/api/radar/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: articleUrl, sourceId: articleSource || undefined, readCount: Number(readCount) || 0, likeCount: Number(likeCount) || 0 }) }));
      setArticleUrl(""); setReadCount(""); setLikeCount(""); setShowImport(false); setNotice(`已导入《${result.article.title}》`); await refresh();
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

  async function analyze() {
    setAnalyzing(true); setError(""); setNotice("");
    try {
      const result = await readApi<{ recommendations: Recommendation[]; mode?: string }>(await fetch("/api/radar/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ articleIds: selected }) }));
      setRecommendations(result.recommendations); setNotice(result.mode === "rules" ? "已生成基础选题；配置 AI 后可获得更深入分析" : "AI 已完成热点归因与原创选题推荐");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "分析失败"); }
    finally { setAnalyzing(false); }
  }

  async function generate(recommendation: Recommendation) {
    setGenerating(recommendation.id); setError("");
    try {
      const result = await readApi<{ mode: string; draft: { title: string; digest: string; content: string } }>(await fetch("/api/radar/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recommendationId: recommendation.id }) }));
      onUseDraft({ id: `radar-${recommendation.id}-${result.draft.content.length}`, title: result.draft.title, digest: result.draft.digest, content: result.draft.content, fileName: result.mode === "ai" ? "AI 原创草稿" : "推荐选题提纲" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "草稿生成失败"); }
    finally { setGenerating(""); }
  }

  if (loading) return <div className="product-view"><div className="radar-loading panel">正在启动内容雷达…</div></div>;

  return <div className="product-view radar-view">
    <div className="view-heading"><div><p>CONTENT INTELLIGENCE</p><h1>内容雷达</h1><span>订阅优质内容源，识别热门主题，生成适合自己公众号的原创选题。</span></div><div className="radar-heading-actions"><button className="secondary-btn" onClick={openAIConfig}>✦ 配置 AI</button><button className="secondary-btn" onClick={() => setShowSource(true)}>＋ 订阅公众号</button><button className="primary-btn" onClick={() => setShowImport(true)}>导入文章链接</button></div></div>
    {error && <div className="page-error radar-message">{error}</div>}{notice && <div className="audit-notice radar-message">✓ {notice}</div>}
    <section className="radar-metrics"><article><small>订阅源</small><strong>{sources.length}</strong><span>公众号 / RSS</span></article><article><small>文章样本</small><strong>{articles.length}</strong><span>用于趋势分析</span></article><article><small>平均热度</small><strong>{averageHeat || "—"}</strong><span>预测评分</span></article><button type="button" className="ai-config-card" onClick={openAIConfig}><small>AI 引擎</small><strong className={ai.configured ? "ok" : "needs-work"}>{ai.configured ? "已连接" : "点击配置"}</strong><span>{ai.model || "本地规则可用"} · 管理配置 →</span></button></section>
    <div className="radar-grid">
      <aside className="panel radar-sources"><div className="radar-section-head"><div><h2>订阅源</h2><p>微信没有开放任意公众号文章流，建议导入公开文章链接或授权 RSS。</p></div></div>{sources.length ? sources.map((source) => <article key={source.id}><span>{source.source_type === "rss" ? "R" : "微"}</span><div><strong>{source.name}</strong><small>{source.source_type === "rss" ? "RSS 自动源" : "微信公众号"}</small></div><i /></article>) : <div className="radar-empty-small"><strong>还没有订阅源</strong><p>先添加你关注的行业公众号。</p><button onClick={() => setShowSource(true)}>添加第一个</button></div>}</aside>
      <section className="panel radar-articles"><div className="radar-section-head"><div><h2>热门文章池</h2><p>选择文章后进行主题、结构和受众需求分析。</p></div><button className="radar-analyze" disabled={analyzing || !articles.length} onClick={analyze}>✦ {analyzing ? "分析中…" : `分析${selected.length ? ` ${selected.length} 篇` : "热门文章"}`}</button></div>{articles.length ? articles.map((article) => <label className="radar-article" key={article.id}><input type="checkbox" checked={selected.includes(article.id)} onChange={(event) => setSelected((value) => event.target.checked ? [...value, article.id] : value.filter((id) => id !== article.id))} /><span className={`heat-score ${article.hot_score >= 80 ? "hot" : ""}`}>{article.hot_score}</span><div><strong>{article.title}</strong><p>{article.digest || "已提取公开文章内容，等待 AI 进行主题分析。"}</p><small>{article.source_name} · {article.published_at ? new Date(article.published_at).toLocaleDateString("zh-CN") : "时间未识别"}</small></div><a href={article.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>↗</a></label>) : <div className="radar-empty"><span>雷</span><h3>导入文章，开始发现热门选题</h3><p>粘贴公开的微信文章链接，系统会提取标题、摘要和内容结构。</p><button className="primary-btn" onClick={() => setShowImport(true)}>导入第一篇文章</button></div>}</section>
    </div>
    <section className="radar-recommendations"><div className="radar-section-head"><div><h2>推荐选题</h2><p>基于共同主题和读者需求生成，不复制原文表达。</p></div><span>{recommendations.length} 个创作机会</span></div>{recommendations.length ? <div className="recommendation-grid">{recommendations.map((item) => <article className="recommendation-card" key={item.id}><div className="recommendation-top"><span>预测热度 {item.predicted_score}</span><small>{item.audience}</small></div><h3>{item.title}</h3><p>{item.angle}</p><div className="keyword-row">{item.keywords.slice(0, 4).map((keyword) => <i key={keyword}>#{keyword}</i>)}</div><ol>{item.outline.slice(0, 4).map((line) => <li key={line}>{line}</li>)}</ol><button onClick={() => void generate(item)} disabled={generating === item.id}>{generating === item.id ? "正在生成原创草稿…" : ai.configured ? "用 AI 生成原创草稿 →" : "生成写作提纲 →"}</button></article>)}</div> : <div className="panel radar-empty-recommendation">选择热门文章并点击“分析”，系统会生成原创选题和文章提纲。</div>}</section>
    {showSource && <div className="modal-backdrop"><form className="modal-card connect-modal" onSubmit={addSource}><button type="button" className="modal-close" onClick={() => setShowSource(false)}>×</button><p className="modal-kicker">SUBSCRIBE SOURCE</p><h2>订阅内容源</h2><p>添加公众号用于分类文章，或添加你有权访问的 RSS 地址。</p><label>名称<input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="例如：技术领导力" required /></label><label>来源类型<select value={sourceType} onChange={(event) => setSourceType(event.target.value as "wechat" | "rss")}><option value="wechat">微信公众号</option><option value="rss">RSS / 授权数据源</option></select></label>{sourceType === "rss" && <label>RSS 地址<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} type="url" placeholder="https://example.com/feed.xml" required /></label>}<div className="form-note">公众号订阅用于内容分类；文章通过公开链接导入，不抓取登录态或绕过平台限制。</div><button className="sync-confirm" disabled={saving}>{saving ? "正在添加…" : "确认订阅"}</button></form></div>}
    {showImport && <div className="modal-backdrop"><form className="modal-card connect-modal" onSubmit={importArticle}><button type="button" className="modal-close" onClick={() => setShowImport(false)}>×</button><p className="modal-kicker">IMPORT PUBLIC ARTICLE</p><h2>导入公众号文章</h2><p>系统只读取公开页面，用于主题与结构分析。</p><label>文章链接<input value={articleUrl} onChange={(event) => setArticleUrl(event.target.value)} type="url" placeholder="https://mp.weixin.qq.com/s/..." required /></label><label>归属订阅源<select value={articleSource} onChange={(event) => setArticleSource(event.target.value)}><option value="">自动识别</option>{sources.filter((source) => source.source_type === "wechat").map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><div className="radar-number-fields"><label>阅读量（可选）<input value={readCount} onChange={(event) => setReadCount(event.target.value)} type="number" min="0" placeholder="用于热度校准" /></label><label>点赞量（可选）<input value={likeCount} onChange={(event) => setLikeCount(event.target.value)} type="number" min="0" placeholder="用于热度校准" /></label></div><div className="form-note">热度分为预测值；如填写公开可见的阅读和点赞数据，评分会更准确。</div><button className="sync-confirm" disabled={saving}>{saving ? "正在读取文章…" : "导入并分析基础信息"}</button></form></div>}
    {showAIConfig && <div className="modal-backdrop"><form className="modal-card connect-modal ai-config-modal" onSubmit={saveAI}>
      <button type="button" className="modal-close" onClick={() => setShowAIConfig(false)}>×</button>
      <p className="modal-kicker">AI CONNECTION</p><h2>{ai.configured ? "管理 AI 配置" : "连接 AI 模型"}</h2>
      <p>支持 OpenAI 与 LiteLLM 网关。先获取当前密钥可用的模型，再选择并保存。</p>
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
