# 发布操作指南（RELEASING）

## 一键发布（推荐，全部由流水线完成）

```bash
git tag v0.1.1            # 指向当前 main
git push origin v0.1.1    # 推送 tag → GitHub Actions release.yml 自动触发
# 结果：CI（全量门禁）→ build-all → tauri build（NSIS+MSI）→ 上传 → GitHub Release
```

发布成功后：https://github.com/ChuGe1206/dsh-platform/releases/tag/v0.1.1

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
4. 若删除持续失败（网络/权限），可在 Actions 页面用 **workflow_dispatch**
   手动触发 release.yml（手动运行不会附带 tag 的 `gh release create` —
   该步骤仅在 `startsWith(github.ref, 'refs/tags/')` 时执行，并会在手动跑时
   跳过，需要稍后手动补 Release 或等网络恢复后重推 tag）。

## 版本语义

- patch 版本 = 修复/文档/引导链路等增量（如 v0.1.1）
- 每次发布前 `pnpm prepare:harness` 已验证（CI 强制）
- 签名公钥配置后（见 docs/UPGRADING.md）自动带 auto-updater 签名
