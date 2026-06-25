# Volcengine 用量看板接入设计

- 日期：2026-06-25
- 目标：在 Chrome 扩展中新增「火山方舟 Coding Plan」用量看板，与现有 GLM / MiniMax / DeepSeek / Xiaomi 平台并列展示

## 背景

火山方舟 Coding Plan（`https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan`）提供三档配额（5 小时会话 / 近 1 周 / 近 1 月），用户希望在 CodingPlan 用量查询扩展中直接看到这三档实时占比，避免单独打开火山引擎控制台。

## 数据来源

### 主用量接口

- 方法：`POST https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage`
- 请求体：`{}`
- 必需 header：
  - `Content-Type: application/json`
  - `x-csrf-token`：从 Cookie `csrfToken` 取得
- Cookie：浏览器自动附加同站 Cookie，无需手动构造
- 响应（仅列关键字段）：
  ```json
  {
    "Result": {
      "Status": "Running",
      "UpdateTimestamp": 1782375930,
      "QuotaUsage": [
        { "Level": "session", "Percent": 9.08,  "ResetTimestamp": 1782392248 },
        { "Level": "weekly",  "Percent": 21.72, "ResetTimestamp": 1782662400 },
        { "Level": "monthly", "Percent": 10.86, "ResetTimestamp": 1784822399 }
      ]
    }
  }
  ```

### 未登录与异常识别

- Cookie 中无 `csrfToken` → 视为未登录
- HTTP 401/403、或响应中 `ResponseMetadata.Error` 存在 → 视为未登录
- 网络/超时（5s `API_TIMEOUT`）→ 错误态
- `Result.Status === 'Expired'` → 卡片正常展示但角标提示「已过期」、进度条灰显

## UI 设计

### sidepanel 卡片

整张卡片可点击，跳转到 `https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan`。

```
┌─────────────────────────────────────────┐
│ Volcengine            [状态点] [↗]      │
├─────────────────────────────────────────┤
│ 当前会话           9.08%   4小时31分后重置│
│ ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    │
│ 近 1 周           21.72%   3天07小时后重置│
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░       │
│ 近 1 月           10.86%   28天后重置    │
│ ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░      │
└─────────────────────────────────────────┘
```

- 进度条颜色阈值复用 `getProgressClass`：≥70% 黄、≥90% 红
- 每档由「标签 + 百分比 + 进度条 + 重置倒计时」组成；行间距紧凑
- 倒计时格式化函数 `formatResetCountdown(resetTs)`：
  - `> 1 天`：`Nd`
  - `> 1 小时`：`Nh Nm`
  - `> 1 分钟`：`Nm`
  - `< 1 分钟`：`<1分钟`
  - 已过期：`已重置`

### popup（Tab 切换式）

新增 Tab `data-tab="volcengine"`，Tab 顺序：GLM / MiniMax / DeepSeek / Xiaomi / **Volcengine**。面板内复用同样的三档进度条布局。设置面板的「套餐启用」分组中追加 Volcengine 开关。

### 设置面板

sidepanel 与 popup 的「套餐启用」分组都新增一行：
```
Volcengine   [toggle]   默认开启
```

### detail 目录

`chrome-extension/detail/` 当前为空目录，本期不涉及。

## 消息通信协议

### 1. 获取 csrf token

```js
{ type: 'getVolcengineToken' }
// 响应
{ token: 'xxx' } | { token: null }
```

实现：`chrome.cookies.get({ url: 'https://console.volcengine.com', name: 'csrfToken' })`，返回 `value` 或 `null`。

### 2. 拉取用量

```js
{ type: 'fetchVolcengineUsage' }
// 成功
{
  success: true,
  data: {
    status: 'Running' | 'Expired',
    updatedAt: 1782375930,
    quotas: [
      { level: 'session', percent: 9.08,  resetAt: 1782392248 },
      { level: 'weekly',  percent: 21.72, resetAt: 1782662400 },
      { level: 'monthly', percent: 10.86, resetAt: 1784822399 }
    ]
  }
}
// 失败
{ success: false, error: 'login_required' | 'network' | 'timeout' | 'unknown' }
```

handler 内部职责：
1. 调用 `getVolcengineToken` 拿到 csrfToken
2. 无 token → 返回 `error: 'login_required'`
3. 用 `fetch` 并附 `x-csrf-token`，`credentials: 'include'`，5s 超时
4. 解析 `QuotaUsage` 数组，按 `Level` 映射到响应字段中

## 状态与缓存

### chrome.storage.local 新增/扩展

| key | 类型 | 说明 |
|-----|------|------|
| `volcengineCache` | `{ data, timestamp }` | 同 `glmCache` 结构，缓存最近一次成功结果 |
| `enabledPlans.volcengine` | `boolean` | 默认 `true`，关闭后 UI 隐藏且后端不请求 |
| `notifiedAlerts.volcengine_session_T{1,2,3}` | `boolean` | 阈值预警去重标志 |

### 全部禁用空状态

`sbEmptyPlans` 判定需把 `volcengine` 纳入：当 `enabledPlans` 中所有平台均为 `false` 时显示空状态。

## 预警逻辑

- 仅对 `session` 档（5 小时周期、变化最频繁、最具时效性）触发阈值告警
- 复用现有 `alertThreshold1/2/3` 与 `notifiedAlerts` 机制
- 通知文案：`火山方舟会话用量已达 50%`（百分比取整数）
- 周期重置识别：检测到 `session.resetAt` 相比上次缓存值发生变化时，清空对应 `notifiedAlerts` 中 `volcengine_session_T*` 三个 key

## 自动刷新

- 与现有平台一起，受 `autoRefreshEnabled` / `autoRefreshInterval` 控制
- `enabledPlans.volcengine === false` 时跳过请求

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `chrome-extension/manifest.json` | host_permissions 新增 `https://console.volcengine.com/*` |
| `chrome-extension/background/service-worker.js` | 新增 `getVolcengineToken` / `fetchVolcengineUsage` handler；接入自动刷新调度与预警检查；尊重 `enabledPlans.volcengine` |
| `chrome-extension/sidepanel/sidepanel.html` | 新增 `#sbCardVolcengine` 卡片；设置面板新增 Volcengine 启用开关 `#sbPlanToggleVolcengine` |
| `chrome-extension/sidepanel/sidepanel.js` | 新增 `renderVolcengine` / `fetchVolcengine` / `showVolcengineState`；接入空状态、缓存、自动刷新、预警；新增 `formatResetCountdown` 工具函数 |
| `chrome-extension/sidepanel/sidepanel.css` | 新增三档进度条紧凑布局样式 `.sb-quota-row` 等 |
| `chrome-extension/popup/popup.html` | 新增 Volcengine Tab 与 panel；设置面板新增启用开关 |
| `chrome-extension/popup/popup.js` | `PLAN_KEYS` 与 `fetchFunctions` 新增 volcengine；新增 `showVolcengineState` / `fetchVolcengineData` / `renderVolcengine` |
| `chrome-extension/popup/popup.css` | 同 sidepanel，新增三档进度条样式（复用现有 `.progress-bar` 基底） |
| `CLAUDE.md` | 在「关键 API 端点」与「状态管理」段落补充 Volcengine 相关说明 |

## 边界情况

| 场景 | 表现 |
|------|------|
| Cookie 中无 `csrfToken` | login 态：「请先登录火山方舟」+「前往登录」按钮（链接到 coding-plan 页面） |
| API 401/403 | 同上 |
| 网络/超时 | error 态 + 重试按钮 |
| `Status: Expired` | 卡片角标「已过期」，进度条灰显，仍展示百分比 |
| `QuotaUsage` 某档缺失 | 缺档不渲染，其他档正常 |
| 单次刷新时切断网络 | 沿用现有 `volcengineCache` 显示上次成功值（与 GLM 一致） |

## 不在本期范围

- 套餐类型（Pro/Lite）/ 起止时间展示（需多调用 `ListSubscribeTrade`，本期不必要）
- 模型列表展示（`ListArkCodeLatestModel` 数据本期不使用）
- detail 详情页（目录为空）

## 验证标准

1. 在已登录火山引擎的浏览器中加载扩展后，sidepanel 与 popup 都能看到 Volcengine 卡片，三档进度条数值与官方页面一致
2. 未登录时显示 login 态、提供「前往登录」按钮
3. 关闭 Volcengine 启用开关后：UI 隐藏、不发起请求、不参与预警
4. session 档进度跨过用户设置的预警阈值时弹出通知，文案形如「火山方舟会话用量已达 X%」
5. session 档 `resetAt` 周期重置后能再次触发同一阈值的预警
6. 自动刷新开启后按配置间隔同步刷新 Volcengine 数据
