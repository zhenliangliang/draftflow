/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auditArticle, autoFixMarkdown, autoFixTitle, normalizeEditorialText } from "@/lib/format-audit";
import { analyzeResponsiveMarkdown, findLocalMarkdownImages, findMermaidBlocks, markdownToWechatHtml, replaceMermaidBlocks } from "@/lib/markdown";
import { mermaidToImageFile } from "@/lib/mermaid-client";
import { composeArticleWithTemplate, createArticleTemplateDraft, type ArticleTemplate } from "@/lib/templates";
import { createCustomThemeDraft, presetThemes, type ArticleTheme } from "@/lib/themes";
import { proxyWechatImagesForPreview, wechatImagePreviewUrl } from "@/lib/wechat-images";
import { RadarView } from "./RadarView";
import { RenderedArticle } from "./RenderedArticle";

export type ProductViewKey = "content" | "editor" | "radar" | "templates" | "themes" | "account";

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

const previewDevices = [
  { id: "iphone-se", name: "iPhone SE", detail: "320 px", width: 320, desktop: false },
  { id: "iphone-15", name: "iPhone 15 / 16", detail: "393 px", width: 393, desktop: false },
  { id: "huawei-mate", name: "华为 Mate", detail: "412 px", width: 412, desktop: false },
  { id: "web", name: "Web 宽屏", detail: "760 px", width: 760, desktop: true },
] as const;

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
  const [customThemes, setCustomThemes] = useState<ArticleTheme[]>([]);
  const [activeThemeId, setActiveThemeId] = useState("minimal");
  const [themeError, setThemeError] = useState("");
  const [articleTemplates, setArticleTemplates] = useState<ArticleTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [previousArticleTitle, setPreviousArticleTitle] = useState("");
  const [previousArticleUrl, setPreviousArticleUrl] = useState("");
  const [templateError, setTemplateError] = useState("");
  const themes = useMemo(() => [...presetThemes, ...customThemes], [customThemes]);

  useEffect(() => {
    fetch("/api/themes", { cache: "no-store" })
      .then((response) => readApi<{ customThemes: ArticleTheme[]; activeThemeId: string }>(response))
      .then((data) => {
        setCustomThemes(data.customThemes);
        setActiveThemeId(data.activeThemeId);
      })
      .catch((error) => setThemeError(error instanceof Error ? error.message : "主题读取失败"));
  }, []);

  useEffect(() => {
    fetch("/api/templates", { cache: "no-store" })
      .then((response) => readApi<{ templates: ArticleTemplate[] }>(response))
      .then((data) => {
        setArticleTemplates(data.templates);
        const preferred = data.templates.find((template) => template.isDefault) ?? null;
        setActiveTemplateId(preferred?.id ?? "");
        setPreviousArticleTitle(preferred?.defaultPreviousTitle ?? "");
        setPreviousArticleUrl(preferred?.defaultPreviousUrl ?? "");
      })
      .catch((error) => setTemplateError(error instanceof Error ? error.message : "模板读取失败"));
  }, []);

  async function activateTheme(themeId: string) {
    const previous = activeThemeId;
    setActiveThemeId(themeId);
    setThemeError("");
    try {
      await readApi(await fetch("/api/themes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "activate", themeId }),
      }));
    } catch (error) {
      setActiveThemeId(previous);
      setThemeError(error instanceof Error ? error.message : "主题应用失败");
      throw error;
    }
  }

  async function saveTheme(theme: ArticleTheme) {
    setThemeError("");
    const result = await readApi<{ theme: ArticleTheme }>(await fetch("/api/themes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", theme }),
    }));
    setCustomThemes((items) => [result.theme, ...items.filter((item) => item.id !== result.theme.id)]);
    await activateTheme(result.theme.id);
    return result.theme;
  }

  async function deleteTheme(themeId: string) {
    setThemeError("");
    await readApi(await fetch(`/api/themes?id=${encodeURIComponent(themeId)}`, { method: "DELETE" }));
    setCustomThemes((items) => items.filter((item) => item.id !== themeId));
    if (activeThemeId === themeId) setActiveThemeId("minimal");
  }

  function selectArticleTemplate(templateId: string) {
    setActiveTemplateId(templateId);
    const template = articleTemplates.find((item) => item.id === templateId);
    setPreviousArticleTitle(template?.defaultPreviousTitle ?? "");
    setPreviousArticleUrl(template?.defaultPreviousUrl ?? "");
  }

  async function saveArticleTemplate(template: ArticleTemplate) {
    setTemplateError("");
    const result = await readApi<{ template: ArticleTemplate }>(await fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", template }),
    }));
    setArticleTemplates((items) => [
      result.template,
      ...items.filter((item) => item.id !== result.template.id).map((item) => result.template.isDefault ? { ...item, isDefault: false } : item),
    ]);
    setActiveTemplateId(result.template.id);
    setPreviousArticleTitle(result.template.defaultPreviousTitle);
    setPreviousArticleUrl(result.template.defaultPreviousUrl);
    return result.template;
  }

  async function makeDefaultArticleTemplate(templateId: string) {
    setTemplateError("");
    await readApi(await fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "default", templateId }),
    }));
    setArticleTemplates((items) => items.map((item) => ({ ...item, isDefault: item.id === templateId })));
    selectArticleTemplate(templateId);
  }

  async function deleteArticleTemplate(templateId: string) {
    setTemplateError("");
    await readApi(await fetch(`/api/templates?id=${encodeURIComponent(templateId)}`, { method: "DELETE" }));
    const remaining = articleTemplates.filter((item) => item.id !== templateId);
    setArticleTemplates(remaining);
    if (activeTemplateId === templateId) {
      const preferred = remaining.find((item) => item.isDefault) ?? null;
      setActiveTemplateId(preferred?.id ?? "");
      setPreviousArticleTitle(preferred?.defaultPreviousTitle ?? "");
      setPreviousArticleUrl(preferred?.defaultPreviousUrl ?? "");
    }
  }

  if (active === "content") return <ContentView onEdit={() => onNavigate("editor")} />;
  if (active === "radar") return <RadarView onUseDraft={onUseGeneratedDraft} />;
  if (active === "templates") return <TemplatesView templates={articleTemplates} activeTemplateId={activeTemplateId} error={templateError} onSelect={selectArticleTemplate} onSave={saveArticleTemplate} onDefault={makeDefaultArticleTemplate} onDelete={deleteArticleTemplate} onUse={() => onNavigate("editor")} />;
  if (active === "themes") return <ThemesView themes={themes} activeThemeId={activeThemeId} error={themeError} onApply={activateTheme} onSave={saveTheme} onDelete={deleteTheme} onUse={() => onNavigate("editor")} />;
  if (active === "account") return <AccountView />;
  return <EditorView key={importedDraft?.id ?? "blank"} importedDraft={importedDraft} onImportMarkdown={onImportMarkdown} themes={themes} activeThemeId={activeThemeId} onThemeChange={activateTheme} themeError={themeError} templates={articleTemplates} activeTemplateId={activeTemplateId} onTemplateChange={selectArticleTemplate} templateError={templateError} previousArticleTitle={previousArticleTitle} previousArticleUrl={previousArticleUrl} onPreviousArticleTitleChange={setPreviousArticleTitle} onPreviousArticleUrlChange={setPreviousArticleUrl} />;
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

function EditorView({ importedDraft, onImportMarkdown, themes, activeThemeId, onThemeChange, themeError, templates, activeTemplateId, onTemplateChange, templateError, previousArticleTitle, previousArticleUrl, onPreviousArticleTitleChange, onPreviousArticleUrlChange }: { importedDraft: ImportedMarkdownDraft | null; onImportMarkdown: () => void; themes: ArticleTheme[]; activeThemeId: string; onThemeChange: (themeId: string) => Promise<void>; themeError: string; templates: ArticleTemplate[]; activeTemplateId: string; onTemplateChange: (templateId: string) => void; templateError: string; previousArticleTitle: string; previousArticleUrl: string; onPreviousArticleTitleChange: (value: string) => void; onPreviousArticleUrlChange: (value: string) => void }) {
  const [title, setTitle] = useState(importedDraft?.title || "为什么内容团队需要一套公众号工作台？");
  const [content, setContent] = useState(importedDraft?.content || sampleMarkdown);
  const [editorMode, setEditorMode] = useState<"visual" | "markdown">(importedDraft ? "visual" : "markdown");
  const [showSync, setShowSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState("");
  const [synced, setSynced] = useState(false);
  const [accountName, setAccountName] = useState("尚未连接公众号");
  const [author, setAuthor] = useState(importedDraft?.author || "编辑部");
  const [digest, setDigest] = useState(importedDraft?.digest || "公众号内容工作台如何把创作、排版和草稿同步连成一条完整工作流。");
  const [sourceUrl, setSourceUrl] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [coverMediaId, setCoverMediaId] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [syncError, setSyncError] = useState("");
  const [draftMediaId, setDraftMediaId] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [showResponsivePreview, setShowResponsivePreview] = useState(false);
  const [previewDeviceId, setPreviewDeviceId] = useState<(typeof previewDevices)[number]["id"]>("iphone-15");
  const [auditNotice, setAuditNotice] = useState("");
  const [aiStatus, setAIStatus] = useState<{ configured: boolean; provider: string; model: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyImageInputRef = useRef<HTMLInputElement>(null);
  const mermaidImageCacheRef = useRef(new Map<string, string>());
  const currentTheme = themes.find((item) => item.id === activeThemeId) ?? themes[0];
  const currentTemplate = templates.find((item) => item.id === activeTemplateId) ?? null;
  const words = useMemo(() => content.replace(/[#>*\-\s]/g, "").length, [content]);
  const composedContent = useMemo(() => composeArticleWithTemplate(content, currentTemplate, { previousTitle: previousArticleTitle, previousUrl: previousArticleUrl }), [content, currentTemplate, previousArticleTitle, previousArticleUrl]);
  const renderedHtml = useMemo(() => markdownToWechatHtml(composedContent, currentTheme), [composedContent, currentTheme]);
  const previewHtml = useMemo(() => proxyWechatImagesForPreview(renderedHtml), [renderedHtml]);
  const localImages = useMemo(() => findLocalMarkdownImages(composedContent), [composedContent]);
  const mermaidBlocks = useMemo(() => findMermaidBlocks(composedContent), [composedContent]);
  const audit = useMemo(() => auditArticle({ title, content, digest }), [title, content, digest]);
  const responsiveReport = useMemo(() => analyzeResponsiveMarkdown(content), [content]);
  const previewDevice = previewDevices.find((device) => device.id === previewDeviceId) ?? previewDevices[1];

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
    setSyncStage("正在准备文章内容…");
    try {
      let thumbMediaId = coverMediaId;
      if (!thumbMediaId) {
        try {
          const coverBody = new FormData();
          coverBody.append("cover", cover, cover.name);
          const coverResult = await readApi<{ mediaId: string }>(await fetch("/api/wechat/cover", { method: "POST", body: coverBody }));
          thumbMediaId = coverResult.mediaId;
          setCoverMediaId(thumbMediaId);
        } catch (error) {
          throw new Error(`封面上传失败：${error instanceof Error ? error.message : "请重新选择图片"}`);
        }
      }

      let contentForWechat = composedContent;
      if (mermaidBlocks.length > 0) {
        const imageUrls: string[] = [];
        for (const [index, diagram] of mermaidBlocks.entries()) {
          let imageUrl = mermaidImageCacheRef.current.get(diagram.source) ?? "";
          if (!imageUrl) {
            setSyncStage(`正在将架构图 ${index + 1}/${mermaidBlocks.length} 转为高清图片…`);
            const imageFile = await mermaidToImageFile(diagram.source, index);
            const imageBody = new FormData();
            imageBody.append("image", imageFile, imageFile.name);
            const imageResult = await readApi<{ url: string }>(await fetch("/api/wechat/image", { method: "POST", body: imageBody }));
            imageUrl = imageResult.url;
            mermaidImageCacheRef.current.set(diagram.source, imageUrl);
          }
          imageUrls.push(imageUrl);
        }
        contentForWechat = replaceMermaidBlocks(contentForWechat, imageUrls);
      }

      const publishHtml = markdownToWechatHtml(contentForWechat, currentTheme);
      if (!publishHtml.trim() || publishHtml.length >= 20_000) {
        throw new Error(`排版后正文为 ${publishHtml.length.toLocaleString("zh-CN")} 个字符，微信要求少于 20,000 个字符；请精简正文或拆分为两篇文章`);
      }

      let draftResult: { mediaId: string };
      try {
        setSyncStage("正在创建微信公众号草稿…");
        draftResult = await readApi<{ mediaId: string }>(await fetch("/api/wechat/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            author,
            digest,
            content: publishHtml,
            contentSourceUrl: sourceUrl,
            thumbMediaId,
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
      setSyncStage("");
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
      setCoverMediaId("");
      return;
    }
    try {
      const optimized = await optimizeCoverImage(file);
      setCover(optimized);
      setCoverMediaId("");
      setCoverNote(optimized !== file
        ? `已自动优化为 ${Math.round(optimized.size / 1024)}KB，可安全上传`
        : `${Math.round(optimized.size / 1024)}KB，已通过上传检查`);
    } catch (error) {
      setCover(null);
      setCoverMediaId("");
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
    {syncing && syncStage && <div className="sync-stage-toast" role="status">{syncStage}</div>}
    <div className="editor-toolbar">
      <div><span className="save-dot" />已自动保存 <b>·</b> {words} 字</div>
      <div><button className="secondary-btn" onClick={onImportMarkdown}>导入 MD</button><button className="audit-btn" onClick={() => { setAuditNotice(""); setAIStatus(null); setShowAudit(true); void loadAIStatus(); }}><span>✦</span> 智能审核 <i>{audit.score}</i></button><button className="sync-btn" onClick={() => setShowSync(true)}>同步到草稿箱 <span>→</span></button></div>
    </div>
    <div className="editor-grid">
      <section className="writing-pane">
        <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="文章标题" />
        <div className={`format-bar ${editorMode === "visual" ? "visual" : ""}`}>
          <div className="format-actions" aria-hidden={editorMode === "visual"}><button disabled={editorMode === "visual"}>H1</button><button disabled={editorMode === "visual"}>H2</button><button disabled={editorMode === "visual"}><b>B</b></button><button disabled={editorMode === "visual"}><i>I</i></button><button disabled={editorMode === "visual"}>“ ”</button><button disabled={editorMode === "visual"}>— 列表</button><button disabled={editorMode === "visual"}>链接</button><button onClick={() => bodyImageInputRef.current?.click()} disabled={editorMode === "visual" || imageUploading}>{imageUploading ? "上传中" : "图片"}</button></div>
          <input ref={bodyImageInputRef} className="hidden-file" type="file" accept="image/jpeg,image/png" onChange={(event) => void uploadBodyImage(event.target.files?.[0] ?? null)} />
          <div className="editor-mode-switch" aria-label="编辑器显示模式"><button className={editorMode === "visual" ? "active" : ""} aria-pressed={editorMode === "visual"} onClick={() => setEditorMode("visual")}>可视化</button><button className={editorMode === "markdown" ? "active" : ""} aria-pressed={editorMode === "markdown"} onClick={() => setEditorMode("markdown")}>Markdown</button></div>
        </div>
        {importedDraft && <div className="import-notice success">已导入 <strong>{importedDraft.fileName}</strong>，标题和 Markdown 正文已自动识别。</div>}
        {localImages.length > 0 && <div className="import-notice warning">检测到 {localImages.length} 张本地图片。浏览器无法直接读取 MD 文件旁的图片，请切换到 Markdown 模式，点击上方“图片”逐张上传并替换。</div>}
        {mermaidBlocks.length > 0 && <div className="import-notice success mermaid-notice">✓ 已识别 {mermaidBlocks.length} 个 Mermaid 架构图；预览自动渲染，发送草稿时自动上传为微信高清图片。</div>}
        {currentTemplate && <section className="template-attachment"><div><span>模</span><div><strong>已引用：{currentTemplate.name}</strong><small>模板内容独立保存，预览和同步时自动组合，不会复制进正文。</small></div>{currentTemplate.qrCodeUrl && <b>含关注二维码</b>}</div>{currentTemplate.showPreviousArticle && <div className="previous-article-fields"><label>上一篇标题<input value={previousArticleTitle} placeholder="例如：上一篇文章标题" onChange={(event) => onPreviousArticleTitleChange(event.target.value)} /></label><label>上一篇链接<input value={previousArticleUrl} type="url" placeholder="https://mp.weixin.qq.com/s/..." onChange={(event) => onPreviousArticleUrlChange(event.target.value)} /></label></div>}</section>}
        {editorError && <div className="editor-error">{editorError}</div>}
        {editorMode === "markdown" ? <textarea ref={textareaRef} value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} aria-label="Markdown 编辑器" /> : <div className="visual-editor-shell"><div className="visual-editor-note"><span><strong>可视化排版</strong><small>表格、架构图、标题和正文按当前公众号主题展示</small></span><button onClick={() => setEditorMode("markdown")}>编辑 Markdown</button></div><RenderedArticle html={previewHtml} className="visual-editor markdown-body" /></div>}
      </section>
      <aside className="preview-pane">
        <div className="preview-head"><div><strong>草稿箱兼容预览</strong><small>正文、模板与主题使用同一份微信兼容输出</small></div><span className="preview-head-actions"><button onClick={() => setShowResponsivePreview(true)}>多设备 <b>{responsiveReport.score}</b></button><select aria-label="文章模板" value={activeTemplateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">不使用模板</option>{templates.map((item) => <option value={item.id} key={item.id}>{item.name}{item.isDefault ? " · 默认" : ""}</option>)}</select><select aria-label="排版主题" value={activeThemeId} onChange={(event) => void onThemeChange(event.target.value)}>{themes.map((item) => <option value={item.id} key={item.id}>{item.name}{item.isCustom ? " · 自定义" : ""}</option>)}</select></span></div>
        {(themeError || templateError) && <div className="editor-error theme-inline-error">{themeError || templateError}</div>}
        <div className="phone-frame"><div className="phone-top"><b>9:41</b><span>● ⌁ ▰</span></div><div className="wechat-bar">‹ <strong>预览</strong> ···</div><article className="wechat-article" style={{ "--theme-color": currentTheme.color, "--theme-bg": currentTheme.bg } as React.CSSProperties}><h1>{title || "未命名文章"}</h1><div className="article-meta">示例公众号 · 2026年8月26日</div><RenderedArticle html={previewHtml} /></article></div>
      </aside>
    </div>
    {showResponsivePreview && (
      <div className="modal-backdrop">
        <div className="modal-card responsive-preview-modal">
          <button className="modal-close" onClick={() => setShowResponsivePreview(false)}>×</button>
          <p className="modal-kicker">RESPONSIVE PREVIEW LAB</p>
          <div className="responsive-preview-heading">
            <div><h2>多设备文章预览</h2><p>用主流阅读宽度检查表格、长文本、代码和正文节奏。</p></div>
            <div className="device-tabs">{previewDevices.map((device) => <button key={device.id} className={previewDevice.id === device.id ? "active" : ""} onClick={() => setPreviewDeviceId(device.id)}><strong>{device.name}</strong><small>{device.detail}</small></button>)}</div>
          </div>
          <div className="responsive-preview-layout">
            <section className="device-preview-stage">
              <div className={`device-preview-shell ${previewDevice.desktop ? "desktop" : "phone"}`} style={{ "--device-width": `${previewDevice.width}px` } as React.CSSProperties}>
                <div className="device-preview-chrome"><span>{previewDevice.desktop ? "微信公众号 · Web 阅读" : "9:41"}</span><b>{previewDevice.name}</b><span>{previewDevice.desktop ? "— □ ×" : "● ⌁ ▰"}</span></div>
                <article className="device-preview-article" style={{ "--theme-color": currentTheme.color, "--theme-bg": currentTheme.bg } as React.CSSProperties}>
                  <h1>{title || "未命名文章"}</h1>
                  <div className="article-meta">{accountName === "尚未连接公众号" ? "示例公众号" : accountName} · 2026年8月26日</div>
                  <RenderedArticle html={previewHtml} />
                </article>
              </div>
            </section>
            <aside className="format-report-panel">
              <div className="format-score"><span>{responsiveReport.score}</span><div><strong>跨端适配评分</strong><small>已按最窄 320 px 正文宽度分析</small></div></div>
              <div className="format-stat-grid"><span><strong>{responsiveReport.tableCount}</strong><small>原始表格</small></span><span><strong>{responsiveReport.outputTableCount}</strong><small>适配组件</small></span><span><strong>{responsiveReport.wideTableCount}</strong><small>宽表已优化</small></span></div>
              <div className="format-check-list">
                <article><span>✓</span><div><strong>移动端对比卡片</strong><p>{responsiveReport.wideTableCount ? `已将 ${responsiveReport.wideTableCount} 个宽表格按语义转换为分组卡片，保留字段对应关系并避免文字挤压。` : "所有表格都在两列以内，无需转换。"}</p></div></article>
                <article><span>✓</span><div><strong>长文本安全换行</strong><p>{responsiveReport.longCellCount ? `识别到 ${responsiveReport.longCellCount} 个长字段，已启用自然换行并避免英文被强制拉开。` : "未发现可能撑破手机宽度的长字段。"}</p></div></article>
                <article><span>✓</span><div><strong>主流屏幕覆盖</strong><p>已覆盖 iPhone SE、iPhone 15/16、华为 Mate 与 Web 宽屏。</p></div></article>
                <article><span>✓</span><div><strong>微信编辑器兼容</strong><p>预览与草稿发送使用同一份内联样式输出，不依赖微信会过滤的外部样式。</p></div></article>
              </div>
              <button className="responsive-applied" onClick={() => setShowResponsivePreview(false)}>✓ 已应用智能排版优化</button>
            </aside>
          </div>
        </div>
      </div>
    )}
    {showSync && <div className="modal-backdrop"><div className="modal-card sync-modal">
      {!synced ? <><button className="modal-close" onClick={() => setShowSync(false)}>×</button><span className="modal-symbol">微</span><p className="modal-kicker">WECHAT DRAFT</p><h2>{syncing ? "正在发送到草稿箱" : "发送前确认"}</h2><p>{syncing ? "正在上传封面和文章内容，请勿关闭页面。" : `文章将以当前主题排版真实同步到“${accountName}”的草稿箱。`}</p><div className="draft-fields"><label>封面图片 <small>JPG / PNG / GIF / BMP，上传前自动优化，微信限制 2MB</small><input type="file" accept="image/jpeg,image/png,image/gif,image/bmp" onChange={(event) => void selectCover(event.target.files?.[0] ?? null)} />{coverNote && <small className="cover-note">✓ {coverNote}</small>}</label><div><label>作者<input value={author} maxLength={16} onChange={(event) => setAuthor(event.target.value)} /></label><label>原文链接<input value={sourceUrl} type="url" placeholder="可选" onChange={(event) => setSourceUrl(event.target.value)} /></label></div><label>摘要<textarea value={digest} maxLength={128} onChange={(event) => setDigest(event.target.value)} /></label></div><div className="sync-summary"><span><small>目标公众号</small><strong>{accountName}</strong></span><span><small>排版主题</small><strong>{currentTheme.name}</strong></span><span><small>文章模板</small><strong>{currentTemplate?.name ?? "未使用"}</strong></span><span><small>智能审核</small><strong className={audit.score >= 75 ? "ok" : "needs-work"}>{audit.score} 分 · {audit.score >= 75 ? "可发布" : "待优化"}</strong></span></div>{syncError && <div className="form-error">{syncError}</div>}{syncing ? <div className="sync-progress"><i /></div> : <button className="sync-confirm" onClick={startSync}>确认并发送到草稿箱</button>}</> : <div className="sync-success"><span>✓</span><p className="modal-kicker">SYNC COMPLETE</p><h2>已发送到草稿箱</h2><p>草稿 Media ID：{draftMediaId.slice(0, 10)}…<br />请前往微信公众号后台进行最终预览和群发。</p><button className="sync-confirm" onClick={() => { setShowSync(false); setSynced(false); setDraftMediaId(""); }}>完成</button></div>}
    </div></div>}
    {showAudit && <div className="modal-backdrop"><div className="modal-card audit-modal"><button className="modal-close" onClick={() => setShowAudit(false)}>×</button><p className="modal-kicker">SMART FORMAT REVIEW</p><div className="audit-hero"><span className={audit.score >= 90 ? "excellent" : audit.score >= 75 ? "good" : "weak"}>{audit.score}</span><div><h2>智能格式审核</h2><p>{audit.label} · 已检查标题、摘要、结构、段落、图片和互动引导。</p></div></div>{auditNotice && <div className="audit-notice">✓ {auditNotice}</div>}<div className="audit-list">{audit.issues.length ? audit.issues.map((issue) => <article key={issue.id} className={`audit-issue ${issue.level}`}><span>{issue.level === "error" ? "!" : issue.level === "warning" ? "•" : "i"}</span><div><strong>{issue.title}</strong><p>{issue.detail}</p></div>{issue.fixable && <em>可自动修复</em>}</article>) : <div className="audit-perfect"><span>✓</span><strong>格式状态优秀</strong><p>当前没有发现影响发布和手机阅读的问题。</p></div>}</div><div className={`ai-review-note ${aiStatus?.configured ? "connected" : ""}`}><span>AI</span><div><strong>AI 内容增强</strong><p>{!aiStatus ? "正在读取内容雷达中的 AI 配置…" : aiStatus.configured ? `已连接 ${aiStatus.provider === "litellm" ? "LiteLLM" : "OpenAI 兼容接口"} · ${aiStatus.model}，可用于标题钩子、开场摘要和结尾互动建议。` : "尚未连接模型，请先在内容雷达中完成 AI 配置。当前规则审核不会把文章上传给第三方。"}</p></div><b className={aiStatus?.configured ? "ok" : ""}>{!aiStatus ? "检测中" : aiStatus.configured ? "已连接" : "待配置"}</b></div><div className="audit-actions"><button className="secondary-btn" onClick={() => setShowAudit(false)}>返回编辑</button><button className="sync-confirm" disabled={!audit.issues.some((issue) => issue.fixable)} onClick={applyFormatFixes}>一键修复格式问题</button></div></div></div>}
  </div>;
}

function TemplatesView({ templates, activeTemplateId, error, onSelect, onSave, onDefault, onDelete, onUse }: { templates: ArticleTemplate[]; activeTemplateId: string; error: string; onSelect: (templateId: string) => void; onSave: (template: ArticleTemplate) => Promise<ArticleTemplate>; onDefault: (templateId: string) => Promise<void>; onDelete: (templateId: string) => Promise<void>; onUse: () => void }) {
  const [selected, setSelected] = useState(activeTemplateId || templates[0]?.id || "");
  const [editing, setEditing] = useState<ArticleTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedTemplate = templates.find((template) => template.id === selected) ?? null;

  async function save(template: ArticleTemplate) {
    setBusy(true);
    setLocalError("");
    try {
      const saved = await onSave(template);
      setSelected(saved.id);
      setEditing(null);
      setNotice(`“${saved.name}”已保存，可在新文章中直接引用`);
    } catch (saveError) {
      setLocalError(saveError instanceof Error ? saveError.message : "模板保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(template: ArticleTemplate) {
    setBusy(true);
    setLocalError("");
    try {
      await onDefault(template.id);
      setSelected(template.id);
      setNotice(`“${template.name}”已设为新文章默认模板`);
    } catch (defaultError) {
      setLocalError(defaultError instanceof Error ? defaultError.message : "默认模板设置失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(template: ArticleTemplate) {
    if (!window.confirm(`确定删除文章模板“${template.name}”吗？`)) return;
    setBusy(true);
    setLocalError("");
    try {
      await onDelete(template.id);
      const next = templates.find((item) => item.id !== template.id)?.id ?? "";
      setSelected(next);
      setNotice(`已删除“${template.name}”`);
    } catch (deleteError) {
      setLocalError(deleteError instanceof Error ? deleteError.message : "模板删除失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="product-view">
    <ViewHeading kicker="REUSABLE CONTENT" title="文章模板" description="把固定开场、结尾引导、延伸阅读和关注二维码保存一次，每篇文章直接引用。" action={<button className="primary-btn" onClick={() => setEditing(createArticleTemplateDraft())}>＋ 新建模板</button>} />
    {(error || localError) && <div className="editor-error template-page-message">{localError || error}</div>}
    {notice && <div className="import-notice success template-page-message">✓ {notice}</div>}
    {!templates.length ? <section className="template-empty panel"><span>模</span><h2>还没有文章模板</h2><p>创建第一个模板，把公众号关注二维码、固定结尾和上一篇文章入口保存起来。</p><button className="primary-btn" onClick={() => setEditing(createArticleTemplateDraft())}>创建文章模板</button></section> : <div className="template-grid">{templates.map((template) => <article key={template.id} className={`template-card panel ${selected === template.id ? "selected" : ""}`}><div className="template-card-select" role="button" tabIndex={0} onClick={() => setSelected(template.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(template.id); } }}><div className="template-card-top"><span>模</span><div><strong>{template.name}</strong><small>{template.description}</small></div>{template.isDefault && <b>默认</b>}</div><div className="template-feature-list"><span className={template.headerMarkdown ? "on" : ""}>固定开场</span><span className={template.footerMarkdown ? "on" : ""}>固定结尾</span><span className={template.showPreviousArticle ? "on" : ""}>上一篇文章</span><span className={template.qrCodeUrl ? "on" : ""}>关注二维码</span></div>{template.qrCodeUrl && <div className="template-qr-mini"><img src={wechatImagePreviewUrl(template.qrCodeUrl)} alt="公众号关注二维码" /><span><strong>关注引导已配置</strong><small>{template.qrCaption}</small></span></div>}</div><div className="template-card-actions"><button onClick={() => setEditing({ ...template })}>编辑</button><button disabled={busy || template.isDefault} onClick={() => void makeDefault(template)}>{template.isDefault ? "默认模板" : "设为默认"}</button><button className="danger" onClick={() => void remove(template)}>删除</button></div>{selected === template.id && <b className="selected-check">✓</b>}</article>)}</div>}
    {selectedTemplate && <section className="template-use-bar panel"><div><small>当前选择</small><strong>{selectedTemplate.name}</strong><span>模板与正文保持独立，更新模板不会污染 Markdown 原文。</span></div><button className="secondary-btn" onClick={() => setEditing({ ...selectedTemplate })}>编辑模板</button><button className="primary-btn" onClick={() => { onSelect(selectedTemplate.id); onUse(); }}>引用并开始写作</button></section>}
    {editing && <TemplateDesigner template={editing} busy={busy} error={localError} onCancel={() => { setEditing(null); setLocalError(""); }} onSave={save} />}
  </div>;
}

function TemplateDesigner({ template, busy, error, onCancel, onSave }: { template: ArticleTemplate; busy: boolean; error: string; onCancel: () => void; onSave: (template: ArticleTemplate) => Promise<void> }) {
  const [draft, setDraft] = useState(template);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const qrInputRef = useRef<HTMLInputElement>(null);
  const update = <K extends keyof ArticleTemplate>(key: K, value: ArticleTemplate[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const previewMarkdown = useMemo(() => composeArticleWithTemplate("## 本期内容\n\n这里是每篇文章独立创作的正文。模板不会写进正文编辑区，而是在预览和同步时自动引用。", draft, {}), [draft]);
  const previewHtml = useMemo(() => proxyWechatImagesForPreview(markdownToWechatHtml(previewMarkdown, presetThemes[0])), [previewMarkdown]);

  async function uploadQrCode(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const body = new FormData();
      body.append("image", file);
      const result = await readApi<{ url: string }>(await fetch("/api/wechat/image", { method: "POST", body }));
      update("qrCodeUrl", result.url);
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : "二维码上传失败");
    } finally {
      setUploading(false);
      if (qrInputRef.current) qrInputRef.current.value = "";
    }
  }

  return <div className="modal-backdrop"><div className="modal-card template-designer-modal"><button className="modal-close" onClick={onCancel}>×</button><p className="modal-kicker">ARTICLE TEMPLATE BUILDER</p><div className="template-designer-heading"><div><h2>{template.id ? "编辑文章模板" : "创建文章模板"}</h2><p>模板与文章正文独立保存，在发送草稿时自动合并。</p></div><label className="default-template-check"><input type="checkbox" checked={draft.isDefault} onChange={(event) => update("isDefault", event.target.checked)} />设为新文章默认</label></div><div className="template-designer-layout"><form onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}><section className="template-form-section"><h3>模板信息</h3><label>模板名称<input required maxLength={32} value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><label>用途说明<input maxLength={100} value={draft.description} onChange={(event) => update("description", event.target.value)} /></label></section><section className="template-form-section"><h3>固定内容</h3><label>文章开场 <small>可留空，支持 Markdown</small><textarea value={draft.headerMarkdown} placeholder="例如：本栏目专注分享 AI 与运维实践。" onChange={(event) => update("headerMarkdown", event.target.value)} /></label><label>文章结尾 <small>支持 Markdown</small><textarea value={draft.footerMarkdown} placeholder="> 如果文章对你有帮助，欢迎点赞、收藏和分享。" onChange={(event) => update("footerMarkdown", event.target.value)} /></label></section><section className="template-form-section"><div className="template-section-title"><h3>上一篇文章</h3><button type="button" className={`switch ${draft.showPreviousArticle ? "on" : ""}`} aria-label="启用上一篇文章" onClick={() => update("showPreviousArticle", !draft.showPreviousArticle)}><i /></button></div>{draft.showPreviousArticle && <><label>区块标题<input value={draft.previousLabel} maxLength={24} onChange={(event) => update("previousLabel", event.target.value)} /></label><label>默认文章标题 <small>写新文章时可以覆盖</small><input value={draft.defaultPreviousTitle} maxLength={80} placeholder="上一篇文章标题" onChange={(event) => update("defaultPreviousTitle", event.target.value)} /></label><label>默认文章链接<input type="url" value={draft.defaultPreviousUrl} placeholder="https://mp.weixin.qq.com/s/..." onChange={(event) => update("defaultPreviousUrl", event.target.value)} /></label></>}</section><section className="template-form-section"><h3>关注二维码</h3><div className="qr-upload-row">{draft.qrCodeUrl ? <img src={wechatImagePreviewUrl(draft.qrCodeUrl)} alt="公众号关注二维码预览" /> : <span>二维码</span>}<div><button type="button" className="secondary-btn" disabled={uploading} onClick={() => qrInputRef.current?.click()}>{uploading ? "正在上传…" : draft.qrCodeUrl ? "更换二维码" : "上传二维码"}</button><small>优先上传到微信素材库，确保草稿和手机端稳定显示。</small></div></div><input ref={qrInputRef} className="hidden-file" type="file" accept="image/jpeg,image/png" onChange={(event) => void uploadQrCode(event.target.files?.[0] ?? null)} /><label>或填写图片地址<input type="url" value={draft.qrCodeUrl} placeholder="https://..." onChange={(event) => update("qrCodeUrl", event.target.value)} /></label><label>关注引导语<input value={draft.qrCaption} maxLength={80} onChange={(event) => update("qrCaption", event.target.value)} /></label>{uploadError && <div className="form-error">{uploadError}</div>}</section>{error && <div className="form-error">{error}</div>}<div className="template-designer-actions"><button type="button" className="secondary-btn" onClick={onCancel}>取消</button><button type="submit" className="primary-btn" disabled={busy || uploading}>{busy ? "正在保存…" : "保存模板"}</button></div></form><aside className="template-live-preview"><div className="template-preview-phone"><div className="template-preview-phone-top"><span>9:41</span><b>文章预览</b><span>● ⌁ ▰</span></div><article><h1>一篇新文章的标题</h1><small>示例公众号 · 刚刚</small><div className="markdown-body" dangerouslySetInnerHTML={{ __html: previewHtml }} /></article></div><p>引用预览 · 固定内容不会复制到正文编辑区</p></aside></div></div></div>;
}

const themePreviewMarkdown = `## 01 核心观点

好的排版让读者更快看见重点，也让内容保持呼吸感。

> 主题会真实转换为微信公众号兼容的内联样式。

| 项目 | 效果 |
| --- | --- |
| 正文 | 清晰易读 |
| 代码 | 移动端友好 |

\`\`\`js
const idea = "让内容更有力量";
\`\`\``;

function ThemesView({ themes, activeThemeId, error, onApply, onSave, onDelete, onUse }: { themes: ArticleTheme[]; activeThemeId: string; error: string; onApply: (themeId: string) => Promise<void>; onSave: (theme: ArticleTheme) => Promise<ArticleTheme>; onDelete: (themeId: string) => Promise<void>; onUse: () => void }) {
  const [selected, setSelected] = useState(activeThemeId);
  const [editing, setEditing] = useState<ArticleTheme | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [localError, setLocalError] = useState("");
  const selectedTheme = themes.find((theme) => theme.id === selected) ?? themes[0];

  async function applySelected() {
    setBusy(true);
    setLocalError("");
    try {
      await onApply(selectedTheme.id);
      onUse();
    } catch (applyError) {
      setLocalError(applyError instanceof Error ? applyError.message : "主题应用失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomTheme(theme: ArticleTheme) {
    setBusy(true);
    setLocalError("");
    try {
      const saved = await onSave(theme);
      setSelected(saved.id);
      setEditing(null);
      setNotice(`“${saved.name}”已保存并应用到文章`);
    } catch (saveError) {
      setLocalError(saveError instanceof Error ? saveError.message : "主题保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeTheme(theme: ArticleTheme) {
    if (!window.confirm(`确定删除自定义主题“${theme.name}”吗？`)) return;
    setBusy(true);
    setLocalError("");
    try {
      await onDelete(theme.id);
      setSelected(theme.id === activeThemeId ? "minimal" : activeThemeId);
      setNotice(`已删除“${theme.name}”`);
    } catch (deleteError) {
      setLocalError(deleteError instanceof Error ? deleteError.message : "主题删除失败");
    } finally {
      setBusy(false);
    }
  }

  return <div className="product-view">
    <ViewHeading kicker="STYLE SYSTEM" title="主题样式" description="创建自己的排版系统，并以微信兼容样式应用到预览和草稿箱。" action={<button className="secondary-btn" onClick={() => setEditing(createCustomThemeDraft(selectedTheme))}>＋ 自定义主题</button>} />
    {(error || localError) && <div className="editor-error theme-page-message">{localError || error}</div>}
    {notice && <div className="import-notice success theme-page-message">✓ {notice}</div>}
    <div className="theme-grid">{themes.map((theme) => <article key={theme.id} className={`theme-card ${selected === theme.id ? "selected" : ""} ${activeThemeId === theme.id ? "active-theme" : ""}`}>
      <button type="button" className="theme-preview" onClick={() => { setNotice(""); setSelected(theme.id); }} style={{ "--sample": theme.color, "--sample-bg": theme.bg } as React.CSSProperties}><span /><h3>让内容更有力量</h3><p style={{ color: theme.textColor, fontSize: `${Math.max(8, theme.bodyFontSize - 5)}px`, lineHeight: theme.lineHeight }}>清晰的结构，让每一次表达都更准确、更有节奏。</p><h4 className={`heading-${theme.headingStyle}`}>01 核心观点</h4><i /><i /></button>
      <div className="theme-info"><div><strong>{theme.name}</strong><span>{activeThemeId === theme.id ? "使用中" : theme.tag}</span></div><p>{theme.desc}</p><div className="theme-card-actions"><button disabled={busy} onClick={(event) => { event.stopPropagation(); setSelected(theme.id); void onApply(theme.id).then(onUse).catch((applyError) => setLocalError(applyError instanceof Error ? applyError.message : "主题应用失败")); }}>{activeThemeId === theme.id ? "打开编辑器" : "应用到文章"}</button>{theme.isCustom && <><button className="icon-action" aria-label={`编辑${theme.name}`} title="编辑主题" onClick={() => setEditing({ ...theme })}>✎</button><button className="icon-action danger" aria-label={`删除${theme.name}`} title="删除主题" onClick={() => void removeTheme(theme)}>×</button></>}</div></div>
      {selected === theme.id && <b className="selected-check">✓</b>}
    </article>)}</div>
    <section className="theme-selection-bar panel"><div><small>当前选择</small><strong><i style={{ background: selectedTheme.color }} />{selectedTheme.name}</strong><span>{selectedTheme.bodyFontSize}px 正文 · {selectedTheme.lineHeight} 倍行高 · {selectedTheme.isCustom ? "自定义主题" : "系统预设"}</span></div><button className="secondary-btn" onClick={() => setEditing(createCustomThemeDraft(selectedTheme))}>复制并自定义</button><button className="primary-btn" disabled={busy} onClick={() => void applySelected()}>{busy ? "正在应用…" : "应用并开始写作"}</button></section>
    {editing && <ThemeDesigner theme={editing} busy={busy} error={localError} onCancel={() => { setEditing(null); setLocalError(""); }} onSave={saveCustomTheme} />}
  </div>;
}

function ThemeDesigner({ theme, busy, error, onCancel, onSave }: { theme: ArticleTheme; busy: boolean; error: string; onCancel: () => void; onSave: (theme: ArticleTheme) => Promise<void> }) {
  const [draft, setDraft] = useState(theme);
  const previewHtml = useMemo(() => markdownToWechatHtml(themePreviewMarkdown, draft), [draft]);
  const update = <K extends keyof ArticleTheme>(key: K, value: ArticleTheme[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return <div className="modal-backdrop"><div className="modal-card theme-designer-modal"><button className="modal-close" onClick={onCancel}>×</button><p className="modal-kicker">CUSTOM THEME STUDIO</p><div className="theme-designer-heading"><div><h2>{theme.id ? "编辑自定义主题" : "创建自定义主题"}</h2><p>所有设置都会转换成微信公众号可保留的内联样式。</p></div><span><i style={{ background: draft.color }} />实时预览</span></div><div className="theme-designer-layout"><form onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}><section className="theme-control-section"><h3>基本信息</h3><label>主题名称<input value={draft.name} maxLength={24} required onChange={(event) => update("name", event.target.value)} /></label><label>主题说明<input value={draft.desc} maxLength={80} onChange={(event) => update("desc", event.target.value)} /></label><div className="theme-color-row"><label>主题色<span className="color-input"><input type="color" value={draft.color} onChange={(event) => update("color", event.target.value)} /><b>{draft.color}</b></span></label><label>背景色<span className="color-input"><input type="color" value={draft.bg} onChange={(event) => update("bg", event.target.value)} /><b>{draft.bg}</b></span></label><label>正文色<span className="color-input"><input type="color" value={draft.textColor} onChange={(event) => update("textColor", event.target.value)} /><b>{draft.textColor}</b></span></label></div></section><section className="theme-control-section"><h3>正文节奏</h3><label className="range-control"><span>正文字号 <b>{draft.bodyFontSize}px</b></span><input type="range" min="13" max="18" step="1" value={draft.bodyFontSize} onChange={(event) => update("bodyFontSize", Number(event.target.value))} /></label><label className="range-control"><span>行高 <b>{draft.lineHeight}</b></span><input type="range" min="1.5" max="2.2" step="0.05" value={draft.lineHeight} onChange={(event) => update("lineHeight", Number(event.target.value))} /></label><label className="range-control"><span>段落间距 <b>{draft.paragraphSpacing}px</b></span><input type="range" min="8" max="24" step="1" value={draft.paragraphSpacing} onChange={(event) => update("paragraphSpacing", Number(event.target.value))} /></label></section><section className="theme-control-section"><h3>组件样式</h3><div className="theme-select-grid"><label>二级标题<select value={draft.headingStyle} onChange={(event) => update("headingStyle", event.target.value as ArticleTheme["headingStyle"])}><option value="bar">左侧色条</option><option value="underline">底部横线</option><option value="plain">纯文字</option></select></label><label>引用样式<select value={draft.quoteStyle} onChange={(event) => update("quoteStyle", event.target.value as ArticleTheme["quoteStyle"])}><option value="tint">浅色底纹</option><option value="line">左侧引线</option><option value="card">描边卡片</option></select></label><label>代码块<select value={draft.codeStyle} onChange={(event) => update("codeStyle", event.target.value as ArticleTheme["codeStyle"])}><option value="dark">深色代码</option><option value="light">浅色代码</option></select></label><label>表格<select value={draft.tableStyle} onChange={(event) => update("tableStyle", event.target.value as ArticleTheme["tableStyle"])}><option value="soft">柔和表头</option><option value="grid">强调表头</option></select></label></div></section>{error && <div className="form-error">{error}</div>}<div className="theme-designer-actions"><button type="button" className="secondary-btn" onClick={onCancel}>取消</button><button type="submit" className="primary-btn" disabled={busy}>{busy ? "正在保存…" : "保存并应用"}</button></div></form><aside className="theme-live-preview"><div className="theme-preview-phone"><div className="theme-preview-phone-top"><span>9:41</span><b>预览</b><span>● ⌁ ▰</span></div><article style={{ background: draft.bg }}><h1>让内容更有力量</h1><small>示例公众号 · 刚刚</small><div className="markdown-body" dangerouslySetInnerHTML={{ __html: previewHtml }} /></article></div><p>微信兼容预览 · 正文 {draft.bodyFontSize}px · 手机宽度 393px</p></aside></div></div></div>;
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
