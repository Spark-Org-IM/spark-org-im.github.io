# spark-org-im.github.io

SparkOrg 域名服务 / SparkOrg domain service.

后台数据**只有一个文件** [`domain.txt`](domain.txt)，编辑它即可更新全部数据；
由此生成**多种格式的接口**与**跳转接口**。

The backend data is **a single file** ([`domain.txt`](domain.txt)) — edit it and every endpoint updates.
It generates **multiple API formats** plus a **redirect endpoint**.

## 接口 / API

Base URL: `https://spark-org-im.github.io`

| Endpoint | Format | Description |
| --- | --- | --- |
| `/api/domain.txt` | `text/plain` | 主域名，纯文本，无任何格式 / Raw primary domain, no formatting |
| `/api/domain.json` | `application/json` | JSON 格式 / JSON format |
| `/api/domain.yaml` · `/api/domain.yml` | `text/yaml` | YAML 格式（等价别名）/ YAML format (aliases) |
| `/api/domain.toml` | `application/toml` | TOML 格式 / TOML format |
| `/api/domain.ini` | `text/plain` | INI 格式（多值逗号分隔）/ INI format (comma-separated lists) |
| `/api/domain.xml` | `application/xml` | XML 格式 / XML format |
| `/api/domain.csv` | `text/csv` | CSV 格式，列 `role,domain` / CSV with `role,domain` columns |
| `/api/domain.env` | `text/plain` | dotenv 环境变量格式 / dotenv env format |
| `/domain.txt` | `text/plain` | 完整配置文件（primary + other 全部）/ Full config file (all domains) |
| `/go.html` | redirect | **直接跳转主域名** / **Redirect directly to the primary domain** |

完整文档（含在线演示与代码示例）/ Full docs (live demo + code examples): [docs.html](docs.html)

## 快速使用 / Quick start

```bash
# 主域名，纯文本（无格式）
curl -s https://spark-org-im.github.io/api/domain.txt
# => sparkorg.dpdns.org

# JSON
curl -s https://spark-org-im.github.io/api/domain.json

# YAML / TOML / XML / CSV / ENV
curl -s https://spark-org-im.github.io/api/domain.yaml
curl -s https://spark-org-im.github.io/api/domain.toml

# 跳转到主域名（浏览器打开 / open in a browser）
# https://spark-org-im.github.io/go.html
```

## 跳转接口 / Redirect

- `https://spark-org-im.github.io/go.html` → 主域名 primary
- `https://spark-org-im.github.io/go.html?to=other` → 第一个备用域名 first backup
- `https://spark-org-im.github.io/go.html?to=2` → 第 N 个域名（primary 优先）N-th domain

`go.html` 优先**运行时实时读取** `domain.txt`，因此跳转始终使用最新配置；
若读取失败或 JS 不可用，回退到生成时烘焙的主域名（meta refresh 兜底）。

## 配置 / Configuration

编辑 [`domain.txt`](domain.txt)：

```ini
# primary = 主域名（可写多行）main domains, one per line
primary=sparkorg.dpdns.org

# other = 其他域名（可写多行）backup domains, one per line
# other=sparkorg.cc.cd
```

`#` 开头的行是注释，会被忽略 / Lines starting with `#` are comments.

## 生成接口文件 / Generate the endpoint files

```bash
node scripts/generate-api.mjs
```

零依赖，Node ≥ 16。生成 `api/*` 各格式文件与 `go.html`；内容无变化时不会重写。

## 自动同步 / Auto sync

推送 `domain.txt`（或生成脚本）变更到 `main` 后，GitHub Action
[`.github/workflows/api-sync.yml`](.github/workflows/api-sync.yml) 会自动运行生成器并提交结果，
**无需手动操作**。

After pushing a change to `domain.txt` (or the generator script) on `main`, the GitHub Action
[`.github/workflows/api-sync.yml`](.github/workflows/api-sync.yml) regenerates and commits every
endpoint file automatically — no manual steps needed.

## 页面 / Pages

- [`index.html`](index.html) — 语言选择 / language picker
- [`zh.html`](zh.html) / [`en.html`](en.html) — 域名列表 / domain lists
- [`docs.html`](docs.html) — 接口文档 / API documentation
- [`go.html`](go.html) — 跳转主域名 / redirect to primary domain
