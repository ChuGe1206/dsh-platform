# @dsh-platform/mobile-android (Phase 4)

Tauri Mobile Android 端。与 desktop 共享 `shared-ui` / `shared-bridge` /
`shared-dsh`；无 sidecar——通过 `RemoteClient` 连接桌面 DSH Web 实例。

## 启动

```bash
pnpm --filter @dsh-platform/mobile-android dev      # 纯浏览器预览
cd apps/mobile-android
pnpm tauri android init                             # 一次性生成 android/ 工程
pnpm tauri android dev                              # 真机/模拟器
```

原生桥（`src-tauri/src/bridge.rs`）与桌面端同一 wire protocol（:9527），
提供 push / file-picker / share-sheet 端点（Phase 4 落地）。
