"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductView, type ProductViewKey } from "./ProductViews";

type NavKey = "dashboard" | "content" | "editor" | "themes" | "account";

const icons: Record<NavKey, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  content: <><path d="M5 3h11l3 3v15H5z"/><path d="M15 3v4h4M8 11h8M8 15h8"/></>,
  editor: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10z"/><path d="m13.8 6.7 3.5 3.5"/></>,
  themes: <><circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="9" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="15.5" cy="9" r="1"/><path d="M12 21c-2 0-2.4-2.2-.7-3.3 1.3-.8 2-1.5 2-2.7 0-1.1.9-2 2-2H21"/></>,
  account: <><path d="M4 7.5 12 3l8 4.5-8 4.5z"/><path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5"/></>,
};

const nav: { key: NavKey; label: string }[] = [
  { key: "dashboard", label: "工作台" },
  { key: "content", label: "内容" },
  { key: "editor", label: "新建文章" },
  { key: "themes", label: "主题样式" },
  { key: "account", label: "公众号" },
];

const articles = [
  { title: "AI 运维平台选型：从能力到落地", status: "待同步", date: "今天 10:24", tone: "amber", words: "2,846 字" },
  { title: "把复杂技术写得更清楚的 7 个方法", status: "编辑中", date: "昨天 18:10", tone: "blue", words: "1,920 字" },
  { title: "每周技术观察 Vol. 08", status: "已同步", date: "8 月 24 日", tone: "green", words: "3,214 字" },
];

function Icon({ name }: { name: NavKey }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

export function DraftFlowApp() {
  const [active, setActive] = useState<NavKey>("dashboard");
  const [toast, setToast] = useState("");
  const [wechatAccount, setWechatAccount] = useState<{ name: string } | null>(null);
  const today = useMemo(() => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date()), []);

  useEffect(() => {
    fetch("/api/wechat/config")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setWechatAccount(data?.account ?? null))
      .catch(() => setWechatAccount(null));
  }, [active]);

  function openEditor() {
    setActive("editor");
    setToast("已打开文章编辑器");
    window.setTimeout(() => setToast(""), 2200);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>稿流</strong><small>DraftFlow</small></span>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {nav.map((item) => (
            <button key={item.key} className={active === item.key ? "active" : ""} onClick={() => setActive(item.key)}>
              <Icon name={item.key} /><span>{item.label}</span>
              {item.key === "content" && <em>3</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-card">
            <span className="workspace-logo">示</span>
            <span><strong>示例内容团队</strong><small>专业版 · 试用中</small></span>
            <button aria-label="工作区菜单">···</button>
          </div>
          <div className="user-row"><span>用</span><div><strong>示例用户</strong><small>管理员</small></div><button aria-label="通知">○</button></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><i /><i /><i /></span><strong>稿流</strong></div>
          <div className="crumb"><span>示例内容团队</span><b>/</b><strong>{nav.find((item) => item.key === active)?.label}</strong></div>
          <div className="top-actions"><button className="ghost-btn">⌘ K 搜索</button><button className="help-btn">?</button><button className="primary-btn" onClick={openEditor}><span>＋</span> 新建文章</button></div>
        </header>

        {active !== "dashboard" && <ProductView active={active as ProductViewKey} onNavigate={(view) => setActive(view)} />}
        <div className={`page-content ${active === "dashboard" ? "" : "view-hidden"}`}>
          <div className="welcome-row">
            <div><p className="eyebrow">{today}</p><h1>内容工作台</h1><p>从创作、排版到同步草稿箱，一处完成。</p></div>
            <button className="account-chip" onClick={() => setActive("account")}><span className="wechat-dot">微</span><div><small>当前公众号</small><strong>{wechatAccount?.name ?? "尚未连接"}</strong></div><b className={wechatAccount ? "" : "pending"}>{wechatAccount ? "已连接" : "去配置"}</b></button>
          </div>

          <section className="metric-grid">
            <article><span className="metric-icon purple">稿</span><div><small>本月内容</small><strong>12</strong><p><b>↑ 20%</b> 较上月</p></div></article>
            <article><span className="metric-icon blue">字</span><div><small>总创作字数</small><strong>28.6k</strong><p>本月累计</p></div></article>
            <article><span className="metric-icon green">✓</span><div><small>已同步草稿</small><strong>9</strong><p><b>75%</b> 同步率</p></div></article>
            <article><span className="metric-icon amber">时</span><div><small>节省排版时间</small><strong>4.5h</strong><p>预计节省</p></div></article>
          </section>

          <div className="main-grid">
            <section className="panel articles-panel">
              <div className="panel-head"><div><h2>最近内容</h2><p>继续编辑或查看同步状态</p></div><button onClick={() => setActive("content")}>查看全部 →</button></div>
              <div className="article-list">
                {articles.map((article, index) => (
                  <button className="article-row" key={article.title} onClick={openEditor}>
                    <span className={`cover cover-${index + 1}`}><i>{index === 0 ? "AI" : index === 1 ? "Aa" : "08"}</i></span>
                    <span className="article-info"><strong>{article.title}</strong><small>{article.words} · {article.date}</small></span>
                    <span className={`status ${article.tone}`}><i />{article.status}</span>
                    <span className="row-arrow">›</span>
                  </button>
                ))}
              </div>
            </section>

            <aside className="panel quick-panel">
              <div className="panel-head"><div><h2>快速开始</h2><p>选择一种创作方式</p></div></div>
              <button className="quick-main" onClick={openEditor}><span>＋</span><div><strong>新建空白文章</strong><small>从头开始创作</small></div><b>→</b></button>
              <button className="quick-row" onClick={openEditor}><span className="mini-icon">M</span><div><strong>导入 Markdown</strong><small>支持 .md 文件</small></div><b>→</b></button>
              <button className="quick-row" onClick={() => setActive("themes")}><span className="mini-icon">模</span><div><strong>从模板创建</strong><small>6 套内置主题</small></div><b>→</b></button>
            </aside>
          </div>

          <section className="panel progress-panel">
            <div className="progress-copy"><span>1</span><div><small>新手引导 · 已完成 2/3</small><strong>再完成一步，就可以发送第一篇草稿</strong><div className="progress-bar"><i /></div></div></div>
            <div className="steps"><span className="done">✓ 创建工作区</span><span className="done">✓ 连接公众号</span><button onClick={openEditor}>○ 创建并同步文章 <b>→</b></button></div>
          </section>
        </div>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
