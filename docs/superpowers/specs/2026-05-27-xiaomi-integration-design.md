# Xiaomi 用量查询接入设计

## 概述

在 CodingPlan 用量查询扩展中新增 Xiaomi（小米）供应商面板，查询 platform.xiaomimimo.com 的 Token 套餐用量信息。遵循现有 GLM/MiniMax/DeepSeek 的架构模式和 UI 风格。

## 消息通信

新增 2 个消息类型：

| 消息类型 | 方向 | 说明 |
|---|---|---|
| `getXiaomiCookies` | popup → SW | 获取 `platform.xiaomimimo.com` 域名下所有 Cookie |
| `fetchXiaomiUsage` | popup → SW | 携带 Cookie 调用用量 API |

### 数据流

1. popup 发送 `getXiaomiCookies`，service-worker 通过 `chrome.cookies.getAll` 获取 `platform.xiaomimimo.com` 下所有 Cookie
2. popup 发送 `fetchXiaomiUsage`，service-worker 使用获取到的 Cookie 调用 `GET https://platform.xiaomimimo.com/api/v1/tokenPlan/usage`
3. 判断响应：
   - `code === 0`：渲染数据
   - `code === 401`：从响应中的 `loginUrl` 字段提取登录链接，显示登录提示

### API 请求细节

- 请求需要手动拼接 Cookie header（将 `chrome.cookies.getAll` 返回的 Cookie 拼成字符串）
- 设置 `x-timezone: Asia/Shanghai` header
- 设置 `content-type: application/json` header
- 5 秒超时（复用 `API_TIMEOUT`）
- `referer: https://platform.xiaomimimo.com/console/plan-manage`

### API 响应格式

成功响应（code === 0）：

```json
{
  "code": 0,
  "message": "",
  "data": {
    "monthUsage": {
      "percent": 0,
      "items": [{ "name": "month_total_token", "used": 0, "limit": 4100000000, "percent": 0 }]
    },
    "usage": {
      "percent": 0,
      "items": [
        { "name": "plan_total_token", "used": 0, "limit": 4100000000, "percent": 0 },
        { "name": "compensation_total_token", "used": 0, "limit": 0, "percent": 0 }
      ]
    }
  }
}
```

未登录响应（code === 401）：

```json
{
  "code": 401,
  "loginUrl": "https://account.xiaomi.com/pass/serviceLogin?callback=..."
}
```

## UI 设计

### Tab 栏

在现有 GLM / MiniMax / DeepSeek 后新增 `Xiaomi` tab，`data-tab="xiaomi"`。

### 状态机

3 个状态（无独立 login 状态，401 归入 error 状态）：

- `loading`：骨架屏（3 个占位卡片）
- `content`：数据展示（三张卡片）
- `error`：错误提示。401 时显示"请先登录小米平台"+ 跳转按钮（`window.open(loginUrl)`）；其他错误显示错误信息 + 重试按钮

### 卡片布局（方案 A：三卡片）

三张独立卡片，每张包含：标题 + "已用 X(单位) / 总量 Y(单位)" + 进度条 + 百分比。

1. **月度用量** — 数据来源 `data.monthUsage.items[0]`（`month_total_token`）
2. **套餐总量** — 数据来源 `data.usage.items` 中 `name === "plan_total_token"` 的项
3. **补偿额度** — 数据来源 `data.usage.items` 中 `name === "compensation_total_token"` 的项。当 `limit === 0` 时隐藏整张卡片

### 数字格式化

动态单位函数 `formatTokenCount(value)`：

- `value >= 1亿`（100000000）→ `X.X(亿)`
- `value >= 1百万`（1000000）→ `X.X(百万)`
- `value >= 1万`（10000）→ `X.X(万)`
- `value < 1万` → 直接显示数字

示例：`4100000000` → `41.0(亿)`，`5000000` → `5.0(百万)`，`125000` → `12.5(万)`

### 进度条颜色

复用现有 `getProgressClass()`：
- < 70%：蓝色（正常）
- 70% ~ 90%：黄色（警告）
- ≥ 90%：红色（危险）

### 用量页面跳转

当 Xiaomi tab 激活时，点击顶部 `goUsageBtn` 跳转 `https://platform.xiaomimimo.com/console/plan-manage`。

## 集成配置

### manifest.json

新增 `host_permissions`：

```json
"*://platform.xiaomimimo.com/*",
"*://account.xiaomi.com/*"
```

### 缓存

复用现有缓存模式：
- 存储键：`xiaomiCache`（完整响应数据）、`xiaomiCacheTime`（时间戳）
- 打开弹窗时先渲染缓存数据，再异步刷新

### 自动刷新

在 `checkUsageInBackground()` 中加入 Xiaomi 用量查询，与其他供应商一起定时刷新。

### 预警系统

Xiaomi 月度用量的 `percent` 值纳入 `checkThresholds()` 阈值检测，与其他供应商统一触发 Chrome 通知。

## 涉及文件

| 文件 | 变更 |
|---|---|
| `manifest.json` | 新增 host_permissions |
| `popup/popup.html` | 新增 Xiaomi tab + 面板 HTML |
| `popup/popup.css` | 无新增样式（复用现有卡片/进度条样式） |
| `popup/popup.js` | 新增 Xiaomi 状态管理、数据获取、渲染逻辑、`formatTokenCount` 工具函数 |
| `background/service-worker.js` | 新增 `getXiaomiCookies`、`fetchXiaomiUsage` handler |
