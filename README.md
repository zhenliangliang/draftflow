# 稿流 DraftFlow

面向微信公众号团队的内容创作、排版、预览与草稿箱同步工作台。

## 当前能力

- `.md` / `.markdown` 文件一键导入，自动识别标题与 Front Matter
- GFM Markdown 编辑与微信公众号手机端预览（标题、列表、任务列表、表格、代码块、引用、链接与图片等）
- 智能格式审核、发布评分与异常空格/中英文间距一键修复
- 最多绑定 5 个公众号，并切换当前草稿同步目标
- 内容雷达：订阅公众号/RSS、导入公开文章、预测热度与推荐选题
- 可配置 AI 热点归因和原创 Markdown 草稿生成
- 6 套微信兼容排版主题
- AppID / AppSecret 真实连通验证
- AppSecret 与 access_token 的 AES-256-GCM 加密存储
- access_token 缓存与自动刷新
- 永久封面素材上传，超过微信限制时自动压缩并使用兼容文件名
- 正文图片上传并转换为微信可用地址
- 真实调用 `draft/add` 创建公众号草稿
- 同步成功与失败记录
- 发布保护：只创建草稿，不自动群发

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，进入「公众号」页面配置公众号信息。

如需启用 AI 内容分析，在 `.env.local` 中配置 `OPENAI_API_KEY`、`OPENAI_MODEL` 和 `OPENAI_BASE_URL`。未配置时仍可使用基础热度评分、规则选题和提纲生成功能。

## 微信后台准备

1. 在微信公众平台「设置与开发 → 基本配置」获取 AppID 和 AppSecret。
2. 把运行 DraftFlow 的公网出口 IP 加入公众号 IP 白名单。
3. 确认账号具备素材管理和草稿箱接口权限。
4. 在 DraftFlow 中验证并保存凭证。
5. 在编辑器选择封面，点击「同步到草稿箱」。
6. 前往微信公众平台完成最终预览和群发。

## 安全说明

- `.env.local` 中的 `DRAFTFLOW_ENCRYPTION_KEY` 用于本地凭证加密，已被 Git 忽略。
- 不要把 AppSecret 写入前端代码、聊天记录或版本库。
- 更换加密密钥后，已有凭证无法解密，需要在界面中重新配置。
- 正式部署时应通过托管平台的 Secret 管理能力注入加密密钥。

## 验证

```bash
npm run lint
npm run build
```
