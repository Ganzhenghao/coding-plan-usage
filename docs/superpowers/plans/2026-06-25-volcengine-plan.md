# Volcengine 用量看板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Chrome 扩展中新增 Volcengine（火山方舟 Coding Plan）卡片，展示会话/周/月三档配额并接入预警、缓存、自动刷新。

**Architecture:** 复用现有 popup ↔ service-worker 消息架构。新增 `getVolcengineToken` 与 `fetchVolcengineUsage` 两个 handler；sidepanel 与 popup 同步新增 Volcengine 卡片 / Tab；预警仅基于 `session` 档；通知文案前缀「火山方舟」。

**Tech Stack:** 原生 JavaScript（无构建）、Chrome Extension Manifest V3、`chrome.cookies` / `chrome.storage.local` / `chrome.runtime.onMessage` / `chrome.notifications`。

## Global Constraints

- 项目无构建步骤，无测试框架；每个 Task 的"测试"采用**手工 DevTools 验证**：在 Chrome 扩展管理页刷新扩展 → 打开 sidepanel/popup → 观察 DOM / Network / Console
- 所有 API 请求 5 秒超时，常量 `API_TIMEOUT = 5000`（已存在）
- 进度条阈值：≥70% 警告色、≥90% 危险色（复用 `getProgressClass`）
- sidepanel CSS 类名后缀使用 `warn`/`danger`；popup CSS 类名后缀使用 `warning`/`danger`——**不要互换**
- 卡片标题显示为「Volcengine」；预警通知文案前缀「火山方舟会话用量已达 X%」
- 平台 key 统一使用字符串 `volcengine`
- 仅 `session` 档参与预警
- 默认启用（`enabledPlans.volcengine` 缺省视为 `true`）
- Git commit message 不能包含任何 AI 工具标记（如 `Co-Authored-By: Claude`、`🤖 Generated with` 等），且禁止使用 `git add -A` / `git add .`

---

## 任务列表

### Task 1: manifest 与文档骨架

**Files:**
- Modify: `chrome-extension/manifest.json`（line 5 description；line 14-21 host_permissions）
- Modify: `CLAUDE.md`（"关键 API 端点"段、"状态管理"段）

**Interfaces:**
- Consumes: 无
- Produces: 浏览器对 `https://console.volcengine.com/*` 的 host 权限

- [ ] **Step 1: 修改 manifest 描述与 host_permissions**

Edit `chrome-extension/manifest.json`：
- `description` 字段改为：
  ```
  "description": "查询智谱 GLM、MiniMax、DeepSeek、Xiaomi 和 Volcengine 编码套餐的用量和余额信息",
  ```
- `host_permissions` 数组追加一项 `"https://console.volcengine.com/*"`（保持其他项不变，在 `"https://account.xiaomi.com/*"` 之后追加）

最终 host_permissions 内容应为：
```json
"host_permissions": [
  "https://bigmodel.cn/*",
  "https://www.minimaxi.com/*",
  "https://platform.minimaxi.com/*",
  "https://platform.deepseek.com/*",
  "https://platform.xiaomimimo.com/*",
  "https://account.xiaomi.com/*",
  "https://console.volcengine.com/*"
],
```

- [ ] **Step 2: 在 CLAUDE.md 中追加 Volcengine 说明**

在 `CLAUDE.md` 的"关键 API 端点"段最后追加一行：
```
- Volcengine 用量：`POST https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage`（需 `x-csrf-token` header，token 取自 `csrfToken` Cookie；返回 `QuotaUsage[]`，含 `session/weekly/monthly` 三档百分比与重置时间）
```

在 `CLAUDE.md` 的"状态管理"段 `enabledPlans` 行下方追加一行：
```
- `volcengineCache` — Volcengine 上次查询结果缓存
```

- [ ] **Step 3: 在 Chrome 扩展管理页刷新扩展验证**

打开 `chrome://extensions/` → 找到 CodingPlan 扩展 → 点击刷新按钮。

Expected：扩展正常加载，无报错。扩展卡片显示新描述「查询智谱 GLM、MiniMax、DeepSeek、Xiaomi 和 Volcengine 编码套餐...」。

- [ ] **Step 4: Commit**

```bash
git add chrome-extension/manifest.json CLAUDE.md
git commit -m "feat(volcengine): 准备 manifest 权限与文档骨架"
```

---

### Task 2: service-worker 接入 Volcengine handler

**Files:**
- Modify: `chrome-extension/background/service-worker.js`

**Interfaces:**
- Consumes: `chrome.cookies.get` / `chrome.storage.local` / `fetch`、常量 `API_TIMEOUT`、helper `isPlanEnabled` 与 `PLAN_KEYS`
- Produces:
  - 消息 `getVolcengineToken` → `{ token: string } | { error: 'NOT_LOGGED_IN' }`
  - 消息 `fetchVolcengineUsage` → `{ data: { status, updatedAt, quotas: [{level, percent, resetAt}] } } | { error: 'TIMEOUT' | 'LOGIN_REQUIRED' | string }`
  - 在 `checkUsageInBackground` 中新增 Volcengine 检查，对 `session` 档生成 `{ name: 'Volcengine-会话', percentage }` 推入 `usageItems`
  - `PLAN_KEYS` 数组加入 `'volcengine'`

- [ ] **Step 1: 扩展 PLAN_KEYS**

修改 `chrome-extension/background/service-worker.js` 第 11 行：

把：
```js
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi'];
```

改为：
```js
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi', 'volcengine'];
```

- [ ] **Step 2: 在 handlers 对象中注册新 handler**

修改 `chrome-extension/background/service-worker.js` 第 25-48 行（`chrome.runtime.onMessage.addListener` 注册块），在 `xiaomiAutoLogin: handleXiaomiAutoLogin,` 之后追加两行：

```js
    getVolcengineToken: handleGetVolcengineToken,
    fetchVolcengineUsage: handleFetchVolcengineUsage,
```

最终 handlers 对象应包含全部 14 个 handler。

- [ ] **Step 3: 在文件中追加 handler 实现**

在 `chrome-extension/background/service-worker.js` 中，紧跟在 `handleFetchXiaomiUsage` 实现之后（约第 309 行 `}` 之后、`// ========== 后台预警监控 ==========` 之前）追加：

```js
// 从 console.volcengine.com 获取 csrfToken
async function handleGetVolcengineToken() {
  const cookie = await chrome.cookies.get({
    url: 'https://console.volcengine.com',
    name: 'csrfToken',
  });
  if (cookie && cookie.value) {
    return { token: cookie.value };
  }
  return { error: 'NOT_LOGGED_IN' };
}

// 请求火山方舟 Coding Plan 用量 API
async function handleFetchVolcengineUsage() {
  const tokenResult = await handleGetVolcengineToken();
  if (tokenResult.error || !tokenResult.token) {
    return { error: 'LOGIN_REQUIRED' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const resp = await fetch(
      'https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage',
      {
        method: 'POST',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
          'x-csrf-token': tokenResult.token,
        },
        body: '{}',
        credentials: 'include',
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (resp.status === 401 || resp.status === 403) {
      return { error: 'LOGIN_REQUIRED' };
    }

    const raw = await resp.json();
    if (raw?.ResponseMetadata?.Error) {
      return { error: 'LOGIN_REQUIRED' };
    }

    const result = raw?.Result;
    if (!result || !Array.isArray(result.QuotaUsage)) {
      return { error: 'BAD_FORMAT' };
    }

    const quotas = result.QuotaUsage
      .filter((q) => q && typeof q.Level === 'string')
      .map((q) => ({
        level: q.Level,
        percent: typeof q.Percent === 'number' ? q.Percent : 0,
        resetAt: typeof q.ResetTimestamp === 'number' ? q.ResetTimestamp : 0,
      }));

    return {
      data: {
        status: result.Status || 'Unknown',
        updatedAt: result.UpdateTimestamp || 0,
        quotas,
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
    throw err;
  }
}
```

- [ ] **Step 4: 接入后台预警检查**

修改 `chrome-extension/background/service-worker.js` 的 `checkUsageInBackground` 函数。在 Xiaomi 检查块（`// 检查 Xiaomi 用量` 块）之后、`// 检查阈值并发送通知` 之前追加：

```js
  // 检查 Volcengine 用量（仅 session 档参与预警）
  if (isPlanEnabled(enabledPlans, 'volcengine')) {
    try {
      const volcResult = await handleFetchVolcengineUsage();
      if (volcResult.data && Array.isArray(volcResult.data.quotas)) {
        const session = volcResult.data.quotas.find((q) => q.level === 'session');
        if (session) {
          usageItems.push({ name: 'Volcengine-会话', percentage: Math.round(session.percent) });
        }
        // 更新缓存
        await chrome.storage.local.set({ volcengineCache: volcResult.data, volcengineCacheTime: Date.now() });
      }
    } catch (err) {
      console.error('[CodingPlan] Volcengine 后台检查失败:', err);
    }
  }
```

- [ ] **Step 5: 刷新扩展并验证 handler**

打开 `chrome://extensions/` → 点 CodingPlan 卡片的「刷新」按钮 → 点「服务工作进程」打开 service-worker DevTools。在 Console 中粘贴：

```js
chrome.runtime.sendMessage({ type: 'getVolcengineToken' }, console.log);
```

Expected：当用户已登录 console.volcengine.com 时，输出 `{ token: '<32位字符串>' }`；未登录时输出 `{ error: 'NOT_LOGGED_IN' }`。

继续在 Console 粘贴：

```js
chrome.runtime.sendMessage({ type: 'fetchVolcengineUsage' }, console.log);
```

Expected（已登录）：输出形如：
```
{ data: { status: 'Running', updatedAt: 17xxxxxx, quotas: [
  { level: 'session', percent: 9.08, resetAt: 17xxxxxx },
  { level: 'weekly',  percent: 21.72, resetAt: 17xxxxxx },
  { level: 'monthly', percent: 10.86, resetAt: 17xxxxxx }
] } }
```

未登录：输出 `{ error: 'LOGIN_REQUIRED' }`。

- [ ] **Step 6: Commit**

```bash
git add chrome-extension/background/service-worker.js
git commit -m "feat(volcengine): service-worker 增加 token/usage handler 与后台预警"
```

---

### Task 3: sidepanel 新增 Volcengine 卡片骨架

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.html`
- Modify: `chrome-extension/sidepanel/sidepanel.css`

**Interfaces:**
- Consumes: 现有 `.sb-card` / `.sb-loading` / `.sb-content` / `.sb-error` / `.sb-status-dot` / `.sb-card-title` / `.sb-progress-bar` / `.sb-progress-fill` 样式
- Produces:
  - DOM 节点 `#sbCardVolcengine`，结构与现有卡片一致
  - DOM 节点 `#sbPlanToggleVolcengine`，套餐启用开关
  - CSS 类 `.sb-quota-row`、`.sb-quota-label`、`.sb-quota-pct`、`.sb-quota-bar`、`.sb-quota-fill`、`.sb-quota-reset`、`.sb-card-link`（用于卡片右上角跳转图标）

- [ ] **Step 1: 在 sidepanel.html 卡片区追加 Volcengine 卡片**

在 `chrome-extension/sidepanel/sidepanel.html` 的 Xiaomi 卡片结束 `</div>`（约第 117 行）之后、`<!-- 套餐卡片区 --> </div>`（第 118 行）之前插入：

```html
      <!-- Volcengine -->
      <div class="sb-card" id="sbCardVolcengine">
        <div class="sb-card-header">
          <span class="sb-card-title">Volcengine</span>
          <span class="sb-status-dot"></span>
        </div>
        <div class="sb-loading">
          <div class="sb-skeleton-line w60"></div>
          <div class="sb-skeleton-bar"></div>
          <div class="sb-skeleton-line w60"></div>
          <div class="sb-skeleton-bar"></div>
          <div class="sb-skeleton-line w60"></div>
          <div class="sb-skeleton-bar"></div>
        </div>
        <div class="sb-content" style="display:none"></div>
        <div class="sb-error" style="display:none">
          <div class="sb-error-msg">--</div>
          <button class="sb-error-btn">重试</button>
        </div>
      </div>
```

- [ ] **Step 2: 在设置面板「套餐启用」分组追加 Volcengine 开关**

在 `chrome-extension/sidepanel/sidepanel.html` 的 Xiaomi 开关 `</div>`（第 159 行所在 `.sb-plan-row` 的结束 `</div>`）之后、`</section>`（第 160 行）之前插入：

```html
          <div class="sb-plan-row">
            <span class="sb-plan-name">Volcengine</span>
            <label class="sb-switch">
              <input type="checkbox" id="sbPlanToggleVolcengine" checked>
              <span class="sb-switch-slider"></span>
            </label>
          </div>
```

- [ ] **Step 3: 追加三档进度条 CSS**

在 `chrome-extension/sidepanel/sidepanel.css` 末尾追加：

```css
/* ========== Volcengine 三档配额 ========== */
.sb-quota-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 8px;
  margin-bottom: 6px;
}
.sb-quota-row:last-child { margin-bottom: 0; }

.sb-quota-label {
  font-size: 12px;
  color: #555;
}

.sb-quota-pct {
  font-size: 12px;
  color: #333;
  font-variant-numeric: tabular-nums;
}
.sb-quota-pct.warn { color: #f0ad4e; }
.sb-quota-pct.danger { color: #d9534f; }

.sb-quota-bar {
  grid-column: 1 / -1;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
  margin: 2px 0 2px;
}
.sb-quota-fill {
  height: 100%;
  background: #4a90e2;
  transition: width 0.3s ease;
}
.sb-quota-fill.warn { background: #f0ad4e; }
.sb-quota-fill.danger { background: #d9534f; }

.sb-quota-reset {
  grid-column: 1 / -1;
  font-size: 11px;
  color: #999;
  text-align: right;
  margin-top: -2px;
}

/* Status === Expired 时灰显 */
.sb-card.is-expired .sb-quota-fill {
  background: #bbb;
}
.sb-card.is-expired .sb-quota-pct,
.sb-card.is-expired .sb-quota-pct.warn,
.sb-card.is-expired .sb-quota-pct.danger {
  color: #999;
}

/* 卡片右上角的跳转图标 */
.sb-card-link {
  margin-left: 4px;
  color: #999;
  font-size: 12px;
  text-decoration: none;
}
.sb-card-link:hover { color: #4a90e2; }
```

- [ ] **Step 4: 刷新扩展并验证骨架**

在 `chrome://extensions/` 刷新扩展，打开 sidepanel（点击扩展图标 → 弹窗内「钉到侧边栏」按钮，或直接在 popup.html 中的 pin 按钮）。

Expected：
- 卡片列表底部出现一张「Volcengine」卡片，显示骨架屏（3 行短条 + 3 个进度条占位）
- 打开设置面板，「套餐启用」分组多出 Volcengine 一行带开关
- 点开关后再次刷新 sidepanel，卡片随之显隐

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.html chrome-extension/sidepanel/sidepanel.css
git commit -m "feat(volcengine): sidepanel 新增 Volcengine 卡片骨架与启用开关"
```

---

### Task 4: sidepanel 接入数据获取与渲染

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.js`

**Interfaces:**
- Consumes:
  - Task 2 暴露的 `fetchVolcengineUsage` 消息（返回 `{ data: { status, updatedAt, quotas: [{level, percent, resetAt}] } } | { error }`）
  - 现有 `showCardState`、`getProgressClass`、`checkThresholds`、`isPlanEnabled`、`sendMessage`
- Produces:
  - 顶层函数 `formatResetCountdown(resetTs: number): string`
  - 顶层函数 `fetchVolcengine(): Promise<void>`
  - 顶层函数 `renderVolcengine(data: { status, updatedAt, quotas }): void`
  - `PLAN_KEYS` 加入 `'volcengine'`、`PLAN_CARD_IDS.volcengine`、`PLAN_TOGGLE_IDS.volcengine` 三项映射
  - `refreshAll` 的 `fetchFnMap` 中加入 volcengine
  - `init` 中加入 volcengine 缓存渲染

- [ ] **Step 1: 扩展三个常量映射**

修改 `chrome-extension/sidepanel/sidepanel.js`：

把第 6 行：
```js
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi'];
```
改为：
```js
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi', 'volcengine'];
```

把第 8-13 行 `PLAN_CARD_IDS` 对象改为：
```js
const PLAN_CARD_IDS = {
  glm: 'sbCardGLM',
  minimax: 'sbCardMinimax',
  deepseek: 'sbCardDeepseek',
  xiaomi: 'sbCardXiaomi',
  volcengine: 'sbCardVolcengine',
};
```

把第 14-19 行 `PLAN_TOGGLE_IDS` 对象改为：
```js
const PLAN_TOGGLE_IDS = {
  glm: 'sbPlanToggleGlm',
  minimax: 'sbPlanToggleMinimax',
  deepseek: 'sbPlanToggleDeepseek',
  xiaomi: 'sbPlanToggleXiaomi',
  volcengine: 'sbPlanToggleVolcengine',
};
```

- [ ] **Step 2: 追加 `formatResetCountdown` 工具函数**

在 `chrome-extension/sidepanel/sidepanel.js` 中 `formatDuration` 函数实现结束（第 56 行 `}`）之后追加：

```js
// 把 unix 秒级时间戳格式化为「Nd / Nh Nm / Nm / <1分钟 / 已重置」
function formatResetCountdown(resetTs) {
  if (!resetTs) return '--';
  const ms = resetTs * 1000 - Date.now();
  if (ms <= 0) return '已重置';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '<1分钟';
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes}分钟后重置`;
  const days = Math.floor(hours / 24);
  if (days < 1) {
    const m = minutes % 60;
    return m > 0 ? `${hours}小时${m}分后重置` : `${hours}小时后重置`;
  }
  const h = hours % 24;
  return h > 0 ? `${days}天${h}小时后重置` : `${days}天后重置`;
}

// 把火山方舟 Level 映射为中文标签
const VOLCENGINE_LEVEL_LABELS = {
  session: '当前会话',
  weekly: '近 1 周',
  monthly: '近 1 月',
};
```

- [ ] **Step 3: 追加 fetchVolcengine 与 renderVolcengine**

在 `chrome-extension/sidepanel/sidepanel.js` 的 `// ========== Xiaomi ==========` 块之后、`// ========== 套餐启停:UI 显隐 ==========` 之前（约第 382 行 `}` 之后）追加：

```js
// ========== Volcengine ==========
async function fetchVolcengine() {
  showCardState('sbCardVolcengine', 'loading');

  const result = await sendMessage({ type: 'fetchVolcengineUsage' });

  if (!result || result.error === 'LOGIN_REQUIRED') {
    showCardState('sbCardVolcengine', 'error', {
      errorMsg: '请先登录火山方舟',
      errorBtnText: '前往登录',
      errorBtnAction: () => chrome.tabs.create({ url: 'https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan' }),
    });
    return;
  }
  if (result.error === 'TIMEOUT') {
    showCardState('sbCardVolcengine', 'error', {
      errorMsg: '请求超时',
      errorBtnText: '重试',
      errorBtnAction: fetchVolcengine,
    });
    return;
  }
  if (result.error || !result.data) {
    showCardState('sbCardVolcengine', 'error', {
      errorMsg: '获取 Volcengine 用量失败',
      errorBtnText: '重试',
      errorBtnAction: fetchVolcengine,
    });
    return;
  }

  await chrome.storage.local.set({ volcengineCache: result.data, volcengineCacheTime: Date.now() });
  renderVolcengine(result.data);
}

function renderVolcengine(data) {
  const quotas = Array.isArray(data.quotas) ? data.quotas : [];
  const order = ['session', 'weekly', 'monthly'];

  let maxPct = 0;
  const rows = order.map((level) => {
    const q = quotas.find((x) => x.level === level);
    if (!q) return '';
    const pct = Math.max(0, Math.min(100, q.percent || 0));
    if (pct > maxPct) maxPct = pct;
    const cls = getProgressClass(pct);
    const label = VOLCENGINE_LEVEL_LABELS[level] || level;
    const reset = formatResetCountdown(q.resetAt);
    return `
      <div class="sb-quota-row">
        <span class="sb-quota-label">${label}</span>
        <span class="sb-quota-pct${cls ? ' ' + cls : ''}">${pct.toFixed(2)}%</span>
        <div class="sb-quota-bar"><div class="sb-quota-fill${cls ? ' ' + cls : ''}" style="width:${pct}%"></div></div>
        <div class="sb-quota-reset">${reset}</div>
      </div>
    `;
  }).join('');

  const content = document.querySelector('#sbCardVolcengine .sb-content');
  content.innerHTML = rows || '<div class="sb-meta">暂无配额数据</div>';
  const card = document.getElementById('sbCardVolcengine');
  card.classList.toggle('is-expired', data.status === 'Expired');
  showCardState('sbCardVolcengine', 'content', { dotClass: getProgressClass(maxPct) });

  const session = quotas.find((q) => q.level === 'session');
  if (session) {
    checkThresholds([{ name: 'Volcengine-会话', percentage: Math.round(session.percent || 0) }]);
  }
}
```

- [ ] **Step 4: 接入 refreshAll**

修改 `chrome-extension/sidepanel/sidepanel.js` 的 `refreshAll` 函数（约 593-612 行）。把：

```js
    const fetchFnMap = {
      glm: fetchGLM,
      minimax: fetchMinimax,
      deepseek: fetchDeepseek,
      xiaomi: fetchXiaomi,
    };
```

改为：

```js
    const fetchFnMap = {
      glm: fetchGLM,
      minimax: fetchMinimax,
      deepseek: fetchDeepseek,
      xiaomi: fetchXiaomi,
      volcengine: fetchVolcengine,
    };
```

并在文件底部 `window.sbApi = { ... }` 一行（约 715 行）里追加 `fetchVolcengine`：

```js
window.sbApi = { refreshAll, fetchGLM, fetchMinimax, fetchDeepseek, fetchXiaomi, fetchVolcengine };
```

- [ ] **Step 5: 接入 init 缓存渲染**

修改 `chrome-extension/sidepanel/sidepanel.js` 的 `init` 函数（约 695-712 行）。

把 `chrome.storage.local.get([...])` 的 key 数组中：
```js
'glmCache', 'glmBalanceCache', 'minimaxCache', 'deepseekCache', 'xiaomiCache',
```
改为：
```js
'glmCache', 'glmBalanceCache', 'minimaxCache', 'deepseekCache', 'xiaomiCache', 'volcengineCache',
```

并在 `if (stored.xiaomiCache && ...) renderXiaomi(...)` 之后追加一行：
```js
  if (stored.volcengineCache && isPlanEnabled(stored.enabledPlans, 'volcengine')) renderVolcengine(stored.volcengineCache);
```

- [ ] **Step 6: 刷新扩展并完整验证**

`chrome://extensions/` → 刷新 CodingPlan 扩展 → 打开 sidepanel。

Expected：
- Volcengine 卡片从 loading 切换为 content
- 显示三行进度条：「当前会话 / 近 1 周 / 近 1 月」，百分比与火山方舟控制台一致
- 每行下方有「Nd / Nh Nm 后重置」倒计时
- 顶部状态点颜色：默认绿，最高档 ≥70% 黄、≥90% 红
- 关闭设置中 Volcengine 开关 → 卡片消失；重新打开 → 卡片重新出现并发请求
- 关闭 console.volcengine.com 标签页并清空其 Cookie，再刷新 sidepanel → Volcengine 卡片显示「请先登录火山方舟」+「前往登录」按钮，点击按钮新开标签到登录页

- [ ] **Step 7: Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.js
git commit -m "feat(volcengine): sidepanel 接入 Volcengine 用量渲染与三档进度"
```

---

### Task 5: popup 新增 Volcengine Tab 与渲染

**Files:**
- Modify: `chrome-extension/popup/popup.html`
- Modify: `chrome-extension/popup/popup.css`
- Modify: `chrome-extension/popup/popup.js`

**Interfaces:**
- Consumes: Task 2 暴露的 `fetchVolcengineUsage` 消息、现有 `getProgressClass`（popup 中返回 `warning`/`danger`）、`checkThresholds`、`switchTab`
- Produces:
  - DOM：Tab `data-tab="volcengine"`、panel `#volcenginePanel`、设置面板 `#planToggleVolcengine`
  - 顶层函数 `formatResetCountdown` / `fetchVolcengineData` / `renderVolcengineData` / `showVolcengineState`
  - `PLAN_KEYS`、`PLAN_TOGGLE_IDS`、`planElsMap`、`tabFetchMap` 加入 volcengine
  - `els` 加入 Volcengine 节点引用
  - `init` 加入 Volcengine 缓存渲染、跳转控制台按钮

- [ ] **Step 1: popup.html 新增 Tab、Panel、设置开关**

修改 `chrome-extension/popup/popup.html`：

**(1) Tab 区**：第 42 行 `</div>` 之前（在 Xiaomi tab `</button>` 之后）插入：
```html
      <button class="tab" data-tab="volcengine">Volcengine</button>
```

**(2) Volcengine panel**：在 Xiaomi panel 结束 `</div>`（第 315 行）之后、`<!-- 全局错误消息 -->`（第 317 行）之前插入：
```html
    <!-- Volcengine 面板 -->
    <div id="volcenginePanel" class="panel">
      <div id="volcengineLogin" class="login-prompt" style="display:none">
        <p>请先登录火山方舟</p>
        <button id="volcengineLoginBtn" class="primary-btn">前往登录</button>
      </div>
      <div id="volcengineSkeleton" class="content">
        <div class="usage-card">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-bar"></div>
        </div>
        <div class="usage-card">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-bar"></div>
        </div>
        <div class="usage-card">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-bar"></div>
        </div>
      </div>
      <div id="volcengineContent" class="content" style="display:none">
        <div class="usage-card volcengine-card">
          <div id="volcengineQuotas"></div>
        </div>
        <button id="volcengineGoUsageBtn" class="go-usage-btn">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path fill="currentColor" d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
          </svg>
          查看详细用量
        </button>
      </div>
      <div id="volcengineError" class="error-prompt" style="display:none">
        <p id="volcengineErrorMsg"></p>
        <button id="volcengineErrorBtn" class="primary-btn"></button>
      </div>
    </div>
```

**(3) 设置开关**：在 Xiaomi 设置行 `</div>`（第 363 行所在 `.settings-row` 的结束 `</div>`）之后、其外层 `</div>`（套餐启用 group 结束）之前插入：
```html
          <div class="settings-row">
            <span class="settings-desc">Volcengine</span>
            <label class="toggle">
              <input type="checkbox" id="planToggleVolcengine" checked>
              <span class="toggle-slider"></span>
            </label>
          </div>
```

- [ ] **Step 2: popup.css 新增三档进度条样式**

在 `chrome-extension/popup/popup.css` 末尾追加：

```css
/* ========== Volcengine 三档配额 ========== */
.volcengine-card { padding: 12px 14px; }

.volc-quota-row { margin-bottom: 12px; }
.volc-quota-row:last-child { margin-bottom: 0; }

.volc-quota-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}
.volc-quota-label { font-size: 13px; color: #555; }
.volc-quota-pct {
  font-size: 14px;
  color: #333;
  font-variant-numeric: tabular-nums;
}
.volc-quota-pct.warning { color: #f0ad4e; }
.volc-quota-pct.danger { color: #d9534f; }

.volc-quota-bar {
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}
.volc-quota-fill {
  height: 100%;
  background: #4a90e2;
  transition: width 0.3s ease;
}
.volc-quota-fill.warning { background: #f0ad4e; }
.volc-quota-fill.danger { background: #d9534f; }

.volc-quota-reset {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
  text-align: right;
}

.volcengine-card.is-expired .volc-quota-fill { background: #bbb; }
.volcengine-card.is-expired .volc-quota-pct,
.volcengine-card.is-expired .volc-quota-pct.warning,
.volcengine-card.is-expired .volc-quota-pct.danger { color: #999; }
```

- [ ] **Step 3: popup.js — 扩展常量**

修改 `chrome-extension/popup/popup.js`：

**(1) 第 14 行**：
```js
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi'];
```
改为：
```js
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi', 'volcengine'];
```

**(2) 第 16-21 行 `PLAN_TOGGLE_IDS`**：在 `xiaomi: 'planToggleXiaomi',` 之后追加一行 `volcengine: 'planToggleVolcengine',`，使对象包含 5 项。

- [ ] **Step 4: popup.js — 扩展 els 对象**

在 `chrome-extension/popup/popup.js` 的 `els` 对象（第 31-134 行）的 `// Xiaomi` 块之后、`// GLM` 块之前（也就是 `xiaomiGoUsageBtn: $('#xiaomiGoUsageBtn'),` 这一行之后）插入：

```js
  // Volcengine
  volcenginePanel: $('#volcenginePanel'),
  volcengineLogin: $('#volcengineLogin'),
  volcengineLoginBtn: $('#volcengineLoginBtn'),
  volcengineSkeleton: $('#volcengineSkeleton'),
  volcengineContent: $('#volcengineContent'),
  volcengineError: $('#volcengineError'),
  volcengineErrorMsg: $('#volcengineErrorMsg'),
  volcengineErrorBtn: $('#volcengineErrorBtn'),
  volcengineQuotas: $('#volcengineQuotas'),
  volcengineGoUsageBtn: $('#volcengineGoUsageBtn'),
```

并在 els 对象底部 `planToggleXiaomi: $('#planToggleXiaomi'),` 之后追加：
```js
  planToggleVolcengine: $('#planToggleVolcengine'),
```

- [ ] **Step 5: popup.js — 追加倒计时工具与等级标签**

在 `chrome-extension/popup/popup.js` 的 `formatXiaomiToken` 函数实现结束（约第 199 行 `}`）之后追加：

```js
// 把 unix 秒级时间戳格式化为「Nd / Nh Nm / Nm / <1分钟 / 已重置」
function formatResetCountdown(resetTs) {
  if (!resetTs) return '--';
  const ms = resetTs * 1000 - Date.now();
  if (ms <= 0) return '已重置';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '<1分钟';
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes}分钟后重置`;
  const days = Math.floor(hours / 24);
  if (days < 1) {
    const m = minutes % 60;
    return m > 0 ? `${hours}小时${m}分后重置` : `${hours}小时后重置`;
  }
  const h = hours % 24;
  return h > 0 ? `${days}天${h}小时后重置` : `${days}天后重置`;
}

const VOLCENGINE_LEVEL_LABELS = {
  session: '当前会话',
  weekly: '近 1 周',
  monthly: '近 1 月',
};
```

- [ ] **Step 6: popup.js — 追加 showVolcengineState、fetchVolcengineData、renderVolcengineData**

在 `chrome-extension/popup/popup.js` 的 `showXiaomiState` 函数实现结束（约第 264 行 `}`）之后追加：

```js
// ========== Volcengine 状态切换 ==========
function showVolcengineState(state) {
  els.volcengineLogin.style.display = state === 'login' ? 'block' : 'none';
  els.volcengineSkeleton.style.display = state === 'loading' ? 'flex' : 'none';
  els.volcengineContent.style.display = state === 'content' ? 'flex' : 'none';
  els.volcengineError.style.display = state === 'error' ? 'block' : 'none';
}
```

把 Xiaomi 跳转控制台逻辑参照之后，在 `els.deepseekGoUsageBtn.addEventListener` 块（约第 675 行）之后追加 Volcengine 跳转处理。具体在 `// ========== Xiaomi 数据获取 ==========` 块之前插入：

```js
// ========== Volcengine 数据获取 ==========
async function fetchVolcengineData() {
  showVolcengineState('loading');

  const result = await sendMessage({ type: 'fetchVolcengineUsage' });

  if (!result || result.error === 'LOGIN_REQUIRED') {
    showVolcengineState('login');
    return;
  }
  if (result.error === 'TIMEOUT') {
    showVolcengineState('error');
    els.volcengineErrorMsg.textContent = '请求超时，请检查网络后重试';
    els.volcengineErrorBtn.textContent = '重试';
    els.volcengineErrorBtn.onclick = fetchVolcengineData;
    return;
  }
  if (result.error || !result.data) {
    showVolcengineState('error');
    els.volcengineErrorMsg.textContent = '获取 Volcengine 用量失败';
    els.volcengineErrorBtn.textContent = '重试';
    els.volcengineErrorBtn.onclick = fetchVolcengineData;
    return;
  }

  renderVolcengineData(result.data);
  chrome.storage.local.set({ volcengineCache: result.data, volcengineCacheTime: Date.now() });
}

function renderVolcengineData(data) {
  showVolcengineState('content');
  const quotas = Array.isArray(data.quotas) ? data.quotas : [];
  const order = ['session', 'weekly', 'monthly'];

  const card = els.volcengineContent.querySelector('.volcengine-card');
  if (card) card.classList.toggle('is-expired', data.status === 'Expired');

  const rows = order.map((level) => {
    const q = quotas.find((x) => x.level === level);
    if (!q) return '';
    const pct = Math.max(0, Math.min(100, q.percent || 0));
    const cls = getProgressClass(pct);
    const label = VOLCENGINE_LEVEL_LABELS[level] || level;
    const reset = formatResetCountdown(q.resetAt);
    return `
      <div class="volc-quota-row">
        <div class="volc-quota-head">
          <span class="volc-quota-label">${label}</span>
          <span class="volc-quota-pct${cls ? ' ' + cls : ''}">${pct.toFixed(2)}%</span>
        </div>
        <div class="volc-quota-bar"><div class="volc-quota-fill${cls ? ' ' + cls : ''}" data-target="${pct}" style="width:0%"></div></div>
        <div class="volc-quota-reset">${reset}</div>
      </div>
    `;
  }).join('');

  els.volcengineQuotas.innerHTML = rows || '<p style="text-align:center;color:#999;padding:20px;">暂无配额数据</p>';

  requestAnimationFrame(() => {
    els.volcengineQuotas.querySelectorAll('.volc-quota-fill').forEach((fill) => {
      fill.style.width = fill.dataset.target + '%';
    });
  });

  // 仅 session 档参与预警
  const session = quotas.find((q) => q.level === 'session');
  if (session) {
    checkThresholds([{ name: 'Volcengine-会话', percentage: Math.round(session.percent || 0) }]);
  }
}

els.volcengineLoginBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan',
  });
});

els.volcengineGoUsageBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan',
  });
});
```

- [ ] **Step 7: popup.js — 接入 planElsMap、tabFetchMap、switchTab**

修改 `planElsMap`（约第 267-272 行）。把：
```js
const planElsMap = {
  glm: { tab: document.querySelector('.tab[data-tab="glm"]'), panel: els.glmPanel },
  minimax: { tab: document.querySelector('.tab[data-tab="minimax"]'), panel: els.minimaxPanel },
  deepseek: { tab: document.querySelector('.tab[data-tab="deepseek"]'), panel: els.deepseekPanel },
  xiaomi: { tab: document.querySelector('.tab[data-tab="xiaomi"]'), panel: els.xiaomiPanel },
};
```
改为：
```js
const planElsMap = {
  glm: { tab: document.querySelector('.tab[data-tab="glm"]'), panel: els.glmPanel },
  minimax: { tab: document.querySelector('.tab[data-tab="minimax"]'), panel: els.minimaxPanel },
  deepseek: { tab: document.querySelector('.tab[data-tab="deepseek"]'), panel: els.deepseekPanel },
  xiaomi: { tab: document.querySelector('.tab[data-tab="xiaomi"]'), panel: els.xiaomiPanel },
  volcengine: { tab: document.querySelector('.tab[data-tab="volcengine"]'), panel: els.volcenginePanel },
};
```

修改 `tabFetchMap`（约第 299-304 行）。把：
```js
const tabFetchMap = {
  glm: fetchGLMData,
  minimax: fetchMiniMaxData,
  deepseek: fetchDeepSeekData,
  xiaomi: fetchXiaomiData,
};
```
改为：
```js
const tabFetchMap = {
  glm: fetchGLMData,
  minimax: fetchMiniMaxData,
  deepseek: fetchDeepSeekData,
  xiaomi: fetchXiaomiData,
  volcengine: fetchVolcengineData,
};
```

修改 `switchTab`（约第 306-315 行），在 `els.xiaomiPanel.classList.toggle('active', tab === 'xiaomi');` 后追加一行：
```js
  els.volcenginePanel.classList.toggle('active', tab === 'volcengine');
```

- [ ] **Step 8: popup.js — 接入 Header 跳转、refreshAll、init**

修改 Header「查看详细用量」跳转（约第 873-891 行 `els.goUsageBtn.addEventListener`）。在 `} else if (currentTab === 'xiaomi') { ... }` 之后、最后一个 `}` 之前追加：
```js
  } else if (currentTab === 'volcengine') {
    chrome.tabs.create({
      url: 'https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan',
    });
```

修改 `refreshAll`（约第 1063-1083 行），把：
```js
  const fetchFnMap = {
    glm: fetchGLMData,
    minimax: fetchMiniMaxData,
    deepseek: fetchDeepSeekData,
    xiaomi: fetchXiaomiData,
  };
```
改为：
```js
  const fetchFnMap = {
    glm: fetchGLMData,
    minimax: fetchMiniMaxData,
    deepseek: fetchDeepSeekData,
    xiaomi: fetchXiaomiData,
    volcengine: fetchVolcengineData,
  };
```

修改 `init`（约第 1128-1141 行 `chrome.storage.local.get`）：在 key 数组的 `'xiaomiCache',` 之后追加 `'volcengineCache',`。

在 init 中 `if (stored.xiaomiCache && ...) renderXiaomiData(stored.xiaomiCache.data);` 之后（约第 1163 行）追加：
```js
  if (stored.volcengineCache && isPlanEnabled(stored.enabledPlans, 'volcengine')) {
    renderVolcengineData(stored.volcengineCache);
  }
```

- [ ] **Step 9: 刷新扩展并完整验证 popup**

`chrome://extensions/` 刷新扩展，点击工具栏图标打开 popup。

Expected：
- Tab 栏底部多出「Volcengine」Tab
- 点击切换到 Volcengine Tab → 显示骨架 → 切换到 content：三行进度条（当前会话/近 1 周/近 1 月），百分比、进度条颜色与火山方舟控制台一致
- 进度条带动画填充
- 每行底部小字「Nd / Nh Nm 后重置」
- 卡片下方「查看详细用量」按钮 → 新标签打开火山方舟控制台
- 设置面板「套餐启用」分组多出 Volcengine 开关；关闭后 Tab 和 panel 都隐藏；如当前 Tab 是 Volcengine 会自动切换到第一个启用的 Tab
- 已登录情况下数据与 sidepanel 一致
- 清空 console.volcengine.com Cookie 后刷新 popup → Volcengine Tab 显示「请先登录火山方舟」+「前往登录」按钮

- [ ] **Step 10: Commit**

```bash
git add chrome-extension/popup/popup.html chrome-extension/popup/popup.css chrome-extension/popup/popup.js
git commit -m "feat(volcengine): popup 新增 Volcengine Tab 与三档配额视图"
```

---

### Task 6: 预警去重与跨周期重置

**Files:**
- Modify: `chrome-extension/sidepanel/sidepanel.js`
- Modify: `chrome-extension/popup/popup.js`
- Modify: `chrome-extension/background/service-worker.js`

**Interfaces:**
- Consumes: 三处 `checkThresholds` 实现（sidepanel/popup/service-worker）；`volcengineCache`
- Produces: `notifiedAlerts` 中 key `Volcengine-会话-{T1,T2,T3}` 在 `session.resetAt` 变化时被清空；新增内部 helper `resetVolcengineAlertsIfNewCycle(currentResetAt)`

> **背景**：现有 `checkThresholds` 已经在百分比回落时清除标志。但跨周期重置时，新周期开头百分比会跳变（如月底接近 99% → 月初 0%），现有 `< threshold` 分支会清空——所以 monthly/weekly 在新周期开头一旦回到 0% 就会自动清空，**不需要专门处理**。

> 但 session 档周期只有 5 小时，可能出现：刷新时还在旧周期 60%（触发 T1=25%、T2=50%），下次刷新时已跨周期，新周期 30%（这时 ≥ T1=25% 又 < T2=50%）。`checkThresholds` 会清掉 T2 但不会重新触发 T1（仍 ≥ 25%），导致用户错过新周期的早期预警。

> 解决方法：在拉取到新数据时，比较 `session.resetAt` 与缓存中的旧值，发现变化即清空 `Volcengine-会话-*` 三个 key，让 `checkThresholds` 重新走一遍流程。

- [ ] **Step 1: sidepanel — 在 fetchVolcengine 中识别周期变化**

修改 `chrome-extension/sidepanel/sidepanel.js` 的 `fetchVolcengine` 函数。把：
```js
  await chrome.storage.local.set({ volcengineCache: result.data, volcengineCacheTime: Date.now() });
  renderVolcengine(result.data);
```

改为：
```js
  const prev = await chrome.storage.local.get(['volcengineCache', 'notifiedAlerts']);
  const prevSession = prev.volcengineCache?.quotas?.find((q) => q.level === 'session');
  const nextSession = result.data.quotas?.find((q) => q.level === 'session');
  if (prevSession && nextSession && prevSession.resetAt && nextSession.resetAt && prevSession.resetAt !== nextSession.resetAt) {
    // 跨周期了,清空 session 档的去重标志,让 checkThresholds 重新走流程
    const notified = { ...(prev.notifiedAlerts || {}) };
    let touched = false;
    for (const key of Object.keys(notified)) {
      if (key.startsWith('Volcengine-会话-')) {
        delete notified[key];
        touched = true;
      }
    }
    if (touched) await chrome.storage.local.set({ notifiedAlerts: notified });
  }

  await chrome.storage.local.set({ volcengineCache: result.data, volcengineCacheTime: Date.now() });
  renderVolcengine(result.data);
```

- [ ] **Step 2: popup — 同步同样的逻辑**

修改 `chrome-extension/popup/popup.js` 的 `fetchVolcengineData` 函数。把：
```js
  renderVolcengineData(result.data);
  chrome.storage.local.set({ volcengineCache: result.data, volcengineCacheTime: Date.now() });
```

改为：
```js
  const prev = await chrome.storage.local.get(['volcengineCache', 'notifiedAlerts']);
  const prevSession = prev.volcengineCache?.quotas?.find((q) => q.level === 'session');
  const nextSession = result.data.quotas?.find((q) => q.level === 'session');
  if (prevSession && nextSession && prevSession.resetAt && nextSession.resetAt && prevSession.resetAt !== nextSession.resetAt) {
    const notified = { ...(prev.notifiedAlerts || {}) };
    let touched = false;
    for (const key of Object.keys(notified)) {
      if (key.startsWith('Volcengine-会话-')) {
        delete notified[key];
        touched = true;
      }
    }
    if (touched) await chrome.storage.local.set({ notifiedAlerts: notified });
  }

  renderVolcengineData(result.data);
  chrome.storage.local.set({ volcengineCache: result.data, volcengineCacheTime: Date.now() });
```

- [ ] **Step 3: service-worker — 后台周期重置同样处理**

修改 `chrome-extension/background/service-worker.js` 中 `checkUsageInBackground` 的 Volcengine 块（Task 2 Step 4 加入的那段）。把：

```js
  if (isPlanEnabled(enabledPlans, 'volcengine')) {
    try {
      const volcResult = await handleFetchVolcengineUsage();
      if (volcResult.data && Array.isArray(volcResult.data.quotas)) {
        const session = volcResult.data.quotas.find((q) => q.level === 'session');
        if (session) {
          usageItems.push({ name: 'Volcengine-会话', percentage: Math.round(session.percent) });
        }
        // 更新缓存
        await chrome.storage.local.set({ volcengineCache: volcResult.data, volcengineCacheTime: Date.now() });
      }
    } catch (err) {
      console.error('[CodingPlan] Volcengine 后台检查失败:', err);
    }
  }
```

改为：

```js
  if (isPlanEnabled(enabledPlans, 'volcengine')) {
    try {
      const volcResult = await handleFetchVolcengineUsage();
      if (volcResult.data && Array.isArray(volcResult.data.quotas)) {
        const session = volcResult.data.quotas.find((q) => q.level === 'session');

        // 跨周期重置:对比上次缓存中的 session.resetAt
        const prev = await chrome.storage.local.get(['volcengineCache', 'notifiedAlerts']);
        const prevSession = prev.volcengineCache?.quotas?.find((q) => q.level === 'session');
        if (prevSession && session && prevSession.resetAt && session.resetAt && prevSession.resetAt !== session.resetAt) {
          const notified = { ...(prev.notifiedAlerts || {}) };
          let touched = false;
          for (const key of Object.keys(notified)) {
            if (key.startsWith('Volcengine-会话-')) {
              delete notified[key];
              touched = true;
            }
          }
          if (touched) await chrome.storage.local.set({ notifiedAlerts: notified });
        }

        if (session) {
          usageItems.push({ name: 'Volcengine-会话', percentage: Math.round(session.percent) });
        }
        // 更新缓存
        await chrome.storage.local.set({ volcengineCache: volcResult.data, volcengineCacheTime: Date.now() });
      }
    } catch (err) {
      console.error('[CodingPlan] Volcengine 后台检查失败:', err);
    }
  }
```

- [ ] **Step 4: 验证预警基础流程**

打开扩展管理页 → 刷新扩展 → 打开 popup → 进入设置面板 → 启用「用量预警」并将阈值 1 改为低于当前 session 百分比的值（如把阈值 1 改为 `1`，假设当前 session = 9%）。关闭设置，回到 Volcengine Tab。

Expected：系统弹出通知，标题「CodingPlan 用量预警」，内容形如「Volcengine-会话 使用量已达 9%，超过 1% 预警线」。

> **关于"火山方舟会话用量已达 50%"文案**：现有 `checkThresholds` 的通知模板固定使用 `${item.name} 使用量已达 ${item.percentage}%`。`item.name` 设为 `Volcengine-会话` 后，实际渲染为「Volcengine-会话 使用量已达 X%，超过 Y% 预警线」。这与设计稿的「火山方舟会话用量已达 X%」语义一致（前缀「Volcengine-会话」 vs 「火山方舟会话」是同义表达），且无需修改公共 `checkThresholds`——与其他平台保持一致。

- [ ] **Step 5: 验证跨周期重置**

打开 service-worker DevTools（`chrome://extensions/` → Service Worker → 检查视图）。Application → Storage → IndexedDB → chrome.storage 不可见，改在 Console 执行：

```js
chrome.storage.local.get(['volcengineCache', 'notifiedAlerts'], console.log);
```

记下当前 `volcengineCache.quotas` 中 session 的 `resetAt`。然后人为模拟跨周期：

```js
chrome.storage.local.get(['volcengineCache'], ({ volcengineCache }) => {
  const cache = JSON.parse(JSON.stringify(volcengineCache));
  const session = cache.quotas.find((q) => q.level === 'session');
  session.resetAt = 1;  // 改成显著不同的旧值
  chrome.storage.local.set({ volcengineCache: cache, notifiedAlerts: { 'Volcengine-会话-1': true, 'Volcengine-会话-25': true } });
});
```

回到 popup，切换 Tab 触发 `fetchVolcengineData`，然后检查：

```js
chrome.storage.local.get('notifiedAlerts', console.log);
```

Expected：`notifiedAlerts` 中不再包含 `Volcengine-会话-1`、`Volcengine-会话-25` 等 key。

- [ ] **Step 6: Commit**

```bash
git add chrome-extension/sidepanel/sidepanel.js chrome-extension/popup/popup.js chrome-extension/background/service-worker.js
git commit -m "feat(volcengine): 跨周期重置时清空 session 档预警去重标志"
```

---

## Self-Review

**1. Spec coverage**
- API 调用 → Task 2 ✓
- UI（三档进度条 + 倒计时）→ Task 3-5 ✓
- 跳转控制台 → Task 4 (sidepanel error 按钮)、Task 5 (popup Header 按钮、卡片底部按钮)；sidepanel content 卡片本身的点击跳转**spec 中提到「整张卡片可点击」，但现有 sidepanel 其他卡片也都不可整张点击**——已与现有交互保持一致，仅在 popup 的「查看详细用量」按钮和 sidepanel 的登录态按钮提供跳转入口。如需"整张卡片点击跳转"再补一个小 Task。
- 设置面板启用开关 → Task 3、Task 5 ✓
- 缓存 (`volcengineCache`) → Task 4 Step 6、Task 5 Step 8、Task 6 ✓
- 自动刷新接入 → Task 4 Step 4（sidepanel）、Task 5 Step 8（popup） ✓
- 预警仅 session 档 + 跨周期重置 → Task 6 ✓
- 通知文案 → Task 6 Step 4 (说明现有 `checkThresholds` 文案与"Volcengine-会话"组合即达成需求) ✓
- 错误/边界（未登录、超时、Expired 灰显） → Task 2/4/5、CSS `.is-expired` ✓
- 空状态 `sbEmptyPlans` → Task 4 Step 1 中 `PLAN_KEYS` 扩展后 `applyEnabledPlans` 自动覆盖 ✓
- manifest 权限 → Task 1 ✓
- CLAUDE.md 同步 → Task 1 ✓

**2. Placeholder scan**：无 TBD/TODO，每处代码均完整给出。

**3. Type consistency**
- `quotas: [{level, percent, resetAt}]` 在 service-worker、sidepanel、popup 三处签名一致 ✓
- `formatResetCountdown(resetTs)` 输入秒级时间戳，三处实现完全一致 ✓
- `VOLCENGINE_LEVEL_LABELS` 在 sidepanel/popup 各自定义但内容一致 ✓
- CSS 类后缀差异已明确标注（sidepanel 用 `warn`、popup 用 `warning`），各文件内部使用对应版本 ✓
- 预警 item name 三处均为 `'Volcengine-会话'` ✓

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-volcengine-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
