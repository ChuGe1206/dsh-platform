# @dsh-platform/mobile-ios (Phase 4)

Tauri Mobile iOS 端。前端与 `mobile-android` 同源（remote 模式），原生差异
（APNs、document picker、share sheet）通过 `native-plugins-mobile/*` 封装。
iOS 工程需 macOS + Xcode：

```bash
cd apps/mobile-ios
pnpm tauri ios init
pnpm tauri ios dev
```
