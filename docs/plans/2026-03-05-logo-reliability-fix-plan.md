# Logo Reliability Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 DeepSeek 与 MiroThinker 的 logo 显示异常，并让图标获取链路在站点风控/404/重定向变化时仍可稳定回退。

**Architecture:** 保留现有 `img onError` 渲染模式，优先通过“候选 URL 生成策略升级 + 候选优先级重排 + 主域名/父域名回退”解决问题，避免一次性切换到高风险的 `fetch + cors` 渲染链路。对现有自定义服务中历史遗留的第三方 fallback 图标（Google S2/DDG）进行降级排序，不再作为最高优先级。先用单元测试锁定行为，再实施最小改动。

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tauri WebView

---

### Task 1: 为当前故障补回归测试（先失败）

**Files:**
- Modify: `tests/unit/icon.test.ts`
- Test: `tests/unit/icon.test.ts`

**Step 1: Write the failing test**

在 `tests/unit/icon.test.ts` 增加以下测试：

```ts
it('should include first-party svg/favicon candidates before third-party fallback providers', () => {
  const candidates = getServiceIconCandidates(
    'https://dr.miromind.ai',
    'https://www.google.com/s2/favicons?domain=dr.miromind.ai&sz=64'
  );

  // 第一个候选不应再是 google s2
  expect(candidates[0]).toBe('https://dr.miromind.ai/favicon.svg');
  expect(candidates).toContain('https://dr.miromind.ai/favicon.ico');
});

it('should include parent-domain fallback candidates for subdomain services', () => {
  const candidates = getServiceIconCandidates('https://chat.deepseek.com');

  expect(candidates).toContain('https://icons.duckduckgo.com/ip3/chat.deepseek.com.ico');
  expect(candidates).toContain('https://icons.duckduckgo.com/ip3/deepseek.com.ico');
});

it('should include google s2 fallback for parent domain when needed', () => {
  const candidates = getServiceIconCandidates('https://chat.deepseek.com');

  expect(candidates).toContain('https://www.google.com/s2/favicons?domain=chat.deepseek.com&sz=64');
  expect(candidates).toContain('https://www.google.com/s2/favicons?domain=deepseek.com&sz=64');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest tests/unit/icon.test.ts`
Expected: FAIL，新增断言至少 2-3 条失败（当前实现未生成父域名 fallback，且 explicit 第 1 优先级）。

**Step 3: Commit**

```bash
git add tests/unit/icon.test.ts
git commit -m "test(icon): add regression coverage for deepseek and mirothinker logo fallbacks"
```

---

### Task 2: 升级候选生成策略（最小实现）

**Files:**
- Modify: `src/lib/icon.ts`
- Test: `tests/unit/icon.test.ts`

**Step 1: Write minimal implementation**

在 `src/lib/icon.ts` 做以下改造：

1. 增加 host 变体生成（至少包含）：
- 原始 host（去除 `www.`）
- immediate parent（`chat.deepseek.com -> deepseek.com`）
- 根域名猜测（最后两段，如 `dr.miromind.ai -> miromind.ai`）

2. 增加 first-party icon 候选（每个 host 对应 origin）：
- `/favicon.svg`
- `/favicon.ico`
- `/apple-touch-icon.png`
- `/icon.svg`

3. 对 explicit icon 分级：
- 若 explicit 为第三方 fallback 提供商（`google.com/s2/favicons` 或 `icons.duckduckgo.com/ip3`），不放首位，降级到 first-party 之后。
- 非 fallback explicit（用户真实自定义 CDN/icon）保持高优先级。

4. 增加第三方 fallback 双来源（host + parent/root）：
- `https://icons.duckduckgo.com/ip3/{host}.ico`
- `https://www.google.com/s2/favicons?domain={host}&sz=64`

5. 继续保留去重逻辑（`addCandidate`）。

建议优先级（从高到低）：
- explicit（非 fallback）
- 官方映射 `OFFICIAL_ICON_MAP`
- first-party icon paths
- explicit（fallback 类型）
- DDG / Google S2 fallback（host variants）

**Step 2: Run tests to verify pass**

Run: `pnpm exec vitest tests/unit/icon.test.ts`
Expected: PASS（含原有测试 + 新增回归测试）。

**Step 3: Commit**

```bash
git add src/lib/icon.ts tests/unit/icon.test.ts
git commit -m "fix(icon): prioritize first-party logos and add parent-domain fallbacks"
```

---

### Task 3: 对预置与自定义入口行为做一致性验证

**Files:**
- Modify: `src/components/AddServiceDialog.tsx` (仅在必要时)
- Modify: `src/components/SettingsPage.tsx` (仅在必要时)
- Test: `tests/unit/icon.test.ts`

**Step 1: Write the failing test (if behavior mismatch found)**

若发现“添加服务时仍偏向 third-party fallback”，补测试（可放在 `icon.test.ts`，不必做组件测试）：

```ts
it('should prefer first-party candidate even when explicit fallback URL exists', () => {
  const candidates = getServiceIconCandidates(
    'https://dr.miromind.ai',
    'https://icons.duckduckgo.com/ip3/dr.miromind.ai.ico'
  );

  expect(candidates[0]).toBe('https://dr.miromind.ai/favicon.svg');
});
```

**Step 2: Run test to verify it fails (if added)**

Run: `pnpm exec vitest tests/unit/icon.test.ts -t "prefer first-party candidate"`
Expected: FAIL（仅在尚未覆盖该场景时）。

**Step 3: Minimal implementation (only if required)**

如 Task 2 已覆盖，可跳过代码改动，仅保留测试；如未覆盖，在 `src/lib/icon.ts` 补齐 explicit fallback 降级逻辑。

**Step 4: Run tests to verify pass**

Run: `pnpm exec vitest tests/unit/icon.test.ts`
Expected: PASS。

**Step 5: Commit**

```bash
git add src/lib/icon.ts tests/unit/icon.test.ts
git commit -m "test(icon): lock explicit-fallback ordering behavior"
```

---

### Task 4: 手工回归验证（DeepSeek + MiroThinker）

**Files:**
- No code change required

**Step 1: Build and run app**

Run: `pnpm dev`（或你的 tauri 启动方式）
Expected: 应用可正常打开，侧边栏可见服务图标。

**Step 2: Verify DeepSeek**

- 启用 `DeepSeek` 服务
- 观察侧边栏图标是否显示（不再空白/坏图）
- 打开设置页服务列表，确认同样显示正常

Expected: 图标可显示，且切换服务不会闪退或明显卡顿。

**Step 3: Verify MiroThinker (existing custom service)**

- 保留现有 custom 项（`https://dr.miromind.ai`）
- 确认图标最终选择 first-party（`/favicon.svg`）或有效 fallback，而非失效 `google s2` 占位图

Expected: 图标显示正常。

**Step 4: Negative checks**

抽样验证 `ChatGPT / Gemini / Qwen / Kimi` 图标未回归。

Expected: 现有正常站点不受影响。

**Step 5: Commit (if manual-only task, skip commit)**

本任务不强制 commit；若补充了说明文档，单独提交文档。

---

### Task 5: 可选增强（第二阶段，不在本轮必须）

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/SettingsPage.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/hooks/useCachedIcon.ts`
- Test: `tests/unit/icon-cache.test.ts` (new)

**Step 1: Write failing tests for cached icon path**

目标：验证 `response.ok === false` 的候选不会被当作成功图标缓存。

**Step 2: Implement minimal integration**

将 Sidebar/Settings 的 `<img src={candidate}>` 直接链路切换为 `useCachedIcon` 返回的 `iconSrc`，并在 `useCachedIcon` 中把“全部失败后的返回值”从 `candidates[0]` 改为 `null`。

**Step 3: Run tests**

Run: `pnpm exec vitest`
Expected: PASS。

**Step 4: Manual regression**

重点验证跨域/CORS 不会让大量站点图标消失。

**Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/components/SettingsPage.tsx src/components/SettingsDialog.tsx src/hooks/useCachedIcon.ts tests/unit/icon-cache.test.ts
git commit -m "feat(icon): optional cached icon pipeline with strict fetch validation"
```

---

## Verification Checklist (Before Completion)

- `pnpm exec vitest tests/unit/icon.test.ts` 通过
- DeepSeek 图标恢复显示
- MiroThinker 图标恢复显示
- 其他常见服务图标无回归
- 候选顺序符合策略（first-party 优先，third-party fallback 后置）

---

## Rollback Plan

若出现大面积图标回归：
1. 回滚 `src/lib/icon.ts` 到改动前版本。
2. 保留新增测试，逐条放开断言以定位是哪条新策略导致回归。
3. 优先保留“parent domain fallback”能力，临时关闭“explicit fallback 降级”策略。

---

## Out of Scope (YAGNI)

- 不做服务端 icon 代理
- 不做数据库 schema 变更
- 不做全量历史 custom 配置迁移脚本
- 不在本轮接入复杂公共后缀库（PSL）
