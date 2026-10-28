import { FIELD_KEYS, renderDocument } from "../site-renderer.mjs";

export const REPOSITORY = "lkbDesigner/yepian-template-editor-demo";
const BRANCH = "main";
const PAGES = "https://lkbdesigner.github.io/yepian-template-editor-demo";
const PAGE_ORIGIN = "https://lkbdesigner.github.io";
const KEYS = new Set(["heroImage", "product1Image", "product2Image", "product3Image", "storyImage", "resourcePdf"]);
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_FILE = 5 * 1024 * 1024;
const MAX_TOTAL = 8 * 1024 * 1024;
const MAX_BODY = 12 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function cors(request) {
  const origin = request.headers.get("Origin");
  const ownOrigin = new URL(request.url).origin;
  return origin && (origin === PAGE_ORIGIN || origin === ownOrigin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin" }
    : {};
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

async function limitedJson(request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new HttpError(415, "保存请求必须是 JSON 格式");
  if (Number(request.headers.get("Content-Length")) > MAX_BODY) throw new HttpError(413, "上传内容过大，所有文件合计最多 8 MB");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "缺少页面内容");
  let total = 0;
  const parts = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) { await reader.cancel(); throw new HttpError(413, "上传内容过大，所有文件合计最多 8 MB"); }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, "页面内容格式不正确"); }
}

function checkSignature(binary, type) {
  if (type === "image/png") return binary.startsWith("\x89PNG\r\n\x1a\n");
  if (type === "image/jpeg") return binary.startsWith("\xff\xd8\xff");
  if (type === "image/gif") return binary.startsWith("GIF87a") || binary.startsWith("GIF89a");
  if (type === "image/webp") return binary.startsWith("RIFF") && binary.slice(8, 12) === "WEBP";
  return type === "application/pdf" && binary.startsWith("%PDF-");
}

export function validatePayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "页面内容格式不正确");
  if (!/^[a-f0-9]{12,32}$/.test(input.siteId || "")) throw new HttpError(400, "页面编号不正确");
  if (!input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) throw new HttpError(400, "缺少页面字段");
  const fields = {};
  let textLength = 0;
  for (const key of FIELD_KEYS) {
    const value = input.fields[key] ?? "";
    if (typeof value !== "string" || value.length > 4000) throw new HttpError(400, "每个文字字段最多 4000 字符");
    fields[key] = value;
    textLength += value.length;
  }
  if (textLength > 32000) throw new HttpError(400, "文字内容过长");
  const uploads = input.assets ?? [];
  if (!Array.isArray(uploads) || uploads.length > KEYS.size) throw new HttpError(400, "上传文件数量不正确");
  const assets = {};
  const blobs = [];
  let total = 0;
  for (const asset of uploads) {
    if (!asset || !KEYS.has(asset.key) || assets[asset.key]) throw new HttpError(400, "上传模块不正确");
    if (!TYPES[asset.type] || (asset.key === "resourcePdf") !== (asset.type === "application/pdf")) throw new HttpError(400, "图片支持 PNG、JPEG、GIF、WebP，资料模块支持 PDF");
    if (typeof asset.data !== "string" || !asset.data || asset.data.length > Math.ceil(MAX_FILE / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data) || asset.data.length % 4) throw new HttpError(413, "文件格式不正确或超过 5 MB");
    let binary;
    try { binary = atob(asset.data); } catch { throw new HttpError(400, "上传文件编码不正确"); }
    total += binary.length;
    if (binary.length > MAX_FILE || total > MAX_TOTAL) throw new HttpError(413, "单个文件最多 5 MB，文件合计最多 8 MB");
    if (!checkSignature(binary, asset.type)) throw new HttpError(400, "文件实际格式与声明不一致，请重新上传");
    const ext = TYPES[asset.type];
    const sourceName = typeof asset.name === "string" ? asset.name : asset.key;
    const stem = sourceName.replace(/[\\/\x00-\x1f]/g, "").replace(/\.[^.]*$/, "").slice(0, 100) || asset.key;
    const name = `${stem}.${ext}`;
    const path = `assets/${asset.key}.${ext}`;
    assets[asset.key] = { name, type: asset.type, size: binary.length, path };
    blobs.push({ path, content: asset.data });
  }
  return { siteId: input.siteId, fields, assets, blobs };
}

async function hashKey(key) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

function decodeJson(encoded) {
  const binary = atob(encoded.replace(/\s/g, ""));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
}

export async function saveSubmission(payload, editKey, token, githubFetch = fetch) {
  const root = `user-sites/${payload.siteId}`;
  const editKeyHash = await hashKey(editKey);
  const api = async (path, method = "GET", body) => {
    const response = await githubFetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
      method,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Yepian-Save-Service", "X-GitHub-Api-Version": "2022-11-28" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error("GitHub request failed"); error.upstreamStatus = response.status; throw error; }
    return data;
  };
  let assetTree;
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await api(`/git/ref/heads/${BRANCH}`);
    const parent = await api(`/git/commits/${head.object.sha}`);
    let previous;
    try { previous = decodeJson((await api(`/contents/${root}/site.json?ref=${head.object.sha}`)).content); }
    catch (error) { if (error.upstreamStatus !== 404) throw error; }
    if (previous && previous.editKeyHash !== editKeyHash) throw new HttpError(403, "此页面属于另一个编辑会话，不能覆盖");
    // Verify page ownership before writing any objects; retries reuse immutable blobs.
    if (!assetTree) {
      assetTree = [];
      for (const blob of payload.blobs) {
        const created = await api("/git/blobs", "POST", { content: blob.content, encoding: "base64" });
        assetTree.push({ path: `${root}/${blob.path}`, mode: "100644", type: "blob", sha: created.sha });
      }
    }
    const document = { template: "sunday-studio", siteId: payload.siteId, updatedAt: new Date().toISOString(), editKeyHash, fields: payload.fields, assets: payload.assets };
    const tree = [...assetTree,
      { path: `${root}/site.json`, mode: "100644", type: "blob", content: JSON.stringify(document, null, 2) },
      { path: `${root}/index.html`, mode: "100644", type: "blob", content: renderDocument(payload) }
    ];
    const currentPaths = new Set(tree.map(entry => entry.path));
    for (const old of Object.values(previous?.assets || {})) {
      if (typeof old.path === "string" && /^assets\/(heroImage|product[123]Image|storyImage|resourcePdf)\.(png|jpg|gif|webp|pdf)$/.test(old.path) && !currentPaths.has(`${root}/${old.path}`)) tree.push({ path: `${root}/${old.path}`, mode: "100644", type: "blob", sha: null });
    }
    const createdTree = await api("/git/trees", "POST", { base_tree: parent.tree.sha, tree });
    const commit = await api("/git/commits", "POST", { message: `Save visitor page ${payload.siteId}`, tree: createdTree.sha, parents: [head.object.sha] });
    try { await api(`/git/refs/heads/${BRANCH}`, "PATCH", { sha: commit.sha, force: false }); }
    catch (error) { if ([409, 422].includes(error.upstreamStatus) && attempt < 2) continue; throw error; }
    return { saved: true, siteId: payload.siteId, url: `${PAGES}/${root}/`, commitUrl: `https://github.com/${REPOSITORY}/commit/${commit.sha}` };
  }
}

export async function handleRequest(request, env, options = {}) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  if (url.pathname === "/api/status" && request.method === "GET") return json(request, { ready: !!env.GITHUB_TOKEN, repository: REPOSITORY });
  if (url.pathname !== "/api/save") return json(request, { service: "页间共享保存服务" }, 404);
  if (request.method !== "POST") return json(request, { error: "不支持此请求方法" }, 405);
  if (!cors(request)["Access-Control-Allow-Origin"]) return json(request, { error: "请求来源不被允许" }, 403);
  const key = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!key) return json(request, { error: "缺少页面编辑凭据，请刷新页面重试" }, 401);
  if (!env.GITHUB_TOKEN) return json(request, { error: "云端保存尚待站点管理员完成授权配置" }, 503);
  try {
    const payload = validatePayload(await limitedJson(request));
    return json(request, await saveSubmission(payload, key, env.GITHUB_TOKEN, options.githubFetch));
  } catch (error) {
    if (error instanceof HttpError) return json(request, { error: error.message }, error.status);
    return json(request, { error: "仓库暂时无法接收保存，请稍后重试" }, 502);
  }
}

export default { fetch: handleRequest };
