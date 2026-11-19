# 当前测试：私有草稿保存 + GitHub

当前使用本机登录保存服务，不调用腾讯云。首页是 `portfolio-test/0.design 首页/index.html`。

## 保存规则

- 自动保存仅写入当前浏览器 IndexedDB；点击“保存”或 Cmd/Ctrl+S，将完整编辑数据、图片、简历、作品原件、原始链接及制作备注保存到私有资料仓库 `lkbDesigner/yepian-template-editor-data`。
- 保存状态固定为“编辑中”。不生成公开 HTML，不更新旧网页，也不返回公开网站链接。审核、发布流程尚未接入。
- 旧的“提交 HTML 即发布”请求会被拒绝；旧 Sunday `/api/save` 公开保存路由已停用。旧公开网页只保留查看入口。
- 每次上传前确认资料仓库为私有；服务端固定仓库及账号路径，不接受客户端指定用户归属或仓库。附件引用带账号和模板绑定校验，其他账号无法通过猜测 SHA 读取。
- 附件单独上传，草稿 JSON 保存引用。图片/简历沿用界面 10 MB 限制，制作附件单个最多 50 MB，单模板去重后附件最多 500 MB，文字和结构 JSON 最多 4 MB。
- 保存使用 Git 提交版本校验。同一模板有较新版本时，旧标签页保存返回冲突，本机修改不会清空。重复提交相同内容可安全恢复保存结果。

私有仓库目录：

```text
templates/<账号随机ID>/<草稿UUID>/
  draft.json               完整可编辑状态与附件引用
  metadata.json            标题、保存时间、编辑状态和版本
  attachments/<blob SHA>   附件原始字节
```

## 管理员身份

管理员身份只由服务端私有账号记录指定，绑定现有账号，不按客户端声明授权。注册和登录请求中的 role 字段不参与授权。登录及会话接口返回服务端角色，`/api/admin/*` 要求管理员身份；当前仅接入身份验证接口，审核列表和审核工作台将在上传审核流程中接入。

“我的模板”始终是本人作品；“审核管理”用于处理其他用户主动提交的审核任务，不自动展示未提交草稿。

## 我的模板与恢复

“我的模板”合并当前账号的私有保存记录、本机缓存和历史公开网页。已私有保存的模板可换设备登录、继续编辑和预览。只剩旧网页、没有完整草稿的历史记录需回原浏览器重新保存。
打开时优先检查私有仓库版本；同一版本的未保存本机修改会保留。如远端已更新且本机还有修改，本机版本另存为备份，再载入最新保存版本。文件和私人备注都参与恢复，旧缓存不会静默覆盖远端。

## 账号与服务

账号仍存放在本机 `.private/accounts.json`，密码为加盐哈希，不进入 GitHub。浏览器只保存最长 8 小时的会话令牌、手机号及到期时间。登录后首页显示手机号和退出登录；各页面、刷新和标签页共享状态。退出编辑保留登录，点击退出登录会注销会话。服务重启需重新登录，账号和草稿保留。

```sh
node server/local-server.mjs
/tmp/cloudflared tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:8767
```

`gh` 需登录 lkbDesigner，具备两个指定仓库的读写权限。通道地址变化后，更新 `site-config.json`、`portfolio-test/3_中文_空模板/save-config.json` 及原始模板的对应配置并发布。电脑、服务、通道和网络需保持运行。

验证：`node --test server/*.test.mjs`。私有草稿测试覆盖附件字节恢复、账号隔离、私有可见性检查、旧版本冲突、幂等重试及禁止公开保存。

---

以下为历史记录；其中腾讯云和旧保存服务地址不作为当前测试配置。

# 页间 · 模板画廊与编辑器

## 页面入口

- 首页 / 模板库：`index.html`，GitHub Pages 根地址。
- 现有 Sunday Studio 预览与编辑器：`studio.html`。
- 首页六张封面是本地 SVG 风格示意。Sunday 可打开已有完整示例，其余模板的完整网站与空模板待后续制作。
- 分类筛选、风格放大预览支持键盘和手机操作。
- 旧根地址的 `#edit/` 链接会转到独立编辑器。
- 首页不接收作品附件，不开通购买或制作任务；这些功能尚未接入。

首页素材位于 `assets/home/`，不依赖第三方图片、字体或 JavaScript 库。
现有云端保存服务配置继续使用 `site-config.json`；当前 CloudBase 部署说明见 `cloudbase/DEPLOY.md`。

---

以下为历史编辑器开发记录，涉及早期本地服务的部分以 CloudBase 部署文档为准。

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

## 手机号与密码演示登录

当前本地 API 使用 `server/account-service.mjs`。先输入恰好 11 位 ASCII 数字并确认；新号码设置 8–128 位密码并再次确认后创建账号，已有号码输入密码继续编辑。查询号码不会提前注册账号。

密码以 scrypt 加盐哈希存储，区分大小写。账号记录位于本机 `.private/accounts.json`（目录 0700、文件 0600，Git 忽略），不得上传公开仓库，请私下备份。手机号未经短信验证；当前不支持自助重置密码。

每次进入编辑需重新登录，服务从 GitHub 恢复最近保存的文字、图片和 PDF。会话仅在当前网页内存保存，返回模板时撤销，最长 8 小时。刷新或关闭前请保存。账号信息与密码不会写入公开仓库；保存的页面内容仍公开。

启动 `node server/local-server.mjs` 并保持 Cloudflare 临时隧道运行。永久云部署还需迁移私有账号存储，原独立 Worker 仅是历史保存核心，不能单独部署为账号服务。
