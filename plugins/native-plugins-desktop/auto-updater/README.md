# native-auto-updater

自动更新（Tauri 桌面壳，Phase 3）。Rust 侧将接入 `tauri-plugin-updater`，
前端通过 `update_check / update_download / update_install` 命令驱动，
`update/event` 事件返回进度。

```ts
import { checkForUpdate, onUpdateEvent } from '@dsh-platform/native-auto-updater'

await onUpdateEvent((e) => console.log(e.phase, e.progress))
const info = await checkForUpdate()
if (info.available) await downloadUpdate()
```
