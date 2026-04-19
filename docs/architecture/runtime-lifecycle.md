# AmberKeeper Runtime Lifecycle

## 1. 运行时对象

AmberKeeper 当前存在两类 shell runtime：

- built-in provider runtime
- custom service runtime

二者都通过原生 stage 显示，但能力不同：

- built-in runtime：可采集、可诊断
- custom runtime：仅壳层浏览，不参与采集

## 2. 生命周期阶段

### Create

runtime 在需要时创建：

- built-in provider runtime 由 `ProviderRuntimeRegistry` 管理
- custom runtime 由 `ServiceRuntimeRegistry` 管理

### Attach

view 首次显示时被 attach 到主窗口 contentView。

这一层由：

- `main-window.ts`
- `shell-runtime-coordination.ts`

共同协调。

### Activate

当 active service 变化时：

- 若是 built-in service，切到对应 provider runtime
- 若是 custom service，切到对应 custom runtime

### Hide

非激活 runtime 的 view 不销毁，只隐藏或移出活动区域，以保留：

- 登录态
- 页面上下文
- 已加载的 session 内容

### Detach

当 runtime 对应的 service 已失效时：

- view 从 stage detach

### Dispose

当 custom service 删除，或窗口关闭时：

- runtime 显式 dispose
- browser session / webContents 关闭

## 3. Stage 协调

当前 stage 协调规则：

- 任何时刻只显示一个 active service 对应 view
- built-in 与 custom 共用同一 native stage
- `shell-runtime-coordination.ts` 负责：
  - active runtime 选择
  - list resolved runtimes
  - custom runtime 同步
  - stage sync

## 4. 安全边界

### Main renderer

当前仍保留：

- `sandbox: false`

补偿控制：

- `contextIsolation: true`
- `nodeIntegration: false`
- `webSecurity: true`
- `webviewTag: false`

### Remote provider/custom surfaces

当前使用：

- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- `webSecurity: true`
- `webviewTag: false`

### Auth popup

与 remote content surface 一致，保持 sandboxed preload。

## 5. Live probe / diagnostics 生命周期

当前 diagnostics 相关 runtime 已拆成：

- `diagnostics-service.ts`
- `live-probe-service.ts`

live probe 生命周期：

1. create automation + probe server
2. start if diagnostics enabled
3. attach before-quit stop hook
4. stop on window-all-closed / quit

## 6. 修改规则

未来修改 runtime 生命周期时，不应再引入：

- “只创建不释放”
- “只能隐藏不能 detach”
- “业务逻辑直接散落在 main/index.ts”

任何新 runtime 逻辑都应明确回答：

1. 谁创建？
2. 谁激活？
3. 谁隐藏？
4. 谁 detach？
5. 谁 dispose？
