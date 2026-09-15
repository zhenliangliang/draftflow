import assert from "node:assert/strict";
import test from "node:test";

import { markdownToWechatHtml } from "../lib/markdown.ts";
import { defaultTheme } from "../lib/themes.ts";

function extractWechatCodeBlocks(html) {
  const blocks = [];
  const startPattern = /<section\b[^>]*\bdata-code-block="true"[^>]*>/gi;
  let start;
  while ((start = startPattern.exec(html))) {
    const sectionPattern = /<\/?section\b[^>]*>/gi;
    sectionPattern.lastIndex = start.index + start[0].length;
    let depth = 1;
    let tag;
    while ((tag = sectionPattern.exec(html))) {
      depth += /^<\/section/i.test(tag[0]) ? -1 : 1;
      if (depth !== 0) continue;
      blocks.push(html.slice(start.index, sectionPattern.lastIndex));
      startPattern.lastIndex = sectionPattern.lastIndex;
      break;
    }
  }
  return blocks;
}

function codeBlockText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/(?:&nbsp;|&#160;|&#xa0;)/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function simulateWechatEditorNormalization(html, brReplacement) {
  return html
    // WeChat does not promise to preserve application metadata.
    .replace(/\sdata-[\w:-]+(?:="[^"]*"|'[^']*'|=[^\s>]+)?/gi, "")
    // Model the style declarations most likely to be removed or rewritten by
    // the editor. Source-line separation must remain correct without them.
    .replace(/\sstyle="([^"]*)"/gi, (_match, style) => {
      const kept = style
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => !/^(?:display|white-space|word-break|overflow(?:-x|-wrap)?|letter-spacing|word-spacing)\s*:/i.test(part))
        .join(";");
      return kept ? ` style="${kept}"` : "";
    })
    .replace(/<br\s*\/?>/gi, brReplacement);
}

function structuralTextLines(html) {
  const withBlockBoundaries = html
    .replace(/<\/(?:p|div|section|li|blockquote|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return codeBlockText(withBlockBoundaries)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}

function assertTokensInOrder(text, tokens) {
  let cursor = -1;
  for (const token of tokens) {
    const next = text.indexOf(token, cursor + 1);
    assert.ok(next > cursor, `expected ${JSON.stringify(token)} after offset ${cursor}`);
    cursor = next;
  }
}

const comparisonTable = `
| 维度 | **工具 A** | **工具 B** | **工具 C** | **工具 D** | **工具 E** |
|------|------------|------------|------------|------------|------------|
| 定位 | 全栈观测入口 | 指标查询 | 官方服务 | 日志查询 | 传统监控 |
| 工具数 | 80+ | 6 | 20+ | 1 | 237 |
| 维护方 | 官方 | 社区 | 官方 | 官方 | 社区 |
`;

const recordTable = `
| 工具类别 | 代表工具 | 运维场景 |
|----------|----------|----------|
| Dashboard | \`search_dashboards\` | 搜索并读取看板 |
| 告警管理 | \`list_alert_rules\` | 查看告警并降噪 |
`;

test("renders wide Markdown tables as readable mobile cards", () => {
  const html = markdownToWechatHtml(`
> 这是开场摘要，用于快速交代背景。

## 01 五大项目速览

${comparisonTable}

### 核心能力

${recordTable}
`, defaultTheme);

  assert.match(html, /font-size:14px/);
  assert.match(html, /<h2[^>]*><b>▍ 01 五大项目速览<\/b><\/h2>/);
  assert.match(html, /<h3><b>◆ 核心能力<\/b><\/h3>/);
  assert.doesNotMatch(html, /<table\b/);
  assert.match(html, /<b>▍ 工具 A<\/b>/);
  assert.match(html, /定位：全栈观测入口/);
  assert.match(html, /<b>Dashboard<\/b><br>代表工具：<code>search_dashboards<\/code>/);
  assert.equal((html.match(/全栈观测入口/g) ?? []).length, 1);
  assert.doesNotMatch(html, /text-align:\s*justify|word-break:\s*break-all/i);
});

test("prevents WeChat justification from stretching English word spacing", () => {
  const html = markdownToWechatHtml(`
- **LLM 提供商**：Anthropic、OpenAI、Codex、Ollama、Gemini、OpenRouter、NVIDIA NIM、Bedrock
- **可观测性**：Grafana 全家桶（Loki/Mimir/Tempo）、Datadog、Honeycomb、Coralogix、CloudWatch、Sentry、Elasticsearch、Splunk、New Relic

[上一篇文章](https://mp.weixin.qq.com/s/example)
`, defaultTheme);
  const rootStyle = html.match(/^<section style="([^"]+)"/)?.[1] ?? "";

  assert.match(rootStyle, /text-align:left/);
  assert.match(rootStyle, /letter-spacing:normal/);
  assert.match(rootStyle, /word-spacing:0/);
  assert.match(rootStyle, /word-break:normal/);
  assert.match(rootStyle, /overflow-wrap:break-word/);
  assert.doesNotMatch(rootStyle, /text-align:justify|overflow-wrap:anywhere|word-break:break-all/);
  assert.match(html, /Anthropic、OpenAI、Codex、Ollama/);
  assert.match(html, /<a href="https:\/\/mp\.weixin\.qq\.com\/s\/example">上一篇文章<\/a>/);
});

test("keeps real code publishable and turns arrow workflows into mobile steps", () => {
  const html = markdownToWechatHtml(`
### 配置示例

\`\`\`json
{"token":"<your-token>"}
\`\`\`

\`\`\`
K8s 集群运行中 → Prometheus 采集 metrics
        ↓
OpenCost 引擎：metrics × 云厂商定价 = 精确成本分配
        ↓
AI 分析："frontend namespace 的 CPU request 利用率仅 8%，
         建议从 4 核降到 1 核，每月节省 $1,200"
        ↓
运维工程师审批 → 应用变更
\`\`\`

[外部仓库](https://github.com/example/project)

[上一篇文章](https://mp.weixin.qq.com/s/example)
`, defaultTheme);

  assert.equal((html.match(/<pre\b/g) ?? []).length, 0);
  assert.equal(extractWechatCodeBlocks(html).length, 1);
  assert.match(html, /<b>JSON<\/b>/);
  assert.match(html, /&lt;your-token&gt;/);
  assert.match(html, /<b>工作流程<\/b>/);
  assert.match(html, /<b>1\.<\/b> K8s 集群运行中/);
  assert.match(html, /<b>2\.<\/b> Prometheus 采集 metrics/);
  assert.match(html, /<b>3\.<\/b> OpenCost 引擎：metrics × 云厂商定价 = 精确成本分配/);
  assert.match(html, /<b>4\.<\/b> AI 分析：&quot;frontend namespace 的 CPU request 利用率仅 8%， 建议从 4 核降到 1 核，每月节省 \$1,200&quot;/);
  assert.match(html, /<b>5\.<\/b> 运维工程师审批/);
  assert.match(html, /<b>6\.<\/b> 应用变更/);
  const workflowHtml = html.slice(html.indexOf("K8s 集群运行中"));
  assert.doesNotMatch(workflowHtml, /<pre\b|data-code-block="true"|font-family:\s*monospace|\n {2,}→/i);
  assert.match(html, /<u>外部仓库<\/u>/);
  assert.match(html, /<a href="https:\/\/mp\.weixin\.qq\.com\/s\/example">上一篇文章<\/a>/);
});

test("renders shell and HCL with WeChat-stable line breaks and indentation", () => {
  const html = markdownToWechatHtml(`
\`\`\`bash
helm repo add opencost https://opencost.github.io/opencost-helm-chart
helm install opencost opencost/opencost \\
  --namespace opencost --create-namespace \\
  --set opencost.mcp.enabled=true \\
  --set opencost.mcp.port=8081

curl http://localhost:9003/allocation/compute?window=60m
kubectl port-forward --namespace opencost service/opencost 9003 9090
\`\`\`

\`\`\`hcl
resource "aws_eks_node_group" "gpu" {
  instance_types = ["g5.xlarge"]  # AI 选择了 g5 而非 p4（成本考虑）
  scaling_config {
    max_size     = 2              # 限制最大规模，防止预算超标
  }
}
\`\`\`
`, defaultTheme);

  const codeBlocks = extractWechatCodeBlocks(html);
  assert.equal(codeBlocks.length, 2);
  assert.doesNotMatch(html, /<pre\b/i);

  for (const codeBlock of codeBlocks) {
    const styles = Array.from(codeBlock.matchAll(/style="([^"]*)"/gi), (match) => match[1]).join(";");
    assert.match(styles, /white-space:\s*normal/i);
    assert.match(styles, /overflow-wrap:\s*break-word/i);
    assert.match(styles, /word-break:\s*normal/i);
    assert.match(styles, /text-align:\s*left/i);
    assert.match(styles, /letter-spacing:\s*0(?:;|$)/i);
    assert.match(styles, /word-spacing:\s*0(?:;|$)/i);
    assert.doesNotMatch(styles, /white-space:\s*(?:pre|pre-wrap)|overflow-x:\s*auto|word-break:\s*break-all/i);
    assert.ok(
      (codeBlock.match(/<br\s*\/?>|<(?:p|section)\b[^>]*>/gi) ?? []).length >= 4,
      "source lines need explicit HTML boundaries",
    );
    assert.doesNotMatch(codeBlock, /[\r\n]/, "code layout must not depend on raw HTML newlines");
  }

  const [bashBlock, hclBlock] = codeBlocks;
  assert.match(bashBlock, /<b>BASH<\/b>/);
  assert.match(hclBlock, /<b>HCL<\/b>/);
  const nbsp = "(?:\\u00a0|&nbsp;|&#160;|&#xa0;)";
  const lineBoundary = "(?:<br\\s*/?>|<(?:p|section)(?:\\s[^>]*)?>)";
  const lineEnd = "(?:<\\/(?:p|section)>)?";
  assert.match(bashBlock, new RegExp(`${lineBoundary}\\s*(?:${nbsp}){2}--namespace`, "iu"));
  assert.match(bashBlock, new RegExp(`${lineBoundary}\\s*(?:${nbsp}){2}--set opencost\\.mcp\\.enabled=true`, "iu"));
  assert.match(bashBlock, new RegExp(`--set opencost\\.mcp\\.port=8081${lineEnd}${lineBoundary}${nbsp}${lineEnd}${lineBoundary}curl`, "iu"));
  assert.match(hclBlock, new RegExp(`${lineBoundary}\\s*(?:${nbsp}){2}instance_types`, "iu"));
  assert.match(hclBlock, new RegExp(`${lineBoundary}\\s*(?:${nbsp}){4}max_size`, "iu"));

  const bashText = codeBlockText(bashBlock);
  assertTokensInOrder(bashText, [
    "helm repo add opencost https://opencost.github.io/opencost-helm-chart",
    "helm install opencost opencost/opencost \\",
    "--namespace opencost --create-namespace \\",
    "--set opencost.mcp.enabled=true \\",
    "--set opencost.mcp.port=8081",
    "curl http://localhost:9003/allocation/compute?window=60m",
    "kubectl port-forward --namespace opencost service/opencost 9003 9090",
  ]);
  assert.equal(bashText.split("\\").length - 1, 3);

  const hclText = codeBlockText(hclBlock);
  assertTokensInOrder(hclText, [
    'resource "aws_eks_node_group" "gpu" {',
    'instance_types = ["g5.xlarge"]',
    "# AI 选择了 g5 而非 p4（成本考虑）",
    "scaling_config {",
    "max_size = 2",
    "# 限制最大规模，防止预算超标",
    "}",
    "}",
  ]);

  // WeChat stretches the large run of alignment spaces in a narrow article.
  // Trailing HCL comments must therefore become explicit, indented visual lines.
  assert.match(hclBlock, new RegExp(`g5\\.xlarge&quot;\\]\\s*${lineEnd}${lineBoundary}\\s*(?:${nbsp}){2,}# AI 选择了 g5`, "iu"));
  assert.match(hclBlock, new RegExp(`= 2\\s*${lineEnd}${lineBoundary}\\s*(?:${nbsp}){4,}# 限制最大规模`, "iu"));
  assert.doesNotMatch(hclBlock, new RegExp(`g5\\.xlarge&quot;\\](?: |${nbsp})+#`, "iu"));
  assert.doesNotMatch(hclBlock, new RegExp(`= 2(?: |${nbsp})+#`, "iu"));
});

test("keeps HCL source lines separate after WeChat strips br, data attributes, and layout styles", () => {
  const html = markdownToWechatHtml(`
\`\`\`hcl
# AI 生成的 Terraform（已内置 FinOps 约束）
resource "aws_eks_node_group" "gpu" {
  instance_types = ["g5.xlarge"]  # AI 选择了 g5 而非 p4（成本考虑）

  scaling_config {
    desired_size = 1
    max_size     = 2              # 限制最大规模，防止预算超标
    min_size     = 1
  }

  labels = {
    team        = "payments"      # 强制标签
    env         = "prod"          # 强制标签
    cost-center = "risk-model"    # 强制标签
  }
}
\`\`\`
`, defaultTheme);
  const [hclBlock] = extractWechatCodeBlocks(html);
  assert.ok(hclBlock, "expected a rendered HCL code block");

  for (const brReplacement of ["", "<wbr>"]) {
    const normalized = simulateWechatEditorNormalization(hclBlock, brReplacement);
    assert.doesNotMatch(normalized, /data-code-block|white-space|word-break|overflow-wrap|letter-spacing|word-spacing/i);

    const lines = structuralTextLines(normalized);
    const expectedLines = [
      "# AI 生成的 Terraform（已内置 FinOps 约束）",
      'resource "aws_eks_node_group" "gpu" {',
      'instance_types = ["g5.xlarge"]',
      "# AI 选择了 g5 而非 p4（成本考虑）",
      "scaling_config {",
      "desired_size = 1",
      "max_size = 2",
      "# 限制最大规模，防止预算超标",
      "min_size = 1",
      "labels = {",
      'team = "payments"',
      "# 强制标签",
      'env = "prod"',
      "# 强制标签",
      'cost-center = "risk-model"',
      "# 强制标签",
    ];

    let previous = -1;
    for (const expected of expectedLines) {
      const current = lines.findIndex((line, index) => index > previous && line === expected);
      assert.ok(current > previous, `${expected} must remain its own visual line after WeChat normalization`);
      previous = current;
    }

    assert.doesNotMatch(lines.join("\n"), /g5\.xlarge"\][ \t\u00a0]+# AI/u);
    assert.doesNotMatch(lines.join("\n"), /max_size = 2[ \t\u00a0]+# 限制最大规模/u);
    assert.doesNotMatch(lines.join("\n"), /payments"[ \t\u00a0]+# 强制标签/u);
    assert.doesNotMatch(lines.join("\n"), /instance_types.*scaling_config|desired_size.*max_size|env = "prod".*cost-center/u);
  }
});

test("keeps mixed Chinese and English content naturally wrapable on narrow phones", () => {
  const html = markdownToWechatHtml(`
在生产环境中，Prometheus Alertmanager Notification Pipeline 会把告警发送到 incident-response-service，并由 AI Agent 生成中文处置建议。

- **LLM 提供商**：Anthropic、OpenAI、Codex、Ollama、Gemini、OpenRouter、NVIDIA NIM、Bedrock
- **可观测性**：Grafana、OpenTelemetry、CloudWatch、Elasticsearch、New Relic

\`\`\`yaml
notification_endpoint: https://monitoring.example.com/api/v1/alertmanager/incidents/callback
\`\`\`

\`\`\`
你："Write Terraform for an RDS PostgreSQL instance for our payments
     service in us-east-1. Required tags: team=payments, env=prod,
     cost-center=platform. Budget: $500/month."

Claude（通过 MCP 调用 Infracost）：
  → 生成 db.t3.medium 而非 db.r5.xlarge（因为预算限制）
  → 自动添加 team, env, cost-center 三个标签
\`\`\`
`, defaultTheme);

  const rootStyle = html.match(/^<section style="([^"]*)">/)?.[1] ?? "";
  assert.match(rootStyle, /overflow-wrap:\s*break-word/i);
  assert.doesNotMatch(html, /text-align(?:-last)?\s*:\s*justify|text-justify\s*:|word-break\s*:\s*(?:break-all|keep-all)|white-space\s*:\s*nowrap/i);

  for (const [, style] of html.matchAll(/\sstyle="([^"]*)"/gi)) {
    for (const property of ["letter-spacing", "word-spacing"]) {
      const value = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i").exec(style)?.[1].trim();
      if (value) assert.match(value, /^(?:normal|0(?:\.0+)?(?:px|em|rem)?)$/i, `${property} must not stretch mixed-language text`);
    }
  }

  assert.match(html, /<p>在生产环境中，Prometheus Alertmanager Notification Pipeline/);
  assert.match(html, /<li><b>LLM 提供商<\/b>：Anthropic、OpenAI、Codex/);
  assert.match(html, /<li><b>可观测性<\/b>：Grafana、OpenTelemetry、CloudWatch/);

  const codeBlocks = extractWechatCodeBlocks(html);
  assert.equal(codeBlocks.length, 1);
  assert.match(codeBlocks[0], /white-space:\s*normal/i);
  assert.match(codeBlocks[0], /overflow-wrap:\s*break-word/i);
  assert.match(codeBlocks[0], /<br\s*\/?>|notification_endpoint:/i);
  assert.doesNotMatch(codeBlocks[0], /<pre\b|overflow-x:\s*auto|white-space:\s*(?:pre|pre-wrap)|word-break:\s*(?:break-all|keep-all)/i);
  assert.match(html, /notification_endpoint: https:\/\/monitoring\.example\.com\/api\/v1\/alertmanager\/incidents\/callback/);
  assert.match(html, /<b>对话示例<\/b>/);
  assert.match(html, /<b>你：<\/b> &quot;Write Terraform for an RDS PostgreSQL instance for our payments service in us-east-1\. Required tags: team=payments, env=prod, cost-center=platform\. Budget: \$500\/month\.&quot;/);
  assert.match(html, /<b>Claude（通过 MCP 调用 Infracost）：<\/b>/);
  assert.match(html, /↳ 生成 db\.t3\.medium 而非 db\.r5\.xlarge（因为预算限制）<br>↳ 自动添加 team, env, cost-center 三个标签/);
  const conversationHtml = html.slice(html.indexOf("Write Terraform for an RDS PostgreSQL"));
  assert.doesNotMatch(conversationHtml, /<pre\b|data-code-block="true"|font-family:\s*monospace/i);
});

test("turns a two-lane text architecture into readable mobile cards", () => {
  const html = markdownToWechatHtml(`
\`\`\`
   ┌─ Infracost ─────────────────────────────┐     ┌─ OpenCost ──────────────────────┐
   │                                         │     │                                  │
   │  写 Terraform → 成本估算 → FinOps 检查   │     │  Pod 运行 → 成本分配 → 效率诊断   │
   │  → PR 评论 → 合并 → 部署                  │ ──→ │  → GPU 追踪 → 异常告警 → 优化建议 │
   │                                         │     │                                  │
   └─────────────────────────────────────────┘     └──────────────────────────────────┘
                    ↑                                          ↑
                    │            ┌─────────────┐               │
                    └────────────│  AI Agent   │───────────────┘
                                 │ (MCP 接入)   │
                                 └─────────────┘
\`\`\`
`, defaultTheme);

  assert.doesNotMatch(html, /<pre\b|data-code-block="true"/);
  assert.match(html, /能力架构 · 移动端适配/);
  assert.match(html, /AI Agent · MCP 接入/);
  assert.match(html, /1\. Infracost/);
  assert.match(html, /写 Terraform → 成本估算 → FinOps 检查 → PR 评论 → 合并 → 部署/);
  assert.match(html, /2\. OpenCost/);
  assert.match(html, /Pod 运行 → 成本分配 → 效率诊断 → GPU 追踪 → 异常告警 → 优化建议/);
  assert.doesNotMatch(html, /┌|└|────────/);
});

test("turns an Infracost text report into a WeChat-safe status card", () => {
  const html = markdownToWechatHtml(`
\`\`\`
PR #142 自动评论：
┌─────────────────────────────────────────────────┐
│ 💰 Infracost Cost Estimate                       │
│                                                  │
│ Monthly cost: $2,680                             │
│ Budget:     $3,000 ✅ Within budget               │
│                                                  │
│ FinOps checks:                                   │
│ ✅ Required tags present                         │
│ ✅ Instance type within policy                   │
│ ⚠️ Consider g5.xlarge spot instances (-60% cost) │
└─────────────────────────────────────────────────┘
\`\`\`
`, defaultTheme);

  assert.doesNotMatch(html, /<pre\b|data-code-block="true"|white-space:pre|overflow-x:auto/);
  assert.doesNotMatch(html, /[┌┐└┘│─]/u);
  assert.match(html, /PR #142 自动评论：/);
  assert.match(html, /💰 Infracost Cost Estimate/);
  assert.match(html, /<b>Monthly cost:<\/b> \$2,680/);
  assert.match(html, /<b>Budget:<\/b> \$3,000 ✅ Within budget/);
  assert.match(html, /FinOps checks:/);
  assert.match(html, /✅ Required tags present/);
  assert.match(html, /✅ Instance type within policy/);
  assert.match(html, /⚠️ Consider g5\.xlarge spot instances \(-60% cost\)/);
});

test("keeps OpenCost report metrics and numbered recommendation details together", () => {
  const html = markdownToWechatHtml(`
\`\`\`text
分析结果：
┌─────────────────────────────────────────────────┐
│ risk-model namespace · 过去 14 天                 │
│                                                  │
│ 实际花费：$1,190（推算月度 $2,550）                │
│ GPU 利用率：平均 34%，峰值 78%                     │
│ CPU request 利用率：12%（严重过量配置）              │
│                                                  │
│ 建议：                                            │
│ 1. 将 sidecar proxy 的 CPU request 从 500m → 100m │
│    预计节省 $180/月                                │
│ 2. 为推理服务启用 Karpenter 弹性伸缩                │
│    低峰期缩至 0，预计节省 $620/月                    │
│ 3. 总优化空间：$800/月（30%）                       │
└─────────────────────────────────────────────────┘
\`\`\`
`, defaultTheme);

  assert.doesNotMatch(html, /<pre\b|data-code-block="true"|white-space:pre|overflow-x:auto/);
  assert.doesNotMatch(html, /[┌┐└┘│─]/u);
  assert.match(html, /分析结果：/);
  assert.match(html, /risk-model namespace · 过去 14 天/);
  assert.match(html, /<b>实际花费：<\/b> \$1,190（推算月度 \$2,550）/);
  assert.match(html, /<b>GPU 利用率：<\/b> 平均 34%，峰值 78%/);
  assert.match(html, /<b>CPU request 利用率：<\/b> 12%（严重过量配置）/);
  assert.match(html, /<b>1\.<\/b> 将 sidecar proxy 的 CPU request 从 500m → 100m<br><span[^>]*>预计节省 \$180\/月<\/span>/);
  assert.match(html, /<b>2\.<\/b> 为推理服务启用 Karpenter 弹性伸缩<br><span[^>]*>低峰期缩至 0，预计节省 \$620\/月<\/span>/);
  assert.match(html, /<b>3\.<\/b> 总优化空间：\$800\/月（30%）/);
});

test("preserves non-card text diagrams without wrapping or re-indenting", () => {
  const diagram = `┌──────────────────────────────┐
│ 采集层：Prometheus / Loki    │
└──────────────┬───────────────┘
               │ 指标 / 日志
               ▼
┌──────────────────────────────┐
│ AI Agent：关联分析与根因定位 │
└──────────────────────────────┘`;
  const html = markdownToWechatHtml(`\`\`\`text\n${diagram}\n\`\`\``, defaultTheme);

  assert.match(html, /<b>能力架构<\/b>/);
  assert.match(html, /white-space:pre;/);
  assert.match(html, /overflow-x:auto;/);
  assert.match(html, /overflow-wrap:normal;/);
  assert.match(html, /word-break:normal;/);
  assert.doesNotMatch(html, /white-space:pre-wrap/);
  assert.match(html, /\n {15}│ 指标 \/ 日志\n {15}▼\n/);
});

test("keeps a long technical article below the WeChat HTML limit", () => {
  const sections = Array.from({ length: 16 }, (_, index) => `
## ${String(index + 1).padStart(2, "0")} 技术方案 ${index + 1}

这一节说明指标、日志、告警与自动化处置之间的关系。内容包含 Prometheus、Grafana、Loki 和 AI Agent 的协作方式，并保留足够多的正文用于模拟真实长文。

部署时还需要考虑权限边界、网络连通性、查询成本和故障回退。生产环境应优先使用只读凭证，并按团队职责拆分工具范围，避免自动化操作越过安全边界。

当告警出现时，系统先读取指标趋势，再关联同一时间窗口内的日志与变更记录，最后输出证据、判断和建议动作，让值班人员能够快速复核而不是盲目执行。

### 核心能力

- 查询结构化指标并分析异常趋势
- 关联日志与告警上下文
- 输出可执行的排障建议

\`\`\`
告警触发 → AI Agent 读取上下文
        → 查询监控数据
        → 生成分析报告
\`\`\`
`).join("\n");
  const markdown = `> 长文摘要\n\n${comparisonTable}\n\n${recordTable}\n\n${sections}`;
  const html = markdownToWechatHtml(markdown, defaultTheme);

  assert.ok(markdown.length > 6_000);
  assert.ok(html.length < 19_300, `rendered HTML is ${html.length} characters`);
  assert.equal((html.match(/<h2\b/g) ?? []).length, 16);
  assert.equal((html.match(/<pre\b/g) ?? []).length, 0);
  assert.equal(extractWechatCodeBlocks(html).length, 0);
  assert.equal((html.match(/AI Agent 读取上下文/g) ?? []).length, 16);
  assert.equal((html.match(/查询监控数据/g) ?? []).length, 16);
  assert.equal((html.match(/生成分析报告/g) ?? []).length, 16);
  assert.match(html, /技术方案 16/);
});
