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

![Orbit Logo](public/lineart-dog.png)

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

## License

本项目当前未声明开源协议；如需开源，建议补充 `MIT` 或 `Apache-2.0`。
