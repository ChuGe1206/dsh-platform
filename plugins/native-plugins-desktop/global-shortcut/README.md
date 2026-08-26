# native-global-shortcut

全局快捷键（Tauri 桌面壳）。Rust 端 `commands/shortcut.rs` 基于
`tauri-plugin-global-shortcut`，按下时通过 `shortcut-triggered` 事件回传
`{ id, shortcut, pressedAt }`。

```ts
import { registerShortcut, unregisterShortcut } from '@dsh-platform/native-global-shortcut'

const id = await registerShortcut('Ctrl+Shift+D', (event) => console.log(event))
await unregisterShortcut(id)
```
