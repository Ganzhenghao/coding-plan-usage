// CodingPlan 用量查询 - 弹窗逻辑

// ========== 工具名称映射 ==========
const TOOL_NAME_MAP = {
  'search-prime': '搜索',
  'web-reader': '网页读取',
  'zread': '深度阅读',
};

const ALERT_THRESHOLD_KEYS = ['alertThreshold1', 'alertThreshold2', 'alertThreshold3'];
const DEFAULT_ALERT_THRESHOLDS = [25, 50, 75];

// ========== DOM 元素 ==========
const $ = (sel) => document.querySelector(sel);

const els = {
  // Tab
  tabs: document.querySelectorAll('.tab'),
  glmPanel: $('#glmPanel'),
  minimaxPanel: $('#minimaxPanel'),
  // GLM
  glmLogin: $('#glmLogin'),
  glmLoginBtn: $('#glmLoginBtn'),
  glmSkeleton: $('#glmSkeleton'),
  glmContent: $('#glmContent'),
  glmError: $('#glmError'),
  glmErrorMsg: $('#glmErrorMsg'),
  glmErrorBtn: $('#glmErrorBtn'),
  glmTokensPercent: $('#glmTokensPercent'),
  glmTokensProgress: $('#glmTokensProgress'),
  glmTokensUsage: $('#glmTokensUsage'),
  glmTokensTime: $('#glmTokensTime'),
  glmToolsPercent: $('#glmToolsPercent'),
  glmToolsProgress: $('#glmToolsProgress'),
  glmToolsUsage: $('#glmToolsUsage'),
  glmToolsTime: $('#glmToolsTime'),
  glmToolsDetails: $('#glmToolsDetails'),
  // MiniMax
  minimaxNoKey: $('#minimaxNoKey'),
  minimaxGoSettingsBtn: $('#minimaxGoSettingsBtn'),
  minimaxSkeleton: $('#minimaxSkeleton'),
  minimaxContent: $('#minimaxContent'),
  minimaxError: $('#minimaxError'),
  minimaxErrorMsg: $('#minimaxErrorMsg'),
  minimaxErrorBtn: $('#minimaxErrorBtn'),
  minimaxCards: $('#minimaxCards'),
  minimaxGoUsageBtn: $('#minimaxGoUsageBtn'),
  // GLM
  glmGoUsageBtn: $('#glmGoUsageBtn'),
  // Header
  refreshBtn: $('#refreshBtn'),
  settingsBtn: $('#settingsBtn'),
  goUsageBtn: $('#goUsageBtn'),
  // 设置面板
  settingsOverlay: $('#settingsOverlay'),
  settingsCloseBtn: $('#settingsCloseBtn'),
  apiKeyInput: $('#apiKeyInput'),
  saveApiKeyBtn: $('#saveApiKeyBtn'),
  autoGetBtn: $('#autoGetBtn'),
  apiKeyHint: $('#apiKeyHint'),
  autoRefreshToggle: $('#autoRefreshToggle'),
  autoRefreshOptions: $('#autoRefreshOptions'),
  autoRefreshInterval: $('#autoRefreshInterval'),
  alertToggle: $('#alertToggle'),
  alertOptions: $('#alertOptions'),
  alertThreshold1: $('#alertThreshold1'),
  alertThreshold2: $('#alertThreshold2'),
  alertThreshold3: $('#alertThreshold3'),
  // 全局
  errorMsg: $('#errorMsg'),
};

// ========== 状态 ==========
let currentTab = 'glm';
let isRefreshing = false;
let autoRefreshTimer = null;

// ========== 工具函数 ==========
function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

function formatTime(timestamp) {
  if (!timestamp) return '--';
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getProgressClass(percentage) {
  if (percentage >= 90) return 'danger';
  if (percentage >= 70) return 'warning';
  return '';
}

function getUnitName(unit) {
  const map = { 3: 'M', 5: '日', 4: '月' };
  return map[unit] || '';
}

function getAlertThresholds(stored) {
  return ALERT_THRESHOLD_KEYS.map(
    (key, index) => stored[key] ?? DEFAULT_ALERT_THRESHOLDS[index]
  ).sort((a, b) => a - b);
}

function normalizeAlertThreshold(value, fallback) {
  return Math.max(1, Math.min(99, value || fallback));
}

function normalizeAndSortAlertThresholds(values) {
  return values
    .map((value, index) => normalizeAlertThreshold(value, DEFAULT_ALERT_THRESHOLDS[index]))
    .sort((a, b) => a - b);
}

function setAlertThresholdInputs(values) {
  ALERT_THRESHOLD_KEYS.forEach((key, index) => {
    els[key].value = values[index];
  });
}

function saveAlertThresholds(values) {
  const normalized = normalizeAndSortAlertThresholds(values);
  const payload = { notifiedAlerts: {} };

  ALERT_THRESHOLD_KEYS.forEach((key, index) => {
    payload[key] = normalized[index];
  });

  setAlertThresholdInputs(normalized);
  chrome.storage.local.set(payload);
}

// ========== GLM 状态切换 ==========
function showGLMState(state) {
  els.glmLogin.style.display = state === 'login' ? 'block' : 'none';
  els.glmSkeleton.style.display = state === 'loading' ? 'flex' : 'none';
  els.glmContent.style.display = state === 'content' ? 'flex' : 'none';
  els.glmError.style.display = state === 'error' ? 'block' : 'none';
}

// ========== MiniMax 状态切换 ==========
function showMinimaxState(state) {
  els.minimaxNoKey.style.display = state === 'nokey' ? 'block' : 'none';
  els.minimaxSkeleton.style.display = state === 'loading' ? 'flex' : 'none';
  els.minimaxContent.style.display = state === 'content' ? 'flex' : 'none';
  els.minimaxError.style.display = state === 'error' ? 'block' : 'none';
}

// ========== Tab 切换 ==========
function switchTab(tab) {
  currentTab = tab;
  els.tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  els.glmPanel.classList.toggle('active', tab === 'glm');
  els.minimaxPanel.classList.toggle('active', tab === 'minimax');
  chrome.storage.local.set({ lastTab: tab });
}

els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ========== GLM 数据获取 ==========
async function fetchGLMData() {
  showGLMState('loading');

  const tokenResult = await sendMessage({ type: 'getGLMToken' });
  if (!tokenResult || tokenResult.error === 'NOT_LOGGED_IN') {
    showGLMState('login');
    return;
  }

  const result = await sendMessage({
    type: 'fetchGLMUsage',
    token: tokenResult.token,
  });

  if (!result || result.error) {
    const isTimeout = result && result.error === 'TIMEOUT';
    showGLMState('error');
    els.glmErrorMsg.textContent = isTimeout ? '请求超时，请检查网络后重试' : '获取 GLM 用量失败';
    els.glmErrorBtn.textContent = '重试';
    els.glmErrorBtn.onclick = fetchGLMData;
    return;
  }

  const data = result.data;
  if (!data || !data.success || !data.data || !data.data.limits) {
    showGLMState('error');
    els.glmErrorMsg.textContent = '数据格式异常，请稍后重试';
    els.glmErrorBtn.textContent = '重试';
    els.glmErrorBtn.onclick = fetchGLMData;
    return;
  }

  renderGLMData(data.data);
  chrome.storage.local.set({ glmCache: data.data, glmCacheTime: Date.now() });
}

function renderGLMData(data) {
  console.log('[CodingPlan] GLM raw data:', JSON.stringify(data));
  showGLMState('content');
  const limits = data.limits || [];

  const tokenLimit = limits.find((l) => l.type === 'TOKENS_LIMIT');
  if (tokenLimit) {
    const pct = tokenLimit.percentage || 0;
    const cls = getProgressClass(pct);
    els.glmTokensPercent.textContent = pct + '%';
    els.glmTokensPercent.className = 'usage-percent' + (cls ? ' ' + cls : '');
    els.glmTokensProgress.className = 'progress-fill' + (cls ? ' ' + cls : '');
    requestAnimationFrame(() => {
      els.glmTokensProgress.style.width = pct + '%';
    });
    const unitName = getUnitName(tokenLimit.unit);
    els.glmTokensUsage.textContent = ``;
    els.glmTokensTime.textContent = '重置时间: ' + formatTime(tokenLimit.nextResetTime);
  }

  const toolLimit = limits.find((l) => l.type === 'TIME_LIMIT');
  if (toolLimit) {
    const pct = toolLimit.percentage || 0;
    const cls = getProgressClass(pct);
    els.glmToolsPercent.textContent = pct + '%';
    els.glmToolsPercent.className = 'usage-percent' + (cls ? ' ' + cls : '');
    els.glmToolsProgress.className = 'progress-fill' + (cls ? ' ' + cls : '');
    requestAnimationFrame(() => {
      els.glmToolsProgress.style.width = pct + '%';
    });
    els.glmToolsUsage.textContent = `${toolLimit.currentValue || 0}/${toolLimit.usage || 0} 次`;
    els.glmToolsTime.textContent = '重置时间: ' + formatTime(toolLimit.nextResetTime);

    els.glmToolsDetails.innerHTML = '';
    if (toolLimit.usageDetails && toolLimit.usageDetails.length > 0) {
      toolLimit.usageDetails.forEach((detail) => {
        const item = document.createElement('span');
        item.className = 'tool-item';
        const displayName = TOOL_NAME_MAP[detail.modelCode] || detail.modelCode;
        item.innerHTML = `<span class="tool-name">${displayName}</span> ${detail.usage}`;
        els.glmToolsDetails.appendChild(item);
      });
    }
  }

  // 收集 GLM 用量数据进行阈值检查
  const glmUsageItems = [];
  if (tokenLimit) {
    glmUsageItems.push({ name: 'GLM-Tokens', percentage: tokenLimit.percentage || 0 });
  }
  if (toolLimit) {
    glmUsageItems.push({ name: 'GLM-MCP工具', percentage: toolLimit.percentage || 0 });
  }
  checkThresholds(glmUsageItems);
}

els.glmLoginBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://bigmodel.cn/login?redirect=%2Fusercenter%2Fsettings%2Faccount',
  });
});

// ========== MiniMax 数据获取 ==========
async function fetchMiniMaxData() {
  const stored = await chrome.storage.local.get('minimaxApiKey');
  const apiKey = stored.minimaxApiKey;

  if (!apiKey) {
    // 未配置 Key，尝试自动获取一次
    const autoKey = await autoFetchMiniMaxKey();
    if (!autoKey) {
      showMinimaxState('nokey');
      return;
    }
    return fetchMiniMaxData(); // 获取成功后重新调用
  }

  showMinimaxState('loading');

  const result = await sendMessage({
    type: 'fetchMiniMaxUsage',
    apiKey,
  });

  if (!result || result.error) {
    const isTimeout = result && result.error === 'TIMEOUT';
    showMinimaxState('error');
    els.minimaxErrorMsg.textContent = isTimeout ? '请求超时，请检查网络后重试' : '获取 MiniMax 用量失败';
    els.minimaxErrorBtn.textContent = '重试';
    els.minimaxErrorBtn.onclick = fetchMiniMaxData;
    return;
  }

  const data = result.data;
  if (!data || data.base_resp?.status_code !== 0) {
    showMinimaxState('error');
    els.minimaxErrorMsg.textContent = 'API Key 无效或已过期，请重新配置';
    els.minimaxErrorBtn.textContent = '前往设置';
    els.minimaxErrorBtn.onclick = openSettings;
    return;
  }

  renderMiniMaxData(data);
  chrome.storage.local.set({ minimaxCache: data, minimaxCacheTime: Date.now() });
}

function renderMiniMaxData(data) {
  showMinimaxState('content');
  els.minimaxCards.innerHTML = '';

  const models = data.model_remains || [];
  if (models.length === 0) {
    els.minimaxCards.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无套餐数据</p>';
    return;
  }

  models.forEach((model) => {
    const total = model.current_interval_total_count || 0;
    const remaining = model.current_interval_usage_count || 0;
    const used = total - remaining;
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    const cls = getProgressClass(pct);

    const card = document.createElement('div');
    card.className = 'model-card';
    card.innerHTML = `
      <div class="model-name">${model.model_name}</div>
      <div class="model-stats">
        <div class="stat-item">
          <div class="stat-value ${cls}">${used}</div>
          <div class="stat-label">已用</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${total}</div>
          <div class="stat-label">总量</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" style="color:#10b981">${remaining}</div>
          <div class="stat-label">剩余</div>
        </div>
      </div>
      <div class="model-progress">
        <div class="progress-bar">
          <div class="progress-fill ${cls}" style="width:0%"></div>
        </div>
        <span class="percent">${pct}%</span>
      </div>
      <div class="model-reset-time">重置时间: ${formatTime(model.end_time)}</div>
    `;
    els.minimaxCards.appendChild(card);

    requestAnimationFrame(() => {
      card.querySelector('.progress-fill').style.width = pct + '%';
    });
  });

  // 收集 MiniMax 用量数据进行阈值检查
  const minimaxUsageItems = models.map((model) => {
    const total = model.current_interval_total_count || 0;
    const remaining = model.current_interval_usage_count || 0;
    const used = total - remaining;
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    return { name: 'MiniMax-' + model.model_name, percentage: pct };
  });
  checkThresholds(minimaxUsageItems);
}

// MiniMax 未配置 Key → 跳转设置
els.minimaxGoSettingsBtn.addEventListener('click', openSettings);

// ========== 预警阈值检查 ==========
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
        // 超过阈值且未通知，发送通知
        chrome.notifications.create(key, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: 'CodingPlan 用量预警',
          message: `${item.name} 使用量已达 ${item.percentage}%，超过 ${threshold}% 预警线`,
        });
        notified[key] = true;
        changed = true;
      } else if (item.percentage < threshold && notified[key]) {
        // 回落到阈值以下，清除记录
        delete notified[key];
        changed = true;
      }
    }
  }

  if (changed) {
    chrome.storage.local.set({ notifiedAlerts: notified });
  }
}

// ========== 设置面板 ==========
function openSettings() {
  els.settingsOverlay.classList.add('visible');
  // 加载已有 API Key
  chrome.storage.local.get('minimaxApiKey', (stored) => {
    els.apiKeyInput.value = stored.minimaxApiKey || '';
  });
  setApiKeyHint('', '');
}

function closeSettings() {
  els.settingsOverlay.classList.remove('visible');
}

els.settingsBtn.addEventListener('click', openSettings);

// ========== 跳转详细用量（Header 按钮）==========
els.goUsageBtn.addEventListener('click', () => {
  if (currentTab === 'glm') {
    chrome.tabs.create({
      url: 'https://bigmodel.cn/usercenter/glm-coding/usage',
    });
  } else {
    chrome.tabs.create({
      url: 'https://platform.minimaxi.com/user-center/payment/token-plan',
    });
  }
});
els.settingsCloseBtn.addEventListener('click', closeSettings);
els.settingsOverlay.addEventListener('click', (e) => {
  if (e.target === els.settingsOverlay) closeSettings();
});

function setApiKeyHint(msg, type) {
  els.apiKeyHint.textContent = msg;
  els.apiKeyHint.className = 'settings-hint' + (type ? ' ' + type : '');
}

// 保存 API Key
els.saveApiKeyBtn.addEventListener('click', () => {
  const key = els.apiKeyInput.value.trim();
  if (!key) {
    setApiKeyHint('请输入 API Key', 'error');
    return;
  }
  chrome.storage.local.set({ minimaxApiKey: key }, () => {
    setApiKeyHint('保存成功', 'success');
    setTimeout(() => {
      closeSettings();
      fetchMiniMaxData();
    }, 500);
  });
});

// 自动获取 API Key（静默模式返回 key 或 null，UI 模式更新界面提示）
async function autoFetchMiniMaxKey(silent = true) {
  try {
    const cookieResult = await sendMessage({ type: 'getMiniMaxCookies' });
    if (!cookieResult || cookieResult.error === 'NOT_LOGGED_IN') {
      if (!silent) {
        setApiKeyHint('未检测到登录状态，正在跳转登录页...', 'error');
        setTimeout(() => {
          chrome.tabs.create({
            url: 'https://platform.minimaxi.com/login?redirect=%2Fuser-center%2Fpayment%2Fcoding-plan',
          });
        }, 1000);
      }
      return null;
    }

    const tokenResult = await sendMessage({
      type: 'fetchMiniMaxToken',
      cookies: cookieResult.cookies,
    });

    if (!tokenResult || tokenResult.error) {
      if (!silent) {
        setApiKeyHint('获取失败: ' + (tokenResult?.error || '未知错误'), 'error');
      }
      return null;
    }

    const data = tokenResult.data;
    if (data?.base_resp?.status_code === 1004) {
      if (!silent) {
        setApiKeyHint('未检测到登录状态，正在跳转登录页...', 'error');
        setTimeout(() => {
          chrome.tabs.create({
            url: 'https://platform.minimaxi.com/login?redirect=%2Fuser-center%2Fpayment%2Fcoding-plan',
          });
        }, 1000);
      }
      return null;
    }
    if (data?.base_resp?.status_code !== 0 || !data.tokens || data.tokens.length === 0) {
      if (!silent) {
        setApiKeyHint('未找到 CodingPlan API Key，请确认已开通套餐', 'error');
      }
      return null;
    }

    const apiKey = data.tokens[0].complete_token;
    await chrome.storage.local.set({ minimaxApiKey: apiKey });
    return apiKey;
  } catch {
    return null;
  }
}

els.autoGetBtn.addEventListener('click', async () => {
  els.autoGetBtn.disabled = true;
  els.autoGetBtn.textContent = '获取中...';
  setApiKeyHint('', '');

  try {
    const apiKey = await autoFetchMiniMaxKey(false);
    if (apiKey) {
      els.apiKeyInput.value = apiKey;
      setApiKeyHint('自动获取成功', 'success');
      setTimeout(() => {
        closeSettings();
        fetchMiniMaxData();
      }, 800);
    }
  } finally {
    els.autoGetBtn.disabled = false;
    els.autoGetBtn.textContent = '自动获取';
  }
});

// ========== 自动刷新 ==========
function startAutoRefresh() {
  stopAutoRefresh();
  const seconds = parseInt(els.autoRefreshInterval.value, 10) || 300;
  autoRefreshTimer = setInterval(() => refreshAll(), seconds * 1000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

els.autoRefreshToggle.addEventListener('change', () => {
  const enabled = els.autoRefreshToggle.checked;
  els.autoRefreshOptions.style.display = enabled ? 'block' : 'none';
  chrome.storage.local.set({ autoRefreshEnabled: enabled });
  if (enabled) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

els.autoRefreshInterval.addEventListener('change', () => {
  const seconds = parseInt(els.autoRefreshInterval.value, 10) || 300;
  chrome.storage.local.set({ autoRefreshInterval: seconds });
  if (els.autoRefreshToggle.checked) {
    startAutoRefresh();
  }
});

// ========== 预警设置交互 ==========
els.alertToggle.addEventListener('change', () => {
  const enabled = els.alertToggle.checked;
  els.alertOptions.style.display = enabled ? 'flex' : 'none';
  chrome.storage.local.set({ alertEnabled: enabled });
  // 关闭预警时清除已通知记录
  if (!enabled) {
    chrome.storage.local.set({ notifiedAlerts: {} });
  }
});

els.alertThreshold1.addEventListener('change', () => {
  saveAlertThresholds([
    parseInt(els.alertThreshold1.value, 10),
    parseInt(els.alertThreshold2.value, 10),
    parseInt(els.alertThreshold3.value, 10),
  ]);
});

els.alertThreshold2.addEventListener('change', () => {
  saveAlertThresholds([
    parseInt(els.alertThreshold1.value, 10),
    parseInt(els.alertThreshold2.value, 10),
    parseInt(els.alertThreshold3.value, 10),
  ]);
});

els.alertThreshold3.addEventListener('change', () => {
  saveAlertThresholds([
    parseInt(els.alertThreshold1.value, 10),
    parseInt(els.alertThreshold2.value, 10),
    parseInt(els.alertThreshold3.value, 10),
  ]);
});

// ========== 刷新 ==========
async function refreshAll() {
  if (isRefreshing) return;
  isRefreshing = true;
  els.refreshBtn.classList.add('loading');

  await Promise.all([fetchGLMData(), fetchMiniMaxData()]);

  isRefreshing = false;
  els.refreshBtn.classList.remove('loading');
  chrome.storage.local.set({ lastUpdateTime: Date.now() });
}

els.refreshBtn.addEventListener('click', refreshAll);

// ========== 跳转详细用量 ==========
els.glmGoUsageBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://bigmodel.cn/usercenter/glm-coding/usage',
  });
});

els.minimaxGoUsageBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://platform.minimaxi.com/user-center/payment/token-plan',
  });
});

// ========== 初始化 ==========
async function init() {
  const stored = await chrome.storage.local.get([
    'lastTab',
    'glmCache',
    'minimaxCache',
    'autoRefreshEnabled',
    'autoRefreshInterval',
    'alertEnabled',
    ...ALERT_THRESHOLD_KEYS,
  ]);

  if (stored.lastTab) {
    switchTab(stored.lastTab);
  }

  // 先用缓存渲染
  if (stored.glmCache) {
    renderGLMData(stored.glmCache);
  }
  if (stored.minimaxCache) {
    renderMiniMaxData(stored.minimaxCache);
  }

  // 恢复自动刷新设置
  if (stored.autoRefreshEnabled) {
    els.autoRefreshToggle.checked = true;
    els.autoRefreshOptions.style.display = 'block';
    if (stored.autoRefreshInterval) {
      els.autoRefreshInterval.value = String(stored.autoRefreshInterval);
    }
    startAutoRefresh();
  }

  // 恢复预警设置
  if (stored.alertEnabled) {
    els.alertToggle.checked = true;
    els.alertOptions.style.display = 'flex';
  }
  const hasStoredThresholds = ALERT_THRESHOLD_KEYS.some((key) => stored[key] != null);
  const initialThresholds = hasStoredThresholds
    ? normalizeAndSortAlertThresholds(
        ALERT_THRESHOLD_KEYS.map((key, index) => stored[key] ?? DEFAULT_ALERT_THRESHOLDS[index])
      )
    : DEFAULT_ALERT_THRESHOLDS;
  setAlertThresholdInputs(initialThresholds);

  if (
    hasStoredThresholds &&
    ALERT_THRESHOLD_KEYS.some((key, index) => stored[key] !== initialThresholds[index])
  ) {
    chrome.storage.local.set(
      ALERT_THRESHOLD_KEYS.reduce((acc, key, index) => {
        acc[key] = initialThresholds[index];
        return acc;
      }, {})
    );
  }

  // 异步刷新
  refreshAll();
}

init();
