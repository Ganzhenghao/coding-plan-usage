// DeepSeek Token 同步脚本
// 从 platform.deepseek.com 的 localStorage 读取 userToken 并同步到 chrome.storage.local

(function () {
  // 从 localStorage 提取 token（userToken 存储格式为 {"value":"xxx","__version":"0"}）
  function extractToken() {
    const raw = localStorage.getItem('userToken');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed.value || null;
    } catch {
      return raw;
    }
  }

  // 同步 token 到 chrome.storage.local
  function syncToken() {
    const token = extractToken();
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
      sendResponse({ token: extractToken() });
      return true;
    }
  });
})();
