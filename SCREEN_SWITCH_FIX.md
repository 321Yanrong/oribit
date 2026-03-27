# Orbit iOS 切屏网络恢复方案

> 本文档记录 Orbit App 在 iOS 上从后台切回前台时遇到的网络死连接问题，以及我们如何通过五层防御体系彻底解决。

---

## 一、问题现象

用户在 iOS 上将 App 切到后台再切回时，出现以下症状：

| 现象 | 日志关键字 |
|------|-----------|
| 记忆流无法加载，一直转圈 | `拉取数据超时或被系统打断: timeout` |
| 鉴权会话获取卡死 | `getSession-timeout` |
| 上传成功但数据刷不出来 | `NativeUploader upload success` 后紧跟 `timeout` |
| 系统级网络报错 | `nw_read_request_report "Socket is not connected"` |

**关键矛盾：** 原生上传（Swift `URLSession`）每次都成功，但前端 JS 的数据拉取（WebView `fetch`）总是超时。

---

## 二、根因分析

问题有**三个独立根因**，它们叠加在一起形成了连锁超时：

### 根因 1：WKWebView 死 TCP 连接

iOS 的 WKWebView 在 App 退到后台时，不会主动关闭已有的 TCP 连接。当 App 回到前台，WebView 的 `fetch()` 仍然尝试复用这些已经断开的"僵尸连接"，导致请求挂起直到操作系统级超时（通常 30-60 秒）。

```
App 退后台 → TCP 连接被服务器/运营商断开 → App 回前台
→ WKWebView fetch() 复用死连接 → 请求挂起 → 30s 超时
```

### 根因 2：Supabase SDK `navigator.locks` 死锁

Supabase JS SDK（v2.100.0+）在 `getSession()` 内部使用了 `navigator.locks` 做互斥锁。iOS 在后台挂起时，如果有一个锁正在持有中，App 回前台后新的 `getSession()` 调用会永远等待这个已经"死掉"的锁释放，造成**无限挂起**。

```
后台挂起 → navigator.locks 的锁持有者被冻结
→ 回前台 → 新的 getSession() 等待锁 → 永远拿不到 → 死锁
```

### 根因 3：REST 请求被 `getSession()` 阻塞

Supabase SDK 的 PostgREST 客户端在每次请求前都会调用内部的 `_getAccessToken()` → `getSession()` 来获取鉴权 Token。当 `getSession()` 因为根因 2 死锁时，所有 REST 查询（拉记忆、拉好友、拉评论）都被阻塞。

```
profiles.select() → SDK 内部调用 getSession() → 死锁 → REST 请求永远发不出去
```

---

## 三、解决方案总览

我们构建了**五层防御**，从底层到上层逐级解决：

```
┌─────────────────────────────────────────────────┐
│  第 5 层：前台恢复编排（App.tsx）                    │
│  根据离开时长选择轻量/完整恢复策略                      │
├─────────────────────────────────────────────────┤
│  第 4 层：前台网络探针（webViewNetworkProbe.ts）      │
│  用原生 HTTP 验证网络可达性，不依赖 WebView            │
├─────────────────────────────────────────────────┤
│  第 3 层：鉴权绕过（supabase.ts）                    │
│  绕开 getSession() 死锁，直接从 localStorage 读 Token │
├─────────────────────────────────────────────────┤
│  第 2 层：原生 HTTP 路由（nativeHttp.ts）             │
│  Auth/REST 请求走 iOS URLSession，绕过 WebView       │
├─────────────────────────────────────────────────┤
│  第 1 层：CapacitorHttp 全局开关（capacitor.config） │
│  启用原生 HTTP 插件，为上层提供基础能力                  │
└─────────────────────────────────────────────────┘
```

---

## 四、各层详细实现

### 第 1 层：启用 CapacitorHttp

**文件：** `capacitor.config.ts` / `ios/App/App/capacitor.config.json`

```typescript
plugins: {
  CapacitorHttp: { enabled: true }
}
```

**作用：** 激活 Capacitor 的原生 HTTP 插件，使前端代码可以通过 `CapacitorHttp.request()` 发送请求，底层走 iOS 的 `URLSession`（而非 WKWebView 的 `fetch`）。`URLSession` 会自动重建 TCP 连接，不存在死连接问题。

---

### 第 2 层：原生 HTTP 路由

**文件：** `src/utils/nativeHttp.ts`

| 函数 | 作用 |
|------|------|
| `nativeFetch(input, init)` | 在原生平台上，将请求转换为 `CapacitorHttp.request()` 调用；Web 平台直接用 `window.fetch` |

**路由规则**（在 `src/api/supabase.ts` 的 `authAwareFetch` 中定义）：

| 请求类型 | 走哪条路 | 原因 |
|---------|---------|------|
| Auth（`/auth/v1/`） | 原生 `nativeFetch` | 避免死连接导致鉴权卡死 |
| REST（`/rest/v1/`） | 原生 `nativeFetch` | 避免死连接导致数据拉取卡死 |
| Storage POST（`/storage/v1/object/`） | WebView `fetch` | 原生 HTTP 不支持 multipart 流式传输 |
| Edge Functions（`/functions/v1/`） | WebView `fetch` | CORS 限制 |

**关键设计：** `nativeFetch` 失败时**不再回退到 WebView fetch**，直接抛错。防止静默回退到死连接。

```typescript
} catch (err) {
    console.error('[nativeFetch] CapacitorHttp failed:', err);
    throw err;  // 不回退，快速失败
}
```

---

### 第 3 层：鉴权死锁绕过

**文件：** `src/api/supabase.ts`

解决了根因 2 和根因 3，包含三个关键改动：

#### 3a. 禁用 `navigator.locks`

在 `createClient` 时注入空操作的 `lock` 函数，绕过 SDK 内部的互斥锁：

```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: async (_name, _acquireTimeout, fn) => {
      return await fn()  // 直接执行，不加锁
    },
  },
})
```

#### 3b. 直接从 localStorage 读 Token

新增 `getSessionFromStorage()` 函数，跳过 SDK 的 `getSession()`，直接读取本地存储的鉴权信息：

```typescript
const SUPABASE_STORAGE_KEY = 'sb-qoaqmbepnsqymxzpncyf-auth-token'

export function getSessionFromStorage() {
  const raw = localStorage.getItem(SUPABASE_STORAGE_KEY)
  if (!raw) return null
  const stored = JSON.parse(raw)
  return stored?.access_token ? stored : null
}
```

#### 3c. 覆写 REST 客户端的 fetch

覆盖 `supabase.rest.fetch`，让所有 PostgREST 请求直接用 localStorage 中的 Token，完全绕过 `_getAccessToken()` → `getSession()` 调用链：

```typescript
;(supabase as any).rest.fetch = async (input, init) => {
  const stored = getSessionFromStorage()
  const token = stored?.access_token ?? supabaseAnonKey
  const headers = new Headers(init?.headers)
  headers.set('apikey', supabaseAnonKey)
  headers.set('Authorization', `Bearer ${token}`)
  return authAwareFetch(input, { ...init, headers })
}
```

**效果：** REST 请求不再依赖 `getSession()`，即使 SDK 内部的鉴权流程卡死，数据查询仍然可以正常发出。

---

### 第 4 层：前台网络探针

**文件：** `src/utils/webViewNetworkProbe.ts`

| 函数 | 作用 |
|------|------|
| `runForegroundNetworkProbe({ userId, source, maxMs })` | App 回前台后立即用**原生 HTTP**（非 WebView）探测网络是否可达 |
| `isForegroundProbeFresh()` | 检查最近 60 秒内是否已有成功的探测 |
| `markProbeSuccess()` | 标记探测成功，设置全局时间戳 |

**探针逻辑：**

1. 使用 `CapacitorHttp.request()` 向 Supabase Auth 端点发 HEAD 请求
2. **只要收到 HTTP 响应（包括 401）就算成功** — 证明网络通道已恢复
3. 每次间隔 500ms 重试，最长等待 10 秒
4. 成功后标记全局变量 `__orbit_webview_ready_at`
5. 支持去重：并发调用共享同一个探测 Promise

**为什么 401 也算成功：** 我们关心的是"网络是否通"而不是"鉴权是否有效"。服务器返回 401 说明 TCP 握手成功、TLS 协商完成、HTTP 往返正常，网络通道已经彻底恢复。

---

### 第 5 层：前台恢复编排

**文件：** `src/App.tsx`（`performSafeResume` 函数）+ `src/hooks/useAppWakeUp.ts`

#### 生命周期入口

`useAppWakeUp` 监听 Capacitor 的 `appStateChange` 事件：

| 事件 | 处理 |
|------|------|
| `isActive = true`（回前台） | 记录 `__orbit_foreground_at` 时间戳，触发 `performSafeResume` |
| `isActive = false`（进后台） | 记录 `__orbit_background_at` 时间戳 |

#### 恢复策略（按离开时长分级）

`performSafeResume` 根据 App 在后台停留的时间，采用不同的恢复策略：

| 离开时长 | 策略 | 说明 |
|---------|------|------|
| > 30 分钟 | **强制重载** | `window.location.reload()`，彻底清理所有状态 |
| > 5 分钟 | **完整恢复** | 显示 Splash → 探针 → 刷新会话 → 拉取全量数据 |
| 10 秒 ~ 5 分钟 | **标准恢复** | 探针 → 检查网络连接 → 清理 WebSocket → 预热 REST → 拉取数据 |
| < 10 秒 | **轻量恢复** | 探针 → 轻量 `profiles` 查询 → 延迟 3 秒后拉取数据 |

**关键细节：**

- **所有策略都会启动原生网络探针**（第 4 层），确保网络可达
- **会话刷新（`refreshSession`）被延迟到最后**，因为它仍走 WebView fetch，是最不可靠的环节
- 只有当 Token 即将过期（< 5 分钟）时才主动刷新，且设置 4 秒超时
- 网络不可达时只做本地缓存恢复（`hydrateUserCache`），不发任何请求
- 恢复前会 `removeAllChannels()` 清理可能残留的 WebSocket 订阅

---

### 原生上传隔离

**文件：** `ios/App/App/NativeUploaderPlugin.swift`

图片上传使用完全独立的原生网络栈：

| 设计点 | 实现 |
|--------|------|
| 连接池隔离 | 使用 `URLSessionConfiguration.ephemeral`，每次上传使用独立连接池 |
| 不复用死连接 | Ephemeral 配置不共享 WKWebView 的连接缓存 |
| 超时控制 | `timeoutIntervalForRequest = 20s`，`timeoutIntervalForResource = 30s` |
| 不等待连接恢复 | `waitsForConnectivity = false`，连接不可用时立即失败 |

**效果：** 即使 WebView 网络栈完全不可用，原生上传仍然可以独立完成。

---

## 五、恢复流程图

用户将 App 从后台切回前台时，完整的恢复流程：

```
用户切回 App
    │
    ▼
useAppWakeUp 检测到 isActive = true
    │
    ▼
记录 __orbit_foreground_at 时间戳
    │
    ▼
触发 performSafeResume()
    │
    ├── 离开 > 30 分钟？ ──是──▶ window.location.reload()
    │
    ▼ 否
启动原生网络探针（CapacitorHttp HEAD 请求）
    │
    ├── 离开 < 10 秒？
    │       │
    │       ▼
    │   轻量恢复：profiles 查询 → 延迟拉取数据
    │
    ├── 离开 10 秒 ~ 5 分钟？
    │       │
    │       ▼
    │   检查 Network.getStatus()
    │       │
    │       ├── 无网络 → 只恢复本地缓存
    │       │
    │       ▼ 有网络
    │   清理 WebSocket → 预热 REST → 拉取数据
    │   → Token 快过期？刷新会话（4s 超时）
    │
    ▼ 离开 > 5 分钟
显示 Splash → 刷新会话 → 拉取全量数据
```

---

## 六、涉及文件清单

| 文件 | 职责 |
|------|------|
| `capacitor.config.ts` | 全局启用 CapacitorHttp 原生 HTTP 插件 |
| `src/utils/nativeHttp.ts` | 原生 HTTP 封装，将 `fetch` API 转为 `CapacitorHttp.request()` |
| `src/api/supabase.ts` | Auth/REST 路由、鉴权绕过、Token 直读、REST fetch 覆写 |
| `src/utils/webViewNetworkProbe.ts` | 前台网络探针，验证原生网络栈可达性 |
| `src/App.tsx` | 前台恢复编排，按离开时长分级处理 |
| `src/hooks/useAppWakeUp.ts` | Capacitor App 生命周期监听，触发恢复流程 |
| `ios/App/App/NativeUploaderPlugin.swift` | 原生上传插件，使用独立 Ephemeral 连接池 |

---

## 七、效果对比

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 切回后数据加载 | 30 秒超时后失败 | 1-2 秒内完成 |
| getSession 调用 | 经常死锁无响应 | 完全绕过，不再阻塞 |
| 图片上传 | 不受影响（已走原生） | 不受影响 |
| 网络探针 | 依赖 WebView fetch，经常超时 | 走原生 HTTP，1 秒内完成 |
| 长时间后台（> 30 分钟） | 各种状态错乱 | 强制重载，干净重启 |

---

*最后更新：2026-03*
