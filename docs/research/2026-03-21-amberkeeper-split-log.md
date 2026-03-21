# 2026-03-21 AmberKeeper Split Log

## 来源

- Source repository: `/Users/sunss/my-code/myAPP/anyChat`
- Source branch: `electron`
- Source base SHA: `bc2a96b33736672edf1256227a660011a9a3710e`
- Import target: `/Users/sunss/my-code/myAPP/amberkeeper`
- Import date: `2026-03-21`

## 导入方式

本次拆分使用的是 **当前 Electron 主线工作树快照导入**，而不是对 `anyChat` 历史做 `filter-repo` 或 subtree 改写。

这样做的理由：

- 当前 Electron 主线已经和 `anyChat` 的原始产品叙事明显分叉
- 需要一个干净的新仓来独立维护后续产品与发布
- 不需要把历史 Tauri/实验路径一并带入新仓的默认开发路径

## 本次导入内容

导入目录：

- `.github`
- `.agents`
- `scripts`
- `apps`
- `packages`
- `docs`
- 根级 workspace 配置与 README / AGENTS

显式排除目录：

- `.git`
- `.worktrees`
- `node_modules`
- `dist`
- `archive`
- `experiments`
- `conductor`

## 独立化后的首批改动

### 已完成

- 新仓初始化为 `main`
- 根工作区名称改为 `amberkeeper`
- 桌面 app package 名改为 `amberkeeper-desktop`
- workspace scope 从 `@anychat/*` 切换为 `@amberkeeper/*`
- renderer / preload / runtime 中的活跃品牌与 bridge 标识改为 `AmberKeeper` / `amberkeeper*`

### 首发兼容策略

为保证首版独立运行不打断已有本地数据，本次拆分刻意保留：

- legacy `userData` 根目录：`electron-chatgpt-capture`
- legacy session partitions：`persist:anychat-<provider>`
- legacy fallback env：`ANYCHAT_CAPTURE_DB_PATH`

同时新增：

- `AMBERKEEPER_CAPTURE_DB_PATH`
- `amberkeeperChatCapture`
- `amberkeeperPageNetworkRelay`

## 当前状态

AmberKeeper 已经具备独立仓库骨架、独立命名空间和独立品牌入口。后续仍需继续完成：

- 活跃架构文档切换
- GitHub 新仓远端配置
- 完整自动化验证
- 发布工作流与 release asset 的最终确认
