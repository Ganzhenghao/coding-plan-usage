# DeepSeek 用量查询接入 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 CodingPlan 用量查询扩展中接入 DeepSeek 平台的余额查询功能，展示账户余额、Token 估算、月度统计等信息，并集成余额预警。

**Architecture:** 新增 content script 读取 platform.deepseek.com 的 localStorage `userToken` 并同步到 `chrome.storage.local`；service-worker 通过存储的 token 调用 DeepSeek 用户摘要 API；popup 新增 DeepSeek Tab 展示余额和统计信息。余额预警通过计算月度消耗占比复用现有百分比阈值系统。

**Tech Stack:** Chrome Extension Manifest V3, 纯原生 JavaScript, Content Script + Service Worker 消息通信

---

## 文件变更清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `chrome-extension/content/deepseek-content.js` | 新建 | 从 localStorage 读取 userToken 并同步到 chrome.storage.local |
| `chrome-extension/manifest.json` | 修改 | 添加 content_scripts、host_permissions、scripting 权限 |
| `chrome-extension/background/service-worker.js` | 修改 | 添加 DeepSeek 消息处理器，更新后台预警检查 |
| `chrome-extension/popup/popup.html` | 修改 | 添加 DeepSeek Tab 和面板 |
| `chrome-extension/popup/popup.css` | 修改 | 添加 DeepSeek 统计布局样式 |
| `chrome-extension/popup/popup.js` | 修改 | 添加 DeepSeek 数据获取、渲染、集成逻辑 |

---

### Task 1: 创建 DeepSeek Content Script

**Files:**
- Create: `chrome-extension/content/deepseek-content.js`

- [ ] **Step 1: 创建 content script 目录和文件**

创建 `chrome-extension/content/deepseek-content.js`，内容如下：

```javascript
// DeepSeek Token 同步脚本
// 从 platform.deepseek.com 的 localStorage 读取 userToken 并同步到 chrome.storage.local

(function () {
  // 同步 token 到 chrome.storage.local
  function syncToken() {
    const token = localStorage.getItem('userToken');
    if (token) {
      chrome.storage.local.set({ deepseekToken: token });
    } else {
      chrome.storage.local.remove('deepseekToken');
    }
  }

  // 页面加载时同步
  syncToken();

  // 监听来自扩展的消息
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'getDeepSeekTokenFromPage') {
      syncToken();
      const token = localStorage.getItem('userToken');
      sendResponse({ token: token || null });
      return true;
    }
  });
})();
```

- [ ] **Step 2: 提交**

```bash
git add chrome-extension/content/deepseek-content.js
git commit -m "feat: 添加 DeepSeek content script 同步 localStorage token"
```

---

### Task 2: 更新 manifest.json

**Files:**
- Modify: `chrome-extension/manifest.json`

- [ ] **Step 1: 更新 manifest.json**

在 `permissions` 数组中添加 `"scripting"`；在 `host_permissions` 数组中添加 DeepSeek 域名；添加 `content_scripts` 配置块。

完整文件内容：

```json
{
  "manifest_version": 3,
  "name": "CodingPlan 用量查询",
  "version": "1.0.0",
  "description": "查询智谱 GLM、MiniMax 和 DeepSeek 编码套餐的用量和余额信息",
  "permissions": [
    "cookies",
    "storage",
    "notifications",
    "alarms",
    "scripting"
  ],
  "host_permissions": [
    "https://bigmodel.cn/*",
    "https://www.minimaxi.com/*",
    "https://platform.minimaxi.com/*",
    "https://platform.deepseek.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://platform.deepseek.com/*"],
      "js": ["content/deepseek-content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "background": {
    "service_worker": "background/service-worker.js"
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add chrome-extension/manifest.json
git commit -m "feat: manifest 添加 DeepSeek 权限和 content script 配置"
```

---

### Task 3: 添加 DeepSeek Service Worker 处理器

**Files:**
- Modify: `chrome-extension/background/service-worker.js`

- [ ] **Step 1: 在 handlers 映射中添加 DeepSeek 处理器**

在 `chrome.runtime.onMessage.addListener` 回调中的 `handlers` 对象添加三个新条目：

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
  };
```

- [ ] **Step 2: 添加三个处理函数**

在 `handleFetchMiniMaxUsage` 函数之后、后台预警监控注释之前，添加以下三个函数：

```javascript
// 从 storage 获取 DeepSeek token
async function handleGetDeepSeekToken() {
  const stored = await chrome.storage.local.get('deepseekToken');
  if (stored.deepseekToken) {
    return { token: stored.deepseekToken };
  }
  return { error: 'NOT_LOGGED_IN' };
}

// 从已打开的 DeepSeek 页面刷新 token
async function handleRefreshDeepSeekToken() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://platform.deepseek.com/*' });
    if (tabs.length === 0) return { error: 'NO_TAB' };
    const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'getDeepSeekTokenFromPage' });
    if (response && response.token) {
      await chrome.storage.local.set({ deepseekToken: response.token });
      return { token: response.token };
    }
    return { error: 'NO_TOKEN' };
  } catch {
    return { error: 'NO_TAB' };
  }
}

// 请求 DeepSeek 用户摘要 API
async function handleFetchDeepSeekUsage({ token }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const resp = await fetch(
      'https://platform.deepseek.com/api/v0/users/get_user_summary',
      {
        headers: {
          accept: '*/*',
          authorization: `Bearer ${token}`,
          'x-app-version': '1.0.0',
        },
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

- [ ] **Step 3: 更新 checkUsageInBackground 添加 DeepSeek 检查**

在 `checkUsageInBackground` 函数中，MiniMax 检查之后、`checkThresholds(usageItems)` 调用之前，添加 DeepSeek 检查块：

```javascript
  // 检查 DeepSeek 用量
  try {
    const deepseekStored = await chrome.storage.local.get('deepseekToken');
    if (deepseekStored.deepseekToken) {
      const deepseekResult = await handleFetchDeepSeekUsage({ token: deepseekStored.deepseekToken });
      if (deepseekResult.data?.code === 0 && deepseekResult.data?.data?.biz_data) {
        const bizData = deepseekResult.data.data.biz_data;
        const totalEstimation = parseInt(bizData.total_available_token_estimation) || 0;
        const monthlyUsage = parseInt(bizData.monthly_token_usage) || 0;
        const total = monthlyUsage + totalEstimation;
        const pct = total > 0 ? Math.round((monthlyUsage / total) * 100) : 0;
        usageItems.push({ name: 'DeepSeek-余额', percentage: pct });
        // 更新缓存
        await chrome.storage.local.set({ deepseekCache: deepseekResult.data, deepseekCacheTime: Date.now() });
      }
    }
  } catch (err) {
    console.error('[CodingPlan] DeepSeek 后台检查失败:', err);
  }
```

- [ ] **Step 4: 提交**

```bash
git add chrome-extension/background/service-worker.js
git commit -m "feat: service-worker 添加 DeepSeek 消息处理器和后台检查"
```

---

### Task 4: 添加 DeepSeek 面板到 popup.html

**Files:**
- Modify: `chrome-extension/popup/popup.html`

- [ ] **Step 1: 添加 DeepSeek Tab 按钮**

在 `.tabs` 容器中，Minimax tab 按钮之后添加：

```html
      <button class="tab" data-tab="deepseek">DeepSeek</button>
```

修改后的 `.tabs` 区域：

```html
    <div class="tabs">
      <button class="tab active" data-tab="glm">GLM</button>
      <button class="tab" data-tab="minimax">Minimax</button>
      <button class="tab" data-tab="deepseek">DeepSeek</button>
    </div>
```

- [ ] **Step 2: 添加 DeepSeek 面板 HTML**

在 MiniMax 面板（`#minimaxPanel` 结束 `</div>` 之后）、全局错误消息（`#errorMsg`）之前，添加：

```html
    <!-- DeepSeek 面板 -->
    <div id="deepseekPanel" class="panel">
      <!-- 未登录提示 -->
      <div id="deepseekLogin" class="login-prompt" style="display:none">
        <p>请先登录 DeepSeek</p>
        <button id="deepseekLoginBtn" class="primary-btn">前往登录</button>
      </div>
      <div id="deepseekSkeleton" class="content" style="display:none">
        <div class="usage-card">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-line w40"></div>
        </div>
        <div class="usage-card">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-line w40"></div>
        </div>
      </div>
      <div id="deepseekContent" class="content" style="display:none">
        <div class="usage-card">
          <div class="usage-header">
            <span class="usage-label">账户余额</span>
            <span id="deepseekBalance" class="usage-percent">--</span>
          </div>
          <div class="usage-detail">
            <span id="deepseekTokenEstimation">--</span>
          </div>
        </div>
        <div class="usage-card">
          <div class="usage-header">
            <span class="usage-label">本月统计</span>
          </div>
          <div class="deepseek-stats">
            <div class="stat-item">
              <div id="deepseekMonthlyUsage" class="stat-value">--</div>
              <div class="stat-label">Token 用量</div>
            </div>
            <div class="stat-item">
              <div id="deepseekMonthlyCost" class="stat-value">--</div>
              <div class="stat-label">花费</div>
            </div>
          </div>
        </div>
        <button id="deepseekGoUsageBtn" class="go-usage-btn">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path fill="currentColor" d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
          </svg>
          查看详细用量
        </button>
      </div>
      <div id="deepseekError" class="error-prompt" style="display:none">
        <p id="deepseekErrorMsg"></p>
        <button id="deepseekErrorBtn" class="primary-btn"></button>
      </div>
    </div>
```

- [ ] **Step 3: 提交**

```bash
git add chrome-extension/popup/popup.html
git commit -m "feat: popup.html 添加 DeepSeek Tab 和面板"
```

---

### Task 5: 添加 DeepSeek 样式到 popup.css

**Files:**
- Modify: `chrome-extension/popup/popup.css`

- [ ] **Step 1: 添加 DeepSeek 统计布局样式**

在文件末尾（`.go-usage-btn:hover` 规则之后）添加：

```css
/* DeepSeek 统计 */
.deepseek-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 8px;
}
```

注意：`.stat-item`、`.stat-value`、`.stat-label` 样式已在 MiniMax 模型卡片中定义，可直接复用。

- [ ] **Step 2: 提交**

```bash
git add chrome-extension/popup/popup.css
git commit -m "feat: popup.css 添加 DeepSeek 统计布局样式"
```

---

### Task 6: 添加 DeepSeek 逻辑到 popup.js

**Files:**
- Modify: `chrome-extension/popup/popup.js`

这是最大的修改，共 8 个步骤。

- [ ] **Step 1: 添加 DeepSeek DOM 元素引用**

在 `els` 对象中，`minimaxGoUsageBtn` 之后、`glmGoUsageBtn` 之前，添加 DeepSeek 相关引用：

```javascript
  // DeepSeek
  deepseekPanel: $('#deepseekPanel'),
  deepseekLogin: $('#deepseekLogin'),
  deepseekLoginBtn: $('#deepseekLoginBtn'),
  deepseekSkeleton: $('#deepseekSkeleton'),
  deepseekContent: $('#deepseekContent'),
  deepseekError: $('#deepseekError'),
  deepseekErrorMsg: $('#deepseekErrorMsg'),
  deepseekErrorBtn: $('#deepseekErrorBtn'),
  deepseekBalance: $('#deepseekBalance'),
  deepseekTokenEstimation: $('#deepseekTokenEstimation'),
  deepseekMonthlyUsage: $('#deepseekMonthlyUsage'),
  deepseekMonthlyCost: $('#deepseekMonthlyCost'),
  deepseekGoUsageBtn: $('#deepseekGoUsageBtn'),
```

- [ ] **Step 2: 添加 DeepSeek 状态切换函数**

在 `showMinimaxState` 函数之后添加：

```javascript
// ========== DeepSeek 状态切换 ==========
function showDeepSeekState(state) {
  els.deepseekLogin.style.display = state === 'login' ? 'block' : 'none';
  els.deepseekSkeleton.style.display = state === 'loading' ? 'flex' : 'none';
  els.deepseekContent.style.display = state === 'content' ? 'flex' : 'none';
  els.deepseekError.style.display = state === 'error' ? 'block' : 'none';
}
```

- [ ] **Step 3: 更新 switchTab 函数支持 DeepSeek**

将 `switchTab` 函数替换为：

```javascript
function switchTab(tab) {
  currentTab = tab;
  els.tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  els.glmPanel.classList.toggle('active', tab === 'glm');
  els.minimaxPanel.classList.toggle('active', tab === 'minimax');
  els.deepseekPanel.classList.toggle('active', tab === 'deepseek');
  chrome.storage.local.set({ lastTab: tab });
}
```

- [ ] **Step 4: 添加 Token 数量格式化工具函数**

在 `getUnitName` 函数之后添加：

```javascript
function formatTokenCount(num) {
  const n = parseInt(num) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString();
}
```

- [ ] **Step 5: 添加 DeepSeek 数据获取和渲染函数**

在 `els.minimaxGoSettingsBtn.addEventListener('click', openSettings)` 行之后添加：

```javascript
// ========== DeepSeek 数据获取 ==========
async function fetchDeepSeekData() {
  showDeepSeekState('loading');

  // 先尝试从 storage 获取 token
  let tokenResult = await sendMessage({ type: 'getDeepSeekToken' });

  // 如果没有 token，尝试从已打开的页面刷新
  if (!tokenResult || tokenResult.error === 'NOT_LOGGED_IN') {
    const refreshResult = await sendMessage({ type: 'refreshDeepSeekToken' });
    if (refreshResult && refreshResult.token) {
      tokenResult = refreshResult;
    }
  }

  if (!tokenResult || tokenResult.error) {
    showDeepSeekState('login');
    return;
  }

  const result = await sendMessage({
    type: 'fetchDeepSeekUsage',
    token: tokenResult.token,
  });

  if (!result || result.error) {
    const isTimeout = result && result.error === 'TIMEOUT';
    showDeepSeekState('error');
    els.deepseekErrorMsg.textContent = isTimeout ? '请求超时，请检查网络后重试' : '获取 DeepSeek 用量失败';
    els.deepseekErrorBtn.textContent = '重试';
    els.deepseekErrorBtn.onclick = fetchDeepSeekData;
    return;
  }

  const data = result.data;
  if (!data || data.code !== 0 || !data.data?.biz_data) {
    showDeepSeekState('error');
    if (data && data.code !== 0) {
      chrome.storage.local.remove('deepseekToken');
    }
    els.deepseekErrorMsg.textContent = '数据格式异常，请稍后重试';
    els.deepseekErrorBtn.textContent = '重试';
    els.deepseekErrorBtn.onclick = fetchDeepSeekData;
    return;
  }

  renderDeepSeekData(data);
  chrome.storage.local.set({ deepseekCache: data, deepseekCacheTime: Date.now() });
}

function renderDeepSeekData(data) {
  showDeepSeekState('content');
  const bizData = data.data.biz_data;

  // 余额
  const normalBalance = bizData.normal_wallets?.[0]?.balance || '0';
  const balanceNum = parseFloat(normalBalance);
  els.deepseekBalance.textContent = '¥' + balanceNum.toFixed(2);

  // Token 估算
  const tokenEstimation = parseInt(bizData.total_available_token_estimation) || 0;
  els.deepseekTokenEstimation.textContent = '约 ' + formatTokenCount(tokenEstimation) + ' tokens';

  // 本月统计
  const monthlyUsage = parseInt(bizData.monthly_token_usage) || 0;
  els.deepseekMonthlyUsage.textContent = formatTokenCount(monthlyUsage);

  const monthlyCost = parseFloat(bizData.monthly_costs?.[0]?.amount || '0');
  els.deepseekMonthlyCost.textContent = '¥' + monthlyCost.toFixed(2);

  // 计算余额消耗百分比用于预警
  const total = monthlyUsage + tokenEstimation;
  const pct = total > 0 ? Math.round((monthlyUsage / total) * 100) : 0;

  // 余额低时改变颜色
  const cls = getProgressClass(pct);
  els.deepseekBalance.className = 'usage-percent' + (cls ? ' ' + cls : '');

  checkThresholds([{ name: 'DeepSeek-余额', percentage: pct }]);
}

els.deepseekLoginBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://platform.deepseek.com/sign_in',
  });
});

els.deepseekGoUsageBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://platform.deepseek.com/usage',
  });
});
```

- [ ] **Step 6: 更新 refreshAll 函数**

将 `refreshAll` 函数替换为：

```javascript
async function refreshAll() {
  if (isRefreshing) return;
  isRefreshing = true;
  els.refreshBtn.classList.add('loading');

  await Promise.all([fetchGLMData(), fetchMiniMaxData(), fetchDeepSeekData()]);

  isRefreshing = false;
  els.refreshBtn.classList.remove('loading');
  chrome.storage.local.set({ lastUpdateTime: Date.now() });
}
```

- [ ] **Step 7: 更新 goUsageBtn 事件处理器支持 DeepSeek**

将 `els.goUsageBtn.addEventListener('click', ...)` 回调替换为：

```javascript
els.goUsageBtn.addEventListener('click', () => {
  if (currentTab === 'glm') {
    chrome.tabs.create({
      url: 'https://bigmodel.cn/usercenter/glm-coding/usage',
    });
  } else if (currentTab === 'minimax') {
    chrome.tabs.create({
      url: 'https://platform.minimaxi.com/user-center/payment/token-plan',
    });
  } else if (currentTab === 'deepseek') {
    chrome.tabs.create({
      url: 'https://platform.deepseek.com/usage',
    });
  }
});
```

- [ ] **Step 8: 更新 init 函数支持 DeepSeek 缓存**

在 `init` 函数的 `chrome.storage.local.get` 调用中，添加 `'deepseekCache'` 到获取键列表：

```javascript
  const stored = await chrome.storage.local.get([
    'lastTab',
    'glmCache',
    'minimaxCache',
    'deepseekCache',
    'autoRefreshEnabled',
    'autoRefreshInterval',
    'alertEnabled',
    ...ALERT_THRESHOLD_KEYS,
  ]);
```

在缓存渲染部分（`if (stored.minimaxCache)` 块之后）添加：

```javascript
  if (stored.deepseekCache) {
    renderDeepSeekData(stored.deepseekCache);
  }
```

- [ ] **Step 9: 提交**

```bash
git add chrome-extension/popup/popup.js
git commit -m "feat: popup.js 添加 DeepSeek 数据获取、渲染和集成逻辑"
```

---

### Task 7: 手动测试验证

项目无自动化测试框架，需手动验证以下场景。

- [ ] **Step 1: 加载扩展**

1. 打开 Chrome → `chrome://extensions/`
2. 开启开发者模式
3. 点击「加载已解压的扩展程序」→ 选择 `chrome-extension` 目录
4. 确认扩展加载无报错

- [ ] **Step 2: 验证 DeepSeek Tab 显示**

1. 点击扩展图标打开弹窗
2. 确认出现三个 Tab：GLM、Minimax、DeepSeek
3. 切换到 DeepSeek Tab，确认显示「请先登录 DeepSeek」提示

- [ ] **Step 3: 验证登录流程**

1. 点击「前往登录」按钮
2. 确认打开 `platform.deepseek.com/sign_in`
3. 登录 DeepSeek 账户
4. 登录后确认 content script 已同步 token（打开扩展弹窗 DevTools → Application → Storage → chrome.storage.local 中应有 `deepseekToken`）

- [ ] **Step 4: 验证数据展示**

1. 重新打开弹窗，切换到 DeepSeek Tab
2. 确认显示：
   - 账户余额（¥XX.XX 格式）
   - Token 估算（"约 X.XXM tokens" 格式）
   - 本月 Token 用量和花费
3. 确认颜色正确（余额充足蓝色，偏低黄色/红色）

- [ ] **Step 5: 验证跳转按钮**

1. 点击「查看详细用量」按钮，确认打开 `platform.deepseek.com/usage`
2. 点击 Header 外链按钮（DeepSeek Tab 激活时），确认同样打开正确页面

- [ ] **Step 6: 验证自动刷新和预警**

1. 在设置中开启自动刷新
2. 确认三个 Tab 数据都能自动刷新
3. 开启预警，设置低阈值，确认余额不足时弹出通知

- [ ] **Step 7: 验证后台监控**

1. 关闭弹窗，等待后台定时检查触发
2. 确认 DeepSeek 数据缓存被更新
3. 确认预警阈值被正确检查

---

## 自检清单

### 1. 规格覆盖

| 需求 | 对应 Task |
|------|-----------|
| 登录页面 `platform.deepseek.com/sign_in` | Task 4 (HTML login prompt) + Task 6 (登录按钮事件) |
| Token 位于 localStorage `userToken` | Task 1 (content script 读取) |
| 用量页面 `platform.deepseek.com/usage` | Task 4 (HTML 跳转按钮) + Task 6 (goUsageBtn) |
| 余额提醒（非用量提醒） | Task 3 (service-worker 预警) + Task 6 (余额百分比计算) |
| 用户摘要 API 调用 | Task 3 (handleFetchDeepSeekUsage) |
| 展示余额、Token 估算、月度统计 | Task 4 (HTML 结构) + Task 6 (renderDeepSeekData) |

### 2. 占位符检查

无 TBD/TODO/待定内容。所有步骤均包含完整代码。

### 3. 类型一致性

- API 响应中 `balance` 为字符串类型 → 代码中使用 `parseFloat()` 转换 ✓
- API 响应中 `monthly_token_usage` 为字符串类型 → 代码中使用 `parseInt()` 转换 ✓
- `total_available_token_estimation` 为字符串类型 → 代码中使用 `parseInt()` 转换 ✓
- 消息类型名（`getDeepSeekToken`/`refreshDeepSeekToken`/`fetchDeepSeekUsage`/`getDeepSeekTokenFromPage`）在 service-worker.js、popup.js、content script 中一致 ✓
- DOM 元素 ID（`deepseekBalance` 等）在 HTML 和 JS 中一致 ✓
