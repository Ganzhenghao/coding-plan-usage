// CodingPlan 用量查询 - 弹窗逻辑

// ========== DOM 元素 ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  // Tab
  tabs: $$('.tab'),
  tabContainer: $('.tabs'),
  panels: { glm: $('#panel-glm'), minimax: $('#panel-minimax') },
  // GLM
  glmSkeleton: $('#glm-skeleton'),
  glmContent: $('#glm-content'),
  glmError: $('#glm-error'),
  glmErrorMsg: $('#glm-error-msg'),
  glmErrorBtn: $('#glm-error-btn'),
  glmTokenPercentage: $('#glm-token-percentage'),
  glmTokenProgress: $('#glm-token-progress'),
  glmTokenReset: $('#glm-token-reset'),
  glmToolPercentage: $('#glm-tool-percentage'),
  glmToolProgress: $('#glm-tool-progress'),
  glmToolUsage: $('#glm-tool-usage'),
  glmToolReset: $('#glm-tool-reset'),
  glmToolDetails: $('#glm-tool-details'),
  // MiniMax
  minimaxSkeleton: $('#minimax-skeleton'),
  minimaxContent: $('#minimax-content'),
  minimaxError: $('#minimax-error'),
  minimaxErrorMsg: $('#minimax-error-msg'),
  minimaxErrorBtn: $('#minimax-error-btn'),
  // 底部
  btnRefresh: $('#btnRefresh'),
  updateTime: $('#updateTime'),
  // 设置
  settingsOverlay: $('#settingsOverlay'),
  btnSettings: $('#btnSettings'),
  btnCloseSettings: $('#btnCloseSettings'),
  inputApiKey: $('#inputApiKey'),
  btnToggleKey: $('#btnToggleKey'),
  btnAutoGetKey: $('#btnAutoGetKey'),
  btnSaveKey: $('#btnSaveKey'),
  keyHint: $('#keyHint'),
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
  if (percentage > 85) return 'danger';
  if (percentage > 60) return 'warn';
  return '';
}

function setProgress(el, percentage) {
  el.className = 'progress-fill ' + getProgressClass(percentage);
  // 延迟设置宽度以触发动画
  requestAnimationFrame(() => {
    el.style.width = percentage + '%';
  });
}

function showState(prefix, state) {
  const skeleton = $(`#${prefix}-skeleton`);
  const content = $(`#${prefix}-content`);
  const error = $(`#${prefix}-error`);
  skeleton.style.display = state === 'loading' ? 'block' : 'none';
  content.style.display = state === 'content' ? 'block' : 'none';
  error.style.display = state === 'error' ? 'flex' : 'none';
}

function showError(prefix, msg, btnText, btnAction) {
  showState(prefix, 'error');
  $(`#${prefix}-error-msg`).textContent = msg;
  const btn = $(`#${prefix}-error-btn`);
  btn.textContent = btnText;
  btn.onclick = btnAction;
}

// ========== Tab 切换 ==========
function switchTab(tab) {
  currentTab = tab;
  els.tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  els.tabContainer.dataset.active = tab;
  Object.entries(els.panels).forEach(([key, panel]) => {
    panel.classList.toggle('active', key === tab);
  });
  chrome.storage.local.set({ lastTab: tab });
}

els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ========== GLM 数据获取 ==========
async function fetchGLMData() {
  showState('glm', 'loading');

  // 获取 token
  const tokenResult = await sendMessage({ type: 'getGLMToken' });
  if (!tokenResult || tokenResult.error === 'NOT_LOGGED_IN') {
    showError('glm', '未检测到 GLM 登录状态，请先登录 bigmodel.cn', '去登录', () => {
      chrome.tabs.create({
        url: 'https://bigmodel.cn/login?redirect=%2Fusercenter%2Fsettings%2Faccount',
      });
    });
    return;
  }

  // 请求用量
  const result = await sendMessage({
    type: 'fetchGLMUsage',
    token: tokenResult.token,
  });

  if (!result || result.error) {
    const isTimeout = result && result.error === 'TIMEOUT';
    showError(
      'glm',
      isTimeout ? '请求超时，请检查网络后重试' : '获取 GLM 用量失败',
      '重试',
      fetchGLMData
    );
    return;
  }

  const data = result.data;
  if (!data || !data.success || !data.data || !data.data.limits) {
    showError('glm', '数据格式异常，请稍后重试', '重试', fetchGLMData);
    return;
  }

  renderGLMData(data.data);
  // 缓存数据
  chrome.storage.local.set({
    glmCache: data.data,
    glmCacheTime: Date.now(),
  });
}

function renderGLMData(data) {
  showState('glm', 'content');
  const limits = data.limits || [];

  // Token 用量
  const tokenLimit = limits.find((l) => l.type === 'TOKENS_LIMIT');
  if (tokenLimit) {
    const pct = tokenLimit.percentage || 0;
    els.glmTokenPercentage.textContent = pct + '%';
    setProgress(els.glmTokenProgress, pct);
    els.glmTokenReset.textContent = '下次重置: ' + formatTime(tokenLimit.nextResetTime);
  }

  // 工具调用
  const toolLimit = limits.find((l) => l.type === 'TIME_LIMIT');
  if (toolLimit) {
    const pct = toolLimit.percentage || 0;
    els.glmToolPercentage.textContent = pct + '%';
    setProgress(els.glmToolProgress, pct);
    els.glmToolUsage.textContent = `已用 ${toolLimit.currentValue || 0} / ${toolLimit.usage || 0}`;
    els.glmToolReset.textContent = '下次重置: ' + formatTime(toolLimit.nextResetTime);

    // 工具明细
    els.glmToolDetails.innerHTML = '';
    if (toolLimit.usageDetails && toolLimit.usageDetails.length > 0) {
      toolLimit.usageDetails.forEach((detail) => {
        const item = document.createElement('div');
        item.className = 'tool-item';
        item.innerHTML = `
          <span class="tool-name">${detail.modelCode}</span>
          <span class="tool-count">${detail.usage} 次</span>
        `;
        els.glmToolDetails.appendChild(item);
      });
    }
  }
}

// ========== MiniMax 数据获取 ==========
async function fetchMiniMaxData() {
  showState('minimax', 'loading');

  // 从 storage 读取 API Key
  const stored = await chrome.storage.local.get('minimaxApiKey');
  const apiKey = stored.minimaxApiKey;

  if (!apiKey) {
    showError('minimax', 'MiniMax API Key 未配置，请在设置中配置', '去设置', () => {
      openSettings();
    });
    return;
  }

  const result = await sendMessage({
    type: 'fetchMiniMaxUsage',
    apiKey,
  });

  if (!result || result.error) {
    const isTimeout = result && result.error === 'TIMEOUT';
    showError(
      'minimax',
      isTimeout ? '请求超时，请检查网络后重试' : '获取 MiniMax 用量失败',
      '重试',
      fetchMiniMaxData
    );
    return;
  }

  const data = result.data;
  if (!data || data.base_resp?.status_code !== 0) {
    showError(
      'minimax',
      'API Key 无效或已过期，请重新配置',
      '去设置',
      openSettings
    );
    return;
  }

  renderMiniMaxData(data);
  chrome.storage.local.set({
    minimaxCache: data,
    minimaxCacheTime: Date.now(),
  });
}

function renderMiniMaxData(data) {
  showState('minimax', 'content');
  const content = els.minimaxContent;
  content.innerHTML = '';

  const models = data.model_remains || [];
  if (models.length === 0) {
    content.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">暂无套餐数据</p>';
    return;
  }

  models.forEach((model) => {
    const total = model.current_interval_total_count || 0;
    const used = model.current_interval_usage_count || 0;
    const remaining = total - used;
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${model.model_name}</span>
        <span class="card-badge">${pct}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${getProgressClass(pct)}" style="width:0%"></div>
      </div>
      <div class="card-meta">
        <span>已用 ${used} / ${total}</span>
        <span>剩余 ${remaining}</span>
      </div>
    `;
    content.appendChild(card);

    // 动画延迟
    requestAnimationFrame(() => {
      card.querySelector('.progress-fill').style.width = pct + '%';
    });
  });
}

// ========== 设置面板 ==========
function openSettings() {
  els.settingsOverlay.classList.add('visible');
  // 加载已有 key
  chrome.storage.local.get('minimaxApiKey', (stored) => {
    if (stored.minimaxApiKey) {
      els.inputApiKey.value = stored.minimaxApiKey;
    }
  });
  els.keyHint.textContent = '';
  els.keyHint.className = 'setting-hint';
}

function closeSettings() {
  els.settingsOverlay.classList.remove('visible');
}

els.btnSettings.addEventListener('click', openSettings);
els.btnCloseSettings.addEventListener('click', closeSettings);
els.settingsOverlay.addEventListener('click', (e) => {
  if (e.target === els.settingsOverlay) closeSettings();
});

// 显示/隐藏 API Key
els.btnToggleKey.addEventListener('click', () => {
  const input = els.inputApiKey;
  input.type = input.type === 'password' ? 'text' : 'password';
});

// 保存 API Key
els.btnSaveKey.addEventListener('click', () => {
  const key = els.inputApiKey.value.trim();
  if (!key) {
    els.keyHint.textContent = '请输入 API Key';
    els.keyHint.className = 'setting-hint error';
    return;
  }
  chrome.storage.local.set({ minimaxApiKey: key }, () => {
    els.keyHint.textContent = '保存成功';
    els.keyHint.className = 'setting-hint success';
    setTimeout(() => {
      closeSettings();
      fetchMiniMaxData();
    }, 500);
  });
});

// 自动获取 API Key
els.btnAutoGetKey.addEventListener('click', async () => {
  els.btnAutoGetKey.disabled = true;
  els.btnAutoGetKey.textContent = '获取中...';
  els.keyHint.textContent = '';
  els.keyHint.className = 'setting-hint';

  try {
    // 获取 cookie
    const cookieResult = await sendMessage({ type: 'getMiniMaxCookies' });
    if (!cookieResult || cookieResult.error === 'NOT_LOGGED_IN') {
      els.keyHint.textContent = '未检测到登录状态，请先登录 MiniMax 平台';
      els.keyHint.className = 'setting-hint error';
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
      els.keyHint.textContent = '获取失败: ' + (tokenResult?.error || '未知错误');
      els.keyHint.className = 'setting-hint error';
      return;
    }

    const data = tokenResult.data;
    if (data?.base_resp?.status_code !== 0 || !data.tokens || data.tokens.length === 0) {
      els.keyHint.textContent = '未找到 CodingPlan API Key，请确认已开通套餐';
      els.keyHint.className = 'setting-hint error';
      return;
    }

    // 提取 complete_token
    const apiKey = data.tokens[0].complete_token;
    els.inputApiKey.value = apiKey;
    chrome.storage.local.set({ minimaxApiKey: apiKey }, () => {
      els.keyHint.textContent = '自动获取成功';
      els.keyHint.className = 'setting-hint success';
      setTimeout(() => {
        closeSettings();
        fetchMiniMaxData();
      }, 800);
    });
  } finally {
    els.btnAutoGetKey.disabled = false;
    els.btnAutoGetKey.textContent = '自动获取';
  }
});

// ========== 刷新 ==========
async function refreshAll() {
  if (isRefreshing) return;
  isRefreshing = true;
  els.btnRefresh.classList.add('loading');

  await Promise.all([fetchGLMData(), fetchMiniMaxData()]);

  isRefreshing = false;
  els.btnRefresh.classList.remove('loading');
  els.updateTime.textContent = '更新时间: ' + formatTime(Date.now());
  chrome.storage.local.set({ lastUpdateTime: Date.now() });
}

els.btnRefresh.addEventListener('click', refreshAll);

// ========== 初始化 ==========
async function init() {
  // 恢复上次 Tab
  const stored = await chrome.storage.local.get([
    'lastTab',
    'glmCache',
    'glmCacheTime',
    'minimaxCache',
    'minimaxCacheTime',
    'lastUpdateTime',
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
  if (stored.lastUpdateTime) {
    els.updateTime.textContent = '更新时间: ' + formatTime(stored.lastUpdateTime);
  }

  // 异步刷新
  refreshAll();
}

init();
