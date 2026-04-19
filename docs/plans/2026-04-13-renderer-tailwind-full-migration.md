# AmberKeeper Renderer 全量 Tailwind 迁移实施方案

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 AmberKeeper renderer 内部 UI 全量迁移到 TailwindCSS，消除所有 legacy BEM class 依赖。

**Architecture:** 按"依赖根优先"顺序分阶段 cutover：先提交未提交功能并清理死代码，再迁移结构根（shell + sidebar + ProviderIcon），然后迁移 archive 子系统（conversation list + message pane），最后处理 diagnostics 独立子系统。每个 Phase 结束后删除对应 legacy CSS 块，逐步收敛 `styles.css`。

**Tech Stack:** Tailwind CSS 3.4 (已安装), shadcn/ui 组件 (已有 8 个), lucide-react, Recharts 2, class-variance-authority, clsx, tailwind-merge

---

## 最终目标定义

- 迁移对象是 **renderer 内部 UI**（app shell、左侧 rail、utility workbench、settings、library/archive、diagnostics、about），不包括 native stage 承载的 provider 页面
- 终局是 **full Tailwind**：业务组件不再依赖 legacy BEM class（`.product-*`, `.workspace-*`, `.message-pane__*` 等）
- `styles.css` 最终仅保留：Tailwind 指令、design tokens（`@layer base`）、base/reset、必要兼容样式
- 不再新增 legacy business CSS
- full Tailwind 不等于零 CSS — 少量全局 reset 和难以 Tailwind 表达的系统级样式允许保留

---

## 当前状态校准

### 已迁移到 Tailwind 的面（~20-25%）

- `pages/SettingsPage.tsx` — 完整 Tailwind + shadcn
- `pages/AboutPage.tsx` — 完整 Tailwind + shadcn
- `pages/LibraryPage.tsx` — 总览区域（KPI cards, charts, data ops）已 Tailwind，但外层 layout 和 per-provider detail 仍 legacy
- `components/library/CaptureTrendChart.tsx` — Tailwind + Recharts
- `components/library/ProviderShareChart.tsx` — Tailwind + Recharts
- `App.tsx` UtilityWorkbench 导航 — 内部 nav 已 Tailwind，外层 section 仍 legacy
- `components/ui/*` — 8 个 shadcn 组件（Button, Card, Select, Switch, Tooltip, Chart, Section, IconButton）

### 仍重度依赖 legacy CSS 的面（~75%）

- `App.tsx` — `.product-shell`, `.product-main`, `.utility-workbench`, `.native-stage-shell`
- `components/AppSidebar.tsx` — `.product-rail`, `.rail-button` 系统（~200 行 CSS）
- `components/ProviderIcon.tsx` — `.provider-icon` BEM 系统（~80 行 CSS），被 4 个组件使用
- `components/ConversationList.tsx` — `.workspace-card`, `.conversation-list`, `.conversation-item`
- `components/ConversationMessagePane.tsx` — `.message-pane__*`, `.message-bubble`, 且有 4 个 CSS class 缺失（`.secondary-icon-button`, `.field-select`, `.button-icon`, 已视觉回归）
- `pages/DiagnosticsPage.tsx` + 4 个子组件 — `.diagnostics-page`, `.panel-card`, `.status-grid` 等

### 已有基础设施

- `tailwind.config.ts` — amber 主题 tokens
- `lib/cn.ts` — `twMerge(clsx(...))`
- `class-variance-authority` — 变体管理
- `lucide-react` — 图标库
- `@radix-ui/react-{select,switch,tooltip}` — Radix primitives
- `recharts` — 图表（已在用）
- `@/*` path alias — 已配置

### 已确认的死代码

- `pages/ChatPage.tsx` — 未被 App.tsx 导入
- `pages/WorkspacePage.tsx` — 未被 App.tsx 导入
- `components/ProviderRail.tsx` — 仅被 WorkspacePage 导入
- `styles.css` 中 ~400-500 行 CSS 无任何 TSX 引用

### 验证链路

仓库实际可用的验证命令：
- `pnpm desktop:test` — 测试套件
- `pnpm --dir apps/desktop exec tsc --noEmit` — 类型检查
- `pnpm desktop:build` — 完整构建
- `pnpm dev` — 开发模式视觉验证

不假设有 lint、formatting、design audit pipeline。

### 需校准的测试断言

以下测试断言锁定了当前 CSS class，迁移对应组件时必须同步更新：

| 测试文件 | 断言 | 迁移时机 |
|---------|------|---------|
| `App.test.tsx:108` | `.toHaveClass('utility-workbench--sidebar')` | Phase 1 |
| `ConversationList.test.tsx:37` | `.toHaveClass('conversation-list--scroll')` | Phase 2 |
| `ConversationList.test.tsx:42` | `.toHaveClass('active')` | Phase 2 |
| `ConversationMessagePane.test.tsx:44-47` | `getByRole('option')` + `getByRole('combobox')` — 依赖原生 `<select>` | Phase 2（若改用 Radix Select）|

---

## Phase 0: 基线建立

### Task 1: 提交未提交的功能

**Files:**
- Modify (staged): 12 个已修改文件 + 1 个新文件（见下方列表）

**Step 1: 运行测试确认基线**

Run:
```bash
pnpm desktop:test
```
Expected: 全部通过

**Step 2: 类型检查**

Run:
```bash
pnpm --dir apps/desktop exec tsc --noEmit
```
Expected: 无错误

**Step 3: 提交**

```bash
git add packages/shared-types/src/capture-types.ts apps/desktop/src/main/storage/schema.ts apps/desktop/src/main/storage/provider-settings-repository.ts apps/desktop/src/main/storage/app-settings-repository.ts apps/desktop/src/main/storage/capture-store.ts apps/desktop/src/main/ipc/capture-ipc.ts apps/desktop/src/main/index.ts apps/desktop/src/preload/renderer.ts apps/desktop/src/renderer/src/global.d.ts apps/desktop/src/renderer/src/stores/workspace-store.ts apps/desktop/src/renderer/src/components/AppSidebar.tsx apps/desktop/src/renderer/src/components/AppSidebar.test.tsx apps/desktop/tests/provider-runtime-registry.test.ts
git commit -m "feat: add provider cache toggle, interface language selector, and app version display"
```

**Step 4: 提交辅助文件**

```bash
git add docs/plans/2026-04-12-claude-settings-ui-plan-feedback.md docs/plans/2026-04-13-codex-tailwind-full-migration-feedback.md skills-lock.json
git commit -m "docs: add settings UI plan feedback and codex migration feedback"
```

---

### Task 2: 删除死代码组件

**Files:**
- Delete: `apps/desktop/src/renderer/src/pages/ChatPage.tsx`
- Delete: `apps/desktop/src/renderer/src/pages/WorkspacePage.tsx`
- Delete: `apps/desktop/src/renderer/src/components/ProviderRail.tsx`

**Step 1: 确认组件未被导入**

Run:
```bash
grep -r "ChatPage\|WorkspacePage\|ProviderRail" apps/desktop/src/renderer/src/ --include="*.tsx" --include="*.ts" -l
```
Expected: 只列出被删文件自身和（对 ProviderRail）WorkspacePage.tsx

**Step 2: 删除文件**

```bash
rm apps/desktop/src/renderer/src/pages/ChatPage.tsx
rm apps/desktop/src/renderer/src/pages/WorkspacePage.tsx
rm apps/desktop/src/renderer/src/components/ProviderRail.tsx
```

**Step 3: 运行测试确认无影响**

Run:
```bash
pnpm desktop:test
```
Expected: 全部通过

**Step 4: 提交**

```bash
git add -A apps/desktop/src/renderer/src/pages/ChatPage.tsx apps/desktop/src/renderer/src/pages/WorkspacePage.tsx apps/desktop/src/renderer/src/components/ProviderRail.tsx
git commit -m "refactor: remove dead components (ChatPage, WorkspacePage, ProviderRail)"
```

---

### Task 3: 删除死 CSS

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: 删除以下 CSS 块**

从 `styles.css` 中删除以下无 TSX 引用的 class（删除前先 grep 确认每个 class 在 TSX 中的引用数为 0）:

- `.app-shell` 及 `::before` (line ~771-787)
- `.shell-sidebar` (line ~789-798)
- `.shell-header` (line ~801-809)
- `.shell-kicker` (line ~811-818)
- `.shell-title` (line ~820-825)
- `.surface-switcher`, `.surface-button` 及变体 (line ~827-855)
- `.shell-panel` (line ~857-860)
- `.workspace-page` 及 background (line ~862-874 中 `.workspace-page` 部分)
- `.native-stage`, `.native-stage__overlay`, `.native-stage__eyebrow` 及子规则 (line ~884-934)
- `.stage-placeholder` 及所有子元素 (line ~367-426)
- `.product-panel` (line ~307-317)
- `.page-header`, `.page-copy`, `.eyebrow` 及变体 (line ~936-984)
- `.workspace-grid--providers`, `.workspace-grid--conversations`, `.workspace-card--focus`, `.workspace-card--rail`, `.workspace-card--summary` (仅 WorkspacePage 用到的子 class)
- `.provider-item` 及所有子 class `.provider-item__*`, `.provider-summary`, `.provider-summary__*` (line ~1289-1401，仅 ProviderRail 用到)
- `.service-list` 及子规则 (line ~1206-1228)
- `.workspace-copy`, `.workspace-alert`, `.workspace-tags` (line ~1229-1241, 1640-1653)
- `.stage-placeholder__eyebrow` 引用 (已在 .stage-placeholder 块中删除)
- 死代码对应的 media queries（`.app-shell`, `.shell-sidebar`, `.shell-header`, `.native-stage`, `.workspace-grid`, `.workspace-card--focus`, `.service-list li`, `.provider-item` 在 media 块中的引用）

**不删除**:
- `.chat-overview*` — 虽然 ChatPage 删了，但 `.chat-overview__eyebrow` 和 `.utility-page__eyebrow` 在同一规则中，需单独处理
- `.workspace-card`, `.workspace-card--sessions`, `.workspace-card--messages` — ConversationList 和 ConversationMessagePane 仍在用
- `.workspace-empty` — 被 ConversationList 和 ConversationMessagePane 使用

**Step 2: 删除 `.chat-overview*` 块**

先确认：
```bash
grep -r "chat-overview" apps/desktop/src/renderer/src/ --include="*.tsx" --include="*.ts"
```
Expected: 无结果（ChatPage 已删除）。如果确认为 0，删除所有 `.chat-overview*` CSS。同时将 `.utility-page__eyebrow` 规则从合并选择器中独立出来（如果仍被使用）或一并删除。

**Step 3: 运行测试 + 视觉检查**

Run:
```bash
pnpm desktop:test && pnpm --dir apps/desktop exec tsc --noEmit
```
Expected: 全部通过

Run `pnpm dev`，检查 Settings / Library / About / Diagnostics 页面无视觉变化。

**Step 4: 提交**

```bash
git add apps/desktop/src/renderer/src/styles.css
git commit -m "style: remove ~450 lines of dead CSS (deleted components and unreferenced classes)"
```

---

## Phase 1: 结构根迁移（Shell + AppSidebar + ProviderIcon）

> **Styling migration only.** 本 Phase 不做信息架构调整，不改变组件的行为和交互逻辑，只替换 CSS class 为 Tailwind。

### Task 4: App Shell 布局迁移

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx` (更新 class 断言)
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: 迁移 App.tsx 中的 legacy class**

替换规则：
- `product-shell product-shell--chat` → `grid h-screen min-h-screen overflow-hidden bg-white` + `grid-cols-[66px_minmax(0,1fr)]`
- `product-shell product-shell--utility` → 同上（目前两者 grid-template-columns 相同）
- `product-main product-main--stage` → `relative min-w-0 min-h-screen p-0 overflow-hidden`
- `product-main product-main--utility` → `flex flex-col min-w-0 min-h-screen overflow-hidden p-0`
- `native-stage-shell` → `min-h-screen`
- `utility-workbench` + `utility-workbench--sidebar` → `flex items-stretch flex-1 min-h-0`
- `utility-workbench--library` → 不需要特殊 class（当前 CSS 为空规则）
- `utility-workbench__body` → `flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden px-4 py-6 bg-white`
- `utility-workbench__body--library` → 无特殊 CSS（如果有，保留）

使用 `cn()` 处理条件 class。

**Step 2: 更新 App.test.tsx**

修改 line 108 的断言：
```tsx
// Before:
expect(nav.closest('.utility-workbench')).toHaveClass('utility-workbench--sidebar');
// After: 改为断言 data-testid 或直接断言 nav 存在于 section 内
expect(nav.closest('section')).toBeInTheDocument();
```

**Step 3: 删除 styles.css 中对应 CSS**

删除：
- `:root` 中的 `--product-rail-width` 变量（改用 Tailwind `w-[66px]` + `grid-cols-[66px_...]`）
- `.product-shell*` (~15 行)
- `.product-main*` (~15 行)
- `.utility-workbench*` (~25 行)
- `.native-stage-shell` (~3 行)
- `.product-main--stage` (~5 行)
- 相关 media query 中的 `.product-shell--chat`, `.product-main` 响应式规则

**Step 4: 验证**

Run:
```bash
pnpm desktop:test && pnpm --dir apps/desktop exec tsc --noEmit
```
Expected: 全部通过

Run `pnpm dev`，验证：
- chat 模式下 native stage 占满右侧
- utility 模式下左侧导航 + 右侧内容正常
- 窗口缩放时布局不崩

**Step 5: 提交**

```bash
git add apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/App.test.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "refactor: migrate app shell layout to Tailwind"
```

---

### Task 5: ProviderIcon 迁移

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/ProviderIcon.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ProviderIcon.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: 替换 BEM class 为 Tailwind**

替换规则（使用 `cn()` + 条件 class）：

Container:
```tsx
// default variant
'inline-flex items-center justify-center w-8 h-8 p-1.5 shrink-0 rounded-xl border border-white/70 shadow-sm'
// + gradient background via inline style 或 arbitrary Tailwind

// rail variant
'inline-flex items-center justify-center w-[30px] h-[30px] p-0 shrink-0 rounded-none border-0 bg-transparent shadow-none'
```

保留 inline style: `--provider-brand`, `--provider-badge-tint`, `--provider-icon-scale` 作为 CSS custom properties（动态值不属于 Tailwind 范畴）。

`.provider-icon__media` → `inline-flex items-center justify-center w-full h-full` + `transform: scale(var(--provider-icon-scale))` via inline style

`.provider-icon__visual--inline` → `inline-flex items-center justify-center [&>svg]:block [&>svg]:w-full [&>svg]:h-full`

`.provider-icon__visual--fallback` → `inline-flex items-center justify-center w-full h-full rounded-[9px] text-white text-xs font-extrabold` + `bg-[var(--provider-brand)]`

**特殊处理**: chatgpt SVG `favicon-bg { fill: transparent }` 的 rail 变体覆盖。方案：
- 使用 `data-provider-id="chatgpt"` + `data-variant="rail"` 属性选择器，在 `@layer components` 中保留一条针对性规则
- 或在渲染 chatgpt asset 时通过 prop 注入 `fill: transparent`

**背景渐变**: default variant 的 `background: radial-gradient(...), linear-gradient(...)` 无法用 Tailwind 原子表达，使用 arbitrary value 或 inline style。

**Step 2: 更新 ProviderIcon.test.tsx**

当前测试主要用 `data-provider-id` 和 `role="img"` 查询，不断言 CSS class。预期不需要大改，但需验证。

**Step 3: 删除 styles.css 中 `.provider-icon*` 块**

删除 `.provider-icon` 到 `.provider-icon__visual--fallback span` 整个块（line ~637-722），以及 `@media (max-height: 860px)` 中没有 `.provider-icon` 的引用所以无需额外处理。

保留的 chatgpt 特殊规则如果采用 data-attribute 方案：
```css
@layer components {
  [data-variant="rail"] [data-provider-id="chatgpt"] .favicon-bg {
    fill: transparent;
  }
}
```

**Step 4: 验证 4 个使用场景**

Run `pnpm dev`，逐一检查：
1. AppSidebar 左侧 rail 的 provider icon（30x30, 无边框）
2. SettingsPage 服务列表中的 icon（32x32, 有边框 + 渐变背景）
3. LibraryPage filter tab 中的 icon
4. ConversationMessagePane header 中的 icon（28x28）

**Step 5: 运行测试**

Run:
```bash
pnpm desktop:test && pnpm --dir apps/desktop exec tsc --noEmit
```
Expected: 全部通过

**Step 6: 提交**

```bash
git add apps/desktop/src/renderer/src/components/ProviderIcon.tsx apps/desktop/src/renderer/src/components/ProviderIcon.test.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "refactor: migrate ProviderIcon to Tailwind with cn() and cva variants"
```

---

### Task 6: AppSidebar 迁移

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/AppSidebar.tsx`
- Modify: `apps/desktop/src/renderer/src/components/AppSidebar.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: 迁移 AppSidebar.tsx**

替换规则（直接 inline，不预先创建 RailButton 抽象）：

`.product-rail` → `flex flex-col justify-between min-h-0 pt-[42px] pb-3 overflow-auto border-r border-[rgba(123,98,56,0.08)] backdrop-blur-[18px]`

`.product-rail__providers` / `.product-rail__nav` → `flex flex-col items-center gap-3`

`.product-rail__nav::before`（装饰分割线）→ 用一个 `<div>` 替代：
```tsx
<div className="w-[22px] h-px mb-0.5 rounded-full bg-gradient-to-r from-transparent via-[rgba(126,101,63,0.28)] to-transparent" />
```

`.rail-button` → 用 `cn()` 组合：
```tsx
cn(
  // base
  'relative inline-flex items-center justify-center w-11 h-11 p-0 overflow-hidden border-0 rounded-[14px] text-[#6a5f51] bg-transparent isolate',
  'transition-[color,box-shadow] duration-[180ms] ease-out',
  'focus-visible:outline-2 focus-visible:outline-[rgba(207,139,46,0.22)] focus-visible:outline-offset-2',
  'hover:text-[#2e2419]',
  // ::before 伪元素 — 使用 before: prefix
  'before:content-[""] before:absolute before:inset-0 before:rounded-[14px] before:bg-transparent before:shadow-none before:transition-all before:duration-[180ms]',
  // provider variant hover
  variant === 'provider' && 'hover:before:border hover:before:border-[rgba(34,29,23,0.06)] hover:before:bg-[rgba(34,29,23,0.045)]',
  // active state
  isActive && 'text-[#2c2219] before:border before:border-[rgba(34,29,23,0.08)] before:bg-[rgba(34,29,23,0.08)] before:shadow-[inset_0_1px_0_rgba(255,255,255,0.48)]',
)
```

对于 `::after`（provider accent dot）— 使用 `after:` prefix 或增加一个小 `<span>` 子元素。

`.rail-glyph` → `w-[19px] h-[19px]`

**关键设计决策**:
- rail-button 的视觉效果（伪元素渐变、阴影）是 amber 品牌体验的核心部分，迁移时必须保持视觉一致
- `--rail-provider-accent`, `--rail-provider-tint`, `--rail-provider-active-tint` 动态 CSS custom properties 保留为 inline style
- 如果 Tailwind `before:` / `after:` class 过长（>5 行），考虑在 `@layer components` 中保留少量 rail 相关规则

**Step 2: 更新 AppSidebar.test.tsx**

当前测试只用 aria-based 查询（`getByRole('button', { name: '打开 ChatGPT' })`），不断言 CSS class。预期不需要修改。

**Step 3: 删除 styles.css 对应 CSS**

删除：
- `.product-rail` 及所有子 class (line ~100-131)
- `.product-rail__nav::before` (line ~133-140)
- `.rail-button` 及所有变体/状态 (line ~142-305)
- `.rail-glyph` (line ~302-305)
- `@media (max-height: 860px)` 中的 `.product-rail*` 规则 (line ~742-758)

预计删除 ~200 行。

**Step 4: 验证**

Run:
```bash
pnpm desktop:test && pnpm --dir apps/desktop exec tsc --noEmit
```

Run `pnpm dev`，验证：
- Provider icon hover 效果（玻璃质感背景渐变出现）
- Provider icon active 状态（背景 + accent dot）
- Utility button hover/active 状态
- 装饰分割线显示
- 窗口高度缩小时 rail 间距调整
- Focus ring（Tab 键导航）
- 触控目标最小 44x44（rail-button 宽高均为 44px）

**Step 5: 提交**

```bash
git add apps/desktop/src/renderer/src/components/AppSidebar.tsx apps/desktop/src/renderer/src/components/AppSidebar.test.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "refactor: migrate AppSidebar rail to Tailwind"
```

---

## Phase 2: Archive 子系统迁移

> **Styling migration only.** 不改变 ConversationList/ConversationMessagePane 的信息架构和交互行为。

### Task 7: ConversationList 迁移

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/ConversationList.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ConversationList.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: 迁移 ConversationList.tsx**

替换规则：

`.workspace-card.workspace-card--sessions` →
```tsx
'h-full flex flex-col min-h-0 p-[18px] rounded-[20px] border border-[rgba(66,49,11,0.12)] bg-white/70 shadow-[0_18px_44px_rgba(68,54,26,0.1)] animate-[fade-up_420ms_ease_both]'
```

`.section-header.section-header--tight` →
```tsx
'flex items-center justify-between gap-3 mb-3.5'
```

`.section-header h2` → `text-sm tracking-[0.04em] m-0 font-bold`

`.panel-count`（workspace-card 内）→ inline Tailwind:
```tsx
'inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-[0.08em] text-[#6b4e06] bg-[rgba(255,204,101,0.18)]'
```
注意：不预先抽取 Badge 组件 — 等出现第二个稳定使用点再抽。

`.workspace-empty` →
```tsx
'p-3.5 rounded-2xl text-[#586779] bg-white/60 border border-dashed border-[rgba(87,102,122,0.22)] [&>p]:m-0 [&>p]:leading-relaxed'
```

`.conversation-list.conversation-list--scroll` →
```tsx
'flex-1 overflow-y-auto overflow-x-hidden min-h-0 flex flex-col gap-3 list-none m-0 p-0 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar:horizontal]:hidden'
```

`.conversation-item` → 使用 `cn()` 处理 active 状态:
```tsx
cn(
  'w-full block p-3 px-3.5 rounded-xl text-left bg-white border border-[rgba(84,99,124,0.08)] transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden cursor-pointer shrink-0',
  'hover:bg-[#fffdf9] hover:border-[rgba(204,148,17,0.15)] hover:translate-x-0.5',
  isActive && 'bg-gradient-to-br from-[#fffcf0] to-[#fffbf2] border-[rgba(204,148,17,0.32)] shadow-[0_4px_12px_rgba(204,148,17,0.04)]'
)
```

`.conversation-item__body/title/meta/count/date` → 对应 inline Tailwind。

**Step 2: 更新 ConversationList.test.tsx**

修改两个 CSS class 断言：

```tsx
// Before:
expect(screen.getByRole('list')).toHaveClass('conversation-list--scroll');
// After: 改为行为断言
expect(screen.getByRole('list', { name: '历史记录列表' })).toBeInTheDocument();

// Before:
expect(screen.getByRole('button', { name: /产品复盘/i })).toHaveClass('active');
// After: 改为 aria-pressed 断言
expect(screen.getByRole('button', { name: /产品复盘/i })).toHaveAttribute('aria-pressed', 'true');
```

**Step 3: 删除 styles.css 对应 CSS**

删除：
- `.conversation-list`, `.conversation-list--scroll` 及滚动条规则 (line ~1256-1287)
- `.conversation-item` 及所有子 class (line ~1404-1490)
- `.workspace-card--sessions` 部分（仅 sessions 专属的规则，不删 `.workspace-card` 本体——留给 Task 8 一并处理）

**Step 4: 验证**

Run:
```bash
pnpm desktop:test && pnpm --dir apps/desktop exec tsc --noEmit
```

Run `pnpm dev` → Library → 选择一个 provider → 验证聊天记录列表渲染、选中高亮、空状态、滚动行为。

**Step 5: 提交**

```bash
git add apps/desktop/src/renderer/src/components/ConversationList.tsx apps/desktop/src/renderer/src/components/ConversationList.test.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "refactor: migrate ConversationList to Tailwind"
```

---

### Task 8: ConversationMessagePane 迁移

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ConversationMessagePane.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: 迁移 ConversationMessagePane.tsx**

这是当前视觉回归最严重的组件（4 个 CSS class 缺失）。迁移同时修复回归。

替换规则：

`.workspace-card.workspace-card--messages` → 同 Task 7 的 workspace-card 样式。

`.section-header.section-header--tight` → 同 Task 7（已迁移，复用相同 class string）。

`.message-pane__header` →
```tsx
'grid gap-2.5 mb-2.5 pb-2.5 border-b border-[rgba(92,104,123,0.16)]'
```

`.message-pane__headline` → `flex items-center justify-between gap-3 flex-wrap`

`.message-pane__summary` → `grid gap-2 min-w-0`

`.message-pane__title-row` → `flex items-center gap-2.5 min-w-0`

`.message-pane__provider-icon`（ProviderIcon 的 className prop）→ `w-7 h-7 p-1`

`.message-pane__header strong` → `block m-0 text-lg text-[#202b3a] min-w-0 whitespace-nowrap overflow-hidden text-ellipsis`

`.message-pane__chips` → `flex flex-wrap gap-1.5`

`.message-pane__chips span` → `inline-flex items-center min-h-6 px-2 rounded-full bg-white/80 border border-[rgba(84,99,124,0.1)] text-xs text-[#66758a] leading-snug`

`.message-pane__meta-inline` → `mt-1 text-[11px] text-[#8c7e6a]/80 font-mono break-all leading-snug`

`.message-pane__actions` → `flex items-center gap-2 flex-wrap`

**修复缺失的 CSS — IconActionButton 替换为 IconButton**:

删除本地 `IconActionButton` 组件，替换为已有的 `@/components/ui/icon-button`。
将内联 SVG 图标（ExportIcon, DeleteIcon）替换为 lucide-react 图标（`Download`, `Trash2`）。

```tsx
import { Download, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
```

**修复缺失的 CSS — field-select 替换**:

将原生 `<select>` 用 Tailwind 样式化或替换为 shadcn `Select`。

**关键决策**: 是否将原生 `<select>` 替换为 Radix Select？

- 替换优点：视觉一致性（与 SettingsPage 的 Select 统一）
- 替换缺点：改变 DOM 结构，测试需要更大改动（ConversationMessagePane.test.tsx 依赖 `getByRole('combobox')` + `getByRole('option')`）
- **建议**：保留原生 `<select>` 但用 Tailwind 样式化。这避免了测试大改，且只有 2 个选项的简单下拉不需要 Radix 的复杂度。

原生 select 的 Tailwind 样式：
```tsx
<select
  className="h-8 px-2 pr-6 rounded-lg border border-[rgba(84,99,124,0.12)] bg-white/80 text-xs appearance-none bg-[url('data:image/svg+xml,...')] bg-no-repeat bg-[right_6px_center] bg-[length:12px]"
  ...
>
```

`.message-pane__feedback` → `m-0 p-3 px-3.5 rounded-2xl text-[13px] leading-relaxed text-[#5b4c38] bg-white/70 border border-[rgba(153,127,76,0.12)]`

`.message-pane__body` → `flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-2 mt-2`

`.message-list`（conversation 内的）→ `grid gap-3 list-none m-0 p-0`

`.message-bubble` → 使用 `cn()` 处理角色变体:
```tsx
cn(
  'p-3.5 rounded-[18px] border',
  message.role === 'user'
    ? 'bg-[rgba(255,250,235,0.94)] border-[rgba(200,145,20,0.12)]'
    : 'bg-[rgba(244,247,255,0.94)] border-[rgba(91,168,255,0.14)]',
)
```

`.message-bubble__meta` → `flex items-center justify-between gap-2.5 mb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#738297]`

`.message-bubble p` → `m-0 leading-relaxed text-[#243346] whitespace-pre-wrap`

`.visually-hidden` → `sr-only`（Tailwind 内置）

**Step 2: 更新 ConversationMessagePane.test.tsx**

由于保留原生 `<select>`，测试中的 `getByRole('combobox')` 和 `getByRole('option')` 不需要改动。

若使用 lucide 图标替换内联 SVG，按钮的 `aria-label` 不变，测试无需修改。

**Step 3: 删除 styles.css 对应 CSS**

删除：
- `.workspace-card` 本体 + `.workspace-card--sessions`, `.workspace-card--messages` (line ~1004-1047)
- `.section-header`, `.section-header--tight`, `.section-header h2/h3` (line ~1057-1075)
- `.panel-count`（`.workspace-card .panel-count` 变体）(line ~1076-1093)
- `.workspace-empty` (line ~1243-1254)
- `.message-pane__*` 所有规则 (line ~1492-1585)
- `.visually-hidden` (line ~1587-1597)
- `.message-bubble`, `.message-bubble.user/assistant`, `.message-bubble__meta`, `.message-bubble p` (line ~1599-1638)
- `.message-list`（conversation 上下文，line ~1606-1609，注意 diagnostics 也用 `.message-list`——需保留 diagnostics 版本直到 Phase 3）
- `.conversation-list` 相关（如 Task 7 未删完的部分）
- `@keyframes fade-up`（如果仅被 `.workspace-card`/`.panel-card` 使用——`.panel-card` 仍在用，保留到 Phase 3）

**Step 4: 验证**

Run:
```bash
pnpm desktop:test && pnpm --dir apps/desktop exec tsc --noEmit
```

Run `pnpm dev` → Library → 选择 provider → 选择一条聊天 → 验证：
- 消息详情 header（provider icon + 标题 + chips + URL）
- 导出下拉 + 导出/删除按钮（之前因 CSS 缺失而视觉异常，现在应恢复正确）
- 消息气泡（user amber 背景 / assistant 蓝色背景）
- 空状态
- feedback 消息
- 滚动行为

**Step 5: 提交**

```bash
git add apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx apps/desktop/src/renderer/src/components/ConversationMessagePane.test.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "refactor: migrate ConversationMessagePane to Tailwind and fix missing CSS regressions"
```

---

### Task 9: LibraryPage 布局迁移

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/LibraryPage.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: 迁移 LibraryPage 外层 layout**

替换规则：

`.utility-page.utility-page--library` →
```tsx
'grid gap-5 h-full overflow-hidden'
// grid-template-rows: auto minmax(0, 1fr)
style={{ gridTemplateRows: 'auto minmax(0, 1fr)' }}
```
或使用 Tailwind: `grid grid-rows-[auto_minmax(0,1fr)] gap-5 h-full overflow-hidden`

`.library-page__top` →
```tsx
'sticky top-0 z-[3] grid gap-2 px-3 pt-2 pb-3 bg-white/85 backdrop-blur-[18px] border-b border-[rgba(153,127,76,0.08)] -mx-4 -mt-6 mb-3'
```

`.library-grid` →
```tsx
'grid grid-cols-[minmax(220px,320px)_minmax(0,1fr)] gap-3 items-stretch flex-1 min-h-0 overflow-hidden'
```

**Step 2: 删除 styles.css 中 utility-page 和 library 相关 CSS**

删除：
- `.utility-page` 及所有变体 (line ~546-591)
- `.utility-page__header`, `.utility-page__header--compact`, `.utility-page__header h1`, `.utility-page__copy` (line ~567-591)
- `.utility-page__eyebrow` (合并选择器中独立出来或删除)
- `.library-page__top` (line ~593-604)
- `.library-grid` (line ~617-625)
- `@media (max-width: 1080px)` 中 `.library-grid` 的响应式规则 (line ~737-739)

**注意**: `.utility-page__eyebrow` 和 `.chat-overview__eyebrow` 在同一选择器中——如果 Task 3 未处理完，此处一并清理。

**Step 3: 验证**

Run:
```bash
pnpm desktop:test && pnpm --dir apps/desktop exec tsc --noEmit
```

Run `pnpm dev` → Library → 验证：
- "全部" 总览视图（KPI cards + charts + data ops）
- 切换到单 provider 视图（聊天记录列表 + 消息详情）
- 窗口缩放时 library-grid 的响应式行为（如需响应式，用 Tailwind `@media` 前缀替代）

**Step 4: 提交**

```bash
git add apps/desktop/src/renderer/src/pages/LibraryPage.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "refactor: migrate LibraryPage layout to Tailwind"
```

---

## Phase 3: Diagnostics 子系统迁移

> **独立子系统。** Diagnostics 是 dev-only 功能（`diagnosticsEnabled` 门控），使用深色主题，与主应用视觉体系不同。

### Task 10: 添加暗色主题 tokens

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: 在 `@layer base` 中添加 `.dark` 变量**

```css
@layer base {
  :root {
    /* existing amber tokens */
  }

  .dark {
    --background: 222 26% 5%;
    --foreground: 220 30% 95%;
    --card: 222 26% 7%;
    --card-foreground: 220 30% 95%;
    --muted: 222 20% 14%;
    --muted-foreground: 220 20% 64%;
    --primary: 174 60% 68%;
    --primary-foreground: 222 26% 5%;
    --secondary: 222 20% 12%;
    --secondary-foreground: 220 30% 90%;
    --accent: 210 100% 68%;
    --accent-foreground: 222 26% 5%;
    --destructive: 0 72% 65%;
    --destructive-foreground: 0 0% 100%;
    --border: 220 20% 16%;
    --input: 220 20% 16%;
    --ring: 210 100% 68%;
  }
}
```

这些值从当前 diagnostics CSS 中的颜色（teal accent `#72e2d5`/`#89f0d9`, blue accent `#5ba8ff`/`#95c7ff`, dark bg `rgba(7,11,19,...)`）推导而来。

**Step 2: 提交**

```bash
git add apps/desktop/src/renderer/src/styles.css
git commit -m "style: add dark theme tokens for diagnostics subsystem"
```

---

### Task 11: DiagnosticsPage 及子组件迁移

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DiagnosticsPage.tsx`
- Modify: `apps/desktop/src/renderer/src/components/RuntimeStatusCard.tsx`
- Modify: `apps/desktop/src/renderer/src/components/AttemptLogPanel.tsx`
- Modify: `apps/desktop/src/renderer/src/components/SessionList.tsx`
- Modify: `apps/desktop/src/renderer/src/components/MessageList.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: DiagnosticsPage.tsx**

```tsx
<section className="dark">
  <div className="p-[18px] overflow-auto min-h-0 text-foreground bg-gradient-to-b from-[rgba(7,11,19,0.98)] to-[rgba(4,7,13,0.98)]"
       style={{ background: 'radial-gradient(circle at top right, rgba(91,168,255,0.2), transparent 24%), radial-gradient(circle at bottom left, rgba(66,216,177,0.14), transparent 22%), linear-gradient(180deg, rgba(7,11,19,0.98), rgba(4,7,13,0.98))' }}>
    <h1 className="sr-only">抓取调试台与对账控制台</h1>
    <RuntimeStatusCard ... />
    <div className="grid grid-cols-2 gap-4 [&>:last-child]:col-span-full">
      ...
    </div>
  </div>
</section>
```

**Step 2: RuntimeStatusCard.tsx**

- `.panel-card` → `Card` 组件（dark 模式下自动适配 `--card` token）
- `.status-grid` → `grid grid-cols-3 gap-3`
- `.status-item` → `min-h-[76px] p-3 rounded-2xl bg-white/5`
- `.primary-button` → `Button` 组件
- `.mono` → `font-mono text-xs`
- `.feedback` → `mt-3.5 text-[13px] text-foreground/80`

**Step 3: AttemptLogPanel.tsx**

- `.panel-card` → `Card`
- `.attempt-list` → `grid gap-2.5 list-none m-0 p-0`
- `.attempt-item` → `p-3 rounded-[14px] bg-white/5`
- `.attempt-captured` → `border border-[rgba(111,242,217,0.24)]`
- `.attempt-error` → `border border-[rgba(255,114,114,0.32)]`
- `.attempt-meta` → `flex justify-between gap-3 mb-2 text-foreground/55 text-[11px] uppercase tracking-[0.06em]`
- `.empty-state` → `p-3 rounded-[14px] bg-white/5 text-foreground/60`

**Step 4: SessionList.tsx**

- `.panel-card` → `Card`
- `.session-list` → `grid gap-2.5 list-none m-0 p-0`
- `.session-button` → 使用 `cn()` 处理 active 状态

**Step 5: MessageList.tsx**

- `.panel-card` → `Card`
- `.panel-caption` → `m-0 mb-3 text-xs leading-normal text-foreground/80`
- `.message-item` → `p-3 rounded-[14px] bg-white/5`
- `.message-role` → 使用 `cn()` 处理角色变体
- `.role-user` → `bg-[rgba(124,229,202,0.16)] text-[#89f0d9]`
- `.role-assistant` → `bg-[rgba(91,168,255,0.16)] text-[#95c7ff]`

**Step 6: 删除 styles.css 中 diagnostics 相关 CSS**

删除：
- `.diagnostics-page` (line ~554-558, 862-867, 876-882)
- `.diagnostics-grid` 及 `:last-child` 规则 (line ~996-1002)
- `.panel-card` (line ~1004-1009, 1049-1055)
- `.panel-count`（`.runtime-status-card .panel-count`）(line ~1095-1097)
- `.status-grid`, `.status-item*` (line ~1099-1133)
- `.runtime-path*` (line ~1135-1148)
- `.mono` (line ~1150-1159)
- `.feedback*` (line ~1161-1168)
- `.primary-button*` (line ~1170-1195)
- `.attempt-list`, `.attempt-item*`, `.attempt-meta`, `.attempt-captured`, `.attempt-error`, `.attempt-detail` (line ~1655-1708)
- `.session-list`, `.session-button*` (line ~1716-1750)
- `.message-list`（diagnostics 版本, line ~1752-1758）
- `.message-role`, `.role-user`, `.role-assistant` (line ~1760-1778)
- `.message-item*`, `.empty-state*` (line ~1662-1674, 1780-1789)
- `.panel-caption` (line ~1710-1714)
- `.service-list*`（如 Task 3 未删完）
- `@keyframes fade-up`（如果不再有引用）
- 所有剩余 media queries 中的 diagnostics 相关规则

**Step 7: 验证**

Run:
```bash
pnpm desktop:test && pnpm --dir apps/desktop exec tsc --noEmit
```

设置 `AMBERKEEPER_ENABLE_DIAGNOSTICS=1`（或通过 shellInfo），Run `pnpm dev`：
- 验证 diagnostics 页面的深色背景 + 渐变
- RuntimeStatusCard（status grid + 按钮 + 状态反馈）
- AttemptLogPanel（captured/error 颜色区分）
- SessionList（active 高亮）
- MessageList（user/assistant role badge 颜色）

**Step 8: 提交**

```bash
git add apps/desktop/src/renderer/src/pages/DiagnosticsPage.tsx apps/desktop/src/renderer/src/components/RuntimeStatusCard.tsx apps/desktop/src/renderer/src/components/AttemptLogPanel.tsx apps/desktop/src/renderer/src/components/SessionList.tsx apps/desktop/src/renderer/src/components/MessageList.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "refactor: migrate DiagnosticsPage subsystem to Tailwind with dark theme"
```

---

## Phase 4: 最终清理

### Task 12: 清理残余 legacy CSS + 全局审计

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Possibly modify: any component still referencing legacy classes

**Step 1: 审计残余 legacy class**

Run:
```bash
grep -oP '\.[a-z][a-z0-9_-]+' apps/desktop/src/renderer/src/styles.css | sort -u > /tmp/css-classes.txt
grep -roh 'className="[^"]*"' apps/desktop/src/renderer/src/ --include="*.tsx" | grep -oP '[a-z][a-z0-9_-]+' | sort -u > /tmp/tsx-classes.txt
comm -23 /tmp/css-classes.txt /tmp/tsx-classes.txt
```

Expected: 列出所有在 CSS 中定义但未被 TSX 引用的 class。删除它们。

**Step 2: 清理 `:root` legacy variables**

删除 `:root` 中所有 `--product-*` 变量（`--product-bg`, `--product-panel`, `--product-border`, `--product-shadow`, `--product-ink`, `--product-muted`, `--product-accent`, `--product-accent-strong`）。

保留 `:root` 中的 `font-family`、`color`、`background`、`color-scheme`（或迁移到 `@layer base` 中的 Tailwind 风格）。

**Step 3: 审计全局 resets**

检查 `*`, `html, body, #root`, `body`, `button, input, textarea`, `button { cursor: pointer }` 等全局规则是否与 Tailwind base 重复。Tailwind 的 preflight 已覆盖大部分 reset，但 Electron 环境下可能有差异。保守处理——保留不确定的 reset。

**Step 4: 最终验证**

Run:
```bash
pnpm desktop:test && pnpm --dir apps/desktop exec tsc --noEmit && pnpm desktop:build
```
三个验证命令必须全部通过。

Run `pnpm dev`，完整视觉走查：
- [ ] AppSidebar: provider icon 渲染 + hover + active + focus ring
- [ ] Settings: 服务管理拖拽排序 + 缓存开关 + 停用/启用 + 语言选择
- [ ] Library "全部": KPI cards + 趋势图 + provider 占比图 + 导出
- [ ] Library per-provider: 聊天记录列表 + 选中 + 消息详情 + 导出/删除
- [ ] About: 版本号 + GitHub/反馈链接
- [ ] Diagnostics: 深色主题 + runtime status + attempt logs + session list + message list
- [ ] 窗口缩放: 布局不崩, 响应式断点正常

**Step 5: 提交**

```bash
git add apps/desktop/src/renderer/src/styles.css
git commit -m "chore: remove remaining legacy CSS, finalize renderer Tailwind migration"
```

---

### Task 13: 清理冗余 git 分支

**Step 1: 删除 feat/settings-ui-overhaul 分支**

```bash
git branch -d feat/settings-ui-overhaul
```

---

## 风险与控制

1. **测试先校准再迁移** — 每个 Task 都先确认测试通过（基线），迁移后再次验证。CSS class 断言在迁移时改为行为断言（aria 属性或角色查询）
2. **不在一个 Phase 同时做 IA + 样式** — 每个 Phase 标注 "Styling migration only"，信息架构调整作为独立后续任务
3. **不提前过度抽象** — RailButton、EmptyState、Badge 等仅在出现第二个稳定使用点后抽取。Phase 1-2 全部 inline
4. **不设绝对行数目标** — styles.css 最终行数取决于保留多少 global reset 和兼容样式，以完成标准为准而非行数
5. **ProviderIcon 背景渐变** — default variant 的 `radial-gradient + linear-gradient` 可能无法纯 Tailwind 表达，使用 inline style 或 `@layer components` 中的少量 CSS
6. **rail-button 伪元素** — 如果 Tailwind `before:`/`after:` class 过长影响可读性，可在 `@layer components` 中保留少量规则
7. **ConversationMessagePane select** — 保留原生 `<select>` 而非替换为 Radix Select，避免测试大改

## 最终完成标准

- [ ] renderer 业务组件不再依赖 legacy BEM class（`.product-*`, `.workspace-*`, `.message-pane__*`, `.conversation-*`, `.panel-*`, `.rail-*`, `.provider-icon*`, `.diagnostics-*` 等）
- [ ] `styles.css` 仅保留：Tailwind 指令、`@layer base` design tokens（light + dark）、base/reset、极少量兼容样式
- [ ] `pnpm desktop:test` 全部通过
- [ ] `pnpm --dir apps/desktop exec tsc --noEmit` 零错误
- [ ] `pnpm desktop:build` 成功
- [ ] 所有关键页面（Settings / Library / About / Diagnostics）视觉语言统一
- [ ] 新 UI 不再新增 legacy business CSS class
