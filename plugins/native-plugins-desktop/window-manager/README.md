# native-window-manager

窗口管理（Tauri 桌面壳）。与 Rust 端 `commands/desktop.rs` 的
`window_minimize` / `window_toggle_maximize` / `window_close` / `window_set_title` / `window_get_state`
命令一一对应；浏览器环境降级为 no-op。

```ts
import { minimize, toggleMaximize, closeWindow } from '@dsh-platform/native-window-manager'
```
