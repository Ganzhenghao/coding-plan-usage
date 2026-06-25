# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

CodingPlan 用量查询 — 一款 Chrome 浏览器扩展（Manifest V3），用于查询智谱 GLM 和 MiniMax 编码套餐的实时用量信息。纯原生 JavaScript 实现，无构建工具、无框架依赖。

## 开发方式

- **无构建步骤**：直接编辑 `chrome-extension/` 目录下的文件即可
- **加载扩展**：Chrome → `chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选择 `chrome-extension` 目录
- **调试**：修改代码后在扩展管理页点击刷新按钮，弹窗右键「检查」可打开 DevTools
- **无测试框架**：项目未配置测试，需手动验证功能

## 架构

### 消息通信模型

扩展采用 popup ↔ service-worker 消息通信架构：

- **popup.js** 通过 `chrome.runtime.sendMessage` 发起请求
- **service-worker.js** 通过 `chrome.runtime.onMessage` 监听并路由到对应 handler
- 消息类型：`getGLMToken` / `fetchGLMUsage` / `getMiniMaxCookies` / `fetchMiniMaxToken` / `fetchMiniMaxUsage`

### 数据流

1. **GLM**：从 `bigmodel.cn` Cookie 获取 token → 调用用量 API → 渲染进度条（Tokens + MCP工具调用）
2. **MiniMax**：从 `chrome.storage.local` 读取 API Key（或通过 Cookie 自动获取）→ 调用用量 API → 动态生成模型卡片

### 状态管理

所有持久化状态存储在 `chrome.storage.local`：
- `minimaxApiKey` — MiniMax API Key
- `glmCache` / `minimaxCache` — 上次查询结果缓存
- `autoRefreshEnabled` / `autoRefreshInterval` — 自动刷新配置
- `alertEnabled` / `alertThreshold1` / `alertThreshold2` / `alertThreshold3` / `notifiedAlerts` — 用量预警配置
- `enabledPlans` — 各套餐启用开关(默认全开,关闭后 UI 隐藏且前后端不请求该平台)
- `volcengineCache` — Volcengine 上次查询结果缓存

### UI 状态机

GLM 和 MiniMax 面板各自有独立的状态切换（`showGLMState` / `showMinimaxState`），状态包括：`loading`（骨架屏）、`content`（数据展示）、`error`（错误提示）、`login`/`nokey`（未登录/未配置）。

## 关键 API 端点

- GLM 用量：`GET https://bigmodel.cn/api/monitor/usage/quota/limit`（需 `authorization` header）
- MiniMax Token：`GET https://www.minimaxi.com/backend/token?token_type=4`（需 Cookie）
- MiniMax 用量：`GET https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains`（需 Bearer Token）
- Volcengine 用量：`POST https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage`（需 `x-csrf-token` header）。**注意**：火山方舟的 `csrfToken` 是 partitioned cookie，service worker 跨站请求拿不到，必须由 `content/volcengine-content.js` 在 `console.volcengine.com` 页面上下文里发起 fetch（同站 first-party 才能带上正确 cookie）。service worker 通过 `chrome.tabs.query` 找到已打开的控制台 tab，再用 `chrome.tabs.sendMessage` 委托 content script 取数；未打开控制台时返回 `LOGIN_REQUIRED`。返回 `QuotaUsage[]`，含 `session/weekly/monthly` 三档百分比与重置时间。

## 注意事项

- 所有 API 请求有 5 秒超时（`API_TIMEOUT`）
- 进度条颜色阈值：≥70% 黄色警告，≥90% 红色危险（`getProgressClass` 函数）
- MCP 工具名称映射在 `TOOL_NAME_MAP` 常量中维护
- 弹窗固定宽度 360px，设置面板为右滑抽屉式覆盖层
