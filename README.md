# 稿流 DraftFlow

面向微信公众号创作者和内容团队的本地优先工作台：在一个页面内完成 Markdown 导入、公众号兼容排版、多端预览、智能格式审核，并把文章安全同步到微信公众号草稿箱。

> 当前版本定位为单用户/小团队自托管工具。默认不包含登录与权限系统，请勿直接暴露在公开互联网。

## 功能

- 一键导入 `.md` / `.markdown`，自动识别标题和 Front Matter
- 支持标题、列表、任务列表、表格、代码块、引用、链接和图片等 GFM 语法
- 适配微信公众号编辑器的内联样式，提供桌面端及主流手机尺寸预览
- 智能格式审核，以及异常空格、中英文间距和移动端排版修复
- 6 套微信兼容预设主题，并支持可视化创建、编辑和保存自定义主题
- 自定义正文颜色、14px 等字号、行高、段落间距、标题、引用、代码块和表格样式
- 可复用文章模板：固定开场/结尾、上一篇文章入口和公众号关注二维码
- 模板与 Markdown 正文独立保存，新文章可直接引用或自动使用默认模板
- 最多绑定 5 个公众号，并切换当前草稿同步目标
- 上传永久封面素材及正文图片，自动处理微信图片限制
- 调用微信 `draft/add` 接口创建草稿，不自动群发
- 内容雷达：用同一公众号的公开文章建立作者写作画像，并将语气、结构、节奏和论证方式用于原创选题与 Markdown 草稿
- AI 配置支持 OpenAI 兼容接口及 LiteLLM 网关，可在线获取模型列表
- AppSecret、AI API Key 和 access_token 使用 AES-256-GCM 加密存储

## 运行环境

| 依赖 | 要求 |
| --- | --- |
| Node.js | `22.13.0` 或更高版本 |
| npm | `8.19.0` 或更高版本 |
| 浏览器 | Chrome、Edge、Safari、Firefox 的较新版本 |
| 网络 | 使用微信或 AI 功能时，需要能够访问相应接口 |

项目基于 React 19、vinext/Vite、Cloudflare Workers、D1 和 Drizzle ORM。首次本地运行会在项目目录的 `.wrangler/` 下创建本地 D1 数据，不需要单独安装数据库。

## 本地安装

### 1. 获取代码

```bash
git clone https://github.com/zhenliangliang/draftflow.git
cd draftflow
```

### 2. 安装依赖

```bash
npm ci
```

### 3. 创建本地密钥

复制环境变量示例：

```bash
cp .env.example .env.local
```

生成一个 32 字节的随机密钥：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

把输出填入 `.env.local`：

```dotenv
DRAFTFLOW_ENCRYPTION_KEY=这里替换为刚刚生成的密钥
```

这个密钥只保存在服务端，用来加密页面中保存的公众号 AppSecret 和 AI API Key。请勿提交 `.env.local`；如果丢失或更换密钥，已经保存的凭证需要重新配置。

### 4. 启动

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。首次进入相关页面时，应用会自动创建所需的本地数据表。

### 5. 验证生产构建

```bash
npm run lint
npm run test
```

生产模式可使用：

```bash
npm run build
npm run start
```

## 微信公众号配置

1. 登录微信公众平台，在「设置与开发 → 基本配置」中获取 AppID 和 AppSecret。
2. 查询运行 DraftFlow 设备或服务器的公网出口 IP，并添加到公众号 IP 白名单。
3. 确认公众号具备素材管理和草稿箱接口权限。
4. 打开 DraftFlow 的「公众号」页面，填写公众号名称、AppID、AppSecret 和默认作者。
5. 点击验证并保存；验证通过后即可在编辑器中选择封面并同步草稿。
6. 草稿创建后，仍应前往微信公众平台进行最终预览，再决定是否群发。

本机开发时，微信看到的是本机网络的公网出口 IP，而不是 `127.0.0.1`。公司网络、代理、VPN 或动态宽带都可能导致出口 IP 变化。

## AI / LiteLLM 配置

进入「内容雷达 → 配置 AI」，可选择 OpenAI 或 LiteLLM：

- 填写兼容 OpenAI API 的接口地址；LiteLLM 可填写网关根地址或带 `/v1` 的地址。
- 填写 API Key 后点击获取模型，选择网关实际返回的模型名称。
- 保存前会验证接口与模型权限，密钥随后加密写入本地 D1。
- 不配置 AI 时，Markdown 编辑、基础格式审核和规则选题仍然可用。

## 内容雷达与作者画像

1. 在「内容雷达」中添加公众号来源，或直接导入公开的 `mp.weixin.qq.com/s/...` 文章链接并让系统自动识别公众号。
2. 建议为同一公众号导入 2—5 篇有代表性的文章；3 篇以上可以得到更稳定的画像。
3. 勾选同一来源的文章并点击「生成作者画像」，系统会分析内容重心、目标读者、标题机制、开场钩子、结构推进、论证方式、语言特征、节奏和结尾动作。
4. 在「后续写作风格」中选择画像，再生成选题或草稿。画像会同时参与选题结构和正文生成。

微信没有开放任意公众号的完整历史文章流，因此 DraftFlow 只读取用户主动提供的公开文章链接，不抓取登录态或绕过平台限制。风格迁移只使用高层写作特征；提示词会明确禁止复制原句、标志性口头禅、独特案例、个人经历和专有表达，也不会冒充来源作者。

## 数据与安全

- `.env.local`、本地数据库、构建产物和运行日志均已加入 `.gitignore`。
- 自定义主题及当前主题选择保存在本地 D1，不写入源码或浏览器缓存。
- 文章模板、上一篇文章默认信息和二维码地址同样保存在本地 D1。
- 项目不会在前端回显完整 AppSecret 或 AI API Key。
- access_token 会加密缓存并在过期前自动刷新。
- 同步操作只创建公众号草稿，不会自动群发。
- 当前没有用户登录和访问控制。若部署到服务器，请至少使用防火墙、VPN、反向代理认证或零信任访问控制限制访问。
- 正式部署时，应通过托管平台的 Secret 管理功能注入 `DRAFTFLOW_ENCRYPTION_KEY`，不要把密钥写入镜像或仓库。

## 常见问题

### 微信接口提示 IP 不在白名单

以错误消息里显示的服务器出口 IP 为准。关闭或切换代理/VPN 后，出口 IP 可能变化，需要同步更新微信后台白名单。

### 安装后页面能打开，但公众号或内容雷达保存失败

确认使用的是 Node.js 22.13+，`.env.local` 中已设置有效的 `DRAFTFLOW_ENCRYPTION_KEY`，并从项目根目录执行 `npm run dev`。

### 已创建的草稿排版与预览略有差异

微信编辑器会过滤部分 HTML/CSS。DraftFlow 会输出微信兼容的内联样式，但同步后仍建议在微信公众号后台进行一次手机预览。

## 可用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动本地开发服务 |
| `npm run build` | 创建生产构建 |
| `npm run start` | 启动生产构建 |
| `npm run lint` | 检查代码规范 |
| `npm run test` | 构建并运行渲染测试 |
| `npm run db:generate` | 根据数据库结构生成迁移文件 |

## 项目结构

```text
app/        页面、组件和服务端 API
db/         D1/Drizzle 数据结构
drizzle/    数据库迁移记录
lib/        Markdown、微信、AI 和内容雷达逻辑
tests/      自动化测试
worker/     Cloudflare Worker 入口
```

## 贡献

欢迎提交 Issue 和 Pull Request。GitHub Actions 会自动执行代码检查、生产构建和测试。开始开发前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 中的方式报告。

## 开源协议

本项目采用 [MIT License](LICENSE)。
