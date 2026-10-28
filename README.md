# 页间 · 模板编辑器原型

一个纯静态 HTML 原型，演示“浏览模板 → 选择模板 → 编辑空白模块 → 保存页面”的流程。

## 当前功能

- Sunday Studio 模板展示六个模块：首屏、精选内容、品牌故事、特点与价值、资料下载、联系信息。
- 选择模板后进入结构一致的空白编辑器，内容输入后即时预览。
- 模块支持图片上传，资料下载模块支持 PDF；草稿和文件保存在当前浏览器。
- “保存修改”在未连接仓库时保存本机草稿；可导出 JSON。
- 连接 GitHub 后，保存会把独立页面、内容 JSON 和素材提交到仓库的 `user-sites/<site-id>/`。

## GitHub 保存

页面通过 GitHub REST API 从浏览器直接创建仓库提交。连接时只需要一个 Fine-grained personal access token：

1. 在 GitHub 的 **Settings → Developer settings → Personal access tokens → Fine-grained tokens** 创建令牌。
2. Repository access 只选目标仓库。
3. Repository permissions 只授予 **Contents: Read and write**。
4. 在编辑器点“连接 GitHub”，填入用户名、仓库名、分支和令牌。

令牌仅保存在页面内存中，不会写入 LocalStorage、草稿、HTML 或 GitHub 仓库。关闭或刷新页面后，需要重新输入令牌。测试时建议创建仅对此项目仓库授权、并设置较短有效期的令牌。页面脚本会在内存中使用令牌，因此正式产品建议改用服务端 OAuth。若目标仓库是公开仓库，保存的网页内容与上传文件也会公开。

保存成功后，仓库会出现 `user-sites/<site-id>/index.html`、`site.json` 和 `assets/`。如果目标仓库已启用 GitHub Pages，可在 Pages 完成部署后通过仓库 Pages 地址访问生成页面。

## 本地预览

直接用浏览器打开 `index.html` 即可体验模板和编辑流程。文件上传使用 IndexedDB；不同浏览器或设备之间不会自动同步。

