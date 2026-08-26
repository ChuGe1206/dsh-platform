# HARNESS_UPSTREAM — DSH submodule 版本记录

`harness/` 是 DeepSeek Harness 源码的 git submodule（**只读**，零源码侵入）。

| 项 | 值 |
| --- | --- |
| 上游仓库 | https://github.com/deepseek-ai/deepseek-harness.git |
| 上游 tag | `dsh-v0.1.0-rc.8` |
| 上游 tag 提交 | `141eb6fef83422698aef7a981029e843e8161534` |
| 本地镜像 commit | `5435663261c24b89347f5774d2a4df4807154253` |
| 本地镜像 tree | `02ff28571121735dd4d18210122cac0c3f4ba36d` |
| 记录日期 | 2026-02 |

## 镜像说明（仅本机物化差异）

本机对 GitHub 的 `git clone` 传输被重置（`Recv failure: Connection was reset`），而
codeload 的 tag 压缩包可正常下载，因此 `harness/` 由
`https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/refs/tags/dsh-v0.1.0-rc.8`
解包物化：

- ✓ 文件内容与 tag `dsh-v0.1.0-rc.8` 完全一致（同源 tarball）
- △ 版本库为**本地重建的历史**（非上游对象库），上游 SHA 见上表
- △ 上游的 8 个文档 symlink（`CLAUDE.md -> AGENTS.md` 等）在 Windows 无
  symlink 权限（非管理员 / 未开 Developer Mode），已物化为内容相同的常规文件；
  `.claude/skills -> ../.agents/skills` 物化为目录拷贝。不影响任何源码/构建产物。

在具备 GitHub 网络条件的环境，建议恢复标准形态：

```bash
git submodule deinit -f --all
git submodule update --init --recursive        # 会按 .gitmodules 从 GitHub 完整克隆
git -C harness checkout dsh-v0.1.0-rc.8        # 或以 tag 为准
```

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

- tag `dsh-v0.1.0-rc.8` 的 `apps/cli` 与 npm 包 `@deepseek-ai/dsh@0.1.1-rc.2` 的入口一致（`apps/cli/lib/bin.js` ⇔ `lib/bin.js`），`web` 子命令与 `--patch` overlay 语义相同；`apps/cli/lib/bin.js` 为构建产物（tsdown），源码目录中不存在，需 `pnpm install && pnpm build`（在 harness 内）后生成。
- sidecar 解析顺序：`harness/apps/cli/lib/bin.js`（submodule 构建产物，release 走资源路径）→ `node_modules/@deepseek-ai/dsh/lib/bin.js`（npm 包，开发回退）。
- 本仓库未修改任何处于 `harness/` 下的文件；验证命令：

```bash
git -C harness status --porcelain   # 必须为空
git -C harness diff --stat          # 必须为空
```
