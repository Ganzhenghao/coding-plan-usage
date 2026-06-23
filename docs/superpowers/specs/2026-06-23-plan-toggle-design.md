# 套餐启用开关 — 设计文档

> 日期:2026-06-23
> 状态:已与用户确认设计,待写实现计划

## 1. 概述

在 popup 和 sidepanel 的设置抽屉中,新增「套餐启用」开关,允许用户逐个启停 GLM / MiniMax / DeepSeek / Xiaomi 四个编码套餐。默认全部启用;关闭某平台后,**主界面不再展示该平台信息,同时停止该平台的所有网络请求(前端主动刷新 + 后台预警监控)**,实现「完全停用」。

控制粒度为独立开关(4 个独立 toggle),不做总开关。

## 2. 目标与非目标

**目标**

- 设置抽屉新增「套餐启用」分组,4 个平台各自独立开关,默认全开。
- 关闭某平台后:UI 隐藏(popup 的 Tab + Panel;sidepanel 的卡片)。
- 关闭某平台后:前端 `refreshAll` 跳过该平台,后台 `checkUsageAlarm` 跳过该平台(不发请求、不更新缓存、不参与预警)。
- 设置改动实时生效,通过 `storage.onChanged` 跨 popup / sidepanel 同步。
- 关闭当前正在查看的平台时,自动跳转到第一个仍启用的平台。
- 全部关闭时显示空状态提示。

**非目标**

- 不改 manifest(无新权限)。
- 不改 content script。
- 不清理已禁用平台的缓存数据或 `notifiedAlerts`(保留无副作用,重新启用可立即显示旧缓存)。
- 不联动隐藏 MiniMax API Key 输入框(用户可能想先配 Key 再启用)。
- 不加「一键全开/全关」按钮,4 个独立开关已足够。
- 不为禁用平台显示灰色占位 Tab,直接隐藏。

## 3. 数据模型与存储

### 3.1 新增 storage key

```
enabledPlans: {
  glm: true,
  minimax: true,
  deepseek: true,
  xiaomi: true,
}
```

聚合为单个对象,而非 4 个独立布尔键。理由:

- popup / sidepanel / service-worker 三处都要读,单次 `chrome.storage.local.get('enabledPlans')` 即可,减少往返。
- `storage.onChanged` 监听只需判断 `changes.enabledPlans` 一处,UI 同步逻辑集中。
- 新增平台时扩展一个字段即可,无需新增监听分支。

### 3.2 默认全开策略

首次读取时若 `enabledPlans` 不存在,**不写回 storage**,仅在内存中按 `{glm:true, minimax:true, deepseek:true, xiaomi:true}` 处理。仅在用户实际改动开关时才落盘。与现有 `lastTab` / `alertEnabled` 等键的延迟写入策略一致。

### 3.3 平台标识常量

各文件顶部收敛一个常量数组,避免散落的硬编码:

```js
const PLAN_KEYS = ['glm', 'minimax', 'deepseek', 'xiaomi'];
```

所有「遍历平台」的逻辑(初始化、刷新、监听同步)均基于此数组。

### 3.4 启用判断辅助函数

```js
function isPlanEnabled(enabledPlans, key) {
  return enabledPlans?.[key] !== false; // undefined 时视为启用(默认全开)
}
```

用 `!== false` 而非 `=== true`,兼容「storage 中无此 key」的初始情况。三个执行环境(popup.js / sidepanel.js / service-worker.js)各自定义一份,因为是独立的执行上下文。

## 4. UI 控件设计

### 4.1 设置抽屉新增分组

在 popup 和 sidepanel 两套设置抽屉的**最顶部**(MiniMax API Key 之前)新增「套餐启用」分组。放在顶部因为它是更上层的全局控制,关闭某平台后下方相关设置才有上下文意义。

呈现(每行:左对齐平台名,右对齐 toggle 开关):

```
设置
─────────────────────
套餐启用
  GLM        [开关 ●]
  MiniMax    [开关 ●]
  DeepSeek   [开关 ●]
  Xiaomi     [开关 ●]

MiniMax API Key
  ...
```

复用现有 `.toggle`(popup) / `.sb-switch`(sidepanel)组件,样式零新增。

### 4.2 行为联动

**切换开关时(实时生效,无需点保存):**

1. 立即写入 `enabledPlans` 到 storage。
2. 主界面立即响应(popup:隐藏/显示对应 Tab + Panel;sidepanel:隐藏/显示对应卡片)。

**关闭当前正在查看的平台时(自动跳转策略):**

- popup:关闭当前 Tab → 自动切换到 `PLAN_KEYS` 中第一个仍启用的平台。
- sidepanel:卡片无「当前选中」概念,直接隐藏即可。

**边缘情况 — 全部关闭:**

保留当前选中态但所有 panel 都隐藏,显示空状态提示「所有套餐已禁用,请在设置中启用至少一个套餐」。比让用户对着 4 个不存在的 Tab 茫然要好。

**打开设置时:**

从 storage 读取 `enabledPlans`,回填 4 个开关状态(与现有回填 API Key、预警阈值的 `openSettings()` 逻辑一致)。

## 5. 数据获取层停用

### 5.1 前端主动刷新(popup + sidepanel)

现有 `refreshAll()` 硬编码 `Promise.all([fetchGLM(), fetchMinimax(), ...])`。改为基于 `PLAN_KEYS` + `fetchFnMap` 过滤:

```js
async function refreshAll() {
  const { enabledPlans } = await chrome.storage.local.get('enabledPlans');
  const plans = PLAN_KEYS.filter((k) => isPlanEnabled(enabledPlans, k));
  await Promise.all(plans.map((k) => fetchFnMap[k]()));
}
```

只对启用的平台发请求。

**职责划分:`fetchXxx` 内部不读 `enabledPlans`,由 `refreshAll` 在调用层统一过滤。** 这样函数职责清晰 —— fetch 函数只管「如何获取」,启用判断由调用方负责,避免每个 fetch 函数开头都加判断。

**Tab 切换 / 卡片重试场景**:用户点 Tab 或点「重试」按钮时,目标平台必然是已启用的(因为禁用的 Tab / 卡片根本不显示),所以 `fetchXxx` 单独调用无需判断。

### 5.2 后台定时预警监控(service-worker)

现有 `checkUsageAlarm()` 中 GLM / MiniMax / DeepSeek / Xiaomi 四段顺序执行。改为每段入口加 `isPlanEnabled` 判断:

```js
const { enabledPlans } = await chrome.storage.local.get('enabledPlans');
if (isPlanEnabled(enabledPlans, 'glm')) { /* GLM 段,逻辑不变 */ }
if (isPlanEnabled(enabledPlans, 'minimax')) { /* MiniMax 段,逻辑不变 */ }
if (isPlanEnabled(enabledPlans, 'deepseek')) { /* DeepSeek 段,逻辑不变 */ }
if (isPlanEnabled(enabledPlans, 'xiaomi')) { /* Xiaomi 段,逻辑不变 */ }
```

用 `if` 包住原有逻辑块,不改内部细节。禁用平台既不发请求也不更新缓存、不参与预警。

service-worker 的 `storage.onChanged` 不需要扩展 —— 后台 `checkUsageAlarm` 每次执行时读最新 `enabledPlans` 即可(已有 alarm 定时触发机制)。

## 6. UI 渲染层与初始化

### 6.1 启动时过滤渲染

**popup `init()`:**

- 读取 `enabledPlans`,根据启用状态设置 Tab 和 Panel 的显隐。
- 若 `lastTab` 对应的平台已禁用 → 落到第一个启用的平台。
- 全关闭 → 显示空状态容器,隐藏所有 Panel 和 Tab。

**sidepanel `init()`:**

- 读取 `enabledPlans`,根据启用状态设置每个卡片的显隐(`sb-card` 的 `display`)。
- 缓存渲染逻辑不变,但禁用平台的卡片直接 `display:none`,不再渲染缓存。

### 6.2 空状态容器

**popup**(放在 `.tabs` 之后、所有 panel 之前):

```html
<div id="emptyPlans" class="empty-plans" style="display:none">
  <p>所有套餐已禁用</p>
  <p class="empty-hint">请在设置中启用至少一个套餐</p>
  <button id="emptyOpenSettingsBtn" class="primary-btn">打开设置</button>
</div>
```

**sidepanel**(放在 `.sb-cards` 内部顶部):

```html
<div id="sbEmptyPlans" class="sb-empty-plans" style="display:none">
  <p>所有套餐已禁用</p>
  <p class="sb-empty-hint">请在设置中启用至少一个套餐</p>
</div>
```

sidepanel 不放「打开设置」按钮 —— 设置按钮就在 header 上,且 sidepanel 常驻可见,放按钮冗余。popup 则是临时弹窗,加按钮更顺手。

### 6.3 storage.onChanged 实时同步

popup 和 sidepanel 都已有 `storage.onChanged` 监听,扩展它:

```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.enabledPlans) return;
  applyEnabledPlans(changes.enabledPlans.newValue);
});
```

`applyEnabledPlans()` 做三件事:

1. 显隐每个 Tab / 卡片。
2. 若当前选中的平台被关闭 → 跳到第一个启用项。
3. 全关闭 → 显示空状态;否则隐藏空状态。

这样无论用户在 popup、sidepanel 还是另一端改了设置,所有打开的界面都即时同步。

## 7. 改动范围汇总

| 文件 | 改动 |
|---|---|
| `popup/popup.html` | 新增「套餐启用」分组(顶部)、空状态容器 |
| `popup/popup.js` | 新增 `PLAN_KEYS`、`isPlanEnabled`、`applyEnabledPlans`、4 个开关事件、`refreshAll` 过滤、`init` 过滤、`storage.onChanged` 同步 |
| `sidepanel/sidepanel.html` | 新增「套餐启用」分组(顶部)、空状态容器 |
| `sidepanel/sidepanel.js` | 同 popup.js 对应改动,扩展已有 `storage.onChanged` 监听 |
| `background/service-worker.js` | `checkUsageAlarm` 四段加 `isPlanEnabled` 判断、新增 `isPlanEnabled` 辅助函数 |
| `popup/popup.css` | 新增 `.empty-plans` / `.empty-hint` 样式 |
| `sidepanel/sidepanel.css` | 新增 `.sb-empty-plans` / `.sb-empty-hint` 样式 |

无需改动:manifest.json(无新权限)、content script。

## 8. 边界情况处理

1. **全关闭后再打开某一个**:`applyEnabledPlans` 检测到「从全关 → 有启用」,自动选中新打开的第一个平台,移除空状态。
2. **MiniMax 关闭但 API Key 设置仍在**:API Key 输入框不联动隐藏 —— 用户可能想先配置好 Key 再启用,保留不造成困扰。
3. **缓存数据保留**:禁用某平台不清理它的 `glmCache` 等缓存键。重新启用后能立即显示旧缓存,体验更连贯。
4. **`notifiedAlerts` 不清理**:禁用平台后,该平台相关的已通知记录保留无害(下次启用重新触发需用量再次达阈值)。避免引入清理时序的复杂性。
5. **`lastTab` 持久化**:关闭当前 Tab 时,`switchTab` 会写入新的 `lastTab`,所以下次打开不会落到已禁用的平台。
