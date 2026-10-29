# 页间 · 模板编辑器

浏览模板 → 选择模板 → 编辑空白模块 → 保存到站点所有者的 GitHub 仓库。

网站地址：https://lkbdesigner.github.io/yepian-template-editor-demo/

## 访客体验

- 模板与编辑页包含六个对应模块：首屏、精选内容、品牌故事、特点与价值、资料下载、联系信息。
- 输入后即时预览，支持 PNG、JPEG、GIF、WebP 图片和 PDF。
- 访客无需填写仓库、登录 GitHub 或提供 GitHub 令牌。
- 页面与素材统一保存到 `lkbDesigner/yepian-template-editor-demo`。
- 每个浏览器草稿有独立编号和编辑凭据；编辑凭据保留在本机，仓库仅存 SHA-256 摘要。
- 本机草稿保存在 LocalStorage，文件保存在 IndexedDB。换设备或清除浏览器数据后无法继续编辑原页面。
- 仓库和生成页面公开，请只提交可公开的内容。

## 保存服务

GitHub Pages 负责前端。共享接口 `server/save-worker.mjs` 固定写入站点仓库。当前本机模式通过 `gh` 转发 GitHub API；长期云端部署则使用服务端秘密环境变量 `GITHUB_TOKEN`。

服务地址通过 `site-config.json` 的 `saveServiceUrl` 配置。当前为免注册 Cloudflare Quick Tunnel 测试模式：本机 `node server/local-server.mjs` 提供接口，`cloudflared` 将接口临时公开；使用本机已登录的 gh CLI 完成仓库写入，不提取或分发 GitHub 令牌。电脑、保存进程和通道必须保持运行。通道重启会更换地址，需要同步更新配置。

- `GET /api/status` 返回配置状态，不返回密钥。
- `POST /api/save` 接收字段和文件。访客的 Bearer 凭据用于保护自己的页面，并不是 GitHub 令牌。
- 仓库、分支和目录由服务端固定，请求不能指定其他仓库、任意路径或 HTML 代码。
- 文件类型与签名经过验证，单文件最多 5 MB，总计最多 8 MB。
- 服务端共享渲染器生成 HTML，对文字转义。
- 每次保存通过 Git Trees/Commits/Refs API 创建一条原子提交；并发更新会重试，避免覆盖其他提交。
- 删除的素材在同一次提交中移除。

## 长期云端部署时的所有者配置

创建仅授权本仓库的 Fine-grained personal access token，权限为 **Contents: Read and write**。在保存服务的运行时秘密环境变量中设置 `GITHUB_TOKEN`，重新部署以应用。不要放进前端、公开源码或聊天。配置完成前，页面会提示云端待配置，仍保留本机草稿。

服务端源码在本仓库，`wrangler.toml` 可用于 Cloudflare Workers 部署。Sites 打包构建入口也已保留。构建命令：

```sh
node scripts/bundle-save-worker.mjs /absolute/path/to/service/worker/index.js
```

API 文档：[Git Trees](https://docs.github.com/en/rest/git/trees)、[Commits](https://docs.github.com/en/rest/git/commits)、[References](https://docs.github.com/en/rest/git/refs)。

## 本地开发与验证

```sh
python3 -m http.server 8765 --bind 127.0.0.1
node --test server/save-worker.test.mjs
```

浏览器打开 `http://127.0.0.1:8765`。前端使用 ES modules，需要通过 HTTP 打开。

## 当前临时测试服务

```sh
node server/local-server.mjs
cloudflared tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:8767
```

将输出的临时 HTTPS 地址填入 `site-config.json` 后推送到 GitHub。临时服务仅提供 `/api/status` 和 `/api/save`，不托管本机文件或通用 GitHub 代理。关闭时停止这两个进程即可。

## 手机号与找回码演示登录

当前本地 API 使用 `server/account-service.mjs`：首次注册须输入恰好 11 位 ASCII 数字，服务生成 24 位随机十六进制找回码；同一号码不能重复注册。找回码仅首次展示，用户确认保存后进入编辑。每次重新进入编辑须验证手机号与找回码，会从 GitHub 加载最近保存的文字、图片和 PDF。浏览器只在当前页面内存持有会话，返回模板会撤销会话；会话最长 8 小时。刷新或关闭编辑前请保存。

账号记录保存在本机 `.private/accounts.json`（目录 0700、文件 0600，已忽略 Git），找回码用 scrypt 加盐哈希保存。不得将该目录上传到公开仓库；管理员需私下备份，丢失此文件无法恢复账号映射。编辑文件中的账号信息不会写入公共 GitHub；页面内容仍公开。服务端限制登录尝试次数并校验页面归属，旧的匿名保存凭据不再能访问本地 API。手机号未经短信验证，不代表真实号码所有权。当前不提供自动找回找回码或迁移旧匿名页面功能。

启动仍为 `node server/local-server.mjs`，同时保持 Cloudflare 临时隧道运行。云端永久部署还需迁移此私有账号存储；原独立 Worker 文件仅为历史匿名保存核心，不能单独部署为此账号版服务。
