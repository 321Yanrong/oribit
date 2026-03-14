# Orbit 轨迹

> 记录与好友的每一个足迹 ✨

Orbit 是一款面向普通用户的「**地图记忆 + 好友协作 + 轻量记账 + 聚会小游戏**」应用。
你可以把每次见面、旅行、聚餐变成可回看的故事，还能顺手完成分账和结算。

---

## 产品介绍

Orbit 的核心理念是：

- **先记录情绪与场景，再处理工具事务**
- 把“定位、算账”这种工具动作，嵌入“照片、回忆、好友互动”里
- 让协作过程自然发生，减少社交压力

适用场景：

- 朋友出游打卡
- 多人聚餐分账
- 情侣/闺蜜日常回忆归档
- 密友圈共享生活片段

---

## 功能总览

### 1) 🗺️ 友情地图（Map）

- 地图展示你与好友的共同足迹
- 支持按好友筛选回忆点
- 点击点位查看该地点的回忆列表与详情
- 共享记忆会展示参与者头像

### 2) 🖼️ 记忆流（Memory Stream）

- 卡片式浏览回忆内容
- 支持照片、文字、地点、@好友
- 支持多好友筛选（AND 逻辑）
- 支持编辑、删除、标记账单

### 3) 💳 账单中心（Ledger）

- 账单与记忆卡片绑定
- 自动均摊与应收应付计算
- 结算状态可追踪（待结清 / 已结清）

### 4) 👥 好友系统

- 支持添加虚拟好友（对方未注册也可记录）
- 支持邀请码添加真实好友（申请 / 接受 / 拒绝）
- 支持虚拟好友绑定为真实账号，并自动同步历史标签

### 5) 🎮 小游戏（Games）

- 摇骰子
- 真心话大冒险
- 解压气泡纸
- 今天谁买单（转盘）
- 翻翻记忆（连连看）

---

## 截图预览

> 说明：以下为当前项目内可直接引用的视觉资源与展示位；你可以后续替换为真机截图。

### App 标识

![Orbit Logo](public/icons/orbit-logo.svg)
![Orbit Wordmark](public/icons/orbit-wordmark.svg)

### 页面展示位（可替换为真实截图）

![地图展示位](https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1600&auto=format&fit=crop)
![记忆流展示位](https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1600&auto=format&fit=crop)
![账单展示位](https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=1600&auto=format&fit=crop)
![游戏展示位](https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1600&auto=format&fit=crop)

### 网站高保真原型（可导入 Figma）

- 文件：`landing/orbit-website-prototypes.html`
- 内容：5 张 1440×1024 画板（Hero / 功能 / 流程 / 好友系统 / Footer）

---

## 技术栈

- **前端框架**：React 18 + TypeScript + Vite
- **样式系统**：Tailwind CSS
- **动画**：Framer Motion
- **状态管理**：Zustand
- **后端服务**：Supabase（Auth / PostgreSQL / Storage）
- **地图能力**：高德地图（AMap）

---

## 运行与开发

### 环境要求

- Node.js 18+
- npm 9+

### 本地启动

```bash
npm install
npm run dev
```

### 打包构建

```bash
npm run build
```

### 预览构建产物

```bash
npm run preview
```

### Service Worker 开发排障（刷新后页面异常）

如果你在开发环境遇到“刷新后页面打不开、必须去 Application 清缓存”的情况，通常是旧的 Service Worker + Cache 接管了页面。

推荐处理方式：

1. 在浏览器 DevTools -> Application -> Service Workers，勾选 **Update on reload**（重新加载时更新）。
2. 如果当前不需要离线能力，建议在代码中直接 **unregister** 或移除 Service Worker 相关逻辑。

本项目当前已在开发模式做了防护：

- 关闭了开发环境的 PWA Service Worker 注入；
- 启动时自动注销历史 Service Worker 并清理缓存；
- 兼容处理了历史 `public/sw.js` 的遗留缓存。

---

## 数据库与 Supabase 配置

项目依赖 Supabase 的 Auth、profiles、friendships、memories、memory_tags、ledgers 等表。

### 必跑 SQL（迁移）

1. `friend-requests-migration.sql`
   - 更新 friendships 的 UPDATE / DELETE / INSERT 策略
   - 用于好友申请接收/拒绝，以及虚拟好友绑定真实账号时的反向关系写入

2. 账单字段补充（如未执行）

```sql
ALTER TABLE memories ADD COLUMN IF NOT EXISTS has_ledger BOOLEAN DEFAULT FALSE;
```

### Auth 建议配置

在 Supabase Dashboard 开启邮箱验证：

- `Authentication -> Providers -> Email -> Confirm email = ON`

这样用户必须点邮件链接后才能登录。

---

## 项目结构（简版）

```text
.
├── public/
├── src/
│   ├── api/               # Supabase API 封装
│   ├── components/        # 组件
│   ├── pages/             # 页面（地图/记忆/账单/游戏/我的）
│   ├── store/             # Zustand 状态管理
│   ├── types/             # 类型定义
│   ├── App.tsx
│   └── main.tsx
├── landing/
│   └── orbit-website-prototypes.html
├── friend-requests-migration.sql
└── README.md
```

---

## 已实现的重点能力（近期）

- 好友申请流：发送 / 接受 / 拒绝 + Profile 红点提醒
- 虚拟好友绑定真实账号：自动同步历史 `memory_tags`
- 绑定后自动补反向好友关系（确保双方可见）
- 地图点位详情：列表层 + 单条详情层
- 游戏模块：5 个小游戏可直接使用
- Demo 模式与 UUID 防护

---

## Roadmap（建议）

- [ ] 接入真实移动端截图自动导出流程
- [ ] 增加 Web 端响应式官网版本
- [ ] 增加消息通知中心（好友申请、结算提醒）
- [ ] 增加多语言支持（中/英）

---

## PWA 完整度清单（含优先级实施）

> 目标：把 Orbit 做成“接近 App”的体验（可安装、快启动、可离线、可推送、低原生成本）。

### P0（本周建议完成）

- [x] `manifest` 基础字段（`name` / `short_name` / `display` / `theme_color`）
- [x] 关键图标资源（192/512）
- [x] Service Worker 自动更新（`registerType: autoUpdate`）
- [x] 旧缓存清理（`cleanupOutdatedCaches`）
- [x] 离线兜底页（`public/offline.html`）
- [x] 增加“可安装提示”UI（`beforeinstallprompt`）
- [x] 首屏性能指标基线（LCP/CLS/INP）采集能力接入（可导出文本）

### P1（下个迭代）

- [x] 将核心业务 API（好友/记忆列表）设置为 `NetworkFirst + fallback` 策略
- [x] 对上传与写操作（发记忆、改资料）给出“离线不可用”明确提示
- [x] 统一更新提示条（新版本可用时提醒“点击刷新”）
- [x] 增加 iOS 安装引导文案（Safari “添加到主屏幕”）
- [x] 增加安卓设备安装引导文案（菜单“安装应用/添加到主屏幕”）
- [ ] 设计离线模式信息架构（哪些页面可看、哪些操作禁用）

### P2（后续增强）

- [ ] 推送通知闭环（订阅、保存订阅、好友申请/账单提醒推送）
- [ ] 后台同步（Background Sync）与失败重试队列
- [ ] Web App 截图（manifest screenshots）用于商店/安装体验优化
- [ ] PWA 质量巡检（Lighthouse PWA 目标 >= 90）

### 实施顺序（推荐）

1. 先做 **安装提示 + 更新提示 + 离线提示**（用户立刻感知）
2. 再做 **业务 API 缓存策略分层**（稳定性与速度提升）
3. 最后做 **推送通知与后台同步**（增强留存）

### 验收标准（Definition of Done）

- 首次安装路径清晰：用户 3 步内可完成“添加到主屏幕”
- 刷新与重启不出现登录态卡死或白屏
- 断网时进入离线页且不崩溃
- 新版本发布后 1 次刷新可完成升级
- Lighthouse：PWA 关键项全部通过

### 首屏性能基线记录方法（LCP / CLS / INP）

已接入自动采集：`src/utils/webVitals.ts`（在 `src/main.tsx` 启动）。

#### 如何记录

1. 启动项目并打开首页，等待 3~5 秒。  
2. 打开浏览器控制台，执行：`await window.exportOrbitWebVitalsBaseline()`  
3. 会自动复制一段基线文本（含 LCP/CLS/INP、时间、页面、环境）。

你也可以执行：`window.getOrbitWebVitalsBaseline()` 查看 JSON 数据。

#### 建议记录模板（示例）

| 日期 | 环境 | LCP | CLS | INP | 备注 |
|---|---|---:|---:|---:|---|
| 2026-03-14 | MacBook + Chrome | 待记录 | 待记录 | 待记录 | 首次接入基线采集 |

---

## License

本项目当前未声明开源协议；如需开源，建议补充 `MIT` 或 `Apache-2.0`。
