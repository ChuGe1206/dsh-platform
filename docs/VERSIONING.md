# 版本号统一与修改指南（VERSIONING）

> 版本号的**单一来源**是 `config/version.json`,所有其它位置都由
> `pnpm sync:version`(`scripts/sync-version.mjs`)按它自动写入。
> 以后改版本,只需改这一处。

## 1. 单一来源字段

```json
{
  "app": "0.1.2",          // dsh-platform 应用版本(全局唯一)
  "dsh": "0.1.1-rc.2"      // 固定的 DeepSeek Harness CLI 版本
}
```

## 2. `app` 与 `dsh` 各自用在哪

**`app`(应用版本)→ 写入这些位置:**
- 根 `package.json`、`apps/*/package.json`、`packages/*/package.json`、`plugins/*/package.json` 的 `version` 字段
- 各 `apps/*/src-tauri/tauri.conf.json` 的 `version`(发布/安装包版本)
- `Cargo.toml`(`workspace.package.version`)与 `packages/shared-rust/Cargo.toml` 的 `version`
- `apps/desktop/src-tauri/src/version.rs` 的 `APP_VERSION`(Rust 常量)

**`dsh`(DSH CLI 版本)→ 写入这些位置:**
- 根 `package.json` 的 `devDependencies["@deepseek-ai/dsh"]`(dev/构建安装的 CLI 版本)
- `apps/desktop/src-tauri/src/version.rs` 的 `DSH_VERSION`(Rust 常量)
- 由 `DSH_VERSION` 驱动 `install_runtime` 命令:桌面首次启动点「安装 DSH 运行时」时,默认
  `npm install @deepseek-ai/dsh@<dsh>` 到缓存目录(`commands/desktop.rs` 的
  `version.unwrap_or_else(|| crate::version::DSH_VERSION.to_string())`)

> 注意:RELEASING 里的上游 tag 概念不同——`HARNESS_UPSTREAM.md` 里的 `dsh-vX.Y.Z-rc.N`
> 是 **harness 子模块**固定的提交 tag(`harness/` 子模块受约束不可改),与这里的
> `dsh`(npm @deepseek-ai/dsh 版本)是两个独立的东西,本项目不改子模块。

## 3. 修改版本的标准操作步骤

```bash
# ① 只改这一处
#   编辑 config/version.json:改 app(如 0.1.2)或 dsh(如 0.1.1-rc.2)

# ② 同步到所有位置(自动写 package.json/tauri.conf.json/Cargo.toml/version.rs)
pnpm sync:version

# ③ 重新对齐 node_modules(版本变了,package.json 会变化,pnpm 需要重装)
#    注意默认 pnpm store 损坏,需用 CI + 全新 store,否则非 TTY 下会中止
pnpm install        # 若报 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY 用下面两种之一:
#  方案A(临时):$env:CI='true'; $env:npm_config_store_dir='E:\.pnpm-store-v11-fresh'; pnpm install
#  方案B(彻底):删掉损坏的默认 store 后重装
#    Remove-Item -Recurse -Force E:\.pnpm-store\v11 ; pnpm install

# ④ 验证
pnpm typecheck
pnpm build
cargo check -p dsh-platform

# ⑤ 提交
git add -A
git commit -m "chore(version): bump to $(...) "
```

## 4. 校验(可选)

跑 `pnpm sync:version` 后,确认各文件版本一致:
```bash
node -e "const v=require('./config/version.json'); const fs=require('fs');
const check=(p,k)=>{const j=fs.readFileSync(p,'utf8');return j.includes(k)}; 
console.log('app=',v.app,'dsh=',v.dsh)"
```
(或直接读 `version.rs` 的 `APP_VERSION` / `DSH_VERSION` 与 `config/version.json` 比对。)

## 5. 常见问题

- **`pnpm install` 报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`**:默认 store 损坏 +
  package.json 变化触发整树清理。用上面的方案A/方案B。
- **改了 `app` 但 `version.rs` 还是旧值**:没跑 `pnpm sync:version`,先跑它。
- **`harness/` 子模块**保持零修改(本项目约束);`dsh` 版本与子模块 tag 无关,别混。
