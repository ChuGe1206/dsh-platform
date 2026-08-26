# auto-updater 接入指南（Phase 3.4 收尾说明）

当前 `commands/updater.rs` 提供诚实 stub（`update_check` 返回"无更新"，
`update_download/install` 返回"未配置"），前端 `@dsh-platform/native-auto-updater`
包装器接口已就绪。接入完整更新需要发布基础设置：

## 1. 生成签名密钥（一次性）

```bash
pnpm tauri signer generate -w ~/.tauri/dsh-platform.key
# 终端提示输入私钥密码（发布 CI 环境变量 TAURI_SIGNING_PRIVATE_KEY / _PASSWORD）
# 输出: 公钥（base64）与私钥文件
```

> 私钥与密码**只进发布 CI / 构建机**，绝不提交仓库。

## 2. 配置 tauri.conf.json

```jsonc
{
  "plugins": {
    "updater": {
      "pubkey": "CONTENT_OF_PUBLIC_KEY_PEM",
      "endpoints": [
        "https://updates.dsh-platform.example.com/{{target}}/{{arch}}/{{current_version}}"
      ],
      "windows": { "installMode": "passive" }
    }
  }
}
```

## 3. 注册插件并接通命令

```rust
// src-tauri/Cargo.toml
tauri-plugin-updater = "2"

// src-tauri/src/lib.rs
.plugin(tauri_plugin_updater::Builder::new().build())
```

```rust
// commands/updater.rs —— 替换 stub：
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateInfo, String> {
    match app.updater()?.check().await {
        Ok(Some(update)) => Ok(UpdateInfo { available: true, current_version: Some(app.package_info().version.to_string()), latest_version: Some(update.version.clone()), notes: update.notes, pub_date: update.pubdate }),
        Ok(None) => Ok(/* 无更新 */),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub async fn update_download(app: AppHandle) -> Result<(), String> {
    let update = app.updater()?.check().await.map_err(|e| e.to_string())?;
    if let Some(update) = update { update.download_and_install(|_| {}, || {}).await.map_err(|e| e.to_string())?; }
    Ok(())
}
```

## 4. 发布流程

1. `pnpm build:all`（turbo + release 构建）
2. 用 CI（GitHub Actions）在对应平台 runner 上进 `cargo tauri build`，
   上传产物 + 生成 `latest.json`（tauri 会自动生成）到 endpoints URL
3. 前端 `autoUpdater.checkForUpdate()` → `onUpdateEvent` 显示更新提示

## 说明

- 未配置 pubkey/endpoints 前保持 stub 行为，UI 不会误报更新。
- `update/event` 事件协议（phase/progress）见 `native-auto-updater` README。
