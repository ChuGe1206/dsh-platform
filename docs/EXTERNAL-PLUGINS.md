# 外部插件集成指南

dsh-platform 的 DSH 扩展注入机制（约束 #2）：`--patch config/*.generated.yml`
（我们的 overlay，可加载本仓库内插件）或 `cordis.patch.yml`（bundle 层）。
外部（社区）插件走 **DSH 官方插件机**：`dsh plugin --profile <name> add <pkg>`。

## 三种集成路径

| 路径 | 命令 | 条件 |
| --- | --- | --- |
| A. registry 发布 | `dsh plugin --profile web add <pkg>` | 插件已发布 npm 且依赖全部可发布解析 |
| B. 本地路径 | `dsh plugin --profile web add file:<abs>` | 插件所有依赖可从 registry / 本地解析（**不含未发布的 workspace 私有包**） |
| C. workspace 链接 | 把插件加入某 pnpm workspace 并 link 进 profile | 插件随宿主项目构建（内部开发模式） |

## 实测记录（2026-08-26，dsh-plugin-desktop@2.0.1）

```
DSH_HOME=.dsh-smoke/external-home dsh plugin --profile web add file:…/dsh-plugin-desktop
→ dsh: pnpm failed in profile directory …/profiles/web
```

根因（并非壳/overlay 问题）：
- 插件依赖 `dsh-community-market`（pin 了未发布的更高版本，registry 最新仅 0.0.1）
- 插件依赖 `@deepseek-ai/dsh-client-web-react`（项目内未发布包，registry 请求失败）

→ 社区插件的**发布条件未满足**（它们在本机依赖 workspace 内源码链接）。
待其发布/修订版本后，路径 B（或 A）即可用；届时 overlay 行
`name: dsh-plugin-desktop`（裸包名，loader 从 profile node_modules 解析）
可直接注入，无需修改本仓库壳。

## 本仓库插件的加载（已验证）

本仓库 `plugins/dsh-plugins/*` 零运行时依赖（仅 Node 内建 + fetch），
overlay 渲染为 file:// URL 直接由 loader 导入 —— smoke 冒烟测试已证明：
`desktop-bridge` 等 5 个插件激活并周期上报 `POST /status` 至 :9527。

## DSH 事件名核实（dsh-v0.1.0-rc.8 源码）

- `turn/start` / `turn/end`：**真实事件**（`packages/core/agent-loop/src/agent.ts`：
  `session.append('turn/start', { turn })` / `session.append('turn/end', { turn, reason })`）
  —— `desktop-bridge` 插件的 `turn/end` 监听与真实事件名一致 ✓
- `agent/turn-stopping`：该版本无此事件（保留监听作为未来版本兼容冗余）
- `session/start` / `session/event`：协议约定名，客户端投影层使用（见 shared-bridge）
