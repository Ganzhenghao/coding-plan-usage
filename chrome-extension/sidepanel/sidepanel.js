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

  const items = [];
  if (tokenLimit) items.push({ name: 'GLM-Tokens', percentage: tokenPct });
  if (toolLimit) items.push({ name: 'GLM-MCP工具', percentage: toolPct });
  checkThresholds(items);
}

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

  const items = models.map((m) => ({
    name: 'MiniMax-' + m.model_name,
    percentage: 100 - (m.current_interval_remaining_percent ?? 100),
  }));
  checkThresholds(items);
}

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

  const items = [];
  if (monthItem) items.push({ name: 'Xiaomi-月度用量', percentage: monthPct });
  if (planItem) items.push({ name: 'Xiaomi-套餐总量', percentage: planPct });
  checkThresholds(items);
}

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
    chrome.storage.local.set({ notifiedAlerts: notified });
  }
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

// ========== 初始化:缓存优先 ==========
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

// 暴露给后续 Task 使用
window.sbApi = { refreshAll, fetchGLM, fetchMinimax, fetchDeepseek, fetchXiaomi };

init();
