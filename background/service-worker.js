// CodingPlan 用量查询 - 后台服务
// 处理 cookie 获取和 API 代理请求

const API_TIMEOUT = 5000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    getGLMToken: handleGetGLMToken,
    fetchGLMUsage: handleFetchGLMUsage,
    getMiniMaxCookies: handleGetMiniMaxCookies,
    fetchMiniMaxToken: handleFetchMiniMaxToken,
    fetchMiniMaxUsage: handleFetchMiniMaxUsage,
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
