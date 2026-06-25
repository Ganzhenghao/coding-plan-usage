// CodingPlan 侧边栏 — 数据获取与渲染

const API_TIMEOUT = 5000;

// 套餐平台标识
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi', 'volcengine'];
// 套餐开关 DOM id 映射(sidepanel 用 sbCardXxx 卡片 + sbPlanToggleXxx 开关)
const PLAN_CARD_IDS = {
  glm: 'sbCardGLM',
  minimax: 'sbCardMinimax',
  deepseek: 'sbCardDeepseek',
  xiaomi: 'sbCardXiaomi',
  volcengine: 'sbCardVolcengine',
};
const PLAN_TOGGLE_IDS = {
  glm: 'sbPlanToggleGlm',
  minimax: 'sbPlanToggleMinimax',
  deepseek: 'sbPlanToggleDeepseek',
  xiaomi: 'sbPlanToggleXiaomi',
  volcengine: 'sbPlanToggleVolcengine',
};

// 判断某平台是否启用(undefined 视为启用,默认全开)
function isPlanEnabled(enabledPlans, key) {
  return enabledPlans?.[key] !== false;
}

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

  const usage = result.data.data;
  await chrome.storage.local.set({ glmCache: usage, glmCacheTime: Date.now() });
  renderGLM(usage, null);

  sendMessage({ type: 'fetchGLMBalance', token: tokenResult.token }).then((balanceResult) => {
    if (balanceResult?.data?.code === 200 && balanceResult.data.data) {
      const balance = balanceResult.data.data;
      chrome.storage.local.set({ glmBalanceCache: balance, glmBalanceCacheTime: Date.now() });
      renderGLM(usage, balance);
    }
  });
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
  const monthlyCost = parseFloat(bizData.monthly_costs?.[0]?.amount || '0');
  const cls = balance <= 0 ? 'danger' : balance <= 5 ? 'warn' : '';

  const html = `
    <div class="sb-main-row">
      <span class="sb-main-label">账户余额</span>
      <span class="sb-main-pct${cls ? ' ' + cls : ''}">¥${balance.toFixed(2)}</span>
    </div>
    <div class="sb-meta">估算可用 ${formatTokenCount(tokenEstimation)} tokens</div>
    <div class="sb-meta">本月已用 ${formatTokenCount(monthlyUsage)} tokens · 花费 ¥${monthlyCost.toFixed(2)}</div>
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
      errorBtnAction: () => chrome.tabs.create({ url: data.loginUrl }),
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

function openSettings() {
  document.getElementById('sbSettingsOverlay').classList.add('visible');
  // 重新加载当前配置到表单
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
  try {
    const { enabledPlans } = await chrome.storage.local.get('enabledPlans');
    const fetchFnMap = {
      glm: fetchGLM,
      minimax: fetchMinimax,
      deepseek: fetchDeepseek,
      xiaomi: fetchXiaomi,
      volcengine: fetchVolcengine,
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
  try {
    await refreshAll();
  } finally {
    sbRefreshBtn.classList.remove('loading');
  }
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
  if (changes.enabledPlans) {
    applyEnabledPlans(changes.enabledPlans.newValue);
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
    'enabledPlans',
    'glmCache', 'glmBalanceCache', 'minimaxCache', 'deepseekCache', 'xiaomiCache', 'volcengineCache',
  ]);

  // 先应用套餐显隐(决定哪些卡片可见)
  applyEnabledPlans(stored.enabledPlans);

  // 仅渲染启用平台的缓存,避免向隐藏卡片写入 DOM
  if (stored.glmCache && isPlanEnabled(stored.enabledPlans, 'glm')) renderGLM(stored.glmCache, stored.glmBalanceCache || null);
  if (stored.minimaxCache && isPlanEnabled(stored.enabledPlans, 'minimax')) renderMinimax(stored.minimaxCache);
  if (stored.deepseekCache && isPlanEnabled(stored.enabledPlans, 'deepseek')) renderDeepseek(stored.deepseekCache);
  if (stored.xiaomiCache && isPlanEnabled(stored.enabledPlans, 'xiaomi')) renderXiaomi(stored.xiaomiCache.data);
  if (stored.volcengineCache && isPlanEnabled(stored.enabledPlans, 'volcengine')) renderVolcengine(stored.volcengineCache);

  await restoreAutoRefreshUI();
  refreshAll();
}

// 暴露给后续 Task 使用
window.sbApi = { refreshAll, fetchGLM, fetchMinimax, fetchDeepseek, fetchXiaomi, fetchVolcengine };

init();
