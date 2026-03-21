# Custom Service Icon Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make custom service icon detection use real image probing instead of blindly saving `origin/favicon.ico`, and heal stale icon URLs when runtime fallback finds a better icon.

**Architecture:** Reuse `getServiceIconCandidates()` as the single source of candidate ordering, add a small browser-side probing helper based on `Image.onload/onerror`, then wire both add-service entry points to it. Runtime rendering keeps the existing cached icon hook, but reports successful fallback candidates back to the store once so stale saved URLs are corrected over time.

**Tech Stack:** React 19, Zustand, Vitest, browser `Image` API.

### Task 1: Shared icon probe helper

**Files:**
- Modify: `src/lib/icon.ts`
- Test: `tests/unit/icon.test.ts`

**Step 1: Write the failing test**

Add tests for:
- picking the first successful icon candidate from an `Image` probe
- returning `null` when every candidate fails

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/icon.test.ts`
Expected: FAIL because probe helper does not exist yet

**Step 3: Write minimal implementation**

Add a small async probe helper that:
- accepts a URL
- resolves on `onload`
- rejects on `onerror` or timeout
- checks candidate URLs in order

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/icon.test.ts`
Expected: PASS

### Task 2: Add-service dialog uses real probing

**Files:**
- Modify: `src/components/AddServiceDialog.tsx`
- Test: `tests/unit/add-service-dialog.test.tsx`

**Step 1: Write the failing test**

Add tests for:
- previewing the first probeable icon instead of `origin/favicon.ico`
- saving `undefined` iconUrl when auto-probe fails and user did not enter one

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/add-service-dialog.test.tsx`
Expected: FAIL because dialog still uses naive auto URL guessing

**Step 3: Write minimal implementation**

Replace `getFaviconUrl()`-style guessing with shared probe helper, plus loading/empty states.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/add-service-dialog.test.tsx`
Expected: PASS

### Task 3: Align settings-page add flow and runtime self-heal

**Files:**
- Modify: `src/components/SettingsPage.tsx`
- Modify: `src/hooks/useCachedIcon.ts`
- Modify: `src/components/Sidebar.tsx`
- Test: `tests/unit/use-cached-icon.test.tsx`

**Step 1: Write the failing test**

Add tests for:
- `SettingsPage` using the shared probe helper
- `useCachedIcon()` exposing the resolved candidate URL
- runtime fallback reporting a better icon candidate after `onError` advancement

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/use-cached-icon.test.tsx tests/unit/add-service-dialog.test.tsx`
Expected: FAIL because resolved candidate reporting does not exist yet

**Step 3: Write minimal implementation**

Expose resolved candidate metadata from the hook and update the store only when a later candidate successfully loads.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/icon.test.ts tests/unit/add-service-dialog.test.tsx tests/unit/use-cached-icon.test.tsx`
Expected: PASS
