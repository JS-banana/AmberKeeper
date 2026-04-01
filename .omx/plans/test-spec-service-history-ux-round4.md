# Test Spec — 服务管理 / 历史记录 UX 第四轮收敛

## Automated Coverage Targets
1. **Utility / rail layout**
   - 左侧 utility 菜单渲染为 icon + label。
   - 默认打开设置后菜单宽度/active 结构仍稳定，诊断开关逻辑不回退。
2. **Settings row simplification**
   - 不再出现“当前使用 / 已启用 / 已停用”。
   - 不再出现打开箭头按钮。
   - URL 仍作为副文本出现。
3. **History all/provider mode**
   - 默认进入“全部”模式。
   - “全部”模式显示总览/导出配置，不显示左右两栏记录明细。
   - 切到某个 provider 后显示对应记录列表与详情。
4. **History wording / controls**
   - 导出格式显示中文文案。
   - “导出已取消”不会作为持久反馈区出现。
   - provider 顶部切换按钮点击后有 active 变化并影响内容区。
5. **Scroll / refresh regression**
   - 左侧记录列表容器保留滚动类/overflow 约束。
   - 手动刷新与 capture-driven refresh 不回退。

## Manual / Visual Checks
1. 对照 anyChat 参考图，左 rail 图标尺寸/边距更统一。
2. utility 左侧菜单与内容区无明显割裂缝隙，宽度更窄。
3. 服务管理拖拽把手无突兀背景色、宽度一致。
4. 历史页默认“全部”态不再挤压聊天明细区。
5. provider icon active 态明显，点击反馈清楚。

## Verification Commands
- `pnpm --dir apps/desktop test`
- `pnpm --dir apps/desktop exec tsc --noEmit`
- `pnpm --dir apps/desktop build`
