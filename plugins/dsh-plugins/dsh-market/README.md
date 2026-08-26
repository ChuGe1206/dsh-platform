# dsh-market

插件发现与安装（Task 3.3）。注册表契约：`{ registry, plugins: [...] }` 或
`[...]`，字段与仓库根 `external-plugins.json` 一致（id / package / source /
platforms / enabled）。

## 工具

- `market_search { query, platform? }` — 搜索注册表
- `market_install { id }` — 记录插件并打印 `dsh plugin --profile <profile> add <package>` 命令

## 本地联调

```bash
node scripts/demo-market-registry.mjs          # 起 127.0.0.1:9530 本地注册表
# 然后将 config/desktop-overlay.yml 中 dsh-market 的 registry_url 改为
# http://127.0.0.1:9530 并重跑 pnpm prepare:harness，重启 DSH 即可联调。
```

## 配置

```yaml
- id: dsh-market
  name: '…/plugins/dsh-plugins/dsh-market/lib/index.js'
  config:
    registry_url: 'https://registry.dsh.example.com'
    profile: web
```
