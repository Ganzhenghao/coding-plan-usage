// CodingPlan 用量查询 - 弹窗逻辑

// ========== 工具名称映射 ==========
const TOOL_NAME_MAP = {
  'search-prime': '搜索',
  'web-reader': '网页读取',
  'zread': '深度阅读',
};

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
  minimaxSetup: $('#minimaxSetup'),
  minimaxSkeleton: $('#minimaxSkeleton'),
  minimaxContent: $('#minimaxContent'),
  minimaxError: $('#minimaxError'),
  minimaxErrorMsg: $('#minimaxErrorMsg'),
  minimaxErrorBtn: $('#minimaxErrorBtn'),
  minimaxCards: $('#minimaxCards'),
  apiKeyInput: $('#apiKeyInput'),
  saveApiKeyBtn: $('#saveApiKeyBtn'),
  autoGetBtn: $('#autoGetBtn'),
  changeApiKeyBtn: $('#changeApiKeyBtn'),
  setupHint: $('#setupHint'),
  // 全局
  refreshBtn: $('#refreshBtn'),
  errorMsg: $('#errorMsg'),
};

// ========== 状态 ==========
let currentTab = 'glm';
let isRefreshing = false;

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
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function showErrorToast(msg) {
  els.errorMsg.textContent = msg;
  els.errorMsg.style.display = 'block';
  setTimeout(() => {
    els.errorMsg.style.display = 'none';
  }, 3000);
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
  els.minimaxSetup.style.display = state === 'setup' ? 'block' : 'none';
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

  // 获取 token
  const tokenResult = await sendMessage({ type: 'getGLMToken' });
  if (!tokenResult || tokenResult.error === 'NOT_LOGGED_IN') {
    showGLMState('login');
    return;
  }

  // 请求用量
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
  showGLMState('content');
  const limits = data.limits || [];

  // Token 用量
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
    els.glmTokensUsage.textContent = `${tokenLimit.number || 0}/${tokenLimit.number || 0}${unitName} tokens`;
    els.glmTokensTime.textContent = formatTime(tokenLimit.nextResetTime);
  }

  // 工具调用
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
    els.glmToolsUsage.textContent = `${toolLimit.usage || 0}/${toolLimit.currentValue || 0} 次`;
    els.glmToolsTime.textContent = formatTime(toolLimit.nextResetTime);

    // 工具明细
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
}

// ========== GLM 登录按钮 ==========
els.glmLoginBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://bigmodel.cn/login?redirect=%2Fusercenter%2Fsettings%2Faccount',
  });
});

// ========== MiniMax 数据获取 ==========
async function fetchMiniMaxData() {
  // 从 storage 读取 API Key
  const stored = await chrome.storage.local.get('minimaxApiKey');
  const apiKey = stored.minimaxApiKey;

  if (!apiKey) {
    showMinimaxState('setup');
    return;
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
    els.minimaxErrorBtn.textContent = '重新配置';
    els.minimaxErrorBtn.onclick = () => {
      chrome.storage.local.remove('minimaxApiKey');
      showMinimaxState('setup');
    };
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
    `;
    els.minimaxCards.appendChild(card);

    requestAnimationFrame(() => {
      card.querySelector('.progress-fill').style.width = pct + '%';
    });
  });
}

// ========== MiniMax 设置 ==========
// 保存 API Key
els.saveApiKeyBtn.addEventListener('click', () => {
  const key = els.apiKeyInput.value.trim();
  if (!key) {
    setHint('请输入 API Key', 'error');
    return;
  }
  chrome.storage.local.set({ minimaxApiKey: key }, () => {
    setHint('保存成功', 'success');
    setTimeout(() => fetchMiniMaxData(), 500);
  });
});

// 自动获取 API Key
els.autoGetBtn.addEventListener('click', async () => {
  els.autoGetBtn.disabled = true;
  els.autoGetBtn.textContent = '获取中...';
  setHint('', '');

  try {
    // 获取 cookie
    const cookieResult = await sendMessage({ type: 'getMiniMaxCookies' });
    if (!cookieResult || cookieResult.error === 'NOT_LOGGED_IN') {
      setHint('未检测到登录状态，正在跳转登录页...', 'error');
      setTimeout(() => {
        chrome.tabs.create({
          url: 'https://platform.minimaxi.com/login?redirect=%2Fuser-center%2Fpayment%2Fcoding-plan',
        });
      }, 1000);
      return;
    }

    // 请求 token
    const tokenResult = await sendMessage({
      type: 'fetchMiniMaxToken',
      cookies: cookieResult.cookies,
    });

    if (!tokenResult || tokenResult.error) {
      setHint('获取失败: ' + (tokenResult?.error || '未知错误'), 'error');
      return;
    }

    const data = tokenResult.data;
    if (data?.base_resp?.status_code !== 0 || !data.tokens || data.tokens.length === 0) {
      setHint('未找到 CodingPlan API Key，请确认已开通套餐', 'error');
      return;
    }

    // 提取 complete_token
    const apiKey = data.tokens[0].complete_token;
    els.apiKeyInput.value = apiKey;
    chrome.storage.local.set({ minimaxApiKey: apiKey }, () => {
      setHint('自动获取成功', 'success');
      setTimeout(() => fetchMiniMaxData(), 800);
    });
  } finally {
    els.autoGetBtn.disabled = false;
    els.autoGetBtn.textContent = '自动获取';
  }
});

// 修改 API Key
els.changeApiKeyBtn.addEventListener('click', () => {
  els.apiKeyInput.value = '';
  setHint('', '');
  showMinimaxState('setup');
  // 加载已有 key 到输入框
  chrome.storage.local.get('minimaxApiKey', (stored) => {
    if (stored.minimaxApiKey) {
      els.apiKeyInput.value = stored.minimaxApiKey;
    }
  });
});

function setHint(msg, type) {
  els.setupHint.textContent = msg;
  els.setupHint.className = 'setup-hint' + (type ? ' ' + type : '');
}

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

// ========== 初始化 ==========
async function init() {
  const stored = await chrome.storage.local.get([
    'lastTab',
    'glmCache',
    'minimaxCache',
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

  // 异步刷新
  refreshAll();
}

init();
