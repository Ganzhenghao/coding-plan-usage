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
