# 参与贡献

感谢你愿意改进 DraftFlow。

## 开发流程

1. Fork 仓库并从主分支创建功能分支。
2. 使用 Node.js 22.13+ 和 npm 8.19+。
3. 执行 `npm ci` 安装锁定版本的依赖。
4. 复制 `.env.example` 为 `.env.local`，使用随机生成的本地加密密钥。
5. 修改完成后运行 `npm run lint` 和 `npm run test`。
6. 提交 Pull Request，并说明变更目的、验证方式以及涉及的界面变化。

## 提交建议

- 一个 Pull Request 尽量只解决一个明确问题。
- 不要提交 AppSecret、API Key、access_token、`.env.local` 或本地 D1 数据。
- 微信排版相关修改应同时考虑微信公众号后台编辑器和手机端预览。
- 新功能应补充必要的错误提示、文档和测试。

## 问题反馈

提交 Issue 时，请提供复现步骤、预期结果、实际结果、Node.js 版本和操作系统。日志与截图中请先移除公众号凭证、Token、接口密钥和个人信息。
