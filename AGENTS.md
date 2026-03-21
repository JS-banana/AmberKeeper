# AmberKeeper

本仓库用于独立维护基于 **Electron** 的多 AI provider 对话采集与管理桌面主线。

## 仓库定位

- **状态**: `Active`
- **目标**: 作为 AmberKeeper 正式主仓持续推进，围绕 capture、cache、restart persistence、provider 扩展和独立发布进行演进。

## 历史来源

- 当前代码基线来源于 `anyChat` 的 `electron` 主线
- AmberKeeper 作为拆分后的独立仓库继续维护
- 历史研究与架构文档仍保留在 `docs/` 中作为迁移参考

## 方案原理

使用 Electron 的成熟架构解决外部站点数据捕获问题：

- **核心组件**: 使用原生 `WebContentsView` 承载 AI 站点
- **数据注入**: 通过 `preload` 脚本注入拦截逻辑
- **CSP 绕过**: 利用 `session.webRequest.onHeadersReceived` 动态剥离 `Content-Security-Policy` 响应头
- **数据传输**: 通过 bridge 和 IPC 将捕获的聊天数据传回主进程与桌面工作台

## 主要参考资料

- [Ferdium](https://github.com/ferdium/ferdium-app) - 成熟的 Electron 多服务聚合器实现参考
- [Electron webview tag](https://www.electronjs.org/docs/latest/api/webview-tag) - 官方文档
- [Electron session API](https://www.electronjs.org/docs/latest/api/session) - 网络请求控制

## 关键文档索引

- 仓库拆分计划: `docs/plans/2026-03-21-amberkeeper-repo-split-plan.md`
- Electron 主线重构计划: `docs/plans/2026-03-19-electron-mainline-refactor-plan.md`
- Electron 主线架构设计: `docs/plans/2026-03-19-electron-mainline-architecture-design.md`
- 架构总览: `docs/architecture/electron-mainline-overview.md`
- 历史研究日志: 见 `docs/research/`

---

_详细信息请优先参阅 `docs/` 中的当前架构与迁移文档。_
