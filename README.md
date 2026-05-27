# CodingPlan 用量查询

一款 Chrome 浏览器扩展，用于快速查询智谱 GLM、MiniMax、DeepSeek 和 Xiaomi 编码套餐的用量和余额信息。

## 功能截图

| GLM 用量查询 | MiniMax 用量查询 | DeepSeek 用量查询 |
|:---:|:---:|:---:|
| ![GLM 用量查询](docs/img/GLM.jpg) | ![MiniMax 用量查询](docs/img/minimax.jpg) | ![DeepSeek 用量查询](docs/img/deepseek.jpg) |

| Xiaomi 用量查询 | 设置页面 |
|:---:|:---:|
| ![Xiaomi 用量查询](docs/img/xiaomi.jpg) | ![设置页面](docs/img/setting.jpg) |

## 功能特性

- **GLM 用量查询** — 实时查看 Tokens 消耗量和 MCP 工具调用次数，支持查看各工具（搜索、网页读取、深度阅读）的详细用量
- **MiniMax 用量查询** — 查看各模型的已用/总量/剩余额度，支持自动获取 API Key
- **DeepSeek 用量查询** — 查看账户余额、可用 Token 数、本月用量和花费，通过 Content Script 自动同步登录状态
- **Xiaomi 用量查询** — 查看月度用量和套餐总量，支持补偿额度显示，Service Worker 静默自动登录
- **用量预警提醒** — 设置多级阈值（默认 25%、50%、75%），用量超标时自动弹出桌面通知
- **后台预警监控** — Service Worker 定时检查各平台用量，后台超阈值时自动提醒
- **自动定时刷新** — 可配置 1~10 分钟间隔自动刷新数据
- **数据缓存** — 本地缓存上次查询结果，打开弹窗即可快速查看

## 安装方式

1. 下载或克隆本项目
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择 `chrome-extension` 目录

## 使用说明

### GLM

点击扩展图标，默认显示 GLM 面板。首次使用需登录 [智谱开放平台](https://bigmodel.cn)，扩展会自动读取登录状态获取用量数据。

### MiniMax

切换到 MiniMax 标签页。扩展会尝试自动获取 API Key；如未登录，可点击「前往设置」手动配置，或点击「自动获取」从 [MiniMax 平台](https://platform.minimaxi.com) 自动拉取。

### DeepSeek

切换到 DeepSeek 标签页。需先登录 [DeepSeek 开放平台](https://platform.deepseek.com)，扩展通过 Content Script 自动同步 Token 并查询用量。展示账户余额、可用 Token 数、本月用量及花费。

### Xiaomi

切换到 Xiaomi 标签页。需先登录 [Xiaomi AI 平台](https://platform.xiaomimimo.com)，扩展会自动读取 Cookie 查询用量。Token 过期时支持 Service Worker 静默自动登录（通过小米 SSO），展示月度用量、套餐总量和补偿额度。

### 设置

点击右上角齿轮图标可配置：

- **Minimax API Key** — 手动输入或自动获取
- **自动刷新** — 开启/关闭定时刷新及间隔时间
- **用量预警** — 开启/关闭预警通知及自定义阈值

## 项目结构

```
chrome-extension/
├── manifest.json              # 扩展配置（Manifest V3）
├── icons/                     # 扩展图标
├── content/
│   └── deepseek-content.js    # DeepSeek 内容脚本：Token 同步
├── background/
│   └── service-worker.js      # 后台服务：Cookie 获取、API 代理与预警监控
└── popup/
    ├── popup.html             # 弹窗页面
    ├── popup.css              # 样式
    └── popup.js               # 弹窗交互逻辑
```

## 权限说明

| 权限 | 用途 |
|------|------|
| `cookies` | 读取 bigmodel.cn、minimaxi.com、xiaomimimo.com 等平台的登录状态 |
| `storage` | 本地存储 API Key、缓存数据和用户设置 |
| `notifications` | 用量超过预警阈值时发送桌面通知 |
| `alarms` | 后台定时检查用量预警 |
| `scripting` | DeepSeek Content Script 注入 |

## 技术栈

- Chrome Extension Manifest V3
- 原生 JavaScript（无框架依赖）
- Service Worker 后台服务
