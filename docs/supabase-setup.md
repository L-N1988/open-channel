# 同步配置

本项目使用 MkDocs 发布静态页面，浏览器通过 Supabase Auth、数据库和私有 Storage 访问两个人的共享档案。无需在博客服务器上运行后端。

## 新建或升级项目

1. 创建 Supabase 项目。
2. 下载 [完整建表 / 升级 SQL](sql/love-record-v2.sql)，把 `you@example.com` 和 `lover@example.com` 换成两个人的登录邮箱，然后在 SQL Editor 执行。脚本适用于初次安装和之前的三表版本，保留已有记录，可以重复执行。
3. 在 Authentication 中创建两个账号并确认邮箱，关闭公开注册。
4. 把 Project URL 和 anon public key 填入 `docs/javascripts/love-record-config.js`。只使用公开客户端密钥，服务端密钥不要放进网页。
5. 重新构建并发布 MkDocs。进入“设置”或“记录”登录。

```js
window.LOVE_RECORD_CONFIG = {
  supabaseUrl: "https://你的项目.supabase.co",
  supabaseAnonKey: "你的 anon public key",
  mediaBucket: "love-media",
  signedUrlSeconds: 3600,
  enableLocalDraftMode: true
};
```

SQL 创建 `todos`、`memories`、`events`、`journals`、`trips`、`trip_items` 和私有 `love-media` 桶，并为六张表开启 RLS 与 Realtime。允许名单由管理员维护；两个账号共享同一档案。这不是多租户服务，更多独立情侣空间需要另加成员表与空间级权限。

## 离线与冲突

没有配置云端时，记录和媒体存入 IndexedDB。原先 localStorage 中的草稿首次打开时会复制进来，原数据保留。配置云端后，本地档案不会自动上传；每个登录账号使用独立的本机缓存和待同步队列。

登录过的账号可在离线时修改最近同步的数据。保存先写入本机，再尝试同步；联网、回到页面或点击“刷新同步”会重试。同步使用 `updated_at` 对比版本，发生并发修改时保留两版，并提供“使用云端版本”和“保留我的修改”。新账号需要联网登录后才能打开云端档案。同步在网页打开时运行，不依赖后台同步服务。

删除账号登录状态会隐藏其缓存，不删除待同步草稿；下次同一账号登录可继续同步。本机缓存不加密，适合自己的设备。云端原件不进入 Service Worker 缓存，其他设备的媒体需联网获取临时链接。本机拍摄 / 上传过的附件可在离线时查看。

## 媒体与数据模型

一条回忆可以包含多张照片或视频，附件元数据保存于 `memories.media` JSONB 字段，原文件保存于 IndexedDB / 私有 Storage；旧的 `file_path` 仍可读取。支持 JPG、PNG、WebP、GIF、MP4、MOV、WebM，每个文件最多 100 MB。编辑时选择新附件会替换当前附件，未选择则保留。

删除回忆或替换附件不会立即删除云端原件，避免离线设备和网络重试造成误删；可由管理员按数据库中 `media[].path` 和 `file_path` 的引用定期清理未引用文件。

## 发布与 PWA

使用 HTTPS，或通过 localhost 预览。manifest 和 Service Worker 支持子目录部署，包括 GitHub Pages 项目路径。安装后可离线打开预缓存的应用页面，地图底图仍需联网。修改应用壳时递增 `docs/sw.js` 中的 `VERSION`；新版本在旧页面全部关闭后生效。

地图使用 Leaflet 和 OpenStreetMap，坐标为 WGS84。连线展示行程顺序，不提供道路导航。

## 验证

```bash
python -m venv /tmp/open-channel-mkdocs-venv
/tmp/open-channel-mkdocs-venv/bin/pip install mkdocs-material playwright
/tmp/open-channel-mkdocs-venv/bin/mkdocs build --strict
node --test tests/core.test.cjs
```

浏览器回归测试说明见仓库 README。
