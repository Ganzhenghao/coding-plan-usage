# Xiaomi 用量查询接入 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 CodingPlan 用量查询扩展中新增 Xiaomi 供应商面板，查询 platform.xiaomimimo.com 的 Token 套餐用量。

**Architecture:** 复用现有 popup ↔ service-worker 消息通信架构。service-worker 获取 Cookie 并代理 API 请求，popup 负责状态管理和数据渲染。Xiaomi 面板采用三卡片布局（月度用量、套餐总量、补偿额度）。

**Tech Stack:** Chrome Extension Manifest V3，原生 JavaScript，无构建工具。

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `chrome-extension/manifest.json` | 修改 | 新增 Xiaomi 域名 host_permissions |
| `chrome-extension/background/service-worker.js` | 修改 | 新增 `getXiaomiCookies`、`fetchXiaomiUsage` handler + 后台预警集成 |
| `chrome-extension/popup/popup.html` | 修改 | 新增 Xiaomi tab 按钮和面板 HTML |
| `chrome-extension/popup/popup.js` | 修改 | 新增 Xiaomi 状态管理、数据获取、渲染、格式化函数 |

---

### Task 1: 更新 manifest.json 权限

**Files:**
- Modify: `chrome-extension/manifest.json`

- [ ] **Step 1: 添加 Xiaomi 域名到 host_permissions**

在 `host_permissions` 数组中新增两条记录：

```json
"host_permissions": [
  "https://bigmodel.cn/*",
  "https://www.minimaxi.com/*",
  "https://platform.minimaxi.com/*",
  "https://platform.deepseek.com/*",
  "https://platform.xiaomimimo.com/*",
  "https://account.xiaomi.com/*"
],
```

同时更新 `description` 字段：

```json
"description": "查询智谱 GLM、MiniMax、DeepSeek 和 Xiaomi 编码套餐的用量和余额信息",
```

- [ ] **Step 2: Commit**

```bash
git add chrome-extension/manifest.json
git commit -m "feat(manifest): 添加 Xiaomi 域名权限"
```

---

### Task 2: 添加 service-worker Xiaomi handler

**Files:**
- Modify: `chrome-extension/background/service-worker.js`

- [ ] **Step 1: 注册 Xiaomi handler**

在 `handlers` 对象（第 18 行附近）中新增两条：

```javascript
const handlers = {
  getGLMToken: handleGetGLMToken,
  fetchGLMUsage: handleFetchGLMUsage,
  getMiniMaxCookies: handleGetMiniMaxCookies,
  fetchMiniMaxToken: handleFetchMiniMaxToken,
  fetchMiniMaxUsage: handleFetchMiniMaxUsage,
  getDeepSeekToken: handleGetDeepSeekToken,
  refreshDeepSeekToken: handleRefreshDeepSeekToken,
  fetchDeepSeekUsage: handleFetchDeepSeekUsage,
  getXiaomiCookies: handleGetXiaomiCookies,
  fetchXiaomiUsage: handleFetchXiaomiUsage,
};
```

- [ ] **Step 2: 实现 handleGetXiaomiCookies**

在文件末尾（`chrome.runtime.onStartup` 之前）添加：

```javascript
// 获取 platform.xiaomimimo.com 的所有 Cookie
async function handleGetXiaomiCookies() {
  const cookies = await chrome.cookies.getAll({
    domain: 'xiaomimimo.com',
  });
  if (cookies && cookies.length > 0) {
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    return { cookies: cookieStr };
  }
  return { cookies: '' };
}
```

注意：即使没有 Cookie 也返回空字符串而不是错误，因为设计上无论有没有 Cookie 都调 API。

- [ ] **Step 3: 实现 handleFetchXiaomiUsage**

紧接上面函数后添加：

```javascript
// 请求 Xiaomi 用量 API
async function handleFetchXiaomiUsage({ cookies }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const headers = {
      accept: '*/*',
      'accept-language': 'zh',
      'content-type': 'application/json',
      referer: 'https://platform.xiaomimimo.com/console/plan-manage',
      'x-timezone': 'Asia/Shanghai',
    };
    if (cookies) {
      headers.cookie = cookies;
    }

    const resp = await fetch(
      'https://platform.xiaomimimo.com/api/v1/tokenPlan/usage',
      {
        headers,
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);
    const data = await resp.json();
    return { data };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
    throw err;
  }
}
```

- [ ] **Step 4: 集成 Xiaomi 到后台预警 checkUsageInBackground**

在 `checkUsageInBackground()` 函数中，DeepSeek 检查块之后、`checkThresholds(usageItems)` 调用之前（约第 328 行），添加 Xiaomi 用量检查：

```javascript
  // 检查 Xiaomi 用量
  try {
    const xiaomiCookieResult = await handleGetXiaomiCookies();
    const xiaomiResult = await handleFetchXiaomiUsage({ cookies: xiaomiCookieResult.cookies || '' });
    if (xiaomiResult.data?.code === 0 && xiaomiResult.data?.data) {
      const xiaomiData = xiaomiResult.data.data;
      // 月度用量
      const monthItem = xiaomiData.monthUsage?.items?.[0];
      if (monthItem) {
        usageItems.push({ name: 'Xiaomi-月度用量', percentage: monthItem.percent || 0 });
      }
      // 套餐总量
      const planItem = xiaomiData.usage?.items?.find((i) => i.name === 'plan_total_token');
      if (planItem) {
        usageItems.push({ name: 'Xiaomi-套餐总量', percentage: planItem.percent || 0 });
      }
      // 更新缓存
      await chrome.storage.local.set({ xiaomiCache: xiaomiResult.data, xiaomiCacheTime: Date.now() });
    }
  } catch (err) {
    console.error('[CodingPlan] Xiaomi 后台检查失败:', err);
  }
```

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/background/service-worker.js
git commit -m "feat(service-worker): 添加 Xiaomi 消息处理器和后台预警检查"
```

---

### Task 3: 添加 Xiaomi 面板 HTML

**Files:**
- Modify: `chrome-extension/popup/popup.html`

- [ ] **Step 1: 添加 Xiaomi tab 按钮**

在 tab 栏（第 35 行 DeepSeek 按钮之后）新增：

```html
      <button class="tab" data-tab="xiaomi">Xiaomi</button>
```

- [ ] **Step 2: 添加 Xiaomi 面板 HTML**

在 DeepSeek 面板结束标签 `</div>`（第 184 行）之后、全局错误消息 `<!-- 全局错误消息 -->` 之前，插入：

```html
    <!-- Xiaomi 面板 -->
    <div id="xiaomiPanel" class="panel">
      <div id="xiaomiSkeleton" class="content">
        <div class="usage-card">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-bar"></div>
          <div class="skeleton-line w40"></div>
        </div>
        <div class="usage-card">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-bar"></div>
          <div class="skeleton-line w40"></div>
        </div>
        <div class="usage-card">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-bar"></div>
          <div class="skeleton-line w40"></div>
        </div>
      </div>
      <div id="xiaomiContent" class="content" style="display:none">
        <!-- 月度用量卡片 -->
        <div class="usage-card">
          <div class="usage-header">
            <span class="usage-label">月度用量</span>
            <span id="xiaomiMonthPercent" class="usage-percent">--</span>
          </div>
          <div class="progress-bar">
            <div id="xiaomiMonthProgress" class="progress-fill"></div>
          </div>
          <div class="usage-detail">
            <span id="xiaomiMonthUsage">--</span>
          </div>
        </div>
        <!-- 套餐总量卡片 -->
        <div class="usage-card">
          <div class="usage-header">
            <span class="usage-label">套餐总量</span>
            <span id="xiaomiPlanPercent" class="usage-percent">--</span>
          </div>
          <div class="progress-bar">
            <div id="xiaomiPlanProgress" class="progress-fill"></div>
          </div>
          <div class="usage-detail">
            <span id="xiaomiPlanUsage">--</span>
          </div>
        </div>
        <!-- 补偿额度卡片（limit 为 0 时隐藏） -->
        <div id="xiaomiCompensationCard" class="usage-card">
          <div class="usage-header">
            <span class="usage-label">补偿额度</span>
            <span id="xiaomiCompensationPercent" class="usage-percent">--</span>
          </div>
          <div class="progress-bar">
            <div id="xiaomiCompensationProgress" class="progress-fill"></div>
          </div>
          <div class="usage-detail">
            <span id="xiaomiCompensationUsage">--</span>
          </div>
        </div>
        <button id="xiaomiGoUsageBtn" class="go-usage-btn">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path fill="currentColor" d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
          </svg>
          查看详细用量
        </button>
      </div>
      <div id="xiaomiError" class="error-prompt" style="display:none">
        <p id="xiaomiErrorMsg"></p>
        <button id="xiaomiErrorBtn" class="primary-btn"></button>
      </div>
    </div>
```

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/popup/popup.html
git commit -m "feat(popup): 添加 Xiaomi 面板 HTML 结构"
```

---

### Task 4: 添加 Xiaomi popup.js 逻辑

**Files:**
- Modify: `chrome-extension/popup/popup.js`

- [ ] **Step 1: 添加 Xiaomi DOM 元素引用**

在 `els` 对象中（约第 61 行 `deepseekGoUsageBtn` 之后），添加 Xiaomi 元素：

```javascript
  // Xiaomi
  xiaomiPanel: $('#xiaomiPanel'),
  xiaomiSkeleton: $('#xiaomiSkeleton'),
  xiaomiContent: $('#xiaomiContent'),
  xiaomiError: $('#xiaomiError'),
  xiaomiErrorMsg: $('#xiaomiErrorMsg'),
  xiaomiErrorBtn: $('#xiaomiErrorBtn'),
  xiaomiMonthPercent: $('#xiaomiMonthPercent'),
  xiaomiMonthProgress: $('#xiaomiMonthProgress'),
  xiaomiMonthUsage: $('#xiaomiMonthUsage'),
  xiaomiPlanPercent: $('#xiaomiPlanPercent'),
  xiaomiPlanProgress: $('#xiaomiPlanProgress'),
  xiaomiPlanUsage: $('#xiaomiPlanUsage'),
  xiaomiCompensationCard: $('#xiaomiCompensationCard'),
  xiaomiCompensationPercent: $('#xiaomiCompensationPercent'),
  xiaomiCompensationProgress: $('#xiaomiCompensationProgress'),
  xiaomiCompensationUsage: $('#xiaomiCompensationUsage'),
  xiaomiGoUsageBtn: $('#xiaomiGoUsageBtn'),
```

- [ ] **Step 2: 添加 Xiaomi 数字格式化函数**

在 `formatTokenCount` 函数（第 117 行）之后添加新函数，不要修改原有的 `formatTokenCount`（DeepSeek 仍在使用）：

```javascript
// Xiaomi 专用格式化：动态单位（万、百万、亿），单位放在括号中
function formatXiaomiToken(num) {
  const n = parseInt(num) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '(亿)';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + '(百万)';
  if (n >= 10000) return (n / 10000).toFixed(1) + '(万)';
  return n.toLocaleString();
}
```

- [ ] **Step 3: 添加 Xiaomi 状态切换函数**

在 `showDeepSeekState` 函数（第 175 行）之后添加：

```javascript
// ========== Xiaomi 状态切换 ==========
function showXiaomiState(state) {
  els.xiaomiSkeleton.style.display = state === 'loading' ? 'flex' : 'none';
  els.xiaomiContent.style.display = state === 'content' ? 'flex' : 'none';
  els.xiaomiError.style.display = state === 'error' ? 'block' : 'none';
}
```

- [ ] **Step 4: 更新 switchTab 函数**

在 `switchTab` 函数（第 183 行）中，添加 Xiaomi panel 切换。在 `els.deepseekPanel.classList.toggle(...)` 行之后添加：

```javascript
  els.xiaomiPanel.classList.toggle('active', tab === 'xiaomi');
```

- [ ] **Step 5: 添加 Xiaomi 数据获取函数**

在 `els.deepseekGoUsageBtn` 点击事件监听器（约第 491 行）之后添加：

```javascript
// ========== Xiaomi 数据获取 ==========
async function fetchXiaomiData() {
  showXiaomiState('loading');

  const cookieResult = await sendMessage({ type: 'getXiaomiCookies' });
  const cookies = cookieResult?.cookies || '';

  const result = await sendMessage({
    type: 'fetchXiaomiUsage',
    cookies,
  });

  if (!result || result.error) {
    const isTimeout = result && result.error === 'TIMEOUT';
    showXiaomiState('error');
    els.xiaomiErrorMsg.textContent = isTimeout ? '请求超时，请检查网络后重试' : '获取 Xiaomi 用量失败';
    els.xiaomiErrorBtn.textContent = '重试';
    els.xiaomiErrorBtn.onclick = fetchXiaomiData;
    return;
  }

  const data = result.data;

  // 401 表示未登录
  if (data && data.code === 401 && data.loginUrl) {
    showXiaomiState('error');
    els.xiaomiErrorMsg.textContent = '请先登录小米平台';
    els.xiaomiErrorBtn.textContent = '前往登录';
    els.xiaomiErrorBtn.onclick = () => {
      window.open(data.loginUrl);
    };
    return;
  }

  if (!data || data.code !== 0 || !data.data) {
    showXiaomiState('error');
    els.xiaomiErrorMsg.textContent = '数据格式异常，请稍后重试';
    els.xiaomiErrorBtn.textContent = '重试';
    els.xiaomiErrorBtn.onclick = fetchXiaomiData;
    return;
  }

  renderXiaomiData(data.data);
  chrome.storage.local.set({ xiaomiCache: data, xiaomiCacheTime: Date.now() });
}
```

- [ ] **Step 6: 添加 Xiaomi 渲染函数**

紧接 `fetchXiaomiData` 函数之后添加：

```javascript
function renderXiaomiData(data) {
  showXiaomiState('content');

  // 月度用量
  const monthItem = data.monthUsage?.items?.[0];
  if (monthItem) {
    const pct = parseFloat(monthItem.percent) || 0;
    const cls = getProgressClass(pct);
    els.xiaomiMonthPercent.textContent = pct.toFixed(1) + '%';
    els.xiaomiMonthPercent.className = 'usage-percent' + (cls ? ' ' + cls : '');
    els.xiaomiMonthProgress.className = 'progress-fill' + (cls ? ' ' + cls : '');
    requestAnimationFrame(() => {
      els.xiaomiMonthProgress.style.width = pct + '%';
    });
    els.xiaomiMonthUsage.textContent = `已用 ${formatXiaomiToken(monthItem.used)} / 总量 ${formatXiaomiToken(monthItem.limit)}`;
  }

  // 套餐总量
  const usageItems = data.usage?.items || [];
  const planItem = usageItems.find((i) => i.name === 'plan_total_token');
  if (planItem) {
    const pct = parseFloat(planItem.percent) || 0;
    const cls = getProgressClass(pct);
    els.xiaomiPlanPercent.textContent = pct.toFixed(1) + '%';
    els.xiaomiPlanPercent.className = 'usage-percent' + (cls ? ' ' + cls : '');
    els.xiaomiPlanProgress.className = 'progress-fill' + (cls ? ' ' + cls : '');
    requestAnimationFrame(() => {
      els.xiaomiPlanProgress.style.width = pct + '%';
    });
    els.xiaomiPlanUsage.textContent = `已用 ${formatXiaomiToken(planItem.used)} / 总量 ${formatXiaomiToken(planItem.limit)}`;
  }

  // 补偿额度（limit 为 0 时隐藏）
  const compensationItem = usageItems.find((i) => i.name === 'compensation_total_token');
  if (compensationItem && compensationItem.limit > 0) {
    els.xiaomiCompensationCard.style.display = '';
    const pct = parseFloat(compensationItem.percent) || 0;
    const cls = getProgressClass(pct);
    els.xiaomiCompensationPercent.textContent = pct.toFixed(1) + '%';
    els.xiaomiCompensationPercent.className = 'usage-percent' + (cls ? ' ' + cls : '');
    els.xiaomiCompensationProgress.className = 'progress-fill' + (cls ? ' ' + cls : '');
    requestAnimationFrame(() => {
      els.xiaomiCompensationProgress.style.width = pct + '%';
    });
    els.xiaomiCompensationUsage.textContent = `已用 ${formatXiaomiToken(compensationItem.used)} / 总量 ${formatXiaomiToken(compensationItem.limit)}`;
  } else {
    els.xiaomiCompensationCard.style.display = 'none';
  }

  // 收集用量数据进行阈值检查
  const xiaomiUsageItems = [];
  if (monthItem) {
    xiaomiUsageItems.push({ name: 'Xiaomi-月度用量', percentage: parseFloat(monthItem.percent) || 0 });
  }
  if (planItem) {
    xiaomiUsageItems.push({ name: 'Xiaomi-套餐总量', percentage: parseFloat(planItem.percent) || 0 });
  }
  checkThresholds(xiaomiUsageItems);
}
```

- [ ] **Step 7: 更新 goUsageBtn 跳转逻辑**

在 `els.goUsageBtn` 点击事件（第 554 行）中，在 `deepseek` 分支之后添加 `xiaomi` 分支：

```javascript
  } else if (currentTab === 'xiaomi') {
    chrome.tabs.create({
      url: 'https://platform.xiaomimimo.com/console/plan-manage',
    });
  }
```

- [ ] **Step 8: 添加 Xiaomi goUsageBtn 事件监听**

在 `els.minimaxGoUsageBtn` 点击监听器（约第 761 行）之后添加：

```javascript
els.xiaomiGoUsageBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://platform.xiaomimimo.com/console/plan-manage',
  });
});
```

- [ ] **Step 9: 更新 refreshAll 函数**

将 `refreshAll` 函数（约第 740 行）中的 `Promise.all` 更新：

```javascript
await Promise.all([fetchGLMData(), fetchMiniMaxData(), fetchDeepSeekData(), fetchXiaomiData()]);
```

- [ ] **Step 10: 更新 init 函数**

在 `init` 函数（约第 768 行）中：

1. `chrome.storage.local.get` 调用中添加 `'xiaomiCache'` 到获取列表：

```javascript
const stored = await chrome.storage.local.get([
  'lastTab',
  'glmCache',
  'minimaxCache',
  'deepseekCache',
  'xiaomiCache',
  'autoRefreshEnabled',
  'autoRefreshInterval',
  'alertEnabled',
  ...ALERT_THRESHOLD_KEYS,
]);
```

2. 在 DeepSeek 缓存渲染之后添加 Xiaomi 缓存渲染：

```javascript
if (stored.xiaomiCache) {
  renderXiaomiData(stored.xiaomiCache.data);
}
```

注意：`xiaomiCache` 存储的是完整响应 `{ code, message, data }`，渲染时需要传 `data.data` 部分。

- [ ] **Step 11: Commit**

```bash
git add chrome-extension/popup/popup.js
git commit -m "feat(popup): 添加 Xiaomi 数据获取、渲染和交互逻辑"
```

---

### Task 5: 手动验证

- [ ] **Step 1: 加载扩展**

1. 打开 Chrome → `chrome://extensions/`
2. 开启开发者模式
3. 点击"加载已解压的扩展程序"，选择 `chrome-extension` 目录

- [ ] **Step 2: 验证未登录状态**

1. 确保未登录 `platform.xiaomimimo.com`
2. 点击扩展图标
3. 切换到 Xiaomi tab
4. 预期：显示"请先登录小米平台"提示 + "前往登录"按钮
5. 点击"前往登录"按钮，预期：跳转到小米登录页面

- [ ] **Step 3: 验证已登录状态**

1. 在浏览器中登录 `platform.xiaomimimo.com`
2. 重新打开扩展弹窗
3. 切换到 Xiaomi tab
4. 预期：显示三张卡片（月度用量、套餐总量、补偿额度），数据正确，进度条颜色正确
5. 验证数字格式为 `X.X(亿)` 等格式
6. 如果补偿额度 limit 为 0，预期：该卡片隐藏

- [ ] **Step 4: 验证 Tab 切换和缓存**

1. 切换到其他 tab 再切回 Xiaomi
2. 关闭弹窗重新打开
3. 预期：先显示缓存数据，然后自动刷新

- [ ] **Step 5: 验证跳转按钮**

1. 在 Xiaomi tab 下点击顶部跳转按钮
2. 预期：打开 `https://platform.xiaomimimo.com/console/plan-manage`
3. 在 Xiaomi tab 下点击面板底部"查看详细用量"按钮
4. 预期：打开相同页面

- [ ] **Step 6: 验证刷新和自动刷新**

1. 点击刷新按钮
2. 预期：四个面板同时刷新
3. 在设置中开启自动刷新，设置间隔为 30 秒
4. 预期：Xiaomi 面板定时刷新
