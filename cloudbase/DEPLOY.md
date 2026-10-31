# 页间 CloudBase 后端部署

状态：已完成本地 PostgreSQL 与模拟 GitHub 的验证，尚未部署到你的腾讯云环境，尚未完成真实 CloudBase / GitHub 的 100 用户压测。

## 1. 数据库初始化

在 designtest 环境的 PostgreSQL「SQL 编辑器」新建查询，粘贴 `schema.sql` 全部内容并执行一次。
脚本创建 `yepian_` 开头的私有业务表及 `yepian_rpc` 函数，不删除已有表或数据。
需要环境已有 `anon`、`authenticated`、`service_role` 角色。所有表开启 RLS、撤销普通客户端访问，仅允许后端 service_role 访问。
再次执行脚本也不会清空账号或页面数据。遇到权限或角色错误请保留错误文本并停止部署，不要放开匿名权限。

## 2. 代码上传

上传 `yepian-cloudbase.zip`，保持压缩包根目录有 Dockerfile（不要再套一层文件夹）。

- 服务名：yepian-api
- 服务端口：8080，访问端口：80
- 目标目录：留空
- Dockerfile：有，名称 Dockerfile
- 公网默认域名：开启（测试使用）
- 容器：初次测试可用 1 核 2 GB
- 一个常驻实例，最小 / 最大都为 1；后台轮询队列依赖实例持续运行
- 不另外填启动命令：Dockerfile 已配置 CMD

常驻实例会消耗资源，先在控制台确认试用额度与计费范围。一个实例是验证起点，不能据此保证 100 人并发登录和大文件上传。

## 3. 环境变量

- CLOUDBASE_ENV_ID：从当前环境卡片复制真实环境 ID。
- CLOUDBASE_APIKEY：在「API Key 设置」选择 yepian-backend，由平台注入真实密钥。
- GITHUB_TOKEN：单独创建 Fine-grained GitHub PAT，只选择 lkbDesigner/yepian-template-editor-demo，Contents: Read and write。真实值仅在腾讯云后端环境变量里填写，不能放进 ZIP、前端、公开仓库或聊天。
- PORT：Dockerfile 默认 8080，无需额外填写。

服务角色 API Key 必须能调用 PostgreSQL RPC。不得使用前端 Publishable Key 替代。

## 4. 部署与切换

部署后访问默认地址的 /healthz（进程存活）和 /api/status（数据库检查）。只有后者返回 ready:true 才可切换站点。
把服务的公开 HTTPS 地址发给 Codex，再修改 site-config.json 的 saveServiceUrl 并发布前端。无需发送任何密钥。
本机试验账号不会自动迁入新数据库；如需保留应先实施私有数据迁移，勿把旧账号文件上传仓库。

## 5. 保存含义

/api/save 先在同一数据库事务中更新页面快照并加入持久队列，返回 202 与 jobId，说明内容已存入数据库。
后台单独提交到 GitHub，成功后才展示 GitHub 保存成功及提交链接。
不同实例通过数据库租约争取唯一队列消费者；该首版仍要求单实例常驻。任务会按序重试，最多 5 次，失败仍保留最新云端页面内容。
同步状态可通过 /api/jobs/<jobId> 查询，只允许页面所属账号访问。请求标识可防止同一保存请求重复入队。
中断实例后，未完成任务在 10 分钟租约过期后恢复。实例重启不依赖本机文件或内存恢复会话。
已完成任务的上传快照会立即释放，任务元数据和最终失败任务保留 7 天；账号与最近页面持续保留。

为先验证流程，当前图片/PDF 数据以 base64 存入私有数据库快照，限制单文件 5 MB、合计 8 MB。
这会占用数据库存储空间，不等同于已接入对象存储。大量文件的正式版本应将二进制迁到对象存储。

## 6. 验证范围

cloudbase/verify.mjs 在临时 PGlite PostgreSQL 执行 schema.sql，验证 RLS 与权限、账号登录、会话持久化、100 个并发入队、单消费者、重启恢复、幂等、错误凭据、页面归属和真实生产保存逻辑。
GitHub 使用模拟传输，验证不会写入真实仓库。CloudBase 网络、权限注入、实际 GitHub 速率和整站并发必须部署后再测。
本地验证需要临时安装 @electric-sql/pglite；容器运行不需要任何 npm 依赖。
