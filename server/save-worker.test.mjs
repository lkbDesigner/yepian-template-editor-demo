import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest, validatePayload } from "./save-worker.mjs";
import { renderDocument } from "../site-renderer.mjs";

const key = "a".repeat(64);
const siteId = "abcdef012345";
const origin = "https://lkbdesigner.github.io";
const payload = { siteId, fields: { brandName: "测试品牌", heroTitle: "文字与资料" }, assets: [] };
const request = (body = payload, editKey = key, source = origin) => new Request("https://save.example/api/save", { method: "POST", headers: { Origin: source, "Content-Type": "application/json", Authorization: `Bearer ${editKey}` }, body: JSON.stringify(body) });

function fakeGitHub({ previous, conflict = false } = {}) {
  const calls = [];
  let refReads = 0;
  const fetch = async (url, options) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, method: options.method, body });
    if (path.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: `head${++refReads}` } });
    if (/\/git\/commits\/head\d+$/.test(path)) return Response.json({ tree: { sha: "base" } });
    if (path.includes("/contents/")) return previous ? Response.json({ content: Buffer.from(JSON.stringify(previous)).toString("base64") }) : Response.json({ message: "Not Found" }, { status: 404 });
    if (path.endsWith("/git/blobs")) return Response.json({ sha: "assetblob" });
    if (path.endsWith("/git/trees")) return Response.json({ sha: "newtree" });
    if (path.endsWith("/git/commits")) return Response.json({ sha: "newcommit" });
    if (path.endsWith("/git/refs/heads/main")) return conflict && refReads === 1 ? Response.json({}, { status: 422 }) : Response.json({ object: { sha: "newcommit" } });
    throw new Error(`Unexpected request ${path}`);
  };
  return { fetch, calls };
}

test("service is explicit about missing owner authorization", async () => {
  const response = await handleRequest(request(), {});
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /管理员/);
});

test("rejects other origins, missing edit capability, and path traversal", async () => {
  assert.equal((await handleRequest(request(payload, key, "https://other.example"), { GITHUB_TOKEN: "secret" })).status, 403);
  assert.equal((await handleRequest(request(payload, ""), { GITHUB_TOKEN: "secret" })).status, 401);
  assert.throws(() => validatePayload({ ...payload, siteId: "../../index.html" }), /编号/);
  assert.throws(() => validatePayload({ ...payload, assets: [{ key: "index.html", type: "image/png", data: "aGVsbG8=" }] }), /模块/);
  assert.throws(() => validatePayload({ ...payload, assets: [{ key: "heroImage", type: "image/png", data: "aGVsbG8=" }] }), /实际格式/);
});

test("creates one commit in the fixed repository and retries a concurrent update", async () => {
  const fake = fakeGitHub({ conflict: true });
  const input = { ...payload, fields: { ...payload.fields, heroDesc: '<script>alert("x")</script>' }, repository: "other/repo", html: "malicious" };
  const response = await handleRequest(request(input), { GITHUB_TOKEN: "server-only-secret" }, { githubFetch: fake.fetch });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.url, new RegExp(`user-sites/${siteId}/$`));
  const trees = fake.calls.filter(call => call.path.endsWith("/git/trees"));
  assert.equal(trees.length, 2);
  assert.ok(fake.calls.every(call => call.path.startsWith("/repos/lkbDesigner/yepian-template-editor-demo/")));
  const html = trees[0].body.tree.find(entry => entry.path.endsWith("index.html")).content;
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("server-only-secret"));
  assert.ok(!html.includes(key));
  const metadata = JSON.parse(trees[0].body.tree.find(entry => entry.path.endsWith("site.json")).content);
  assert.equal(metadata.editKeyHash.length, 64);
  assert.notEqual(metadata.editKeyHash, key);
  assert.ok(fake.calls.filter(call => call.path.endsWith("/git/refs/heads/main")).every(call => call.body.force === false));
});

test("a different visitor cannot overwrite an existing page", async () => {
  const fake = fakeGitHub({ previous: { editKeyHash: "b".repeat(64), assets: {} } });
  const response = await handleRequest(request(), { GITHUB_TOKEN: "secret" }, { githubFetch: fake.fetch });
  assert.equal(response.status, 403);
  assert.ok(!fake.calls.some(call => call.method !== "GET"));
});

test("supported image and PDF bytes get canonical paths, without raw HTML", () => {
  const checked = validatePayload({ ...payload, assets: [
    { key: "heroImage", name: "../../photo.jpeg", type: "image/jpeg", data: Buffer.from([255, 216, 255, 224]).toString("base64") },
    { key: "resourcePdf", name: "guide.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4\n").toString("base64") }
  ] });
  assert.equal(checked.assets.heroImage.path, "assets/heroImage.jpg");
  const html = renderDocument(checked);
  assert.ok(html.includes('src="assets/heroImage.jpg"'));
  assert.ok(html.includes('href="assets/resourcePdf.pdf"'));
  assert.ok(!html.includes('src="assets/storyImage.bin"'));
});
