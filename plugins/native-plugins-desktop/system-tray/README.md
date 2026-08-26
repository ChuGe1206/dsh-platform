# native-system-tray

系统托盘（Tauri 桌面壳）。Rust 侧构建托盘图标与菜单，WebView 通过
`set_tray_status` 同步 DSH 状态（idle/starting/ready/error）。

```ts
import { onTrayAction, setTrayStatus } from '@dsh-platform/native-system-tray'

await onTrayAction((action) => console.log(action))
await setTrayStatus('ready', 'DSH 已就绪')
```
