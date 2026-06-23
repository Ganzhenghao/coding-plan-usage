# 套餐启用开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置抽屉新增「套餐启用」开关,允许逐个启停 GLM/MiniMax/DeepSeek/Xiaomi 四个平台,关闭后 UI 隐藏且前后端都不再请求该平台。

**Architecture:** 新增 `enabledPlans` 聚合 storage key(默认全开,`!== false` 判断)。设置抽屉顶部加 4 个独立 toggle。前端 `refreshAll` 在调用层过滤禁用平台;后台 `checkUsageAlarm` 每段加 `isPlanEnabled` 判断。`storage.onChanged` 跨 popup/sidepanel 实时同步 UI。

**Tech Stack:** Chrome Extension MV3、原生 JavaScript、`chrome.storage.local`、`storage.onChanged`。

**测试方式:** 本项目无自动化测试框架(CLAUDE.md 明确)。每个任务通过「加载扩展 → 手动操作 → 观察网络/行为」验证,验证步骤写入任务。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `chrome-extension/popup/popup.html` | 新增「套餐启用」分组 + 空状态容器 |
| `chrome-extension/popup/popup.js` | 启停逻辑:常量、辅助函数、事件、过滤、初始化、同步 |
| `chrome-extension/popup/popup.css` | 新增 `.empty-plans` 空状态样式 |
| `chrome-extension/sidepanel/sidepanel.html` | 新增「套餐启用」分组 + 空状态容器 |
| `chrome-extension/sidepanel/sidepanel.js` | 对应 popup.js 的启停逻辑 |
| `chrome-extension/sidepanel/sidepanel.css` | 新增 `.sb-empty-plans` 空状态样式 |
| `chrome-extension/background/service-worker.js` | `checkUsageAlarm` 四段加 `isPlanEnabled` 判断 |

每个 UI 文件(popup / sidepanel)改动自包含,可独立验证。background 改动最后做,因为它依赖前面已写入 storage 的 `enabledPlans` key。

---

## Task 1: popup — 新增「套餐启用」分组 HTML + 空状态容器

**Files:**
- Modify: `chrome-extension/popup/popup.html`

- [ ] **Step 1: 在 popup.html 的设置面板最顶部插入「套餐启用」分组**

在 `chrome-extension/popup/popup.html` 中找到:

```html
      <div class="settings-body">
        <!-- MiniMax API Key -->
        <div class="settings-group">
```

替换为(在 `.settings-body` 开头、MiniMax API Key 之前插入新分组):

```html
      <div class="settings-body">
        <!-- 套餐启用 -->
        <div class="settings-group">
          <div class="settings-label">套餐启用</div>
          <div class="settings-row">
            <span class="settings-desc">GLM</span>
            <label class="toggle">
              <input type="checkbox" id="planToggleGlm" checked>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="settings-row">
            <span class="settings-desc">MiniMax</span>
            <label class="toggle">
              <input type="checkbox" id="planToggleMinimax" checked>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="settings-row">
            <span class="settings-desc">DeepSeek</span>
            <label class="toggle">
              <input type="checkbox" id="planToggleDeepseek" checked>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="settings-row">
            <span class="settings-desc">Xiaomi</span>
            <label class="toggle">
              <input type="checkbox" id="planToggleXiaomi" checked>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <!-- MiniMax API Key -->
        <div class="settings-group">
```

- [ ] **Step 2: 在 popup.html 的 `.tabs` 之后、`glmPanel` 之前插入空状态容器**

找到:

```html
    <div class="tabs">
      <button class="tab active" data-tab="glm">GLM</button>
      <button class="tab" data-tab="minimax">Minimax</button>
      <button class="tab" data-tab="deepseek">DeepSeek</button>
      <button class="tab" data-tab="xiaomi">Xiaomi</button>
    </div>

    <!-- GLM 面板 -->
```

替换为:

```html
    <div class="tabs">
      <button class="tab active" data-tab="glm">GLM</button>
      <button class="tab" data-tab="minimax">Minimax</button>
      <button class="tab" data-tab="deepseek">DeepSeek</button>
      <button class="tab" data-tab="xiaomi">Xiaomi</button>
    </div>

    <!-- 全部套餐禁用时的空状态 -->
    <div id="emptyPlans" class="empty-plans" style="display:none">
      <p class="empty-title">所有套餐已禁用</p>
      <p class="empty-hint">请在设置中启用至少一个套餐</p>
      <button id="emptyOpenSettingsBtn" class="primary-btn">打开设置</button>
    </div>

    <!-- GLM 面板 -->
```

- [ ] **Step 3: 验证 HTML 加载正常**

在 Chrome `chrome://extensions/` 刷新扩展 → 打开 popup → 点齿轮打开设置抽屉 → 确认顶部出现「套餐启用」分组且 4 个开关都默认勾选。此时开关暂无功能(下个 Task 接线)。

- [ ] **Step 4: Commit**

```bash
git add chrome-extension/popup/popup.html
git commit -m "feat(plan-toggle): popup 设置抽屉新增套餐启用分组与空状态容器"
```

---

## Task 2: popup.css — 新增空状态样式

**Files:**
- Modify: `chrome-extension/popup/popup.css`

- [ ] **Step 1: 在 popup.css 末尾追加空状态样式**

在 `chrome-extension/popup/popup.css` 末尾追加:

```css
/* 全部套餐禁用的空状态 */
.empty-plans {
  text-align: center;
  padding: 40px 20px;
}
.empty-plans .empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 6px;
}
.empty-plans .empty-hint {
  font-size: 13px;
  color: #999;
  margin: 0 0 16px;
}
```

- [ ] **Step 2: 验证(此时空状态容器 display:none 看不到,仅确认 CSS 无语法错误)**

刷新扩展 → 打开 popup → 控制台无 CSS 报错即为通过。

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/popup/popup.css
git commit -m "feat(plan-toggle): popup 新增空状态样式"
```

---

## Task 3: popup.js — 启停核心逻辑

本 Task 实现 popup 的全部启停功能:常量、辅助函数、开关事件、`refreshAll` 过滤、初始化过滤、`storage.onChanged` 同步、空状态按钮。这是最大的一块,但所有改动集中在 popup.js 一个文件内。

**Files:**
- Modify: `chrome-extension/popup/popup.js`

- [ ] **Step 1: 顶部新增 PLAN_KEYS 常量与 isPlanEnabled 辅助函数**

在 `chrome-extension/popup/popup.js` 顶部,找到:

```js
const ALERT_THRESHOLD_KEYS = ['alertThreshold1', 'alertThreshold2', 'alertThreshold3'];
const DEFAULT_ALERT_THRESHOLDS = [25, 50, 75];
```

在其后追加:

```js
// 套餐平台标识(与 tab data-tab / card id 对应)
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi'];
// 套餐开关 DOM id 映射
const PLAN_TOGGLE_IDS = {
  glm: 'planToggleGlm',
  minimax: 'planToggleMinimax',
  deepseek: 'planToggleDeepseek',
  xiaomi: 'planToggleXiaomi',
};

// 判断某平台是否启用(undefined 视为启用,默认全开)
function isPlanEnabled(enabledPlans, key) {
  return enabledPlans?.[key] !== false;
}
```

- [ ] **Step 2: 在 els 对象中注册空状态相关 DOM 元素**

找到 els 对象中的:

```js
  // 全局
  errorMsg: $('#errorMsg'),
};
```

在 `errorMsg` 之后、闭合 `}` 之前插入空状态元素:

```js
  // 全局
  errorMsg: $('#errorMsg'),
  // 空状态(全部套餐禁用)
  emptyPlans: $('#emptyPlans'),
  emptyOpenSettingsBtn: $('#emptyOpenSettingsBtn'),
  // 套餐开关
  planToggleGlm: $('#planToggleGlm'),
  planToggleMinimax: $('#planToggleMinimax'),
  planToggleDeepseek: $('#planToggleDeepseek'),
  planToggleXiaomi: $('#planToggleXiaomi'),
};
```

- [ ] **Step 3: 新增 tab/panel 显隐控制 + applyEnabledPlans 函数**

在 popup.js 中找到 `// ========== Tab 切换 ==========` 之前的位置(即 `showXiaomiState` 函数结束后),插入新函数区块:

```js
// ========== 套餐启停:UI 显隐 ==========
const planElsMap = {
  glm: { tab: document.querySelector('.tab[data-tab="glm"]'), panel: els.glmPanel },
  minimax: { tab: document.querySelector('.tab[data-tab="minimax"]'), panel: els.minimaxPanel },
  deepseek: { tab: document.querySelector('.tab[data-tab="deepseek"]'), panel: els.deepseekPanel },
  xiaomi: { tab: document.querySelector('.tab[data-tab="xiaomi"]'), panel: els.xiaomiPanel },
};

// 根据 enabledPlans 显隐 Tab/Panel,处理当前选中态与空状态
function applyEnabledPlans(enabledPlans) {
  const enabledKeys = PLAN_KEYS.filter((k) => isPlanEnabled(enabledPlans, k));

  PLAN_KEYS.forEach((k) => {
    const enabled = isPlanEnabled(enabledPlans, k);
    const { tab, panel } = planElsMap[k];
    if (tab) tab.style.display = enabled ? '' : 'none';
    panel.style.display = enabled ? '' : 'none';
  });

  // 全部禁用 → 显示空状态
  if (enabledKeys.length === 0) {
    els.emptyPlans.style.display = 'block';
    return;
  }
  els.emptyPlans.style.display = 'none';

  // 当前选中平台被禁用 → 跳到第一个启用项
  if (!isPlanEnabled(enabledPlans, currentTab)) {
    switchTab(enabledKeys[0]);
  }
}
```

- [ ] **Step 4: 修改 refreshAll,过滤禁用平台**

找到:

```js
async function refreshAll() {
  if (isRefreshing) return;
  isRefreshing = true;
  els.refreshBtn.classList.add('loading');

  await Promise.all([fetchGLMData(), fetchMiniMaxData(), fetchDeepSeekData(), fetchXiaomiData()]);

  isRefreshing = false;
  els.refreshBtn.classList.remove('loading');
  chrome.storage.local.set({ lastUpdateTime: Date.now() });
}
```

替换为:

```js
async function refreshAll() {
  if (isRefreshing) return;
  isRefreshing = true;
  els.refreshBtn.classList.add('loading');

  const { enabledPlans } = await chrome.storage.local.get('enabledPlans');
  const fetchFnMap = {
    glm: fetchGLMData,
    minimax: fetchMiniMaxData,
    deepseek: fetchDeepSeekData,
    xiaomi: fetchXiaomiData,
  };
  const tasks = PLAN_KEYS
    .filter((k) => isPlanEnabled(enabledPlans, k))
    .map((k) => fetchFnMap[k]());
  await Promise.all(tasks);

  isRefreshing = false;
  els.refreshBtn.classList.remove('loading');
  chrome.storage.local.set({ lastUpdateTime: Date.now() });
}
```

- [ ] **Step 5: 新增开关事件 — 写 storage 并由 onChanged 驱动 UI**

在 popup.js 中找到「设置面板」区块(即 `function openSettings()` 之前),插入套餐开关事件:

```js
// ========== 套餐启停:开关事件 ==========
function bindPlanToggle(key) {
  const el = els[PLAN_TOGGLE_IDS[key]];
  el.addEventListener('change', async () => {
    const { enabledPlans } = await chrome.storage.local.get('enabledPlans');
    const next = { ...(enabledPlans || {}) };
    // 写入显式的 true/false(而非依赖 undefined)
    PLAN_KEYS.forEach((k) => {
      next[k] = isPlanEnabled(enabledPlans, k);
    });
    next[key] = el.checked;
    chrome.storage.local.set({ enabledPlans: next });
    // storage.onChanged 会触发 applyEnabledPlans
  });
}
PLAN_KEYS.forEach(bindPlanToggle);

// 空状态「打开设置」按钮
els.emptyOpenSettingsBtn.addEventListener('click', openSettings);
```

- [ ] **Step 6: openSettings 回填套餐开关状态**

找到:

```js
function openSettings() {
  els.settingsOverlay.classList.add('visible');
  // 加载已有 API Key
  chrome.storage.local.get('minimaxApiKey', (stored) => {
    els.apiKeyInput.value = stored.minimaxApiKey || '';
  });
  setApiKeyHint('', '');
}
```

替换为:

```js
function openSettings() {
  els.settingsOverlay.classList.add('visible');
  // 加载已有 API Key
  chrome.storage.local.get('minimaxApiKey', (stored) => {
    els.apiKeyInput.value = stored.minimaxApiKey || '';
  });
  // 回填套餐开关
  chrome.storage.local.get('enabledPlans', (stored) => {
    PLAN_KEYS.forEach((k) => {
      els[PLAN_TOGGLE_IDS[k]].checked = isPlanEnabled(stored.enabledPlans, k);
    });
  });
  setApiKeyHint('', '');
}
```

- [ ] **Step 7: init() 读取 enabledPlans 并应用**

找到 init() 顶部的 storage 读取:

```js
async function init() {
  const stored = await chrome.storage.local.get([
    'lastTab',
    'glmCache',
    'glmBalanceCache',
    'minimaxCache',
    'deepseekCache',
    'xiaomiCache',
    'autoRefreshEnabled',
    'autoRefreshInterval',
    'alertEnabled',
    ...ALERT_THRESHOLD_KEYS,
  ]);
```

在数组中 `'lastTab'` 之后加入 `'enabledPlans'`:

```js
async function init() {
  const stored = await chrome.storage.local.get([
    'lastTab',
    'enabledPlans',
    'glmCache',
    'glmBalanceCache',
    'minimaxCache',
    'deepseekCache',
    'xiaomiCache',
    'autoRefreshEnabled',
    'autoRefreshInterval',
    'alertEnabled',
    ...ALERT_THRESHOLD_KEYS,
  ]);
```

- [ ] **Step 8: init() 中根据 enabledPlans 处理初始 Tab 与显隐**

在 init() 中找到:

```js
  if (stored.lastTab) {
    switchTab(stored.lastTab);
  }
```

替换为:

```js
  // 根据套餐启用状态处理初始 Tab 与显隐
  applyEnabledPlans(stored.enabledPlans);
  if (stored.lastTab && isPlanEnabled(stored.enabledPlans, stored.lastTab)) {
    switchTab(stored.lastTab);
  }
```

注意:若 `lastTab` 被禁用,`applyEnabledPlans` 内部已调用 `switchTab` 跳到首个启用项,所以这里不需要 else 分支。

- [ ] **Step 9: 注册 storage.onChanged 监听 enabledPlans**

在 popup.js 中找到现有的 storage 相关监听(若没有则加在文件靠近末尾、`init()` 调用之前)。在 popup.js 中,在 `// ========== 刷新 ==========` 区块之后或任意合适位置加入:

```js
// ========== 套餐启停:storage 变更同步 ==========
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.enabledPlans) return;
  applyEnabledPlans(changes.enabledPlans.newValue);
});
```

- [ ] **Step 10: 验证完整功能**

刷新扩展,按以下步骤逐项验证:

1. 打开 popup → 设置抽屉 → 看到 4 个开关默认全开
2. 关闭「Xiaomi」开关 → Xiaomi Tab 与 Panel 立即消失
3. 关闭当前选中的 Tab(如先切到 GLM 再关 GLM) → 自动跳到下一个启用的 Tab
4. 关闭全部 4 个 → 显示「所有套餐已禁用」空状态,点「打开设置」可重新打开抽屉
5. 重新打开任一开关 → 空状态消失,对应 Tab 恢复
6. 打开 DevTools Network → 关闭某平台后点刷新 → 确认该平台无网络请求
7. 关闭 popup 再打开 → 开关状态保持(从 storage 恢复)

- [ ] **Step 11: Commit**

```bash
git add chrome-extension/popup/popup.js
git commit -m "feat(plan-toggle): popup 启停核心逻辑(过滤/同步/空状态)"
```

---

## Task 4: sidepanel — 新增「套餐启用」分组 HTML + 空状态容器

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.html`

- [ ] **Step 1: 在 sidepanel.html 设置抽屉最顶部插入「套餐启用」分组**

找到:

```html
      <div class="sb-settings-body">

        <section class="sb-settings-section">
          <div class="sb-settings-label">MiniMax API Key</div>
```

替换为:

```html
      <div class="sb-settings-body">

        <section class="sb-settings-section">
          <div class="sb-settings-label">套餐启用</div>
          <div class="sb-plan-row">
            <span class="sb-plan-name">GLM</span>
            <label class="sb-switch">
              <input type="checkbox" id="sbPlanToggleGlm" checked>
              <span class="sb-switch-slider"></span>
            </label>
          </div>
          <div class="sb-plan-row">
            <span class="sb-plan-name">MiniMax</span>
            <label class="sb-switch">
              <input type="checkbox" id="sbPlanToggleMinimax" checked>
              <span class="sb-switch-slider"></span>
            </label>
          </div>
          <div class="sb-plan-row">
            <span class="sb-plan-name">DeepSeek</span>
            <label class="sb-switch">
              <input type="checkbox" id="sbPlanToggleDeepseek" checked>
              <span class="sb-switch-slider"></span>
            </label>
          </div>
          <div class="sb-plan-row">
            <span class="sb-plan-name">Xiaomi</span>
            <label class="sb-switch">
              <input type="checkbox" id="sbPlanToggleXiaomi" checked>
              <span class="sb-switch-slider"></span>
            </label>
          </div>
        </section>

        <section class="sb-settings-section">
          <div class="sb-settings-label">MiniMax API Key</div>
```

- [ ] **Step 2: 在 .sb-cards 内部顶部插入空状态容器**

找到:

```html
    <!-- 套餐卡片区 -->
    <div class="sb-cards">
      <!-- GLM -->
      <div class="sb-card" id="sbCardGLM">
```

替换为:

```html
    <!-- 套餐卡片区 -->
    <div class="sb-cards">
      <!-- 全部套餐禁用时的空状态 -->
      <div id="sbEmptyPlans" class="sb-empty-plans" style="display:none">
        <p class="sb-empty-title">所有套餐已禁用</p>
        <p class="sb-empty-hint">请在设置中启用至少一个套餐</p>
      </div>

      <!-- GLM -->
      <div class="sb-card" id="sbCardGLM">
```

- [ ] **Step 3: 验证 HTML 加载**

刷新扩展 → 打开 sidepanel → 点齿轮打开设置 → 确认顶部出现「套餐启用」分组,4 个开关默认勾选。

- [ ] **Step 4: Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.html
git commit -m "feat(plan-toggle): sidepanel 设置抽屉新增套餐启用分组与空状态容器"
```

---

## Task 5: sidepanel.css — 新增空状态与套餐行样式

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.css`

- [ ] **Step 1: 在 sidepanel.css 末尾追加样式**

```css
/* 套餐开关行 */
.sb-plan-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}
.sb-plan-name {
  font-size: 12px;
  color: #333;
}

/* 全部套餐禁用的空状态 */
.sb-empty-plans {
  text-align: center;
  padding: 40px 16px;
}
.sb-empty-plans .sb-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin: 0 0 6px;
}
.sb-empty-plans .sb-empty-hint {
  font-size: 12px;
  color: #999;
  margin: 0;
}
```

- [ ] **Step 2: 验证**

刷新 sidepanel → 设置抽屉中套餐开关行布局正常(左名称右开关)。CSS 无报错即通过。

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.css
git commit -m "feat(plan-toggle): sidepanel 新增套餐开关行与空状态样式"
```

---

## Task 6: sidepanel.js — 启停核心逻辑

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.js`

- [ ] **Step 1: 顶部新增常量与辅助函数**

在 `chrome-extension/sidepanel/sidepanel.js` 顶部(`const API_TIMEOUT = 5000;` 之后)追加:

```js
// 套餐平台标识
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi'];
// 套餐开关 DOM id 映射(sidepanel 用 sbCardXxx 卡片 + sbPlanToggleXxx 开关)
const PLAN_CARD_IDS = {
  glm: 'sbCardGLM',
  minimax: 'sbCardMinimax',
  deepseek: 'sbCardDeepseek',
  xiaomi: 'sbCardXiaomi',
};
const PLAN_TOGGLE_IDS = {
  glm: 'sbPlanToggleGlm',
  minimax: 'sbPlanToggleMinimax',
  deepseek: 'sbPlanToggleDeepseek',
  xiaomi: 'sbPlanToggleXiaomi',
};

// 判断某平台是否启用(undefined 视为启用,默认全开)
function isPlanEnabled(enabledPlans, key) {
  return enabledPlans?.[key] !== false;
}
```

- [ ] **Step 2: 新增 applyEnabledPlans 函数**

在 sidepanel.js 中找到 `// ========== 设置抽屉 ==========` 之前(即 `renderXiaomi` 函数结束后),插入:

```js
// ========== 套餐启停:UI 显隐 ==========
function applyEnabledPlans(enabledPlans) {
  const enabledKeys = PLAN_KEYS.filter((k) => isPlanEnabled(enabledPlans, k));

  PLAN_KEYS.forEach((k) => {
    const enabled = isPlanEnabled(enabledPlans, k);
    const card = document.getElementById(PLAN_CARD_IDS[k]);
    if (card) card.style.display = enabled ? '' : 'none';
  });

  const empty = document.getElementById('sbEmptyPlans');
  if (empty) empty.style.display = enabledKeys.length === 0 ? 'block' : 'none';
}
```

- [ ] **Step 3: 修改 refreshAll 过滤禁用平台**

找到:

```js
async function refreshAll() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    await Promise.all([fetchGLM(), fetchMinimax(), fetchDeepseek(), fetchXiaomi()]);
  } finally {
    isRefreshing = false;
    chrome.storage.local.set({ lastUpdateTime: Date.now() });
  }
}
```

替换为:

```js
async function refreshAll() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    const { enabledPlans } = await chrome.storage.local.get('enabledPlans');
    const fetchFnMap = {
      glm: fetchGLM,
      minimax: fetchMinimax,
      deepseek: fetchDeepseek,
      xiaomi: fetchXiaomi,
    };
    const tasks = PLAN_KEYS
      .filter((k) => isPlanEnabled(enabledPlans, k))
      .map((k) => fetchFnMap[k]());
    await Promise.all(tasks);
  } finally {
    isRefreshing = false;
    chrome.storage.local.set({ lastUpdateTime: Date.now() });
  }
}
```

- [ ] **Step 4: 新增套餐开关事件**

在 sidepanel.js 中找到「套餐开关」合适插入点 —— 放在 `// ========== 设置抽屉 ==========` 区块的 `openSettings` 函数之前。插入:

```js
// ========== 套餐启停:开关事件 ==========
function bindPlanToggle(key) {
  const el = document.getElementById(PLAN_TOGGLE_IDS[key]);
  el.addEventListener('change', async () => {
    const { enabledPlans } = await chrome.storage.local.get('enabledPlans');
    const next = {};
    PLAN_KEYS.forEach((k) => {
      next[k] = isPlanEnabled(enabledPlans, k);
    });
    next[key] = el.checked;
    chrome.storage.local.set({ enabledPlans: next });
  });
}
PLAN_KEYS.forEach(bindPlanToggle);
```

- [ ] **Step 5: openSettings 回填套餐开关**

找到 sidepanel 的 `openSettings` 函数,将其中的 `chrome.storage.local.get(...)` 调用扩展。原代码:

```js
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
```

在读取数组中加入 `'enabledPlans'`,并在回调中回填开关。替换为:

```js
  chrome.storage.local.get(
    ['minimaxApiKey', 'autoRefreshEnabled', 'autoRefreshInterval', 'alertEnabled', 'enabledPlans', ...ALERT_THRESHOLD_KEYS],
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
      // 回填套餐开关
      PLAN_KEYS.forEach((key) => {
        document.getElementById(PLAN_TOGGLE_IDS[key]).checked = isPlanEnabled(stored.enabledPlans, key);
      });
    }
  );
```

- [ ] **Step 6: 扩展现有 storage.onChanged 监听 enabledPlans**

找到 sidepanel.js 中现有的 `chrome.storage.onChanged.addListener`,原代码:

```js
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
```

在回调函数体内、最末尾(`if (changes.autoRefreshInterval)` 块之后)追加 enabledPlans 处理:

```js
  if (changes.enabledPlans) {
    applyEnabledPlans(changes.enabledPlans.newValue);
  }
```

- [ ] **Step 7: init() 读取 enabledPlans 并应用**

找到 sidepanel.js 的 `init()`:

```js
async function init() {
  const stored = await chrome.storage.local.get([
    'glmCache', 'glmBalanceCache', 'minimaxCache', 'deepseekCache', 'xiaomiCache',
  ]);

  if (stored.glmCache) renderGLM(stored.glmCache, stored.glmBalanceCache || null);
  if (stored.minimaxCache) renderMinimax(stored.minimaxCache);
  if (stored.deepseekCache) renderDeepseek(stored.deepseekCache);
  if (stored.xiaomiCache) renderXiaomi(stored.xiaomiCache.data);

  await restoreAutoRefreshUI();
  refreshAll();
}
```

替换为:

```js
async function init() {
  const stored = await chrome.storage.local.get([
    'enabledPlans',
    'glmCache', 'glmBalanceCache', 'minimaxCache', 'deepseekCache', 'xiaomiCache',
  ]);

  // 先应用套餐显隐(决定哪些卡片可见)
  applyEnabledPlans(stored.enabledPlans);

  if (stored.glmCache) renderGLM(stored.glmCache, stored.glmBalanceCache || null);
  if (stored.minimaxCache) renderMinimax(stored.minimaxCache);
  if (stored.deepseekCache) renderDeepseek(stored.deepseekCache);
  if (stored.xiaomiCache) renderXiaomi(stored.xiaomiCache.data);

  await restoreAutoRefreshUI();
  refreshAll();
}
```

- [ ] **Step 8: 验证 sidepanel 完整功能**

刷新扩展,打开 sidepanel,验证:

1. 设置抽屉 → 4 个套餐开关默认全开
2. 关闭 Xiaomi → Xiaomi 卡片立即消失
3. 关闭全部 → 显示「所有套餐已禁用」空状态
4. 打开 popup 改某平台开关 → sidepanel 同步显隐(验证跨端 storage.onChanged)
5. 反之亦然(sidepanel 改 → popup 同步)

- [ ] **Step 9: Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.js
git commit -m "feat(plan-toggle): sidepanel 启停核心逻辑(过滤/同步/空状态)"
```

---

## Task 7: service-worker — 后台预警监控过滤禁用平台

**Files:**
- Modify: `chrome-extension/background/service-worker.js`

- [ ] **Step 1: 顶部新增 PLAN_KEYS 与 isPlanEnabled**

在 `chrome-extension/background/service-worker.js` 顶部(与现有 `ALERT_THRESHOLD_KEYS` / `DEFAULT_ALERT_THRESHOLDS` 同区),找到这两个常量,在其后追加:

```js
// 套餐平台标识
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi'];

// 判断某平台是否启用(undefined 视为启用,默认全开)
function isPlanEnabled(enabledPlans, key) {
  return enabledPlans?.[key] !== false;
}
```

如果 service-worker.js 顶部没有 `ALERT_THRESHOLD_KEYS` / `DEFAULT_ALERT_THRESHOLDS`,则在文件顶部第一个 `const` 或函数定义之后插入上述代码即可(位置不重要,只要在使用之前)。

- [ ] **Step 2: checkUsageAlarm 开头读取 enabledPlans**

找到 `checkUsageAlarm` 函数(包含 GLM/MiniMax/DeepSeek/Xiaomi 四段顺序检查)。在函数开头找到 `const usageItems = [];`(或类似的 usageItems 初始化行),在其后加入 enabledPlans 读取。

如果函数开头形如:

```js
async function checkUsageAlarm() {
  const usageItems = [];
```

替换为:

```js
async function checkUsageAlarm() {
  const usageItems = [];
  const { enabledPlans } = await chrome.storage.local.get('enabledPlans');
```

- [ ] **Step 3: GLM 段加 isPlanEnabled 判断**

找到 GLM 检查段(以 `try {` 开头、包含 `handleGetGLMToken` 的那段),将整段 try-catch 用 if 花括号包起来。原结构形如:

```js
  // 检查 GLM 用量
  try {
    const tokenResult = await handleGetGLMToken();
    // ... 原有逻辑 ...
  } catch (err) {
    console.error('[CodingPlan] GLM 后台检查失败:', err);
  }
```

改为:

```js
  // 检查 GLM 用量
  if (isPlanEnabled(enabledPlans, 'glm')) {
    try {
      const tokenResult = await handleGetGLMToken();
      // ... 原有逻辑不变,仅整体缩进 ...
    } catch (err) {
      console.error('[CodingPlan] GLM 后台检查失败:', err);
    }
  }
```

注意:try-catch 内的所有原有逻辑保持不变,只是整体被 `if (isPlanEnabled(...)) { ... }` 包裹并多缩进一级。

- [ ] **Step 4: MiniMax 段加判断**

对 MiniMax 的 try-catch 段做同样处理:

```js
  // 检查 MiniMax 用量
  if (isPlanEnabled(enabledPlans, 'minimax')) {
    try {
      const minimaxStored = await chrome.storage.local.get('minimaxApiKey');
      // ... 原有逻辑不变 ...
    } catch (err) {
      console.error('[CodingPlan] MiniMax 后台检查失败:', err);
    }
  }
```

- [ ] **Step 5: DeepSeek 段加判断**

```js
  // DeepSeek 不参与用量预警，仅更新缓存
  if (isPlanEnabled(enabledPlans, 'deepseek')) {
    try {
      const deepseekStored = await chrome.storage.local.get('deepseekToken');
      // ... 原有逻辑不变 ...
    } catch (err) {
      console.error('[CodingPlan] DeepSeek 后台检查失败:', err);
    }
  }
```

- [ ] **Step 6: Xiaomi 段加判断**

```js
  // 检查 Xiaomi 用量
  if (isPlanEnabled(enabledPlans, 'xiaomi')) {
    try {
      const xiaomiCookieResult = await handleGetXiaomiCookies();
      // ... 原有逻辑不变 ...
    } catch (err) {
      console.error('[CodingPlan] Xiaomi 后台检查失败:', err);
    }
  }
```

- [ ] **Step 7: 验证后台过滤**

刷新扩展 → 打开 service-worker 的 DevTools(扩展管理页 → 「Service Worker」链接)。

1. 在 popup 设置里关闭某平台(如 Xiaomi)
2. 在 service-worker 控制台确认 `[CodingPlan] Xiaomi 后台检查失败` 之类的日志不再出现(Xiaomi 段被跳过)
3. 可选:在 `checkUsageAlarm` 临时加 `console.log` 或观察 Network 面板确认禁用平台无请求

验证后记得移除任何临时调试代码。

- [ ] **Step 8: Commit**

```bash
git add chrome-extension/background/service-worker.js
git commit -m "feat(plan-toggle): service-worker 后台预警监控跳过禁用平台"
```

---

## Task 8: 整体回归验证 + 文档更新

**Files:**
- Modify: `CLAUDE.md`(可选,更新状态管理文档)

- [ ] **Step 1: 端到端回归测试**

在 `chrome://extensions/` 刷新扩展,完整走一遍以下场景:

**场景 A — 单平台启停**
1. popup 关闭 DeepSeek → DeepSeek Tab 消失,其他正常
2. 切到 sidepanel → DeepSeek 卡片也已消失(跨端同步)
3. 打开 popup 刷新按钮 → Network 确认无 DeepSeek 请求
4. service-worker DevTools → 确认后台检查也跳过 DeepSeek

**场景 B — 当前 Tab 被关闭**
1. popup 切到 GLM → 在设置关闭 GLM → 自动跳到 MiniMax(或下一个启用项)

**场景 C — 全部关闭**
1. 依次关闭 4 个平台 → 显示「所有套餐已禁用」空状态
2. popup 点「打开设置」→ 抽屉打开
3. 打开任一开关 → 空状态消失

**场景 D — 持久化**
1. 关闭某平台 → 关闭 popup → 重新打开 → 状态保持
2. 关闭浏览器重开 → 状态保持

**场景 E — 预警联动**
1. 启用预警 → 关闭某超阈值平台 → 确认不再收到该平台的通知

- [ ] **Step 2: 更新 CLAUDE.md 状态管理文档**

在 `CLAUDE.md` 的「状态管理」小节,现有 storage key 列表中加入 `enabledPlans`。找到:

```
- `alertEnabled` / `alertThreshold1` / `alertThreshold2` / `alertThreshold3` / `notifiedAlerts` — 用量预警配置
```

在其后追加一行:

```
- `enabledPlans` — 各套餐启用开关(默认全开,关闭后 UI 隐藏且前后端不请求该平台)
```

- [ ] **Step 3: Commit 文档**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 补充 enabledPlans 状态说明"
```

---

## 验证完成标准

所有 Task 完成后,以下条件全部满足即视为完成:

- [ ] 设置抽屉顶部有「套餐启用」分组,4 个独立开关默认全开(popup + sidepanel 两端)
- [ ] 关闭某平台 → 该平台 Tab/Panel/卡片立即隐藏
- [ ] 关闭当前查看的平台 → 自动跳到首个启用项
- [ ] 全部关闭 → 显示空状态提示
- [ ] 关闭某平台 → 前端刷新不发该平台请求
- [ ] 关闭某平台 → 后台预警监控跳过该平台
- [ ] popup / sidepanel 跨端实时同步开关状态
- [ ] 重启浏览器后开关状态保持
```
