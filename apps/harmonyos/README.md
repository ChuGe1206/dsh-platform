# apps/harmonyos — HarmonyOS NEXT 客户端（Phase 4）

ArkTS (stage 模型) + ArkWeb。流程：

```
EntryAbility → pages/Index.ets (ArkWeb)
           → load entry/src/main/resources/rawfile/index.html（shared-ui 编译产物）
           → HarmonyBridge.ets 注入 window.harmonyBridge.call(method, params)
           → H5 内 native-harmony-bridge / hms-push / file-access / softbus 插件
           → RemoteClient 连接桌面 DSH web 实例（remote 模式）
```

## 构建

```bash
# 1) H5 bundle（输出到 entry/src/main/resources/rawfile）
pnpm --filter @dsh-platform/harmonyos build

# 2) HAP（DevEco Studio Build > Build Hap(s)，或）
node scripts/publish-harmony.mjs --dry-run
node scripts/publish-harmony.mjs          # hvigor + hdc install（需 DevEco 环境）
```

## 桥接协议

- JS → 原生：`window.harmonyBridge.call('hms.getToken' | 'hms.push' | 'file.pick' | ...)`
  返回 `{ ok, data?, error? }`（与 shared-bridge 的 BridgeResponse 同构）
- 原生 → JS：`HarmonyBridge.pushEvent(type, payload)` → `window.harmonyBridge.onEvent`

DSH 侧 overlay：`config/harmony-overlay.yml`（desktop-bridge remote 模式 +
`use_hms_push: true`，回合通知经 `/hms-push` 端点到达本桥）。
