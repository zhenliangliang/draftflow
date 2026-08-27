import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the DraftFlow workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>稿流 DraftFlow｜公众号内容工作台<\/title>/i);
  assert.match(html, /公众号内容工作台/);
  assert.match(html, /内容雷达/);
  assert.match(html, /同步草稿箱/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("keeps the open-source runtime contract documented", async () => {
  const [packageJsonText, envExample, gitignore, readme] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.equal(packageJson.name, "draftflow");
  assert.equal(packageJson.license, "MIT");
  assert.match(packageJson.engines.node, /22\.13\.0/);
  assert.match(envExample, /^DRAFTFLOW_ENCRYPTION_KEY=/m);
  assert.match(gitignore, /^\.env\*/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(readme, /npm ci/);
  assert.match(readme, /DRAFTFLOW_ENCRYPTION_KEY/);
  assert.match(readme, /IP 白名单/);
});
