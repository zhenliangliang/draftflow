# 安全策略

## 报告安全问题

请不要在公开 Issue 中披露尚未修复的漏洞、AppSecret、API Key 或 access_token。仓库启用 GitHub Security Advisories 后，请通过仓库的 **Security → Report a vulnerability** 私下报告。

报告中可包含受影响版本、复现步骤、风险说明和建议修复方式，但请使用无效的测试凭证。

## 部署边界

DraftFlow 当前是单用户/小团队自托管工具，没有内置登录和权限系统。公开部署前必须增加访问控制，并通过托管平台的 Secret 管理能力保存 `DRAFTFLOW_ENCRYPTION_KEY`。
