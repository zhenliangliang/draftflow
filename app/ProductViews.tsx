"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ProductViewKey = "content" | "editor" | "themes" | "account";

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

function renderMarkdown(source: string) {
  return source.split("\n").map((line, index) => {
    const image = line.match(/^!\[(.*?)]\((https:\/\/[^)]+)\)$/);
    // WeChat returns a remote content-image URL that must be preserved verbatim.
    // eslint-disable-next-line @next/next/no-img-element
    if (image) return <img key={index} src={image[2]} alt={image[1] || "正文图片"} />;
    if (line.startsWith("### ")) return <h3 key={index}>{line.slice(4)}</h3>;
    if (line.startsWith("## ")) return <h2 key={index}>{line.slice(3)}</h2>;
    if (line.startsWith("> ")) return <blockquote key={index}>{line.slice(2)}</blockquote>;
    if (line.startsWith("- ")) return <li key={index}>{line.slice(2)}</li>;
    if (!line.trim()) return <br key={index} />;
    return <p key={index}>{line}</p>;
  });
}

function markdownToWechatHtml(source: string, theme: (typeof themes)[number]) {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const lines = source.split("\n").map((line) => {
    const image = line.match(/^!\[(.*?)]\((https:\/\/[^)]+)\)$/);
    if (image) return `<p style="margin:18px 0;text-align:center;"><img src="${escape(image[2])}" alt="${escape(image[1] || "正文图片")}" style="display:block;width:100%;height:auto;margin:0 auto;border-radius:4px;" /></p>`;
    if (line.startsWith("### ")) return `<h3 style="margin:24px 0 10px;color:${theme.color};font-size:18px;line-height:1.5;font-weight:700;">${escape(line.slice(4))}</h3>`;
    if (line.startsWith("## ")) return `<h2 style="margin:28px 0 14px;padding-left:12px;border-left:4px solid ${theme.color};color:${theme.color};font-size:21px;line-height:1.5;font-weight:700;">${escape(line.slice(3))}</h2>`;
    if (line.startsWith("> ")) return `<blockquote style="margin:18px 0;padding:14px 16px;border-radius:4px;color:#5c6961;background:#edf2ee;font-size:15px;line-height:1.9;">${escape(line.slice(2))}</blockquote>`;
    if (line.startsWith("- ")) return `<p style="margin:7px 0;padding-left:12px;color:#3f4943;font-size:16px;line-height:1.9;">• ${escape(line.slice(2))}</p>`;
    if (!line.trim()) return `<p style="height:8px;margin:0;"><br></p>`;
    return `<p style="margin:0 0 14px;color:#3f4943;font-size:16px;line-height:1.9;text-align:justify;">${escape(line)}</p>`;
  }).join("");
  return `<section style="padding:4px 0;background:${theme.bg};">${lines}</section>`;
}

async function readApi<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

export function ProductView({ active, onNavigate }: { active: ProductViewKey; onNavigate: (view: ProductViewKey) => void }) {
  if (active === "content") return <ContentView onEdit={() => onNavigate("editor")} />;
  if (active === "themes") return <ThemesView onUse={() => onNavigate("editor")} />;
  if (active === "account") return <AccountView />;
  return <EditorView />;
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

function EditorView() {
  const [title, setTitle] = useState("为什么内容团队需要一套公众号工作台？");
  const [content, setContent] = useState(sampleMarkdown);
  const [theme, setTheme] = useState("minimal");
  const [showSync, setShowSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [accountName, setAccountName] = useState("尚未连接公众号");
  const [author, setAuthor] = useState("编辑部");
  const [digest, setDigest] = useState("公众号内容工作台如何把创作、排版和草稿同步连成一条完整工作流。");
  const [sourceUrl, setSourceUrl] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [syncError, setSyncError] = useState("");
  const [draftMediaId, setDraftMediaId] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [editorError, setEditorError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyImageInputRef = useRef<HTMLInputElement>(null);
  const currentTheme = themes.find((item) => item.id === theme) ?? themes[0];
  const words = useMemo(() => content.replace(/[#>*\-\s]/g, "").length, [content]);

  useEffect(() => {
    fetch("/api/wechat/config")
      .then((response) => readApi<{ configured: boolean; account: { name: string; defaultAuthor: string } | null }>(response))
      .then((data) => {
        if (data.account) {
          setAccountName(data.account.name);
          setAuthor(data.account.defaultAuthor || "编辑部");
        }
      })
      .catch(() => undefined);
  }, []);

  async function startSync() {
    setSyncError("");
    if (!cover) {
      setSyncError("请选择一张封面图片后再发送");
      return;
    }
    setSyncing(true);
    try {
      const coverBody = new FormData();
      coverBody.append("cover", cover);
      const coverResult = await readApi<{ mediaId: string }>(await fetch("/api/wechat/cover", { method: "POST", body: coverBody }));
      const draftResult = await readApi<{ mediaId: string }>(await fetch("/api/wechat/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          author,
          digest,
          content: markdownToWechatHtml(content, currentTheme),
          contentSourceUrl: sourceUrl,
          thumbMediaId: coverResult.mediaId,
          openComment: false,
          fansOnlyComment: false,
        }),
      }));
      setDraftMediaId(draftResult.mediaId);
      setSynced(true);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "发送到草稿箱失败");
    } finally {
      setSyncing(false);
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
      <div><button className="secondary-btn">预览全文</button><button className="sync-btn" onClick={() => setShowSync(true)}>同步到草稿箱 <span>→</span></button></div>
    </div>
    <div className="editor-grid">
      <section className="writing-pane">
        <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="文章标题" />
        <div className="format-bar"><button>H1</button><button>H2</button><button><b>B</b></button><button><i>I</i></button><button>“ ”</button><button>— 列表</button><button>链接</button><button onClick={() => bodyImageInputRef.current?.click()} disabled={imageUploading}>{imageUploading ? "上传中" : "图片"}</button><input ref={bodyImageInputRef} className="hidden-file" type="file" accept="image/jpeg,image/png" onChange={(event) => void uploadBodyImage(event.target.files?.[0] ?? null)} /><span /><small>Markdown</small></div>
        {editorError && <div className="editor-error">{editorError}</div>}
        <textarea ref={textareaRef} value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} aria-label="Markdown 编辑器" />
      </section>
      <aside className="preview-pane">
        <div className="preview-head"><div><strong>手机预览</strong><small>实际效果以微信客户端为准</small></div><select value={theme} onChange={(event) => setTheme(event.target.value)}>{themes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
        <div className="phone-frame"><div className="phone-top"><b>9:41</b><span>● ⌁ ▰</span></div><div className="wechat-bar">‹ <strong>预览</strong> ···</div><article className="wechat-article" style={{ "--theme-color": currentTheme.color, "--theme-bg": currentTheme.bg } as React.CSSProperties}><h1>{title || "未命名文章"}</h1><div className="article-meta">示例公众号 · 2026年8月26日</div>{renderMarkdown(content)}</article></div>
      </aside>
    </div>
    {showSync && <div className="modal-backdrop"><div className="modal-card sync-modal">
      {!synced ? <><button className="modal-close" onClick={() => setShowSync(false)}>×</button><span className="modal-symbol">微</span><p className="modal-kicker">WECHAT DRAFT</p><h2>{syncing ? "正在发送到草稿箱" : "发送前确认"}</h2><p>{syncing ? "正在上传封面和文章内容，请勿关闭页面。" : `文章将以当前主题排版真实同步到“${accountName}”的草稿箱。`}</p><div className="draft-fields"><label>封面图片 <small>JPG / PNG / GIF / BMP，不超过 10MB</small><input type="file" accept="image/jpeg,image/png,image/gif,image/bmp" onChange={(event) => setCover(event.target.files?.[0] ?? null)} /></label><div><label>作者<input value={author} maxLength={16} onChange={(event) => setAuthor(event.target.value)} /></label><label>原文链接<input value={sourceUrl} type="url" placeholder="可选" onChange={(event) => setSourceUrl(event.target.value)} /></label></div><label>摘要<textarea value={digest} maxLength={128} onChange={(event) => setDigest(event.target.value)} /></label></div><div className="sync-summary"><span><small>目标公众号</small><strong>{accountName}</strong></span><span><small>排版主题</small><strong>{currentTheme.name}</strong></span><span><small>正文检查</small><strong className="ok">已通过</strong></span></div>{syncError && <div className="form-error">{syncError}</div>}{syncing ? <div className="sync-progress"><i /></div> : <button className="sync-confirm" onClick={startSync}>确认并发送到草稿箱</button>}</> : <div className="sync-success"><span>✓</span><p className="modal-kicker">SYNC COMPLETE</p><h2>已发送到草稿箱</h2><p>草稿 Media ID：{draftMediaId.slice(0, 10)}…<br />请前往微信公众号后台进行最终预览和群发。</p><button className="sync-confirm" onClick={() => { setShowSync(false); setSynced(false); setDraftMediaId(""); }}>完成</button></div>}
    </div></div>}
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
  const [showConnect, setShowConnect] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [formError, setFormError] = useState("");
  const [account, setAccount] = useState<{ name: string; appIdMasked: string; defaultAuthor: string; updatedAt: string } | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [name, setName] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [defaultAuthor, setDefaultAuthor] = useState("编辑部");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/wechat/config").then((response) => readApi<{ configured: boolean; account: typeof account }>(response)),
      fetch("/api/wechat/history").then((response) => readApi<{ records: unknown[] }>(response)),
    ]).then(([config, history]) => {
      if (cancelled) return;
      setConnected(config.configured);
      setAccount(config.account);
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
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "连接失败");
    } finally {
      setConnecting(false);
    }
  }

  return <div className="product-view">
    <ViewHeading kicker="WECHAT ACCOUNTS" title="公众号" description="管理真实授权账号、接口状态与草稿同步能力。" action={<button className="primary-btn" onClick={() => { setFormError(""); setShowConnect(true); }}>{connected ? "更新凭证" : "＋ 连接公众号"}</button>} />
    {loading ? <div className="account-empty panel">正在读取本地安全配置…</div> : connected && account ? <section className="account-overview panel"><div className="account-avatar">微</div><div className="account-detail"><span className="status green"><i />最近验证正常</span><h2>{account.name}</h2><p>已连接 <span>AppID: {account.appIdMasked}</span></p></div><div className="account-stats"><span><small>同步记录</small><strong>{historyCount}</strong></span><span><small>默认作者</small><strong>{account.defaultAuthor}</strong></span><span><small>凭证状态</small><strong className="ok">已加密</strong></span></div><button className="more-btn">···</button></section> : <section className="account-empty panel"><span>微</span><h2>尚未连接公众号</h2><p>连接后即可上传封面并将排版好的文章发送到真实草稿箱。</p><button className="primary-btn" onClick={() => setShowConnect(true)}>立即连接</button></section>}
    <div className="account-grid"><section className="panel account-section"><div className="section-head"><div><h3>能力与权限</h3><p>连接时会调用微信接口进行真实检测</p></div><button onClick={() => setShowConnect(true)}>重新验证</button></div>{["获取稳定接口凭证", "上传永久封面素材", "新建公众号草稿", "记录同步结果"].map((item) => <div className="permission-row" key={item}><span>{connected ? "✓" : "○"}</span><strong>{item}</strong><small>{connected ? "已就绪" : "待连接"}</small></div>)}</section><section className="panel account-section"><div className="section-head"><div><h3>安全设置</h3><p>凭证与网络访问保护</p></div></div><div className="security-callout"><span>锁</span><p><strong>AppSecret 使用 AES-256-GCM 加密</strong><small>完整密钥不会回显；微信请求仅从本地服务端发出。</small></p></div><div className="setting-row"><span><strong>IP 白名单</strong><small>需在微信后台添加当前公网出口 IP</small></span><b className={connected ? "ok" : ""}>{connected ? "验证通过" : "待配置"}</b></div><div className="setting-row"><span><strong>发布保护</strong><small>目前只发送草稿，不自动群发</small></span><button className="switch on" aria-label="发布保护已开启"><i /></button></div></section></div>
    {formError && !showConnect && <div className="page-error">{formError}</div>}
    {showConnect && <div className="modal-backdrop"><form className="modal-card connect-modal" onSubmit={connectAccount}><button type="button" className="modal-close" onClick={() => setShowConnect(false)}>×</button><p className="modal-kicker">CONNECT ACCOUNT</p><h2>{connected ? "更新公众号凭证" : "连接微信公众号"}</h2><p>保存前会直接调用微信稳定 Token 接口验证 AppID、AppSecret 和 IP 白名单。</p><label>公众号名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：品牌内容中心" required /></label><label>AppID<input value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="wx 开头的字符串" required /></label><label>AppSecret<input value={appSecret} onChange={(event) => setAppSecret(event.target.value)} type="password" placeholder={connected ? "请重新输入以验证" : "粘贴后将加密保存"} required /></label><label>默认作者<input value={defaultAuthor} onChange={(event) => setDefaultAuthor(event.target.value)} maxLength={16} required /></label><div className="form-note">请先在微信公众平台的 IP 白名单中添加本机当前公网出口 IP。凭证验证成功后才会保存。</div>{formError && <div className="form-error">{formError}</div>}<button className="sync-confirm" type="submit" disabled={connecting}>{connecting ? "正在验证微信接口…" : "验证并安全保存"}</button></form></div>}
  </div>;
}
