# Qianwen 链接外部打开与图标获取优化 - 设计

## 目标
- 将内置 Qwen 服务地址更新为 `https://www.qianwen.com`。
- 修复“设置 → 自定义添加网站”自动获取 logo 失败/错误的问题，提升命中率并提供兜底。
- 对话内容中的链接点击后在系统默认浏览器打开，避免应用内新窗口。
- 左侧导航栏右键菜单不再弹出系统默认菜单。

## 架构方案
1. **图标候选列表统一化**
   - 通过 `getServiceIconCandidates` 统一生成图标候选列表，顺序：显式 iconUrl → 站点官方映射 → `origin/favicon.ico` → DuckDuckGo favicon。
   - 内置 `qianwen.com` 的官方图标映射（来自官网 `og:image`），避免 `favicon.ico` 非图片导致加载失败。
   - 该候选列表用于 Settings 自定义添加的 logo 预览、侧边栏图标展示与缓存加载。

2. **外部链接打开策略**
   - 在 Tauri `on_new_window` 回调内：
     - 若 URL 属于 OAuth/auth 域名或路径 → 仍走应用内弹窗流程。
     - 否则调用 `tauri-plugin-opener` 打开系统默认浏览器，并返回 `Deny`，阻止应用内新窗口。
   - 保留 `on_navigation` 逻辑，避免影响站内正常导航。

3. **左侧导航右键菜单屏蔽**
   - 在 `Sidebar` 根容器添加 `onContextMenu={e => e.preventDefault()}`，仅屏蔽侧栏区域默认菜单。

4. **配置与选择器更新**
   - 更新内置服务列表中的 Qwen URL。
   - `remote-access.json` 增加 `https://www.qianwen.com/*`（可保留 `chat.qwen.ai` 兼容）。
   - DOM 兜底选择器增加 `qianwen.com` 站点匹配。

## 数据流与关键路径
- 用户在设置页输入 URL → `getServiceIconCandidates` 生成候选 → 逐个尝试加载 → 成功则展示并保存。
- 侧边栏图标使用同一候选列表，加载失败自动切换下一候选。
- Webview 内点击链接 → 触发 `on_new_window` → 外部浏览器打开 → 应用内拒绝新窗口。

## 错误处理与兜底
- 若所有候选图标加载失败，显示默认占位图标。
- 外部打开失败时记录日志，不影响应用内主流程。

## 测试策略
- **前端单测**：
  - 为 `getServiceIconCandidates` 增加用例，验证 qianwen 的候选顺序与兜底项存在。
- **Rust 单测**：
  - 更新 `should_allow_new_window`（或替换函数）行为测试：非 auth 链接不再允许新窗口。

