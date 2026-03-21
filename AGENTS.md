# AnyChat (Electron Mainline)

本分支用于管理和维护基于 **Electron** 的多 AI Chat 聚合主线，并同步必要的上游变更以保持可扩展和可维护。

## 分支说明

- **main**: 稳定/主开发分支，保留历史主线与通用改动。
- **tauri**: 历史技术攻关分支，聚焦 MITM 代理与 CSP 绕过实验。
- **electron**: 当前 Electron 正式主线分支，承载 Electron 方案演进、实验收敛与 provider 扩展。

## 分支定位

- **状态**: `Active`
- **目标**: 作为 Electron 正式主线持续推进，围绕 capture、cache、restart persistence 和后续 provider 扩展进行演进。

## 方案原理

使用 Electron 的成熟架构解决外部站点数据捕获问题：

- **核心组件**: 使用 `<webview>` 标签承载 AI 站点。
- **数据注入**: 通过 `preload` 脚本注入拦截逻辑。
- **CSP 绕过**: 利用 `session.webRequest.onHeadersReceived` 动态剥离 `Content-Security-Policy` 响应头。
- **数据传输**: 使用 `ipcRenderer.sendToHost()` 将捕获的聊天数据传回主进程或宿主页面。

## 主要参考资料

- [Ferdium](https://github.com/ferdium/ferdium-app) - 成熟的 Electron 多服务聚合器实现参考
- [Electron webview tag](https://www.electronjs.org/docs/latest/api/webview-tag) - 官方文档
- [Electron session API](https://www.electronjs.org/docs/latest/api/session) - 网络请求控制

## 关键文档索引

- 技术调研: `.sisyphus/plans/003-plan-b-electron.md`
- 历史研究报告: `docs/research/data-capture-implementation-report.md`
- Gemini 研究报告: `docs/research/2026-01-20 研究报告gemini.md`
- 任务跟踪记录: `docs/plans/2026-01-28-anychat-triage.md`

---

_详细信息请参阅文档索引中的具体文档_
