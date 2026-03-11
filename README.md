# Orbit 轨迹

一款专为密友圈设计的**"情感地图手账 + 极简记账"**数字胶囊。

## 产品定位

把工具属性（算账、定位）包裹在情感记忆（照片、趣事）里。界面极简、私密、没有社交压力。

## 核心功能

### 🗺️ 友情地图 (The Map)
- 打开 App 就是一张干净的暗色地图
- 你和朋友去过的地方，都会化作地图上发光的打卡点
- 点击好友头像筛选共同足迹
- 点击光点弹出记忆卡片

### 💳 记忆卡片流 (Memory Stream)
- 单张卡片滑动模式浏览回忆
- 极速输入：自动读取照片信息填好时间和地点
- @同行好友记录共同回忆
- 可选附带账单功能

### 💰 无痛记账台 (The Ledger)
- 记账与记忆卡片绑定
- 智能均摊计算
- 清晰的结算看板："我该给谁多少"和"谁该给我多少"
- 一键标记"已结清"

## 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS
- **动画**: Framer Motion
- **状态管理**: Zustand
- **后端**: Supabase (PostgreSQL + Auth)
- **地图**: Mapbox GL (待集成)

## 设计规范

- **主色调**: 深邃星空黑 (#121212)
- **点缀色**: 荧光薄荷绿 (#00FFB3)、晚霞橘 (#FF6B35)
- **材质风格**: 毛玻璃效果 (Glassmorphism)
- **排版**: 去线化设计，留白为主

## 开发指南

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
```

## 项目结构

```
src/
├── App.tsx           # 主应用入口
├── index.css         # 全局样式
├── main.tsx          # React 入口
├── types/            # TypeScript 类型定义
├── store/            # Zustand 状态管理
├── components/       # 可复用组件
└── pages/            # 页面组件
    ├── MapPage       # 友情地图
    ├── MemoryStreamPage # 记忆卡片流
    ├── LedgerPage    # 记账台
    └── ProfilePage   # 个人中心
```

---

*记录与好友的每一个足迹 ✨*
