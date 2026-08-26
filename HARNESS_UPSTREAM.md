# HARNESS_UPSTREAM — DSH submodule 版本记录

`harness/` 是 DeepSeek Harness 源码的 git submodule（**只读**，零源码侵入）。

| 项 | 值 |
| --- | --- |
| 仓库 | https://github.com/deepseek-ai/deepseek-harness.git |
| 固定 tag | `dsh-v0.1.0-rc.8` |
| 提交 | `141eb6fef83422698aef7a981029e843e8161534` |
| 记录日期 | 2026-02 |

## 平台说明（Windows）

Windows 下 `core.symlinks=false`（git 默认），仓库内的少量文档符号链接
（`CLAUDE.md -> AGENTS.md`、`.claude/skills -> ../.agents/skills` 等）
以常规文件形式检出（文件内容为目标路径）。这是 git 在 Windows 上的标准
行为，任何平台 `git submodule update` 后文件内容与 tag 一致。

## 升级流程

```bash
cd harness
git fetch --tags origin
git checkout dsh-v0.1.1-rc.2        # 升级到新 tag
cd ..
git add harness && git commit -m "chore: bump harness to dsh-v0.1.1-rc.2"
```

然后更新本文件与 `scripts/prepare-harness.mjs` 中的 `PINNED_TAG`，并重跑 `pnpm prepare:harness` 验证。

## 一致性说明

- tag `dsh-v0.1.0-rc.8` 的 `apps/cli` 与 npm 包 `@deepseek-ai/dsh@0.1.1-rc.2` 的入口一致（`apps/cli/lib/bin.js` ⇔ `lib/bin.js`），`web` 子命令与 `--patch` overlay 语义相同；`apps/cli/lib/bin.js` 为构建产物（tsdown），源码目录中不存在，需在 harness 内 `pnpm install && pnpm build` 后生成。
- sidecar 解析顺序：`harness/apps/cli/lib/bin.js`（submodule 构建产物，release 走资源路径）→ `node_modules/@deepseek-ai/dsh/lib/bin.js`（npm 包，开发回退）。
- 本仓库未修改任何处于 `harness/` 下的文件；验证命令：

```bash
git -C harness status --porcelain   # 必须为空
git -C harness diff --stat          # 必须为空
```
