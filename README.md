# 恋爱记录 · Our Quiet Archive

一个基于 MkDocs Material 的双人生活记录应用。保留静态博客部署方式，使用 JavaScript、IndexedDB 和可选 Supabase 实现交互与同步。

已实现三个阶段：

1. **记录与回看**：瞬间 / 随笔、多个照片 / 视频附件、编辑与删除、可清空字段、日期 / 标签 / 时光集筛选、月历导航、同日多事件、每年纪念日、动态首页与倒计时。
2. **时光集与旅行**：彩色封面时光集、回忆归档、旅行日期、按日排序的行程安排、旅行地点地图、ICS 日历导出。
3. **地图、洞察与离线**：主动定位、足迹地图、心情分布与每月变化、标签云、那年今日、IndexedDB 媒体与草稿、PWA 安装与离线页面、本地备份恢复、云端待同步队列与版本冲突选择。

界面参考 [时光旅记的移动端截图](https://timeimprint.ljcljc.cn/)：浅粉背景、可可色系统字体、白色圆角卡片、彩色功能图标、照片封面小本、首页推荐，以及“我的小本 / 功能中心”分段切换。

移动端提供“首页 / 发现 / 旅行 / 我的”浮动底部导航，桌面端使用侧栏；支持浅色、深色主题与减少动画设置。照片墙、视频墙和代办页继续可用。

## 本地预览

```bash
python -m venv /tmp/open-channel-mkdocs-venv
/tmp/open-channel-mkdocs-venv/bin/pip install -r requirements.txt
/tmp/open-channel-mkdocs-venv/bin/mkdocs serve
```

默认无需账号即可使用本地档案。数据存于当前浏览器，原先 localStorage 中的记录会迁移到 IndexedDB，原数据保留。使用“设置 → 导出本地备份”保存照片、视频和记录。

## 双人云端同步

按 [同步配置](docs/supabase-setup.md) 执行 [建表 / 升级 SQL](docs/sql/love-record-v2.sql)，把占位邮箱换成两个账号的邮箱，再填写 `docs/javascripts/love-record-config.js`。SQL 可重复执行，保留已有记录。当前权限模型是一对情侣的共享档案，不是多租户服务。

配置云端后，本地档案和各账号的云端缓存分开保存。首次登录需要联网；离线编辑先排队，网页打开后联网自动重试。另一台设备修改了同一记录时，用户选择保留哪一版，不会静默覆盖。Realtime 只订阅六张应用表。

生产使用 HTTPS。PWA 支持根目录与子目录部署，Service Worker 只缓存静态页面和本地资源，不缓存 Supabase API 返回值或云端私有媒体。本机上传过的媒体可离线查看，其他设备的原件与地图底图需要联网。本机缓存未加密。删除 / 替换记录的云端原件保留，管理员可按数据库引用清理。

## 验证

```bash
/tmp/open-channel-mkdocs-venv/bin/pip install -r requirements-test.txt
/tmp/open-channel-mkdocs-venv/bin/mkdocs build --strict
node tests/core.test.cjs
python -m http.server 8001 --directory site
```

另一个终端运行：

```bash
/tmp/open-channel-mkdocs-venv/bin/python tests/browser_smoke.py
```

浏览器测试默认使用 `/usr/bin/google-chrome-stable`；可设置 `CHROME_PATH` 为本机 Chrome / Chromium 路径，`APP_TEST_URL` 为预览地址。测试包含本地 CRUD、超过 2 MB 的多附件、字段清空、时光集、旅行、日历、备份恢复、离线页面、手机 / 深色主题，以及模拟云端的队列、版本冲突和退出隔离。不连接真实 Supabase。

界面回归测试：`/tmp/open-channel-mkdocs-venv/bin/python tests/ui_smoke.py`，覆盖手机 / 桌面宽度、封面、推荐、发现切换和主题。

子目录部署测试可用 `tests/subpath_smoke.py`，设置 `APP_SUBPATH_URL` 为带子路径的本地预览地址。

更新应用壳时递增 `docs/sw.js` 的缓存版本。新版本将在旧页面全部关闭后激活。
