"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auditArticle, autoFixMarkdown, autoFixTitle, normalizeEditorialText } from "@/lib/format-audit";
import { findLocalMarkdownImages, markdownToWechatHtml } from "@/lib/markdown";
import { RadarView } from "./RadarView";

export type ProductViewKey = "content" | "editor" | "radar" | "themes" | "account";

export type ImportedMarkdownDraft = {
  id: string;
  title: string;
  content: string;
  author?: string;
  digest?: string;
  fileName: string;
};

const sampleMarkdown = `## 为什么需要一套内容工作台？

公众号写作不只是“写完一篇文章”。从素材整理、结构编辑，到样式适配、图片上传和草稿同步，重复操作消耗了大量时间。

### 把创作和发布连成一条线

稿流把 Markdown 编辑、主题排版和公众号草稿箱连接在一起。你可以专注内容，样式和格式交给系统处理。

> 好的工具不会替你表达，但会让表达更顺畅。

### 发布前检查

- 标题和摘要是否完整
- 封面图比例是否正确
- 正文图片是否已经上传
- 手机端预览是否清晰`;

const allArticles = [
  { title: "AI 运维平台选型：从能力到落地", excerpt: "从部署成本、扩展能力和可观测性出发，对主流方案进行横向比较。", status: "待同步", tone: "amber", theme: "极简绿", updated: "今天 10:24", words: "2,846" },
  { title: "把复杂技术写得更清楚的 7 个方法", excerpt: "面向技术作者的结构化表达方法，以及可直接复用的检查清单。", status: "编辑中", tone: "blue", theme: "纸间白", updated: "昨天 18:10", words: "1,920" },
  { title: "每周技术观察 Vol. 08", excerpt: "本周值得关注的 AI 工程、开源工具与开发者产品动态。", status: "已同步", tone: "green", theme: "墨色", updated: "8 月 24 日", words: "3,214" },
  { title: "从零搭建企业知识库", excerpt: "知识采集、分块、索引和权限治理的完整落地路径。", status: "已同步", tone: "green", theme: "科技蓝", updated: "8 月 20 日", words: "4,106" },
];

const themes = [
  { id: "minimal", name: "极简绿", tag: "当前使用", color: "#174d3a", bg: "#f7fbf5", desc: "克制、清晰，适合技术与商业内容" },
  { id: "paper", name: "纸间白", tag: "阅读友好", color: "#745d43", bg: "#fbf7ef", desc: "温暖纸张质感，适合长篇阅读" },
  { id: "ink", name: "墨色", tag: "专业", color: "#20272b", bg: "#f2f3f3", desc: "高对比黑白，强调观点和结构" },
  { id: "tech", name: "科技蓝", tag: "理性", color: "#285d87", bg: "#f0f7fb", desc: "冷静理性，适合数据与产品内容" },
  { id: "sunset", name: "暖橙", tag: "活力", color: "#a14f2a", bg: "#fff5ed", desc: "醒目有温度，适合品牌和活动内容" },
  { id: "editorial", name: "编辑部", tag: "杂志感", color: "#6b3150", bg: "#faf2f6", desc: "更强的视觉节奏和栏目感" },
];

async function readApi<T>(response: Response): Promise<T> {
  let data: T & { error?: string };
  try {
    data = await response.json() as T & { error?: string };
  } catch {
    if (response.status === 413) throw new Error("上传内容超过服务限制，请让系统压缩封面后再试");
    throw new Error(`服务响应异常（HTTP ${response.status}），请稍后重试`);
  }
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function optimizeCoverImage(file: File) {
  const targetBytes = 700 * 1024;
  const wechatLimitBytes = 2 * 1024 * 1024;
  if (file.size <= targetBytes) return file;
  if (typeof createImageBitmap !== "function") throw new Error("当前浏览器无法自动优化封面，请将图片压缩到 700KB 以内");
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  let width = Math.max(1, Math.round(bitmap.width * scale));
  let height = Math.max(1, Math.round(bitmap.height * scale));
  let smallestBlob: Blob | null = null;

  try {
    for (let resizeAttempt = 0; resizeAttempt < 6; resizeAttempt += 1) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("封面图片处理失败，请更换图片后重试");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56, 0.48]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!blob) continue;
        if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
        if (blob.size <= targetBytes) return new File([blob], "draft-cover.jpg", { type: "image/jpeg" });
      }

      width = Math.max(480, Math.round(width * 0.82));
      height = Math.max(270, Math.round(height * 0.82));
    }
  } finally {
    bitmap.close();
  }

  if (smallestBlob && smallestBlob.size <= wechatLimitBytes) {
    return new File([smallestBlob], "draft-cover.jpg", { type: "image/jpeg" });
  }
  throw new Error("封面自动优化后仍超过 2MB，请换一张尺寸更小的图片");
}

export function ProductView({ active, onNavigate, importedDraft, onImportMarkdown, onUseGeneratedDraft }: { active: ProductViewKey; onNavigate: (view: ProductViewKey) => void; importedDraft: ImportedMarkdownDraft | null; onImportMarkdown: () => void; onUseGeneratedDraft: (draft: ImportedMarkdownDraft) => void }) {
  if (active === "content") return <ContentView onEdit={() => onNavigate("editor")} />;
  if (active === "radar") return <RadarView onUseDraft={onUseGeneratedDraft} />;
  if (active === "themes") return <ThemesView onUse={() => onNavigate("editor")} />;
  if (active === "account") return <AccountView />;
  return <EditorView key={importedDraft?.id ?? "blank"} importedDraft={importedDraft} onImportMarkdown={onImportMarkdown} />;
}

function ViewHeading({ kicker, title, description, action }: { kicker?: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="view-heading"><div>{kicker && <p>{kicker}</p>}<h1>{title}</h1><span>{description}</span></div>{action}</div>;
}

function ContentView({ onEdit }: { onEdit: () => void }) {
  const [filter, setFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const shown = allArticles.filter((article) => (filter === "全部" || article.status === filter) && article.title.toLowerCase().includes(query.toLowerCase()));
  return <div className="product-view">
    <ViewHeading kicker="CONTENT LIBRARY" title="内容" description="管理文章、编辑状态和公众号同步记录。" action={<button className="primary-btn" onClick={onEdit}>＋ 新建文章</button>} />
    <div className="content-toolbar panel"><div className="filter-tabs">{["全部", "编辑中", "待同步", "已同步"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索内容" /></label></div>
    <section className="content-table panel">
      <div className="table-head"><span>文章</span><span>主题</span><span>状态</span><span>更新时间</span><span /></div>
      {shown.map((article, index) => <button className="table-row" key={article.title} onClick={onEdit}>
        <span className="table-title"><i className={`cover cover-${(index % 3) + 1}`}>{index === 0 ? "AI" : `0${index + 1}`}</i><span><strong>{article.title}</strong><small>{article.excerpt}</small><em>{article.words} 字</em></span></span>
        <span className="theme-pill">{article.theme}</span><span><i className={`status ${article.tone}`}><i />{article.status}</i></span><span className="table-date">{article.updated}</span><b>···</b>
      </button>)}
      {!shown.length && <div className="empty-state">没有找到匹配的内容</div>}
    </section>
  </div>;
}

function EditorView({ importedDraft, onImportMarkdown }: { importedDraft: ImportedMarkdownDraft | null; onImportMarkdown: () => void }) {
  const [title, setTitle] = useState(importedDraft?.title || "为什么内容团队需要一套公众号工作台？");
  const [content, setContent] = useState(importedDraft?.content || sampleMarkdown);
  const [theme, setTheme] = useState("minimal");
  const [showSync, setShowSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [accountName, setAccountName] = useState("尚未连接公众号");
  const [author, setAuthor] = useState(importedDraft?.author || "编辑部");
  const [digest, setDigest] = useState(importedDraft?.digest || "公众号内容工作台如何把创作、排版和草稿同步连成一条完整工作流。");
  const [sourceUrl, setSourceUrl] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [coverNote, setCoverNote] = useState("");
  const [syncError, setSyncError] = useState("");
  const [draftMediaId, setDraftMediaId] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [auditNotice, setAuditNotice] = useState("");
  const [aiStatus, setAIStatus] = useState<{ configured: boolean; provider: string; model: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyImageInputRef = useRef<HTMLInputElement>(null);
  const currentTheme = themes.find((item) => item.id === theme) ?? themes[0];
  const words = useMemo(() => content.replace(/[#>*\-\s]/g, "").length, [content]);
  const renderedHtml = useMemo(() => markdownToWechatHtml(content, currentTheme), [content, currentTheme]);
  const localImages = useMemo(() => findLocalMarkdownImages(content), [content]);
  const audit = useMemo(() => auditArticle({ title, content, digest }), [title, content, digest]);

  async function loadAIStatus() {
    try {
      const result = await readApi<{ ai: { configured: boolean; provider: string; model: string } }>(await fetch("/api/ai/config", { cache: "no-store" }));
      setAIStatus(result.ai);
    } catch {
      setAIStatus({ configured: false, provider: "", model: "" });
    }
  }

  useEffect(() => {
    fetch("/api/wechat/config")
      .then((response) => readApi<{ configured: boolean; account: { name: string; defaultAuthor: string } | null }>(response))
      .then((data) => {
        if (data.account) {
          setAccountName(data.account.name);
          if (!importedDraft?.author) setAuthor(data.account.defaultAuthor || "编辑部");
        }
      })
      .catch(() => undefined);
  }, [importedDraft?.author]);

  async function startSync() {
    setSyncError("");
    if (!cover) {
      setSyncError("请选择一张封面图片后再发送");
      return;
    }
    if (cover.size > 2 * 1024 * 1024) {
      setSyncError("封面图片超过 2MB，请压缩后重新选择");
      return;
    }
    setSyncing(true);
    try {
      let coverResult: { mediaId: string };
      try {
        const coverBody = new FormData();
        coverBody.append("cover", cover, cover.name);
        coverResult = await readApi<{ mediaId: string }>(await fetch("/api/wechat/cover", { method: "POST", body: coverBody }));
      } catch (error) {
        throw new Error(`封面上传失败：${error instanceof Error ? error.message : "请重新选择图片"}`);
      }

      let draftResult: { mediaId: string };
      try {
        draftResult = await readApi<{ mediaId: string }>(await fetch("/api/wechat/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            author,
            digest,
            content: renderedHtml,
            contentSourceUrl: sourceUrl,
            thumbMediaId: coverResult.mediaId,
            openComment: false,
            fansOnlyComment: false,
          }),
        }));
      } catch (error) {
        throw new Error(`草稿创建失败：${error instanceof Error ? error.message : "请稍后重试"}`);
      }
      setDraftMediaId(draftResult.mediaId);
      setSynced(true);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "发送到草稿箱失败");
    } finally {
      setSyncing(false);
    }
  }

  function applyFormatFixes() {
    setContent((value) => autoFixMarkdown(value));
    setTitle((value) => autoFixTitle(value));
    setDigest((value) => normalizeEditorialText(value));
    setAuditNotice("已精简过长标题、修正标题层级与异常间距；正文观点未被改写。");
  }

  async function selectCover(file: File | null) {
    setSyncError("");
    setCoverNote("");
    if (!file) {
      setCover(null);
      return;
    }
    try {
      const optimized = await optimizeCoverImage(file);
      setCover(optimized);
      setCoverNote(optimized !== file
        ? `已自动优化为 ${Math.round(optimized.size / 1024)}KB，可安全上传`
        : `${Math.round(optimized.size / 1024)}KB，已通过上传检查`);
    } catch (error) {
      setCover(null);
      setSyncError(error instanceof Error ? error.message : "封面图片处理失败");
    }
  }

  async function uploadBodyImage(file: File | null) {
    if (!file) return;
    setImageUploading(true);
    setEditorError("");
    try {
      const body = new FormData();
      body.append("image", file);
      const result = await readApi<{ url: string }>(await fetch("/api/wechat/image", { method: "POST", body }));
      const editor = textareaRef.current;
      const start = editor?.selectionStart ?? content.length;
      const end = editor?.selectionEnd ?? start;
      const markdown = `\n\n![${file.name.replace(/\.[^.]+$/, "") || "正文图片"}](${result.url})\n\n`;
      setContent((value) => `${value.slice(0, start)}${markdown}${value.slice(end)}`);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "正文图片上传失败");
    } finally {
      setImageUploading(false);
      if (bodyImageInputRef.current) bodyImageInputRef.current.value = "";
    }
  }

  return <div className="editor-view">
    <div className="editor-toolbar">
      <div><span className="save-dot" />已自动保存 <b>·</b> {words} 字</div>
      <div><button className="secondary-btn" onClick={onImportMarkdown}>导入 MD</button><button className="audit-btn" onClick={() => { setAuditNotice(""); setAIStatus(null); setShowAudit(true); void loadAIStatus(); }}><span>✦</span> 智能审核 <i>{audit.score}</i></button><button className="sync-btn" onClick={() => setShowSync(true)}>同步到草稿箱 <span>→</span></button></div>
    </div>
    <div className="editor-grid">
      <section className="writing-pane">
        <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="文章标题" />
        <div className="format-bar"><button>H1</button><button>H2</button><button><b>B</b></button><button><i>I</i></button><button>“ ”</button><button>— 列表</button><button>链接</button><button onClick={() => bodyImageInputRef.current?.click()} disabled={imageUploading}>{imageUploading ? "上传中" : "图片"}</button><input ref={bodyImageInputRef} className="hidden-file" type="file" accept="image/jpeg,image/png" onChange={(event) => void uploadBodyImage(event.target.files?.[0] ?? null)} /><span /><small>Markdown</small></div>
        {importedDraft && <div className="import-notice success">已导入 <strong>{importedDraft.fileName}</strong>，标题和 Markdown 正文已自动识别。</div>}
        {localImages.length > 0 && <div className="import-notice warning">检测到 {localImages.length} 张本地图片。浏览器无法直接读取 MD 文件旁的图片，请点击上方“图片”逐张上传并替换。</div>}
        {editorError && <div className="editor-error">{editorError}</div>}
        <textarea ref={textareaRef} value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} aria-label="Markdown 编辑器" />
      </section>
      <aside className="preview-pane">
        <div className="preview-head"><div><strong>手机预览</strong><small>实际效果以微信客户端为准</small></div><select value={theme} onChange={(event) => setTheme(event.target.value)}>{themes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
        <div className="phone-frame"><div className="phone-top"><b>9:41</b><span>● ⌁ ▰</span></div><div className="wechat-bar">‹ <strong>预览</strong> ···</div><article className="wechat-article" style={{ "--theme-color": currentTheme.color, "--theme-bg": currentTheme.bg } as React.CSSProperties}><h1>{title || "未命名文章"}</h1><div className="article-meta">示例公众号 · 2026年8月26日</div><div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderedHtml }} /></article></div>
      </aside>
    </div>
    {showSync && <div className="modal-backdrop"><div className="modal-card sync-modal">
      {!synced ? <><button className="modal-close" onClick={() => setShowSync(false)}>×</button><span className="modal-symbol">微</span><p className="modal-kicker">WECHAT DRAFT</p><h2>{syncing ? "正在发送到草稿箱" : "发送前确认"}</h2><p>{syncing ? "正在上传封面和文章内容，请勿关闭页面。" : `文章将以当前主题排版真实同步到“${accountName}”的草稿箱。`}</p><div className="draft-fields"><label>封面图片 <small>JPG / PNG / GIF / BMP，上传前自动优化，微信限制 2MB</small><input type="file" accept="image/jpeg,image/png,image/gif,image/bmp" onChange={(event) => void selectCover(event.target.files?.[0] ?? null)} />{coverNote && <small className="cover-note">✓ {coverNote}</small>}</label><div><label>作者<input value={author} maxLength={16} onChange={(event) => setAuthor(event.target.value)} /></label><label>原文链接<input value={sourceUrl} type="url" placeholder="可选" onChange={(event) => setSourceUrl(event.target.value)} /></label></div><label>摘要<textarea value={digest} maxLength={128} onChange={(event) => setDigest(event.target.value)} /></label></div><div className="sync-summary"><span><small>目标公众号</small><strong>{accountName}</strong></span><span><small>排版主题</small><strong>{currentTheme.name}</strong></span><span><small>智能审核</small><strong className={audit.score >= 75 ? "ok" : "needs-work"}>{audit.score} 分 · {audit.score >= 75 ? "可发布" : "待优化"}</strong></span></div>{syncError && <div className="form-error">{syncError}</div>}{syncing ? <div className="sync-progress"><i /></div> : <button className="sync-confirm" onClick={startSync}>确认并发送到草稿箱</button>}</> : <div className="sync-success"><span>✓</span><p className="modal-kicker">SYNC COMPLETE</p><h2>已发送到草稿箱</h2><p>草稿 Media ID：{draftMediaId.slice(0, 10)}…<br />请前往微信公众号后台进行最终预览和群发。</p><button className="sync-confirm" onClick={() => { setShowSync(false); setSynced(false); setDraftMediaId(""); }}>完成</button></div>}
    </div></div>}
    {showAudit && <div className="modal-backdrop"><div className="modal-card audit-modal"><button className="modal-close" onClick={() => setShowAudit(false)}>×</button><p className="modal-kicker">SMART FORMAT REVIEW</p><div className="audit-hero"><span className={audit.score >= 90 ? "excellent" : audit.score >= 75 ? "good" : "weak"}>{audit.score}</span><div><h2>智能格式审核</h2><p>{audit.label} · 已检查标题、摘要、结构、段落、图片和互动引导。</p></div></div>{auditNotice && <div className="audit-notice">✓ {auditNotice}</div>}<div className="audit-list">{audit.issues.length ? audit.issues.map((issue) => <article key={issue.id} className={`audit-issue ${issue.level}`}><span>{issue.level === "error" ? "!" : issue.level === "warning" ? "•" : "i"}</span><div><strong>{issue.title}</strong><p>{issue.detail}</p></div>{issue.fixable && <em>可自动修复</em>}</article>) : <div className="audit-perfect"><span>✓</span><strong>格式状态优秀</strong><p>当前没有发现影响发布和手机阅读的问题。</p></div>}</div><div className={`ai-review-note ${aiStatus?.configured ? "connected" : ""}`}><span>AI</span><div><strong>AI 内容增强</strong><p>{!aiStatus ? "正在读取内容雷达中的 AI 配置…" : aiStatus.configured ? `已连接 ${aiStatus.provider === "litellm" ? "LiteLLM" : "OpenAI 兼容接口"} · ${aiStatus.model}，可用于标题钩子、开场摘要和结尾互动建议。` : "尚未连接模型，请先在内容雷达中完成 AI 配置。当前规则审核不会把文章上传给第三方。"}</p></div><b className={aiStatus?.configured ? "ok" : ""}>{!aiStatus ? "检测中" : aiStatus.configured ? "已连接" : "待配置"}</b></div><div className="audit-actions"><button className="secondary-btn" onClick={() => setShowAudit(false)}>返回编辑</button><button className="sync-confirm" disabled={!audit.issues.some((issue) => issue.fixable)} onClick={applyFormatFixes}>一键修复格式问题</button></div></div></div>}
  </div>;
}

function ThemesView({ onUse }: { onUse: () => void }) {
  const [selected, setSelected] = useState("minimal");
  return <div className="product-view">
    <ViewHeading kicker="STYLE SYSTEM" title="主题样式" description="一键应用排版主题，所有样式均针对微信正文兼容性优化。" action={<button className="secondary-btn">＋ 自定义主题</button>} />
    <div className="theme-grid">{themes.map((theme) => <article key={theme.id} className={`theme-card ${selected === theme.id ? "selected" : ""}`}>
      <button type="button" className="theme-preview" onClick={() => setSelected(theme.id)} style={{ "--sample": theme.color, "--sample-bg": theme.bg } as React.CSSProperties}><span /><h3>让内容更有力量</h3><p>清晰的结构，让每一次表达都更准确、更有节奏。</p><h4>01 核心观点</h4><i /><i /></button>
      <div className="theme-info"><div><strong>{theme.name}</strong><span>{theme.tag}</span></div><p>{theme.desc}</p><button onClick={(event) => { event.stopPropagation(); setSelected(theme.id); onUse(); }}>应用到文章</button></div>
      {selected === theme.id && <b className="selected-check">✓</b>}
    </article>)}</div>
  </div>;
}

function AccountView() {
  type SafeAccount = { id: string; name: string; appIdMasked: string; defaultAuthor: string; updatedAt: string; active: boolean };
  const [showConnect, setShowConnect] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [formError, setFormError] = useState("");
  const [account, setAccount] = useState<SafeAccount | null>(null);
  const [accounts, setAccounts] = useState<SafeAccount[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [name, setName] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [defaultAuthor, setDefaultAuthor] = useState("编辑部");

  async function loadAccounts() {
    const config = await readApi<{ configured: boolean; account: SafeAccount | null; accounts: SafeAccount[] }>(await fetch("/api/wechat/config"));
    setConnected(config.configured);
    setAccount(config.account);
    setAccounts(config.accounts ?? (config.account ? [config.account] : []));
    if (config.account) {
      setName(config.account.name);
      setDefaultAuthor(config.account.defaultAuthor);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/wechat/config").then((response) => readApi<{ configured: boolean; account: SafeAccount | null; accounts: SafeAccount[] }>(response)),
      fetch("/api/wechat/history").then((response) => readApi<{ records: unknown[] }>(response)),
    ]).then(([config, history]) => {
      if (cancelled) return;
      setConnected(config.configured);
      setAccount(config.account);
      setAccounts(config.accounts ?? (config.account ? [config.account] : []));
      setHistoryCount(history.records.length);
      if (config.account) {
        setName(config.account.name);
        setDefaultAuthor(config.account.defaultAuthor);
      }
    }).catch((error: unknown) => {
      if (!cancelled) setFormError(error instanceof Error ? error.message : "无法读取公众号配置");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function connectAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnecting(true);
    setFormError("");
    try {
      const result = await readApi<{ configured: boolean; account: NonNullable<typeof account> }>(await fetch("/api/wechat/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, appId, appSecret, defaultAuthor }),
      }));
      setConnected(result.configured);
      setAccount(result.account);
      setAppSecret("");
      setShowConnect(false);
      await loadAccounts();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "连接失败");
    } finally {
      setConnecting(false);
    }
  }

  async function switchAccount(accountId: string) {
    setFormError("");
    try {
      const result = await readApi<{ account: SafeAccount }>(await fetch("/api/wechat/config", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) }));
      setAccount(result.account);
      setAccounts((items) => items.map((item) => ({ ...item, active: item.id === accountId })));
      setName(result.account.name);
      setDefaultAuthor(result.account.defaultAuthor);
    } catch (error) { setFormError(error instanceof Error ? error.message : "公众号切换失败"); }
  }

  function openNewAccount() {
    setName(""); setAppId(""); setAppSecret(""); setDefaultAuthor("编辑部"); setFormError(""); setShowConnect(true);
  }

  return <div className="product-view">
    <ViewHeading kicker="WECHAT ACCOUNTS" title="公众号" description="最多绑定 5 个公众号，切换当前账号后，草稿会发送到对应后台。" action={<button className="primary-btn" disabled={accounts.length >= 5} onClick={openNewAccount}>{accounts.length >= 5 ? "已达 5 个上限" : "＋ 连接公众号"}</button>} />
    {accounts.length > 0 && <section className="panel account-switcher"><div className="section-head"><div><h3>已绑定公众号</h3><p>{accounts.length} / 5 · 点击切换当前草稿目标</p></div></div><div className="account-switcher-list">{accounts.map((item) => <button key={item.id} className={item.active ? "active" : ""} onClick={() => void switchAccount(item.id)}><span>微</span><div><strong>{item.name}</strong><small>{item.appIdMasked}</small></div>{item.active ? <b>当前账号</b> : <i>切换</i>}</button>)}</div></section>}
    {loading ? <div className="account-empty panel">正在读取本地安全配置…</div> : connected && account ? <section className="account-overview panel"><div className="account-avatar">微</div><div className="account-detail"><span className="status green"><i />最近验证正常</span><h2>{account.name}</h2><p>已连接 <span>AppID: {account.appIdMasked}</span></p></div><div className="account-stats"><span><small>同步记录</small><strong>{historyCount}</strong></span><span><small>默认作者</small><strong>{account.defaultAuthor}</strong></span><span><small>凭证状态</small><strong className="ok">已加密</strong></span></div><button className="more-btn">···</button></section> : <section className="account-empty panel"><span>微</span><h2>尚未连接公众号</h2><p>连接后即可上传封面并将排版好的文章发送到真实草稿箱。</p><button className="primary-btn" onClick={() => setShowConnect(true)}>立即连接</button></section>}
    <div className="account-grid"><section className="panel account-section"><div className="section-head"><div><h3>能力与权限</h3><p>连接时会调用微信接口进行真实检测</p></div><button onClick={() => { if (account) { setName(account.name); setDefaultAuthor(account.defaultAuthor); setAppId(""); setAppSecret(""); setShowConnect(true); } }}>更新当前凭证</button></div>{["获取稳定接口凭证", "上传永久封面素材", "新建公众号草稿", "记录同步结果"].map((item) => <div className="permission-row" key={item}><span>{connected ? "✓" : "○"}</span><strong>{item}</strong><small>{connected ? "已就绪" : "待连接"}</small></div>)}</section><section className="panel account-section"><div className="section-head"><div><h3>安全设置</h3><p>凭证与网络访问保护</p></div></div><div className="security-callout"><span>锁</span><p><strong>AppSecret 使用 AES-256-GCM 加密</strong><small>完整密钥不会回显；微信请求仅从本地服务端发出。</small></p></div><div className="setting-row"><span><strong>IP 白名单</strong><small>需在微信后台添加当前公网出口 IP</small></span><b className={connected ? "ok" : ""}>{connected ? "验证通过" : "待配置"}</b></div><div className="setting-row"><span><strong>发布保护</strong><small>目前只发送草稿，不自动群发</small></span><button className="switch on" aria-label="发布保护已开启"><i /></button></div></section></div>
    {formError && !showConnect && <div className="page-error">{formError}</div>}
    {showConnect && <div className="modal-backdrop"><form className="modal-card connect-modal" onSubmit={connectAccount}><button type="button" className="modal-close" onClick={() => setShowConnect(false)}>×</button><p className="modal-kicker">CONNECT ACCOUNT</p><h2>连接微信公众号</h2><p>保存前会直接调用微信稳定 Token 接口验证 AppID、AppSecret 和 IP 白名单。</p><label>公众号名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：品牌内容中心" required /></label><label>AppID<input value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="wx 开头的字符串" required /></label><label>AppSecret<input value={appSecret} onChange={(event) => setAppSecret(event.target.value)} type="password" placeholder="粘贴后将加密保存" required /></label><label>默认作者<input value={defaultAuthor} onChange={(event) => setDefaultAuthor(event.target.value)} maxLength={16} required /></label><div className="form-note">每个账号都会单独验证并加密保存，最多可绑定 5 个公众号。</div>{formError && <div className="form-error">{formError}</div>}<button className="sync-confirm" type="submit" disabled={connecting}>{connecting ? "正在验证微信接口…" : "验证并安全保存"}</button></form></div>}
  </div>;
}
