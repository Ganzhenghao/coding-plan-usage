// Volcengine 用量查询脚本
// 在 console.volcengine.com 页面上下文里执行 fetch —— 火山方舟的 csrfToken
// 是 partitioned cookie,扩展 service worker 跨站请求拿不到,只能在页面
// first-party 上下文里发起请求才能带上正确的 cookie。

(function () {
  const API_TIMEOUT = 5000;

  // 从 document.cookie 读 csrfToken(页面 first-party 能读到 partitioned cookie)
  function readCsrfToken() {
    const m = document.cookie.match(/csrfToken=([^;]+)/);
    return m ? m[1] : '';
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== 'fetchVolcengineUsageFromPage') return;

    (async () => {
      const csrf = readCsrfToken();
      if (!csrf) {
        sendResponse({ error: 'LOGIN_REQUIRED' });
        return;
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
              'x-csrf-token': csrf,
            },
            body: '{}',
            credentials: 'include',
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (resp.status === 401 || resp.status === 403) {
          sendResponse({ error: 'LOGIN_REQUIRED' });
          return;
        }

        const raw = await resp.json();
        if (raw?.ResponseMetadata?.Error) {
          sendResponse({ error: 'LOGIN_REQUIRED' });
          return;
        }

        const result = raw?.Result;
        if (!result || !Array.isArray(result.QuotaUsage)) {
          sendResponse({ error: 'BAD_FORMAT' });
          return;
        }

        const quotas = result.QuotaUsage
          .filter((q) => q && typeof q.Level === 'string')
          .map((q) => ({
            level: q.Level,
            percent: typeof q.Percent === 'number' ? q.Percent : 0,
            resetAt: typeof q.ResetTimestamp === 'number' ? q.ResetTimestamp : 0,
          }));

        sendResponse({
          data: {
            status: result.Status || 'Unknown',
            updatedAt: result.UpdateTimestamp || 0,
            quotas,
          },
        });
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          sendResponse({ error: 'TIMEOUT' });
        } else {
          sendResponse({ error: 'NETWORK', message: err.message });
        }
      }
    })();

    return true; // 异步 sendResponse
  });
})();
