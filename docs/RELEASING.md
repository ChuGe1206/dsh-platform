# 发布操作指南（RELEASING）

## 一键发布（推荐，全部由流水线完成）

```bash
git tag v0.1.1            # 指向当前 main
git push origin v0.1.1    # 推送 tag → GitHub Actions release.yml 自动触发
# 结果：CI（全量门禁）→ build-all → tauri build（NSIS+MSI）→ 上传 → GitHub Release
```

发布成功后：https://github.com/ChuGe1206/dsh-platform/releases/tag/v0.1.1

> **发布前先 bump 版本**：改 `config/version.json` 的 `app`,然后
> `pnpm sync:version` 统一所有 package.json / tauri.conf.json / Cargo.toml / version.rs。
> 详见 [docs/VERSIONING.md](./VERSIONING.md)。tag 名与应用版本保持一致。

## 已知问题与处置（2026-08 实测记录）

1. **网页（GitHub UI）手动创建的 tag 可能不触发 Actions**（Web UI 创建 ref
   不产生 push 事件）。处置：用**命令行** `git tag` + `git push` 创建/重推。
2. **重推同 SHA 的 tag 不会触发事件**（引用无变化，GitHub 不发送 hook）。
   必须：`git push origin :refs/tags/vX.Y.Z` 删除后再 `git push origin vX.Y.Z`。
3. 本机网络对 GitHub 写操作不稳（`Recv failure`）：删除/推送都带重试，
   并以 **GitHub API 确认为准**（`GET /repos/.../git/refs/tags/<tag>` 404 =
   删除成功；返回对象 = 存在）：
   ```bash
   Invoke-RestMethod -Uri "https://api.github.com/repos/ChuGe1206/dsh-platform/git/refs/tags/v0.1.1"
   ```
4. 若删除持续失败（网络/权限），可改用 **workflow_dispatch 手动触发**：
   Actions 页面 → Release → Run workflow → 填写 `release_tag`（如 v0.1.2）。
   手动触发同样执行 构建 → 打包 → 上传，并用 gh CLI 创建/追加 Release 资产
   （已存在时自动 upload --clobber，不覆盖笔记）。

## 版本语义

- patch 版本 = 修复/文档/引导链路等增量（如 v0.1.1）
- **打 tag 前先同步版本号**：`apps/desktop/package.json`、
  `apps/desktop/src-tauri/tauri.conf.json`（bundle 文件名/内部版本）与
  根 `Cargo.toml [workspace.package].version` —— 否则安装包文件名沿用旧版本
  （实测：v0.1.1 tag 的产物文件名为 `dsh-platform_0.1.0_x64-setup.exe`）。
- 每次发布前 `pnpm prepare:harness` 已验证（CI 强制）
- 签名公钥配置后（见 docs/UPGRADING.md）自动带 auto-updater 签名
