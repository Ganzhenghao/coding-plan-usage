// CodingPlan 用量查询 - 后台服务
// 处理 cookie 获取和 API 代理请求，以及后台预警监控

const API_TIMEOUT = 5000;
const ALARM_NAME = 'checkUsageAlerts';
const SHORT_INTERVAL_ALARM_NAME = 'checkUsageAlertsShort';
const ALERT_THRESHOLD_KEYS = ['alertThreshold1', 'alertThreshold2', 'alertThreshold3'];
const DEFAULT_ALERT_THRESHOLDS = [25, 50, 75];

// 套餐平台标识
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi', 'volcengine'];

// 判断某平台是否启用(undefined 视为启用,默认全开)
function isPlanEnabled(enabledPlans, key) {
  return enabledPlans?.[key] !== false;
}
let shortIntervalTimer = null;

function getAlertThresholds(stored) {
  return ALERT_THRESHOLD_KEYS.map(
    (key, index) => stored[key] ?? DEFAULT_ALERT_THRESHOLDS[index]
  ).sort((a, b) => a - b);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    getGLMToken: handleGetGLMToken,
    fetchGLMUsage: handleFetchGLMUsage,
    fetchGLMBalance: handleFetchGLMBalance,
    getMiniMaxCookies: handleGetMiniMaxCookies,
    fetchMiniMaxToken: handleFetchMiniMaxToken,
    fetchMiniMaxUsage: handleFetchMiniMaxUsage,
    getDeepSeekToken: handleGetDeepSeekToken,
    refreshDeepSeekToken: handleRefreshDeepSeekToken,
    fetchDeepSeekUsage: handleFetchDeepSeekUsage,
    getXiaomiCookies: handleGetXiaomiCookies,
    fetchXiaomiUsage: handleFetchXiaomiUsage,
    xiaomiAutoLogin: handleXiaomiAutoLogin,
    getVolcengineToken: handleGetVolcengineToken,
    fetchVolcengineUsage: handleFetchVolcengineUsage,
  };

  const handler = handlers[message.type];
  if (handler) {
    handler(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // 保持消息通道开放
  }
});

// 从 bigmodel.cn 获取登录 token
async function handleGetGLMToken() {
  const cookie = await chrome.cookies.get({
    url: 'https://bigmodel.cn',
    name: 'bigmodel_token_production',
  });
  if (cookie && cookie.value) {
    return { token: cookie.value };
  }
  return { error: 'NOT_LOGGED_IN' };
}

// 请求 GLM 用量 API
async function handleFetchGLMUsage({ token }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const resp = await fetch(
      'https://bigmodel.cn/api/monitor/usage/quota/limit',
      {
        headers: {
          accept: 'application/json, text/plain, */*',
          authorization: token,
          'set-language': 'zh',
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

// 请求 GLM 余额 API
async function handleFetchGLMBalance({ token }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const resp = await fetch(
      'https://bigmodel.cn/api/biz/account/query-customer-account-report',
      {
        headers: {
          accept: 'application/json, text/plain, */*',
          authorization: token,
          'set-language': 'zh',
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

// 获取 platform.minimaxi.com 的所有 cookie
async function handleGetMiniMaxCookies() {
  const cookies = await chrome.cookies.getAll({
    domain: 'minimaxi.com',
  });
  if (cookies && cookies.length > 0) {
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    return { cookies: cookieStr };
  }
  return { error: 'NOT_LOGGED_IN' };
}

// 携带 cookie 请求 MiniMax API Key
async function handleFetchMiniMaxToken({ cookies }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const resp = await fetch(
      'https://www.minimaxi.com/backend/token?token_type=4',
      {
        headers: {
          accept: 'application/json, text/plain, */*',
          cookie: cookies,
          origin: 'https://platform.minimaxi.com',
          referer: 'https://platform.minimaxi.com/',
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

// 请求 MiniMax 用量 API
async function handleFetchMiniMaxUsage({ apiKey }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const resp = await fetch(
      'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains',
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
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

// Xiaomi 静默自动登录：通过 fetch 走 SSO 重定向链恢复 Cookie
async function handleXiaomiAutoLogin({ loginUrl }) {
  try {
    await fetch(loginUrl, {
      credentials: 'include',
      redirect: 'follow',
    });

    // 检查 SSO 是否成功设置了 Cookie
    const cookies = await chrome.cookies.getAll({
      url: 'https://platform.xiaomimimo.com',
    });
    return { success: cookies.length > 0 };
  } catch (err) {
    console.error('[CodingPlan] Xiaomi 自动登录失败:', err);
    return { success: false };
  }
}

// 获取 platform.xiaomimimo.com 的所有 Cookie
async function handleGetXiaomiCookies() {
  const cookies = await chrome.cookies.getAll({
    url: 'https://platform.xiaomimimo.com',
  });
  if (cookies && cookies.length > 0) {
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    return { cookies: cookieStr };
  }
  return { cookies: '' };
}

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

// ========== 后台预警监控 ==========

// 初始化定时任务
async function initAlarm() {
  const stored = await chrome.storage.local.get(['alertEnabled', 'autoRefreshInterval']);
  
  // 清除现有的定时任务
  await chrome.alarms.clear(ALARM_NAME);
  if (shortIntervalTimer) {
    clearTimeout(shortIntervalTimer);
    shortIntervalTimer = null;
  }
  
  if (!stored.alertEnabled) {
    return;
  }
  
  const intervalSeconds = stored.autoRefreshInterval || 300;
  
  if (intervalSeconds < 60) {
    // 短间隔使用 setTimeout（chrome.alarms 最小间隔为 1 分钟）
    startShortInterval(intervalSeconds);
  } else {
    // 长间隔使用 chrome.alarms
    const intervalMinutes = Math.max(1, intervalSeconds / 60);
    await chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: intervalMinutes,
    });
  }
}

// 启动短间隔定时器
function startShortInterval(seconds) {
  if (shortIntervalTimer) {
    clearTimeout(shortIntervalTimer);
  }
  
  shortIntervalTimer = setInterval(async () => {
    await checkUsageInBackground();
  }, seconds * 1000);
}

// 定时任务触发时执行用量检查
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await checkUsageInBackground();
  }
});

// 后台用量检查和预警
async function checkUsageInBackground() {
  const stored = await chrome.storage.local.get(['alertEnabled']);
  if (!stored.alertEnabled) return;
  
  const usageItems = [];
  const { enabledPlans } = await chrome.storage.local.get('enabledPlans');

  // 检查 GLM 用量
  if (isPlanEnabled(enabledPlans, 'glm')) {
    try {
      const tokenResult = await handleGetGLMToken();
      if (tokenResult.token) {
        const glmResult = await handleFetchGLMUsage({ token: tokenResult.token });
        if (glmResult.data?.data?.limits) {
          const limits = glmResult.data.data.limits;

          const tokenLimit = limits.find((l) => l.type === 'TOKENS_LIMIT');
          if (tokenLimit) {
            usageItems.push({ name: 'GLM-Tokens', percentage: tokenLimit.percentage || 0 });
          }

          const toolLimit = limits.find((l) => l.type === 'TIME_LIMIT');
          if (toolLimit) {
            usageItems.push({ name: 'GLM-MCP工具', percentage: toolLimit.percentage || 0 });
          }

          // 更新缓存
          await chrome.storage.local.set({ glmCache: glmResult.data.data, glmCacheTime: Date.now() });
        }
      }
    } catch (err) {
      console.error('[CodingPlan] GLM 后台检查失败:', err);
    }
  }

  // 检查 MiniMax 用量
  if (isPlanEnabled(enabledPlans, 'minimax')) {
    try {
      const minimaxStored = await chrome.storage.local.get('minimaxApiKey');
      if (minimaxStored.minimaxApiKey) {
        const minimaxResult = await handleFetchMiniMaxUsage({ apiKey: minimaxStored.minimaxApiKey });
        if (minimaxResult.data?.model_remains) {
          const models = minimaxResult.data.model_remains;

          models.forEach((model) => {
            const remaining = model.current_interval_remaining_percent ?? 100;
            const usedPct = 100 - remaining;
            usageItems.push({ name: 'MiniMax-' + model.model_name, percentage: usedPct });
          });

          // 更新缓存
          await chrome.storage.local.set({ minimaxCache: minimaxResult.data, minimaxCacheTime: Date.now() });
        }
      }
    } catch (err) {
      console.error('[CodingPlan] MiniMax 后台检查失败:', err);
    }
  }

  // DeepSeek 不参与用量预警，仅更新缓存
  if (isPlanEnabled(enabledPlans, 'deepseek')) {
    try {
      const deepseekStored = await chrome.storage.local.get('deepseekToken');
      if (deepseekStored.deepseekToken) {
        const deepseekResult = await handleFetchDeepSeekUsage({ token: deepseekStored.deepseekToken });
        if (deepseekResult.data?.code === 0 && deepseekResult.data?.data?.biz_data) {
          // 更新缓存
          await chrome.storage.local.set({ deepseekCache: deepseekResult.data, deepseekCacheTime: Date.now() });
        }
      }
    } catch (err) {
      console.error('[CodingPlan] DeepSeek 后台检查失败:', err);
    }
  }

  // 检查 Xiaomi 用量
  if (isPlanEnabled(enabledPlans, 'xiaomi')) {
    try {
      const xiaomiCookieResult = await handleGetXiaomiCookies();
      const xiaomiResult = await handleFetchXiaomiUsage({ cookies: xiaomiCookieResult.cookies || '' });
      if (xiaomiResult.data?.code === 0 && xiaomiResult.data?.data) {
        const xiaomiData = xiaomiResult.data.data;
        // 月度用量（percent 是小数格式如 0.0444，转百分比）
        const monthItem = xiaomiData.monthUsage?.items?.[0];
        if (monthItem) {
          const pct = (parseFloat(monthItem.percent) || 0) * 100;
          usageItems.push({ name: 'Xiaomi-月度用量', percentage: pct });
        }
        // 套餐总量（percent 是小数格式如 0.04，转百分比）
        const planItem = xiaomiData.usage?.items?.find((i) => i.name === 'plan_total_token');
        if (planItem) {
          const pct = (parseFloat(planItem.percent) || 0) * 100;
          usageItems.push({ name: 'Xiaomi-套餐总量', percentage: pct });
        }
        // 更新缓存
        await chrome.storage.local.set({ xiaomiCache: xiaomiResult.data, xiaomiCacheTime: Date.now() });
      }
    } catch (err) {
      console.error('[CodingPlan] Xiaomi 后台检查失败:', err);
    }
  }

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

  // 检查阈值并发送通知
  await checkThresholds(usageItems);
}

// 预警阈值检查（与 popup.js 中的逻辑相同）
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
          message: `${item.name} 使用量已达 ${item.percentage}%，超过 ${threshold}% 预警线`,
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
    await chrome.storage.local.set({ notifiedAlerts: notified });
  }
}

// 监听预警设置变更，更新定时任务
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.alertEnabled || changes.autoRefreshInterval)) {
    initAlarm();
  }
});

// 初始化侧边栏 behavior:点击工具栏图标仍弹 popup,侧边栏只由按钮触发
async function initSidePanelBehavior() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (err) {
    console.error('[CodingPlan] setPanelBehavior 失败:', err);
  }
}

// 扩展安装或启动时初始化定时任务
chrome.runtime.onInstalled.addListener(() => {
  initAlarm();
  initSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  initAlarm();
  initSidePanelBehavior();
});
