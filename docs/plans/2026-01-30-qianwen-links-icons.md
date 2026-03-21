# Qianwen 链接外部打开与图标获取优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 更新 Qwen 地址与图标兜底、修复自定义添加 logo 获取、让聊天链接在外部浏览器打开，并屏蔽左侧导航右键菜单。

**Architecture:** 统一图标候选生成并加入官方映射与多级兜底；Tauri 新窗口回调改为非 OAuth 外部打开 + 应用内拒绝；侧栏区域阻止默认右键菜单。

**Tech Stack:** React + Vite + Vitest + Tauri 2 + Rust

---

### Task 1: 图标候选生成与单测更新

**Files:**
- Modify: `src/lib/icon.ts`
- Test: `tests/unit/icon.test.ts`

**Step 1: 写失败用例（图标候选顺序与 qianwen 官方图标）**

```ts
it('should include official qianwen icon before generic fallbacks', () => {
  const candidates = getServiceIconCandidates('https://www.qianwen.com');
  expect(candidates[0]).toContain('alicdn.com');
});

it('should include origin favicon and ddg favicon as fallbacks', () => {
  const candidates = getServiceIconCandidates('https://example.com');
  expect(candidates.some((c) => c.endsWith('/favicon.ico'))).toBe(true);
  expect(candidates.some((c) => c.includes('icons.duckduckgo.com'))).toBe(true);
});
```

**Step 2: 运行测试确保失败**

Run: `pnpm vitest run tests/unit/icon.test.ts`
Expected: FAIL（候选顺序/兜底项缺失）

**Step 3: 最小实现候选列表逻辑**

```ts
const OFFICIAL_ICON_MAP: Record<string, string> = {
  'qianwen.com': 'https://img.alicdn.com/imgextra/i4/O1CN01uar8u91DHWktnF2fl_!!6000000000191-2-tps-110-110.png',
};

function buildOriginFavicon(url: string): string {
  return `${new URL(url).origin}/favicon.ico`;
}

function buildDuckDuckGoFavicon(url: string): string {
  const host = new URL(url).hostname;
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}
```

候选顺序：显式 iconUrl → 官方映射 → origin/favicon.ico → DuckDuckGo favicon。

**Step 4: 运行测试确保通过**

Run: `pnpm vitest run tests/unit/icon.test.ts`
Expected: PASS

**Step 5: 必要重构**
- 清理重复候选与非法 URL 处理。

---

### Task 2: Qwen 地址与配置同步

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src-tauri/capabilities/remote-access.json`
- Modify: `src-tauri/src/lib.rs`

**Step 1: 写失败用例（Rust 新 URL selector 可选）**
如无现成测试覆盖 selector，可在实现后手动验证；不新增 selector 测试时需记录原因。

**Step 2: 更新内置服务配置**

```ts
{
  id: 'qwen',
  name: '通义千问',
  url: 'https://www.qianwen.com',
  iconUrl: 'https://img.alicdn.com/imgextra/i4/O1CN01uar8u91DHWktnF2fl_!!6000000000191-2-tps-110-110.png',
  ...
}
```

**Step 3: 允许远程 IPC 域名**

在 `remote-access.json` 的 `urls` 中添加：
```
"https://www.qianwen.com/*"
```
可保留 `https://chat.qwen.ai/*` 兼容旧入口。

**Step 4: DOM 兜底选择器**

在 `CHAT_SELECTORS` 中新增 `qianwen.com`（可与旧 qwen 选择器相同）。

**Step 5: 运行相关测试**

Run: `pnpm vitest run tests/unit/icon.test.ts`
Expected: PASS

---

### Task 3: 链接外部打开（Tauri 新窗口行为）

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/lib.rs` (unit tests)

**Step 1: 写失败用例（更新 new window 判定）**

```rust
#[test]
fn denies_new_window_for_non_auth_domains() {
    assert!(!should_allow_new_window("https://example.com"));
}
```

**Step 2: 运行测试确保失败**

Run: `cargo test`
Expected: FAIL（当前非 auth 仍允许新窗口）

**Step 3: 最小实现**
- 将 `should_allow_new_window` 调整为只允许 auth 弹窗。
- 在 `on_new_window` 中对非 auth：
  - 调用 `app_handle.opener().open_url(url.to_string(), None::<String>)`
  - 返回 `Deny`

**Step 4: 运行测试确保通过**

Run: `cargo test`
Expected: PASS

**Step 5: 去重与封装**
- 抽取 `handle_external_new_window` 辅助函数，复用在两个 `on_new_window` 回调。

---

### Task 4: 屏蔽左侧导航右键菜单

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: 写失败用例（可选）**
如无 UI 测试框架覆盖右键行为，可记录为手动验证。

**Step 2: 最小实现**

在侧栏根容器添加：
```tsx
onContextMenu={(e) => e.preventDefault()}
```

**Step 3: 手动验证**
- 右键左侧导航区域不再弹出默认菜单。

---

### Task 5: 验证与收尾

**Step 1: 运行前端单测**
Run: `pnpm vitest run`
Expected: PASS（允许已有 stderr）

**Step 2: 运行 Rust 单测**
Run: `cargo test`
Expected: PASS

**Step 3: 手动验证**
- 添加 `https://www.qianwen.com`，logo 预览显示官方图标。
- 对话内容点击链接在外部浏览器打开。
- 左侧导航右键无默认菜单。

**Step 4: 提交**
```bash
git add src/lib/icon.ts tests/unit/icon.test.ts src/types/index.ts \
  src-tauri/capabilities/remote-access.json src-tauri/src/lib.rs \
  src/components/Sidebar.tsx

git commit -m "feat: update qianwen url, icons, and external link handling"
```

