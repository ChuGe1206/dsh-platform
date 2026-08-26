# @dsh-platform/shared-bridge

共享协议层。定义：

- `types.ts` — DSH 公开 seam 的稳定类型投影（`Session` / `Turn` / `Tool` / `LLMService` / `SessionManager` / `Logger` / `DSHContext`）
- `protocol.ts` — 线上协议：`DSHEvent` / `BridgeRequest` / `BridgeResponse` 与原生端点常量
- `client.ts` — `BridgeClient`（HTTP POST 请求/响应、静默失败、原生请求转发监听）

## 用法

```ts
import { BridgeClient, NATIVE_ENDPOINTS } from '@dsh-platform/shared-bridge'

const bridge = new BridgeClient({ platform: 'desktop' })
await bridge.notify({ title: 'DSH', body: '任务完成', sound: true })
await bridge.reportStatus({ activeSessions: 2, timestamp: Date.now() })
```

平台端点统一为 `http://127.0.0.1:9527`（桌面/移动/鸿蒙），方法路由 `/{method}`。
