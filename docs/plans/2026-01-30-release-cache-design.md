# Release 构建缓存优化设计

## 目标
- 缩短多平台 release 构建时间，减少重复安装与编译。
- 保持发布流程与构建产物不变，仅增加缓存。

## 方案概述
- 在 release workflow 的 build job 中增加两类缓存：
  1) pnpm store cache：加速依赖安装。
  2) Rust cache：缓存 `~/.cargo` 与 `src-tauri/target`，提升增量编译速度。

## 实现要点
- 使用 `actions/cache@v4` 缓存 pnpm store，key 由 `pnpm-lock.yaml` 与 OS 组成。
- 使用 `Swatinem/rust-cache@v2` 缓存 Rust build artefacts，绑定 `src-tauri` 目录。
- 不改变平台矩阵、不修改发布逻辑。

## 验证策略
- 工作流改动无法本地自动化测试，需通过一次 PR 合并触发验证。
- 观察 Actions 中 build job 的 “Cache hit” 日志与时长变化。
