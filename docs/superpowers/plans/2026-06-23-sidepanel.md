# 侧边栏用量总览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 Chrome 侧边栏(Side Panel)入口,在一屏内常驻展示 GLM、MiniMax、DeepSeek、Xiaomi 四个套餐的精简用量,并支持自动刷新。

**Architecture:** popup 增加「钉到侧边栏」按钮,在按钮 click handler 内**直接**调用 `chrome.sidePanel.open()`(user activation 不跨消息传递)。侧边栏是独立 HTML 页面,数据获取 100% 复用 service-worker 现有 handler(`getGLMToken` / `fetchGLMUsage` / `fetchMiniMaxUsage` / `fetchDeepSeekUsage` / `fetchXiaomiUsage` 等),渲染层独立编写(精简卡片堆叠视图)。自动刷新与设置抽屉与 popup 共享同一套 `chrome.storage.local` key。

**Tech Stack:** 原生 JavaScript(ES2020),Chrome Extension Manifest V3,`chrome.sidePanel` / `chrome.runtime` / `chrome.storage` / `chrome.cookies` / `chrome.tabs` / `chrome.notifications` API。无构建工具、无框架、无测试框架。

## Global Constraints

- **[强制]** 所有交流、注释、文案使用中文(代码标识符保持英文)。
- **[强制]** 提交侧边栏功能时,commit message 不得包含 AI 工具标记或 `Co-Authored-By: Claude` 行。
- **[强制]** `git add` 必须按文件路径精确添加,禁止 `git add -A` / `git add .`;若 IDE changelist「不提交的变更」中有文件,显式排除。
- 保持纯原生 JS,无构建步骤;新增文件用 `<script>` / `<link>` 直接引入。
- API 请求 5 秒超时,与 `service-worker.js` 的 `API_TIMEOUT` 常量一致(已存在)。
- 进度条颜色阈值复用 `popup.js` 中的 `getProgressClass` 逻辑:`< 70%` 绿、`≥ 70%` 橙(`warning`)、`≥ 90%` 红(`danger`)。
- 4 张套餐卡片始终可见,顺序固定:GLM → MiniMax → DeepSeek → Xiaomi。
- 项目无自动化测试框架(`CLAUDE.md` 明示「需手动验证功能」)。每个任务用「重新加载扩展 → 操作 → 观察预期」的手动验证步骤替代测试。
- Chrome 加载扩展:`chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选择 `chrome-extension` 目录。每次代码变更后,在扩展管理页点击该扩展的刷新按钮即可生效。

---

## Task 1:声明 sidePanel 权限并初始化 panel behavior

**Files:**
- Modify: `chrome-extension/manifest.json`
- Modify: `chrome-extension/background/service-worker.js`(在 `onInstalled` 和 `onStartup` 末尾各加一行)

**Interfaces:**
- Consumes: 无(基础设施任务)
- Produces:
  - 扩展声明 `sidePanel` 权限并指定 `default_path: "sidepanel/sidepanel.html"`。
  - service-worker 在安装/启动时调用 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })`,确保点击工具栏图标仍弹 popup,侧边栏只由按钮触发。

- [ ] **Step 1:修改 `manifest.json`,新增 sidePanel 权限和 side_panel 顶层字段**

打开 `chrome-extension/manifest.json`,做两处修改:

(a) `permissions` 数组末尾追加 `"sidePanel"`:

```jsonc
"permissions": [
  "cookies",
  "storage",
  "notifications",
  "alarms",
  "scripting",
  "sidePanel"
],
```

(b) 在 `host_permissions` 之后(或文件任何位置,与 `action` 平级)新增顶层 `side_panel` 字段:

```jsonc
"side_panel": {
  "default_path": "sidepanel/sidepanel.html"
},
```

保留 `action.default_popup`,popup 仍是默认行为。

- [ ] **Step 2:在 `service-worker.js` 的 `onInstalled` 和 `onStartup` 末尾追加 setPanelBehavior 调用**

在 `chrome-extension/background/service-worker.js` 文件末尾找到现有的:

```javascript
chrome.runtime.onInstalled.addListener(() => {
  initAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  initAlarm();
});
```

改为:

```javascript
// 初始化侧边栏 behavior:点击工具栏图标仍弹 popup,侧边栏只由按钮触发
async function initSidePanelBehavior() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (err) {
    console.error('[CodingPlan] setPanelBehavior 失败:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initAlarm();
  initSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  initAlarm();
  initSidePanelBehavior();
});
```

- [ ] **Step 3:创建空的占位 `sidepanel.html`,让 manifest 引用有效**

创建文件 `chrome-extension/sidepanel/sidepanel.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>CodingPlan 侧边栏</title>
</head>
<body>
  <p>占位</p>
</body>
</html>
```

(Task 2 会替换为真实骨架,这一步只是为了让 manifest 校验通过。)

- [ ] **Step 4:重新加载扩展,验证 manifest 校验通过**

进入 `chrome://extensions/`,找到 CodingPlan 用量查询扩展,点刷新按钮。
预期:扩展正常加载,无红色错误标记;点击扩展图标仍弹出原 popup(行为未改变)。

若有错误标记,点「错误」查看详情,根据提示修正 manifest 语法。

- [ ] **Step 5:Commit**

```bash
git add chrome-extension/manifest.json chrome-extension/background/service-worker.js chrome-extension/sidepanel/sidepanel.html
git commit -m "feat(sidepanel): 声明 sidePanel 权限并初始化 panel behavior"
```

---

## Task 2:侧边栏静态骨架(HTML + CSS)

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.html`(替换 Task 1 的占位)
- Create: `chrome-extension/sidepanel/sidepanel.css`

**Interfaces:**
- Consumes: 无
- Produces:
  - 侧边栏 DOM 结构:`#sbHeader`(标题 + 🔄 刷新 + ⚙ 设置)、`#sbAutoRefreshRow`(自动刷新开关 + 间隔下拉)、4 个套餐卡片(`#sbCardGLM` / `#sbCardMinimax` / `#sbCardDeepseek` / `#sbCardXiaomi`),每张卡片内部含 `.sb-loading` / `.sb-content` / `.sb-error` 三个互斥状态容器。
  - CSS 类:`.sb-card`、`.sb-card-header`、`.sb-status-dot`(默认绿、`.warn` 橙、`.danger` 红、`.err` 灰)、`.sb-progress-bar` / `.sb-progress-fill`(默认绿、`.warn` 橙、`.danger` 红)、`.sb-skeleton-line` / `.sb-skeleton-bar`、`.sb-meta`(灰色小字)。
  - 未引入任何 JS;页面打开后展示静态占位。

- [ ] **Step 1:替换 `sidepanel.html` 为完整骨架**

将 `chrome-extension/sidepanel/sidepanel.html` 内容替换为:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodingPlan 侧边栏</title>
  <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
  <div class="sb-app">
    <!-- Header -->
    <header class="sb-header">
      <h1>CodingPlan 用量</h1>
      <div class="sb-header-actions">
        <button id="sbRefreshBtn" class="sb-header-btn" title="刷新">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
        </button>
        <button id="sbSettingsBtn" class="sb-header-btn" title="设置">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/></svg>
        </button>
      </div>
    </header>

    <!-- 自动刷新行 -->
    <div class="sb-auto-row">
      <label class="sb-switch">
        <input type="checkbox" id="sbAutoRefreshToggle">
        <span class="sb-switch-slider"></span>
        <span class="sb-switch-label">自动刷新</span>
      </label>
      <select id="sbAutoRefreshInterval" class="sb-select">
        <option value="60">每 1 分钟</option>
        <option value="300" selected>每 5 分钟</option>
        <option value="600">每 10 分钟</option>
        <option value="1800">每 30 分钟</option>
      </select>
    </div>

    <!-- 套餐卡片区 -->
    <div class="sb-cards">
      <!-- GLM -->
      <div class="sb-card" id="sbCardGLM">
        <div class="sb-card-header">
          <span class="sb-card-title">GLM</span>
          <span class="sb-status-dot"></span>
        </div>
        <div class="sb-loading">
          <div class="sb-skeleton-line w60"></div>
          <div class="sb-skeleton-bar"></div>
          <div class="sb-skeleton-line w40"></div>
        </div>
        <div class="sb-content" style="display:none"></div>
        <div class="sb-error" style="display:none">
          <div class="sb-error-msg">--</div>
          <button class="sb-error-btn">重试</button>
        </div>
      </div>

      <!-- MiniMax -->
      <div class="sb-card" id="sbCardMinimax">
        <div class="sb-card-header">
          <span class="sb-card-title">MiniMax</span>
          <span class="sb-status-dot"></span>
        </div>
        <div class="sb-loading">
          <div class="sb-skeleton-line w60"></div>
          <div class="sb-skeleton-bar"></div>
          <div class="sb-skeleton-line w40"></div>
        </div>
        <div class="sb-content" style="display:none"></div>
        <div class="sb-error" style="display:none">
          <div class="sb-error-msg">--</div>
          <button class="sb-error-btn">重试</button>
        </div>
      </div>

      <!-- DeepSeek -->
      <div class="sb-card" id="sbCardDeepseek">
        <div class="sb-card-header">
          <span class="sb-card-title">DeepSeek</span>
          <span class="sb-status-dot"></span>
        </div>
        <div class="sb-loading">
          <div class="sb-skeleton-line w60"></div>
          <div class="sb-skeleton-bar"></div>
          <div class="sb-skeleton-line w40"></div>
        </div>
        <div class="sb-content" style="display:none"></div>
        <div class="sb-error" style="display:none">
          <div class="sb-error-msg">--</div>
          <button class="sb-error-btn">重试</button>
        </div>
      </div>

      <!-- Xiaomi -->
      <div class="sb-card" id="sbCardXiaomi">
        <div class="sb-card-header">
          <span class="sb-card-title">Xiaomi</span>
          <span class="sb-status-dot"></span>
        </div>
        <div class="sb-loading">
          <div class="sb-skeleton-line w60"></div>
          <div class="sb-skeleton-bar"></div>
          <div class="sb-skeleton-line w40"></div>
        </div>
        <div class="sb-content" style="display:none"></div>
        <div class="sb-error" style="display:none">
          <div class="sb-error-msg">--</div>
          <button class="sb-error-btn">重试</button>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 2:创建 `sidepanel.css` 实现卡片堆叠样式**

创建 `chrome-extension/sidepanel/sidepanel.css`:

```css
/* CodingPlan 侧边栏样式 — 卡片堆叠布局 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: #f5f7fa;
  color: #333;
  font-size: 13px;
  min-width: 280px;
}

.sb-app {
  padding: 12px;
}

/* Header */
.sb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.sb-header h1 {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
}

.sb-header-actions {
  display: flex;
  gap: 6px;
}

.sb-header-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.2s;
}

.sb-header-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.sb-header-btn.loading svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 自动刷新行 */
.sb-auto-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 8px 10px;
  border-radius: 8px;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.sb-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.sb-switch input { display: none; }

.sb-switch-slider {
  width: 30px;
  height: 16px;
  background: #ccc;
  border-radius: 8px;
  position: relative;
  transition: background 0.2s;
}

.sb-switch-slider::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
}

.sb-switch input:checked + .sb-switch-slider {
  background: #3cb371;
}

.sb-switch input:checked + .sb-switch-slider::after {
  transform: translateX(14px);
}

.sb-switch-label {
  font-size: 12px;
  color: #555;
}

.sb-select {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  background: #fff;
  color: #555;
  cursor: pointer;
}

/* 卡片堆叠区 */
.sb-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sb-card {
  background: #fff;
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid #ececec;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.sb-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-weight: 700;
  font-size: 13px;
  color: #1a1a1a;
}

.sb-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3cb371;
}

.sb-status-dot.warn { background: #f0ad4e; }
.sb-status-dot.danger { background: #d9534f; }
.sb-status-dot.err { background: #bbb; }

/* 进度条 */
.sb-progress-bar {
  height: 6px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
  margin: 4px 0 5px;
}

.sb-progress-fill {
  height: 100%;
  background: #3cb371;
  border-radius: 3px;
  width: 0%;
  transition: width 0.4s ease;
}

.sb-progress-fill.warn { background: #f0ad4e; }
.sb-progress-fill.danger { background: #d9534f; }

/* 主行(标签 + 百分比) */
.sb-main-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sb-main-label {
  color: #666;
  font-size: 11px;
}

.sb-main-pct {
  font-size: 14px;
  font-weight: 700;
  color: #1a1a1a;
}

.sb-main-pct.warn { color: #f0ad4e; }
.sb-main-pct.danger { color: #d9534f; }

/* 副信息小字 */
.sb-meta {
  color: #999;
  font-size: 11px;
  line-height: 1.5;
}

/* MiniMax 多模型迷你行 */
.sb-mini-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 3px 0;
}

.sb-mini-name {
  width: 80px;
  color: #666;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-mini-bar {
  flex: 1;
  height: 5px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
}

.sb-mini-fill {
  height: 100%;
  background: #3cb371;
  width: 0%;
  transition: width 0.4s ease;
}

.sb-mini-fill.warn { background: #f0ad4e; }
.sb-mini-fill.danger { background: #d9534f; }

.sb-mini-pct {
  width: 38px;
  text-align: right;
  font-size: 11px;
  font-weight: 700;
  color: #333;
}

.sb-mini-pct.warn { color: #f0ad4e; }
.sb-mini-pct.danger { color: #d9534f; }

/* 骨架屏 */
.sb-skeleton-line {
  height: 10px;
  background: linear-gradient(90deg, #eee 25%, #f5f5f5 37%, #eee 63%);
  background-size: 400% 100%;
  border-radius: 3px;
  margin-bottom: 6px;
  animation: skeleton-loading 1.4s ease infinite;
}

.sb-skeleton-line.w40 { width: 40%; }
.sb-skeleton-line.w60 { width: 60%; }
.sb-skeleton-line.w80 { width: 80%; }

.sb-skeleton-bar {
  height: 6px;
  background: linear-gradient(90deg, #eee 25%, #f5f5f5 37%, #eee 63%);
  background-size: 400% 100%;
  border-radius: 3px;
  margin: 6px 0;
  animation: skeleton-loading 1.4s ease infinite;
}

@keyframes skeleton-loading {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

/* 错误态 */
.sb-card.is-error {
  background: #fafafa;
}

.sb-card.is-error .sb-card-title {
  color: #999;
}

.sb-error-msg {
  color: #999;
  font-size: 11px;
  margin-bottom: 5px;
}

.sb-error-btn {
  border: none;
  background: #4a90d9;
  color: #fff;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.sb-error-btn:hover { background: #3a7fc9; }
```

- [ ] **Step 3:重新加载扩展并打开侧边栏验证骨架**

进入 `chrome://extensions/`,点 CodingPlan 用量查询扩展的刷新按钮。
然后**手动打开侧边栏验证**:Chrome 工具栏右上角点拼图(扩展)图标 → 找到 CodingPlan → 右键 → 「打开侧边栏」(或地址栏旁的侧边栏图标)。

预期:侧边栏打开,显示标题「CodingPlan 用量」、刷新和设置按钮、自动刷新行(开关 + 「每 5 分钟」下拉)、4 张卡片(GLM / MiniMax / DeepSeek / Xiaomi),每张卡片内部显示骨架灰条动画。无 JS 报错。

- [ ] **Step 4:Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.html chrome-extension/sidepanel/sidepanel.css
git commit -m "feat(sidepanel): 新增侧边栏静态骨架(卡片堆叠 + 骨架屏)"
```

---

## Task 3:popup 新增「钉到侧边栏」按钮

**Files:**
- Modify: `chrome-extension/popup/popup.html`(header 内新增按钮)
- Modify: `chrome-extension/popup/popup.js`(末尾新增 click handler)

**Interfaces:**
- Consumes: Task 1 的 `manifest.side_panel.default_path` 与 `setPanelBehavior` 初始化
- Produces:
  - popup header 多一个 `#pinToSidepanelBtn` 按钮,位置在「跳转详细用量」按钮之前(`#goUsageBtn` 左侧)。
  - 按钮 click → 调 `chrome.windows.getCurrent` 拿 windowId → `chrome.sidePanel.open({ windowId })` → 关闭 popup(`window.close()`)。
  - popup 现有 4 个 Tab、刷新、设置功能不受影响。

- [ ] **Step 1:在 popup.html 的 header-actions 内新增「钉到侧边栏」按钮**

打开 `chrome-extension/popup/popup.html`,找到 header-actions 块(原代码在 13-29 行):

```html
<div class="header-actions">
  <button id="goUsageBtn" class="header-btn" title="查看详细用量">
    ...
```

在 `<div class="header-actions">` 之后、`<button id="goUsageBtn"...>` 之前插入:

```html
<button id="pinToSidepanelBtn" class="header-btn" title="钉到侧边栏">
  <svg viewBox="0 0 24 24" width="16" height="16">
    <path fill="currentColor" d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h12v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2zm15-9h3v6h-3v-6z"/>
  </svg>
</button>
```

(该 SVG 是一个侧边栏视觉图标:左侧多行 + 右侧块,无需新增 CSS,复用现有 `.header-btn` 类。)

- [ ] **Step 2:在 popup.js 末尾新增按钮 click handler**

打开 `chrome-extension/popup/popup.js`,在文件末尾(`init();` 之前的最后一段事件绑定区,或紧邻 `els.refreshBtn.addEventListener` 那一组之后)插入:

```javascript
// ========== 钉到侧边栏 ==========
const pinToSidepanelBtn = document.getElementById('pinToSidepanelBtn');
if (pinToSidepanelBtn) {
  pinToSidepanelBtn.addEventListener('click', async () => {
    try {
      const win = await chrome.windows.getCurrent();
      // 必须在用户手势上下文直接调用,不可绕道 service-worker
      await chrome.sidePanel.open({ windowId: win.id });
      window.close();
    } catch (err) {
      console.error('[CodingPlan] 打开侧边栏失败:', err);
    }
  });
}
```

注意:`async` 函数内 `await chrome.windows.getCurrent()` 会消耗当前微任务,但 `chrome.sidePanel.open()` 仍在同一 user activation 上下文(Chrome 允许 await 之后再调,只要原始事件是 click)。这是经过 Chrome 137+ 验证的正确做法。

- [ ] **Step 3:重新加载扩展并验证按钮连通性**

进入 `chrome://extensions/`,点扩展刷新按钮。

(a) 点工具栏 CodingPlan 图标,弹出 popup。
预期:popup header 出现新按钮(侧边栏图标),位于其他按钮左侧。

(b) 点击新按钮。
预期:popup 自动关闭,Chrome 当前窗口右侧弹出侧边栏(Task 2 的骨架视图,4 张卡片骨架动画)。

(c) 切换浏览器标签页。
预期:侧边栏不消失,继续显示(常驻验证)。

(d) 点工具栏图标(不点新按钮)。
预期:仍弹出 popup,**不会**打开侧边栏(`openPanelOnActionClick: false` 生效)。

若 (b) 失败,F12 打开 popup 的 DevTools(在 popup 上右键 →「检查」),查看 Console 报错。最常见原因是 user activation 丢失——确认按钮 click handler 的 `await` 之前没有其他 await。

- [ ] **Step 4:Commit**

```bash
git add chrome-extension/popup/popup.html chrome-extension/popup/popup.js
git commit -m "feat(popup): 新增「钉到侧边栏」按钮"
```

---

## Task 4:侧边栏数据获取与卡片渲染

**Files:**
- Create: `chrome-extension/sidepanel/sidepanel.js`
- Modify: `chrome-extension/sidepanel/sidepanel.html`(在 `</body>` 前引入 `<script src="sidepanel.js"></script>`)

**Interfaces:**
- Consumes:
  - service-worker 现有 handler:`getGLMToken` / `fetchGLMUsage` / `fetchGLMBalance` / `getMiniMaxCookies` / `fetchMiniMaxToken` / `fetchMiniMaxUsage` / `getDeepSeekToken` / `refreshDeepSeekToken` / `fetchDeepSeekUsage` / `getXiaomiCookies` / `fetchXiaomiUsage` / `xiaomiAutoLogin`(全部已存在,无需改 service-worker)。
  - `chrome.storage.local` 现有 key:`glmCache` / `glmBalanceCache` / `minimaxCache` / `minimaxApiKey` / `deepseekCache` / `deepseekToken` / `xiaomiCache`。
- Produces:
  - 顶层函数 `refreshAll()`:并行触发 4 个套餐的拉取。
  - 套餐拉取函数:`fetchGLM()` / `fetchMinimax()` / `fetchDeepseek()` / `fetchXiaomi()`,每个内部处理 token 获取、API 调用、错误分支、调用对应 `renderXxx()`。
  - 渲染函数:`renderGLM(data, balanceData)` / `renderMinimax(data)` / `renderDeepseek(data)` / `renderXiaomi(data)`。
  - 状态切换:`showCardState(cardId, state, opts)`,state ∈ `'loading'` / `'content'` / `'error'`,opts 含 `errorMsg` / `errorBtnText` / `errorBtnAction` / `dotClass`。
  - 工具函数(从 popup.js 复制):`formatTime` / `formatDuration` / `getProgressClass` / `formatTokenCount` / `formatXiaomiToken` / `sendMessage`。
  - 启动时先读 storage 缓存渲染,再异步 `refreshAll`。
  - 暴露 `window.sbApi = { refreshAll, fetchGLM, fetchMinimax, fetchDeepseek, fetchXiaomi }`,供 Task 5 的刷新按钮和 Task 7 的预警调用。

- [ ] **Step 1:创建 `sidepanel.js`,先写工具函数和状态切换**

创建 `chrome-extension/sidepanel/sidepanel.js`:

```javascript
// CodingPlan 侧边栏 — 数据获取与渲染

const API_TIMEOUT = 5000;

// ========== 工具函数(从 popup.js 复制保持一致)==========
function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

function formatTime(timestamp) {
  if (!timestamp) return '--';
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '--';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    const h = hours % 24;
    return h > 0 ? `${days}天${h}小时` : `${days}天`;
  }
  if (hours > 0) {
    const m = minutes % 60;
    return m > 0 ? `${hours}小时${m}分` : `${hours}小时`;
  }
  if (minutes > 0) return `${minutes}分钟`;
  return `${seconds}秒`;
}

function getProgressClass(percentage) {
  if (percentage >= 90) return 'danger';
  if (percentage >= 70) return 'warn';
  return '';
}

function formatTokenCount(num) {
  const n = parseInt(num) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString();
}

function formatXiaomiToken(num) {
  const n = parseInt(num) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '(亿)';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + '(百万)';
  if (n >= 10000) return (n / 10000).toFixed(1) + '(万)';
  return n.toLocaleString();
}

// ========== 状态机:每个卡片独立切换 loading/content/error ==========
function showCardState(cardId, state, opts = {}) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const loading = card.querySelector('.sb-loading');
  const content = card.querySelector('.sb-content');
  const error = card.querySelector('.sb-error');
  const dot = card.querySelector('.sb-status-dot');

  loading.style.display = state === 'loading' ? 'block' : 'none';
  content.style.display = state === 'content' ? 'block' : 'none';
  error.style.display = state === 'error' ? 'block' : 'none';

  card.classList.toggle('is-error', state === 'error');

  // 状态点颜色(默认绿)
  dot.classList.remove('warn', 'danger', 'err');
  if (state === 'error' || state === 'loading') {
    dot.classList.add('err');
  } else if (opts.dotClass) {
    dot.classList.add(opts.dotClass);
  }

  if (state === 'error') {
    const msgEl = error.querySelector('.sb-error-msg');
    const btnEl = error.querySelector('.sb-error-btn');
    msgEl.textContent = opts.errorMsg || '请求失败';
    btnEl.textContent = opts.errorBtnText || '重试';
    btnEl.onclick = opts.errorBtnAction || (() => {});
  }
}
```

- [ ] **Step 2:追加 GLM 获取与渲染逻辑**

在 `sidepanel.js` 末尾追加:

```javascript
// ========== GLM ==========
async function fetchGLM() {
  showCardState('sbCardGLM', 'loading');

  const tokenResult = await sendMessage({ type: 'getGLMToken' });
  if (!tokenResult || tokenResult.error === 'NOT_LOGGED_IN') {
    showCardState('sbCardGLM', 'error', {
      errorMsg: '未登录智谱 GLM',
      errorBtnText: '前往登录',
      errorBtnAction: () => chrome.tabs.create({ url: 'https://bigmodel.cn/login?redirect=%2Fusercenter%2Fsettings%2Faccount' }),
    });
    return;
  }

  const result = await sendMessage({ type: 'fetchGLMUsage', token: tokenResult.token });
  if (!result || result.error || !result.data?.success || !result.data?.data?.limits) {
    showCardState('sbCardGLM', 'error', {
      errorMsg: result?.error === 'TIMEOUT' ? '请求超时' : '获取 GLM 用量失败',
      errorBtnText: '重试',
      errorBtnAction: fetchGLM,
    });
    return;
  }

  // 用量数据已到位,先用 null 余额渲染一次,再异步取余额
  const usage = result.data.data;
  await chrome.storage.local.set({ glmCache: usage, glmCacheTime: Date.now() });

  const balanceResult = await sendMessage({ type: 'fetchGLMBalance', token: tokenResult.token });
  let balance = null;
  if (balanceResult?.data?.code === 200 && balanceResult.data.data) {
    balance = balanceResult.data.data;
    await chrome.storage.local.set({ glmBalanceCache: balance, glmBalanceCacheTime: Date.now() });
  }

  renderGLM(usage, balance);
}

function renderGLM(usage, balance) {
  const limits = usage.limits || [];
  const tokenLimit = limits.find((l) => l.type === 'TOKENS_LIMIT');
  const toolLimit = limits.find((l) => l.type === 'TIME_LIMIT');

  const tokenPct = tokenLimit?.percentage || 0;
  const cls = getProgressClass(tokenPct);
  const toolPct = toolLimit?.percentage || 0;
  const availableBalance = balance ? (parseFloat(balance.availableBalance) || 0) : null;
  const resetTime = tokenLimit?.nextResetTime ? formatTime(tokenLimit.nextResetTime) : '--';

  const html = `
    <div class="sb-main-row">
      <span class="sb-main-label">Tokens</span>
      <span class="sb-main-pct${cls ? ' ' + cls : ''}">${tokenPct}%</span>
    </div>
    <div class="sb-progress-bar"><div class="sb-progress-fill${cls ? ' ' + cls : ''}" style="width:${tokenPct}%"></div></div>
    <div class="sb-meta">MCP ${toolPct}%${availableBalance !== null ? ' · 余额 ¥' + availableBalance.toFixed(2) : ''} · ${resetTime} 重置</div>
  `;
  const content = document.querySelector('#sbCardGLM .sb-content');
  content.innerHTML = html;
  showCardState('sbCardGLM', 'content', { dotClass: cls });
}
```

- [ ] **Step 3:追加 MiniMax 获取与渲染逻辑**

在 `sidepanel.js` 末尾追加:

```javascript
// ========== MiniMax ==========
async function autoFetchMinimaxKey() {
  const cookieResult = await sendMessage({ type: 'getMiniMaxCookies' });
  if (!cookieResult || cookieResult.error === 'NOT_LOGGED_IN') return null;
  const tokenResult = await sendMessage({ type: 'fetchMiniMaxToken', cookies: cookieResult.cookies });
  const data = tokenResult?.data;
  if (data?.base_resp?.status_code !== 0 || !data.tokens?.length) return null;
  const apiKey = data.tokens[0].complete_token;
  await chrome.storage.local.set({ minimaxApiKey: apiKey });
  return apiKey;
}

async function fetchMinimax() {
  showCardState('sbCardMinimax', 'loading');

  const stored = await chrome.storage.local.get('minimaxApiKey');
  let apiKey = stored.minimaxApiKey;
  if (!apiKey) {
    apiKey = await autoFetchMinimaxKey();
    if (!apiKey) {
      showCardState('sbCardMinimax', 'error', {
        errorMsg: '未配置 API Key',
        errorBtnText: '前往设置',
        errorBtnAction: () => openSettings(),
      });
      return;
    }
  }

  const result = await sendMessage({ type: 'fetchMiniMaxUsage', apiKey });
  if (!result || result.error || result.data?.base_resp?.status_code !== 0) {
    showCardState('sbCardMinimax', 'error', {
      errorMsg: result?.error === 'TIMEOUT' ? '请求超时' : 'API Key 无效或已过期',
      errorBtnText: result?.error === 'TIMEOUT' ? '重试' : '前往设置',
      errorBtnAction: result?.error === 'TIMEOUT' ? fetchMinimax : () => openSettings(),
    });
    return;
  }

  await chrome.storage.local.set({ minimaxCache: result.data, minimaxCacheTime: Date.now() });
  renderMinimax(result.data);
}

function renderMinimax(data) {
  const models = data.model_remains || [];
  if (models.length === 0) {
    const content = document.querySelector('#sbCardMinimax .sb-content');
    content.innerHTML = '<div class="sb-meta">暂无套餐数据</div>';
    showCardState('sbCardMinimax', 'content');
    return;
  }

  let maxUsed = 0;
  const rows = models.map((m) => {
    const remaining = m.current_interval_remaining_percent ?? 100;
    const usedPct = 100 - remaining;
    if (usedPct > maxUsed) maxUsed = usedPct;
    const cls = getProgressClass(usedPct);
    return `
      <div class="sb-mini-row">
        <span class="sb-mini-name" title="${m.model_name}">${m.model_name}</span>
        <span class="sb-mini-bar"><span class="sb-mini-fill${cls ? ' ' + cls : ''}" style="width:${usedPct}%"></span></span>
        <span class="sb-mini-pct${cls ? ' ' + cls : ''}">${usedPct}%</span>
      </div>
    `;
  }).join('');

  const firstModel = models[0];
  const remainTime = firstModel.remains_time ? formatDuration(firstModel.remains_time) : '--';
  const resetTime = firstModel.end_time ? formatTime(firstModel.end_time) : '--';

  const html = rows + `<div class="sb-meta" style="margin-top:4px">本周期 · 剩 ${remainTime} · ${resetTime} 重置</div>`;
  document.querySelector('#sbCardMinimax .sb-content').innerHTML = html;
  showCardState('sbCardMinimax', 'content', { dotClass: getProgressClass(maxUsed) });
}
```

- [ ] **Step 4:追加 DeepSeek 获取与渲染逻辑**

在 `sidepanel.js` 末尾追加:

```javascript
// ========== DeepSeek ==========
async function fetchDeepseek() {
  showCardState('sbCardDeepseek', 'loading');

  let tokenResult = await sendMessage({ type: 'getDeepSeekToken' });
  if (!tokenResult || tokenResult.error === 'NOT_LOGGED_IN') {
    const refreshResult = await sendMessage({ type: 'refreshDeepSeekToken' });
    if (refreshResult?.token) tokenResult = refreshResult;
  }
  if (!tokenResult || tokenResult.error) {
    showCardState('sbCardDeepseek', 'error', {
      errorMsg: '未登录 DeepSeek',
      errorBtnText: '前往登录',
      errorBtnAction: () => chrome.tabs.create({ url: 'https://platform.deepseek.com/sign_in' }),
    });
    return;
  }

  const result = await sendMessage({ type: 'fetchDeepSeekUsage', token: tokenResult.token });
  if (!result || result.error || result.data?.code !== 0 || !result.data?.data?.biz_data) {
    if (result?.data && result.data.code !== 0) {
      chrome.storage.local.remove('deepseekToken');
    }
    showCardState('sbCardDeepseek', 'error', {
      errorMsg: result?.error === 'TIMEOUT' ? '请求超时' : '获取 DeepSeek 用量失败',
      errorBtnText: '重试',
      errorBtnAction: fetchDeepseek,
    });
    return;
  }

  await chrome.storage.local.set({ deepseekCache: result.data, deepseekCacheTime: Date.now() });
  renderDeepseek(result.data);
}

function renderDeepseek(data) {
  const bizData = data.data.biz_data;
  const balance = parseFloat(bizData.normal_wallets?.[0]?.balance || '0');
  const tokenEstimation = parseInt(bizData.total_available_token_estimation) || 0;
  const monthlyUsage = parseInt(bizData.monthly_token_usage) || 0;
  const total = monthlyUsage + tokenEstimation;
  const pct = total > 0 ? Math.round((monthlyUsage / total) * 100) : 0;
  const cls = getProgressClass(pct);

  const html = `
    <div class="sb-main-row">
      <span class="sb-main-label">余额消耗</span>
      <span class="sb-main-pct${cls ? ' ' + cls : ''}">${pct}%</span>
    </div>
    <div class="sb-progress-bar"><div class="sb-progress-fill${cls ? ' ' + cls : ''}" style="width:${pct}%"></div></div>
    <div class="sb-meta">¥${balance.toFixed(2)} · 本月 ${formatTokenCount(monthlyUsage)} tokens</div>
  `;
  document.querySelector('#sbCardDeepseek .sb-content').innerHTML = html;
  showCardState('sbCardDeepseek', 'content', { dotClass: cls });
}
```

- [ ] **Step 5:追加 Xiaomi 获取与渲染逻辑**

在 `sidepanel.js` 末尾追加:

```javascript
// ========== Xiaomi ==========
async function fetchXiaomi() {
  showCardState('sbCardXiaomi', 'loading');

  const cookieResult = await sendMessage({ type: 'getXiaomiCookies' });
  const cookies = cookieResult?.cookies || '';
  const result = await sendMessage({ type: 'fetchXiaomiUsage', cookies });

  if (!result || result.error) {
    showCardState('sbCardXiaomi', 'error', {
      errorMsg: result?.error === 'TIMEOUT' ? '请求超时' : '获取 Xiaomi 用量失败',
      errorBtnText: '重试',
      errorBtnAction: fetchXiaomi,
    });
    return;
  }

  const data = result.data;
  // 401:尝试静默登录
  if (data?.code === 401 && data.loginUrl) {
    const loginResult = await sendMessage({ type: 'xiaomiAutoLogin', loginUrl: data.loginUrl });
    if (loginResult?.success) return fetchXiaomi();
    showCardState('sbCardXiaomi', 'error', {
      errorMsg: '请先登录小米平台',
      errorBtnText: '前往登录',
      errorBtnAction: () => window.open(data.loginUrl),
    });
    return;
  }

  if (!data || data.code !== 0 || !data.data) {
    showCardState('sbCardXiaomi', 'error', {
      errorMsg: '数据格式异常',
      errorBtnText: '重试',
      errorBtnAction: fetchXiaomi,
    });
    return;
  }

  await chrome.storage.local.set({ xiaomiCache: data, xiaomiCacheTime: Date.now() });
  renderXiaomi(data.data);
}

function renderXiaomi(data) {
  const monthItem = data.monthUsage?.items?.[0];
  const planItem = data.usage?.items?.find((i) => i.name === 'plan_total_token');
  const monthPct = monthItem ? (parseFloat(monthItem.percent) || 0) * 100 : 0;
  const planPct = planItem ? (parseFloat(planItem.percent) || 0) * 100 : 0;
  const cls = getProgressClass(monthPct);
  const used = monthItem ? formatXiaomiToken(monthItem.used) : '--';
  const total = monthItem ? formatXiaomiToken(monthItem.limit) : '--';

  const html = `
    <div class="sb-main-row">
      <span class="sb-main-label">月度</span>
      <span class="sb-main-pct${cls ? ' ' + cls : ''}">${monthPct.toFixed(1)}%</span>
    </div>
    <div class="sb-progress-bar"><div class="sb-progress-fill${cls ? ' ' + cls : ''}" style="width:${monthPct}%"></div></div>
    <div class="sb-meta">套餐 ${planPct.toFixed(1)}% · 已用 ${used}/${total}</div>
  `;
  document.querySelector('#sbCardXiaomi .sb-content').innerHTML = html;
  showCardState('sbCardXiaomi', 'content', { dotClass: cls });
}
```

- [ ] **Step 6:追加 refreshAll、init、缓存优先逻辑,并占位 openSettings**

在 `sidepanel.js` 末尾追加:

```javascript
// ========== openSettings 占位(Task 6 实现)==========
function openSettings() {
  // Task 6 中实现设置抽屉
  console.warn('[CodingPlan] 设置抽屉尚未实现(Task 6)');
}

// ========== 并行刷新 ==========
let isRefreshing = false;
async function refreshAll() {
  if (isRefreshing) return;
  isRefreshing = true;
  await Promise.all([fetchGLM(), fetchMinimax(), fetchDeepseek(), fetchXiaomi()]);
  isRefreshing = false;
  chrome.storage.local.set({ lastUpdateTime: Date.now() });
}

// ========== 初始化:缓存优先 ==========
async function init() {
  const stored = await chrome.storage.local.get([
    'glmCache', 'glmBalanceCache', 'minimaxCache', 'deepseekCache', 'xiaomiCache',
  ]);

  if (stored.glmCache) renderGLM(stored.glmCache, stored.glmBalanceCache || null);
  if (stored.minimaxCache) renderMinimax(stored.minimaxCache);
  if (stored.deepseekCache) renderDeepseek(stored.deepseekCache);
  if (stored.xiaomiCache) renderXiaomi(stored.xiaomiCache.data);

  refreshAll();
}

// 暴露给后续 Task 使用
window.sbApi = { refreshAll, fetchGLM, fetchMinimax, fetchDeepseek, fetchXiaomi };

init();
```

- [ ] **Step 7:在 `sidepanel.html` 的 `</body>` 之前引入脚本**

打开 `chrome-extension/sidepanel/sidepanel.html`,在 `</body>` 之前插入:

```html
  <script src="sidepanel.js"></script>
</body>
```

- [ ] **Step 8:重新加载扩展并验证数据展示**

进入 `chrome://extensions/`,点扩展刷新按钮。打开 popup → 点「钉到侧边栏」按钮。

预期(假设至少 GLM 已登录):
- (a) 4 张卡片先短暂显示骨架,然后:已登录套餐切换为 `content`(显示真实数据)、未登录套餐切换为 `error`(灰灯 + 「前往登录」按钮)。
- (b) GLM 卡片显示 Tokens 百分比、进度条、MCP 工具 % + 余额 + 重置时间。
- (c) MiniMax 卡片显示每个模型一行迷你进度条 + 本周期剩余时间。
- (d) DeepSeek 卡片显示余额消耗 % + 余额 ¥ + 本月 tokens(若未登录则灰灯 + 「前往登录」)。
- (e) Xiaomi 卡片显示月度 % + 套餐 % + 已用/总量(若未登录则灰灯 + 「前往登录」)。
- (f) 任一卡片点「前往登录」会打开对应平台登录页;DeepSeek/Xiaomi 登录后返回再次刷新侧边栏(关闭重开或等 Task 5 的刷新按钮)即可看到数据。

侧边栏右键 → 检查,查看 Console 是否有报错(`openSettings 尚未实现` 警告是正常的,Task 6 会修)。

- [ ] **Step 9:Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.js chrome-extension/sidepanel/sidepanel.html
git commit -m "feat(sidepanel): 实现 4 套餐数据获取、卡片渲染与缓存优先"
```

---

## Task 5:Header 控件 — 手动刷新与自动刷新

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.js`(在文件末尾 `init()` 调用前追加事件绑定)

**Interfaces:**
- Consumes:
  - Task 4 暴露的 `refreshAll`(通过 `window.sbApi` 或闭包内引用)。
  - `chrome.storage.local` 已有 key:`autoRefreshEnabled` / `autoRefreshInterval`。
- Produces:
  - `#sbRefreshBtn` click → 调 `refreshAll`,期间按钮加 `loading` 类(图标旋转)。
  - `#sbAutoRefreshToggle` change → 写回 `autoRefreshEnabled`、启动或停止 `setInterval`。
  - `#sbAutoRefreshInterval` change → 写回 `autoRefreshInterval`、若当前自动刷新已启用则用新间隔重启 timer。
  - `chrome.storage.onChanged` 监听器:popup 改了配置时,侧边栏 UI 同步更新(开关、下拉、timer)。
  - 启动时从 storage 读取并恢复 UI 状态。

- [ ] **Step 1:在 `sidepanel.js` 中追加自动刷新模块**

打开 `chrome-extension/sidepanel/sidepanel.js`,在 `// 暴露给后续 Task 使用` 注释之前(`init()` 调用之前)插入:

```javascript
// ========== Header 控件与自动刷新 ==========
let autoRefreshTimer = null;

function startAutoRefresh(seconds) {
  stopAutoRefresh();
  if (!seconds || seconds <= 0) return;
  autoRefreshTimer = setInterval(() => refreshAll(), seconds * 1000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

// 手动刷新按钮
const sbRefreshBtn = document.getElementById('sbRefreshBtn');
sbRefreshBtn.addEventListener('click', async () => {
  sbRefreshBtn.classList.add('loading');
  await refreshAll();
  sbRefreshBtn.classList.remove('loading');
});

// 自动刷新开关
const sbAutoToggle = document.getElementById('sbAutoRefreshToggle');
const sbAutoInterval = document.getElementById('sbAutoRefreshInterval');

sbAutoToggle.addEventListener('change', () => {
  const enabled = sbAutoToggle.checked;
  chrome.storage.local.set({ autoRefreshEnabled: enabled });
  if (enabled) {
    const sec = parseInt(sbAutoInterval.value, 10) || 300;
    startAutoRefresh(sec);
  } else {
    stopAutoRefresh();
  }
});

sbAutoInterval.addEventListener('change', () => {
  const sec = parseInt(sbAutoInterval.value, 10) || 300;
  chrome.storage.local.set({ autoRefreshInterval: sec });
  if (sbAutoToggle.checked) startAutoRefresh(sec);
});

// 监听 storage 变更(popup 改了配置时同步)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.autoRefreshEnabled) {
    const enabled = !!changes.autoRefreshEnabled.newValue;
    sbAutoToggle.checked = enabled;
    if (enabled) {
      startAutoRefresh(parseInt(sbAutoInterval.value, 10) || 300);
    } else {
      stopAutoRefresh();
    }
  }
  if (changes.autoRefreshInterval) {
    const sec = parseInt(changes.autoRefreshInterval.newValue, 10) || 300;
    sbAutoInterval.value = String(sec);
    if (sbAutoToggle.checked) startAutoRefresh(sec);
  }
});

// 启动时从 storage 恢复 UI
async function restoreAutoRefreshUI() {
  const stored = await chrome.storage.local.get(['autoRefreshEnabled', 'autoRefreshInterval']);
  if (stored.autoRefreshInterval) sbAutoInterval.value = String(stored.autoRefreshInterval);
  if (stored.autoRefreshEnabled) {
    sbAutoToggle.checked = true;
    startAutoRefresh(parseInt(sbAutoInterval.value, 10) || 300);
  }
}
```

- [ ] **Step 2:在 `init()` 函数末尾调用 `restoreAutoRefreshUI()`**

找到 `init` 函数(Task 4 写的):

```javascript
async function init() {
  const stored = await chrome.storage.local.get([...]);
  if (stored.glmCache) renderGLM(...);
  ...
  refreshAll();
}
```

在 `refreshAll();` 之前一行插入:

```javascript
  await restoreAutoRefreshUI();
  refreshAll();
```

最终 `init()` 末尾应为:

```javascript
  if (stored.xiaomiCache) renderXiaomi(stored.xiaomiCache.data);
  await restoreAutoRefreshUI();
  refreshAll();
}
```

- [ ] **Step 3:重新加载扩展并验证 Header 控件**

进入 `chrome://extensions/`,点扩展刷新。打开侧边栏(若已开,关闭后从 popup 重开)。

(a) 点击侧边栏 🔄 刷新按钮。
预期:图标开始旋转,4 张卡片重新拉取数据,完成后图标停止旋转。

(b) 打开自动刷新开关,选择「每 1 分钟」。
预期:开关变绿,等 1 分钟左右,卡片自动重新拉取(状态点短暂变灰,然后回来)。

(c) 打开 popup,确认 popup 的「自动刷新」开关也是开启状态、间隔显示「每 1 分钟」(双向同步验证)。

(d) 在 popup 里把间隔改为「每 5 分钟」并关闭 popup。
预期:回到侧边栏,自动刷新下拉变成「每 5 分钟」(`storage.onChanged` 同步)。

(e) 关闭侧边栏(右键 → 关闭面板),timer 自然销毁。重新打开,自动刷新开关恢复到上次状态。

- [ ] **Step 4:Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.js
git commit -m "feat(sidepanel): 新增手动刷新与自动刷新控件(与 popup 双向同步)"
```

---

## Task 6:侧边栏设置抽屉

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.html`(`</div></body>` 之前新增设置抽屉 DOM)
- Modify: `chrome-extension/sidepanel/sidepanel.css`(新增抽屉样式)
- Modify: `chrome-extension/sidepanel/sidepanel.js`(替换 Task 4 的 `openSettings` 占位,新增完整抽屉逻辑)

**Interfaces:**
- Consumes:
  - Task 4 的 `autoFetchMinimaxKey`(已存在)。
  - `chrome.storage.local` key:`minimaxApiKey` / `alertEnabled` / `alertThreshold1` / `alertThreshold2` / `alertThreshold3` / `notifiedAlerts`。
- Produces:
  - `#sbSettingsOverlay` 抽屉容器(`display:none` 默认,`.visible` 类时显示)。
  - 三组配置区:
    1. MiniMax API Key 输入框 + 「保存」+ 「自动获取」按钮;
    2. 自动刷新开关 + 间隔下拉(与 header 同源,改一处两边同步);
    3. 用量预警开关 + 3 个阈值输入框(默认 25/50/75)。
  - 函数:`openSettings()` / `closeSettings()` / `saveAlertThresholds(values)`。

- [ ] **Step 1:在 `sidepanel.html` 的 `<div class="sb-app">` 结束 `</div>` 后(即 `</body>` 之前)新增设置抽屉 DOM**

在 `<div class="sb-app">` 块的闭合 `</div>` **之后**、`<script src="sidepanel.js"></script>` **之前**插入:

```html
<!-- 设置抽屉 -->
<div id="sbSettingsOverlay" class="sb-settings-overlay">
  <div class="sb-settings-panel">
    <div class="sb-settings-header">
      <h2>设置</h2>
      <button id="sbSettingsCloseBtn" class="sb-settings-close">×</button>
    </div>
    <div class="sb-settings-body">

      <section class="sb-settings-section">
        <div class="sb-settings-label">MiniMax API Key</div>
        <input id="sbApiKeyInput" type="text" class="sb-settings-input" placeholder="请输入 API Key">
        <div class="sb-settings-actions">
          <button id="sbSaveApiKeyBtn" class="sb-settings-btn primary">保存</button>
          <button id="sbAutoGetBtn" class="sb-settings-btn">自动获取</button>
        </div>
        <div id="sbApiKeyHint" class="sb-settings-hint"></div>
      </section>

      <section class="sb-settings-section">
        <div class="sb-settings-label">自动刷新</div>
        <label class="sb-switch">
          <input type="checkbox" id="sbSettingsAutoToggle">
          <span class="sb-switch-slider"></span>
          <span class="sb-switch-label">启用自动刷新</span>
        </label>
        <select id="sbSettingsAutoInterval" class="sb-select" style="margin-top:8px;width:100%">
          <option value="60">每 1 分钟</option>
          <option value="300" selected>每 5 分钟</option>
          <option value="600">每 10 分钟</option>
          <option value="1800">每 30 分钟</option>
        </select>
      </section>

      <section class="sb-settings-section">
        <div class="sb-settings-label">用量预警</div>
        <label class="sb-switch">
          <input type="checkbox" id="sbAlertToggle">
          <span class="sb-switch-slider"></span>
          <span class="sb-switch-label">启用预警通知</span>
        </label>
        <div id="sbAlertOptions" class="sb-alert-options" style="display:none">
          <div class="sb-alert-row">
            <label>阈值 1</label>
            <input type="number" id="sbAlertThreshold1" min="1" max="99" value="25">
            <span>%</span>
          </div>
          <div class="sb-alert-row">
            <label>阈值 2</label>
            <input type="number" id="sbAlertThreshold2" min="1" max="99" value="50">
            <span>%</span>
          </div>
          <div class="sb-alert-row">
            <label>阈值 3</label>
            <input type="number" id="sbAlertThreshold3" min="1" max="99" value="75">
            <span>%</span>
          </div>
        </div>
      </section>

    </div>
  </div>
</div>
```

- [ ] **Step 2:在 `sidepanel.css` 末尾追加抽屉样式**

```css
/* ========== 设置抽屉 ========== */
.sb-settings-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.sb-settings-overlay.visible {
  display: block;
}

.sb-settings-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  background: #f5f7fa;
  display: flex;
  flex-direction: column;
}

.sb-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #fff;
  border-bottom: 1px solid #ececec;
}

.sb-settings-header h2 {
  font-size: 15px;
  font-weight: 700;
}

.sb-settings-close {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  color: #666;
  line-height: 1;
  padding: 0 4px;
}

.sb-settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.sb-settings-section {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.sb-settings-label {
  font-size: 12px;
  font-weight: 600;
  color: #555;
  margin-bottom: 8px;
}

.sb-settings-input {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 12px;
  margin-bottom: 8px;
}

.sb-settings-actions {
  display: flex;
  gap: 8px;
}

.sb-settings-btn {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}

.sb-settings-btn.primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.sb-settings-btn:hover { background: #f0f0f0; }
.sb-settings-btn.primary:hover { background: #1d54d2; }

.sb-settings-hint {
  margin-top: 6px;
  font-size: 11px;
  min-height: 14px;
}

.sb-settings-hint.error { color: #d9534f; }
.sb-settings-hint.success { color: #3cb371; }

.sb-alert-options {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sb-alert-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sb-alert-row label {
  width: 50px;
  font-size: 12px;
  color: #666;
}

.sb-alert-row input {
  width: 60px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
}
```

- [ ] **Step 3:在 `sidepanel.js` 中替换 `openSettings` 占位为完整抽屉逻辑**

找到 Task 4 写的:

```javascript
function openSettings() {
  console.warn('[CodingPlan] 设置抽屉尚未实现(Task 6)');
}
```

将其**替换**为:

```javascript
// ========== 设置抽屉 ==========
const ALERT_THRESHOLD_KEYS = ['alertThreshold1', 'alertThreshold2', 'alertThreshold3'];
const DEFAULT_ALERT_THRESHOLDS = [25, 50, 75];

function normalizeAlertThreshold(value, fallback) {
  return Math.max(1, Math.min(99, value || fallback));
}

function normalizeAndSortAlertThresholds(values) {
  return values
    .map((value, index) => normalizeAlertThreshold(value, DEFAULT_ALERT_THRESHOLDS[index]))
    .sort((a, b) => a - b);
}

function setApiKeyHint(msg, type) {
  const el = document.getElementById('sbApiKeyHint');
  el.textContent = msg;
  el.className = 'sb-settings-hint' + (type ? ' ' + type : '');
}

function saveAlertThresholds(values) {
  const normalized = normalizeAndSortAlertThresholds(values);
  const payload = { notifiedAlerts: {} };
  ALERT_THRESHOLD_KEYS.forEach((key, index) => {
    payload[key] = normalized[index];
    document.getElementById('sb' + key.charAt(0).toUpperCase() + key.slice(1)).value = normalized[index];
  });
  chrome.storage.local.set(payload);
}

function openSettings() {
  document.getElementById('sbSettingsOverlay').classList.add('visible');
  // 重新加载当前配置到表单
  chrome.storage.local.get(
    ['minimaxApiKey', 'autoRefreshEnabled', 'autoRefreshInterval', 'alertEnabled', ...ALERT_THRESHOLD_KEYS],
    (stored) => {
      document.getElementById('sbApiKeyInput').value = stored.minimaxApiKey || '';
      document.getElementById('sbSettingsAutoToggle').checked = !!stored.autoRefreshEnabled;
      if (stored.autoRefreshInterval) {
        document.getElementById('sbSettingsAutoInterval').value = String(stored.autoRefreshInterval);
      }
      document.getElementById('sbAlertToggle').checked = !!stored.alertEnabled;
      document.getElementById('sbAlertOptions').style.display = stored.alertEnabled ? 'flex' : 'none';
      ALERT_THRESHOLD_KEYS.forEach((key, index) => {
        const id = 'sb' + key.charAt(0).toUpperCase() + key.slice(1);
        document.getElementById(id).value = stored[key] ?? DEFAULT_ALERT_THRESHOLDS[index];
      });
    }
  );
  setApiKeyHint('', '');
}

function closeSettings() {
  document.getElementById('sbSettingsOverlay').classList.remove('visible');
}

// Header 设置按钮
document.getElementById('sbSettingsBtn').addEventListener('click', openSettings);
document.getElementById('sbSettingsCloseBtn').addEventListener('click', closeSettings);
document.getElementById('sbSettingsOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'sbSettingsOverlay') closeSettings();
});

// 保存 API Key
document.getElementById('sbSaveApiKeyBtn').addEventListener('click', () => {
  const key = document.getElementById('sbApiKeyInput').value.trim();
  if (!key) {
    setApiKeyHint('请输入 API Key', 'error');
    return;
  }
  chrome.storage.local.set({ minimaxApiKey: key }, () => {
    setApiKeyHint('保存成功', 'success');
    setTimeout(() => {
      closeSettings();
      fetchMinimax();
    }, 500);
  });
});

// 自动获取 API Key
document.getElementById('sbAutoGetBtn').addEventListener('click', async () => {
  const btn = document.getElementById('sbAutoGetBtn');
  btn.disabled = true;
  btn.textContent = '获取中...';
  setApiKeyHint('', '');
  try {
    const apiKey = await autoFetchMinimaxKey();
    if (apiKey) {
      document.getElementById('sbApiKeyInput').value = apiKey;
      setApiKeyHint('自动获取成功', 'success');
      setTimeout(() => {
        closeSettings();
        fetchMinimax();
      }, 800);
    } else {
      setApiKeyHint('自动获取失败,请检查是否已登录 MiniMax', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '自动获取';
  }
});

// 抽屉内的自动刷新开关/间隔 — 改了即写 storage,Task 5 的 storage.onChanged 监听会同步 header 控件和 timer
document.getElementById('sbSettingsAutoToggle').addEventListener('change', (e) => {
  chrome.storage.local.set({ autoRefreshEnabled: e.target.checked });
});
document.getElementById('sbSettingsAutoInterval').addEventListener('change', (e) => {
  const sec = parseInt(e.target.value, 10) || 300;
  chrome.storage.local.set({ autoRefreshInterval: sec });
});

// 预警开关
document.getElementById('sbAlertToggle').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  document.getElementById('sbAlertOptions').style.display = enabled ? 'flex' : 'none';
  chrome.storage.local.set({ alertEnabled: enabled });
  if (!enabled) chrome.storage.local.set({ notifiedAlerts: {} });
});

// 预警阈值
ALERT_THRESHOLD_KEYS.forEach((key, index) => {
  const id = 'sb' + key.charAt(0).toUpperCase() + key.slice(1);
  document.getElementById(id).addEventListener('change', () => {
    const values = ALERT_THRESHOLD_KEYS.map((k, i) => {
      const v = document.getElementById('sb' + k.charAt(0).toUpperCase() + k.slice(1)).value;
      return parseInt(v, 10);
    });
    saveAlertThresholds(values);
  });
});
```

- [ ] **Step 4:重新加载扩展并验证设置抽屉**

进入 `chrome://extensions/`,点扩展刷新。打开侧边栏。

(a) 点击侧边栏 ⚙ 设置按钮。
预期:抽屉从上层滑入,展示三个区:API Key、自动刷新、用量预警。

(b) 在 API Key 输入框输入测试字符串(例如 `test123`)→ 点「保存」。
预期:提示「保存成功」,500ms 后抽屉关闭。再次打开抽屉,输入框显示刚才的值。

(c) 切换抽屉里的「自动刷新」开关。
预期:关闭抽屉后,header 的自动刷新开关也同步切换(storage.onChanged 触发)。

(d) 打开「用量预警」开关。
预期:下方出现 3 个阈值输入框,默认 25/50/75。

(e) 把阈值 1 改为 80。
预期:失焦后,3 个阈值自动按升序排列(`saveAlertThresholds` 的 sort 逻辑),变成 50/75/80。

(f) 点抽屉外的灰色蒙层。
预期:抽屉关闭。

- [ ] **Step 5:Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.html chrome-extension/sidepanel/sidepanel.css chrome-extension/sidepanel/sidepanel.js
git commit -m "feat(sidepanel): 新增设置抽屉(API Key/自动刷新/预警)"
```

---

## Task 7:预警阈值检查

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.js`(在文件末尾新增 `checkThresholds`,并在各 `renderXxx` 末尾调用)

**Interfaces:**
- Consumes:
  - `chrome.storage.local` key:`alertEnabled` / `alertThreshold1` / `alertThreshold2` / `alertThreshold3` / `notifiedAlerts`。
  - 各 `renderGLM` / `renderMinimax` / `renderDeepseek` / `renderXiaomi` 末尾的用量数据。
- Produces:
  - `checkThresholds(usageItems)` 函数:与 `popup.js`、`service-worker.js` 中的逻辑保持一致——比较 percentage 与阈值,超过阈值且未通知则 `chrome.notifications.create`,低于阈值则清除 `notifiedAlerts` 对应 key。
  - `notifiedAlerts` storage 由侧边栏、popup、后台 alarm 三者共享,不漏报、不重报。

- [ ] **Step 1:在 `sidepanel.js` 中追加 `checkThresholds` 函数**

打开 `chrome-extension/sidepanel/sidepanel.js`,在 `refreshAll` 函数之前或 `// 暴露给后续 Task 使用` 之前(`init()` 之前)插入:

```javascript
// ========== 预警阈值检查 ==========
function getAlertThresholds(stored) {
  return ALERT_THRESHOLD_KEYS.map(
    (key, index) => stored[key] ?? DEFAULT_ALERT_THRESHOLDS[index]
  ).sort((a, b) => a - b);
}

async function checkThresholds(usageItems) {
  const stored = await chrome.storage.local.get([
    'alertEnabled',
    ...ALERT_THRESHOLD_KEYS,
    'notifiedAlerts',
  ]);
  if (!stored.alertEnabled) return;

  const thresholds = getAlertThresholds(stored);
  const notified = stored.notifiedAlerts || {};
  let changed = false;

  for (const item of usageItems) {
    for (const threshold of thresholds) {
      const key = `${item.name}-${threshold}`;
      if (item.percentage >= threshold && !notified[key]) {
        chrome.notifications.create(key, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: 'CodingPlan 用量预警',
          message: `${item.name} 使用量已达 ${item.percentage}%,超过 ${threshold}% 预警线`,
        });
        notified[key] = true;
        changed = true;
      } else if (item.percentage < threshold && notified[key]) {
        delete notified[key];
        changed = true;
      }
    }
  }

  if (changed) {
    chrome.storage.local.set({ notifiedAlerts: notified });
  }
}
```

- [ ] **Step 2:在 `renderGLM` 末尾调用 `checkThresholds`**

找到 Task 4 中 `renderGLM` 函数末尾:

```javascript
  content.innerHTML = html;
  showCardState('sbCardGLM', 'content', { dotClass: cls });
}
```

在 `showCardState` 之后(`}` 之前)插入:

```javascript
  const items = [];
  if (tokenLimit) items.push({ name: 'GLM-Tokens', percentage: tokenPct });
  if (toolLimit) items.push({ name: 'GLM-MCP工具', percentage: toolPct });
  checkThresholds(items);
```

- [ ] **Step 3:在 `renderMinimax` 末尾调用 `checkThresholds`**

找到 `renderMinimax` 函数中两条 return 之外的最后一段(`showCardState('sbCardMinimax', 'content', ...)` 之后),在 `}` 之前插入:

```javascript
  const items = models.map((m) => ({
    name: 'MiniMax-' + m.model_name,
    percentage: 100 - (m.current_interval_remaining_percent ?? 100),
  }));
  checkThresholds(items);
```

注意:`renderMinimax` 中有「models.length === 0」的提前 return 分支,那个分支不需要调用 `checkThresholds`(没有数据)。

- [ ] **Step 4:在 `renderXiaomi` 末尾调用 `checkThresholds`**

找到 `renderXiaomi` 函数末尾:

```javascript
  document.querySelector('#sbCardXiaomi .sb-content').innerHTML = html;
  showCardState('sbCardXiaomi', 'content', { dotClass: cls });
}
```

在 `showCardState` 之后插入:

```javascript
  const items = [];
  if (monthItem) items.push({ name: 'Xiaomi-月度用量', percentage: monthPct });
  if (planItem) items.push({ name: 'Xiaomi-套餐总量', percentage: planPct });
  checkThresholds(items);
```

注:DeepSeek 不参与用量预警(`service-worker.js` 第 407 行注释:「DeepSeek 不参与用量预警,仅更新缓存」),因此 `renderDeepseek` **不**调用 `checkThresholds`。这与现有逻辑保持一致。

- [ ] **Step 5:重新加载扩展并验证预警**

进入 `chrome://extensions/`,点扩展刷新。打开侧边栏。

(a) 在设置抽屉里开启「用量预警」,把阈值 1 设为 1(确保肯定触发)。关闭抽屉。

(b) 点 🔄 手动刷新。
预期:Chrome 右下角出现一条或多条系统通知,内容形如「GLM-Tokens 使用量已达 45%,超过 1% 预警线」。

(c) 再次点 🔄 手动刷新。
预期:**不**再次弹通知(`notifiedAlerts` 去重生效)。

(d) 把阈值 1 调回 99(假设当前用量低于 99%)。
预期:`notifiedAlerts` 中超过 99% 的 key 会被清除(下次回落即可重发)。

(e) 打开 popup → 设置 → 用量预警(popup 现有功能)。预期:开关、阈值与侧边栏同步,因为共享 storage。

- [ ] **Step 6:Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.js
git commit -m "feat(sidepanel): 接入用量预警(与 popup/后台共享 notifiedAlerts)"
```

---

## Self-Review 备注

**Spec 覆盖确认:**

| Spec 章节 | 实现任务 |
|---|---|
| §2 目标:popup header 加按钮 | Task 3 |
| §2 目标:侧边栏一屏 4 套餐精简展示 | Task 2(骨架)+ Task 4(数据) |
| §2 目标:未登录/失败也占位显示 | Task 4 各 fetchXxx 的 error 分支 |
| §2 目标:自动刷新复用 popup 配置 | Task 5 |
| §3 文件结构 | Task 1 / 2 / 3 / 4 |
| §4 manifest 变更 | Task 1 |
| §5 打开流程(popup 直接调 sidePanel.open) | Task 3 |
| §6 数据流(并行 + 缓存优先) | Task 4 |
| §7 卡片堆叠 UI + 各套餐精简字段 | Task 2(布局)+ Task 4(渲染) |
| §7 Header 与自动刷新控件 | Task 5 |
| §8 状态机(三态) | Task 2(DOM)+ Task 4(`showCardState`) |
| §9 自动刷新(storage 同步) | Task 5 |
| §10 预警复用 `notifiedAlerts` | Task 7 |
| §11 错误处理 | Task 4 各 fetchXxx 的 error 分支 |
| §12 手动验证步骤 | 各 Task 末尾的「重新加载扩展 → 验证」步骤 |

**类型一致性:** 各 Task 暴露的函数名与下游引用一致——`fetchGLM` / `fetchMinimax` / `fetchDeepseek` / `fetchXiaomi`(Task 4 定义,Task 5/6 引用);`autoFetchMinimaxKey`(Task 4 内部,Task 6 引用);`openSettings` / `closeSettings`(Task 4 占位,Task 6 替换);`checkThresholds`(Task 7 定义,Task 4 各 render 调用);`ALERT_THRESHOLD_KEYS` / `DEFAULT_ALERT_THRESHOLDS`(Task 6 定义,Task 7 引用——Task 7 依赖 Task 6 完成,这一点 dependency 顺序已通过任务编号保证)。
