# Release 构建缓存优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 release build job 增加 pnpm 与 Rust 缓存，缩短多平台构建时间。

**Architecture:** 在 release workflow 的 build job 中增加 pnpm store cache 与 rust-cache，不改变构建矩阵与发布逻辑。

**Tech Stack:** GitHub Actions, pnpm, rust-cache

---

### Task 1: 增加 pnpm store 缓存

**Files:**
- Modify: `.github/workflows/release.yml`

**Step 1: 写“失败用例”说明（workflow 配置无法自动化 TDD）**

记录：workflow 变更无法在本地自动化测试，需通过 PR 合并行为验证（已取得用户许可）。

**Step 2: 添加 pnpm store cache**

在 build job 中 `Setup Node` 之后插入：
```yaml
      - name: Get pnpm store path
        id: pnpm-store
        run: echo "STORE_PATH=$(pnpm store path --silent)" >> "$GITHUB_OUTPUT"

      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-store.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-
```

**Step 3: Commit**
```bash
git add .github/workflows/release.yml

git commit -m "ci: add pnpm cache to release build"
```

---

### Task 2: 增加 Rust 编译缓存

**Files:**
- Modify: `.github/workflows/release.yml`

**Step 1: 添加 rust-cache**

在 build job 中 pnpm cache 之后插入：
```yaml
      - name: Cache Rust
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: "src-tauri -> target"
```

**Step 2: Commit**
```bash
git add .github/workflows/release.yml

git commit -m "ci: add rust cache to release build"
```

---

### Task 3: 验证与手动测试

**Step 1: 静态检查**
Run: `yq` / `yamllint`（如仓库存在）或手动检查 YAML 语法。

**Step 2: 手动验证**
- 合并 dev → main 的 PR
- 观察 Actions build job 日志中 cache hit 与耗时下降

