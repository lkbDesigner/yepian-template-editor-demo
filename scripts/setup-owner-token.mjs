// Local owner setup only. This server is never part of the published website.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { writeFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const csrf = randomBytes(32).toString("hex");
const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
let completed = false;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>页间 · 所有者一次性授权</title><style>body{margin:0;background:#f5f5f0;font:15px/1.8 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#263a2c}main{max-width:580px;margin:9vh auto;padding:32px;background:#fff;border-radius:18px}h1{font-size:27px;line-height:1.3}p,li{color:#626c60}input{box-sizing:border-box;width:100%;padding:13px;border:1px solid #ccd2c7;border-radius:8px;font-size:15px}button,a.button{display:inline-block;padding:11px 18px;border:0;border-radius:25px;background:#304f3c;color:#fff;text-decoration:none;font-size:14px;cursor:pointer}button{margin-top:14px}#result{color:#38583b;white-space:pre-wrap}small{color:#7a8275}</style><main><small>仅在你的本机运行 · 访客不会看到此页面</small><h1>给共享保存服务授权一次</h1><p>完成后，所有访客编辑的页面都会直接保存到 <b>lkbDesigner/yepian-template-editor-demo</b>，无需访客登录 GitHub。</p><ol><li>点击下方按钮创建 Fine-grained token。</li><li>Repository access 选择 <b>Only select repositories</b>，仅勾选 <b>yepian-template-editor-demo</b>。</li><li>Repository permissions 确认 <b>Contents: Read and write</b>，生成后复制令牌，填入下方。</li></ol><p><a class="button" href="https://github.com/settings/personal-access-tokens/new?name=Yepian%20Shared%20Save&target_name=lkbDesigner&contents=write&expires_in=30" target="_blank" rel="noreferrer">打开 GitHub 创建专用令牌 ↗</a></p><label for="token">仓库专用令牌</label><input id="token" type="password" autocomplete="new-password" placeholder="github_pat_…"><button id="save">保存本机授权配置</button><p id="result" role="status"></p><small>令牌通过本机接口写入被 Git 忽略的 .env.local，不会提交到仓库或发送到聊天。随后由助手配置到 保存服务的秘密环境变量，并删除本机临时文件。</small></main><script>document.getElementById('save').onclick=async()=>{const button=document.getElementById('save');button.disabled=true;const result=document.getElementById('result');try{const response=await fetch('/configure',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-CSRF':'${csrf}'},body:JSON.stringify({token:document.getElementById('token').value.trim()})});const data=await response.json();if(!response.ok)throw new Error(data.error);document.getElementById('token').value='';result.textContent='本机授权已保存。请回到聊天发送「已完成」，让助手配置云端秘密并清除临时文件。'}catch(error){result.textContent=error.message;button.disabled=false}}</script></html>`;

const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "GET" && req.url === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); return; }
  const reply = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method !== "POST" || req.url !== "/configure") { reply(404, { error: "Not found" }); return; }
  if (completed) { reply(409, { error: "本机授权已保存，请回到聊天继续" }); return; }
  if (req.headers.origin !== "http://127.0.0.1:8766" || req.headers["x-setup-csrf"] !== csrf) { reply(403, { error: "请求来源不正确" }); return; }
  try {
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error("请求过大"); }
    const { token } = JSON.parse(body);
    if (typeof token !== "string" || !/^github_pat_[A-Za-z0-9_]+$/.test(token)) throw new Error("请输入 Fine-grained token（github_pat_ 开头）");
    const response = await fetch("https://api.github.com/repos/lkbDesigner/yepian-template-editor-demo", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Yepian-Owner-Setup" } });
    if (!response.ok) throw new Error("令牌不能访问目标仓库，请检查选择的仓库和有效期");
    await writeFile(envPath, `GITHUB_TOKEN=${token}\n`, { mode: 0o600 });
    await chmod(envPath, 0o600);
    completed = true;
    reply(200, { saved: true });
  } catch (error) { reply(400, { error: error.message === "fetch failed" ? "无法连接 GitHub，请稍后重试" : error.message }); }
});
server.listen(8766, "127.0.0.1", () => console.log("Owner setup is ready at http://127.0.0.1:8766/ (token input is not logged)"));
