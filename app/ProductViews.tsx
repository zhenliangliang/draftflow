"use client";

import { useMemo, useState } from "react";

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
    if (line.startsWith("### ")) return <h3 key={index}>{line.slice(4)}</h3>;
    if (line.startsWith("## ")) return <h2 key={index}>{line.slice(3)}</h2>;
    if (line.startsWith("> ")) return <blockquote key={index}>{line.slice(2)}</blockquote>;
    if (line.startsWith("- ")) return <li key={index}>{line.slice(2)}</li>;
    if (!line.trim()) return <br key={index} />;
    return <p key={index}>{line}</p>;
  });
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
  const currentTheme = themes.find((item) => item.id === theme) ?? themes[0];
  const words = useMemo(() => content.replace(/[#>*\-\s]/g, "").length, [content]);

  function startSync() {
    setSyncing(true);
    window.setTimeout(() => { setSyncing(false); setSynced(true); }, 1800);
  }

  return <div className="editor-view">
    <div className="editor-toolbar">
      <div><span className="save-dot" />已自动保存 <b>·</b> {words} 字</div>
      <div><button className="secondary-btn">预览全文</button><button className="sync-btn" onClick={() => setShowSync(true)}>同步到草稿箱 <span>→</span></button></div>
    </div>
    <div className="editor-grid">
      <section className="writing-pane">
        <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="文章标题" />
        <div className="format-bar"><button>H1</button><button>H2</button><button><b>B</b></button><button><i>I</i></button><button>“ ”</button><button>— 列表</button><button>链接</button><button>图片</button><span /><small>Markdown</small></div>
        <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} aria-label="Markdown 编辑器" />
      </section>
      <aside className="preview-pane">
        <div className="preview-head"><div><strong>手机预览</strong><small>实际效果以微信客户端为准</small></div><select value={theme} onChange={(event) => setTheme(event.target.value)}>{themes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
        <div className="phone-frame"><div className="phone-top"><b>9:41</b><span>● ⌁ ▰</span></div><div className="wechat-bar">‹ <strong>预览</strong> ···</div><article className="wechat-article" style={{ "--theme-color": currentTheme.color, "--theme-bg": currentTheme.bg } as React.CSSProperties}><h1>{title || "未命名文章"}</h1><div className="article-meta">示例公众号 · 2026年8月26日</div>{renderMarkdown(content)}</article></div>
      </aside>
    </div>
    {showSync && <div className="modal-backdrop"><div className="modal-card sync-modal">
      {!synced ? <><button className="modal-close" onClick={() => setShowSync(false)}>×</button><span className="modal-symbol">微</span><p className="modal-kicker">WECHAT DRAFT</p><h2>{syncing ? "正在发送到草稿箱" : "发送前确认"}</h2><p>{syncing ? "正在上传正文图片、封面与文章内容，请稍候。" : "文章将以当前主题排版同步到“技术观察”的草稿箱。"}</p><div className="sync-summary"><span><small>目标公众号</small><strong>技术观察</strong></span><span><small>排版主题</small><strong>{currentTheme.name}</strong></span><span><small>正文检查</small><strong className="ok">已通过</strong></span></div>{syncing ? <div className="sync-progress"><i /></div> : <button className="sync-confirm" onClick={startSync}>确认并发送</button>}</> : <div className="sync-success"><span>✓</span><p className="modal-kicker">SYNC COMPLETE</p><h2>已发送到草稿箱</h2><p>你可以前往微信公众号后台继续预览或群发。</p><button className="sync-confirm" onClick={() => { setShowSync(false); setSynced(false); }}>完成</button></div>}
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
  const [connected, setConnected] = useState(true);
  return <div className="product-view">
    <ViewHeading kicker="WECHAT ACCOUNTS" title="公众号" description="管理授权账号、接口状态与草稿同步能力。" action={<button className="primary-btn" onClick={() => setShowConnect(true)}>＋ 连接公众号</button>} />
    <section className="account-overview panel"><div className="account-avatar">微</div><div className="account-detail"><span className="status green"><i />接口正常</span><h2>技术观察</h2><p>服务号 · 已认证 <span>AppID: wx••••••7e2a</span></p></div><div className="account-stats"><span><small>本月同步</small><strong>9</strong></span><span><small>最近同步</small><strong>今天 10:31</strong></span><span><small>Token 状态</small><strong className="ok">正常</strong></span></div><button className="more-btn">···</button></section>
    <div className="account-grid"><section className="panel account-section"><div className="section-head"><div><h3>能力与权限</h3><p>当前公众号开放接口检查</p></div><button>重新检测</button></div>{["获取接口调用凭证", "上传正文图片", "上传永久素材", "新建与更新草稿"].map((item) => <div className="permission-row" key={item}><span>✓</span><strong>{item}</strong><small>可用</small></div>)}</section><section className="panel account-section"><div className="section-head"><div><h3>安全设置</h3><p>凭证与网络访问保护</p></div></div><div className="security-callout"><span>锁</span><p><strong>AppSecret 已加密存储</strong><small>页面不会回显完整密钥，传输全程使用加密连接。</small></p></div><div className="setting-row"><span><strong>IP 白名单</strong><small>云端固定出口 IP</small></span><b className="ok">已配置</b></div><div className="setting-row"><span><strong>异常通知</strong><small>同步失败时通知管理员</small></span><button className="switch on"><i /></button></div></section></div>
    {showConnect && <div className="modal-backdrop"><form className="modal-card connect-modal" onSubmit={(event) => { event.preventDefault(); setConnected(true); setShowConnect(false); }}><button type="button" className="modal-close" onClick={() => setShowConnect(false)}>×</button><p className="modal-kicker">CONNECT ACCOUNT</p><h2>连接微信公众号</h2><p>第一版通过 AppID 与 AppSecret 接入。请使用已认证的公众号，并先配置服务器 IP 白名单。</p><label>公众号名称<input placeholder="例如：品牌内容中心" required /></label><label>AppID<input placeholder="wx 开头的字符串" required /></label><label>AppSecret<input type="password" placeholder="粘贴后将加密保存" required /></label><div className="form-note">凭证仅用于服务端调用微信接口，不会发送到浏览器或展示给其他成员。</div><button className="sync-confirm" type="submit">验证并连接</button></form></div>}
    {!connected && <div />}
  </div>;
}
