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
