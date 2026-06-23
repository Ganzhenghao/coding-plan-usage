# 侧边栏用量总览 — 设计文档

> 日期:2026-06-23
> 状态:已与用户确认设计,待写实现计划

## 1. 概述

在现有 popup 之外,新增 Chrome 侧边栏(Side Panel)入口,将 GLM、MiniMax、DeepSeek、Xiaomi 四个套餐的用量信息**精简为一屏竖向总览**,常驻显示并支持自动刷新。

侧边栏定位为「常驻监控视图」,与 popup「按需详细查看」互补。popup 仍是点击扩展图标的默认行为,侧边栏由 popup 内的按钮显式打开。

## 2. 目标与非目标

**目标**

- 在 popup header 增加按钮,点击后打开 Chrome 侧边栏并常驻(切换标签页不消失)。
- 侧边栏一屏竖向展示 4 个套餐的核心用量,信息精简提炼。
- 未登录 / 未配置 / 请求失败的套餐仍占位显示(灰灯 + 引导操作),保证 4 卡始终可见。
- 自动刷新复用 popup 现有配置(`autoRefreshEnabled` / `autoRefreshInterval`),两端同步。

**非目标**

- 不改动 popup 现有功能与布局(仅新增一个 header 按钮)。
- 不改 service-worker 现有数据获取 handler,仅在 `onInstalled` / `onStartup` 中新增一行 `setPanelBehavior` 初始化。
- 不引入构建工具、框架或 ES module;保持纯原生 JS + `<script>` 引入。
- 不为侧边栏单独做用量预警逻辑,复用 `notifiedAlerts` 去重。

## 3. 架构与文件结构

```
chrome-extension/
├── manifest.json          # 新增 sidePanel 权限 + side_panel 配置
├── popup/
│   ├── popup.html         # header 新增「钉到侧边栏」按钮
│   ├── popup.css          # 新增按钮样式(可选,复用 header-btn)
│   └── popup.js           # 新增按钮点击 → sendMessage({type:'openSidePanel'})
├── sidepanel/             # 【新增】
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
└── background/
    └── service-worker.js  # onInstalled 中新增 setPanelBehavior 初始化
```

**设计取舍:为何不抽公共模块**
原生 JS 无构建工具,模块化(ES module / 多 `<script>`)成本高于收益。`formatTime` / `formatDuration` / `getProgressClass` / `formatTokenCount` / `formatXiaomiToken` 等纯函数在 `sidepanel.js` 中复制一份(合计约 50 行)。数据获取 100% 复用 service-worker 现有 handler,零重复。渲染逻辑因视图结构完全不同(精简总览 vs Tab 详情),独立编写。

## 4. manifest.json 变更

```jsonc
{
  "permissions": [
    "cookies", "storage", "notifications", "alarms", "scripting",
    "sidePanel"            // 新增
  ],
  "side_panel": {           // 新增顶层字段
    "default_path": "sidepanel/sidepanel.html"
  },
  "action": {
    "default_popup": "popup/popup.html"   // 保留,popup 仍是默认行为
    // ...
  }
}
```

## 5. 打开与通信流程

```
用户点 popup header「钉到侧边栏」按钮
        │
        ▼ (click 事件本身即用户手势)
popup.js: chrome.sidePanel.open({ windowId: <当前窗口> })
        │
        ▼
Chrome 加载 sidepanel/sidepanel.html(当前窗口常驻)
        │
        ▼
sidepanel.js init(): 读缓存渲染 → 异步 refreshAll → 启动自动刷新
```

**关键点**

- `chrome.sidePanel.open()` 必须在用户手势上下文调用。在 popup 按钮的 `click` handler 内**直接**调用最可靠;**不可**绕道 service-worker 消息——user activation 不跨 `sendMessage` 传递,在 service-worker 的 `onMessage` 内调用 `open()` 会被 Chrome 判定为非用户手势而拒绝。
- `setPanelBehavior({ openPanelOnActionClick: false })`:在 service-worker 的 `onInstalled` / `onStartup` 中调用一次,使点击工具栏扩展图标仍弹 popup,侧边栏只由按钮触发(符合「popup 仍是主入口」)。
- `open({ windowId })`:面板绑定当前窗口并常驻,切换标签页不消失。`windowId` 通过 `chrome.windows.getCurrent()` 或 `chrome.runtime` 当前激活窗口获取。

## 6. 数据流

与 `popup.js` 的 `refreshAll` 完全一致:

1. **并行**拉取 4 个套餐,每个套餐先取 token/cookie/key,再 `sendMessage` 调对应 service-worker handler:
   - GLM:`getGLMToken` → `fetchGLMUsage`(+ `fetchGLMBalance` 独立不阻塞)
   - MiniMax:`fetchMiniMaxUsage`(从 storage 读 `minimaxApiKey`,无则尝试 `autoFetchMiniMaxKey`)
   - DeepSeek:`getDeepSeekToken` / `refreshDeepSeekToken` → `fetchDeepSeekUsage`
   - Xiaomi:`getXiaomiCookies` → `fetchXiaomiUsage`(401 时触发 `xiaomiAutoLogin` 后重试)
2. **缓存优先**:启动时读 `glmCache` / `minimaxCache` / `deepseekCache` / `xiaomiCache` 立即渲染,再异步拉新;成功后回写各 `xxxCache` 与 `xxxCacheTime`。
3. **每个套餐独立状态机**,互不阻塞:一个套餐失败不影响其他三张卡片。

## 7. UI 布局(卡片堆叠)

侧边栏固定竖向单列,自上而下:

```
┌──────────────────────────────┐
│ CodingPlan 用量       🔄 ⚙    │  Header:标题 + 刷新 + 设置
├──────────────────────────────┤
│ [●] 自动刷新    每 5 分钟 ▾   │  自动刷新开关 + 间隔下拉
├──────────────────────────────┤
│ ┌ GLM ────────────────── ● ┐ │  卡片 1
│ │ Tokens            45%    │ │
│ │ ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░ │ │
│ │ MCP 30% · ¥120.50 · 7/1  │ │
│ └──────────────────────────┘ │
│ ┌ MiniMax ────────────── ● ┐ │  卡片 2(多模型,每模型一行细进度)
│ │ abab6.5s          60%    │ │
│ │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░ │ │
│ │ minimax-m1        20%    │ │
│ │ ▓▓░░░░░░░░░░░░░░░░░░░░░░ │ │
│ │ 剩 3天 · 7/1 重置         │ │
│ └──────────────────────────┘ │
│ ┌ DeepSeek ──────────── ● ┐ │  卡片 3
│ │ 余额消耗          35%    │ │
│ │ ▓▓▓░░░░░░░░░░░░░░░░░░░░░ │ │
│ │ ¥45.20 · 本月 82万 tokens│ │
│ └──────────────────────────┘ │
│ ┌ Xiaomi ────────────── ● ┐ │  卡片 4
│ │ 月度              4.4%   │ │
│ │ ▓░░░░░░░░░░░░░░░░░░░░░░░ │ │
│ │ 套餐 4.0% · 已用 2.2亿   │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### 各套餐精简字段(核心进度型)

| 套餐 | 主进度(大进度条) | 副信息(小字一行) |
|---|---|---|
| GLM | Tokens 用量%(`TOKENS_LIMIT.percentage`) | MCP 工具% · 可用余额 ¥ · 重置时间 |
| MiniMax | 每个模型一行细进度:本周期用量% | 剩余时长 · 重置时间 |
| DeepSeek | 余额消耗%(月用量 / (月用量 + 估算余量)) | 余额 ¥ · 本月用量 tokens |
| Xiaomi | 月度用量%(`monthUsage.items[0].percent × 100`) | 套餐总量% · 已用/总量 |

**进度条颜色阈值**(复用 `getProgressClass`):`< 70%` 绿,`≥ 70%` 橙警告,`≥ 90%` 红危险。状态点颜色同步。

**MiniMax 多模型**:每个 `model_remains` 一行,左侧模型名 + 中间细进度条 + 右侧百分比。模型数量通常 2-3 个,仍可容纳;若极端多则卡片内纵向溢出滚动(不破坏整体一屏)。

### Header 与自动刷新控件

- **🔄 刷新按钮**:手动触发 `refreshAll`,旋转动画表示进行中(同 popup)。
- **⚙ 设置按钮**:在侧边栏内打开设置抽屉,UI 结构与 popup 设置面板一致(API Key 配置、自动刷新、预警),读写同一套 storage key。需在 `sidepanel.html` / `sidepanel.css` / `sidepanel.js` 中实现一份设置抽屉(从 popup 复制并适配侧边栏宽度),保证侧边栏常驻时不必切回 popup 即可改配置。
- **自动刷新行**:开关 toggle + 间隔 `<select>`(选项同 popup,如 1/5/10/30 分钟)。读写 `autoRefreshEnabled` / `autoRefreshInterval`,与 popup 双向同步。

## 8. 状态机(都显示,错误灯色)

每个套餐卡片独立三态,4 张卡片始终可见,顺序固定:GLM → MiniMax → DeepSeek → Xiaomi。

| 状态 | 触发 | 展示 |
|---|---|---|
| `loading` | 无缓存、正在请求 | 卡片标题 + 灰点 + 骨架灰条(3 条) |
| `content` | 请求成功 | 标题 + 状态点(颜色随用量) + 进度条 + 副信息 |
| `error` | 未登录 / 未配置 / 请求失败 / 超时 | 卡片置灰 + 灰点 + 错误文案 + 操作按钮 |

**error 态操作按钮**(按套餐与错误类型):

- GLM / DeepSeek 未登录 → 「前往登录」(打开对应平台登录页)
- MiniMax 未配置 Key → 「前往设置」(打开设置抽屉)
- Xiaomi 未登录 → 「前往登录」;401 自动登录失败后同
- 请求超时 / 数据格式异常 → 「重试」

## 9. 自动刷新

- 读取 `autoRefreshEnabled` + `autoRefreshInterval`(与 popup 共享)。
- 启用时:`setInterval(refreshAll, interval * 1000)`。
- 侧边栏顶部开关 / 间隔变更 → 写回 storage;`storage.onChanged` 已在 service-worker 监听,后台 alarm 同步更新。popup 若同时打开,其 `storage` 读取亦同步(注:popup 的 `setInterval` 不会跨页面联动,但配置一致,行为一致)。
- 侧边栏页面关闭时 `setInterval` 随页面销毁,无残留。

## 10. 预警

侧边栏也复用 `checkThresholds`(从 popup.js 复制逻辑)+ `notifiedAlerts` storage 去重。常驻时与 popup、后台 alarm 三者共享同一 `notifiedAlerts`,不漏报、不重报。每次 `refreshAll` 成功渲染后触发一次各套餐的阈值检查。

## 11. 错误处理

- **API 超时**:所有请求 5 秒超时(service-worker `API_TIMEOUT`),侧边栏展示对应套餐 error 态 + 「重试」。
- **未登录 / Token 失效**:套餐级 error 态 + 登录引导,不阻塞其他套餐。
- **数据格式异常**:套餐级 error 态 + 「重试」,不崩溃整个侧边栏。
- **无缓存冷启动**:4 张卡片均显示 `loading` 骨架,逐个请求完成后切换为 `content` / `error`。

## 12. 验证方式(手动)

项目无测试框架,按以下步骤手动验证:

1. `chrome://extensions/` → 开发者模式 → 重新加载扩展。
2. 打开 popup,确认 header 出现「钉到侧边栏」按钮;点击后侧边栏打开并常驻。
3. 切换浏览器标签页,确认侧边栏不消失。
4. 确认 4 张套餐卡片正常渲染(已登录的套餐显示用量,未登录的显示灰灯 + 引导)。
5. 切换自动刷新开关与间隔,确认 popup 与侧边栏配置同步、周期刷新生效。
6. 点击 🔄 手动刷新,确认进度条更新。
7. 构造一个套餐未登录场景(清除对应 Cookie / Token),确认该卡片转为灰灯 error 态,其余卡片不受影响。
8. 调整浏览器窗口高度,确认 4 张卡片在一屏内可见(MiniMax 多模型时允许卡片内滚动)。
